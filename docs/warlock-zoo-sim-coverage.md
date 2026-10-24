# warlock-zoo 模擬器覆蓋報告（2026-10-24）

牌表：`decks/warlock-zoo/list.json`，30 張、16 種，英雄 HERO_07f，英雄技能 Life Tap（HERO_07ebp）。卡面來自 `data/cards.enUS.json`（2026-10-24 HearthstoneJSON 快照）。

## 怎麼測的

測法是一個臨時探針腳本（沒有放進 repo），每種牌各跑一次：

- 用 `newGame`（seed 7）開局，這個模式下 `game`、`full`、`additive` 都是開的。
- 盤面設成 10 費。敵方放兩隻 2/3，我方放一隻 1/1。
- 把這張牌塞進手牌後檢查三件事：
  - `modelOf` 有沒有回傳模型；
  - `moves()` 裡有沒有出這張牌的合法動作；
  - `apply` 之後盤面怎麼變。遇到選擇時取第一項。
- 有身體的牌，最後把血量設成 0、結束回合，看亡語有沒有觸發。

「沒建模」的意思是 `modelOf` 沒有回傳任何模型。這種牌在模擬器裡永遠不會出現在 `moves()`，只會一直卡在手牌裡，而且不會報錯。

## 每張牌

| 牌 | 張數 | 費 | 卡面重點 | 模擬器 | 狀態（第 1、2 類補完後） |
|---|---|---|---|---|---|
| Cursed Catacombs (TLC_451) | 2 | 0 | 發現一張牌庫裡的牌，暫時牌 | `discover` | 正確：牌庫 26→25，選中的牌以 Temporary 進手 |
| Platysaur (TLC_603) | 2 | 1 | 1/2，戰吼抽 1；亡語棄掉抽到的那張 | `minion draw:1` + `b.drew` | 正確：身材 1/2、抽 1；死亡後手牌 5→4 |
| Entropic Continuity (TIME_026) | 2 | 1 | 友方隨從 +1/+1，洗 2 張 Shred of Time 進牌庫 | `buff +1/+1` + 名稱特例 | 正確：1/1→2/2、牌庫 +2；洗牌只靠名稱特例 |
| Twilight Egg (CATA_210) | 2 | 1 | 0/2，亡語召喚雛龍，雛龍每回合在手 +1/+1 | `gameModel` 白板 + `rattle` | 已建模：0/2；死亡後召喚 2/1 Accelerated Whelp（`s.game.extra`）。手牌成長沒做 |
| Floating Lessons (BE_094) | 2 | 1 | 指定隨從加攻血，另外隨機一張手牌隨從也加 | `gameModel` `lessons` | 已建模：目標是任一方的隨從（敵方潛行、休眠除外），+X/+X，X＝`costOf` 算過 Mawman／稅的費用×2（Mawman 在場為 +4/+4）；手上隨機一張隨從同樣 +X/+X，沒有就只加目標。場上沒有隨從目標時不能出 |
| Ritual of C'Thun (BE_726) | 2 | 1 | 2 回合後觸發的延遲選擇 | `gameModel` `ritual` + 座位計時器 | 已建模：我方第 2 個回合開始時 4 選 1（Wrath 7 點隨機分配、Domain 兩隻其他隨機友方隨從 +2/+3、Glare 吸血 5 傷並選敵方隨從、Servants 兩隻 2/3 嘲諷）。沒有敵方隨從時選項裡沒有 Glare |
| Darkest Depths (BE_087) | 1 | 2 | 召喚兩個 0/3 嘲諷，Assemble | `gameModel` `tokens` | 已建模：兩個 0/3 嘲諷 Depthguard。Assemble 沒做 |
| Cult Neophyte (CORE_SCH_713) | 2 | 2 | 3/2，戰吼：對手下回合法術 +1 費 | `gameModel` `tax` | 已建模：3/2；對手座位 `spellTax` +1，對手回合結束時歸零 |
| Twilight Timehopper (TIME_025) | 2 | 2 | 4/4，戰吼洗 2 張 Shred of Time 進牌庫 | `SHREDS` + `shuffleShreds` | 已建模：4/4，牌庫 +2 Shred（和 Entropic Continuity 共用） |
| Tachyon Barrage (TIME_027) | 2 | 2 | 6 點隨機分配給敵人，洗 2 張 Shred | `SPLIT` → `volley` + `shuffleShreds` | 已建模：6 點隨機分配、牌庫 +2 Shred |
| Ritual of Summoning (BE_085) | 2 | 2 | 2 回合後召喚兩個 3/5 嘲諷 | `gameModel` `ritual` + 座位計時器 | 已建模：我方第 2 個回合開始時召喚兩隻 C'thrax Brute（3/5 嘲諷，BE_085t），盤面滿就少召 |
| Godfather Kazakus (CAP_405) | 1 | 3 | 3/3，Plot／選擇 | `gameModel` `plot` + 三段 `choice` | 已建模：3/3；戰吼三段選擇（9 取 3 選 1、剩下 8 取 3 選 1、審判長度），結果是一張費用 7／4／0 的審判牌進手牌，打出後才生效（Rushed 立即、Grueling 我方下回合開始、Unending 我方第 4 個回合開始），依序施放兩個效果 |
| Mawman Cultist (BE_729) | 2 | 3 | 4/4 光環：所有法術 +1 費（雙方） | `gameModel` 白板 + `costOf` 光環 | 已建模：4/4；活著時雙方法術 +1 費 |
| Blasphemy (BE_086) | 2 | 4 | 對所有敵人 2 傷；若手上最貴則再一次 | `gameModel` `blast` | 已建模：所有敵人（含英雄）2 傷；出完後手上沒有更貴的牌就再一次（同費算最貴） |
| Ruinous Velocidrake (TIME_029) | 2 | 5 | 5/5 突襲，戰吼從牌庫施放一張 Shred 召喚複製 | `gameModel` `copyShred` | 已建模：5/5 突襲；牌庫有 Shred 就拿掉一張、自己英雄受 3、召喚一隻突襲複製 |
| Vaultkeeper (BE_151) | 2 | 5 | 3/3，戰吼與亡語讓相鄰隨從 +2/+2 | `gameModel` `adjacent` + `rattle` | 已建模：戰吼給左鄰 +2/+2（出牌一律放最右）；亡語給死前左右鄰 +2/+2 |
| Life Tap（英雄技能） | — | 2 | 抽 1、自己受 2 | `power.draw=1, selfHit=2` | 正確 |

