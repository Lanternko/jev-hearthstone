import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {openingBurstAssessment,openingBurstAction,holdForOpeningBurst} from '../src/opening-burst.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
import {pairedCases,state,options,buff,coin,aco,dead,ocular,whispers,party} from './fixtures/opening-burst-cases.mjs';

for(const c of pairedCases())test(c.id,()=>{
 for(const planner of [true,false]){
  const p=prepare(c.state,constrainActions(c.state,c.options),{planner});
  if(c.expected.length)assert.ok(c.expected.includes(p.forced?.action.entityId),JSON.stringify(p.forced));
  else assert.ok(!c.forbid.includes(p.forced?.action.entityId));
  assert.equal(p.rest,undefined,'no execution queue across unknown effects');
 }
});

test('future line has no invented draw and reports existing-body survival sensitivity',()=>{
 const s=state(1,0,[buff,coin,aco,dead]),a=openingBurstAssessment(s);
 const t2=a.future.find(p=>p.turnsAhead===1);
 assert.equal(t2.recipients,3);assert.equal(t2.manaBudget,2);assert.equal(t2.usesCoin,true);
 assert.equal(t2.randomSummons,true);assert.equal(t2.conditional,true);
 assert.deepEqual(a.survivalSensitivity[0],{turnsAhead:1,recipientsIfLose0:3,recipientsIfLose1:2,recipientsIfLose2:2});
 s.me.hand=s.me.hand.filter(c=>c.entityId!==aco.entityId);
 assert.equal(openingBurstAssessment(s).future.length,0,'missing setup is not supplied by a forecast draw');
});

test('occupied slots, changed real board, missing Coin and harmful Whispers targets are re-evaluated',()=>{
 const full=state(2,2,[buff,coin,aco,dead],6);
 assert.ok(openingBurstAssessment(full).now.every(p=>!p.steps.some(x=>x.id===aco.entityId)));
 const cleared=state(2,0,[buff,coin,dead],0);
 assert.equal(openingBurstAction(cleared,options(cleared)),null);
 const noCoin=state(2,2,[buff,aco,dead]);
 assert.equal(openingBurstAssessment(noCoin).now.length,0);
 const costly=state(1,1,[whispers,party,aco]);
 assert.equal(openingBurstAssessment(costly).now.length,0,'do not promise Acolytes when Party is actually cheapest');
});

test('enemy pressure, secrets, low Health and other decks preserve the ordinary menu',()=>{
 for(const change of [
  s=>s.opponent.board.push({entityId:80,CARDTYPE:'MINION',ATK:1,HEALTH:1}),
  s=>s.opponent.secretCount=1,
  s=>s.me.board[0].HEALTH=3,
  s=>s.me.heroClass='DEMONHUNTER',
  s=>s.me.current=false,
  s=>s.choice={type:'GENERAL'},
 ]){
  const s=state(1,0,[buff,coin,aco,dead]);change(s);const acts=options(s);
  assert.equal(openingBurstAction(s,acts),null);
  assert.deepEqual(holdForOpeningBurst(s,acts),acts);
 }
});

test('direct lethal is resolved before preserving a buff/Coin for a future turn',()=>{
 const s=state(1,1,[buff,coin,aco,dead]);s.me.board[2].EXHAUSTED=0;s.opponent.board[0].HEALTH=2;
 const acts=[...options(s),{id:'face',type:'POWER',entityId:100,targetId:999}];
 const p=prepare(s,constrainActions(s,acts));
 assert.equal(p.lethal?.source,'planned_lethal');assert.equal(p.lethal.action.entityId,buff.entityId);
});

test('Occultist candidate keeps the buff and targets known summoning material',()=>{
 const s=state(3,3,[buff,coin,ocular,dead],2),p=prepare(s,constrainActions(s,options(s)),{planner:false});
 assert.equal(p.forced.action.targetId,dead.entityId);
 assert.equal(p.forced.openingBurst.recipients,4);
 const deferred=openingBurstAction(s,[{id:'unresolved-battlecry',type:'POWER',entityId:ocular.entityId}]);
 assert.equal(deferred.action.targetId,undefined,'observe a separately presented Battlecry choice');
 const choice={...s,choice:{type:'GENERAL',source:ocular,entities:[buff,coin,dead]}};
 assert.equal(openingBurstAssessment(choice),null,'engine choice is resolved by existing discard policy');
});

test('default strategy has a distinct version and old execution-v2 uses the frozen pre-change source',async()=>{
 const current=await loadDecisionEngine(),old=await loadDecisionEngine('silverfish-v1-execution-v2');
 assert.equal(current.version,'silverfish-v1-rule-release-v1');
 const c=pairedCases()[0],p=current.prepare(c.state,c.options,{planner:false});
 assert.equal(p.forced.action.id,'end');
 const before=old.prepare(c.state,c.options,{planner:false});
 assert.ok(before.acts.some(a=>a.entityId===coin.entityId));
});
