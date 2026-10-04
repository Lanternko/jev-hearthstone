import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cohortStats} from './mulligan-cohort.mjs';
import {wilson} from './eval-strength.mjs';
import {roles} from './describe.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const rulingsText=await readFile(join(root,'eval/history-matchup-rulings.json'),'utf8'),rulings=JSON.parse(rulingsText);
const input=join(root,'eval/runs',rulings.inputRun),gamesText=await readFile(join(input,'games.json'),'utf8'),games=JSON.parse(gamesText);
const hash=s=>createHash('sha256').update(s).digest('hex');
const decisions=new Map();
for(const group of rulings.groups)for(const n of group.ordinals){
  if(decisions.has(n))throw Error(`Duplicate ruling: ${n}`);
  if(!games.some(g=>g.ordinal===n))throw Error(`Foreign ruling: ${n}`);
  if(![null,'control','other'].includes(group.type))throw Error(`Invalid type: ${group.key}`);
  decisions.set(n,group);
}
for(const g of games){
  const rule=decisions.get(g.ordinal);if(!rule)throw Error(`Missing ruling: ${g.ordinal}`);
  g.matchup={type:rule.type,source:rule.source,group:rule.key,reason:rule.reason};
  const strong=g.evidence?.publicTurns?.find(t=>t.board.reduce((a,c)=>a+c.attack,0)>=10||t.board.some(c=>c.attack>=6&&c.health>=6));
  g.pressure={kind:rule.pressure??(rule.type==='other'?'board_or_damage':rule.type==='control'?'attrition':null),
    firstObservedLargeBoardTurn:strong?.turn??null,
    note:'Observed board is not an expected explosion deadline, inevitability proof or causal explanation.'};
}
const quadrant=(type,side)=>{
  const list=games.filter(g=>g.matchup.type===type&&g.initiative===side),wins=list.filter(g=>g.result==='Win').length;
  return {n:list.length,wins,losses:list.filter(g=>g.result==='Loss').length,ci95:wilson(wins,list.length),ids:list.map(g=>g.id)};
};
const quadrants=Object.fromEntries(['control','other'].flatMap(t=>['first','second'].map(s=>[`${t}_${s}`,quadrant(t,s)])));
const combos=JSON.parse(await readFile(join(root,'decks/warlock-discard/mulligan.json'),'utf8')).combos??[];
const forCards=games.filter(g=>g.evidence).map(g=>({...g,receiptComplete:g.evidence.receiptComplete,
  offered:g.evidence.opening?.offered.map(c=>({...c,roles:roles({...c,text:c.text??''})}))??[],
  kept:g.evidence.kept.map(c=>({...c,roles:roles({...c,text:c.text??''})}))}));
const cardStats=cohortStats(forCards,{combos}),pending=games.filter(g=>!g.matchup.type);
const dir=join(root,'eval/runs',`history-classified-${new Date().toISOString().replace(/[:.]/g,'-')}`);await mkdir(dir,{recursive:true});
await writeFile(join(dir,'games.json'),JSON.stringify(games,null,2));
await writeFile(join(dir,'rulings.json'),rulingsText);
await writeFile(join(dir,'stats.json'),JSON.stringify({n:games.length,classified:games.length-pending.length,pending:pending.length,quadrants,cardStats},null,2));
await writeFile(join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),inputRun:rulings.inputRun,
  inputSHA256:hash(gamesText),rulingsSHA256:hash(rulingsText),reporterSHA256:hash(await readFile(join(root,'src/report-history-quadrants.mjs'))),
  scope:'All historical tracker games, not new-version winrate; outcome is HDT, initiative is HDT Coin. Includes manual and interrupted games. No launch or model calls.'},null,2));
