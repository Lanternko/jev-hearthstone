// Step 4 of the rule-tier plan: how far does each rule reach? Every recorded decision goes through
// the current engine; per rule, how many decisions it took actions out of, how often it removed the
// action Jev actually chose, and sample states for the contrast fixtures. Games (file, day, game number)
// are split by a hash: 20% are held out (保留題) and never sampled, only counted. Run from this folder.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const files=[];
for(const d of readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))
 for(const f of readdirSync(ROOT+d).filter(f=>/decisions\.jsonl$/.test(f)))files.push(ROOT+d+'/'+f);
files.push(ROOT+'decisions.jsonl');
const holdout=(p,r)=>createHash('sha1').update(p.slice(ROOT.length)+'|'+String(r.createdAt??'').slice(0,10)+'|'+r.state?.gameNumber).digest()[0]<52;
const run=(state,opts)=>{const trace={};const a=constrainActions(state,opts,{trace});
 const b=a.length&&!state.choice?spendFirst(state,a,{admission:trace.admission,trace}):a;return {a,b,trace};};
const seen=new Set(),rules={},errors=[];let rows=0,touched=0,chosenGone=0;const split={dev:0,holdout:0};
const vetoCount={};
for(const p of files){let text;try{text=readFileSync(p,'utf8')}catch{continue}
 const file=p.slice(ROOT.length);
 for(const l of text.split('\n')){if(!l.trim())continue;let r;try{r=JSON.parse(l)}catch{continue}
  const state=r.state,opts=r.rawOptions??r.options;if(!state?.me||!Array.isArray(opts))continue;
  const k=r.createdAt??l.slice(0,200);if(seen.has(k))continue;seen.add(k);rows++;const h=holdout(p,r);split[h?'holdout':'dev']++;
  let now;try{now=run(state,opts)}catch(e){errors.push({file,turn:r.turn,error:String(e?.stack??e).slice(0,300)});continue}
  const chosen=r.chosen?.id??r.action?.id??null;
  const label=id=>{const a=opts.find(x=>x.id===id);if(!a)return id;
   const c=[...(state.me.board??[]),...(state.me.hand??[])].find(x=>x.entityId===a.entityId);
   const t=[...(state.opponent?.board??[]),...(state.me.board??[])].find(x=>x.entityId===a.targetId);
   return a.type==='END_TURN'?'END_TURN':(c?.name??a.type)+(t?' -> '+(t.name??t.entityId):'');};
  for(const v of now.trace.vetoes??[])vetoCount[v.rule]=(vetoCount[v.rule]??0)+1;
  const prefs=now.trace.preferences??[];
  if(prefs.length)touched++;
  if(chosen&&!now.b.some(a=>a.id===chosen)&&opts.some(a=>a.id===chosen))chosenGone++;
  for(const f of prefs){
   const R=rules[f.rule]??={fires:0,dev:0,holdout:0,chosenRemoved:0,released:0,samples:[]};
   R.fires++;R[h?'holdout':'dev']++;
   const gone=f.removed.includes(chosen);if(gone)R.chosenRemoved++;
   if((now.trace.ruleReleases??[]).some(x=>x.rule===f.rule))R.released++;
   if(!h&&R.samples.length<6)R.samples.push({file,line:r.createdAt,turn:r.turn,mana:state.me.mana,
    hand:(state.me.hand??[]).map(c=>c.name),board:(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION').map(c=>c.name),
    removed:f.removed.map(label),chosen:label(chosen),chosenRemoved:gone});
  }
 }}
const out={files:files.length,rows,split,touched,touchedPct:+(100*touched/rows).toFixed(2),chosenGone,chosenGonePct:+(100*chosenGone/rows).toFixed(2),
 vetoCount,errors:errors.length,
 rules:Object.fromEntries(Object.entries(rules).sort((a,b)=>b[1].fires-a[1].fires)),errorList:errors.slice(0,5)};
writeFileSync('history.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({...out,rules:Object.fromEntries(Object.entries(out.rules).map(([k,v])=>[k,{...v,samples:undefined}]))},null,1));
