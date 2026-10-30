# 規則裁決（rulings）

使用者對實戰出牌的裁定、遊戲規則（卡牌實際怎麼運作）、硬規則。出牌邏輯與 guard 不得違反這裡的裁決；要推翻須由使用者裁定，並在原條目註明。讀寫規則見 [README.md](README.md)。

**2026-10-30 整併**：使用者要求把同主題的條目合併、去掉重複與衝突、刪掉過時的。合併後每個主題一條，ID 沿用該組最小（或最核心）的那號，`合併自` 列出併進來的舊 ID；被併掉或刪掉的舊 ID 一律查檔尾〈舊 ID 對照〉，程式註解、回歸題、其他 memory 檔引用的舊 ID 都從那裡找得到。整併前的全文在 git 歷史（2026-10-30 之前的 `memory/rulings.md`）。

欄位（固定）：
- **ID**：`R-001` 起，只追加；新條目從 `R-165` 起。
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

適用範圍：
- **A 段（棄牌術，Jev 時代）**：`warlock-discard` 牌組由 Jev＋`src/policy.mjs` 出牌時的規則（2026-09-21～10-10）。56 題 A 類回歸題仍出自這裡；policy 的否決規則（R-080）仍在程式裡。對網路駕駛的 zakajz／zoo 不直接適用，除非條目寫明。
- **B 段（Temporary 與詛咒墓穴）**：跨兩個時代，條目內分牌組寫。
- **C 段（網路實戰）**：`JEV_FOLLOW_NET=1` 由自戰網路出牌時的 net-guard 與出牌順序（目前實戰：warlock-zakajz＋zoo 0.2.0 網路＋0.2.1 留牌表）。
- **D 段（模擬器卡牌規則）**、**E 段（版本與牌組）**、**F 段（訓練與研究方向）**、**G 段（客戶端操作）**。

---

## A. 棄牌術（Jev＋policy.mjs 時代）

### R-001 起手換牌
- 日期：2026-09-21～2026-10-02
- 裁決：
  1. **依據**：`data/mulligan.json` 的「留在起手時的勝率」（使用者提供的公開數據截圖），≥70% 一律留、≤62.5% 一律換、中間交給 Jev；「打出勝率」不用。沒有數據的牌回到舊白名單（只負責強制換）。換牌選項每張附「留在起手勝率 X% vs 牌組平均 67.5%」。（R-018，取代 9/24 白名單）
  2. 中間段的牌若留牌率也 <25%，一律換（目前會換掉靈魂彈幕 65.2%／18%、Chronoclaws 64%／14%）。（R-023）
  3. 4 費以上只有同時留著 2 費以下的牌時才能留。（R-024）
  4. **強制組合**：「低語＋侍僧」「魔眼＋殭屍」「派對＋buff」兩張都在手上時都留，優先於勝率門檻（例如派對旁的熵能延續 62.1 也留；buff 只留一張、取最便宜）。靈魂之火照樣換（隨機棄牌）。（R-022）
  5. **素材上限**：一個棄牌出口只搭配保留一個素材，不論有沒有低費鋪場（R-060 更正，取代 R-059「低費牌不增加棄牌次數」與 R-066「已有低費鋪場不套此限制」的例外）。單魔眼時行屍／魔像最多留一張，預設行屍；有派對也要換掉多餘的魔像。
  6. 換掉 Wicked Whispers 時兩張 Walking Dead 都換；留 Cursed Catacombs，後手可考慮加留 Whispers。（R-059）
  7. 沒有低費手下也沒有棄牌素材時，只留地標，其餘全換。（R-001）
  8. 刀／蛋／連鎖／彈幕缺前期鋪場與棄牌連動，全換；裸蛋只是 0/2，不因費用低就算前期牌；四費最高費棄牌刀不算蛋的早期出口。（R-050）
  9. 不把事後的對手分類（控制／非控制）回灌起手。控制後手的候選方向（墓穴／鴨嘴龍／派對／二費侍僧優先；蛋差、三費素材慢；魔眼有早期節奏再留；四費以上不留；武器與 buff 待判）只是草案，未改正式策略。（R-066、R-067）
- 理由：「打出勝率」被「什麼時候才打出」污染（古爾丹之手 31.7% 是棄牌路線失敗後才硬打）；「勝率和留牌率都低，免得機器亂想」；「4 費牌要很後面才會用到」。
- 落在：`data/mulligan.json`；`src/policy.mjs` 的 `mulliganVerdict`、`mulliganCombos`、`keepsLateAlone`；`describe.mjs`；strategy.md Mulligan 段；`docs/control-second-early-opening-hypothesis.md`（草案）；fixture `new50-game14-mulligan.json`、`game120-opening-payoffs`
- 相關：F-046、F-175
- 合併自：R-001、R-018、R-022、R-023、R-024、R-050（留牌部分）、R-059、R-060、R-066、R-067
- 來源：archive/STATUS-2026-10-27.md（2026-09-21～10-02 各局使用者裁定）

### R-002 硬幣
- 日期：2026-09-21～2026-10-05
- 裁決：
  1. 硬幣是節奏不是水晶：要換成更大的場面（第二回合硬幣＋魔眼是正解），沒換到就是錯。（R-002）
  2. **硬限制 deadCoin**：硬幣打完手上一定要有打得出的牌或按得動的天生技，否則移除。不擋「硬幣到 3 費但最高只有 2 費」（2+1 仍可能對），改在選項描述寫清楚這一費讓哪些牌進射程；為了讓棄牌工具不吃到硬幣而先打硬幣不擋。（R-006）
  3. 硬幣不拿來換生命分流：後手第一回合只有分流可用時，硬幣留到下回合湊 3 費魔眼。（R-098）
  4. 第一回合不花硬幣只換一顆裸蛋。（R-050）
  5. **二費空場硬幣魔眼**：手持蛋與魔眼、有固定棄牌召喚素材、棄後仍有三費有攻手下、無其他便宜打法時：硬幣 → 重新觀測 → 魔眼棄行屍或魔像；接在 prepare 的斬殺檢查之後，不跨戰吼 choice 排隊。（R-061、R-062）
  6. 第 1–2 水晶、我方未鋪場、Temporary 派對可付且安全時，先打一費派對，而不是硬幣接侍僧；不是所有 Temporary 都要打，也不是侍僧一律不能裸打。（R-077）
  7. **控制後手 T2／T3 集中鋪場**：低壓公開場面下優先可執行的多體路線（侍僧→硬幣→buff、魔眼棄召喚素材→硬幣→buff），有具體後續時保留硬幣並降低單體 buff；每步重新觀測。（R-063）
