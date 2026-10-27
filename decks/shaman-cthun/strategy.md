# shaman-cthun：Mug'Zee 的 C'Thun 薩（元素小鋪場 + 克蘇恩收頭）

2026-10-26 天梯遇到這副（Power.log `runtime/ranked-2026-10-26T22-18-25-750Z/game-0010-Power.log`，
player 1 是對手）。牌表 `list.json` 30 張、18 種：Eyemaul ×2、Fire Fly ×2、Tiny Pal ×1、Mug'Zee ×1、
Gargantuan Slitherer ×2、C'Thun, Eye of the Empire ×1、Holy Eggbearer ×2、Elemental of Madness ×2、
Warden Maiev ×1、Wailing Vapor ×2、Hijacked Securitybot ×2、Watfin ×1、Witch's Apprentice ×2、
Unstable Prototype ×2、Nightmare Lord Xavius ×1、Skywall Sentinel ×2、Vaultkeeper ×2、Spawn of C'Thun ×2。
英雄 HERO_02（索爾），英雄能力 HERO_02bp 圖騰呼喚。

## 這副牌在做什麼

- **整副沒有法術**。30 張全是手下與武器，所以 Mug'Zee 的開場效果拿到的是 Zee's Might
  （被動：你打出的每第 5 個手下，戰吼觸發兩次）；Mug's Magic（手下減費）因為牌庫有別的手下而不會給。
- **元素小鋪場**：Eyemaul（4 費 2/2 武器，英雄攻擊後召喚兩隻 2/2 衝刺元素）、Fire Fly（1 費 1/2，進手一張 1/2 元素）、
  Wailing Vapor（1 費 1/3，每打出一隻元素 +1 攻擊）、Skywall Sentinel（2 費 0/2 嘲諷，Herald 1/2 的 Soldier of Al'Akir，
  相鄰手下 +1 攻擊）、Tiny Pal（4 費 2/3 武器，每次英雄攻擊後換一種彈藥：冰兩個敵人／全敵 1 傷／召喚隨機 3 費嘲諷／
  拿一張減 2 費的戰吼手下）、Totemic Call 每回合補一根圖騰。武器兩把加圖騰，讓它每回合都有免費或半免費的場面。
- **體質與續航**：Warden Maiev（2 費 1/3，之後每打出的一隻手下 +3/+3 並休眠一回合，等於 3 費換一個大手下）、
  Hijacked Securitybot（4 費 3/3，準備戰吼給其他手下 +1/+1）、Vaultkeeper（5 費 3/3，戰吼與死亡之聲各給相鄰 +2/+2）、
  Unstable Prototype（1 費 0/1 Reborn，死亡之聲給手牌所有手下 +1/+1）、Xavius（從牌庫發現手下並給 Dark Gift）、
  Watfin（發現手下，可疑的那張 +1/+1）、Holy Eggbearer（抽一張 0 攻擊手下：Witch's Apprentice 與 Unstable Prototype）。
- **克蘇恩套件**：Spawn of C'Thun（4 費 2/2，C'Thun 在牌庫開局就選一個能力觸發）、
  Gargantuan Slitherer（6 費 6/7 嘲諷，選一個能力觸發）、C'Thun 本體（10 費 12/12，四個能力都觸發過就三倍）。
  四個能力是：Wrath（7 傷隨機分給敵人）、Domain（兩隻友方手下 +2/+3）、Glare（吸血 5 傷單體）、Servants（兩隻 2/3 嘲諷狂熱者）。
  三倍之後等於 21 傷隨機、15 傷吸血、六隻 2/3 嘲諷，是一套不需要法術的收頭。
- **弱點**：沒有硬解、沒有 AOE、沒有抽牌引擎（只有 Eggbearer 抽 0 攻擊手下）；場面被清掉就只剩 6 費以上的大手下。

## zoo 該怎麼打它（使用者的判斷，2026-10-27）

- **在 C'Thun 三倍之前結束**。它沒有任何法術清場，zoo 的鋪場它只能用手下換；拖到 10 費讓 C'Thun 下來，
  21 傷隨機加六隻嘲諷，zoo 的血量撐不住。前期每一次交換都要換得有價值，不要只是為了打臉送掉場面。
- **Blasphemy 是這副牌的天敵**。它的手下多數是 0/1、0/2、1/3、2/2、3/3：Blasphemy 一次 2 傷就清掉大半，
  是手上最高費時再一次 4 傷連 Securitybot、Watfin、Wailing Vapor 都帶走。Slitherer（6/7）與 Mug'Zee（6/7）才是 4 傷清不掉的。
- **別幫它把場面換肥**：Warden Maiev 的 +3/+3、Vaultkeeper 的 +2/+2 都要「先有場面」才有用，所以前期把它的手下清空比互換划算；
  互換會讓它用 Eyemaul 與圖騰補回來，而 zoo 的補牌靠 Platysaur、Timehopper，換一隻少一隻。
- **Eyemaul 的兩隻衝刺元素是它的節奏來源**。它的元素越多，Wailing Vapor 攻擊越高、Tiny Pal 的彈藥越捨得換。
  自己回合結束前留下嘲諷（Ritual of Summoning 的 3/5 C'thraxxi）可以把兩隻 2/2 衝刺擋掉，等於斷它一回合的節奏。
- **Glare 與 Wrath 對寬場面效率低**：Glare 是單體 5 傷、Wrath 是 7 傷隨機分，場上手下越多，隨機傷害越分散。
  所以鋪場要寬不要高，不要把所有體質集中在一隻：它的 Glare 是單體 5 傷，一隻大手下不值得。
- **偷血線的窗口**：它唯一的回血是 Glare 的吸血（5 點，三倍 15 點），其他都是加體質。zoo 的爆發（Entropic Continuity 的 +1/+1、
  Tachyon Barrage 的 6 傷分攤、Blasphemy 兩段）要留到它把場面鋪開、自己血線 20 以下時再打。
- 0 攻擊的 Witch's Apprentice（0/1）與 Skywall Sentinel（0/2）不用主動換：它們的價值在戰吼與 Herald，換掉不影響它手上的牌，
  反而讓 zoo 的手下少一隻去打 Watfin、Xavius、Securitybot 這些真正給它資源的手下。
