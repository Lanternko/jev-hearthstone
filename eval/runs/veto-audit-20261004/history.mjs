// Every recorded decision with a state and a menu, through the current engine and the frozen
// rule-release-v1 engine (step 3, veto audit): which preferences the simulator released, which vetoes fired, and whether any menu changed
// for another reason. Run from this folder.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const old=await import('./candidate/src/policy.mjs');
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const files=[];
for(const d of readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))
 for(const f of readdirSync(ROOT+d).filter(f=>/decisions\.jsonl$/.test(f)))files.push(ROOT+d+'/'+f);
files.push(ROOT+'decisions.jsonl');
const run=(P,state,opts)=>{const trace={};const a=P.constrainActions(state,opts,{trace});
 const b=a.length?P.spendFirst(state,a,{admission:trace.admission,trace}):a;return {a,b,trace};};
const ids=x=>x.map(a=>a.id).join(',');
const seen=new Set(),hits=[],diffs=[],errors=[],vetoCount={};let rows=0,ms=0,msOld=0,max=0;
for(const p of files){let text;try{text=readFileSync(p,'utf8')}catch{continue}
 for(const l of text.split('\n')){if(!l.trim())continue;let r;try{r=JSON.parse(l)}catch{continue}
  const state=r.state,opts=r.rawOptions??r.options;if(!state?.me||!Array.isArray(opts))continue;
  const k=r.createdAt??l.slice(0,200);if(seen.has(k))continue;seen.add(k);rows++;
  let now,was;
  try{const t=performance.now();now=run({constrainActions,spendFirst},state,opts);const dt=performance.now()-t;ms+=dt;max=Math.max(max,dt);
   const t2=performance.now();was=run(old,state,opts);msOld+=performance.now()-t2;}
  catch(e){errors.push({file:p.slice(ROOT.length),turn:r.turn,error:String(e?.stack??e).slice(0,300)});continue}
  const label=a=>{const c=[...(state.me.board??[]),...(state.me.hand??[])].find(x=>x.entityId===a?.entityId);
   const t=[...(state.opponent?.board??[]),...(state.me.board??[])].find(x=>x.entityId===a?.targetId);return (c?.name??a?.entityId)+(t?' -> '+(t.name??t.entityId):'');};
  for(const v of now.trace.vetoes??[])vetoCount[v.rule]=(vetoCount[v.rule]??0)+1;
  for(const x of now.trace.ruleReleases??[])hits.push({file:p.slice(ROOT.length),createdAt:r.createdAt,turn:r.turn,rule:x.rule,action:label(opts.find(a=>a.id===x.actionId)),
   score:+x.score.toFixed(2),rival:Number.isFinite(x.rivalScore)?+x.rivalScore.toFixed(2):String(x.rivalScore),idle:+x.idleScore.toFixed(2),
   steps:x.steps.map(s=>label({entityId:s.id,targetId:s.targetId})+(s.exact?'':' ~')),chosen:r.chosen?.id??r.action?.id??null});
  if(ids(now.a)!==ids(was.a)||ids(now.b)!==ids(was.b)){
   const added=[...now.a,...now.b].filter(a=>![...was.a,...was.b].some(b=>b.id===a.id)).map(a=>a.id);
   const lost=[...was.a,...was.b].filter(a=>![...now.a,...now.b].some(b=>b.id===a.id)).map(a=>a.id);
   const vetoed=new Set((now.trace.vetoes??[]).map(v=>v.actionId));
   const why=(now.trace.ruleReleases??[]).length?'release':(!added.length&&lost.every(id=>vetoed.has(id)))?'vetoNoFallback':null;
   const explained=!!why;
   diffs.push({file:p.slice(ROOT.length),turn:r.turn,explained,why,vetoes:now.trace.vetoes,releases:(now.trace.ruleReleases??[]).map(x=>x.rule),constrain:[ids(was.a),ids(now.a)],spend:[ids(was.b),ids(now.b)],added,lost});
  }
 }}
const byRule={};for(const h of hits)byRule[h.rule]=(byRule[h.rule]??0)+1;
const why={};for(const d of diffs)why[d.why]=(why[d.why]??0)+1;
const out={files:files.length,rows,releases:hits.length,byRule,vetoCount,diffWhy:why,menuDiffs:diffs.length,unexplainedDiffs:diffs.filter(d=>!d.explained).length,errors:errors.length,
 ms:{total:Math.round(ms),old:Math.round(msOld),max:Math.round(max)},hits,diffs,errors};
writeFileSync('history.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({...out,hits:undefined,diffs:undefined,errors:errors.slice(0,3)}));
for(const h of hits)console.log(h.rule,h.file,'T'+h.turn,h.action,'|',h.score,'vs',h.rival,'idle',h.idle,'|',h.steps.join(' ; '));
for(const d of diffs.filter(d=>!d.explained))console.log('UNEXPLAINED',JSON.stringify(d));
