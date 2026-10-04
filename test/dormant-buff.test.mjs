import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buffImpact} from '../src/describe.mjs';
import {constrainActions,singleBuffTradeGain} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/dormant-buff-tap.json',import.meta.url)));
const ids=s=>({buff:s.me.hand.find(c=>c.name==='Entropic Continuity').entityId,
 tap:s.me.board.find(c=>c.CARDTYPE==='HERO_POWER').entityId,
 body:s.me.board.find(c=>c.CARDTYPE==='MINION').entityId});
test('actual dormant Sprite: buff has zero recipients, safe tap wins with either planner setting',()=>{
 const s=fixture.state,{buff,tap}=ids(s);
 assert.equal(buffImpact(s,s.me.hand.find(c=>c.entityId===buff)).recipients,0);
 const out=constrainActions(s,fixture.options);
 assert.ok(!out.some(a=>a.entityId===buff));
 for(const planner of [true,false]){
  const p=prepare(s,out,{planner});
  if(p.forced)assert.equal(p.forced.action.entityId,tap);
  else {assert.ok(p.acts.length);assert.ok(p.acts.every(a=>a.entityId===tap));assert.ok(Object.values(p.plans).every(steps=>steps[0].kind==='power'));}
 }
 assert.deepEqual(constrainActions(s,[{id:'buff',entityId:buff}]),[],'no fallback revives an ineffective buff');
});
test('single awake body without a better trade prefers drawing when the two compete for mana',()=>{
 const s=structuredClone(fixture.state),{buff,tap}=ids(s);
 s.me.board.find(c=>c.CARDTYPE==='MINION').DORMANT=0;
 const out=constrainActions(s,fixture.options);
 assert.ok(!out.some(a=>a.entityId===buff));
 const p=prepare(s,out,{planner:false});assert.equal(p.forced.action.entityId,tap);
});
test('a one-body buff that converts a mutual death into a surviving kill remains available',()=>{
 const s=structuredClone(fixture.state),{buff,body}=ids(s),b=s.me.board.find(c=>c.entityId===body);
 b.DORMANT=0;b.EXHAUSTED=0;
 const foe=s.opponent.board.find(c=>c.CARDTYPE==='MINION');foe.ATK=3;foe.HEALTH=3;foe.DAMAGE=0;
 const options=[...fixture.options,{id:'trade',entityId:body,targetId:foe.entityId}];
 assert.equal(singleBuffTradeGain(s,s.me.hand.find(c=>c.entityId===buff),options),true);
 assert.ok(constrainActions(s,options).some(a=>a.entityId===buff));
});
test('an unsafe tap is not forced by a dormant board, and a single-body lethal buff is preserved',()=>{
 const s=structuredClone(fixture.state),{buff,tap,body}=ids(s);
 s.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=28;
 assert.ok(!constrainActions(s,fixture.options).some(a=>a.entityId===tap));
 s.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=1;
 const b=s.me.board.find(c=>c.entityId===body);b.DORMANT=0;b.EXHAUSTED=0;
 const foe=s.opponent.board.find(c=>c.CARDTYPE==='HERO');foe.HEALTH=4;foe.DAMAGE=0;
 const options=[...fixture.options,{id:'face',entityId:body,targetId:foe.entityId}];
 const out=constrainActions(s,options);assert.ok(out.some(a=>a.entityId===buff));
 const p=prepare(s,out);assert.ok(p.lethal);assert.equal(p.lethal.action.entityId,buff);
});
