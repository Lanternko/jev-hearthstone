import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardPick,tapBeforeAttack,tapBeforeAttackLive,RETIRED} from '../src/net-guards.mjs';
import {netPick,shadowView} from '../src/selfplay-shadow.mjs';
import {simRoot} from '../src/net-search.mjs';
import {moves} from '../src/sim.mjs';

// F-928, 2026-11-02 ranked game 12, engine turn 17: after Entropic Continuity the network's first attack was
// Ruinous Velocidrake -> Stone Drake, and it Life Tapped only after the attacks (a Blasphemy, the lethal, came too late).
const fx=JSON.parse(readFileSync(new URL('./fixtures/ranked1102-g12-t17-tap-before-attack.json',import.meta.url),'utf8'));
const parsed={entities:new Map(),publicPlays:[]};
const withEnv=async(env,f)=>{
  const old={};
  for(const k of Object.keys(env)){old[k]=process.env[k];if(env[k]==null)delete process.env[k];else process.env[k]=env[k]}
  try{return await f()}finally{for(const k of Object.keys(env))old[k]==null?delete process.env[k]:process.env[k]=old[k]}
};
const tapOption=fx.options.find(a=>a.entityId===59);

test('the zoo 0.2.0 network attacks first in game 12 turn 17; the guard Life Taps before it',async()=>{
  // The guard is tested on, whatever RETIRED holds for 0.2.0 while the user rules on it.
  const was=RETIRED['warlock-zoo-0.2.0'];delete RETIRED['warlock-zoo-0.2.0'];
  try{await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    const n=await netPick({parsed,state:fx.state,actions:fx.options});
    assert.equal(n.model,'warlock-zoo-0.2.0');
    assert.equal(n.action.id,fx.picked);
    assert.equal(n.guard?.guard,'tap_before_attack');
    assert.equal(n.guard.action.id,tapOption.id);
    // bridge.mjs: guardPick's own guards (board buff, board wipe) win over n.guard; none applies on this board.
    assert.equal(guardPick(fx.state,fx.options,n.action,n.top,{model:n.model}),null);
  });}finally{if(was)RETIRED['warlock-zoo-0.2.0']=was}
});

test('the guard can be retired for a model',async()=>{
  await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    const was=RETIRED['warlock-zoo-0.2.0'];
    RETIRED['warlock-zoo-0.2.0']=['tap_before_attack'];
    try{
      const n=await netPick({parsed,state:fx.state,actions:fx.options});
      assert.equal(n.guard,undefined);
    }finally{if(was)RETIRED['warlock-zoo-0.2.0']=was;else delete RETIRED['warlock-zoo-0.2.0']}
  });
});

// A network that attacks while it can, then does `after`.
const net=after=>({rank:(s,legal)=>({steps:[{p:1,move:legal.find(m=>m.kind==='attack')??legal.find(m=>m.kind===after)??legal.find(m=>m.kind==='end')}]})});

test('Life Tap goes first only when the network own line this turn taps',async()=>{
  await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    const view=shadowView(parsed,fx.state,fx.options);
    const i=view.legal.findIndex(m=>m.kind==='attack');
    const power=view.legal.findIndex(m=>m.kind==='power');
    assert.ok(i>=0&&power>=0);
    assert.equal(tapBeforeAttackLive(net('power'),view,i,'warlock-zakajz'),power);
    // the line has no Life Tap: attacks, then ends the turn
    assert.equal(tapBeforeAttackLive(net('end'),view,i,'warlock-zakajz'),-1);
    // the pick is not an attack
    assert.equal(tapBeforeAttackLive(net('power'),view,power,'warlock-zakajz'),-1);
  });
});

test('no tap when the hand is full or the deck is empty',async()=>{
  await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    const view=shadowView(parsed,fx.state,fx.options);
    const root=simRoot(view.s,'warlock-zakajz'),sm=moves(root);
    const atk=sm.find(m=>m.kind==='attack');
    assert.ok(tapBeforeAttack(net('power'),root,sm,atk));
    assert.equal(tapBeforeAttack(net('power'),{...root,hand:Array(10).fill(root.hand[0]??{})},sm,atk),null);
    assert.equal(tapBeforeAttack(net('power'),{...root,deck:[]},sm,atk),null);
  });
});
