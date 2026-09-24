import {readFile,appendFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ask} from './jev.mjs';
import {snapshot} from './power.mjs';
import {constrainActions,forcedAction,spendFirst} from './policy.mjs';
import {criteria} from './describe.mjs';
import {menu,actionFor} from './plan.mjs';
import {fromState,signature} from './sim.mjs';
process.loadEnvFile(fileURLToPath(new URL('../.env.local',import.meta.url)));
const definitions=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
const cards=Object.fromEntries(definitions.map(c=>[c.id,c]));
const strategy=await readFile(new URL('../strategy.md',import.meta.url),'utf8');
export async function inspect(){return snapshot(undefined,cards)}
// Whole-turn plans (plan.mjs) replace the raw attack options; JEV_PLANNER=0 restores the
// one-option-at-a-time menu. A chosen plan's remaining steps run without asking again, but only
// while the real board is exactly the one the plan predicted -- any surprise (a misfire, a
// Secret, a late log line) drops the rest of the plan and the turn is asked afresh.
const PLANNER=process.env.JEV_PLANNER!=='0';
let queue=[],queueLethal=false;
const record=async decision=>{
 await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
 await appendFile(new URL('../runtime/decisions.jsonl',import.meta.url),JSON.stringify(decision)+'\n');
 await writeFile(new URL('../runtime/bridge-decision.json',import.meta.url),JSON.stringify(decision,null,2));
};
export async function next(){
 const s=await inspect();
 s.actions=constrainActions(s.state,s.actions);
 if(!s.actions.length){queue=[];return {ready:false,state:s.state}}
 // Kills are looked for on the full menu; only then are the attacks held back until the hand
 // is spent (policy.mjs spendFirst). A planned lethal keeps the full menu to the end.
 const full=s.actions;
 const acts=spendFirst(s.state,full);
 if(queue.length&&!s.state.choice){
  const step=queue[0];
  const live=queueLethal?full:acts;
  const action=signature(fromState(s.state,full))===step.before&&actionFor(live,step);
  if(action){queue.shift();return {ready:true,action,state:s.state,source:queueLethal?'planned_lethal':'plan',latencyMs:0,cost:'0'}}
 }
 queue=[];queueLethal=false;
 const forced=forcedAction(s.state,full)??(acts.length===1?{action:acts[0],source:'forced_spend'}:null);
 if(forced)return {ready:true,...forced,state:s.state,latencyMs:0,cost:'0'};
 if(Date.now()-s.mtime>600000)return {ready:false,reason:'stale_log',state:s.state};
 let crit=criteria(s.state,full),plans={};
 if(PLANNER&&!s.state.choice){
  const m=menu(s.state,full,crit);
  // A kill found by search is arithmetic over a visible board, like lethal.mjs: not put to a vote.
  if(m.lethal){
   const action=actionFor(full,m.lethal[0]);
   if(action){queue=m.lethal.slice(1);queueLethal=true;return {ready:true,action,state:s.state,source:'planned_lethal',plan:'lethal',latencyMs:0,cost:'0'}}
  }
  crit=m.criteria;plans=m.plans;
 }
 if(acts.length<full.length){
  // Cards first: no attack plans and no END_TURN while something must still be spent.
  crit=criteria(s.state,acts);plans={};
 }
 s.actions=acts;
 const result=await ask({board:s.state,strategy},{move:{type:'choice',instructions:'Choose ONE next action, including mulligan replacements when applicable. Options of type PLAN are complete attack sequences with their outcome worked out; picking one carries out every step in order. Respect the strategy, visible card text, and mana. Every action is followed by a new observation.',criteria:crit}});
 const fresh=await inspect();if(fresh.state.decisionFingerprint!==s.state.decisionFingerprint)return {ready:false,reason:'state_changed'};
 const pick=result.answers.move.choice,plan=plans[pick];
 const action=plan?actionFor(s.actions,plan[0]):s.actions.find(a=>a.id===pick);if(!action)throw Error('Invalid choice');
 if(plan)queue=plan.slice(1);
 await record({createdAt:new Date().toISOString(),state:s.state,options:s.actions,...(plan?{plan:{id:pick,steps:plan,text:crit[pick].description}}:{}),action,...result});
 return {ready:true,action,state:s.state,plan:plan&&pick,latencyMs:result.latencyMs,cost:result.metadata?.gateway?.cost};
}
