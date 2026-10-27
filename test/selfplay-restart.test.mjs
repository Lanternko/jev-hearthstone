import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {touchesDelayed} from '../src/selfplay-rollout.mjs';
import {RestartPool,seedPool,copyState,unit} from '../src/selfplay-restart.mjs';
import {Arena} from '../src/selfplay-env.mjs';

const V5='models/selfplay/warlock-zoo-v5.json';
const lists=[loadList('warlock-zoo'),loadList('warlock-discard')];
const names=cs=>cs.map(c=>c.name).join();
const hidden=s=>`${names(s.them.hand)}|${names(s.them.deck)}|${names(s.deck)}`;

// The first positions of a zoo game, played by the last step each time, with a delayed step to move (late) or without.
function positions(){
  const out={late:null,plain:null};
  for(let seed=1;seed<40&&!(out.late&&out.plain);seed++){
    let s=newGame({lists:[lists[0],lists[0]],seed});
    for(let n=0;n<400&&!(out.late&&out.plain);n++){
      const legal=moves(s);
      if(!legal.length)break;
      const k=touchesDelayed(s,legal)?'late':'plain';
      out[k]??={s,legal};
      s=apply(s,legal[(n*7)%legal.length]).s;
    }
  }
  return out;
}
const {late,plain}=positions();

test('the pool takes only positions with a step whose effect comes later',()=>{
  assert.ok(late&&plain,'the sample games have both kinds of positions');
  const pool=new RestartPool({cap:10});
  assert.equal(pool.add(plain.s,plain.legal,[0,0]),false);
  assert.equal(pool.size,0);
  assert.equal(pool.add(late.s,late.legal,[0,0]),true);
  assert.equal(pool.add(late.s,late.legal,[0,0],{fixed:true}),true);
  assert.equal(pool.size,2);
});

test('the ring forgets its oldest position, the seeded ones stay',()=>{
  const pool=new RestartPool({cap:2});
  pool.add(late.s,late.legal,[0,0],{fixed:true});
  for(let i=0;i<5;i++)pool.add({...late.s,turn:100+i},late.legal,[0,0]);
  assert.equal(pool.fixed.length,1);
  assert.equal(pool.ring.length,2);
  assert.deepEqual(pool.ring.map(e=>e.s.turn).sort(),[103,104]);
});

test('a restart is a copy: changing it, or the position it came from, leaves the pool alone',()=>{
  const s=copyState(late.s),pool=new RestartPool();
  pool.add(s,late.legal,[0,0]);
  const a=pool.pick(0,5);
  a.s.hand.push({id:-99,name:'Intruder'});
  a.s.me[0].hp=1;a.s.mana=-7;a.s.them.hand.length=0;
  s.hand.length=0;s.me[0].hp=2;                                // the position given to add changes as well
  const b=pool.pick(0,5);
  assert.equal(b.s.hand.length,late.s.hand.length);
  assert.equal(b.s.me[0].hp,late.s.me[0].hp);
  assert.equal(b.s.mana,late.s.mana);
  assert.equal(b.s.them.hand.length,late.s.them.hand.length);
  assert.notEqual(a.s.me,b.s.me);
  assert.equal(a.s.game,b.s.game,'the card tables of the game are shared, not copied');
});

test('a restart deals the hidden cards afresh and keeps what the side to move can see',()=>{
  const pool=new RestartPool();
  pool.add(late.s,late.legal,[0,1]);
  const seen=new Set();
  for(let seed=1;seed<=6;seed++){
    const {s,seats}=pool.pick(0.5,seed);
    assert.deepEqual(seats,[0,1]);
    assert.equal(names(s.hand),names(late.s.hand));
    assert.deepEqual(s.me.map(b=>[b.id,b.hp,b.atk]),late.s.me.map(b=>[b.id,b.hp,b.atk]));
    assert.deepEqual(s.opp.map(b=>[b.id,b.hp,b.atk]),late.s.opp.map(b=>[b.id,b.hp,b.atk]));
    assert.equal(s.mana,late.s.mana);
    assert.equal(s.seat,late.s.seat);
    assert.equal(s.them.hand.length,late.s.them.hand.length);
    assert.equal(s.deck.length,late.s.deck.length);
    assert.equal(s.them.deck.length,late.s.them.deck.length);
    seen.add(hidden(s));
  }
  assert.ok(seen.size>1,'different seeds give different hidden cards');
  assert.ok(![...seen].every(h=>h===hidden(late.s)),'and they are not those of the stored position');
  assert.equal(unit(3,1)===unit(3,1),true);
});

test('seeded positions all have a delayed step, and a game from one reaches a winner',()=>{
  const arena=new Arena({lists,n:3,seed:11,timers:true,restart:{frac:1,cap:20}});
  const {seeded}=arena.seed({net:V5,limit:8,seed:3});
  assert.equal(seeded,8);
  assert.equal(arena.restart.pool.fixed.length,8);
  assert.ok(arena.restart.pool.fixed.every(e=>{const s=copyState(e.s);return touchesDelayed(s,moves(s))}));
  // frac 1: every game dealt now begins from the pool
  arena.tables.forEach(t=>arena.deal(t));
  assert.ok(arena.tables.every(t=>t.restarted));
  let x=12345;
  const rnd=n=>{x=Math.imul(x,1103515245)+12345>>>0;return (x>>>8)%n};
  const ended=[];
  for(let n=0;n<4000&&ended.length<3;n++){
    const out=arena.step(arena.tables.map(t=>rnd(t.legal.length)));
    out.forEach(v=>{if(v.ended)ended.push(v.ended)});
  }
  assert.ok(ended.length>=3);
  assert.ok(ended.every(e=>e.restart===true&&(e.winner===0||e.winner===1||e.winner==='draw')));
  assert.ok(ended.some(e=>e.winner===0||e.winner===1),'at least one game has a winner');
});

test('without restart nothing is marked, and the ring takes the positions of the games',()=>{
  const plainArena=new Arena({lists,n:2,seed:1});
  assert.equal(plainArena.restart,null);
  const arena=new Arena({lists:[lists[0],lists[0]],n:4,seed:5,restart:{frac:0,cap:50}});
  let x=99;
  const rnd=n=>{x=Math.imul(x,1103515245)+12345>>>0;return (x>>>8)%n};
  for(let n=0;n<600;n++)arena.step(arena.tables.map(t=>rnd(t.legal.length)));
  assert.ok(arena.restart.pool.ring.length>0,'a game passed through a delayed position');
  assert.ok(arena.restart.pool.ring.every(e=>{const s=copyState(e.s);return touchesDelayed(s,moves(s))}));
});
