"""Checks of train/ppo.py's --kl-weight (no node, no games): python train/test_restart.py"""
import copy
import sys
from argparse import Namespace
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from ppo import Net, kl_to_ref, padded, update  # noqa: E402

# kl_to_ref: 0 where the two are the same, positive where they differ, the padding adds nothing
logits = torch.tensor([[1.0, 2.0, -1e9], [0.5, 0.5, 0.5], [3.0, 0.0, 1.0]])
every = torch.tensor([True, True, True])
assert kl_to_ref(logits, logits, every).item() == 0.0
other = torch.tensor([[2.0, 1.0, -1e9], [0.5, 0.5, 0.5], [0.0, 3.0, 1.0]])
got = kl_to_ref(logits, other, every)
p, q = torch.softmax(logits[:2, :2], -1), torch.softmax(other[:2, :2], -1)
want = ((p * (p / q).log()).sum(-1).sum() + (torch.softmax(logits[2], -1) * (torch.log_softmax(logits[2], -1) - torch.log_softmax(other[2], -1))).sum()) / 3
assert got.item() > 0 and abs(got.item() - want.item()) < 1e-5, (got, want)

# decisions that are not kept (late, or one step only) contribute nothing, not even to the mean
only_same = torch.tensor([False, True, False])
assert kl_to_ref(logits, other, only_same).item() == 0.0
first = torch.tensor([True, False, False])
assert abs(kl_to_ref(logits, other, first).item() - kl_to_ref(logits[:1], other[:1], torch.tensor([True])).item()) < 1e-7
assert kl_to_ref(logits, other, torch.tensor([False] * 3)).item() == 0.0

# update: the net it starts as is at KL 0 on the first minibatch; late decisions leave the update as it was, bit for bit;
# the others pull the network back towards the reference
torch.manual_seed(0)
net = Net(6, 4, 16)
ref = copy.deepcopy(net).eval()
for q in ref.parameters():
    q.requires_grad_(False)
args = Namespace(epochs=3, minibatch=16, clip=0.2, vf=0.5, ent=0.01)


def rows(late):
    out = []
    for i in range(64):
        k = 2 + i % 3
        out.append((torch.randn(6), torch.randn(k, 4), i % k, -1.0, float(i % 5 - 2), 0.1 * i, None, late(i)))
    return out


def run(data, ref_net, beta, lr=1e-2):
    torch.manual_seed(1)
    n = copy.deepcopy(net)
    opt = torch.optim.Adam(n.parameters(), lr=lr)
    return n, update(n, opt, data, args, None, ref_net, beta)


def same(a, b):
    return all(torch.equal(x, y) for x, y in zip(a.state_dict().values(), b.state_dict().values()))


all_late = rows(lambda i: True)
plain, out0 = run(all_late, None, 0.0)
masked, out1 = run(all_late, ref, 5.0)
assert out1[4] == 0.0 and out0[:4] == out1[:4] and same(plain, masked)

normal = rows(lambda i: i % 4 == 0)
free, _ = run(normal, None, 0.0)
held, out2 = run(normal, ref, 5.0)
assert len(out2) == 6 and out2[4] > 0.0
state = torch.stack([d[0] for d in normal])
acts = [d[1] for d in normal]
keep = torch.tensor([len(d[1]) > 1 and not d[7] for d in normal])


def drift(n):
    with torch.no_grad():
        return kl_to_ref(n(state, *padded(acts))[0], ref(state, *padded(acts))[0], keep).item()


assert drift(held) < drift(free), (drift(held), drift(free))
# at the reference itself, with a learning rate of zero, the KL is 0 and the gradient of the term is too
_, out3 = run(normal, ref, 5.0, lr=0.0)
assert out3[4] == 0.0
print('ok')
