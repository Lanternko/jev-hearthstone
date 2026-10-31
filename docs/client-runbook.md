# 實戰客戶端操作手冊

新人或新 agent 要在真的爐石客戶端上跑機器人，只看這一份。2026-10-29 逐項對照目前程式碼寫成；記憶（`memory/`）與程式碼不一致時以程式碼為準，過期項目列在第 6 節。引用寫法：`檔案:行號` 或 `L-`／`F-`／`R-` 編號（在 `memory/` 內 grep）。行號會漂移，改過那個檔就重核。

規則先講：任何命令都不能閃黑窗（使用者正在用電腦）。`win.mjs` 的 PowerShell worker 與錄影 sidecar 都帶 `windowsHide`；自己新增起子程序的腳本也要帶 `windowsHide: true`（Python 用 `CREATE_NO_WINDOW`）。

## 1. 前置條件與權限

| 項目 | 做法 | 為什麼 | 來源 |
|---|---|---|---|
| Node 22 | `npm ci` | `package.json` 沒有 engines 欄位，22 是 README 的要求；腳本用 `process.loadEnvFile`、`--env-file-if-exists`（需 Node 20.12+） | `README.md` 安裝、`bridge.mjs:16` |
| `.env.local` | 由 `.env.example` 複製；只有 `AI_GATEWAY_API_KEY`、`JEV_ACCOUNT` | `JEV_ACCOUNT` 是賽後判勝負的 BattleTag，沒有它 `health.mjs` 報錯；絕不讀、印、貼這個檔 | `.env.example`、`runtime/health.mjs`、`game-health.mjs:20` |
| 爐石 | 已登入、能進天梯／模式 | 機器人不登入、不選模式、不選牌組 | 無程式碼處理 |
| HDT（Hearthstone Deck Tracker） | 開著，且不要關它的記錄 | 階級讀自 `%APPDATA%/HearthstoneDeckTracker/DeckStats.xml`（`rank.mjs`、`record-legend.mjs`）；HDT 的右側牌組面板還會蓋住結束回合鈕（L-063） | `runtime/rank.mjs` |
| 權限對等 | 爐石與機器人用同一個權限層級（都一般或都系統管理員） | Windows UIPI 擋下低權限程序送給高權限視窗的輸入：`SendInput` 回傳 0，所有點擊靜默變成死手勢 | `input-worker.ps1` 約 30-32 行註解 |
| DPI | 不用設定 | worker 啟動就呼叫 `SetProcessDPIAware`，座標是實體像素 | `input-worker.ps1` 約 36 行 |
| 前景視窗 | 不用手動 | `Arm()` 每次手勢前會 `SetForegroundWindow`、睡 220ms、移動游標兩次並探測；ranked 腳本每次點擊前也呼叫 `win.focus()` | `input-worker.ps1` 約 85 行、`ranked-continuous.mjs:41` |
| 輸入 worker | 常駐隱藏 PowerShell | `win.mjs` 啟動 `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File input-worker.ps1`，`windowsHide: true`；每個手勢走它的 stdin/stdout，不另開程序 | `src/win.mjs` |
| `Power.log` | `D:/遊戲/Hearthstone/Logs/<最新資料夾>/Power.log` | 盤面唯一來源；路徑寫死在 `LOG_ROOT`，遊戲裝在別處要改程式 | `src/power.mjs` |
| `log.config` | `%LOCALAPPDATA%\Blizzard\Hearthstone\log.config` 要開 Power 記錄 | 程式碼不檢查；沒開就永遠 `No Power.log found`，`await-game` 等 10 分鐘後失敗 | 無程式碼檢查 |
| ffmpeg | 錄影才需要；不錄就加 `--no-record` | `record-legend.mjs` 用 `gdigrab` 15fps 抓視窗（標題預設 `《爐石戰記》`），最多 9 小時；錄影放 `runtime/videos/` | `runtime/record-legend.mjs` |
| Jev 金鑰與費用鎖 | 只在要呼叫 Jev 時才相關 | `JEV_OFFLINE=1`（`game-zoo` 預設）完全不呼叫；否則 `ask()` 在 `JEV_PRICING_CHECKED_UNTIL`（預設 2026-09-25，已過）之後直接丟錯，要在 `.env.local` 設新日期 | `src/jev.mjs:9-10` |

