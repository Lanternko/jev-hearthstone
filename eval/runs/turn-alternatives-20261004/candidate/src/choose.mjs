// One fresh decision, from a parsed state and its legal (constrained) actions to the action taken.
// bridge.mjs drives it live; eval-score.mjs drives the same code over labelled positions, so the
// offline score measures exactly the pipeline that plays.
import {ask} from './jev.mjs';
import {forcedAction,spendFirst,setupFirst,dhTempoActions,buffSetupActions,lowBoardDiscardActions,boardRecoveryActions} from './policy.mjs';
import {criteria,bodies,buffImpact} from './describe.mjs';
import {menu,actionFor,developmentMenu} from './plan.mjs';
import {dhTacticalAction} from './dh-tactics.mjs';
import {boardEffectAssessments,EFFECT_VERSION} from './effect-state.mjs';
import {warlockInformationAction} from './warlock-information.mjs';
import {earlyCoinDevelopment} from './early-coin.mjs';
import {openingBurstAssessment,openingBurstAction,holdForOpeningBurst} from './opening-burst.mjs';
import {matchupObjective,resourceToolAssessments} from './matchup-objective.mjs';
import {temporaryOpeningAction} from './temporary-opening.mjs';
import {weaponBuffAssessment} from './weapon-buff.mjs';
import {combinationAdmission,admissionEvidence,admittedLines} from './combo-admission.mjs';
import {immediateDraws,textOf} from './mechanics.mjs';
import {chamberIntents,preferredChamberIntent} from './chamber-intent.mjs';
import {weaponPreservation,preferredWeaponPreservation} from './weapon-preservation.mjs';
import {divineShieldAssessment} from './divine-shield.mjs';
import {temporaryDiscardAssessments} from './temporary-discard.mjs';
import {handRetentionAssessment} from './hand-retention.mjs';
import {turnAlternatives} from './turn-alternatives.mjs';

// A queued nonlethal plan must pass the same fresh-state preservation ruling.
// Historical engines omit this hook; the bridge keeps their behavior frozen.
export function allowsWeaponContinuation(state,actions,action){
 const preferred=preferredWeaponPreservation(state,actions);
 return !preferred||preferred.action.id===action.id;
}

// Direct choices and queued attacks share spendFirst's actual setup exceptions
// (space-making trades and proved weapon development). No new buff name list.
export function turnOrderAssessment(state,actions,{admission=combinationAdmission(state,actions)}={}){
 if(state.choice)return {version:'turn-order-v1',buffs:[],heldAttackIds:[]};
 const setup=setupFirst(state,actions),hand=state.me?.hand??[];
 const buffs=hand.filter(c=>buffImpact(state,c)&&setup.some(a=>a.entityId===c.entityId
  ||Number(c.COST??c.baseCost??0)===Number(state.me?.mana??0)+1
   &&/gain 1 mana crystal this turn only/i.test(textOf(hand.find(x=>x.entityId===a.entityId)))));
 const allowed=new Set(spendFirst(state,actions,{admission}).map(a=>a.id));
 const held=actions.filter(a=>a.targetId!=null&&(state.me.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE))
  &&!hand.some(c=>c.entityId===a.targetId)&&!allowed.has(a.id));
 return {version:'turn-order-v1',buffs:buffs.map(c=>({entityId:c.entityId,name:c.name,cost:Number(c.COST??c.baseCost??0),impact:buffImpact(state,c)})),
  heldAttackIds:buffs.length?held.map(a=>a.id):[],
  guidance:'A queued nonlethal attack must obey the same current setup-before-attack rule as a fresh choice. Drop the queue and reobserve/replan when a beneficial legal buff is waiting; do not turn a deferred buff into an unavailable future card. Drawing remains optional; lethal and proved setup/space-making attacks keep priority.'};
}
export function allowsPlanContinuation(state,actions,action,opts){
 return allowsWeaponContinuation(state,actions,action)
  &&!handRetentionAssessment(state,actions).copyPreferences.some(p=>p.deferredEntityIds.includes(action.entityId)&&action.targetId==null)
  &&!temporaryDiscardAssessments(state,actions).some(c=>c.deferHardCast&&c.playActionId===action.id)
  &&!turnOrderAssessment(state,actions,opts).heldAttackIds.includes(action.id);
}

