"""Turns with a provable mistake in them (src/selfplay-quiz.mjs): gather them once, then count how often a network makes it.

    python train/probes/quiz.py build <bank.json> <questions> <policy.pt> [<policy.pt> ...]
        Greedy self-play of each network in turn; every turn start that has a question is kept.
    python train/probes/quiz.py answer <bank.json> <policy.pt> [<policy.pt> ...] [--search]
        value: of the pairs of positions where one is plainly better, how often the value says the reverse.
        policy: the network plays each question's turn; how often it hands over a plainly worse position.
        With --search also with the look ahead, and with the look ahead and its dominance rule.
    python train/probes/quiz.py duel <policy.pt> <games> [<other.pt>]
        Both seats look ahead; one of them with the dominance rule. -> its wins, draws, losses.
"""
import json
import subprocess
import sys

import torch

sys.path.insert(0, __file__.rsplit('/', 2)[0])
from ppo import ROOT, Arena, load, padded, tensors

KINDS = ('kill', 'hero', 'own', 'foe', 'mixed')
LOOK = (2, 8, 1e-3)  # deals, beam, weight of the policy's own log probability: the defaults of ppo.py


class Quiz(Arena):
    def __init__(self, n, seed, decks):
        self.p = subprocess.Popen(['node', str(ROOT / 'src' / 'selfplay-quiz.mjs')], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
        r = self.call(cmd='reset', n=n, seed=seed, decks=list(decks))
        self.obs, self.act, self.names, self.envs = r['obs'], r['act'], r['names'], r['envs']


@torch.no_grad()
def think(net, arena, idx, envs, look=None, dominance=False):
    """Greedy steps at the tables idx; with look=(deals, beam, prior) after a look ahead, with or without the rule."""
    if not idx:
        return []
    obs, acts = tensors([envs[i] for i in idx])
    logits, _ = net(torch.stack(obs), *padded(acts))
    if not look:
        return logits.argmax(-1).tolist()
    r = arena.call(cmd='plan', tables=idx, samples=look[0], width=look[1], dominance=dominance)
    while 'ask' in r:
        r = arena.call(cmd='values', v=net.value(net.body(torch.tensor(r['ask'], dtype=torch.float32))).squeeze(-1).tolist())
    prior = torch.log_softmax(logits, -1).clamp(min=-10)
    return [max(range(len(sc)), key=lambda k: sc[k] + look[2] * prior[j, k].item()) for j, sc in enumerate(r['scores'])]


def build(out, questions, paths, n=64, seed=400_000_000, over=3):
    """Each network plays until `over` times its share of questions came up, of which its share is drawn by lot:
    the tables start together, so the first questions to come up are all from the first turns of a game."""
    bank, seen, big = [], 0, 0
    for at, path in enumerate(paths):
        net, ck = load(path)
        arena = Quiz(n, seed + 1_000_000 * at, ck['decks'])
        arena.call(cmd='collect', on=True)
        want = questions * (at + 1) // len(paths) - len(bank)
        while arena.call(cmd='bank', count=True)['bank'] < over * want:
            arena.step(think(net, arena, list(range(n)), arena.envs))
        r = arena.call(cmd='bank')
        lot = torch.randperm(len(r['bank']), generator=torch.Generator().manual_seed(seed + at))[:want].tolist()
        bank += [{**r['bank'][i], 'from': path} for i in sorted(lot)]
        seen, big = seen + r['seen'], big + r['big']
        arena.close()
        print(f'{path}: {want} of {len(r["bank"])} questions from {r["seen"]} turn starts ({r["big"]} too large to play out)', flush=True)
    json.dump({'decks': ck['decks'], 'seen': seen, 'big': big, 'bank': bank}, open(out, 'w'))


@torch.no_grad()
def value_errors(net, bank):
    """-> {kind: (pairs, share the value ranks the wrong way)}"""
    rows = [(p['what'], p['good'], p['bad']) for q in bank for p in q['pairs']]
    v = lambda k: net.value(net.body(torch.tensor([r[k] for r in rows], dtype=torch.float32))).squeeze(-1)
    wrong = (v(1) > v(2)).tolist()  # both are seen by the seat that did not play: the better end must look worse to it
    out = {}
    for what in ('hero', 'own', 'foe', 'mixed', 'all'):
        hit = [w for (k, _, _), w in zip(rows, wrong) if what in (k, 'all')]
        out[what] = (len(hit), sum(hit) / max(1, len(hit)))
    return out


def answers(net, decks, bank, look=None, dominance=False):
    arena = Quiz(1, 1, decks)
    r = arena.call(cmd='quiz', bank=[{k: q[k] for k in ('seed', 'hist', 'grades')} for q in bank])
    for _ in range(400):
        if 'answers' in r:
            break
        idx = [i for i, e in enumerate(r['envs']) if e]
        actions = [0] * len(bank)
        for i, a in zip(idx, think(net, arena, idx, r['envs'], look, dominance)):
            actions[i] = a
        r = arena.call(cmd='turn', actions=actions)
    arena.close()
    return r['answers']


def report(name, got):
    n = len(got)
    wrong = sum(g in KINDS for g in got)
    print(f'  {name}: wrong {wrong / n:.1%} of {n}  (' + ', '.join(f'{k} {got.count(k) / n:.1%}' for k in KINDS) + ')', flush=True)


def duel(net, other, decks, games, n=64, seed=300_000_000):
    """net with the rule against other without, both looking ahead; the seats alternate. -> wins, draws, losses of the rule."""
    n = min(n, games)
    arena = Quiz(n, seed, decks)
    left = [games // n + (i < games % n) for i in range(n)]
    played, tally = [0] * n, {1: 0, 0: 0, -1: 0}
    while any(left):
        envs, actions = arena.envs, [0] * n
        for side in (0, 1):
            idx = [i for i, e in enumerate(envs) if (e['seat'] + i + played[i]) % 2 == side]
            for i, a in zip(idx, think(other if side else net, arena, idx, envs, LOOK, dominance=side == 0)):
                actions[i] = a
        for i, e in enumerate(arena.step(actions)):
            if 'ended' not in e:
                continue
            if left[i]:
                w = e['ended']['winner']
                left[i] -= 1
                tally[0 if w == 'draw' else 1 if w == (i + played[i]) % 2 else -1] += 1
            played[i] += 1
    arena.close()
    return tally[1], tally[0], tally[-1]


if __name__ == '__main__':
    cmd, args = sys.argv[1], [a for a in sys.argv[2:] if a != '--search']
    if cmd == 'build':
        build(args[0], int(args[1]), args[2:])
    elif cmd == 'answer':
        data = json.load(open(args[0]))
        bank = data['bank']
        print(f'{len(bank)} questions from {data["seen"]} turn starts ({data["big"]} too large to play out)')
        for path in args[1:]:
            net, ck = load(path)
            print(f'{path} (iter {ck["iters"]})')
            print('  value: ' + ', '.join(f'{k} {share:.1%} of {m}' for k, (m, share) in value_errors(net, bank).items()), flush=True)
            report('policy', answers(net, data['decks'], bank))
            if '--search' in sys.argv:
                report('look ahead', answers(net, data['decks'], bank, LOOK))
                report('look ahead + rule', answers(net, data['decks'], bank, LOOK, True))
    elif cmd == 'duel':
        net, ck = load(args[0])
        other = load(args[2])[0] if len(args) > 2 else net
        w, d, l = duel(net, other, ck['decks'], int(args[1]))
        print(f'rule {w} draws {d} no rule {l}: {(w + d / 2) / (w + d + l):.1%} for the rule', flush=True)
