import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {encode} from '../src/selfplay-encode.mjs';
import {loadNet} from '../src/selfplay-net.mjs';

// E-272 (revised 2026-10-29): warlock-zoo-0.1.1+E272 is zoo-v9 with only the value head refitted to the results of its own
// games. Every other tensor must be the v9 one, so the policy (the logits of every step) is the same bit for bit.
const OLD='models/selfplay/warlock-zoo-v9.json',NEW='models/selfplay/warlock-zoo-0.1.1+E272.json';
const GOLDEN=JSON.parse(readFileSync(new URL('./fixtures/zoo-v9-logits.json',import.meta.url),'utf8'));
const doc=p=>JSON.parse(readFileSync(p,'utf8'));

test('E-272: only value.* tensors differ from zoo-v9, and the file says which simulator made the data', ()=>{
  const a=doc(OLD),b=doc(NEW);
  assert.deepEqual(Object.keys(b.tensors).sort(),Object.keys(a.tensors).sort());
  const changed=[];
  for(const k of Object.keys(a.tensors))if(JSON.stringify(a.tensors[k])!==JSON.stringify(b.tensors[k]))changed.push(k);
  assert.deepEqual(changed.sort(),['value.0.bias','value.0.weight','value.2.bias','value.2.weight']);
  for(const k of ['obs','act','width','names','decks','iters'])assert.deepEqual(b[k],a[k],`header field ${k}`);
  for(const k of ['timers','extra','stages','imbue','pile'])assert.equal(!!b[k],!!a[k],`vocabulary flag ${k}`);  // loadNet reads them with !!
  assert.equal(typeof b.sim,'string');
  assert.ok(b.sim.length>0);
});

test('E-272: on the zoo-v9-logits fixture game the logits are bit-identical to zoo-v9 and the values differ', ()=>{
  const old=loadNet(OLD),neu=loadNet(NEW);
  const lists=[loadList('warlock-zoo'),loadList('priest-egg')];
  const priest=loadNet('models/selfplay/priest-egg-pilot-v2-20261027.json');
  let steps=0,valueDiffers=0;
  for(const order of [[old,priest],[priest,old]]){
    let s=newGame({lists:[lists[1],lists[0]],seed:11});
    for(let n=0;n<200&&moves(s).length;n++){
      const legal=moves(s),mine=order[s.seat===0?0:1],{obs,acts}=encode(s,legal,old.vocab);
      const a=old.forward(obs,acts),b=neu.forward(obs,acts);
      assert.equal(a.logits.length,b.logits.length);
      for(let i=0;i<a.logits.length;i++)assert.ok(Object.is(a.logits[i],b.logits[i]),`step ${steps} logit ${i}: ${a.logits[i]} vs ${b.logits[i]}`);
      if(!Object.is(a.value,b.value))valueDiffers++;
      steps++;
      s=apply(s,mine.rank(s,legal).steps[0].move).s;
    }
  }
  assert.equal(steps,GOLDEN.steps,'the same game as the fixture');
  assert.ok(valueDiffers>steps/2,`the refitted head gives other values (${valueDiffers}/${steps})`);
});
