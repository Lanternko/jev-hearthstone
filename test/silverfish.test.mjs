import test from 'node:test';
import assert from 'node:assert/strict';
import {fromState,apply,signature,searchSignature,moves} from '../src/sim.mjs';
import {search,menu,actionFor,score} from '../src/plan.mjs';
import {prepare,resolve} from '../src/choose.mjs';
import {tacticalCases,combatCases,position,whispers,walking,egg,duke,claws} from '../eval/silverfish-cases.mjs';
import {referenceReplay,meetsExpected,combatOracle} from '../eval/silverfish-oracle.mjs';
import {readFileSync} from 'node:fs';
import {rulePick} from '../src/choose.mjs';

for(const c of tacticalCases())test(`Silverfish tactical reference: ${c.id}`,()=>{
  const {plans}=search(c.state,c.actions);
  const exact=plans.filter(p=>p.steps.every(m=>m.exact));
  assert.ok(exact.some(p=>meetsExpected(referenceReplay(c,p.steps),c.expect)),c.id);
  if(c.expect.lethal){
    const m=menu(c.state,c.actions,{});
    assert.ok(m.lethal,'verified line reaches the live menu');
    assert.ok(meetsExpected(referenceReplay(c,m.lethal),c.expect));
    assert.ok(actionFor(c.actions,m.lethal[0]),'first step is offered by the game');
  }
});

test('search key preserves attack budget, readiness, card stats and resource history',()=>{
  const c=position({mine:[{name:'A',ATK:2,HEALTH:2,WINDFURY:1}],hand:[duke]});
  const s=fromState(c.state,c.actions);
  for(const change of [x=>x.me[1].attacks++,x=>x.me[1].canAttack=false,
    x=>x.hand[0].cost++,x=>x.hand[0].atk+=2,x=>x.power={used:true},x=>x.locations++,
    x=>x.discarded=[x.hand[0]],x=>x.drawnUnknown=1]){
    const copy=structuredClone(s);change(copy);
    assert.notEqual(searchSignature(copy),searchSignature(s));
  }
  const consumed=structuredClone(s);consumed.me[1].attacks=2;
  assert.equal(signature(consumed),signature(s),'live signature deliberately tolerates late attack tags');
  assert.notEqual(moves(consumed).length,moves(s).length);
});

test('lowest/highest cost ties never invent a specific discarded card or continue',()=>{
  for(const weapon of [null,claws]){
    const c=position({mana:1,mine:[{name:'A'}],hand:[...(weapon?[]:[whispers]),walking,{...walking,name:'Silverware Golem'}],weapon});
    const s=fromState(c.state,c.actions),r=apply(s,weapon?{kind:'attack',id:1,targetId:2}:{kind:'play',id:80});
    assert.equal(r.exact,false);
    assert.equal(r.s.discarded,undefined);
    assert.equal(r.s.uncertainDiscard.length,2);
    assert.ok(search(c.state,c.actions).plans.every(p=>p.steps.findIndex(m=>!m.exact)<0||!p.steps.at(-1).exact));
  }
});

