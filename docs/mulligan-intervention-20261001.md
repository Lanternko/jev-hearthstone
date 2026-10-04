# 2026-10-01 換牌失誤斷點接手

本批次 `ranked-2026-10-01T12-42-04-012Z` 前 21 場完成：9 勝 12 敗。第 22 場在換牌後退出，停止時勝負 Unknown；之後原始日誌確認 Loss，另存 post-stop-result，不改停止當下的紀錄。含這場為 9 勝 13 敗，但這場沒有任何模型決策且中途無人操作，應標記 interrupted，不能混成正常策略樣本。沒有配對舊版實戰，因此不宣稱變強或變弱。

前 21 場共 516 筆模型決策：515 筆 Jev，一筆 backup_model，沒有 rule_fallback。這是來源核實，不是決策品質證明。

## 已驗證的失敗

第 22 場實際動作 m4／choice 1 要求換掉實體 15（Soul Barrage）。23:24:09 的伺服器回報 kept = [4,21,15,14]，確實沒有換掉。Windows 事件送達、視窗正確、游標落在記錄的目標；這不能證明遊戲接受了卡片選取，也不能證明座標／動畫必然正確。不用推測調整點擊時機或整個牌組權重。

舊 loop 在確認後立即退出，不能重做起手卻讓後續回合沒有操作。新版保留嚴格 misfire 驗證，只有完整、同一局、同一玩家、換牌視窗已關閉、所有 kept ID 都屬於起手牌時，清除舊換牌動作並從實際盤面重新決策；當場打完後回傳停止訊號，批次不繼續排下一局。未知／外來／不完整回報仍停止。這改善退出時機，沒有修好「卡片點擊未被接受」的根因。

另修封存起點：PowerTaskList 的 CREATE_GAME 重複標記比 GameState 晚，原先最後字串截取會丟掉起手實體／選單。改取最後一個 GameState CREATE_GAME 的完整行。第 22 場補存 full-Power.log；舊檔保留。

## 固定來源研究與取捨

沒有複製第三方程式碼；以下只參考狀態切換／設計想法，保留原專案授權。

- [AutoHS 4e56715414b793af76a419e084ed6e1321a62d57](https://github.com/Yiyuan-Dong/AutoHS/blob/4e56715414b793af76a419e084ed6e1321a62d57/controller/FSM_action.py)：Choosing 對局回合開始後進 Battling，再讀實際日誌狀態。採用「階段已結束就以現況繼續」的概念；它會重按選牌的方式未採用，因為我們的選牌是 toggle，盲重按會反選。MIT。
- [Hearthstone-Script 9d8c7ad94bd52ce9d4812e40f7b45b052ae3f047](https://github.com/xjw580/Hearthstone-Script/tree/9d8c7ad94bd52ce9d4812e40f7b45b052ae3f047)：研究其固定子模組 hs-script-app [e469253540b78db31911805c4a9eb46be30af2ff](https://github.com/xjw580/hs-script-app/blob/e469253540b78db31911805c4a9eb46be30af2ff/src/main/java/club/xiaojiawei/hsscript/strategy/phase/ReplaceCardPhaseStrategy.kt) 與 DeckStrategyActuator.kt。ReplaceCard 階段依 NEXT_STEP MAIN_READY 退出，changeCard 排除硬幣並延遲確認。採用伺服器階段／回報作為恢復門檻；不照抄固定延遲或連點確認。GPL-3.0 與附加限制。
- [WeightHandlerStrategy 7e4968fb15c2879a75917328deb4c266a7ea00be](https://github.com/to52360/WeightHandlerStrategy/blob/7e4968fb15c2879a75917328deb4c266a7ea00be/WeightHanderStrategy/src/main/kotlin/lin/domain/result/ChangeCardSelector.kt)：ChangeDecision 的 keep/remove 是純策略計算，與外層執行分開；留牌與出牌權重／組合加分分開。此例策略已要求換掉 Barrage，失敗在執行，故不改策略權重。GPL-3.0 與附加限制。

## 可複驗資料與版本

- 實際回報前後狀態：test/fixtures/user-rulings/ranked22-mulligan-misfire.json；從完整 Power.log 在 SendChoices 前及完整 receipt 後分別重播，沒有把終局狀態假改成 RUNNING。
- 對照：舊驗證 = misfire／原實戰退出 0 actions；新驗證仍 = misfire，新恢復函數回傳 actualKept 與 stopAfterGame。test/mulligan-recovery.test.mjs 同時測不完整、視窗未關、其他局／玩家、陌生及重複 ID 不恢復。
- test/game-health.test.mjs 驗證兩局及客戶端重複 CREATE_GAME 不漏掉開局。
- 凍結修改前／後 src、decks：eval/runs/mulligan-recovery-20261001/baseline、candidate；必要完整測試與 paired-strategy 另存該資料夾。策略 prepare、權重與搜尋保持相同；配對離線評估應一致。
- 新批次標記 `silverfish-v1-execution-v2`；模型與戰術搜尋沿用 silverfish-v1。舊資料不改版本，不把可靠性恢復冒充胜率提升。

重跑：`npm test`；`node src/eval-silverfish.mjs --baseline eval/runs/mulligan-recovery-20261001/baseline --output runtime/mulligan-paired-rerun`。介入後的 live 結果仍待新批次；原始權重未改。
