import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {snapshot} from './power.mjs';
import {loadDecisionEngine} from './planner-version.mjs';
import {deckFor} from './deck.mjs';
const {version:plannerVersion,constrainActions,prepare,askJev,resolve}=await loadDecisionEngine();
const cardList=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
const cards=Object.fromEntries(cardList.map(c=>[c.id,c]));
try{
  const playerArg=process.argv.find(x=>x.startsWith('--player='));
  const s=await snapshot(playerArg?Number(playerArg.split('=')[1]):undefined,cards);
  const rawActions=s.actions,trace={};
  s.actions=constrainActions(s.state,rawActions,{trace});
  if(process.argv.includes('--inspect')){console.log(JSON.stringify({state:s.state,actions:s.actions},null,2));}
  else {
    if(!s.actions.length)throw Error('No verified active-turn options; inspect game UI and state first.');
    // 30s discarded valid decisions: the game writes no Power.log lines while we deliberate in our own turn. 10min only catches an abandoned game.
    // Hearthstone buffers Power.log, so mtime can lag the real game by many minutes. Raise the
    // limit via JEV_LOG_MAX_AGE_MS only after confirming on screen that the parsed state is live.
    const maxAge=Number(process.env.JEV_LOG_MAX_AGE_MS||600000);
    if(Date.now()-s.mtime>maxAge)throw Error(`Game log is stale (${Math.round((Date.now()-s.mtime)/1000)}s); no decision requested.`);
    const p=prepare(s.state,s.actions,{planner:process.env.JEV_PLANNER!=='0',admission:trace.admission});
    const forced=p.forced??p.lethal;
    const result=forced?{model:null,source:forced.source,latencyMs:0,answers:{move:{choice:forced.action.id}},metadata:{gateway:{cost:'0'}}}
      :await askJev(s.state,p,deckFor(s.state).strategy);
    const {action,plan}=forced?{action:forced.action}:resolve(p,result.answers.move.choice);
    const now=await snapshot(s.state.me.playerId,cards);if(now.state.decisionFingerprint!==s.state.decisionFingerprint)throw Error('State changed while Jev was thinking; discard this decision.');
    // This CLI stages ONE action. Whole intents are recorded for review, but
    // only bridge.mjs owns the observe/validate/queue execution loop.
    const decision={...result,action,plannerVersion,combinationEvidence:p.combinationEvidence,
      decisionPolicy:p.decisionPolicy,weaponBuff:p.weaponBuff,weaponPreservation:p.weaponPreservation,turnOrder:p.turnOrder,temporaryDiscard:p.temporaryDiscard,divineShield:p.divineShield,chamberIntents:p.chamberIntents,candidateTrace:trace.evidence,
      ...(plan?{plan:{id:result.answers.move.choice,steps:plan,text:p.crit[result.answers.move.choice].description}}:{}),
      stateFingerprint:s.state.decisionFingerprint,optionsId:s.state.optionsId,createdAt:new Date().toISOString(),execution:'pending_visual_verification'};
    await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
    await writeFile(new URL('../runtime/decision.json',import.meta.url),JSON.stringify(decision,null,2));
    // The option list is logged as sent, not just the chosen action. Without it a position
    // cannot be replayed: mapping an option id back to an attacker is guesswork, and only 2
    // of the first 70 decisions could be reconstructed when describe.mjs needed testing.
    await appendFile(new URL('../runtime/decisions.jsonl',import.meta.url),JSON.stringify({state:s.state,options:p.acts??s.actions,rawOptions:rawActions,...decision})+'\n');
    console.log(JSON.stringify({model:decision.model,latencyMs:decision.latencyMs,action:decision.action,cost:decision.metadata?.gateway?.cost,confidence:decision.metadata?.typesafe?.confidence},null,2));
  }
}catch(e){console.error(e.message);process.exitCode=1}
