import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,rushPolicy,winner} from '../src/selfplay.mjs';
import {vocabulary} from '../src/selfplay-encode.mjs';
import {lethalOnBoard} from '../src/selfplay-audit.mjs';
import {redeal,search,keepBestOrder} from '../src/selfplay-search.mjs';
import {Arena} from '../src/selfplay-env.mjs';

const LIST=loadList('warlock-discard'),LISTS=[LIST,LIST],VOCAB=vocabulary(LISTS);
// A game of the scripted player, stopped at the first state that passes `when`.
function reach(seed,when){
  const pick=rushPolicy(seed);
  let s=newGame({lists:LISTS,seed});
  for(let n=0;n<5000;n++){
    const legal=moves(s);
    if(!legal.length)return null;
    if(when(s,legal))return s;
    s=apply(s,pick(s,legal)).s;
  }
  return null;
}
// Run a look ahead with a value function of our own in place of the network.
function run(s,value,opts){
  const g=search(s,moves(s),VOCAB,opts);
  let r=g.next(),asked=0;
  while(!r.done){asked+=r.value.length;r=g.next(r.value.map(value))}
  return {scores:r.value,asked};
}
const names=cs=>cs.map(c=>c.name).sort();

test('redeal leaves all the acting seat can see and only moves the hidden cards about', ()=>{
  const s=reach(3,x=>x.turn>=7),t=redeal(s,11),u=redeal(s,12);
  assert.deepEqual(t.hand,s.hand);
  assert.deepEqual(t.me,s.me);
  assert.deepEqual(t.opp,s.opp);
  assert.deepEqual(moves(t),moves(s));
  assert.deepEqual(names(t.deck),names(s.deck));
  assert.equal(t.them.hand.length,s.them.hand.length);
  assert.equal(t.them.deck.length,s.them.deck.length);
  assert.deepEqual(names([...t.them.hand,...t.them.deck]),names([...s.them.hand,...s.them.deck]));
  assert.notDeepEqual(t.deck.map(c=>c.entityId),u.deck.map(c=>c.entityId));
  assert.notDeepEqual(t.them.deck.map(c=>c.entityId),u.them.deck.map(c=>c.entityId));
  // The Coin is no secret: whoever holds it keeps it.
  const coin=reach(5,x=>x.them.hand.some(c=>c.name==='The Coin'));
  assert.ok(redeal(coin,1).them.hand.some(c=>c.name==='The Coin'));
});

test('a look ahead with a blind value still finds the win that is on the board', ()=>{
  let found=0;
  for(let seed=1;seed<=40&&found<5;seed++){
    const s=reach(seed,(x,legal)=>lethalOnBoard(x,legal));
    if(!s)continue;
    found++;
    const legal=moves(s),before=JSON.stringify(s.hand),{scores}=run(s,()=>0,{samples:2,width:8,seed});
    assert.equal(scores.length,legal.length);
    assert.equal(Math.max(...scores),1,`seed ${seed}`);
    assert.ok(scores[legal.findIndex(m=>m.kind==='end')]<1);
    assert.equal(JSON.stringify(s.hand),before);
    // Following the best score step by step ends the game in this seat's favour within the turn.
    let t=s;
    for(let n=0;n<30&&winner(t)==null;n++)t=apply(t,moves(t)[run(t,()=>0,{samples:2,width:8,seed}).scores.indexOf(1)]).s;
    assert.equal(winner(t),s.seat,`seed ${seed}`);
  }
  assert.equal(found,5);
});

test('a look ahead asks nothing when there is one step, and more with a wider beam', ()=>{
  const lone=reach(2,(x,legal)=>legal.length===1);
  assert.deepEqual(run(lone,()=>0),{scores:[0],asked:0});
  const busy=reach(4,(x,legal)=>legal.length>=8);
  const narrow=run(busy,()=>0,{samples:1,width:2}),wide=run(busy,()=>0,{samples:1,width:16});
  assert.ok(narrow.asked>0&&wide.asked>narrow.asked,`${narrow.asked} and ${wide.asked}`);
  assert.deepEqual(run(busy,()=>0,{samples:1,width:2,seed:9}),run(busy,()=>0,{samples:1,width:2,seed:9}));
});