補完第 1、2、3 類之後，16 種全部能打出來，30 張裡的 30 張都有 `modelOf` 模型、`moves()` 裡有出牌動作（用同一份探針逐種確認，場上我方一隻、敵方一隻 Yeti，10 費），另外加上英雄技能。

（補之前只有 6 張能打：Catacombs、Platysaur、Entropic Continuity 各 2 張；補完第 1、2 類時是 23 張。）

新模型都放在 `gameModel`，只在 `s.game`（自戰）時生效；實戰模式的行為不變。測試在 `test/warlock-zoo-sim.test.mjs`（第 1、2 類）和 `test/warlock-zoo-cat3.test.mjs`（第 3 類）。

### 第 3 類的共用機制

- **延遲計時器**：出牌方的座位（`SEAT` 的 `timers`）上有一份待觸發清單，每筆 `{left,effect}`。只有座位主人自己的回合開始（`beginTurn`）會把 `left` 減 1，減到 0 就觸發；出牌那回合不算，對手回合不計數，`flip` 時跟著座位走。「In 2 turns」＝出牌後我方第 2 個回合開始時觸發。
  - 觸發在 `beginTurn` 刷新場上隨從之後、抽牌之前，所以新召喚的隨從不能攻擊。
  - 兩張 Ritual of C'Thun 同回合到期時，第二個選擇排在第一個做完之後（`pendingCthun`）。
- **衍生牌**：`context()` 的 `extra` 加了 C'thrax Brute（BE_085t）、Faceless Fanatic（BE_013t5，2/3 嘲諷）、Voidlord（LOOT_368）和三張審判牌（CAP_405tb1／tb2／tb3），用 `spawn` 以卡面數值召喚。
- **選擇**：沿用 `s.choice`／`offer`／`settle`。新增的種類：`cthun`（選項是能力的卡號）、`glare`（選項是敵方隨從 id）、`kaz1`／`kaz2`／`kaz3`（選項是 CAP_405t1..t9 與審判的卡號）。
- **Voidlord 亡語**：`rattle` 依卡面文字召喚三隻 1/3 嘲諷的 Demon（沒有找到對應的資料庫 token，用現場建的 1/3 嘲諷「Demon」）。

### 第 3 類的簡化

