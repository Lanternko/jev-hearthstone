// memory/handoff.md is read at the start of every session, so its size is paid on every session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';

const LIMIT = 8 * 1024;

test('memory/handoff.md stays under 8KB', () => {
  const size = statSync(new URL('../memory/handoff.md', import.meta.url)).size;
  assert.ok(size <= LIMIT,
    `memory/handoff.md is ${size} bytes (limit ${LIMIT}). Slim it down: keep only the current state ` +
    '(live baseline, in progress, awaiting the user, to-do), at most two lines per item, details as IDs and paths; ' +
    'delete closed or shipped items (git log has them). Copy the old full text to memory/archive/ before overwriting.');
});