export const INSTRUCTIONS='Choose ONE turn intent or next action, including mulligan replacements when applicable. PLAN options describe simulated sequences and their known outcomes; choosing one executes exact steps in order, stopping at unknown effects to observe and replan. Effect assessments include current applicability, evidence confidence and estimated strength. Confidence is not a probability that a future trigger occurs and is not effect strength. With equal stats and removal cost, prefer removing a confidently active beneficial engine over a spent or wrong-zone effect. With different stats or costs, compare lost minions, mana, face damage, survival, opponent trigger opportunities and effect strength; a strong engine can justify spending several resources. Unknown effects require reading the complete text, not treating them as blank or automatically spending extra resources. Lethal and survival take priority over engine removal. First decide WHETHER drawing belongs in this turn, not merely whether a draw is legal. If drawing is chosen and its costs preserve the intended follow-up and survival, draw before committing buffs and attacks. Apply the intended buff before attacks that benefit from it. Respect visible card text, mana, lethal and survival. Compare turnAlternatives as complete mana-feasible intents: random removal followed by development competes with immediate minion plays, while draws remain optional. Reserve the indicated follow-up mana, stop at the random or draw boundary, and re-evaluate observed survivors and cards. HandRetention identifies conditional linked-card loss, not turn-end expiry; with otherwise equivalent payable minions use the endangered copy first. Its confidence measures observed link evidence, not the chance that the source dies. Every action is followed by a new observation.';

