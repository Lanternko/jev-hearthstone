// Did the click do what we asked, or merely something?
//
// loop.mjs used to accept any change of the decision fingerprint as success. That catches a dead
// click and nothing else: a hand index off by one drags the neighbouring card onto the board, the
// fingerprint changes, and the run records a success for a play nobody chose. The same for an
// attack that lands on the minion next to the one meant. So each action names the change it must
// cause, and the state after the click is checked against that change -- not against "anything".
//
// verdict(before, action, after) -> 'ok' | 'misfire' | 'pending'
//   ok       the intended effect is visible
//   misfire  a different effect is visible: another card left hand, another body attacked, the
//            swing landed somewhere else. The board moved, but not the way we meant.
//   pending  neither yet. Power.log trails the animation, so the caller keeps polling.

const on=(c,tag)=>c?.[tag]===1||c?.[tag]==='1';
const byId=(list,id)=>(list??[]).find(c=>c.entityId===id);
const attacks=c=>Number(c?.NUM_ATTACKS_THIS_TURN??0);

// The target visibly took the hit: gone, more damage, less armour, or a shield popped.
function wasHit(before,after,id){
  const all=s=>[...(s.me.board??[]),...(s.opponent.board??[])];
  const b=byId(all(before),id),a=byId(all(after),id);
  if(!b)return null;                                   // not something we can see: no opinion
  if(!a)return true;
  return (a.DAMAGE??0)!==(b.DAMAGE??0)||(a.ARMOR??0)!==(b.ARMOR??0)||on(a,'DIVINE_SHIELD')!==on(b,'DIVINE_SHIELD');
}

export function verdict(before,action,after){
  if(!after)return 'pending';
  if(action.type==='END_TURN')
    return !after.me.current||after.turn!==before.turn?'ok':'pending';
  if(action.type==='MULLIGAN'||action.type==='CHOICE')
    return after.choice?.id!==action.choiceId?'ok':'pending';

  const hand0=before.me.hand??[],hand1=after.me.hand??[];
  // Draws only ever add to the hand, so a card missing from it was played or discarded.
  const gone=hand0.filter(c=>c.entityId!==action.entityId&&!hand1.some(x=>x.entityId===c.entityId));
  // A location or hero power that asks "pick one" shows the prompt before its own tags move.
  const opened=!!after.choice&&after.choice.id!==before.choice?.id;
  const fromHand=hand0.some(c=>c.entityId===action.entityId);
  if(fromHand){
    if(!hand1.some(c=>c.entityId===action.entityId))return 'ok';
    // Our card is still there but another one left: the drag picked up its neighbour.
    return gone.length?'misfire':'pending';
  }

  const src0=byId(before.me.board,action.entityId),src1=byId(after.me.board,action.entityId);
  if(src0?.CARDTYPE==='HERO_POWER')
    return opened||!src1||on(src1,'EXHAUSTED')&&!on(src0,'EXHAUSTED')||src1.cardId!==src0.cardId?'ok':'pending';
  if(src0?.CARDTYPE==='LOCATION')
    return opened||!src1||(src1.DAMAGE??0)!==(src0.DAMAGE??0)||(src1.COOLDOWN??0)!==(src0.COOLDOWN??0)?'ok':'pending';

  if(src0&&['MINION','HERO'].includes(src0.CARDTYPE)&&action.targetId!=null){
    const swung=!src1||attacks(src1)>attacks(src0)||on(src1,'EXHAUSTED')&&!on(src0,'EXHAUSTED');
    // Another of our bodies swung instead: the click grabbed the wrong attacker.
    const other=(before.me.board??[]).some(c=>c.entityId!==action.entityId
      &&['MINION','HERO'].includes(c.CARDTYPE)&&attacks(byId(after.me.board,c.entityId))>attacks(c));
    // Or the click landed in the hand and dragged a card out instead of swinging.
    if(!swung)return other||gone.length?'misfire':'pending';
    // It swung. A 0-Attack swing marks nothing on the target, so only judge real hits.
    if((src0.ATK??0)>0&&wasHit(before,after,action.targetId)===false){
      const struck=(before.opponent.board??[]).some(c=>c.entityId!==action.targetId&&wasHit(before,after,c.entityId));
      return struck?'misfire':'pending';
    }
    return 'ok';
  }
  // Anything else (a weapon swing routed through the hero, an unforeseen option type): fall back
  // to "the board moved", which is what the loop accepted before.
  return 'ok';
}
