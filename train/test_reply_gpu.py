"""Checks of train/ppo.py's --reply-gpu, the reply network of a look ahead of two turns run here in batches
(needs node, plays a few small games): python train/test_reply_gpu.py"""
import random
import subprocess
import sys
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
from ppo import Net, ahead, look_ahead, tensors  # noqa: E402

DECKS = ['warlock-discard', 'warlock-discard']
REPLY = str(Path(__file__).resolve().parent.parent / 'models' / 'selfplay' / 'warlock-discard-v5.json')
ENVS = 6


def args(gpu):
    return Namespace(depth=2, expand=2, replies=2, reply=REPLY, reply_gpu=gpu)


def tables(arena, net):
    """Some steps into the games, the tables with a choice to make."""
    for _ in range(25):
        obs, acts = tensors(arena.envs)
        arena.step([max(0, len(a) - 2) for a in acts])
    return [i for i, e in enumerate(arena.envs) if len(e['acts']) > 1]


def main():
    ppo.DEVICE = torch.device('cpu')
    ppo.WORKERS, ppo.TIMERS, ppo.EXTRA, ppo.MIX, ppo.MIRROR, ppo.SHAPE, ppo.MARKS = 1, False, False, None, 0.0, None, False
    torch.manual_seed(0)
    random.seed(0)
    assert ahead(args(False)).get('replyRemote') is None
    assert ahead(args(True))['replyRemote'] is True
    for workers in (1, 2):
        ppo.WORKERS = workers
        arena = ppo.make(ENVS, 7, DECKS)
        net = Net(arena.obs, arena.act, 32).eval()
        idx = tables(arena, net)
        assert len(idx) >= 3, idx
        here = look_ahead(net, arena, idx, 2, 4, ahead(args(False)))
        there = look_ahead(net, arena, idx, 2, 4, ahead(args(True)))
        assert [len(s) for s in here] == [len(s) for s in there]
        # The logits here are float32 sums, node's are float64: a near tie may go the other way, never often.
        same = sum(np.allclose(a, b, atol=1e-5) for a, b in zip(here, there))
        assert same >= len(idx) - 1, (workers, same, len(idx))
        arena.close()
    print('ok: --reply-gpu scores as the reply network in node does')


if __name__ == '__main__':
    main()
