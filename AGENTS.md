# jev-hearthstone（給 Codex 與其他 agent）

爐石機器人。Jev（經 AI Gateway）選動作，`src/loop.mjs` 點擊；實戰的 zoo 由自戰網路出牌。回覆用繁體中文。本檔的規則與 `CLAUDE.md` 一致。

## 共用記憶（`memory/`，使用者規則，2026-10-27）
- **所有 agent（Claude、Codex、雲端專案 thread）只透過 `memory/` 溝通。** 不靠對話交接：要交給別的 agent 的事，一律寫進 `memory/handoff.md` 或對應欄位檔。規則與欄位定義見 `memory/README.md`。
- **開工**：先讀 `memory/handoff.md`，再讀 `memory/lessons.md`、`memory/rulings.md`；`findings.md`／`experiments.md` 需要時用 grep 查。
- **收工**：新發現寫進 `findings.md`、實驗寫進 `experiments.md`、使用者裁定與遊戲規則寫進 `rulings.md`、教訓寫進 `lessons.md`（只追加新 ID；狀態改變時改原條目的狀態欄並註明日期，不刪除）。最後**覆寫** `handoff.md` 為目前狀態。
- **每個抓到的錯誤都寫成 lesson**；能自動檢查的就加測試，並寫進該 lesson 的「對應測試或關卡」欄。
- `STATUS.md` 已停用，舊紀錄在 `memory/archive/STATUS-2026-10-27.md`（只讀）。模型版本筆記在 `docs/selfplay-versions.md`。

## 工作方式（使用者規則，2026-09-24）
- **對局無人值守**：在套牌畫面跑 `npm run game`，打完寫 `runtime/last-game.log`。不要盯局、不要輪詢、不要中途截圖。
- **賽後分析一次**：讀 `runtime/last-game.log`、Power.log 的 `PLAYSTATE` 行（`D:/遊戲/Hearthstone/Logs/<latest>/Power.log`）、`runtime/decisions.jsonl` 尾端、`npm run gestures`。
- **一個 session 一批修正**：做完一批就寫進 `memory/`，請使用者開新 session，不延續舊對話。

## 指令
```bash
npm test          # node --test，必須全綠
npm run game      # 無人值守打一場 -> runtime/last-game.log
npm run gestures  # 失效／誤點報告
```

## 絕不
- 絕不讀取、印出或貼上 `.env.local`（內有 Gateway 金鑰）。只透過 `--env-file-if-exists` 或 `process.loadEnvFile` 載入。
- 使用者沒要求就不 commit。
