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
- **One batch of fixes per session.** After a batch, record it in `STATUS.md` and have the user start a new session. Don't carry the old conversation forward. `STATUS.md` is the running record.
- **AI opponents only** (Innkeeper / Practice). Never run the bot in ranked or casual games against people.

## Commands
```bash
npm test          # node --test, must stay green
npm run game      # play one game unattended -> runtime/last-game.log
npm run gestures  # dead/misfired click report
```

## NEVER
- Never read, print or paste `.env.local` (it holds the Gateway key). It is loaded only through `--env-file-if-exists` or `process.loadEnvFile`.
- Never commit unless the user asks.
