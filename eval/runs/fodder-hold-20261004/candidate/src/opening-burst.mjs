import {isCoin} from './power.mjs';
import {deckFor} from './deck.mjs';
import {buffImpact} from './describe.mjs';
import {cardModel} from './sim.mjs';
import {textOf} from './mechanics.mjs';

export const OPENING_BURST_VERSION='opening-burst-v1';
const cost=c=>Number(c.COST??c.baseCost??0);
const live=c=>c.CARDTYPE==='MINION'&&!Number(c.DORMANT??0)
 &&Number(c.HEALTH??c.baseHealth??1)>Number(c.DAMAGE??0);
const slots=board=>board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
const acolytes=c=>c.name==='Disposable Acolytes'
 &&/^When you play or discard this, summon two random 1-Cost minions\.?$/i.test(textOf(c));
const occultist=c=>c.name==='Ocular Occultist'&&c.CARDTYPE==='MINION'
 &&/^Taunt Battlecry: Choose a card in your hand to discard\.?$/i.test(textOf(c));
const payload=c=>{
 if(acolytes(c))return {n:2,random:true};
 if(c.CARDTYPE==='MINION'&&/^(?:Taunt )?If you discard this minion, summon it\.?$/i.test(textOf(c)))return {n:1};
 if(c.name==='Boneweb Egg'&&/If you discard this, trigger its Deathrattle/i.test(textOf(c)))return {n:2};
 return null;
};
const view=(state,p)=>({...state,me:{...state.me,hand:p.hand,
 board:[...(state.me.board??[]),...Array.from({length:p.added},(_,i)=>({entityId:-100-i,CARDTYPE:'MINION',HEALTH:1}))]}});
const usable=state=>state.status==='RUNNING'&&state.me?.current&&!state.choice
 &&deckFor(state).name==='warlock-discard'&&Number(state.me.maxMana)>=1&&Number(state.me.maxMana)<=3;

// A bounded visible-hand resource search, not an opponent simulator. Future
// lines are conditional on the existing board surviving, with no assumed draw.
// Random identities and Battlecry choices are observation boundaries, never queued.
function lines(state,mana,turnsAhead){
 const results=[],initial={hand:state.me.hand??[],mana,added:0,steps:[],coin:false,selfHit:0,random:false};
 const visit=p=>{
  for(const c of p.hand){
   if(cost(c)>p.mana)continue;
   const v=buffImpact(view(state,p),c);
   if(!v||cost(c)>1||v.recipients<3)continue;
   // Whispers must not consume Coin, another buff or an unmodelled real card.
   if(!v.safeDiscard)continue;
   results.push({turnsAhead,manaBudget:mana,manaLeft:p.mana-cost(c),steps:[...p.steps,{id:c.entityId}],
    recipients:v.recipients,added:p.added+v.added,attackGain:v.attack,healthGain:v.health,
    discardTargets:v.targets.map(x=>({id:x.entityId,name:x.name})),usesCoin:p.coin,selfDamage:p.selfHit,
    randomSummons:p.random||v.targets.some(acolytes),conditional:turnsAhead>0});
  }
  if(p.steps.length>=3)return;
  const room=7-slots(state.me.board??[])-p.added;
  for(const c of p.hand){
   if(isCoin(c)&&!p.coin){
    visit({...p,hand:p.hand.filter(x=>x!==c),mana:p.mana+1,coin:true,steps:[...p.steps,{id:c.entityId}]});continue;
   }
   if(cost(c)>p.mana||room<=0)continue;
   const branch=(n,{target,random=false,selfHit=0}={})=>{
    if(n>room)return; // never count an overflowing summon
    visit({...p,hand:p.hand.filter(x=>x!==c&&x!==target),mana:p.mana-cost(c),added:p.added+n,
     selfHit:p.selfHit+selfHit,random:p.random||random,
     steps:[...p.steps,{id:c.entityId,...(target?{target:target.entityId}:{})}]});
   };
   if(occultist(c)){
    for(const t of p.hand){const pay=payload(t);if(t!==c&&pay)branch(1+pay.n,{target:t,random:pay.random});}
   }else if(acolytes(c))branch(2,{random:true});
   else{
    const m=cardModel({type:c.CARDTYPE,text:textOf(c),raw:c});
    // Only fixed, active bodies here. Platysaur draws and therefore cannot have
    // a known continuation until its real draw is observed.
    if(m?.kind==='minion'&&Number(c.ATK??c.baseAttack??0)>0
      &&!Number(c.DORMANT??0)&&! /Dormant/i.test(textOf(c)))branch(1+(m.summon?.n??0),{selfHit:m.selfHit??0});
   }
  }
 };
 visit(initial);
 const hp=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
 const health=Number(hp?.HEALTH??0)-Number(hp?.DAMAGE??0)+Number(hp?.ARMOR??0);
 const coinIndex=p=>p.steps.findIndex(s=>(state.me.hand??[]).some(c=>c.entityId===s.id&&isCoin(c)));
 return results.filter(p=>health>p.selfDamage).sort((a,b)=>
  b.recipients-a.recipients||a.selfDamage-b.selfDamage||a.steps.length-b.steps.length||Number(a.usesCoin)-Number(b.usesCoin)
  ||coinIndex(b)-coinIndex(a)); // observe random bodies before spending Coin when both orders fit
}

