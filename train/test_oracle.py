"""Checks of train/ppo.py's --oracle: python train/test_oracle.py (the last check starts node)"""
import copy
import sys
from argparse import Namespace
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
import ppo  # noqa: E402
from ppo import Net, padded, plain, update  # noqa: E402

args = Namespace(epochs=3, minibatch=16, clip=0.2, vf=0.5, ent=0.01)
ORC = 5


def rows(hidden):
    torch.manual_seed(2)
    out = []
    for i in range(64):
        k = 2 + i % 3
        row = (torch.randn(6), torch.randn(k, 4), i % k, -1.0, float(i % 5 - 2), 0.1 * i, None, False)
        out.append(row + ((torch.randn(ORC),) if hidden else ()))
    return out


def run(net, data):
    torch.manual_seed(1)
    n = copy.deepcopy(net)
    opt = torch.optim.Adam(n.parameters(), lr=1e-2)
    return n, update(n, opt, data, args)


def shared(a, b):
    """The weights the two networks both have are equal."""
    sa, sb = a.state_dict(), b.state_dict()
    return all(torch.equal(sa[k], sb[k]) for k in sa if k in sb)


torch.manual_seed(0)
base = Net(6, 4, 16)
withhead = Net(6, 4, 16, ORC)
withhead.load_state_dict(base.state_dict(), strict=False)
assert set(withhead.state_dict()) - set(base.state_dict()) == {'oracle_value.0.weight', 'oracle_value.0.bias', 'oracle_value.2.weight', 'oracle_value.2.bias'}
assert set(plain(withhead.state_dict())) == set(base.state_dict())

# the step scorer and the visible value do not read the hidden cards: the forward pass takes none
obs, acts = torch.randn(3, 6), [torch.randn(2, 4), torch.randn(3, 4), torch.randn(1, 4)]
l0, v0 = base(obs, *padded(acts))
l1, v1 = withhead(obs, *padded(acts))
assert torch.equal(l0, l1) and torch.equal(v0, v1)
# the oracle value does read them
h = torch.randn(3, ORC)
assert not torch.equal(withhead.critic(obs, h), withhead.critic(obs, h + 1))

# rows without hidden cards: the update of a network with the head is, on the weights both have, the plain update bit for bit
p0, out0 = run(base, rows(False))
p1, out1 = run(withhead, rows(False))
assert len(out0) == 6 and out0[5] == 0.0 and out0 == out1 and shared(p0, p1), (out0, out1)
assert torch.equal(p1.oracle_value[0].weight, withhead.oracle_value[0].weight)  # no loss reached the head

# rows with them: the head learns (its loss falls over a few updates), and its loss is reported
data = rows(True)
n = copy.deepcopy(withhead)
opt = torch.optim.Adam(n.parameters(), lr=1e-2)
first = update(n, opt, data, args)[5]
for _ in range(20):
    last = update(n, opt, data, args)[5]
assert first > 0 and last < first, (first, last)
assert not torch.equal(n.oracle_value[0].weight, withhead.oracle_value[0].weight)

# the games: with oracle=True each view has orc of the length the reset gave, without it none
ppo.TIMERS = True
on = ppo.Arena(4, 11, ['warlock-zoo', 'warlock-discard'], oracle=True)
off = ppo.Arena(4, 11, ['warlock-zoo', 'warlock-discard'])
assert on.oracle > 0 and off.oracle == 0
for _ in range(20):
    assert all(len(e['orc']) == on.oracle for e in on.envs) and not any('orc' in e for e in off.envs)
    assert all((a['obs'] == b['obs']).all() for a, b in zip(on.envs, off.envs))
    acts = [len(e['acts']) - 1 for e in on.envs]
    on.step(acts)
    off.step(acts)
on.close()
off.close()
print('ok')
