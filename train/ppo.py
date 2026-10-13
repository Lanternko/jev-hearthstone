"""PPO self-play for the simulator games of src/selfplay-env.mjs.

Both seats of every game are played by the network being trained, except that some games put a
frozen earlier copy of it in one seat, so the learner cannot win only by beating its present self.
The network scores each legal step it is shown (state and step vectors come from
src/selfplay-encode.mjs), so there is no fixed action table and nothing to mask but the padding.
The only reward is the result: +1 for the seat that wins, -1 for the one that loses, 0 for a draw.

    python train/ppo.py --iters 50
    python train/ppo.py --eval runtime/selfplay/<run>/policy.pt --eval-games 1000
    python train/ppo.py --eval <new>.pt --vs <old>.pt      # one policy against another
    python train/ppo.py --audit <run>/ckpt/*.pt            # plain mistakes of each, see src/selfplay-audit.mjs
    python train/ppo.py --eval <a>.pt --vs <a>.pt --search 2   # the same network, looking ahead against not
    python train/ppo.py --distill --resume <a>.pt --iters 100  # train it on its own look ahead
    python train/ppo.py --probe <run>/ckpt/*.pt                # does the value rise with our Health, fall with theirs
    python train/ppo.py --compare <a>.pt --pick Chronoclaws 'Duke of Below'   # two steps, by games played on

With --search N the first network looks ahead to the end of its own turn before every step
(src/selfplay-search.mjs): N deals of the hidden cards, a beam of --beam positions in each, every
finished line judged by the value half of the network. The network named by --vs never looks ahead.

With --distill the training is no longer PPO: every step of both seats is chosen after a look ahead,
the step scorer is taught its own preference moved by the look ahead (each step's probability times
exp(score / --tau), so where the look ahead sees no difference the scorer keeps what it knew) and
the value the result of the game. --mono adds a penalty wherever the value falls when only our hero's
Health is raised or only the other's lowered.

--compare answers a question the value cannot be trusted on ("on turn four, the weapon or the
Duke?"): in self-play, wherever both --pick steps are legal, each is taken in --games copies of the
game on fresh deals of the hidden cards, and the copies are played on to their results.

A run also keeps a numbered copy of the network every --keep-every iterations under <run>/ckpt and
measures the present network against the first of them and against the one --lag iterations back:
the scripted players are soon beaten, and after that only earlier selves say whether it still improves.

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

    def __init__(self, n, seed, decks, rival=None, audit=False):
        self.p = subprocess.Popen(['node', str(ROOT / 'src' / 'selfplay-env.mjs')], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
        r = self.call(cmd='reset', n=n, seed=seed, decks=list(decks), rival=rival, audit=audit)
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


@torch.no_grad()
def think(net, arena, idx, obs, acts, look=None):
    """Greedy steps of the network at the tables idx; with look=(samples, width, prior) after a look ahead."""
    if not idx:
        return []
    logits, _ = net(torch.stack([obs[i] for i in idx]), *padded([acts[i] for i in idx]))
    if not look:
        return logits.argmax(-1).tolist()
    scores = look_ahead(net, arena, idx, look[0], look[1])
    # Each step's score, plus `prior` times the log of the policy's own probability for it: at the
    # least this settles the steps the look ahead cannot tell apart.
    prior = torch.log_softmax(logits, -1).clamp(min=-10)
    return [max(range(len(sc)), key=lambda k: sc[k] + look[2] * prior[j, k].item()) for j, sc in enumerate(scores)]


@torch.no_grad()
def look_ahead(net, arena, idx, samples, width):
    """The look ahead of src/selfplay-search.mjs at the tables idx -> a score for each legal step of each."""
    r = arena.call(cmd='plan', tables=idx, samples=samples, width=width)
    while 'ask' in r:
        r = arena.call(cmd='values', v=net.value(net.body(torch.tensor(r['ask'], dtype=torch.float32))).squeeze(-1).tolist())
    return r['scores']


@torch.no_grad()
def rollout(net, arena, table, steps, games, seed=1):
    """Greedy play of the network in both seats from each of these steps of one table -> [wins, draws, losses] a step."""
    r = arena.call(cmd='fork', table=table, steps=steps, games=games, seed=seed)
    while r['envs']:
        r = arena.call(cmd='side', actions=think(net, arena, list(range(len(r['envs']))), *tensors(r['envs'])))
    return r['tally']


def tensors(envs):
    f = torch.float32
    return [torch.tensor(e['obs'], dtype=f) for e in envs], [torch.tensor(e['acts'], dtype=f) for e in envs]


def evaluate(net, decks, games, seed=900_000_000, n=64, rival='random', look=None):
    """Greedy play against a rival inside the simulator; the seats alternate. -> (wins, draws, losses).

    Every table plays the same number of games: taking the first to finish would count the short ones.
    """
    n = min(n, games)
    arena = Arena(n, seed, decks, rival)
    left = [games // n + (i < games % n) for i in range(n)]
    tally = {1: 0, 0: 0, -1: 0}
    while any(left):
        a = think(net, arena, list(range(n)), *tensors(arena.envs), look)
        for i, e in enumerate(arena.step(a)):
            if 'ended' in e and left[i]:
                left[i] -= 1
                tally[e['ended']['result']] += 1
    arena.close()
    return tally[1], tally[0], tally[-1]


def load(path):
    ck = torch.load(path, weights_only=True)
    net = Net(ck['obs'], ck['act'], ck['width'])
    net.load_state_dict(ck['net'])
    return net.eval(), ck


def duel(a, b, decks, games, seed=800_000_000, n=64, look=None):
    """Greedy play of network a against network b; the seats alternate. -> (wins, draws, losses) of a.

    look=(samples, width, prior) lets a, and only a, look ahead.
    """
    n = min(n, games)
    arena = Arena(n, seed, decks)
    left = [games // n + (i < games % n) for i in range(n)]
    played = [0] * n
    tally = {1: 0, 0: 0, -1: 0}
    while any(left):
        envs = arena.envs
        obs, acts = tensors(envs)
        actions = [0] * n
        for net, side in ((a, 0), (b, 1)):
            idx = [i for i, e in enumerate(envs) if (e['seat'] + i + played[i]) % 2 == side]
            for i, pick in zip(idx, think(net, arena, idx, obs, acts, look if side == 0 else None)):
                actions[i] = pick
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


AUDIT = (('lethal missed', 'lethalMissed', 'lethalTurns'), ('buff after swing', 'buffLate', 'buffs'),
         ('no excuse', 'lateClear', 'buffs'), ('not a buff card', 'lateOther', 'buffs'), ('card came later', 'lateDrawn', 'buffs'),
         ('nothing lost', 'lateFree', 'buffs'), ('won anyway', 'lateWon', 'buffs'),
         ('minion lost for nothing', 'tradeLost', 'trades'), ('damage at own side', 'aimedOwn', 'aimed'),
         ('passed with attack', 'endAttack', 'turns'), ('passed with card', 'endPlay', 'turns'),
         ('passed without tap', 'endPower', 'turns'), ('mana left', 'manaLeft', 'turns'))


def audit(net, decks, games, seed=700_000_000, n=64, look=None):
    """Greedy play of the network in both seats, counted by src/selfplay-audit.mjs. -> its totals."""
    arena = Arena(n, seed, decks, audit=True)
    done = 0
    while done < games:
        a = think(net, arena, list(range(n)), *tensors(arena.envs), look)
        done += sum('ended' in e for e in arena.step(a))
    stats = arena.call(cmd='stats')['stats']
    arena.close()
    return stats


OWN_HP, OTHER_HP = 0, 1  # where src/selfplay-encode.mjs puts the two heroes' Health, in tens


def shifted(obs, d):
    """The same states with our hero d healthier, and with the other hero d weaker; and where each is a state at all."""
    up, down = obs.clone(), obs.clone()
    up[:, OWN_HP] += d
    down[:, OTHER_HP] -= d
    return (up, up[:, OWN_HP] <= 3.0), (down, down[:, OTHER_HP] >= 0.1)


@torch.no_grad()
def probe(net, decks, states=20000, seed=600_000_000, n=64):
    """Greedy self-play states with one hero's Health moved and nothing else -> rows of (what, by, share worse, mean change)."""
    arena = Arena(n, seed, decks)
    seen = []
    while len(seen) < states:
        obs, acts = tensors(arena.envs)
        seen += obs
        arena.step(think(net, arena, list(range(n)), obs, acts))
    arena.close()
    obs = torch.stack(seen)
    value = lambda x: net.value(net.body(x)).squeeze(-1)
    base, rows = value(obs), []
    for d in (1, 3, 6):
        for what, (x, ok) in zip(('our hero healthier', 'their hero weaker'), shifted(obs, torch.full((len(obs),), d / 10))):
            dv = (value(x) - base)[ok]
            rows.append((what, d, (dv < 0).float().mean().item(), dv.mean().item()))
    return rows


