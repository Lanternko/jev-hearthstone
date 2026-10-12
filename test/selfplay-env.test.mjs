import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard,playout,randomPolicy,rushPolicy} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from '../src/selfplay-encode.mjs';
import {Arena} from '../src/selfplay-env.mjs';

const DB=cardDb(),LIST=loadList('warlock-discard'),LISTS=[LIST,LIST],V=vocabulary(LISTS);
// A caller that picks by its own dice, so a test replays.
const caller=seed=>{let x=seed;return e=>{x=(x*1103515245+12345)&0x7fffffff;return x%e.acts.length}};
const finite=v=>v.every(Number.isFinite);

test('the vocabulary names every card of the lists once, The Coin and the Spider, and keeps a slot for the rest', ()=>{
  const names=new Set(Object.keys(LIST.cards).map(id=>DB[id].name));
  assert.equal(V.names.length,new Set(V.names).size);
  for(const n of [...names,'The Coin','Spider'])assert.ok(V.index.has(n),n);
  assert.equal(V.size,V.names.length+1);
});

test('every state and step along random games has the declared length and only finite numbers', ()=>{
  for(let seed=1;seed<=20;seed++){
    const pick=randomPolicy(seed);
    playout(newGame({lists:LISTS,seed}),(s,legal)=>{
      const {obs,acts}=encode(s,legal,V);
      assert.equal(obs.length,obsSize(V));
      assert.equal(acts.length,legal.length);
      assert.ok(finite(obs),`seed ${seed} turn ${s.turn}`);
      for(const a of acts){
        assert.equal(a.length,actSize(V));
        assert.ok(finite(a));
        assert.equal(a.slice(0,6).reduce((x,y)=>x+y,0),1);        // one kind
      }
      return pick(s,legal);
    });
  }
});

test('the state does not tell which cards the other hand holds or how either deck is ordered', ()=>{
  let s=newGame({lists:LISTS,seed:3});
  const pick=randomPolicy(3);
  for(let i=0;i<25&&moves(s).length;i++)s=playout(s,pick,{maxSteps:1}).s;
  const legal=moves(s),before=encode(s,legal,V);
  const other=Object.keys(LIST.cards).map((id,i)=>rawCard(DB[id],900+i));
  const hidden={...s,deck:[...s.deck].reverse(),
    them:{...s.them,hand:s.them.hand.map((c,i)=>({...c,name:other[i%other.length].name,cost:9})),deck:[...s.them.deck].reverse()}};
  assert.deepEqual(encode(hidden,legal,V),before);
  const fewer={...s,them:{...s.them,hand:s.them.hand.slice(1)}};
  assert.notDeepEqual(encode(fewer,legal,V).obs,before.obs);       // the count is known
});

test('a table asks the seat to act, reports a finished game once and deals the next', ()=>{
  const a=new Arena({lists:LISTS,n:8,seed:11}),pick=caller(11);
  let v=a.views(),ended=0;
  assert.deepEqual(a.dims,{obs:obsSize(V),act:actSize(V),names:V.names});
  for(let i=0;i<2500;i++){
    v.forEach((e,k)=>{
      assert.equal(e.seat,a.tables[k].s.seat);
      assert.equal(e.acts.length,a.tables[k].legal.length);
      assert.ok(e.acts.length>0);
    });
    v=a.step(v.map(pick));
    for(const e of v)if(e.ended){
      ended++;
      assert.ok([0,1,'draw'].includes(e.ended.winner));
      assert.ok(e.ended.turns>1);
    }
  }
  assert.ok(ended>50,`${ended} games`);
});

test('the same seed and the same picks deal the same tables', ()=>{
  const run=()=>{
    const a=new Arena({lists:LISTS,n:4,seed:21}),pick=caller(5);
    let v=a.views();
    for(let i=0;i<300;i++)v=a.step(v.map(pick));
    return v;
  };
  assert.deepEqual(run(),run());
});

test('with a rival only the caller\'s seat is asked, the seats alternate and the result is the caller\'s', ()=>{
  for(const rival of ['random','rush']){
    const a=new Arena({lists:LISTS,n:8,seed:40,rival}),pick=caller(9),seats=new Set();
    let v=a.views(),results=0;
    for(let i=0;i<1500;i++){
      v.forEach((e,k)=>{assert.equal(e.seat,a.tables[k].mine);seats.add(e.seat)});
      v=a.step(v.map(pick));
      for(const e of v)if(e.ended){results++;assert.ok([1,0,-1].includes(e.ended.result))}
    }
    assert.deepEqual([...seats].sort(),[0,1]);
    assert.ok(results>50,`${rival}: ${results} games`);
  }
});

test('a game that never ends is cut off as a draw', ()=>{
  const a=new Arena({lists:LISTS,n:2,seed:1,maxSteps:5});
  let v=a.views(),ended=[];
  for(let i=0;i<5;i++){v=a.step(v.map(()=>0));ended.push(...v.filter(e=>e.ended))}
  assert.equal(ended.length,2);
  for(const e of ended)assert.equal(e.ended.winner,'draw');
});

test('a step that is not offered and a wrong count are errors', ()=>{
  const a=new Arena({lists:LISTS,n:2,seed:1});
  assert.throws(()=>a.step([99,0]),/no step 99/);
  assert.throws(()=>a.step([0]),/1 actions for 2 tables/);
  assert.throws(()=>new Arena({lists:LISTS,n:1,rival:'nobody'}),/unknown rival/);
});

test('the scripted rush player beats the random one and never aims at its own side when it need not', ()=>{
  let wins=0;
  for(let g=0;g<200;g++){
    const rush=rushPolicy(g+1),rand=randomPolicy(g+500),seat=g&1;
    const r=playout(newGame({lists:LISTS,seed:g+1}),(s,legal)=>{
      if(s.seat!==seat)return rand(s,legal);
      const m=rush(s,legal),own=new Set(s.me.map(b=>b.id));
      if(own.has(m.targetId))assert.ok(legal.every(x=>x.kind==='end'||own.has(x.targetId)));
      return m;
    },{maxSteps:1500});
    wins+=r.winner===seat;
  }
  assert.ok(wins>150,`${wins} of 200`);
});
