import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentBox,hand,handGrab,board,dropSlot,hero,endTurn,mulligan,locate,L} from '../src/layout.mjs';
import {plan} from '../src/execute.mjs';

const HD=contentBox(1920,1080), QHD=contentBox(2560,1440);
const near=(a,b,tol=0.75)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}`);

test('a 16:9 client has no letterbox; a wider one gets pillars', () => {
  assert.deepEqual(HD,{x:0,y:0,w:1920,h:1080});
  const wide=contentBox(2560,1080);
  assert.equal(wide.w,1920); near(wide.x,320); assert.equal(wide.y,0);
});

test('the same fractions land on the same relative spot at 1080p and 1440p', () => {
  for(const [a,b] of [[hand(HD,2,5),hand(QHD,2,5)],[board(HD,3,7,'you'),board(QHD,3,7,'you')],[endTurn(HD),endTurn(QHD)]]){
    near(a.x/1920,b.x/2560,0.001); near(a.y/1080,b.y/1440,0.001);
  }
});

test('rows stay centred and ordered left to right', () => {
  for(const n of [1,2,3,5,7]){
    const xs=Array.from({length:n},(_,i)=>board(HD,i,n,'me').x);
    near(xs.reduce((a,b)=>a+b,0)/n,960);
    for(let i=1;i<n;i++)assert.ok(xs[i]>xs[i-1]);
  }
  near(board(HD,0,1,'me').x,960);
});

test('the hand row agrees with the positions measured on screen', () => {
  // Cross-validation, not a fit: the model is HDT's, the numbers below are ours,
  // read off a 2560x1440 screenshot on 2026-09-20. They agree to well within a
  // card width (~180px), which is what makes the ported model trustworthy.
  const QHD=contentBox(2560,1440);
  const got=[0,1,2,3,4].map(i=>Math.round(hand(QHD,i,5).x));
  for(const [a,b] of got.map((v,i)=>[v,[956,1091,1231,1359,1488][i]]))near(a,b,20);
  // Independently: a live click at 1160 did pick up card three of six.
  near(Math.round(hand(QHD,2,6).x),1160,20);
});

test('no hand size pushes a card off the board', () => {
  for(const n of [1,3,5,7,10]){
    assert.ok(hand(HD,0,n).x>0 && hand(HD,n-1,n).x<1920);
    for(let i=1;i<n;i++)assert.ok(hand(HD,i,n).x>hand(HD,i-1,n).x);
  }
});

test('the hand arcs with the middle card highest', () => {
  // HDT's arc is deliberately asymmetric -- only cards right of centre get the
  // sine term -- so assert the shape, not a mirror.
  const [l,m,r]=[hand(HD,0,5),hand(HD,2,5),hand(HD,4,5)];
  assert.ok(m.y<l.y && m.y<r.y);
});

test('a summon drops into one of n+1 gaps and rejects a full board', () => {
  const s=dropSlot(HD,2,4,'me');
  const after=Array.from({length:5},(_,i)=>board(HD,i,5,'me').x);
  near(s.x,after[2]);
  assert.throws(()=>dropSlot(HD,7,L.maxBoard,'me'),/full/);
});

test('out-of-range indices throw rather than clicking somewhere arbitrary', () => {
  assert.throws(()=>hand(HD,3,3),/hand index/);
  assert.throws(()=>board(HD,-1,3,'me'),/board index/);
  assert.throws(()=>mulligan(HD,4,4),/mulligan index/);
});

const state=()=>({
  me:{playerId:1,mana:5,hand:[{entityId:10,name:'Duck',CARDTYPE:'MINION'},{entityId:11,name:'Bolt',CARDTYPE:'SPELL'}],
      board:[{entityId:1,CARDTYPE:'HERO'},{entityId:2,CARDTYPE:'HERO_POWER'},{entityId:20,name:'Imp',CARDTYPE:'MINION'}],handCount:2},
  opponent:{playerId:2,board:[{entityId:3,CARDTYPE:'HERO'},{entityId:30,name:'Yeti',CARDTYPE:'MINION'}],handCount:4},
});

test('playing a minion selects the card then drops it right of the board', () => {
  const st=state();
  const steps=plan(HD,st,{id:'o1',type:'POWER',option:1,entityId:10});
  assert.deepEqual(steps.map(s=>s.what),['select Duck','drop into slot 2']);
  near(steps[0].x,hand(HD,0,2).x);
  near(steps[1].x,board(HD,1,2,'me').x);
});

test('a targeted spell selects the card then the target, with no drop step', () => {
  const steps=plan(HD,state(),{id:'o2t0',type:'POWER',option:2,entityId:11,targetId:30});
  assert.deepEqual(steps.map(s=>s.what),['select Bolt','target Yeti']);
  near(steps[1].y,board(HD,0,1,'you').y);
});

test('an attack is source then target, both on the board', () => {
  const steps=plan(HD,state(),{id:'o3t0',type:'POWER',option:3,entityId:20,targetId:3});
  assert.deepEqual(steps.map(s=>s.what),['select Imp','target 3']);
  near(steps[0].y,board(HD,0,1,'me').y);
  near(steps[1].y,hero(HD,'you').y);
});

test('hero power resolves to the hero power slot, not the hero', () => {
  const steps=plan(HD,state(),{id:'o4',type:'POWER',option:4,entityId:2});
  near(steps[0].x,L.heroPower.x*1920);
  assert.notEqual(Math.round(steps[0].x),Math.round(hero(HD,'me').x));
});

test('a mulligan tosses each named card then confirms', () => {
  const st={...state(),choice:{type:'MULLIGAN',entities:[{entityId:40,cardId:'A1'},{entityId:41,cardId:'A2'},{entityId:42,cardId:'A3'}]}};
  const steps=plan(HD,st,{id:'m5',type:'MULLIGAN',choiceId:1,replace:[40,42]});
  assert.deepEqual(steps.map(s=>s.what),['toss 40','toss 42','confirm mulligan']);
  near(steps[0].x,mulligan(HD,0,3).x);
  near(steps[1].x,mulligan(HD,2,3).x);
});

test('end turn is a single click', () => {
  assert.deepEqual(plan(HD,state(),{id:'o9',type:'END_TURN',option:9}).map(s=>s.what),['end turn']);
});

test('an entity that is nowhere on screen throws', () => {
  assert.throws(()=>locate(HD,state(),999),/not on screen/);
});

import {mulliganCards,isCoin} from '../src/power.mjs';

test('every Coin variant is recognised, including GAME_005 whose id lacks "COIN"', () => {
  assert.ok(isCoin({cardId:'GAME_005',name:'The Coin'}));
  assert.ok(isCoin({cardId:'JAIL_COIN3',name:'The Coin'}));
  assert.ok(!isCoin({cardId:'DMF_119',name:'Wicked Whispers'}));
});

test('the Coin is excluded from the mulligan row it is not drawn on', () => {
  // Exactly what this game dealt on the draw: four cards plus the Coin.
  const entities=[{entityId:56,cardId:'DMF_119',name:'Wicked Whispers'},{entityId:42,cardId:'END_016',name:'Chronoclaws'},
    {entityId:53,cardId:'CATA_499',name:'Disposable Acolytes'},{entityId:51,cardId:'CATA_493',name:'Duke of Below'},
    {entityId:68,cardId:'JAIL_COIN3',name:'The Coin'}];
  assert.equal(mulliganCards(entities).length,4);

  const st={me:{playerId:1,hand:[],board:[]},opponent:{board:[]},choice:{type:'MULLIGAN',entities}};
  const steps=plan(HD,st,{id:'m5',type:'MULLIGAN',choiceId:1,replace:[56,53]});
  // Positions must come from a four-card row, not a five-card one.
  near(steps[0].x,mulligan(HD,0,4).x);
  near(steps[1].x,mulligan(HD,2,4).x);
  assert.notEqual(Math.round(steps[1].x),Math.round(mulligan(HD,2,5).x));
  assert.deepEqual(steps.at(-1).what,'confirm mulligan');
});

test('hand grab points: the 7-card fan measured by hover on 2026-09-24', () => {
  // Each of these raised the intended card; HDT's own point for card 6 raised card 7.
  const hit=[[877,1368],[988,1332],[1095,1310],[1205,1292],[1313,1298],[1435,1305],[1545,1325]];
  hit.forEach(([x,y],i)=>{const p=handGrab(QHD,i,7);near(p.x,x,12);near(p.y,y,14)});
  near(handGrab(QHD,0,2).x,hand(QHD,0,2).x);            // no fan overlap: x unchanged
});
