import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {match,wilson} from '../src/selfplay-match.mjs';
import {encode} from '../src/selfplay-encode.mjs';

const v5=loadNet(new URL('../models/selfplay/warlock-discard-v5.json',import.meta.url));
const zoo=loadNet(new URL('../models/selfplay/warlock-zoo-v1.json',import.meta.url));

test('two nets of different vocabularies each read the same game in their own size',()=>{
  assert.notEqual(v5.vocab.size,zoo.vocab.size);
  const s=newGame({lists:[loadList('warlock-zoo'),loadList('warlock-discard')],seed:5}),legal=moves(s);
  for(const net of [v5,zoo]){
    const {steps,value}=net.rank(s,legal);
    assert.equal(steps.length,legal.length);
    assert.ok(Number.isFinite(value));
  }
});

test('a match between them plays to the end with no mismatch of sizes',()=>{
  const z=loadList('warlock-zoo'),d=loadList('warlock-discard');
  for(const [nets,lists] of [[[zoo,v5],[z,d]],[[v5,zoo],[d,z]]]){
    const {tally,cut}=match(nets,lists,{games:2,seed:1});
    assert.equal(tally.reduce((a,b)=>a+b,0),2);
    assert.ok(cut<=tally[1]);
  }
});

test('the Wilson interval holds the rate and stays inside 0..1',()=>{
  const [lo,hi]=wilson(86,100);
  assert.ok(lo<.86&&.86<hi&&lo>0&&hi<1);
  assert.deepEqual(wilson(0,0),[0,1]);
});

test('a look ahead in one seat only: that seat alone is searched, and its pick is the best score',()=>{
  const z=loadList('warlock-zoo'),d=loadList('warlock-discard'),seen=[];
  const {tally}=match([zoo,zoo],[z,d],{games:1,seed:3,look:[null,{samples:1,width:2,prior:1e-3}],onLook:x=>seen.push(x)});
  assert.equal(tally.reduce((a,b)=>a+b,0),1);
  assert.ok(seen.length>0);
  for(const {s,legal,scores,pick} of seen){
    assert.equal(s.seat,1);
    assert.equal(scores.length,legal.length);
    if(legal.length>1)assert.ok(scores[pick]>=Math.max(...scores)-0.01);
  }
});

test("the JS value is the value of the network's forward pass",()=>{
  const s=newGame({lists:[loadList('warlock-zoo'),loadList('warlock-discard')],seed:5}),legal=moves(s);
  const {obs,acts}=encode(s,legal,zoo.vocab);
  assert.ok(Math.abs(zoo.value(obs)-zoo.forward(obs,acts).value)<1e-6);
});
