// One fresh decision, from a parsed state and its legal (constrained) actions to the action taken.
// bridge.mjs drives it live; eval-score.mjs drives the same code over labelled positions, so the
// offline score measures exactly the pipeline that plays.
import {ask} from './jev.mjs';
import {forcedAction,spendFirst,dhTempoActions,buffSetupActions,lowBoardDiscardActions,boardRecoveryActions} from './policy.mjs';
import {criteria,bodies} from './describe.mjs';
import {menu,actionFor} from './plan.mjs';
import {dhTacticalAction} from './dh-tactics.mjs';
import {boardEffectAssessments,EFFECT_VERSION} from './effect-state.mjs';
import {warlockInformationAction} from './warlock-information.mjs';
import {earlyCoinDevelopment} from './early-coin.mjs';
import {openingBurstAssessment,openingBurstAction,holdForOpeningBurst} from './opening-burst.mjs';
import {matchupObjective,resourceToolAssessments} from './matchup-objective.mjs';
import {temporaryOpeningAction} from './temporary-opening.mjs';

export const INSTRUCTIONS='Choose ONE turn intent or next action, including mulligan replacements when applicable. PLAN options describe simulated sequences and their known outcomes; choosing one executes exact steps in order, stopping at unknown effects to observe and replan. Effect assessments include current applicability, evidence confidence and estimated strength. Confidence is not a probability that a future trigger occurs and is not effect strength. With equal stats and removal cost, prefer removing a confidently active beneficial engine over a spent or wrong-zone effect. With different stats or costs, compare lost minions, mana, face damage, survival, opponent trigger opportunities and effect strength; a strong engine can justify spending several resources. Unknown effects require reading the complete text, not treating them as blank or automatically spending extra resources. Lethal and survival take priority over engine removal. First decide WHETHER drawing belongs in this turn, not merely whether a draw is legal. If drawing is chosen and its costs preserve the intended follow-up and survival, draw before committing buffs and attacks. Apply the intended buff before attacks that benefit from it. Respect visible card text, mana, lethal and survival. Every action is followed by a new observation.';

// Everything decided without asking Jev: a forced action, a searched lethal, or the menu to ask.
export function prepare(state,full,{planner=true}={}){
 // Kills are looked for on the full menu; only then are the attacks held back until the hand
 // is spent (policy.mjs spendFirst). A planned lethal keeps the full menu to the end.
 let acts=spendFirst(state,full);
 const forced=forcedAction(state,full);
 if(forced)return {forced};
 let crit=criteria(state,full),plans={},searchStats;
 if(planner&&!state.choice){
  const m=menu(state,full,crit);
  // A kill found by search is arithmetic over a visible board, like lethal.mjs: not put to a vote.
  if(m.lethal){
   const action=actionFor(full,m.lethal[0]);
   if(action)return {lethal:{action,source:'planned_lethal',plan:'lethal'},rest:m.lethal.slice(1)};
  }
  crit=m.criteria;plans=m.plans;searchStats=m.stats;
 }
 const expiringDevelopment=temporaryOpeningAction(state,full);
 if(expiringDevelopment)return {forced:expiringDevelopment};
 const openingBurst=openingBurstAssessment(state);
 const objective=matchupObjective(state);
 if(objective.mode!=='board_resource')acts=holdForOpeningBurst(state,acts,openingBurst);
 const earlyDevelopment=earlyCoinDevelopment(state,acts);
 if(earlyDevelopment)return {forced:earlyDevelopment};
 const tactical=dhTacticalAction(state,acts);
 if(tactical)return {forced:tactical};
 const information=warlockInformationAction(state,acts);
 if(information)return {forced:information};
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
 if(setup&&!freeInformation)return {forced:{action:setup,source:'buff_setup'}};
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
 return {acts,crit,plans,state,searchStats,openingBurst,objective,resourceTools:resourceToolAssessments(state)};
}

export const askJev=(state,p,strategy,opts)=>
 ask({board:state,strategy,matchupObjective:p.objective,resourceTools:p.resourceTools,openingBurst:p.openingBurst&&{...p.openingBurst,now:p.openingBurst.now.slice(0,3)},effectAssessments:{version:EFFECT_VERSION,cards:boardEffectAssessments(state)}},{move:{type:'choice',instructions:INSTRUCTIONS+' Opponent class prior probabilities and confidence are local frequency estimates, not known archetypes. For mulligan apply matchupObjective.mulligan.preferences: these already blend the aggression/pressure guess with confidence, so low support stays near neutral. Favor immediate cheap bodies and reliable trades as earlyBoard/efficientTrade rise; favor attacking pressure as immediatePressure rises; discount conditional slow setup by its multiplier. Aggression is a tempo proxy, not a known pure aggro deck. Control and combo share the pressure opening strategy. Public cards override the prior during play; never assume a fixed combo turn or waive early-curve/discard-material constraints.',criteria:p.crit}},opts);

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
 if(p.plans.p1)return 'p1';
 const ids=Object.keys(p.crit);
 const act=p.acts.find(a=>a.type!=='END_TURN'&&ids.includes(a.id));
 return act?.id??ids[0];
}
