# 自戰模型交接：實戰旁聽（shadow mode）

給有遊戲的那台電腦。目標：實戰照舊由 Jev 出牌，網路只在旁邊記「如果是我會選哪一步」，不點任何東西。

## 這次上傳了什麼

| 路徑 | 內容 |
|---|---|
| `models/selfplay/warlock-discard-v5.json` | 目前最強的版本（v5 `gen2`，第 800 輪），不需要 Python |
| `models/selfplay/warlock-discard-v5.pt` | 同一份的 PyTorch 檔，接著訓練用 |
| `src/selfplay-net.mjs` | 在 Node 裡讀 JSON 並算分 |
| `train/export.py` | 把 `.pt` 轉成 JSON（之後出新版用） |
| `test/selfplay-net.test.mjs` | 12 個盤面比對 Node 與 PyTorch 的答案（誤差 < 0.001） |

各版本的成績在 `docs/selfplay-versions.md`。

## 怎麼用

```js
import {loadNet} from './src/selfplay-net.mjs';
const net=loadNet();                       // 預設讀 v5
const {value,steps}=net.rank(s,legal);     // s 是模擬器局面，legal 是 moves(s)
// steps：每個合法步驟 {move,logit,p}，最想走的排第一；value：輪到的這一方的勝負估計，約 -1 到 1
```

確認這台機器讀得對：

```bash
node src/selfplay-net.mjs models/selfplay/warlock-discard-v5.json 2000 5000
```

訓練機的結果是 1808 勝 1 平 191 負（90.4%），同樣的種子應該一模一樣。

## 旁聽要補的東西

網路吃的是 `src/selfplay-encode.mjs` 的編碼，它讀的是自戰用的完整局面（`src/selfplay.mjs` 的 `newGame`）。實戰用的 `fromState`（`src/sim.mjs`）沒有下面這些欄位，直接丟進去會壞或得到全 0：

| 欄位 | 說明 | 實戰來源 |
|---|---|---|
| `s.deck` | 我方牌庫剩下的牌（原始卡片物件，要有 `name`），順序無所謂 | 牌表減去已經看過的牌 |
| `s.crystals`、`s.fatigue`、`s.discardCount` | 我方水晶上限、疲勞次數、本局已棄牌數 | 對局紀錄 |
| `s.seat` | 0 是先手，1 是後手 | 開局誰有幸運幣 |
| `s.turn` | 回合數，兩邊合計（先手第一回合是 1，後手第一回合是 2） | 對局紀錄 |
| `s.sites`、`s.choice` | 我方地標；正在選牌（發現、地標選擇）時的選項 | `fromState(...,{full:true})` 有 `sites` |
| `s.them` | 對方：`crystals`、`hand`（只看張數）、`deck`（只看張數）、`fatigue`、`discardCount`、`weapon`、`locations` | 對局紀錄 |
| `b.side` | 場上每個角色是 `'me'` 還是 `'opp'` | `body(c,side)` 已經有 |

步驟要用 `kind`（`play`／`attack`／`power`／`use`／`choose`／`end`）、`id`、`targetId` 表示，和 `moves(s)` 的輸出一樣。

建議的做法：

1. 寫一個 `fromState` 的包裝，補上表裡的欄位，回傳 `encode` 能吃的局面。
2. 先離線驗證：拿 `runtime` 裡已有的實戰紀錄重放，檢查編出來的長度是 208 與 56，數值不是 NaN。
3. 再接到 `src/bridge.mjs` 問 Jev 的地方：同一個盤面多呼叫一次 `net.rank`，把前三名、機率、估值和 Jev 實際選的步驟寫成一行 JSON。網路出錯要吞掉，不能影響出牌。
4. 累積幾十場後看：網路與 Jev 同步的比例；不同步的盤面裡哪些是網路沒看過的牌。

## 已知限制

- 只學過棄牌術鏡像。認得 19 個牌名，其餘全部算「不認識的牌」，只看得到攻擊、血量、嘲諷這些數字，看不懂卡片文字。對上別的職業，估值不可信。
- 不搜尋的純網路。訓練機上加搜尋（每步兩次發牌、束寬 8）對不加搜尋約多 6 分勝率，但搜尋要用完整的模擬器局面，實戰先不接。
- 強度只和腳本、和自己的舊版比過，沒和 Jev 比過。旁聽的紀錄是第一次比較。
- 模擬器和真實遊戲不完全一致（見 `src/eval-sim-fidelity.mjs`），網路是在模擬器裡學的。
