import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare,resolve,allowsPlanContinuation,turnOrderAssessment} from '../src/choose.mjs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {fromState,signature,apply} from '../src/sim.mjs';
import {combinationAdmission} from '../src/combo-admission.mjs';
import {discardModel} from '../src/discard-model.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game2-buff-before-queued-attacks.json',import.meta.url)));
const fixture=()=>structuredClone(original);
function pipeline(c){const trace={},actions=constrainActions(c.state,c.options,{trace});return {actions,trace,p:prepare(c.state,actions,{admission:trace.admission})};}
// This intermediate observation is derived from the recorded exact first play,
// not falsely labelled an independently captured Power.log snapshot.
function afterDevelopment(c=fixture()){
 const body=c.state.me.hand.find(x=>x.entityId===10);
 c.state.me.hand=c.state.me.hand.filter(x=>x.entityId!==10);c.state.me.mana=1;
 c.state.me.handCount=c.state.me.hand.length;c.state.me.board.push({...body,EXHAUSTED:1});
 c.options=c.options.filter(a=>a.type==='END_TURN'||[7,32,12,81,24].includes(a.entityId));
 return c;
}

test('real game2 T4: deferred Whispers is preserved as a complete development then buff intent',()=>{
 const c=fixture(),{actions,p,trace}=pipeline(c);
 assert.ok(!actions.some(a=>a.entityId===32),'buff remains deferred at current first step');
 const line=trace.admission.lines.find(l=>l.steps[0].id===10&&l.steps[1]?.id===32);
 assert.ok(line);assert.equal(line.followup.knownRecipients,5);assert.equal(line.followup.manaAfterBuff,0);
 assert.ok(line.steps.every(m=>m.exact));
 const combo=Object.entries(p.plans).find(([,steps])=>steps[0].id===10&&steps[1]?.id===32);
 assert.ok(combo);assert.equal(resolve(p,combo[0]).action.entityId,10);
 assert.match(p.crit[combo[0]].description,/discarding Soulfire/);
});

test('the exact recorded queued trade is rejected even when legal and board signature matches',()=>{
 const c=afterDevelopment(),{actions,trace,p}=pipeline(c),step=original.recordedPlan.steps[1];
 const action=actions.find(a=>a.entityId===step.id&&a.targetId===step.targetId);
 assert.ok(action,'the attack is legal, so legality alone misses this bug');
 assert.equal(signature(fromState(c.state,actions)),step.before,'old exact signature would have continued');
 assert.equal(allowsPlanContinuation(c.state,actions,action,{admission:trace.admission}),false);
 assert.ok(p.turnOrder.buffs.some(c=>c.entityId===32));assert.ok(p.turnOrder.heldAttackIds.includes(action.id));
 assert.ok(!Object.values(p.plans??{}).some(steps=>steps[0].kind==='attack'),'fresh nonlethal menu obeys same gate');
});

