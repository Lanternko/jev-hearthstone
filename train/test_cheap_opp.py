"""Checks of train/ppo.py's --opp, the cheap opponents (needs node, plays a few small games): python train/test_cheap_opp.py"""
import copy
import hashlib
import random
import subprocess
import sys
import tempfile
from argparse import Namespace
from pathlib import Path

import numpy as np
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
from ppo import Net, Opp, opp_choose, opp_learn  # noqa: E402

DECKS = ['warlock-zoo', 'warlock-discard', 'dh-cthun']
ENVS = 8


def world(seatdecks):
    ppo.WORKERS, ppo.TIMERS, ppo.EXTRA, ppo.MIX, ppo.MIRROR, ppo.SHAPE, ppo.MARKS = 1, False, True, None, 0.3, None, False
    ppo.SEATDECKS = seatdecks
    torch.manual_seed(0)
    random.seed(0)
    arena = ppo.make(ENVS, 5, DECKS, swap=True)
    net = Net(arena.obs, arena.act, 32)
    return arena, net, {'live': [([], []) for _ in range(ENVS)], 'rivals': [None] * ENVS}


def args_for(**kw):
    return Namespace(batch=300, gamma=0.995, lam=0.95, shape_scale=0.5, shape_gamma=1.0, rival=0.5, distill_frac=0.1,
                     opp_temp=1.0, opp_eps=0.1, epochs=2, minibatch=64, clip=0.2, vf=0.5, ent=0.01, **kw)


# (a) without --opp the decisions of a small run are those the code gave before --opp existed (digest taken from the code before)
def reference_run():
    arena, net, state = world(False)
    pool = [copy.deepcopy(net)]
    args = args_for()
    h = hashlib.sha256()
    for _ in range(2):
        done, games, turns = ppo.collect(net, arena, pool, state, args)
        h.update(f'{len(done)} {games} {turns}'.encode())
        for o, ac, a, lp, adv, ret, t, *_ in done:
            h.update(np.asarray(o).tobytes() + np.asarray(ac).tobytes() + repr((a, round(lp, 6), round(adv, 5), round(ret, 5), t)).encode())
    arena.close()
    return h.hexdigest(), len(done), games


REFERENCE = ('303679df16e0b63d8a764045cd888f630fd792d7c16f633f0ef462474f347b25', 309, 5)
assert reference_run() == REFERENCE, 'the decisions of a run without --opp changed'


# (b) with --opp the learner's batch holds the learner's seats only and nothing else is searched
def sparring_run(lr=0.0, iters=2):
    arena, net, state = world(True)
    sparring = {d: Opp(d, copy.deepcopy(net), lr) for d in DECKS[1:]}
    state.update(opp=sparring, names=DECKS, ochoice=[None] * ENVS, olive=[[] for _ in range(ENVS)], ask=random.Random(1),
                 orng=random.Random(2), ogen=torch.Generator().manual_seed(3))
    args = args_for(opp_lr=lr)
    args.distill_frac, args.search, args.beam, args.tau, args.depth = 1.0, 2, 8, 0.03, 1
    seen = {'searched': [], 'expect': [0, 0, 0], 'changed': False}
    counts = [[0, 0, 0] for _ in range(ENVS)]
    step = arena.step

    def counting_step(actions):
        for i, e in enumerate(arena.envs):
            rival = state['rivals'][i]
            if rival:
                assert e['decks'][0] == e['decks'][1], 'a frozen rival in a game between different decks'
            counts[i][2 if rival and rival[0] == e['seat'] else 1 if e['decks'][e['seat']] else 0] += 1
        envs = step(actions)
        for i, e in enumerate(envs):
            if 'ended' in e:
                seen['expect'] = [x + y for x, y in zip(seen['expect'], counts[i])]
                counts[i] = [0, 0, 0]
        return envs

    arena.step = counting_step

    def spy(net_, arena_, idx, obs, acts, args_):
        seen['searched'] += [arena_.envs[i]['decks'][arena_.envs[i]['seat']] for i in idx]
        return {}

    real, ppo.taught = ppo.taught, spy
    pool = [copy.deepcopy(net)]
    learner = opp_rows = 0
    try:
        for _ in range(iters):
            done, games, turns = ppo.collect(net, arena, pool, state, args)
            learner += len(done)
            opp_rows += sum(len(o.data) for o in sparring.values())
            before = {d: copy.deepcopy(o.net.state_dict()) for d, o in sparring.items()}
            opp_learn(sparring, args)
            seen['changed'] |= any(not torch.equal(before[d][k], v) for d, o in sparring.items() for k, v in o.net.state_dict().items())
    finally:
        ppo.taught = real
        arena.close()
    return seen, learner, opp_rows


