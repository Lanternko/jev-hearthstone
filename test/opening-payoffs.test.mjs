import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,mulliganVerdict} from '../src/policy.mjs';

const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game120-opening-payoffs.json',import.meta.url)));
const game14=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game14-mulligan.json',import.meta.url)));
const masks=cards=>Array.from({length:2**cards.length},(_,mask)=>({type:'MULLIGAN',replace:cards.filter((_,i)=>mask&(1<<i)).map(c=>c.entityId)}));
const run=cards=>constrainActions({...f.state,choice:{...f.state.choice,entities:cards}},masks(cards));

test('game 120: one outlet with no cheap development keeps one payoff and redraws two slots',()=>{
 const out=run(f.state.choice.entities);
 assert.equal(out.length,1);
 assert.deepEqual([...out[0].replace].sort((a,b)=>a-b),f.expectedReplace);
});

test('cheap development does not let one outlet retain two payoffs',()=>{
 const cards=f.state.choice.entities.map(c=>c.name==='Soul Barrage'?{entityId:33,name:'Party Fiend',CARDTYPE:'MINION',COST:1,ATK:1,text:'Battlecry: Summon two 1/1 Felbeasts. Deal 3 damage to your hero.'}:c);
 const out=run(cards);
 assert.equal(out.length,1);
 assert.deepEqual(out[0].replace,[5]);
});

test('one Golem remains available with Occultist; unsupported pairs do not force a toss',()=>{
 const cards=f.state.choice.entities.filter(c=>c.name!=='Walking Dead');
 assert.ok(run(cards).some(a=>!a.replace.includes(5)));
 const noOutlet=f.state.choice.entities.filter(c=>c.name!=='Ocular Occultist');
 assert.equal(mulliganVerdict(noOutlet.find(c=>c.name==='Silverware Golem'),{...f.state,choice:{type:'MULLIGAN',entities:noOutlet}}),'free');
});

test('duplicate Walking Dead cannot consume a second unsupported opening slot',()=>{
 const cards=f.state.choice.entities.map(c=>c.name==='Silverware Golem'?{...f.state.choice.entities[0],entityId:5}:c);
 assert.ok(run(cards).every(a=>a.replace.includes(5)&&!a.replace.includes(15)));
});

test('new 50 game 14: tossing Whispers also redraws both unsupported Walking Dead',()=>{
 const cards=game14.state.choice.entities.filter(c=>c.name!=='The Coin');
 const out=constrainActions(game14.state,masks(cards));
 assert.ok(out.length);
 assert.ok(out.every(a=>!a.replace.includes(8)));
 assert.ok(out.every(a=>!a.replace.includes(24)||[13,23].every(id=>a.replace.includes(id))));
 assert.ok(out.every(a=>[13,23].filter(id=>!a.replace.includes(id)).length<=1));
 assert.ok(out.some(a=>[24,13,23].every(id=>a.replace.includes(id))));
 assert.ok(out.some(a=>[13,23].every(id=>a.replace.includes(id))&&!a.replace.includes(24)));
 assert.ok(out.some(a=>!a.replace.includes(24)&&!a.replace.includes(13)));
});