test('full replay: play body, observe, buff, observe, then attacks; original attackers gain stats and egg gains Attack',()=>{
 const c=fixture(),initial=pipeline(c),combo=Object.values(initial.p.plans).find(s=>s[0].id===10&&s[1]?.id===32);
 assert.ok(combo);
 const observed=afterDevelopment(),next=pipeline(observed);
 const buff=next.actions.find(a=>a.entityId===32&&a.targetId==null);
 assert.ok(buff);assert.equal(allowsPlanContinuation(observed.state,next.actions,buff,{admission:next.trace.admission}),true);
 let simulated=fromState(c.state,c.options);
 const development=apply(simulated,combo[0]);assert.equal(development.exact,true);
 assert.equal(signature(fromState(observed.state,next.actions)),combo[1].before);
 const result=apply(development.s,combo[1]);assert.equal(result.exact,true);
 assert.deepEqual(result.s.discarded.map(c=>c.id),[7]);assert.equal(result.s.mana,0);
 assert.equal(result.s.me.find(b=>b.id===80).atk,1);assert.equal(result.s.me.find(b=>b.id===24).hp,4);
 assert.equal(result.s.me.find(b=>b.id===10).atk,3);
 assert.equal(result.s.me.find(b=>b.id===10).canAttack,false,'new 325 remains sleeping');
 // A fresh observed post-buff state, with current game-style legal attacks.
 const post=afterDevelopment();post.state.me.hand=post.state.me.hand.filter(c=>![7,32].includes(c.entityId));post.state.me.mana=0;
 post.state.me.hand.find(c=>c.entityId===33).ATK=4;post.state.me.hand.find(c=>c.entityId===33).HEALTH=4;
 for(const b of post.state.me.board.filter(c=>c.CARDTYPE==='MINION')){b.ATK=Number(b.ATK??b.baseAttack??0)+1;b.HEALTH=Number(b.HEALTH??b.baseHealth)+1;}
 post.options=post.options.filter(a=>a.type==='END_TURN'||[12,81,24].includes(a.entityId));
 post.options.push({id:'egg',type:'POWER',entityId:80,targetId:66});
 const final=pipeline(post);
 assert.equal(final.p.turnOrder.heldAttackIds.length,0);
 for(const a of final.actions.filter(a=>a.targetId!=null))assert.equal(allowsPlanContinuation(post.state,final.actions,a,{admission:final.trace.admission}),true);
 assert.ok(Object.values(final.p.plans??{}).some(steps=>steps.some(m=>m.kind==='attack'&&m.id===80)));
});

test('a discarded plain damage outlet does not cast; actual and unknown discard triggers stay modelled',()=>{
 assert.deepEqual(discardModel({type:'SPELL',text:'Deal 4 damage. Discard a random card.'}),{kind:'none'});
 assert.deepEqual(discardModel({type:'SPELL',text:'When you discard this, draw 3 cards.'}),{kind:'draw',n:3});
 assert.deepEqual(discardModel({type:'SPELL',text:'Deal 4 damage. Discard a random card. When you discard this, deal 5 damage.'}),{kind:'unknown'});
 assert.deepEqual(discardModel({type:'MINION',name:'Unknown',hp:5,text:'Whenever you discard a card, gain +1/+1.'}),{kind:'unknown'});
});

test('discard ties/draws/unknown effects do not turn Whispers into an exact queued continuation',()=>{
 for(const change of [
  c=>c.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:1,text:''}),
  c=>Object.assign(c.state.me.hand.find(x=>x.entityId===7),{text:'When you discard this, draw 3 cards.'}),
  c=>Object.assign(c.state.me.hand.find(x=>x.entityId===7),{text:'When you discard this, deal 5 damage to a random enemy.'})
 ]){const c=fixture();change(c);assert.ok(!combinationAdmission(c.state,c.options).lines.some(l=>l.followup.buffId===32));}
});

test('no legal buff or insufficient mana cannot block attacks solely because a buff is in hand',()=>{
 for(const change of [c=>c.options=c.options.filter(a=>a.entityId!==32),c=>c.state.me.mana=0]){
  const c=afterDevelopment();change(c);
  assert.equal(turnOrderAssessment(c.state,constrainActions(c.state,c.options)).heldAttackIds.length,0);
 }
});

test('queue ordering generalizes across unnamed pure/discard buffs, board counts and costs',()=>{
 for(const n of [2,3,5,6])for(const cost of [1,2])for(const discard of [false,true]){
  const state={status:'RUNNING',me:{heroClass:'WARLOCK',current:true,mana:cost,hand:[
   {entityId:20,CARDTYPE:'SPELL',name:'Unseen buff',COST:cost,text:(discard?'Discard your lowest Cost card. ':'')+'Give your minions +1/+1.'}
  ],board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30},...Array.from({length:n},(_,i)=>({entityId:100+i,CARDTYPE:'MINION',ATK:1,HEALTH:2,EXHAUSTED:0}))]},opponent:{board:[{entityId:2,CARDTYPE:'HERO',HEALTH:50}]}};
  const actions=[{id:'end',type:'END_TURN'},{id:'buff',type:'POWER',entityId:20},{id:'face',type:'POWER',entityId:100,targetId:2}];
  const legal=constrainActions(state,actions);assert.equal(allowsPlanContinuation(state,legal,actions[2]),false,`${n}/${cost}/${discard}`);
  state.me.hand=[];assert.equal(allowsPlanContinuation(state,actions.slice(2),actions[2]),true);
 }
});

