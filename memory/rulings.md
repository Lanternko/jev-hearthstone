# 規則裁決（rulings）

使用者對實戰出牌的裁定、遊戲規則（卡牌實際怎麼運作）、硬規則。出牌邏輯與 guard 不得違反這裡的裁決；要推翻須由使用者裁定，並在原條目註明。讀寫規則見 [README.md](README.md)。

**2026-10-30 整併**：使用者要求把同主題的條目合併、去掉重複與衝突、刪掉過時的。合併後每個主題一條，ID 沿用該組最小（或最核心）的那號，`合併自` 列出併進來的舊 ID；被併掉或刪掉的舊 ID 一律查 [rulings-ids.md](rulings-ids.md)，程式註解、回歸題、其他 memory 檔引用的舊 ID 都從那裡找得到。整併前的全文在 git 歷史（2026-10-30 之前的 `memory/rulings.md`）。

**同日拆檔（依牌組）**：這份只放跟牌組無關的通則，**每次開工都讀**。牌組專屬的裁決在各牌組檔，只有工作碰到那副牌組時才讀：
- [rulings-zoo.md](rulings-zoo.md)：動物園術（`warlock-zakajz` 實戰、舊 `warlock-zoo` 清單、zoo 網路），含詛咒墓穴、卡札庫斯、法術稅、Garona。
- [rulings-egg.md](rulings-egg.md)：蛋牧（`priest-egg*`）。
- [rulings-discard.md](rulings-discard.md)：棄牌術（`warlock-discard`，Jev＋`src/policy.mjs` 時代），56 題 A 類回歸題出自這裡。
- [rulings-ids.md](rulings-ids.md)：每個 R-ID 在哪個檔；整併時併掉或刪掉的舊 ID 也查這裡。

新裁決照範圍寫進對應的檔（新牌組就開 `rulings-<牌組>.md`，並加進上面清單與 rulings-ids.md）；ID 全域共用，取所有 `rulings*.md` 目前最大號 +1。

欄位（固定）：
- **ID**：`R-001` 起，只追加，所有 rulings 檔共用一個號碼序列；新條目從 `R-165` 起。
- **日期**：合併條目寫起訖。
- **情境**：第幾場第幾回合、盤面。
- **裁決**：合併條目分點，衝突以後來的裁定為準，並註明被誰取代。
- **理由**：原文沒寫就寫「原文未載」。
- **落在**：實作在哪段程式或規則檔（例如 `src/net-guards.mjs` 的 `tapFirst`、`decks/warlock-zoo/strategy.md`）；還沒實作寫「未載」。
- **相關**：其他 ID。
- **合併自**（合併條目才有）
- **來源**（選填）

範例：

```
### R-999
- 日期：2026-10-27
- 情境：v9 第 5 場 T7，4 費，手上冰川×2＋暮光蛋
- 裁決：要出牌前若網路下一步就是分流，先分流再出牌
- 理由：花一樣的費用，先看到抽到的牌
- 落在：src/net-guards.mjs 的 tapFirst（guard tap_before_play）
- 相關：F-999
```

---

## 通則：出牌與 net-guard

### R-137 buff 先於攻擊
- 日期：2026-10-25～2026-10-29
- 裁決：
  1. 有板面 buff 時，攻擊前先 buff；buff 要等的手下（例：教徒）先出。（R-118 第 2 點；R-137）
  2. 先 buff 再攻擊和先攻擊再 buff 結果不同，應鼓勵先 buff；但多隻隨從都打英雄時攻擊誰先誰後幾乎沒差，不因攻擊順序給獎懲或花前瞻。以順序為目標的 shaping 或前瞻都要排除純攻擊互換。（R-156）
- 理由：buff 前就打過的隨從少打傷害。
- 落在：`src/net-guards.mjs` 的 `buff_before_attack`、`develop_before_buff`；`src/policy.mjs` 的 `developBeforeBuff`／`buffDevelopmentActions`；`runtime/shape-20261029/buff-order.mjs`
- 相關：F-701、F-813、F-814、F-815、F-886、E-283、E-287、R-003
- 合併自：R-118（第 2 點）、R-137、R-156
- 來源：archive/STATUS-2026-10-27.md 第 124、636 行；使用者 2026-10-29「先 buff 再攻擊…會出現差異…反面不應該出現差異的就是攻擊順序」

### R-161 net-guard 退休
- 日期：2026-10-29
- 情境：R-157、R-159、R-160 三個實戰錯誤要不要加 net-guard。
- 裁決：都加；但目標是模型自己學會，學會後把 guard 關掉。新加的 guard 要附回歸題並登記在 `GUARD_QUESTIONS`。
- 理由：使用者：「都加 不過希望以後模型自行學會 並且學會後把警衛關掉」。
- 落在：`src/net-guards.mjs` 的 `GUARD_QUESTIONS`（guard → 回歸題）與 `RETIRED`（模型名 → 已退休的 guard，`guardPick` 依 netPick 回傳的 `model` 跳過）。`npm run regress` 每個 guard 印「k/N questions pass」，全過標 `retirable`。`test/zakajz-live.test.mjs`：現役模型全答對卻沒退休、或退休了卻沒全答對都會失敗，換模型時要同步改 `RETIRED`。
- 相關：R-147、R-115、F-891、F-892
- 來源：使用者 2026-10-29