### Claude Code 需要放行的命令

Session 會跑的命令只有這幾類，放行一次就不會一直被問：

- `node ...`：`npm run game|game-zoo|game-zakajz|gestures|smoke|calibrate`、`npm test`、`node runtime/ranked-continuous.mjs ...`、`node runtime/check-window.mjs`、`node runtime/health.mjs`、`node runtime/rank.mjs`。
- `powershell.exe -NoProfile -File runtime/check-window.ps1`（由 `check-window.mjs` 代跑，一般不用自己叫）。
- 檔案讀取：`runtime/last-game.log`、Power.log、`runtime/decisions.jsonl`。

不要放行、也不要用的：任何改解析度、改系統設定、關 HDT 的命令。

## 2. 視窗與解析度

**只有 2560x1440 全螢幕是驗證過的**（L-063）。其他大小沒測過，視窗化（1600x900、1227x739）時 HDT 右側面板蓋住結束回合鈕，結束回合點擊會連續死掉。

| 步驟 | 做法 | 為什麼 |
|---|---|---|
| 1 | 在爐石按 Alt+Enter 切到全螢幕；解析度在遊戲設定選 2560x1440 | 座標是 16:9 內容區的比例，執行時乘上實際 client rect（`layout.mjs:34`，`w = min(width, height*16/9)`） |
| 2 | 第一次 Alt+Enter 可能落在「有標題列的中間狀態」（client 位移 10,42），再按一次 | 位移會讓所有座標偏掉 |
| 3 | `node runtime/check-window.mjs` | 唯讀；檢查 client 是 2560x1440、原點 0,0、無標題列（WS_POPUP）、與機器人權限層級相同（未知時 WARN）；全部沒 FAIL 才 exit 0。遊戲沒開輸出 `FAIL hearthstone_not_running` |
| 4 | 開始後看 `runtime/last-game.log` 有 `client 2560x1440` | `loop.mjs` 在 `boxOf(win)` 後印出。行號看入口：`npm run game` 是第 2 行；`game-zoo` 因為第 1 行是 `deck <deck>, network <name>`，所以是第 3 行 |

注意：
- 解析度目前只手動切換，repo 裡沒有會改解析度的腳本；`check-window.mjs` 只讀不改。
- 排隊與關結果畫面的點擊（`ranked-continuous.mjs:41`）是 `x*g.width/2560`、`y*g.height/1440` 直接縮放，沒有 letterbox 修正；非 16:9 時這些點擊會偏。
- 歷史：F-879 把 1600x900 與 1227x739 的死手勢歸因於視窗大小；L-061 據此要求全螢幕；L-063 找到真因是 HDT 右側面板蓋住按鈕，全螢幕才避開。三者的取捨見第 6 節。

## 3. 開一場與連續天梯

### 單場

先把爐石停在「牌組已選好、可按開始」的畫面。

| 指令 | 做什麼 | 輸出 |
|---|---|---|
| `npm run game` | `await-game.mjs`（每 3 秒查一次，最多等 10 分鐘直到狀態是 RUNNING，否則印 `no game started within 10 minutes` 並 exit 1）然後 `loop.mjs`。**不會替你排隊**：要自己在遊戲裡按開始 | `runtime/last-game.log` |
| `npm run game-zoo` | `game-zoo.mjs`：預設牌組 `warlock-zoo`；先檢查該牌組有網路與模型檔（沒有就直接失敗），再以 `JEV_DECK`、`JEV_FOLLOW_NET=1`、`JEV_OFFLINE=1` 起子程序等開局並打 | 同上，第 1 行是 `deck <deck>, network <name>` |
| `npm run game-zakajz` | 同上，牌組 `warlock-zakajz` | 同上 |

`loop.mjs` 參數：`--dry`（只移動游標）、`--max=N`（最多 300 個動作）、`--minutes=N`（預設 45 分鐘）。為什麼要放手：Claude 在局中看畫面每輪都重送全部 context，是上週額度燒掉的主因（專案 `CLAUDE.md`）。

### 連續天梯

