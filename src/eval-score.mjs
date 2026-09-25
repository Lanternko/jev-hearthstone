// Scores decisions against the hand labels in eval/labels.json: 1 for a best action, 0.5 for an
// acceptable one, 0 otherwise; skipped and unlabelled positions do not count.
//
//   npm run eval            free: what Jev played at the time, and whether the hard rules
//                           (spendFirst) still leave a best action on the menu
//   npm run eval -- --live  re-asks the CURRENT pipeline (choose.mjs: policy, planner, Jev) on
//                           every labelled position; costs one Jev call per position that is
//                           not forced, and saves the run to eval/runs/
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spendFirst} from './policy.mjs';
import {prepare,askJev,resolve} from './choose.mjs';

const live=process.argv.includes('--live');
const positions=JSON.parse(await readFile(new URL('../eval/positions.json',import.meta.url),'utf8'));
const labels=await readFile(new URL('../eval/labels.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>({}));
const set=positions.filter(p=>labels[p.id]&&!labels[p.id].skip&&labels[p.id].best.length);
if(!set.length){console.log('No labelled positions yet: run `npm run label` first.');process.exit(0)}

const points=(l,id)=>l.best.includes(id)?1:l.ok.includes(id)?0.5:0;
const raw=p=>p.options.map(({label,description,...a})=>a);
const nameOf=(p,id)=>p.options.find(o=>o.id===id)?.label??id;
const summary=(title,rows)=>{
 const total=rows.reduce((n,r)=>n+r.points,0);
 console.log(`\n${title}: ${total}/${rows.length} (${(100*total/rows.length).toFixed(0)}%)  best ${rows.filter(r=>r.points===1).length}, acceptable ${rows.filter(r=>r.points===0.5).length}, wrong ${rows.filter(r=>r.points===0).length}`);
 for(const r of rows.filter(r=>r.points<1))
  console.log(`  ${r.points?'~':'x'} ${r.id} [${r.tags}] played ${nameOf(r.p,r.pick)}${r.source?` (${r.source})`:''}  | best: ${labels[r.id].best.map(id=>nameOf(r.p,id)).join(' / ')}`);
 return total;
};
console.log(`${set.length} labelled position(s) (${positions.length} in the set, ${Object.values(labels).filter(l=>l.skip).length} skipped)`);

summary('Jev at the time',set.map(p=>({id:p.id,p,tags:p.tags,pick:p.then.choice,points:points(labels[p.id],p.then.choice)})));

// A hard rule that removes every best action is a rule the labels disagree with.
const blocked=set.filter(p=>{const kept=new Set(spendFirst(p.state,raw(p)).map(a=>a.id));return !labels[p.id].best.some(id=>kept.has(id))});
console.log(`\nspendFirst removes every best action in ${blocked.length} position(s)${blocked.length?':':''}`);
for(const p of blocked)console.log(`  ${p.id}  best: ${labels[p.id].best.map(id=>nameOf(p,id)).join(' / ')}${labels[p.id].note?`  -- ${labels[p.id].note}`:''}`);

if(live){
 const strategy=await readFile(new URL('../strategy.md',import.meta.url),'utf8');
 const rows=[];
 for(const p of set){
  const pr=prepare(p.state,raw(p));
  let pick,source,probabilities,cost;
  if(pr.forced||pr.lethal){({action:{id:pick},source}=pr.forced??pr.lethal)}
  else{
   const r=await askJev(p.state,pr,strategy);
   pick=resolve(pr,r.answers.move.choice).action.id;source=pr.plans[r.answers.move.choice]?'plan':'jev';
   probabilities=r.answers.move.probabilities;cost=r.metadata?.gateway?.cost;
  }
  rows.push({id:p.id,p,tags:p.tags,pick,source,probabilities,cost,points:points(labels[p.id],pick)});
  process.stdout.write('.');
 }
 const total=summary('Current pipeline',rows);
 await mkdir(new URL('../eval/runs/',import.meta.url),{recursive:true});
 const at=new Date().toISOString().replace(/[:.]/g,'-');
 await writeFile(new URL(`../eval/runs/${at}.json`,import.meta.url),JSON.stringify({at,score:total,n:rows.length,
  rows:rows.map(({p,...r})=>r)},null,1));
 console.log(`\nsaved eval/runs/${at}.json`);
}
