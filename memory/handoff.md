# 交接（handoff）

只記「目前狀態」，每次收工整份覆寫。歷史在 findings／experiments／rulings／lessons。

- **更新**：2026-10-29 清晨 05:15（E-274 shaping 兩臂送上 5090、5090 斷線、L-057 再犯）；2026-10-29 深夜（E-269 egg 0.1.0 對 zakajz 52.3%、E-270 中止、E-271 zoo 對 egg 0.1.0 過判定（B）；5090 egg-pile 同步到 b31012f48995）；2026-10-29 晚（E-264–E-267 Catacombs 搜尋／強制走法、F-874 zoo-v9 value 偏樂觀、F-875／R-149 Shred 修正，sim → b31012f48995、R-147–R-149、L-055、L-056）；更早 2026-10-29（重播工具 F-873、E-263、L-054；E-262 逐卡疑點結案；R-144 版本號、R-145）；前次 2026-10-28 晚，Claude App（commit 8f78a8c；之後的蛋牧診斷、R-141 規則補完、pile、P4–P6、priest-egg-hsr 都未 commit）

## 進行中的工作
- **warlock-zakajz 起手留牌表（E-281、F-883、R-152、R-154）**：zoo 0.2.1＝0.2.0 網路＋留牌表 `models/mulligan/warlock-zoo-0.2.1.json`（sha256 b1d6532a…），已接實戰（`src/policy.mjs` mulliganConstraint、`src/mulligan-table.mjs`），搭 zoo 0.2.0 對現行規則成對 +1.97（1.35–2.59，每臂 20k 局），shaman／dh／zakajz／鏡像 PASS，蛋牧中性。使用者的直覺規則（hunt*）沒贏。實戰還沒打過換牌後的局，下一局 `npm run game` 後看 last-game.log 的換牌是否照表。蛋牧專用表已試（E-284、F-884）：100k 局擬合，對通用表 +0.14（−0.39–0.68）不採用；通用表對蛋牧本身 +0.73（0.08–1.39）。換駕駛模型要重擬（流程見 E-281，`runtime/mulligan-20261029/`）。
- **zoo 0.2.0 搜尋蒸餾續訓（E-278，已預註冊、2026-10-29 08:57 在 5090 起跑，等 E-274）**：5090 `~/side_projects/jev-hearthstone-distill-020-20261029/runtime/distill-020-20261029/run.sh` smoke 已過，現在等 E-274（約 15:00）寫 DONE／FAILED 才開 C、D 兩臂（各 150 輪、約 200 秒／輪，訓練約到隔天午夜），之後匯出、挑臂評測、判定。結果在 5090 的 `$D/eval/summary.txt`、`$D/judge/`、`$D/DONE`（D＝上述 runtime 目錄）；判定規則見 E-278，結果補進 E-278 的「結果」。
- **盤面加分＋資訊決策必問搜尋（E-274，F-876；5090 在跑、但 5090 從 05:10 連不上）**：zoo 從 E-271 A 的起點 start-A2105 接 150 輪，兩臂 S（`--shape-final`，終局 Φ 不歸零）、SI（S＋`--distill-info`，抽牌／發現決策一律前瞻蒸餾），對照組＝E-271 A。程式與測試在本機（未 commit，npm test 895/895）；5090 `~/side_projects/jev-hearthstone-shape-20261029/runtime/shape-20261029/`（run.sh 04:32 起，等 E-271 DONE 才開兩臂）。VPN 恢復後：`cat orchestrate.log; ls`，看 DONE／FAILED；完成後收 eval/summary.txt、eval/calib-*.txt、兩臂 log.csv 的秒數與 info_searched 占比，寫進 E-274，門檻判定交 role-audit。
- **zoo-v9 只重訓 value 頭（E-272，F-874／F-877，改成監督式擬合，已跑完，驗收 (a)(b) 不過）**（2026-10-29 role-train）：收集 5 對手×4000 局（605,451 決策）→ 本機擬合 `train/fit_value.py`（選第 4 輪，驗證損失 0.7101→0.6291）→ 匯出 `models/selfplay/warlock-zoo-0.1.1+E272.{pt,json}`（只換 `value.*`，policy 逐位相同，`test/value-fit-e272.test.mjs` 過）。驗收：P6A ECE 0.158→0.080、egg 0.1.0 0.328→0.104、zakajz-v1 0.049→0.019，但中段桶偏差仍 ≥0.15（(a) 不過）；dh 0.035→0.108、shaman-P 0.035→0.071 變差（(b) 不過）；(c)(d) 過。不調參數重擬（L-026）。`fit_value.py` sha256 在預註冊後因記憶體改過載入方式（L-060，數值設定沒動）。細節在 experiments.md E-272 的「結果補記」。模型不上線。本機 `npm test` 因記憶體不足有環境性假失敗（WinError 1455），失敗檔逐檔重跑都過。
- **zoo-v9 規劃 headroom（E-273，F-878，v9 本身仍是「待定」）＋ E-275（新 value 頭重量，已量完）**：E-273：v9 開前瞻 49.1%→53.4%（+4.3，差 2–5 分，區間不重疊）＝待定；zakajz +6.2、egg +4.6、dh +2.1。E-275（5090 約 59 分，`runtime/headroom-e275-20261029/out/`）：換成 E-272 擬合的新 value 頭，plain 勝場與 v9 逐項相等（5895/12000，健全性過），但 look 掉到 26.1%（−23.1，各對手一致，dh −35.9 最糟）、look2 38.3%（−10.8）→ 預註冊判定「到頂」；這是新頭把前瞻搞壞，不是 v9 沒空間，所以 E-273 的待定沒解開。下一步（等使用者）：要不要做 zoo 搜尋蒸餾，需另一種不靠擬合 value 頭的判斷方式；先不動。5090 目錄 `~/side_projects/jev-hearthstone-headroom-20261029`、`~/side_projects/jev-hearthstone-valuefit-20261029`（都可刪）。　**E-277（zoo 0.2.0 同腳本同 seed，已量完）**：0.2.0 plain 55.3%（比 v9 plain +6.2）、look 17.1%（−38.2）、look2 47.6%（−7.6），預註冊判定「到頂」（egg、dh 的 look 剩約 6%）；多半是 0.2.0 value 頭在前瞻狀態失準（沒量校準，待驗證），所以 E-273 的 +4.3「待定」仍沒解開。細節在 experiments.md E-277 結果補記，5090 目錄 `~/side_projects/jev-hearthstone-headroom-020-20261029`（可刪）。　**E-277 的「到頂」疑為量錯（F-882，假說待驗）**：搜尋端從對手座位估值，0.2.0 的 value 頭只會估自己座位；v10 look 正常、0.2.0 look 崩（本機 60 局重現）。下一步：改搜尋端從學習方座位估交手後局面（或加校準測試）驗 F-882，成立再重量 E-277 並重跑 E-278。
- 實戰模型：`warlock-zoo` 仍是 `warlock-zoo-v9`；`warlock-zakajz` 已改為 `warlock-zoo-0.2.0`（R-151，`src/selfplay-shadow.mjs` MODELS）。第一局實戰勝（E-276）；2026-10-29 ranked 50 場批次兩度在第 1 局停：先是錯的座標修正（已還原，L-062），再是 HDT 右側牌庫面板在 1600×900 蓋住結束回合（L-063）。改 2560×1440 全螢幕重開後點擊正常，21 局 9 勝 12 敗、6 連敗停（E-282，尾段連敗未分析）。F-881 已判定錯招（E-280，預註冊，5090 成對推演）：對手空場、沒別的牌可出時，Coin＋Tachyon 比留硬幣結束回合少贏 8.0 分 [−8.9, −7.1]，後手 T1 −11.2；使用者選訓練修（R-153，不加 net-guards）：下次 zoo 訓練加儀式型對手＋從這類局面開局，修完用 E-280 方法複測。題庫已建（E-285，`npm run regress -- --deck <牌組> --baseline eval/regress/baseline-<現役模型>.json`）：新候選不得讓 F-881 比例高於基準 3 個百分點以上（0.2.0 基準 10.9%、zoo-v9 13.1%）；A 類 56 題都是 warlock-discard 的使用者裁定，zoo／zakajz 還沒有實戰局面題，之後實戰中使用者裁定的局面要錄成 fixture 加進 eval/regress/questions.json。
- **zoo-v10 已過門檻並匯出**（E-254）：`models/selfplay/warlock-zoo-v10.{pt,json}`＝5090 zoo/A（λ0.1，第 2000 輪）。
  - role-audit 判定（模擬器 26db915e1733，seed 10001＋20001，每邊 4000 局，`selfplay-compare`）：對蛋牧 P3 79.4% → 84.7%（83.6–85.8），+5.3；shaman +0.6、zakajz +1.8、dh −0.1、鏡像 +1.1，全 PASS。B（λ0.3）也全過但蛋牧只 +2.7。
  - 證據：`runtime/audit-v10b/`（match 檔＋compare-*.txt）；5090 `~/side_projects/jev-hearthstone-audit-v10/out2/`。
  - `runtime/audit-v10/`（agy 用 seed 2、3）作廢：牌局與 seed 1 重疊（L-047），compare 現在會拒絕。
  - **上線前**：v10 json 帶 imbue=true，實戰 encoder 要能給 Imbue 計數；要不要換由使用者決定。v10 json 的 sim=null（訓練用 G2 前的 ppo.py）。
