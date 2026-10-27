# 交接（handoff）

只記「目前狀態」，每次收工整份覆寫。歷史在 findings／experiments／rulings／lessons。

- **更新**：2026-10-27，Claude Code（整頓記憶那次；蛋牧升級的 agent 補上 L-042）

## 進行中的工作
- 實戰模型是 `warlock-zoo-v9`（`src/selfplay-shadow.mjs` 的 MODELS）。
- ranked 40 場批次（`runtime/ranked-40-v9-guards2.log`）在第 11 場停下，原因是 STOP No Power.log found。第二段 4–6，中斷那段 0–3，guard 沒有誤觸。見 E-250。
  - 這批沒有在跑，要不要重開由使用者決定。
- 蛋牧模擬已照真人 Imbue 牌表升級，也加了 Haunt 上蛋，但**沒有重訓**。
  - 結果比升級前差：牧師勝率 10.7–12.2%，基準是 19.5%。見 E-251、F-851、F-852、F-853。
- 複製目錄 `D:\Projects\CODING\jev-hearthstone-eggtrain` 還在，是蛋牧訓練用的。

## 誰在做
- 目前沒有 agent 在跑。
- 蛋牧升級已做完（E-251、F-846–853、R-140、L-041、L-042），改動還沒 commit（見下）。**目前狀態：等使用者決定是否在 5090 重訓蛋牧駕駛。**

## 未 commit 的改動
最後一個 commit 是 `b839819`（2026-10-24）。目前有 27 個修改檔、79 個未追蹤檔，全部都還沒 commit。
- **自戰／模擬**：
  - `src/sim.mjs`（蛋牧 Imbue、Haunt 等）、`src/selfplay*.mjs`、`train/*.py`；
  - 新檔 `src/egg-guard.mjs`、`src/net-guards.mjs`、`src/board-score.mjs`、`src/eval-net-search.mjs`、`src/game-zoo.mjs`。
- **牌組**：`decks/priest-egg/`、`decks/dh-cthun/`、`decks/shaman-cthun/`、`decks/warlock-zakajz/`、`decks/warlock-zoo/`（mulligan、strategy）。
- **模型**：`models/selfplay/warlock-zoo-v3…v9`、`priest-egg-pilot-v2-20261027`、`warlock-zakajz-v1`、`dh-cthun-basic`、`board-score.json`。
- **測試**：`test/priest-egg-imbue.test.mjs`、`test/priest-egg-sim.test.mjs` 等。
- **記憶整頓這次**：
  - 新增 `memory/` 與 `AGENTS.md`；
  - 修改 `CLAUDE.md`、`README.md`、`docs/selfplay-versions.md`；
  - `STATUS.md` 移到 `memory/archive/STATUS-2026-10-27.md`，根目錄只留一行指標。
- commit 要等使用者說。

## 下一步（都等使用者決定）
1. 重訓蛋牧駕駛：用新詞彙加 Imbue 等級，在 5090 對 zoo-v9 訓練，eggGuard 一起用。
   - 驗收：對 zoo-v9 勝率 > 22%，平均結束回合往 T17 以上。
   - 過了再用新蛋牧訓練 zoo。見 E-251、F-853。
2. 不浪費費用的 guard，延伸 expiring_card_before_end。見 F-842、R-139。
3. 補完交換的 guard，打死受傷的敵方手下。見 F-843。
4. 把克蘇恩術士加進內戰對手池。見 F-845。
5. 威脅普查列出的 guard 候選：
   - Flametongue Totem，優先。見 F-825。
   - Soldier of Cho'gall。見 F-826。
   - 大死亡之聲：Imp Gang Stooge／Voidlord／Egg of Khelos。見 F-827。
   - Cannoneer／Bloated Leech，優先度低。見 F-828。

## 開放問題
- v7 在模擬器打蛋牧 86%，實戰卻 0–3。蛋的 bug 修好後模擬更貼近實戰，但「模擬蛋牧比真人弱」還沒解決。見 F-784、L-038、E-248。
- 月之祝福「減費 = Imbue 次數」是假設，交織命運的選項數也是假設。見 F-851、F-852。
- 對 DH 的數字可能是對同一個 dh-basic 網路過擬合。見 F-721。
- zoo-cheap 和 discard 要不要拆成分開的版本。見 F-755。
- Qwen 對 agy 的結果已經有了，但派工設定沒有改。見 R-133。
- findings 裡還有 166 筆「待驗」，多是舊的「未修／建議未做」。要清理時用 `grep -n "待驗" memory/findings.md`。