- 理由：原文未載。
- 落在：`src/policy.mjs` 的 `deadCoin`（否決規則）、`coinOnlyTaps`；`describe.mjs` 的 `coinNote`；`src/early-coin.mjs`；`src/opening-burst.mjs`；fixture `game120-turn2-coin-occultist.json`、`new50-game10-temporary-party.json`
- 相關：F-175、F-399、R-084
- 合併自：R-002、R-006、R-050（硬幣部分）、R-061、R-062、R-063、R-077、R-098
- 來源：archive/STATUS-2026-10-27.md（2026-09-21～10-05）

### R-007 棄牌素材不硬打；可靠出口
- 日期：2026-09-21～2026-09-25
- 裁決：
  1. 有可靠的棄牌出口就不硬打「被棄時觸發」的素材（例：該用魔眼棄活屍，而不是硬打侍僧）。三局描述文字無效，所以從「講道理」升級成「拿掉選項」。（R-004、R-007）
  2. 可靠的定義（讀卡面文字不讀卡名）：
     | 工具 | 文字 | 可靠的條件 |
     |---|---|---|
     | 魔眼 Ocular Occultist | Choose a card in your hand to discard | 永遠 |
     | 地標 Chamber of Viscidus | Look at 3 cards in your hand and choose one to discard | 手上非素材 ≤ 2 |
     | 武器 Chronoclaws | After your hero attacks, discard your highest Cost card | 沒有更貴的牌；同費只能跟另一張素材平手 |
     | 低語 Wicked Whispers | Discard your lowest Cost card… | 素材是最便宜那張（同費只能跟另一張素材平手） |
     「Discard your lowest Cost card」類其他牌不算。（R-007、R-008）
  3. 素材的定義：被丟就變成場上身體的牌（侍僧、蜘蛛卵、Silverware Golem 3 費 3/4、Walking Dead 3 費 2/5），低語先丟後 buff，丟出來那隻也吃得到；由 `roles()` 讀卡面，不用名單。（R-011）
  4. 例外：棄牌手段本回合用不到、而且之後仍有其他素材可棄時，素材可以直接打。（R-014）
- 理由：描述文字講道理三局無效。
- 落在：`src/policy.mjs` 的 `reliableOutletFor`、`wastedFodder`、`protectedFodder`；`describe.mjs` 的 `roles()`
- 相關：R-009
- 合併自：R-004、R-007、R-008、R-011、R-014
- 來源：archive/STATUS-2026-10-27.md 第 2187、2255–2284、2346 行

### R-009 惡毒低語（Wicked Whispers）
- 日期：2026-09-21～2026-10-10
- 裁決：
  1. 場上無怪且最便宜的是真牌：擋掉低語（兩半都做白工）。（R-009）
  2. **場上太薄**：我方手下 ≤1 且低語會棄的不是素材時先不打，改下 3 費卡（Walking Dead 或地標）；兩隻手下才放行。（R-105、R-106 取代舊測試「一隻手下交給 Jev」）
  3. **先身材後低語**：選單上有隨從／召喚牌且水晶夠兩張一起打時，低語最後打；比素材便宜的身材牌如果能先下再打低語，不算擋住低語棄素材。（R-017）
  4. **別讓低語吃掉可打的真牌**：低語會棄的牌不是素材、它在選單上可打、打掉後最低費變成素材時，先打那張（例：先打連鎖，最低費變魔像）。（R-034）
  5. **場上 ≥3 隻時擋 END_TURN**：原本無條件（R-010），R-083 縮成「會被吃掉的牌 ≤1 費」時才擋；2 費牌放得下就先打出（丟 2 張換 +3+3 不划算）。R-081 再加例外：手上有打出時召喚的牌（侍僧、派對）、本回合放不下兩張、且低語不會吃掉它時允許結束回合。
- 理由：見各點；R-105 使用者：「只有場上只有一張牌，不值得用 buff，而且我們棄掉的牌並不是素材」。
- 落在：`src/policy.mjs` 的 `pureBoardBuff`、`whispersWaits`、`whispersEatsPlayable`、`whispersThinBoard`、`whispersWorthCasting`、`reliableOutletFor`、`mustSpend`
- 相關：E-019、F-418、R-007、R-080
- 合併自：R-009、R-010、R-017、R-034、R-083、R-105、R-106、R-081（低語部分）
- 來源：archive/STATUS-2026-10-27.md 第 2279–2281、2329、1815、1637、1543 行

### R-012 直傷打臉
- 日期：2026-09-24～2026-10-05（最終版 R-082）
- 裁決：
  1. 傷害法術**一律不打自己英雄**（硬規則）；也不打自己的手下，有死亡之聲的（骨網蛋）除外。（R-019、R-082）
  2. 打臉只在兩種情況允許：「法術＋場上可打臉攻擊」在斬殺範圍內；或手上其餘全是棄牌素材（「滿手素材時不失為增加場面的方式」）。（R-012、R-019）
  3. 對手空場**不再**豁免（R-082 取代 R-019 的空場可打臉）：手上素材機率 1/3 很低，砸臉沒用。
  4. 隨機分配傷害的法術（靈魂彈幕），敵方沒有手下且英雄血量 > BURN_RANGE(12) 時不施放。（R-027）
- 理由：離斬殺很遠不該用法術打臉。
- 落在：`src/policy.mjs` 的 `wastedBurn`、`splitToFace`、`burnOwnHero`（否決規則）
- 相關：R-080
- 合併自：R-012、R-019、R-027、R-082
- 來源：archive/STATUS-2026-10-27.md 第 2101、1889、1869、1636 行