- ranked 40 場批次停在第 11 場（STOP No Power.log found，E-250），沒有在跑，要不要重開由使用者決定。
- 蛋牧駕駛 P3（`priest-egg-pilot-v3-20261028`）維持，勝率已平台（E-252、E-253）。
  - 診斷（E-255、F-859）：開前瞻 20.1% → 29.9%，depth 2 沒再多 → 規劃是主瓶頸，下一步是搜尋蒸餾（等使用者）。
  - 逐卡（E-256、F-860）已查完（E-262、F-872）：Gravedawn／Ectoplasm 少打是對的（強制多打 −4.2／−2.4），Slime 'em! 是選擇偏誤，不用改。
- 訓練複本：`D:\Projects\CODING\jev-hearthstone-eggtrain-20261028`、`jev-hearthstone-eggtrain`（舊，可刪）；5090 `~/side_projects/jev-hearthstone-egg-20261028`（v10 訓練）、`~/side_projects/jev-hearthstone-audit-v10`（審計與 diag，新程式碼）。

- **R-141／R-142 蛋牧規則補完（模擬器版本 → 38f4c93a3f4b，F-862、F-863）**：Elder Word 重複、Prepare、Priestess −2 只到下回合、Kindred。舊基準全部不能混比。
  - encoder `pile` 旗標已做（F-863），priest-egg 訓練自動開；要重訓才有用。5090 `~/side_projects/jev-hearthstone-egg-pile-20261028` 已同步（383 檔 sha256 一致、deploy.json 在 runtime/egg-pile-20261028/）：sim 38f4c93a3f4b、npm test 876／0 失敗、test_expand.py 全過。
  - **新基準（E-257）**：P3 對 zoo-v9 在 38f 版 4000 局 **26.5%（25.2–27.9）**（舊版 E-255 是 20.1%，不同版本不能 compare）。P4 要 Wilson 下界 > 26.5% 才匯出。
  - **P4＝`priest-egg-pilot-v4-20261028`（E-258）**：pile 重訓，從 P3b 接 450 輪。對 zoo-v9 4000 局 **27.9%（26.6–29.3）**，對 P3 +1.4，compare PASS；邊緣過門檻，已匯出（未 commit）。Ectoplasm 打出率 22% → 35%。F-864（Pool 沒有 .sim）已修。
  - Imbue 定案（R-142）：英雄能力固定 2 費，月之祝福給的牌減 Imbue 次數費（原本的模型，sim 行為沒變）。

  - **P5＝`priest-egg-pilot-v5-20261028`（E-259）**：主線配方（PPO＋λ0.1 搜尋蒸餾），從 P4 接 150 輪。對 zoo-v9 4000 局 **32.0%（30.6–33.5）**，對 P4 +4.1，compare PASS，已匯出（未 commit）。cardwin：打蛋提早（10.2 → 8.7 回合），Ectoplasm 打出率沒升（35% → 31%）。只是模擬勝率（F-784）。
  - **P6＝`priest-egg-pilot-v6-20261028`（E-261）**：P5 主線配方再接 200 輪（A λ0.1）。全新 seed 50001：P6A 31.2%（29.8–32.6）對 P5 29.3%，+1.9 PASS；挑選 seed 只 +0.8。λ0.3 臂（B）變差。已匯出（json 4e34e873…、pt 3bc0326e…），是 Imbue 牌表上最強的駕駛。同配方再加輪數收益很小。
  - **P7＝`priest-egg-0.1.0`（egg 0.1.0，R-150；E-268），目前最強的蛋牧駕駛**：主流牌表 priest-egg-hsr，從 P6A 接 300 輪（λ0.1）。對 zoo-v9 全新 seed **49.5%（47.9–51.0）**，P6A 在同牌表 34.0%，+15.5 PASS。模擬器 c661d9b4b263（加牌組檔換了版本，38f 的數字不能混比）。
  - **egg 0.1.0 對現行動物園清單（E-269）**：模擬器 b31012f48995，對 zoo-v9 駕駛 `warlock-zakajz` **52.3%（50.8–53.9）**，同 seed 對舊 `warlock-zoo` 50.0%。對手 v9 沒對強蛋牧訓練過。
  - **zoo 0.2.0＝E-271 B（R-151，已匯出 `models/selfplay/warlock-zoo-0.2.0.{pt,json}`）**：從 E-270 A 臂（iter 2105）接 150 輪、對手池蛋牧＝egg 0.1.0、蛋牧占 0.5。全新 seed 對 V10：egg 0.1.0 54.0 → 59.7%（+5.7）、shaman +2.2、dh +1.8、zakajz-v1 +3.6、鏡像 52.9%，全 PASS。本機 `runtime/zoo-E271-egg010/B.{pt,json}`（sim b31012f48995），5090 egg-pile 目錄同名資料夾。MODELS 未動（實戰仍是 v9；上線要 encoder 給 Imbue 計數）。
  - **下一步**：(1) 本機實戰試 zoo 0.2.0（實戰狀態沒有 bless，Imbue 格恆為 0，只影響對 Imbue 牧師／德魯伊）；(2) 蛋牧對 E-271 B 訓（軍備競賽，egg 0.1.0 對它只約 40%）；(3) 主流牌表實戰對局的 likeness 比對。
  - **主流牌表（F-869、F-870）**：模擬的 priest-egg 是少數派 Imbue 型；HSReplay 前 6 名與使用者貼的 Brox 代碼都是 Servant／Hold Them Off!／Umbra 型，已加 `decks/priest-egg-hsr/`。P5 在主流牌表只有 29.0%（原牌表 37.3%，400 局煙霧），三張主流核心牌不在詞彙裡。train/ppo.py 的蛋牧旗標改成前綴比對（L-052，test_expand.py 有測）。

