import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {moves} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';

const net=loadNet();
// Positions of self-play with the answers PyTorch gave to them (train/export.py).
const rows=JSON.parse(readFileSync(new URL('./fixtures/selfplay-net-v5.json',import.meta.url),'utf8'));

test('the network read in Node gives the answers PyTorch gave',()=>{
  assert.ok(rows.length>=10);
  for(const r of rows){
    const {logits,value}=net.forward(r.obs,r.acts);
    assert.equal(logits.length,r.logits.length);
    logits.forEach((x,i)=>assert.ok(Math.abs(x-r.logits[i])<1e-3,`logit ${x} for ${r.logits[i]}`));
    assert.ok(Math.abs(value-r.value)<1e-3,`value ${value} for ${r.value}`);
  }
});

test('a simulator state is ranked: one share for each legal step, best first',()=>{
  const lists=net.decks.map(loadList),s=newGame({lists,seed:3}),legal=moves(s);
  const {value,steps}=net.rank(s,legal);
  assert.equal(steps.length,legal.length);
  assert.ok(Math.abs(steps.reduce((n,x)=>n+x.p,0)-1)<1e-6);
  assert.ok(steps.every((x,i)=>!i||steps[i-1].logit>=x.logit));
  assert.ok(steps.every(x=>legal.includes(x.move)));
  assert.ok(Number.isFinite(value));
});