### R-013 先花完再攻擊；不空過
- 日期：2026-09-24～2026-10-10
- 裁決：
  1. **spendFirst（硬規則）**：手上還有「該花的牌」時，選單拿掉所有攻擊和 END_TURN。「該花的牌」不含硬幣與棄牌工具（靈魂之火、低語、魔眼）。天生技會讓該花的牌打不出時先拿掉；打完牌還夠、且不會送進對手場攻斬殺線時也算該花。斬殺在完整選單上先判；選單只剩一個選項直接執行（`forced_spend`）；目標在我方手牌的選項不算攻擊。（R-013）
  2. **mustSpend 例外**：剩下的牌全是直傷，或蛋類加手上有棄牌出口時，允許結束回合。（R-081）
  3. **noIdleTurn**：水晶全滿（≥2）且有可打的手牌或抽牌時移除 END_TURN；抽牌只在牌庫 ≥5 且手牌 <10 時算數。浪費水晶比抽牌或棄掉次要的牌更糟。（R-099、R-100）
  4. **freeTrades**：選單上有「我方手下殺掉對方且自己活下來」的交換時，硬性移除結束回合；抽完會剩 0 費的抽牌延後到交換之後；同分時讓攻擊力小的去交換、大隻打臉。（R-095）
  5. **guaranteedDiscard**：靈魂之火必棄靈魂彈幕時不空過；可以先送掉一隻手下清出空位再下派對、再解場（棄牌也幫男爵加血）。（R-102）
  6. 派對動物不需要三個空位才能下，只要自身之外再一格；只剩一格時只開放能清位的送死交換與免費交換。（R-104）
- 理由：R-104 使用者：「派對動物不需要有三個空場才能下，有空場只是加分項；如果有優勢交換都可以自殺」。
- 落在：`src/policy.mjs` 的 `spendFirst`、`mustSpend`／`mustSpendEnd`、`noIdleTurn`、`freeTrades`／`freeTradesEnd`／`freeTradesTap`、`guaranteedDiscard`；`bridge.mjs`；`plan.mjs` 同分排序
- 相關：F-067、F-068、F-389、F-414、F-417、R-080、R-084（temporaryDrawNow）
- 合併自：R-013、R-081（mustSpend 部分）、R-095、R-099（不空過部分）、R-100、R-102、R-104
- 來源：archive/STATUS-2026-10-27.md 第 1902、2752、1602、1572–1573、1559、1551 行

### R-015 棄哪一張
- 日期：2026-09-25～2026-10-05
- 裁決：
  1. **場面優先於手牌**：沒場面時，只要有「棄掉會召喚」的目標，其餘目標移除；例外：對手英雄 ≤12 血時交回 Jev，可棄古爾丹抓直傷。（R-015）
  2. 魔眼出牌後當回合沒水晶、場上只有一隻、有召喚空間：棄 Walking Dead（立即 2/5 嘲諷），不棄古爾丹之手（抽三張轉不成本回合場面）。有剩餘水晶、較完整場面、無空間或接近斬殺時再比較。（R-052、R-056）
  3. 低場面時魔眼棄 325 增加兩隻嘲諷，優於單體 buff。（R-054）
  4. **選一張棄掉（地標等）**：我方隨從 ≤2、有空位、對手不在斬殺範圍時只留「棄掉會召喚自己」的牌；對手有 3 隻以上血量 ≤2 的隨從時棄靈魂彈幕解場；其餘情況有全場 buff 就棄召喚多隻小怪的（侍僧），沒有就棄召喚一隻大怪的（行屍）。（R-025、R-026）
  5. 對面滿地雜毛：魔眼＋棄靈魂彈幕（325 也可以接受）。（R-088）
  6. 選項說明寫出棄掉後召喚幾隻、佔幾格、剩幾格，二選一（侍僧 vs 魔像）交給 Jev 權衡。（R-020）
  7. **doomed 牌不選**：綁在鴨嘴龍死亡之聲上的手牌（鴨嘴龍死就會被棄、會免費觸發）不選來棄或打出，改用沒綁定的那張。（R-036、R-090）
  8. 魔眼可棄武器或公爵時：公爵棄後 ≥6/6 就棄武器、下回合下公爵，否則留武器棄公爵。（R-099、R-101）
  9. 第 3 回合下地標、啟動、棄 325（分階段 intent）。（R-078）
- 理由：見各點。
- 落在：`src/policy.mjs` 的 `boardFirstDiscard`、`discardPick`、`swarmOccultist`、`doomedPick`、`dukeOverWeapon`；`power.mjs` 的 doomed；`hand-retention.mjs` 的 `copyPreferences`；`describe.mjs` 的 `discardBoard`；chamberIntents（silverfish-v1-chamber-intent-v1）；`sim.mjs` 的 `chooseDiscard`；fixture `game148-board-before-draw.json`
- 相關：F-215、F-225、F-382、F-383、F-384、F-385
- 合併自：R-015、R-020、R-025、R-026、R-036、R-052、R-054、R-056、R-078、R-088、R-090、R-099（棄牌部分）、R-101
- 來源：archive/STATUS-2026-10-27.md（2026-09-25～10-05）

### R-029 抽牌時機與天生技安全
- 日期：2026-09-21～2026-10-01
- 裁決：
  1. **先決定意圖再排順序**：先決定這回合要不要抽牌／buff／攻擊，再比先後；不能「有抽牌選項就一定抽」。要 buff 就在受益攻擊前；要抽牌就在費用與保命允許時先拿新資訊再承諾後續。（R-048）
  2. **drawFirst**：能分流、分流後血量仍高於對手場攻、這回合出牌花不完法力時，只留「剛好花完法力的組合」裡的牌，其餘先讓給分流（「先抽牌再出牌，或打 1+3 費」）。（R-029）
  3. **drawCardFirst**：手上有能抽牌、不是棄牌素材的牌時，其他手牌先不打（硬幣除外；古爾丹之手是素材不算）。（R-030）
  4. 先看墓穴發現、先抽牌再低語：能免費先拿資訊就先拿。（R-051）
  5. **天生技禁止**：對手場上已有斬殺時禁止按（R-005）；無嘲諷保護時，以天生技後的有效血量（含護甲、必定發生的已知抽牌傷害）比對手場攻，等於也算斬殺，禁止；不拿未知抽牌可能救命當保證。（R-049）
  6. 只是「可能」抽到碎片的抽牌是賭博，交給 Jev（看得到 `drawHazards`、`deckCount`）；只擋必定致死者。劣勢時靠古爾丹被棄抽牌找公爵逆轉。（R-031）
  7. 估值（決策用，不是規則）：一費全場 +1/+1 對三隻約 2.5 費、五隻約 4～5 費；天生技（二費、自傷二血抽一張）約 1～1.5 費。休眠手下時天生技會喚醒它，連鎖有效受益對象為零時保留 buff 用天生技。（R-046、R-055）
