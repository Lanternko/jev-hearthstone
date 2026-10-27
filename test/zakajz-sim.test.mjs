import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,moves,hero,handCard,costOf,gameModel} from '../src/sim.mjs';
import {textOf} from '../src/mechanics.mjs';
import {newGame,loadList,cardDb,rawCard,playout,randomPolicy} from '../src/selfplay.mjs';

// Zakajz the Corruptor (BE_728): Battlecry: Reduce the Cost of minions in your hand and deck by (1)
// and increase the Cost of spells by (1). The warlock-zakajz list swaps Fatebreaker for it.
const DB=cardDb(),ZAK=loadList('warlock-zakajz'),DH=loadList('dh-cthun');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[]}={})=>{
  const s=newGame({lists:[ZAK,ZAK],seed:7});
  return {...s,mana:10,crystals:10,hand,deck,them:{...s.them,hand:[],deck:[]}};
};
const play=(s,id,targetId)=>apply(s,{kind:'play',id,...(targetId!=null?{targetId}:{})}).s;
const named=(cs,name)=>cs.find(c=>c.name===name);
const foe=(s,over={})=>({...hero(s,'opp'),id:-9,type:'MINION',name:'Boar',atk:1,hp:5,maxHp:5,armor:0,taunt:false,
  stealth:false,frozen:false,canAttack:false,attacks:0,maxAttacks:1,side:'opp',...over});

test('the list is thirty cards with Zakajz in place of Fatebreaker', ()=>{
  assert.equal(Object.values(ZAK.cards).reduce((a,b)=>a+b,0),30);
  assert.equal(ZAK.cards.BE_728,1);
  assert.equal(ZAK.cards.TIME_028,undefined);
  assert.equal(ZAK.cards.CORE_UNG_205,2);
  assert.deepEqual(gameModel({type:'MINION',text:textOf({text:DB.BE_728.text})}),{kind:'minion',zakajz:{down:1,up:1}});
});

test('Zakajz: minions in hand and deck cost 1 less, spells 1 more, and a 0-cost minion stays 0', ()=>{
  const s=play(table({
    hand:[H('BE_728',50),H('TLC_603',51),H('CORE_UNG_205',52),H('CS2_231',53),H('TIME_026',54),H('TLC_451',55)],
    deck:[C('BE_729',60),C('TIME_026',61),C('CS2_231',62)],
  }),50);
  const zak=s.me.find(b=>b.name==='Zakajz the Corruptor');
  assert.deepEqual([zak.atk,zak.hp],[5,5]);
  assert.equal(named(s.hand,'Platysaur').cost,0);
  assert.equal(named(s.hand,'Glacial Shard').cost,0);
  assert.equal(named(s.hand,'Wisp').cost,0);
  assert.equal(named(s.hand,'Entropic Continuity').cost,2);
  assert.equal(named(s.hand,'Cursed Catacombs').cost,1);
  assert.equal(costOf(s,named(s.hand,'Entropic Continuity')),2);
  // The raw card carries the new printed cost too, so a later replay reads the same number.
  assert.equal(named(s.hand,'Platysaur').raw.COST,0);
  assert.equal(named(s.hand,'Entropic Continuity').raw.COST,2);
  const deck=n=>s.deck.find(c=>c.name===n);
  assert.equal(deck('Mawman Cultist').COST,2);
  assert.equal(deck('Entropic Continuity').COST,2);
  assert.equal(deck('Wisp').COST,0);
});

test('Glacial Shard in a warlock list freezes an enemy minion', ()=>{
  let s=table({hand:[H('CORE_UNG_205',50)]});
  s={...s,opp:[...s.opp,foe(s,{atk:3})]};
  assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50&&m.targetId===-9));
  s=play(s,50,-9);
  assert.ok(s.opp.find(b=>b.name==='Boar').frozen);
});

test('warlock-zakajz versus dh-cthun: a random game runs to a result', ()=>{
  for(const seed of [1,2]){
    const r=playout(newGame({lists:[ZAK,DH],seed}),randomPolicy(seed));
    assert.ok(r.winner!=null,`seed ${seed} finished`);
    assert.ok(r.steps<5000);
  }
});
