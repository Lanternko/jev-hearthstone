"""E-272 (revised): fit zoo-v9's value head to the results of its own games, by supervised learning. Trunk and policy stay as they are.

  python train/fit_value.py --data <dir of runtime/value-fit-20261029/collect.mjs shards> --out <dir> [--export models/selfplay/warlock-zoo-0.1.1+E272] [--sim b31012f48995]

1. verify: python v9 on the shards' *.verify.jsonl (obs and steps as node computed them) must give node's logits within 1e-5 (and node's value); otherwise stop (exit 2).
2. embeddings: net.body(obs) once for every collected decision (the trunk is frozen, so the value head is a function of it).
3. fit net.value alone (starting from v9's head; epochs 1..cap are candidates): MSE to z (the zoo's result, +1/-1, undiscounted), Adam, weights per opponent so every opponent counts the same,
   split 90/10 by game (game seed % 10 == 0 is validation, early stopping only), the epoch with the lowest validation loss is kept.
4. export <name>.pt (state dict of v9 with value.* replaced, 'sim' set) and <name>.json (train/export.py); policy tensors are byte-equal to v9.
The numbers (lr, batch, cap, patience, target, weighting) are those of the preregistration in memory/experiments.md E-272 (revision 2026-10-29).
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ppo  # noqa: E402

LR, BATCH, CAP, PATIENCE, SEED = 1e-3, 1024, 40, 6, 0  # preregistered


def verify(net, files, tol=1e-5):
    rows = [json.loads(l) for f in files for l in open(f, encoding='utf8') if l.strip()]
    if not rows:
        raise SystemExit('no verify rows')
    worst_l = worst_v = 0.0
    with torch.no_grad():
        for i in range(0, len(rows), 256):
            chunk = rows[i:i + 256]
            obs = [torch.tensor(r['obs'], dtype=torch.float32) for r in chunk]
            acts = [torch.tensor(r['acts'], dtype=torch.float32) for r in chunk]
            logits, value = net(torch.stack(obs), *ppo.padded(acts))
            for j, r in enumerate(chunk):
                d = np.abs(logits[j, :len(r['logits'])].numpy().astype(np.float64) - np.array(r['logits'], dtype=np.float64)).max()
                worst_l = max(worst_l, float(d))
                worst_v = max(worst_v, abs(value[j].item() - r['value']))
    return {'rows': len(rows), 'max_logit_diff': worst_l, 'max_value_diff': worst_v, 'ok': bool(worst_l < tol)}


def load_shards(d, net):
    """Per shard: read the observations, embed them with the frozen trunk (net.body) and keep only the 256-d embeddings (memory)."""
    emb_l, v9_l, meta = [], [], []
    for mf in sorted(glob.glob(os.path.join(d, '*.meta.jsonl'))):
        pre = mf[:-len('.meta.jsonl')]
        rows = [json.loads(l) for l in open(mf, encoding='utf8') if l.strip()]
        if not rows:
            continue
        o = np.fromfile(pre + '.obs', dtype='<f4')
        if len(o) % len(rows):
            raise SystemExit(f'{pre}: obs/meta mismatch')
        o = torch.from_numpy(o.reshape(len(rows), -1))
        with torch.no_grad():
            e = torch.cat([net.body(o[i:i + 8192]) for i in range(0, len(o), 8192)])
            v9_l.append(torch.cat([net.value(e[i:i + 8192]).squeeze(-1) for i in range(0, len(e), 8192)]))
        emb_l.append(e)
        opp = os.path.basename(pre).split('-')[0]
        meta += [(opp, r['s'], r['t'], r['r'], r['z'], r['v']) for r in rows]
    return torch.cat(emb_l), torch.cat(v9_l), meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--pt', default='models/selfplay/warlock-zoo-v9.pt')
    ap.add_argument('--export')
    ap.add_argument('--sim')
    ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    os.makedirs(a.out, exist_ok=True)
    net, ck = ppo.load(a.pt)
    net.eval()
    v = verify(net, sorted(glob.glob(os.path.join(a.data, '*.verify.jsonl'))))
    json.dump(v, open(os.path.join(a.out, 'verify.json'), 'w'))
    print('verify', v, flush=True)
    if not v['ok']:
        raise SystemExit(2)
    emb, v9, meta = load_shards(a.data, net)
    opps = [m[0] for m in meta]
    seeds = np.array([m[1] for m in meta])
    z = torch.tensor([m[4] for m in meta], dtype=torch.float32)
    nodev = torch.tensor([m[5] for m in meta], dtype=torch.float32)
    print('python v9 value vs node value on all decisions: max diff', float((v9 - nodev).abs().max()), flush=True)
    names = sorted(set(opps))
    opp_idx = {n: torch.tensor([i for i, x in enumerate(opps) if x == n]) for n in names}
    w = torch.zeros(len(meta))
    for n in names:
        w[opp_idx[n]] = 1.0 / len(opp_idx[n])
    w = w / w.sum() * len(w)  # mean weight 1; every opponent has the same total weight
    val = torch.from_numpy(seeds % 10 == 0)
    tr_i, va_i = torch.where(~val)[0], torch.where(val)[0]
    isval = val
    print({'decisions': len(meta), 'train': len(tr_i), 'val': len(va_i), 'opponents': {n: len(opp_idx[n]) for n in names}}, flush=True)

    head = nn.Sequential(nn.Linear(256, 256), nn.ReLU(), nn.Linear(256, 1))
    head.load_state_dict({k[len('value.'):]: t for k, t in net.state_dict().items() if k.startswith('value.')})
    opt = torch.optim.Adam(head.parameters(), lr=LR)
    g = torch.Generator().manual_seed(SEED)

    def evaluate(i):
        with torch.no_grad():
            err = torch.cat([(head(emb[c]).squeeze(-1) - z[c]) ** 2 for c in torch.split(i, 8192)])
            ww = w[i]
            sel = torch.zeros(len(meta), dtype=torch.bool)
            sel[i] = True
            per = {}
            for n in names:
                m = sel[opp_idx[n]]
                e_all = torch.zeros(len(meta))
                e_all[i] = err
                per[n] = float(e_all[opp_idx[n]][m].mean()) if m.any() else None
            return float((err * ww).sum() / ww.sum()), per

    log = []
    l0, p0 = evaluate(va_i)
    log.append({'epoch': 0, 'train': evaluate(tr_i)[0], 'val': l0, 'val_per_opp': p0})
    print(log[-1], flush=True)
    best, best_ep, best_sd, bad = float('inf'), 0, None, 0  # epoch 0 is the untouched v9 head and is never chosen
    for ep in range(1, CAP + 1):
        head.train()
        perm = tr_i[torch.randperm(len(tr_i), generator=g)]
        for c in torch.split(perm, BATCH):
            loss = (w[c] * (head(emb[c]).squeeze(-1) - z[c]) ** 2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
        head.eval()
        lt, _ = evaluate(tr_i)
        lv, pv = evaluate(va_i)
        log.append({'epoch': ep, 'train': lt, 'val': lv, 'val_per_opp': pv})
        print(log[-1], flush=True)
        if lv < best:
            best, best_ep, best_sd, bad = lv, ep, {k: t.clone() for k, t in head.state_dict().items()}, 0
        else:
            bad += 1
            if bad >= PATIENCE:
                break
    summary = {'epochs_run': len(log) - 1, 'chosen_epoch': best_ep, 'val_chosen': best, 'val_v9': l0, 'lr': LR, 'batch': BATCH, 'cap': CAP, 'patience': PATIENCE,
               'decisions': len(meta), 'opponents': {n: len(opp_idx[n]) for n in names}}
    json.dump({'summary': summary, 'log': log}, open(os.path.join(a.out, 'fit.json'), 'w'))
    print('summary', summary, flush=True)
    if a.export:
        sd = {k: t.clone() for k, t in ck['net'].items()}
        for k, t in best_sd.items():
            sd['value.' + k] = t.clone()
        new = dict(ck)
        new['net'] = sd
        new['sim'] = a.sim
        new['value_fit'] = {'E': 'E-272', 'from': os.path.basename(a.pt), 'epoch': best_ep, 'target': 'z undiscounted'}
        torch.save(new, a.export + '.pt')
        import export as ex
        ex.main(a.export + '.pt', a.export + '.json')
        print('exported', a.export, flush=True)


if __name__ == '__main__':
    main()