```bash
JEV_DECK=warlock-zakajz JEV_FOLLOW_NET=1 JEV_OFFLINE=1 node runtime/ranked-continuous.mjs --games=N --dismiss-results
```

| 旗標 | 效果 |
|---|---|
| `--games=N` | 打滿 N 場（整數 >= 1）就停，`game_limit_reached` |
| `--wins=N` | 勝場滿 N 就停，`win_limit_reached` |
| `--no-record` | 不起 `record-legend.mjs` 錄影 sidecar（預設會起，沒有 ffmpeg 要加這個） |
| `--dismiss-results` | 第 1 場第 1 次嘗試也先關結果畫面（用在上一場剛打完、停在結算時）；第 2 場起一律會關 |

環境變數：`JEV_SEARCH_VERSION` 沒設就用 `src/planner-version.mjs` 的 `defaultVersion`（目前 `silverfish-v1-veto-audit-v1`）；`.env.local` 以 `process.loadEnvFile` 讀入。其餘見第 4 節表格。

流程（`ranked-continuous.mjs`）：

| 階段 | 行為 | 行 |
|---|---|---|
| 鎖 | `runtime/runner.lock` 存 pid；舊 pid 還活著就丟 `Another runner owns the lock`，死的就改名收走。既有的 `runtime/stop` 先改名成 `previous-stop` | 24-27 |
| 起跑檢查 | 讀 Power.log 狀態是 RUNNING 就拒絕：`An existing game is running; refusing to queue over it`。沒有 Power.log（剛開的客戶端）視為沒對局 | 47-49 |
| 排隊 | 第 2 場起（或第 2 次嘗試起，或帶 `--dismiss-results`）：點 (1267,866) 關結果、等 2 秒、點 (1280,1300) 四次各等 3 秒；然後點 (1867,1174) 開始。座標以 2560x1440 為基準 | 58-59 |
| 等開局 | 跑 `await-game.mjs`，逾時 150 秒；成功才算開始 | 60-61 |
| 嘗試 | 每場最多 3 次，三次都沒開局就停：`match_failed_to_start` | 56-63 |
| 打 | `loop.mjs`，逾時 48 分鐘；輸出到 `runtime/ranked-<時間>/game-NNNN.log`，結束後複製成 `runtime/last-game.log` | 65-67 |
| 賽後 | 等 20 秒，跑 `runtime/health.mjs <開始時間>` 與 `runtime/rank.mjs`，存該局 Power.log 與 decisions 切片 | 68-76 |

停止條件（`state.stopReason`，寫進 `status.json`）：

| 原因 | 觸發 |
|---|---|
| `game_limit_reached`／`win_limit_reached` | 到 `--games`／`--wins` |
| `user_stop` | `runtime/stop` 檔存在（每場前和每次嘗試前檢查）。想停就建立該檔，不用殺程序 |
| `match_failed_to_start` | 3 次嘗試都沒開局 |
| `model_trouble` | `health.mjs` 非 0：致命錯誤，或 `rule_fallback` 列 >= 3（`game-health.mjs:30`） |
| `mulligan_execution_misfire` | loop exit 2、對局已結束、勝負已知（loop 印 `STOP_AFTER_GAME`） |
| `game_incomplete_or_runner_error` | loop 非 0 或逾時、對局未結束、或勝負 Unknown |
| `client_restart_failed` | Battle.net 斷線後重開用戶端失敗，或回不到套牌畫面（F-893） |
| `repeated_disconnects` | 同一批第 3 次斷線且沒接回對局 |
| `six_consecutive_losses` | 連輸 6 場 |
| `runner_error` | 例外（含上面的拒絕訊息） |

輸出位置：`runtime/ranked-<時間>/`（`status.json`、`record-legend.log`、`game-NNNN.log`、`game-NNNN-Power.log`、`game-NNNN-decisions.jsonl`、`opponent-prior-at-launch.json`、原始碼雜湊）、`runtime/batch.txt`（每場一行）、`runtime/active-ranked-run.json`。結束時鎖改名成 `finished-runner.lock`。

