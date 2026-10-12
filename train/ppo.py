"""PPO self-play for the simulator games of src/selfplay-env.mjs.

Both seats of every game are played by the network being trained, except that some games put a
frozen earlier copy of it in one seat, so the learner cannot win only by beating its present self.
The network scores each legal step it is shown (state and step vectors come from
src/selfplay-encode.mjs), so there is no fixed action table and nothing to mask but the padding.
The only reward is the result: +1 for the seat that wins, -1 for the one that loses, 0 for a draw.

    python train/ppo.py --iters 50
    python train/ppo.py --eval runtime/selfplay/<run>/policy.pt --eval-games 1000

Needs torch and node; nothing else.
"""
import argparse
import copy
import json
import random
import subprocess
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.distributions import Categorical
from torch.nn.utils.rnn import pad_sequence

ROOT = Path(__file__).resolve().parent.parent
RIVALS = ('random', 'rush')  # the players of src/selfplay.mjs the policy is measured against


class Arena:
    """The node process that holds the games."""

    def __init__(self, n, seed, decks, rival=None):
        self.p = subprocess.Popen(['node', str(ROOT / 'src' / 'selfplay-env.mjs')], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
        r = self.call(cmd='reset', n=n, seed=seed, decks=list(decks), rival=rival)
        self.obs, self.act, self.names, self.envs = r['obs'], r['act'], r['names'], r['envs']

    def call(self, **m):
        self.p.stdin.write(json.dumps(m) + '\n')
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError('the simulator process ended')
        r = json.loads(line)
        if 'error' in r:
            raise RuntimeError(r['error'])
        return r

    def step(self, actions):
        self.envs = self.call(cmd='step', actions=actions)['envs']
        return self.envs

    def close(self):
        self.p.stdin.close()
        self.p.wait()


class Net(nn.Module):
    def __init__(self, obs, act, width=256):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(obs, width), nn.ReLU(), nn.Linear(width, width), nn.ReLU())
        self.step = nn.Sequential(nn.Linear(act, width), nn.ReLU())
        self.score = nn.Sequential(nn.Linear(2 * width, width), nn.ReLU(), nn.Linear(width, 1))
        self.value = nn.Sequential(nn.Linear(width, width), nn.ReLU(), nn.Linear(width, 1))

    def forward(self, obs, acts, mask):
        e = self.body(obs)
        a = self.step(acts)
        logits = self.score(torch.cat([e.unsqueeze(1).expand(-1, a.shape[1], -1), a], -1)).squeeze(-1)
        return logits.masked_fill(~mask, -1e9), self.value(e).squeeze(-1)


def padded(acts):
    """A list of [steps, features] tensors as one padded batch and its mask."""
    lengths = torch.tensor([len(a) for a in acts])
    return pad_sequence(acts, batch_first=True), torch.arange(int(lengths.max()))[None, :] < lengths[:, None]


@torch.no_grad()
def choose(net, obs, acts, greedy=False):
    logits, value = net(torch.stack(obs), *padded(acts))
    dist = Categorical(logits=logits)
    a = logits.argmax(-1) if greedy else dist.sample()
    return a.tolist(), dist.log_prob(a).tolist(), value.tolist()


def tensors(envs):
    f = torch.float32
    return [torch.tensor(e['obs'], dtype=f) for e in envs], [torch.tensor(e['acts'], dtype=f) for e in envs]