- 理由：R-049：舊規則沒把「這次抽牌會新增致死門檻」變成硬限制。
- 落在：`src/policy.mjs` 的 `drawFirst`、`drawCardFirst`、`forbidsSelfDamage`、`tapExposesBoardLethal`、`drawKills`（否決規則）；`src/warlock-information.mjs`；`prepare()`；fixture `game179-discover-first.json`、`game179-draw-before-whispers.json`
- 相關：F-023、F-098、F-101、F-167、F-168、F-173、F-220、R-080
- 合併自：R-005、R-029、R-030、R-031、R-046、R-048、R-049、R-051、R-055
- 來源：archive/STATUS-2026-10-27.md（2026-09-21～10-01）

### R-016 武器
- 日期：2026-09-25～2026-10-10
- 裁決：
  1. 自己血量 >15 時英雄掉血每點只扣 0.1（≤15 扣 1）；健康時優先用武器吃高攻手下保場面。（R-016）
  2. **weaponFirst**：英雄裝著武器且有一次不被 `suicide` 擋的攻擊時，我方隨從攻擊等英雄打完。（R-032）
  3. **weaponBeforeTrades**：手上有可施放的武器、英雄可攻擊且血量 >15、對面有攻擊 ≤2 且一刀殺得死的手下時，留這些目標給英雄。時空之爪只在最高費的牌棄掉有收益時適用。（R-096）
  4. **換刀前先揮舊刀**：舊武器還有耐久、手上有古爾丹時，先攻擊棄古爾丹再換刀。手上只有新刀時先揮會棄掉新刀，要比較。（R-079）
  5. **weapon-discard-buff**：唯一最高費是侍僧且武器＋buff 付得起：裝刀 → 英雄攻擊棄侍僧（免費觸發）→ 觀察 → buff → 手下攻擊；每步重新觀察，公開斬殺優先，秘密／未知戰鬥／存活風險不強制。沒有 buff 費用時比較武器棄牌與直接侍僧＋buff；最高費是別的牌時比較其棄牌價值。（R-072、R-073、R-074）
  6. **weaponWastesBurn**：敵方全是零攻、無聖盾潛行，我方手下總攻足以清場時，若武器會棄掉造成傷害的最高費卡，先不裝。（R-103）
- 理由：「第四回合應該先用武器攻擊，以維持場面的血量」；R-079「之後會獲得的公爵是我們的逆轉勝機」。
- 落在：`src/sim.mjs` 的 `score()`；`src/policy.mjs` 的 `weaponFirst`、`weaponBeforeTrades`、`weaponWastesBurn`；silverfish-v1-weapon-replacement-v1；weapon-discard-buff-v1；fixture `new50-game18-weapon-acolytes-buff.json`
- 相關：F-072、F-308、F-390、F-416
- 合併自：R-016、R-032、R-072、R-073、R-074、R-079、R-096、R-103
- 來源：archive/STATUS-2026-10-27.md（2026-09-25～10-10）

### R-003 buff 與發展順序
- 日期：2026-09-21～2026-10-03
- 裁決：
  1. 先下身體再下 buff。（R-003）
  2. **先召喚再 buff**：至少 3 個已有目標、召喚全部放得下、保留 buff 費用且沒有場攻致命風險時，先侍僧再 buff；不要求填滿 7 格。直接召喚兩隻後 buff 七隻只要三費，比魔眼佔一格再棄侍僧好。（R-045、R-076）
  3. 墓穴發現與 buff 連動：例如拿低語 → 連鎖 → 低語棄蛋召喚蜘蛛後 buff 七隻。（R-047）
  4. **overflowWaits**：還有攻擊可做、手上身體數 >1 且超過空格時，多身體牌等攻擊清位後再下。（R-021）
  5. 例外：buff 致命、單怪交換改善、可見存活緊急；隨機手下先召喚再觀察。前兩水晶、唯一非休眠手下當回合不能攻擊、對手無活躍手下、buff 非 Temporary 時，留 buff 可以結束回合。（R-071、R-075）
  6. **Ectoplasm 重建**：空場、可負擔、至少三個可進場的已知副本時，斬殺檢查後優先重建場面。（R-057）
- 理由：R-045：直接召喚兩隻後 buff 七隻只需三費。
- 落在：`src/policy.mjs` 的 `buffSetupActions`、`overflowWaits`、填滿空位後 buff 優先路線、`constrainActions` 單目標 buff 檢查；fixture `new50-game10-acolytes-buff.json`
- 相關：F-163～F-166、F-230、F-231、F-304、F-336、R-137（網路時代的同主題）
- 合併自：R-003、R-021、R-045、R-047、R-057、R-071、R-075、R-076
- 來源：archive/STATUS-2026-10-27.md（2026-09-21～10-03）

### R-037 攻擊與交換
- 日期：2026-09-26～2026-10-05
- 裁決：
  1. **wastedChip**：先打沒打死、再由另一隻收掉、而那隻單獨就打得死的計畫不列入。（R-037）
  2. 解場要解有效引擎：同體質同代價優先解引擎；不同的按存活、花費、強度、觸發機會比較，可為強引擎投入多個資源。（R-058）
  3. 解場分配例：13 解對面的場、公爵解 24；對手剩 1 血的效果怪由 11 衝刺怪去撞；持續效果交換例：公爵 4/4 改打法力龍鰻。（R-053、R-085、R-091）
  4. **shortlist**：對手血量 >12 時，有有利解場（敵方損失大於我方）且分數不低於打臉計畫 −1 的計畫，就不把留下該手下的打臉計畫列給 Jev。（R-086）
  5. 面對無法術直傷的鋪場牌組（例：蟲群守衛 1/3 嘲諷×3），用最貪婪的方式優勢交換。（R-094）
