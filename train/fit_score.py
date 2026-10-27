"""Fit the weights of the board score (src/board-score.mjs) to the results of self-play games.

Reads the lines of src/board-calibrate.mjs. For each look ahead k (1..3 of our own turns) and each turn
discount gamma, the score of a position is

    S_k = sum over j < k of gamma^j * w . mean_rolls(features where we hand over turn j+1)

and P(win) = sigmoid(b + S_k) is fitted by logistic regression (Newton's method) on the games whose
seed is not a multiple of 4; the rest are the test set. gamma is the one that fits the training games
best. Baselines on the same test set: the value head of the network (as it is, (v + 1) / 2, and through
a fitted sigmoid), the features of the position itself (k = 0), the user's first weights (board 1.0,
hand 0.5, health 0.3; turns 1.0 / 0.7 / 0.5) through a fitted sigmoid, and the mean result of the rolls.

    python train/fit_score.py runtime/board-calibrate/*.jsonl --out models/selfplay/board-score.json
"""
import argparse
import glob
import json

import numpy as np

FEATURES = ['board', 'hand', 'health', 'pending']
GAMMAS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
USER = np.array([1.0, 0.5, 0.3, 0.0]), [1.0, 0.7, 0.5]


def fit(X, y, ridge=1e-6, iters=50):
    """Logistic regression with an intercept, by Newton's method -> (intercept, weights)."""
    A = np.hstack([np.ones((len(X), 1)), X])
    w = np.zeros(A.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-A @ w))
        g = A.T @ (p - y) + ridge * w
        H = (A * (p * (1 - p))[:, None]).T @ A + ridge * np.eye(len(w))
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-10:
            break
    return w[0], w[1:]


def prob(b, w, X):
    return np.clip(1 / (1 + np.exp(-(b + X @ w))), 1e-6, 1 - 1e-6)


def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(p, y):
    order = np.argsort(p, kind='mergesort')
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    sp = p[order]
    for v in np.unique(sp[1:][np.diff(sp) == 0]):  # ties share their mean rank
        at = p == v
        ranks[at] = ranks[at].mean()
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def calibration(p, y, bins=10):
    """Rows (mean predicted, share won, count) over bins of equal count."""
    order = np.argsort(p)
    return [(float(p[i].mean()), float(y[i].mean()), len(i)) for i in np.array_split(order, bins)]


def load(paths):
    rows = [json.loads(line) for path in paths for line in open(path, encoding='utf8') if line.strip()]
    rows = [r for r in rows if r['r'] != 0.5]  # drawn or cut off: no result to predict
    y = np.array([r['r'] for r in rows], float)
    v = np.array([r['v'] for r in rows], float)
    f0 = np.array([r['f0'] for r in rows], float)
    M = np.array([np.mean([x['f'] for x in r['roll']], axis=0) for r in rows], float)  # n x turns x features
    mc = np.array([np.mean([x['r'] for x in r['roll']]) for r in rows], float)
    test = np.array([r['seed'] % 4 == 0 for r in rows])
    opp = np.array([r['opp'] for r in rows])
    first = np.array([r['first'] for r in rows])
    return dict(y=y, v=v, f0=f0, M=M, mc=mc, test=test, opp=opp, first=first, n=len(rows))


