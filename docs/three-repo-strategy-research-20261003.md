# 三個策略專案的固定版本研究（2026-10-03）

## 結論與範圍

值得繼續參考；優先順序為 WeightHandlerStrategy → Hearthstone-Script → AutoHS。目標是改善組合候選、行動相依性、模擬與實際執行的一致性。三個專案在 2026-10-01 已參考過換牌恢復，見 `mulligan-intervention-20261001.md`；本次進一步閱讀策略原始碼。

本輪完成來源研究及實作建議，未修改正式策略、未重啟排位、未呼叫付費決策模型、未執行第三方程式、未提交 Git。來源本機 checkout 無未提交修改。研究不是勝率增強的證據。

## 固定來源

| 專案 | commit | 授權檔所載 |
| --- | --- | --- |
| [Hearthstone-Script](https://github.com/xjw580/Hearthstone-Script/tree/9d8c7ad94bd52ce9d4812e40f7b45b052ae3f047) | `9d8c7ad94bd52ce9d4812e40f7b45b052ae3f047` | GPL-3.0；根專案另附非商業用途條款 |
| [WeightHandlerStrategy](https://github.com/to52360/WeightHandlerStrategy/tree/7e4968fb15c2879a75917328deb4c266a7ea00be) | `7e4968fb15c2879a75917328deb4c266a7ea00be` | GPL-3.0；LICENSE1 另附非商業用途條款 |
| [AutoHS](https://github.com/Yiyuan-Dong/AutoHS/tree/4e56715414b793af76a419e084ed6e1321a62d57) | `4e56715414b793af76a419e084ed6e1321a62d57` | MIT 文字；版權欄仍為佔位文字 |

Hearthstone-Script 的程式主要在子模組，不能只固定根 commit 後讀子模組最新版本。本次閱讀根 commit 指向的：

- hs-script-base-strategy-plugin `49f9fa86c757cf29aae80fd23ab9485266775239`。
- hs-script-card-sdk `520bbe521517a51b2dd315afd05b09dda424b45e`。
- hs-script-strategy-sdk `92781e46ebf0a3351329d27be098602feea66be9`。
- 換牌恢復先前閱讀的 hs-script-app `e469253540b78db31911805c4a9eb46be30af2ff`。

checkout 位於 `runtime/research-20261001/`。本次僅整理設計概念，不複製第三方實作；未判定上述附加條款與其他授權的相容性。

## 1. WeightHandlerStrategy：最直接對應目前問題

來源：

- [CandidatePolicyFilter.kt](https://github.com/to52360/WeightHandlerStrategy/blob/7e4968fb15c2879a75917328deb4c266a7ea00be/WeightHanderStrategy/src/main/kotlin/lin/bean/CandidatePolicyFilter.kt)：第一輪候選讓 combo 成員越過單卡軟門檻；硬禁仍有獨立語義。第二輪填費另有門檻，沒有全面放行所有組合成員。
- [ComboPlanDefinition.kt](https://github.com/to52360/WeightHandlerStrategy/blob/7e4968fb15c2879a75917328deb4c266a7ea00be/WeightHanderStrategy/src/main/kotlin/lin/bean/usePlan/ComboPlanDefinition.kt)：組合加分與組級先後關係分開，留牌協同分與出牌協同分也分開。
- [UsePlanOrderer.kt](https://github.com/to52360/WeightHandlerStrategy/blob/7e4968fb15c2879a75917328deb4c266a7ea00be/WeightHanderStrategy/src/main/kotlin/lin/domain/use/plan/UsePlanOrderer.kt)：先有穩定順序，再處理相依邊；記錄實際排序因素與約束。循環約束回退基礎排序。
- [ComboDomain.kt](https://github.com/to52360/WeightHandlerStrategy/blob/7e4968fb15c2879a75917328deb4c266a7ea00be/WeightHanderStrategy/src/main/kotlin/lin/domain/ComboDomain.kt)：區分執行成功、失敗與已重規劃；補打時再次檢查資源與候選。

**對 Jev 的推論：**目前規則把「素材不該直接打」與「完整鋪場組合」混在前置刪除中。應先保留安全且資源可行的組合第一步，再用整條路線比較價值；候選資格、組合評分、動作排序分成明確責任。這不等於單卡全面解禁，也不代表照抄該專案的任意權重。

具體證據是新批次 #18 T5：`wastedFodder` 的豁免依賴 `buffSetupActions`，後者仍要求 `valuableBuff`，兩隻原有手下時便剪掉侍僧。模型因此看不到相關候選。見 `new50-review-20261003.md` 及 `eval/runs/new50-review-20261003/game18-t5-order-candidate.json`。

但使用者的最新裁定更強：**時光利爪 4 費 → 英雄攻擊棄掉唯一最高費的侍僧 → 觀察兩隻隨機召喚 → buff 1 費 → 原手下攻擊**。手動侍僧→buff 只是可行替代，不能當作這場的正確答案。fixture 為 `test/fixtures/user-rulings/new50-game18-weapon-acolytes-buff.json`。

因此應表示「鋪場來源」，包含打出、棄牌、英雄攻擊觸發。組合關係必須容許**某次攻擊在 buff 前、其他攻擊在 buff 後**，不能用所有攻擊都排最後的固定階段取代規劃。未知召喚後重新觀察，不把隨機身分算成確定結果。

## 2. Hearthstone-Script：參考模擬契約，MCTS 暫不整套替換

來源：

- [MonteCarloTreeNode.kt](https://github.com/xjw580/hs-script-card-sdk/blob/520bbe521517a51b2dd315afd05b09dda424b45e/src/main/kotlin/club/xiaojiawei/hsscriptcardsdk/mcts/MonteCarloTreeNode.kt)：從當前資源與盤面產生行動，複製盤面後套用動作模擬，再於新盤面生成下一步。
- [Action.kt](https://github.com/xjw580/hs-script-card-sdk/blob/520bbe521517a51b2dd315afd05b09dda424b45e/src/main/kotlin/club/xiaojiawei/hsscriptcardsdk/bean/Action.kt)：同一動作分別持有模擬、執行及重新計算標記。
- [MCTSDeckStrategy.kt](https://github.com/xjw580/hs-script-strategy-sdk/blob/92781e46ebf0a3351329d27be098602feea66be9/src/main/kotlin/club/xiaojiawei/hsscriptstrategysdk/deck/MCTSDeckStrategy.kt)：執行遇到 recalculate 即中斷舊序列再搜尋。
- [WarScoreCalculatorBuilder.kt](https://github.com/xjw580/hs-script-card-sdk/blob/520bbe521517a51b2dd315afd05b09dda424b45e/src/main/kotlin/club/xiaojiawei/hsscriptcardsdk/bean/WarScoreCalculatorBuilder.kt)：手牌、場面、資源、牌庫及秘密的評分可覆寫，屬啟發式分數。

**對 Jev 的推論：**保留目前 Silverfish 式序列搜尋，優先統一動作效果與執行回報：裝武器不等於已棄牌，英雄攻擊才觸發；未知抽牌／召喚／棄牌目標後中止舊計畫。這部分 Jev 已有終止不精確節點、逐步觀察的基礎，要驗證完整流程是否確實消費相同語義，而非另建重複搜尋器。

不能把這版 MCTS 當成真實勝率模型：

- [MonteCarloTreeSearch.kt](https://github.com/xjw580/hs-script-card-sdk/blob/520bbe521517a51b2dd315afd05b09dda424b45e/src/main/kotlin/club/xiaojiawei/hsscriptcardsdk/mcts/MonteCarloTreeSearch.kt) 搜尋時清空對手未知手牌；rollout 的成功判準是末端啟發分數高於根節點，並非實際贏局。
- [HandArea.kt](https://github.com/xjw580/hs-script-card-sdk/blob/520bbe521517a51b2dd315afd05b09dda424b45e/src/main/kotlin/club/xiaojiawei/hsscriptcardsdk/bean/area/HandArea.kt) 模擬抽牌將牌設為隨機 0–10 費法術，未按實際套牌分布抽樣。
- [HsMCTSDeckStrategy.kt](https://github.com/xjw580/hs-script-base-strategy-plugin/blob/49f9fa86c757cf29aae80fd23ab9485266775239/src/main/kotlin/club/xiaojiawei/hsscriptbasestrategy/strategy/HsMCTSDeckStrategy.kt) 範本使用 turnCount=1，並明示需要卡牌適配；不是已驗證的跨兩三回合棄牌術規劃器。

因此不直接移植抽牌估值、控制對手回應或整套 MCTS。以實際牌庫、未知邊界與移除情境做模型，才符合本專案需求。

## 3. AutoHS：交換與決策分解參考，策略優先度較低

來源：

- [strategy.py](https://github.com/Yiyuan-Dong/AutoHS/blob/4e56715414b793af76a419e084ed6e1321a62d57/strategy/strategy.py)：`get_best_attack_target` 比較傷害後雙方場面價值差，並保留嘲諷／斬殺等限制。
- [strategy_entity.py](https://github.com/Yiyuan-Dong/AutoHS/blob/4e56715414b793af76a419e084ed6e1321a62d57/strategy/strategy_entity.py)：手下與英雄使用不同啟發估值，英雄傷害價值按血量分段。
- [FSM_action.py](https://github.com/Yiyuan-Dong/AutoHS/blob/4e56715414b793af76a419e084ed6e1321a62d57/controller/FSM_action.py)：每次更新日誌、建立策略狀態，再挑地標、出牌、攻擊；有重複決策與超時處理。

**對 Jev 的推論：**用交換後剩餘攻血、可攻擊資源、對手引擎價值等拆分解釋，有助檢查非控制對局是否保持場面與續航。但不是新的完整回合搜尋；`FSM_action.py` 固定先考慮地標，其註解理由是該牌組地標抽牌。直接移植會與我們打控制時把法力集中鋪場／buff 的目標衝突。單卡基本估值及硬幣只看單張解鎖收益，也不適合作為棄牌術組合估值。

## 下一次實作及可複驗門檻

1. **先修候選與組合相依性。** 使用 #18 最新裁定，從原始 legal options 一路驗證 constrain → prepare → PLAN／forced action → 執行；不要只測 `buffDevelopmentActions` 這個局部函數。
2. **將攻擊觸發鋪場納入整條路線。** 比較武器線、直接素材線、先 buff 線；記錄各步法力、場位、棄牌目標及未知邊界。硬幣、隨機最高費平手、不能英雄攻擊、致命自傷與滿場都需反例。
3. **軟偏好不要充當硬合法性。** 候選剪除需有原因，組合安全豁免需有證據；原始候選、剪除候選、組合與最終動作都能追溯。這是本輪最重要的結構改進，避免再增加幾百盤面卻仍被上游舊門檻卡住。
4. **再校準四象限目標。** 控制偏有限回合內有效壓力與 buff 多目標收益；非控制偏優勢交換、補牌後可用法力與續航。保留未知對局信心，不使用對局結束才知道的牌型。

離線驗證應凍結舊版／新版，同盤面、同原始候選、同搜尋預算，報告：使用者裁定符合率、可行組合被誤刪率、模擬與執行契約差異、致命／斬殺反例及延遲。新案例另做未參與調整的保留集，不用新增案例數冒充泛化。

通過完整必要測試與配對案例，只能說降低了已知錯誤。要主張排位變強，仍需另有新版本實戰資料、清楚的版本分界及對局組成比較；本輪沒有啟動這項實驗。