## 重播（F-873）
- 新工具 `src/selfplay-replay.mjs`（測試 `test/selfplay-replay.test.mjs`）：`node src/selfplay-replay.mjs <A.json> <B.json> 12 120001 --decks priest-egg warlock-zoo --guard egg --out runtime/replay-p6a-zoo9.json`，再 `python runtime/replay-viewer/build.py` 產重播頁（template.html＋資料＋筆記）。已發佈：https://claude.ai/artifact/UdRRNHdiWaSiUVHNhgcuTj。
- 2026-10-29 改版：多組合檢視器 `runtime/replay-viewer/site/index.html`（gitignored），用 fetch 讀同目錄 JSON。ZOO 一律用 `warlock-zakajz`（R-146），zoo-v9 駕駛，各 12 局，seed 160001–160401：brox-zak（P6A 蛋牧 Brox 5–7）、imbue-zak（P6A 蛋牧 Imbue 2–10）、zak-dh（6–6，dh-cthun-basic）、zak-shaman（12–0）、zak-mirror（zoo v9 對 zakajz v1，4–8）。imbue-zoo 是舊 Fatebreaker 清單，只留給 F-873 筆記的跳轉。加組合＝產新 JSON 到 site/、在 MATCHES 加一行、以同 url 重新發佈並在 files 帶上新檔。模擬本機跑、不花 token。12 局只能看打法，不能當勝率。大樣本（E-264）：P6A 蛋牧 Brox 對 zakajz ZOO 35.7%、Imbue 34.2%（各 4000 局）。頁面有「複製這步」按鈕，使用者會貼回有問題的那手（含檔名、局、seed、步、候選與雙方盤面）。
- 檢討使用者貼回的一手：貼文開頭是 `[重播] … · <檔名> 第 g 局（seed s，X先）· 第 k/N 步`。資料在 `runtime/replay-viewer/site/<檔名>`，`games[g-1].steps[k-1]` 就是那一步。要重算或強制別的走法，用同一組模型、--decks、--guard，以及 `replayGame(nets,lists,{seed:s,first})`（first：該局 JSON 的 `first`）重建到那一步，再改 `apply` 的那一手比較估值。檢視器 UI（2026-10-29 定案）：中間那條左邊是候選、右邊是招式與按鈕，各列固定高度，按鈕不跳。
- 候選打法問題（F-873，都待介入驗證）：蛋太晚／沒下、Prepare Soothsayer 花掉整回合、0 費 Barrier 沒打、結束回合時還有手下能攻擊。同名分票已排除（E-263）。下一步：挑一兩個寫成 force.mjs 式的同 seed 介入（例：蛋能下就下、0 費牌先打）。

