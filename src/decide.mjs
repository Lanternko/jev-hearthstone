import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {ask} from './jev.mjs';
import {snapshot} from './power.mjs';
import {constrainActions,forcedAction} from './policy.mjs';
import {criteria} from './describe.mjs';
const cardList=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
const cards=Object.fromEntries(cardList.map(c=>[c.id,c]));
const strategy=await readFile(new URL('../strategy.md',import.meta.url),'utf8');
try{
  const playerArg=process.argv.find(x=>x.startsWith('--player='));
  const s=await snapshot(playerArg?Number(playerArg.split('=')[1]):undefined,cards);
  s.actions=constrainActions(s.state,s.actions);
  if(process.argv.includes('--inspect')){console.log(JSON.stringify({state:s.state,actions:s.actions},null,2));}
  else {
    if(!s.actions.length)throw Error('No verified active-turn options; inspect game UI and state first.');
    // 30s discarded valid decisions: the game writes no Power.log lines while we deliberate in our own turn. 10min only catches an abandoned game.
    // Hearthstone buffers Power.log, so mtime can lag the real game by many minutes. Raise the
    // limit via JEV_LOG_MAX_AGE_MS only after confirming on screen that the parsed state is live.
    const maxAge=Number(process.env.JEV_LOG_MAX_AGE_MS||600000);
    if(Date.now()-s.mtime>maxAge)throw Error(`Game log is stale (${Math.round((Date.now()-s.mtime)/1000)}s); no decision requested.`);
    const forced=forcedAction(s.state,s.actions);
    const result=forced?{model:null,source:forced.source,latencyMs:0,answers:{move:{choice:forced.action.id}},metadata:{gateway:{cost:'0'}}}:await ask({board:s.state,strategy}, {move:{type:'choice',instructions:'Select the best ONE next legal action. Use entity IDs to identify cards and targets. Do not assume opponent hidden cards or deck order. Re-evaluation follows each action.',criteria:criteria(s.state,s.actions)}});
    const action=s.actions.find(a=>a.id===result.answers.move.choice);if(!action)throw Error('Unknown model action');
    const now=await snapshot(s.state.me.playerId,cards);if(now.state.decisionFingerprint!==s.state.decisionFingerprint)throw Error('State changed while Jev was thinking; discard this decision.');
    const decision={...result,action,stateFingerprint:s.state.decisionFingerprint,optionsId:s.state.optionsId,createdAt:new Date().toISOString(),execution:'pending_visual_verification'};
    await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
    await writeFile(new URL('../runtime/decision.json',import.meta.url),JSON.stringify(decision,null,2));
    // The option list is logged as sent, not just the chosen action. Without it a position
    // cannot be replayed: mapping an option id back to an attacker is guesswork, and only 2
    // of the first 70 decisions could be reconstructed when describe.mjs needed testing.
    await appendFile(new URL('../runtime/decisions.jsonl',import.meta.url),JSON.stringify({state:s.state,options:s.actions,...decision})+'\n');
    console.log(JSON.stringify({model:decision.model,latencyMs:decision.latencyMs,action:decision.action,cost:decision.metadata?.gateway?.cost,confidence:decision.metadata?.typesafe?.confidence},null,2));
  }
}catch(e){console.error(e.message);process.exitCode=1}
