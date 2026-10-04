# 否決規則逐條檢查（規則分層第 3 步）

新版 `silverfish-v1-veto-audit-v1` 已設為預設。上一版 `silverfish-v1-rule-release-v1` 從 `eval/runs/veto-audit-20261004/candidate/` 封存載入。這一步沒有開排位，也沒有呼叫 Jev 或 Gateway。

## 原則

- **否決**：規則或算術能證明這個動作是錯的。它最先執行，沒有任何東西能把動作放回來，也不再有「刪光就還原」。
- **偏好**：仍然是預設，但只在刪完還有剩時才生效（不會把選單刪空）。
- **模擬器解除**：只用在「這回合的先後順序」類偏好。被刪動作的最佳計畫必須嚴格高於規則那條線與什麼都不做，才放回一個（同第 2b 步）。
- **保留型偏好**：把牌留到之後的回合。模擬器只算一回合，留在手上的牌沒有分數，任何「現在打出」都會贏，所以這類規則不交給模擬器解除。

## 否決（11 條）

| 規則 | 刪掉什麼 | 證明 | 全歷史觸發 |
|---|---|---|---:|
| suicide | 會打死自己的動作 | 動作本身扣光我方血量 | 15 |
| drawKills | 疲勞抽牌致死 | 同上 | 9 |
| lethalSelfDamage | 自傷致死 | 同上 | 7 |
| boardLethalTap | 對手場攻已夠斬殺時的自傷英雄技能 | **使用者類別「天生技後被場攻斬殺」，不是嚴格證明**（之後若解場仍可能活） | 7 |
| tapExposesBoardLethal | Tap 後血量落入對手場攻斬殺線 | 同上，使用者類別 | 6 |
| locationResting | 冷卻中的地標 | 遊戲拒絕點擊 | 0 |
| deadCoin | 沒東西可花的硬幣 | 多出的水晶無處可用 | 0 |
| burnOwnHero | 傷害法術指向我方英雄 | 使用者裁定 | 20 |
| buffNobody | 沒有受益對象的場面 buff | 受益者為 0 | 12 |
| deadDraw | 只會爆牌或疲勞的純抽牌 | 可用抽牌數 0 | 0 |
| idleHeroAttack | 英雄獲得攻擊但沒有可揮的對象 | 增益無法使用 | 0 |

不再是否決、也不再有備援的：舊的「安全閘」拆成兩條否決（lethalSelfDamage、buffNobody）與四條偏好；DH 的 heroAttackGain 過濾改為 idleHeroAttack 否決。

## 偏好

| 類型 | 規則 |
|---|---|
| 順序型（模擬器可解除） | freezeThreatFirst、castBeforeSwing、weaponFirst、wastedFodder（fodderRelease）、counterFirst、overflowWaits、buffBeforeTap、weaponBuffFirst、developBeforeBuff、mustSpend（攻擊那一半）、setupFirst、bodyBeforeBuff |
| 保留型（不交給模擬器） | deferHardCast、saferCopies、passiveEggCoin、wastedBurn、splitToFace、overdrawWaits、deadWhispers、whispersWaits、whispersEatsPlayable、newBodyBuffWaits、buffTapMana、pricedOut |
| 模擬器不模擬的棄牌選擇 | doomedPick、boardFirstDiscard、occultistPick（同保留型處理） |

### 為什麼要分出保留型

第一次把所有偏好都交給模擬器時，有三個使用者裁定被推翻：

- game 46 第 1 回合：留硬幣，不跟孤零零的 0/2 蛋一起下 → 模擬器放回了硬幣。
- New50 game9 T2：單一睡著的身體不吃 buff → 模擬器放回了 buff。
- 單一醒著的身體、buff 與 Tap 搶水晶時先抽牌 → 模擬器放回了 buff。

三次的「規則那條線」不是只剩結束回合，就是只剩 Tap。模擬器給「留在手上」0 分，所以只要打得出去就贏。這不是證據，是模型看不到下回合，因此這類規則維持預設刪除。