- 理由：R-094：對面沒有法術直傷，可以不斷擴大優勢。
- 落在：`src/plan.mjs` 的 `wastedChip`、shortlist；effectAssessments 解場指引；`sim.mjs` 關鍵字後備；fixture `game137-ongoing-effect-trade.json`
- 相關：F-234、F-380、F-386、R-013（freeTrades）
- 合併自：R-037、R-053、R-058、R-085、R-086、R-091、R-094
- 來源：archive/STATUS-2026-10-27.md（2026-09-26～10-05）

### R-038 公爵與古爾丹之手
- 日期：2026-09-26～2026-10-05
- 裁決：
  1. **counterFirst**：公爵這類每棄一張就成長的牌可打時，靈魂之火這類隨機棄牌等公爵打出後再上選單。（R-038）
  2. **guldanWaits**：場面落後（敵方攻血總和或數量較多）、手上另有 ≥4 張牌、有放得下的手下時，不施放古爾丹之手（仍可當棄牌目標）。（R-087）
- 理由：「確保隨機棄牌不會棄掉有價值的公爵」。
- 落在：`src/policy.mjs` 的 `counterFirst`、`guldanWaits`
- 相關：R-015（公爵 vs 武器）
- 合併自：R-038、R-087
- 來源：archive/STATUS-2026-10-27.md 第 1805、1629 行

### R-064 對手目標分類
- 日期：2026-10-02
- 裁決：
  1. 依當下公開 PLAY、初始生命、早期場面判斷對手目標：`pressure_window`、`board_resource` 或 `unknown`。公開任務視為時限；AOE 與資源／複製跡象要一致支持；職業、空過、40 血或事後標籤不能單獨定性；不硬編 T5/T6。（R-064）
  2. 控制訊號：40 血、AOE、多抽牌法術、弱身材、跳費、前兩回合無主動壓力；前期強場屬非控制。複製牧師歸控制（「算控制吧 有 AOE」）。任務／OTK 有爆發期限，列非控制並標 `delayed_deadline`；Corpse DK 鋪場路線列非控制。（R-068、R-069、R-070）
  3. 選項敘述：地標本體棄一抽二、召喚零隻，素材實際進三選項並結算才兼顧鋪場；公爵讀當前 tags、格數與 Rush；武器是穩定收尾但仍有 Soulfire／Soul Barrage。（R-065）
- 理由：原文未載。
- 落在：`src/matchup-objective.mjs`；`eval/history-matchup-rulings.json`
- 相關：無
- 合併自：R-064、R-065、R-068、R-069、R-070
- 來源：archive/STATUS-2026-10-27.md 第 2461–2550 行

### R-080 規則分層（否決規則與 END_TURN 例外）
- 日期：2026-10-04～2026-10-05
- 裁決：
  1. 否決規則 11 條，最先執行、不還原：`suicide`、`drawKills`、`lethalSelfDamage`、`boardLethalTap`、`tapExposesBoardLethal`（後兩條是使用者類別、非嚴格證明）、`locationResting`、`deadCoin`、`burnOwnHero`、`buffNobody`、`deadDraw`、`idleHeroAttack`。舊安全閘與所有「刪光就還原」移除。其他規則是偏好。（R-080）
  2. 2026-10-05 使用者確認三處 END_TURN 硬刪：Tap 那條維持；mustSpend 與 whispersWorthCasting 的例外見 R-013、R-009。（R-081）
- 理由：原文未載。
- 落在：silverfish-v1-veto-audit-v1（`eval/runs/veto-audit-20261004/candidate`）；`src/policy.mjs`
- 相關：F-375、R-009、R-012、R-013、R-029
- 合併自：R-080、R-081
- 來源：archive/STATUS-2026-10-27.md 第 2751–2752 行

### R-040 惡魔獵人（DH，第二副牌）
- 日期：2026-09-27
- 情境：2026-09-27 DH 對牧師，使用者四項回饋（剩 2 費用天生技沒出 Infestation；留 2 費結束；先兩張 Soul 才 Studies；先英雄攻擊才 Press the Advantage）。
- 裁決：
  1. 有可出的手下、海洋符印或虛無靈魂且有空位時，不先用天生技或結束回合；斬殺優先、攻擊仍可用；不把延遲或隨機召喚算成立即傷害。虛無靈魂要說明是花目前費用換一隻實際 1 費隨機惡魔，未知的是品質，不是零價值。（R-040、R-041）
  2. 冰川碎片：優先凍結攻擊力最高、非休眠、未冰凍的敵方手下。（R-042）
  3. DH 沒有勝率數據，全走 keepInOpening 白名單；放寬為 2 費以下、會召喚／抽牌／發現／拿牌且不造成傷害的法術交給 Jev。（R-043）
  4. DH 不套棄牌術的抽牌優先、武器先打、手牌花完才攻擊；保留流放開邊、先揮舊武器再換、保留解牌。（R-044）
- 理由：原文未載。
- 落在：DH 選項／規則（policy，原文未指明函式）；keepInOpening 白名單
- 相關：F-131
- 合併自：R-039、R-040、R-041、R-042、R-043、R-044
- 來源：archive/STATUS-2026-10-27.md 第 1765、1782、2353–2377 行

---

## B. Temporary 牌與詛咒墓穴（跨兩個時代）

