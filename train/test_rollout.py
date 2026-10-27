"""Checks of train/ppo.py's --rollout targets (no node, no games): python train/test_rollout.py"""
import sys
from argparse import Namespace
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from ppo import Pending, rollout_steps, rollout_target  # noqa: E402

# rollout_target: the steps not branched keep their probability, the branched ones share their mass,
# the better win share gets more, and equal wins leave the prior as it was
prior = torch.tensor([0.4, 0.3, 0.2, 0.1])
t = rollout_target(prior, [0, 1, 2], [0.25, 0.75, 0.5], 0.25)
assert abs(t.sum().item() - 1) < 1e-6
assert t[3].item() == prior[3].item()
assert abs(t[:3].sum().item() - 0.9) < 1e-6
assert t[1] > t[2] > t[0], t
assert torch.allclose(rollout_target(prior, [0, 1], [0.5, 0.5], 0.25), prior)
# Kazakus 0.61 against Mawman 0.17 (the 2026-10-25 position) moves a 50/50 prior to nearly all Kazakus
k = rollout_target(torch.tensor([0.5, 0.5]), [0, 1], [0.61, 0.17], 0.25)
assert k[0] > 0.95, k

# rollout_steps: greedy without --rollout-temp-decay; with it, random near the branch and greedy far from it
logits = torch.tensor([[0.0, 0.1, -1e9]] * 400)
args = Namespace(rollout_temp_decay=None, rollout_temp=1.0)
assert rollout_steps(logits, [0] * 400, args, torch.Generator().manual_seed(0)) == [1] * 400
args.rollout_temp_decay = 0.5
near = rollout_steps(logits, [0] * 400, args, torch.Generator().manual_seed(0))
far = rollout_steps(logits, [10] * 400, args, torch.Generator().manual_seed(0))
assert 100 < near.count(0) < 300 and 2 not in near, near.count(0)
assert far == [1] * 400
assert near == rollout_steps(logits, [0] * 400, args, torch.Generator().manual_seed(0))  # the run's own generator decides

# a Pending is resolved into its target before the update sees it
h = Pending(prior, [0, 1])
assert h.t is None
h.t = rollout_target(prior, h.steps, [1.0, 0.0], 0.25)
row = (torch.zeros(3), torch.zeros(4, 2), 0, -1.0, 0.0, 0.0, h)
resolved = row[:6] + (row[6].t if isinstance(row[6], Pending) else row[6],)
assert torch.equal(resolved[6], h.t) and resolved[6][0] > prior[0]
print('rollout ok')
