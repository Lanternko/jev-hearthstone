# 規則裁決：動物園術

牌組 `warlock-zakajz`（目前實戰，zoo 0.2.x 網路駕駛，`JEV_FOLLOW_NET=1`）與舊 `warlock-zoo`（Fatebreaker 清單）。工作碰到這兩副牌組、zoo 網路、或它們的 net-guard 時讀。

欄位定義與寫入規則見 [rulings.md](rulings.md)（通則，每次都讀）。ID 全域共用，查某個 ID 在哪個檔用 [rulings-ids.md](rulings-ids.md)。

---

## 卡牌規則與出牌

### R-147 Temporary 牌與 Cursed Catacombs（網路實戰）
- 日期：2026-10-25～2026-10-29
- 裁決：
  - **遊戲規則**
    1. Cursed Catacombs（0 費）從牌庫發現一張並設為 Temporary，回合結束就棄掉，牌庫那張也一起燒掉。（R-147）
    2. 發現到 Shred of Time（Casts When Drawn）時照樣施放（打自己英雄 3），再隨機抽牌庫下一張補上；補抽的牌當普通抽牌（不是 Temporary，推定）。（R-149）
  - **出牌**
    3. 要結束回合時，手上有 Temporary 或 doomed 牌打得出去就先打；目標優先網路排名最高、再無目標、再敵方。（R-135）
    4. **打不打墓穴**：這回合要打的話，排在攻擊與其他出牌之前（隨機結果先看再決定怎麼攻擊）；打完後剩下的費用不夠用發現的牌就不要打，留在手上。原本是無條件先打（2026-10-29 初版），E-265 搜尋顯示有更好的線後使用者同意改成有條件版。例：先打了 Grueling Trial 剩 0 費時不打墓穴。（R-147、R-159）
    5. 墓穴發現時，網路選的牌超過剩餘費用就改選網路排名最高、付得起、不是抽到時施放的牌。（R-139）
    6. 三張都打不起時，選負面的死牌（例：對手 Garona 塞進來的 King Llane），等於把它從牌庫清掉。（R-160）
  - 棄牌術把 Temporary 留作棄牌素材（[rulings-discard.md](rulings-discard.md) 的 R-084）；這副牌組沒有棄牌出口，所以結束前打掉（3）。
- 理由：Temporary 回合結束就會被棄；選付不起的牌等於浪費。
- 落在：`src/net-guards.mjs` 的 `expiring_card_before_end`、`affordable_temporary_discover`、`catacombs_without_mana`、`temporary_discover_dead_card`；`src/sim.mjs`（Shred `pull(s,1)`）；回歸題 `fx:ranked1029-g16-catacombs-no-mana`、`fx:ranked1029-g16-catacombs-take-llane`
- 相關：F-812、F-817、F-873、F-875、F-891、E-265、R-084、R-161、R-162
- 合併自：R-135、R-139、R-147、R-149、R-159、R-160
- 來源：archive/STATUS-2026-10-27.md（2026-10-05、10-27）；使用者 2026-10-29「這裡應該無條件先看cursed catacombs」→「要改」、「確認了。選了之後會先扣3血，然後再隨機抽下一張牌」、「最新一場第四回合不應該用墓穴 因為沒費用了」、「這邊應該可以選萊恩王」

### R-121 Mawman／Zakajz 法術稅
- 日期：2026-10-25～2026-10-27
- 裁決：
  1. 網路要出 Mawman Cultist（所有法術 +1 費）且場上還沒有時，先把無目標、之後仍付得起 Mawman 的法術出完（花最多法力、同分取張數少）；需要幸運幣才塞得下時先出幸運幣。需要目標的法術與空場時的全體加成不算。（R-121）
  2. 也涵蓋 Zakajz the Corruptor（每張都加稅，手牌和牌庫的法術永久 +1）：先下 1 費儀式再下 4 費傳說；同分時板面 buff 排最後，等 Zakajz 上場也吃得到。（R-136）
  3. 比較標準是整個回合打出牌的印刷費用總和（稅不算價值，Zakajz 的減費算進去）；法術先下的版本比網路的差就不觸發，平手先下法術。（R-138，修正 R-136 害卡札庫斯打不出）
- 理由：法術稅讓先出法術省費用。
- 落在：`src/net-guards.mjs` 的 `spells_before_mawman`
- 相關：F-714、F-812、F-816、E-243、R-146
- 合併自：R-121、R-136、R-138
- 來源：archive/STATUS-2026-10-27.md 第 604、128、138 行

