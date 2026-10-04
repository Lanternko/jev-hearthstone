# 控制・後手：27場重播與留牌檢查

10勝17敗，37.0%；95% Wilson區間21.5%–55.8%。資料取自已分類161場中的控制後手象限，不含待判35場。此批包含人工、舊策略及中斷局，不是新版Jev專屬戰績。

已逐場讀取本機HDT replay的Power log；以下網址是DeckStats中對應GameId的既有ReplayUrl。網頁讀取工具無法載入，未宣稱已在網頁播放器完成觀看。#編號是196場全歷史序號，與runtime批次場號不同。全部27場均有完整原起手、保留回報、換牌後起手；後者不含硬幣／第一回合抽牌。

## 優先檢查

建議先看#66（全留慢牌／Soulfire射臉）、#22（雙蛋直到T6仍在手）、#64（T1硬幣雙Party→T2清場）、#15（T5七隻被清）、#97／#160（棄牌收益牌留而硬下）、#164（全換後的清場重建）。對照#45／#85／#188的勝局；#78／#136在第2回合結束，不作穿過控制套中後期的證明。

27場牌序顯示起手啟動、棄牌觸發、回血前傷害與清場後重建都值得分開檢查。17敗中11場有已公開AOE法術標記；其餘也可能有英雄／手下／持續效果處理場面。這是待裁定的共通機制，不是「應少鋪」或「留某張一定錯」的結論。

## 留牌數據

每個格子為勝／場（勝率），同名雙份按一場計。保留＝原始起手且伺服器確認留下；換後＝換牌完成的手牌；原發＝換牌前拿到。另列「原發但全換掉該卡」；這與保留組互斥，但由當時其他卡／決策選擇造成偏差，不能解讀為換牌的因果收益。

|卡牌|實際保留|換後起手有|原始發牌有|原發但該卡全換掉|
|---|---:|---:|---:|---:|
|Boneweb Egg|0/2（0.0%）|0/5（0.0%）|0/4（0.0%）|0/2（0.0%）|
|Chamber of Viscidus|0/1（0.0%）|0/2（0.0%）|0/1（0.0%）|—（0場）|
|Chronoclaws|0/2（0.0%）|1/4（25.0%）|6/11（54.5%）|6/9（66.7%）|
|Cursed Catacombs|5/6（83.3%）|6/9（66.7%）|5/6（83.3%）|—（0場）|
|Disposable Acolytes|5/10（50.0%）|6/13（46.2%）|5/11（45.5%）|0/1（0.0%）|
|Duke of Below|—（0場）|1/3（33.3%）|3/5（60.0%）|3/5（60.0%）|
|Entropic Continuity|1/4（25.0%）|2/7（28.6%）|3/11（27.3%）|2/7（28.6%）|
|Hand of Gul'dan|0/1（0.0%）|1/6（16.7%）|1/6（16.7%）|1/5（20.0%）|
|Ocular Occultist|2/7（28.6%）|3/9（33.3%）|2/7（28.6%）|—（0場）|
|Party Fiend|3/8（37.5%）|5/10（50.0%）|3/8（37.5%）|—（0場）|
|Platysaur|4/6（66.7%）|6/10（60.0%）|4/6（66.7%）|—（0場）|
|Silverware Golem|0/2（0.0%）|0/3（0.0%）|0/3（0.0%）|0/1（0.0%）|
|Soul Barrage|0/1（0.0%）|1/4（25.0%）|3/7（42.9%）|3/6（50.0%）|
|Soulfire|0/1（0.0%）|0/2（0.0%）|1/7（14.3%）|1/6（16.7%）|
|The Soularium|—（0場）|1/2（50.0%）|1/1（100.0%）|1/1（100.0%）|
|Walking Dead|0/5（0.0%）|2/9（22.2%）|1/7（14.3%）|1/2（50.0%）|
|Wicked Whispers|0/2（0.0%）|2/5（40.0%）|0/3（0.0%）|0/1（0.0%）|

Catacombs保留5/6、Platysaur4/6，觀察值較高；Walking Dead保留0/5、Golem0/2、Egg0/2值得查搭配與觸發速度。樣本仍小，而且每場可同時有多張牌；不能把列相加，不能直接改成必留／必換。所有指標的逐局GameId及95%區間在同目錄stats.json。

## 全部重播索引

|歷史序號|結果／職業|HDT重播|實際保留|檢查點|
|---|---|---|---|---|
|#5|敗／死亡騎士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Ocular Occultist|換掉行屍／魔像／武器，只留 Ocular；換入三張法術，T1沒有 PLAY，T2硬幣下 Ocular。檢查這是換牌後無可用一費，還是有可行的早期壓力打法；T4 Smothering Starfish、T6 Blood Boil 後的恢復另看。|
|#15|敗／死亡騎士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Platysaur、Ocular Occultist、Party Fiend、Entropic Continuity|四張全留。T1 Party、T2 Platysaur→Entropic、T3 Ocular；對手T5 Corpse Explosion 前我方七隻，對手回合結束歸零。檢查T4投入／抽牌與T5重新展開，不能只因被清場就判斷不該鋪。|
|#22|敗／戰士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Boneweb Egg、Boneweb Egg|保留兩張 Boneweb Egg；T6 Sanitize 前兩張原保留實體仍在手上。當時七隻場面被清空，手牌僅雙蛋＋Hand。檢查雙蛋起手是否缺少可靠觸發器，以及T5是否可保留可用續航。|
|#23|敗／術士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Wicked Whispers、Party Fiend、Soul Barrage、Ocular Occultist|四張全留；T1 Party→硬幣→Whispers，T2 Life Tap。T6 Abyssal Wave 前五隻，回合末剩一隻；下一個本方回合重新展開。檢查留 Soul Barrage 的作用及早期buff與後期資源。|
|#64|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Party Fiend|T1 Party→硬幣→第二張Party，六隻1/1；對手T2 Medivh’s Triumph 後歸零，T3 Holy Nova 再清蜘蛛。檢查硬幣價值、分批投入及抽牌／重建次序，這是最直接的早期AOE檢查案例。|
|#66|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Chronoclaws、Hand of Gul'dan、Soulfire、Walking Dead|原起手 Chronoclaws／Hand／Soulfire／Walking Dead 四張全留；T1 Soulfire 指向對手英雄，T2硬幣硬下Walking Dead、T3再硬下一隻。檢查留牌計畫和Soulfire棄牌結果；T8 Reno, Lone Ranger 前的攻擊／抽牌另看。|
|#69|敗／德魯伊|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Chronoclaws、Boneweb Egg、Entropic Continuity|保留 Chronoclaws＋Egg＋Entropic；T1硬幣下Egg、T3放Chamber並啟動。對手T6 Bob、T7 Spreading Plague、T8疊甲、T9 Eonar；檢查前期是否建立足夠傷害、後期抽牌與剩餘生命，不能簡化為AOE問題。|
|#74|敗／盜賊|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Entropic Continuity、Party Fiend|留 Entropic＋Party；T1硬幣雙Party。對手T7 Reno Jackson、T8 Reno, Lone Ranger；看回血前的攻擊目標、T6補牌與T7／T8公爵投入。|
|#97|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Walking Dead、Ocular Occultist、Silverware Golem|留 Walking Dead＋Ocular＋Golem；T1無PLAY，T2 Egg、T3 Ocular。對手T4／T5連續Medivh’s Triumph，T8 Slime ’em!。檢查兩張棄牌收益卡保留後能否準時觸發及兩次清場間的公爵投入。|
|#105|敗／戰士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Party Fiend、Disposable Acolytes|T1 Party→硬幣→Whispers；對手T3 Crowd Control 前五隻，回合末因亡語剩一隻；T6 Sanitize 再清。看T2是否有更好的資源配置及第一輪清場後的抽牌／魔像硬下。|
|#146|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Walking Dead、Cursed Catacombs|留 Disposable＋Walking Dead＋Catacombs；T1 Catacombs→Party，T2 Disposable，T3 Party→Disposable，T4 Chronoclaws。對手T4複製棄牌連動鋪場、T5 Intertwined Fate／Soul Barrage；檢查T3／T4解場或搶血選擇。|
|#151|敗／戰士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Chamber of Viscidus|只留 Chamber；T1硬幣下Egg、T2 Disposable、T3硬下Walking Dead、T4 Chronoclaws。T10 Brawl 前公爵25攻且滿場，手中僅Soul Barrage；看起手是否需要更早壓力，以及大公爵出手時機／是否錯過傷害。|
|#160|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Walking Dead、Silverware Golem|留 Disposable＋Walking Dead＋Golem；T1硬幣Disposable，T3／T4硬下Walking Dead／Golem；T7 Medivh’s Triumph 前已僅一隻蜘蛛。優先看T1–T4的棄牌觸發／速度，不把最後一次清場當作全部敗因。|
|#163|敗／薩滿|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Platysaur|留 Disposable＋Platysaur，換入Egg＋Catacombs；T1硬幣Disposable。對手T6 Reno Jackson、T8 Reno, Lone Ranger、T9再Reno，打到T17。看回血前傷害、T5 buff／武器順序及後期公爵，這是長局資源與反覆回血案例。|
|#164|敗／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|全換／無保留|原起手雙Duke＋Hand＋Entropic全部換掉，換後仍有Hand＋Entropic；T1硬幣Disposable。對手T5與T8 Medivh’s Triumph 均清空我方；檢查換入限制、T4公爵與T6／T7重建，不誤把換入Hand算成主動保留。|
|#166|敗／戰士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Ocular Occultist、Walking Dead|留 Ocular＋Walking Dead；T1 Party、T2 Entropic。對手T3 Aftershocks 清掉三隻，T7 Brawl 再處理滿場；手中尚有Hand／Chamber／硬幣。檢查補牌啟動、公爵與場面投入，而非一律少鋪。|
|#177|敗／薩滿|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Wicked Whispers、Disposable Acolytes|留 Whispers＋Disposable；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Chamber並啟動。對手T4 Elemental Destruction、T6 Devolve→Aftershocks；看AOE前保留觸發器、AOE後公爵重建及變形風險。|
|#16|勝／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes|勝局對照：只留 Disposable，換入 Soularium／Whispers。T1硬幣→Soularium，T2 Whispers，T3 Ocular；看抽牌／棄牌順序和第5回合前的壓力。|
|#26|勝／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Platysaur|勝局對照：只留 Platysaur；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Ocular。與同樣交硬幣buff卻落敗的#105／#177比較，不把單一開局手法直接判為錯誤。|
|#43|勝／法師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Cursed Catacombs|勝局對照：留 Disposable＋Catacombs；T1兩次Catacombs、Party、硬幣、Entropic，T2 Platysaur、T3 Ocular。對手有 Reckless Apprentice／Mordresh，AOE法術標記為零不代表沒有清場能力。|
|#45|勝／德魯伊|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Party Fiend、Disposable Acolytes|勝局對照：留 Party＋Disposable；T1 Platysaur→硬幣→Party，T2 Disposable、T3 Ocular，T4 Chamber與Whispers；查看如何在對手跳費期間形成壓力。|
|#78|勝／盜賊|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Platysaur|T1 Platysaur→硬幣→Whispers，第2回合結束勝利。短局，不能當作成功穿過控制套完整清場／回血流程的證據。|
|#85|勝／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Cursed Catacombs、Platysaur、Ocular Occultist、Cursed Catacombs|勝局對照：Catacombs兩張＋Platysaur＋Ocular全留。T1 Platysaur→硬幣→Whispers，T3 Ocular；對手有單解／Aman’Thul且打到第9回合，可用來對照續航，不只看早期爆發。|
|#103|勝／德魯伊|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Entropic Continuity、Party Fiend、Platysaur|勝局對照：留 Entropic＋Party＋Platysaur；換入Catacombs。T1 Party→硬幣→Entropic→Catacombs，T3 Soularium→Whispers；對手跳費／招募路線，檢查搶血期限。|
|#136|勝／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Party Fiend、Cursed Catacombs、Ocular Occultist|T1 Party＋Catacombs、硬幣＋Platysaur，第2回合結束勝利。與#78同屬短局，保留在原始27場統計，但不據此認定留牌能擊敗後續清場。|
|#182|勝／牧師|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Disposable Acolytes、Cursed Catacombs|胜局對照：留 Disposable＋Catacombs；T1 Catacombs→Party，交硬幣；T2 Whispers、T3硬下Walking Dead，T4 Golem＋Platysaur。硬下行屍也有勝局，不能單憑「硬下」判成錯。|
|#188|勝／術士|[開啟重播](https://hsreplay.net/uploads/upload/REDACTED/)|Cursed Catacombs、Cursed Catacombs|勝局對照：只留雙Catacombs；換入Disposable＋Hand，T1雙Catacombs→硬幣→Disposable、T2 Life Tap、T3 Ocular。換入Hand仍勝，起手相關性不代表單卡好壞的因果。|

