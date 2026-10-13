# Spec：自戰模型實戰旁聽（shadow mode）

背景在 `docs/selfplay-shadow-handoff.md`，先讀它。本文件是實作規格。

## 目標

實戰照舊由 Jev 出牌。每次 bridge 決定一步時，自戰網路（`models/selfplay/warlock-discard-v5.json`）對同一個盤面算一次，把「它會選什麼」寫成一行 JSON。網路不點任何東西，也不改變 Jev 看到的選項。

## 不可以做的事

- 不讀、不印、不貼 `.env.local`。
- 不 commit、不 push。
- 不啟動遊戲（不跑 `npm run game`、`src/loop.mjs`），不呼叫 Gateway。
- 不改 `src/selfplay-encode.mjs`、`src/selfplay-net.mjs`、`models/`：模型是照這份編碼訓練的，動了就對不上。
- 不改 `publicState` 的輸出（`src/power.mjs`）：它會進 Jev 的提示與 `decisionFingerprint`。需要更多欄位時，從 `parsed` 另外讀。
- `npm test` 必須全綠（目前 629 個）。

## 已查明的事實

- `snapshot()`（`src/power.mjs:225`）回傳 `{parsed,state,actions,mtime}`；`bridge.mjs` 的 `inspect()` 直接回傳它，所以 `next()` 裡拿得到 `parsed`。
- `parsed.entities` 是 `Map<id,{id,cardId,tags,playerId?}>`。玩家實體有 `RESOURCES`、`FATIGUE`、`CURRENT_PLAYER`；先後手可看 `FIRST_PLAYER`（`src/eval-mulligan-cohorts.mjs:60` 有用法）。
- `state.turn` 是遊戲的 `TURN` 標籤，兩邊合計，與編碼要的 `s.turn` 同義。
- `state.me`／`state.opponent` 有 `mana, maxMana, handCount, deckCount, board, heroClass`；只有 `state.me` 有 `hand, fatigue`。
- `fromState(state,actions,{full:true})`（`src/sim.mjs:67`）已給 `mana, hand, me, opp, weapon, power, locations, sites`，場上角色有 `side`。
- `actions` 的形狀：`{id,type,option,entityId,targetId?}`，`type` 另有 `END_TURN`、`CHOICE`（`entityId` 是選項）、`MULLIGAN`。
- 編碼讀哪些欄位：見 `src/selfplay-encode.mjs`（74 行，全部讀完）。`thing(s,id)` 依序在場上、手牌、`s.sites`、`s.deck`（比 `entityId`）找步驟指到的東西。
- 重放存檔的寫法：`src/eval-sim-fidelity.mjs`（`createParser`、`publicState`、`candidates`，以及怎麼把真實動作對到 `kind/id/targetId`）。存檔在 `runtime/ranked-*/game-NNNN-Power.log`，`runtime/` 不在 git 裡。
- 牌表：`decks/warlock-discard/list.json`；`loadList`、`cardDb`、`rawCard` 在 `src/selfplay.mjs`。

## 要做的東西

### 1. `src/selfplay-shadow.mjs`

`shadowView(parsed,state,actions,{cards,list})` → `{s,legal,byAction,notes}`，或在不適用時回 `null`（對局未進行、`MULLIGAN`、沒有動作）。

`s` = `fromState(state,actions,{full:true})` 再補：

| 欄位 | 來源 |
|---|---|
| `crystals` | `state.me.maxMana` |
| `fatigue` | `state.me.fatigue` |
| `seat` | 我方玩家實體 `FIRST_PLAYER==='1'` 為 0，否則 1 |
| `turn` | `state.turn` |
| `discardCount` | 先在存檔的 Power.log 裡找有沒有可靠的標籤或可數的事件；找不到就填 0，並在 `notes` 記 `discardCount unknown`。對方同理。 |
| `deck` | 牌表每張牌 `rawCard`，減去我方已離開牌庫且 `cardId` 在牌表裡的實體（每個 id 最多減到 0）。長度必須等於 `state.me.deckCount`：太多就丟掉多的，太少就補名字不在詞彙裡的佔位牌，並記在 `notes`。 |
| `choice` | `state.choice` 為 `GENERAL` 時：選項全在手牌 → `{kind:'site',options}`，否則 `{kind:'discover',options}`。發現的選項若與 `s.deck` 裡某張牌同名，把那張牌的 `entityId` 改成選項的 `entityId`，讓編碼認得它。否則 `null`。 |
| `them` | `{crystals:opponent.maxMana, hand:Array(handCount), deck:Array(deckCount), fatigue, discardCount, weapon:{atk,durability}或null, locations:對方場上 LOCATION 數}`；`fatigue` 讀對方玩家實體的 `FATIGUE`。 |

