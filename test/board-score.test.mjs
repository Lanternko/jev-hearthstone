import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,flip} from '../src/sim.mjs';
import {newGame,loadList} from '../src/selfplay.mjs';
import {features,phi,FEATURES,EFFECT_WORTH,WAIT} from '../src/board-score.mjs';
import {Arena} from '../src/selfplay-env.mjs';
import {playOn} from '../src/board-calibrate.mjs';

const hero=(hp,armor=0)=>({id:1,type:'HERO',hp,armor,atk:0});
const minion=(id,atk,hp,more={})=>({id,type:'MINION',atk,hp,...more});
const card=(name,more={})=>({id:50+name.length,name,...more});
// A bare position: only what the board score reads.
const position=()=>({seat:0,turn:7,
  me:[hero(20,3),minion(2,3,2),minion(3,1,1),minion(4,5,0)],                       // the 5/0 is dead
  opp:[hero(15),minion(5,4,4),minion(6,2,3,{dormant:true,wake:2})],
  hand:[card('a'),card('b'),card('c')],timers:[],
  them:{hand:[card('x')],timers:[]}});

test('the features are ours less theirs: board, hand, health with Armor, pending', ()=>{
  const f=features(position());
  assert.deepEqual(f,{board:(3+2+1+1)-(4+4),hand:3-1,health:23-15,pending:-(2+3)*WAIT});
  assert.equal(phi(position(),{board:1,hand:.5,health:.3,pending:2}),-1+1+2.4-10*WAIT);
  const g=features(position(),1);
  for(const k of FEATURES)assert.equal(g[k],-f[k]);
});

test('a dead hero counts no Health, not less than none', ()=>{
  const s=position();
  s.opp[0].hp=-6;
  assert.equal(features(s).health,23);
});

test('a delayed payoff is worth its effects, less a quarter for each turn it still waits', ()=>{
  const s=position();
  s.opp=[hero(15)];
  const grueling={left:1,effect:'trial',effects:['CAP_405t6','CAP_405t9']},unending={left:4,effect:'trial',effects:['CAP_405t4','CAP_405t9']};
  s.timers=[grueling];
  const due=features(s).pending;
  assert.equal(due,EFFECT_WORTH.CAP_405t6+EFFECT_WORTH.CAP_405t9);
  s.timers=[unending];
  assert.equal(features(s).pending,(EFFECT_WORTH.CAP_405t4+EFFECT_WORTH.CAP_405t9)*WAIT**3);
  assert.ok(due>features(s).pending);
  // the trial card still in hand waits its length once it is cast
  s.timers=[];
  s.hand.push(card('Grueling Trial',{trial:{turns:1,effects:grueling.effects}}));
  assert.equal(features(s).pending,due*WAIT);
  // their rituals count against us; the trial cards in their hand are hidden
  s.hand.pop();
  s.them.timers=[{left:2,effect:'summon'}];
  s.them.hand.push(card('Grueling Trial',{trial:{turns:1,effects:grueling.effects}}));
  assert.equal(features(s).pending,-16*WAIT);
});

test('the score of a real game is the same from either chair, but for the hidden trial cards', ()=>{
  const zoo=loadList('warlock-zoo');
  let s=newGame({lists:[zoo,loadList('warlock-discard')],seed:5});
  for(let n=0;n<60;n++){
    const legal=moves(s);
    if(!legal.length)break;
    s=apply(s,legal[n%legal.length]).s;
  }
  const f=features(s),g=features(flip(s));
  for(const k of FEATURES)assert.equal(features(s,1-s.seat)[k]+0,-f[k]+0,k);
  // turned over, only the trial cards still in a hand differ: each side counts its own, never the other's
  for(const k of ['board','hand','health'])assert.equal(g[k]+0,-f[k]+0,k);
  const bare=t=>({...t,hand:t.hand.filter(c=>!c.trial),them:{...t.them,hand:t.them.hand.filter(c=>!c.trial)}});
  assert.equal(features(flip(bare(s))).pending+0,-features(bare(s)).pending+0);
});

test('the arena shows phi and turn only when asked to shape, and the same states either way', ()=>{
  const lists=[loadList('warlock-zoo'),loadList('warlock-discard')],w={board:1,hand:.5,health:.3,pending:.2};
  const plain=new Arena({lists,n:3,seed:4,timers:true,swap:true}),shaped=new Arena({lists,n:3,seed:4,timers:true,swap:true,shape:w});
  for(let k=0;k<40;k++){
    const a=plain.views(),b=shaped.views();
    a.forEach((v,i)=>{
      assert.equal('phi' in v,false);
      const {phi:p,turn,...rest}=b[i];
      assert.deepEqual(rest,v);
      assert.equal(p,phi(shaped.tables[i].s,w));
      assert.equal(turn,shaped.tables[i].s.turn);
    });
    const acts=a.map(v=>(k*7)%v.acts.length);
    plain.step(acts);shaped.step(acts);
  }
});

test('a play on keeps one set of features for each of the next turns, the last position once the game is over', ()=>{
  const net={rank:(s,legal)=>({steps:[{move:legal.find(m=>m.kind==='attack')??legal.find(m=>m.kind==='play')??legal[0]}]})};
  const s=newGame({lists:[loadList('warlock-zoo'),loadList('warlock-discard')],seed:2});
  const x=playOn(net,s,s.seat,{turns:3});
  assert.equal(x.f.length,3);
  assert.ok([0,0.5,1].includes(x.r));
  assert.deepEqual(x.over,[false,false,false]);
  const short=playOn(net,s,s.seat,{turns:60});
  assert.ok(short.over.at(-1));
  assert.deepEqual(short.f.at(-1),FEATURES.map(k=>features(short.s,s.seat)[k]));
});