test('random summons/damage and draws end the plan, including an inexact apparent lethal',()=>{
  for(const target of [
    {name:'Ectoplasm',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'},
    {name:'Soul Barrage',CARDTYPE:'SPELL',COST:4,text:'When you play or discard this, deal 5 damage randomly split among all enemies.'},
    {name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'}]){
    const c=position({mana:1,mine:[{name:'A'}],hand:[whispers,target]});
    const r=apply(fromState(c.state,c.actions),{kind:'play',id:80});
    assert.equal(r.exact,false);assert.ok(!r.s.me.some(b=>b.id<0));
  }
  const c=position({enemyHp:4,weapon:claws,hand:[{name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,
    text:'When you play or discard this, draw 3 cards.'}]});
  assert.equal(menu(c.state,c.actions,{}).lethal,null,'unknown terminal effect is not proof of a forced win');
});

test('a friendly summon engine prevents an exact multi-step prediction',()=>{
  const c=position({mana:1,mine:[{name:'Knife Juggler',ATK:2,HEALTH:2,
    text:'After you summon a minion, deal 1 damage to a random enemy.'}],hand:[whispers,walking]});
  assert.equal(apply(fromState(c.state,c.actions),{kind:'play',id:80}).exact,false);
});

test('Duke historical tags are not counted twice; discard grows hand and board copies once',()=>{
  const c=position({mana:1,mine:[{...duke,ATK:10,HEALTH:10}],hand:[whispers,walking,{...duke,ATK:8,HEALTH:8}]});
  const original=JSON.stringify(c.state),r=apply(fromState(c.state,c.actions),{kind:'play',id:80});
  assert.equal(r.s.me.find(b=>b.name===duke.name).atk,13,'10 + discard 2 + buff 1');
  assert.equal(r.s.hand.find(b=>b.name===duke.name).atk,10,'8 + discard 2');
  assert.equal(JSON.stringify(c.state),original,'input was not mutated');
});

test('the new combo is selectable through prepare/resolve without any ready attacker',()=>{
  const c=position({mana:1,mine:[{name:'A',EXHAUSTED:1}],hand:[whispers,egg]});
  const p=prepare(c.state,c.actions);
  if(p.forced){assert.equal(p.forced.action.entityId,80);return;}
  const id=Object.keys(p.plans).find(k=>p.plans[k][0].id===80);
  assert.ok(id);assert.equal(resolve(p,id).action.entityId,80);
});

test('search enforces a deterministic node budget and exposes truncation',()=>{
  const c=position({mine:Array.from({length:4},(_,i)=>({name:`A${i}`,ATK:2,HEALTH:3})),
    enemy:[{name:'X',ATK:1,HEALTH:2},{name:'Y',ATK:1,HEALTH:2}]});
  const a=search(c.state,c.actions,{maxNodes:7}),b=search(c.state,c.actions,{maxNodes:7});
  assert.equal(a.stats.generated,7);assert.equal(a.stats.nodeLimit,true);
  assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.plans.map(p=>p.steps),b.plans.map(p=>p.steps));
  assert.throws(()=>search(c.state,c.actions,{beam:0}));
});

test('ordinary discard is not a combo intent that displaces the ruled setup buff',()=>{
  const c=JSON.parse(readFileSync(new URL('../eval/positions.json',import.meta.url)))
    .find(c=>c.id==='g3t7r586');
  const p=prepare(c.state,c.options),hard=p.forced??p.lethal;
  const action=hard?.action??resolve(p,rulePick(p)).action;
  assert.equal(action.id,'o1','Entropic Continuity leaves Golem as the future lowest-cost target');
});

test('discarding Duke or Soulfire costs a card; mentioning discard is not a payoff',()=>{
  const c=position({mine:[{name:'A'}]}),s=fromState(c.state,c.actions);
  for(const card of [duke,{name:'Soulfire',COST:1,text:'Deal 4 damage. Discard a random card.'}]){
    const end={...s,discarded:[{...card,cost:card.COST}]};
    assert.equal(score(s,end),score(s,s)-card.COST);
  }
});

test('seeded exhaustive combat oracle: damage maximum and lethal proof agree',()=>{
  for(const c of combatCases(20261001,64)){
    const oracle=combatOracle(c),{plans}=search(c.state,c.actions);
    const health=c.state.opponent.board.find(b=>b.CARDTYPE==='HERO').HEALTH;
    const actual=Math.min(health,Math.max(0,...plans.map(p=>p.s.faceDealt)));
    assert.equal(actual,oracle.maximum,c.id);
    const lethal=menu(c.state,c.actions,{}).lethal;
    assert.equal(!!lethal,oracle.lethal,c.id);
    if(lethal)assert.ok(meetsExpected(referenceReplay(c,lethal),{lethal:true}),c.id);
  }
});