def compare(net, decks, picks, positions, games, seed=500_000_000, n=32):
    """Greedy self-play; wherever every pick is a legal step, play each on in `games` copies. -> rows.

    A pick is a card's name (playing it) or a kind of step ('attack', 'power', 'end'); of several
    steps that fit, the one the network likes best.
    """
    arena = Arena(n, seed, decks)
    V, rows = len(arena.names) + 1, []
    kinds = ('play', 'attack', 'power', 'use', 'choose', 'end')

    def fits(a, pick):
        if pick in kinds:
            return a[kinds.index(pick)] > 0
        return a[0] > 0 and pick in arena.names and a[len(kinds) + arena.names.index(pick)] > 0

    while len(rows) < positions:
        obs, acts = tensors(arena.envs)
        with torch.no_grad():
            logits, value = net(torch.stack(obs), *padded(acts))
        for i, e in enumerate(arena.envs):
            steps = [max((k for k, a in enumerate(e['acts']) if fits(a, pick)), key=lambda k: logits[i, k].item(), default=None) for pick in picks]
            if None in steps or len(set(steps)) < len(steps) or len(rows) >= positions:
                continue
            tally = rollout(net, arena, i, steps, games, seed=seed + 7919 * len(rows))
            rows.append({'turn': (round(e['obs'][21] * 10) + 1) // 2, 'value': value[i].item(), 'chose': int(logits[i].argmax()) in steps and steps.index(int(logits[i].argmax())),
                         'win': [(w + d / 2) / (w + d + l) for w, d, l in tally]})
        arena.step(logits.argmax(-1).tolist())
    arena.close()
    return rows