## 逐局起手與牌序

以下為觀察紀錄，非最佳打法裁定或模型原始意圖。Tn表示各方第n回合；同一T先對手後我們。只列最外層PLAY／ATTACK；技能、地標啟動另標，触發產物不當成手動選擇。攻擊目標為已公開卡名／英雄。AOE後狀態取對手該回合結束，可能還包含其他法術、攻擊與亡語，不等同單卡立即造成的損失。

### #5 敗／死亡騎士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-08-28T15:18:02.8709492+08:00

- 原發：Walking Dead、Silverware Golem、Chronoclaws、Ocular Occultist
- 保留：Ocular Occultist
- 換後：Hand of Gul'dan、Soul Barrage、Soulfire、Ocular Occultist
- 檢查：換掉行屍／魔像／武器，只留 Ocular；換入三張法術，T1沒有 PLAY，T2硬幣下 Ocular。檢查這是換牌後無可用一費，還是有可行的早期壓力打法；T4 Smothering Starfish、T6 Blood Boil 後的恢復另看。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|—|0隻／6張|
|T2|Plated Beetle|The Coin；Ocular Occultist→Silverware Golem|2隻／4張|
|T3|Explodineer；Plated Beetle攻擊→Ocular Occultist|Platysaur；Soulfire→Explodineer；Silverware Golem攻擊→opponent hero；Ocular Occultist攻擊→opponent hero|3隻／3張|
|T4|Smothering Starfish|Ocular Occultist→Hand of Gul'dan；Party Fiend；Platysaur攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Ocular Occultist攻擊→opponent hero|7隻／4張|
|T5|Death Strike→Ocular Occultist；Smothering Starfish攻擊→Felbeast|Life Tap（技能）；Disposable Acolytes；Entropic Continuity；Silverware Golem攻擊→Smothering Starfish；Ocular Occultist攻擊→opponent hero；Platysaur攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|7隻／4張|
|T6|Blood Boil|Chronoclaws；Life Tap（技能）；Gul'dan攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Platysaur攻擊→opponent hero；Lowly Squire攻擊→opponent hero|4隻／4張|
|T7|Patchwerk|Gul'dan攻擊→Patchwerk；Life Tap（技能）；Platysaur；Disposable Acolytes；Boneweb Egg；Ocular Occultist攻擊→opponent hero|5隻／2張|
|T8|Kerrigan, Queen of Blades|Chronoclaws；Gul'dan攻擊→Hive Queen；Walking Dead；Boneweb Spider攻擊→Hive Queen；Boneweb Spider攻擊→Hive Queen|2隻／0張|
|T9|Lurker；Chillfallen Baron；Hematurge|Duke of Below；Life Tap（技能）；Chamber of Viscidus；Duke of Below攻擊→Lurker；Chamber of Viscidus（啟動）；Gul'dan攻擊→Hematurge；Walking Dead攻擊→Chillfallen Baron|3隻／4張|
|T10|Astalor Bloodsworn→Duke of Below；Death Strike→Duke of Below；Chillfallen Baron；Zergling|—|3隻／4張|

### #15 敗／死亡騎士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-14T19:55:48.3435182+08:00

- 原發：Platysaur、Ocular Occultist、Party Fiend、Entropic Continuity
- 保留：Platysaur、Ocular Occultist、Party Fiend、Entropic Continuity
- 換後：Platysaur、Entropic Continuity、Ocular Occultist、Party Fiend
- 檢查：四張全留。T1 Party、T2 Platysaur→Entropic、T3 Ocular；對手T5 Corpse Explosion 前我方七隻，對手回合結束歸零。檢查T4投入／抽牌與T5重新展開，不能只因被清場就判斷不該鋪。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Party Fiend|3隻／5張|
|T2|Mining Casualties|Platysaur；Entropic Continuity；Felbeast攻擊→opponent hero；Party Fiend攻擊→Silver Hand Recruit；Felbeast攻擊→Silver Hand Recruit|4隻／5張|
|T3|Toysnatching Geist；Wild Pyromancer；Frail Ghoul攻擊→Party Fiend；Frail Ghoul攻擊→Felbeast|Ocular Occultist→Boneweb Egg；Felbeast攻擊→Wild Pyromancer；Platysaur攻擊→Toysnatching Geist|4隻／4張|
|T4|—|The Soularium；Soulfire→opponent hero；Platysaur攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero|7隻／4張|
|T5|Corpse Explosion|Cursed Catacombs；Chronoclaws；Gul'dan攻擊→opponent hero；Life Tap（技能）|0隻／3張|
|T6|Hideous Husk|Gul'dan攻擊→Bloated Leech；Chamber of Viscidus；Chamber of Viscidus（啟動）；Cursed Catacombs；The Coin；Duke of Below；Duke of Below攻擊→Hideous Husk|2隻／3張|
|T7|The Headless Horseman；Morbid Swarm|Gul'dan攻擊→Bloated Leech；Life Tap（技能）；Party Fiend；Disposable Acolytes；Wicked Whispers；Walking Dead攻擊→opponent hero|6隻／0張|
|T8|Boneguard Commander|Wicked Whispers；Life Tap（技能）；Chamber of Viscidus（啟動）；Ocular Occultist→Hand of Gul'dan；Felbeast攻擊→Risen Footman；Party Fiend攻擊→Risen Footman；Felbeast攻擊→Risen Footman；Druid of the Reef攻擊→Risen Footman；Vicious Slitherspear攻擊→Boneguard Commander；Walking Dead攻擊→Boneguard Commander|5隻／2張|
|T9|Hideous Husk；Pulsing Pumpkins（技能）→Felbeast|Entropic Continuity；Chronoclaws；Life Tap（技能）|2隻／0張|

- 對手T5 Corpse Explosion：施放前我方7隻（Platysaur 2/1、Ocular Occultist 3/6、Boneweb Spider 2/1、Boneweb Spider 2/1、Shivering Sorceress 2/2、Space Pirate 2/1、Boneweb Spider 2/1）；當時手牌：Chamber of Viscidus、Duke of Below、Chronoclaws、The Coin；該對手回合末我方0隻。

### #16 勝／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-14T20:07:52.3434517+08:00

- 原發：Walking Dead、Disposable Acolytes、Chronoclaws、Soul Barrage
- 保留：Disposable Acolytes
- 換後：Soul Barrage、Wicked Whispers、Disposable Acolytes、The Soularium
- 檢查：勝局對照：只留 Disposable，換入 Soularium／Whispers。T1硬幣→Soularium，T2 Whispers，T3 Ocular；看抽牌／棄牌順序和第5回合前的壓力。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Reach Equilibrium|The Coin；The Soularium|2隻／4張|
|T2|Purifying Breath→Boneweb Spider|Wicked Whispers；Boneweb Spider攻擊→opponent hero|3隻／3張|
|T3|Ritual of Life；Power Word: Shield→Flight Master|Ocular Occultist→Walking Dead；Crowd Surfer攻擊→opponent hero；Tentacle of N'Zoth攻擊→opponent hero；Boneweb Spider攻擊→opponent hero|5隻／2張|
|T4|Flash Heal→opponent hero；Flight Master；Flight Master攻擊→Walking Dead|Wicked Whispers；Life Tap（技能）；Cursed Catacombs；Crowd Surfer攻擊→Flight Master；Gryphon攻擊→Flight Master；Walking Dead攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Tentacle of N'Zoth攻擊→opponent hero；Boneweb Spider攻擊→opponent hero|7隻／1張|
|T5|Holy Embrace→opponent hero；Mend→Gryphon；Power Word: Barrier→opponent hero|Soul Barrage|7隻／1張|

### #22 敗／戰士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-25T18:27:38.0780117+08:00

