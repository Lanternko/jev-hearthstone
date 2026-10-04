// Exploratory, offline evaluation of the user's 2026-10-02 early-tempo hypothesis.
// These groups describe starting hands, not guaranteed playable turn sequences.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {wilson} from './eval-strength.mjs';
const source='eval/runs/opening-winrates-2026-10-01T19-20-03-029Z/games.json';
const bytes=await readFile(source),all=JSON.parse(bytes);
const games=all.filter(g=>g.matchup.type==='control'&&g.initiative==='second');
if(games.length!==27||games.some(g=>!g.receiptComplete||!g.finalOpeningComplete))throw Error('Expected 27 complete control-second games');
const core=['Cursed Catacombs','Platysaur','Party Fiend','Disposable Acolytes'];
const has=(h,name)=>h.some(c=>c.name===name),coreCount=h=>h.filter(c=>core.includes(c.name)).length;
const groups={anyCore:h=>coreCount(h)>0,noCore:h=>coreCount(h)===0,twoCore:h=>coreCount(h)>=2};
for(const name of ['Ocular Occultist','Chronoclaws','Wicked Whispers','Entropic Continuity','Boneweb Egg']){
  groups[`${name}:withCore`]=h=>has(h,name)&&coreCount(h)>0;
  groups[`${name}:withoutCore`]=h=>has(h,name)&&coreCount(h)===0;
}
const summarize=gs=>{const n=gs.length,wins=gs.filter(g=>g.result==='Win').length;
  return {n,wins,winRate:n?wins/n:null,ci95:wilson(wins,n),games:gs.map(g=>({id:g.id,ordinal:g.ordinal,result:g.result}))};};