### R-115 Godfather Kazakus
- 日期：2026-10-24～2026-10-29
- 裁決：
  1. **牌效**：戰吼三段選擇（9 取 3、剩 8 取 3、審判長度 Rushed 7 費立即／Grueling 4 費下回合／Unending 0 費 4 回合後），結果是一張審判牌進手牌，打出後才計時／生效。（R-115）
  2. 兩個效果同時生效，不依選取順序：先做召喚／奪取／抽牌，最後才做 Spurious Shiv（+3/+3）與 Potion（手牌減費），所以 Contract 召喚的三隻也吃到 +3/+3。（R-119，使用者更正）
  3. **選擇**：第二段應選召喚三個 3 費隨從；長度在費用夠打 7 費、沒有其他牌要出、對手有手下要控制時選 Rushed（立即效果最強），一般情況可選 4 費 Grueling。（R-118 第 1、3 點；R-157）
- 理由：使用者：「立即的效果最強，尤其費用很夠、沒有其他牌可以出、對面又有手下需要控制」。
- 落在：`src/sim.mjs` 的 `castTrial`；`src/selfplay-shadow.mjs` 的 `kazakusState`；net-guard `kazakus_rushed_trial`（2026-10-29 第 19 局起）；回歸題 `fx:ranked1029-g14-kazakus-rushed-trial`
- 相關：F-700、F-705、F-888、R-111、R-161
- 合併自：R-115、R-118（第 1、3 點）、R-119、R-157
- 來源：archive/STATUS-2026-10-27.md 第 636–643、1041 行；使用者 2026-10-29「卡札庫斯應該選擇7費 因為立即的效果最強」

### R-114 Floating Lessons
- 日期：2026-10-24～2026-10-29
- 裁決：
  1. **牌效**：目標隨從與手上隨機一張隨從 +X/+X，X＝`costOf`×2（Mawman 在場 +4/+4）。（R-114）
  2. **順序**：手上還有手下時先打 Floating Lessons（目標己方手下），再下那隻手下，讓它有機會在手上一起吃到 buff。例：先 Lessons 打 Faceless Fanatic，再下 Cult Neophyte。（R-158）
- 理由：R-158 的理由是 App 依卡牌文字補的；使用者只說了順序。
- 落在：`src/sim.mjs`；回歸題 `fx:ranked1029-g15-lessons-before-neophyte`（best o3t1/o3t2；forbidden o4、o3t0）。行為未修
- 相關：F-889
- 合併自：R-114、R-158
- 來源：archive/STATUS-2026-10-27.md 第 1040 行；使用者 2026-10-29「最新一場第三回合應該先漂浮 再見習教徒」

### R-134 先分流再出牌
- 日期：2026-10-25～2026-10-27
- 裁決：網路要出一張牌而它的下一步就是分流時，先分流（花一樣的費用，先看到抽到的牌）。剩 2 費、沒別的事做時要用生命分流抽牌。
- 理由：花一樣的費用，先看到抽到的牌。
- 落在：`src/net-guards.mjs` 的 `tapFirst`（guard `tap_before_play`），由 `src/selfplay-shadow.mjs` 的 `netPick` 呼叫；先在模擬器走這一步，只用現在選單裡有的選項排名
- 相關：F-706、F-812
- 合併自：R-118（第 5 點）、R-134
- 來源：archive/STATUS-2026-10-27.md 第 136、636 行

### R-120 寶庫看守者落位（adjacentSlot）
- 日期：2026-10-25
- 裁決：場上 ≥2 隻時放 `floor(n/2)`（中間，戰吼加兩邊），其餘放最右；`execute.mjs` 與模擬器一致，模擬器的戰吼與亡語都加兩邊鄰居。
- 理由：使用者指出只加到一個。
- 落在：`src/execute.mjs` 與 `src/sim.mjs` 的 `adjacentSlot`
- 相關：F-703
- 合併自：R-118（第 4 點）、R-120
- 來源：archive/STATUS-2026-10-27.md 第 636、644 行

### R-111 動物園卡牌（儀式、C'Thun、Voidlord）
- 日期：2026-10-24～2026-10-26
- 裁決：
  1. 延遲計時器：座位上的 `timers`（加進 `SEAT`），只有座位主人的 `beginTurn` 會扣；出牌那回合、對手回合不算。兩張 Ritual 與 Kazakus 審判共用。（R-111）
  2. Ritual of Summoning：我方第 2 個回合開始召喚兩隻 C'thrax Brute（3/5 嘲諷），滿場就少召。（R-112）
  3. Ritual of C'Thun：我方第 2 個回合開始 4 選 1（Wrath／Domain／Glare／Servants）；Glare 再選一個敵方隨從，沒有就不給 Glare。（R-113）
  4. 實戰重建倒數：`ritualTimers(publicPlays, playerId, turn)` 把 BE_085（summon）、BE_726（cthun）換成 `{left, effect}`，`left = 2 − floor((N−T)/2)`，≤0 丟掉；放進 `s.timers` 與 `s.them.timers`。（R-117）
  5. C'Thun, Eye of the Empire 打出後從四個能力選兩個、各三倍：Wrath 7×3 一次分配、Domain 給同兩隻 +6/+9、Servants 6 隻、Glare 一個目標 15 點（吸血 15）。Domain 不給 C'Thun 自己。Spawn of C'Thun 等其他來源仍只觸發一個能力。（R-126，使用者確認）
  6. Voidlord：亡語三隻 1/3 嘲諷 Demon，進 `rattle`。（R-116）