斷線復原（F-893，2026-10-30 起自動）：點擊沒反應時 loop 查最新 log 資料夾的 `BattleNet.log`，有新的 `Bnet_OnDisconnected` 就 exit 3（不再算成 8 次點擊失敗）。runner 的 `recover()`（`src/reconnect.mjs`）：等 VPN（探 5090:22，最多 5 分鐘，穩定 20 秒；逾時就走 Wi-Fi）→ `taskkill` 爐石、把舊資料夾的 Power.log 改名成 Power_old.log → `Battle.net.exe --exec="launch WTCG"` → 90 秒內新資料夾出現 Power.log 且對局 RUNNING 就接回去繼續打（`game-NNNN-rejoin.log`），否則該局記 `Disconnected`（算輸），用 `LoadingScreen.log` 的 `currMode=` 判斷畫面，只在 HUB 點《爐石戰記》(1275,435) 回套牌畫面，接著排下一局。同一批第 3 次斷線停 `repeated_disconnects`；用戶端沒起來或回不到套牌畫面停 `client_restart_failed`。人工處理照 L-039。

階級：`rank.mjs` 讀 HDT `DeckStats.xml` 最後一場天梯，印 `<時間> <勝負> level N stars N legend N`（鑽石 10 = 41 … 鑽石 1 = 50，傳說 = 51），達傳說 exit 0。

## 4. 出牌輸入

| 手勢 | 用在 | 時序（`win.mjs`，皆為隨機區間） |
|---|---|---|
| click | 選目標、按鈕等其餘步驟 | 點前等 140-260ms，按住 50-95ms |
| drag | 手牌拖到場上（`execute.mjs` 的 `isDrop`：「drop into slot」「play onto the board」） | 點前 150-250ms，按住 90-140ms |
| fling | 攻擊（來源是場上或英雄、下一步是目標）；`JEV_FLING=0` 退回兩次點擊 | 點前 30-90ms、按住 40-100ms、9-15 步、每步 6-12ms、彎曲 +-0.08、放開後 25-60ms；全部乘 `JEV_FLING_SCALE` |
| cancel | 右鍵取消（`RDown`、70ms、`RUp`） | 見下方門檻 |
| nudge | 心跳，微移游標 | 每 3 秒，忙碌時不送 |

共通：點擊、拖曳、fling 落點都加 +-3px 抖動（`off() = between(-3,3)`）；步驟間隔 180-420ms。為什麼要心跳：實測游標靜止 10 秒以上後 17/18 個手勢死掉（`loop.mjs` 的 `setInterval` 註解）。

`handGrab`（`layout.mjs`）：手牌抓點的位移只在 2560x1440、7 張手牌量過。從最左 (-56,-48) 線性到最右 (+19,-111)；3 張以下用 `y - 40k`。手牌張數很少或很多時沒量過，抓不到牌先懷疑這裡。

### 時序與判定門檻（`loop.mjs`）

| 項目 | 值 |
|---|---|
| 手勢後穩定檢查 | 每 250ms 用 `verdict()` 輪詢；起手換牌等 3000ms，其餘等 `DEAD_MS`（5000ms）仍無變化算死 |
| 取消 | 非起手動作，且（手勢數 > 1 或有目標），且結果是死或 misfire，就右鍵取消再等 400ms |
| 死手勢 | 存 `runtime/shots/dead-g<局>t<回合>-<動作>-<時間>.jpg`，印 `no change after ... ; skipping`，等 600ms |
| `deadSkip` | 同一回合同一個 `type:entityId:targetId` 死 2 次就不再試（`dead-skip.mjs`）；結束回合、起手換牌、選擇永不放棄 |
| `stuck` | 連續 8 次死的非起手手勢就停：`Eight dead gestures in a row -- coordinates are off; stopping.`；有手勢落地就歸零 |
| `missed` | 連續 3 次 misfire 就停：`Three misfires in a row -- layout is off; stopping.` |
| 起手換牌 | 確認失敗 6 次停；15 秒收不到結果停（`Mulligan result unverified; stopping.`，exit 1）；`MULLIGAN MISFIRE: receipt unsafe to recover` exit 1；`MULLIGAN RECOVERED` 會重新決策，結束時印 `STOP_AFTER_GAME` exit 2 |
| 判定結果（`verdict`） | `ok`／`misfire`／`unverified`／`pending`／`dead`，由 `Power.log` 證實盤面真的變了，不看畫面 |
| 截圖 | 每個自己回合與每次問 Jev 各存一張 `runtime/shots/g…t….jpg`（`bridge.mjs:47`） |

