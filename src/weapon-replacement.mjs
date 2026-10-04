// Equipping a new weapon destroys the equipped one with its remaining durability.
// When the old swing hits at least as hard and both orders discard from the same
// highest-cost set, swing-then-equip keeps every equip-first outcome, leaves the
// new weapon unworn, and adds the option to spend mana after the discard payoff.
// User ruling: new50 game 3 turn 6 (Chronoclaws 1 durability, Hand of Gul'dan).
import {textOf,tagOn,heroCanSwing} from './mechanics.mjs';
import {discardModel,discardGrowth} from './discard-model.mjs';
import {enemyHero} from './lethal.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const atk=c=>Number(c?.ATK??c?.baseAttack??0);
const hp=c=>Number(c?.HEALTH??c?.baseHealth??0)-Number(c?.DAMAGE??0);
// Only the known highest-cost discard text is modelled. Any other weapon text
// (deathrattle, battlecry, keywords) leaves the orders to comparison.
const highestDiscard=c=>c?.CARDTYPE==='WEAPON'&&!tagOn(c,'SILENCED')&&!tagOn(c,'WINDFURY')
 &&/^After your hero attacks, discard your highest Cost card\.?$/i.test(textOf(c));
// A discard that pays in full: drawn cards fit the hand and deck, bodies fit the board.
function payoff(c){
 const m=discardModel({type:c.CARDTYPE,name:c.name,text:textOf(c),hp:hp(c)});
 const growth=discardGrowth({...c,text:textOf(c)});
 const kind=growth?'none':m.kind;
 return {entityId:c.entityId,name:c.name,cost:cost(c),kind,
  draws:kind==='draw'?m.n:0,bodies:kind==='body'?1:['spiders','randomBodies'].includes(kind)?m.n:0,
  pays:['body','spiders','randomBodies','draw'].includes(kind)};
}

export function weaponReplacement(state,actions=[]){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current)return null;
 const me=state.me,hand=me.hand??[],board=me.board??[],mana=Number(me.mana??0);
 const hero=board.find(c=>c.CARDTYPE==='HERO'),old=board.find(c=>c.CARDTYPE==='WEAPON'),foe=enemyHero(state);
 if(!hero||!foe||!highestDiscard(old)||tagOn(hero,'WINDFURY')||!heroCanSwing(state))return null;
 const swings=actions.filter(a=>a.entityId===hero.entityId&&a.targetId!=null);
 const face=swings.find(a=>a.targetId===foe.entityId);
 // A free face swing is what makes "equip and hold" no better than swing first;
 // secrets can punish that swing, so they are left to comparison.
 if(!face||Number(state.opponent?.secretCount??0)>0)return null;
 const top=Math.max(-Infinity,...hand.map(cost)),targets=hand.filter(c=>cost(c)===top).map(payoff);
 const slots=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const draws=Math.max(0,...targets.map(t=>t.draws)),bodies=Math.max(0,...targets.map(t=>t.bodies));
 for(const w of hand.filter(highestDiscard)){
  const equip=actions.find(a=>a.type==='POWER'&&a.entityId===w.entityId&&a.targetId==null);
  if(!equip||cost(w)>mana)continue;
  // The user's contrast: if the new weapon is (or ties for) the highest card,
  // swinging first may discard it, so the orders differ and are compared.
  if(targets.some(t=>t.entityId===w.entityId))continue;
  if(atk(w)>atk(old))continue;
  if(!targets.length||!targets.every(t=>t.pays))continue;
  if(hand.length-1+draws>10||draws>Number(me.deckCount??0)||bodies>slots)continue;
  return {version:'weapon-replacement-v1',equipActionId:equip.id,weaponId:w.entityId,replacedId:old.entityId,
   heroId:hero.entityId,swingActionIds:swings.map(a=>a.id),
   proof:{oldAttack:atk(old),newAttack:atk(w),oldDurability:hp(old),newCost:cost(w),mana,
    sameDiscardSet:targets.map(t=>({entityId:t.entityId,name:t.name,cost:t.cost,kind:t.kind,draws:t.draws,bodies:t.bodies})),
    handAfterSwing:hand.length-1+draws,deckCount:Number(me.deckCount??0),freeSlots:slots,faceSwing:face.id},
   guidance:`Swing the equipped ${old.name} before equipping ${w.name}: equipping destroys its remaining durability, the swing hits as hard, and both orders discard from the same highest-cost payoff set (${targets.map(t=>t.name).join(' or ')}). Observe the payoff, then decide whether to equip with the remaining mana.`};
 }
 return null;
}
