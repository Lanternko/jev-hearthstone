# 交接（handoff）

只記「目前狀態」，每次收工整份覆寫；每條最多兩行，細節只留 ID 與路徑。已結案、已上線的刪掉（git log、findings／experiments 查得到）。上限 8KB（`test/handoff-size.test.mjs`）。2026-11-01 前的全文：`archive/handoff-2026-11-01.md`。

- **更新**：2026-11-01 06:10（瘦身：41.8KB→約 6KB，內容沒改判定）。上一筆：04:00 主 session，DH 專家 dh-v1 複核 PASS（E-306、F-916）並填進 SPECIALISTS；已 commit 7ddad72。

## 線上基準
- 實戰：`warlock-zakajz`＝zoo 0.2.0（R-151）；對牧師 zoo 0.2.2、對 DH `warlock-zakajz-dh-v1-20261101`（R-168、F-914、F-916，`src/selfplay-shadow.mjs` SPECIALISTS）。**兩個專家都還沒實戰打過。**
- 留牌表 zoo 0.2.1 `models/mulligan/warlock-zoo-0.2.1.json`（E-281、R-152）已接實戰；`warlock-zoo` 仍是 v9。
- 模擬器 sim dc3885884feb（F-909）；舊版數字不混比。最強蛋牧駕駛 egg 0.1.0（R-150、E-268）；阿薩林納駕駛 v1 兩副（E-302、F-910）。
- 版本號規則 R-144（memory/README.md）。實戰手冊 `docs/client-runbook.md`。

## 進行中
- 沒有背景批次或 5090 訓練在跑（最後一批 ranked 10-31 47 局 28-19，分析 F-904）。
- 10-31 起的阿薩林納牌組、模擬器、駕駛、SPECIALISTS 都已在 7ddad72。未 commit：本次瘦身（handoff、README、`test/handoff-size.test.mjs`、封存檔）；`.claude/hooks/`、`settings.local.json` 是別的 session 加的、未追蹤。

## 等使用者裁定
- zoo 加阿薩林納對手池的 B 臂（E-303）：role-audit 判定不能取代 0.2.0（E-304、F-912／F-913：DH −2.3、F-881 題庫 10.9→35.1%）。目前只當對牧師專家用；要不要重配方再複核。
- R-166（小怪換嘲諷）回歸題 `fx:ranked1031-g1-small-minion-into-taunt` 0.2.0 答錯；使用者決定不加 guard，等訓練修。模擬救不了（E-300）。
- 配方搜尋 /goal 已停（E-292）：最好候選 I 臂（`runtime/shape-20261029/buff-order/I.json`）要不要匯出／再判。判定校準條件太吵（F-894）。
- value 線：shaping 不再試（F-898）；勝率分類不成立（R-163、F-901）；下一個選項是輔助預測頭，或放棄（R-155 暫停搜尋蒸餾）。
- zoo-v10（E-254）只對模擬蛋牧變強，依 R-145 最多 PATCH，未上線。
- keepalive 跳過確認探測（省 10–15 秒，F-893／E-295）未做；keepalive 目前停用（F-899）。

## 待辦
- 下一次實戰：看對牧師／DH 是否真的換到專家網路、換牌照表、`guard <名字>` 有沒有觸發對（R-161），F-890 Glare 修正有沒有 `pick <敵方手下>`。
- 第 47 局（10-31）換牌誤點原因未查（F-904）。
- 對手補強優先序（F-902／F-903）：阿薩林納（加池後 DH 退步要處理）→ 蛋牧更像真人（F-784）→ zakajz 內戰比重 → Beatrix 聖騎累積樣本。
- F-881 Coin＋Tachyon 錯招：下次 zoo 訓練加儀式型對手並從那類局面開局（R-153），用 E-280 方法複測；題庫門檻 E-285（`npm run regress`）。
- Garona／King Llane 進模擬器＋盜賊牌組＋輕量訓練（R-162、R-160），分 role-env／opponent／train 三段，還沒開始。guard 退休見 R-161、F-892。
- R-148 對手職業條件化（先設計）；對手池缺法術薩、恩佐斯 DK（F-871）；zoo-v9 value 高估（F-874）。
- 小事：test_cheap_opp.py 參考雜湊過時（F-856）；F-864 專門測試（L-049）；guard 候選 F-825–F-828、F-842、F-843、F-845；opp-likeness 要更多實戰蛋牧對局（E-260）。
- 重播工具 `src/selfplay-replay.mjs`／檢視器 `runtime/replay-viewer/`（F-873）；使用者貼回一手的處理方式見封存檔「重播」段。
- 5090 可刪目錄清單在封存檔；刪前確認結果已拷回 `runtime/`。

## 環境
- 5090 走 Tailscale `ssh kojiek@100.97.181.15`（L-080）；NTNU VPN Keepalive 停用。
- 評估一律用 compare，seed 間距 ≥ 局數、避開挑模型用過的範圍（L-046、L-047）。

## 開放問題
- 模擬蛋牧比真人弱（F-784、L-038、E-248）；對 DH 數字可能對 dh-basic 過擬合（F-721）；月之祝福／交織命運選項數是假設（F-851、F-852）；zoo-cheap 與 discard 要不要拆版本（F-755）；findings 待驗清理（`grep -n "待驗" memory/findings.md`）。