- 原發：Soul Barrage、Boneweb Egg、Entropic Continuity、Boneweb Egg
- 保留：Boneweb Egg、Boneweb Egg
- 換後：Boneweb Egg、Boneweb Egg、Disposable Acolytes、Platysaur
- 檢查：保留兩張 Boneweb Egg；T6 Sanitize 前兩張原保留實體仍在手上。當時七隻場面被清空，手牌僅雙蛋＋Hand。檢查雙蛋起手是否缺少可靠觸發器，以及T5是否可保留可用續航。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Enter the Lost City|Platysaur|1隻／6張|
|T2|Armor Up!（技能）|Disposable Acolytes；Platysaur攻擊→opponent hero|3隻／6張|
|T3|All You Can Eat|The Coin；Soul Barrage；Swamp Leech攻擊→opponent hero；Platysaur攻擊→opponent hero；X-21 Repairbot攻擊→opponent hero|3隻／5張|
|T4|Zephrys the Great；Wild Growth|Duke of Below；Swamp Leech攻擊→opponent hero；Duke of Below攻擊→Zephrys the Great；Platysaur攻擊→opponent hero；X-21 Repairbot攻擊→opponent hero|3隻／5張|
|T5|Quality Assurance；Sir Finley, Sea Guide；Sphere of Sapience；Shield Block|Party Fiend；Walking Dead；Entropic Continuity；Swamp Leech攻擊→Sir Finley, Sea Guide；Platysaur攻擊→opponent hero；X-21 Repairbot攻擊→opponent hero|7隻／3張|
|T6|Unleash the Crocolisks；Sanitize|Hand of Gul'dan；Cursed Catacombs|2隻／5張|
|T7|Deepminer Brann；Armor Up!（技能）|Platysaur；Boneweb Egg；Boneweb Egg；The Soularium；Cursed Catacombs；Disguised Detective攻擊→Deepminer Brann；Skeletal Sidekick攻擊→opponent hero|6隻／4張|
|T8|Mankrik；For Glory!；Bob the Bartender|—|未到本方回合末|

- 對手T6 Sanitize：施放前我方7隻（Party Fiend 2/2、Walking Dead 3/6、Platysaur 2/3、Swamp Leech 3/1、X-21 Repairbot 2/4、Felbeast 2/2、Felbeast 2/2）；當時手牌：Boneweb Egg、Boneweb Egg、Hand of Gul'dan；該對手回合末我方0隻。

### #23 敗／術士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-25T18:49:32.8316099+08:00

- 原發：Wicked Whispers、Party Fiend、Soul Barrage、Ocular Occultist
- 保留：Wicked Whispers、Party Fiend、Soul Barrage、Ocular Occultist
- 換後：Party Fiend、Soul Barrage、Ocular Occultist、Wicked Whispers
- 檢查：四張全留；T1 Party→硬幣→Whispers，T2 Life Tap。T6 Abyssal Wave 前五隻，回合末剩一隻；下一個本方回合重新展開。檢查留 Soul Barrage 的作用及早期buff與後期資源。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Party Fiend；The Coin；Wicked Whispers|3隻／2張|
|T2|Gnomeferatu|Life Tap（技能）；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|3隻／4張|
|T3|Gnomeferatu攻擊→Party Fiend；Dragged Below→Felbeast|Ocular Occultist→Silverware Golem；Felbeast攻擊→Gnomeferatu|2隻／4張|
|T4|Mo'arg Drillfist|Chamber of Viscidus；Chamber of Viscidus（啟動）；Nemesis Gul'dan攻擊→Mo'arg Drillfist；Ocular Occultist攻擊→Mo'arg Drillfist|4隻／4張|
|T5|Runed Mithril Rod|Ocular Occultist→Soul Barrage；Life Tap（技能）；Ocular Occultist攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Nemesis Gul'dan攻擊→opponent hero；Mistake攻擊→opponent hero；Spiderling攻擊→opponent hero|5隻／4張|
|T6|Abyssal Wave|Chamber of Viscidus（啟動）；Duke of Below；Platysaur；Cursed Catacombs；Platysaur；Cursed Catacombs；Ocular Occultist攻擊→opponent hero|4隻／10張|
|T7|Life Tap（技能）；Pouch of Coins；Siphon Soul→Duke of Below|Duke of Below；Soulfire→opponent hero；Party Fiend；Ocular Occultist攻擊→opponent hero；Platysaur攻擊→opponent hero；Platysaur攻擊→opponent hero|7隻／6張|
|T8|The Coin；Gigafin；Youthful Brewmaster→Gigafin|Chronoclaws；Disposable Acolytes；Boneweb Egg；Nemesis Gul'dan攻擊→Gigafin's Maw|3隻／3張|
|T9|Gnomeferatu；Celestial Projectionist→Gnomeferatu；Gnomeferatu；Gigafin's Maw攻擊→own hero；Sira'kess Cultist；Life Tap（技能）|—|3隻／4張|

- 對手T6 Abyssal Wave：施放前我方5隻（Ocular Occultist 3/6、Ocular Occultist 3/2、Silverware Golem 3/4、Mistake 1/3、Spiderling 1/2）；當時手牌：Soul Barrage、Duke of Below、Hand of Gul'dan、Chronoclaws；該對手回合末我方1隻。

### #26 勝／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-29T02:22:22.5078822+08:00

- 原發：Entropic Continuity、Platysaur、Chronoclaws、The Soularium
- 保留：Platysaur
- 換後：Chronoclaws、Duke of Below、Platysaur、Walking Dead
- 檢查：勝局對照：只留 Platysaur；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Ocular。與同樣交硬幣buff卻落敗的#105／#177比較，不把單一開局手法直接判為錯誤。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Illuminate|Platysaur；The Coin；Wicked Whispers|2隻／3張|
|T2|Entropic Continuity|Life Tap（技能）；Walking Dead攻擊→opponent hero；Platysaur攻擊→opponent hero|2隻／5張|
|T3|Lesser Heal（技能）→opponent hero|Ocular Occultist→Soul Barrage；Walking Dead攻擊→opponent hero；Platysaur攻擊→opponent hero|3隻／4張|
|T4|Nightmare Lord Xavius|Duke of Below；Duke of Below攻擊→Nightmare Lord Xavius；Walking Dead攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Platysaur攻擊→opponent hero|4隻／4張|
|T5|Soul Barrage|Platysaur；Chronoclaws；Gul'dan攻擊→opponent hero；Walking Dead攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Platysaur攻擊→opponent hero|4隻／6張|
|T6|Sir Finley, Sea Guide；Chamber of Viscidus；Chamber of Viscidus（啟動）|—|未到本方回合末|

### #43 勝／法師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-29T22:50:10.2210416+08:00

- 原發：Disposable Acolytes、Cursed Catacombs、Chronoclaws、Duke of Below
- 保留：Disposable Acolytes、Cursed Catacombs
- 換後：Entropic Continuity、Cursed Catacombs、Disposable Acolytes、Cursed Catacombs
- 檢查：勝局對照：留 Disposable＋Catacombs；T1兩次Catacombs、Party、硬幣、Entropic，T2 Platysaur、T3 Ocular。對手有 Reckless Apprentice／Mordresh，AOE法術標記為零不代表沒有清場能力。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Wildfire|Cursed Catacombs；Party Fiend；Cursed Catacombs；The Coin；Entropic Continuity|3隻／5張|
|T2|Far Watch Post|Platysaur；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|4隻／6張|
|T3|Fireblast（技能）→Party Fiend|Ocular Occultist→Soul Barrage；Felbeast攻擊→opponent hero；Felbeast攻擊→opponent hero；Platysaur攻擊→opponent hero|4隻／5張|
|T4|Reckless Apprentice|The Soularium；Disposable Acolytes；Ocular Occultist攻擊→Reckless Apprentice|4隻／6張|
|T5|Peasant；Wand Thief；Fireblast（技能）→Ocular Occultist；Tour Guide|Boneweb Egg；Silverware Golem；Catch of the Day攻擊→Wand Thief；Walking Dead攻擊→Tour Guide；Lingering Zombie攻擊→Peasant|5隻／5張|
|T6|Fireblast（技能）→Catch of the Day|Life Tap（技能）；Ocular Occultist→Walking Dead；Silverware Golem攻擊→opponent hero；Walking Dead攻擊→opponent hero；Disarmed Zombie攻擊→opponent hero；Party Fiend|7隻／4張|
|T7|Taelan Fordring；Beaming Sidekick→Taelan Fordring|Life Tap（技能）；Walking Dead攻擊→Taelan Fordring；Silverware Golem攻擊→Taelan Fordring；Ocular Occultist攻擊→Taelan Fordring；Walking Dead攻擊→Beaming Sidekick；Disarmed Zombie攻擊→opponent hero；Party Fiend攻擊→opponent hero；Chronoclaws；Gul'dan攻擊→opponent hero|7隻／4張|
|T8|Mordresh Fire Eye|Boneweb Spider攻擊→opponent hero|3隻／5張|

### #45 勝／德魯伊

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-29T23:02:40.6126797+08:00

- 原發：Party Fiend、Soulfire、Chronoclaws、Disposable Acolytes
- 保留：Party Fiend、Disposable Acolytes
- 換後：Party Fiend、Disposable Acolytes、Platysaur、Ocular Occultist
- 檢查：勝局對照：留 Party＋Disposable；T1 Platysaur→硬幣→Party，T2 Disposable、T3 Ocular，T4 Chamber與Whispers；查看如何在對手跳費期間形成壓力。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Waveshaping|Platysaur；The Coin；Party Fiend|4隻／4張|
|T2|Explosive Sheep|Disposable Acolytes；Platysaur攻擊→Explosive Sheep|2隻／3張|
|T3|Invigorate|Ocular Occultist→Disposable Acolytes；Soulbound Ashtongue攻擊→opponent hero；Walking Dead攻擊→opponent hero|5隻／2張|
|T4|Shapeshift（技能）|Chamber of Viscidus；Wicked Whispers；Chamber of Viscidus（啟動）；Ocular Occultist攻擊→opponent hero；Walking Dead攻擊→opponent hero；Voodoo Doctor攻擊→opponent hero；Possessed Villager攻擊→opponent hero；Soulbound Ashtongue攻擊→opponent hero|5隻／4張|
|T5|Frost Lotus Seedling；Smothering Starfish|—|5隻／5張|

### #64 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-30T02:00:51.3633659+08:00