### R-084 Temporary 牌與 Cursed Catacombs
- 日期：2026-10-05～2026-10-29
- 裁決：
  - **遊戲規則**
    1. Cursed Catacombs（0 費）從牌庫發現一張並設為 Temporary，回合結束就棄掉，牌庫那張也一起燒掉。（R-147）
    2. 發現到 Shred of Time（Casts When Drawn）時照樣施放（打自己英雄 3），再隨機抽牌庫下一張補上；補抽的牌當普通抽牌（不是 Temporary，推定）。（R-149）
  - **棄牌術（Jev，A 段牌組）**
    3. 墓穴給的 Temporary 身體／蜘蛛／隨機身體／抽牌類素材，費用 >0 且這回合打不出 buff 時延後硬出，留作棄牌素材（除非費用很多要配合 buff）。（R-084）
    4. 例外：抽牌類 Temporary 在費用夠、手上沒有其他可出的牌時立即打（drawNow），並拿掉結束回合。（R-092）
    5. 墓穴可找直傷或 buff，可以出。滿場時墓穴可以不出，或選古爾丹之手而不是侍僧。（R-093、R-097）
    6. 早期 Temporary 派對見 R-002 第 6 點。
  - **網路實戰（zakajz／zoo，C 段）**
    7. 要結束回合時，手上有 Temporary 或 doomed 牌打得出去就先打；目標優先網路排名最高、再無目標、再敵方。（R-135）
    8. **打不打墓穴**：這回合要打的話，排在攻擊與其他出牌之前（隨機結果先看再決定怎麼攻擊）；打完後剩下的費用不夠用發現的牌就不要打，留在手上。原本是無條件先打（2026-10-29 初版），E-265 搜尋顯示有更好的線後使用者同意改成有條件版。例：先打了 Grueling Trial 剩 0 費時不打墓穴。（R-147、R-159）
    9. 墓穴發現時，網路選的牌超過剩餘費用就改選網路排名最高、付得起、不是抽到時施放的牌。（R-139）
    10. 三張都打不起時，選負面的死牌（例：對手 Garona 塞進來的 King Llane），等於把它從牌庫清掉。（R-160）
  - 兩個時代的差別：棄牌術把 Temporary 當棄牌素材留著（3），網路實戰的牌組沒有這類出口，所以結束前打掉（7）。這兩條只套在各自的牌組，不衝突。
- 理由：Temporary 回合結束就會被棄；選付不起的牌等於浪費。
- 落在：`temporary-discard.mjs`（`deferHardCast`／drawNow）；`src/policy.mjs` 的 `temporaryDrawNow`、`temporaryPick`；`src/net-guards.mjs` 的 `expiring_card_before_end`、`affordable_temporary_discover`、`catacombs_without_mana`、`temporary_discover_dead_card`；`src/sim.mjs`（Shred `pull(s,1)`）；回歸題 `fx:ranked1029-g16-catacombs-no-mana`、`fx:ranked1029-g16-catacombs-take-llane`
- 相關：F-387、F-393、F-812、F-817、F-873、F-875、F-891、E-265、R-002、R-161、R-162
- 合併自：R-084、R-092、R-093、R-097、R-135、R-139、R-147、R-149、R-159、R-160
- 來源：archive/STATUS-2026-10-27.md（2026-10-05、10-27）；使用者 2026-10-29「這裡應該無條件先看cursed catacombs」→「要改」、「確認了。選了之後會先扣3血，然後再隨機抽下一張牌」、「最新一場第四回合不應該用墓穴 因為沒費用了」、「這邊應該可以選萊恩王」

---

## C. 網路實戰（net-guards 與出牌順序）

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

### R-161 net-guard 退休
- 日期：2026-10-29
- 情境：R-157、R-159、R-160 三個實戰錯誤要不要加 net-guard。
- 裁決：都加；但目標是模型自己學會，學會後把 guard 關掉。新加的 guard 要附回歸題並登記在 `GUARD_QUESTIONS`。
- 理由：使用者：「都加 不過希望以後模型自行學會 並且學會後把警衛關掉」。
- 落在：`src/net-guards.mjs` 的 `GUARD_QUESTIONS`（guard → 回歸題）與 `RETIRED`（模型名 → 已退休的 guard，`guardPick` 依 netPick 回傳的 `model` 跳過）。`npm run regress` 每個 guard 印「k/N questions pass」，全過標 `retirable`。`test/zakajz-live.test.mjs`：現役模型全答對卻沒退休、或退休了卻沒全答對都會失敗，換模型時要同步改 `RETIRED`。
- 相關：R-084、R-115、F-891、F-892
- 來源：使用者 2026-10-29

### R-162 Garona 與 King Llane
- 日期：2026-10-29
- 情境：ranked 批次第 20 局又遇到帶 Garona Halforcen（TIME_875）的盜賊，牌庫被塞了 King Llane（TIME_875t：3 費 3/3，戰吼抽一張、把自己洗回牌庫，不會留在場上）。模擬器沒有這組牌。
- 裁決：把 Garona 這組牌加進模擬器與對手池，先用較輕的訓練讓模型學會應對。打法提示：抽到 Llane 不急著打，它只是 3 費抽一張。Garona 的戰吼會在我們手上有 Llane 時摧毀它並把血量砍半；使用者通常還是留在手上（我們持續施壓、嘲諷多，對方沒時間打 Garona），但留或打交給模型，只事後驗收，不做回歸題。
- 理由：使用者：這張牌我們不認識。
- 落在：2026-10-29 子 session 在複本 `D:\Projects\CODING\jev-hearthstone-garona-20261029`（spec 在 handoff「下一步」）
- 相關：R-084（第 10 點）、R-161、F-891、F-892
- 來源：使用者 2026-10-29「我們可以把它加入對手，就可能用比較輕鬆的訓練先學會怎麼應對它」

---

## D. 模擬器卡牌規則

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

## E. 版本與牌組

### R-144 版本號規則
- 日期：2026-10-29
- 裁決：
  1. 照 basketball-autochess 改用分軌 `0.MINOR.PATCH`：軌道 `zoo`、`discard`、`zakajz`、`egg`、`sim`；實驗寫「基準＋E 編號」；變強才升 MINOR，其他採用升 PATCH；sim 只改資料加字母。1.0 = 某條網路軌道上實戰且 ranked 批次過 G5。規則全文在 memory/README.md「版本號」。
  2. 起點（舊檔名不改）：`zoo 0.1.0` = warlock-zoo-v9；`discard 0.1.0` = warlock-discard-v5；`zakajz 0.1.0` = warlock-zakajz-v1；`egg 0.1.0` = P7（R-150；原訂 P6A，2026-10-29 改）；`sim 0.1.0` = 38f4c93a3f4b。
  3. 只對很弱的模擬對手（例：模擬蛋牧）變強不算「變強」，不構成升 MINOR 或上線的理由，打天梯也不會因此上分；那樣的 ranked 批次目的是蒐集實戰數據。例：zoo-v10 對 P3 +5.3、其他 −0.1～+1.8。（R-145）
