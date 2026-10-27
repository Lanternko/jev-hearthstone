# shaman-cthun 模擬器覆蓋報告（2026-10-27）

牌表：`decks/shaman-cthun/list.json`，30 張、18 種，英雄 HERO_02（索爾），英雄能力 HERO_02bp Totemic Call（召喚隨機基本圖騰）。卡面來自 `data/cards.enUS.json`。

這副是 2026-10-26 天梯遇到的對手（Power.log `runtime/ranked-2026-10-26T22-18-25-750Z/game-0010-Power.log`，player 1）。打法與 zoo 的應對寫在 `decks/shaman-cthun/strategy.md`。

## 怎麼測的

- 牌表由實戰 Power.log 的卡號核對（game-0010 出現 BE_207、JAIL_850、BE_014、CORE_WC_042、CORE_GIL_531、JAIL_457、BE_349、JAIL_800 等）；
  另外看到對手打過 JAIL_802 Gallagio Goon，但不在這 30 張裡，推測是同一個薩滿玩家的其他構築。
- `test/shaman-cthun-sim.test.mjs`（13 個測試）：
  - 牌表 30 張、英雄與英雄能力正確，每一種牌在 20 費、雙方各一隻手下時，`moves()` 裡都有出這張牌的合法動作；
  - Eyemaul 攻擊後召喚兩隻 2/2 衝刺元素；
  - Tiny Pal 四種彈藥（冰凍、全敵 1 傷、召喚嘲諷、拿減費戰吼手下）在 24 個種子內全部出現；
  - Fire Fly 進手一張 1/2 Flame Elemental；
  - Wailing Vapor 只在打出元素後 +1 攻擊（打普通手下不會）；
  - Warden Maiev 讓下一隻手下 +3/+3 並休眠一回合，兩個回合後醒來；
  - Hijacked Securitybot 給其他手下 +1/+1、不給自己；
  - Skywall Sentinel 的 Herald 召喚 1/2 Soldier of Al'Akir，Soldier 右邊的哨兵 +1 攻擊；
  - Unstable Prototype 的 Reborn 與死亡之聲給手牌 +1/+1；
  - Watfin 的發現（三選一，選到的手下 +1/+1 進手）；
  - Totemic Call 召喚一根基本圖騰；
  - Mug'Zee 等 C'Thun 與普通體質的牌都有模型，6/7 下場；
  - 每個模型都是從卡面文字認出來的（`gameModel` 正則）。
- 另外跑了 200 局 zoo 對 shaman-cthun 與 200 局 shaman 內戰的隨機動作 sanity：
  zoo 先手 114 / 後手 86（19.2 回合、80 步一局），內戰先手 102 / 後手 98（26.0 回合、122 步一局），沒有未完成局；
  300 局中薩滿那一邊把 18 種牌都打過一次以上。

「沒建模」的意思是 `gameModel` 沒有回傳任何模型：這種牌在模擬器裡永遠不會出現在 `moves()`，只會卡在手牌裡，而且不會報錯。這次 18 種全部有模型（兩張部分建模，見下）。

## 每張牌

