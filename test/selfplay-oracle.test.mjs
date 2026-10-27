// The hidden cards of train/ppo.py --oracle: oracle() of src/selfplay-encode.mjs and the "oracle" flag of src/selfplay-env.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {vocabulary,encode,oracle,oracleSize} from '../src/selfplay-encode.mjs';
import {redeal} from '../src/selfplay-search.mjs';
import {Arena,packed} from '../src/selfplay-env.mjs';

const LISTS=['warlock-zoo','warlock-discard'].map(loadList),V=vocabulary(LISTS,undefined,{timers:true});
const sum=(o,b)=>o.slice(b*V.size,(b+1)*V.size).reduce((a,x)=>a+x,0);
const near=(a,b)=>Math.abs(a-b)<1e-9;

test('oracle() holds the other hand, the other deck and the next three cards of each deck', ()=>{
  for(let seed=1;seed<=5;seed++){
    const s=newGame({lists:LISTS,seed}),o=oracle(s,V);
    assert.equal(o.length,oracleSize(V));
    assert.ok(near(sum(o,0),.1*s.them.hand.length));
    assert.ok(near(sum(o,1),.1*s.them.deck.length));
    assert.ok(near(sum(o,2),1+1/2+1/3));
    assert.ok(near(sum(o,3),1+1/2+1/3));
    const top=s.them.deck[0].name;
    assert.ok(o[2*V.size+(V.index.get(top)??V.size-1)]>=1,top);
    const mine=s.deck[0].name;
    assert.ok(o[3*V.size+(V.index.get(mine)??V.size-1)]>=1,mine);
  }
});

test('a new deal of the hidden cards changes the oracle but not what the policy sees', ()=>{
  let changed=0;
  for(let seed=1;seed<=10;seed++){
    const s=newGame({lists:LISTS,seed}),t=redeal(s,seed*31+7);
    assert.deepEqual(encode(t,moves(t),V).obs,encode(s,moves(s),V).obs);
    changed+=oracle(t,V).join()!==oracle(s,V).join();
  }
  assert.ok(changed>=8,`${changed} of 10 deals moved the hidden cards`);
});

test('with "oracle" every view carries orc and "bin" sends it as orcBin; without it nothing changes', ()=>{
  const on=new Arena({lists:LISTS,n:4,seed:3,timers:true,oracle:true}),off=new Arena({lists:LISTS,n:4,seed:3,timers:true});
  assert.equal(on.dims.oracle,oracleSize(V));
  assert.equal('oracle' in off.dims,false);
  for(let k=0;k<30;k++){
    const a=on.views(),b=off.views();
    assert.deepEqual(a.map(({orc,...e})=>e),b);
    for(const e of a)assert.equal(e.orc.length,oracleSize(V));
    const p=packed({envs:a},on.dims,{raw:true}),q=packed({envs:b},off.dims,{raw:true});
    assert.equal(p.raw.orcBin,4*a.length*oracleSize(V));
    assert.deepEqual([...p.blocks.orcBin],a.flatMap(e=>e.orc).map(Math.fround));
    assert.deepEqual(p.envs,q.envs);
    assert.deepEqual([...p.blocks.obsBin],[...q.blocks.obsBin]);
    assert.equal('orcBin' in q.blocks,false);
    const acts=a.map(e=>(k*7+e.acts.length)%e.acts.length);
    on.step(acts);off.step(acts);
  }
});
