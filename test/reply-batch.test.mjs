import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,rushPolicy,winner} from '../src/selfplay.mjs';
import {vocabulary,encode} from '../src/selfplay-encode.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {search,replies,replyLines} from '../src/selfplay-search.mjs';
import {Arena} from '../src/selfplay-env.mjs';

// The replies of a look ahead of two turns, batched (replyLines) and, with replyRemote, run by the
// caller (train/ppo.py --reply-gpu): the same lines as one at a time with the network in node.
const NET_FILE='models/selfplay/warlock-discard-v5.json',NET=loadNet(NET_FILE);
const LIST=loadList('warlock-discard'),LISTS=[LIST,LIST],VOCAB=vocabulary(LISTS);
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
const hashed=obs=>{let h=0;for(let i=0;i<obs.length;i++)h=Math.imul(h^Math.round(obs[i]*1000),16777619);return (h>>>0)/2**32*1.6-.8};
// The caller's side of replyRemote: the logits of each asked position, by the same network.
const logitsOf=pol=>pol.map(({obs,acts})=>NET.forward(obs,acts).logits);

// replies as it was before the batching: one line after another.
function oneByOne(t,net,k,cap=40){
  const pick=(s,legal)=>{
    if(legal.length<2)return [0];
    const {obs,acts}=encode(s,legal,net.vocab),{logits}=net.forward(obs,acts);
    return logits.map((x,i)=>[x,i]).sort((x,y)=>y[0]-x[0]).map(([,i])=>i);
  };
  const seat=t.seat,first=moves(t),out=[];
  for(const i of pick(t,first).slice(0,k)){
    let s=apply(t,first[i]).s;
    for(let n=1;n<cap&&s.seat===seat&&winner(s)==null;n++){
      const legal=moves(s);
      if(!legal.length)break;
      s=apply(s,legal[pick(s,legal)[0]]).s;
    }
    out.push(s);
  }
  return out;
}
// Positions where the other side is to play: our turn handed over at several points of several games.
function handed(){
  const out=[];
  for(let seed=1;out.length<12&&seed<40;seed++){
    const s=reach(seed,(x,legal)=>x.turn>=3+seed%6&&legal.some(m=>m.kind==='end'));
    if(s)out.push(apply(s,moves(s).find(m=>m.kind==='end')).s);
  }
  return out;
}
const same=(a,b)=>assert.deepEqual(a.map(x=>x.map(s=>JSON.stringify(s))),b.map(x=>x.map(s=>JSON.stringify(s))));

test('batched replies end where the replies of one line after another end, in node and asked of the caller', ()=>{
  const ts=handed();
  assert.ok(ts.length>=8);
  for(const k of [1,2,3]){
    const want=ts.map(t=>oneByOne(t,NET,k));
    same(ts.map(t=>replies(t,NET,k)),want);
    same(replyLines(ts,NET,k).next().value,want);
    const g=replyLines(ts,NET,k,40,true);
    let r=g.next(),rounds=0;
    while(!r.done){assert.ok(r.value.policy.length);rounds++;r=g.next(logitsOf(r.value.policy))}
    assert.ok(rounds>1);
    same(r.value,want);
  }
});

test('a look ahead of two turns scores the same with the reply network run by the caller', ()=>{
  let checked=0;
  for(let seed=3;seed<=30&&checked<4;seed++){
    const s=reach(seed,(x,legal)=>x.turn>=4&&legal.length>=6);
    if(!s)continue;
    const opts={samples:2,width:4,seed,turns:2,expand:2,replies:2,reply:NET},play=remote=>{
      const g=search(s,moves(s),VOCAB,{...opts,replyRemote:remote});
      let r=g.next(),pol=0;
      while(!r.done){
        if(r.value.policy){pol+=r.value.policy.length;r=g.next(logitsOf(r.value.policy))}
        else r=g.next(r.value.map(hashed));
      }
      return {scores:r.value,pol};
    };
    const here=play(false),there=play(true);
    assert.equal(here.pol,0);
    assert.ok(there.pol>0);
    assert.deepEqual(there.scores,here.scores);
    checked++;
  }
  assert.equal(checked,4);
});

test('the arena asks for the reply network\'s logits as "pol" beside the values, and scores as without', ()=>{
  const arena=new Arena({lists:LISTS,n:4,seed:4});
  for(let k=0;k<20;k++)arena.step(arena.tables.map(t=>Math.max(0,t.legal.length-2)));
  const tables=[0,1,2,3].filter(i=>arena.tables[i].legal.length>1),play=remote=>{
    let r=arena.plan(tables,{samples:2,width:4,turns:2,reply:NET_FILE,replyRemote:remote}),pol=0;
    while(r.ask){
      const lg=(r.pol??[]).flatMap(({obs,acts})=>NET.forward(obs,acts).logits);
      pol+=r.pol?.length??0;
      r=arena.answer(r.ask.map(hashed),lg);
    }
    return {scores:r.scores,pol};
  };
  assert.ok(tables.length>=2);
  const here=play(false),there=play(true);
  assert.equal(here.pol,0);
  assert.ok(there.pol>0);
  assert.deepEqual(there.scores,here.scores);
  assert.throws(()=>{arena.plan(tables,{samples:1,width:4,turns:2,reply:NET_FILE,replyRemote:true});let r=arena.plan(tables,{samples:1,width:4,turns:2,reply:NET_FILE,replyRemote:true});while(r.ask&&!r.pol)r=arena.answer(r.ask.map(hashed));arena.answer(r.ask.map(hashed),[])},/logits/);
});
