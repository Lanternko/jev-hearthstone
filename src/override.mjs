// Human override: stage a specific legal action as the decision to execute.
// Jev does not do combat arithmetic, so lethal lines and other counted sequences
// have to be entered by hand. Usage: npm run override -- <actionId>
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {snapshot} from './power.mjs';
import {constrainActions} from './policy.mjs';
import {criteria} from './describe.mjs';
try{
  const id=process.argv[2];
  const list=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
  const cards=Object.fromEntries(list.map(c=>[c.id,c]));
  const s=await snapshot(undefined,cards);
  const actions=constrainActions(s.state,s.actions);
  if(!id){
    const c=criteria(s.state,actions);
    console.log(Object.values(c).map(o=>`${o.id} :: ${o.description}`).join('\n'));
    process.exit(0);
  }
  const action=actions.find(a=>a.id===id);
  if(!action)throw Error(`No legal action "${id}". Run without an id to list them.`);
  await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
  await writeFile(new URL('../runtime/decision.json',import.meta.url),JSON.stringify({
    model:null,source:'human-override',latencyMs:0,
    answers:{move:{choice:action.id}},action,
    stateFingerprint:s.state.decisionFingerprint,optionsId:s.state.optionsId,
    createdAt:new Date().toISOString(),execution:'pending_visual_verification'},null,2));
  console.log(JSON.stringify({staged:action.id,description:criteria(s.state,[action])[action.id]?.description},null,2));
}catch(e){console.error(e.message);process.exitCode=1}