def ahead(M, k, gamma):
    return sum(gamma ** j * M[:, j, :] for j in range(k))


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('files', nargs='+')
    p.add_argument('--out', default=None, help='the weights file: every fit, and the chosen one at the top')
    p.add_argument('--k', type=int, default=None, help='the look ahead to choose, default the best on the test games')
    args = p.parse_args()
    d = load([f for pat in args.files for f in glob.glob(pat)])
    y, tr, te = d['y'], ~d['test'], d['test']
    print(f'{d["n"]} positions ({tr.sum()} training, {te.sum()} test), won {y.mean():.1%}; ' +
          ', '.join(f'{o}: {(d["opp"] == o).sum()}' for o in np.unique(d['opp'])))

    def judged(name, X, extra=None):
        b, w = fit(X[tr], y[tr])
        pt = prob(b, w, X[te])
        row = dict(name=name, intercept=float(b), w=w.tolist(), train_ll=logloss(prob(b, w, X[tr]), y[tr]),
                   test_ll=logloss(pt, y[te]), auc=auc(pt, y[te]), **(extra or {}))
        return row, pt

    table, preds = [], {}
    raw = np.clip((d['v'] + 1) / 2, 1e-6, 1 - 1e-6)
    table.append(dict(name='value head, (v+1)/2', test_ll=logloss(raw[te], y[te]), auc=auc(raw[te], y[te])))
    preds['value raw'] = raw[te]
    r, preds['value'] = judged('value head, sigmoid fitted', d['v'][:, None])
    table.append(r)
    r, preds['mc'] = judged('mean result of the rolls, sigmoid fitted', d['mc'][:, None])
    table.append(r)
    r, _ = judged('k=0 (the position itself)', d['f0'], dict(k=0))
    table.append(r)
    S_user = sum(t * (d['M'][:, j, :] @ USER[0]) for j, t in enumerate(USER[1]))
    r, _ = judged('user weights 1/0.5/0.3, turns 1/0.7/0.5, sigmoid fitted', S_user[:, None])
    table.append(r)
    fits = []
    for k in (1, 2, 3):
        best = None
        for g in (GAMMAS if k > 1 else [1.0]):
            r, pt = judged(f'k={k}', ahead(d['M'], k, g), dict(k=k, gamma=g))
            if best is None or r['train_ll'] < best[0]['train_ll']:
                best = (r, pt)
        table.append(best[0])
        preds[f'k={k}'] = best[1]
        fits.append(best[0])
        X = np.hstack([ahead(d['M'], k, best[0]['gamma']), d['v'][:, None]])
        r, _ = judged(f'k={k} + value head', X, dict(k=k, gamma=best[0]['gamma']))
        table.append(r)

    print('\n| model | gamma | board | hand | health | pending | log-loss (test) | AUC (test) |')
    print('|---|---|---|---|---|---|---|---|')
    for r in table:
        w = r.get('w', [])
        cells = [f'{x:.4f}' for x in w[:4]] if len(w) >= 4 else ([f'v {w[0]:.3f}'] if w else []) + [''] * (4 - min(len(w), 1))
        if len(w) == 5:
            cells[-1] += f' (v {w[4]:.3f})'
        print(f"| {r['name']} | {r.get('gamma', '')} | {' | '.join(cells[:4])} | {r['test_ll']:.4f} | {r['auc']:.4f} |")

    chosen = min(fits, key=lambda r: r['test_ll']) if args.k is None else next(r for r in fits if r['k'] == args.k)
    w = np.array(chosen['w'])
    print(f"\nchosen: k={chosen['k']}, gamma={chosen['gamma']}, weights " + ', '.join(f'{n} {x:.4f}' for n, x in zip(FEATURES, w))
          + ' (relative to board: ' + ', '.join(f'{n} {x / w[0]:.2f}' for n, x in zip(FEATURES, w)) + ')')
    S = ahead(d['M'], chosen['k'], chosen['gamma'])
    for o in np.unique(d['opp']):
        at = te & (d['opp'] == o)
        pt = prob(chosen['intercept'], w, S[at])
        pv = prob(*fit(d['v'][tr][:, None], y[tr]), d['v'][at][:, None])
        print(f'  {o}: {at.sum()} test positions, log-loss {logloss(pt, y[at]):.4f} (value head {logloss(pv, y[at]):.4f}), AUC {auc(pt, y[at]):.4f} (value head {auc(pv, y[at]):.4f})')
    print('\ncalibration on the test games (mean predicted -> share won):')
    for name in (f"k={chosen['k']}", 'value', 'value raw'):
        print(f'  {name}: ' + '; '.join(f'{a:.2f}->{b:.2f}' for a, b, _ in calibration(preds[name], y[te])))
    if args.out:
        doc = {'features': FEATURES, 'k': chosen['k'], 'gamma': chosen['gamma'], 'intercept': chosen['intercept'],
               'weights': dict(zip(FEATURES, chosen['w'])),
               'fits': [{'k': r['k'], 'gamma': r['gamma'], 'intercept': r['intercept'], 'weights': dict(zip(FEATURES, r['w'])),
                         'test_ll': r['test_ll'], 'auc': r['auc']} for r in fits],
               'table': table, 'positions': d['n']}
        with open(args.out, 'w', encoding='utf8') as f:
            json.dump(doc, f, indent=1)
        print(f'-> {args.out}')


if __name__ == '__main__':
    main()
