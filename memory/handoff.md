# 交接（handoff）

只記「目前狀態」，每次收工整份覆寫。歷史在 findings／experiments／rulings／lessons。

- **更新**：2026-10-28，Claude Code（commit b7a3389；蛋牧駕駛 P3 重訓＋P3c 加訓）

## 進行中的工作
- 實戰模型是 `warlock-zoo-v9`（`src/selfplay-shadow.mjs` 的 MODELS）。
- ranked 40 場批次（`runtime/ranked-40-v9-guards2.log`）在第 11 場停下，原因是 STOP No Power.log found。第二段 4–6，中斷那段 0–3，guard 沒有誤觸。見 E-250。
  - 這批沒有在跑，要不要重開由使用者決定。
- 蛋牧駕駛已重訓成 P3（`models/selfplay/priest-egg-pilot-v3-20261028.{pt,json}`，第 3040 輪，imbue 編碼＋Haunt guard）。見 E-252。
  - E-251 設定：牧師勝率 10.75% → 22.5%（18.7–26.8），平均結束回合 T14.33 → T15.86，孵出 Khelos 12.25% → 24.25%。
  - 對 zoo-v9 2000 局：8.9% → 17.8%（16.2–19.5）。
  - 加訓 P3c（第 3490 輪）沒有更好；E-251 設定 2000 局：v3 22.85%（21.1–24.7）、P3c 22.0%。v3 維持，勝率已平台。見 E-253。
- 訓練複本：`D:\Projects\CODING\jev-hearthstone-eggtrain-20261028`（本輪）、`jev-hearthstone-eggtrain`（舊，可刪）；5090 `~/side_projects/jev-hearthstone-egg-20261028`。

## 誰在做
- 目前沒有 agent 在跑。

## 未 commit 的改動
最後一個 commit 是 `b7a3389`（2026-10-28，整批升級＋memory/）。之後未 commit：
- Imbue 編碼與 egg guard 自戰：`src/selfplay-{encode,env,match,net}.mjs`、`train/{ppo,export,test_expand}.py`、`test/selfplay-env.test.mjs`；新檔 `test/selfplay-encode-imbue.test.mjs`、`test/fixtures/zoo-v9-logits.json`。
- 模型 `models/selfplay/priest-egg-pilot-v3-20261028.{pt,json}`；`runtime/egg-20261028/`（腳本、eval）。
- `runtime/egg-20261028/pilot_v3c.sh` 與 eval 大樣本檔。
- `memory/`（E-252、E-253、F-854–856、L-043、L-044）、`docs/selfplay-versions.md`。
- npm test 858 過。commit 要等使用者說。

## 下一步（都等使用者決定）
1. 用蛋牧 v3（priest-egg-pilot-v3-20261028）當對手訓練 zoo（從 v9 接續，門檻照 v9 那輪：蛋牧區間下界 > v9 點估計、其他對手不掉超過 1.5 分）。蛋牧再加輪數已無效（E-253）。
   - train/test_cheap_opp.py 在 b7a3389 就失敗（F-856），訓練 zoo 用到 --opp 前先查。
2. 不浪費費用的 guard，延伸 expiring_card_before_end。見 F-842、R-139。
3. 補完交換的 guard，打死受傷的敵方手下。見 F-843。
4. 把克蘇恩術士加進內戰對手池。見 F-845。
5. 威脅普查列出的 guard 候選：
   - Flametongue Totem，優先。見 F-825。
   - Soldier of Cho'gall。見 F-826。
   - 大死亡之聲：Imp Gang Stooge／Voidlord／Egg of Khelos。見 F-827。
   - Cannoneer／Bloated Leech，優先度低。見 F-828。

## 環境狀態
- 派工 ds-local（DeepSeek）餘額不足（402 Insufficient Balance，2026-10-28 04:24），要使用者儲值後才能再派。

## 開放問題
- v7 在模擬器打蛋牧 86%，實戰卻 0–3。蛋的 bug 修好後模擬更貼近實戰，但「模擬蛋牧比真人弱」還沒解決。見 F-784、L-038、E-248。
- 「模擬蛋牧比真人弱」：P3 局長 T15.9，實戰 T17–T31，還有差距。
- 月之祝福「減費 = Imbue 次數」是假設，交織命運的選項數也是假設。見 F-851、F-852。
- 對 DH 的數字可能是對同一個 dh-basic 網路過擬合。見 F-721。
- zoo-cheap 和 discard 要不要拆成分開的版本。見 F-755。
- Qwen 對 agy 的結果已經有了，但派工設定沒有改。見 R-133。
- findings 裡還有 166 筆「待驗」，多是舊的「未修／建議未做」。要清理時用 `grep -n "待驗" memory/findings.md`。