每個手勢都附加到 `runtime/gestures.jsonl`；起手換牌時序在 `runtime/mulligan-timing.jsonl`。

### `JEV_*` 環境變數（共 32 個，皆為可選；預設值直接來自程式碼）

| 變數 | 預設 | 作用 | 檔 |
|---|---|---|---|
| `JEV_TURN_SETTLE` | 3500 | 回合開始後等多久（ms） | loop |
| `JEV_ACTION_SETTLE` | 1200 | 一般動作後等 | loop |
| `JEV_DRAW_SETTLE` | 3000 | 抽牌後等 | loop |
| `JEV_DRAW_EACH` | 800 | 每張抽牌多等 | loop |
| `JEV_DEAD_MS` | 5000 | 手勢無變化判死的時間 | loop |
| `JEV_BOARD_SETTLE` | 1200 | 場面變動後等 | loop |
| `JEV_PLAYBACK_QUIET` | 1500 | 等對手動畫靜止所需的安靜時間 | loop |
| `JEV_PLAYBACK_CAP` | 12000 | 等動畫的上限 | loop |
| `JEV_FLING` | 開 | `0` 退回兩次點擊攻擊 | execute |
| `JEV_FLING_SCALE` | 1 | fling 全部時序倍率 | win |
| `JEV_PLANNER` | 開 | `0` 退回未剪枝的原始選單 | bridge、decide |
| `JEV_FOLLOW_NET` | 關 | `1` 讓自我對弈網路直接決策 | bridge |
| `JEV_NET_ADVICE` | 關 | `1` 時網路的選擇當預設並顯示給 Jev（Jev 可推翻） | bridge |
| `JEV_OFFLINE` | 關 | `1` 完全不呼叫 Jev | bridge |
| `JEV_FALLBACK_MS` | 5000 | Jev 逾時多久後改用備援 | bridge |
| `JEV_BACKUP_MODEL` | `liquid/d1` | 備援模型 | bridge |
| `JEV_MODEL` | `typesafe-ai/jev` | 主模型 | jev |
| `JEV_TIMEOUT_MS` | 5000 | 單次呼叫逾時 | jev |
| `JEV_PRICING_CHECKED_UNTIL` | `2026-09-25T00:00:00Z`（已過） | 費用鎖，過期後呼叫 Jev 直接丟錯 | jev |
| `JEV_LOG_MAX_AGE_MS` | 600000 | 只影響 `npm run decide`：Power.log 修改時間超過就拒絕決策 | decide |
| `JEV_DECK` | 依英雄職業；找不到用 `DEFAULT_DECK` | 牌組資料夾名 | deck |
| `JEV_NET_MODEL` | 無 | 指定網路模型檔 | selfplay-shadow、mulligan-table、game-zoo |
| `JEV_SHADOW` | 開 | `0` 關掉影子推論 | selfplay-shadow |
| `JEV_SEARCH_VERSION` | `silverfish-v1-veto-audit-v1` | 凍結版決策引擎 | planner-version、ranked-continuous |
| `JEV_NET_SEARCH` | 關 | `1` 開網路搜尋 | net-search |
| `JEV_NET_SEARCH_SAMPLES` | 4 | 抽樣數 | net-search |
| `JEV_NET_SEARCH_TURNS` | 1 | 1 搜到本回合結束；2 連對手下一回合 | net-search |
| `JEV_NET_SEARCH_MS` | 3000 | 時間上限 | net-search |
| `JEV_NET_SEARCH_WIDTH` | 8 | beam 寬度 | net-search |
| `JEV_NET_SEARCH_EXPAND` | 4 | 展開數 | net-search |
| `JEV_NET_SEARCH_REPLIES` | 2 | 對手回應數 | net-search |
| `JEV_ACCOUNT` | 無（必填，賽後判勝負） | BattleTag，寫法同 `Power.log` | health |

