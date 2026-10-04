import {wilson} from './eval-strength.mjs';
const METRICS={original:'originalOpeningComplete',kept:'receiptComplete',final:'finalOpeningComplete'};
const hand=(g,key)=>key==='original'?g.offered:key==='kept'?g.kept:g.finalOpening;
const summarize=gs=>{const n=gs.length,wins=gs.filter(g=>g.result==='Win').length;
  return {n,wins,winRate:n?wins/n:null,ci95:wilson(wins,n),ids:gs.map(g=>g.id)};};
export function openingCardStats(games,{cardNames=[]}={}){
  const ids=new Set();for(const g of games){if(ids.has(g.id))throw Error('Duplicate game');ids.add(g.id);}
  const valid=games.filter(g=>['Win','Loss'].includes(g.result)&&['first','second'].includes(g.initiative)&&['control','other'].includes(g.matchup?.type));
  const names=[...new Set([...cardNames,...valid.flatMap(g=>['original','kept','final'].flatMap(k=>(hand(g,k)??[]).map(c=>c.name)))])].sort();
  const quadrants=Object.fromEntries(['control','other'].flatMap(type=>['first','second'].map(side=>{
    const qs=valid.filter(g=>g.matchup.type===type&&g.initiative===side),baseline=summarize(qs);
    const metrics=Object.fromEntries(Object.entries(METRICS).map(([key,flag])=>{
      const eligible=qs.filter(g=>g[flag]===true);
      const base=summarize(eligible),cards=Object.fromEntries(names.map(name=>{
        const has=eligible.filter(g=>(hand(g,key)??[]).some(c=>c.name===name)),hasIds=new Set(has.map(g=>g.id));
        const absent=eligible.filter(g=>!hasIds.has(g.id)),present=summarize(has),without=summarize(absent);
        return [name,{present,without,relativeToMetricBaseline:present.winRate==null||base.winRate==null?null:present.winRate-base.winRate}];
      }));
      return [key,{baseline:base,excluded:qs.filter(g=>!eligible.includes(g)).map(g=>g.id),cards}];
    }));
    return [`${type}_${side}`,{baseline,metrics}];
  })));
  return {n:games.length,classifiedValid:valid.length,unknownExcluded:games.filter(g=>!valid.includes(g)).map(g=>g.id),cardNames:names,quadrants,
    definitions:{original:'Offered before mulligan',kept:'Original cards kept, confirmed by server receipt',final:'Post-mulligan hand at first TURN=1 MAIN_READY; excludes Coin and first turn draw'},
    note:'Counts are games, not copies. Kept and final overlap; neither is causal keep-versus-replace uplift. Each metric has its own valid-game denominator.'};
}