// Everything decided without asking Jev: a forced action, a searched lethal, or the menu to ask.
export function prepare(state,full,{planner=true,admission=combinationAdmission(state,full)}={}){
 const chamber=chamberIntents(state,full);
 const preservation=weaponPreservation(state,full);
 const p=prepareDecision(state,full,{planner,admission,chamber,preservation});
 const alternatives=turnAlternatives(state,full);
 const retention=handRetentionAssessment(state,full);
 if(p.crit)for(const intent of alternatives){const id=intent.firstActionId;if(p.crit[id])p.crit[id]={...p.crit[id],
  turnAlternatives:[...(p.crit[id].turnAlternatives??[]),intent],description:p.crit[id].description+' '+intent.guidance};}
 if(p.crit)for(const r of retention.risks){const a=full.find(a=>a.entityId===r.entityId&&a.targetId==null);if(a&&p.crit[a.id])p.crit[a.id]={...p.crit[a.id],description:p.crit[a.id].description+' '+r.guidance};}
 return {...p,turnAlternatives:alternatives,handRetention:retention,temporaryDiscard:temporaryDiscardAssessments(state,full),divineShield:divineShieldAssessment(state,full),turnOrder:turnOrderAssessment(state,full,{admission}),weaponPreservation:preservation,chamberIntents:chamber,combinationEvidence:admissionEvidence(admission,p.acts??full),
  decisionPolicy:{version:'turn-intent-v2',source:p.lethal?.source??p.forced?.source??'compare_intents',
   weaponProofKey:p.weaponBuff?.proofKey??null,
   priority:['legal/survival gates','visible lethal','expiring development','chosen information preserving setup mana',
    'valuable body before costly discard weapon','proved user weapon ruling','guaranteed safe location development','opening/tactical/recovery rulings','compare feasible development and buff intents']}};
}
function prepareDecision(state,full,{planner,admission,chamber,preservation}){
 // Kills are looked for on the full menu; only then are the attacks held back until the hand
 // is spent (policy.mjs spendFirst). A planned lethal keeps the full menu to the end.
 let acts=spendFirst(state,full,{admission});
 const forced=forcedAction(state,full);
 if(forced)return {forced};
 let crit=criteria(state,full),plans={},searchStats,comboPick;
 if(planner&&!state.choice){
  const m=menu(state,full,crit,{admission});
  // A kill found by search is arithmetic over a visible board, like lethal.mjs: not put to a vote.
  if(m.lethal){
   const action=actionFor(full,m.lethal[0]);
   if(action)return {lethal:{action,source:'planned_lethal',plan:'lethal'},rest:m.lethal.slice(1)};
  }
  crit=m.criteria;plans=m.plans;searchStats=m.stats;comboPick=m.comboPick;
 }
 const preserve=preferredWeaponPreservation(state,full,preservation);
 if(preserve)return {forced:preserve};
 for(const intent of preservation){
  for(const a of full.filter(a=>a.id===intent.equipActionId||a.entityId===intent.heroId||intent.development.some(c=>c.playActionId===a.id))){
   if(crit[a.id])crit[a.id]={...crit[a.id],weaponPreservation:intent,
    description:crit[a.id].description+' '+intent.guidance+' Current swing targets: '
     +intent.targets.map(c=>`${c.name} ${c.attack}/${c.health}, discard=${c.discardKind}`).join(' or ')+'.'};
  }
 }
 const expiringDevelopment=temporaryOpeningAction(state,full);
 if(expiringDevelopment)return {forced:expiringDevelopment};
 const weaponBuff=weaponBuffAssessment(state,acts,{admission});
 // A selected information intent may precede development if it preserves the
 // complete setup cost. A merely legal draw still does not create that intent.
 const information=warlockInformationAction(state,acts);
 const informationCard=information&&[...(state.me.hand??[]),...(state.me.board??[])]
  .find(c=>c.entityId===information.action.entityId);
 if(information&&(!weaponBuff?.preferred||Number(informationCard?.COST??informationCard?.baseCost??0)
  +weaponBuff.mana.total<=Number(state.me.mana)))return {forced:information,weaponBuff};
 if(weaponBuff?.preferred)return {forced:{action:weaponBuff.preferred,source:'weapon_discard_buff'},weaponBuff};
 const chamberDevelopment=preferredChamberIntent(state,acts,chamber);
 if(chamberDevelopment)return {forced:chamberDevelopment};
 for(const intent of chamber){
  const id=intent.firstActionId;
  if(id&&crit[id])crit[id]={...crit[id],chamberIntent:intent,
   description:crit[id].description+' Staged intent: '+intent.guidance
    +' Payoff outcomes: '+intent.candidates.map(c=>`${c.name}: ${c.guaranteedOffer?'guaranteed in offer':'offer uncertain'}, `
     +`${c.knownBodies?'known':'possible'} ${c.bodies} body/bodies${c.attack!=null?` of ${c.attack}/${c.health}`:''}, `
     +`fits=${c.fits}, safe refill=${c.safeDraw}`).join('; ')+`. ${intent.chargesAfterUse} charge(s) remain after activation.`};
 }
 // Both complete combos and incomplete weapon alternatives use the shared
 // development evidence. Do not add a duplicate weapon-only PLAN beside it.
 ({criteria:crit,plans}=developmentMenu(state,acts,crit,plans,{admission}));
 const openingBurst=openingBurstAssessment(state);
 const objective=matchupObjective(state);
 if(objective.mode!=='board_resource')acts=holdForOpeningBurst(state,acts,openingBurst);
 const earlyDevelopment=earlyCoinDevelopment(state,acts);
 if(earlyDevelopment)return {forced:earlyDevelopment};
 const tactical=dhTacticalAction(state,acts);
 if(tactical)return {forced:tactical};
 const burst=objective.mode==='board_resource'?null:openingBurstAction(state,acts,openingBurst);
 if(burst)return {forced:burst};
 const recover=boardRecoveryActions(state,full)[0];
 if(recover)return {forced:{action:recover,source:'board_recovery'}};
 // Immediate/planned lethal was checked above. Before ordinary value choices,
 // take the user's summon-then-buff line when bodies fit and buff mana remains,
 // with no hidden RNG forecast.
 const card=id=>(state.me.hand??[]).find(c=>c.entityId===id);
 const cost=c=>Number(c?.COST??c?.baseCost??0);
 const setup=buffSetupActions(state,acts).sort((a,b)=>bodies(card(b.entityId))-bodies(card(a.entityId))||cost(card(a.entityId))-cost(card(b.entityId)))[0];
 const freeInformation=acts.some(a=>{
  const c=card(a.entityId);
  return c&&cost(c)===0&&/\b(draw|discover)\b/i.test(c.text??'');
 });
 const alternativeCombo=admittedLines(admission,acts).some(l=>l.steps[0].id!==setup?.entityId);
 // Holding an affordable buff is not itself a decision to buff. A legal
 // chosen-discard line may produce removal/resources that this proof pass
 // deliberately cannot model. Keep it for Jev instead of forcing development
 // simply because no second modelled buff combo was found (g4t7r616).
 const slots=7-(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const competingDiscard=acts.filter(a=>{
  const source=card(a.entityId),target=card(a.targetId);
  if(!target||!/choose a card in your hand.*discard/i.test(textOf(source)))return false;
  // The user's five-body ruling: the outlet itself consumes a slot, so an
  // otherwise identical Acolytes summon clipped by that outlet is dominated.
  return !/summon/i.test(textOf(target))||1+bodies(target)<=slots;
 });
 if(setup&&!freeInformation&&!weaponBuff?.compare&&!alternativeCombo&&!competingDiscard.length)
  return {forced:{action:setup,source:'buff_setup'}};
 const develop=lowBoardDiscardActions(state,full)[0];
 if(develop&&!freeInformation)return {forced:{action:develop,source:'low_board_discard'}};
 const hasTurnPlan=Object.values(plans).some(steps=>{
  const first=actionFor(full,steps[0]);return first&&acts.some(a=>a.id===first.id);
 });
 if(acts.length===1&&!hasTurnPlan)return {forced:{action:acts[0],source:'forced_spend'}};
 if(acts.length<full.length){
  // Keep the whole intent when its FIRST step is allowed (e.g. buff -> attacks).
  const allowed=new Set(acts.map(a=>a.id));
  plans=Object.fromEntries(Object.entries(plans).filter(([,steps])=>{
   const first=actionFor(full,steps[0]);return first&&allowed.has(first.id);
  }));
  crit=Object.fromEntries(Object.entries(crit).filter(([id])=>allowed.has(id)||plans[id]));
 }
 return {acts,crit,plans,state,searchStats,comboPick:plans[comboPick]?comboPick:null,openingBurst,objective,weaponBuff,resourceTools:resourceToolAssessments(state)};
}

export const askJev=(state,p,strategy,opts)=>
 ask({board:state,strategy,matchupObjective:p.objective,weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,turnOrder:p.turnOrder,turnAlternatives:p.turnAlternatives,handRetention:p.handRetention,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,combinationEvidence:p.combinationEvidence,resourceTools:p.resourceTools,openingBurst:p.openingBurst&&{...p.openingBurst,now:p.openingBurst.now.slice(0,3)},effectAssessments:{version:EFFECT_VERSION,cards:boardEffectAssessments(state)}},{move:{type:'choice',instructions:INSTRUCTIONS+' Compare chamberIntents as staged development plus refill, not installation alone. At most three remaining hand cards guarantees an offered payoff; more does not. Reobserve installation, activation and choice, and never queue through unknown draws. Use weaponBuff to compare mana-feasible weapon-discard and direct-summon buff lines; its guidance describes three cases. Do not spend the reserved buff mana or invent random summons. Opponent class prior probabilities and confidence are local frequency estimates, not known archetypes. For mulligan apply matchupObjective.mulligan.preferences: these already blend the aggression/pressure guess with confidence, so low support stays near neutral. Favor immediate cheap bodies and reliable trades as earlyBoard/efficientTrade rise; favor attacking pressure as immediatePressure rises; discount conditional slow setup by its multiplier. Aggression is a tempo proxy, not a known pure aggro deck. Control and combo share the pressure opening strategy. Public cards override the prior during play; never assume a fixed combo turn or waive early-curve/discard-material constraints.',criteria:p.crit}},opts);

// Jev's pick back to a legal action; a PLAN pick is its first step plus the steps still to run.
export function resolve(p,pick){
 const plan=p.plans[pick];
 const action=plan?actionFor(p.acts,plan[0]):p.acts.find(a=>a.id===pick);
 if(!action)throw Error('Invalid choice');
 return {action,plan};
}

// When Jev cannot be reached (2026-09-26, games 14-15: the provider answered "high demand" for
// 35s and 60 retries), waiting risks the turn timer. The menu is already filtered by policy.mjs,
// so a rule pick from it is legal and sane: the planner's top plan, else the first option that
// is not ending the turn (cards come before attacks, as spendFirst ordered them), else end turn.
export function rulePick(p){
 // Unknown/random summons are not represented in attack search; do not let p1 starve them.
 const tempo=p.state&&dhTempoActions(p.state,p.acts).find(a=>Object.hasOwn(p.crit,a.id));
 if(tempo)return tempo.id;
 if(p.comboPick&&p.plans[p.comboPick]){
  const info=p.plans.p1?.[0],src=info&&[...(p.state?.me?.hand??[]),...(p.state?.me?.board??[])].find(c=>c.entityId===info.id);
  const left=p.crit[p.comboPick]?.combination?.followup.manaAfterBuff??-1;
  // Existing user ruling: when the draw intent is already preferred and
  // leaves the complete development+buff affordable, get information first.
  // Admission is a competing option, not an unconditional ban on drawing.
  if(src&&immediateDraws(src,p.state)>0&&left>=Number(src.COST??src.baseCost??0))return 'p1';
  return p.comboPick;
 }
 if(p.plans.p1)return 'p1';
 const ids=Object.keys(p.crit);
 const act=p.acts.find(a=>a.type!=='END_TURN'&&ids.includes(a.id));
 return act?.id??ids[0];
}