def collect_search(net, arena, state, args):
    """Self-play with a look ahead before every step, until args.batch decisions belong to finished games.

    -> (obs, acts, target, z) a decision: target is the network's own preference over the steps moved
    by the look ahead's scores (None where there was one step) and z the result for the seat that decided.
    """
    done, games, turns, live = [], 0, 0, state['live']
    while len(done) < args.batch:
        envs = arena.envs
        obs, acts = tensors(envs)
        idx = [i for i, e in enumerate(envs) if len(e['acts']) > 1]
        actions = [0] * len(envs)
        if idx:
            with torch.no_grad():
                logits, _ = net(torch.stack([obs[i] for i in idx]), *padded([acts[i] for i in idx]))
            prior = torch.log_softmax(logits, -1).clamp(min=-10)
            for j, (i, sc) in enumerate(zip(idx, look_ahead(net, arena, idx, args.search or 2, args.beam))):
                target = torch.softmax(prior[j, :len(sc)] + torch.tensor(sc) / args.tau, 0)
                actions[i] = int(torch.multinomial(target, 1))
                live[i][envs[i]['seat']].append((obs[i], acts[i], target))
        for i, e in enumerate(envs):
            if len(e['acts']) < 2:
                live[i][e['seat']].append((obs[i], acts[i], None))
        for i, e in enumerate(arena.step(actions)):
            if 'ended' not in e:
                continue
            w = e['ended']['winner']
            games += 1
            turns += e['ended']['turns']
            for seat in (0, 1):
                z = 0.0 if w == 'draw' else 1.0 if w == seat else -1.0
                done += [(o, ac, target, z) for o, ac, target in live[i][seat]]
            live[i] = ([], [])
    return done, games, turns