- 原發：Disposable Acolytes、Soulfire、Party Fiend、Chronoclaws
- 保留：Party Fiend
- 換後：Ocular Occultist、Hand of Gul'dan、Party Fiend、Ocular Occultist
- 檢查：T1 Party→硬幣→第二張Party，六隻1/1；對手T2 Medivh’s Triumph 後歸零，T3 Holy Nova 再清蜘蛛。檢查硬幣價值、分批投入及抽牌／重建次序，這是最直接的早期AOE檢查案例。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Seek Guidance|Party Fiend；The Coin；Party Fiend|6隻／3張|
|T2|Medivh's Triumph|The Soularium；Cursed Catacombs|2隻／3張|
|T3|Holy Nova|Ocular Occultist→Hand of Gul'dan|1隻／5張|
|T4|Brann Bronzebeard|Ocular Occultist→Soul Barrage；Entropic Continuity；Ocular Occultist攻擊→Brann Bronzebeard|2隻／3張|
|T5|Benevolent Banker；Lunarwing Messenger|Disposable Acolytes；Walking Dead；Ocular Occultist攻擊→Benevolent Banker；Ocular Occultist攻擊→Lunarwing Messenger|5隻／3張|
|T6|Medivh's Triumph；Blessing of the Moon（技能）；False Disciple|Life Tap（技能）；Duke of Below；Cursed Catacombs；Duke of Below攻擊→False Disciple；Walking Dead攻擊→opponent hero|3隻／3張|
|T7|Najak Hexxen→Duke of Below；Duke of Below攻擊→Walking Dead；Mixologist|Chronoclaws；Radiance of Azshara；Gul'dan攻擊→Mixologist；Walking Dead攻擊→opponent hero|2隻／4張|
|T8|Blessing of the Moon（技能）；Purifying Breath→Radiance of Azshara；Resurrect；Sands of Time|Chronoclaws；Soulfire→Lunarwing Messenger；Life Tap（技能）；Entropic Continuity；Gul'dan攻擊→Najak Hexxen；Walking Dead攻擊→opponent hero|4隻／1張|
|T9|Holy Nova；Mixologist's Special；Malted Magma；Malted Magma|Life Tap（技能）；Chamber of Viscidus；Platysaur；Wicked Whispers；Gul'dan攻擊→Lunarwing Messenger|2隻／0張|
|T10|Ysera, Emerald Aspect；Blessing of the Moon（技能）；Eternal Firebolt→Platysaur|Chamber of Viscidus（啟動）|3隻／1張|
|T11|Malted Magma；Ysera, Emerald Aspect攻擊→own hero|—|未到本方回合末|

- 對手T2 Medivh's Triumph：施放前我方6隻（Party Fiend 1/1、Party Fiend 1/1、Felbeast 1/1、Felbeast 1/1、Felbeast 1/1、Felbeast 1/1）；當時手牌：Ocular Occultist、Hand of Gul'dan、Ocular Occultist；該對手回合末我方0隻。

- 對手T3 Holy Nova：施放前我方2隻（Boneweb Spider 2/1、Boneweb Spider 2/1）；當時手牌：Ocular Occultist、Hand of Gul'dan、Ocular Occultist；該對手回合末我方0隻。

- 對手T6 Medivh's Triumph：施放前我方5隻（Ocular Occultist 4/3、Walking Dead 2/5、Ocular Occultist 4/4、Spirit of the Dead 0/3、Tortotem 0/3）；當時手牌：Chronoclaws、Hand of Gul'dan、Radiance of Azshara；該對手回合末我方1隻。

- 對手T9 Holy Nova：施放前我方4隻（Walking Dead 3/6、Dozing Kelpkeeper 4/4、Tour Guide 2/2、Silverware Golem 3/4）；當時手牌：Wicked Whispers；該對手回合末我方1隻。

- 對手T9 Malted Magma：施放前我方2隻（Walking Dead 3/2、Dozing Kelpkeeper 4/4）；當時手牌：Wicked Whispers；該對手回合末我方1隻。

- 對手T9 Malted Magma：施放前我方2隻（Walking Dead 3/1、Dozing Kelpkeeper 4/4）；當時手牌：Wicked Whispers；該對手回合末我方1隻。

- 對手T11 Malted Magma：施放前我方3隻（Dozing Kelpkeeper 4/4、Boneweb Spider 2/1、Boneweb Spider 2/1）；當時手牌：Platysaur；該對手回合末我方1隻。

### #66 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-30T02:13:52.0025847+08:00

- 原發：Chronoclaws、Hand of Gul'dan、Soulfire、Walking Dead
- 保留：Chronoclaws、Hand of Gul'dan、Soulfire、Walking Dead
- 換後：Chronoclaws、Soulfire、Hand of Gul'dan、Walking Dead
- 檢查：原起手 Chronoclaws／Hand／Soulfire／Walking Dead 四張全留；T1 Soulfire 指向對手英雄，T2硬幣硬下Walking Dead、T3再硬下一隻。檢查留牌計畫和Soulfire棄牌結果；T8 Reno, Lone Ranger 前的攻擊／抽牌另看。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Seek Guidance|Soulfire→opponent hero|0隻／4張|
|T2|Zephrys the Great|The Coin；Walking Dead|1隻／3張|
|T3|Animal Companion；Huffer攻擊→Walking Dead；Zephrys the Great攻擊→Walking Dead|Walking Dead|1隻／3張|
|T4|—|Cursed Catacombs；Life Tap（技能）；Entropic Continuity；Entropic Continuity；Walking Dead攻擊→opponent hero|1隻／2張|
|T5|Prince Renathal；Lesser Heal（技能）→opponent hero；Hold Them Off!→Prince Renathal|Life Tap（技能）；Party Fiend；Wicked Whispers；Wicked Whispers；Walking Dead攻擊→opponent hero|5隻／2張|
|T6|Prince Renathal攻擊→Walking Dead；Lesser Heal（技能）→opponent hero|Life Tap（技能）；Ocular Occultist→Hand of Gul'dan；Cursed Catacombs；Felbeast攻擊→Prince Renathal；Walking Dead攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|5隻／5張|
|T7|Shattered Reflections→Walking Dead；Lesser Heal（技能）→opponent hero|Life Tap（技能）；Felbeast攻擊→Walking Dead；Walking Dead攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Party Fiend攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Platysaur；Chamber of Viscidus；Chamber of Viscidus（啟動）|6隻／7張|
|T8|Reno, Lone Ranger|The Soularium；Ocular Occultist→Boneweb Egg；Party Fiend；Disposable Acolytes|6隻／4張|
|T9|Arcane Bullet（技能）→Boneweb Spider；Bloodmage Thalnos；Behemoth Mask→Bloodmage Thalnos|Chamber of Viscidus（啟動）|4隻／3張|

### #69 敗／德魯伊

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-30T02:40:16.7687401+08:00

- 原發：Chronoclaws、Boneweb Egg、Entropic Continuity、Soul Barrage
- 保留：Chronoclaws、Boneweb Egg、Entropic Continuity
- 換後：Chronoclaws、Entropic Continuity、Boneweb Egg、Silverware Golem
- 檢查：保留 Chronoclaws＋Egg＋Entropic；T1硬幣下Egg、T3放Chamber並啟動。對手T6 Bob、T7 Spreading Plague、T8疊甲、T9 Eonar；檢查前期是否建立足夠傷害、後期抽牌與剩餘生命，不能簡化為AOE問題。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|The Coin；Boneweb Egg|1隻／4張|
|T2|Aquatic Form；Invigorate|Platysaur；Entropic Continuity；Boneweb Egg攻擊→opponent hero|2隻／4張|
|T3|Shapeshift（技能）；Orgrimmar Faelin攻擊→own hero|Chamber of Viscidus；Chamber of Viscidus（啟動）；Platysaur攻擊→opponent hero；Boneweb Egg攻擊→opponent hero|2隻／5張|
|T4|Naturalize→Platysaur；Shapeshift（技能）；Orgrimmar Faelin攻擊→own hero|Cursed Catacombs；Duke of Below；Boneweb Egg攻擊→opponent hero|4隻／6張|
|T5|Dew Process；Shapeshift（技能）；Orgrimmar Faelin攻擊→own hero|Chamber of Viscidus（啟動）；Chronoclaws；Nemesis Gul'dan攻擊→opponent hero；Duke of Below攻擊→opponent hero；Fiendish Servant攻擊→opponent hero；Sanguine Soldier攻擊→opponent hero；Boneweb Egg攻擊→opponent hero；Wicked Whispers|6隻／8張|
|T6|Bob the Bartender|Ocular Occultist→Soul Barrage；Soulfire→Bob the Bartender；Life Tap（技能）；Cursed Catacombs；Nemesis Gul'dan攻擊→opponent hero|7隻／9張|
|T7|Sleep Under the Stars；Spreading Plague|Entropic Continuity；Life Tap（技能）；Nemesis Gul'dan攻擊→Scarab Beetle；Duke of Below攻擊→Scarab Beetle；Fiendish Servant攻擊→Scarab Beetle；Boneweb Spider攻擊→Scarab Beetle；Boneweb Spider攻擊→Scarab Beetle；Ocular Occultist攻擊→Scarab Beetle；Boneweb Egg攻擊→Scarab Beetle；Sanguine Soldier攻擊→Scarab Beetle|7隻／8張|
|T8|Waveshaping；Solar Eclipse；Branching Paths；Shapeshift（技能）|Duke of Below攻擊→Scarab Beetle；Boneweb Egg攻擊→Scarab Beetle；Fiendish Servant攻擊→Scarab Beetle；Sanguine Soldier攻擊→Scarab Beetle；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Ocular Occultist攻擊→opponent hero|7隻／8張|
|T9|Eonar, the Life-Binder；Eonar, the Life-Binder；Naturalize→Duke of Below|—|未到本方回合末|

### #74 敗／盜賊

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-30T03:12:51.9543949+08:00