test('a queued attack rejected for ordering still yields to a fresh visible lethal',()=>{
 const c=afterDevelopment();Object.assign(c.state.opponent.board.find(x=>x.CARDTYPE==='HERO'),{HEALTH:5,DAMAGE:0,ARMOR:0});
 const p=pipeline(c).p;assert.equal(p.forced?.source,'forced_lethal');assert.ok(p.forced.action.targetId===66);
});

test('a space-making trade remains an exception, while face attacks wait for the buff',()=>{
 const state={status:'RUNNING',me:{heroClass:'WARLOCK',current:true,mana:2,hand:[
  {entityId:20,CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'},
  {entityId:21,CARDTYPE:'MINION',COST:1,ATK:2,HEALTH:2,text:''}
 ],board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30},...Array.from({length:7},(_,i)=>({entityId:100+i,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:0}))]},opponent:{board:[{entityId:2,CARDTYPE:'HERO',HEALTH:50},{entityId:200,CARDTYPE:'MINION',ATK:1,HEALTH:1}]}};
 const actions=[{id:'end',type:'END_TURN'},{id:'buff',type:'POWER',entityId:20},{id:'trade',type:'POWER',entityId:100,targetId:200},{id:'face',type:'POWER',entityId:100,targetId:2}];
 assert.equal(allowsPlanContinuation(state,actions,actions[2]),true);
 assert.equal(allowsPlanContinuation(state,actions,actions[3]),false);
});

test('proved weapon-discard development is still allowed before the buff',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game18-weapon-acolytes-buff.json',import.meta.url)));
 const state=structuredClone(f.decision.state),weapon=state.me.hand.find(c=>c.entityId===59);
 state.me.hand=state.me.hand.filter(c=>c.entityId!==59);state.me.mana=1;
 state.me.board.push({...weapon,HEALTH:3});state.me.board.find(c=>c.CARDTYPE==='HERO').ATK=4;
 const actions=[{id:'swing',type:'POWER',entityId:70,targetId:121},{id:'buff',type:'POWER',entityId:57},{id:'end',type:'END_TURN'}];
 const trace={},full=constrainActions(state,actions,{trace});
 assert.equal(allowsPlanContinuation(state,full,actions[0],{admission:trace.admission}),true);
});

test('pure drawing is optional and does not cause the buff gate without any buff',()=>{
 const c=afterDevelopment();c.state.me.hand=c.state.me.hand.filter(x=>x.entityId!==32);c.state.me.mana=2;
 c.options=c.options.filter(x=>x.entityId!==32);c.options.push({id:'tap',type:'POWER',entityId:65});
 const {actions}=pipeline(c);assert.equal(turnOrderAssessment(c.state,actions).heldAttackIds.length,0);
 for(const a of actions.filter(a=>[12,81,24].includes(a.entityId)&&a.targetId))assert.equal(allowsPlanContinuation(c.state,actions,a),true);
});

test('old weapon version remains frozen, new default adds shared queue ordering and discard-buff admission',async()=>{
 const old=await loadDecisionEngine('silverfish-v1-weapon-preservation-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-rule-release-v1');assert.equal(old.allowsPlanContinuation,undefined);
 const c=fixture();const p=old.prepare(c.state,old.constrainActions(c.state,c.options));
 assert.ok(!Object.values(p.plans??{}).some(steps=>steps[0].id===10&&steps[1]?.id===32));
 assert.ok(Object.values(pipeline(c).p.plans??{}).some(steps=>steps[0].id===10&&steps[1]?.id===32));
});
