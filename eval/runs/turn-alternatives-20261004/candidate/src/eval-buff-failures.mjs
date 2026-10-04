import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run=process.argv[2];if(!/^control-tools-[\w-]+$/.test(run??''))throw Error('Expected control timeline run');
const source=`eval/runs/${run}/games.json`,bytes=await readFile(source),games=JSON.parse(bytes);
const buffNames=['Wicked Whispers','Entropic Continuity'],isBuff=c=>buffNames.includes(c?.name);
const missed=games.filter(g=>g.initiative==='second'&&g.ownTurnFive&&(g.firstBuffTurn===null||g.firstBuffTurn>4));
if(JSON.stringify(missed.map(g=>g.ordinal))!==JSON.stringify([5,22,74,97,151]))throw Error('Expected fixed five cases');
const rows=missed.map(g=>{
  if(!g.openingBoundary)throw Error('Missing post-mulligan boundary');
  const final=g.finalOpening.filter(isBuff),offered=g.offered.filter(isBuff);
  const entries=g.handEntries.filter(e=>e.sequence>g.openingBoundary.sequence&&isBuff(e.card));
  const first=final.length?{phase:'finalOpening',turn:0,cards:final}:entries.length?{phase:'enteredHand',...entries[0]}:null;
  const earlyStates=[...g.turnStarts.filter(t=>t.side==='own'&&t.turn<=4).map(t=>t.state.own),
    ...g.actions.filter(a=>a.side==='own'&&a.depth===0&&a.turn<=4).flatMap(a=>[a.before.own,a.after?.own].filter(Boolean))];
  const earlyAvailable=earlyStates.some(s=>s.hand.some(isBuff));
  const removedEarly=g.handTransitions.filter(e=>e.sequence>g.openingBoundary.sequence&&e.turn<=4&&isBuff(e.card));
  if(g.ordinal!==74&&(earlyAvailable||removedEarly.length))throw Error('Unexpected early buff availability');
  return {ordinal:g.ordinal,result:g.result,url:g.url,offeredBuff:offered,keptBuff:g.kept.filter(isBuff),finalBuff:final,
    firstAvailable:first,earlyAvailable,removedEarly,firstCastTurn:g.firstBuffTurn,
    earlyTurns:g.turnStarts.filter(t=>t.side==='own'&&t.turn<=5),buffEntries:entries};
});
const platy=games.filter(g=>g.initiative==='second').flatMap(g=>g.buffPlays.filter(a=>a.turn===1&&a.before.own.board.length===1&&a.before.own.board[0].name==='Platysaur').map(a=>({
  ordinal:g.ordinal,result:g.result,url:g.url,action:a,actualDiscard:a.handToGraveyard.filter(c=>c.entityId!==a.entityId),
  newlySummoned:a.after.own.board.filter(c=>!a.before.own.board.some(b=>b.entityId===c.entityId))})));
if(platy.length!==4)throw Error('Single-Platysaur sample changed');
const game74=games.find(g=>g.ordinal===74),tap=game74.actions.find(a=>a.side==='own'&&a.depth===0&&a.turn===2&&a.card?.name==='Life Tap');
if(tap.before.own.mana!==2||tap.before.own.board.length!==5||tap.before.own.board.some(c=>c.attack!==1||c.health!==1||c.dormant)||!tap.before.own.hand.some(c=>c.name==='Entropic Continuity'&&c.cost===1))throw Error('T2 five-body buff opportunity mismatch');
const maestra=tap.before.opponent.board.find(c=>c.name==='Maestra, Mask Merchant');
if(maestra.attack!==3||maestra.health!==2)throw Error('Maestra immediate trade witness changed');
const attacks=game74.actions.filter(a=>a.side==='own'&&a.kind==='ATTACK'&&a.depth===0&&a.turn===2&&a.sequence>tap.sequence);
if(attacks.filter(a=>a.targetLabel==='Maestra, Mask Merchant').length!==2||attacks.filter(a=>a.targetLabel==='opponent hero').length!==3)throw Error('Observed attack witness changed');
const immediateWitness={ordinal:74,point:tap.sequence,actual:'Tap costing 2; two 1/1s trade into 3/2 Maestra, remaining three 1/1s hit face for 3',
  alternative:'Entropic costing 1 before attacks; one 2/2 trades into 3/2 Maestra, remaining four 2/2s could hit face for 8',
  actualFaceDamage:3,alternativeFaceDamage:8,additionalFaceDamage:5,additionalBody:'one surviving 2/2',manaLeft:1,
  limits:'Local conditional arithmetic witness only. Alternative forgoes the Tap draw; does not replay opponent responses or prove a different game outcome. Original five attackers each actually attacked, so readiness is verified.'};