- 原發：Entropic Continuity、Party Fiend、Hand of Gul'dan、Soulfire
- 保留：Entropic Continuity、Party Fiend
- 換後：Entropic Continuity、Party Fiend、Boneweb Egg、Soul Barrage
- 檢查：留 Entropic＋Party；T1硬幣雙Party。對手T7 Reno Jackson、T8 Reno, Lone Ranger；看回血前的攻擊目標、T6補牌與T7／T8公爵投入。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Pharaoh Cat|Party Fiend；The Coin；Party Fiend|6隻／3張|
|T2|Maestra, Mask Merchant；Pharaoh Cat攻擊→Felbeast|Cursed Catacombs；Life Tap（技能）；Felbeast攻擊→Maestra, Mask Merchant；Felbeast攻擊→Maestra, Mask Merchant；Party Fiend攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|5隻／4張|
|T3|Dirty Rat；Pharaoh Cat攻擊→Boneweb Spider|Ocular Occultist→Soul Barrage；Felbeast攻擊→Dirty Rat；Boneweb Spider攻擊→Dirty Rat；Party Fiend攻擊→opponent hero；Party Fiend攻擊→opponent hero|4隻／2張|
|T4|E.T.C., Band Manager|Disposable Acolytes；Life Tap（技能）；Cursed Catacombs；Ocular Occultist攻擊→E.T.C., Band Manager；Party Fiend攻擊→E.T.C., Band Manager；Party Fiend攻擊→opponent hero|5隻／2張|
|T5|Malignant Horror|Life Tap（技能）；Ocular Occultist→Disposable Acolytes；Ocular Occultist攻擊→opponent hero；Selfless Hero攻擊→opponent hero；Party Fiend攻擊→opponent hero；Jade Swarmer攻擊→opponent hero|7隻／2張|
|T6|Double Agent；Malignant Horror攻擊→Ocular Occultist；Malignant Horror攻擊→Ocular Occultist；Dagger Mastery（技能）|Life Tap（技能）；The Soularium；Ocular Occultist攻擊→Double Agent；Selfless Hero攻擊→opponent hero；Party Fiend攻擊→opponent hero；Jade Swarmer攻擊→opponent hero；Platysaur；Entropic Continuity；Boneweb Egg攻擊→Malignant Horror|7隻／5張|
|T7|Malignant Horror攻擊→Ocular Occultist；Malignant Horror攻擊→Party Fiend；Double Agent攻擊→Platysaur；Reno Jackson；Swashburglar|Duke of Below；Life Tap（技能）；Duke of Below攻擊→Reno Jackson；Jade Swarmer攻擊→Swashburglar；Selfless Hero攻擊→opponent hero；Boneweb Egg攻擊→opponent hero；Wicked Whispers|5隻／3張|
|T8|Reno, Lone Ranger；Malignant Horror攻擊→own hero；Malignant Horror攻擊→own hero；Double Agent攻擊→own hero；Reno, Lone Ranger攻擊→own hero|Duke of Below；Duke of Below攻擊→Double Agent；Wicked Whispers；Life Tap（技能）|2隻／2張|
|T9|Malignant Horror攻擊→own hero；Malignant Horror攻擊→own hero|—|未到本方回合末|

### #78 勝／盜賊

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-09-30T16:56:55.4767646+08:00

- 原發：Disposable Acolytes、Entropic Continuity、Platysaur、Soul Barrage
- 保留：Disposable Acolytes、Platysaur
- 換後：Disposable Acolytes、Wicked Whispers、Party Fiend、Platysaur
- 檢查：T1 Platysaur→硬幣→Whispers，第2回合結束勝利。短局，不能當作成功穿過控制套完整清場／回血流程的證據。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Platysaur；The Coin；Wicked Whispers|1隻／3張|
|T2|Dagger Mastery（技能）|—|未到本方回合末|

### #85 勝／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T03:03:54.2960396+08:00

- 原發：Cursed Catacombs、Platysaur、Ocular Occultist、Cursed Catacombs
- 保留：Cursed Catacombs、Platysaur、Ocular Occultist、Cursed Catacombs
- 換後：Platysaur、Ocular Occultist、Cursed Catacombs、Cursed Catacombs
- 檢查：勝局對照：Catacombs兩張＋Platysaur＋Ocular全留。T1 Platysaur→硬幣→Whispers，T3 Ocular；對手有單解／Aman’Thul且打到第9回合，可用來對照續航，不只看早期爆發。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Psychic Conjurer|Platysaur；The Coin；Wicked Whispers；Cursed Catacombs|1隻／2張|
|T2|Penance→Platysaur|Life Tap（技能）|0隻／3張|
|T3|Thoughtsteal；Party Fiend|Ocular Occultist→Walking Dead|2隻／2張|
|T4|Felbeast攻擊→Walking Dead；Party Fiend攻擊→Walking Dead；Eternal Firebolt→Walking Dead；Mind Vision|Party Fiend；Soulfire→Felbeast；Ocular Occultist攻擊→opponent hero；Life Tap（技能）|6隻／1張|
|T5|Eternal Firebolt→Aldor Attendant；Soulfire→Swamp Leech|Ocular Occultist攻擊→opponent hero；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|4隻／2張|
|T6|Convincing Infiltrator|Ocular Occultist→Hand of Gul'dan；Ocular Occultist攻擊→Convincing Infiltrator；Felbeast攻擊→Convincing Infiltrator；Felbeast攻擊→Convincing Infiltrator；Party Fiend攻擊→Convincing Infiltrator；Boneweb Egg；Platysaur|3隻／3張|
|T7|Eternal Firebolt→Platysaur；Pendant of Earth|Duke of Below；Ocular Occultist攻擊→opponent hero；Life Tap（技能）|3隻／3張|
|T8|Aman'Thul；Aman'Thul|Duke of Below；Duke of Below攻擊→Aman'Thul；Ocular Occultist攻擊→opponent hero；Chronoclaws；Gul'dan攻擊→opponent hero|2隻／4張|
|T9|Hidden Gem；Chromie, Timehopper|Party Fiend；Disposable Acolytes；Entropic Continuity；Gul'dan攻擊→Chromie, Timehopper；Duke of Below攻擊→opponent hero；Ocular Occultist攻擊→opponent hero|7隻／1張|

### #97 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T04:33:54.296156+08:00

- 原發：Walking Dead、Ocular Occultist、Silverware Golem、Soul Barrage
- 保留：Walking Dead、Ocular Occultist、Silverware Golem
- 換後：Silverware Golem、Ocular Occultist、Walking Dead、Duke of Below
- 檢查：留 Walking Dead＋Ocular＋Golem；T1無PLAY，T2 Egg、T3 Ocular。對手T4／T5連續Medivh’s Triumph，T8 Slime ’em!。檢查兩張棄牌收益卡保留後能否準時觸發及兩次清場間的公爵投入。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Reach Equilibrium；Illuminate|—|0隻／6張|
|T2|Illuminate|Boneweb Egg|1隻／6張|
|T3|Love Everlasting|Ocular Occultist→Disposable Acolytes|4隻／5張|
|T4|Medivh's Triumph|Duke of Below；Ocular Occultist攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；The Coin；Finicky Cloakfield→Ocular Occultist|4隻／4張|
|T5|Renew→opponent hero；Grave Digging；Medivh's Triumph|Ocular Occultist→Walking Dead；Life Tap（技能）|2隻／4張|
|T6|Thrive in the Shadows；Gravedawn Sunbloom；Shadow Visions；Gravedawn Sunbloom|Wicked Whispers；Chronoclaws；Gul'dan攻擊→opponent hero；Entropic Continuity；Ocular Occultist攻擊→opponent hero；Walking Dead攻擊→opponent hero|3隻／3張|
|T7|Palm Reading；Sol'etos, Cycle's Rebirth；Undying Allies；Priestess Valishj；Power Chord: Synchronize→Sol'etos, Cycle's Rebirth|Party Fiend；Wicked Whispers；Gul'dan攻擊→Sol'etos, Cycle's Rebirth；Ocular Occultist攻擊→Sol'etos, Cycle's Rebirth；Silverware Golem攻擊→Sol'etos, Cycle's Rebirth；Walking Dead攻擊→Sol'etos, Cycle's Rebirth；Life Tap（技能）|4隻／1張|
|T8|Palm Reading；Gift of the Naaru；Sol'etos, Cycle's Rebirth；Slime 'em!|—|未到本方回合末|

- 對手T4 Medivh's Triumph：施放前我方4隻（Ocular Occultist 3/6、Boneweb Egg 0/2、Clockwork Gnome 2/1、Worgen Infiltrator 2/1）；當時手牌：Silverware Golem、Walking Dead、Duke of Below、Chronoclaws、The Coin；該對手回合末我方3隻。

- 對手T5 Medivh's Triumph：施放前我方4隻（Ocular Occultist 3/2、Duke of Below 4/4、Boneweb Spider 2/1、Boneweb Spider 2/1）；當時手牌：Silverware Golem、Walking Dead、Chronoclaws、Hand of Gul'dan；該對手回合末我方0隻。

- 對手T8 Slime 'em!：施放前我方4隻（Ocular Occultist 6/4、Party Fiend 2/2、Felbeast 2/2、Walking Dead 3/6）；當時手牌：The Soularium；該對手回合末我方0隻。

### #103 勝／德魯伊

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T05:26:14.9210363+08:00

- 原發：Entropic Continuity、Party Fiend、Duke of Below、Platysaur
- 保留：Entropic Continuity、Party Fiend、Platysaur
- 換後：Entropic Continuity、Cursed Catacombs、Platysaur、Party Fiend
- 檢查：勝局對照：留 Entropic＋Party＋Platysaur；換入Catacombs。T1 Party→硬幣→Entropic→Catacombs，T3 Soularium→Whispers；對手跳費／招募路線，檢查搶血期限。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Waveshaping|Party Fiend；The Coin；Entropic Continuity；Cursed Catacombs|5隻／2張|
|T2|Invigorate|Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Party Fiend|7隻／2張|
|T3|Invigorate；Shapeshift（技能）；Emerald Leyara攻擊→Party Fiend|Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Felbeast攻擊→opponent hero；The Soularium；Wicked Whispers|6隻／2張|
|T4|Biology Project；Frost Lotus Blossom；Pendant of Earth|Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Felbeast攻擊→opponent hero；Chronoclaws；Gul'dan攻擊→opponent hero；Platysaur|7隻／1張|
|T5|Lady Anacondra；Naturalize→Boneweb Spider；Reforestation；Wrath→Boneweb Spider|—|未到本方回合末|

### #105 敗／戰士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T05:38:12.8657735+08:00

