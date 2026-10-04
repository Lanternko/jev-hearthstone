import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMulliganRetry} from '../src/mulligan-retry.mjs';
import {plan,run} from '../src/execute.mjs';
import {contentBox} from '../src/layout.mjs';
import {createParser,publicState} from '../src/power.mjs';
import {verdict} from '../src/verify.mjs';

const [opening]=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game46-opening.json',import.meta.url)));
const decision={ready:true,state:opening.state,action:opening.recordedAction};
const box=contentBox(2560,1440);

test('a failed confirm retries confirmation only, without unselecting any card',async()=>{
 const retry=createMulliganRetry(),selected=new Set(),clicks=[];
 const steps=plan(box,decision.state,decision.action);
 const win={click:async(x,y)=>{
   const s=steps.find(s=>s.x===x&&s.y===y);clicks.push(s.what);
   if(s.what.startsWith('toss '))selected.has(s.what)?selected.delete(s.what):selected.add(s.what);
   return {trace:{}};
 }};
 retry.retain(decision);
 await run(retry.steps(steps),win,{gap:0});
 const chosen=[...selected];
 await run(retry.steps(steps),win,{gap:0});
 await run(retry.steps(steps),win,{gap:0});
 assert.deepEqual([...selected],chosen);
 assert.equal(selected.size,3);
 assert.deepEqual(clicks.slice(4),['confirm mulligan','confirm mulligan']);
 assert.equal(retry.retain({...decision,action:{...decision.action,replace:[]}}),decision,'lock the original decision');
});

test('an interrupted selection must not repeat its toggles; clearing permits the next game',()=>{
 const retry=createMulliganRetry(),steps=plan(box,decision.state,decision.action);
 retry.retain(decision);retry.steps(steps); // Worker could throw after the first card click.
 assert.deepEqual(retry.steps(steps).map(s=>s.what),['confirm mulligan']);
 retry.clear();assert.equal(retry.pending,null);assert.equal(retry.attempts,0);
 assert.equal(retry.steps(steps).length,4);
});

const result=(kept,complete=true)=>({...decision.state,choice:undefined,mulliganResult:{choiceId:2,kept,complete}});
test('game 46 actual kept list detects the old misfire, not merely a closed dialog',()=>{
 assert.equal(verdict(decision.state,decision.action,result([62,72,64])),'misfire');
 assert.equal(verdict(decision.state,decision.action,result([72])),'ok');
 assert.equal(verdict(decision.state,decision.action,{...decision.state,choice:undefined}),'pending');
 assert.equal(verdict(decision.state,decision.action,result([72],false)),'pending');
 assert.equal(verdict(decision.state,decision.action,{...result([72]),mulliganResult:{choiceId:1,kept:[72],complete:true}}),'pending');
});

test('keeping all or replacing all is checked by entity ID, excluding Coin',()=>{
 const original=[62,72,64,60];
 assert.equal(verdict(decision.state,{...decision.action,replace:[]},result(original)),'ok');
 assert.equal(verdict(decision.state,{...decision.action,replace:original},result([])),'ok');
 assert.equal(verdict(decision.state,{...decision.action,replace:original},result([72])),'misfire');
});

const power=s=>s.split('\n').map(x=>`GameState.DebugPrintPower() - ${x}`).join('\n');
const offer=(id,player)=>`GameState.DebugPrintEntityChoices() - id=${id} Player=${player} TaskList= ChoiceType=MULLIGAN CountMin=0 CountMax=4`;
const sent=id=>`GameState.SendChoices() - id=${id} ChoiceType=MULLIGAN`;
const chosen=(id,n)=>`GameState.DebugPrintEntitiesChosen() - id=${id} Player=Local EntitiesCount=${n}`;
const entry=id=>`GameState.DebugPrintEntitiesChosen() - Entities[0]=[entityName=card id=${id} zone=HAND cardId=TEST player=1]`;
test('real game 46 acknowledgement is parsed and classified as a mulligan misfire',()=>{
 const raw=readFileSync(new URL('./fixtures/user-rulings/game46-mulligan-receipt.log',import.meta.url),'utf8');
 const p=createParser().feed(power('CREATE_GAME\nGameEntity EntityID=1\nPlayer EntityID=3 PlayerID=2\ntag=CONTROLLER value=2')
  +'\nGameState.DebugPrintGame() - PlayerID=2, PlayerName=Local\n'+offer(2,'Local')+'\n'+sent(2)+'\n'+raw);
 const after=publicState(p.result(),2);
 assert.deepEqual(after.mulliganResult,{choiceId:2,kept:[62,72,64],complete:true});
 assert.equal(verdict(decision.state,decision.action,after),'misfire');
});
test('parser waits for complete acknowledgement, preserves our receipt across opponent packets, resets per game',()=>{
 const p=createParser().feed(power('CREATE_GAME\nGameEntity EntityID=1\ntag=STATE value=RUNNING\nPlayer EntityID=2 PlayerID=1\ntag=CONTROLLER value=1\nPlayer EntityID=3 PlayerID=2\ntag=CONTROLLER value=2')
  +'\nGameState.DebugPrintGame() - PlayerID=1, PlayerName=Local\nGameState.DebugPrintGame() - PlayerID=2, PlayerName=Other\n'+offer(2,'Local')+'\n'+sent(2)+'\n'+chosen(2,2));
 assert.deepEqual(publicState(p.result(),1).mulliganResult,{choiceId:2,kept:[],complete:false});
 p.feed(entry(62));assert.equal(publicState(p.result(),1).mulliganResult.complete,false);
 p.feed(entry(72));assert.deepEqual(publicState(p.result(),1).mulliganResult,{choiceId:2,kept:[62,72],complete:true});
 p.feed(offer(3,'Other')+'\n'+sent(3)+'\n'+chosen(3,0));
 assert.deepEqual(publicState(p.result(),1).mulliganResult.kept,[62,72]);
 p.feed(power('CREATE_GAME'));assert.equal(publicState(p.result(),1).mulliganResult,undefined);
});
