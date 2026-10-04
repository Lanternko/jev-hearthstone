// Highest-cost discard is evaluated before equipment spends the development
// mana, and again before a swing. Equipment itself never discards a card.
import {textOf,tagOn,heroCanSwing,immediateDraws} from './mechanics.mjs';
import {discardModel,discardGrowth} from './discard-model.mjs';
import {enemyHero,heroHp} from './lethal.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const atk=c=>Number(c?.ATK??c?.baseAttack??0);
const hp=c=>Number(c?.HEALTH??c?.baseHealth??0)-Number(c?.DAMAGE??0);
const high=c=>c?.CARDTYPE==='WEAPON'&&!tagOn(c,'SILENCED')
 &&/^After your hero attacks, discard your highest Cost card\.?$/i.test(textOf(c));
function cardEvidence(c){
 const model=discardModel({type:c.CARDTYPE,name:c.name,text:textOf(c),hp:hp(c)});
 const growth=discardGrowth({...c,text:textOf(c)});
 const knownBody=c.CARDTYPE==='MINION'&&((growth>0&&/^(?:Rush\s+)?Has \+2\/\+2 for each card you've discarded this game\.?$/i.test(textOf(c)))
  ||/^(?:(?:Rush|Taunt|Divine Shield|Lifesteal|Windfury)\s*[.,]?\s*)*$/i.test(textOf(c)));
 return {entityId:c.entityId,name:c.name,cost:cost(c),attack:atk(c),health:hp(c),
  discardKind:growth?'none':model.kind,knownBody,
  // Unknown effects are evidence to compare, never a proved safe priority.
  paysOnDiscard:['body','spiders','randomBodies','draw'].includes(model.kind)};
}
function highest(hand){
 const top=Math.max(-Infinity,...hand.map(cost));
 return hand.filter(c=>cost(c)===top).map(cardEvidence);
}
export function weaponPreservation(state,actions=[]){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current||state.me.heroClass!=='WARLOCK')return [];
 const hand=state.me.hand??[],board=state.me.board??[],mana=Number(state.me.mana??0);
 const slots=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const hero=board.find(c=>c.CARDTYPE==='HERO'),worn=board.find(c=>c.CARDTYPE==='WEAPON');
 // Hero ATK already includes the equipped weapon. A replacement keeps only the
 // hero's own bonus (clamped: a stale tag must not make the swing weaker).
 const bonus=Math.max(0,atk(hero)-atk(worn));
 return [...board,...hand].filter(high).map(w=>{
  const equipped=board.some(c=>c.entityId===w.entityId),equipmentCost=equipped?0:cost(w);
  const rest=hand.filter(c=>equipped||c.entityId!==w.entityId),targets=highest(rest);
  const equipAction=actions.find(a=>a.type==='POWER'&&a.entityId===w.entityId&&a.targetId==null);
  const swings=actions.filter(a=>a.entityId===hero?.entityId&&a.targetId!=null);
  const available=heroCanSwing(state)&&(equipped?swings.length>0:!!equipAction&&equipmentCost<=mana);
  const development=targets.map(t=>{
   const play=actions.find(a=>a.type==='POWER'&&a.entityId===t.entityId&&a.targetId==null);
   return {...t,playActionId:play?.id??null,legalPlay:!!play&&t.cost<=mana&&slots>0,
    meaningfulBody:t.knownBody&&!t.paysOnDiscard&&t.attack>=Math.max(3,atk(w))&&t.health>=Math.max(4,atk(w)),
    affordableAfterEquipment:t.cost<=mana-equipmentCost,
    afterPlayThenEquipTargets:highest(rest.filter(c=>c.entityId!==t.entityId))};
  });
  return {version:'weapon-preservation-v1',weaponId:w.entityId,equipped,equipActionId:equipAction?.id??null,
   heroId:hero?.entityId,available,weaponAttack:atk(w),swingDamage:equipped?Math.max(atk(w),atk(hero)):atk(w)+bonus,
   mana:{available:mana,equipment:equipmentCost,afterEquipment:mana-equipmentCost},
   targets,ties:targets.length>1,development,
   guidance:'Equipment does not discard. Compare play valuable nonpayoff first against equip then attack: equipment may spend all development mana and the swing may destroy the body. Recheck highest-cost targets after every play and fresh draw; equal-cost ties are random. Future targets below assume no intervening draw or hand change. Lethal and urgent removal take priority; unknown effects and hidden information require comparison.'};
 });
}

export function preferredWeaponPreservation(state,actions,intents=weaponPreservation(state,actions)){
 const board=state.me?.board??[],foe=enemyHero(state);
 // Preserve the existing information-before-commitment choice when free
 // information can change the hand without consuming development mana.
 if(actions.some(a=>{
  const c=(state.me?.hand??[]).find(c=>c.entityId===a.entityId);
  return c&&cost(c)===0&&(immediateDraws(c,state)>0||/\bdiscover\b/i.test(textOf(c)));
 }))return null;
 if(!foe||Number(state.opponent?.secretCount??0)>0
  ||(state.opponent?.board??[]).some(c=>c.CARDTYPE==='MINION')
  ||board.some(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'SILENCED')&&/\b(?:after|whenever)\b/i.test(textOf(c))))return null;
 for(const i of intents){
  if(!i.available||i.ties||i.targets.length!==1||heroHp(foe)<=2*i.swingDamage)continue;
  const body=i.development[0];
  if(!body.meaningfulBody)continue;
  // Only equipment that crowds out this legal body is ordered after it.
  // Existing/replaced weapon effects stay in comparison rather than guessed.
  if(body.legalPlay&&(i.equipped||(!body.affordableAfterEquipment&&!board.some(c=>c.CARDTYPE==='WEAPON')))){
   return {action:actions.find(a=>a.id===body.playActionId),source:'weapon_preservation',weaponId:i.weaponId,protectedId:body.entityId};
  }
  // Fresh post-equipment state: if the only alternatives are a harmless face
  // swing or passing, preserve the valuable body for next turn. No queued play.
  const end=actions.find(a=>a.type==='END_TURN');
  if(i.equipped&&end&&actions.every(a=>a.type==='END_TURN'||(a.entityId===i.heroId&&a.targetId===foe.entityId)))
   return {action:end,source:'weapon_preservation_hold',weaponId:i.weaponId,protectedId:body.entityId};
 }
 return null;
}
