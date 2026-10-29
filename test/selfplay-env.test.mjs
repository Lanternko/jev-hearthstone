import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard,playout,randomPolicy,rushPolicy} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from '../src/selfplay-encode.mjs';
import {Arena,packed} from '../src/selfplay-env.mjs';
import {infoStep,touchesInfo} from '../src/selfplay-rollout.mjs';

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
  assert.deepEqual(a.dims,{obs:obsSize(V),act:actSize(V),names:V.names,timers:false,extra:false,stages:false,imbue:false,pile:false});
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

test('a packed look ahead asks for the same states, in float32', ()=>{
  const a=new Arena({lists:LISTS,n:3,seed:61}),f32=x=>Math.fround(x);
  let r=a.plan([0,2],{samples:1,width:2}),rounds=0;
  while(r.ask){
    const p=packed(r,a.dims),o=new Float32Array(new Uint8Array(Buffer.from(p.askBin,'base64')).buffer);
    assert.ok(!('ask' in p));
    assert.equal(p.asked,r.ask.length);
    assert.deepEqual([...o],r.ask.flat().map(f32));
    r=a.answer(r.ask.map(()=>0));rounds++;
  }
  assert.ok(rounds>0);
  assert.equal(r.scores.length,2);
});

test('tables split over held arenas, dealt in the order of one arena, play the same games', ()=>{
  for(const rival of [null,'rush']){
    const one=new Arena({lists:LISTS,n:6,seed:50,rival}),pick=caller(7);
    const parts=[new Arena({lists:LISTS,n:2,seed:50,rival,hold:true}),new Arena({lists:LISTS,n:4,seed:52,rival,hold:true})];
    let next=56,v=one.views(),w=parts.flatMap(p=>p.views()),ended=0;
    assert.deepEqual(w,v);
    for(let k=0;k<600;k++){
      const acts=v.map(pick);
      v=one.step(acts);
      w=[...parts[0].step(acts.slice(0,2)),...parts[1].step(acts.slice(2))];
      w=w.map((e,i)=>{
        if(!e.ended)return e;
        ended++;
        const [p,at]=i<2?[parts[0],i]:[parts[1],i-2];
        assert.throws(()=>p.step(p.tables.map(()=>0)),/waits for a deal/);
        return {...p.dealAt([at],[next++])[0],ended:e.ended};
      });
      assert.deepEqual(w,v);
    }
    assert.ok(ended>10,`${rival}: ${ended} games`);
    assert.throws(()=>parts[0].dealAt([0],[1]),/no finished game waiting/);
  }
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

test('a packed reply carries every number of every view, in float32, and the count of steps of each', ()=>{
  const a=new Arena({lists:LISTS,n:6,seed:31,rival:'rush'}),pick=caller(3),f32=x=>Math.fround(x);
  for(let k=0;k<40;k++){
    const out={envs:k?a.step(a.tables.map((t,i)=>pick(a.views()[i]))):a.views()},p=packed(out,a.dims);
    const floats=b=>new Float32Array(new Uint8Array(Buffer.from(b,'base64')).buffer),o=floats(p.obsBin),s=floats(p.actsBin);
    let at=0;
    out.envs.forEach((e,i)=>{
      assert.equal(p.envs[i].steps,e.acts.length);
      assert.equal(p.envs[i].seat,e.seat);
      assert.deepEqual(p.envs[i].ended,e.ended);
      assert.ok(!('obs' in p.envs[i])&&!('acts' in p.envs[i]));
      assert.deepEqual([...o.subarray(i*a.dims.obs,(i+1)*a.dims.obs)],e.obs.map(f32));
      for(const r of e.acts){assert.deepEqual([...s.subarray(at,at+a.dims.act)],r.map(f32));at+=a.dims.act}
    });
    assert.equal(at,s.length);
  }
  assert.deepEqual(packed({envs:[],tally:[[1,0,0]]},a.dims),{envs:[],tally:[[1,0,0]]});
});

test('a raw packed reply names the length of each block and holds the same floats as the base64 one', ()=>{
  const a=new Arena({lists:LISTS,n:4,seed:32,rival:'rush'}),out={envs:a.views()};
  const p=packed(out,a.dims),r=packed(out,a.dims,{raw:true});
  assert.deepEqual(Object.keys(r.raw),['obsBin','actsBin']);
  for(const k of ['obsBin','actsBin']){
    assert.equal(r.raw[k],r.blocks[k].byteLength);
    assert.deepEqual(Buffer.from(r.blocks[k].buffer,r.blocks[k].byteOffset,r.blocks[k].byteLength),Buffer.from(p[k],'base64'));
  }
  assert.deepEqual(r.envs,p.envs);
  assert.deepEqual(packed({envs:[],tally:[[1,0,0]]},a.dims,{raw:true}),{envs:[],tally:[[1,0,0]]});
});

test('with swap the second list goes first on odd seeds, the vocabulary stays and held arenas still match', ()=>{
  const lists=[loadList('warlock-zoo'),LIST],cards=s=>[...s.hand,...s.deck].map(c=>c.cardId).sort();
  const plain=new Arena({lists,n:4,seed:10}),swapped=new Arena({lists,n:4,seed:10,swap:true});
  assert.deepEqual(swapped.dims,plain.dims);
  assert.deepEqual(plain.tables.map(t=>cards(t.s)),[10,11,12,13].map(seed=>cards(newGame({lists,seed}))));
  assert.deepEqual(swapped.tables.map(t=>cards(t.s)),[10,11,12,13].map(seed=>cards(newGame({lists:seed&1?[LIST,lists[0]]:lists,seed}))));
  assert.notDeepEqual(cards(swapped.tables[1].s),cards(plain.tables[1].s));
  const one=new Arena({lists,n:6,seed:50,swap:true}),pick=caller(9);
  const parts=[new Arena({lists,n:2,seed:50,hold:true,swap:true}),new Arena({lists,n:4,seed:52,hold:true,swap:true})];
  let next=56,v=one.views(),w=parts.flatMap(p=>p.views()),ended=0;
  assert.deepEqual(w,v);
  for(let k=0;k<600;k++){
    const acts=v.map(pick);
    v=one.step(acts);
    w=[...parts[0].step(acts.slice(0,2)),...parts[1].step(acts.slice(2))];
    w=w.map((e,i)=>{
      if(!e.ended)return e;
      ended++;
      const [p,at]=i<2?[parts[0],i]:[parts[1],i-2];
      return {...p.dealAt([at],[next++])[0],ended:e.ended};
    });
    assert.deepEqual(w,v);
  }
  assert.ok(ended>10,`${ended} games`);
});

test('with timers the state adds the clocks of rituals and trials after the old state, which stays as it was', ()=>{
  const zoo=[loadList('warlock-zoo'),loadList('warlock-zoo')],old=vocabulary(zoo),v=vocabulary(zoo,DB,{timers:true});
  assert.equal(obsSize(v),obsSize(old)+33);
  const s=newGame({lists:zoo,seed:5});
  const before=encode(s,moves(s),old).obs;
  s.timers=[{left:2,effect:'summon'},{left:1,effect:'trial',effects:['CAP_405t1','CAP_405t9']}];
  s.them.timers=[{left:1,effect:'cthun'}];
  s.hand[0]={...s.hand[0],trial:{turns:4,effects:['CAP_405t2','CAP_405t3']}};
  const o=encode(s,moves(s),v).obs,clocks=o.slice(obsSize(old));
  assert.deepEqual(o.slice(0,obsSize(old)),encode(s,moves(s),old).obs);
  assert.deepEqual(encode(newGame({lists:zoo,seed:5}),moves(s),v).obs.slice(0,obsSize(old)),before);
  const at=(block,i)=>clocks[block*11+i];
  assert.equal(at(0,0),.5);                                   // the brutes, two turns off
  assert.equal(at(0,2),1);assert.equal(at(0,10),1);           // the trial's two effects, next turn
  assert.equal(at(1,1),1);                                    // the other chair's C'Thun ritual
  assert.equal(at(2,3),.2);assert.equal(at(2,4),.2);          // the trial still in hand
  assert.equal(clocks.reduce((a,b)=>a+b,0),.5+1+1+1+.2+.2);
});

test('an Arena made with timers says so in its dims and gives states of that length', ()=>{
  const zoo=[loadList('warlock-zoo'),loadList('warlock-zoo')];
  const a=new Arena({lists:zoo,n:2,timers:true}),b=new Arena({lists:zoo,n:2});
  assert.equal(a.dims.timers,true);assert.equal(b.dims.timers,false);
  assert.equal(a.dims.obs,b.dims.obs+33);
  assert.equal(a.views()[0].obs.length,a.dims.obs);
});

test('with a shape the ended of a game carries the board score of each seat at the end, opposite in sign; without one it does not', ()=>{
  for(const [w,onlyHealth] of [[{board:1,hand:0.5,health:2,pending:0},false],[{board:0,hand:0,health:1,pending:0},true]]){
    const a=new Arena({lists:LISTS,n:8,seed:11,shape:w}),b=new Arena({lists:LISTS,n:8,seed:11}),pick=caller(11),pickB=caller(11);
    let v=a.views(),u=b.views(),ended=0,decided=0;
    for(let i=0;i<1500;i++){
      v=a.step(v.map(pick));u=b.step(u.map(pickB));
      v.forEach((e,k)=>{
        assert.equal('ended' in e,'ended' in u[k]);
        if(!e.ended)return;
        ended++;
        const [p,q]=e.ended.phiEnd;
        assert.ok(Number.isFinite(p)&&Number.isFinite(q));
        assert.ok(Math.abs(p+q)<1e-9,`${p} ${q}`);
        // with Health alone the one left standing scores above the one whose hero died (a dead hero counts 0)
        if(onlyHealth&&(e.ended.winner===0||e.ended.winner===1)){
          decided++;
          const [x,y]=e.ended.winner===0?[p,q]:[q,p];
          assert.ok(x>0&&y<0,`${p} ${q}`);
        }
        assert.equal('phiEnd' in u[k].ended,false);
      });
    }
    assert.ok(ended>30,`${ended} games`);
    if(onlyHealth)assert.ok(decided>10,`${decided} decided games`);
  }
});

test('with info a view says so when a step draws or picks from a random offer; without it the views are the same as before', ()=>{
  const a=new Arena({lists:LISTS,n:8,seed:13,info:true}),b=new Arena({lists:LISTS,n:8,seed:13}),pick=caller(13);
  let v=a.views(),u=b.views(),marked=0,plain=0;
  for(let i=0;i<600;i++){
    v.forEach((e,k)=>{
      const t=a.tables[k],want=touchesInfo(t.s,t.legal);
      assert.equal(e.info,want?1:undefined,`step ${i} table ${k}`);
      if(want)marked++;else plain++;
      const {info,...rest}=e;
      assert.deepEqual(rest,u[k]);                              // the same view, bar the flag
      assert.equal('info' in u[k],false);
    });
    const acts=v.map(pick);
    v=a.step(acts);u=b.step(acts);
  }
  assert.ok(marked>20&&plain>20,`${marked} marked, ${plain} plain`);
});

test('infoStep marks Life Tap, a draw or Discover card and a random offer, and not an attack, the end of the turn or a plain minion', ()=>{
  let s=newGame({lists:LISTS,seed:3});
  s.mana=10;
  const legal=moves(s);
  const tap=legal.find(m=>m.kind==='power');
  assert.ok(tap&&s.power.draw>0,'Life Tap is available to the warlock');
  assert.equal(infoStep(s,tap),true);
  assert.equal(touchesInfo(s,legal),true);
  assert.equal(touchesInfo(s,legal.filter(m=>m.kind==='power')),true);
  assert.equal(infoStep(s,{kind:'end'}),false);
  assert.equal(infoStep(s,{kind:'attack',id:1,targetId:2}),false);
  assert.equal(touchesInfo(s,[{kind:'end'},{kind:'attack',id:1,targetId:2}]),false);
  s.choice={kind:'discover',options:['a','b']};
  assert.equal(infoStep(s,{kind:'choose',id:'a'}),true);
  s.choice={kind:'cthun',options:['a','b']};
  assert.equal(infoStep(s,{kind:'choose',id:'a'}),false);
});
