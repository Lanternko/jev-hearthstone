# Silverfish 搜尋機制與棄牌術實作

研究版本固定為 noHero123/silverfish `cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7`（2016-01-07）。本次修改前，我們已經有 beam search、確定性戰鬥模擬、候選描述與實際盤面核對；不是重新加入整回合搜尋。保存的基準包含使用者既有未提交改動，沒有用 Git HEAD 代替目前腳本。

## 原始碼研究與採用決策

| Silverfish 原始碼 | 讀到的機制 | 本次採用方式 |
|---|---|---|
| [MiniSimulator.cs L110–267](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/MiniSimulator.cs#L110) | 每層產生行動、複製盤面、模擬、排序；受深度／寬度限制 | 延用已有搜尋，增加固定節點預算與截斷診斷；不是 MCTS，也不保證全域最佳 |
| [MiniSimulator.cs L387–435](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/MiniSimulator.cs#L387) | 高分盤面以 hash 加等價檢查去重 | 搜尋鍵與即時核對鍵分開；搜尋鍵保留攻擊次數、可攻擊性、手牌費用／體質、天生技、空位與棄牌歷史。先去重再截 beam |
| [Playfield.cs L1225](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/Playfield.cs#L1225) | 等價檢查包括英雄 readiness、攻擊次數、能力可用性等 | 修正我們原本拿寬鬆即時 signature 做搜尋去重的問題，避免合併未來行動不同的盤面 |
| [SimTemplate.cs](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/SimTemplate.cs) | 卡牌效果分為出牌、戰吼、死聲、棄牌等事件 | 新增狹窄 discard-model 模組，依完整卡面辨識固定棄牌收益；沒有搬入舊 C# 引擎 |
| [Playfield.cs L6951](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/Playfield.cs#L6951) | 非 server 搜尋用第一張手牌近似隨機棄牌 | 不採用：同費最低／最高並列保留未知，不指定某張、不延續計畫 |
| [Playfield.cs L5950](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/Playfield.cs#L5950) | 未知抽牌用不可正常出牌的占位牌 | 延續資訊邊界：只估已知抽牌傷害／手牌上界，抽後觀察；不假造抽到的牌 |
| [BehaviorFace.cs](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/BehaviorFace.cs) | 生命、手牌、場面、傷害加權；懲罰棄牌後再出牌 | 不採用舊棄牌懲罰；固定召喚直接計入場面，避免再次給泛用棄牌 bonus |
| [Ai.cs L321、L646](https://github.com/noHero123/silverfish/blob/cf6d1657e9dc99b9bcac9cc6e3c26f6ed8d0f2c7/ai/Ai.cs#L321) | 先斬殺、盤面符合預測才續行；抽牌／隨機效果限制排隊 | 保留我們的逐步核對；只有整條皆 exact 的路線可強制宣告斬殺 |

Silverfish 的第二回合／敵方回合搜尋也是啟發式模擬，不能把它當成知道對方手牌的最佳回應。本次沒有加入隱藏手牌預測或完整敵方回合模擬：我們尚未有足夠準確的全卡池效果引擎。

## 實際新增能力

- 低語唯一最低費、利爪唯一最高費，若棄 Walking Dead／Silverware Golem，依剩餘空位召喚；棄 Boneweb Egg 依空位召喚至多兩隻 2/1。低語在召喚後才 buff，所以新身體也受益。
- 公爵原本的公開 tags 已含歷史成長。每次新模擬棄牌只加一次 +2/+2，作用於手牌與場上公爵；之後出牌使用更新體質。沒有把新召喚的普通手下當成可立即攻擊。
- 利爪「攻擊後」棄牌移到戰鬥結算後處理；不在戰鬥之前利用棄牌結果改變本次攻擊。
- 同費並列、侍僧隨機召喚、彈幕隨機傷害、抽牌、發現／指定棄牌選擇，以及已偵測的友方未建模事件引擎仍停下觀察。合成 token 的實體 ID 與實際不同時，既有核對會捨棄後續佇列。
- 預設 beam 300、depth 12、maxNodes 24000；`searchStats` 記錄節點量、去重、beam 剪枝與節點／深度截斷。最複雜的既有盤面會觸及節點上限，所以必須把搜尋結果描述為找到的路線，不能聲稱已窮舉。

這仍是局部模擬器。未知死聲、秘密、特殊防傷／傷害替代、地點選項、暫時牌完整回合結束事件與所有外部觸發尚未完整支援。一般規則的精確性不能由這批小題庫外推到全部爐石卡牌。

## 可複驗的判斷

執行 `npm test`、`npm run eval-silverfish`。結果存於 `eval/runs/silverfish-20261001/report.md` 與 `results.json`，每題保留結果、序列、耗時、來源與題庫 SHA256。基準原始碼在該目錄的 `baseline/`。

8 個固定棄牌案例是針對新增能力的開發題，期望由卡牌規則推導；不能拿這個通過率当整體棋力。另有固定種子 20261001 的 64 個 development 與種子 20261002 的 128 個 held-out 純戰鬥盤面，使用不引用正式 sim/plan/policy 或評分權重的獨立窮舉器。窮舉器只接受其宣告支援的子集合。

16 個使用者舊裁定及 13 個真實 fixture 用於回歸。它們曾參與開發，不是盲測；只比較最佳第一步是否仍可選，以及規則備援會選什麼。沒有重新呼叫 Jev，因此這個分數不能標成 Jev 成績。

第一輪比較真的抓到一個回歸：將任何棄牌都加入無攻擊計畫，讓備援在 g3t7r586 選低語棄連鎖。已限縮為有固定召喚收益的棄牌計畫，恢復先連鎖的舊裁定。`initial-results.json` 保留失敗結果，沒有只保留修好的成績。

## 勝率如何驗證

已加入版本切換 `JEV_SEARCH_VERSION=silverfish-v1`（預設）與 `baseline-20261001`（本次修改前的固定快照）。bridge 在開局程序 log 與模型決策記錄寫入版本，不會因基準缺失而偷偷改用新版。`JEV_PLANNER=0` 是禁用 planner，不能當成本次的旧版本。

建議預先固定牌組、模式、模型／備援流程、程式快照、可比較的分段與樣本數。用兩局一個時間區塊，區塊內隨機排新／舊，避免把新舊分在不同天、段位或環境。800 局（各 400）只是已產生的候選計畫，不會自動開局，也不保證能檢出小幅差異；可在開始前重訂樣本量。檔案為 `prospective-schedule.json`，種子 20261001，所有 result 都是 null。

PowerShell 在開始單局前設定 `$env:JEV_SEARCH_VERSION='baseline-20261001'` 或 `'silverfish-v1'`，再使用既有 `npm run game`。不修改、不額外啟動既有 batch runner；已載入的程序不會熱更新。

每局依預定 trial 填 `result`（WIN／LOSS／DRAW／FAILURE）、唯一 `gameId`、固定 `model`、`deckHash`、`mode`；另外保留先後手、对手類別、段位、日期、模型備援比例與手勢失敗。開局後因腳本失敗而中斷算非勝，不能只刪掉新版失敗局；尚未開打保留 null。不要用歷史不同版本的勝率當同期 A/B。

在保留全排程的結果副本上執行 `npm run eval-strength -- results.json`；若重訂排程，用 `--schedule-file schedule.json`。工具核對預登記 trial，拒絕刪掉未完成局、重複對局及混合模型／牌組／模式，回報每組 Wilson 區間與新舊差值的 Newcombe 約 95% 區間。完整實驗的差值區間下界大於 0 才有提升證據；含 0 判為未定，未完成時不宣告成功。這是假設對局近似獨立的估計，不能消除配對環境、連續排隊或段位變動造成的偏差。

區間方法來源：[Newcombe 1998，獨立比例差的區間比較](https://pubmed.ncbi.nlm.nih.gov/9595617/)。不要每幾局重看顯著性、見好就收；修改權重後重新固定版本並開始新的實驗。

最終候選來源、題庫、裁定與 JSON fixture 另保存於 `eval/runs/silverfish-20261001/candidate/`；已實際重跑的最終報告在 `frozen-rerun/report.md`。之後主線改動時仍可重跑本次固定版本：

```powershell
node eval/runs/silverfish-20261001/candidate/src/eval-silverfish.mjs --baseline ../baseline --output ../frozen-rerun
```

目前可支持的結論是搜尋新增了可用的固定棄牌 combo；沒有實戰 A/B 結果，尚不能宣稱勝率提高。
