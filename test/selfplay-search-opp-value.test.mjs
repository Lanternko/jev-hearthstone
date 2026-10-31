// The look ahead's oppValue: a position where the other side is to play is valued by that side's own
// network (oppValue(t), for the seat to act), with the sign turned, and is not sent back to ours.
import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,rushPolicy} from '../src/selfplay.mjs';
import {vocabulary,encode} from '../src/selfplay-encode.mjs';
import {search} from '../src/selfplay-search.mjs';

const LISTS=[loadList('warlock-zakajz'),loadList('priest-egg-hsr')];
const VOCAB=vocabulary(LISTS,undefined,{timers:true,extra:true,stages:true,imbue:true,pile:true});
const SEAT=20;  // the cell of the state that holds s.seat (selfplay-encode.mjs observe)

function ends(seed,limit=400){
  const pick=rushPolicy(seed),out=[];
  let s=newGame({lists:LISTS,seed});
  for(let n=0;n<limit;n++){
    const legal=moves(s);
    if(!legal.length)break;
    const end=legal.find(m=>m.kind==='end');
    if(end&&!s.choice){const t=apply(s,end).s;if(t.seat!==s.seat&&moves(t).length)out.push({s,t,legal})}
    s=apply(s,pick(s,legal)).s;
  }
  return out;
}
function run(s,legal,value,opts){
  const g=search(s,legal,VOCAB,{samples:1,width:8,depth:1,seed:1,deal:x=>x,...opts});
  let r=g.next();const asked=[];
  while(!r.done){asked.push(...r.value);r=g.next(r.value.map(value))}
  return {scores:r.value,asked};
}

test('with oppValue the end of the turn is valued by the other side\'s network, sign turned, never asked of ours', ()=>{
  let checked=0;
  for(const seed of [4,9])for(const {s,t,legal} of ends(seed).slice(2,8)){
    if(legal.length<2)continue;
    const at=legal.findIndex(m=>m.kind==='end'),theirs=encode(t,[],VOCAB).obs.join(),seen=[];
    const opp=x=>{seen.push(x);return encode(x,[],VOCAB).obs.join()===theirs?.5:.1};
    const r=run(s,legal,()=>0,{oppValue:opp});
    assert.ok(r.asked.every(o=>o[SEAT]===s.seat),'our network is asked only about our own turn');
    assert.ok(seen.length&&seen.every(x=>x.seat!==s.seat),'the other network only about its turn');
    assert.equal(r.scores[at],-.5);
    checked++;
  }
  assert.ok(checked>=8,`${checked} positions`);
});

test('with two turns oppValue values the ends after the replies, and ownValue with oppValue is refused', ()=>{
  const reply={vocab:VOCAB,forward:(obs,acts)=>({logits:acts.map((a,i)=>-i),value:0})};
  let checked=0;
  for(const {s,legal} of ends(7).slice(3,9)){
    if(legal.length<3)continue;
    let calls=0;
    const r=run(s,legal,()=>0,{depth:40,turns:2,expand:2,replies:2,reply,oppValue:x=>{calls++;assert.notEqual(x.seat,s.seat);return 2}});
    assert.ok(r.asked.every(o=>o[SEAT]===s.seat));
    assert.ok(calls>0);
    assert.ok(r.scores.every(v=>v>=-.98-1e-9),'values are clipped as ours are');
    checked++;
  }
  assert.ok(checked>=3,`${checked} positions`);
  const {s,legal}=ends(7)[3];
  assert.throws(()=>run(s,legal,()=>0,{ownValue:true,oppValue:()=>0}),/pass one/);
});
