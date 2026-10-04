import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,resolve} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {search,narrate} from '../src/plan.mjs';
import {fromState,apply} from '../src/sim.mjs';

const buff={entityId:20,name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,
 text:'Give your minions +1/+1. Shuffle two Shreds of Time into your deck.'};
const tap={entityId:21,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'};
const fixture=(mana=1)=>({me:{mana,deckCount:10,hand:[buff],board:[
 {entityId:1,CARDTYPE:'HERO',name:'Guldan',HEALTH:30},tap,
 ...[1,2,3].map((ATK,i)=>({entityId:10+i,CARDTYPE:'MINION',name:`Minion${i}`,ATK,HEALTH:4}))]},
 opponent:{board:[{entityId:2,CARDTYPE:'HERO',name:'Opponent',HEALTH:30}]}});
const actions=s=>[{id:'end',type:'END_TURN'},{id:'buff',entityId:20},
 ...s.me.board.filter(c=>c.CARDTYPE==='MINION'&&c.ATK>0&&c.EXHAUSTED!==1)
   .map(c=>({id:`hit${c.entityId}`,entityId:c.entityId,targetId:2}))];

test('spend-first keeps a buff-then-attack plan available to Jev rather than discarding the plan',()=>{
 const s=fixture(),p=prepare(s,constrainActions(s,actions(s)));
 const entry=Object.entries(p.plans).find(([,steps])=>steps[0].id===20&&steps.some(m=>m.kind==='attack'));
 assert.ok(entry);
 assert.match(p.crit[entry[0]].description,/Play Entropic Continuity/);
 const pick=resolve(p,entry[0]);
 assert.equal(pick.action.entityId,20);
 assert.ok(pick.plan.slice(1).every(m=>m.kind==='attack'));
 const first=apply(fromState(s,actions(s)),pick.plan[0]);
 assert.equal(first.s.me.find(b=>b.id===10).atk,2);
 assert.ok(p.crit[entry[0]].description.includes('leaving 21'),'buffed attacks deal 9, not 6');
});

test('drawing is a terminal optional intent with known costs, not invented cards or a compulsory choice',()=>{
 const s=fixture(3);s.me.hand=[];
 s.me.hand.push({entityId:22,name:'Body',CARDTYPE:'MINION',COST:3,ATK:4,HEALTH:4,text:''});
 const full=[...actions(s).filter(a=>a.id!=='buff'),{id:'draw',entityId:21},{id:'body',entityId:22}];
 const legal=constrainActions(s,full);
 assert.ok(legal.some(a=>a.id==='draw')&&legal.some(a=>a.id==='body'));
 const p=prepare(s,legal);
 assert.ok(!p.forced,'having a draw option does not force a draw');
 const {start,plans}=search(s,legal);
 const draw=plans.find(p=>p.steps[0].kind==='power');
 assert.ok(draw);assert.equal(draw.steps.length,1);assert.equal(draw.steps[0].exact,false);
 assert.equal(draw.s.mana,1);assert.equal(draw.s.me.find(b=>b.type==='HERO').hp,28);
 assert.equal(draw.s.hand.length,1,'unknown card is not fabricated');
 assert.match(narrate(start,draw),/Drawing is optional/);
});

test('draw-spell plans stop for new information and explain affordable buff continuation conditionally',()=>{
 const s=fixture(3);
 s.me.hand.push({entityId:23,name:'The Soularium',CARDTYPE:'SPELL',COST:2,text:'Draw 3 cards. They are Temporary.'});
 const full=[...actions(s),{id:'soul',entityId:23}];
 const p=prepare(s,constrainActions(s,full));
 const draw=Object.entries(p.plans).find(([,steps])=>steps.length===1&&steps[0].id===23);
 assert.ok(draw,'draw intent remains alongside buff/attack plans');
 assert.match(p.crit[draw[0]].description,/draw 3 unknown card/);
 assert.match(p.crit[draw[0]].description,/affordable buffs \(Entropic Continuity\)/);
 assert.match(p.crit[draw[0]].description,/then re-evaluate with 1 mana left/);
 assert.equal(resolve(p,draw[0]).plan.length,1,'no automated continuation across the draw');
});

test('buff planning includes a ready zero-Attack egg, but never a sleeping/new egg',()=>{
 const s=fixture();s.me.board.push({entityId:15,CARDTYPE:'MINION',name:'Egg',ATK:0,HEALTH:2,EXHAUSTED:0});
 const plans=search(s,actions(s)).plans;
 assert.ok(plans.some(p=>p.steps.some(m=>m.kind==='attack'&&m.id===15)));
 s.me.board.at(-1).EXHAUSTED=1;
 assert.ok(search(s,actions(s)).plans.every(p=>!p.steps.some(m=>m.kind==='attack'&&m.id===15)));
});
