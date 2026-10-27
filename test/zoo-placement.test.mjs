import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,body,handCard,adjacentSlot} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {plan} from '../src/execute.mjs';
import {contentBox,dropSlot} from '../src/layout.mjs';

// Kazakus' two effects happen together, and Vaultkeeper wants a neighbour on each side.
const DB=cardDb(),ZOO=loadList('warlock-zoo');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[],mana=10}={})=>{
  const s=newGame({lists:[ZOO,ZOO],seed:7});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:[],deck:[]}};
};
const play=(s,id)=>apply(s,{kind:'play',id}).s;
const end=s=>apply(s,{kind:'end'}).s;
const yetis=n=>Array.from({length:n},(_,i)=>C('CS2_182',80+i));
const still={canAttack:false,targets:new Set(),maxAttacks:1};
const own=(s,entityId)=>{s.me.push({...body(C('CS2_182',entityId),'me'),...still});return s};
const stats=bs=>bs.filter(b=>b.type==='MINION').map(b=>[b.name,b.atk,b.hp]);

test('Kazakus: Shiv also buffs what Criminal Contract summons, in either pick order',()=>{
  const cast=effects=>{
    const trial={...H('CAP_405tb1',60),trial:{turns:0,effects}};
    return play(table({hand:[trial,H('CS2_182',61)],deck:yetis(8)}),60);
  };
  const base=stats(cast(['CAP_405t6','CAP_405t8']).me);          // the same three, unbuffed
  assert.equal(base.length,3);
  for(const effects of [['CAP_405t5','CAP_405t6'],['CAP_405t6','CAP_405t5']]){
    const s=cast(effects);
    assert.deepEqual(stats(s.me),base.map(([n,a,h])=>[n,a+3,h+3]),effects.join());
    assert.deepEqual(s.hand.map(c=>[c.atk,c.hp]),[[7,8]],'the hand minion is buffed once');
  }
});

test('Kazakus: Shiv as the first pick still buffs the minions on the board and in hand',()=>{
  const trial={...H('CAP_405tb1',60),trial:{turns:0,effects:['CAP_405t5','CAP_405t8']}};
  const s=own(table({hand:[trial,H('CS2_182',61)],deck:yetis(8)}),90);
  const after=play(s,60);
  assert.deepEqual(stats(after.me),[['Chillwind Yeti',7,8]]);
  assert.deepEqual(after.hand.map(c=>[c.atk,c.hp]),[[7,8]]);
});

test('adjacentSlot: the middle with two or more minions, the right end otherwise',()=>{
  const vault=DB.BE_151.text;
  assert.deepEqual([0,1,2,3,4,5,6].map(n=>adjacentSlot(vault,n)),[0,1,1,1,2,2,3]);
  assert.equal(adjacentSlot(DB.CS2_182.text,4),4);
  assert.equal(adjacentSlot('',3),3);
});

test('Vaultkeeper goes in the middle and its Battlecry grows both neighbours',()=>{
  let s=table({hand:[H('BE_151',50)],deck:yetis(8)});
  for(const id of [90,91,92])own(s,id);
  s=play(s,50);
  assert.deepEqual(stats(s.me).map(m=>m[0]),['Chillwind Yeti','Vaultkeeper','Chillwind Yeti','Chillwind Yeti']);
  assert.deepEqual(stats(s.me).map(m=>m.slice(1)).filter((_,i)=>i!==1),[[6,7],[6,7],[4,5]]);
});

test('Vaultkeeper with one minion on the board stays on the right and grows that one',()=>{
  let s=table({hand:[H('BE_151',50)],deck:yetis(8)});
  own(s,90);
  s=play(s,50);
  assert.deepEqual(stats(s.me).map(m=>m[0]),['Chillwind Yeti','Vaultkeeper']);
  assert.deepEqual(stats(s.me)[0].slice(1),[6,7]);
});

test('Vaultkeeper in the middle: its Deathrattle grows the minions that stood on both sides',()=>{
  let s=table({hand:[H('BE_151',50)],deck:yetis(8)});
  for(const id of [90,91,92])own(s,id);
  s=play(s,50);
  const keeper=s.me.find(b=>b.name==='Vaultkeeper');
  keeper.hp=0;
  s=end(s);
  assert.deepEqual(stats(s.opp),[['Chillwind Yeti',8,9],['Chillwind Yeti',8,9],['Chillwind Yeti',4,5]]);
});

test('execute: Vaultkeeper is dropped between the minions, anything else on the right',()=>{
  const box=contentBox(2560,1440);
  const board=n=>Array.from({length:n},(_,i)=>({entityId:20+i,CARDTYPE:'MINION',name:'Yeti'}));
  const hand=[{entityId:5,CARDTYPE:'MINION',name:'Vaultkeeper',text:DB.BE_151.text},{entityId:6,CARDTYPE:'MINION',name:'Yeti',text:''}];
  const stateOf=n=>({me:{hand,board:[{entityId:1,CARDTYPE:'HERO'},...board(n)]},opponent:{board:[{entityId:2,CARDTYPE:'HERO'}]}});
  const drop=(n,id)=>plan(box,stateOf(n),{type:'POWER',entityId:id}).at(-1);
  const want=(slot,n)=>dropSlot(box,slot,n);
  assert.equal(drop(3,5).what,'drop into slot 2');
  assert.equal(Math.round(drop(3,5).x),Math.round(want(1,3).x));
  assert.equal(Math.round(drop(4,5).x),Math.round(want(2,4).x));
  assert.equal(Math.round(drop(1,5).x),Math.round(want(1,1).x));
  assert.equal(drop(0,5).what,'drop into slot 1');
  assert.equal(drop(3,6).what,'drop into slot 4');
  assert.equal(Math.round(drop(3,6).x),Math.round(want(3,3).x));
});
