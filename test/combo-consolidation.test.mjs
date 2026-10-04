import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combinationAdmission} from '../src/combo-admission.mjs';
import {weaponBuffAssessment} from '../src/weapon-buff.mjs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {prepare,resolve} from '../src/choose.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
import {position,claws} from '../eval/silverfish-cases.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game18-combo-input.json',import.meta.url)));
const fixture=()=>structuredClone(f);
const pipeline=c=>{
 const trace={},actions=constrainActions(c.state,c.actions,{trace});
 return {trace,actions,p:prepare(c.state,actions,{admission:trace.admission})};
};

test('the weapon ruling references the same surviving proof as candidate filtering and planning',()=>{
 const c=fixture(),{trace,p}=pipeline(c),w=p.weaponBuff;
 assert.equal(p.forced.source,'weapon_discard_buff');
 const line=trace.admission.lines.find(l=>l.weaponRouteKey===w.proofKey);
 assert.ok(line);assert.equal(line.firstActionId,p.forced.action.id);
 assert.equal(p.decisionPolicy.weaponProofKey,w.proofKey);
 assert.equal(w.evidenceVersion,trace.admission.version);
 const trimmed=c.actions.filter(a=>a.entityId!==59);
 assert.ok(!weaponBuffAssessment(c.state,trimmed,{admission:trace.admission}).preferred,
  'removing the first legal option cannot be bypassed by the weapon rule');
});

test('unknown summon engines cannot be forced by a second weapon simulator',()=>{
 const c=fixture();c.state.me.board.push({entityId:999,CARDTYPE:'MINION',ATK:1,HEALTH:2,
  text:'After you summon a minion, deal 1 damage to a random enemy.'});
 const {trace,p}=pipeline(c);
 assert.ok(!trace.admission.lines.some(l=>l.development.via==='discard'));
 assert.ok(!p.weaponBuff.preferred);assert.notEqual(p.forced?.source,'weapon_discard_buff');
 assert.ok(p.weaponBuff.paths.length,'uncertain alternatives may still be compared');
 assert.ok(p.weaponBuff.paths.every(r=>!r.knownDevelopment));
 for(const steps of Object.values(p.plans??{})){
  const unknown=steps.findIndex(m=>!m.exact);
  assert.ok(unknown<0||unknown===steps.length-1);
 }
});

test('proof budget exhaustion cannot be bypassed by the weapon rule',()=>{
 const c=fixture(),admission=combinationAdmission(c.state,c.actions,{maxNodes:1});
 assert.equal(admission.stats.nodeLimit,true);
 assert.ok(!weaponBuffAssessment(c.state,c.actions,{admission}).preferred);
 const out=constrainActions(c.state,c.actions,{admission}),p=prepare(c.state,out,{admission});
 assert.notEqual(p.forced?.source,'weapon_discard_buff');
});

test('the shared conservative survival check does not assume an unknown summon will save us',()=>{
 const c=fixture();c.state.me.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=16;
 const {trace,p}=pipeline(c);
 assert.equal(trace.admission.lines.length,0,'14 effective Health against 15 visible attack');
 assert.ok(!p.weaponBuff?.preferred);
});

test('a chosen free discovery precedes the weapon combo and requires a fresh decision',()=>{
 const c=fixture();Object.assign(c.state,{status:'RUNNING'});
 Object.assign(c.state.me,{current:true,heroClass:'WARLOCK',deckCount:20});
 c.state.me.hand.push({entityId:990,CARDTYPE:'SPELL',COST:0,name:'Information',
  text:'Discover another card from your deck. It is Temporary.'});
 c.actions.push({id:'info',type:'POWER',entityId:990});
 const {p}=pipeline(c);
 assert.equal(p.forced.source,'free_discover_first');assert.equal(p.forced.action.entityId,990);
 assert.ok(p.weaponBuff.preferred,'the weapon remains feasible, but information is acquired first');
 assert.ok(!p.rest,'no continuation through unknown discovery');
});

