import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constrainActions,spendFirst} from '../src/policy.mjs';

// Game 58 turn 5 (2026-09-30): 「第五回合沒有空間了。應該自殺一些怪清出空間，才能下新的」.
// Five minions, 5 mana; Occultist discarding Boneweb Egg lands three bodies into two slots.
const EGG={entityId:31,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,text:'<b>Deathrattle:</b> Summon two 2/1 Spiders. If you discard this, trigger its <b>Deathrattle</b>.'};
const OCC={entityId:32,name:'Ocular Occultist',CARDTYPE:'MINION',COST:1,text:'<b>Taunt</b> <b>Battlecry:</b> Choose a card in your hand to discard.'};
const DEAD={entityId:33,name:'Walking Dead',CARDTYPE:'MINION',COST:3,text:'<b>Taunt</b> If you discard this minion, summon it.'};
const mine=Array.from({length:5},(_,i)=>({entityId:10+i,CARDTYPE:'MINION',ATK:2,HEALTH:2}));
const state=()=>({me:{mana:5,hand:[OCC,DEAD,EGG],handCount:3,deckCount:20,
  board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:2,CARDTYPE:'HERO_POWER',text:'Draw a card and take $2 damage.'},...mine]},
 opponent:{board:[{entityId:50,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:51,CARDTYPE:'MINION',ATK:4,HEALTH:5}]}});
const acts=[{id:'o0',type:'END_TURN'},{id:'o1t33',entityId:32,targetId:33},{id:'o1t31',entityId:32,targetId:31},
 {id:'o2',entityId:33},{id:'a10',entityId:10,targetId:51},{id:'a11',entityId:11,targetId:50}];

test('a discard that summons counts against the room left on the board',()=>{
 const out=constrainActions(state(),acts).map(a=>a.id);
 assert.ok(!out.includes('o1t31'),'Occultist>Egg (three bodies, two slots) waits for the trades');
 assert.ok(out.includes('a10'));
});

test('with the hand crowded out, trades into enemy minions stay on the menu',()=>{
 const out=spendFirst(state(),acts).map(a=>a.id);
 assert.ok(out.includes('a10'),'the trade that frees a slot');
 assert.ok(!out.includes('a11'),'face swings still wait for the cards');
 assert.ok(!out.includes('o0'));
});