## 版本號（R-144）
- 起點：zoo 0.1.0＝v9、discard 0.1.0＝v5、zakajz 0.1.0＝v1、egg 0.1.0＝P7（`priest-egg-0.1.0`，主流牌表 priest-egg-hsr，R-150；P6A 改視為 0.1 之前）、sim 0.1.0＝38f4c93a3f4b、sim 0.1.0a＝c661d9b4b263（只加 priest-egg-hsr 牌組檔）。規則在 memory/README.md「版本號」。新匯出用 `<牌組>-<版本>` 檔名。

## 誰在做
- 沒有在跑的工作。5090 P7 與 eval 已結束（`~/side_projects/jev-hearthstone-egg-pile-20261028`）。

## 未 commit 的改動
最後一個 commit 是 `8f78a8c`（G2／G3、角色 skill、zoo-v10）。之後未 commit：
- 新檔 `src/selfplay-cardwin.mjs`、`test/selfplay-cardwin.test.mjs`。
- R-141／R-142／pile：`src/selfplay-net.mjs`、`src/selfplay-env.mjs`、`train/ppo.py`、`train/export.py`、`train/test_expand.py`、新測試 `test/selfplay-encode-pile.test.mjs`、`test/priest-egg-imbue.test.mjs`、`test/selfplay-env.test.mjs`；`src/sim.mjs`、`src/selfplay.mjs`（rawCard 加 school／races，seat 加 elderWord／playedKinds／lastKinds）、`src/selfplay-encode.mjs`（prepare 借 'use' 格）、新測試 `test/priest-egg-rules.test.mjs`、`test/sim-text-cache.test.mjs` 的 NEW 集合、重產 `test/fixtures/zoo-v9-logits.json`、`docs/priest-egg-sim-coverage.md`。npm test 876/876。
- `memory/`：E-255–E-258、F-859–F-864、R-141、R-142、L-048–L-050、R-143、E-259、handoff。
- 新模型 `models/selfplay/priest-egg-pilot-v4/v5/v6-20261028.{pt,json}`；runtime/egg-pile-20261028/（pilot_v6.sh、eval_p6.sh、eval/compare-*P6*.txt）。
- 新牌表 `decks/priest-egg-hsr/`、`test/priest-egg-hsr.test.mjs`、`src/egg-guard.mjs` 的 isEggDeck；`train/ppo.py` 前綴比對＋`train/test_expand.py` HsrFlags；runtime/egg-hsr-20261028/。npm test 888/888。
- `memory/`：E-261、E-268（原誤用 E-262）、F-869–F-871、L-052、L-057、R-150；新測試 `test/memory-ids.test.mjs`。npm test 892/892。
- 新模型 `models/selfplay/priest-egg-0.1.0.{pt,json}`（P7）；runtime/egg-hsr-20261028/（pilot_v7.sh、eval_p7.sh、eval7/compare-*.txt）。
- runtime/diag-look/（gitignored）。
- 新檔 `src/selfplay-replay.mjs`、`test/selfplay-replay.test.mjs`；runtime/replay-viewer/、runtime/replay-p6a-zoo9.json。npm test 889/889。
- `memory/`：E-262、E-263、F-872、F-873、L-053、L-054、R-144、R-145、README 版本號段。
- E-274：`src/selfplay-rollout.mjs`（infoStep／touchesInfo）、`src/selfplay-env.mjs`（info 旗標、phiEnd）、`train/ppo.py`（--shape-final、--distill-info、info_searched 欄）、`train/test_shaping.py`、`test/selfplay-env.test.mjs`；runtime/shape-20261029/（spec.md、run.sh、calib.mjs；smoke*／eq-new* 可刪）。npm test 895/895。`memory/`：E-274、L-057 再犯註記。
- 起手留牌（E-281）：新檔 `src/selfplay-mulligan.mjs`、`train/mulligan-rows.mjs`、`train/fit_mulligan.py`、`test/selfplay-mulligan.test.mjs`、`src/mulligan-table.mjs`、`models/mulligan/warlock-zoo-0.2.1.json`；`src/policy.mjs`（mulliganConstraint 照表）；runtime/mulligan-20261029/。`memory/`：E-281、E-284、F-883、F-884、L-064、R-152、R-154。
- commit 要等使用者說。

