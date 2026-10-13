import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,rushPolicy,winner} from '../src/selfplay.mjs';
import {shape,better,beaten} from '../src/selfplay-dominance.mjs';
import {keepPlain} from '../src/selfplay-search.mjs';
import {turnTree,replay} from '../src/selfplay-quiz.mjs';

const LIST=loadList('warlock-discard'),LISTS=[LIST,LIST];
// A game of the scripted player, stopped at the first turn start whose tree passes `when`.
function reach(seed,when){
  const pick=rushPolicy(seed),hist=[];
  let s=newGame({lists:LISTS,seed}),turn=-1;
  for(let n=0;n<5000&&winner(s)==null;n++){
    const legal=moves(s);
    if(s.turn!==turn&&!s.choice){
      turn=s.turn;
      const tree=turnTree(s);
      if(tree&&when(tree))return {s,tree,q:{seed,hist:[...hist]}};
    }
    const m=pick(s,legal);
    hist.push(legal.indexOf(m));
    s=apply(s,m).s;
  }
  return null;
}
const find=when=>{for(let seed=1;seed<60;seed++){const r=reach(seed,when);if(r)return r}throw Error('no such turn')};
const sh=(rest,vec,groups)=>({rest,vec,groups});

test('better: no number worse and one better, and it names what differs', ()=>{
  const g=['hero','hero','own','foe'];
  assert.equal(better(sh('x',[30,-20,4,-2],g),sh('x',[28,-20,4,-2],g)),'hero');
  assert.equal(better(sh('x',[30,-20,6,-2],g),sh('x',[30,-20,4,-2],g)),'own');
  assert.equal(better(sh('x',[30,-20,6,-1],g),sh('x',[30,-20,4,-2],g)),'mixed');
  assert.equal(better(sh('x',[30,-20,4,-2],g),sh('x',[30,-20,4,-2],g)),null);
  assert.equal(better(sh('x',[30,-22,4,-2],g),sh('x',[28,-20,4,-2],g)),null);   // more Health, but the foe has more too: not plain
  assert.equal(better(sh('x',[30,-20,4,-2],g),sh('y',[28,-20,4,-2],g)),null);   // something else differs too
});

test('beaten: each position another plainly beats, with one that nothing beats', ()=>{
  const g=['hero','hero'];
  const lost=beaten([sh('x',[30,-20],g),sh('x',[28,-20],g),sh('x',[26,-20],g),sh('x',[27,-19],g),sh('y',[1,-30],g)]);
  assert.deepEqual(lost.sort(),[[1,0,'hero'],[2,0,'hero']]);   // 27 Health with one more damage dealt is beaten by none
});

test('turnTree: every pair it names is two ends of the turn, one plainly better, parted after the last dice', ()=>{
  const {tree}=find(t=>t.pairs.length>3);
  for(const {good,bad,what} of tree.pairs){
    assert.equal(good.anchor,bad.anchor);
    assert.equal(better(shape(good.s),shape(bad.s)),what);
    assert.equal(good.what,undefined);
  }
  assert.equal(tree.faults,[...tree.ends.values()].filter(e=>e.what).length);
});

test('turnTree: handing the turn over where a win without dice was there is a kill', ()=>{
  const {tree}=find(t=>[...t.ends.values()].some(e=>e.won)&&[...t.ends.values()].some(e=>e.what==='kill'));
  const all=[...tree.ends.values()],wins=new Set(all.filter(e=>e.won).map(e=>e.anchor));
  for(const e of all)if(!e.over)assert.equal(e.what==='kill',wins.has(e.anchor));
});

test('turnTree gives up past the cap, and replay finds the position of a question again', ()=>{
  const {s,q}=find(t=>t.pairs.length>0);
  assert.equal(turnTree(s,{cap:3}),null);
  assert.deepEqual(replay(LISTS,q),s);
});

test('keepPlain drops the plainly worse line and keeps the higher guess; not across a roll of the dice', ()=>{
  const {tree}=find(t=>t.pairs.length>0),{good,bad}=tree.pairs[0];
  const lines=()=>[{s:good.s,anchor:0,v:.1},{s:bad.s,anchor:0,v:.5}];
  const kept=keepPlain(lines());
  assert.equal(kept.length,1);
  assert.equal(kept[0].s,good.s);
  assert.equal(kept[0].v,.5);
  const apart=lines();apart[1].anchor=1;
  assert.equal(keepPlain(apart).length,2);
});
