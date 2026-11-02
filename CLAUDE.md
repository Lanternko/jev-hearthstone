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

## 5090 folders (the user's rule, 2026-11-02)
- `~/side_projects/jev-hearthstone/` is the synced training copy; leave it alone.
- Every experiment dir goes in `~/side_projects/jev-hearthstone-lab/experiments/<name>/`, flat with no sub-categories. Old backups go in `jev-hearthstone-lab/archive/`. Never create `jev-hearthstone-*` dirs in the `side_projects` root, and leave no single scripts or logs in `jev-hearthstone-lab/`.
- Old paths in `memory/` and `runtime/*/run.sh` are history; don't edit them. Don't move a dir while its job is still running.

## Memory (`memory/`, the user's rule, 2026-10-27)
- **All agents (Claude, Codex, cloud project threads) talk only through `memory/`.** No handing work over through chat: anything another agent must pick up goes into `memory/handoff.md` or the matching field file. Rules and field definitions: `memory/README.md`.
- **Start of work:** read `memory/handoff.md`, then `memory/lessons.md` (general lessons), then `memory/rulings.md` (general rulings); add `memory/rulings-<deck>.md` only when the work touches that deck (zoo, egg, discard), and `memory/lessons-<area>.md` only when it touches that area (train, live, jev). Look up `findings.md` / `experiments.md` with grep when needed.
- **End of work:** append new findings to `findings.md`, experiments to `experiments.md`, user rulings and game rules to `rulings.md` or the deck's `rulings-<deck>.md` (also list the ID in `rulings-ids.md`), lessons to `lessons.md` or the area's `lessons-<area>.md` (also list the ID in `lessons-ids.md`) (new IDs only; when a status changes, edit that entry's status field with the date, never delete). Then **overwrite** `handoff.md` with the current state.
- **Every mistake caught becomes a lesson.** If it can be checked automatically, add a test and name it in the lesson's check field.
- `STATUS.md` is retired; the old log is read-only history in `memory/archive/STATUS-2026-10-27.md`. Model version notes stay in `docs/selfplay-versions.md`.

## 回報實驗結果（使用者的規則，2026-11-03 改三段式，格式取自 basketball-autochess R-145）
只有回報實驗結果時用這個格式（實驗收尾、對實驗結果的稽核、派出去跑實驗的結果）；發版、部署、收工說明、回答問題等其他回覆照平常寫。使用者同時管很多視窗，要一眼看懂重點、具體例子、下一步怎麼決定。第一行就是 `# 總評`，其餘兩段用粗體標題，照字面、照順序：
1. **總評與核心結論**（`# 總評`，一級標題）：第一行只寫 `**4/5（建議採用／不採用）**`，不加五級文字標籤（分數已表達同樣意思）（5 重大達成／4 大致達成 有部分退步／3 一半一半／2 主目標達成 但是有副作用／1 失敗；有實質退步就不給 5）。第二行直接寫**核心結論**：一句話講清楚這次要驗證的問題成不成立、為什麼，不要把結論藏在後面。
2. **關鍵數據與例子**（`**關鍵數據與例子**`）：一張小表，用勝率從多少到多少、對哪個對手這種講法；加最多 2–3 點說明哪裡變好、哪裡變差或副作用。禁止把同一個指標拆成正反兩段重複講。
3. **要你決定的事**（`**要你決定的事**`）：approve 與否、2–3 個下一步選項，標明建議哪個、為什麼。
- 一則回覆只寫一份三段；稽核也用這三段（核心結論＝原結論站不站得住，關鍵數據＝核對成立與有疑慮處）。
- 禁止回報工程基本功與除錯流水帳：資料核對吻合、事前 commit、修掉過程腳本 bug、區間、種子、雜湊、檔案路徑、memory ID、測試數，一律只進 memory 和 runtime 檔；回覆在第 3 段結束，不加「細節」段。
- 派工開跑與超時續跑只報 1–2 行狀態（在做什麼＋目前進度），不預先背誦方法細節。派工 spec 要子 session 回報時，也指定這三段。
- 收尾前由 `.claude/hooks/report_format_reminder.py`（PostToolUse，matcher `mcp__ccd_turn__wrap_up`）提醒。

## Commands
```bash
npm test          # node --test, must stay green
npm run game      # play one game unattended -> runtime/last-game.log
npm run gestures  # dead/misfired click report
```

## NEVER
- Never read, print or paste `.env.local` (it holds the Gateway key). It is loaded only through `--env-file-if-exists` or `process.loadEnvFile`.
- Never commit unless the user asks.
