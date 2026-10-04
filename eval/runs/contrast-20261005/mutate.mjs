// For each positive fixture, try one-feature edits and keep those under which the rule stops firing
// while every other rule fires exactly as before: the candidates for the opposite-answer half.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const DIR='../../../test/fixtures/contrast/';
const fire=(state,opts)=>{const trace={};const a=constrainActions(state,opts,{trace});
 if(a.length&&!state.choice)spendFirst(state,a,{admission:trace.admission,trace});
 return Object.fromEntries((trace.preferences??[]).map(f=>[f.rule,f.removed.join(',')]));};
const drop=(f,ids)=>f.options.filter(o=>!ids.has(o.entityId)&&!ids.has(o.targetId));
function* edits(f){
 const s=f.state,me=s.me,op=s.opponent;
 for(const c of me.hand??[])yield ['drop hand '+c.name,x=>{x.state.me.hand=x.state.me.hand.filter(h=>h.entityId!==c.entityId);x.options=drop(x,new Set([c.entityId]));}];
 for(const c of (me.board??[]).filter(c=>c.CARDTYPE==='MINION'||c.CARDTYPE==='LOCATION'||c.CARDTYPE==='WEAPON'))
  yield ['drop mine '+c.name,x=>{x.state.me.board=x.state.me.board.filter(h=>h.entityId!==c.entityId);x.options=drop(x,new Set([c.entityId]));}];
 for(const c of (op?.board??[]).filter(c=>c.CARDTYPE==='MINION'))
  yield ['drop foe '+c.name,x=>{x.state.opponent.board=x.state.opponent.board.filter(h=>h.entityId!==c.entityId);x.options=drop(x,new Set([c.entityId]));}];
 for(const c of (me.board??[]).filter(c=>c.CARDTYPE==='MINION'&&!c.EXHAUSTED))
  yield ['exhaust '+c.name,x=>{x.state.me.board.find(h=>h.entityId===c.entityId).EXHAUSTED=1;x.options=x.options.filter(o=>!(o.entityId===c.entityId&&o.targetId!=null));}];
 for(const d of [-1,1])yield ['mana '+(d>0?'+':'')+d,x=>{x.state.me.mana=Number(x.state.me.mana)+d;
  x.options=x.options.filter(o=>{const c=x.state.me.hand.find(h=>h.entityId===o.entityId);return !c||Number(c.COST??0)<=x.state.me.mana;});}];
 const hero=(me.board??[]).find(c=>c.CARDTYPE==='HERO');
 if(hero){yield ['my hp 6',x=>{const h=x.state.me.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??30)-6;}];
  yield ['my hp full',x=>{const h=x.state.me.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=0;}];}
 const foeHero=(op?.board??[]).find(c=>c.CARDTYPE==='HERO');
 if(foeHero)yield ['foe hp 5',x=>{const h=x.state.opponent.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??30)-5;}];
 for(const t of [2,10])if(s.turn!==t)yield ['turn '+t,x=>{x.state.turn=t;}];
 yield ['deck 0',x=>{x.state.me.deckCount=0;}];
 for(const c of (me.hand??[]).filter(c=>c.temporary))yield ['not temporary '+c.name,x=>{delete x.state.me.hand.find(h=>h.entityId===c.entityId).temporary;}];
}
const out={},md=[];
for(const file of readdirSync(DIR).filter(f=>f.endsWith('.json'))){
 const rule=file.slice(0,-5),f=JSON.parse(readFileSync(DIR+file,'utf8'));
 const base=fire(f.state,f.options);
 if(!(rule in base)){md.push(`## ${rule}: positive no longer fires`);continue;}
 const clean=[],dirty=[];
 for(const [name,edit] of edits(f)){const x=structuredClone(f);edit(x);let now;try{now=fire(x.state,x.options)}catch(e){continue}
  if(rule in now)continue;
  const others=k=>Object.keys(k).filter(r=>r!==rule).sort().map(r=>r+'='+k[r]).join(';');
  (others(now)===others(base)?clean:dirty).push(name);}
 out[rule]={clean,dirty};
 md.push(`## ${rule}\n clean: ${clean.join(' | ')||'-'}\n dirty: ${dirty.join(' | ')||'-'}`);
}
writeFileSync('mutations.json',JSON.stringify(out,null,1));writeFileSync('mutations.md',md.join('\n'));
