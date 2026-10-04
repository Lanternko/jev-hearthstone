import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {search,menu,ongoingEffectValue,ongoingTradePlans} from '../src/plan.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game137-ongoing-effect-trade.json',import.meta.url)));
const wyrm=f.state.opponent.board.find(c=>c.name==='Mana Wyrm').entityId;
const informant=f.state.opponent.board.find(c=>c.name==='Anonymous Informant').entityId;
const duke=f.state.me.board.find(c=>c.name==='Duke of Below').entityId;
const kills=(p,id)=>!p.s.opp.some(b=>b.id===id);

test('game 137 turn 4: prefer killing Mana Wyrm to the same-stat spent Battlecry',()=>{
 const {start,plans}=search(f.state,f.options);
 assert.ok(kills(plans[0],wyrm));
 const p=plans.find(p=>p.steps.length===1&&p.steps[0].id===duke&&p.steps[0].targetId===informant);
 const q=plans.find(p=>p.steps.length===1&&p.steps[0].id===duke&&p.steps[0].targetId===wyrm);
 assert.ok(p&&q);assert.deepEqual(p.s.me,q.s.me);assert.ok(q.score>p.score);
 assert.deepEqual(ongoingTradePlans(start,[p,q]),[q]);
 const result=menu(f.state,f.options,{});
 assert.ok(Object.values(result.plans).some(steps=>steps.some(m=>m.targetId===wyrm)));
 assert.ok(!Object.values(result.plans).some(steps=>steps.some(m=>m.id===duke&&m.targetId===informant)));
 assert.ok(Object.values(result.criteria).some(c=>c.description.includes('Persistent enemy effects removed: Mana Wyrm')));
});

test('ongoing premiums exclude silence and spent Battlecries; different trades stay available',()=>{
 assert.equal(ongoingEffectValue({type:'MINION',text:'Battlecry: Give a minion "Whenever you cast a spell, gain +1 Attack."'}),0);
 assert.equal(ongoingEffectValue({type:'MINION',text:'Battlecry: Your next Secret costs (0).'}),0);
 const s=structuredClone(f.state);s.opponent.board.find(c=>c.entityId===wyrm).SILENCED=1;
 const quiet=search(s,f.options);assert.equal(ongoingEffectValue(quiet.start.opp.find(b=>b.id===wyrm)),0);
 s.opponent.board.find(c=>c.entityId===wyrm).SILENCED=0;
 s.opponent.board.find(c=>c.entityId===wyrm).ATK=3;
 const {start,plans}=search(s,f.options);
 const pair=plans.filter(p=>p.steps.length===1&&p.steps[0].id===duke&&[wyrm,informant].includes(p.steps[0].targetId));
 assert.equal(ongoingTradePlans(start,pair).length,2,'different retaliation damage is not equivalent');
});

test('a lethal attack still outranks removing an ongoing effect',()=>{
 const s=structuredClone(f.state);s.opponent.board.find(c=>c.CARDTYPE==='HERO').HEALTH=2;
 const {plans}=search(s,f.options);assert.ok(plans[0].score>=10000);
});
