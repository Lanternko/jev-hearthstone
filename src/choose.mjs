// One fresh decision, from a parsed state and its legal (constrained) actions to the action taken.
// bridge.mjs drives it live; eval-score.mjs drives the same code over labelled positions, so the
// offline score measures exactly the pipeline that plays.
import {ask} from './jev.mjs';
import {forcedAction,spendFirst} from './policy.mjs';
import {criteria} from './describe.mjs';
import {menu,actionFor} from './plan.mjs';

export const INSTRUCTIONS='Choose ONE next action, including mulligan replacements when applicable. Options of type PLAN are complete attack sequences with their outcome worked out; picking one carries out every step in order. Respect the strategy, visible card text, and mana. Every action is followed by a new observation.';

// Everything decided without asking Jev: a forced action, a searched lethal, or the menu to ask.
export function prepare(state,full,{planner=true}={}){
 // Kills are looked for on the full menu; only then are the attacks held back until the hand
 // is spent (policy.mjs spendFirst). A planned lethal keeps the full menu to the end.
 const acts=spendFirst(state,full);
 const forced=forcedAction(state,full)??(acts.length===1?{action:acts[0],source:'forced_spend'}:null);
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
 if(acts.length<full.length){
  // Cards first: no attack plans and no END_TURN while something must still be spent.
  crit=criteria(state,acts);plans={};
 }
 return {acts,crit,plans};
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
