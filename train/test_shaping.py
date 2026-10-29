"""Checks of train/ppo.py's shaping (no node, no games): python train/test_shaping.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ppo import shaping  # noqa: E402

# (obs, acts, a, logp, v, phi, turn): three decisions on turn 1, two on turn 3, one on turn 5
seq = [(None, None, 0, 0.0, 0.0, phi, turn) for phi, turn in [(1.0, 1), (2.0, 1), (4.0, 1), (5.0, 3), (3.0, 3), (7.0, 5)]]
got = shaping(seq, 0.5, 1.0)
assert got == [0.0, 0.0, 0.5 * (4.0 - 1.0), 0.0, 0.5 * (3.0 - 4.0), 0.5 * (0.0 - 3.0)], got
# with gamma 1 the shaping adds up to -scale * Φ where the seat began, whatever happened between
assert abs(sum(got) - (-0.5 * 1.0)) < 1e-12
got = shaping(seq, 1.0, 0.9)
assert got[2] == 0.9 * 4.0 - 1.0 and got[4] == 0.9 * 3.0 - 4.0 and got[5] == -3.0, got
assert shaping([], 1.0, 1.0) == []
assert shaping(seq[:1], 1.0, 1.0) == [-1.0]
# final: the end of the game counts as the board score there; with gamma 1 the sum is scale * (final - Φ start)
got = shaping(seq, 0.5, 1.0, 6.0)
assert got == [0.0, 0.0, 0.5 * (4.0 - 1.0), 0.0, 0.5 * (3.0 - 4.0), 0.5 * (6.0 - 3.0)], got
assert abs(sum(got) - 0.5 * (6.0 - 1.0)) < 1e-12
assert abs(sum(shaping(seq, 0.5, 1.0, -2.5)) - 0.5 * (-2.5 - 1.0)) < 1e-12
assert shaping(seq, 0.5, 1.0, None) == shaping(seq, 0.5, 1.0)
assert shaping(seq, 0.5, 1.0, 0.0) == shaping(seq, 0.5, 1.0)
assert shaping(seq[:1], 1.0, 0.9, 5.0) == [0.9 * 5.0 - 1.0]
assert shaping([], 1.0, 1.0, 3.0) == []
print('shaping ok')
