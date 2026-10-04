import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const VERSIONS=['baseline-20261001','silverfish-v1'];
export function schedule(blocks=400,seed=20261001){
  if(!Number.isInteger(blocks)||blocks<1)throw Error('blocks must be positive');
  let x=seed>>>0;
  return Array.from({length:blocks},(_,i)=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    const versions=x<2147483648?VERSIONS:[...VERSIONS].reverse();
    return versions.map((version,j)=>({trial:2*i+j+1,block:i+1,version,result:null}));
  }).flat();
}
export function wilson(w,n){
  if(!Number.isInteger(w)||!Number.isInteger(n)||w<0||n<0||w>n)throw Error('invalid counts');
  if(!n)return null;
  const z=1.959963984540054,p=w/n,d=1+z*z/n;
  const center=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,center-r),Math.min(1,center+r)];
}
export function analyzeStrength(rows,{expectedSchedule}={}){
  if(expectedSchedule){
    const key=r=>`${r.trial}:${r.block}:${r.version}`;
    if(rows.length!==expectedSchedule.length
      ||[...rows].map(key).sort().join('|')!==[...expectedSchedule].map(key).sort().join('|'))
      throw Error('results do not match the pre-registered schedule; keep pending trials, do not delete them');
  }
  const trials=new Set(),games=new Set(),contexts=new Set();
  const groups=Object.fromEntries(VERSIONS.map(v=>[v,{wins:0,n:0,failures:0,pending:0}]));
  for(const r of rows){
    if(!Number.isInteger(r.trial)||trials.has(r.trial)||!groups[r.version])throw Error('duplicate/invalid trial or version');
    trials.add(r.trial);
    if(r.result==null){groups[r.version].pending++;continue;}
    if(!['WIN','LOSS','DRAW','FAILURE'].includes(r.result))throw Error('invalid result');
    if(!r.gameId||games.has(r.gameId))throw Error('missing/duplicate gameId');
    games.add(r.gameId);
    if(!r.model||!r.deckHash||!r.mode)throw Error('completed trials need model, deckHash and mode');
    contexts.add(JSON.stringify([r.model,r.deckHash,r.mode]));
    const g=groups[r.version];g.n++;g.wins+=r.result==='WIN'?1:0;g.failures+=r.result==='FAILURE'?1:0;
  }
  if(contexts.size>1)throw Error('mixed model/deck/mode: report separate experiments');
  for(const g of Object.values(groups)){g.rate=g.n?g.wins/g.n:null;g.ci95=wilson(g.wins,g.n)}
  const [old,newer]=VERSIONS.map(v=>groups[v]);
  let difference=null,ci95=null;
  if(old.n&&newer.n){
    difference=newer.rate-old.rate;
    // Newcombe independent-proportions score interval, using Wilson components.
    ci95=[Math.max(-1,difference-Math.hypot(newer.rate-newer.ci95[0],old.ci95[1]-old.rate)),
      Math.min(1,difference+Math.hypot(newer.ci95[1]-newer.rate,old.rate-old.ci95[0]))];
  }
  const complete=rows.length>0&&Object.values(groups).every(g=>g.n>0&&!g.pending);
  return {groups,difference,ci95,complete,
    conclusion:!complete?'experiment_incomplete':ci95[0]>0?'evidence_of_improvement'
      :ci95[1]<0?'evidence_of_regression':'inconclusive',
    assumptions:'Pre-registered sample size; random version order; stable model/deck/mode/rank environment. Games approximately independent. Draws and in-game failures count as non-wins. No repeated significance peeking.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--schedule'){
    const path=process.argv[3];if(!path)throw Error('provide output JSON path');
    await writeFile(path,JSON.stringify(schedule(Number(process.argv[4]??400),Number(process.argv[5]??20261001)),null,2),{flag:'wx'});
    console.log(`Saved prospective schedule to ${path}; no games started.`);
  }else{
    if(!process.argv[2])throw Error('provide results JSON path, or --schedule output.json [blocks] [seed]');
    const i=process.argv.indexOf('--schedule-file');
    const path=i<0?new URL('../eval/runs/silverfish-20261001/prospective-schedule.json',import.meta.url):process.argv[i+1];
    const expectedSchedule=JSON.parse(await readFile(path,'utf8'));
    console.log(JSON.stringify(analyzeStrength(JSON.parse(await readFile(process.argv[2],'utf8')),{expectedSchedule}),null,2));
  }
}
