import test from 'node:test';
import assert from 'node:assert/strict';
import {fromState,moves,apply,hero,hpOf} from '../src/sim.mjs';

const HERO=(id,hp=30)=>({entityId:id,CARDTYPE:'HERO',HEALTH:hp,name:'Hero'});
const MINION=(id,atk,hp,text='')=>({entityId:id,CARDTYPE:'MINION',name:`m${id}`,ATK:atk,HEALTH:hp,COST:1,text});
const CATACOMBS={entityId:10,CARDTYPE:'SPELL',name:'Cursed Catacombs',COST:0,text:'<b>Discover</b> another card from your deck. Make it <b>Temporary</b>.'};
const PLATYSAUR={entityId:11,CARDTYPE:'MINION',name:'Platysaur',COST:1,ATK:1,HEALTH:2,text:'<b>Battlecry:</b> Draw a card. <b>Deathrattle:</b> Discard it.'};
const CHAMBER={entityId:12,CARDTYPE:'LOCATION',name:'Chamber of Viscidus',COST:3,HEALTH:2,text:'Look at 3 cards in your hand and choose one to discard. Draw two cards.'};
const SOULFIRE={entityId:13,CARDTYPE:'SPELL',name:'Soulfire',COST:1,text:'Deal $4 damage. Discard a random card.'};
const EGG={entityId:14,CARDTYPE:'MINION',name:'Boneweb Egg',COST:2,ATK:0,HEALTH:2,text:'<b>Deathrattle:</b> Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'};
const BARRAGE={entityId:15,CARDTYPE:'SPELL',name:'Soul Barrage',COST:4,text:'[x]When you play or discard this, deal $5 damage randomly split among all enemies.'};
const GOLEM={entityId:16,CARDTYPE:'MINION',name:'Silverware Golem',COST:3,ATK:3,HEALTH:3,text:'If you discard this minion, summon it.'};

const state=(hand,{myBoard=[],oppBoard=[],mana=10,deck=20}={})=>({turn:5,
  me:{mana,hand,board:[HERO(1),...myBoard],deckCount:deck,fatigue:0,drawHazards:[]},
  opponent:{board:[HERO(2),...oppBoard],hand:[]}});
const untargeted=hand=>hand.map(c=>({entityId:c.entityId}));
const full=(st,actions)=>fromState(st,actions,{full:true});

test('none of the six is a move unless the state is built with full', ()=>{
  const hand=[CATACOMBS,PLATYSAUR,CHAMBER,SOULFIRE,EGG,BARRAGE],st=state(hand);
  const actions=[...untargeted(hand),{entityId:13,targetId:2}];
  assert.deepEqual(moves(fromState(st,actions)),[]);
  assert.deepEqual(moves(full(st,actions)).map(m=>m.id).sort(),[10,11,12,13,14,15]);
});

test('Cursed Catacombs is inexact while the deck has a card, exact on an empty deck', ()=>{
  const r=apply(full(state([CATACOMBS]),untargeted([CATACOMBS])),{kind:'play',id:10});
  assert.equal(r.exact,false);assert.equal(r.s.drawnUnknown,1);
  const e=apply(full(state([CATACOMBS],{deck:0}),untargeted([CATACOMBS])),{kind:'play',id:10});
  assert.equal(e.exact,true);
});

test('Platysaur lands as a body and stops the plan on its draw', ()=>{
  const r=apply(full(state([PLATYSAUR]),untargeted([PLATYSAUR])),{kind:'play',id:11});
  assert.equal(r.exact,false);
  assert.deepEqual(r.s.me.filter(b=>b.type==='MINION').map(b=>[b.id,b.atk,b.hp]),[[11,1,2]]);
});

test('Boneweb Egg is a plain 0/2 on play', ()=>{
  const r=apply(full(state([EGG]),untargeted([EGG])),{kind:'play',id:14});
  assert.equal(r.exact,true);
  assert.deepEqual(r.s.me.filter(b=>b.type==='MINION').map(b=>[b.id,b.atk,b.hp]),[[14,0,2]]);
});

