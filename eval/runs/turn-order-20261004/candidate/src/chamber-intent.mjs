// A staged location intent, not a queued forecast. Installation, activation,
// the actual three-card offer and unknown draws each require a new observation.
import {textOf,tagOn} from './mechanics.mjs';
import {discardModel} from './discard-model.mjs';
import {drawImpact} from './draw-risk.mjs';

export const CHAMBER_INTENT_VERSION='chamber-intent-v1';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const hp=c=>Number(c?.HEALTH??c?.baseHealth??0)-Number(c?.DAMAGE??0);
const chamber=c=>c?.CARDTYPE==='LOCATION'&&!tagOn(c,'SILENCED')
 &&/^Look at 3 cards in your hand and choose one to discard\. Draw two cards\.?$/i.test(textOf(c));
const occupied=board=>board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
function payoff(c){
 const model=discardModel({type:c.CARDTYPE,name:c.name,text:textOf(c),hp:hp(c)});
 const body=model.kind==='body',spiders=model.kind==='spiders',random=model.kind==='randomBodies';
 return {entityId:c.entityId,name:c.name,kind:model.kind,bodies:body?1:spiders||random?model.n:0,
  ...(body?{attack:Number(c.ATK??c.baseAttack??0),health:hp(c)}
    :spiders?{attack:model.atk,health:model.hp}:{}),
  knownBodies:body||spiders,possibleBodies:random,extraDraws:model.kind==='draw'?model.n:0};
}

export function chamberIntents(state,actions=[]){
 if(state.me?.heroClass!=='WARLOCK'||state.status!=='RUNNING'||!state.me.current)return [];
 const hand=state.me.hand??[],board=state.me.board??[],source=state.choice?.source;
 const sources=state.choice?(chamber(source)?[source]:[]):[...hand,...board].filter(chamber);
 return sources.map(c=>{
  const phase=state.choice?'choose':hand.some(x=>x.entityId===c.entityId)?'install':'activate';
  const rest=phase==='install'?hand.filter(x=>x.entityId!==c.entityId):hand;
  const offers=phase==='choose'?state.choice.entities??[]:rest;
  const installCost=phase==='install'?cost(c):0;
  const charges=phase==='install'?Number(c.HEALTH??c.baseHealth??0):hp(c);
  // On its last use the location disappears before its chosen discard summons.
  const slotsAtDiscard=7-occupied(board)-(phase==='install'?1:0)+(phase!=='choose'&&charges===1?1:0);
  const action=phase==='choose'?null:actions.find(a=>a.type==='POWER'&&a.entityId===c.entityId&&a.targetId==null);
  const ready=phase==='install'||phase==='choose'||!tagOn(c,'EXHAUSTED')&&Number(c.LOCATION_ACTION_COOLDOWN??0)===0;
  const candidates=offers.map(x=>{
   const p=payoff(x),afterDiscard=rest.filter(y=>y.entityId!==x.entityId);
   const risk=drawImpact({...state,me:{...state.me,hand:afterDiscard}},2+p.extraDraws);
   return {...p,guaranteedOffer:phase==='choose'||rest.length<=3,fits:p.bodies>0&&p.bodies<=slotsAtDiscard,
    drawRisk:risk,choiceActionId:phase==='choose'?actions.find(a=>a.type==='CHOICE'&&a.entityId===x.entityId)?.id:null};
  }).filter(p=>p.knownBodies||p.possibleBodies||p.extraDraws);
  const hero=board.find(x=>x.CARDTYPE==='HERO'),health=hp(hero)+Number(hero?.ARMOR??0);
  const incoming=(state.opponent?.board??[]).filter(x=>x.CARDTYPE==='MINION'&&!tagOn(x,'DORMANT')&&!tagOn(x,'FROZEN'))
   .reduce((n,x)=>n+Number(x.ATK??x.baseAttack??0),0);
  for(const p of candidates)p.safeDraw=p.drawRisk.damageMax!=null&&p.drawRisk.burnMax===0
   &&p.drawRisk.usable>=3+p.extraDraws&&health>incoming+p.drawRisk.damageMax;
  return {version:CHAMBER_INTENT_VERSION,locationId:c.entityId,name:c.name,phase,firstActionId:action?.id??null,
   legal:phase==='choose'?actions.some(a=>a.type==='CHOICE'):!!action&&ready&&charges>0&&installCost<=Number(state.me.mana)&&occupied(board)<(phase==='install'?7:8),
   installCost,activationCost:0,manaAfter:Number(state.me.mana)-installCost,charges,chargesAfterUse:charges-1,
   handAfterInstall:rest.length,slotsAtDiscard,candidates,observeAfterEachStep:true,
   guidance:'Install for the observed mana cost, reobserve a legal ready activation (0 mana), then inspect the actual offer. A remaining hand of at most three guarantees inclusion; larger hands do not. Select an offered payoff that fits, then stop at the unknown two-card draw and replan. Installation alone neither summons nor draws.'};
 });
}

// Narrow user ruling: a guaranteed attacking body plus safe refill on an empty
// enemy board beats nonlethal random-discard burn or a standalone Life Tap.
// Other development/buff/removal intents, secrets and ambiguous offers stay votes.
export function preferredChamberIntent(state,actions,intents){
 if(Number(state.opponent?.secretCount??0)>0)return null;
 if((state.me?.board??[]).some(c=>!tagOn(c,'SILENCED')&&c.CARDTYPE==='MINION'
  &&/\b(?:after|whenever|when)\b[^.]*\b(?:summon|discard|draw|play)\b/i.test(textOf(c))))return null;
 const enemy=state.opponent?.board??[],foe=enemy.find(c=>c.CARDTYPE==='HERO');
 if(hp(foe)+Number(foe?.ARMOR??0)<=12||enemy.some(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'DORMANT')))return null;
 for(const intent of intents){
  const productive=intent.candidates.filter(p=>p.knownBodies&&p.attack>0&&p.guaranteedOffer&&p.fits&&p.safeDraw
   &&(intent.phase!=='choose'||p.choiceActionId));
  if(!intent.legal||productive.length!==1||intent.candidates.length!==1)continue;
  const p=productive[0],hand=state.me.hand??[];
  const competing=actions.some(a=>{
   const c=hand.find(c=>c.entityId===a.entityId);
   if(intent.phase==='choose')return a.type==='CHOICE'&&a.entityId!==p.entityId
    &&!/^(?:Rush )?Has \+2\/\+2 for each card you've discarded this game\.?$/i.test(textOf(c))
    &&/discard|damage|draw|summon/i.test(textOf(c));
   return c&&c.entityId!==intent.locationId&&c.entityId!==p.entityId
    &&!/^(?:Deal 4 damage\. Discard a random card\.)$/i.test(textOf(c));
  });
  if(competing)continue;
  const id=intent.phase==='choose'?p.choiceActionId:intent.firstActionId;
  const action=actions.find(a=>a.id===id);
  if(action)return {action,source:'chamber_development',chamberIntent:{...intent,selectedPayoffId:p.entityId}};
 }
 return null;
}