## 仍然硬刪的 END_TURN（使用者 2026-10-05 確認）

這三處刪的是「結束回合」。沒有任何計畫以結束回合開頭，模擬器無從比較，所以不交給模擬器。使用者逐條回覆後的處理：

1. **whispersWorthCasting**（「大部分時候三隻怪以上就值得丟」「手上有侍僧或派對可能會考慮扣到舖場時才丟」）
   - 場上三隻以上、水晶夠，就不准結束回合。
   - 例外：手上有打出時召喚的牌（Disposable Acolytes、Party Fiend），而且這回合放不下它與 Whispers 兩張，就允許結束回合，由 Jev 決定。
   - 例外的例外：Whispers 自己會吃掉那張侍僧時，棄牌本身就會召喚，所以照樣不准結束（validation10 game 3 的裁定）。
2. **mustSpend**（「有時候會扣直傷 或蛋等配合 但大部分都要盡量舖場」）
   - 預設仍然不准結束回合。
   - 例外：剩下該打的牌全是直傷法術，或是蛋類（棄掉會觸發亡語的手下）而手上另有棄牌出口可搭配時，允許結束回合。
   - 單獨一顆蛋、手上沒有棄牌出口時，它就是舖場，照樣要打。
   - 攻擊那一半仍是偏好，不受影響。
3. **只剩 Tap**（「通常都是對的 尤其是前四回合沒有血量壓力又缺牌」）：維持原樣。

## 結果

- **全歷史重播**（90 檔、8524 決策，`eval/runs/veto-audit-20261004/history.json`、`history.log`）：
  - 否決觸發 76 次（分布見上表）。
  - 模擬器解除 3 次：weaponFirst 1、bodyBeforeBuff 1（與第 2b 步相同），新增 setupFirst 1。
  - 選單差異 1 個（就是 setupFirst 那次），沒有無法解釋的差異；錯誤 0。
- **新增的 setupFirst 解除**（09-29 18:08）：
  - Gul'dan 3 血，手上只剩 Boneweb Egg，選單是結束、英雄揮 Chronoclaws 打 Tyrande、Chamber of Viscidus。
  - setupFirst 要求先開地標再攻擊。模擬器認為先揮刀較好（−41.5 對 −47.6，什麼都不做 −50）。
  - 這條裁定的原意是「別讓已攻擊的手下錯過 +1/+1」，而揮刀的是英雄，本來就吃不到地標的 buff。當時 Jev 選的是地標。
- **耗時**：全歷史合計 4.2 s（上一版 7.4 s），單一決策最長 87 ms。保留型規則不再跑搜尋，而且開放性檢查放在搜尋之前。
- **END_TURN 調整後**（`eval/runs/end-turn-20261005/`）：
  - 全歷史 8524 決策裡，有 4 個決策多保留了結束回合，全部來自 mustSpend 的例外。其餘與上方相同，錯誤 0。
  - 這 4 個：2 次手上只剩 Soul Barrage（Jev 實際選了 Soul Barrage、Life Tap），2 次是 2 費空場、蛋加 Whispers（Jev 實際下了蛋）。
  - whispersWorthCasting 的例外在歷史中沒有觸發。
  - 506/506 測試通過，新增 2 項。組合、戰鬥、斬殺與裁定的對照都沒有變。
- **測試與對照**：
  - 504/504 測試通過，新增 `test/veto-audit.test.mjs` 3 項。
  - 42 組合、192 戰鬥、80 斬殺、16 人類裁定、8 戰術都與上一版相同。

## 已知限制

- boardLethalTap、tapExposesBoardLethal 是使用者劃定的類別，不是嚴格證明。
- 保留型與順序型的分類是人工判斷。新增偏好時要先決定它屬於哪一類（`src/rule-release.mjs` 的 `HOLD_RULES`）。
- 還沒有實戰證據。
