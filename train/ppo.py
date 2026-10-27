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
With --depth 2 the --expand best first steps are also played on through the other side's next turn,
by the policy of --reply, and scored by the worst of its --replies lines.

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

More than two decks (--decks A B C ...): the vocabulary is the union of all of them, in the order given,
and every game is the first deck against one of the others, turning with the seed or by --mix
(weights of the others); --mirror p adds first-deck mirror matches in a share p of the games. With
--swap the first deck still takes the first seat in half of its games. Three decks or more, a
dh-cthun deck, or --extra also show the network the demon hunter's extra cell and the costs of its
hand as they now are (src/selfplay-encode.mjs, `extra`), and --stages each egg's breaks remaining. --resume from a network with another
vocabulary moves the weights of each card to its place by name (new cards start at zero).
--eval prints a line for each pairing of the network's deck against the rival's.

--shape <weights.json> (PPO only) adds to the result a potential-based reward from the board score of
src/board-score.mjs (Φ = Σ w·feature, the "weights" of the file train/fit_score.py writes), so that a
turn that sets up a payoff two turns away is told so before the game ends. Φ is taken where each seat
hands each of its turns over (its last decision of the turn); the last decision of each turn earns
--shape-scale * (--shape-gamma * Φ(this turn) - Φ(the turn before)), the first turn measured from the
seat's first decision, and the end of the game counts as Φ = 0. Without --shape nothing changes.

--distill-weight λ (PPO only) adds the look ahead of --distill as a second teacher beside the result:
the loss of each minibatch is the PPO loss plus λ times the cross entropy between the step scorer and
the same target as --distill (the network's own probability at the time the step was taken times
exp(score / --tau)). The steps are still sampled from the policy, so PPO stays on its own data; the
look ahead only supplies targets. It is the costly part, so it is asked only at a share --distill-frac
of the learner's decisions that have more than one step (drawn with a generator of their own, so the
games and the other draws do not move), with --search/--depth and their flags as for --distill; the
loss is the mean over the minibatch's decisions that have a target. --distill-decay-to μ moves λ in a
straight line to μ over the run. The log gains the columns distill (that loss), weight (λ) and
searched (decisions looked ahead at). Without --distill-weight nothing changes.

