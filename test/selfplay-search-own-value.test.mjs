// The look ahead's ownValue (F-882): a position where the other side is to play is valued from the
// looking seat's own chair (seatView), with the sign kept; without it, as before, from the other chair
// with the sign turned.
import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,rushPolicy} from '../src/selfplay.mjs';
import {vocabulary,encode} from '../src/selfplay-encode.mjs';
import {search,seatView,valueAsk} from '../src/selfplay-search.mjs';

const LISTS=[loadList('warlock-zakajz'),loadList('priest-egg-hsr')];
const VOCAB=vocabulary(LISTS,undefined,{timers:true,extra:true,stages:true,imbue:true,pile:true});
const SEAT=20;  // the cell of the state that holds s.seat (selfplay-encode.mjs observe)
const names=cs=>cs.map(c=>c.name).sort();

// Every position of a scripted game where the seat to act could end its turn, with what ending it hands over.
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

// A look ahead of one layer on the position itself (no redeal), with value(obs) for the network:
// -> {scores, asked: every state sent}.
function run(s,legal,value,opts){
  const g=search(s,legal,VOCAB,{samples:1,width:8,depth:1,seed:1,deal:x=>x,...opts});
  let r=g.next();const asked=[];
  while(!r.done){asked.push(...r.value);r=g.next(r.value.map(value))}
  return {scores:r.value,asked};
}

test('seatView shows the position handed over as the seat that handed it over holds it', ()=>{
  let seen=0;
  for(const seed of [3,8,21])for(const {s,t} of ends(seed)){
    const v=seatView(t);
    assert.equal(v.seat,s.seat);
    assert.equal(v.turn,s.turn);
    assert.equal(v.choice,null);
    assert.deepEqual(names(v.hand),names(s.hand.filter(c=>!c.temp)));
    assert.deepEqual(names(v.deck),names(s.deck));
    assert.deepEqual(v.me.map(b=>b.id),s.me.map(b=>b.id));
    assert.ok(v.me.every(b=>b.side==='me')&&v.opp.every(b=>b.side==='opp'));
    assert.deepEqual(v.opp.map(b=>b.id).sort(),t.me.map(b=>b.id).sort());
    assert.equal(v.power?.bless??0,s.power?.bless??0);
    assert.equal(v.slimePile?.length??0,s.slimePile?.length??0);
    assert.equal(v.them.hand.length,t.hand.length);
    assert.equal(encode(v,[],VOCAB).obs[SEAT],s.seat);
    // The turn is spent: no mana left, nobody ready, no location ready, the hero power not usable.
    assert.equal(v.mana,0);
    assert.ok(v.me.every(b=>!b.canAttack));
    assert.ok(v.sites.every(x=>!x.ready));
    assert.equal(v.crystals,s.crystals);
    const o=encode(v,[],VOCAB).obs;
    assert.equal(o[2],0);assert.equal(o[18],0);assert.equal(o[19],0);
    seen++;
  }
  assert.ok(seen>=20,`${seen} positions`);
});

test('a position of the other side\'s turn is asked from our chair with the sign kept only with own', ()=>{
  const {s,t}=ends(5)[6],u=apply(t,moves(t)[0]).s;
  for(const x of [t,...(u.seat===t.seat?[u]:[])]){
    assert.deepEqual(valueAsk(x,s.seat,VOCAB,true),{obs:encode(seatView(x),[],VOCAB).obs,sign:1});
    assert.deepEqual(valueAsk(x,s.seat,VOCAB,false),{obs:encode(x,[],VOCAB).obs,sign:-1});
  }
  // Our own turn is asked as it is, either way.
  for(const own of [true,false])assert.deepEqual(valueAsk(s,s.seat,VOCAB,own),{obs:encode(s,[],VOCAB).obs,sign:1});
});

test('with ownValue the end of the turn is valued from our chair and kept in our favour; without, as before', ()=>{
  let checked=0;
  for(const seed of [4,9])for(const {s,t,legal} of ends(seed).slice(2,8)){
    if(legal.length<2)continue;
    const at=legal.findIndex(m=>m.kind==='end');
    const mine=encode(seatView(t),[],VOCAB).obs.join(),theirs=encode(t,[],VOCAB).obs.join();
    const own=run(s,legal,o=>o.join()===mine?.5:0,{ownValue:true});
    assert.ok(own.asked.some(o=>o.join()===mine));
    assert.ok(!own.asked.some(o=>o.join()===theirs));
    assert.ok(own.asked.every(o=>o[SEAT]===s.seat),'every state is asked from our chair');
    assert.equal(own.scores[at],.5);
    const old=run(s,legal,o=>o.join()===theirs?.5:0,{});
    assert.ok(old.asked.some(o=>o.join()===theirs));
    assert.ok(!old.asked.some(o=>o.join()===mine));
    assert.equal(old.scores[at],-.5);
    checked++;
  }
  assert.ok(checked>=8,`${checked} positions`);
});

test('with two turns every state sent is from our chair under ownValue, and the default is unchanged', ()=>{
  const reply={vocab:VOCAB,forward:(obs,acts)=>({logits:acts.map((a,i)=>-i),value:0})};
  const hashed=o=>{let h=0;for(let i=0;i<o.length;i++)h=Math.imul(h^Math.round(o[i]*1000),16777619);return (h>>>0)/2**32*1.6-.8};
  let checked=0;
  for(const {s,legal} of ends(7).slice(3,9)){
    if(legal.length<3)continue;
    const opts={depth:40,turns:2,expand:2,replies:2,reply};
    const own=run(s,legal,hashed,{...opts,ownValue:true}),old=run(s,legal,hashed,opts),again=run(s,legal,hashed,{...opts,ownValue:false});
    assert.ok(own.asked.every(o=>o[SEAT]===s.seat));
    assert.ok(old.asked.some(o=>o[SEAT]!==s.seat),'the default still asks the other chair');
    assert.deepEqual(again,old);
    assert.equal(own.scores.length,legal.length);
    checked++;
  }
  assert.ok(checked>=3,`${checked} positions`);
});

test('the arena passes ownValue on to the look ahead (train/ppo.py --own-value)', async ()=>{
  const {Arena}=await import('../src/selfplay-env.mjs');
  const lists=[loadList('warlock-discard'),loadList('warlock-discard')];
  const arena=new Arena({lists,n:3,seed:4});
  for(let k=0;k<20;k++)arena.step(arena.tables.map(t=>Math.max(0,t.legal.length-2)));
  const tables=[0,1,2].filter(i=>arena.tables[i].legal.length>1),play=opts=>{
    let r=arena.plan(tables,opts);const asked=[];
    while(r.ask){asked.push(...r.ask);r=arena.answer(r.ask.map(()=>.25))}
    return {...r,asked};
  };
  assert.ok(tables.length);
  const own=play({samples:1,width:4,ownValue:true}),old=play({samples:1,width:4});
  // Every table's seat is asked about its own chair only under ownValue: the answer .25 then never turns negative.
  assert.ok(own.scores.flat().every(v=>v>=0),JSON.stringify(own.scores));
  assert.ok(old.scores.flat().some(v=>v<0),'the default turns the sign of the other chair');
  assert.equal(own.asked.length,old.asked.length);
});