- Kazakus 的 CAP_405t1（強制攻擊）：每隻隨從依場上順序各和一隻隨機的其他活隨從互打一次，不是卡面那種完整的強制攻擊流程（沒有觸發攻擊相關的效果）。
- Kazakus 的 CAP_405t2（奪取）：被奪取的隨從不能在當回合攻擊，即使它有衝鋒或突襲。
- Kazakus 的 CAP_405t3（偷牌）：偷到的牌保持原本的費用；手牌滿 10 張就燒掉。
- Kazakus 的 CAP_405t5／t7 只影響當下手牌，之後抽到的牌不受影響。
- Wrath 與 Glare 不受法術傷害加成（卡面是 ImmuneToSpellpower），模擬器本來也沒有法術傷害。
- Domain of C'Thun 的「其他」：儀式沒有來源隨從，所以是從所有友方隨從中隨機挑兩隻。
- Glare 的目標：不能選潛行、休眠的敵方隨從。
- 審判牌是戰吼結束當下進手牌，手牌滿 10 張就消失（和其他進手牌的牌一樣）。
- 審判牌、儀式的牌面文字沒有被解析，模型靠 `c.trial` 與 `RITUAL_*` 正則。
- 編碼（2026-10-24 已補）：`cthun`、`kaz*` 的選項是卡號字串，編碼器從卡面庫查牌名，各選項在 choose 動作上有自己的詞彙格。zoo 的詞彙另外收進 C'Thun 四種能力、Kazakus 九種效果與三種審判、Faceless Fanatic、C'thrax Brute、Voidlord、Shred of Time、Accelerated Whelp（由牌表裡的來源牌決定，見 `MADE`）。觀察向量沒有另外標「現在是哪一種選擇」，網路靠選項本身的牌名分辨。

## 自戰現況（隨機合法動作）

| 對戰 | 補之前 | 補完第 1、2 類 | 補完第 3 類 |
|---|---|---|---|
| `node src/selfplay.mjs 100 1 warlock-zoo warlock-zoo` | 先手 52、後手 48，平均 21.7 回合 | 先手 56、後手 44，平均 16.1 回合 | 先手 53、後手 47，平均 15.9 回合 |
| `node src/selfplay.mjs 100 1 warlock-zoo warlock-discard` | 先手（zoo）0、後手（discard）100，平均 12.6 回合 | 先手（zoo）44、後手（discard）56，平均 16.5 回合 | 先手（zoo）56、後手（discard）44，平均 16.2 回合 |

兩組都是 0 局沒打完、0 和局。

補之前 zoo 幾乎只能用英雄技能和三種小牌。現在 30/30 張能打，隨機動作下和 discard 打得有來有回（先手 zoo 56:44；隨機動作下先後手差異不大，這個比分不代表牌組強度）。編碼也已補上，可以開始訓練 zoo 網路。

## 建議修正順序（第 1、2、3 類都已照這個順序補完，下面留作紀錄）

1. **容易，可以重用現有程式**：
   - Twilight Timehopper：身材加上洗 2 張 Shred，和 Entropic Continuity 共用。
   - Tachyon Barrage：放寬 `BARRAGE` 正則或另寫一條，走 `volley`，再加洗 Shred。
   - Cult Neophyte、Vaultkeeper：先讓身材能當白板下場，效果晚點補。
2. **中等**：
   - Twilight Egg：亡語召喚雛龍，手牌成長可以先不做。
   - Darkest Depths：先只做兩個 0/3 嘲諷。
   - Blasphemy：全體 2 傷，再加「手上最貴」的判斷。
   - Mawman Cultist、Cult Neophyte：費用光環。這需要加一個雙方法術費用修正的欄位。
   - Ruinous Velocidrake：突襲身材，戰吼從牌庫拿 Shred。
3. **難**：
   - Ritual of C'Thun、Ritual of Summoning：延遲 2 回合的效果，要有回合計時器。
   - Godfather Kazakus：Plot／選擇。
   - Floating Lessons：隨機手牌加成。

退而求其次，第 2、3 類可以先讓「有身體的牌至少能當白板下場、法術至少有主要傷害或召喚」，之後再一張一張補細節。

## 其他還沒驗證的

- ~~Shred of Time 被抽到後能不能接上 `pull()` 的「抽到即施放」~~：已驗證。抽到 Shred 時自己英雄受 3，抽牌繼續往下抽（測試 `a drawn Shred casts`）。
- 這副牌沒有任何實戰 Power.log，`eval-sim-fidelity` 量不到它的模擬準確度。
- 編碼的詞彙由牌表決定，所以 zoo 要另外訓練一個網路，不能沿用現有模型。

## 這一批順手修的

新快照的卡面加了一個排版用的 `&`，共 329 張，例如 Stardust Scythe 變成 "attacks,& get a Void Soul."。這讓 DH 的兩則武器測試失敗。

已在 `src/mechanics.mjs` 的 `textOf` 把 `&` 換成空白。修完 `npm test` 643/643。