### R-166 小怪換對方小嘲諷，大怪留著打大的
- 日期：2026-10-31
- 情境：10-31 批次第 1 局我方第 5 回合（5 費）。剛下 Ruinous Velocidrake 7/7；對方 Reanimated Ossodon 2/2 嘲諷擋在 Sawbones 5/3、Defias Smuggler 2/3、兩隻 Remnant of Rage 5/4 前面。網路叫 7/7 去撞 2/2（0.797），後面 Glacial Shard 2/1 白撞 Sawbones 5/3。
- 裁決：要換怪清掉對方的 2/2 嘲諷，用小隻的（Glacial Shard 2/1 對換；C'thrax Brute 3/5、Mawman 4/4 也能殺且活著）。7/7 留著去殺 Sawbones 或 Remnant of Rage 這種大的。
- 完整走法（使用者 2026-10-31 補）：Glacial Shard 2/1 撞 Ossodon 2/2；可攻擊的 C'thrax Brute 3/5 撞 Defias Smuggler 2/3；Mawman 4/4 撞 Remnant of Rage 5/4；Velocidrake 7/7（突襲）撞另一隻 Remnant 5/4。對方只剩 Sawbones 5/3 與 Unstable Prototype 0/1，我方留 Velocidrake 7/2、Brute 3/3、兩隻還不能攻擊的 Brute 3/5。
- 理由：使用者 2026-10-31：這局我們落後；打到第 5 回合場面還沒明顯優勢，死騎靠 Sawbones 建立的手牌優勢和後續解場法術（衝刺手下）會逆轉。所以要趁現在把場面清乾淨。（當時對方手牌 9 張、我方 4 張；賽後 HDT 看到對方手上有 Staff of the Endbringer 全場清、兩張 Morbid Swarm、Command Claw、Sawbones。）App 補：7 點攻擊打 2 血的怪浪費 5 點。
- 使用者 2026-10-31 補：不管知不知道對方手上是什麼（對方前面預備過一次，死騎牌組只有 2 種預備牌），手牌 4 對 9 落後是公開資訊，光看手牌數就該判斷要搶場面。
- 模擬器的盲點（E-300、E-301）：模擬對手從先驗池隨機發牌，這個局面四種打法都算約 98% 勝，看不出落後，也看不出要搶場面。
- 落在：回歸題 `fx:ranked1031-g1-small-minion-into-taunt`（`test/fixtures/user-rulings/ranked1031-g1-small-minion-into-taunt.json`）；不加 guard（使用者 2026-10-31「先不加」，讓模型自己學，回歸題驗收）。
- 相關：F-904
- 來源：使用者 2026-10-31「換怪要殺掉對方22」；回合由使用者在選項中確認是我方第 5 回合


---

## 版本

### R-144 版本號規則
- 日期：2026-10-29
- 裁決：
  1. 照 basketball-autochess 改用分軌 `0.MINOR.PATCH`：軌道 `zoo`、`discard`、`zakajz`、`egg`、`sim`；實驗寫「基準＋E 編號」；變強才升 MINOR，其他採用升 PATCH；sim 只改資料加字母。1.0 = 某條網路軌道上實戰且 ranked 批次過 G5。規則全文在 memory/README.md「版本號」。
  2. 起點（舊檔名不改）：`zoo 0.1.0` = warlock-zoo-v9；`discard 0.1.0` = warlock-discard-v5；`zakajz 0.1.0` = warlock-zakajz-v1；`egg 0.1.0` = P7（R-150；原訂 P6A，2026-10-29 改）；`sim 0.1.0` = 38f4c93a3f4b。
  3. 只對很弱的模擬對手（例：模擬蛋牧）變強不算「變強」，不構成升 MINOR 或上線的理由，打天梯也不會因此上分；那樣的 ranked 批次目的是蒐集實戰數據。例：zoo-v10 對 P3 +5.3、其他 −0.1～+1.8。（R-145）
- 理由：舊的 vN／日期檔名每次匯出就 +1，看不出哪些是真的變強；模擬蛋牧比真人弱（F-784：模擬 86%、實戰 0–3）。
- 相關：E-254、E-260、E-261、F-784、R-150、R-151
- 合併自：R-144、R-145
- 來源：使用者 2026-10-29「查看一下 basketball-autochess 的專案。把他們的版本號規則抄過來」、「如果只是打我們很弱的模擬蛋牧變強，那大概率實戰也不會變強…」


---

## 訓練與研究方向

### R-107 自戰路線
- 日期：2026-10-12
- 裁決：自戰在 `src/sim.mjs` 裡跑，不開遊戲客戶端；兩邊出牌由深度學習策略決定（參考 https://github.com/LYiHub/pub-street-fighter-ai 的做法），Jev 只留在實戰。
- 落在：`src/sim.mjs`、`train/`
- 合併自：R-107、R-108
- 來源：archive/STATUS-2026-10-27.md 第 1436–1438 行