- 原發：Party Fiend、Boneweb Egg、Soulfire、Disposable Acolytes
- 保留：Party Fiend、Disposable Acolytes
- 換後：Wicked Whispers、Walking Dead、Party Fiend、Disposable Acolytes
- 檢查：T1 Party→硬幣→Whispers；對手T3 Crowd Control 前五隻，回合末因亡語剩一隻；T6 Sanitize 再清。看T2是否有更好的資源配置及第一輪清場後的抽牌／魔像硬下。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Sphere of Sapience|Party Fiend；The Coin；Wicked Whispers|5隻／2張|
|T2|Drywhisker Armorer|Bladed Cultist攻擊→Drywhisker Armorer；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Twilight Egg攻擊→opponent hero|5隻／3張|
|T3|Crowd Control|The Soularium；Accelerated Whelp攻擊→opponent hero；Soulfire→opponent hero|2隻／2張|
|T4|Armor Up!（技能）|Silverware Golem；Accelerated Whelp攻擊→opponent hero；Walking Dead攻擊→opponent hero|3隻／2張|
|T5|From the Depths；Armor Up!（技能）|Party Fiend；Accelerated Whelp攻擊→opponent hero；Silverware Golem攻擊→opponent hero；Walking Dead攻擊→opponent hero；Boneweb Egg；Life Tap（技能）|7隻／2張|
|T6|Unleash the Crocolisks；Sanitize；Armor Up!（技能）|Duke of Below；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Egg|4隻／1張|
|T7|Deepminer Brann|Soul Barrage；Walking Dead；Duke of Below攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero|5隻／0張|
|T8|Reno, Lone Ranger|Hand of Gul'dan；Life Tap（技能）|0隻／4張|
|T9|Dirty Rat；Theotar, the Mad Duke|Entropic Continuity；Entropic Continuity；Ocular Occultist攻擊→Dirty Rat；Chronoclaws|1隻／1張|
|T10|Bob the Bartender；Shadow Bullet（技能）→Ocular Occultist；Theotar, the Mad Duke攻擊→Ocular Occultist；Dirty Rat攻擊→own hero|Gul'dan攻擊→Dirty Rat；Chamber of Viscidus；Chamber of Viscidus（啟動）；Cursed Catacombs；Duke of Below；Duke of Below攻擊→Bob the Bartender|1隻／1張|
|T11|Frost Bullet（技能）→own hero；Bearshark攻擊→own hero；Lord Barov；Stoneskin Armorer；Lord Barov|Gul'dan攻擊→opponent hero；Duke of Below攻擊→opponent hero|3隻／1張|
|T12|Boomboss Tho'grun；Nature Bullet（技能）→own hero|—|未到本方回合末|

- 對手T3 Crowd Control：施放前我方5隻（Party Fiend 2/2、Felbeast 2/2、Felbeast 2/2、Twilight Egg 1/3、Bladed Cultist 2/1）；當時手牌：Walking Dead、Silverware Golem、The Soularium；該對手回合末我方1隻。

- 對手T6 Sanitize：施放前我方7隻（Boneweb Egg 0/2、Silverware Golem 3/4、Party Fiend 1/1、Accelerated Whelp 3/2、Walking Dead 2/5、Felbeast 1/1、Felbeast 1/1）；當時手牌：Boneweb Egg、Duke of Below；該對手回合末我方2隻。

### #136 勝／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T16:48:03.3310053+08:00

- 原發：Party Fiend、Cursed Catacombs、Ocular Occultist、Chronoclaws
- 保留：Party Fiend、Cursed Catacombs、Ocular Occultist
- 換後：Party Fiend、Ocular Occultist、Cursed Catacombs、Platysaur
- 檢查：T1 Party＋Catacombs、硬幣＋Platysaur，第2回合結束勝利。與#78同屬短局，保留在原始27場統計，但不據此認定留牌能擊敗後續清場。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Cursed Catacombs|Party Fiend；Cursed Catacombs；The Coin；Platysaur|6隻／3張|
|T2|—|—|未到本方回合末|

### #146 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T17:51:49.7668898+08:00

- 原發：Hand of Gul'dan、Disposable Acolytes、Walking Dead、Cursed Catacombs
- 保留：Disposable Acolytes、Walking Dead、Cursed Catacombs
- 換後：Disposable Acolytes、Cursed Catacombs、Chronoclaws、Walking Dead
- 檢查：留 Disposable＋Walking Dead＋Catacombs；T1 Catacombs→Party，T2 Disposable，T3 Party→Disposable，T4 Chronoclaws。對手T4複製棄牌連動鋪場、T5 Intertwined Fate／Soul Barrage；檢查T3／T4解場或搶血選擇。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Sphere of Sapience；Illuminate|Cursed Catacombs；Party Fiend|3隻／5張|
|T2|Mysterious Visitor|Disposable Acolytes；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|5隻／5張|
|T3|Entropic Continuity；Identity Theft；Mysterious Visitor攻擊→Bloodsail Deckhand|Party Fiend；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Crystalsmith Cultist攻擊→opponent hero；Disposable Acolytes|7隻／4張|
|T4|Mysterious Visitor；Chronoclaws；Tyrande Whisperwind攻擊→Crystalsmith Cultist；Hand of Gul'dan；Creation Protocol；Boneweb Egg；Duke of Below；Duke of Below攻擊→Felbeast；Mysterious Visitor攻擊→Felbeast；Walking Dead|Chronoclaws；Gul'dan攻擊→Walking Dead；Felbeast攻擊→Walking Dead；Felbeast攻擊→Mysterious Visitor；Party Fiend攻擊→Boneweb Egg；Party Fiend攻擊→Boneweb Egg|2隻／3張|
|T5|Intertwined Fate；Tyrande Whisperwind攻擊→own hero；Soul Barrage；Boneweb Spider攻擊→own hero；Boneweb Spider攻擊→own hero；Duke of Below攻擊→own hero|—|未到本方回合末|

### #151 敗／戰士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T18:25:08.8509621+08:00

- 原發：Duke of Below、Chamber of Viscidus、Soulfire、Wicked Whispers
- 保留：Chamber of Viscidus
- 換後：The Soularium、Boneweb Egg、Chamber of Viscidus、Walking Dead
- 檢查：只留 Chamber；T1硬幣下Egg、T2 Disposable、T3硬下Walking Dead、T4 Chronoclaws。T10 Brawl 前公爵25攻且滿場，手中僅Soul Barrage；看起手是否需要更早壓力，以及大公爵出手時機／是否錯過傷害。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Enter the Lost City|The Coin；Boneweb Egg|1隻／4張|
|T2|Shield Block|Disposable Acolytes|3隻／4張|
|T3|Needlerock Totem|Walking Dead；Cursed Catacombs；Crimson Sigil Runner攻擊→Needlerock Totem|4隻／3張|
|T4|Unlucky Powderman；Into the Fray|Walking Dead攻擊→Unlucky Powderman；Crimson Sigil Runner攻擊→opponent hero；Chronoclaws；Gul'dan攻擊→opponent hero|5隻／2張|
|T5|Alley Armorsmith|Duke of Below|6隻／2張|
|T6|Fleshshaper；Alley Armorsmith攻擊→Walking Dead|Duke of Below攻擊→Alley Armorsmith；Chronoclaws；Gul'dan攻擊→Fleshshaper；The Soularium|5隻／6張|
|T7|Alloy Advisor；Prince Renathal；Fleshshaper攻擊→Walking Dead|Duke of Below；Entropic Continuity；Disposable Acolytes；Cursed Catacombs；Gul'dan攻擊→Alloy Advisor；Duke of Below攻擊→Fleshshaper；Duke of Below攻擊→Alloy Advisor；Crimson Sigil Runner攻擊→opponent hero；Boneweb Egg攻擊→opponent hero；Swamp Dragon Egg攻擊→opponent hero|7隻／2張|
|T8|Detonation Juggernaut；Scrappy Defender；Prince Renathal攻擊→Crimson Sigil Runner|Party Fiend；Gul'dan攻擊→Detonation Juggernaut；Duke of Below攻擊→Scrappy Defender；Duke of Below攻擊→opponent hero；Soulfire→opponent hero；Life Tap（技能）|7隻／1張|
|T9|Fleshshaper；Prince Renathal|Duke of Below攻擊→Fleshshaper；Duke of Below攻擊→Prince Renathal；Boneweb Spider攻擊→opponent hero；Boneweb Spider攻擊→opponent hero；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Ocular Occultist→Platysaur；Life Tap（技能）|7隻／1張|
|T10|Brawl；Blob of Tar|Party Fiend|4隻／1張|

- 對手T10 Brawl：施放前我方7隻（Duke of Below 25/7、Party Fiend 1/1、Ocular Occultist 3/6、Boneweb Spider 2/1、Boneweb Spider 2/1、Felbeast 1/1、Felbeast 1/1）；當時手牌：Soul Barrage；該對手回合末我方1隻。

### #160 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T20:56:47.1958114+08:00

- 原發：Disposable Acolytes、Walking Dead、Silverware Golem、Entropic Continuity
- 保留：Disposable Acolytes、Walking Dead、Silverware Golem
- 換後：Walking Dead、Silverware Golem、Disposable Acolytes、Entropic Continuity
- 檢查：留 Disposable＋Walking Dead＋Golem；T1硬幣Disposable，T3／T4硬下Walking Dead／Golem；T7 Medivh’s Triumph 前已僅一隻蜘蛛。優先看T1–T4的棄牌觸發／速度，不把最後一次清場當作全部敗因。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Illuminate|The Coin；Disposable Acolytes|2隻／4張|
|T2|—|Cursed Catacombs；Entropic Continuity；Witchwood Imp攻擊→opponent hero；Elwynn Boar攻擊→opponent hero|3隻／3張|
|T3|Mysterious Visitor；Creation Protocol；Ocular Occultist；Silverware Golem|Walking Dead；Walking Dead攻擊→Ocular Occultist|4隻／3張|
|T4|E.T.C., Band Manager；Mysterious Visitor攻擊→Walking Dead；Ocular Occultist攻擊→Walking Dead；Silverware Golem攻擊→Walking Dead；Silverware Golem攻擊→Elwynn Boar|Silverware Golem；Witchwood Imp攻擊→Ocular Occultist|1隻／3張|
|T5|Chronoclaws；Intertwined Fate；Disposable Acolytes；E.T.C., Band Manager攻擊→Silverware Golem；Mysterious Visitor攻擊→Silverware Golem；Silverware Golem攻擊→own hero；Silverware Golem攻擊→own hero|The Soularium；Ocular Occultist→Boneweb Egg|3隻／5張|
|T6|Sister Svalna；Entropic Continuity；Silverware Golem攻擊→Ocular Occultist；Blackjack Stunner攻擊→Ocular Occultist；Silverware Golem攻擊→Boneweb Spider；E.T.C., Band Manager攻擊→own hero；Kabal Lackey攻擊→own hero|Chronoclaws；Nemesis Gul'dan攻擊→E.T.C., Band Manager；Boneweb Spider攻擊→opponent hero；Platysaur；Wicked Whispers|2隻／2張|
|T7|Vision of Darkness；Devouring Plague；Medivh's Triumph；Soulfire→own hero；Sister Svalna攻擊→own hero|—|未到本方回合末|

