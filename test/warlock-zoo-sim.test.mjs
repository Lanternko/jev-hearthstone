import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,hpOf,handCard,body,costOf,drawCards} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// Self-play models for the warlock-zoo cards (docs/warlock-zoo-sim-coverage.md).
const DB=cardDb(),ZOO=loadList('warlock-zoo');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[],oppHand=[],oppDeck=[],mana=10}={})=>{
  const s=newGame({lists:[ZOO,ZOO],seed:7});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:oppHand,deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const end=s=>step(s,{kind:'end'});
const minions=bs=>bs.filter(b=>b.type==='MINION').map(b=>[b.name,b.atk,b.hp]);
const yetis=n=>Array.from({length:n},(_,i)=>C('CS2_182',80+i));
const shreds=s=>s.deck.filter(d=>d.name==='Shred of Time').length;
const canPlay=(s,id)=>moves(s).some(m=>m.kind==='play'&&m.id===id);
const enemy=(s,id,entityId)=>{const b=body(C(id,entityId),'opp');s.opp.push({...b,canAttack:false,targets:new Set(),maxAttacks:1});return s};

// Floating Lessons needs a minion to aim at, so every card gets one on our side.
test('every warlock-zoo card is a step at ten mana', ()=>{
  for(const id of Object.keys(ZOO.cards)){
    const s=table({hand:[H(id,50)],deck:yetis(5)});
    s.me.push({...body(C('CS2_182',90),'me'),canAttack:false,targets:new Set(),maxAttacks:1});
    assert.equal(canPlay(s,50),true,DB[id].name);
  }
});

test('Twilight Timehopper: a 4/4 and two Shreds of Time in the deck', ()=>{
  const s=play(table({hand:[H('TIME_025',50)],deck:yetis(5)}),50);
  assert.deepEqual(minions(s.me),[['Twilight Timehopper',4,4]]);
  assert.deepEqual([s.deck.length,shreds(s)],[7,2]);
  assert.equal(s.mana,8);
});

test('Tachyon Barrage: six to an empty board\'s hero, then two Shreds', ()=>{
  const s=play(table({hand:[H('TIME_027',50)],deck:yetis(3)}),50);
  assert.equal(hpOf(hero(s,'opp')),24);
  assert.deepEqual([s.deck.length,shreds(s)],[5,2]);
});

test('a drawn Shred casts: three to the own hero, and the draw goes on', ()=>{
  const s=table({deck:[C('TIME_025t',60),C('CS2_182',61)]});
  const got=drawCards(s,1);
  assert.equal(hpOf(hero(s,'me')),27);
  assert.deepEqual([got.length,s.hand.map(c=>c.name),s.deck.length],[1,['Chillwind Yeti'],0]);
});

test('Cult Neophyte: the opponent\'s spells cost one more on their next turn only', ()=>{
  let s=play(table({hand:[H('CORE_SCH_713',50)],deck:yetis(5),oppHand:[H('BE_086',70)],oppDeck:yetis(5)}),50);
  assert.deepEqual(minions(s.me),[['Cult Neophyte',3,2]]);
  s=end(s);
  const blas=s.hand.find(c=>c.id===70);
  assert.equal(costOf(s,blas),5);
  assert.equal(canPlay({...s,mana:4},70),false);
  assert.equal(canPlay({...s,mana:5},70),true);
  s=end(s);
  assert.equal(s.them.spellTax,0);
});

test('Mawman Cultist: every spell costs one more while it lives, on either side', ()=>{
  let s=play(table({hand:[H('BE_729',50),H('TIME_027',51)],deck:yetis(5)}),50);
  const barrage=s.hand.find(c=>c.id===51);
  assert.equal(costOf(s,barrage),3);
  assert.equal(canPlay({...s,mana:2},51),false);
  assert.equal(canPlay({...s,mana:3},51),true);
  assert.equal(play(s,51).mana,10-3-3);
  s=end(table({hand:[H('BE_729',50)],deck:yetis(5),oppHand:[H('TIME_027',70)],oppDeck:yetis(5)}));
  s=end(s);s=play({...s,mana:10},50);s=end(s);
  assert.equal(costOf(s,s.hand.find(c=>c.id===70)),3);
});

test('Vaultkeeper: +2/+2 to its left neighbour on play, to both neighbours on death', ()=>{
  let s=table({hand:[H('CS2_182',50),H('BE_151',51),H('CS2_182',52)],deck:yetis(5),mana:20});
  s=play(s,50);s=play(s,51);
  assert.deepEqual(minions(s.me),[['Chillwind Yeti',6,7],['Vaultkeeper',3,3]]);
  s=play(s,52);
  s.me.find(b=>b.id===51).hp=0;
  s=end(s);
  assert.deepEqual(minions(s.opp),[['Chillwind Yeti',8,9],['Chillwind Yeti',6,7]]);
});

test('Twilight Egg: a 0/2 that leaves a 2/1 Accelerated Whelp', ()=>{
  let s=play(table({hand:[H('CATA_210',50)],deck:yetis(5)}),50);
  assert.deepEqual(minions(s.me),[['Twilight Egg',0,2]]);
  s.me.find(b=>b.id===50).hp=0;
  s=end(s);
  assert.deepEqual(minions(s.opp),[['Accelerated Whelp',2,1]]);
});

test('Darkest Depths: two 0/3 Taunts', ()=>{
  const s=play(table({hand:[H('BE_087',50)],deck:yetis(5)}),50);
  assert.deepEqual(minions(s.me),[['Depthguard',0,3],['Depthguard',0,3]]);
  assert.ok(s.me.filter(b=>b.type==='MINION').every(b=>b.taunt));
  assert.equal(s.mana,8);
});

test('Blasphemy: two to every enemy, twice when it is the dearest card left', ()=>{
  let s=enemy(table({hand:[H('BE_086',50),H('TIME_027',51)],deck:yetis(5)}),'CS2_182',90);
  s=play(s,50);
  assert.deepEqual([hpOf(hero(s,'opp')),minions(s.opp)],[26,[['Chillwind Yeti',4,1]]]);
  s=enemy(table({hand:[H('BE_086',50),H('BE_151',51)],deck:yetis(5)}),'CS2_182',90);
  s=play(s,50);
  assert.deepEqual([hpOf(hero(s,'opp')),minions(s.opp)],[28,[['Chillwind Yeti',4,3]]]);
});

test('Ruinous Velocidrake: a Shred from the deck makes a second Rush copy', ()=>{
  let s=play(table({hand:[H('TIME_029',50)],deck:[...yetis(3),C('TIME_025t',60)]}),50);
  assert.deepEqual(minions(s.me),[['Ruinous Velocidrake',5,5],['Ruinous Velocidrake',5,5]]);
  assert.deepEqual([hpOf(hero(s,'me')),s.deck.length,shreds(s)],[27,3,0]);
  s=play(table({hand:[H('TIME_029',50)],deck:yetis(3)}),50);
  assert.deepEqual([minions(s.me).length,hpOf(hero(s,'me'))],[1,30]);
});
