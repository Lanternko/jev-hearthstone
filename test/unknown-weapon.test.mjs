import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {dealCards} from '../src/opponent-hand.mjs';

// E-301 (2026-10-31): a weapon whose text the simulator does not know is still a weapon of known Attack and
// Durability. It used to be unplayable (and the opponent's dealt weapons became spells that did nothing).
const DB=cardDb(),ZOO=loadList('warlock-zoo');
const table=hand=>{
  const s=newGame({lists:[ZOO,ZOO],seed:7});
  return {...s,mana:10,crystals:10,hand,me:s.me.filter(b=>b.type!=='MINION'),opp:s.opp.filter(b=>b.type!=='MINION'),them:{...s.them,hand:[],deck:[]}};
};

test('an unknown weapon is equipped by its stats and wears down as the hero swings', ()=>{
  let s=table([handCard(rawCard(DB.CATA_467,50),true)]);                // Command Claw 2/2, text not modelled
  const play=moves(s).find(m=>m.kind==='play'&&m.id===50);
  assert.ok(play,'the weapon can be played');
  s=apply(s,play).s;
  assert.deepEqual([s.weapon.atk,s.weapon.durability,hero(s,'me').atk],[2,2,2]);
  const face=hero(s,'opp'),hp=face.hp;
  s=apply(s,moves(s).find(m=>m.kind==='attack'&&m.id===hero(s,'me').id&&m.targetId===face.id)).s;
  assert.equal(hero(s,'opp').hp,hp-2);
  assert.equal(s.weapon.durability,1);
});

test('a weapon dealt to the opponent stays a weapon', ()=>{
  const [c]=dealCards({pool:[{id:'TLC_EVENT_402',w:1}],n:1,seed:1,base:700000});  // Staff of the Endbringer 1/6
  assert.equal(c.CARDTYPE??c.type,'WEAPON');
  assert.deepEqual([c.ATK,c.HEALTH],[1,6]);
});
