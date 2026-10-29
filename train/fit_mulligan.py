"""The mulligan study (2026-10-29): fit which kept cards win, from games with a random mulligan.

  python train/fit_mulligan.py --rows rows.jsonl --out <dir> [--C 0.03 0.1 0.3 1] [--opp <deck>]

rows.jsonl is train/mulligan-rows.mjs over the --out lines of `src/selfplay-mulligan.mjs ... --policy random`.
Each row: f the features of what was kept (src/selfplay-mulligan.mjs features), c the controls the keep cannot
change (cards offered, opponent and seat). One logistic regression of the result on f and c per C (L2; a draw
counts as half a win and half a loss), every opponent weighted the same. The keep was random given the hand,
so with the offered cards controlled an f weight is the effect of keeping rather than throwing.
Writes <dir>/table-C<C>.json ({w: the f weights, C, ...}) for src/selfplay-mulligan.mjs tablePolicy, and prints
the held-out log loss (seed % 10 == 0) of controls only against controls plus keeps. --opp fits the games
against that deck alone (a table for one opponent class: the class is known at the mulligan).
"""
import argparse
import json
import os

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression


def load(path):
    rows = [json.loads(l) for l in open(path, encoding='utf8') if l.strip()]
    names = sorted({k for r in rows for k in (*r['f'], *r['c'])})
    return rows, names


def matrix(rows, names, use_f=True):
    ix = {n: i for i, n in enumerate(names)}
    data, ri, ci = [], [], []
    for i, r in enumerate(rows):
        for part in (('f', 'c') if use_f else ('c',)):
            for k, v in r[part].items():
                data.append(v); ri.append(i); ci.append(ix[k])
    return csr_matrix((data, (ri, ci)), shape=(len(rows), len(names)))


def doubled(rows, X):
    """y and weights with a draw as half a win and half a loss; opponents weighted the same."""
    n = len(rows)
    per = {}
    for r in rows:
        per[r['opp']] = per.get(r['opp'], 0) + 1
    w = np.array([n / (len(per) * per[r['opp']]) for r in rows])
    won = np.array([r['won'] for r in rows], dtype=float)
    from scipy.sparse import vstack
    return vstack([X, X]), np.r_[np.ones(n), np.zeros(n)], np.r_[w * won, w * (1 - won)]


def logloss(m, X, rows):
    p = np.clip(m.predict_proba(X)[:, 1], 1e-9, 1 - 1e-9)
    won = np.array([r['won'] for r in rows], dtype=float)
    return float(-np.mean(won * np.log(p) + (1 - won) * np.log(1 - p)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rows', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--C', type=float, nargs='+', default=[0.03, 0.1, 0.3, 1.0])
    ap.add_argument('--opp', default=None)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rows, names = load(a.rows)
    if a.opp:
        rows = [r for r in rows if r['opp'] == a.opp]
        names = sorted({k for r in rows for k in (*r['f'], *r['c'])})
    fnames = {k for r in rows for k in r['f']}
    tr = [r for r in rows if r['seed'] % 10 != 0]
    va = [r for r in rows if r['seed'] % 10 == 0]
    print(f'{len(rows)} games ({len(tr)} fit, {len(va)} held out), {len(names)} features ({len(fnames)} keep)')
    for C in a.C:
        res = {}
        for use_f in (False, True):
            X, y, w = doubled(tr, matrix(tr, names, use_f))
            m = LogisticRegression(C=C, max_iter=2000).fit(X, y, sample_weight=w)
            res[use_f] = (m, logloss(m, matrix(va, names, use_f), va))
        m = res[True][0]
        Xa, ya, wa = doubled(rows, matrix(rows, names, True))
        full = LogisticRegression(C=C, max_iter=2000).fit(Xa, ya, sample_weight=wa)
        coef = dict(zip(names, full.coef_[0].tolist()))
        wf = {k: round(v, 5) for k, v in coef.items() if k in fnames}
        print(f'C={C}: held-out log loss controls {res[False][1]:.5f}, controls+keeps {res[True][1]:.5f}')
        doc = {'C': C, 'games': len(rows), 'heldout': {'controls': res[False][1], 'keeps': res[True][1]}, 'w': wf}
        with open(os.path.join(a.out, f'table-C{C}.json'), 'w', encoding='utf8') as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
        top = sorted(((v, k) for k, v in wf.items() if '|' not in k), reverse=True)
        print('  keep weights (no seat/core split):', ', '.join(f'{k} {v:+.3f}' for v, k in top))


if __name__ == '__main__':
    main()