**不要設 `s.game`**：那會讓 `moves()` 進入整局模擬的分支。

`legal` 直接由 `actions` 一對一轉成，不用 `moves(s)`，這樣網路評的正是遊戲給的選項，Jev 選的動作一定對得到：

- `END_TURN` → `{kind:'end'}`
- `CHOICE` → `{kind:'choose',id:entityId}`
- 實體在手牌 → `play`；是英雄技能 → `power`；是場上的 `LOCATION` → `use`；其餘（場上的手下或英雄）→ `attack`；有 `targetId` 就帶上。

`byAction` 是 `Map<action.id,legal 的索引>`。

另外匯出 `shadowRow(net,view,{action,source,state})` → 一行紀錄：

```json
{"createdAt":"…","model":"warlock-discard-v5","gameNumber":12,"turn":7,"mirror":true,"opponentClass":"WARLOCK",
 "value":0.31,"legal":9,
 "top":[{"kind":"play","id":41,"name":"…","targetId":null,"targetName":null,"p":0.62}],
 "jev":{"kind":"play","id":41,"name":"…","targetId":null,"rank":0,"p":0.62,"source":"plan"},
 "agree":true,"unknown":["不在詞彙裡的牌名"],"notes":[]}
```

`top` 取前三名。`mirror` 是 `opponentClass==='WARLOCK'`。`unknown` 是手牌與雙方場上不在 `net.vocab` 裡的牌名（去重）。

### 2. 接到 `src/bridge.mjs`

- `next()` 每個 `ready:true` 且有 `action` 的回傳點（依計畫續走、強制步、斬殺、問 Jev）都旁聽一次；起手換牌不聽。
- 寫到 `runtime/shadow.jsonl`，一步一行。
- 網路第一次用到時才載入；載入或計算出任何錯，都吞掉並只在第一次印一行警告，之後照常出牌。旁聽的程式碼不得讓 `next()` 丟例外或改變它的回傳值。
- `JEV_SHADOW=0` 關閉。
- 改動盡量小：邏輯放在 `selfplay-shadow.mjs`，bridge 只加呼叫。

### 3. 離線驗證 `src/eval-shadow.mjs`，`npm run shadow`

- 預設：重放 `runtime/ranked-*` 所有存檔，在我方每個頂層 `PLAY`／`ATTACK` 區塊之前建 `shadowView`，檢查狀態長度 208、每個步驟長度 56、全是有限數字（不符就列出哪一局哪一回合並以非零結束）。印出：局數、盤面數、真實動作對得到的比例、網路第一名與真實動作相同的比例、真實動作落在前三名的比例，鏡像與非鏡像分開，以及最常見的 `unknown` 牌名。
- `npm run shadow -- live`：讀 `runtime/shadow.jsonl`，印同樣的統計（handoff 的第 4 步）。

### 4. 測試 `test/selfplay-shadow.test.mjs`

不可依賴 `runtime/`。用 `test/fixtures` 裡現有的 Power.log 或手寫的小 `state`／`actions`／假 `parsed`。至少涵蓋：

- 編出來的長度是 208 與 56，全是有限數字；
- `legal` 與 `actions` 一對一，每種 `type` 轉成對的 `kind`；
- `deck` 長度等於 `deckCount`，手上與場上的牌已從牌表扣掉；
- 先後手、對方張數進到 `s.seat`、`s.them`；
- 換牌回 `null`；
- 網路丟錯時，旁聽的包裝不丟錯。

### 5. 收尾

- 在 `STATUS.md` 最上面加一段（標題帶日期 2026-10-13，新的在上）：做了什麼、離線驗證的數字、還不知道的事（例如 `discardCount` 找不到來源）。
- 最後回報：改了哪些檔、`npm test` 的結果、`npm run shadow` 的輸出。

## 風格

照周圍程式碼寫：ESM `.mjs`、精簡、註解用英文且只寫「為什麼」。