### R-143 預設訓練配方
- 日期：2026-10-28
- 裁決：新訓練的預設配方＝PPO＋λ0.1 混合搜尋蒸餾並行（`--distill-weight 0.1 --distill-frac 0.1 --search 12 --depth 2 --expand 4 --replies 1 --tau 0.01`，--reply 用對手模型），駕駛網路也一樣；改用純 PPO 或其他 λ 要在 E- 設定欄寫理由。zoo 從 0.2.0 起的蒸餾另受 R-155 限制。
- 理由：使用者「canonical 不是要求 lambda 0.1 的搜尋蒸餾和 PPO 並行嗎？」；主線 zoo-v5、v8–v10 都是這個配方（L-034），蛋牧駕駛漏用（L-050）。
- 相關：L-034、L-050、E-259、R-155
- 來源：2026-10-28 App

### R-148 依對手職業調整（TODO）
- 日期：2026-10-29
- 裁決（TODO，未實作）：駕駛網路要依對手調整。每個職業一組權重（或職業條件化的輸入），沒遇過的用預設權重；遇過的職業但牌組和訓練時不同，逐漸退回預設權重。
- 細節：起因是蛋牧 T4 跳幣準備 Soothsayer（brox-zak 第 2 局第 7 步）：先跳幣只在對手可能有 Cult Neophyte（法術 +1 費）時有利，但 `src/selfplay-encode.mjs` 沒有對手職業／牌組輸入。判斷標準是對手牌組會不會有加法術費的牌，不是職業本身。
- 狀態：有效
- 相關：R-147、R-155、F-873
- 來源：使用者 2026-10-29「觀察對方職業加入TODO…」


---

## 對手牌組

### R-165 C'Thun 牧師就是阿薩林納牧師
- 日期：2026-10-31
- 情境：F-902 把揭露 C'Thun 系列牌的牧師分成「C'Thun 牧師」
- 裁決：實戰的 C'Thun 牧師通常帶阿薩林納（Azalina Soulsever，JAIL_430）偷牌。它出的 C'Thun、卡札庫斯、Zakajz、暮光蛋等牌多半是從我們牌庫複製來的，不是它自己的套牌。分類對手時看開局有沒有揭露 JAIL_430，不要看 C'Thun 系列牌。
- 理由：原文未載（使用者的遊戲知識）。卡牌文字：40 血；牌庫一半換成對手牌庫的複製；戰吼抽到滿手。
- 落在：`src/selfplay.mjs` seat／newGame（40 血、20 張複製牌帶 raw.copied）、`src/sim.mjs` AZALINA／SWEEPER／UNSHACKLE／DEACON／TERRAFORM、`decks/priest-azalina/list.json`（2026-10-31，F-905；同日改成 Moon 版不帶麥迪文＋Moonwell，F-907）、`decks/priest-azalina-cthun`＋Entropic Rift（F-908）；還沒進對手池
- 狀態：有效
- 相關：F-902、F-903
- 來源：使用者 2026-10-31「克蘇恩牧師通常都是帶阿薩林納 可以偷牌的版本」


---
### R-167 阿薩林納偷牌可以重複，上限是我們帶的張數
- 日期：2026-10-31
- 情境：實作 JAIL_430 時問使用者複製牌怎麼挑（F-905 疑點 1）
- 裁決：阿薩林納的 20 張複製牌從我們的牌組抽，可以偷到重複的牌（例如 2 張 Mawman Cultist），但同一張不會超過我們牌組裡的張數。
- 理由：原文未載（使用者的遊戲知識）。
- 落在：`src/selfplay.mjs` seat（從對手 30 張展開清單不放回抽 20 張）；`test/priest-azalina-sim.test.mjs` 檢查每張複製牌數 ≤ 我方張數
- 狀態：有效
- 相關：R-165、F-905
- 來源：使用者 2026-10-31「好像沒有規定不能偷到不重複的牌。也就是可能偷到2張maw（不會超過三張，因為我只有帶2張」


## 客戶端操作

### R-033 客戶端等待與 HDT
- 日期：2026-09-26～2026-10-30
- 裁決：
  1. 抽牌後等久一點才出牌：`DRAW_SETTLE` 3 秒，每多抽一張再加 0.8 秒；動作結束後重新讀一次手牌（log 可能晚寫）。（R-033）
  2. 回合第一次出牌：`TURN_SETTLE` 3.5 秒。（R-035）
  3. 打天梯時一定要開著 HDT。（R-164）
- 落在：`src/loop.mjs` 的 `DRAW_SETTLE`、`TURN_SETTLE`；`ensureHdt()`（`src/reconnect.mjs`，由 `src/await-game.mjs` 和 `runtime/ranked-continuous.mjs` 呼叫）
- 相關：L-084
- 合併自：R-033、R-035、R-164
- 來源：archive/STATUS-2026-10-27.md 第 1817、1827 行；使用者 2026-10-30「make sure you open HDT next time when playing」

