import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare,resolve,allowsPlanContinuation} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {fromState,apply,signature} from '../src/sim.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game3-two-buffs-before-queued-attacks.json',import.meta.url)));
function pipeline(c){const trace={},full=constrainActions(c.state,c.options,{trace});return {full,trace,p:prepare(c.state,full,{admission:trace.admission})};}

test('Eswin T2: the first buff does not authorize attacks ahead of the second buff',()=>{
 const c=structuredClone(fixture),{p}=pipeline(c);
 assert.ok(!p.forced);
 assert.ok(Object.keys(p.crit).some(id=>resolve(p,id).action.entityId===23),'first buff remains available');
 assert.ok(!Object.values(p.plans??{}).some(s=>s[0].kind==='attack'));
 const stage=c.derivedStages[0],{full,trace,p:next}=pipeline(stage);
 const step=c.recordedPlan.steps[1],attack=full.find(a=>a.entityId===step.id&&a.targetId===step.targetId);
 assert.ok(attack,'original next attack is still legal');
 assert.equal(signature(fromState(stage.state,full)),step.before,'legality and exact signature would have accepted the old queue');
 assert.equal(allowsPlanContinuation(stage.state,full,attack,{admission:trace.admission}),false);
 assert.equal(next.forced.action.entityId,5,'fresh decision plays the second buff');
});

test('all recorded intermediate attack prefixes, including the screenshot, still require the remaining buff',()=>{
 for(const c of fixture.derivedStages.slice(0,-1)){
  const {full,trace,p}=pipeline(c),step=fixture.recordedPlan.steps[c.prefixLength];
  const attack=full.find(a=>a.entityId===step.id&&a.targetId===step.targetId);
  assert.ok(attack);assert.equal(signature(fromState(c.state,full)),step.before);
  assert.equal(allowsPlanContinuation(c.state,full,attack,{admission:trace.admission}),false);
  assert.equal(p.forced.action.entityId,5);
  assert.ok(p.turnOrder.heldAttackIds.includes(attack.id));
 }
 const screenshot=fixture.derivedStages.find(c=>c.prefixLength===fixture.ruling.screenshotStage);
 const hero=screenshot.state.opponent.board.find(c=>c.CARDTYPE==='HERO');
 assert.equal(hero.HEALTH-hero.DAMAGE,33);
 assert.equal(screenshot.state.me.mana,1);
 assert.deepEqual(screenshot.state.me.hand.map(c=>c.entityId),[5,24]);
});

test('second buff discards the random payoff and stops before any invented summons or queued attacks',()=>{
 const c=fixture.derivedStages[0],{full,p}=pipeline(c);
 const start=fromState(c.state,full),r=apply(start,{kind:'play',id:p.forced.action.entityId});
 assert.equal(r.exact,false);assert.match(r.note,/observe and replan/i);
 assert.equal(r.s.mana,0);assert.deepEqual(r.s.discarded.map(c=>c.id),[24]);
 assert.equal(r.s.me.filter(b=>b.type==='MINION').length,4,'random bodies are not fabricated');
 for(const b of start.me.filter(b=>b.type==='MINION')){
  const after=r.s.me.find(x=>x.id===b.id);
  assert.equal(after.atk,b.atk+1);assert.equal(after.hp,b.hp+1);
  assert.equal(after.attacks,0);
 }
 assert.equal(p.rest,undefined,'forced single action has no queued random continuation');
});

test('missing or unaffordable second buff does not block attacks solely because its card is visible',()=>{
 for(const mode of ['missing','unaffordable']){
  const c=structuredClone(fixture.derivedStages[0]);
  c.options=c.options.filter(a=>a.entityId!==5);
  if(mode==='unaffordable')c.state.me.hand.find(c=>c.entityId===5).COST=2;
  const {full,trace,p}=pipeline(c),attack=full.find(a=>a.entityId===102);
  assert.ok(attack);assert.equal(p.turnOrder.heldAttackIds.length,0);
  assert.equal(allowsPlanContinuation(c.state,full,attack,{admission:trace.admission}),true);
 }
});

test('second-buff order and random boundary use card text rather than names or entity ids',()=>{
 const c=structuredClone(fixture.derivedStages[0]);
 for(const card of c.state.me.hand){card.entityId+=900;card.name='Alternate card';}
 for(const a of c.options)if([5,24].includes(a.entityId))a.entityId+=900;
 const {full,trace,p}=pipeline(c);
 assert.equal(p.forced.action.entityId,905);
 assert.equal(allowsPlanContinuation(c.state,full,full.find(a=>a.entityId===102),{admission:trace.admission}),false);
 const r=apply(fromState(c.state,full),{kind:'play',id:905});
 assert.equal(r.exact,false);assert.deepEqual(r.s.discarded.map(c=>c.id),[924]);
});

test('this replay was played by the old engine; current queued ordering rejects its first attack',async()=>{
 const old=await loadDecisionEngine(fixture.plannerVersion),now=await loadDecisionEngine();
 assert.equal(old.version,'silverfish-v1-combo-admission-v2');
 assert.equal(old.allowsPlanContinuation,undefined);
 const c=fixture.derivedStages[0],{full,trace}=pipeline(c);
 assert.equal(now.allowsPlanContinuation(c.state,full,full.find(a=>a.entityId===102),{admission:trace.admission}),false);
});
