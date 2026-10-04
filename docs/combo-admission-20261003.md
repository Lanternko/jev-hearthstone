# 完整組合進入決策流程：combo-admission-v1

已實裝，預設策略版本為 `silverfish-v1-combo-admission-v1`。本轮排位維持停止。

## 行為

從遊戲的原始合法選項先做有界的鋪場→buff 組合搜尋（最多 256 條邊、4 個鋪場／解鎖步驟），再套用單卡政策。涵蓋已支援的普通手下、確定召喚、文字可辨識的隨機召喚法術、硬幣及最高費棄牌武器的英雄攻擊。當整條路線保有 buff 費用與足夠場位時，第一步可越過 `wastedFodder` 的單卡保留門檻；能觸發組合的英雄攻擊也可越過 `spendFirst` 的一般攻擊延後規則。

通用機制在 `src/combo-admission.mjs`；`policy.mjs` 收集候選證據，`choose.mjs` 消費同一份證據，`plan.mjs` 提供至多三個不同第一步／buff 的 `combo` PLAN。除確定斬殺与既有使用者硬裁定外，這是新增比較選项；不是把每條可行組合都強制執行。

隨機召喚只保留數量上界，不建立假手下、不預測體質或保證 buff 資格。PLAN 的可執行部分止於未知動作；其接續是「保留 N 費，觀察後重查 buff／場面／存活／合法動作」的條件說明，沒有把 buff 放進跨未知結果的動作快取。最高費平手、秘密、未建模的戰鬥／友方引擎、槽位不足及可見致命風險不取得此種武器組合證據。

原有 Life Tap 資訊意圖仍可與組合比較。回歸曾發現新 fallback 跳過 `g1t13r530` 的抽牌先行裁定，已修正：當原本首選資訊意圖仍留下足夠法力完成整條組合，備援先取得資訊。新增組合不是全面禁止抽牌。

## 第 18 場與同時進行的武器修正

`test/fixtures/user-rulings/new50-game18-combo-input.json` 從原批次 game-0018-Power.log 的 **04:07:06.196 前綴**還原原始選項，配上當時已保存的盤面；沒有合成侍僧選項或用終局狀態補寫。原遊戲選項確實包含侍僧 o3。舊版前置政策把它刪除，備援選 buff；新版保留該選項，並有裝武器→攻擊棄侍僧→保留 1 費 buff 的組合證據。

另一個使用者對話同期加入 `weapon-buff.mjs` 的三情況規則；保留該授權實作，不覆寫。它在這個明確裁定上選武器第一步；通用機制則提供可追溯的整條費用／前綴證據，並支援不同名稱、不同召喚數、硬幣與普通手下。因此不能將這場第一步的改善全部歸功於通用組合入場。

`bridge.mjs` 會保留 rawOptions、candidateTrace、combinationEvidence，以及選中的 PLAN；強制組合第一步也記錄。模型看到的是壓縮證據與 PLAN 說明，最多 12 條證據；總數與截斷狀態另記錄。原始與裁剪選項可核對，`softHoldExemptions` 指出素材保留豁免，`blockedFirstIds` 指出仍被後續過濾阻擋的組合第一步。

## 固定版本與可複驗資料

資料位於 `eval/runs/combo-admission-20261003/`：

- baseline：修改前 src／decks／data，包含前一個 class-prior 引擎；在同期武器專用修正前凍結。
- candidate：最終 src／decks／data／package.json，包含已保留的武器專用修正及通用入場機制。
- candidate-tests.zip 與 tests.log：測試來源及完整 375 項通過紀錄；不用解壓到 Node 自動搜尋的測試目錄。
- validated/inputs.json、results.json：固定輸入、原始候選、兩版及 admission 關閉的配對結果、每次耗時和 SHA-256。
- silverfish-final/：原有戰術、戰鬥 oracle 與人工裁定回歸；中途失敗結果保留在較早的輸出目錄。

預設主搜尋預算仍為 beam=300、depth=12、maxNodes=24000；新增加的 proof pass 有獨立 256 邊上限，會回報截斷。舊版沒有此額外搜尋，不能宣稱兩版總計算量完全相同。關閉 admission 的消融使用同一新版模擬器與武器規則，隔離候選／組合入場部分。

先前指向動態最新檔案的 class-prior、silverfish-v1 與 matchup-objective 名稱，現在固定指向本次修改前實際解析的來源。這保存本次前後邊界，不是重建這些名稱最初發布時的歷史版本。既有更早 frozen baseline 路由保持不變；新預設與下一批 runner 使用新版本名稱，不修改舊批次標籤或結果。

重播（在專案根目錄）：

```powershell
npm test
node src/eval-combo-admission.mjs --baseline eval/runs/combo-admission-20261003/baseline --candidate eval/runs/combo-admission-20261003/candidate --inputs eval/runs/combo-admission-20261003/validated/inputs.json --output runtime/combo-admission-rerun
node src/eval-silverfish.mjs --baseline eval/runs/combo-admission-20261003/baseline --output runtime/combo-silverfish-rerun
```

## 驗證結果與界限

375/375 測試通過，包括 63 組費用／場位／召喚數組合，以及原始第 18 場、硬幣解鎖、未知邊界、同費平手、冰凍／耗盡、秘密、致命攻擊／自傷、未建模引擎與槽位反例。

42 個離線輸入包含一個真實裁定及 41 個機制推導案例：新版 42/42 有整條組合證據，32 個實際提供 combo PLAN，另 10 個由既有強制規則選第一步但保留組合證據。旧版与关闭 admission 的版本没有该新增组合表示。**这不是 0%→100% 策略正确率**：原本单张首步的可选性在 38 个指定首步案例中，两版都为 38/38；新增能力是整条路線的費用／順序／未知接續进入選單与紀錄。7 個負面場景沒有不安全武器證據，也沒有跨未知結果的快取接續。這些案例參與開發／敏感度驗證，不冒稱獨立未見戰術測試集。

在固定硬體這次重播，每案重跑三次取中位數，再取跨案例中位數：舊版 0.569 ms、新版 0.757 ms、消融 0.535 ms。只有本組輸入的本機準備時間；不能據此保證任意實戰盤面的延遲。大型歷史盤面的主搜尋仍可能耗時約 2.4 秒，沒有在本輪另外優化。

原有回歸：8/8 戰術仍可搜尋與提供；192/192 戰鬥 oracle 最佳傷害保持；80/80 可見斬殺識別且零假斬殺；16 個人工裁定的最佳首步可選性維持 15/16，備援分維持 10.5，沒有新增退步。原本未達標的裁定沒有被這次研究宣稱修好。

未呼叫付費模型、未啟動對局、未讀 `.env.local`、未提交 Git。沒有新版實戰勝率，也沒有已標註的 Jev 模型選擇正確率。此版本改善的是已支援效果的候選與組合規劃；複雜未建模卡效和跨未知結果的實際接續仍需觀察後決策。
