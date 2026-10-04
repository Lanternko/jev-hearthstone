// The contrast pairs (step 4): each positive board from history, and a one-feature edit of it under
// which the rule's answer is the opposite. Shared by explore.mjs and test/contrast.test.mjs.
const byName=(list,n)=>{const c=(list??[]).find(c=>c.name===n);if(!c)throw new Error('no '+n);return c;};
const prune=(x,ids)=>{x.options=x.options.filter(o=>!ids.has(o.entityId)&&!ids.has(o.targetId));};
export const E={
 mana:d=>x=>{x.state.me.mana=Number(x.state.me.mana)+d;
  x.options=x.options.filter(o=>{const c=x.state.me.hand.find(h=>h.entityId===o.entityId);return !c||Number(c.COST??0)<=x.state.me.mana;});},
 dropHand:n=>x=>{const c=byName(x.state.me.hand,n);x.state.me.hand=x.state.me.hand.filter(h=>h!==c);prune(x,new Set([c.entityId]));},
 dropMine:n=>x=>{const c=byName(x.state.me.board,n);x.state.me.board=x.state.me.board.filter(h=>h!==c);prune(x,new Set([c.entityId]));},
 dropFoe:n=>x=>{const c=byName(x.state.opponent.board,n);x.state.opponent.board=x.state.opponent.board.filter(h=>h!==c);prune(x,new Set([c.entityId]));},
 myHp:hp=>x=>{const h=x.state.me.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??h.HEALTH??30)-hp;},
 foeHp:hp=>x=>{const h=x.state.opponent.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??h.HEALTH??30)-hp;},
 notTemporary:n=>x=>{delete byName(x.state.me.hand,n).temporary;},
 wake:n=>x=>{byName(x.state.me.board,n).EXHAUSTED=0;},
 // A plain vanilla body, with a fresh entity id; on our side it has just been played.
 addFoe:(atk,hp,k=1)=>x=>{for(let i=0;i<k;i++)x.state.opponent.board.push({entityId:900+i,name:'Test Body',CARDTYPE:'MINION',ATK:atk,HEALTH:hp,baseAttack:atk,baseHealth:hp,COST:1,text:''});},
 addMine:(atk,hp)=>x=>{x.state.me.board.push({entityId:950,name:'Test Body',CARDTYPE:'MINION',ATK:atk,HEALTH:hp,baseAttack:atk,baseHealth:hp,COST:1,text:'',EXHAUSTED:1});},
 swapHand:(n,from)=>x=>{const c=byName(x.state.me.hand,n),i=x.state.me.hand.indexOf(c);x.state.me.hand[i]={...structuredClone(from),entityId:c.entityId};},
 all:(...fs)=>x=>fs.forEach(f=>f(x)),
};