- 對手T7 Medivh's Triumph：施放前我方1隻（Boneweb Spider 3/1）；當時手牌：Chamber of Viscidus、Soul Barrage；該對手回合末我方0隻。

### #163 敗／薩滿

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T21:18:02.2097423+08:00

- 原發：Entropic Continuity、Disposable Acolytes、Soulfire、Platysaur
- 保留：Disposable Acolytes、Platysaur
- 換後：Boneweb Egg、Platysaur、Cursed Catacombs、Disposable Acolytes
- 檢查：留 Disposable＋Platysaur，換入Egg＋Catacombs；T1硬幣Disposable。對手T6 Reno Jackson、T8 Reno, Lone Ranger、T9再Reno，打到T17。看回血前傷害、T5 buff／武器順序及後期公爵，這是長局資源與反覆回血案例。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Corrupt the Waters|Cursed Catacombs；The Coin；Disposable Acolytes|2隻／3張|
|T2|Totemic Call（技能）|Platysaur；Cursed Catacombs；Selfless Hero攻擊→opponent hero；Skaterbot攻擊→opponent hero|4隻／3張|
|T3|Turbulus；Searing Totem攻擊→Walking Dead|Entropic Continuity；Walking Dead攻擊→Turbulus；Selfless Hero攻擊→opponent hero；Skaterbot攻擊→opponent hero；Platysaur攻擊→opponent hero；Boneweb Egg|5隻／2張|
|T4|Azerite Chain Gang|Ocular Occultist→Walking Dead|7隻／1張|
|T5|Doctor Holli'dae；Eternalflame Ragnaros攻擊→Walking Dead；Azerite Chain Gang攻擊→Walking Dead；Azerite Chain Gang攻擊→Walking Dead|Wicked Whispers；Platysaur攻擊→Azerite Chain Gang；Skaterbot攻擊→Frog；Chronoclaws；Nemesis Gul'dan攻擊→Azerite Chain Gang；Selfless Hero攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Boneweb Egg攻擊→opponent hero|5隻／1張|
|T6|Doctor Holli'dae攻擊→Ocular Occultist；Eternalflame Ragnaros攻擊→Ocular Occultist；Reno Jackson|Party Fiend；Nemesis Gul'dan攻擊→Frog；Selfless Hero攻擊→opponent hero；Skaterbot攻擊→opponent hero；Platysaur攻擊→opponent hero；Boneweb Egg攻擊→opponent hero；Life Tap（技能）|7隻／1張|
|T7|Reno Jackson攻擊→own hero；Doctor Holli'dae攻擊→own hero；Grumble, Worldshaker；Eternalflame Ragnaros攻擊→Skaterbot|Soulfire→Frog；Nemesis Gul'dan攻擊→opponent hero；Selfless Hero攻擊→opponent hero；Platysaur攻擊→opponent hero；Boneweb Egg攻擊→opponent hero；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|7隻／0張|
|T8|Reno, Lone Ranger；Reno, Lone Ranger攻擊→own hero|Chamber of Viscidus；Chamber of Viscidus（啟動）；Ocular Occultist→Party Fiend|1隻／0張|
|T9|Reno Jackson；Grumble, Worldshaker攻擊→Ocular Occultist；Heart of Vir'naal（技能）；Blademaster Okani|Platysaur|0隻／0張|
|T10|Murozond, Unbounded|Chamber of Viscidus（啟動）；Duke of Below；Duke of Below攻擊→Frog；Soul Barrage|1隻／0張|
|T11|Grumble, Worldshaker攻擊→Duke of Below；Blademaster Okani攻擊→Duke of Below；Murozond, Unbounded攻擊→Duke of Below|Silverware Golem|1隻／0張|
|T12|—|Duke of Below；Duke of Below攻擊→Reno Jackson；Silverware Golem攻擊→opponent hero|2隻／0張|
|T13|Heart of Vir'naal（技能）；M.O.T.H.E.R.；Snowball Fight!→Duke of Below|—|1隻／1張|
|T14|Heart of Vir'naal（技能）；Insatiable Devourer→Duke of Below|Boneweb Egg|1隻／1張|
|T15|Heart of Vir'naal（技能）；The One-Amalgam Band|—|1隻／2張|
|T16|—|—|1隻／2張|
|T17|Heart of Vir'naal（技能）；Loatheb|—|1隻／2張|

### #164 敗／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T21:31:32.4786565+08:00

- 原發：Duke of Below、Duke of Below、Hand of Gul'dan、Entropic Continuity
- 保留：全換／無保留
- 換後：Disposable Acolytes、Hand of Gul'dan、Cursed Catacombs、Entropic Continuity
- 檢查：原起手雙Duke＋Hand＋Entropic全部換掉，換後仍有Hand＋Entropic；T1硬幣Disposable。對手T5與T8 Medivh’s Triumph 均清空我方；檢查換入限制、T4公爵與T6／T7重建，不誤把換入Hand算成主動保留。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Party Fiend|Cursed Catacombs；The Coin；Disposable Acolytes|3隻／3張|
|T2|Mysterious Visitor；Platysaur；Illuminate；Felbeast攻擊→Walking Dead；Party Fiend攻擊→Walking Dead；Felbeast攻擊→Walking Dead|Entropic Continuity；Walking Dead攻擊→Mysterious Visitor；Emerald Hive Queen攻擊→opponent hero；Faithful Lumi攻擊→Platysaur|3隻／3張|
|T3|Ocular Occultist；Lesser Heal（技能）→opponent hero|Party Fiend；Emerald Hive Queen攻擊→Ocular Occultist；Walking Dead攻擊→Ocular Occultist|5隻／3張|
|T4|Sphere of Sapience；Walking Dead攻擊→Emerald Hive Queen；Lesser Heal（技能）→opponent hero|Duke of Below；Duke of Below攻擊→Walking Dead；Faithful Lumi攻擊→opponent hero；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|5隻／3張|
|T5|Cursed Catacombs；Medivh's Triumph；Lesser Heal（技能）→opponent hero|Platysaur；Chronoclaws；Gul'dan攻擊→opponent hero|1隻／5張|
|T6|Ocular Occultist；Identity Theft；Mysterious Visitor|Party Fiend；Platysaur；Disposable Acolytes；Entropic Continuity；Wicked Whispers；Gul'dan攻擊→Ocular Occultist；Platysaur攻擊→opponent hero|7隻／0張|
|T7|The Soularium；Intertwined Fate；Ocular Occultist；Entropic Continuity；Soul Barrage；Wicked Whispers|Gul'dan攻擊→Walking Dead；Felbeast攻擊→Walking Dead；Felbeast攻擊→Ocular Occultist；Party Fiend攻擊→Ocular Occultist；Patches the Pilot攻擊→Ocular Occultist；Platysaur攻擊→opponent hero；Platysaur攻擊→opponent hero；Platysaur攻擊→opponent hero；Life Tap（技能）|3隻／1張|
|T8|Azalina Soulsever；Medivh's Triumph；Chamber of Viscidus|Cursed Catacombs；Soul Barrage；Life Tap（技能）|0隻／4張|
|T9|The Harvester of Envy；Soul Barrage；Birdwatching；Silverware Golem；Birdwatching；Duke of Below；Chamber of Viscidus（啟動）；Soul Barrage|—|未到本方回合末|

- 對手T5 Medivh's Triumph：施放前我方5隻（Party Fiend 1/1、Duke of Below 4/2、Faithful Lumi 2/1、Felbeast 1/1、Felbeast 1/1）；當時手牌：Soul Barrage、Hand of Gul'dan、The Soularium；該對手回合末我方0隻。

- 對手T8 Medivh's Triumph：施放前我方3隻（Platysaur 3/4、Platysaur 3/3、Platysaur 3/3）；當時手牌：Soul Barrage；該對手回合末我方0隻。

### #166 敗／戰士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T21:51:10.7448129+08:00

- 原發：Hand of Gul'dan、Ocular Occultist、Entropic Continuity、Walking Dead
- 保留：Ocular Occultist、Walking Dead
- 換後：Hand of Gul'dan、Walking Dead、Duke of Below、Ocular Occultist
- 檢查：留 Ocular＋Walking Dead；T1 Party、T2 Entropic。對手T3 Aftershocks 清掉三隻，T7 Brawl 再處理滿場；手中尚有Hand／Chamber／硬幣。檢查補牌啟動、公爵與場面投入，而非一律少鋪。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Party Fiend|3隻／5張|
|T2|For Glory!|Entropic Continuity；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero|3隻／5張|
|T3|Aftershocks|Ocular Occultist→Walking Dead|2隻／4張|
|T4|Igneous Lavagorger|Duke of Below；Duke of Below攻擊→Igneous Lavagorger；Walking Dead攻擊→Igneous Lavagorger；Ocular Occultist攻擊→opponent hero|3隻／4張|
|T5|Dirty Rat；Armor Up!（技能）|Ocular Occultist→Disposable Acolytes；Duke of Below攻擊→Dirty Rat；Ocular Occultist攻擊→opponent hero；Walking Dead攻擊→opponent hero；Disposable Acolytes；Gul'dan攻擊→opponent hero|7隻／2張|
|T6|New Heights；Drywhisker Armorer|Duke of Below攻擊→opponent hero；Gul'dan攻擊→Drywhisker Armorer；Safety Inspector攻擊→Drywhisker Armorer；Ocular Occultist攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Walking Dead攻擊→opponent hero；Spiderling攻擊→opponent hero|7隻／3張|
|T7|Garrosh's Gift；Brawl；Armor Up!（技能）|Duke of Below攻擊→opponent hero；Platysaur；Chamber of Viscidus；Chamber of Viscidus（啟動）；Cursed Catacombs；Wicked Whispers；Soulfire→opponent hero；Entropic Continuity|4隻／2張|
|T8|Zilliax Deluxe 3000；Zilliax Deluxe 3000攻擊→Imprisoned Homunculus；Zilliax Deluxe 3000攻擊→Imprisoned Homunculus|Walking Dead；Duke of Below攻擊→Zilliax Deluxe 3000；Silverware Golem攻擊→Zilliax Deluxe 3000；Platysaur攻擊→opponent hero；Party Fiend；Life Tap（技能）；Cursed Catacombs|6隻／1張|
|T9|Reno, Lone Ranger；Fel Bullet（技能）→own hero|Chamber of Viscidus（啟動）；The Soularium；Duke of Below；Platysaur；Wicked Whispers|6隻／1張|
|T10|Bob the Bartender；Fire Bullet（技能）→own hero|Chronoclaws；Gul'dan攻擊→opponent hero|6隻／0張|
|T11|Bob the Bartender攻擊→own hero|—|未到本方回合末|