const metrics=Object.fromEntries(['kept','finalOpening'].map(metric=>{
  const result=Object.fromEntries(Object.entries(groups).map(([key,f])=>[key,summarize(games.filter(g=>f(g[metric])))]));
  if(result.anyCore.n+result.noCore.n!==27||result.anyCore.wins+result.noCore.wins!==10)throw Error('Core partitions failed');
  for(const name of ['Ocular Occultist','Chronoclaws','Wicked Whispers','Entropic Continuity','Boneweb Egg']){
    const n=games.filter(g=>has(g[metric],name)).length;
    if(result[`${name}:withCore`].n+result[`${name}:withoutCore`].n!==n)throw Error('Conditional partitions failed');
  }
  return [metric,result];
}));
const run=`eval/runs/early-opening-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(run,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
await writeFile(`${run}/results.json`,JSON.stringify({scope:'27 historical control-second games; exploratory hypothesis on reused data, not prospective validation',core,metrics,notes:['Catacombs is a discovery opportunity, not a guaranteed body; results do not evaluate its discovery selection.','twoCore counts cards including same-name duplicates, not distinct names.','kept groups omit unknown replacement cards; use finalOpening for complete starting-hand comparisons.','All 27 games remain included; #78 and #136 are short wins ending on turn 2.','Core/without-core groups overlap with conditional card groups; do not add rows.']},null,2));
await writeFile(`${run}/manifest.json`,JSON.stringify({source,sourceSHA256:hash(bytes),generatorSHA256:hash(await readFile('src/eval-early-opening.mjs')),createdAt:new Date().toISOString(),checks:'27 complete hands, two core partitions plus ten conditional partitions conserved',formalPolicyChanged:false},null,2));
await writeFile(`${run}/generator.mjs`,await readFile('src/eval-early-opening.mjs'));
const rate=s=>s.n?`${s.wins}/${s.n}（${(s.winRate*100).toFixed(1)}%）`:'無樣本';
const rows=[['至少一張早期核心牌','anyCore'],['沒有早期核心牌','noCore'],['至少兩張早期核心牌（含同名）','twoCore'],['魔眼＋早期核心牌','Ocular Occultist:withCore'],['魔眼但無早期核心牌','Ocular Occultist:withoutCore'],['武器＋早期核心牌','Chronoclaws:withCore'],['武器但無早期核心牌','Chronoclaws:withoutCore'],['低語＋早期核心牌','Wicked Whispers:withCore'],['低語但無早期核心牌','Wicked Whispers:withoutCore'],['Entropic＋早期核心牌','Entropic Continuity:withCore'],['Entropic但無早期核心牌','Entropic Continuity:withoutCore'],['蛋＋早期核心牌','Boneweb Egg:withCore'],['蛋但無早期核心牌','Boneweb Egg:withoutCore']];
let md=`# 控制後手：前兩費啟動的留牌假說\n\n使用者2026-10-02裁定方向：零費墓穴、一費鴨嘴龍／派對、二費侍僧優先；蛋較差，三費素材偏慢，魔眼有早期節奏再留，四費以上不留；武器與buff尚不確定。以下為待驗證草案，不修改正式留牌程式。\n\n範圍只限目前討論的控制後手27場（10勝17敗），不自動套用非控制或先手。實際換牌時尚不知道對手完整牌型，事後控制分類不能當作即時已知資訊。\n\n## 草案\n\n|卡牌／角色|候選規則|\n|---|---|\n|墓穴|優先保留；發現時依當回合費用、Temporary限制及手牌搭配選能落地／形成鋪場連動的牌，不保證一定發現鋪場牌。|\n|鴨嘴龍、派對、侍僧|優先保留，目標是前兩回合有可执行的展開；不是僅數手牌中低費張數。|\n|蛋|預設換掉；硬下蛋的即時壓力弱，棄牌／亡語價值另計；有可靠棄牌並不犧牲前兩回合節奏才研究例外。|\n|行屍、魔像等三費素材|預設換掉，不為湊棄牌組合犧牲整個早期曲線。|\n|魔眼|已有前兩回合展開，且T3的棄牌目標有價值／不破壞曲線，再考慮留。只有魔眼＋行屍不自動構成保留理由。|\n|四費以上|先換；武器另列未裁定，現有保留樣本沒有早期核心搭配，不能據此宣稱武器有／無條件留的效果。|\n|buff|不單獨當啟動牌；看預計施放時的場面、費用、是否擠掉鋪場。低語另核實最低費棄牌目標，避免把墓穴／關鍵啟動牌送掉；留一張或兩張待測，不從小樣本直接定論。|\n\n## 現有資料核對\n\n早期核心集合固定為墓穴／鴨嘴龍／派對／侍僧。墓穴提供發現機會，並非保證的場面；侍僧單獨在手也不保證T1有動作。因此表內只代表手牌構成，未獨立證明前兩回合必能成功鋪場。\n\n|手牌組別|實際保留的原牌|完整換牌後起手|\n|---|---:|---:|\n`;
for(const [label,key]of rows)md+=`|${label}|${rate(metrics.kept[key])}|${rate(metrics.finalOpening[key])}|\n`;
md+=`\n完整換後起手有早期核心牌10/21、無核心0/6；魔眼有核心3/6、無核心0/3，支持優先研究你的方向。它們是重複使用既有資料後形成的探索性關聯，並非前瞻驗證或因果效果。#78／#136為T2结束的勝局、仍保留在統計；扣掉這兩場作敏感度檢查，有核心為8/19，無核心仍0/6，未修改原結果。\n\n武器有核心的換後起手僅2場（1勝），刻意保留武器且有核心為0場；兩種buff樣本也小，無法決定確切留牌例外。\n\n## 舊規則衝突與下一步\n\n目前mulligan.json仍含無早期曲線条件的魔眼＋行屍、低語＋侍僧、派對＋buff組合優先。新草案若實作，需要把「前兩回合能執行的計畫」放在組合加成前面，並為不同對局資訊設條件；不能只調高／調低單卡勝率權重。\n\n先由使用者重播裁定留牌與具體牌序，固定這次假說、另建未參與本次分析的新牌局／盤面做配對驗證；保留非控制象限作回歸檢查，不能用本27場重新評分當作新棋力證明。\n\n本次凍結結果：${run}/results.json，包含逐組GameId／歷史序號／勝負／95%Wilson與來源SHA。重跑：node src/eval-early-opening.mjs。正式策略及排位仍未改動。\n`;
await writeFile(`${run}/report.md`,md);
await writeFile('docs/control-second-early-opening-hypothesis.md',md);
console.log(JSON.stringify({run,report:'docs/control-second-early-opening-hypothesis.md',finalCore:metrics.finalOpening.anyCore,finalNoCore:metrics.finalOpening.noCore}));