test('incomplete equipped-weapon alternatives survive only ordering, not legal candidate removal',()=>{
 const c=position({mana:1,weapon:claws,hand:[
  {name:'Payoff',CARDTYPE:'SPELL',COST:3,text:'When you play or discard this, summon two random 1-Cost minions.'},
  {name:'Buff',CARDTYPE:'SPELL',COST:2,text:'Give your minions +1/+1.'},
  {name:'Body',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:2,text:''}]});
 const {trace,actions,p}=pipeline(c);
 assert.equal(trace.admission.lines.length,0,'no buff reserve after the attack');
 assert.ok(spendFirst(c.state,actions,{admission:trace.admission}).some(a=>a.entityId===1));
 const id=Object.keys(p.plans).find(k=>p.plans[k][0].id===1);
 assert.ok(id);assert.equal(resolve(p,id).action.entityId,1);
 const trimmed=actions.filter(a=>a.entityId!==1);
 assert.ok(!spendFirst(c.state,trimmed,{admission:trace.admission}).some(a=>a.entityId===1));
});

test('a complete combo is not duplicated as a separate weapon prefix',()=>{
 const c=position({mana:5,mine:[{ATK:1,HEALTH:2}],hand:[claws,
  {name:'Payoff',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon three random 1-Cost minions.'},
  {name:'Buff',CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'}]});
 const {p}=pipeline(c);
 const comboPlans=Object.entries(p.plans).filter(([id])=>id.startsWith('combo')).map(([,steps])=>steps);
 assert.ok(comboPlans.length);
 for(const [id,steps] of Object.entries(p.plans).filter(([id])=>id.startsWith('p')))
  assert.ok(!comboPlans.some(full=>steps.length===full.length&&steps.every((m,i)=>m.kind===full[i].kind
   &&m.id===full[i].id&&m.targetId===full[i].targetId)),id);
 for(const [id,steps] of Object.entries(p.plans).filter(([id])=>id.startsWith('development')))
  assert.ok(!comboPlans.some(full=>steps.length<=full.length&&steps.every((m,i)=>m.kind===full[i].kind
   &&m.id===full[i].id&&m.targetId===full[i].targetId)),id);
 assert.ok(!Object.keys(p.plans).some(id=>id.startsWith('wb')));
});

test('a secret-dependent prefix observes immediately instead of queuing a speculative hero attack',()=>{
 const c=fixture();c.state.opponent.secretCount=1;
 const {p}=pipeline(c);
 assert.ok(!p.weaponBuff.preferred);
 const prefixes=Object.entries(p.plans??{}).filter(([id])=>id.startsWith('development'));
 assert.ok(prefixes.length);
 for(const [,steps] of prefixes){assert.equal(steps.length,1);assert.equal(steps[0].exact,false);}
});

test('an unmodelled chosen-discard alternative is compared before assuming the turn must buff',()=>{
 const original=JSON.parse(readFileSync(new URL('../eval/positions.json',import.meta.url))).find(c=>c.id==='g4t7r616');
 const c={state:original.state,actions:original.options.map(({label,description,...a})=>a)};
 const {p}=pipeline(c);
 assert.ok(!p.forced,'Party plus buff must not suppress the user-labelled Occultist removal line');
 assert.ok(Object.keys(p.crit).some(id=>{
  const a=resolve(p,id).action;return a.entityId===57&&a.targetId===40;
 }),'Occultist discarding Soul Barrage reaches the actual decision menu');
 assert.ok(p.plans.combo1,'development plus buff remains a competing whole intent');
});

test('the previous combo engine remains frozen after consolidation',async()=>{
 const old=await loadDecisionEngine('silverfish-v1-combo-admission-v1'),now=await loadDecisionEngine();
 assert.notEqual(old.prepare,now.prepare);assert.notEqual(old.constrainActions,now.constrainActions);
 assert.equal(now.version,'silverfish-v1-weapon-replacement-v1');
 const c=fixture();c.state.me.board.push({entityId:999,CARDTYPE:'MINION',ATK:1,HEALTH:2,
  text:'After you summon a minion, deal 1 damage to a random enemy.'});
 const trace={},actions=old.constrainActions(c.state,c.actions,{trace});
 assert.equal(old.prepare(c.state,actions,{admission:trace.admission}).forced.source,'weapon_discard_buff',
  'regression counterexample reproduces the contradictory old branch');
 assert.notEqual(pipeline(c).p.forced?.source,'weapon_discard_buff');
});
