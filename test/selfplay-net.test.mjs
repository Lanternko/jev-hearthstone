import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {moves} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {loadNet,MODEL} from '../src/selfplay-net.mjs';

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

test('a network with valueSquash "tanh" gives tanh of its value head, steps unchanged',()=>{
  const dir=mkdtempSync(join(tmpdir(),'squash-'));
  const doc=JSON.parse(readFileSync(MODEL,'utf8'));
  writeFileSync(join(dir,'net.json'),JSON.stringify({...doc,valueSquash:'tanh'}));
  const tanh=loadNet(join(dir,'net.json'));
  for(const r of rows.slice(0,4)){
    const a=net.forward(r.obs,r.acts),b=tanh.forward(r.obs,r.acts);
    assert.deepEqual(b.logits,a.logits);
    assert.ok(Math.abs(b.value-Math.tanh(a.value))<1e-12);
    assert.ok(Math.abs(tanh.value(r.obs)-Math.tanh(net.value(r.obs)))<1e-12);
  }
  rmSync(dir,{recursive:true});
});