起手與各牌組的慣用組合：`JEV_DECK=<牌組> JEV_FOLLOW_NET=1 JEV_OFFLINE=1`（`game-zoo` 已替你設）。設錯大小寫或拼錯名稱不會報錯，變數只是被忽略。

## 5. 賽後檢查

只在對局結束後看一次，不要局中輪詢。

| 順序 | 看什麼 | 要找什麼 |
|---|---|---|
| 1 | `runtime/last-game.log` | `client 2560x1440`；`no change after ...`（死手勢）；停止訊息（`Eight dead gestures`、`Three misfires`、`Mulligan ...`、`STOP_AFTER_GAME`） |
| 2 | Power.log 的 `PLAYSTATE` 行 | `TAG_CHANGE Entity=<帳號> tag=PLAYSTATE value=WON\|LOST\|TIED\|CONCEDED` 是勝負的唯一依據（`game-health.mjs:20`）；`runtime/health.mjs` 印 `Win`／`Loss`／`Tie`／`?` 或 `... \| STOP <原因>`（exit 2） |
| 3 | `runtime/decisions.jsonl` 尾端 | 每步決策；`rule_fallback` 列 >= 3 表示 Jev 沒在思考（`modelTrouble`） |
| 4 | `npm run gestures` | 見下 |

`npm run gestures` 的讀法：它讀整份累積的 `runtime/gestures.jsonl`（所有場次，不只最近一場），所以要看單場請看 `last-game.log`。輸出有：活／死手勢計數、`verified: ok/misfire/unverified/dead`、misfire 清單、「心跳後閒置超過 10 秒」比例、死 vs 活的特徵差表（差距 >= 15% 標 `maybe`，>= 30% 標 `<<< SUSPECT`）、「N of M 死手勢機械上看起來完美」、最後 10 個死手勢的探針（x,y、偏差 dx,dy、前景、hwnd）。**`window under != client` 或 hwnd 不符，代表點擊落在別的視窗（例如 HDT 疊加層）**，回第 2 節檢查解析度與 HDT 面板（L-063）。

## 6. 已知過期或矛盾

| 項目 | 過期說法 | 程式碼實況 | 處置 |
|---|---|---|---|
| L-009 | 開局前會截圖確認「尋找對手」畫面 | `ranked-continuous.mjs` 沒有這個截圖檢查：關結果、點開始、`await-game` 等 RUNNING | L-009 已於 2026-10-30 整併時刪除（以本手冊為準） |
| L-011 | 排隊最多重試 10 次、呼叫 `pin.ps1` 釘住視窗 | 最多 3 次、沒有 `pin.ps1`；視窗聚焦由 `win.focus()` 與 worker 的 `Arm()` 做 | 同上 |
| L-061 | 全螢幕才行、用 `last-game.log` 第 2 行檢查 `client` | 已被 L-063 部分推翻（真因是 HDT 面板）；行號依入口而異（第 2 或第 3 行） | 同上 |
| F-879 | 視窗大小造成死手勢 | L-063 指出更可能是 HDT 右側面板 | 已在 `memory/findings.md` 補狀態 |
| `README.md` 第 40 行 | 座標是比例，1920x1080 視窗與 2560x1440 全螢幕共用同一組數字 | 比例換算沒錯，但實戰只驗證過 2560x1440 全螢幕 | 已改 |

### 可能的實戰缺口（未修，給 role-deploy）

排隊後**沒有任何檢查確認配對真的開始**（L-009 以為有）。現況只靠 `await-game` 等最多 150 秒、再重試最多 3 次。若按下開始後遊戲卡在別的畫面（例如結果畫面沒關乾淨、跳出對話框），三次後才以 `match_failed_to_start` 收場，中間的點擊可能點到錯的東西。要加檢查請改 `runtime/ranked-*`，那不屬於本手冊的範圍。

### 還沒驗證的

- `check-window.mjs` 的權限層級與 WS_POPUP 判斷只對資源管理器視窗試過邏輯，沒對真的爐石視窗跑過；第一次用請對照 `last-game.log` 的 `client` 行交叉確認。
- `handGrab` 只量過 7 張手牌。
- 本手冊沒有實際點擊遊戲驗證任何步驟，內容來自讀程式碼與既有紀錄。
