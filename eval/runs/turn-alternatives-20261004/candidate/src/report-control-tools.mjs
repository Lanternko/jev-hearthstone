import {readFile,writeFile} from 'node:fs/promises';
const run=process.argv[2];if(!/^control-tools-[\w-]+$/.test(run??''))throw Error('Expected frozen run name');
const dir=`eval/runs/${run}`,games=JSON.parse(await readFile(`${dir}/games.json`)),results=JSON.parse(await readFile(`${dir}/results.json`));
const g=n=>{const row=games.find(g=>g.ordinal===n);if(!row)throw Error('Missing reviewed game');return row;};
const rate=s=>s.n?`${s.wins}/${s.n}（${(100*s.winRate).toFixed(1)}%）`:'無樣本';
const link=row=>`[#${row.ordinal}](${row.url})`;
const names=cs=>cs.map(c=>c.name).join('、')||'無';
const materials=['Boneweb Egg','Silverware Golem','Walking Dead','Disposable Acolytes'];
let md=`# 控制局：魔眼準時性、武器與早期buff\n\n取已分類161場中的全部54場控制（先手17/27勝、後手10/27勝），從固定HDT replay重建實際行動、手牌、棄牌觸發。此次擴展先手作對照，主要問題仍是控制後手；沒有啟動遊戲／呼叫模型／更改正式策略。歷史含人工、不同版本與中斷局，數據屬探索性，不是新版勝率或因果效果。\n\n## 魔眼＋早期核心的6場\n\n這是換牌後起手同時有魔眼與墓穴／鴨嘴龍／派對／侍僧的6場；並非6場都刻意保留魔眼。5場進入本方T3，全都以3費準時打魔眼，且都有正收益棄牌目標。另一場#136在對手T2結束，沒機會打魔眼，不當成延誤。\n\n|重播／結果|魔眼來源|首次打出|打出前可棄的召喚素材|實際棄牌|打出前場面|\n|---|---|---|---|---|---|\n`;
for(const row of results.ocularSix){
  const game=g(row.ordinal),a=row.firstOcular;
  const kept=game.kept.some(c=>c.name==='Ocular Occultist');
  if(a&&(a.turn!==3||a.before.own.mana!==3||a.handToGraveyard.length!==1))throw Error('Ocular case mismatch');
  md+=`|${link(game)}／${game.result==='Win'?'勝':'敗'}|${kept?'原牌保留':'換入'}|${a?'T3，3費':'T3前結束'}|${a?names(a.before.own.hand.filter(c=>materials.includes(c.name))):'未到T3'}|${a?names(a.handToGraveyard):'—'}|${a?`${a.before.own.board.length}隻`:'—'}|\n`;
}
md+='\n侍僧是法術但可作棄牌召喚素材。#64無這四種召喚素材（另有第二張魔眼），選擇棄Hand of Gul’dan抽牌；不是完全沒有效棄牌目標。魔眼準時打出前，#64和#85都已空場，一敗一勝；「起手有早期牌」不保證T3仍有早期場面。5場準時魔眼中2勝3敗，不能用原3/6勝率診斷三費延遲。\n\n## 武器是否能留\n\n|控制象限|刻意保留武器|保留武器＋早期核心|換後起手有武器|\n|---|---:|---:|---:|\n';
for(const [side,label]of [['first','先手'],['second','後手']]){const s=results.metrics[side];md+=`|${label}|${rate(s.weaponKept.withWeapon)}|${rate(s.weaponKept.withCore)}|${rate(s.weaponFinal.withWeapon)}|\n`;}
const keptWinner=g(27);
if(keptWinner.result!=='Win'||keptWinner.weaponAttacks.filter(a=>a.targetLabel==='opponent hero').length!==3)throw Error('Weapon retained case mismatch');
md+=`\n54場中只有3場刻意保留武器：先手${link(keptWinner)}勝，後手${link(g(66))}與${link(g(69))}敗。先手／後手差異及手牌搭配都有混雜，不能把1/1或0/2當成可靠規則。\n\n${link(keptWinner)}起手留Platysaur＋Chronoclaws＋Silverware Golem。T1鴨嘴龍、T2派對＋Entropic、T3魔眼棄侍僧；T4裝武器時我方兩隻、對手24血。\n\n|武器攻擊回合|目標／傷害|武器觸發的實際棄牌|\n|---|---|---|\n`;
for(const a of keptWinner.weaponAttacks){
  const damage=(a.before.opponent.health+a.before.opponent.armor)-(a.after.opponent.health+a.after.opponent.armor);
  md+=`|T${a.turn}|${a.targetLabel}／${damage}點|${names(a.weaponDiscards)}|\n`;
}
md+=`\n這局武器三次打臉共12點，且三次觸發都形成召喚，T6由手下完成最後傷害。這是「保留武器可成功」的實際案例，沒有證明換掉武器就會輸。T2派對及T3魔眼屬後續抽牌／獲取，不能當成起手時已知整條曲線。\n\n武器作收尾亦有案例：${link(g(103))}後手T4對手8血時裝武器，打臉4點到4血；${link(g(43))}T7對手8血時裝武器，同樣打臉到4血，後來獲勝。两局均沒有刻意保留武器；#103這刀棄的是Ocular（不是召喚素材），說明直接傷害也可有用。觀察到後续獲勝不等於已獨立驗證武器為必要斬殺。\n\n候選留牌條件：已有可靠的前兩回合展開、不為武器犧牲早期曲線；預計T4可攻擊並把最高費棄牌轉成召喚／傷害／抽牌；同費並列、最高費為關鍵公爵、嘲諷／武器移除／回血皆影響價值。這些是待測條件，目前控制後手的「保留武器＋核心」為0場，不能宣稱已驗證。\n\n## 第五回合前沒有buff是否等輸\n\n固定buff集合為Wicked Whispers／Entropic Continuity，統計實際施放；不把起手有buff當成施放。嚴格「第五回合前」=自己T1–T4；「第五回合內」=T1–T5。先列全局，再以觀察到自己T5 MAIN_ACTION的局作條件比較；後者避免把來不及到T5的局混算，但仍按存活／牌序事後篩選，不能視為隨機實驗。\n\n|範圍|象限|T1–T4已打buff|T1–T4未打buff|\n|---|---|---:|---:|\n`;
for(const [side,label]of [['first','控制先手'],['second','控制後手']]){
  const s=results.metrics[side];
  md+=`|全部27場|${label}|${rate(s.buffAll[4].cast)}|${rate(s.buffAll[4].notCast)}|\n`;
  md+=`|已進自己T5|${label}|${rate(s.buffReachedOwnFive[4].cast)}|${rate(s.buffReachedOwnFive[4].notCast)}|\n`;
}
md+='\n|已進自己T5|T1–T5已打buff|T1–T5仍未打buff|\n|---|---:|---:|\n';
for(const [side,label]of [['first','控制先手'],['second','控制後手']]){const s=results.metrics[side].buffReachedOwnFive[5];md+=`|${label}|${rate(s.cast)}|${rate(s.notCast)}|\n`;}
md+=`\n後手已進T5但沒有T1–T4 buff的5場：${[5,22,74,97,151].map(n=>link(g(n))).join('、')}，全敗；0/5的95%Wilson上界仍約43.4%，不是確定必敗。早期有buff也僅6/17勝（35.3%），所以buff不是充分勝利條件。\n\n控制先手進T5的兩組都60%，並有${link(g(73))}／${link(g(159))}首次buff在T6仍勝。後手${link(g(188))}完全無buff仍勝，但是在對手T5結束，未進本方T5；它反駁所有局都需要buff，不能拿來反駁「拖到自己T5的後手」這個較窄假說。#136為T2早結束無buff勝局，亦獨立標示。\n\n### 後手未早buff的5場具體狀態\n\n|重播|自己T5開始場面|手上有無buff|首次buff|\n|---|---|---|---|\n`;
for(const n of [5,22,74,97,151]){const game=g(n),s=game.turnStarts.find(t=>t.side==='own'&&t.turn===5).state.own;
  md+=`|${link(game)}|${s.board.length}隻（${names(s.board)}）|${names(s.hand.filter(c=>['Wicked Whispers','Entropic Continuity'].includes(c.name)))}|T${game.firstBuffTurn}|\n`;
}
md+=`\n#97進T5已空場且無buff，#151有場面但沒抽到buff，與#74手上有Entropic卻直到T6施放，是不同機制。應檢查前一回合是否可buff、buff後額外傷害／血量是否跨過清場門檻、是否因先解场／抽牌而延後；不能把觀察關聯直接改成T4一律buff。\n\n## 可複驗資料\n\n本次凍結${dir}：54份replay SHA與既有公開牌序逐项核對；games.json含实际手牌／行动前後／武器觸發的HAND→GRAVEYARD事件（包含攻擊block結束後的trigger）；results.json含分組逐局序號和95%區間，manifest.json保存來源／解析器SHA及快照。HAND→GRAVEYARD通常也可能是施放；報告僅在魔眼或明確武器trigger上下文稱為棄牌。\n\n重跑：\n\n\`\`\`powershell\nnode src/eval-control-tools.mjs\nnode src/report-control-tools.mjs <剛產生的control-tools資料夾名稱>\n\`\`\`\n\n下一步評估應固定「曲線已夠時武器可留」與「後手T4前有效buff」兩個候選條件，檢查未參與本次分析的新牌局；不因本批0/5或1/1直接改必留／必打規則。\n`;
await writeFile(`${dir}/report.md`,md);await writeFile('docs/control-tools-evidence-20261002.md',md);
await writeFile(`${dir}/report-generator.mjs`,await readFile('src/report-control-tools.mjs'));
console.log(JSON.stringify({report:'docs/control-tools-evidence-20261002.md',games:54,ocularCases:6}));
