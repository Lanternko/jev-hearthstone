"""Checks of train/ppo.py's --value-bce and --value-target (needs node, plays a few small games): python train/test_value_bce.py

With --value-bce the value is tanh of the head and the head learns the cross entropy of the win probability (t + 1) / 2;
the checkpoint says so (value_squash), load() and the export read it back. --value-target z makes every decision's target
the result of its seat. A tanh network goes on only with --value-bce, and --value-target needs --value-bce."""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import torch
import torch.nn.functional as F

if sys.platform == 'win32':  # the node processes of the games must not open console windows
    _popen = subprocess.Popen

    class _Quiet(_popen):
        def __init__(self, *a, **k):
            k['creationflags'] = k.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
            super().__init__(*a, **k)

    subprocess.Popen = _Quiet

sys.path.insert(0, str(Path(__file__).parent))
import export  # noqa: E402
import ppo  # noqa: E402


def run(argv):
    sys.argv = ['ppo.py'] + argv
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        ppo.main()
    return out.getvalue()


def refused(argv):
    try:
        run(argv)
    except SystemExit as e:
        return bool(e.code) and not isinstance(e.code, int)
    return False


# the head: tanh, and the cross entropy pulls the raw output towards the target's side
net = ppo.Net(10, 4, 8)
e = torch.randn(5, 8)
raw = net.judge(e)
net.squash = True
assert torch.allclose(net.judge(e), torch.tanh(raw)) and torch.equal(net.judge(e, raw=True), raw)
x = torch.zeros(3, requires_grad=True)
F.binary_cross_entropy_with_logits(2 * x, (torch.tensor([1.0, -1.0, 0.0]) + 1) / 2).backward()
assert x.grad[0] < 0 < x.grad[1] and abs(x.grad[2]) < 1e-7, x.grad
for t in (0.6, -0.3):  # the loss is least where tanh(x) = t
    best = min(torch.linspace(-3, 3, 6001), key=lambda v: F.binary_cross_entropy_with_logits(2 * v, torch.tensor((t + 1) / 2)).item())
    assert abs(torch.tanh(best) - t) < 2e-3, (t, best)

targets = []
_update = ppo.update


def spy(net, opt, data, args, *a, **k):
    targets.append(([d[5] for d in data], args.value_target, net.squash))
    return _update(net, opt, data, args, *a, **k)


ppo.update = spy
with tempfile.TemporaryDirectory() as tmp:
    small = ['--device', 'cpu', '--envs', '8', '--batch', '200', '--eval-games', '4', '--eval-every', '100', '--width', '32', '--minibatch', '64', '--epochs', '2',
             '--decks', 'warlock-zoo', 'warlock-discard']
    plain, bce, z = (Path(tmp) / n for n in ('plain', 'bce', 'z'))
    run(small + ['--iters', '1', '--out', str(plain)])
    assert 'value_squash' not in torch.load(plain / 'policy.pt', weights_only=True)
    run(small + ['--iters', '1', '--value-bce', '--resume', str(plain / 'policy.pt'), '--out', str(bce)])
    run(small + ['--iters', '1', '--value-bce', '--value-target', 'z', '--resume', str(bce / 'policy.pt'), '--out', str(z)])
    (plain_t, *_), (ret_t, tr, sq), (z_t, tz, sz) = targets
    assert (tr, sq, tz, sz) == ('ret', True, 'z', True)
    assert set(z_t) <= {-1.0, 0.0, 1.0} and {-1.0, 1.0} <= set(z_t), 'z targets are results'
    assert len(set(ret_t) - {-1.0, 0.0, 1.0}) > 10, 'ret targets are lambda returns'
    for d in (bce, z):
        ck = torch.load(d / 'policy.pt', weights_only=True)
        assert ck['value_squash'] == 'tanh'
        loaded, _ = ppo.load(d / 'policy.pt')
        assert loaded.squash
    export.main(str(z / 'policy.pt'), str(Path(tmp) / 'z.json'))
    assert json.loads((Path(tmp) / 'z.json').read_text())['valueSquash'] == 'tanh'
    export.main(str(plain / 'policy.pt'), str(Path(tmp) / 'plain.json'))
    assert 'valueSquash' not in json.loads((Path(tmp) / 'plain.json').read_text())
    # a tanh network does not go on as a plain one; --value-target needs --value-bce; no --oracle or --distill with it
    assert refused(small + ['--iters', '1', '--resume', str(bce / 'policy.pt'), '--out', str(Path(tmp) / 'x')])
    assert refused(small + ['--iters', '1', '--value-target', 'z', '--out', str(Path(tmp) / 'y')])
    assert refused(small + ['--iters', '1', '--value-bce', '--oracle', '--out', str(Path(tmp) / 'w')])
print('value-bce: ok')
