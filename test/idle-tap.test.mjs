import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constrainActions,spendFirst} from '../src/policy.mjs';

// Game 55, turn 5: 27 Health, two cards in hand, 26 in the deck, 2 mana, nothing else to do.
const tap={entityId:61,cardId:'HERO_07ebp',name:'Life Tap',text:'<b>Hero Power</b>\nDraw a card and take $2 damage.',baseCost:2,COST:2,CARDTYPE:'HERO_POWER'};
const pos=(extra={})=>({
  me:{playerId:1,mana:2,deckCount:26,handCount:2,
      hand:[{entityId:70,name:"Hand of Gul'dan",COST:6,CARDTYPE:'SPELL',text:'Draw 3 cards.'},{entityId:71,name:'Chamber of Viscidus',COST:4,CARDTYPE:'LOCATION'}],
      board:[{entityId:60,CARDTYPE:'HERO',HEALTH:30,DAMAGE:3},tap],...extra},
  opponent:{playerId:2,board:[{entityId:3,CARDTYPE:'HERO',HEALTH:40,DAMAGE:0},{entityId:30,CARDTYPE:'MINION',ATK:3,HEALTH:6}],handCount:4},
});
const menu=[{id:'o0',type:'END_TURN',option:0},{id:'o1',type:'POWER',option:1,entityId:61}];

test('with nothing else to do and a safe tap, the spare mana draws a card', () => {
  const s=pos();
  assert.deepEqual(spendFirst(s,constrainActions(s,menu)).map(a=>a.id),['o1']);
});

test('the tap is not forced when it would put us in reach of their board', () => {
  const s=pos({board:[{entityId:60,CARDTYPE:'HERO',HEALTH:30,DAMAGE:26},tap]});
  assert.ok(spendFirst(s,constrainActions(s,menu)).some(a=>a.type==='END_TURN'));
});

test('turn 7: an empty hand and a hero swing still left do not keep END_TURN on the menu', () => {
  const s=pos({mana:4,hand:[],handCount:0,board:[{entityId:60,CARDTYPE:'HERO',HEALTH:30,DAMAGE:3,ATK:3},tap]});
  const m=[...menu,{id:'o2t0',type:'POWER',option:2,entityId:60,targetId:30}];
  const ids=spendFirst(s,constrainActions(s,m)).map(a=>a.id);
  assert.ok(ids.includes('o1')&&!ids.includes('o0'));
});
