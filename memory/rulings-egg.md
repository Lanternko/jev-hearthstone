# 規則裁決：蛋牧

牌組 `priest-egg*`（蛋牧駕駛網路與模擬對手）。工作碰到蛋牧時讀。

欄位定義與寫入規則見 [rulings.md](rulings.md)（通則，每次都讀）。ID 全域共用，查某個 ID 在哪個檔用 [rulings-ids.md](rulings-ids.md)。

---

## 卡牌規則

### R-127 蛋牧卡牌
- 日期：2026-10-27～2026-10-28
- 裁決：
  1. 蛋破 5 次才孵化：DINO_410→t2→t3→t4→t5→Khelos 20/20 嘲諷；重生蛋還是蛋並記得階段（每階段不同 cardId，複製品保留死掉那一階）。（R-127、R-128）
  2. Slime 'em!：殺死所有隨從（觸發亡語），雙方各拿一張 3 費 Ectoplasm，召回自己被殺的隨從，加成消失（召回印刷原始數值）。（R-129）
  3. Umbra：從本局死過的友方亡語隨從挑 5 筆觸發；不同階段的蛋、複製蛋各算一筆；不重複抽死亡紀錄。（R-130）
  4. Elder Word: Flay／Foresight：下一張暗影法術重複。（R-141）
  5. Prepare（Defias Smuggler、Soothsayer）：花掉剩下全部法力 X，這張牌減 X+1 費。實作假設（未經確認）：每張一次、X=0 也可、只在自戰、編碼借 'use' 格、`^prepare` 也套到 Hold Them Off!／Hijacked Securitybot。（R-141）
  6. Kaldorei Priestess 的 −2 攻擊只維持到我方下一回合開始。（R-141）
  7. Kindred（Gravedawn Sunbloom）：上一回合打過同類（神聖）牌，這回合減費。（R-141）
  8. **Imbue**：英雄能力固定 2 費；月之祝福（Blessing of the Moon：「Choose a playable Priest minion or spell to add to your hand. It costs (1) less, but is Temporary.」）給的牌減 Imbue 次數的費用。R-142 曾記成「英雄能力本身降費」，同日使用者附卡圖更正回這個模型。（R-141、R-142）
  9. 駕駛：手上有 Haunt、場上有還沒復生的蛋就先 Haunt 上蛋（+2/+3、復生、嘲諷，逼對手敲蛋）；真人這樣打，網路沒學會。（R-140）
- 理由：遊戲規則（使用者補充，已核對 cards.enUS.json）。
- 落在：`src/sim.mjs`（`fresh(s,b)`、`rattleSome`、elderWord／afterPlay、prepare、chill、SUNBLOOM `lastKinds`、`imbue()`）；`src/egg-guard.mjs` 的 `eggGuard`；`src/net-guards.mjs` 的 `haunt_own_egg`；`test/priest-egg-rules.test.mjs`、`test/priest-egg-imbue.test.mjs`
- 相關：F-791、F-792、F-849、F-851、F-852、F-860、F-861
- 合併自：R-127、R-128、R-129、R-130、R-140、R-141、R-142
- 來源：archive/STATUS-2026-10-27.md 第 11、224–227 行；2026-10-28 App 對話


---

## 版本

### R-150 egg 版本指定
- 日期：2026-10-29
- 裁決：**egg 0.1.0 = P7**（主流牌表 priest-egg-hsr 的蛋牧駕駛，E-268），檔案 `models/selfplay/priest-egg-0.1.0.{pt,json}`；在 sim c661d9b4b263（= `sim 0.1.0a`）上量，全新 seed 對 zoo-v9 49.5%（47.9–51.0），P6A 同牌表 34.0%。P1–P6A 都在 0.1 之前；以前紀錄裡寫「egg 0.1.0＝P6A」的指 P6A，不改原文。（R-150）
- 理由：模擬蛋牧改用主流牌表才像實戰對手（F-869）。
- 狀態：有效
- 相關：R-144、R-151、E-268、F-869
- 來源：使用者 2026-10-29「這個牧師的版本號我們就把它定為0.1」