- 理由：舊的 vN／日期檔名每次匯出就 +1，看不出哪些是真的變強；模擬蛋牧比真人弱（F-784：模擬 86%、實戰 0–3）。
- 相關：E-254、E-260、E-261、F-784、R-150
- 合併自：R-144、R-145
- 來源：使用者 2026-10-29「查看一下 basketball-autochess 的專案。把他們的版本號規則抄過來」、「如果只是打我們很弱的模擬蛋牧變強，那大概率實戰也不會變強…」

### R-150 版本指定
- 日期：2026-10-29
- 裁決：
  1. **egg 0.1.0 = P7**（主流牌表 priest-egg-hsr 的蛋牧駕駛，E-268），檔案 `models/selfplay/priest-egg-0.1.0.{pt,json}`；在 sim c661d9b4b263（= `sim 0.1.0a`）上量，全新 seed 對 zoo-v9 49.5%（47.9–51.0），P6A 同牌表 34.0%。P1–P6A 都在 0.1 之前；以前紀錄裡寫「egg 0.1.0＝P6A」的指 P6A，不改原文。（R-150）
  2. **zoo 0.2.0** = E-271 B 臂（`models/selfplay/warlock-zoo-0.2.0.{pt,json}`，json sha256 0de0e2e0bc0a…、pt cfc19f4f3386…；sim b31012f48995、iter 2255、學習方牌組 warlock-zakajz、imbue=true）= 0.1.0（v9）+ E-254（v10）+ E-270 + E-271；v10 不另給版號。全新 seed 對 V10 全 PASS（egg +5.7、zakajz-v1 +3.6、鏡像 52.9%、shaman +2.2、dh +1.8），對蛋牧以外也進步，所以是 MINOR。（R-151）
  3. **zoo 0.2.1 = 0.2.0 網路 + E-281 留牌表**（`models/mulligan/warlock-zoo-0.2.1.json`，sha256 b1d6532a…，`net: warlock-zoo-0.2.0`），PATCH。實戰 warlock-zakajz 換牌由 `src/policy.mjs` mulliganConstraint 照表只留表選的那組（`src/mulligan-table.mjs` TABLES；三張先手、四張後手）；表的 `net` 和實際駕駛網路不同就退回舊規則；`test/selfplay-mulligan.test.mjs` 檢查 TABLES 的 net 等於 MODELS。模擬用 `src/selfplay-mulligan.mjs … --policy models/mulligan/warlock-zoo-0.2.1.json`（selfplay-match／compare 仍全留）。換駕駛網路時要重擬表。（R-154）
  4. 留牌表的來源：使用者要專門訓練 warlock-zakajz 的起手留牌，直覺是一費 Ritual of C'Thun、二費 Ritual of Summoning、三費 Kazakus 是核心，沒有就全換去找；不留二費傷害法術；沒前期手下不留 Floating Lessons。直覺規則本身沒贏，學出來的表贏（新舊各約 2000 局以上）。接受結果可能只適合 0.2.0 的打法。（R-152）
- 理由：模擬蛋牧改用主流牌表才像實戰對手（F-869）。
- 狀態：有效；實戰 MODELS 指 `warlock-zoo-0.2.0`
- 相關：R-144、R-146、E-268、E-271、E-281、F-869、F-870、F-883
- 合併自：R-150、R-151、R-152、R-154
- 來源：使用者 2026-10-29「這個牧師的版本號我們就把它定為0.1」、「好。那就定為0.2.」、「效果看起來不錯 可以升級成patch」

### R-146 現行動物園牌表
- 日期：2026-10-29
- 裁決：現在的動物園術沒有 Fatebreaker，換成 Zakajz the Corruptor 和 Glacial Shard，就是 `decks/warlock-zakajz`（−Fatebreaker −Tachyon Barrage −Vaultkeeper，+Zakajz +Glacial Shard×2）。`decks/warlock-zoo`（Fatebreaker 版）是 2026-10-25 的舊清單；拿「ZOO」當對手或重播時用 `warlock-zakajz`。
- 細節：Brox meta 對照快攻術 ≈ `warlock-zakajz`（28/30）。之前的重播（zoo-shaman、zoo-dh、brox-zoo、imbue-zoo）和蛋牧對 ZOO 的評估用的是 `warlock-zoo`。zoo-v9 的對手池兩份都有。
- 狀態：有效
- 相關：R-121、R-122
- 來源：使用者 2026-10-29「zoo的牌組應該沒有fatebreaker了吧？換成zakajz和冰川裂片了」

### R-122 舊 warlock-zoo 清單的小T規則
- 日期：2026-10-26
- 適用：只套 `decks/warlock-zoo`（Fatebreaker 舊清單）的 strategy.md／mulligan.json。實戰 warlock-zakajz 的換牌用 R-150 第 3 點的留牌表，不用這些。
- 裁決：
  1. `mulligan.json` 的 `combos` 加三組：召喚儀式＋卡扎、克蘇恩儀式＋卡扎、兩個儀式（三張 mulliganWR 都 ≥70，本來就留，這是保住規則）。（R-122）
  2. 龍蛋只在先手且有卡扎時留；二費一定要有怪；後手以硬幣跳二為準且不留咒怨之墓。（R-123）
  3. strategy.md 新增「Lines and choices (小T)」第 1–7 條，各附 dXX 出處。（R-124）
  4. 與現有內容衝突時以現有為準：d41「硬幣提早貼 buff」不寫（現有「Coin is for a Ritual or a body」）；栉龙先過牌限定在沒有儀式搶費用時；卡扎選項用我們牌表的名字，不在牌表的卡只寫成通則。（R-125）