const dir=`eval/runs/buff-failure-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/results.json`,JSON.stringify({rows,singlePlatysaur:platy,immediateWitness},null,2));
const sha=b=>createHash('sha256').update(b).digest('hex');
await writeFile(`${dir}/manifest.json`,JSON.stringify({source,sourceSHA256:sha(bytes),generatorSHA256:sha(await readFile('src/eval-buff-failures.mjs')),createdAt:new Date().toISOString(),checks:'Five late-buff cases conserved; four single-Platysaur T1 cases conserved; hand entry excludes pre-mulligan cards; T2 Maestra stats, mana and all five observed attackers verified',formalPolicyChanged:false},null,2));
await writeFile(`${dir}/generator.mjs`,await readFile('src/eval-buff-failures.mjs'));
const explanations={
  5:'原發／換後都沒有buff；T5正常抽到Entropic，當回合補場後施放。早期有場面，缺的是buff。',
  22:'原發有Entropic但換掉，當時原起手另為雙蛋＋Soul Barrage、沒有早期核心；換後才出現鴨嘴龍＋侍僧。T5重新抽到Entropic並施放。不能把換後搭配當成換牌時已知。',
  74:'原牌Entropic與Party一起保留；T2五隻1/1、兩費可用，卻選Life Tap耗光法力，再攻擊；原Entropic直到T6才施放。存在明确早期機會，並非抽不到或沒場面。',
  97:'原發／換後無buff，T1–T4都未拿到；T5場面已被清空，魔眼重建後Life Tap抽到低語，法力已用完，因此T6才施放。不是早期有低語卻沒有牌可丟。',
  151:'原發有低語但換掉，原起手沒有早期核心；T6 Soularium抽到Temporary低語時法力已用完，回合末Temporary被棄、Hand連動抽到Entropic，T7才施放。是晚取得及費用／Temporary問題，非早期丟錯。',
};
let md='# 控制後手：buff晚打與低語素材逐局追查\n\n本次回答使用者「未抽到、沒場面、低語丟錯／無牌可丟，以及T2buff留牌搭配」；沿用固定54場控制時間線，只分析既定5場無T1–T4buff的後手局及4場T1單鴨嘴龍buff，沒有調正式規則或啟動遊戲。\n\n## 五場未早buff的原因\n\n4場T4前沒有可用buff：其中2場原本沒發到、2場原發buff被換掉；1場已有buff＋場面卻長期延後。五場都不是T1–T4施放低語失誤造成，因為當時根本沒有施放低語。缺buff不等於全局從未抽到。\n\n|重播|原發buff|換牌後buff|首次可用／首次施放|判讀|\n|---|---|---|---|---|\n';
const names=cs=>cs.map(c=>c.name).join('、')||'無';
for(const r of rows)md+=`|[#${r.ordinal}](${r.url})|${names(r.offeredBuff)}|${names(r.finalBuff)}|${r.ordinal===74?'起手已有':`T${r.firstAvailable.turn}`}／T${r.firstCastTurn}|${explanations[r.ordinal]}|\n`;
md+='\n### #74可核對的T2機會\n\n在Life Tap前，Entropic已在手、兩費可用，我方五隻1/1、對手Maestra為3/2。實際先Tap，再犧牲兩隻1/1解Maestra、另三隻各打臉1。若改為一費Entropic再按相同解場意圖，五隻變2/2，一隻即可換掉Maestra，其餘四隻可打臉8點；局部比實際多5點並多留一隻2/2，尚餘一費，但少了Tap抽牌。這是可確認的即時差異，不代表整局一定改勝；也沒有證明這局由目前新版Jev操作。\n\n## T1鴨嘴龍＋低語的四場\n\n|重播／勝負|實際棄牌|低語後場面|只buff一隻？|\n|---|---|---|---|\n';
for(const p of platy)md+=`|[#${p.ordinal}](${p.url})／${p.result==='Win'?'勝':'敗'}|${names(p.actualDiscard)}|${p.action.after.own.board.map(c=>`${c.name} ${c.attack}/${c.health}`).join('、')}|${p.newlySummoned.length?'否，棄牌另補場':'是'}|\n`;
md+='\n#26棄行屍，#177棄侍僧，召喚後新手下也被buff，不能算只buff鴨嘴龍。#78棄Party、#85棄Catacombs，沒有補場；屬可疑資源配置，即使兩局最後勝利也不證明這一步最佳。#78 Soulfire／Party最低費並列，不能把自動棄牌結果稱為Jev主動選錯目標；#85兩張0費Catacombs在手，低語必然優先棄其中一張，施放前可已知風險。\n\n這四局3勝1敗，但包含T2短勝及不同棄牌收益，不能用此比例支持／反對T1鴨嘴龍buff。應按实际棄牌与補場效果分開裁定。\n\n## 留牌與施放草案\n\n- Entropic無棄牌代價：有Party（T1三隻）或明確T1／T2多體展開時可列保留候選；單有鴨嘴龍／墓穴不是足夠的搭配保證。墓穴能發現什麼尚未知。\n- 低語除場面與費用外，必須推算施放後手牌最低費：硬幣／墓穴先處理、同費並列的風險、是否會送掉下一回合鋪場；可棄行屍／魔像／侍僧／蛋形成補場時價值更高。沒有牌可丟與有牌但代價差是不同情況。\n- T1只有鴨嘴龍、低語沒有正收益棄牌補場時，優先研究保存硬幣／buff、T2先鋪再buff。若低語當場棄出素材並補場，不因T1而一律禁用。\n- T1 Party→T2 buff可行；T1鴨嘴龍→T2 Party＋buff剛好兩費；T1鴨嘴龍→T2侍僧＋buff共三費，通常需保留硬幣或延至T3，不能僅以「前兩費有事做」自動留buff。\n\n所以候選規則應是「能在T2／T3多體buff，且不破壞曲線／棄牌目標」，而不是有任何一張早期牌就留所有buff。#74是直接的多體buff延後檢查案例；另外四場須追查留牌與取得buff速度。\n\n## 複驗\n\n'+`原時間線${source}，含來源replay SHA和解析器快照；本次凍結${dir}，results.json保存原發／保留／換後、HAND進入時點、低語實際棄牌、施放前後盤面與#74局部算術見證。入手事件同時解析TAG_CHANGE與SHOW_ENTITY的tag=ZONE HAND，並以首次TURN=1 MAIN_READY排除換牌前入手事件。\n\n重跑：node src/eval-buff-failures.mjs ${run}。資料皆為歷史觀察，不是留buff因果收益；未改舊結果、正式策略、留牌權重或排位狀態。\n`;
await writeFile(`${dir}/report.md`,md);await writeFile('docs/buff-timing-failure-review-20261002.md',md);
console.log(JSON.stringify({dir,report:'docs/buff-timing-failure-review-20261002.md',cases:rows.map(r=>({ordinal:r.ordinal,earlyAvailable:r.earlyAvailable,first:r.firstAvailable?.turn,cast:r.firstCastTurn})),singlePlaty:platy.map(p=>({ordinal:p.ordinal,discard:names(p.actualDiscard),bodiesAfter:p.action.after.own.board.length}))}));
