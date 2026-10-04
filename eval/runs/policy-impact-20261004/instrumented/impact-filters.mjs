// Offline attribution: which constrainActions stage removed each raw option, and was the
// simulator's best first step (search over the RAW menu) among the removed ones.
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {constrainActions} from './src/policy.mjs';
import {prepare} from './src/choose.mjs';
import {search,score,actionFor} from './src/plan.mjs';
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const only=process.argv[2]; // optional comma list of batch dirs
const out=process.argv[3]??'impact-filters.jsonl';
const files=[];
for(const d of readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('ranked-')).map(e=>e.name).sort()){
 if(only&&!only.split(',').includes(d))continue;
 for(const f of readdirSync(ROOT+d).filter(f=>/^game-\d+-decisions\.jsonl$/.test(f)).sort())files.push([d,f]);
}
if(!only)files.push(['top','decisions.jsonl']);
const seen=new Set();const rows=[];
for(const [d,f] of files){
 const p=d==='top'?ROOT+f:ROOT+d+'/'+f;
 readFileSync(p,'utf8').split('\n').forEach((l,i)=>{if(!l.trim())return;let r;try{r=JSON.parse(l)}catch{return}
  const k=r.createdAt??(d+f+i);if(seen.has(k))return;seen.add(k);rows.push({batch:d,file:f,line:i,r});});
}
const nameOf=(s,id)=>[...(s.me?.hand??[]),...(s.me?.board??[]),...(s.opponent?.board??[])].find(c=>c.entityId===id);
const label=(s,a)=>{if(!a)return null;if(a.type==='END_TURN')return 'END';const c=nameOf(s,a.entityId);
 const t=a.targetId!=null?nameOf(s,a.targetId):null;return `${c?.name??c?.CARDTYPE??a.entityId}${t?'→'+(t.name??t.CARDTYPE):''}`;};
const res=[];let n=0;const t0=Date.now();
for(const {batch,file,line,r} of rows){
 const s=r.state,raw=r.rawOptions;
 if(!raw||!s||s.choice||s.status!=='RUNNING'||!s.me?.current)continue;
 n++;
 const stages=[];globalThis.__S=(l,arr)=>stages.push([l,arr?new Set(arr.map(a=>a.id)):null]);
 const trace={};let fin;
 try{fin=constrainActions(s,raw,{trace});}catch(e){res.push({batch,file,line,err:'constrain:'+e.message});continue;}
 globalThis.__S=undefined;
 const finIds=new Set(fin.map(a=>a.id));
 // Decisive stage: last stage at which the option went from present to absent.
 const removedBy={};
 for(const a of raw){if(finIds.has(a.id))continue;let prev=true,by='?';
  for(const [l,set] of stages){if(!set)continue;const has=set.has(a.id);if(prev&&!has)by=l;prev=has;}
  removedBy[a.id]=by;}
 let prep=null;try{const p=prepare(s,fin,{admission:trace.admission});
  prep={forced:p.forced?.action?.id??p.lethal?.action?.id??null,source:p.forced?.source??p.lethal?.source??null,
   acts:(p.acts??[]).map(a=>a.id),planFirst:Object.fromEntries(Object.entries(p.plans??{}).map(([k,st])=>[k,actionFor(fin,st[0])?.id??null]))};}
 catch(e){prep={err:e.message};}
 let sim=null;
 try{const t=Date.now();const {start,plans,stats}=search(s,raw);const endScore=score(start,start);
  const best=plans[0];const bestAct=best&&best.score>endScore?actionFor(raw,best.steps[0]):raw.find(a=>a.type==='END_TURN');
  const bestScore=best&&best.score>endScore?best.score:endScore;
  const surv=plans.find(p=>finIds.has(actionFor(raw,p.steps[0])?.id));
  const survScore=Math.max(finIds.has(raw.find(a=>a.type==='END_TURN')?.id)?endScore:-Infinity,surv?.score??-Infinity);
  sim={bestId:bestAct?.id??null,bestLabel:label(s,bestAct),bestScore,endScore,survScore,
   gap:bestScore-survScore,exact:best?.steps?.[0]?.exact??null,steps:best?best.steps.map(x=>label(s,actionFor(raw,x))||x.kind):[],
   nodeLimit:stats.nodeLimit,ms:Date.now()-t};
 }catch(e){sim={err:e.message};}
 const bestRemovedBy=sim?.bestId&&!finIds.has(sim.bestId)?removedBy[sim.bestId]:null;
 res.push({batch,file,line,createdAt:r.createdAt,plannerVersion:r.plannerVersion,turn:s.turn,mana:s.me.mana,
  raw:raw.length,kept:fin.length,removed:Object.entries(removedBy).map(([id,by])=>({id,by,label:label(s,raw.find(a=>a.id===id))})),
  actual:r.action?.id??null,actualLabel:label(s,raw.find(a=>a.id===r.action?.id)??r.action),source:r.source??null,
  recordedOptions:(r.options??[]).map(a=>a.id),sim,bestRemovedBy,prep});
 if(n%200===0)console.error(n,'rows',((Date.now()-t0)/1000).toFixed(0)+'s');
}
writeFileSync(out,res.map(x=>JSON.stringify(x)).join('\n')+'\n');
console.error('done',n,'rows',((Date.now()-t0)/1000).toFixed(0)+'s');
