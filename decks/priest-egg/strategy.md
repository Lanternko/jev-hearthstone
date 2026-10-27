# priest-egg：蛋牧（Khelos 蛋 + 聖光懲擊 + Medivh's Triumph）

**2026-10-27 牌表已換成真人的 Imbue／交織命運型**（`list.json`）：加入 Lunarwing Messenger ×2、Elder Word: Flay、Psychic Conjurer、
Power Word: Barrier、Cleansing Lightspawn、Defias Smuggler、Intertwined Fate ×2；拿掉 Servant of Zuramat、Dissolving Ooze、Hold Them Off!、
Endbringer Umbra、N'Zoth；Undeath Sentence、Gravedawn Sunbloom、Slime 'em!、Soothsayer 各減為 1。
Imbue 把英雄能力換成 Blessing of the Moon（每回合產一張打得出的牧師牌），交織命運與心靈咒術師會複製我們的牌。
真人會對自己的蛋施放 Haunt（嘲諷、+3 血、復生），模擬駕駛與實戰 guard 都照做（`src/egg-guard.mjs`）。
下面的牌組代碼與解碼是 10-26 那場的舊牌表。

2026-10-27 實戰輸給這副（Power.log `runtime/ranked-2026-10-26T21-51-57-289Z/game-0001-Power.log`，player 2 是對手）。
牌組代碼 `AAECAa0GCPCfBMODB/WYB+ybB9edB7DJB4XrB9z7BwuFnwSFhgfFlAfgnQfksgeyxQevyQeT3wfV4Af04Afh+gcAAA==`，
解碼後 30 張（英雄 HERO_09bk 麥迪文；牌組代碼的英雄是 HERO_09，實戰看到的造型是 HERO_09bk）。
解碼核對：Holy Smite ×2、Servant of Zuramat ×1、Undeath Sentence ×2、Holy Eggbearer ×2、
Dissolving Ooze ×1、Elder Word: Foresight ×2、Eternal Firebolt ×2、Haunt ×2、Kaldorei Priestess ×2、
The Egg of Khelos ×1、Gravedawn Sunbloom ×2、Nightmare Lord Xavius ×1、Shadow Word: Ruin ×1、
Slime 'em! ×2、Hold Them Off! ×1、Medivh's Triumph ×2、Endbringer Umbra ×1、Soothsayer ×2、N'Zoth, Dream's End ×1。

## 這副牌在做什麼

- 蛋（The Egg of Khelos）：0/3、死亡之聲再召喚下一階，五階之後孵出 20/20 嘲諷 Khelos。對手每打破一次就離大嘲諷更近一步，所以蛋本身是「不要碰」的誘餌。
- 清場：Medivh's Triumph（全場 4 點，控制傳說時只要 1 費）、Shadow Word: Ruin（殺攻擊力 5 以上的手下）、
  Slime 'em!（全場消滅，雙方各拿一張 3 費 Ectoplasm 把自己的手下叫回來）、Kaldorei Priestess（敵方手下 -2 攻擊）。
- 補牌與資源：Elder Word: Foresight（抽 1 減 2）、Gravedawn Sunbloom（抽 2）、Holy Eggbearer（抽 0 攻擊手下，多半抽到蛋）、
  Xavius（從牌庫發現並 +2/+2）。
- 後期：Soothsayer（6/6 嘲諷，死亡之聲回 6 血並召喚隨機 6 費手下）、N'Zoth（15 費，每個這局召喚過的死亡之聲手下 -1）、
  Umbra / Undeath Sentence（重播死亡之聲，等於再孵蛋）。

## zoo 該怎麼打它（使用者的判斷，2026-10-27）

- **不要理蛋**：打蛋只是幫它推進孵化，還送它一個 20/20 嘲諷。蛋 0 攻擊，不打它它就只是佔一格。
- **打臉、防 AOE**：Medivh's Triumph 與 Shadow Word: Ruin 都是清場。不要把全部手牌鋪成一排；一次維持 2–3 隻有價值的隨從，
  被清掉之後還能再鋪。對手的 AOE 是 5 費（有傳說在場時 1 費），所以 4 回合之後每次鋪場都要留餘量。
- 真正的目標是臉：蛋牧的回血只有 Soothsayer 的死亡之聲（6 點）與英雄能力（2 點），爆發要留在對手清場之後。
- Kaldorei Priestess 會讓 zoo 的小手下打不動；必要時先換掉它，但不要為了換它去碰蛋。
