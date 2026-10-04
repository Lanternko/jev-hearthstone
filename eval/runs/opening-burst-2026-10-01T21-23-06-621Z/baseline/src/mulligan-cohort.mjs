import {wilson} from './eval-strength.mjs';
// Read the server's kept-originals receipt, never infer success from mouse commands.
export function keptReceipt(text,{choiceId,playerId,offeredIds}) {
  let packet=null;
  const packets=[];
  for(const line of text.split(/\r?\n/)){
    if(!line.includes('GameState.DebugPrintEntitiesChosen()'))continue;
    const h=line.match(/- id=(\d+) Player=.* EntitiesCount=(\d+)/);
    if(h){packet={choiceId:Number(h[1]),count:Number(h[2]),entries:[]};packets.push(packet);continue;}
    const e=line.match(/Entities\[\d+\]=.*\bid=(\d+)\b.*\bplayer=(\d+)\b/);
    if(e&&packet)packet.entries.push({id:Number(e[1]),player:Number(e[2])});
  }
  const r=packets.filter(r=>r.choiceId===choiceId).at(-1);
  if(!r)return {complete:false,reason:'missing_receipt'};
  const ids=r.entries.map(e=>e.id);
  if(ids.length!==r.count||new Set(ids).size!==ids.length
    ||r.entries.some(e=>e.player!==playerId)||ids.some(id=>!offeredIds.includes(id)))
    return {complete:false,reason:'invalid_or_incomplete_receipt'};
  return {complete:true,kept:ids};
}
export function cohortStats(games,{combos=[]}={}) {
  const ids=new Set();
  for(const g of games){if(ids.has(g.id))throw Error('duplicate game');ids.add(g.id);}
  const group=(gs)=>{
    const wins=gs.filter(g=>g.result==='Win').length,n=gs.length;
    const cards={};
    for(const g of gs){
      const offered=new Set(g.offered.map(c=>c.name)),kept=new Set(g.kept.map(c=>c.name));
      for(const name of offered){const c=cards[name]??={offeredGames:0,keptGames:0,keptWins:0,replacedGames:0,replacedWins:0};
        c.offeredGames++;if(kept.has(name)){c.keptGames++;c.keptWins+=g.result==='Win';}
        else {c.replacedGames++;c.replacedWins+=g.result==='Win';}}
    }
    for(const c of Object.values(cards)){
      c.keepRate=c.keptGames/c.offeredGames;
      c.keptWinRate=c.keptGames?c.keptWins/c.keptGames:null;
      c.keptCI95=wilson(c.keptWins,c.keptGames);
      c.relativeToCohort=c.keptWinRate==null||!n?null:c.keptWinRate-wins/n;
      c.replacedWinRate=c.replacedGames?c.replacedWins/c.replacedGames:null;
    }
    const match=(c,name)=>name.startsWith('role:')?(c.roles??[]).includes(name.slice(5)):c.name===name;
    const hasPair=(hand,pair)=>hand.some((c,i)=>match(c,pair[0])&&hand.some((d,j)=>i!==j&&match(d,pair[1])));
    const combinationStats=combos.map(pair=>{
      const offered=gs.filter(g=>hasPair(g.offered,pair)),kept=offered.filter(g=>hasPair(g.kept,pair));
      const w=kept.filter(g=>g.result==='Win').length;
      return {pair,offeredGames:offered.length,keptGames:kept.length,keptWins:w,
        keepRate:offered.length?kept.length/offered.length:null,keptWinRate:kept.length?w/kept.length:null,ci95:wilson(w,kept.length)};
    });
    return {n,wins,winRate:n?wins/n:null,ci95:wilson(wins,n),cards,combos:combinationStats};
  };
  const eligible=games.filter(g=>g.receiptComplete&&['Win','Loss'].includes(g.result)&&['first','second'].includes(g.initiative));
  const quadrants=Object.fromEntries(['control','other'].flatMap(type=>['first','second'].map(side=>[
    `${type}_${side}`,group(eligible.filter(g=>g.matchup?.type===type&&g.initiative===side))])));
  return {eligibleGames:eligible.length,excludedGames:games.filter(g=>!eligible.includes(g)).map(g=>g.id),
    unclassifiedGames:eligible.filter(g=>!['control','other'].includes(g.matchup?.type)).map(g=>g.id),
    quadrants,initiative:Object.fromEntries(['first','second'].map(side=>[side,group(eligible.filter(g=>g.initiative===side))])),
    note:'Per-card counts are game-level, not copy-level. Kept means server-confirmed originals, excludes replacements drawn. Observational win rates are not causal keep-vs-toss effects. Unknown opponents are not other.'};
}