## 下一步（都等使用者決定）
- **價值訊號提案（F-876，2026-10-29 分析）**：潛在式 shaping 對牌序無訊號且不改策略，不要再試同一種；候選是 (a) 先用 calib.mjs 把 value 頭對現役對手重校（F-874 TODO），(b) 輔助預測頭（下回合 board／hand／health 差）改善表徵而不改目標，(c) 小幅勝速項（每回合 −ε 或 γ 調低）讓勝勢局繼續壓，(d) 把 tapFirst／affordable_temporary_discover 移進模擬自戰當 guard，讓訓練資料的牌序先對。直接加 hand／health／board 非潛在獎勵會改目標（為了場面放棄勝率），只能小尺度試並用 compare 判定。
- **蛋牧下一步提案**：P7 對 50 輪前已約 49%，可能接近平台；可以再接 200 輪看還有沒有（同腳本換 --resume ppo/P7B/policy.pt，掛 `egg 0.1.0+E編號`）。更重要的是實戰驗證：讓 P7 打實戰（要實戰 encoder 支援 imbue／pile 格，role-deploy），或用 opp-likeness 對主流牌表的實戰對局重算像真人分數。真人參考：免費資料只有 HSReplay 牌表與勝率；Premium 有逐回合出牌分佈（未登入驗證），可當人類參考。
- **R-147 Catacombs（已修訂成有條件）**：這回合要打才排在攻擊前；用不起發現的牌就留著。E-265：搜尋在 brox-zak 第 2 局第 20 步偏好 Mawman＋Life Tap、Catacombs 留手；E-266 強制第一手打完 600 局：Life Tap 15.3% > Mawman 11.5% > Catacombs 10.2% > 攻擊 7.0%（ZOO 勝率，局面本來就大劣），與搜尋一致。L-055：「發現牌燒掉」5 例中 4 例是好棋，#4 是真瑕疵（E-267：Platysaur → Mawman 31% 對搜尋線 14.5%），根源是 value 網路。
- **zoo-v9 value 過度樂觀（F-874，TODO）**：對 P6A 中段高估 0.3–0.4。方向：把 P6A 放進 ZOO 的對手池重訓或至少重訓 value 頭；用 `runtime/cata-search/calib.mjs` 量校準、`cata-d4.mjs` 的 Platysaur 局面當回歸檢查。
- **F-875 已修（2026-10-29，R-149）**：Catacombs 選到 Shred 現在會扣 3 血再補抽一張。sim 版本因此變了（sim-version 雜湊），之前訓練的模型都是在舊 sim 練的；新舊版本的對戰數字不要混比。npm test 891/891。
- **R-148 對手職業條件化（TODO）**：每職業權重、沒遇過用預設、牌組不同時漸退回預設。要動 encoder 格式並重訓，先做設計（role-lead／role-train）。
- 對手池缺法術薩、恩佐斯 DK（F-871），要補模擬器卡牌。
0. 對手建模已做（E-260，`src/opp-likeness.mjs`）：實戰只有 5 場打出蛋的蛋牧，分不出 P3–P5 誰像真人；要更多實戰蛋牧對局才有用（新 log 會自動加入，`node src/opp-likeness.mjs extract` 再 `report`）。其他小事：F-864 的專門測試（workers≥2 寫 checkpoint）還沒加（L-049）。
1. v10（`zoo 0.1.0+E254`）：依 R-145 只對模擬蛋牧變強，不是上線理由；若要採用只能是 PATCH，且要先在 sim 0.1.0（38f4c93a3f4b）重測。ranked 只在要蒐集實戰數據時才打。
2. train/test_cheap_opp.py 的 (a) 參考雜湊過時（F-856），更新後 (b)–(e) 才會跑。
3. 不浪費費用的 guard，延伸 expiring_card_before_end。見 F-842、R-139。
4. 補完交換的 guard，打死受傷的敵方手下。見 F-843。
5. 把克蘇恩術士加進內戰對手池。見 F-845。
6. 威脅普查的 guard 候選：Flametongue Totem（優先，F-825）、Soldier of Cho'gall（F-826）、大死亡之聲（F-827）、Cannoneer／Bloated Leech（F-828，低）。

