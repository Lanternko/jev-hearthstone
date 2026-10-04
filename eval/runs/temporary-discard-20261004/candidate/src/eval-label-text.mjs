// How an option reads in the evaluation set: one line of Chinese per raw option id.
const entity=(st,id)=>[...(st.me.hand??[]),...(st.me.board??[]),...(st.opponent.board??[]),
 ...(st.choice?.entities??[])].find(c=>c.entityId===id);
const nameOf=(st,id)=>entity(st,id)?.name??`#${id}`;
const inHand=(st,id)=>(st.me.hand??[]).some(c=>c.entityId===id);
export const isAttack=(st,a)=>a.targetId!=null&&!inHand(st,a.targetId)
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
