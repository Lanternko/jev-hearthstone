import {textOf,tagOn} from './mechanics.mjs';
import {discardModel} from './discard-model.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
export function temporaryPayoff(card){
 return discardModel({type:card.CARDTYPE,text:textOf(card),name:card.name,
  hp:Number(card.HEALTH??card.baseHealth??0)-Number(card.DAMAGE??0)});
}
// A timing/mana preference, not a full end-of-turn simulation or a promise
// that unknown triggers cannot alter the summoned body.
export function temporaryDiscardAssessments(state,actions=[]){
 if(state.choice||!state.me?.current||state.status!=='RUNNING')return [];
 const board=state.me.board??[],hand=state.me.hand??[],mana=Number(state.me.mana??0);
 const temporary=hand.filter(c=>c.temporary?.expires==='end_of_own_turn'
  &&Number(c.temporary.confidence)>=0.9);
 const slots=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const pending=temporary.reduce((n,c)=>{
  const d=temporaryPayoff(c);return n+(d.kind==='body'?1:['spiders','randomBodies'].includes(d.kind)?d.n:0);
 },0);
 const uncertainSlots=hand.some(c=>c.temporary&&(!temporary.includes(c)||temporaryPayoff(c).kind==='unknown'));
 const playEngine=board.some(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'DORMANT')&&!tagOn(c,'SILENCED')
  &&/\b(?:after|whenever|when)\b[^.]*\b(?:play|summon)\b/i.test(textOf(c)));
 return temporary.map(c=>{
  const payoff=temporaryPayoff(c),action=actions.find(a=>a.entityId===c.entityId&&a.targetId==null);
  const buffNow=hand.some(b=>b.entityId!==c.entityId&&/give your (?:other )?minions \+\d+\/\+\d+/i.test(textOf(b))
   &&cost(b)+cost(c)<=mana&&actions.some(a=>a.entityId===b.entityId&&a.targetId==null));
  const immediateAttack=tagOn(c,'RUSH')||tagOn(c,'CHARGE')||/\b(?:rush|charge)\b/i.test(textOf(c));
  const changesWeaponDiscard=[...board,...hand].some(w=>w.CARDTYPE==='WEAPON'
   &&/^after your hero attacks, discard your highest cost card\.?$/i.test(textOf(w)))
   &&hand.some(h=>h.entityId!==c.entityId&&h.CARDTYPE!=='WEAPON')
   &&cost(c)>=Math.max(...hand.filter(h=>h.CARDTYPE!=='WEAPON').map(cost));
  const fits=!uncertainSlots&&slots>=pending&&slots>=1;
  // 2026-10-05 ruling: a Temporary card with a discard payoff is fodder -- it pays out at end of turn
  // for free, so never hand-cast it, unless the mana also covers a board buff played with it.
  // (Game 1 of the 10-05 batch: turn 3, 3 mana, Catacombs gave a Temporary Boneweb Egg and we paid 2
  // to play it.) The earlier exceptions -- rush, play/summon engines, the weapon discard -- are gone.
  const fodder=['body','spiders','randomBodies','draw'].includes(payoff.kind);
  const deferHardCast=fodder&&cost(c)>0&&!buffNow;
  return {version:'temporary-discard-v1',entityId:c.entityId,name:c.name,confidence:c.temporary.confidence,
   sourceEntityId:c.temporary.sourceEntityId,expires:c.temporary.expires,playActionId:action?.id??null,
   payoff,pendingBodySlots:pending,uncertainSlots,slots,fits,castCost:cost(c),endTurnManaCost:0,
   buffNow,immediateAttack,playEngine,changesWeaponDiscard,deferHardCast,
   guidance:'Verified Temporary expiration discards this card at the end of your own turn. Its discard payoff is separate from paying its mana cost. For a known self-summoning body with room, conserve mana unless playing now enables an immediate attack, an affordable buff or a play/summon trigger. Consider a safe draw with spare mana, or other useful plays; drawing is optional. Reserve slots for expiring summons and recheck after every action. End-of-turn order and unknown triggers are not simulated; do not assume survival, random identities or attack readiness.'};
 });
}
