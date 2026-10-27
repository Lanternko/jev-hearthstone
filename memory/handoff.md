# 交接（handoff）

只記「目前狀態」，每次收工整份覆寫。歷史在 findings／experiments／rulings／lessons。

- **更新**：2026-10-28，Claude Code（commit 7bc059b；G2／G3、角色 skill、zoo-v10 皆未 commit）

## 進行中的工作
- 實戰模型仍是 `warlock-zoo-v9`（`src/selfplay-shadow.mjs` 的 MODELS，未動）。
- **zoo-v10 已過門檻並匯出**（E-254）：`models/selfplay/warlock-zoo-v10.{pt,json}`＝5090 zoo/A（λ0.1，第 2000 輪）。
  - role-audit 判定（模擬器 26db915e1733，seed 10001＋20001，每邊 4000 局，`selfplay-compare`）：對蛋牧 P3 79.4% → 84.7%（83.6–85.8），+5.3；shaman +0.6、zakajz +1.8、dh −0.1、鏡像 +1.1，全 PASS。B（λ0.3）也全過但蛋牧只 +2.7。
  - 證據：`runtime/audit-v10b/`（match 檔＋compare-*.txt）；5090 `~/side_projects/jev-hearthstone-audit-v10/out2/`。
  - `runtime/audit-v10/`（agy 用 seed 2、3）作廢：牌局與 seed 1 重疊（L-047），compare 現在會拒絕。
  - **上線前**：v10 json 帶 imbue=true，實戰 encoder 要能給 Imbue 計數；要不要換由使用者決定。v10 json 的 sim=null（訓練用 G2 前的 ppo.py）。
- ranked 40 場批次停在第 11 場（STOP No Power.log found，E-250），沒有在跑，要不要重開由使用者決定。
- 蛋牧駕駛 P3（`priest-egg-pilot-v3-20261028`）維持，勝率已平台（E-252、E-253）。
- 訓練複本：`D:\Projects\CODING\jev-hearthstone-eggtrain-20261028`、`jev-hearthstone-eggtrain`（舊，可刪）；5090 `~/side_projects/jev-hearthstone-egg-20261028`（v10 訓練）、`~/side_projects/jev-hearthstone-audit-v10`（審計，新程式碼）。

## 誰在做
- 沒有 agent、沒有 5090 程序在跑。

## 未 commit 的改動
最後一個 commit 是 `7bc059b`。之後未 commit：
- `train/ppo.py`：--opp-fresh（F-857）＋ck['sim']；新檔 `train/test_opp_fresh.py`（含 G2 檢查，通過）。
- G2／G3（F-858）：新檔 `src/sim-version.mjs`、`src/selfplay-compare.mjs`（含 seed 重疊拒絕，L-047）、`test/sim-version.test.mjs`；改 `src/selfplay-env.mjs`、`train/export.py`、`src/selfplay-net.mjs`、`src/selfplay-match.mjs`。npm test 865/865。
- 六個角色 skill（草稿，使用者未審）：`.claude/skills/role-{lead,env,train,opponent,audit,deploy}/SKILL.md`。
- 新模型檔 `models/selfplay/warlock-zoo-v10.{pt,json}`（未被 gitignore）。
- `docs/selfplay-versions.md`：zoo-v10 一節。
- `memory/`：F-856 狀態、F-857、F-858、E-254（已結）、L-045、L-046、L-047、README 角色一節。
- commit 要等使用者說。

## 下一步（都等使用者決定）
1. 要不要讓 v10 上線：先讓實戰 encoder 給 Imbue 計數（role-deploy），再改 MODELS、跑 ranked。
2. train/test_cheap_opp.py 的 (a) 參考雜湊過時（F-856），更新後 (b)–(e) 才會跑。
3. 不浪費費用的 guard，延伸 expiring_card_before_end。見 F-842、R-139。
4. 補完交換的 guard，打死受傷的敵方手下。見 F-843。
5. 把克蘇恩術士加進內戰對手池。見 F-845。
6. 威脅普查的 guard 候選：Flametongue Totem（優先，F-825）、Soldier of Cho'gall（F-826）、大死亡之聲（F-827）、Cannoneer／Bloated Leech（F-828，低）。

## 環境狀態
- 5090 VPN 由使用者恢復，仍不穩。
- 既有模型（v9、v10、P3…）沒有 sim 欄位；之後新訓練的才有（F-858）。5090 的 audit-v10 目錄已是新程式碼，訓練目錄 egg-20261028 還是舊的。
- 派工 ds-local（DeepSeek）餘額不足（402，2026-10-28 04:24），要使用者儲值。
- 評估一律用 compare；seed 間距 ≥ 局數，且避開挑模型用過的範圍（L-046、L-047）。

## 開放問題
- v7 在模擬器打蛋牧 86%，實戰卻 0–3；「模擬蛋牧比真人弱」未解（F-784、L-038、E-248）。P3 局長 T15.9，實戰 T17–T31。
- 月之祝福「減費 = Imbue 次數」與交織命運選項數是假設（F-851、F-852）。
- 對 DH 的數字可能對 dh-basic 過擬合（F-721）。
- zoo-cheap 和 discard 要不要拆版本（F-755）。
- Qwen 對 agy 的結果已有，派工設定沒改（R-133）。
- findings 166 筆「待驗」，清理用 `grep -n "待驗" memory/findings.md`。