def evaluate(net, decks, games, seed=900_000_000, n=64, rival='random'):
    """Greedy play against a rival inside the simulator; the seats alternate. -> (wins, draws, losses).

    Every table plays the same number of games: taking the first to finish would count the short ones.
    """
    n = min(n, games)
    arena = Arena(n, seed, decks, rival)
    left = [games // n + (i < games % n) for i in range(n)]
    tally = {1: 0, 0: 0, -1: 0}
    while any(left):
        a, _, _ = choose(net, *tensors(arena.envs), greedy=True)
        for i, e in enumerate(arena.step(a)):
            if 'ended' in e and left[i]:
                left[i] -= 1
                tally[e['ended']['result']] += 1
    arena.close()
    return tally[1], tally[0], tally[-1]


def collect(net, arena, pool, state, args):
    """Play until args.batch decisions of the learner belong to finished games."""
    done, games, turns = [], 0, 0
    live, rivals = state['live'], state['rivals']
    while len(done) < args.batch:
        envs = arena.envs
        obs, acts = tensors(envs)
        actions = [0] * len(envs)
        frozen = {}
        for i, e in enumerate(envs):
            if rivals[i] and rivals[i][0] == e['seat']:
                frozen.setdefault(rivals[i][1], []).append(i)
        mine = [i for i, e in enumerate(envs) if not (rivals[i] and rivals[i][0] == e['seat'])]
        if mine:
            a, logp, value = choose(net, [obs[i] for i in mine], [acts[i] for i in mine])
            for j, i in enumerate(mine):
                actions[i] = a[j]
                live[i][envs[i]['seat']].append((obs[i], acts[i], a[j], logp[j], value[j]))
        for k, idx in frozen.items():
            a, _, _ = choose(pool[k], [obs[i] for i in idx], [acts[i] for i in idx])
            for j, i in enumerate(idx):
                actions[i] = a[j]
        for i, e in enumerate(arena.step(actions)):
            if 'ended' not in e:
                continue
            w = e['ended']['winner']
            games += 1
            turns += e['ended']['turns']
            for seat in (0, 1):
                seq, r, adv, nxt = live[i][seat], 0.0 if w == 'draw' else 1.0 if w == seat else -1.0, 0.0, 0.0
                for t in range(len(seq) - 1, -1, -1):
                    o, ac, a, logp, v = seq[t]
                    delta = (r if t == len(seq) - 1 else 0.0) + args.gamma * nxt - v
                    adv = delta + args.gamma * args.lam * adv
                    nxt = v
                    done.append((o, ac, a, logp, adv, adv + v))
            live[i] = ([], [])
            rivals[i] = (random.randrange(2), random.randrange(len(pool))) if pool and random.random() < args.rival else None
    return done, games, turns


def update(net, opt, data, args):
    obs = torch.stack([d[0] for d in data])
    acts = [d[1] for d in data]
    a, logp0, adv, ret = (torch.tensor([d[k] for d in data]) for k in (2, 3, 4, 5))
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
    stats = torch.zeros(3)
    n = 0
    for _ in range(args.epochs):
        order = torch.randperm(len(data))
        for at in range(0, len(data), args.minibatch):
            idx = order[at:at + args.minibatch]
            logits, value = net(obs[idx], *padded([acts[i] for i in idx.tolist()]))
            dist = Categorical(logits=logits)
            ratio = (dist.log_prob(a[idx]) - logp0[idx]).exp()
            policy = -torch.min(ratio * adv[idx], ratio.clamp(1 - args.clip, 1 + args.clip) * adv[idx]).mean()
            critic = (ret[idx] - value).pow(2).mean()
            entropy = dist.entropy().mean()
            opt.zero_grad()
            (policy + args.vf * critic - args.ent * entropy).backward()
            nn.utils.clip_grad_norm_(net.parameters(), 0.5)
            opt.step()
            stats += torch.tensor([policy.item(), critic.item(), entropy.item()])
            n += 1
    return (stats / n).tolist()


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--decks', nargs=2, default=['warlock-discard', 'warlock-discard'])
    p.add_argument('--iters', type=int, default=50)
    p.add_argument('--envs', type=int, default=128)
    p.add_argument('--batch', type=int, default=8192, help='learner decisions an iteration')
    p.add_argument('--minibatch', type=int, default=1024)
    p.add_argument('--epochs', type=int, default=4)
    p.add_argument('--lr', type=float, default=3e-4)
    p.add_argument('--gamma', type=float, default=0.995)
    p.add_argument('--lam', type=float, default=0.95)
    p.add_argument('--clip', type=float, default=0.2)
    p.add_argument('--vf', type=float, default=0.5)
    p.add_argument('--ent', type=float, default=0.01)
    p.add_argument('--width', type=int, default=256)
    p.add_argument('--rival', type=float, default=0.25, help='share of games with a frozen copy in one seat')
    p.add_argument('--snapshot-every', type=int, default=5)
    p.add_argument('--pool', type=int, default=8)
    p.add_argument('--eval-every', type=int, default=5)
    p.add_argument('--eval-games', type=int, default=400)
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--out', default=None, help='run directory, default runtime/selfplay/<time>')
    p.add_argument('--resume', default=None, help='a policy.pt to go on from')
    p.add_argument('--eval', default=None, help='only evaluate this policy.pt against the scripted players')
    args = p.parse_args()
    torch.manual_seed(args.seed)
    random.seed(args.seed)

    if args.eval:
        ck = torch.load(args.eval, weights_only=True)
        net = Net(ck['obs'], ck['act'], ck['width'])
        net.load_state_dict(ck['net'])
        for rival in RIVALS:
            w, d, l = evaluate(net, ck['decks'], args.eval_games, rival=rival)
            print(f'{args.eval} (iter {ck["iters"]}) against {rival}: {w}W {d}D {l}L, {w / (w + d + l):.1%}')
        return

    out = Path(args.out) if args.out else ROOT / 'runtime' / 'selfplay' / time.strftime('%Y-%m-%dT%H-%M-%S')
    out.mkdir(parents=True, exist_ok=True)
    arena = Arena(args.envs, args.seed, args.decks)
    net = Net(arena.obs, arena.act, args.width)
    done_iters = 0
    if args.resume:
        ck = torch.load(args.resume, weights_only=True)
        net.load_state_dict(ck['net'])
        done_iters = ck['iters']
    opt = torch.optim.Adam(net.parameters(), lr=args.lr)
    pool, state = [], {'live': [([], []) for _ in range(args.envs)], 'rivals': [None] * args.envs}
    log = out / 'log.csv'
    if not log.exists():
        log.write_text('iter,decisions,games,turns,policy_loss,value_loss,entropy,vs_random,vs_rush,seconds\n')

    def score():
        out = []
        for rival in RIVALS:
            w, d, l = evaluate(net, args.decks, args.eval_games, rival=rival)
            out.append(w / (w + d + l))
        return out

    def shown(vs):
        return ', '.join(f'{x:.1%} against {r}' for r, x in zip(RIVALS, vs))

    print(f'{args.decks[0]} vs {args.decks[1]}: state {arena.obs}, step {arena.act}, {sum(x.numel() for x in net.parameters())} weights -> {out}')
    print(f'iter {done_iters}: {shown(score())} over {args.eval_games} games each', flush=True)
    for it in range(done_iters + 1, done_iters + args.iters + 1):
        t0 = time.time()
        data, games, turns = collect(net, arena, pool, state, args)
        pl, vl, ent = update(net, opt, data, args)
        vs = score() if it % args.eval_every == 0 or it == done_iters + args.iters else None
        if it % args.snapshot_every == 0:
            pool.append(copy.deepcopy(net).eval())
            del pool[:-args.pool]
        torch.save({'net': net.state_dict(), 'obs': arena.obs, 'act': arena.act, 'width': args.width,
                    'names': arena.names, 'decks': args.decks, 'iters': it}, out / 'policy.pt')
        secs = time.time() - t0
        with log.open('a') as f:
            f.write(f'{it},{len(data)},{games},{turns / games:.1f},{pl:.4f},{vl:.4f},{ent:.4f},{"," if vs is None else f"{vs[0]:.4f},{vs[1]:.4f}"},{secs:.0f}\n')
        print(f'iter {it}: {len(data)} decisions in {games} games of {turns / games:.1f} turns, value loss {vl:.3f}, entropy {ent:.3f}, {secs:.0f}s'
              + ('' if vs is None else ', ' + shown(vs)), flush=True)
    arena.close()


if __name__ == '__main__':
    main()
