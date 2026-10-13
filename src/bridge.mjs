import {readFile,appendFile,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshot} from './power.mjs';
import {actionFor} from './plan.mjs';
import {loadDecisionEngine} from './planner-version.mjs';
import {fromState,followed} from './sim.mjs';
import {deckFor} from './deck.mjs';
import {createJevRecovery} from './jev-recovery.mjs';
import {respectsDHTactics} from './dh-tactics.mjs';
import {boardEffectAssessments,EFFECT_VERSION} from './effect-state.mjs';
import {matchupObjective} from './matchup-objective.mjs';
import {recordShadowDecision,netPick} from './selfplay-shadow.mjs';
import {criteria} from './describe.mjs';
import {ask} from './jev.mjs';
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
// JEV_FOLLOW_NET=1: the self-play network plays instead of only listening. Mulligan and proved lethal stay as they are;
// when the network has no answer the usual path (rules, then Jev) decides.
const FOLLOW_NET=process.env.JEV_FOLLOW_NET==='1';
// JEV_NET_ADVICE=1 (user, 2026-10-14): the network's choice is the default and Jev is shown it. Jev may overrule it
// when the network could not have weighed an opposing effect or a card it does not know; otherwise the network is followed.
// The alternatives Jev may overrule with are the ones the rules would have offered.
const NET_ADVICE=process.env.JEV_NET_ADVICE==='1';
const ADVICE_INSTRUCTIONS='Choose ONE next action. networkAdvice.choice is the default: a self-play network trained only on this deck against itself chose it. Choose it unless it is wrong for a reason the network cannot see. The network knows the text of the cards in networkAdvice.knownCards only; every other card, including each one in networkAdvice.unknownCards and all opponent cards, it sees as cost, attack and health with no text. It does not know opponent hero powers, secrets, armor gain, board clears, deathrattles, taunt-granting, lifesteal or any other opposing effect. Overrule it only when a visible card text, a known opponent effect or an unknown card makes another option clearly better, for example it attacks into a punishing effect, ignores an engine that must die, overextends into a board clear, or misuses a card it cannot read. When unsure, choose networkAdvice.choice. Respect lethal and survival.';
const KNOWN=['Chamber of Viscidus','Soulfire','The Soularium','Silverware Golem','Cursed Catacombs','Entropic Continuity','Party Fiend','Platysaur','Wicked Whispers','Boneweb Egg','Disposable Acolytes','Ocular Occultist','Walking Dead','Chronoclaws','Duke of Below','Soul Barrage',"Hand of Gul'dan",'The Coin','Boneweb Spider'];
const shadow=(s,actions,action,source)=>recordShadowDecision({parsed:s.parsed,state:s.state,actions,action,source});
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
 const acts=spendFirst(s.state,full,{admission:trace.admission,trace});
 if(queue.length&&!s.state.choice&&(!(FOLLOW_NET||NET_ADVICE)||queueLethal)){
  const step=queue[0];
  // A legal queued attack still has to obey the current buff/setup ordering.
  // Pure resource drawing remains optional; proved lethal retains priority.
  const live=full;
  // A skipped step is simply not in `live`: the plan is dropped and the turn asked afresh.
  // A body the game re-created under a new entity id acts and is targeted under that id.
  const ids=followed(step.before,fromState(s.state,full));
  const action=ids&&actionFor(live,{...step,id:ids.get(step.id)??step.id,targetId:ids.get(step.targetId)??step.targetId});
  const continuation=allowsPlanContinuation??allowsWeaponContinuation;
  if(action&&(queueLethal||(respectsDHTactics(s.state,acts,action)&&(!continuation||continuation(s.state,full,action,{admission:trace.admission}))))){queue.shift();const source=queueLethal?'planned_lethal':'plan';await shadow(s,full,action,source);return {ready:true,action,state:s.state,source,latencyMs:0,cost:'0'}}
 }
 queue=[];queueLethal=false;
 const p=prepare(s.state,full,{planner:PLANNER,admission:trace.admission});
 if(FOLLOW_NET&&!p.lethal){
  const n=await netPick({parsed:s.parsed,state:s.state,actions:full});
  if(n){
   await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options:full,rawOptions:rawActions,action:n.action,source:'selfplay_net',net:{value:n.value,top:n.top},latencyMs:0,cost:'0'});
   await shadow(s,full,n.action,'selfplay_net');
   return {ready:true,action:n.action,state:s.state,source:'selfplay_net',latencyMs:0,cost:'0'};
  }
 }
 if(NET_ADVICE&&!p.lethal&&full.length>1){
  const n=await netPick({parsed:s.parsed,state:s.state,actions:full});
  // The network may not end a turn the rules still have work in: it passed with two 14/14 Dukes
  // facing one taunt (2026-10-14). Such a turn goes to the ordinary pipeline below.
  const rulesActs=p.forced?[p.forced.action]:p.acts??full;
  if(n&&!(n.action.type==='END_TURN'&&!rulesActs.some(a=>a.type==='END_TURN'))){
   const options=[n.action,...(p.forced?[p.forced.action]:p.acts??[])].filter((a,i,all)=>a&&all.findIndex(b=>b.id===a.id)===i);
   const advice={choice:n.action.id,valueEstimate:n.value,top:n.top,knownCards:KNOWN,unknownCards:n.unknown};
   const rulesChoice=p.forced?{id:p.forced.action.id,source:p.forced.source}:null;
   let result={model:null,source:'net_unopposed',latencyMs:0,answers:{move:{choice:n.action.id}}};
   if(options.length>1){
    const request=opts=>ask({board:s.state,strategy:deckFor(s.state).strategy,networkAdvice:advice,rulesChoice,effectAssessments:{version:EFFECT_VERSION,cards:boardEffectAssessments(s.state)}},{move:{type:'choice',instructions:ADVICE_INSTRUCTIONS,criteria:criteria(s.state,options)}},opts);
    result=await recoverJev(()=>request(),
     async e=>{
      try{return {...await request({model:BACKUP,timeoutMs:12000}),source:'backup_model',error:e.message}}
      catch(e2){return {model:null,source:'net_fallback',latencyMs:0,answers:{move:{choice:n.action.id}},error:`${e.message} | ${BACKUP}: ${e2.message}`}}
     });
    const fresh=await inspect();if(fresh.state.decisionFingerprint!==s.state.decisionFingerprint)return {ready:false,reason:'state_changed'};
   }
   const action=options.find(a=>a.id===result.answers.move.choice)??n.action;
   const source=result.source??(action.id===n.action.id?'net_confirmed':'jev_override');
   await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options,rawOptions:rawActions,net:advice,rulesChoice,action,...result,source});
   await shadow(s,full,action,source);
   return {ready:true,action,state:s.state,source,latencyMs:result.latencyMs,cost:result.metadata?.gateway?.cost};
  }
 }
 if(p.forced){
  if(s.state.choice?.type==='MULLIGAN'||p.weaponBuff||p.weaponPreservation?.length||p.weaponReplacement||p.turnOrder?.heldAttackIds.length||p.handRetention?.risks.length||p.turnAlternatives?.length||p.temporaryDiscard?.length||p.divineShield?.length||p.chamberIntents?.length||p.combinationEvidence?.lines.length)await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options:full,matchupObjective:matchupObjective(s.state),weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,weaponReplacement:p.weaponReplacement,turnOrder:p.turnOrder,turnAlternatives:p.turnAlternatives,handRetention:p.handRetention,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,rawOptions:rawActions,combinationEvidence:p.combinationEvidence,decisionPolicy:p.decisionPolicy,candidateTrace:trace.evidence,...p.forced,latencyMs:0,cost:'0'});
  await shadow(s,full,p.forced.action,p.forced.source??'forced');
  return {ready:true,...p.forced,state:s.state,latencyMs:0,cost:'0'};
 }
 if(Date.now()-s.mtime>600000)return {ready:false,reason:'stale_log',state:s.state};
 if(p.lethal){queue=p.rest;queueLethal=true;await shadow(s,full,p.lethal.action,p.lethal.source??'lethal');return {ready:true,...p.lethal,state:s.state,latencyMs:0,cost:'0'}}
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
 const row=await record({createdAt:new Date().toISOString(),plannerVersion,state:s.state,options:s.actions,rawOptions:rawActions,combinationEvidence:p.combinationEvidence,decisionPolicy:p.decisionPolicy,candidateTrace:trace.evidence,fodderRelease:trace.fodderRelease,ruleReleases:trace.ruleReleases,matchupObjective:p.objective,weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,weaponReplacement:p.weaponReplacement,turnOrder:p.turnOrder,turnAlternatives:p.turnAlternatives,handRetention:p.handRetention,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,resourceTools:p.resourceTools,searchStats:p.searchStats,...(plan?{plan:{id:pick,steps:plan,text:p.crit[pick].description,developmentEvidence:p.crit[pick].developmentEvidence,combination:p.crit[pick].combination}}:{}),action,...result});
 if(shotTaken)await rename(PENDING,`${SHOTS}g${s.state.gameNumber}t${s.state.turn}r${row}.jpg`).catch(()=>{});
 await shadow(s,full,action,result.source??'jev');
 return {ready:true,action,state:s.state,plan:plan&&pick,source:result.source,latencyMs:result.latencyMs,cost:result.metadata?.gateway?.cost};
}