--rollout (with --distill-weight) takes the targets from games played to the end instead of from the look
ahead (src/selfplay-rollout.mjs): at a chosen decision the --rollout-k steps the network likes best are each
played on --rollout-n deals of the hidden cards, the same deals for every step, by a frozen network
(--rollout-net, default the network the run began as) greedily, or with --rollout-temp-decay d at the
temperature --rollout-temp * d^(steps since the branch) (below 0.05 greedy). The picks of the same card that
follow a branched step (Kazakus's effects and trial, a Discover) are all played out, up to --rollout-follow
lines a step and deal, and the step is scored by the best way to pick (see src/selfplay-rollout.mjs). With
win the share won (draws half), the target keeps the network's probability on the other steps and shares
the mass of the branched ones in proportion to p * exp((2 win - 1) / --rollout-tau). The decisions are
those where a step plays or picks a card whose effect comes later (Kazakus, its picks and trials, Rituals),
and, with chance 1/4, those where the two likeliest steps are within --rollout-margin of each other; at
most --rollout-frac of the batch an iteration. The copies are taken when the decision is made and played out
all together once the batch is collected (the searched column counts them). Without --rollout nothing changes.

--restart-frac f (PPO) starts that share of each iteration's games not from a new deal but from a position of a pool
(src/selfplay-restart.mjs): positions where the side to move has a step whose effect comes later (Kazakus, its picks and
trials, Rituals). The pool is seeded at the start with --restart-seed positions from greedy games of --restart-net
(a node-side network, default zoo-v5) over the training decks and seatings, and a ring of --restart-pool positions the
training games pass through follows the learner. A restart deals the hidden cards afresh (the opponent's hand and both
decks' order, from the mover's side) with a seed of its own and is then played on by the learner as any game, its
decisions going into the batch with the advantages of the part of the game that is left. The log gains restarts (the
restart games finished that iteration).

--kl-weight β and --kl-ref policy.pt (PPO) add β * KL(pi_ref || pi) to the loss, the mean over the batch's decisions
that have more than one legal step and no step whose effect comes later (those are the ones that are meant to move);
pi_ref is the frozen --kl-ref, default the network the run resumes from, β default 0.05 once either flag is given. The
log gains kl (that mean, before the weight). Without these flags nothing changes.

--oracle (PPO) gives the network a second value head that is trained with what the side to move cannot see: the other
hand, the other deck, and the next three cards of either deck (oracle() of src/selfplay-encode.mjs, sent by the
training games only). It reads the shared body of the visible state beside those cards, so the step scorer still
sees only the visible state; its value replaces the visible one in the generalised advantage, and both heads learn
the same returns (the visible head is the one the look ahead, the exports and the games outside training use). The
head is saved as oracle_value.* with its input size under "oracle" and is left out by train/export.py; resuming a
network without it starts it fresh. The log gains oracle_value_loss. Without --oracle nothing changes.

--opp DECK=policy.pt ... (PPO only, with more than one deck) trains the first deck against cheap sparring partners.
In every game between different decks the seat of the deck after the first is played by that deck's own opponent
network (the named policy.pt moved to this run's vocabulary by card name, a copy of the learner where none is
named), and the learner plays only the first deck's seats, so --distill-frac and the look ahead cost nothing
on the others. An opponent decides with one forward pass: it samples from softmax(logits / --opp-temp), and with
chance --opp-eps, where it has more than one legal step, takes the one with the second highest logit instead; the
probability of the mixture, (1 - eps) * softmax[a] + eps * [a is second best], is what it stores as the old
probability of the step. Mirror games and their frozen pool rival work as before. With --opp-lr above zero each
opponent has an Adam of its own and learns by plain PPO (no look ahead, no imitation) from its seat of the games
the learner is playing anyway, with the generalised advantage of that seat's result; every --opp-refresh
iterations the copy that plays is synced from the learning network and the copy it replaces joins the --opp-pool
earlier ones, and each game draws uniformly from that pool and the present copy, so the learner is not taught to
beat only the newest. The checkpoint holds the weights of each opponent under "opp" (--resume goes on from them),
and every --keep-every iterations <run>/ckpt gets opp-<deck>-iter-XXXX.pt, a policy.pt that train/export.py can
export. The log gains opp_decisions, opp_policy_loss, opp_value_loss and learner_searched. Without --opp nothing
changes.

--teacher rollout-teacher.jsonl (PPO) adds --teacher-weight α times a cross entropy on fixed positions labelled by
rollouts (runtime/scratch/eval-1026b/label-export.py: each row has obs, acts, legal (step names) and pick, the step
that won most over hundreds of deals): -log of the probability of every legal step with the name of the pick (steps
of one name are one choice). Each PPO minibatch adds --teacher-batch rows drawn from the training rows; the rows of
games with game % --teacher-holdout == 0 are held out. The positions must be encoded in this run's vocabulary
(the rows' obs and step sizes are checked). Use it with --kl-weight to keep the other decisions near the start.
The log gains teacher (the loss) and, measured each iteration with the greedy step, teacher_train_sig and
teacher_test_sig (share of the rows whose pick beat the start's step that now take the pick, trained and held out)
and teacher_test_keep (the held-out rows whose pick is the start's step that still take it). Without --teacher
nothing changes.

Needs torch and node; nothing else.
"""
import argparse
import base64
import copy
import json
import queue
import random
import subprocess
import threading
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical
from torch.nn.utils.rnn import pad_sequence

ROOT = Path(__file__).resolve().parent.parent
RIVALS = ('random', 'rush')  # the players of src/selfplay.mjs the policy is measured against
DEVICE = torch.device('cpu')  # where the networks and the updates live, set by --device; the games stay in node


class Arena:
    """The node process that holds the games."""

    def __init__(self, n, seed, decks, rival=None, audit=False, hold=False, wait=True, swap=False, restart=None, oracle=False):
        self.oracle = 0  # the length of a view's orc, the hidden cards for the --oracle head (0 without it)
        self.p = subprocess.Popen(['node', str(ROOT / 'src' / 'selfplay-env.mjs')], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.send(cmd='reset', n=n, seed=seed, decks=list(decks), rival=rival, audit=audit, bin=True, raw=True, hold=hold, swap=swap, timers=TIMERS,
                  extra=EXTRA, stages=STAGES, mix=MIX, mirror=MIRROR, **({'shape': SHAPE} if SHAPE else {}), **({'marks': True} if MARKS else {}), **({'seatDecks': True} if SEATDECKS else {}),
                  **({'restart': restart} if restart else {}), **({'oracle': True} if oracle else {}))
        if wait:
            self.started()

    def started(self):
        """The reply to the reset."""
        r = self.recv()
        self.obs, self.act, self.names, self.envs = r['obs'], r['act'], r['names'], r['envs']
        self.oracle = r.get('oracle', 0)

    def call(self, **m):
        self.send(**m)
        return self.recv()

    def send(self, **m):
        if 'v' in m:  # values go as float32 in base64, not as a list of decimals
            m['vBin'] = base64.b64encode(np.asarray(m.pop('v'), np.float32).tobytes()).decode()
        self.p.stdin.write((json.dumps(m) + '\n').encode())
        self.p.stdin.flush()

    def recv(self):
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError('the simulator process ended')
        r = json.loads(line)
        if 'error' in r:
            raise RuntimeError(r['error'])
        for k, size in r.pop('raw', {}).items():  # the blocks that follow the line, see "raw" in src/selfplay-env.mjs
            r[k] = self.p.stdout.read(size)
            if len(r[k]) != size:
                raise RuntimeError('the simulator process ended')
        if 'obsBin' in r:
            unpack(r, *((r['obs'], r['act'], r.get('oracle', 0)) if 'act' in r else (self.obs, self.act, self.oracle)))
        if 'askBin' in r:
            r['ask'] = blob(r.pop('askBin')).reshape(r.pop('asked'), self.obs)
        return r

    def look(self, tables, value, **m):
        """The look ahead at these tables, with value(states) the value of each -> a score for each step of each."""
        r = self.call(cmd='plan', tables=tables, **m)
        while 'ask' in r:
            r = self.call(cmd='values', v=value(r['ask']))
        return r['scores']

    def step(self, actions):
        self.envs = self.call(cmd='step', actions=actions)['envs']
        return self.envs

    def close(self):
        self.p.stdin.close()
        self.p.wait()
        self.p.stdout.close()


class Pool:
    """The tables of one Arena split over several node processes (--workers), which play at the same time.

    Each request goes to every process before any reply is read. A finished game is dealt again only
    once all the processes have answered ("hold" in src/selfplay-env.mjs), with the seed one process
    would have given it, so the games, the order of the views and every batch the networks see are
    those of a single Arena. The look ahead (look) is the exception: each process is answered as soon
    as it asks, so its batches of values are not those of a single Arena.
    """

    def __init__(self, n, seed, decks, rival=None, workers=2, swap=False, restart=None, oracle=False):
        k = min(workers, n)
        if restart:  # the ring is split over the processes
            restart = {**restart, 'cap': -(-restart['cap'] // k)}
        self.at = [n * w // k for w in range(k + 1)]  # worker w holds the tables at[w]..at[w + 1] - 1
        self.parts = [Arena(self.at[w + 1] - self.at[w], seed + self.at[w], decks, rival, hold=True, wait=False, swap=swap, restart=restart, oracle=oracle) for w in range(k)]
        for a in self.parts:
            a.started()
        self.obs, self.act, self.names, self.oracle = self.parts[0].obs, self.parts[0].act, self.parts[0].names, self.parts[0].oracle
        self.envs = [e for a in self.parts for e in a.envs]
        self.next = seed + n  # the seed of the next game dealt
        # Every reply is read by its worker's own thread, so that a look ahead can answer whichever
        # process asks first instead of waiting each round for the slowest of them.
        self.replies = queue.Queue()
        self.asking = [threading.Semaphore(0) for _ in self.parts]
        self.closed = False
        for w in range(k):
            threading.Thread(target=self.reader, args=(w,), daemon=True).start()

    def reader(self, w):
        while True:
            self.asking[w].acquire()
            if self.closed:
                return
            try:
                self.replies.put((w, self.parts[w].recv()))
            except Exception as e:  # noqa: BLE001 - raised again in the main thread
                self.replies.put((w, e))
                return

    def send(self, w, m):
        self.parts[w].send(**m)
        self.asking[w].release()

    def got(self, block=True):
        """The next (worker, reply) read; None when block is False and none is waiting."""
        try:
            w, r = self.replies.get(block)
        except queue.Empty:
            return None
        if isinstance(r, Exception):
            raise r
        return w, r

    def where(self, i):
        """Table i -> (its worker, its index there)."""
        w = next(w for w in range(len(self.parts)) if i < self.at[w + 1])
        return w, i - self.at[w]

    def each(self, msgs):
        """{worker: message} -> {worker: reply}, every message sent before any reply is read."""
        for w, m in msgs.items():
            self.send(w, m)
        out = {}
        while len(out) < len(msgs):
            w, r = self.got()
            out[w] = r
        return out

    def look(self, tables, value, **m):
        """As Arena.look, but each worker is answered as soon as it asks, and the states of all the
        workers asking at that moment go to value() together. Those batches differ from run to run,
        so a value may differ in its last bits from the one the lockstep rounds of call() would give."""
        who = {}
        for j, i in enumerate(tables):
            w, k = self.where(i)
            who.setdefault(w, []).append((j, k))
        for w, got in who.items():
            self.send(w, {'cmd': 'plan', 'tables': [k for _, k in got], **m})
        scores, left = [None] * len(tables), len(who)
        while left:
            ready = [self.got()]
            while (x := self.got(False)) is not None:
                ready.append(x)
            asking = []
            for w, r in ready:
                if 'ask' in r:
                    asking.append((w, r['ask']))
                    continue
                for (j, _), sc in zip(who[w], r['scores']):
                    scores[j] = sc
                left -= 1
            if asking:
                v, at = value(np.concatenate([a for _, a in asking])), 0
                for w, a in asking:
                    self.send(w, {'cmd': 'values', 'v': v[at:at + len(a)]})
                    at += len(a)
        return scores

    def step(self, actions):
        r = self.each({w: {'cmd': 'step', 'actions': actions[self.at[w]:self.at[w + 1]]} for w in range(len(self.parts))})
        envs = [e for w in range(len(self.parts)) for e in r[w]['envs']]
        ended = {}
        for i, e in enumerate(envs):
            if 'ended' in e:
                w, k = self.where(i)
                ended.setdefault(w, []).append((i, k, self.next))
                self.next += 1
        dealt = self.each({w: {'cmd': 'deal', 'tables': [k for _, k, _ in got], 'seeds': [s for _, _, s in got]} for w, got in ended.items()})
        for w, got in ended.items():
            for (i, _, _), e in zip(got, dealt[w]['envs']):
                envs[i] = {**e, 'ended': envs[i]['ended']}
        self.envs = envs
        return envs

    def close(self):
        # The readers hold this pool; they are woken to end, or its pipes would stay open.
        self.closed = True
        for s in self.asking:
            s.release()
        for a in self.parts:
            a.close()


WORKERS = 1  # node processes the training games and the measuring games are split over, set by --workers
TIMERS = False  # whether the state holds the clocks of rituals and trials (src/selfplay-encode.mjs): --timers, or the network's own
EXTRA = False  # whether it holds the demon hunter's extra cell and the hand's costs as they are now: --extra, three decks or more, dh-cthun, or the network's own
STAGES = False  # whether it holds each egg's breaks remaining: --stages, priest-egg among the decks, or the network's own
MIX = None  # with three decks or more: the weights of the decks after the first as the rival of the first (--mix)
MIRROR = 0.0  # the share of games the first deck plays against itself (--mirror)
SHAPE = None  # the board score's weights of --shape, None without it
MARKS = False  # whether the views say which tables have a step of a card whose effect comes later (--rollout, --kl-weight)
SEATDECKS = False  # whether the views say which deck sits in which seat (--opp)
TIMER_COLS = 33  # the clocks of the state: three blocks of the eleven effects of DELAYED in src/selfplay-encode.mjs
STAGE_COLS = 14  # the egg stages of the state: seven bodies of each chair in src/selfplay-encode.mjs


def make(n, seed, decks, rival=None, swap=False, restart=None, oracle=False):
    """An Arena, or a Pool of --workers of them; oracle=True for the training games of --oracle."""
    return Arena(n, seed, decks, rival, swap=swap, restart=restart, oracle=oracle) if WORKERS <= 1 else Pool(n, seed, decks, rival, WORKERS, swap, restart, oracle)


def card_slots(old_names, new_names):
    """For each slot of the new vocabulary (the names, then 'other') the slot of the old one that is the same card, None for a new card."""
    at = {n: i for i, n in enumerate(old_names)}
    return [at.get(n) for n in new_names] + [len(old_names)]


def state_sources(old, new):
    """For each number of the new state the number of the old one that means the same, None where there was none.

    The state is a head that every vocabulary shares, four blocks with a slot for each card, the clocks
    (--timers), the extra cell (--extra) and the egg stages (--stages), see src/selfplay-encode.mjs;
    old and new are {names, obs, timers, extra, stages} of the two networks."""
    v0, v1 = len(old['names']) + 1, len(new['names']) + 1
    head = old['obs'] - 4 * v0 - TIMER_COLS * old['timers'] - old['extra'] - STAGE_COLS * old['stages']
    if head != new['obs'] - 4 * v1 - TIMER_COLS * new['timers'] - new['extra'] - STAGE_COLS * new['stages']:
        raise SystemExit('the two networks do not see the same head of the state: the layout changed, there is nothing to map by name')
    if (old['timers'] and not new['timers']) or (old['extra'] and not new['extra']) or (old['stages'] and not new['stages']):
        raise SystemExit('the network has clocks, the extra cell or egg stages that the new one would not show: add --timers, --extra or --stages')
    slots = card_slots(old['names'], new['names'])
    src = list(range(head))
    for b in range(4):
        src += [None if s is None else head + b * v0 + s for s in slots]
    if new['timers']:
        src += [head + 4 * v0 + i if old['timers'] else None for i in range(TIMER_COLS)]
    if new['extra']:
        src += [old['obs'] - 1 - STAGE_COLS * old['stages'] if old['extra'] else None]
    if new['stages']:
        at = head + 4 * v0 + TIMER_COLS * old['timers'] + old['extra']
        src += [at + i if old['stages'] else None for i in range(STAGE_COLS)]
    return src


def step_sources(old, new):
    """The same for the numbers of a step: six kinds, the card (a slot each and three numbers), the target (seven numbers and a slot each)."""
    v0, v1 = len(old['names']) + 1, len(new['names']) + 1
    kinds, numbers = 6, 10
    if old['act'] != kinds + 2 * v0 + numbers or new['act'] != kinds + 2 * v1 + numbers:
        raise SystemExit('a step is not the size the vocabulary says: the layout changed, there is nothing to map by name')
    slots = card_slots(old['names'], new['names'])
    src = list(range(kinds))
    src += [None if s is None else kinds + s for s in slots]
    src += [kinds + v0 + i for i in range(3)]
    src += [kinds + v0 + 3 + i for i in range(7)]
    src += [None if s is None else kinds + v0 + numbers + s for s in slots]
    return src


def expand(weight, sources):
    """The columns of an input layer's weight moved to where `sources` says they now stand, zeros for the new ones."""
    out = weight.new_zeros(weight.shape[0], len(sources))
    for j, s in enumerate(sources):
        if s is not None:
            out[:, j] = weight[:, s]
    return out


def resume_state(sd, old, new):
    """A state dict of a network of the vocabulary `old` as one of `new`: the input layers by card name."""
    sd = dict(sd)
    sd['body.0.weight'] = expand(sd['body.0.weight'], state_sources(old, new))
    sd['step.0.weight'] = expand(sd['step.0.weight'], step_sources(old, new))
    return sd


class Net(nn.Module):
    def __init__(self, obs, act, width=256, oracle=0):
        super().__init__()
        self.oracle = oracle  # --oracle: the length of the hidden cards its second value head reads beside the body, 0 for none
        self.body = nn.Sequential(nn.Linear(obs, width), nn.ReLU(), nn.Linear(width, width), nn.ReLU())
        self.step = nn.Sequential(nn.Linear(act, width), nn.ReLU())
        self.score = nn.Sequential(nn.Linear(2 * width, width), nn.ReLU(), nn.Linear(width, 1))
        self.value = nn.Sequential(nn.Linear(width, width), nn.ReLU(), nn.Linear(width, 1))
        if oracle:
            self.oracle_value = nn.Sequential(nn.Linear(width + oracle, width), nn.ReLU(), nn.Linear(width, 1))

    def critic(self, obs, orc):
        """The value of the --oracle head: the body of the visible state beside the hidden cards."""
        return self.oracle_value(torch.cat([self.body(obs.to(DEVICE)), orc.to(DEVICE)], -1)).squeeze(-1)

    def forward(self, obs, acts, mask):
        obs, acts, mask = obs.to(DEVICE), acts.to(DEVICE), mask.to(DEVICE)
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
    """Greedy steps of the network at the tables idx; with look=(samples, width, prior[, ahead]) after a look ahead."""
    if not idx:
        return []
    logits, _ = net(torch.stack([obs[i] for i in idx]), *padded([acts[i] for i in idx]))
    if not look:
        return logits.argmax(-1).tolist()
    scores = look_ahead(net, arena, idx, look[0], look[1], *look[3:])
    # Each step's score, plus `prior` times the log of the policy's own probability for it: at the
    # least this settles the steps the look ahead cannot tell apart.
    prior = torch.log_softmax(logits, -1).clamp(min=-10)
    return [max(range(len(sc)), key=lambda k: sc[k] + look[2] * prior[j, k].item()) for j, sc in enumerate(scores)]


@torch.no_grad()
def ahead(args):
    """The options of a look ahead past the end of the turn that --depth and its flags ask for ({} for none)."""
    if args.depth < 2:
        return {}
    return {'turns': args.depth, 'expand': args.expand, 'replies': args.replies, 'reply': args.reply}


@torch.no_grad()
def look_ahead(net, arena, idx, samples, width, ahead=None):
    """The look ahead of src/selfplay-search.mjs at the tables idx -> a score for each legal step of each.

    ahead: the options of a look ahead past the end of the turn ({} for none), see --depth."""
    def value(x):
        return net.value(net.body(torch.as_tensor(x, dtype=torch.float32).to(DEVICE))).squeeze(-1).cpu().numpy()
    return arena.look(idx, value, samples=samples, width=width, **(ahead or {}))


@torch.no_grad()
def rollout(net, arena, table, steps, games, seed=1):
    """Greedy play of the network in both seats from each of these steps of one table -> [wins, draws, losses] a step."""
    r = arena.call(cmd='fork', table=table, steps=steps, games=games, seed=seed)
    while r['envs']:
        r = arena.call(cmd='side', actions=think(net, arena, list(range(len(r['envs']))), *tensors(r['envs'])))
    return r['tally']


def blob(b):
    """A float32 block of a "bin" reply, raw bytes or base64, as a writable numpy array."""
    return np.frombuffer(bytearray(b if isinstance(b, bytes) else base64.b64decode(b)), np.float32)


def unpack(r, obs, act, oracle=0):
    """The float32 blocks of a "bin" reply (src/selfplay-env.mjs) back into each view's obs and acts (and orc, with --oracle), as numpy arrays."""
    if 'orcBin' in r:
        for e, x in zip(r['envs'], blob(r.pop('orcBin')).reshape(len(r['envs']), oracle)):
            e['orc'] = x
    o = blob(r.pop('obsBin')).reshape(len(r['envs']), obs)
    a = blob(r.pop('actsBin')).reshape(-1, act)
    at = 0
    for e, x in zip(r['envs'], o):
        e['obs'], e['acts'] = x, a[at:at + e['steps']]
        at += e['steps']


def tensors(envs):
    f = torch.float32
    return [torch.as_tensor(e['obs'], dtype=f) for e in envs], [torch.as_tensor(e['acts'], dtype=f) for e in envs]


def evaluate(net, decks, games, seed=900_000_000, n=64, rival='random', look=None, pairs=None):
    """Greedy play against a rival inside the simulator; the seats alternate. -> (wins, draws, losses).

    Every table plays the same number of games: taking the first to finish would count the short ones.
    A dict as `pairs` gets, for each (deck of the network, deck of the rival), its [wins, draws, losses].
    """
    n = min(n, games)
    arena = make(n, seed, decks, rival)
    left = [games // n + (i < games % n) for i in range(n)]
    tally = {1: 0, 0: 0, -1: 0}
    while any(left):
        a = think(net, arena, list(range(n)), *tensors(arena.envs), look)
        for i, e in enumerate(arena.step(a)):
            if 'ended' in e and left[i]:
                left[i] -= 1
                tally[e['ended']['result']] += 1
                if pairs is not None:
                    seats = e['ended']['decks']
                    row = pairs.setdefault((seats[e['ended']['mine']], seats[1 - e['ended']['mine']]), [0, 0, 0])
                    row[1 - e['ended']['result']] += 1  # result 1 -> wins, 0 -> draws, -1 -> losses
    arena.close()
    return tally[1], tally[0], tally[-1]


def pairing_lines(decks, pairs):
    """One line for each (the network's deck, the rival's deck) of evaluate's `pairs`."""
    lines = []
    for (a, b), (w, d, l) in sorted(pairs.items()):
        lines.append(f'    {decks[a]} against {decks[b]}: {w}W {d}D {l}L, {w / (w + d + l):.1%}')
    return lines


def load(path):
    """A saved network; the games it is then measured in are encoded as it was trained, with or without the clocks and the extra cell."""
    global TIMERS, EXTRA, STAGES, MIX, MIRROR
    ck = torch.load(path, weights_only=True, map_location='cpu')
    TIMERS = bool(ck.get('timers', False))
    EXTRA = bool(ck.get('extra', False))
    STAGES = bool(ck.get('stages', False))
    MIX = ck.get('mix')
    MIRROR = ck.get('mirror', 0.0)
    net = Net(ck['obs'], ck['act'], ck['width'], ck.get('oracle', 0))
    net.load_state_dict(ck['net'])
    return net.to(DEVICE).eval(), ck


def plain(sd):
    """A state dict without the --oracle head, for a network that has none."""
    return {k: v for k, v in sd.items() if not k.startswith('oracle_value.')}


def duel(a, b, decks, games, seed=800_000_000, n=64, look=None):
    """Greedy play of network a against network b; the seats alternate. -> (wins, draws, losses) of a.

    look=(samples, width, prior) lets a, and only a, look ahead.
    """
    n = min(n, games)
    arena = make(n, seed, decks)
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
    obs = torch.stack(seen).to(DEVICE)
    value = lambda x: net.value(net.body(x)).squeeze(-1)
    base, rows = value(obs), []
    for d in (1, 3, 6):
        for what, (x, ok) in zip(('our hero healthier', 'their hero weaker'), shifted(obs, torch.full((len(obs),), d / 10, device=DEVICE))):
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
            for j, (i, sc) in enumerate(zip(idx, look_ahead(net, arena, idx, args.search or 2, args.beam, ahead(args)))):
                target = torch.softmax(prior[j, :len(sc)] + torch.tensor(sc, device=DEVICE) / args.tau, 0)
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
    obs = torch.stack([d[0] for d in data]).to(DEVICE)
    z = torch.tensor([d[3] for d in data], device=DEVICE)
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
            for x, ok in shifted(obs[idx], torch.randint(1, 7, (len(rows),)).to(DEVICE) / 10):
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
    sparring = state.get('opp')  # --opp: {deck: Opp} for the decks after the first, None without it
    if 'roll' in state:
        state['rolled'] = 0
    state['restarts'] = 0
    while len(done) < args.batch:
        envs = arena.envs
        obs, acts = tensors(envs)
        actions = [0] * len(envs)
        frozen = {}
        for i, e in enumerate(envs):
            if rivals[i] and rivals[i][0] == e['seat']:
                frozen.setdefault(rivals[i][1], []).append(i)
        if sparring:
            spars = {i: state['names'][e['decks'][e['seat']]] for i, e in enumerate(envs) if e['decks'][e['seat']]}
            mine = [i for i, e in enumerate(envs) if i not in spars and not (rivals[i] and rivals[i][0] == e['seat'])]
        else:
            mine = [i for i, e in enumerate(envs) if not (rivals[i] and rivals[i][0] == e['seat'])]
        if mine:
            a, logp, value = choose(net, [obs[i] for i in mine], [acts[i] for i in mine])
            if net.oracle:  # --oracle: the advantages are measured by the head that sees the hidden cards
                orcs = [torch.as_tensor(envs[i]['orc'], dtype=torch.float32) for i in mine]
                with torch.no_grad():
                    value = net.critic(torch.stack([obs[i] for i in mine]), torch.stack(orcs)).tolist()
            targets = taught(net, arena, [i for i in mine if len(acts[i]) > 1 and state['ask'].random() < args.distill_frac], obs, acts, args) if 'ask' in state else {}
            if 'roll' in state:
                targets = queue_rollouts(net, arena, mine, envs, obs, acts, state, args)
            for j, i in enumerate(mine):
                actions[i] = a[j]
                live[i][envs[i]['seat']].append((obs[i], acts[i], a[j], logp[j], value[j], envs[i].get('phi'), envs[i].get('turn'), targets.get(i), bool(envs[i].get('late')))
                                                + ((orcs[j],) if net.oracle else ()))
        for k, idx in frozen.items():
            a, _, _ = choose(pool[k], [obs[i] for i in idx], [acts[i] for i in idx])
            for j, i in enumerate(idx):
                actions[i] = a[j]
        if sparring:
            by = {}
            for i, name in spars.items():
                if state['ochoice'][i] is None:
                    state['ochoice'][i] = sparring[name].pick(state['orng'])
                by.setdefault((name, id(state['ochoice'][i])), (state['ochoice'][i], []))[1].append(i)
            for net_k, idx in by.values():
                a, bp, value = opp_choose(net_k, [obs[i] for i in idx], [acts[i] for i in idx], args, state)
                for j, i in enumerate(idx):
                    actions[i] = a[j]
                    state['olive'][i].append((obs[i], acts[i], a[j], bp[j], value[j]))
        for i, e in enumerate(arena.step(actions)):
            if 'ended' not in e:
                continue
            w = e['ended']['winner']
            if sparring:
                seat = 0 if e['ended']['decks'][0] else 1
                if e['ended']['decks'][seat]:
                    sparring[state['names'][e['ended']['decks'][seat]]].data += opp_rows(state['olive'][i], 0.0 if w == 'draw' else 1.0 if w == seat else -1.0, args)
                state['olive'][i], state['ochoice'][i] = [], None
            games += 1
            state['restarts'] += bool(e['ended'].get('restart'))
            turns += e['ended']['turns']
            for seat in (0, 1):
                seq, r, adv, nxt = live[i][seat], 0.0 if w == 'draw' else 1.0 if w == seat else -1.0, 0.0, 0.0
                shaped = shaping(seq, args.shape_scale, args.shape_gamma) if SHAPE else None
                for t in range(len(seq) - 1, -1, -1):
                    o, ac, a, logp, v = seq[t][:5]
                    rew = r if t == len(seq) - 1 else 0.0
                    if shaped:
                        rew += shaped[t]
                    delta = rew + args.gamma * nxt - v
                    adv = delta + args.gamma * args.lam * adv
                    nxt = v
                    done.append((o, ac, a, logp, adv, adv + v, seq[t][7], seq[t][8]) + seq[t][9:10])
            live[i] = ([], [])
            if sparring and e['decks'][0] != e['decks'][1]:
                rivals[i] = None  # a frozen rival is for the mirror games only
            else:
                rivals[i] = (random.randrange(2), random.randrange(len(pool))) if pool and random.random() < args.rival else None
    if 'roll' in state:
        if state['pending']:
            drain(arena, state, args)
        done = [d[:6] + (d[6].t if isinstance(d[6], Pending) else d[6],) + d[7:] for d in done]
    return done, games, turns


class Opp:
    """--opp: the sparring partner that plays one of the decks after the first.

    net is the one that learns (with opt, when --opp-lr is above zero), behave the copy that plays,
    pool the earlier copies of it, data the opponent seat's finished decisions of this iteration."""

    def __init__(self, name, net, lr):
        self.name, self.net, self.pool, self.data = name, net, [], []
        self.behave = copy.deepcopy(net).eval()
        self.opt = torch.optim.Adam(net.parameters(), lr=lr) if lr > 0 else None

    def pick(self, rng):
        """The network that plays a game: uniformly the pool and the present copy."""
        return rng.choice(self.pool + [self.behave])

    def refresh(self, keep):
        """The copy that plays is the learning network again; the one it replaces goes to the pool."""
        self.pool = (self.pool + [self.behave])[-keep:] if keep else []
        self.behave = copy.deepcopy(self.net).eval()


@torch.no_grad()
def opp_choose(net, obs, acts, args, state):
    """One forward pass for an opponent's decisions -> (steps, the probability the behavior gave each, values).

    The step is sampled from softmax(logits / --opp-temp); with chance --opp-eps, where there is more than
    one legal step, it is the one with the second highest logit instead. The probability is that of the
    mixture, (1 - eps) * softmax[a] + eps * [a is second best], and 1 for a lone step."""
    logits, value = net(torch.stack(obs), *padded(acts))
    probs = torch.softmax(logits / args.opp_temp, -1).float().cpu()
    pick = torch.multinomial(probs, 1, generator=state['ogen']).squeeze(-1).tolist()
    second = logits.topk(min(2, logits.shape[1]), -1).indices[:, -1].tolist()
    out, bp = [], []
    for j, a in enumerate(pick):
        if len(acts[j]) < 2:
            out.append(a)
            bp.append(1.0)
            continue
        if state['orng'].random() < args.opp_eps:
            a = second[j]
        out.append(a)
        bp.append((1 - args.opp_eps) * probs[j, a].item() + args.opp_eps * (a == second[j]))
    return out, bp, value.tolist()


def remapped(sd, c, arena):
    """The weights sd of the saved network c as one of this run's vocabulary (by card name, see resume_state)."""
    old = {'names': c['names'], 'obs': c['obs'], 'act': c['act'], 'timers': bool(c.get('timers', False)), 'extra': bool(c.get('extra', False)), 'stages': bool(c.get('stages', False))}
    new = {'names': arena.names, 'obs': arena.obs, 'act': arena.act, 'timers': TIMERS, 'extra': EXTRA, 'stages': STAGES}
    return sd if old == new else resume_state(sd, old, new)


def opp_learn(sparring, args):
    """Plain PPO for each opponent that has an optimizer, on its seat's decisions of this iteration; the data is then dropped.
    -> (decisions, policy loss, value loss), the losses means over the decisions of all the decks."""
    n, pl, vl = 0, 0.0, 0.0
    for o in sparring.values():
        k = len(o.data)
        if k and o.opt:
            stats = update(o.net, o.opt, o.data, args)
            pl, vl = pl + stats[0] * k, vl + stats[1] * k
        n += k
        o.data = []
    return n, pl / n if n else 0.0, vl / n if n else 0.0


def opp_rows(seq, r, args):
    """An opponent seat's finished game as rows for update(): GAE from the result r alone."""
    rows, adv, nxt = [], 0.0, 0.0
    for t in range(len(seq) - 1, -1, -1):
        o, ac, a, logp, v = seq[t]
        adv = (r if t == len(seq) - 1 else 0.0) + args.gamma * nxt - v + args.gamma * args.lam * adv
        nxt = v
        rows.append((o, ac, a, logp, adv, adv + v, None))
    return rows


class Pending:
    """A --rollout target still being played out: t is set by drain()."""
    __slots__ = ('t', 'prior', 'steps')

    def __init__(self, prior, steps):
        self.t, self.prior, self.steps = None, prior, steps


MARGIN_P = 0.25  # --rollout: chance that a decision with its two likeliest steps within --rollout-margin is rolled out


def parts_call(arena, msgs):
    """One message to each node process of the arena -> their replies in order."""
    if isinstance(arena, Pool):
        r = arena.each(dict(enumerate(msgs)))
        return [r[w] for w in range(len(msgs))]
    return [arena.call(**msgs[0])]


def seed_restarts(arena, args):
    """--restart-frac: fill the pool of start positions in each node process from greedy games of --restart-net -> how many."""
    n = len(arena.parts) if isinstance(arena, Pool) else 1
    each = -(-args.restart_seed // n)
    return sum(r['seeded'] for r in parts_call(arena, [{'cmd': 'seedpool', 'net': args.restart_net, 'limit': each, 'seed': args.seed * 1_000 + 100_000 * w} for w in range(n)]))


@torch.no_grad()
def queue_rollouts(net, arena, idx, envs, obs, acts, state, args):
    """--rollout: choose among the learner's tables idx the decisions to roll out and hand them to the
    simulator -> {table: Pending}."""
    cap, rng = int(args.rollout_frac * args.batch), state['roll']
    cand = [i for i in idx if len(acts[i]) > 1]
    if not cand or state['rolled'] >= cap:
        return {}
    logits, _ = net(torch.stack([obs[i] for i in cand]), *padded([acts[i] for i in cand]))
    probs = torch.softmax(logits, -1).cpu()
    out, forks = {}, {}
    for j, i in enumerate(cand):
        p = probs[j, :len(acts[i])]
        top = torch.topk(p, min(args.rollout_k, len(p)))
        close = float(top.values[0] - top.values[1]) < args.rollout_margin
        if not (envs[i].get('late') or close and rng.random() < MARGIN_P) or state['rolled'] >= cap:
            continue
        state['rolled'] += 1
        taught.counts[0] += 1
        h = out[i] = Pending(p, top.indices.tolist())
        rid = state['next_id'] = state['next_id'] + 1
        state['pending'][rid] = h
        w, k = arena.where(i) if isinstance(arena, Pool) else (0, i)
        forks.setdefault(w, []).append({'id': rid, 'table': k, 'steps': h.steps, 'seed': rng.randrange(1 << 30)})
    if forks:
        n = len(arena.parts) if isinstance(arena, Pool) else 1
        parts_call(arena, [{'cmd': 'roll', 'forks': forks.get(w, []), 'games': args.rollout_n, 'follow': args.rollout_follow} for w in range(n)])
    return out


def rollout_steps(logits, since, args, gen):
    """The frozen network's steps in the rollout copies: greedy, or at the falling temperature of --rollout-temp-decay."""
    if args.rollout_temp_decay is None:
        return logits.argmax(-1).tolist()
    lg, out = logits.float().cpu(), []
    for j, s in enumerate(since):
        temp = args.rollout_temp * args.rollout_temp_decay ** s
        out.append(int(lg[j].argmax()) if temp < 0.05 else int(torch.multinomial(torch.softmax(lg[j] / temp, -1), 1, generator=gen)))
    return out


def rollout_target(prior, steps, win, tau):
    """The --rollout target: the prior kept off the branched steps, their mass shared by p * exp((2 win - 1) / tau)."""
    t = prior.clone()
    k = torch.tensor(steps)
    w = prior[k] * torch.exp((2 * torch.tensor(win, dtype=prior.dtype) - 1) / tau)
    t[k] = prior[k].sum() * w / w.sum()
    return t


@torch.no_grad()
def drain(arena, state, args):
    """Play every queued rollout to its end with the frozen network and set the targets of their Pending."""
    n = len(arena.parts) if isinstance(arena, Pool) else 1
    actions = [[] for _ in range(n)]
    while True:
        rs = parts_call(arena, [{'cmd': 'rstep', 'actions': a} for a in actions])
        for r in rs:
            for d in r['done']:
                h = state['pending'].pop(d['id'])
                h.t = rollout_target(h.prior, h.steps, d['win'], args.rollout_tau).to(DEVICE)
        envs = [r['envs'] for r in rs]
        flat = [e for es in envs for e in es]
        if not flat:
            break
        picks = []
        for at in range(0, len(flat), 4096):
            chunk = flat[at:at + 4096]
            o, a = tensors(chunk)
            logits, _ = state['roller'](torch.stack(o), *padded(a))
            picks += rollout_steps(logits, [e['since'] for e in chunk], args, state['roll_gen'])
        actions, at = [], 0
        for es in envs:
            actions.append(picks[at:at + len(es)])
            at += len(es)
    if state['pending']:
        raise RuntimeError(f'{len(state["pending"])} rollouts never finished')


@torch.no_grad()
def taught(net, arena, idx, obs, acts, args):
    """--distill-weight: the target of --distill at the tables idx -> {table: probabilities over its steps}."""
    taught.counts[0] += len(idx)
    if not idx:
        return {}
    logits, _ = net(torch.stack([obs[i] for i in idx]), *padded([acts[i] for i in idx]))
    prior = torch.log_softmax(logits, -1).clamp(min=-10)
    scores = look_ahead(net, arena, idx, args.search or 2, args.beam, ahead(args))
    return {i: torch.softmax(prior[j, :len(sc)] + torch.tensor(sc, device=DEVICE) / args.tau, 0) for j, (i, sc) in enumerate(zip(idx, scores))}


taught.counts = [0]  # decisions looked ahead at since main last set it to zero


def imitation(logp, targets):
    """Cross entropy of the step scorer's log probabilities (a padded batch) against the targets of the
    rows that have one (None for the others) -> (mean over those rows, how many there were)."""
    rows = [j for j, t in enumerate(targets) if t is not None]
    if not rows:
        return None, 0
    target = torch.zeros(len(rows), logp.shape[1], device=logp.device)
    for k, j in enumerate(rows):
        target[k, :len(targets[j])] = targets[j]
    return -(target * logp[rows].clamp(min=-30)).sum(-1).mean(), len(rows)


def anchor(args, it, first):
    """λ of --distill-weight at iteration it of a run that began after iteration first, None without it."""
    if args.distill_weight is None:
        return None
    if args.distill_decay_to is None or args.iters < 2:
        return args.distill_weight
    return args.distill_weight + (args.distill_decay_to - args.distill_weight) * (it - first - 1) / (args.iters - 1)


def shaping(seq, scale, gamma):
    """The reward --shape adds to each decision of one seat's game, seq of (..., phi, turn): at the last
    decision of each turn, scale * (gamma * Φ there - Φ at the last decision of the turn before), with
    Φ at the seat's first decision before its first turn and Φ = 0 where the game ends."""
    out, before = [0.0] * len(seq), seq[0][5] if seq else 0.0
    for t in range(len(seq)):
        if t == len(seq) - 1:
            out[t] = scale * (gamma * 0.0 - before)
        elif seq[t + 1][6] != seq[t][6]:
            out[t] = scale * (gamma * seq[t][5] - before)
            before = seq[t][5]
    return out


class Teacher:
    """--teacher: the labelled positions as tensors, split into trained and held-out rows."""

    def __init__(self, path, obs, act, holdout=5, batch=64, seed=1):
        rows = [json.loads(line) for line in open(path, encoding='utf8') if line.strip()]
        if not rows:
            raise SystemExit(f'--teacher {path} has no rows')
        f = torch.float32
        self.obs, self.acts, self.pick, self.start, self.sig, self.name = [], [], [], [], [], []
        for r in rows:
            if len(r['obs']) != obs or any(len(a) != act for a in r['acts']) or len(r['acts']) != len(r['legal']):
                raise SystemExit(f'--teacher {path}: row {r.get("kind")} {r.get("game")} {r.get("n")} is not encoded as this run (state {obs}, step {act})')
            self.obs.append(torch.tensor(r['obs'], dtype=f))
            self.acts.append(torch.tensor(r['acts'], dtype=f))
            names = r['legal']
            self.pick.append(torch.tensor([n == names[r['pick']] for n in names]))
            self.start.append(torch.tensor([n == names[r['v5pick']] for n in names]))
            self.sig.append(bool(r['sig']))
            ids = {}
            self.name.append(torch.tensor([ids.setdefault(n, len(ids)) for n in names]))  # one id per step name
        test = [r['game'] % holdout == 0 for r in rows] if holdout else [False] * len(rows)
        self.train = [i for i, t in enumerate(test) if not t]
        self.test = [i for i, t in enumerate(test) if t]
        self.batch, self.rng = batch, random.Random(seed * 7919 + 4)  # a stream of its own: the other draws do not move

    def draw(self):
        return self.rng.sample(self.train, min(self.batch, len(self.train)))

    def logits(self, net, idx):
        pad = padded([self.acts[i] for i in idx])
        logits, _ = net(torch.stack([self.obs[i] for i in idx]), *pad)
        return logits

    def loss(self, net, idx):
        """Mean over the rows idx of -log P(a step with the pick's name)."""
        logp = torch.log_softmax(self.logits(net, idx), -1)
        group = pad_sequence([self.pick[i] for i in idx], batch_first=True).to(logp.device)
        return -torch.logsumexp(logp.masked_fill(~group, -1e9), -1).mean()

    @torch.no_grad()
    def takes(self, net, idx, which):
        """Share of the rows idx whose most probable step name (the probabilities of steps of one name summed, as the
        labels chose the start's step) is the name of which ('pick' or 'start'), None with no rows."""
        if not idx:
            return None
        got = 0
        for at in range(0, len(idx), 512):
            part = idx[at:at + 512]
            probs = torch.softmax(self.logits(net, part), -1).cpu()
            for i, pr in zip(part, probs):
                g = self.name[i]
                best = int(torch.zeros(int(g.max()) + 1).scatter_add_(0, g, pr[:len(g)]).argmax())
                got += bool(getattr(self, which)[i][int((g == best).nonzero()[0, 0])])
        return got / len(idx)

    def measure(self, net):
        """(trained rows with sig taking the pick, held-out ones, held-out rows without sig keeping the start's step)."""
        return (self.takes(net, [i for i in self.train if self.sig[i]], 'pick'), self.takes(net, [i for i in self.test if self.sig[i]], 'pick'),
                self.takes(net, [i for i in self.test if not self.sig[i]], 'start'))


def kl_to_ref(logits, ref_logits, keep):
    """KL(pi_ref || pi) of two padded batches of step logits, the mean over the rows in keep (0 with none); the padding adds nothing."""
    if not keep.any():
        return logits.sum() * 0.0
    logp = torch.log_softmax(logits, -1).clamp(min=-30)
    refp = torch.log_softmax(ref_logits, -1).clamp(min=-30)
    return (refp.exp() * (refp - logp)).sum(-1)[keep].mean()


def update(net, opt, data, args, weight=None, ref=None, beta=0.0, teacher=None):
    """PPO epochs over the decisions; with weight (λ of --distill-weight) also the imitation of their targets, with ref
    (--kl-ref) also beta times its KL to pi_ref on the decisions of more than one step that are not marked late (row[7]), and
    with the hidden cards in row[8] (--oracle) also the loss of the oracle value head towards the same returns.
    -> [policy loss, value loss, entropy, imitation loss (0 without weight), KL (0 without ref), oracle value loss (0 without)],
    each a mean over the minibatches; with teacher (--teacher) also args.teacher_weight times its cross entropy on
    rows it draws, and its mean loss as a seventh item."""
    obs = torch.stack([d[0] for d in data]).to(DEVICE)
    acts = [d[1] for d in data]
    a, logp0, adv, ret = (torch.tensor([d[k] for d in data], device=DEVICE) for k in (2, 3, 4, 5))
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
    stats = torch.zeros(3)
    keep = torch.tensor([len(d[1]) > 1 and not d[7] for d in data], device=DEVICE) if ref is not None else None
    orc = torch.stack([d[8] for d in data]).to(DEVICE) if getattr(net, 'oracle', 0) and len(data[0]) > 8 else None
    n, imitated, taught_n, kl_sum, oracle_sum, teacher_sum = 0, 0.0, 0, 0.0, 0.0, 0.0
    for _ in range(args.epochs):
        order = torch.randperm(len(data))
        for at in range(0, len(data), args.minibatch):
            idx = order[at:at + args.minibatch]
            pad = padded([acts[i] for i in idx.tolist()])
            logits, value = net(obs[idx], *pad)
            dist = Categorical(logits=logits)
            ratio = (dist.log_prob(a[idx]) - logp0[idx]).exp()
            policy = -torch.min(ratio * adv[idx], ratio.clamp(1 - args.clip, 1 + args.clip) * adv[idx]).mean()
            critic = (ret[idx] - value).pow(2).mean()
            entropy = dist.entropy().mean()
            loss = policy + args.vf * critic - args.ent * entropy
            if orc is not None:
                oracle_loss = (ret[idx] - net.critic(obs[idx], orc[idx])).pow(2).mean()
                loss = loss + args.vf * oracle_loss
                oracle_sum += oracle_loss.item()
            if weight is not None:
                imit, _ = imitation(torch.log_softmax(logits, -1), [data[i][6] for i in idx.tolist()])
                if imit is not None:
                    loss = loss + weight * imit
                    imitated += imit.item()
                    taught_n += 1
            if ref is not None:
                with torch.no_grad():
                    ref_logits, _ = ref(obs[idx], *pad)
                kl = kl_to_ref(logits, ref_logits, keep[idx])
                loss = loss + beta * kl
                kl_sum += kl.item()
            if teacher is not None:
                tl = teacher.loss(net, teacher.draw())
                loss = loss + args.teacher_weight * tl
                teacher_sum += tl.item()
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 0.5)
            opt.step()
            stats += torch.tensor([policy.item(), critic.item(), entropy.item()])
            n += 1
    return (stats / n).tolist() + [imitated / taught_n if taught_n else 0.0, kl_sum / n, oracle_sum / n] + ([teacher_sum / n] if teacher is not None else [])


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--decks', nargs='+', default=['warlock-discard', 'warlock-discard'], help='two decks, or more: the first against each of the others, see above')
    p.add_argument('--mix', type=float, nargs='+', default=None, help='with three decks or more: how often each deck after the first is the rival, default alike in turn')
    p.add_argument('--mirror', type=float, default=0.0, help='the share of the training games that the first deck plays against itself')
    p.add_argument('--extra', action='store_true', help="show the network the demon hunter's extra cell (on its own with three decks or more, or dh-cthun among them)")
    p.add_argument('--stages', action='store_true', help="show the network each egg's breaks remaining (on its own with priest-egg among the decks)")
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
    p.add_argument('--timers', action='store_true', help='show the network the clocks of rituals and trials; with --resume from a network without them, its first layer is widened with zeros')
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
    p.add_argument('--depth', type=int, default=1, choices=(1, 2), help="turns a look ahead covers: 2 plays on through the other side's next turn, by --reply")
    p.add_argument('--expand', type=int, default=4, help='with --depth 2: first steps of each deal looked at past the turn, the best of one turn')
    p.add_argument('--replies', type=int, default=2, help="with --depth 2: the other side's best first steps followed, greedy after them")
    p.add_argument('--reply', default='models/selfplay/warlock-zoo-v2.json', help="with --depth 2: the exported network (train/export.py) that plays the other side's turn")
    p.add_argument('--keep-every', type=int, default=10, help='iterations between the numbered copies under <run>/ckpt')
    p.add_argument('--lag', type=int, default=50, help='also measure against the copy this many iterations back')
    p.add_argument('--workers', type=int, default=1, help='node processes to split the games over, in training and in --eval (not --audit, --probe or --compare)')
    p.add_argument('--swap', action='store_true', help='in the training games, give the second deck the first seat in half of them (odd seeds)')
    p.add_argument('--device', choices=('auto', 'cpu', 'cuda'), default='auto', help='where the networks run; auto takes CUDA when there is one')
    p.add_argument('--shape', default=None, help='PPO: add the potential-based reward of the board score with the weights of this file (train/fit_score.py), see above')
    p.add_argument('--shape-scale', type=float, default=0.5, help='with --shape: the factor on Φ (0.5 turns a logit near even into the units of the result)')
    p.add_argument('--shape-gamma', type=float, default=1.0, help="with --shape: the discount of the next turn's Φ")
    p.add_argument('--distill-weight', type=float, default=None, help='PPO: add this weight (λ) times the imitation of the look ahead of --distill, see above')
    p.add_argument('--distill-decay-to', type=float, default=None, help='with --distill-weight: move λ in a straight line to this over the run')
    p.add_argument('--distill-frac', type=float, default=0.25, help="with --distill-weight: share of the learner's decisions (of more than one step) looked ahead at")
    p.add_argument('--opp', nargs='+', default=None, help='cheap opponents: DECK=policy.pt for the decks after the first (a bare DECK starts as a copy of the learner), see above')
    p.add_argument('--opp-temp', type=float, default=1.0, help='with --opp: the opponents sample from softmax(logits / this)')
    p.add_argument('--opp-eps', type=float, default=0.1, help='with --opp: chance that an opponent takes its second best step')
    p.add_argument('--opp-lr', type=float, default=0.0, help='with --opp: learning rate of the opponents, 0 keeps them as they are')
    p.add_argument('--opp-refresh', type=int, default=5, help='with --opp-lr: iterations between syncing the playing copy of each opponent from its learning network')
    p.add_argument('--opp-pool', type=int, default=4, help='with --opp-lr: earlier playing copies of each opponent that games are also drawn from')
    p.add_argument('--restart-frac', type=float, default=0.0, help='PPO: this share of the games begins at a hard position of the pool instead of a new deal, see above')
    p.add_argument('--restart-pool', type=int, default=5000, help='with --restart-frac: positions of the ring the training games fill')
    p.add_argument('--restart-seed', type=int, default=2000, help='with --restart-frac: positions the pool starts with, from greedy games of --restart-net')
    p.add_argument('--restart-net', default='models/selfplay/warlock-zoo-v5.json', help='with --restart-frac: the exported network (train/export.py) that plays those games')
    p.add_argument('--kl-ref', default=None, help='PPO: the frozen policy.pt that the KL term keeps the network near, default the network the run resumes from')
    p.add_argument('--kl-weight', type=float, default=None, help='PPO: weight of the KL to the reference on the decisions that are not about delayed effects (0.05 if only --kl-ref is given)')
    p.add_argument('--teacher', default=None, help='PPO: a rollout-teacher.jsonl whose picks are taught by cross entropy beside PPO, see above')
    p.add_argument('--teacher-weight', type=float, default=0.1, help='with --teacher: the weight (α) of its cross entropy')
    p.add_argument('--teacher-batch', type=int, default=64, help='with --teacher: rows drawn for each PPO minibatch')
    p.add_argument('--teacher-holdout', type=int, default=5, help='with --teacher: rows of games with game %% this == 0 are held out (0 for none)')
    p.add_argument('--oracle', action='store_true', help='PPO: a second value head that also sees the hidden cards measures the advantages, see above')
    p.add_argument('--rollout', action='store_true', help='with --distill-weight: targets from games played to the end instead of the look ahead, see above')
    p.add_argument('--rollout-k', type=int, default=3, help='with --rollout: the likeliest steps played on')
    p.add_argument('--rollout-n', type=int, default=16, help='with --rollout: deals of the hidden cards for each step (the same for every step)')
    p.add_argument('--rollout-net', default=None, help='with --rollout: the frozen policy.pt that plays the copies, default the network the run began as')
    p.add_argument('--rollout-margin', type=float, default=0.3, help='with --rollout: two likeliest steps closer than this in probability make a decision a candidate')
    p.add_argument('--rollout-frac', type=float, default=0.01, help='with --rollout: at most this share of the batch is rolled out an iteration')
    p.add_argument('--rollout-follow', type=int, default=27, help='with --rollout: lines a step and deal for the follow-up picks of the same card')
    p.add_argument('--rollout-tau', type=float, default=0.25, help='with --rollout: the difference in 2 * win share that multiplies a step probability by e')
    p.add_argument('--rollout-temp', type=float, default=1.0, help='with --rollout-temp-decay: the temperature at the branch')
    p.add_argument('--rollout-temp-decay', type=float, default=None, help='with --rollout: play the copies at --rollout-temp * this^(steps since the branch) instead of greedily')
    args = p.parse_args()
    global DEVICE, WORKERS, TIMERS, EXTRA, STAGES, MIX, MIRROR, SHAPE, MARKS, SEATDECKS
    if len(args.decks) < 2:
        raise SystemExit('--decks needs two decks or more')
    if args.mix is not None and len(args.mix) != len(args.decks) - 1:
        raise SystemExit(f'--mix needs a weight for each of the {len(args.decks) - 1} decks after the first')
    WORKERS = args.workers
    TIMERS = args.timers
    EXTRA = args.extra or len(args.decks) >= 3 or 'dh-cthun' in args.decks
    STAGES = args.stages or 'priest-egg' in args.decks
    MIX = args.mix
    MIRROR = args.mirror
    if args.shape:
        if args.distill:
            raise SystemExit('--shape is a reward of PPO; --distill has none')
        SHAPE = json.loads(Path(args.shape).read_text(encoding='utf8'))['weights']
    if args.distill_weight is not None and args.distill:
        raise SystemExit('--distill-weight mixes the look ahead into PPO; --distill is the look ahead alone')
    if args.distill_weight is None and args.distill_decay_to is not None:
        raise SystemExit('--distill-decay-to needs --distill-weight')
    if args.rollout and args.distill_weight is None:
        raise SystemExit('--rollout gives --distill-weight its targets; it needs --distill-weight')
    kl_on = args.kl_weight is not None or args.kl_ref is not None
    if (args.restart_frac or kl_on) and args.distill:
        raise SystemExit('--restart-frac and --kl-weight are for the PPO training; --distill has neither')
    if args.teacher and args.distill:
        raise SystemExit('--teacher is for the PPO training; --distill has its own targets')
    if args.oracle and args.distill:
        raise SystemExit('--oracle is for the PPO training; --distill learns no advantages')
    if not 0.0 <= args.restart_frac <= 1.0:
        raise SystemExit('--restart-frac is a share between 0 and 1')
    if kl_on and not args.kl_ref and not args.resume:
        raise SystemExit('--kl-weight keeps the network near the one it resumes from; it needs --resume or --kl-ref')
    MARKS = args.rollout or kl_on
    opps = {}
    if args.opp:
        if args.distill:
            raise SystemExit('--opp is for the PPO training; --distill plays both seats alike')
        for entry in args.opp:
            deck, _, path = entry.partition('=')
            if deck not in args.decks[1:]:
                raise SystemExit(f'--opp {entry}: {deck} is not one of the decks after the first ({", ".join(args.decks[1:])})')
            opps[deck] = path or None
        SEATDECKS = True
    DEVICE = torch.device('cuda' if args.device == 'cuda' or args.device == 'auto' and torch.cuda.is_available() else 'cpu')
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    look = (args.search, args.beam, args.prior, ahead(args)) if args.search else None

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
            if ck2['obs'] != ck['obs'] or ck2.get('timers', False) != ck.get('timers', False):
                raise SystemExit(f'{args.vs} sees other states than {args.eval}: measure them with src/selfplay-match.mjs')
            w, d, l = duel(net, old, ck['decks'], args.eval_games, look=look)
            print(f'{args.eval} (iter {ck["iters"]}{", looking ahead" if look else ""}) against {args.vs} (iter {ck2["iters"]}): {w}W {d}D {l}L, {w / (w + d + l):.1%}')
            return
        for rival in RIVALS:
            pairs = {}
            w, d, l = evaluate(net, ck['decks'], args.eval_games, rival=rival, look=look, pairs=pairs)
            print(f'{args.eval} (iter {ck["iters"]}{", looking ahead" if look else ""}) against {rival}: {w}W {d}D {l}L, {w / (w + d + l):.1%}')
            print('\n'.join(pairing_lines(ck['decks'], pairs)))
        return

    out = Path(args.out) if args.out else ROOT / 'runtime' / 'selfplay' / time.strftime('%Y-%m-%dT%H-%M-%S')
    out.mkdir(parents=True, exist_ok=True)
    ck = torch.load(args.resume, weights_only=True, map_location='cpu') if args.resume else None
    if ck:
        EXTRA = EXTRA or bool(ck.get('extra', False))  # the cells of the network that goes on are the ones it had
        STAGES = STAGES or bool(ck.get('stages', False))
    arena = make(args.envs, args.seed, args.decks, swap=args.swap, restart={'frac': args.restart_frac, 'cap': args.restart_pool} if args.restart_frac else None,
                 oracle=args.oracle)
    net = Net(arena.obs, arena.act, args.width, arena.oracle).to(DEVICE)
    done_iters = 0
    if ck:
        old = {'names': ck['names'], 'obs': ck['obs'], 'act': ck['act'], 'timers': bool(ck.get('timers', False)), 'extra': bool(ck.get('extra', False)), 'stages': bool(ck.get('stages', False))}
        new = {'names': arena.names, 'obs': arena.obs, 'act': arena.act, 'timers': TIMERS, 'extra': EXTRA, 'stages': STAGES}
        if old != new:
            # Another vocabulary, the clocks or the extra cell: each card keeps the weights of its own place.
            gone = [n for n in old['names'] if n not in new['names']]
            if gone:
                print(f'cards of the network that the new decks do not have, dropped: {", ".join(gone)}')
            ck['net'] = resume_state(plain(ck['net']), old, new)  # an --oracle head is not moved by card name: it starts afresh
        if not net.oracle or ck.get('oracle', 0) != net.oracle:
            if net.oracle:
                print('the --oracle value head starts fresh', flush=True)
            ck['net'] = plain(ck['net'])
        missing, unexpected = net.load_state_dict(ck['net'], strict=False)
        if unexpected or any(not k.startswith('oracle_value.') for k in missing):
            raise SystemExit(f'{args.resume} does not fit this network: missing {missing}, unexpected {unexpected}')
        done_iters = ck['iters']
    opt = torch.optim.Adam(net.parameters(), lr=args.lr)
    start = copy.deepcopy(net).eval()  # what a --distill run is measured against: the network it began as
    saved = ck.get('opp', {}) if ck else {}  # the opponents' weights of the run being resumed, in its vocabulary
    sparring = {}
    if opps:
        loaded = {}
        for deck in args.decks[1:]:
            path = opps.get(deck)
            if deck in saved:
                sd, width = remapped(saved[deck], ck, arena), ck['width']
                print(f'{deck}: the opponent goes on from {args.resume}' + (f', not from {path}' if path else ''))
            elif path:
                if path not in loaded:  # a file shared by several decks is read once
                    c = torch.load(path, weights_only=True, map_location='cpu')
                    loaded[path] = (remapped(c['net'], c, arena), c['width'])
                sd, width = loaded[path]
            else:
                sd, width = plain(net.state_dict()), args.width
            o_net = Net(arena.obs, arena.act, width).to(DEVICE)
            o_net.load_state_dict(sd)
            sparring[deck] = Opp(deck, o_net, args.opp_lr)
    ref, beta = None, 0.0
    if kl_on:
        beta = 0.05 if args.kl_weight is None else args.kl_weight
        if args.kl_ref and args.kl_ref != args.resume:
            kept_globals = (TIMERS, EXTRA, MIX, MIRROR)
            ref, rck = load(args.kl_ref)  # load() sets the globals to what that network was trained with
            TIMERS, EXTRA, MIX, MIRROR = kept_globals
            if (rck['obs'], rck['act']) != (arena.obs, arena.act):
                raise SystemExit(f'--kl-ref {args.kl_ref} sees states of {rck["obs"]} and steps of {rck["act"]}, this run {arena.obs} and {arena.act}')
        else:
            ref = copy.deepcopy(start)
        for q in ref.parameters():
            q.requires_grad_(False)
        print(f'KL to {args.kl_ref or args.resume} at weight {beta}', flush=True)
    teacher = None
    if args.teacher:
        teacher = Teacher(args.teacher, arena.obs, arena.act, args.teacher_holdout, args.teacher_batch, args.seed)
        t = teacher.measure(net)
        print(f'teacher: {len(teacher.train)} rows trained, {len(teacher.test)} held out, weight {args.teacher_weight}; the start takes the pick in '
              f'{t[0]:.1%} / {t[1]:.1%} of the rows where it lost (trained / held out), keeps its step in {t[2]:.1%} of the other held-out rows; '
              f'takes the labelled start step in {teacher.takes(net, teacher.train + teacher.test, "start"):.1%} of all rows', flush=True)
    recent = []
    pool, state = [], {'live': [([], []) for _ in range(args.envs)], 'rivals': [None] * args.envs}
    if sparring:
        state.update(opp=sparring, names=args.decks, ochoice=[None] * args.envs, olive=[[] for _ in range(args.envs)],
                     orng=random.Random(args.seed * 7919 + 5), ogen=torch.Generator().manual_seed(args.seed * 7919 + 6))
    if args.rollout:
        roller = load(args.rollout_net)[0] if args.rollout_net else start
        state.update(roll=random.Random(args.seed * 7919 + 2), roll_gen=torch.Generator().manual_seed(args.seed * 7919 + 3),
                     roller=roller, pending={}, next_id=0, rolled=0)
    elif args.distill_weight is not None:
        state['ask'] = random.Random(args.seed * 7919 + 1)  # which decisions are looked ahead at, apart from every other draw
    log = out / 'log.csv'
    if not log.exists():
        log.write_text('iter,decisions,games,turns,policy_loss,value_loss,entropy,vs_random,vs_rush,vs_first,vs_lag,seconds'
                       + (',distill,weight,searched' if args.distill_weight is not None else '')
                       + (',opp_decisions,opp_policy_loss,opp_value_loss,learner_searched' if sparring else '')
                       + (',kl' if kl_on else '') + (',restarts' if args.restart_frac else '') + (',oracle_value_loss' if args.oracle else '')
                       + (',teacher,teacher_train_sig,teacher_test_sig,teacher_test_keep' if teacher else '') + '\n')
    kept = out / 'ckpt'
    kept.mkdir(exist_ok=True)
    first = None  # the earliest numbered copy of this run, once there is one

    def against(path):
        """Share of games the present network wins against the copy at path, '' when there is none."""
        if not path or not path.exists():
            return ''
        w, d, l = duel(net, load(path)[0], args.decks, args.eval_games)
        return f'{w / (w + d + l):.4f}'

    def score(show=False):
        out = []
        for rival in RIVALS:
            pairs = {}
            w, d, l = evaluate(net, args.decks, args.eval_games, rival=rival, pairs=pairs)
            out.append(w / (w + d + l))
            if show and len(args.decks) > 2:
                print(f'  against {rival}:\n' + '\n'.join(pairing_lines(args.decks, pairs)), flush=True)
        return out

    def shown(vs):
        return ', '.join(f'{x:.1%} against {r}' for r, x in zip(RIVALS, vs))

    print(f'{" vs ".join(args.decks)}: state {arena.obs}, step {arena.act}, {sum(x.numel() for x in net.parameters())} weights on {DEVICE} -> {out}')
    print(f'iter {done_iters}: {shown(score())} over {args.eval_games} games each', flush=True)
    if args.restart_frac:
        t0 = time.time()
        print(f'restart pool: {seed_restarts(arena, args)} positions seeded from {args.restart_net} in {time.time() - t0:.0f}s, {args.restart_frac:.0%} of the games restart', flush=True)
    for it in range(done_iters + 1, done_iters + args.iters + 1):
        t0 = time.time()
        if args.anneal:
            for g in opt.param_groups:
                g['lr'] = args.lr * (1 - (it - done_iters - 1) / args.iters)
        weight = anchor(args, it, done_iters)
        if args.distill:
            data, games, turns = collect_search(net, arena, state, args)
            recent = (recent + [data])[-args.window:]
            pl, vl, ent = distill(net, opt, [d for batch in recent for d in batch], args)  # ent holds the --mono penalty here
        else:
            taught.counts[0] = 0
            data, games, turns = collect(net, arena, pool, state, args)
            pl, vl, ent, il, klv, ovl_o, *tl = update(net, opt, data, args, weight, ref, beta, teacher)
            if sparring:
                odec, opl, ovl = opp_learn(sparring, args)
                if args.opp_lr > 0 and it % args.opp_refresh == 0:
                    for o in sparring.values():
                        o.refresh(args.opp_pool)
        vs = score(True) if it % args.eval_every == 0 or it == done_iters + args.iters else None
        if it % args.snapshot_every == 0:
            pool.append(copy.deepcopy(net).eval())
            del pool[:-args.pool]
        ck = {'net': {k: v.cpu() for k, v in net.state_dict().items()}, 'obs': arena.obs, 'act': arena.act, 'width': args.width,
              'names': arena.names, 'decks': args.decks, 'iters': it, 'timers': TIMERS}
        if net.oracle:
            ck['oracle'] = net.oracle
        if EXTRA:  # networks of the older vocabularies keep the checkpoint they always had
            ck.update(extra=True, mix=MIX, mirror=MIRROR)
        if STAGES:
            ck['stages'] = True
        if sparring:
            ck['opp'] = {d: {k: v.cpu() for k, v in o.net.state_dict().items()} for d, o in sparring.items()}
        torch.save(ck, out / 'policy.pt')
        selves = ('', '') if vs is None else (against(first), against(kept / f'iter-{it - args.lag:04d}.pt'))
        if args.distill and vs is not None:
            w, d, l = duel(net, start, args.decks, args.eval_games)
            selves = (f'{w / (w + d + l):.4f}', selves[1])
        if it % args.keep_every == 0:
            torch.save(ck, kept / f'iter-{it:04d}.pt')
            for d in sparring:  # each opponent as a policy.pt of its own, for train/export.py
                torch.save({**{k: v for k, v in ck.items() if k != 'opp'}, 'net': ck['opp'][d], 'deck': d}, kept / f'opp-{d}-iter-{it:04d}.pt')
            first = first or kept / f'iter-{it:04d}.pt'
        tmeas = teacher.measure(net) if teacher else None
        secs = time.time() - t0
        with log.open('a') as f:
            f.write(f'{it},{len(data)},{games},{turns / games:.1f},{pl:.4f},{vl:.4f},{ent:.4f},{"," if vs is None else f"{vs[0]:.4f},{vs[1]:.4f}"},{selves[0]},{selves[1]},{secs:.0f}'
                    + ('' if weight is None else f',{il:.4f},{weight:.4f},{taught.counts[0]}')
                    + (f',{odec},{opl:.4f},{ovl:.4f},{taught.counts[0]}' if sparring else '')
                    + (f',{klv:.5f}' if kl_on else '') + (f',{state["restarts"]}' if args.restart_frac else '') + (f',{ovl_o:.4f}' if args.oracle else '')
                    + (f',{tl[0]:.4f},' + ','.join(f'{x:.4f}' for x in tmeas) if teacher else '') + '\n')
        print(f'iter {it}: {len(data)} decisions in {games} games of {turns / games:.1f} turns, value loss {vl:.3f}, {"health penalty" if args.distill else "entropy"} {ent:.4f}, {secs:.0f}s'
              + ('' if weight is None else f', imitation {il:.4f} at λ {weight:.3f} ({taught.counts[0]} {"rolled out" if args.rollout else "looked ahead at"})')
              + (f', opponents {odec} decisions (policy loss {opl:.4f}, value loss {ovl:.4f}), {taught.counts[0]} searches' if sparring else '')
              + (f', kl {klv:.5f} (x {beta} = {beta * klv:.5f}, policy loss {pl:.5f})' if kl_on else '')
              + (f', {state["restarts"]} restart games' if args.restart_frac else '')
              + (f', oracle value loss {ovl_o:.3f}' if args.oracle else '')
              + (f', teacher {tl[0]:.3f} (takes the pick {tmeas[0]:.1%} trained / {tmeas[1]:.1%} held out, keeps {tmeas[2]:.1%})' if teacher else '')
              + ('' if vs is None else ', ' + shown(vs))
              + ''.join(f', {float(x):.1%} against {who}' for x, who in zip(selves, ('where it began' if args.distill else 'the first copy', f'iter {it - args.lag}')) if x), flush=True)
    arena.close()


if __name__ == '__main__':
    main()
