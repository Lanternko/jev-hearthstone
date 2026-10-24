# Jev Hearthstone

讓 Jev 模型在本機打爐石戰記的機器人：讀 `Power.log` 得到盤面，用規則與搜尋把合法行動剪成少數候選，交給 Jev（`typesafe-ai/jev`，經 Vercel AI Gateway）選一步，再用滑鼠點出來並核對盤面真的變了。不讀螢幕畫面、不注入遊戲程序。

目前主力是開放棄牌術（`decks/warlock-discard`）。可以無人值守連打天梯批次，分析見 [runtime/winrate-game104-153.md](runtime/winrate-game104-153.md)。逐日的修正與裁定都記在 [STATUS.md](STATUS.md)。

<img width="519" height="869" alt="image" src="https://github.com/user-attachments/assets/f99826de-9cde-4e67-af92-8404411400b5" />


## 組成

| 部分 | 做什麼 | 主要檔案 |
|---|---|---|
| 卡面與盤面判讀 | 增量解析 `Power.log`，只取本方手牌與公開資訊，對照完整卡面快照寫成候選描述 | `src/power.mjs`、`src/bridge.mjs`、`src/describe.mjs`、`src/mechanics.mjs`、`data/cards.enUS.json` |
| 滑鼠點擊 | 實體換算成視窗像素，經常駐 PowerShell worker 以 SendInput 點擊、拖曳，再核對盤面 | `src/layout.mjs`、`src/execute.mjs`、`src/win.mjs`、`src/input-worker.ps1`、`src/verify.mjs`、`src/play.mjs` |
| 打法 | 每副牌一個資料夾：給 Jev 讀的原則與起手留牌表；使用者對實戰的裁定寫成規則 | `decks/*/strategy.md`、`decks/*/mulligan.json`、`src/policy.mjs`、`runtime/strategy-long-2026-09-21.md` |
| Jev | 呼叫模型選一步；存取失敗時的備援與復原 | `src/jev.mjs`、`src/choose.mjs`、`src/decide.mjs`、`src/jev-recovery.mjs` |
| 剪枝與搜尋 | 整回合 beam search 與確定性模擬、斬殺偵測；規則分成硬刪（veto）與偏好（prefer）兩層 | `src/plan.mjs`、`src/sim.mjs`、`src/lethal.mjs`、`src/rule-release.mjs`、`src/planner-version.mjs` |
| 對局迴圈 | 等對局開始、逐步決策、起手換牌、被吞掉的動作處理 | `src/await-game.mjs`、`src/loop.mjs`、`src/mulligan-*.mjs`、`src/dead-skip.mjs` |
| 腳本 | 無人值守天梯批次、接近傳說時錄影、讀階級、賽後健康檢查 | `runtime/*.mjs`、`runtime/*.ps1`、`runtime/*.sh` |
| 評估 | 離線重播、配對比較、人工標註盤面 | `src/eval-*.mjs`、`eval/` |

搜尋的做法參考了 Silverfish，取捨見 [docs/silverfish-research.md](docs/silverfish-research.md)；每次改動規則層的依據與新舊比較在 `docs/` 其他檔案。決策引擎以版本凍結：預設 `silverfish-v1-veto-audit-v1`，用 `JEV_SEARCH_VERSION` 可切回 `src/planner-version.mjs` 列出的舊版，對應快照在 `eval/runs/`，不可刪。

## 安裝

Node.js 22，Windows。

```bash
npm ci
```

把 `.env.example` 複製成 `.env.local` 並填入：

- `AI_GATEWAY_API_KEY`：Vercel AI Gateway 金鑰。
- `JEV_ACCOUNT`：自己的 BattleTag，寫法與 `Power.log` 相同。賽後判定勝負要用，只留在本機。

`.env.local` 不進版本庫，也不要貼進對話。

第一次使用前跑 `npm run calibrate` 校正 `src/layout.mjs`：它只移動游標、不點擊。座標是 16:9 內容區的比例，執行時乘上實際 client rect，所以 1920x1080 視窗與 2560x1440 全螢幕共用同一組數字。

## 使用

### 打一場

1. `npm run smoke` 確認 Jev 可以呼叫。回覆無權限或額度錯誤時先處理；規則備援不是 Jev 在思考。
2. 在爐石選好模式與套牌。
3. `npm run game`，再按遊戲裡的「開始」。這個命令只等待並接管對局，不會替你排隊。不要同時開第二份。
4. 放手讓它打完，賽後再看 `runtime/last-game.log` 與 `npm run gestures`。

### 連打天梯

```bash
node runtime/ranked-continuous.mjs --games=50
```

每場重新排隊、打完後讀勝負與階級；六連敗、模型故障、配對連續失敗或出現 `runtime/stop` 檔就停。加 `--no-record` 不啟動錄影；預設會帶起 `runtime/record-legend.mjs`，從鑽石 2 開始錄到確認傳說後一分鐘（需要 ffmpeg）。階級讀自 Hearthstone Deck Tracker 的 `DeckStats.xml`。排隊用的點擊座標以 2560x1440 為基準。

### 其他命令

- `npm run decide -- --inspect`：只顯示目前盤面；不加 `--inspect` 則呼叫 Jev 存下一步決策。
- `npm run play`：執行已存的決策，`--dry` 只移動游標。
- `npm run override`：人工指定一個合法行動。
- `npm test`：解析、資訊遮罩、候選、規則、座標與手勢測試，全部離線。
- `npm run eval-silverfish`、`npm run eval-combo-admission`、`npm run eval-strength -- results.json`：離線比較新舊引擎與分析 A/B 對局，不呼叫模型也不碰遊戲。
- `npm run label`、`npm run eval`：標註盤面並對標註評分。

## 資料與隱私

- 傳給模型的只有過濾後的盤面、策略與候選；不含 BattleTag、GameAccountId、原始日誌、對手手牌或牌堆順序。
- `runtime/` 底下的日誌、截圖、錄影與決策紀錄都留在本機，版本庫只收腳本與筆記。
- `data/cards.enUS.json` 是 2026-10-24 的完整卡面快照，SHA256 `06E61CE4AFD2BCE9C2FF53DE8C2C1CC0080DF27AA4743C8EEE3D63894D10DC04`，來源 <https://api.hearthstonejson.com/v1/latest/enUS/cards.json>。

## 限制

- 只支援 `decks/` 裡的牌組：`warlock-discard`、`dh-void` 有完整規則；`warlock-zoo`（2026-10-24 新增）只有牌表，模擬器覆蓋見 `docs/warlock-zoo-sim-coverage.md`。規則與棄牌模型是照這些卡面寫的，換牌要重寫 `decks/` 與對應規則。
- 模擬只算確定的部分。隨機棄牌並列、抽牌、發現與未建模的效果會停下來重新觀察，不猜結果，也不模擬對手回合。
- 自動化違反暴雪的使用條款，帳號風險自負。
