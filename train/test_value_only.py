"""Checks of train/ppo.py's --value-only (needs node, plays a few small games): python train/test_value_only.py

A run with --value-only goes on from a checkpoint and trains its value head alone: after it the trunk (body) and the policy
(step, score) are bit-identical to the checkpoint's and the value head has moved. Whatever the decks, the cards and cells of
the state are those of the checkpoint, so the file it writes reads the same states as the one it began from."""
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
    small = ['--envs', '8', '--batch', '200', '--eval-games', '4', '--eval-every', '100', '--width', '32', '--minibatch', '64', '--epochs', '2']
    run(small + ['--decks', 'warlock-zoo', 'warlock-discard', '--iters', '1', '--out', str(first)])
    before = torch.load(first / 'policy.pt', weights_only=True)
    # other decks (the priest's list has cards the first vocabulary lacks, and it turns the egg cells on by itself)
    text = run(small + ['--decks', 'warlock-discard', 'priest-egg-hsr', '--egg', '--iters', '2', '--lr', '1e-2', '--value-only',
                        '--resume', str(first / 'policy.pt'), '--out', str(again)])
    after = torch.load(again / 'policy.pt', weights_only=True)
    assert after['iters'] == before['iters'] + 2
    for k in ('names', 'obs', 'act', 'timers', 'extra', 'decks'):
        assert after.get(k) == before.get(k), k
    for k in ('stages', 'imbue', 'pile', 'egg'):
        assert after.get(k, False) == before.get(k, False), k
    moved = []
    for k, v in before['net'].items():
        same = torch.equal(v, after['net'][k])
        if k.startswith('value.'):
            moved.append(not same)
        else:
            assert same, f'{k} changed'
    assert any(moved), 'the value head did not move'
    # the options that would move the policy are refused
    for bad in (['--opp-lr', '1e-3'], ['--oracle']):
        try:
            run(small + ['--decks', 'warlock-zoo', 'warlock-discard', '--value-only', '--resume', str(first / 'policy.pt'), '--out', str(Path(tmp) / 'bad')] + bad)
        except SystemExit:
            continue
        raise AssertionError(f'{bad} was taken')
    try:
        run(small + ['--decks', 'warlock-zoo', 'warlock-discard', '--value-only', '--out', str(Path(tmp) / 'bad')])
    except SystemExit:
        pass
    else:
        raise AssertionError('--value-only without --resume was taken')
print('ok')
