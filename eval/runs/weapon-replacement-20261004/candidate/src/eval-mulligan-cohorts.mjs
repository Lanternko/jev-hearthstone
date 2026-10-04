import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePower,publicState,isCoin} from './power.mjs';
import {keptReceipt,cohortStats} from './mulligan-cohort.mjs';
import {roles} from './describe.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const runs=['ranked-2026-10-01T12-42-04-012Z','ranked-2026-10-01T15-41-25-602Z'];
const cards=Object.fromEntries(JSON.parse(await readFile(join(root,'data/cards.enUS.json'),'utf8')).map(c=>[c.id,c]));
const mulliganText=await readFile(join(root,'decks/warlock-discard/mulligan.json'),'utf8');
const combos=JSON.parse(mulliganText).combos??[];
const hash=s=>createHash('sha256').update(s).digest('hex');
const annotations=await readFile(join(root,'eval/mulligan-matchups.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;});
const dir=join(root,'eval/runs',`mulligan-cohorts-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(dir,{recursive:true});
const games=[],sources={},excluded=[];
// This original, preserved session predates the archive fix. Restore missing openings
// from it rather than selectively dropping games handled by deterministic rules.
const originalPath=join('D:/遊戲/Hearthstone/Logs','Hearthstone_2026_10_01_20_34_01','Power.log');
const original=await readFile(originalPath,'utf8');
sources.originalSessionPowerLog=hash(original);
const starts=[...original.matchAll(/^D (\d\d:\d\d:\d\d\.\d+) GameState\.DebugPrintPower\(\) -\s*CREATE_GAME\s*$/gm)];
let day=1,previousTime='';
const originalGames=starts.map((m,i)=>{
  const time=m[1];if(previousTime&&time<previousTime)day++;previousTime=time;
  return {utc:Date.parse(`2026-10-${String(day).padStart(2,'0')}T${time.slice(0,12)}+08:00`),
    text:original.slice(m.index,starts[i+1]?.index??original.length)};
});
for(const run of runs){
  const d=join(root,'runtime',run),statusText=await readFile(join(d,'status.json'),'utf8');
  sources[`${run}/status.json`]=hash(statusText);
  const status=JSON.parse(statusText);
  for(const result of status.results){
    const id=`${run}/game-${String(result.ordinal).padStart(4,'0')}`;
    if(!['Win','Loss'].includes(result.result)){excluded.push({id,reason:'not_normal_completed_result',result:result.result});continue;}
    const text=await readFile(join(d,`game-${String(result.ordinal).padStart(4,'0')}-decisions.jsonl`),'utf8');
    const rows=text.trim().split('\n').filter(Boolean).map(JSON.parse);
    sources[`${id}-decisions.jsonl`]=hash(text);
    let opening=rows.find(r=>r.state?.choice?.type==='MULLIGAN'&&r.state.choice.playerId===r.state.me.playerId);
    const originalGame=originalGames.map(g=>({...g,diff:Math.abs(g.utc-Date.parse(result.since))})).sort((a,b)=>a.diff-b.diff)[0];
    const usableOriginal=originalGame?.diff<120000?originalGame:null;
    let reconstructed=false;
    if(!opening&&usableOriginal){
      const boundary=usableOriginal.text.search(/^.*GameState\.SendChoices\(\) - id=\d+ ChoiceType=MULLIGAN.*$/m);
      if(boundary>=0&&rows[0]?.state?.me?.playerId){
        const state=publicState(parsePower(usableOriginal.text.slice(0,boundary)),rows[0].state.me.playerId,cards);
        if(state.choice?.type==='MULLIGAN'){opening={state};reconstructed=true;}
      }
    }
    if(!opening){excluded.push({id,reason:'missing_opening_state'});continue;}
    const archivedPower=await readFile(join(d,`game-${String(result.ordinal).padStart(4,'0')}-Power.log`),'utf8');
    sources[`${id}-Power.log`]=hash(archivedPower);
    const power=usableOriginal?.text??archivedPower;
    const st=opening.state,offer=st.choice.entities.filter(c=>!isCoin(c));
    const receipt=keptReceipt(power,{choiceId:st.choice.id,playerId:st.me.playerId,offeredIds:st.choice.entities.map(c=>c.entityId)});
    const parsed=parsePower(power);
    const player=[...parsed.entities.values()].find(e=>e.playerId===st.me.playerId);
    const enemy=[...parsed.entities.values()].find(e=>e.playerId===st.opponent.playerId);
    const initiative=player?.tags.FIRST_PLAYER==='1'?'first':enemy?.tags.FIRST_PLAYER==='1'?'second':
      (st.me.hand??[]).some(isCoin)||offer.length===4?'second':offer.length===3?'first':null;
    const observed=new Map();
    for(const row of rows)for(const c of row.state?.opponent?.board??[])
      if(c.cardId&&!['HERO','HERO_POWER'].includes(c.CARDTYPE))observed.set(c.cardId,{cardId:c.cardId,name:c.name??cards[c.cardId]?.name});
    // Review evidence only: known card IDs in public PLAY blocks (no hidden hand export).
    for(const line of power.split('\n'))if(/GameState.DebugPrintPower.*BLOCK_START BlockType=PLAY/.test(line)){
      const m=line.match(/Entity=\[.*\bcardId=(\S+) player=(\d+)\]/);
      if(m&&Number(m[2])===st.opponent.playerId&&cards[m[1]]?.type!=='HERO_POWER')
        observed.set(m[1],{cardId:m[1],name:cards[m[1]]?.name});
      const entity=line.match(/Entity=\[.*\bid=(\d+)\b.*\bplayer=(\d+)\]/);
      if(entity&&Number(entity[2])===st.opponent.playerId){
        const revealed=parsed.entities.get(Number(entity[1]));
        if(revealed?.cardId&&cards[revealed.cardId]?.type!=='HERO_POWER')
          observed.set(revealed.cardId,{cardId:revealed.cardId,name:cards[revealed.cardId]?.name});
      }
    }
    const matchup=annotations[id]??{type:null,evidence:[],source:null};
    if(matchup.type!=null&&(!['control','other'].includes(matchup.type)||!matchup.evidence?.length||!matchup.source))throw Error(`Unsubstantiated matchup annotation: ${id}`);
    if(matchup.type!=null&&!matchup.evidence.every(name=>[...observed.values()].some(c=>c.name===name)))
      throw Error(`Matchup evidence was not publicly observed: ${id}`);
    const card=c=>({entityId:c.entityId,cardId:c.cardId,name:c.name??cards[c.cardId]?.name??c.cardId,roles:roles(c)});
    const kept=offer.filter(c=>receipt.kept?.includes(c.entityId));
    // The first queued model answer may change before the loop executes it.
    // Compare the last recorded mulligan decision, not the first speculative answer.
    const finalRequest=rows.filter(r=>r.action?.type==='MULLIGAN'&&r.action.choiceId===st.choice.id).at(-1)?.action;
    const requested=finalRequest?offer.filter(c=>!finalRequest.replace.includes(c.entityId)).map(c=>c.entityId):null;
    games.push({id,result:result.result,plannerVersion:status.plannerVersion,opponentClass:st.opponent.heroClass,
      openingSource:reconstructed?'original Power.log before SendChoices':'recorded model decision',
      originalStartUTC:usableOriginal?new Date(usableOriginal.utc).toISOString():null,
      initiative,initiativeEvidence:player?.tags.FIRST_PLAYER==='1'||enemy?.tags.FIRST_PLAYER==='1'?'FIRST_PLAYER tag':'own opening size/visible Coin',
      receiptComplete:receipt.complete,receiptFailure:receipt.reason??null,offered:offer.map(card),kept:kept.map(card),
      requestedKept:requested,mulliganMisfire:receipt.complete&&requested!=null&&
        JSON.stringify([...requested].sort((a,b)=>a-b))!==JSON.stringify(kept.map(c=>c.entityId).sort((a,b)=>a-b)),
      matchup,observedOpponentCards:[...observed.values()],
      openingOpponent:{heroClass:st.opponent.heroClass,deckCount:st.opponent.deckCount,hero:st.opponent.board.find(c=>c.CARDTYPE==='HERO')?.name}});
  }
}
const clean=games.filter(g=>!g.mulliganMisfire),stats=cohortStats(clean,{combos});
const manifest={createdAt:new Date().toISOString(),runs,sourceHashes:sources,annotationsHash:hash(JSON.stringify(annotations)),
  normalResultGames:games.length,excluded,misfires:games.filter(g=>g.mulliganMisfire).map(g=>g.id),originalPath,
  mulliganMetadataHash:hash(mulliganText),classification:'Inferred broad play styles from public played-card evidence; not verified full archetypes. Control means removal/healing/resource attrition; aggro, tempo and identifiable combo routes are other. Early wins may be unclassifiable, introducing censoring bias.',
  scope:'Paused ranked batches only. Outcome from saved normal-completion status; kept originals from authoritative Power.log receipt. No games launched. Postgame labels only for analysis, never exposed to live mulligan.'};
await writeFile(join(dir,'games.json'),JSON.stringify(games,null,2));
await writeFile(join(dir,'matchup-annotations.json'),JSON.stringify(annotations,null,2));
await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(join(dir,'stats.json'),JSON.stringify(stats,null,2));
const pct=n=>n==null?'—':`${(100*n).toFixed(1)}%`;
const report=`# 四象限留牌資料盤點\n\n${manifest.createdAt}；正常完成 ${games.length} 場，receipt/先後手可核實 ${stats.eligibleGames} 場，對手未分類 ${stats.unclassifiedGames.length} 場。中斷／故障局與換牌 misfire 不用於策略統計。\n\n| 類型 | 先手 | 後手 |\n|---|---|---|\n${['control','other'].map(t=>`| ${t} | ${stats.quadrants[t+'_first'].wins}/${stats.quadrants[t+'_first'].n}（${pct(stats.quadrants[t+'_first'].winRate)}） | ${stats.quadrants[t+'_second'].wins}/${stats.quadrants[t+'_second'].n}（${pct(stats.quadrants[t+'_second'].winRate)}） |`).join('\n')}\n\n對手未知不歸入 other。games.json 包含已公開對手牌的分類證據；eval/mulligan-matchups.json 可記錄有來源的事後裁定，再重跑產生新批次。這些事後分類不可回灌即時留牌。\n\n## 不含對手分類的先後手盤點\n\n| 先後手 | 勝／場 | 勝率 | 95% Wilson 區間 |\n|---|---:|---:|---|\n${['first','second'].map(s=>{const g=stats.initiative[s];return `| ${s} | ${g.wins}/${g.n} | ${pct(g.winRate)} | ${g.ci95?.map(pct).join('–')??'—'} |`;}).join('\n')}\n\n每卡刻意保留勝率、保留率、樣本數、Wilson 區間、相對同群平均的差值見 stats.json。相同卡的兩份只按一局計數。這是伺服器確認「原起手留下的卡」，不包含換入的新卡；不能與將換入卡也計入的公開 Opening-hand WR 混用。沒有從小樣本提升為正式留牌規則；留／換觀察差異不是因果收益。\n\n外部統計：HSGuru 公開抓取回覆 403；HSReplay G-V2 官方頁仍僅支援標準。現有牌組 JSON 為匯總資料，沒有四象限樣本數，故未偽造四格每卡數字。\n\n重跑：node src/eval-mulligan-cohorts.mjs。輸出採新時間戳，不修改原批次或正式策略。\n`;
await writeFile(join(dir,'report.md'),report);
const tables=Object.entries(stats.quadrants).map(([key,g])=>`\n\n## ${key} 每卡留牌\n\n僅觀察性資料。對手類型是公開牌推定；不能讀成已核實的完整牌型，提早結束的勝局較容易無法分類。\n\n| 卡牌 | 起手出現場數 | 刻意保留勝／場 | 保留率 | 保留勝率 | 95% 區間 | 相對象限均值 |\n|---|---:|---:|---:|---:|---|---:|\n${Object.entries(g.cards).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>`| ${name} | ${c.offeredGames} | ${c.keptWins}/${c.keptGames} | ${pct(c.keepRate)} | ${pct(c.keptWinRate)} | ${c.keptCI95?.map(pct).join('–')??'—'} | ${c.relativeToCohort==null?'—':`${(100*c.relativeToCohort).toFixed(1)} pp`} |`).join('\n')}\n\n| 組合 | 出現場數 | 兩張皆保留勝／場 | 勝率 | 95% 區間 |\n|---|---:|---:|---:|---|\n${g.combos.map(c=>`| ${c.pair.join(' + ')} | ${c.offeredGames} | ${c.keptWins}/${c.keptGames} | ${pct(c.keptWinRate)} | ${c.ci95?.map(pct).join('–')??'—'} |`).join('\n')}`).join('');
await writeFile(join(dir,'report.md'),report+tables);
console.log(JSON.stringify({dir,normalGames:games.length,eligible:stats.eligibleGames,unclassified:stats.unclassifiedGames.length,excluded,
  initiative:Object.fromEntries(Object.entries(stats.initiative).map(([s,g])=>[s,{n:g.n,wins:g.wins,winRate:g.winRate}]))},null,2));
