import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weaponBuffAssessment} from '../src/weapon-buff.mjs';
import {constrainActions} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game18-weapon-acolytes-buff.json',import.meta.url)));
const fixture=()=>({state:structuredClone(f.decision.state),actions:[...structuredClone(f.decision.options),{id:'aco',type:'POWER',entityId:48}]});
const pipeline=(state,actions,planner=false)=>{
 const trace={},out=constrainActions(state,actions,{trace});
 return {out,p:prepare(state,out,{planner,admission:trace.admission})};
};
test('game18 T5: five mana pays weapon and buff; discard summon costs zero',()=>{
 for(const planner of [false,true]){
  const {state,actions}=fixture(),{out,p}=pipeline(state,actions,planner);
  assert.ok(out.some(a=>a.entityId===48),'direct summon remains visible rather than hidden by fodder filter');
  assert.ok(!out.some(a=>a.entityId===57),'buff waits for the weapon-triggered development');
  assert.equal(p.forced.action.entityId,59);assert.equal(p.forced.source,'weapon_discard_buff');
  assert.equal(p.weaponBuff.mana.total,5);assert.equal(p.weaponBuff.mana.discardTrigger,0);
  assert.deepEqual(p.weaponBuff.discard.targets.map(c=>c.entityId),[48]);
  assert.ok(!p.rest,'force only the current legal step, observe before swing');
 }
});
test('after equip, hero swings before buff, then random summon requires observation',()=>{
 const {state}=fixture(),weapon=state.me.hand.find(c=>c.entityId===59);
 state.me.hand=state.me.hand.filter(c=>c!==weapon);state.me.mana=1;
 state.me.board.push({...weapon,DURABILITY:3});state.me.board.find(c=>c.CARDTYPE==='HERO').ATK=4;
 const actions=[{id:'swing',type:'POWER',entityId:70,targetId:121},{id:'buff',type:'POWER',entityId:57},{id:'end',type:'END_TURN'}];
 const {p}=pipeline(state,actions);
 assert.equal(p.forced.action.entityId,70);assert.equal(p.forced.action.targetId,121);
 state.me.hand=state.me.hand.filter(c=>c.entityId!==48);state.me.board.push({entityId:901,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:1},{entityId:902,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:1});
 assert.equal(weaponBuffAssessment(state,actions),null,'after observed discard, return to ordinary buff/attack logic');
 assert.ok(constrainActions(state,actions.filter(a=>a.id!=='swing')).some(a=>a.entityId===57));
});
test('case2: four mana keeps weapon-only and direct summon+buff alternatives',()=>{
 const {state,actions}=fixture();state.me.mana=4;
 const {out,p}=pipeline(state,actions);
 assert.equal(p.weaponBuff.mode,'compare_weapon_or_direct_buff');assert.ok(!p.forced);
 assert.ok(out.some(a=>a.entityId===48));assert.ok(out.some(a=>a.entityId===59));
 assert.ok(p.crit.aco);assert.ok(p.plans.development1);assert.equal(p.plans.development1.at(-1).kind,'attack');
 assert.ok(!p.plans.development1.some(m=>m.id===57),'no impossible post-weapon buff');
});
test('case3: other highest-cost payoff and a 3/4-health trade are exposed for comparison',()=>{
 for(const health of [3,4]){
  const {state,actions}=fixture();state.me.hand.push({entityId:950,name:'Hand of Gul\'dan',CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'});
  state.opponent.board.find(c=>c.entityId===121).HEALTH=health;
  const {out,p}=pipeline(state,actions);
  assert.equal(p.weaponBuff.mode,'compare_other_discard_or_direct_buff');assert.deepEqual(p.weaponBuff.discard.targets.map(c=>c.entityId),[950]);
  assert.ok(p.weaponBuff.paths[0].killsTarget);assert.equal(p.weaponBuff.paths[0].targetHealth,health);
  assert.ok(p.crit.aco);assert.ok(p.plans.development1);assert.ok(!p.forced);
 }
});
test('ties, frozen/exhausted heroes, secret uncertainty and insufficient slots are not forced',()=>{
 for(const change of [
  s=>s.me.hand.push({entityId:950,CARDTYPE:'SPELL',COST:2,name:'tied card'}),
  s=>s.me.board.find(c=>c.CARDTYPE==='HERO').FROZEN=1,
  s=>s.me.board.find(c=>c.CARDTYPE==='HERO').EXHAUSTED=1,
  s=>s.opponent.secretCount=1,
  s=>s.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=27,
  s=>{while(s.me.board.filter(c=>c.CARDTYPE==='MINION').length<6)s.me.board.push({entityId:900+s.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:1});},
 ]){const {state,actions}=fixture();change(state);assert.ok(!weaponBuffAssessment(state,actions).preferred);}
});
test('visible buff lethal remains available before weapon development',()=>{
 const {state,actions}=fixture();state.opponent.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=23;
 actions.push({id:'dukeFace',entityId:67,targetId:68,type:'POWER'},{id:'deadFace',entityId:106,targetId:68,type:'POWER'});
 const out=constrainActions(state,actions);assert.ok(out.some(a=>a.entityId===57));
 const p=prepare(state,out,{planner:true});assert.equal(p.lethal?.action.entityId,57);
});
test('unaffordable weapon does not prevent direct summon+buff ordering',()=>{
 const {state,actions}=fixture();state.me.mana=3;
 const out=constrainActions(state,actions.filter(a=>a.entityId!==59));
 assert.ok(out.some(a=>a.entityId===48));assert.ok(!out.some(a=>a.entityId===57));
 assert.equal(weaponBuffAssessment(state,out).compare,false);
});
