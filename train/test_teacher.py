"""Checks of train/ppo.py's --teacher (no node, no games): python train/test_teacher.py"""
import json
import sys
import tempfile
from argparse import Namespace
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from ppo import Net, Teacher, update  # noqa: E402

OBS, ACT = 6, 4
torch.manual_seed(0)


def row(game, legal, pick, v5pick, sig):
    return {'kind': 'mirror', 'game': game, 'n': 1, 'obs': torch.randn(OBS).tolist(), 'acts': torch.randn(len(legal), ACT).tolist(),
            'legal': legal, 'pick': pick, 'v5pick': v5pick, 'sig': sig}


rows = [row(g, ['a', 'b', 'b', 'c'], 1, 0, g % 2 == 1) for g in range(1, 21)]
path = Path(tempfile.mkdtemp()) / 'teacher.jsonl'
path.write_text(''.join(json.dumps(r) + '\n' for r in rows), encoding='utf8')

# split by game: game % holdout == 0 held out
t = Teacher(path, OBS, ACT, holdout=5, batch=8, seed=1)
assert sorted(rows[i]['game'] for i in t.test) == [5, 10, 15, 20] and len(t.train) == 16
assert len(Teacher(path, OBS, ACT, holdout=0).test) == 0

# steps of one name are one choice: the loss is -log of their summed probability
net = Net(OBS, ACT, 16)
idx = [0, 1]
logp = torch.log_softmax(t.logits(net, idx), -1)
want = -torch.log(logp[:, 1].exp() + logp[:, 2].exp()).mean()
assert abs(t.loss(net, idx).item() - want.item()) < 1e-5

# the greedy name sums steps of one name: 'a' alone is likeliest (0.4), the two 'b' together are more (0.6)
fixed = Teacher(path, OBS, ACT, holdout=0)
fixed.logits = lambda net, idx: torch.log(torch.tensor([[0.4, 0.3, 0.3, 0.0001]] * len(idx)))
assert fixed.takes(None, [0, 1], 'pick') == 1.0 and fixed.takes(None, [0], 'start') == 0.0

# a row of other sizes is refused
bad = path.with_name('bad.jsonl')
bad.write_text(json.dumps(row(1, ['a', 'b'], 0, 0, False) | {'obs': [0.0] * (OBS + 1)}) + '\n', encoding='utf8')
try:
    Teacher(bad, OBS, ACT)
    raise AssertionError('a row of another size was taken')
except SystemExit:
    pass


# update: without teacher it returns the six items as before; with it a seventh, and the trained rows move to the pick
def data(n=64):
    out = []
    for _ in range(n):
        k = 3
        out.append((torch.randn(OBS), torch.randn(k, ACT), 0, -1.1, 0.0, 0.0, None, False))
    return out


args = Namespace(epochs=2, minibatch=16, clip=0.2, vf=0.5, ent=0.01, teacher_weight=1.0)
d = data()
torch.manual_seed(1)
n0 = Net(OBS, ACT, 16)
opt = torch.optim.Adam(n0.parameters(), lr=1e-2)
assert len(update(n0, opt, d, args)) == 6
before = t.takes(n0, t.train, 'pick')
for _ in range(30):
    out = update(n0, opt, d, args, teacher=t)
assert len(out) == 7 and out[6] > 0
after = t.takes(n0, t.train, 'pick')
assert after == 1.0 and after >= before, (before, after)
print('test_teacher: ok')
