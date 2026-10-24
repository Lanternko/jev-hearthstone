"""Write a policy.pt as one JSON file that src/selfplay-net.mjs reads without Python.

  python train/export.py <policy.pt> <out.json> [positions.json]

Every tensor is its shape and its float32 values (little endian) in base64. With a third path, a few
self-play positions and the network's own answers to them are written too, for a test of the reader.
"""
import base64
import json
import sys

import torch

from ppo import Arena, load, padded, tensors


def main(path, out, check=None):
    net, ck = load(path)
    doc = {k: ck[k] for k in ('obs', 'act', 'width', 'names', 'decks', 'iters')}
    doc['timers'] = bool(ck.get('timers', False))
    doc['tensors'] = {k: {'shape': list(v.shape), 'data': base64.b64encode(v.float().numpy().astype('<f4').tobytes()).decode()}
                      for k, v in net.state_dict().items()}
    with open(out, 'w') as f:
        json.dump(doc, f)
    if not check:
        return
    arena = Arena(8, 900_000_000, ck['decks'])
    rows = []
    for _ in range(40):
        obs, acts = tensors(arena.envs)
        with torch.no_grad():
            logits, value = net(torch.stack(obs), *padded(acts))
        if len(rows) < 12:
            e = arena.envs[len(rows) % 8]
            i = len(rows) % 8
            rows.append({'obs': e['obs'].tolist(), 'acts': e['acts'].tolist(), 'logits': logits[i, :len(e['acts'])].tolist(), 'value': value[i].item()})
        arena.step(logits.argmax(-1).tolist())
    arena.close()
    with open(check, 'w') as f:
        json.dump(rows, f)


if __name__ == '__main__':
    main(*sys.argv[1:])