- 對手T3 Aftershocks：施放前我方3隻（Party Fiend 2/2、Felbeast 2/2、Felbeast 2/2）；當時手牌：Hand of Gul'dan、Walking Dead、Duke of Below、Ocular Occultist、The Coin；該對手回合末我方0隻。

- 對手T7 Brawl：施放前我方7隻（Duke of Below 6/1、Ocular Occultist 3/6、Ocular Occultist 3/6、Walking Dead 2/2、Safety Inspector 1/1、Imprisoned Homunculus 2/5、Spiderling 1/2）；當時手牌：Hand of Gul'dan、Chamber of Viscidus、The Coin；該對手回合末我方2隻。

### #177 敗／薩滿

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T23:00:32.9943945+08:00

- 原發：Wicked Whispers、Disposable Acolytes、Chronoclaws、Boneweb Egg
- 保留：Wicked Whispers、Disposable Acolytes
- 換後：Wicked Whispers、Platysaur、Disposable Acolytes、Chamber of Viscidus
- 檢查：留 Whispers＋Disposable；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Chamber並啟動。對手T4 Elemental Destruction、T6 Devolve→Aftershocks；看AOE前保留觸發器、AOE後公爵重建及變形風險。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Platysaur；The Coin；Wicked Whispers|3隻／3張|
|T2|Dirty Rat|Duke of Below攻擊→Dirty Rat；Platysaur攻擊→Dirty Rat；Sky Raider攻擊→opponent hero；Soulbound Ashtongue攻擊→opponent hero；Life Tap（技能）|4隻／4張|
|T3|Sir Finley, Sea Guide；Far Watch Post|Duke of Below攻擊→Sir Finley, Sea Guide；Platysaur攻擊→opponent hero；Sky Raider攻擊→Far Watch Post；Soulbound Ashtongue攻擊→Far Watch Post；Chamber of Viscidus；Chamber of Viscidus（啟動）|6隻／5張|
|T4|Elemental Destruction；Sphere of Sapience|Duke of Below|1隻／5張|
|T5|Primal Dungeoneer|Cursed Catacombs；Wicked Whispers；Chamber of Viscidus（啟動）；Silverware Golem；Duke of Below攻擊→Primal Dungeoneer；Party Fiend|7隻／3張|
|T6|Devolve；Aftershocks|Cursed Catacombs；Chronoclaws；Nemesis Gul'dan攻擊→opponent hero；Party Fiend|4隻／3張|
|T7|Parrot Sanctuary；Parrot Sanctuary（啟動）；Zephrys the Great；Acidic Swamp Ooze；Totemic Call（技能）|Soulfire→Walking Dead；Soul Barrage；Walking Dead攻擊→opponent hero；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Life Tap（技能）|4隻／2張|
|T8|Reno Jackson；Needlerock Totem|Walking Dead攻擊→Needlerock Totem；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Ocular Occultist→Hand of Gul'dan；Ocular Occultist→Walking Dead；Entropic Continuity|7隻／1張|
|T9|The Curator；Reno Jackson攻擊→Walking Dead；Parrot Sanctuary（啟動）；Backstage Bouncer→Reno Jackson|Chronoclaws；Life Tap（技能）|6隻／2張|
|T10|Murloc Growfin；The Curator攻擊→Ocular Occultist；Backstage Bouncer攻擊→Ocular Occultist；Molded Tinyfin攻擊→Walking Dead；Parrot Sanctuary（啟動）；Murloc Growfin；Molded Tinyfin攻擊→Ocular Occultist；Totemic Call（技能）；Backstage Bouncer攻擊→Walking Dead|Entropic Continuity；Nemesis Gul'dan攻擊→Backstage Bouncer；Party Fiend攻擊→Stoneclaw Totem；Felbeast攻擊→The Curator；Felbeast攻擊→Backstage Bouncer；Walking Dead攻擊→Murloc Growfin|4隻／1張|
|T11|Murloc Growfin攻擊→Walking Dead；Molded Tinyfin攻擊→own hero|—|未到本方回合末|

- 對手T4 Elemental Destruction：施放前我方6隻（Platysaur 2/1、Duke of Below 6/3、Sky Raider 2/1、Soulbound Ashtongue 2/3、Boneweb Spider 2/1、Boneweb Spider 2/1）；當時手牌：Soul Barrage、Chronoclaws、Hand of Gul'dan、Soul Barrage、Duke of Below；該對手回合末我方0隻。

- 對手T6 Devolve：施放前我方7隻（Party Fiend 1/1、Silverware Golem 3/4、Duke of Below 11/9、Critter Caretaker 3/3、Grave Defiler 3/2、Felbeast 1/1、Felbeast 1/1）；當時手牌：Chronoclaws、Hand of Gul'dan、Soul Barrage；該對手回合末我方0隻。

- 對手T6 Aftershocks：施放前我方7隻（Murloc Tinyfin 1/1、Terrorscale Stalker 2/3、Ravenous Pterrordax 3/3、Witch's Apprentice 0/1、Ancient Totem 0/3、Desk Imp 1/1、Snowflipper Penguin 1/1）；當時手牌：Chronoclaws、Hand of Gul'dan、Soul Barrage；該對手回合末我方0隻。

### #182 勝／牧師

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-01T23:50:22.9951834+08:00

- 原發：Disposable Acolytes、Soul Barrage、Cursed Catacombs、Chronoclaws
- 保留：Disposable Acolytes、Cursed Catacombs
- 換後：Cursed Catacombs、Walking Dead、Disposable Acolytes、Party Fiend
- 檢查：胜局對照：留 Disposable＋Catacombs；T1 Catacombs→Party，交硬幣；T2 Whispers、T3硬下Walking Dead，T4 Golem＋Platysaur。硬下行屍也有勝局，不能單憑「硬下」判成錯。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|—|Cursed Catacombs；Party Fiend；The Coin|3隻／3張|
|T2|Wicked Whispers|Wicked Whispers；Felbeast攻擊→Depth Charge；Party Fiend攻擊→Depth Charge；Felbeast攻擊→Depth Charge|5隻／2張|
|T3|Identity Theft；Forbidden Ancient攻擊→Ethereal Augmerchant|Walking Dead；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Suspicious Usher攻擊→opponent hero|5隻／2張|
|T4|Chronoclaws；Champion Tyrande攻擊→Walking Dead|Silverware Golem；Felbeast攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Suspicious Usher攻擊→opponent hero；Walking Dead攻擊→opponent hero；Platysaur|7隻／2張|
|T5|Lunarwing Messenger；Walking Dead；Champion Tyrande攻擊→Walking Dead|Ocular Occultist→Soul Barrage；Suspicious Usher攻擊→Walking Dead；Felbeast攻擊→Walking Dead；Silverware Golem攻擊→opponent hero；Party Fiend攻擊→opponent hero；Felbeast攻擊→opponent hero；Platysaur攻擊→opponent hero；Party Fiend|7隻／0張|
|T6|Mysterious Visitor；Blessing of the Moon（技能）；Entropic Continuity；Shadow Visions；Entropic Continuity|—|未到本方回合末|

### #188 勝／術士

[HDT重播](https://hsreplay.net/uploads/upload/REDACTED/) · 開始 2026-10-02T00:28:48.0734453+08:00

- 原發：Hand of Gul'dan、Cursed Catacombs、Duke of Below、Cursed Catacombs
- 保留：Cursed Catacombs、Cursed Catacombs
- 換後：Disposable Acolytes、Cursed Catacombs、Cursed Catacombs、Hand of Gul'dan
- 檢查：勝局對照：只留雙Catacombs；換入Disposable＋Hand，T1雙Catacombs→硬幣→Disposable、T2 Life Tap、T3 Ocular。換入Hand仍勝，起手相關性不代表單卡好壞的因果。

|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|
|---|---|---|---|
|T1|Battle at the End Time|Cursed Catacombs；Cursed Catacombs；The Coin；Disposable Acolytes|4隻／2張|
|T2|Life Tap（技能）|Silverware Golem攻擊→opponent hero；Walking Dead攻擊→opponent hero；Raptor-Nest Nurse攻擊→opponent hero；Patches the Pilot攻擊→opponent hero；Life Tap（技能）|4隻／4張|
|T3|Life Tap（技能）；Spawning Pool；Spawning Pool（啟動）|Silverware Golem攻擊→opponent hero；Walking Dead攻擊→opponent hero；Raptor-Nest Nurse攻擊→opponent hero；Patches the Pilot攻擊→opponent hero；Ocular Occultist→Hand of Gul'dan|5隻／6張|
|T4|Life Tap（技能）|Duke of Below；Silverware Golem攻擊→opponent hero；Ocular Occultist攻擊→opponent hero；Walking Dead攻擊→opponent hero；Raptor-Nest Nurse攻擊→opponent hero；Patches the Pilot攻擊→opponent hero|6隻／6張|
|T5|Plot Twist|—|未到本方回合末|

## 複驗與資料

來源：eval/runs/history-classified-2026-10-01T19-18-06-561Z 與 opening-winrates-2026-10-01T19-20-03-029Z。本次凍結：eval/runs/control-second-review-2026-10-01T19-56-47-580Z，含27場URL／牌序／盤面／起手、統計、來源與生成器SHA256、生成器快照。

全部27份replay SHA與原凍結資料相同；全部對手公開PLAY之回合／實體／卡ID序列與原抽取逐項相符；本方最外層动作回合符合後手；三種留牌分母均27且每卡有／無分組守恆，保留／全換分組也守恆。

重跑：

```powershell
node src/review-control-second.mjs
node src/report-control-second.mjs <剛產生的control-second-review資料夾名稱>
```

本次只作離線分析，不修改正式策略／分類，不呼叫模型、不恢復排位、不提交Git。
