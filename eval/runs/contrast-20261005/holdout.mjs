// Step 4 acceptance: the held-out games (保留題), never looked at while writing rules. Every firing
// there is dumped with the board, so each removal can be judged right or wrong by hand.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const files=[];
for(const d of readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))
 for(const f of readdirSync(ROOT+d).filter(f=>/decisions\.jsonl$/.test(f)))files.push(ROOT+d+'/'+f);
files.push(ROOT+'decisions.jsonl');
const holdout=(p,r)=>createHash('sha1').update(p.slice(ROOT.length)+'|'+String(r.createdAt??'').slice(0,10)+'|'+r.state?.gameNumber).digest()[0]<52;
const seen=new Set(),out=[];
const hp=c=>c?Number(c.HEALTH??c.baseHealth??0)-Number(c.DAMAGE??0)+Number(c.ARMOR??0):'?';
for(const p of files){let text;try{text=readFileSync(p,'utf8')}catch{continue}
 for(const l of text.split('\n')){if(!l.trim())continue;let r;try{r=JSON.parse(l)}catch{continue}
  const state=r.state,opts=r.rawOptions??r.options;if(!state?.me||!Array.isArray(opts))continue;
  const k=r.createdAt??l.slice(0,200);if(seen.has(k))continue;seen.add(k);if(!holdout(p,r))continue;
  const trace={};let a,b;try{a=constrainActions(state,opts,{trace});b=a.length&&!state.choice?spendFirst(state,a,{admission:trace.admission,trace}):a;}catch{continue}
  const prefs=trace.preferences??[];if(!prefs.length)continue;
  const chosen=r.chosen?.id??r.action?.id??null;
  const label=id=>{const x=opts.find(o=>o.id===id);if(!x)return String(id);
   const c=[...(state.me.board??[]),...(state.me.hand??[]),...(state.choice?.cards??[])].find(y=>y.entityId===x.entityId);
   const t=[...(state.opponent?.board??[]),...(state.me.board??[]),...(state.me.hand??[])].find(y=>y.entityId===x.targetId);
   return x.type==='END_TURN'?'END':(c?.name??x.type)+(t?'>'+t.name:'');};
  const mh=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO'),oh=(state.opponent?.board??[]).find(c=>c.CARDTYPE==='HERO');
  const mins=s=>(s.board??[]).filter(c=>c.CARDTYPE==='MINION').map(c=>`${c.name}${c.ATK}/${hp(c)}${Number(c.EXHAUSTED)?'z':''}`).join(', ');
  for(const f of prefs){const gone=f.removed.includes(chosen);
   out.push({gone,s:`${gone?'[CHOSEN REMOVED] ':''}${f.rule} | T${state.turn??r.turn} mana ${state.me.mana} hp ${hp(mh)} vs ${hp(oh)} deck ${state.me.deckCount??'?'}
  hand: ${(state.me.hand??[]).map(c=>`${c.name}(${c.COST})`).join(', ')}
  mine: ${mins(state.me)}
  foe: ${mins(state.opponent??{})}
  removed: ${f.removed.map(label).join(' | ')}
  chosen: ${label(chosen)}   final: ${b.map(x=>label(x.id)).join(' | ')}`});}
 }}
out.sort((x,y)=>y.gone-x.gone);
writeFileSync('holdout.txt',`${out.length} firings, ${out.filter(x=>x.gone).length} removed the chosen action\n\n`+out.map(x=>x.s).join('\n')+'\n');
