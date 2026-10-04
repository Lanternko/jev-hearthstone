import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,lethalSelfDamage,selfDamageCost} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game9-fatal-party.json',import.meta.url)));
const party=f.options.find(a=>a.entityId===51);
test('new50 game9 T11: fatal Party never reaches Jev, a plan or forced_spend',()=>{
 assert.equal(selfDamageCost(f.state.me.hand[0]),3);
 const legal=constrainActions(f.state,f.options);
 assert.ok(!legal.some(a=>a.entityId===51));assert.ok(legal.some(a=>a.type==='END_TURN'));
 for(const planner of [true,false]){
  const p=prepare(f.state,legal,{planner});
  assert.notEqual(p.forced?.action.entityId,51);
  assert.ok(!Object.values(p.plans??{}).some(steps=>steps.some(s=>s.id===51)));
 }
});
test('exact survival boundaries account for Armor and observed Immunity',()=>{
 for(const [hp,armor,immune,fatal] of [[2,0,0,true],[3,0,0,true],[4,0,0,false],[3,1,0,false],[3,0,1,false]]){
  const s=structuredClone(f.state),h=s.me.board.find(c=>c.CARDTYPE==='HERO');
  h.HEALTH=hp;h.DAMAGE=0;h.ARMOR=armor;h.IMMUNE=immune;
  assert.equal(lethalSelfDamage(s,party),fatal);
 }
 assert.equal(lethalSelfDamage(f.state,{...party,type:'CHOICE'}),false,'discarding Party does not trigger its Battlecry');
});
test('self-damage text recognition generalizes beyond names and excludes delayed minion effects',()=>{
 assert.equal(selfDamageCost({name:'Unseen minion',CARDTYPE:'MINION',text:'Battlecry: Deal $4 damage to your hero.'}),4);
 assert.equal(selfDamageCost({CARDTYPE:'HERO_POWER',text:'Draw a card and take $2 damage.'}),2);
 assert.equal(selfDamageCost({CARDTYPE:'MINION',text:'Deathrattle: Deal 3 damage to your hero.'}),0);
 assert.equal(selfDamageCost({CARDTYPE:'MINION',text:'Battlecry: Draw a card. Deathrattle: Deal 3 damage to your hero.'}),0);
});