- 理由：原文未載；R-126 使用者指出。
- 落在：`src/sim.mjs`（只在 `s.game`，`gameModel` 系列）、`oldGod`；`ritualTimers`（`src/selfplay-shadow.mjs` 一帶）
- 相關：F-688、F-765、F-766、R-115
- 合併自：R-111、R-112、R-113、R-116、R-117、R-126
- 來源：archive/STATUS-2026-10-27.md 第 353、622、1036–1042 行


---

## 對手

### R-162 Garona 與 King Llane
- 日期：2026-10-29
- 情境：ranked 批次第 20 局又遇到帶 Garona Halforcen（TIME_875）的盜賊，牌庫被塞了 King Llane（TIME_875t：3 費 3/3，戰吼抽一張、把自己洗回牌庫，不會留在場上）。模擬器沒有這組牌。
- 裁決：把 Garona 這組牌加進模擬器與對手池，先用較輕的訓練讓模型學會應對。打法提示：抽到 Llane 不急著打，它只是 3 費抽一張。Garona 的戰吼會在我們手上有 Llane 時摧毀它並把血量砍半；使用者通常還是留在手上（我們持續施壓、嘲諷多，對方沒時間打 Garona），但留或打交給模型，只事後驗收，不做回歸題。
- 理由：使用者：這張牌我們不認識。
- 落在：2026-10-29 子 session 在複本 `D:\Projects\CODING\jev-hearthstone-garona-20261029`（spec 在 handoff「下一步」）
- 相關：R-147（第 6 點）、R-161、F-891、F-892
- 來源：使用者 2026-10-29「我們可以把它加入對手，就可能用比較輕鬆的訓練先學會怎麼應對它」


---

## 牌表與版本

### R-146 現行動物園牌表
- 日期：2026-10-29
- 裁決：現在的動物園術沒有 Fatebreaker，換成 Zakajz the Corruptor 和 Glacial Shard，就是 `decks/warlock-zakajz`（−Fatebreaker −Tachyon Barrage −Vaultkeeper，+Zakajz +Glacial Shard×2）。`decks/warlock-zoo`（Fatebreaker 版）是 2026-10-25 的舊清單；拿「ZOO」當對手或重播時用 `warlock-zakajz`。
- 細節：Brox meta 對照快攻術 ≈ `warlock-zakajz`（28/30）。之前的重播（zoo-shaman、zoo-dh、brox-zoo、imbue-zoo）和蛋牧對 ZOO 的評估用的是 `warlock-zoo`。zoo-v9 的對手池兩份都有。
- 狀態：有效
- 相關：R-121、R-122
- 來源：使用者 2026-10-29「zoo的牌組應該沒有fatebreaker了吧？換成zakajz和冰川裂片了」

### R-151 zoo 版本指定與留牌表
- 日期：2026-10-29
- 裁決：
  1. **zoo 0.2.0** = E-271 B 臂（`models/selfplay/warlock-zoo-0.2.0.{pt,json}`，json sha256 0de0e2e0bc0a…、pt cfc19f4f3386…；sim b31012f48995、iter 2255、學習方牌組 warlock-zakajz、imbue=true）= 0.1.0（v9）+ E-254（v10）+ E-270 + E-271；v10 不另給版號。全新 seed 對 V10 全 PASS（egg +5.7、zakajz-v1 +3.6、鏡像 52.9%、shaman +2.2、dh +1.8），對蛋牧以外也進步，所以是 MINOR。（R-151）
  2. **zoo 0.2.1 = 0.2.0 網路 + E-281 留牌表**（`models/mulligan/warlock-zoo-0.2.1.json`，sha256 b1d6532a…，`net: warlock-zoo-0.2.0`），PATCH。實戰 warlock-zakajz 換牌由 `src/policy.mjs` mulliganConstraint 照表只留表選的那組（`src/mulligan-table.mjs` TABLES；三張先手、四張後手）；表的 `net` 和實際駕駛網路不同就退回舊規則；`test/selfplay-mulligan.test.mjs` 檢查 TABLES 的 net 等於 MODELS。模擬用 `src/selfplay-mulligan.mjs … --policy models/mulligan/warlock-zoo-0.2.1.json`（selfplay-match／compare 仍全留）。換駕駛網路時要重擬表。（R-154）
  3. 留牌表的來源：使用者要專門訓練 warlock-zakajz 的起手留牌，直覺是一費 Ritual of C'Thun、二費 Ritual of Summoning、三費 Kazakus 是核心，沒有就全換去找；不留二費傷害法術；沒前期手下不留 Floating Lessons。直覺規則本身沒贏，學出來的表贏（新舊各約 2000 局以上）。接受結果可能只適合 0.2.0 的打法。（R-152）
