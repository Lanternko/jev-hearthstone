"""Checks of train/ppo.py --arch transformer (TokenNet over the token rows of src/selfplay-encode.mjs; needs node,
plays a few small games and two one-iteration runs): python train/test_transformer.py"""
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
from ppo import Net, TokenNet, padded, tensors, TOKEN_COUNT, TOKEN_FEATS  # noqa: E402

DECKS = ['warlock-zoo', 'warlock-discard']
ROWS = TOKEN_COUNT * TOKEN_FEATS


def states(tokens, n=8, steps=30):
    """The views of n tables some steps into their games, with or without the token rows."""
    ppo.TOKENS = tokens
    arena = ppo.Arena(n, 11, DECKS)
    for _ in range(steps):
        obs, acts = tensors(arena.envs)
        arena.step([max(0, len(a) - 2) for a in acts])
    obs, acts = tensors(arena.envs)
    dims = arena.obs, arena.act, len(arena.names)
    arena.close()
    return torch.stack(obs), acts, dims


def check_state():
    plain, acts0, (o0, a0, _) = states(False)
    obs, acts, (o1, a1, names) = states(True)
    assert o1 == o0 + ROWS and a1 == a0, (o0, o1, a0, a1)
    assert torch.equal(obs[:, :o0], plain), 'the state without token rows is not a prefix of the state with them'
    assert all(torch.equal(a, b) for a, b in zip(acts, acts0))
    rows = obs[:, o0:].reshape(len(obs), TOKEN_COUNT, TOKEN_FEATS)
    assert (rows[..., 0] == 1).any(1).all(), 'a table with no token at all'
    return obs, acts, (o1, a1, names), o0


def check_net(obs, acts, dims, base):
    o, a, names = dims
    torch.manual_seed(0)
    net = TokenNet(o, a, names, 32, 2, 4).eval()
    with torch.no_grad():
        logits, value = net(obs, *padded(acts))
        assert logits.shape == (len(obs), max(len(x) for x in acts)) and value.shape == (len(obs),)
        # The empty places are masked: whatever their cells hold, the scores stay.
        junk = obs.clone()
        rows = junk[:, base:].view(len(obs), TOKEN_COUNT, TOKEN_FEATS)
        empty = rows[..., 0] == 0
        rows[..., 1:][empty] = torch.rand(int(empty.sum()), TOKEN_FEATS - 1) * 3
        rows[..., ppo.TOKEN_SLOT][empty] = 1.0
        l2, v2 = net(junk, *padded(acts))
        assert torch.allclose(logits, l2, atol=1e-5) and torch.allclose(value, v2, atol=1e-5), 'an empty place changed the scores'
        # A step's score does not hang on the padding of the other tables.
        more = [torch.cat([x, torch.zeros(3, x.shape[1])]) for x in acts]
        m, mask = padded(more)
        mask[:] = False
        for i, x in enumerate(acts):
            mask[i, :len(x)] = True
        l3, _ = net(obs, m, mask)
        assert torch.allclose(logits.masked_fill(logits < -1e8, 0), l3[:, :logits.shape[1]].masked_fill(l3[:, :logits.shape[1]] < -1e8, 0), atol=1e-5)
        # The MLP reads a state with token rows as the state without them.
        mlp = Net(base, a, 16).eval()
        assert torch.equal(mlp(obs, *padded(acts))[0], mlp(obs[:, :base], *padded(acts))[0])


def run(argv):
    sys.argv = ['ppo.py'] + argv
    ppo.main()


def check_runs():
    with tempfile.TemporaryDirectory() as d:
        small = ['--decks', *DECKS, '--iters', '1', '--envs', '8', '--batch', '256', '--minibatch', '128', '--eval-games', '8',
                 '--eval-every', '1', '--keep-every', '1', '--device', 'cpu']
        run(small + ['--arch', 'transformer', '--width', '32', '--layers', '1', '--out', f'{d}/t'])
        run(small + ['--width', '16', '--out', f'{d}/m'])
        net, ck = ppo.load(f'{d}/t/policy.pt')
        assert isinstance(net, TokenNet) and ck['arch'] == 'transformer' and ck['tokens'] and ppo.TOKENS
        assert ck['obs'] == ppo.load(f'{d}/m/policy.pt')[1]['obs'] + ROWS
        run(['--decks', *DECKS, '--eval', f'{d}/t/policy.pt', '--vs', f'{d}/m/policy.pt', '--eval-games', '8', '--device', 'cpu'])
        run(['--decks', *DECKS, '--eval', f'{d}/t/policy.pt', '--eval-games', '8', '--eval-seed', '123', '--device', 'cpu'])
        for bad in (['--resume', f'{d}/t/policy.pt'], ['--oracle']):
            try:
                run(small + ['--arch', 'transformer', '--out', f'{d}/x'] + bad)
            except SystemExit as e:
                assert 'transformer' in str(e), e
            else:
                raise AssertionError(f'--arch transformer took {bad}')
        try:
            import export
            export.main(f'{d}/t/policy.pt', f'{d}/t.json')
        except SystemExit as e:
            assert 'MLP' in str(e), e
        else:
            raise AssertionError('train/export.py wrote a transformer for src/selfplay-net.mjs')


def main():
    ppo.DEVICE = torch.device('cpu')
    ppo.WORKERS, ppo.TIMERS, ppo.EXTRA, ppo.MIX, ppo.MIRROR, ppo.SHAPE, ppo.MARKS = 1, False, False, None, 0.0, None, False
    obs, acts, dims, base = check_state()
    check_net(obs, acts, dims, base)
    check_runs()
    print('ok')


if __name__ == '__main__':
    main()
