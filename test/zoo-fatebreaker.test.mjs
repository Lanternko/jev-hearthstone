import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,hero,hpOf,handCard,body,gameModel} from '../src/sim.mjs';
import {textOf} from '../src/mechanics.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// Fatebreaker (TIME_028, 2026-10-25): Lifesteal; Battlecry: cast a Shred of Time from your deck to gain +3/+3.
const DB=cardDb(),ZOO=loadList('warlock-zoo');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const table=({hand=[],deck=[]}={})=>{
  const s=newGame({lists:[ZOO,ZOO],seed:7});
  return {...s,mana:10,crystals:10,hand,deck,them:{...s.them,hand:[],deck:[]}};
};
const play=(s,id)=>apply(s,{kind:'play',id}).s;
const fate=s=>s.me.find(b=>b.name==='Fatebreaker');
const yetis=n=>Array.from({length:n},(_,i)=>C('CS2_182',80+i));

test('the zoo list has Fatebreaker and no Darkest Depths',()=>{
  assert.equal(ZOO.cards.TIME_028,1);
  assert.equal(ZOO.cards.BE_087,undefined);
  assert.deepEqual(gameModel({type:'MINION',text:textOf({text:DB.TIME_028.text})}),{kind:'minion',fatebreaker:true});
});

test('with a Shred in the deck: the Shred is cast (3 to our hero) and Fatebreaker is a 7/7',()=>{
  const s=play(table({hand:[handCard(C('TIME_028',50),true)],deck:[...yetis(3),C('TIME_025t',60)]}),50);
  assert.deepEqual([fate(s).atk,fate(s).hp,fate(s).maxHp],[7,7,7]);
  assert.equal(s.deck.filter(d=>d.name==='Shred of Time').length,0);
  assert.equal(s.deck.length,3);
  assert.equal(hpOf(hero(s,'me')),27);
  assert.equal(s.me.filter(b=>b.name==='Fatebreaker').length,1);
});

test('without a Shred: a 4/4 and no damage',()=>{
  const s=play(table({hand:[handCard(C('TIME_028',50),true)],deck:yetis(3)}),50);
  assert.deepEqual([fate(s).atk,fate(s).hp],[4,4]);
  assert.equal(hpOf(hero(s,'me')),30);
});

test('Lifesteal: an attack heals our hero',()=>{
  let s=play(table({hand:[handCard(C('TIME_028',50),true)],deck:yetis(3)}),50);
  assert.equal(fate(s).lifesteal,true);
  const h=hero(s,'me');h.hp=20;
  const f=fate(s);f.canAttack=true;f.targets=new Set([hero(s,'opp').id]);
  s=apply(s,{kind:'attack',id:f.id,targetId:hero(s,'opp').id}).s;
  assert.equal(hpOf(hero(s,'me')),24);
  assert.equal(hpOf(hero(s,'opp')),26);
});
