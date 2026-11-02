// The token rows of src/selfplay-encode.mjs (train/ppo.py --arch transformer): they come after every other
// cell, so the state without them is a prefix of the state with them, and each row is the card it stands for.
import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize,HAND_TOKENS,TOKEN_COUNT,TOKEN_FEATS,TOKEN_SLOT} from '../src/selfplay-encode.mjs';

const lists=['warlock-zoo','warlock-discard'].map(loadList);
const plain=vocabulary(lists),tok=vocabulary(lists,undefined,{tokens:true});

// States of a game played by always taking the first legal step but the end of the turn when there is another.
function* states(seed,n){
  let s=newGame({lists,seed});
  for(let i=0;i<n;i++){
    const legal=moves(s);
    if(!legal.length)return;
    yield [s,legal];
    s=apply(s,legal.find(m=>m.kind!=='end')??legal[0]).s;
  }
}

test('the token block adds its rows at the very end and leaves the rest as it was', () => {
  assert.equal(obsSize(tok),obsSize(plain)+TOKEN_COUNT*TOKEN_FEATS);
  let seen=0;
  for(const [s,legal] of states(3,300)){
    const a=encode(s,legal,plain),b=encode(s,legal,tok);
    assert.deepEqual(b.obs.slice(0,a.obs.length),a.obs);
    assert.deepEqual(b.acts,a.acts);
    seen++;
  }
  assert.ok(seen>=20,`only ${seen} states`);
});

test('each row is the card in hand or the minion it stands for', () => {
  let boards=0;
  for(const [s,legal] of states(5,300)){
    const o=encode(s,legal,tok).obs,base=obsSize(plain);
    const rows=Array.from({length:TOKEN_COUNT},(_,i)=>o.slice(base+i*TOKEN_FEATS,base+(i+1)*TOKEN_FEATS));
    const mine=s.me.filter(b=>b.type==='MINION'),theirs=s.opp.filter(b=>b.type==='MINION');
    const zone=(r,z)=>r[0]===1&&r[1+z]===1;
    s.hand.slice(0,HAND_TOKENS).forEach((c,i)=>{assert.ok(zone(rows[i],0));assert.equal(rows[i][TOKEN_SLOT],tok.index.get(c.name)??tok.size-1)});
    mine.forEach((b,i)=>{const r=rows[HAND_TOKENS+i];assert.ok(zone(r,1));assert.equal(r[6],b.atk/10);assert.equal(r[7],b.hp/10)});
    theirs.forEach((b,i)=>{const r=rows[HAND_TOKENS+7+i];assert.ok(zone(r,2));assert.equal(r[8],0)});
    for(let i=Math.min(s.hand.length,HAND_TOKENS);i<HAND_TOKENS;i++)assert.ok(rows[i].every(x=>x===0));
    for(let i=mine.length;i<7;i++)assert.ok(rows[HAND_TOKENS+i].every(x=>x===0));
    if(mine.length&&theirs.length)boards++;
  }
  assert.ok(boards>0,'no state with minions on both sides');
});
