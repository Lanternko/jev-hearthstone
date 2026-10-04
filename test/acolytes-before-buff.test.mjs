import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from '../src/choose.mjs';
import {buffSetupActions,constrainActions,spendFirst} from '../src/policy.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game10-acolytes-buff.json',import.meta.url)));
test('new50 game10 T4: develop Acolytes before buff even without filling all seven slots',()=>{
 for(const planner of [true,false]){
  const p=prepare(f.state,constrainActions(f.state,f.options),{planner});
  assert.equal(p.forced?.action.entityId,f.expectedFirst);
  assert.equal(p.forced.source,'buff_setup');
  assert.ok(!p.rest,'random summons require observing again, not a cached guessed continuation');
 }
 const three=structuredClone(f.state);
 three.me.board.splice(three.me.board.findIndex(c=>c.CARDTYPE==='MINION'),1);
 assert.ok(buffSetupActions(three,f.options).some(a=>a.entityId===38));
});
test('development preference requires full summon space, buff reserve and no immediate survival emergency',()=>{
 for(const change of [
  s=>s.me.mana=2,
  s=>s.me.hand=s.me.hand.filter(c=>c.entityId!==39),
  s=>{while(s.me.board.filter(c=>c.CARDTYPE==='MINION').length<6)s.me.board.push({entityId:900+s.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:1});},
  s=>s.me.board.find(c=>c.CARDTYPE==='HERO').HEALTH=1,
 ]){
  const s=structuredClone(f.state);change(s);
  assert.ok(!buffSetupActions(s,f.options).some(a=>a.entityId===38));
 }
});
test('after an illustrative observed summon, the reserved buff remains legal before attacks',()=>{
 const s=structuredClone(f.state);
 s.me.mana=1;s.me.hand=s.me.hand.filter(c=>c.entityId!==38);
 // Test observation only: these bodies are not predictions of the two random cards.
 s.me.board.push({entityId:800,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:1},
  {entityId:801,CARDTYPE:'MINION',ATK:1,HEALTH:2,EXHAUSTED:1});
 const actions=f.options.filter(a=>a.entityId!==38);
 const out=spendFirst(s,constrainActions(s,actions));
 assert.ok(out.some(a=>a.entityId===39));
 const mine=new Set(s.me.board.filter(c=>c.CARDTYPE==='MINION').map(c=>c.entityId));
 assert.ok(!out.some(a=>mine.has(a.entityId)&&a.targetId!=null));
});