def distill(net, opt, data, args):
    """One pass over the decisions: the step scorer towards the look ahead, the value towards the result."""
    obs = torch.stack([d[0] for d in data])
    z = torch.tensor([d[3] for d in data])
    stats, n = torch.zeros(3), 0
    order = torch.randperm(len(data))
    for at in range(0, len(data), args.minibatch):
        idx = order[at:at + args.minibatch]
        rows = idx.tolist()
        logits, value = net(obs[idx], *padded([data[i][1] for i in rows]))
        logp = torch.log_softmax(logits, -1)
        target = torch.zeros_like(logp)
        for j, i in enumerate(rows):
            if data[i][2] is not None:
                target[j, :len(data[i][2])] = data[i][2]
        policy = -(target * logp.clamp(min=-30)).sum(-1).mean()
        critic = (z[idx] - value).pow(2).mean()
        mono = torch.zeros(())
        if args.mono:
            base = net.value(net.body(obs[idx])).squeeze(-1)
            for x, ok in shifted(obs[idx], torch.randint(1, 7, (len(rows),)) / 10):
                mono = mono + (torch.relu(base - net.value(net.body(x)).squeeze(-1)) * ok).mean()
        opt.zero_grad()
        (policy + args.vf * critic + args.mono * mono).backward()
        nn.utils.clip_grad_norm_(net.parameters(), 0.5)
        opt.step()
        stats += torch.tensor([policy.item(), critic.item(), mono.item()])
        n += 1
    return (stats / n).tolist()


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
    p.add_argument('--anneal', action='store_true', help='lower the learning rate in a straight line to zero over the run')
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
    p.add_argument('--audit', nargs='+', default=None, help='only count the plain mistakes of these policy.pt files')
    p.add_argument('--vs', default=None, help='with --eval: play it against this policy.pt instead')
    p.add_argument('--search', type=int, default=0, help='with --eval, --audit or --distill: deals of the hidden cards to look ahead in, 0 for none (2 with --distill)')
    p.add_argument('--distill', action='store_true', help='train on the look ahead instead of by PPO, see above')
    p.add_argument('--tau', type=float, default=0.03, help='with --distill: the difference in score that multiplies a step\'s probability by e')
    p.add_argument('--mono', type=float, default=0.0, help='with --distill: weight of the penalty on a value that falls as our Health rises or theirs falls')
    p.add_argument('--window', type=int, default=4, help='with --distill: batches of decisions each pass learns from, the newest ones')
    p.add_argument('--probe', nargs='+', default=None, help="only measure how these policy.pt files' value follows the heroes' Health")
    p.add_argument('--compare', default=None, help='only compare the --pick steps of this policy.pt by games played on')
    p.add_argument('--pick', nargs='+', default=None, help='with --compare: card names or kinds of step')
    p.add_argument('--positions', type=int, default=50, help='with --compare: positions to play on from')
    p.add_argument('--games', type=int, default=100, help='with --compare: games played on from each step')
    p.add_argument('--beam', type=int, default=8, help='positions a look ahead keeps at each step of the turn')
    p.add_argument('--prior', type=float, default=1e-3, help="weight of the policy's own log probability beside a look ahead's score")
    p.add_argument('--keep-every', type=int, default=10, help='iterations between the numbered copies under <run>/ckpt')
    p.add_argument('--lag', type=int, default=50, help='also measure against the copy this many iterations back')
    args = p.parse_args()
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    look = (args.search, args.beam, args.prior) if args.search else None

    if args.probe:
        for path in args.probe:
            net, ck = load(path)
            print(f'{path} (iter {ck["iters"]})')
            for what, d, worse, mean in probe(net, ck['decks']):
                print(f'  {what} by {d}: value lower in {worse:.1%} of states, {mean:+.3f} on average', flush=True)
        return

    if args.compare:
        net, ck = load(args.compare)
        rows = compare(net, ck['decks'], args.pick, args.positions, args.games)
        for r in rows:
            print(f'turn {r["turn"]:2d}, value {r["value"]:+.2f}, the network takes {"neither" if r["chose"] is False else args.pick[r["chose"]]}: '
                  + ', '.join(f'{p} {w:.0%}' for p, w in zip(args.pick, r['win'])))
        k = len(rows)
        print(f'{k} positions, {args.games} games from each step: ' + ', '.join(f'{p} {sum(r["win"][j] for r in rows) / k:.1%}' for j, p in enumerate(args.pick))
              + f'; better by 10 points or more: ' + ', '.join(f'{p} in {sum(r["win"][j] >= max(r["win"][:j] + r["win"][j + 1:]) + 0.1 for r in rows)}' for j, p in enumerate(args.pick))
              + '; the network takes ' + ', '.join(f'{p} in {sum(r["chose"] is not False and r["chose"] == j for r in rows)}' for j, p in enumerate(args.pick)))
        return

    if args.audit:
        print('iter | ' + ' | '.join(name for name, _, _ in AUDIT))
        for path in args.audit:
            net, ck = load(path)
            x = audit(net, ck['decks'], args.eval_games, look=look)
            cells = [f'{x[a] / x[b]:.2f}' if a == 'manaLeft' else f'{x[a] / max(x[b], 1):.1%} of {x[b]}' if b != 'turns'
                     else f'{x[a] / x[b]:.1%}' for _, a, b in AUDIT]
            print(f'{ck["iters"]} | ' + ' | '.join(cells), flush=True)
        return

    if args.eval:
        net, ck = load(args.eval)
        if args.vs:
            old, ck2 = load(args.vs)
            w, d, l = duel(net, old, ck['decks'], args.eval_games, look=look)
            print(f'{args.eval} (iter {ck["iters"]}{", looking ahead" if look else ""}) against {args.vs} (iter {ck2["iters"]}): {w}W {d}D {l}L, {w / (w + d + l):.1%}')
            return
        for rival in RIVALS:
            w, d, l = evaluate(net, ck['decks'], args.eval_games, rival=rival, look=look)
            print(f'{args.eval} (iter {ck["iters"]}{", looking ahead" if look else ""}) against {rival}: {w}W {d}D {l}L, {w / (w + d + l):.1%}')
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
    start = copy.deepcopy(net).eval()  # what a --distill run is measured against: the network it began as
    recent = []
    pool, state = [], {'live': [([], []) for _ in range(args.envs)], 'rivals': [None] * args.envs}
    log = out / 'log.csv'
    if not log.exists():
        log.write_text('iter,decisions,games,turns,policy_loss,value_loss,entropy,vs_random,vs_rush,vs_first,vs_lag,seconds\n')
    kept = out / 'ckpt'
    kept.mkdir(exist_ok=True)
    first = None  # the earliest numbered copy of this run, once there is one

    def against(path):
        """Share of games the present network wins against the copy at path, '' when there is none."""
        if not path or not path.exists():
            return ''
        w, d, l = duel(net, load(path)[0], args.decks, args.eval_games)
        return f'{w / (w + d + l):.4f}'

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
        if args.anneal:
            for g in opt.param_groups:
                g['lr'] = args.lr * (1 - (it - done_iters - 1) / args.iters)
        if args.distill:
            data, games, turns = collect_search(net, arena, state, args)
            recent = (recent + [data])[-args.window:]
            pl, vl, ent = distill(net, opt, [d for batch in recent for d in batch], args)  # ent holds the --mono penalty here
        else:
            data, games, turns = collect(net, arena, pool, state, args)
            pl, vl, ent = update(net, opt, data, args)
        vs = score() if it % args.eval_every == 0 or it == done_iters + args.iters else None
        if it % args.snapshot_every == 0:
            pool.append(copy.deepcopy(net).eval())
            del pool[:-args.pool]
        ck = {'net': net.state_dict(), 'obs': arena.obs, 'act': arena.act, 'width': args.width,
              'names': arena.names, 'decks': args.decks, 'iters': it}
        torch.save(ck, out / 'policy.pt')
        selves = ('', '') if vs is None else (against(first), against(kept / f'iter-{it - args.lag:04d}.pt'))
        if args.distill and vs is not None:
            w, d, l = duel(net, start, args.decks, args.eval_games)
            selves = (f'{w / (w + d + l):.4f}', selves[1])
        if it % args.keep_every == 0:
            torch.save(ck, kept / f'iter-{it:04d}.pt')
            first = first or kept / f'iter-{it:04d}.pt'
        secs = time.time() - t0
        with log.open('a') as f:
            f.write(f'{it},{len(data)},{games},{turns / games:.1f},{pl:.4f},{vl:.4f},{ent:.4f},{"," if vs is None else f"{vs[0]:.4f},{vs[1]:.4f}"},{selves[0]},{selves[1]},{secs:.0f}\n')
        print(f'iter {it}: {len(data)} decisions in {games} games of {turns / games:.1f} turns, value loss {vl:.3f}, {"health penalty" if args.distill else "entropy"} {ent:.4f}, {secs:.0f}s'
              + ('' if vs is None else ', ' + shown(vs))
              + ''.join(f', {float(x):.1%} against {who}' for x, who in zip(selves, ('where it began' if args.distill else 'the first copy', f'iter {it - args.lag}')) if x), flush=True)
    arena.close()


if __name__ == '__main__':
    main()