| 牌 | 張數 | 費 | 卡面重點 | 模擬器 | 狀態 |
|---|---|---|---|---|---|
| Eyemaul (BE_349) | 2 | 4 | 2/2 武器，英雄攻擊後召喚兩隻 2/2 衝刺元素 | `EYEMAUL` → 攻擊分支 `tokens` n:2 2/2 rush | 已建模：每次英雄攻擊都召喚，武器耐久 2 |
| Fire Fly (CORE_UNG_809) | 2 | 1 | 1/2，戰吼進手一張 1/2 元素 | `addToken:'Flame Elemental'`，`extra` 對應 UNG_809t1 | 已建模 |
| Tiny Pal (JAIL_458) | 1 | 4 | 2/3 武器，戰吼選彈藥；每次英雄攻擊後選另一種 | `TINY_PAL` → `tinyPal(s)`，四種彈藥隨機 | 部分：四種效果都有（冰兩個敵人、全敵 1 傷、1/3 嘲諷、發現戰吼手下減 2 費），但**沒有選擇步驟**，每一擊隨機 |
| Mug'Zee (JAIL_800) | 1 | 6 | 6/7，開場：牌庫沒有法術就拿 Zee's Might（每第 5 個手下戰吼兩次） | 只有 6/7 體質 | **部分：被動沒做**（英雄能力仍是 Totemic Call；這副沒有法術，實戰會拿到 Zee's Might） |
| Gargantuan Slitherer (BE_204) | 2 | 6 | 6/7 嘲諷，戰吼選一個 C'Thun 能力觸發 | 既有 `cthun:'always'` → `offer(s,'cthun',...)` | 已建模（DH 那批就有的模型） |
| C'Thun, Eye of the Empire (BE_013) | 1 | 10 | 12/12；四個能力都觸發過就三倍 | 既有 `oldGod` → `oldGod(s,b)`，`cthunSeen` 四個都在時 `times=3` | 已建模：Wrath 7/21 傷隨機、Domain 兩隻 +2/+3、Glare 吸血 5/15、Servants 兩隻 2/3 嘲諷（三倍時六隻） |
| Holy Eggbearer (DINO_411) | 2 | 2 | 1/2，戰吼抽一張 0 攻擊手下 | `drawZeroAtk` | 已建模：從牌庫抽 0 攻擊手下（Witch's Apprentice、Unstable Prototype） |
| Elemental of Madness (BE_870) | 2 | 3 | 2/2，戰吼發現與攻擊同費的法術，這回合 0 費 | `MADNESS` → `{kind:'minion'}` | **部分：體質有做，發現的法術沒做** |
| Warden Maiev (JAIL_850) | 1 | 2 | 1/3，之後每打出一隻手下 +3/+3 並休眠一回合 | `warden:true` → 打出手下時 `grow` +3/+3、`dormant`、`wake:1` | 已建模 |
| Wailing Vapor (CORE_WC_042) | 2 | 1 | 1/3，每打出一隻元素 +1 攻擊 | `vapor:true`，檢查 `b.race==='ELEMENTAL'` | 已建模：只有元素會觸發 |
| Hijacked Securitybot (JAIL_457) | 2 | 4 | 3/3，準備戰吼：其他手下 +1/+1 | `buffOthers:{atk:1,hp:1}` | 已建模（準備流程當成即時戰吼） |
| Watfin (JAIL_EVENT_100) | 1 | 2 | 3/2，戰吼發現手下，可疑的那張 +1/+1 | `discoverMinion:1` → 三選一，`settle` 讓選到的 +1/+1 進手 | 部分：發現是真的三選一；**「可疑」的判定近似成每次選的都有 +1/+1** |
| Witch's Apprentice (CORE_GIL_531) | 2 | 0 | 0/1 嘲諷，戰吼拿一張隨機薩滿法術 | `APPRENTICE` → `{kind:'minion'}` | **部分：體質與嘲諷有做，法術沒做** |
| Unstable Prototype (BE_207) | 2 | 1 | 0/1 Reborn，死亡之聲給手牌所有手下 +1/+1 | `{kind:'minion'}` + `rattle` 的 `UNSTABLE` 與 `body().reborn` | 已建模：Reborn 以 1 血回來一次，死亡之聲加手牌 |
| Nightmare Lord Xavius (EDR_856) | 1 | 4 | 4/4，戰吼從牌庫發現一個手下並給 Dark Gift | 既有 `xavius` → `offer(s,'xavius',...)`、`settle` 取第一項 | 已建模（既有模型：Dark Gift 近似 +2/+2） |
| Skywall Sentinel (CATA_565) | 2 | 2 | 0/2 嘲諷，戰吼 Herald 1/2 Soldier of Al'Akir（相鄰 +1 攻擊） | `herald:true` → 召喚 Soldier（CATA_565t），召喚當下讀一次相鄰 +1 攻擊 | 部分：**Herald 升級（再 Herald 一次變 +2）沒做**；光環只在召喚時讀一次，Soldier 死後不收回 |
| Vaultkeeper (BE_151) | 2 | 5 | 3/3，戰吼與死亡之聲各給相鄰 +2/+2 | 既有 Vaultkeeper 模型 | 已建模（zoo 也有這張，同一套規則） |
| Spawn of C'Thun (BE_014) | 2 | 4 | 2/2，戰吼：C'Thun 開局在牌庫就選一個能力觸發 | `cthun:'started'`，`s.cthunStart` 為真才 `cthun(s)` | 已建模：這副有 C'Thun，所以戰吼一定觸發 |
| Totemic Call（英雄技能） | — | 2 | 召喚隨機基本圖騰 | `power.summon` → `totem(s)`，四根基本圖騰（CS2_050/51/52、NEW1_009） | 部分：**四根都從資料庫召喚**，但不檢查「已在場上的不重複」；Wrath of Air 的法傷與 Healing Totem 的回合結束治療沒做 |

## 共用機制

- **座位新欄位**：`power.summon`（英雄能力是否召喚隨機基本圖騰，由卡面 `/summon a random basic totem/` 讀出）。
- **體質新欄位**：`body()` 多了 `race`（卡面的種族，Wailing Vapor 靠它判斷元素）與 `reborn`（卡面的 Reborn 關鍵字；Unstable Prototype 的 Reborn 由 `rattle` 以 1 血召回一次）。
- **衍生牌**：Flame Elemental、Soldier of Al'Akir、四根基本圖騰放在 `context().extra`（`s.game.extra`）；Soldier 另有 `tokens` 的 CATA_565t。
  Eyemaul 的元素是無名 token（`tokens()` 直接建 2/2 衝刺體質，不是資料庫的牌）。
- **發現**：`context().allMinions` / `allById`（所有收藏品手下）給 Watfin 的三選一，`s.pickPool` 記住選項，
  `settle` 的 `discoverMinion` 分支把選到的手下 +1/+1 放進手牌。
- **戰吼與在場觸發**：`gameModel` 只在 `s.game`（自戰）時生效；Warden Maiev、Wailing Vapor、Warden 的休眠醒來都走既有的 `beginTurn`。
- **編碼**：`MADE` 加入 `CORE_UNG_809 → UNG_809t1`、`CATA_565 → CATA_565t`，讓 Flame Elemental 與 Soldier 有獨立的詞彙格；
  圖騰與 Watfin 發現的任意手下落在「其他」格。

## 簡化

- Mug'Zee 的 Zee's Might 沒做（實戰拿到的是被動，模擬器仍是 Totemic Call）。
- Totemic Call 不排除場上已有的圖騰，也不做 Wrath of Air 的法傷、Healing Totem 的治療。
- Tiny Pal 沒有「選彈藥」的步驟，每擊隨機；Skywall Sentinel 的 Herald 升級沒做；Soldier 的相鄰 +1 攻擊只在召喚當下讀一次。
- Elemental of Madness 發現的法術、Witch's Apprentice 拿到的隨機薩滿法術都沒做（這副牌沒有其他法術，等於少了兩張資源牌）。
- Watfin 的「可疑」近似成每次選的都有 +1/+1；Xavius 的 Dark Gift 沿用既有近似 +2/+2；Securitybot 的準備流程照即時戰吼。
