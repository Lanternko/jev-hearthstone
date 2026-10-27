"""Checks of train/ppo.py's --distill-weight (no node, no games): python train/test_mixed.py"""
import copy
import sys
from argparse import Namespace
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from ppo import Net, anchor, imitation, padded, update  # noqa: E402

# imitation: the mean cross entropy over the rows with a target only, padding left out
logp = torch.log_softmax(torch.tensor([[1.0, 2.0, -1e9], [0.5, 0.5, 0.5], [3.0, 0.0, 1.0]]), -1)
t0, t2 = torch.tensor([0.25, 0.75]), torch.tensor([1.0, 0.0, 0.0])
got, k = imitation(logp, [t0, None, t2])
want = (-(t0 * logp[0, :2]).sum() - logp[2, 0]) / 2
assert k == 2 and abs(got.item() - want.item()) < 1e-6, (got, want)
assert imitation(logp, [None, None, None]) == (None, 0)

# anchor: λ constant, or a straight line from λ to the decay target over the run's iterations
a = Namespace(distill_weight=None, distill_decay_to=None, iters=300)
assert anchor(a, 951, 950) is None
a.distill_weight = 0.3
assert anchor(a, 951, 950) == 0.3 and anchor(a, 1250, 950) == 0.3
a.distill_weight, a.distill_decay_to = 1.0, 0.1
assert anchor(a, 951, 950) == 1.0 and abs(anchor(a, 1250, 950) - 0.1) < 1e-12
assert abs(anchor(a, 1100, 950) - (1.0 - 0.9 * 149 / 299)) < 1e-12

# update: with weight None or with no targets it is the PPO update it always was, bit for bit;
# with targets and a weight the scorer moves towards them
torch.manual_seed(0)
net = Net(6, 4, 16)
data = []
for i in range(64):
    k = 2 + i % 3
    data.append((torch.randn(6), torch.randn(k, 4), i % k, -1.0, float(i % 5 - 2), 0.1 * i, None))
args = Namespace(epochs=2, minibatch=16, clip=0.2, vf=0.5, ent=0.01)


def run(weight, rows):
    torch.manual_seed(1)
    n = copy.deepcopy(net)
    opt = torch.optim.Adam(n.parameters(), lr=1e-2)
    out = update(n, opt, rows, args, weight)
    return n, out


plain, out0 = run(None, data)
none, out1 = run(0.5, data)
assert out0[3] == 0.0 and out0 == out1, (out0, out1)
assert all(torch.equal(x, y) for x, y in zip(plain.state_dict().values(), none.state_dict().values()))

taught = [d[:6] + (torch.nn.functional.one_hot(torch.tensor(0), len(d[1])).float(),) for d in data]


def first_step(n):
    with torch.no_grad():
        logits, _ = n(torch.stack([d[0] for d in data]), *padded([d[1] for d in data]))
        return torch.log_softmax(logits, -1)[:, 0].mean().item()


ppo_only, _ = run(None, taught)
mixed, out2 = run(5.0, taught)
assert out2[3] > 0 and first_step(mixed) > first_step(ppo_only) + 0.03, (first_step(mixed), first_step(ppo_only))
print('mixed ok')
