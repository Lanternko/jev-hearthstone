import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {ruleRelease,HOLD_RULES} from '../src/rule-release.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
// Step 3 of the rule-tier plan (2026-10-04): vetoes are final, preferences never empty a menu,
// and hold rules are not handed to the one-turn simulator.
const load=(dir,n)=>JSON.parse(readFileSync(new URL(`./fixtures/${dir}/${n}.json`,import.meta.url),'utf8'));
const dormant=()=>load('user-rulings','dormant-buff-tap');
const game9=()=>load('user-rulings','new50-game9-single-buff');
const game46=()=>{const c=load('user-rulings','game46-opening')[1];return {state:c.state,options:c.recordedOptions,held:c.recordedAction.entityId};};
const run=(P,state,options)=>{const trace={};const a=P.constrainActions(state,options,{trace});
 const b=a.length?P.spendFirst(state,a,{admission:trace.admission,trace}):a;return {ids:b.map(x=>x.id),trace};};

test('a veto is final: a menu holding only the vetoed action comes back empty, with the reason',()=>{
 const {state}=dormant(),buff=state.me.hand.find(c=>c.name==='Entropic Continuity').entityId;
 const trace={};
 assert.deepEqual(constrainActions(state,[{id:'b',type:'POWER',entityId:buff}],{trace}),[]);
 assert.deepEqual(trace.vetoes,[{rule:'buffNobody',actionId:'b'}]);
});

test('hold rules keep the card: the one-turn search alone would release game 46 and New50 game9',()=>{
 for(const [rule,{state,options},held] of [['passiveEggCoin',game46(),game46().held],['newBodyBuffWaits',game9(),48]]){
  assert.ok(HOLD_RULES.has(rule));
  const kept=options.filter(a=>a.entityId!==held);
  assert.ok(ruleRelease(state,options,kept,'anyOrderingRule'),`${rule}: the search prefers playing now`);
  assert.equal(ruleRelease(state,options,kept,rule),null);
  assert.ok(!run({constrainActions,spendFirst},state,options).ids.some(id=>options.find(a=>a.id===id).entityId===held));
 }
});

test('rule-release-v1 is frozen; the audit keeps the user rulings it kept',async()=>{
 const previous=await loadDecisionEngine('silverfish-v1-rule-release-v1'),current=await loadDecisionEngine();
 assert.equal(current.version,'silverfish-v1-veto-audit-v1');assert.notEqual(previous.constrainActions,current.constrainActions);
 for(const {state,options} of [game9(),game46(),dormant()])
  assert.deepEqual(run(current,state,options).ids,run(previous,state,options).ids);
});
