// One fresh decision, from a parsed state and its legal (constrained) actions to the action taken.
// bridge.mjs drives it live; eval-score.mjs drives the same code over labelled positions, so the
// offline score measures exactly the pipeline that plays.
import {ask} from './jev.mjs';
import {forcedAction,spendFirst,dhTempoActions} from './policy.mjs';
import {criteria} from './describe.mjs';
import {menu,actionFor} from './plan.mjs';
import {dhTacticalAction} from './dh-tactics.mjs';

export const INSTRUCTIONS='Choose ONE next action, including mulligan replacements when applicable. Options of type PLAN are complete attack sequences with their outcome worked out; picking one carries out every step in order. Respect the strategy, visible card text, and mana. Every action is followed by a new observation.';

// Everything decided without asking Jev: a forced action, a searched lethal, or the menu to ask.
export function prepare(state,full,{planner=true}={}){
 // Kills are looked for on the full menu; only then are the attacks held back until the hand
 // is spent (policy.mjs spendFirst). A planned lethal keeps the full menu to the end.
 const acts=spendFirst(state,full);
 const forced=forcedAction(state,full);
 if(forced)return {forced};
 let crit=criteria(state,full),plans={};
 if(planner&&!state.choice){
  const m=menu(state,full,crit);
  // A kill found by search is arithmetic over a visible board, like lethal.mjs: not put to a vote.
  if(m.lethal){
   const action=actionFor(full,m.lethal[0]);
   if(action)return {lethal:{action,source:'planned_lethal',plan:'lethal'},rest:m.lethal.slice(1)};
  }
  crit=m.criteria;plans=m.plans;
 }
 const tactical=dhTacticalAction(state,acts);
 if(tactical)return {forced:tactical};
 if(acts.length===1)return {forced:{action:acts[0],source:'forced_spend'}};
 if(acts.length<full.length){
  // Cards first: no attack plans and no END_TURN while something must still be spent.
  crit=criteria(state,acts);plans={};
 }
 return {acts,crit,plans,state};
}

export const askJev=(state,p,strategy)=>
 ask({board:state,strategy},{move:{type:'choice',instructions:INSTRUCTIONS,criteria:p.crit}});

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
