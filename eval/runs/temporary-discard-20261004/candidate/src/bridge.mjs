import {readFile,appendFile,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshot} from './power.mjs';
import {actionFor} from './plan.mjs';
import {loadDecisionEngine} from './planner-version.mjs';
import {fromState,signature} from './sim.mjs';
import {deckFor} from './deck.mjs';
import {createJevRecovery} from './jev-recovery.mjs';
import {respectsDHTactics} from './dh-tactics.mjs';
import {boardEffectAssessments,EFFECT_VERSION} from './effect-state.mjs';
import {matchupObjective} from './matchup-objective.mjs';
process.loadEnvFile(fileURLToPath(new URL('../.env.local',import.meta.url)));
const {version:plannerVersion,prepare,askJev,resolve,rulePick,constrainActions,spendFirst,allowsWeaponContinuation,allowsPlanContinuation}=await loadDecisionEngine();
console.log(`Decision engine: ${plannerVersion}`);
const definitions=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
const cards=Object.fromEntries(definitions.map(c=>[c.id,c]));
export async function inspect(){return snapshot(undefined,cards)}
// Whole-turn plans (plan.mjs) replace the raw attack options; JEV_PLANNER=0 restores the
// one-option-at-a-time menu. A chosen plan's remaining steps run without asking again, but only
// while the real board is exactly the one the plan predicted -- any surprise (a misfire, a
// Secret, a late log line) drops the rest of the plan and the turn is asked afresh.
const PLANNER=process.env.JEV_PLANNER!=='0';
let queue=[],queueLethal=false;
// How long one decision may keep failing to reach Jev before a rule pick is taken instead.
// 2026-10-01: with liquid/d1 behind it, a throttled Jev is not worth 30s of backoff -- fall through
// after about the same short budget as any other error.
const recoverJev=createJevRecovery({budgetMs:Number(process.env.JEV_FALLBACK_MS??5000),rateBudgetMs:6000});
// The second opinion when Jev cannot answer (both its providers answered 429 at capacity on
// 2026-09-30). Offline it matched 27/34 of Jev's confident picks; the rule pick stays the last resort.
const BACKUP=process.env.JEV_BACKUP_MODEL??'liquid/d1';
// The row a decision lands on in decisions.jsonl: counted once, then kept, since this process is
// the file's only writer. It names the picture of the position (runtime/shots/g…t…r<row>.jpg).
let rows=null;
const DECISIONS=new URL('../runtime/decisions.jsonl',import.meta.url);
const record=async decision=>{
 await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
 rows??=await readFile(DECISIONS,'utf8').then(t=>t.split('\n').filter(Boolean).length).catch(()=>0);
 decision.effectAssessments={version:EFFECT_VERSION,confidenceMeaning:'uncalibrated classification evidence, not trigger probability',cards:boardEffectAssessments(decision.state)};
 await appendFile(DECISIONS,JSON.stringify(decision)+'\n');
 await writeFile(new URL('../runtime/bridge-decision.json',import.meta.url),JSON.stringify(decision,null,2));
 return rows++;
};
export const SHOTS=fileURLToPath(new URL('../runtime/shots/',import.meta.url));
const PENDING=SHOTS+'pending.jpg';
// shot(path), when given, saves a picture of the game window: taken before Jev is asked, so it
// shows the position Jev saw, and filed under the decision's row once the decision is recorded.
// skip(action), when given, takes actions off the menu (loop.mjs: ones the game kept swallowing).
export async function next({shot,skip}={}){
 const s=await inspect();
 const rawActions=s.actions,trace={};
 s.actions=constrainActions(s.state,rawActions,{trace});
 if(skip)s.actions=s.actions.filter(a=>!skip(a,s.state));
 if(!s.actions.length){queue=[];return {ready:false,state:s.state}}
 const full=s.actions;
 const acts=spendFirst(s.state,full,{admission:trace.admission});
 if(queue.length&&!s.state.choice){
  const step=queue[0];
  // A legal queued attack still has to obey the current buff/setup ordering.
  // Pure resource drawing remains optional; proved lethal retains priority.
  const live=full;
  // A skipped step is simply not in `live`: the plan is dropped and the turn asked afresh.
  const action=signature(fromState(s.state,full))===step.before&&actionFor(live,step);
  const continuation=allowsPlanContinuation??allowsWeaponContinuation;
  if(action&&(queueLethal||(respectsDHTactics(s.state,acts,action)&&(!continuation||continuation(s.state,full,action,{admission:trace.admission}))))){queue.shift();return {ready:true,action,state:s.state,source:queueLethal?'planned_lethal':'plan',latencyMs:0,cost:'0'}}
 }
 queue=[];queueLethal=false;
 const p=prepare(s.state,full,{planner:PLANNER,admission:trace.admission});
 if(p.forced){
  if(s.state.choice?.type==='MULLIGAN'||p.weaponBuff||p.weaponPreservation?.length||p.turnOrder?.heldAttackIds.length||p.temporaryDiscard?.length||p.divineShield?.length||p.chamberIntents?.length||p.combinationEvidence?.lines.length)await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options:full,matchupObjective:matchupObjective(s.state),weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,turnOrder:p.turnOrder,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,rawOptions:rawActions,combinationEvidence:p.combinationEvidence,decisionPolicy:p.decisionPolicy,candidateTrace:trace.evidence,...p.forced,latencyMs:0,cost:'0'});
  return {ready:true,...p.forced,state:s.state,latencyMs:0,cost:'0'};
 }
 if(Date.now()-s.mtime>600000)return {ready:false,reason:'stale_log',state:s.state};
 if(p.lethal){queue=p.rest;queueLethal=true;return {ready:true,...p.lethal,state:s.state,latencyMs:0,cost:'0'}}
 s.actions=p.acts;
 const shotTaken=shot&&await shot(PENDING).then(()=>true,()=>false);
 const result=await recoverJev(
  ()=>askJev(s.state,p,deckFor(s.state).strategy),
  async e=>{
   try{return {...await askJev(s.state,p,deckFor(s.state).strategy,{model:BACKUP,timeoutMs:12000}),source:'backup_model',error:e.message}}
   catch(e2){return {model:null,source:'rule_fallback',latencyMs:0,answers:{move:{choice:rulePick(p)}},error:`${e.message} | ${BACKUP}: ${e2.message}`}}
  });
 const fresh=await inspect();if(fresh.state.decisionFingerprint!==s.state.decisionFingerprint){
  if(shotTaken)await rm(PENDING,{force:true}).catch(()=>{});
  return {ready:false,reason:'state_changed'};
 }
 const pick=result.answers.move.choice,{action,plan}=resolve(p,pick);
 if(plan)queue=plan.slice(1);
 const row=await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options:s.actions,rawOptions:rawActions,combinationEvidence:p.combinationEvidence,decisionPolicy:p.decisionPolicy,candidateTrace:trace.evidence,matchupObjective:p.objective,weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,turnOrder:p.turnOrder,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,resourceTools:p.resourceTools,searchStats:p.searchStats,...(plan?{plan:{id:pick,steps:plan,text:p.crit[pick].description,developmentEvidence:p.crit[pick].developmentEvidence,combination:p.crit[pick].combination}}:{}),action,...result});
 if(shotTaken)await rename(PENDING,`${SHOTS}g${s.state.gameNumber}t${s.state.turn}r${row}.jpg`).catch(()=>{});
 return {ready:true,action,state:s.state,plan:plan&&pick,source:result.source,latencyMs:result.latencyMs,cost:result.metadata?.gateway?.cost};
}
