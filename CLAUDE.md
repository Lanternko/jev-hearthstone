# jev-hearthstone

A Hearthstone bot. Jev (called through the AI Gateway) picks the actions, and `src/loop.mjs` clicks them. Replies are in Traditional Chinese.

## Workflow (the user's rule, 2026-09-24)
- **Games run unattended.** Start one from the deck screen with `npm run game`: it waits for the game to start, then plays to the end and writes `runtime/last-game.log`. Don't arm a Monitor, don't poll, and don't take screenshots mid-game. Every wake-up re-sends the whole context, and that is what used up the weekly quota.
  - Why: Jev's own calls go through the Gateway and are billed there. The expensive part is Claude Code watching the game.
- **Analyse once, after the game.** Read these:
  - `runtime/last-game.log`;
  - the `PLAYSTATE` lines in Power.log (`D:/遊戲/Hearthstone/Logs/<latest>/Power.log`);
  - the tail of `runtime/decisions.jsonl`;
  - `npm run gestures`.
- **One batch of fixes per session.** After a batch, record it in `memory/` (see below) and have the user start a new session. Don't carry the old conversation forward.

## Memory (`memory/`, the user's rule, 2026-10-27)
- **All agents (Claude, Codex, cloud project threads) talk only through `memory/`.** No handing work over through chat: anything another agent must pick up goes into `memory/handoff.md` or the matching field file. Rules and field definitions: `memory/README.md`.
- **Start of work:** read `memory/handoff.md`, then `memory/lessons.md`, then `memory/rulings.md`. Look up `findings.md` / `experiments.md` with grep when needed.
- **End of work:** append new findings to `findings.md`, experiments to `experiments.md`, user rulings and game rules to `rulings.md`, lessons to `lessons.md` (new IDs only; when a status changes, edit that entry's status field with the date, never delete). Then **overwrite** `handoff.md` with the current state.
- **Every mistake caught becomes a lesson.** If it can be checked automatically, add a test and name it in the lesson's check field.
- `STATUS.md` is retired; the old log is read-only history in `memory/archive/STATUS-2026-10-27.md`. Model version notes stay in `docs/selfplay-versions.md`.

## Commands
```bash
npm test          # node --test, must stay green
npm run game      # play one game unattended -> runtime/last-game.log
npm run gestures  # dead/misfired click report
```

## NEVER
- Never read, print or paste `.env.local` (it holds the Gateway key). It is loaded only through `--env-file-if-exists` or `process.loadEnvFile`.
- Never commit unless the user asks.