## 環境狀態
- **5090 從 2026-10-29 05:10 連不上**：keepalive 05:12 重連後 f5fpc 回「There is no active session」，ssh 逾時（05:15 再試一次仍逾時）。可能是密碼過期或要雙重驗證，要使用者處理。5090 上 E-271 兩臂與 E-274 run.sh 都在跑，狀態未知。**05:52 已恢復**（使用者修好 VPN）；E-271 已跑完並過判定，E-274 狀態由它的 session 確認。
- 既有模型（v9、v10、P3…）沒有 sim 欄位；之後新訓練的才有（F-858）。5090 的 audit-v10 目錄已是新程式碼，訓練目錄 egg-20261028 還是舊的。
- 派工 ds-local（DeepSeek）餘額不足（402，2026-10-28 04:24），要使用者儲值。
- 評估一律用 compare；seed 間距 ≥ 局數，且避開挑模型用過的範圍（L-046、L-047）。

## 開放問題
- v7 在模擬器打蛋牧 86%，實戰卻 0–3；「模擬蛋牧比真人弱」未解（F-784、L-038、E-248）。P3 局長 T15.9，實戰 T17–T31。
- 月之祝福選項池、交織命運選項數是假設（F-851、F-852）。
- 對 DH 的數字可能對 dh-basic 過擬合（F-721）。
- zoo-cheap 和 discard 要不要拆版本（F-755）。
- Qwen 對 agy 的結果已有，派工設定沒改（R-133）。
- findings 166 筆「待驗」，清理用 `grep -n "待驗" memory/findings.md`。
