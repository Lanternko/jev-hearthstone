import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {warlockInformationAction} from '../src/warlock-information.mjs';
const load=key=>JSON.parse(readFileSync(new URL(`./fixtures/user-rulings/game179-${key}.json`,import.meta.url)));
test('game 179 turn 1: inspect Catacombs before spending the mana for a Temporary card',()=>{
 const f=load('discover-first');
 for(const planner of [true,false]){
  const p=prepare(f.state,constrainActions(f.state,f.options),{planner});
  assert.equal(p.forced.source,'free_discover_first');
  assert.equal(p.forced.action.entityId,f.state.me.hand.find(c=>c.name==='Cursed Catacombs').entityId);
 }
});
test('game 179 turn 3: safe Tap before Whispers can change its forced weapon discard',()=>{
 const f=load('draw-before-whispers');
 for(const planner of [true,false]){
  const p=prepare(f.state,constrainActions(f.state,f.options),{planner});
  assert.equal(p.forced.source,'draw_before_weapon_discard');
  assert.equal(p.forced.action.entityId,f.state.me.board.find(c=>c.name==='Life Tap').entityId);
  assert.ok(!p.rest,'no cached continuation assumes the unknown draw');
 }
 const s=structuredClone(f.state);s.me.hand.push({entityId:990,CARDTYPE:'MINION',COST:2,text:'If you discard this minion, summon it.'});
 assert.equal(warlockInformationAction(s,f.options),null,'reassess after drawing an alternative; no compulsory extra draw');
});
test('information preference respects mana, lethal, hand space, fatigue and self-damage',()=>{
 const f=load('draw-before-whispers');
 for(const change of [s=>s.me.mana=2,s=>s.me.deckCount=1,s=>s.me.drawHazards=[30],s=>{s.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=29;}]){
  const s=structuredClone(f.state);change(s);assert.equal(warlockInformationAction(s,f.options),null);
 }
 const s=structuredClone(f.state);s.opponent.board.find(c=>c.CARDTYPE==='HERO').HEALTH=1;
 const p=prepare(s,constrainActions(s,f.options));assert.ok(p.lethal||p.forced?.source==='forced_lethal');
 const g=load('discover-first');g.state.me.deckCount=0;assert.equal(warlockInformationAction(g.state,g.options),null);
 g.state.me.deckCount=20;while(g.state.me.hand.length<10)g.state.me.hand.push({entityId:900+g.state.me.hand.length,CARDTYPE:'SPELL',COST:5});
 assert.equal(warlockInformationAction(g.state,g.options),null);
});
