# 控制局：魔眼準時性、武器與早期buff

取已分類161場中的全部54場控制（先手17/27勝、後手10/27勝），從固定HDT replay重建實際行動、手牌、棄牌觸發。此次擴展先手作對照，主要問題仍是控制後手；沒有啟動遊戲／呼叫模型／更改正式策略。歷史含人工、不同版本與中斷局，數據屬探索性，不是新版勝率或因果效果。

## 魔眼＋早期核心的6場

這是換牌後起手同時有魔眼與墓穴／鴨嘴龍／派對／侍僧的6場；並非6場都刻意保留魔眼。5場進入本方T3，全都以3費準時打魔眼，且都有正收益棄牌目標。另一場#136在對手T2結束，沒機會打魔眼，不當成延誤。

|重播／結果|魔眼來源|首次打出|打出前可棄的召喚素材|實際棄牌|打出前場面|
|---|---|---|---|---|---|
|[#15](https://hsreplay.net/uploads/upload/REDACTED/)／敗|原牌保留|T3，3費|Boneweb Egg|Boneweb Egg|2隻|
|[#23](https://hsreplay.net/uploads/upload/REDACTED/)／敗|原牌保留|T3，3費|Silverware Golem|Silverware Golem|1隻|
|[#45](https://hsreplay.net/uploads/upload/REDACTED/)／勝|換入|T3，3費|Disposable Acolytes|Disposable Acolytes|2隻|
|[#64](https://hsreplay.net/uploads/upload/REDACTED/)／敗|換入|T3，3費|無|Hand of Gul'dan|0隻|
|[#85](https://hsreplay.net/uploads/upload/REDACTED/)／勝|原牌保留|T3，3費|Walking Dead|Walking Dead|0隻|
|[#136](https://hsreplay.net/uploads/upload/REDACTED/)／勝|原牌保留|T3前結束|未到T3|—|—|

侍僧是法術但可作棄牌召喚素材。#64無這四種召喚素材（另有第二張魔眼），選擇棄Hand of Gul’dan抽牌；不是完全沒有效棄牌目標。魔眼準時打出前，#64和#85都已空場，一敗一勝；「起手有早期牌」不保證T3仍有早期場面。5場準時魔眼中2勝3敗，不能用原3/6勝率診斷三費延遲。

## 武器是否能留

|控制象限|刻意保留武器|保留武器＋早期核心|換後起手有武器|
|---|---:|---:|---:|
|先手|1/1（100.0%）|1/1（100.0%）|4/5（80.0%）|
|後手|0/2（0.0%）|無樣本|1/4（25.0%）|

54場中只有3場刻意保留武器：先手[#27](https://hsreplay.net/uploads/upload/REDACTED/)勝，後手[#66](https://hsreplay.net/uploads/upload/REDACTED/)與[#69](https://hsreplay.net/uploads/upload/REDACTED/)敗。先手／後手差異及手牌搭配都有混雜，不能把1/1或0/2當成可靠規則。

[#27](https://hsreplay.net/uploads/upload/REDACTED/)起手留Platysaur＋Chronoclaws＋Silverware Golem。T1鴨嘴龍、T2派對＋Entropic、T3魔眼棄侍僧；T4裝武器時我方兩隻、對手24血。

|武器攻擊回合|目標／傷害|武器觸發的實際棄牌|
|---|---|---|
|T4|opponent hero／4點|Silverware Golem|
|T5|opponent hero／4點|Walking Dead|
|T6|opponent hero／4點|Disposable Acolytes|

這局武器三次打臉共12點，且三次觸發都形成召喚，T6由手下完成最後傷害。這是「保留武器可成功」的實際案例，沒有證明換掉武器就會輸。T2派對及T3魔眼屬後續抽牌／獲取，不能當成起手時已知整條曲線。

武器作收尾亦有案例：[#103](https://hsreplay.net/uploads/upload/REDACTED/)後手T4對手8血時裝武器，打臉4點到4血；[#43](https://hsreplay.net/uploads/upload/REDACTED/)T7對手8血時裝武器，同樣打臉到4血，後來獲勝。两局均沒有刻意保留武器；#103這刀棄的是Ocular（不是召喚素材），說明直接傷害也可有用。觀察到後续獲勝不等於已獨立驗證武器為必要斬殺。

候選留牌條件：已有可靠的前兩回合展開、不為武器犧牲早期曲線；預計T4可攻擊並把最高費棄牌轉成召喚／傷害／抽牌；同費並列、最高費為關鍵公爵、嘲諷／武器移除／回血皆影響價值。這些是待測條件，目前控制後手的「保留武器＋核心」為0場，不能宣稱已驗證。

## 第五回合前沒有buff是否等輸

固定buff集合為Wicked Whispers／Entropic Continuity，統計實際施放；不把起手有buff當成施放。嚴格「第五回合前」=自己T1–T4；「第五回合內」=T1–T5。先列全局，再以觀察到自己T5 MAIN_ACTION的局作條件比較；後者避免把來不及到T5的局混算，但仍按存活／牌序事後篩選，不能視為隨機實驗。

|範圍|象限|T1–T4已打buff|T1–T4未打buff|
|---|---|---:|---:|
|全部27場|控制先手|10/16（62.5%）|7/11（63.6%）|
|已進自己T5|控制先手|9/15（60.0%）|6/10（60.0%）|
|全部27場|控制後手|8/19（42.1%）|2/8（25.0%）|
|已進自己T5|控制後手|6/17（35.3%）|0/5（0.0%）|

|已進自己T5|T1–T5已打buff|T1–T5仍未打buff|
|---|---:|---:|
|控制先手|13/20（65.0%）|2/5（40.0%）|
|控制後手|6/19（31.6%）|0/3（0.0%）|

後手已進T5但沒有T1–T4 buff的5場：[#5](https://hsreplay.net/uploads/upload/REDACTED/)、[#22](https://hsreplay.net/uploads/upload/REDACTED/)、[#74](https://hsreplay.net/uploads/upload/REDACTED/)、[#97](https://hsreplay.net/uploads/upload/REDACTED/)、[#151](https://hsreplay.net/uploads/upload/REDACTED/)，全敗；0/5的95%Wilson上界仍約43.4%，不是確定必敗。早期有buff也僅6/17勝（35.3%），所以buff不是充分勝利條件。

控制先手進T5的兩組都60%，並有[#73](https://hsreplay.net/uploads/upload/REDACTED/)／[#159](https://hsreplay.net/uploads/upload/REDACTED/)首次buff在T6仍勝。後手[#188](https://hsreplay.net/uploads/upload/REDACTED/)完全無buff仍勝，但是在對手T5結束，未進本方T5；它反駁所有局都需要buff，不能拿來反駁「拖到自己T5的後手」這個較窄假說。#136為T2早結束無buff勝局，亦獨立標示。

### 後手未早buff的5場具體狀態

|重播|自己T5開始場面|手上有無buff|首次buff|
|---|---|---|---|
|[#5](https://hsreplay.net/uploads/upload/REDACTED/)|5隻（Platysaur、Party Fiend、Ocular Occultist、Silverware Golem、Felbeast）|Entropic Continuity|T5|
|[#22](https://hsreplay.net/uploads/upload/REDACTED/)|3隻（Platysaur、Swamp Leech、X-21 Repairbot）|Entropic Continuity|T5|
|[#74](https://hsreplay.net/uploads/upload/REDACTED/)|5隻（Party Fiend、Boneweb Egg、Ocular Occultist、Jade Swarmer、Selfless Hero）|Entropic Continuity|T6|
|[#97](https://hsreplay.net/uploads/upload/REDACTED/)|0隻（無）|無|T6|
|[#151](https://hsreplay.net/uploads/upload/REDACTED/)|5隻（Boneweb Egg、Walking Dead、Swamp Dragon Egg、Crimson Sigil Runner、Walking Dead）|無|T7|

#97進T5已空場且無buff，#151有場面但沒抽到buff，與#74手上有Entropic卻直到T6施放，是不同機制。應檢查前一回合是否可buff、buff後額外傷害／血量是否跨過清場門檻、是否因先解场／抽牌而延後；不能把觀察關聯直接改成T4一律buff。

## 可複驗資料

本次凍結eval/runs/control-tools-2026-10-01T20-43-57-565Z：54份replay SHA與既有公開牌序逐项核對；games.json含实际手牌／行动前後／武器觸發的HAND→GRAVEYARD事件（包含攻擊block結束後的trigger）；results.json含分組逐局序號和95%區間，manifest.json保存來源／解析器SHA及快照。HAND→GRAVEYARD通常也可能是施放；報告僅在魔眼或明確武器trigger上下文稱為棄牌。

重跑：

```powershell
node src/eval-control-tools.mjs
node src/report-control-tools.mjs <剛產生的control-tools資料夾名稱>
```

下一步評估應固定「曲線已夠時武器可留」與「後手T4前有效buff」兩個候選條件，檢查未參與本次分析的新牌局；不因本批0/5或1/1直接改必留／必打規則。