- 理由：小T直播 `runtime/videos/xiaot-20261025/decisions/decisions.md` 第 1–8 條。
- 落在：`decks/warlock-zoo/mulligan.json`、`decks/warlock-zoo/strategy.md`
- 相關：R-146、R-150
- 合併自：R-122、R-123、R-124、R-125
- 來源：archive/STATUS-2026-10-27.md 第 488–490 行

---

## F. 訓練與研究方向

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

### R-148 依對手職業調整（TODO）
- 日期：2026-10-29
- 裁決（TODO，未實作）：駕駛網路要依對手調整。每個職業一組權重（或職業條件化的輸入），沒遇過的用預設權重；遇過的職業但牌組和訓練時不同，逐漸退回預設權重。
- 細節：起因是蛋牧 T4 跳幣準備 Soothsayer（brox-zak 第 2 局第 7 步）：先跳幣只在對手可能有 Cult Neophyte（法術 +1 費）時有利，但 `src/selfplay-encode.mjs` 沒有對手職業／牌組輸入。判斷標準是對手牌組會不會有加法術費的牌，不是職業本身。
- 狀態：有效
- 相關：R-084、R-155、F-873
- 來源：使用者 2026-10-29「觀察對方職業加入TODO…」

---

## G. 客戶端操作

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

---

## 舊 ID 對照（2026-10-30 整併）

被併掉的 ID → 現在所在的條目；刪除的寫原因。沒列在這裡的 ID 就是現存條目本身。

| 舊 ID | 現在 |
|---|---|
| R-004 | R-007 |
| R-005 | R-029 |
| R-006 | R-002 |
| R-008 | R-007 |
| R-010 | R-009（第 5 點，已被 R-083 縮限） |
| R-011 | R-007 |
| R-014 | R-007 |
| R-017 | R-009 |
| R-018 | R-001 |
| R-019 | R-012 |
| R-020 | R-015 |
| R-021 | R-003 |
| R-022 | R-001 |
| R-023 | R-001 |
| R-024 | R-001 |
| R-025 | R-015 |
| R-026 | R-015 |
| R-027 | R-012 |
| R-028 | 刪除：一次性例外，沒有改規則 |
| R-030 | R-029 |
| R-031 | R-029 |
| R-032 | R-016 |
| R-034 | R-009 |
| R-035 | R-033 |
| R-036 | R-015 |
| R-039 | R-040（情境） |
| R-041 | R-040 |
| R-042 | R-040 |
| R-043 | R-040 |
| R-044 | R-040 |
| R-045 | R-003 |
| R-046 | R-029 |
| R-047 | R-003 |
| R-048 | R-029 |
| R-049 | R-029 |
| R-050 | R-001（留牌）、R-002（硬幣） |
| R-051 | R-029 |
| R-052 | R-015 |
| R-053 | R-037 |
| R-054 | R-015 |
| R-055 | R-029 |
| R-056 | R-015 |
| R-057 | R-003 |
| R-058 | R-037 |
| R-059 | R-001（素材上限部分被 R-060 取代） |
| R-060 | R-001 |
| R-061 | R-002 |
| R-062 | R-002 |
| R-063 | R-002 |
| R-065 | R-064 |
| R-066 | R-001（低費鋪場例外被 R-060 取代） |
| R-067 | R-001 |
| R-068 | R-064 |
| R-069 | R-064 |
| R-070 | R-064 |
| R-071 | R-003 |
| R-072 | R-016 |
| R-073 | R-016 |
| R-074 | R-016 |
| R-075 | R-003 |
| R-076 | R-003 |
| R-077 | R-002 |
| R-078 | R-015 |
| R-079 | R-016 |
| R-081 | R-080（另見 R-009、R-013） |
| R-082 | R-012 |
| R-083 | R-009 |
| R-085 | R-037 |
| R-086 | R-037 |
| R-087 | R-038 |
| R-088 | R-015 |
| R-089 | 刪除：只是追問，結論（模擬器要模擬魔眼選牌）在 F-384 與 R-015 的 `chooseDiscard` |
| R-090 | R-015 |
| R-091 | R-037 |
| R-092 | R-084 |
| R-093 | R-084 |
| R-094 | R-037 |
| R-095 | R-013 |
| R-096 | R-016 |
| R-097 | R-084 |
| R-098 | R-002 |
| R-099 | R-015（棄牌）、R-013（不空過） |
| R-100 | R-013 |
| R-101 | R-015 |
| R-102 | R-013 |
| R-103 | R-016 |
| R-104 | R-013 |
| R-105 | R-009 |
| R-106 | R-009 |
| R-108 | R-107 |
| R-109 | 刪除：第二副牌選快攻海盜戰，從沒用上；現行牌組見 R-146、R-150 |
| R-110 | 刪除：「網路只看身材」已被後來的編碼（pile、imbue 等）取代 |
| R-112 | R-111 |
| R-113 | R-111 |
| R-116 | R-111 |
| R-117 | R-111 |
| R-118 | 拆開：第 1、3 點 R-115；第 2 點 R-137；第 4 點 R-120；第 5 點 R-134 |
| R-119 | R-115 |
| R-123 | R-122 |
| R-124 | R-122 |
| R-125 | R-122 |
| R-126 | R-111 |
| R-128 | R-127 |
| R-129 | R-127 |
| R-130 | R-127 |
| R-131 | 刪除：「v8 當實戰模型」已過時，現行見 R-150 |
| R-132 | 刪除：一次性的派工收尾指示（v9 合併） |
| R-133 | 刪除：派工後端選擇不屬於這個專案的規則，且已改為不用 DS 後端 |
| R-135 | R-084 |
| R-136 | R-121 |
| R-138 | R-121 |
| R-139 | R-084 |
| R-140 | R-127 |
| R-141 | R-127 |
| R-142 | R-127（第 8 點） |
| R-145 | R-144 |
| R-147 | R-084 |
| R-149 | R-084 |
| R-151 | R-150 |
| R-152 | R-150 |
| R-154 | R-150 |
| R-156 | R-137 |
| R-157 | R-115 |
| R-158 | R-114 |
| R-159 | R-084 |
| R-160 | R-084 |
| R-163 | R-155 |
| R-164 | R-033 |