test('the arena runs a look ahead over several tables without moving their games', ()=>{
  const arena=new Arena({lists:LISTS,n:4,seed:1});
  for(let k=0;k<12;k++)arena.step(arena.tables.map(t=>Math.max(0,t.legal.length-2)));
  const before=JSON.stringify(arena.views());
  let r=arena.plan([0,2,3],{samples:2,width:4}),rounds=0;
  while(r.ask){
    assert.ok(r.ask.length>0&&r.ask.every(o=>o.length===arena.dims.obs));
    r=arena.answer(r.ask.map(()=>0));rounds++;
  }
  assert.ok(rounds>0);
  assert.deepEqual(r.scores.map(x=>x.length),[0,2,3].map(i=>arena.tables[i].legal.length));
  assert.equal(JSON.stringify(arena.views()),before);
  assert.throws(()=>arena.answer([0]),/no look ahead/);
  arena.plan([arena.tables.findIndex(t=>t.legal.length>1)]);
  assert.throws(()=>arena.answer([]),/values for/);
});

test('a value above one never outranks a win on the board', ()=>{
  const s=reach(1,(x,legal)=>lethalOnBoard(x,legal)),legal=moves(s);
  const {scores}=run(s,()=>-5,{samples:2,width:8});          // -5 for the other seat: every handed-over turn looks like +5
  assert.equal(Math.max(...scores),1);
  assert.ok(scores[legal.findIndex(m=>m.kind==='end')]<1);
});

test('forked games are played to a result for each step and leave the table where it was', ()=>{
  const arena=new Arena({lists:LISTS,n:2,seed:3});
  const t=arena.tables[0],was=JSON.stringify(t.s),n=t.legal.length;
  let r=arena.fork(0,{games:5,seed:9});
  assert.equal(r.envs.length,5*n);
  for(let i=0;i<5000&&r.envs.length;i++)r=arena.play(r.envs.map(e=>e.acts.length-1));
  assert.equal(r.tally.length,n);
  for(const row of r.tally)assert.equal(row[0]+row[1]+row[2],5);
  assert.equal(JSON.stringify(t.s),was);
  assert.throws(()=>arena.play([0]),/no forked games/);
  r=arena.fork(0,{steps:[n-1],games:3});
  assert.equal(r.envs.length,3);
  assert.throws(()=>arena.fork(0,{steps:[n]}),/no step/);
});

test('of lines that differ only in order, the one that leaves most on the board is kept', ()=>{
  const line=(order,board,v)=>({order,board,v});
  const swingFirst=line('a,b|x|3',4,.5),buffFirst=line('a,b|x|3',6,.2),level=line('a,b|x|3',6,.7);
  const otherHand=line('a,b|y|3',1,.9),won={v:1};                 // a game that is over has no order to compare
  const kept=keepBestOrder([swingFirst,buffFirst,level,otherHand,won]);
  assert.deepEqual(kept,[buffFirst,level,otherHand,won]);
  // What stays is worth no less than the line it replaced was guessed to be.
  assert.equal(buffFirst.v,.5);
  assert.equal(level.v,.7);
  const same=[line('a|x|3',2,.1),line('a|x|3',2,.3)];
  assert.equal(keepBestOrder(same),same);
});

test('the order rule changes no score where the value is blind, and can be switched off', ()=>{
  for(const seed of [4,6,8]){
    const s=reach(seed,(x,legal)=>x.turn>=6&&legal.length>=6);
    const on=run(s,()=>0,{samples:2,width:8,seed}),off=run(s,()=>0,{samples:2,width:8,seed,orders:false});
    assert.deepEqual(on.scores,off.scores,`seed ${seed}`);
  }
});
