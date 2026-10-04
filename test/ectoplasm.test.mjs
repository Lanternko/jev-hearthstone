import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePower,publicState} from '../src/power.mjs';
import {constrainActions,boardRecoveryActions} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
import {describe} from '../src/describe.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game153-ectoplasm.json',import.meta.url)));
const cards=Object.fromEntries(JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url))).map(c=>[c.id,c]));
const ecto=s=>s.me.hand.find(c=>c.cardId==='CAP_805t');

test('game153 own turn5: recover five known bodies before location or tap, with either planner setting',()=>{
 const s=fixture.state;assert.equal(s.turn,9);assert.equal(s.me.mana,5);
 assert.deepEqual(ecto(s).resummons.map(c=>c.name),['Silverware Golem','Walking Dead','Ocular Occultist','Boneweb Spider','Boneweb Spider']);
 const out=constrainActions(s,fixture.options);
 for(const planner of [true,false]){
  const p=prepare(s,out,{planner});assert.equal(p.forced.source,'board_recovery');
  assert.equal(p.forced.action.entityId,ecto(s).entityId);
 }
 const text=describe(s,out.find(a=>a.entityId===ecto(s).entityId));
 assert.match(text,/up to 5 bodies fit/);assert.match(text,/does not trigger Battlecries/);
});

test('recovery pool comes only from own copied SETASIDE entities for the same clear',()=>{
 const p=parsePower(fixture.parserLog),s=publicState(p,1,cards);
 assert.deepEqual(ecto(s).resummons,ecto(fixture.state).resummons);
 const stored=[...p.entities.values()].find(e=>e.tags.COPIED_FROM_ENTITY_ID&&e.tags.ZONE==='SETASIDE'&&e.tags.CREATOR==='55');
 const foreign=structuredClone(stored);foreign.id=900;foreign.tags.CONTROLLER='2';p.entities.set(900,foreign);
 const unrelated=structuredClone(stored);unrelated.id=901;unrelated.tags.CREATOR='999';p.entities.set(901,unrelated);
 assert.equal(ecto(publicState(p,1,cards)).resummons.length,5);
 stored.tags.ZONE='GRAVEYARD';const next=publicState(p,1,cards);
 assert.equal(ecto(next).resummons.length,4);assert.notEqual(next.decisionFingerprint,s.decisionFingerprint);
 assert.equal(parsePower('GameState.DebugPrintPower() - CREATE_GAME').entities.size,0);
});

test('recovery priority requires a known substantial pool, space, mana and a live own turn',()=>{
 for(const edit of [s=>s.me.mana=2,s=>s.me.current=false,s=>s.status='COMPLETE',
  s=>delete ecto(s).resummons,s=>ecto(s).resummons.length=2,
  s=>s.me.board.push({CARDTYPE:'MINION',ATK:1,HEALTH:1}),
  s=>s.me.board.push(...Array.from({length:5},()=>({CARDTYPE:'LOCATION'})))]){
  const s=structuredClone(fixture.state);edit(s);
  assert.equal(boardRecoveryActions(s,fixture.options).length,0);
 }
 assert.equal(boardRecoveryActions(fixture.state,fixture.options.filter(a=>a.entityId!==113)).length,0);
 const s=structuredClone(fixture.state);
 // A ready hero attack that ends the game still takes priority over recovery.
 const hero=s.me.board.find(c=>c.CARDTYPE==='HERO');hero.ATK=4;hero.EXHAUSTED=0;
 const foe=s.opponent.board.find(c=>c.CARDTYPE==='HERO');
 const actions=[...fixture.options,{id:'kill',type:'POWER',entityId:hero.entityId,targetId:foe.entityId}];
 const p=prepare(s,constrainActions(s,actions));
 assert.equal((p.forced??p.lethal).action.id,'kill');
});
