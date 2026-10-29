"""A network of an older vocabulary, expanded by card name to a larger one, must see old-card boards as it did.

    python train/test_expand.py [network=models/selfplay/warlock-zoo-v4.pt] [steps=300]

The same games are played twice from one seed, as the old decks alone and as the first two of
warlock-zoo, warlock-discard, dh-cthun (the rival always the second), both with the old network
choosing; the logits and values of the old network on the old encoding and of the expanded one on the
new encoding must agree to 1e-5. test/selfplay-expand.test.mjs runs this.
"""
import sys

import numpy as np
import torch

import ppo

path = sys.argv[1] if len(sys.argv) > 1 else str(ppo.ROOT / 'models' / 'selfplay' / 'warlock-zoo-v4.pt')
steps = int(sys.argv[2]) if len(sys.argv) > 2 else 300

old_net, ck = ppo.load(path)
old = {'names': ck['names'], 'obs': ck['obs'], 'act': ck['act'], 'timers': bool(ck.get('timers')), 'extra': bool(ck.get('extra')), 'stages': bool(ck.get('stages')),
       'imbue': bool(ck.get('imbue')), 'pile': bool(ck.get('pile'))}

a = ppo.Arena(8, 123, ck['decks'])
ppo.EXTRA, ppo.MIX = True, [1, 0]
b = ppo.Arena(8, 123, ck['decks'] + ['dh-cthun'])
new = {'names': b.names, 'obs': b.obs, 'act': b.act, 'timers': ppo.TIMERS, 'extra': True, 'stages': ppo.STAGES, 'imbue': ppo.IMBUE, 'pile': ppo.PILE}
assert len(new['names']) > len(old['names']) and new['obs'] > old['obs'], 'the new vocabulary is not larger'

new_net = ppo.Net(b.obs, b.act, ck['width']).eval()
new_net.load_state_dict(ppo.resume_state(ck['net'], old, new))

so, sa = ppo.state_sources(old, new), ppo.step_sources(old, new)
fresh_o = [j for j, x in enumerate(so) if x is None]
fresh_a = [j for j, x in enumerate(sa) if x is None]
worst, seen, skipped = 0.0, 0, 0
for _ in range(steps):
    ta, tb = ppo.tensors(a.envs), ppo.tensors(b.envs)
    with torch.no_grad():
        # One table at a time: the two arenas deal the same games, so each table has the same steps in both.
        for i, (oa, xa, ob, xb) in enumerate(zip(ta[0], ta[1], tb[0], tb[1])):
            assert len(xa) == len(xb), f'table {i}: {len(xa)} steps with the old decks, {len(xb)} with the new vocabulary'
            if ob[fresh_o].any() or xb[:, fresh_a].any():
                # A card of the new vocabulary that the old one counted as "other" (a token that only the
                # new decks name): the board is not one the old network could see as it is.
                skipped += 1
                continue
            la, va = old_net(oa[None], xa[None], torch.ones(1, len(xa), dtype=torch.bool))
            lb, vb = new_net(ob[None], xb[None], torch.ones(1, len(xb), dtype=torch.bool))
            worst = max(worst, (la - lb).abs().max().item(), (va - vb).abs().max().item())
            seen += 1
    # The old network's greedy step is played in both, so the two stay on the same game.
    with torch.no_grad():
        picks = [int(old_net(o[None], x[None], torch.ones(1, len(x), dtype=torch.bool))[0].argmax()) for o, x in zip(*ta)]
    a.step(picks)
    b.step(picks)

a.close()
b.close()
print(f'{seen} states, largest difference {worst:.2e} ({skipped} more skipped for cards that only the new vocabulary names)')


class Flags:  # the pilot's arguments, for vocab_flags alone
    timers = extra = stages = imbue = pile = egg = True
    decks = ['priest-egg', 'warlock-zoo']
    mix, mirror = None, 0.1


ppo.vocab_flags(Flags)  # must land on the module: Arena, load and the checkpoint read the globals, not main's locals
assert ppo.TIMERS and ppo.EXTRA and ppo.STAGES and ppo.IMBUE and ppo.PILE and ppo.EGG, 'vocab_flags left a cell of the state off the module'
print('vocab_flags sets the module globals: --timers --extra --stages --imbue --pile --egg')

class HsrFlags(Flags):  # L-052: a variant list must not lose the egg cells by its name alone
    timers = extra = stages = imbue = pile = egg = False
    decks = ['priest-egg-hsr', 'warlock-zoo']


ppo.vocab_flags(HsrFlags)
assert ppo.STAGES and ppo.IMBUE and ppo.PILE and ppo.EGG, 'priest-egg-hsr did not turn the egg cells on'
ppo.vocab_flags(Flags)
print('vocab_flags turns the egg cells on for priest-egg-hsr too')

# The zoo list now has Fatebreaker where the network's vocabulary had Darkest Depths (2026-10-25), so many boards name a card
# the old network never saw and are skipped: enough compared boards is the requirement, not more compared than skipped.
sys.exit(0 if worst < 1e-5 and seen >= 100 else 1)
