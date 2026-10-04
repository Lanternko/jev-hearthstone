import {readFile} from 'node:fs/promises';
import {snapshot} from './power.mjs';
try{
 const d=JSON.parse(await readFile(new URL('../runtime/decision.json',import.meta.url),'utf8'));
 const list=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
 const s=await snapshot(undefined,Object.fromEntries(list.map(c=>[c.id,c])));
 if(Date.now()-Date.parse(d.createdAt)>60000)throw Error('Decision older than 60 seconds; obtain a new decision.');
 if(s.state.decisionFingerprint!==d.stateFingerprint)throw Error('State has changed; obtain a new decision.');
 if(!s.actions.some(a=>a.id===d.action.id))throw Error('Action no longer available.');
 console.log(JSON.stringify({verified:true,action:d.action,require:'Fresh screenshot and entity/coordinate match before input.'}));
}catch(e){console.error(e.message);process.exitCode=1}