const pct=n=>n==null?'—':`${(100*n).toFixed(1)}%`;
const date=g=>g.start.slice(0,16).replace('T',' ');
const early=g=>g.evidence?.earlyTurns.map(t=>`T${t.turn}: ${t.plays.map(c=>c.name).join('、')||'無出牌'}`).join('；')??'缺replay';
const allCards=g=>[...new Set(g.evidence?.plays.map(c=>c.name)??[])].join('、')||'沒有已公開牌';
const report=`# 196 場歷史四象限分類\n\n已分類 ${games.length-pending.length}/${games.length}；待使用者裁定 ${pending.length}。場次編號是按開始時間排序的歷史序號，不是舊 batch-game 編號。\n\n| 類型 | 先手勝／場 | 後手勝／場 |\n|---|---:|---:|\n${['control','other'].map(t=>`| ${t==='control'?'控制':'非控制'} | ${quadrants[t+'_first'].wins}/${quadrants[t+'_first'].n} | ${quadrants[t+'_second'].wins}/${quadrants[t+'_second'].n} |`).join('\n')}\n\n這是全部歷史描述，含人工、舊版及中斷局，不能當成新版策略勝率。分類只看公開出牌與場面，40血在開局加血效果完成後、首次玩家出牌前讀取；不把硬幣當控制跳費、隨機飛彈當全體清場。Combo有時間壓力，按使用者判準列非控制並另標延遲爆發；不從觀察牌序假定固定第六回合必爆發。\n\n## 待裁定\n\n${rulings.groups.filter(r=>!r.type).map(r=>`### ${r.key}（${r.ordinals.length} 場）\n\n${r.reason}\n\n| 序號 | 時間 | 對手 | 起始血量 | 前三回合 | 已公開牌 |\n|---:|---|---|---:|---|---|\n${games.filter(g=>r.ordinals.includes(g.ordinal)).map(g=>`| ${g.ordinal} | ${date(g)} | ${g.opponentClass} | ${g.evidence?.initialHealth??'—'} | ${early(g)} | ${allCards(g)} |`).join('\n')}`).join('\n\n')}\n\n## 全部196場的分類依據\n\n| 序號 | 時間 | 對手 | 先後手 | 勝負 | 分類 | 判準組 |\n|---:|---|---|---|---|---|---|\n${games.map(g=>`| ${g.ordinal} | ${date(g)} | ${g.opponentClass} | ${g.initiative==='first'?'先手':'後手'} | ${g.result} | ${g.matchup.type==='control'?'控制':g.matchup.type==='other'?'非控制':'待裁定'} | ${g.matchup.group} |`).join('\n')}\n\n## 每卡留牌（只用完整原起手保留回報）\n\n共 ${cardStats.eligibleGames} 場可核實，未分類 ${cardStats.unclassifiedGames.length} 場不塞進非控制。缺完整回報的場次仍能做對局分類，但不能做每卡刻意保留分析。樣本按局，不按重複卡數；含不同版本與起手組合，觀察勝率不是保留該卡的因果收益。\n\n${Object.entries(cardStats.quadrants).map(([key,g])=>`### ${key}\n\n| 卡牌 | 起手出現局數 | 保留勝／局 | 保留率 | 保留勝率 | 95% Wilson區間 |\n|---|---:|---:|---:|---:|---|\n${Object.entries(g.cards).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>`| ${name} | ${c.offeredGames} | ${c.keptWins}/${c.keptGames} | ${pct(c.keepRate)} | ${pct(c.keptWinRate)} | ${c.keptCI95?.map(pct).join('–')??'—'} |`).join('\n')}`).join('\n\n')}\n\n重跑：node src/eval-history-quadrants.mjs（建立新的證據目錄）；對齊 rulings inputRun 後 node src/report-history-quadrants.mjs（建立新報告，不覆寫原批次）。沒有改正式策略、開局或呼叫模型。\n`;
await writeFile(join(dir,'report.md'),report);
console.log(JSON.stringify({dir,n:games.length,classified:games.length-pending.length,pending:pending.length,
  quadrants:Object.fromEntries(Object.entries(quadrants).map(([k,g])=>[k,{n:g.n,wins:g.wins}]))}));