seen, learner, opp_rows = sparring_run()
assert seen['expect'][1] > 0 and seen['expect'][0] > 0, seen['expect']
assert learner == seen['expect'][0], (learner, seen['expect'])  # the learner's batch is its own seats' decisions, nothing of the opponents'
assert opp_rows == seen['expect'][1], (opp_rows, seen['expect'])
assert seen['searched'] and set(seen['searched']) == {0}, seen['searched']  # only first-deck seats are looked ahead at


# (c) with --opp-eps 1 an opponent with more than one legal step takes the second best step; the stored probability is the mixture's
torch.manual_seed(4)
net = Net(6, 4, 16)
acts = [torch.randn(k, 4) for k in (1, 2, 3, 5, 7, 2, 4)] * 5
obs = [torch.randn(6) for _ in acts]
st = {'orng': random.Random(0), 'ogen': torch.Generator().manual_seed(0)}
with torch.no_grad():
    logits, _ = net(torch.stack(obs), *ppo.padded(acts))
second = [int(logits[j, :len(x)].argsort(descending=True)[1]) if len(x) > 1 else 0 for j, x in enumerate(acts)]
a, bp, _ = opp_choose(net, obs, acts, Namespace(opp_temp=1.0, opp_eps=1.0), st)
assert a == second and bp == [1.0] * len(acts), (a, second)
a, bp, _ = opp_choose(net, obs, acts, Namespace(opp_temp=2.0, opp_eps=0.25), st)
for j, x in enumerate(acts):
    if len(x) > 1:
        want = 0.75 * torch.softmax(logits[j, :len(x)] / 2.0, -1)[a[j]].item() + 0.25 * (a[j] == second[j])
        assert abs(bp[j] - want) < 1e-5 and 0 < bp[j] < 1, (j, bp[j], want)
    else:
        assert a[j] == 0 and bp[j] == 1.0
a, bp, _ = opp_choose(net, obs, acts, Namespace(opp_temp=1.0, opp_eps=0.0), st)
assert all(abs(bp[j] - torch.softmax(logits[j, :len(x)], -1)[a[j]].item()) < 1e-5 for j, x in enumerate(acts))


# (d) the opponents' weights change with --opp-lr and stay with 0
seen, _, rows = sparring_run(lr=1e-3, iters=1)
assert rows > 0 and seen['changed']
assert not sparring_run(lr=0.0, iters=1)[0]['changed']


# (e) the whole run: columns of the log, the opponents in the checkpoint, their numbered copies, going on from them
with tempfile.TemporaryDirectory() as tmp:
    base = ['--decks', 'warlock-zoo', 'warlock-discard', '--envs', '8', '--batch', '200', '--eval-games', '8', '--eval-every', '1',
            '--width', '32', '--keep-every', '1', '--opp', 'warlock-discard', '--opp-lr', '1e-3', '--opp-refresh', '1', '--opp-pool', '2',
            '--out', tmp, '--minibatch', '64', '--epochs', '1']
    for extra in ([], ['--resume', str(Path(tmp) / 'policy.pt')]):
        sys.argv = ['ppo.py'] + base + ['--iters', '2'] + extra
        ppo.main()
    lines = (Path(tmp) / 'log.csv').read_text().splitlines()
    assert lines[0].endswith('opp_decisions,opp_policy_loss,opp_value_loss,learner_searched') and len(lines) == 5, lines
    assert all(len(x.split(',')) == len(lines[0].split(',')) for x in lines)
    ck = torch.load(Path(tmp) / 'policy.pt', weights_only=True)
    assert set(ck['opp']) == {'warlock-discard'} and ck['iters'] == 4
    own = torch.load(Path(tmp) / 'ckpt' / 'opp-warlock-discard-iter-0003.pt', weights_only=True)
    assert own['deck'] == 'warlock-discard' and 'opp' not in own and own['net'].keys() == ck['net'].keys()
print('cheap opponents ok')