- 狀態：有效；實戰 MODELS 指 `warlock-zoo-0.2.0`
- 相關：R-144、R-146、R-150、E-271、E-281、F-870、F-883
- 合併自：R-151、R-152、R-154
- 來源：使用者 2026-10-29「好。那就定為0.2.」、「效果看起來不錯 可以升級成patch」

### R-122 舊 warlock-zoo 清單的小T規則
- 日期：2026-10-26
- 適用：只套 `decks/warlock-zoo`（Fatebreaker 舊清單）的 strategy.md／mulligan.json。實戰 warlock-zakajz 的換牌用 R-151 第 2 點的留牌表，不用這些。
- 裁決：
  1. `mulligan.json` 的 `combos` 加三組：召喚儀式＋卡扎、克蘇恩儀式＋卡扎、兩個儀式（三張 mulliganWR 都 ≥70，本來就留，這是保住規則）。（R-122）
  2. 龍蛋只在先手且有卡扎時留；二費一定要有怪；後手以硬幣跳二為準且不留咒怨之墓。（R-123）
  3. strategy.md 新增「Lines and choices (小T)」第 1–7 條，各附 dXX 出處。（R-124）
  4. 與現有內容衝突時以現有為準：d41「硬幣提早貼 buff」不寫（現有「Coin is for a Ritual or a body」）；栉龙先過牌限定在沒有儀式搶費用時；卡扎選項用我們牌表的名字，不在牌表的卡只寫成通則。（R-125）
- 理由：小T直播 `runtime/videos/xiaot-20261025/decisions/decisions.md` 第 1–8 條。
- 落在：`decks/warlock-zoo/mulligan.json`、`decks/warlock-zoo/strategy.md`
- 相關：R-146、R-151
- 合併自：R-122、R-123、R-124、R-125
- 來源：archive/STATUS-2026-10-27.md 第 488–490 行


---

## 訓練

### R-155 zoo 的 value 頭／前瞻／蒸餾線
- 日期：2026-10-29～2026-10-30
- 裁決：
  1. 2026-10-29 暫停：不再從 0.2.0 做同配方蒸餾、不再擬合 value 頭、不再訓練。E-277 的「到頂」判定作廢，由 E-286（`--own-value` 尺）取代；之後任何 headroom 或前瞻量測一律加 `--own-value`（L-065），舊尺數字不混比。結論整理在 F-885。（R-155）
  2. 2026-10-30 使用者「先試 value 頭」，重啟 value 頭這一項：先試把 value 頭改成勝率分類（tanh 輸出＋cross-entropy，目標分 λ-return 和終局 z 兩臂），依據 F-898；spec `runtime/value-bce-20261030/spec.md`（預註冊）；校準改用逐局 Brier 配對差當主要條件（F-894）。第 1 點的其他部分不變：不從 0.2.0 蒸餾。（R-163）
  3. 其他重啟候選（等使用者）：讓 value 頭重新會估對手座位再量 headroom；或放棄搜尋蒸餾，走對手池／牌表或 R-148 職業條件化。
- 狀態：有效（value 頭試驗進行中）
- 相關：F-882、F-885、F-894、F-898、L-065、E-277、E-278、E-286、R-143、R-148
- 合併自：R-155、R-163
- 來源：使用者 2026-10-29「先改尺」→「派給opus」→「先停 整理成研究記憶」；2026-10-30「先試 value 頭」

### R-153 F-881 用訓練修，不加 guard
- 日期：2026-10-29
- 裁決：F-881（硬幣＋Tachyon 打空場，E-280 判定錯招）不加推論期規則（net-guards），改由下次 zoo 訓練修：對手池加會用儀式的牌組，並讓一小部分自我對弈從這類局面開局。修完用 E-280 的成對推演方法複測同一母體（DRY，T−H 應接近 0 或轉正），並確認整體門檻不退步。
- 細節：使用者在 A（net-guards）／B（訓練）之間選 B。
- 狀態：有效
- 相關：F-881、E-280

