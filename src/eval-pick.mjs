// Picks positions from runtime/decisions.jsonl for the hand-labelled evaluation set
// (eval/positions.json). Labels live in eval/labels.json, written by eval-label.mjs; a position
// already in the set keeps its id and label when this is re-run, new positions are appended.
//
// Chosen are the positions where Jev's pick was contested or of a kind known to go wrong:
// cards vs attacks in one menu (order), ending the turn with something castable (spend), a
// Discover/battlecry choice, and low confidence. Mulligans are capped -- they are a small part
// of the game and keepInOpening already rules on them.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {criteria} from './describe.mjs';

const N=Number(process.argv[2]??40);
const file=new URL('../eval/positions.json',import.meta.url);
const log=(await readFile(new URL('../runtime/decisions.jsonl',import.meta.url),'utf8'))
 .trim().split('\n').map(l=>JSON.parse(l));
const have=await readFile(file,'utf8').then(JSON.parse).catch(()=>[]);

const entity=(st,id)=>[...(st.me.hand??[]),...(st.me.board??[]),...(st.opponent.board??[]),
 ...(st.choice?.entities??[])].find(c=>c.entityId===id);
const nameOf=(st,id)=>entity(st,id)?.name??`#${id}`;
const inHand=(st,id)=>(st.me.hand??[]).some(c=>c.entityId===id);
const isAttack=(st,a)=>a.targetId!=null&&!inHand(st,a.targetId)
 &&(st.me.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE));
const isPower=(st,a)=>entity(st,a.entityId)?.CARDTYPE==='HERO_POWER';
export function label(st,a){
 if(a.type==='END_TURN')return '結束回合';
 if(a.type==='MULLIGAN')return a.replace.length?`換掉：${a.replace.map(i=>nameOf(st,i)).join('、')}`:'全部保留';
 if(a.type==='CHOICE')return `選 ${nameOf(st,a.entityId)}`;
 const tgt=a.targetId!=null?` → ${nameOf(st,a.targetId)}`:'';
 if(isAttack(st,a))return `攻擊：${nameOf(st,a.entityId)}${tgt}`;
 if(isPower(st,a))return `英雄技能 ${nameOf(st,a.entityId)}${tgt}`;
 const c=entity(st,a.entityId);
 return `打出 ${c?.name??a.entityId}（${c?.COST??c?.baseCost??'?'}）${tgt}`;
}

function tags(r){
 const st=r.state,opts=r.options,chose=r.action?.id;
 const t=[];
 if(st.choice?.type==='MULLIGAN')t.push('mulligan');
 else if(st.choice)t.push('choice');
 const cards=opts.filter(a=>a.type!=='END_TURN'&&!isAttack(st,a)&&a.type!=='CHOICE'&&a.type!=='MULLIGAN');
 if(cards.length&&opts.some(a=>isAttack(st,a)))t.push('order');
 if(chose==='o0'&&cards.length)t.push('spend');
 if(r.plan)t.push('plan');
 if((r.metadata?.typesafe?.confidence?.move??1)<0.6)t.push('lowconf');
 return t;
}

const seen=new Set(have.map(p=>p.fingerprint));
const pool=[];
log.forEach((r,row)=>{
 if(!r.options?.length||!r.answers||r.options.length<2)return;
 const fp=r.state.decisionFingerprint;
 if(seen.has(fp))return;seen.add(fp);
 const t=tags(r),conf=r.metadata?.typesafe?.confidence?.move??1;
 const weight=(t.includes('spend')?3:0)+(t.includes('order')?2:0)+(t.includes('choice')?2:0)+(1-conf)*2;
 pool.push({r,row,t,weight});
});
let mull=have.filter(p=>p.tags.includes('mulligan')).length;
const picked=[];
for(const c of pool.sort((a,b)=>b.weight-a.weight)){
 if(have.length+picked.length>=N)break;
 if(c.t.includes('mulligan')&&mull++>=3)continue;
 picked.push(c);
}
const fresh=picked.sort((a,b)=>a.row-b.row).map(({r,row,t})=>{
 const st=r.state,desc=criteria(st,r.options);
 return {
  id:`g${st.gameNumber}t${st.turn}r${row}`,row,fingerprint:st.decisionFingerprint,tags:t,
  state:st,
  options:r.options.map(a=>({...a,label:label(st,a),description:desc[a.id]?.description??''})),
  // What was played at the time, as a raw option id (a PLAN pick counts as its first step).
  then:{choice:r.action.id,plan:r.plan?.text??null,confidence:r.metadata?.typesafe?.confidence?.move??null,
   probabilities:r.answers.move.probabilities},
 };
});
await mkdir(new URL('../eval/',import.meta.url),{recursive:true});
await writeFile(file,JSON.stringify([...have,...fresh],null,1));
console.log(`${fresh.length} new position(s), ${have.length+fresh.length} in eval/positions.json (pool ${pool.length})`);
const count=k=>fresh.filter(p=>p.tags.includes(k)).length;
console.log(['order','spend','choice','mulligan','plan','lowconf'].map(k=>`${k} ${count(k)}`).join(' | '));
