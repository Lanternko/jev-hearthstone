import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';

// Positions as they were logged (decisions.jsonl rows 2208 and 2217, 2026-09-30, game 4).
const load=n=>JSON.parse(readFileSync(new URL(`./fixtures/user-rulings/${n}.json`,import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));

test('game 4 turn 4: Platysaur goes down before Entropic Continuity',()=>{
 const {state,options}=load('g4-body-before-buff');
 const ids=spendFirst(state,constrainActions(state,[...options,{id:'o0',type:'END_TURN'}])).map(a=>a.id);
 assert.ok(ids.includes('o2'),'Platysaur stays');
 assert.ok(!ids.includes('o1'),'the buff waits');
});

test('once the minion no longer fits beside the buff, the buff comes back',()=>{
 const {state,options}=load('g4-body-before-buff');
 const st=clone(state);st.me.mana=1;
 assert.ok(spendFirst(st,constrainActions(st,options)).some(a=>a.id==='o1'));
});

test('the whole pipeline plays Platysaur first, before any buff-first plan',()=>{
 const {state,options}=load('g4-body-before-buff');
 const full=constrainActions(state,[...options,{id:'o0',type:'END_TURN'},
  {id:'a1',entityId:state.me.board.find(c=>c.name==='Wand Thief').entityId,targetId:state.opponent.board.find(c=>c.name==='Platysaur').entityId}]);
 const p=prepare(state,full,{planner:true});
 // With the buff and the swing held back, Platysaur is the only thing left to do.
 const available=p.forced?[p.forced.action]:p.acts;
 assert.ok(available.some(a=>a.id==='o2'));
 assert.ok(!available.some(a=>a.id==='o1'),'buff cannot precede an affordable safe body');
});

test('game 4 turn 8: Occultist throws Walking Dead, not Soul Barrage, at a lone 3/3',()=>{
 const {state,options}=load('g4-occultist-barrage');
 const ids=constrainActions(state,options).map(a=>a.id);
 assert.ok(!ids.includes('o5t0'),'Soul Barrage is not discarded');
 assert.ok(ids.includes('o5t3'),'Walking Dead is');
});

test('against a swarm of small minions the Barrage discard stays a pick',()=>{
 const {state,options}=load('g4-occultist-barrage');
 const st=clone(state);
 st.opponent.board.push(...[90,91,92].map(id=>({entityId:id,CARDTYPE:'MINION',ATK:1,HEALTH:2,DAMAGE:0})));
 assert.ok(constrainActions(st,options).some(a=>a.id==='o5t0'));
});

test('two small minions with 5 Attack between them also keep the Barrage discard',()=>{
 const {state,options}=load('g4-occultist-barrage');
 const st=clone(state);
 st.opponent.board.push({entityId:90,CARDTYPE:'MINION',ATK:3,HEALTH:2,DAMAGE:0},{entityId:91,CARDTYPE:'MINION',ATK:2,HEALTH:1,DAMAGE:0});
 assert.ok(constrainActions(st,options).some(a=>a.id==='o5t0'));
 st.opponent.board.at(-1).ATK=1;
 assert.ok(!constrainActions(st,options).some(a=>a.id==='o5t0'),'4 Attack is not enough');
});
