import test from 'node:test';
import assert from 'node:assert/strict';
import {verdict} from '../src/verify.mjs';

const clone=s=>JSON.parse(JSON.stringify(s));
const base=()=>({turn:5,me:{current:true,
  hand:[{entityId:1,CARDTYPE:'MINION'},{entityId:2,CARDTYPE:'SPELL'},{entityId:3,CARDTYPE:'MINION'}],
  board:[{entityId:10,CARDTYPE:'HERO',ATK:0},{entityId:11,CARDTYPE:'HERO_POWER'},
         {entityId:20,CARDTYPE:'MINION',ATK:3,HEALTH:3},{entityId:21,CARDTYPE:'MINION',ATK:2,HEALTH:2}]},
 opponent:{board:[{entityId:90,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},
                  {entityId:91,CARDTYPE:'MINION',ATK:1,HEALTH:4},{entityId:92,CARDTYPE:'MINION',ATK:1,HEALTH:4}]}});

test('the card we dragged left the hand',()=>{
  const b=base(),a=clone(b);a.me.hand=a.me.hand.filter(c=>c.entityId!==2);
  assert.equal(verdict(b,{type:'POWER',entityId:2},a),'ok');
});
test('its neighbour left the hand instead: misfire, not success',()=>{
  const b=base(),a=clone(b);a.me.hand=a.me.hand.filter(c=>c.entityId!==3);
  assert.equal(verdict(b,{type:'POWER',entityId:2},a),'misfire');
});
test('a draw alone is not the play we asked for',()=>{
  const b=base(),a=clone(b);a.me.hand.push({entityId:4});
  assert.equal(verdict(b,{type:'POWER',entityId:2},a),'pending');
});
test('the right attacker hit the right target',()=>{
  const b=base(),a=clone(b);
  a.me.board[2].NUM_ATTACKS_THIS_TURN=1;a.opponent.board[1].DAMAGE=3;
  assert.equal(verdict(b,{type:'POWER',entityId:20,targetId:91},a),'ok');
});
test('the swing landed on the minion next door',()=>{
  const b=base(),a=clone(b);
  a.me.board[2].NUM_ATTACKS_THIS_TURN=1;a.opponent.board[2].DAMAGE=3;
  assert.equal(verdict(b,{type:'POWER',entityId:20,targetId:91},a),'misfire');
});
test('the other minion attacked',()=>{
  const b=base(),a=clone(b);
  a.me.board[3].NUM_ATTACKS_THIS_TURN=1;a.opponent.board[1].DAMAGE=2;
  assert.equal(verdict(b,{type:'POWER',entityId:20,targetId:91},a),'misfire');
});
test('an attacker that died trading still counts as having swung',()=>{
  const b=base(),a=clone(b);
  a.me.board=a.me.board.filter(c=>c.entityId!==20);a.opponent.board=a.opponent.board.filter(c=>c.entityId!==91);
  assert.equal(verdict(b,{type:'POWER',entityId:20,targetId:91},a),'ok');
});
test('hero power, end turn, choices',()=>{
  const b=base(),a=clone(b);a.me.board[1].EXHAUSTED=1;
  assert.equal(verdict(b,{type:'POWER',entityId:11},a),'ok');
  assert.equal(verdict(b,{type:'POWER',entityId:11},clone(b)),'pending');
  const e=clone(b);e.me.current=false;
  assert.equal(verdict(b,{type:'END_TURN'},e),'ok');
  const c=base();c.choice={id:7};
  assert.equal(verdict(c,{type:'CHOICE',choiceId:7},clone(c)),'pending');
  assert.equal(verdict(c,{type:'CHOICE',choiceId:7},base()),'ok');
});
test('a location that opens its pick-one prompt has fired',()=>{
  const b=base();b.me.board.push({entityId:30,CARDTYPE:'LOCATION',HEALTH:2});
  const a=clone(b);a.choice={id:3};
  assert.equal(verdict(b,{type:'POWER',entityId:30},a),'ok');
  assert.equal(verdict(b,{type:'POWER',entityId:30},clone(b)),'pending');
});
test('an attack that played a hand card instead is a misfire',()=>{
  const b=base(),a=clone(b);a.me.hand=a.me.hand.filter(c=>c.entityId!==2);
  assert.equal(verdict(b,{type:'POWER',entityId:20,targetId:91},a),'misfire');
});
