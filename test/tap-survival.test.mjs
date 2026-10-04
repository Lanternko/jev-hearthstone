import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainActions,tapExposesBoardLethal} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
const tap={entityId:2,CARDTYPE:'HERO_POWER',name:'Life Tap',COST:2,text:'Draw a card and take $2 damage.'};
const state=hp=>({me:{mana:3,deckCount:6,hand:[{entityId:3,CARDTYPE:'SPELL',COST:6,
 name:"Hand of Gul'dan",text:'When you play or discard this, draw 3 cards.'}],board:[
 {entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:30-hp},tap,
 {entityId:4,CARDTYPE:'MINION',ATK:23,HEALTH:20,EXHAUSTED:1},
 {entityId:5,CARDTYPE:'MINION',ATK:4,HEALTH:5,EXHAUSTED:1}]},
 opponent:{board:[{entityId:9,CARDTYPE:'HERO',HEALTH:41},
 {entityId:10,CARDTYPE:'MINION',ATK:2,HEALTH:1},{entityId:11,CARDTYPE:'MINION',ATK:2,HEALTH:1}]}});
const actions=[{id:'end',type:'END_TURN'},{id:'tap',entityId:2}];
test('game 51: tapping from six to four exposes exactly lethal existing board damage',()=>{
 const s=state(6);
 assert.equal(tapExposesBoardLethal(s,tap),true);
 const legal=constrainActions(s,actions);
 assert.deepEqual(legal.map(a=>a.id),['end']);
 assert.equal(prepare(s,legal).forced.action.id,'end');
 assert.deepEqual(constrainActions(s,[actions[1]]),[],'an incomplete menu cannot resurrect the unsafe tap');
});
test('one extra Health, armour, or a prior removal can make the tap available after re-observation',()=>{
 assert.equal(tapExposesBoardLethal(state(7),tap),false);
 const armoured=state(6);armoured.me.board[0].ARMOR=1;
 assert.ok(constrainActions(armoured,actions).some(a=>a.id==='tap'));
 const cleared=state(6);cleared.opponent.board.pop();
 assert.ok(constrainActions(cleared,actions).some(a=>a.id==='tap'));
});
test('guaranteed known draw damage counts in post-tap survival too',()=>{
 const s=state(9);s.me.deckCount=1;s.me.drawHazards=[3];
 assert.equal(tapExposesBoardLethal(s,tap),true);
 assert.deepEqual(constrainActions(s,actions).map(a=>a.id),['end']);
});