test('a location takes a board slot when played and needs one free', ()=>{
  const s=full(state([CHAMBER]),untargeted([CHAMBER])),r=apply(s,{kind:'play',id:12});
  assert.equal(r.exact,true);assert.equal(r.s.locations,1);assert.equal(r.s.mana,7);
  assert.deepEqual(moves(r.s),[]);          // not ready the turn it lands
  const crowded=state([CHAMBER],{myBoard:[1,2,3,4,5,6,7].map(i=>MINION(20+i,1,1))});
  assert.deepEqual(moves(full(crowded,[])).filter(m=>m.id===12),[]);
});

test('activating Chamber of Viscidus is an inexact step that spends a use', ()=>{
  const st=state([GOLEM,EGG],{myBoard:[CHAMBER]});
  const s=full(st,[{entityId:12}]);
  assert.deepEqual(moves(s).filter(m=>m.kind==='use'),[{kind:'use',id:12}]);
  const r=apply(s,{kind:'use',id:12});
  assert.equal(r.exact,false);
  assert.equal(r.s.uncertainDiscard.length,2);assert.equal(r.s.drawnUnknown,2);
  assert.equal(r.s.sites[0].durability,1);assert.equal(r.s.sites[0].ready,false);
  assert.equal(s.sites[0].durability,2);    // the state it came from is untouched
  const last=apply(full(state([],{myBoard:[{...CHAMBER,DAMAGE:1}]}),[{entityId:12}]),{kind:'use',id:12});
  assert.equal(last.s.locations,0);assert.deepEqual(last.s.sites,[]);
  // a location the game does not offer (cooling down) is not a move
  assert.deepEqual(moves(full(st,[])).filter(m=>m.kind==='use'),[]);
});

test('Soulfire offers the game\'s targets and is exact only when the discard is forced', ()=>{
  const opp=[MINION(30,2,4),MINION(31,3,5)];
  const acts=[{entityId:13,targetId:2},{entityId:13,targetId:30},{entityId:13,targetId:31}];
  const alone=full(state([SOULFIRE],{oppBoard:opp}),acts);
  assert.deepEqual(moves(alone).map(m=>m.targetId),[2,30,31]);
  const kill=apply(alone,{kind:'play',id:13,targetId:30});
  assert.equal(kill.exact,true);assert.deepEqual(kill.s.opp.map(b=>b.id),[2,31]);
  const face=apply(alone,{kind:'play',id:13,targetId:2});
  assert.equal(hpOf(hero(face.s,'opp')),26);assert.equal(face.s.faceDealt,4);
  // one other card: it is the discard, and a Golem comes back as a body
  const one=apply(full(state([SOULFIRE,GOLEM],{oppBoard:opp}),acts),{kind:'play',id:13,targetId:31});
  assert.equal(one.exact,true);assert.deepEqual(one.s.hand,[]);
  assert.deepEqual(one.s.me.filter(b=>b.type==='MINION').map(b=>b.id),[16]);
  assert.equal(one.s.opp.find(b=>b.id===31).hp,1);
  const two=apply(full(state([SOULFIRE,GOLEM,EGG],{oppBoard:opp}),acts),{kind:'play',id:13,targetId:2});
  assert.equal(two.exact,false);assert.equal(two.s.uncertainDiscard.length,2);assert.equal(two.s.hand.length,2);
});

test('Soul Barrage is exact into an empty board, a floor on face damage otherwise', ()=>{
  const empty=apply(full(state([BARRAGE]),untargeted([BARRAGE])),{kind:'play',id:15});
  assert.equal(empty.exact,true);assert.equal(hpOf(hero(empty.s,'opp')),25);
  const st=state([BARRAGE],{oppBoard:[MINION(30,2,3)]});
  const r=apply(full(st,untargeted([BARRAGE])),{kind:'play',id:15});
  assert.equal(r.exact,false);assert.equal(hpOf(hero(r.s,'opp')),28);
  assert.equal(r.s.opp.find(b=>b.id===30).hp,3);
});
