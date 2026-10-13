"""Where the network ends its turn with an attack still legal: play on from 'end' and from each attack."""
import sys, json, torch
sys.path.insert(0, __file__.rsplit('/', 2)[0])
from ppo import load, Arena, tensors, padded, rollout
path, positions, games = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
net, ck = load(path)
arena = Arena(32, 600_000_000, ck['decks'])
V = len(arena.names) + 1
rows, turns_seen, ends = [], 0, 0
while len(rows) < positions:
    obs, acts = tensors(arena.envs)
    with torch.no_grad():
        logits, value = net(torch.stack(obs), *padded(acts))
    for i, e in enumerate(arena.envs):
        A = e['acts']; pick = int(logits[i, :len(A)].argmax())
        if A[pick][5] <= 0: continue
        ends += 1
        att = sorted((k for k, a in enumerate(A) if a[1] > 0), key=lambda k: -logits[i, k].item())[:5]
        if not att or len(rows) >= positions: continue
        tally = rollout(net, arena, i, [pick] + att, games, seed=600_000_000 + 7919 * len(rows))
        win = [(w + d / 2) / (w + d + l) for w, d, l in tally]
        k0 = 6 + V + 3
        rows.append({'turn': (round(e['obs'][21] * 10) + 1) // 2, 'value': value[i].item(), 'end': win[0], 'n_att': sum(a[1] > 0 for a in A),
                     'att': [{'win': w, 'hero_att': A[k][6 + V - 1] > 0, 'atk': round(A[k][6 + V + 1] * 10), 'hp': round(A[k][6 + V + 2] * 10),
                              'face': A[k][k0 + 1] > 0, 't_atk': round(A[k][k0 + 4] * 10), 't_hp': round(A[k][k0 + 5] * 10), 'taunt': A[k][k0 + 6] > 0}
                             for k, w in zip(att, win[1:])]})
        print(json.dumps(rows[-1]), flush=True)
    arena.step(logits.argmax(-1).tolist())
arena.close()
print(json.dumps({'ends': ends}))
