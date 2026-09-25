import {readFile,appendFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshot} from './power.mjs';
import {constrainActions,spendFirst} from './policy.mjs';
import {actionFor} from './plan.mjs';
import {prepare,askJev,resolve} from './choose.mjs';
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
 const full=s.actions;
 const acts=spendFirst(s.state,full);
 if(queue.length&&!s.state.choice){
  const step=queue[0];
  const live=queueLethal?full:acts;
  const action=signature(fromState(s.state,full))===step.before&&actionFor(live,step);
  if(action){queue.shift();return {ready:true,action,state:s.state,source:queueLethal?'planned_lethal':'plan',latencyMs:0,cost:'0'}}
 }
 queue=[];queueLethal=false;
 const p=prepare(s.state,full,{planner:PLANNER});
 if(p.forced)return {ready:true,...p.forced,state:s.state,latencyMs:0,cost:'0'};
 if(Date.now()-s.mtime>600000)return {ready:false,reason:'stale_log',state:s.state};
 if(p.lethal){queue=p.rest;queueLethal=true;return {ready:true,...p.lethal,state:s.state,latencyMs:0,cost:'0'}}
 s.actions=p.acts;
 const result=await askJev(s.state,p,strategy);
 const fresh=await inspect();if(fresh.state.decisionFingerprint!==s.state.decisionFingerprint)return {ready:false,reason:'state_changed'};
 const pick=result.answers.move.choice,{action,plan}=resolve(p,pick);
 if(plan)queue=plan.slice(1);
 await record({createdAt:new Date().toISOString(),state:s.state,options:s.actions,...(plan?{plan:{id:pick,steps:plan,text:p.crit[pick].description}}:{}),action,...result});
 return {ready:true,action,state:s.state,plan:plan&&pick,latencyMs:result.latencyMs,cost:result.metadata?.gateway?.cost};
}