export function openingBurstAssessment(state){
 if(!usable(state))return null;
 const now=lines(state,Number(state.me.mana??0),0);
 const future=[];
 for(let ahead=1;ahead<=2&&Number(state.me.maxMana)+ahead<=3;ahead++){
  const candidate=lines(state,Number(state.me.maxMana)+ahead,ahead)[0];
  if(candidate)future.push(candidate);
 }
 const existing=(state.me.board??[]).filter(live).length;
 return {version:OPENING_BURST_VERSION,existing,now,future,
  survivalSensitivity:future.map(p=>({turnsAhead:p.turnsAhead,
   recipientsIfLose0:p.recipients,recipientsIfLose1:Math.max(0,p.recipients-Math.min(existing,1)),
   recipientsIfLose2:Math.max(0,p.recipients-Math.min(existing,2))})),
  assumptions:'Future lines require retained cards, normal next-turn mana and surviving current bodies. No future draw, opponent pass, control label or immunity to AOE is assumed. The compulsory next draw can change Whispers lowest-cost targets; re-evaluate before casting. Random summons predict occupied slots only; eligible buff targets and stats must be observed.'};
}

function quietBoard(state){
 const board=state.opponent?.board??[];
 const hp=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
 // With pressure/unknown board triggers, let the model compare removal and
 // survival. An empty public board is not evidence of an inaccessible deck label.
 return Number(hp?.HEALTH??0)-Number(hp?.DAMAGE??0)>10
  &&!board.some(c=>['MINION','LOCATION','WEAPON'].includes(c.CARDTYPE)||Number(c.ATK??0)>0)
  &&!(state.opponent?.secrets?.length||Number(state.opponent?.secretCount??0))
  &&!(state.me.board??[]).some(c=>live(c)&&/\b(?:whenever|after|spellburst|aura)\b/i.test(textOf(c)));
}

export function openingBurstAction(state,actions,assessment=openingBurstAssessment(state)){
 if(!assessment||!quietBoard(state))return null;
 for(const line of assessment.now){
  const first=line.steps[0],source=(state.me.hand??[]).find(c=>c.entityId===first.id);
  const action=actions.find(a=>a.entityId===first.id&&(a.targetId??null)===(first.target??null))
   ??(source&&occultist(source)?actions.find(a=>a.entityId===first.id&&a.targetId==null):null);
  if(!action)continue;
  // Preserve room for survival, lethal and free information, checked by caller.
  return {action,source:OPENING_BURST_VERSION,openingBurst:line};
 }
 return null;
}

// After lethal has been checked, remove a premature single-recipient buff/Coin
// only when a concrete wider T2/T3 line exists and the public board is quiet.
export function holdForOpeningBurst(state,actions,assessment=openingBurstAssessment(state)){
 if(!assessment||!quietBoard(state)||assessment.existing!==1||assessment.now.length
   ||!assessment.future.some(p=>p.usesCoin))return actions;
 const hand=state.me.hand??[];
 const held=actions.filter(a=>{
  const c=hand.find(x=>x.entityId===a.entityId);
  if(!c)return true;
  if(isCoin(c))return false;
  return !(buffImpact(state,c)?.recipients<=1);
 });
 return held.length?held:actions;
}
