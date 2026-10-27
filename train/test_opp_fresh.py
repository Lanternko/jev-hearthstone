"""Checks of train/ppo.py's --opp-fresh (needs node, plays a few small games): python train/test_opp_fresh.py

--resume of a checkpoint that holds opponents goes on from them even when --opp names a file for that deck (zoo v9
was trained against the opponents saved in v8, not ppo/P2); with --opp-fresh the file wins."""
import contextlib
import io
import subprocess
import sys
import tempfile
from pathlib import Path

import torch

if sys.platform == 'win32':  # the node processes of the games must not open console windows
    _popen = subprocess.Popen

    class _Quiet(_popen):
        def __init__(self, *a, **k):
            k['creationflags'] = k.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
            super().__init__(*a, **k)

    subprocess.Popen = _Quiet

sys.path.insert(0, str(Path(__file__).parent))
import ppo  # noqa: E402


def run(argv):
    sys.argv = ['ppo.py'] + argv
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        ppo.main()
    return out.getvalue()


with tempfile.TemporaryDirectory() as tmp:
    first, again = Path(tmp) / 'first', Path(tmp) / 'again'
    base = ['--decks', 'warlock-zoo', 'warlock-discard', '--envs', '8', '--batch', '200', '--eval-games', '8', '--eval-every', '1',
            '--width', '32', '--iters', '1', '--minibatch', '64', '--epochs', '1', '--opp-lr', '1e-3']
    run(base + ['--opp', 'warlock-discard', '--out', str(first)])
    ck = torch.load(first / 'policy.pt', weights_only=True)
    assert set(ck['opp']) == {'warlock-discard'}
    # gate G2: the checkpoint and its export name the simulator they were trained in
    sim = subprocess.run(['node', 'src/sim-version.mjs'], capture_output=True, text=True, check=True,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.strip()
    assert ck['sim'] == sim, (ck.get('sim'), sim)
    sys.path.insert(0, 'train')
    import export
    with contextlib.redirect_stdout(io.StringIO()):
        export.main(str(first / 'policy.pt'), str(Path(tmp) / 'first.json'))
    import json
    assert json.loads((Path(tmp) / 'first.json').read_text())['sim'] == sim
    # a file whose weights differ from the saved opponent's: the learner itself
    other = Path(tmp) / 'other.pt'
    torch.save({k: v for k, v in ck.items() if k != 'opp'}, other)
    resume = ['--resume', str(first / 'policy.pt'), '--opp', f'warlock-discard={other}', '--out', str(again)]
    text = run(base + resume)
    assert f'warlock-discard: the opponent goes on from {first / "policy.pt"}, not from {other}' in text, text
    saved = torch.load(again / 'policy.pt', weights_only=True)['opp']['warlock-discard']
    text = run(base + resume + ['--opp-fresh'])
    assert 'the opponent goes on from' not in text, text
    fresh = torch.load(again / 'policy.pt', weights_only=True)['opp']['warlock-discard']
    assert any(not torch.equal(saved[k], fresh[k]) for k in saved)
print('--opp-fresh ok')
