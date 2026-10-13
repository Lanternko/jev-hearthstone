import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,randomPolicy,rushPolicy} from '../src/selfplay.mjs';
import {blank,before,after,lethalOnBoard} from '../src/selfplay-audit.mjs';
import {Arena} from '../src/selfplay-env.mjs';

const LIST=loadList('warlock-discard'),LISTS=[LIST,LIST];
function tally(policy,games){
  const stats=blank();
  for(let seed=1;seed<=games;seed++){
    const pick=policy(seed),memo=[{},{}];
    let s=newGame({lists:LISTS,seed});
    for(let n=0;n<5000;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const m=pick(s,legal),seat=s.seat,pre=before(s,legal,m);
      s=apply(s,m).s;
      after(stats,memo[seat],pre,s);
    }
  }
  return stats;
}

test('the scripted rush player takes the wins on its board and never passes with a swing left', ()=>{
  const x=tally(rushPolicy,200);
  assert.ok(x.lethalTurns>100);
  assert.ok(x.lethalMissed/x.lethalTurns<0.03,`${x.lethalMissed} of ${x.lethalTurns}`);
  assert.equal(x.endAttack,0);
  assert.equal(x.aimedOwn,0);
});

test('the random player shows every kind of mistake, and far more of them than the rush player', ()=>{
  const x=tally(randomPolicy,200),r=tally(rushPolicy,200);
  for(const k of ['lethalMissed','buffLate','tradeLost','aimedOwn','endAttack','endPlay','endPower'])assert.ok(x[k]>0,k);
  assert.ok(x.lethalMissed/x.lethalTurns>10*r.lethalMissed/r.lethalTurns);
  assert.ok(x.buffLate/x.buffs>5*r.buffLate/r.buffs);
  for(const [a,b] of [['lethalMissed','lethalTurns'],['buffLate','buffs'],['tradeLost','trades'],['aimedOwn','aimed'],['endAttack','turns']])
    assert.ok(x[a]<=x[b],a);
});

test('every late buff is filed under exactly one heading, and the rush player has none without excuse', ()=>{
  const x=tally(randomPolicy,200),r=tally(rushPolicy,200);
  assert.equal(x.lateClear+x.lateOther+x.lateDrawn+x.lateFree+x.lateWon,x.buffLate);
  for(const k of ['lateClear','lateOther','lateDrawn','lateFree','lateWon'])assert.ok(x[k]>0,k);
  assert.equal(r.lateClear+r.lateOther+r.lateDrawn+r.lateFree+r.lateWon,r.buffLate);
  assert.equal(r.lateClear,0);
});

test('a win on the board is one only when the swings at the face reach its Health', ()=>{
  let s=newGame({lists:LISTS,seed:5});
  const pick=rushPolicy(5);
  let seen=0;
  for(let n=0;n<5000;n++){
    const legal=moves(s);
    if(!legal.length)break;
    const face=s.opp.find(b=>b.type==='HERO');
    const reach=[...new Set(legal.filter(m=>m.kind==='attack'&&m.targetId===face.id).map(m=>m.id))]
      .reduce((d,id)=>d+s.me.find(b=>b.id===id).atk,0);
    if(lethalOnBoard(s,legal)){seen++;assert.ok(reach>0)}
    else assert.ok(reach<face.hp+face.armor||reach===0);
    s=apply(s,pick(s,legal)).s;
  }
  assert.ok(seen>0);
});

test('an audited arena counts each step the caller takes and none without the flag', ()=>{
  const a=new Arena({lists:LISTS,n:4,seed:1,audit:true}),b=new Arena({lists:LISTS,n:4,seed:1});
  for(let i=0;i<50;i++)a.step(a.tables.map(()=>0));
  assert.equal(a.stats.steps,200);
  assert.equal(b.stats,null);
});
