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
- **Start of work:** read `memory/handoff.md`, then `memory/lessons.md` (general lessons), then `memory/rulings.md` (general rulings); add `memory/rulings-<deck>.md` only when the work touches that deck (zoo, egg, discard), and `memory/lessons-<area>.md` only when it touches that area (train, live, jev). Look up `findings.md` / `experiments.md` with grep when needed.
- **End of work:** append new findings to `findings.md`, experiments to `experiments.md`, user rulings and game rules to `rulings.md` or the deck's `rulings-<deck>.md` (also list the ID in `rulings-ids.md`), lessons to `lessons.md` or the area's `lessons-<area>.md` (also list the ID in `lessons-ids.md`) (new IDs only; when a status changes, edit that entry's status field with the date, never delete). Then **overwrite** `handoff.md` with the current state.
- **Every mistake caught becomes a lesson.** If it can be checked automatically, add a test and name it in the lesson's check field.
- `STATUS.md` is retired; the old log is read-only history in `memory/archive/STATUS-2026-10-27.md`. Model version notes stay in `docs/selfplay-versions.md`.

## 回報實驗結果（使用者的規則，2026-10-30，格式取自 basketball-autochess）
只有回報實驗結果時用這個格式；其他回覆照平常寫。第一行就是 `# 總評`，其餘五段用粗體標題，照字面、照順序：
1. **總評**（`# 總評`，五級擇一附分數，寫成 `**4/5 大致達成 有部分退步**`）：5 重大達成／4 大致達成 有部分退步／3 一半一半／2 主目標達成 但是有副作用／1 失敗。
2. **這次目標**：一句話。
3. **進步了什麼**、4. **退步了什麼**：各幾點，用勝率從多少到多少、對哪個對手這種講法。
5. **直觀證據**：小表或例子。
6. **要你決定的事**：approve 與否、下一步選項。
- 不寫細節段：區間、種子、雜湊、檔案路徑、memory ID、測試數都不放進回報（已記在 memory 和 runtime 檔）。

## Commands
```bash
npm test          # node --test, must stay green
npm run game      # play one game unattended -> runtime/last-game.log
npm run gestures  # dead/misfired click report
```

## NEVER
- Never read, print or paste `.env.local` (it holds the Gateway key). It is loaded only through `--env-file-if-exists` or `process.loadEnvFile`.
- Never commit unless the user asks.
