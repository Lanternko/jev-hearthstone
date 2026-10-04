import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spendFirst} from '../src/policy.mjs';

// Game 58 turn 3 (2026-09-30): 「地標也沒有先抽卡，所以最後損失了 buff 的傷害」. Five minions swung
// first; Chamber of Viscidus, the Coin and Wicked Whispers only went down afterwards.
const WHISPERS={entityId:40,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:3,text:'Discard your lowest Cost card. Give your minions +1/+1.'};
const COIN={entityId:41,name:'The Coin',cardId:'GAME_005',CARDTYPE:'SPELL',COST:0,text:'Gain 1 Mana Crystal this turn only.'};
const EGG={entityId:42,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,text:'<b>Deathrattle:</b> Summon two 2/1 Spiders. If you discard this, trigger its <b>Deathrattle</b>.'};
const CHAMBER={entityId:20,name:'Chamber of Viscidus',CARDTYPE:'LOCATION',text:'<b>Discover</b> a card.'};
const mine=Array.from({length:5},(_,i)=>({entityId:10+i,CARDTYPE:'MINION',ATK:2,HEALTH:2}));
const state=(extra={})=>({me:{mana:2,hand:[WHISPERS,COIN,EGG],handCount:3,deckCount:20,
  board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:2,CARDTYPE:'HERO_POWER',text:'Draw a card and take $2 damage.'},...mine,{...CHAMBER,...extra}]},
 opponent:{board:[{entityId:50,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0}]}});
const acts=[{id:'o0',type:'END_TURN'},{id:'o1',entityId:41},{id:'o2',entityId:20},
 {id:'a10',entityId:10,targetId:50},{id:'a11',entityId:11,targetId:50}];

test('a ready location and the Coin that buys a board buff come before any swing',()=>{
 const out=spendFirst(state(),acts).map(a=>a.id);
 assert.ok(out.includes('o2')&&out.includes('o1'));
 assert.ok(!out.includes('a10')&&!out.includes('a11'));
});

test('a castable board buff holds the swings back too',()=>{
 const st=state({EXHAUSTED:1});st.me.mana=3;
 const out=spendFirst(st,[...acts.filter(a=>a.id!=='o2'),{id:'o3',entityId:40}]).map(a=>a.id);
 assert.ok(out.includes('o3')&&!out.includes('a10'));
});

test('with the location spent and no buff left, the swings come back',()=>{
 const st=state({EXHAUSTED:1});st.me.hand=[EGG];
 const out=spendFirst(st,acts.filter(a=>a.id!=='o1')).map(a=>a.id);
 assert.ok(out.includes('a10')&&out.includes('a11'));
});
