import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fromState,apply,signature,followed} from '../src/sim.mjs';
import {actionFor} from '../src/plan.mjs';

// 2026-10-12 fidelity run: Ocular Occultist discarding Walking Dead predicted the right board 76
// times, but the game summons the Dead as a new entity and the strict signature dropped the plan.
const OCC={entityId:32,name:'Ocular Occultist',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:2,text:'<b>Taunt</b> <b>Battlecry:</b> Choose a card in your hand to discard.'};
const DEAD={entityId:33,name:'Walking Dead',CARDTYPE:'MINION',COST:3,ATK:2,HEALTH:5,text:'<b>Taunt</b> If you discard this minion, summon it.'};
const SPELL={entityId:34,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'};
const state=(hand,extra=[])=>({me:{mana:hand.includes(OCC)?5:4,hand,handCount:hand.length,deckCount:20,
  board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:10,CARDTYPE:'MINION',ATK:2,HEALTH:2},...extra]},
 opponent:{board:[{entityId:50,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:51,CARDTYPE:'MINION',ATK:4,HEALTH:5}]}});
const before=()=>{
 const r=apply(fromState(state([OCC,DEAD,SPELL]),[{entityId:32,targetId:33}]),{kind:'play',id:32,targetId:33});
 assert.ok(r.exact,r.note);
 return signature(r.s);
};
const onBoard=(c,more)=>({...c,...more});

test('a discard-summoned minion under a new entity id is still the predicted board',()=>{
 const real=fromState(state([SPELL],[onBoard(OCC),onBoard(DEAD,{entityId:77})]));
 assert.notEqual(signature(real),before(),'the strict signature differs only by the id');
 assert.deepEqual([...followed(before(),real)],[[33,77]]);
});

test('the same board under the same ids needs no renaming',()=>{
 assert.equal(followed(before(),fromState(state([SPELL],[onBoard(OCC),onBoard(DEAD)]))).size,0);
});

test('a new entity with other stats, a missing body or an extra one is a surprise',()=>{
 const p=before();
 assert.equal(followed(p,fromState(state([SPELL],[onBoard(OCC),onBoard(DEAD,{entityId:77,HEALTH:4})]))),null);
 assert.equal(followed(p,fromState(state([SPELL],[onBoard(OCC)]))),null);
 assert.equal(followed(p,fromState(state([SPELL],[onBoard(OCC),onBoard(DEAD,{entityId:77}),onBoard(DEAD,{entityId:78})]))),null);
 assert.equal(followed(p,fromState(state([SPELL,DEAD],[onBoard(OCC),onBoard(DEAD,{entityId:77})]))),null,'hand differs');
});

test('a queued step that names the hand id resolves to the real entity',()=>{
 const ids=followed(before(),fromState(state([SPELL],[onBoard(OCC),onBoard(DEAD,{entityId:77})])));
 const step={kind:'attack',id:33,targetId:51};
 const live=[{id:'a77',entityId:77,targetId:51},{id:'a10',entityId:10,targetId:51}];
 assert.equal(actionFor(live,{...step,id:ids.get(step.id)??step.id,targetId:ids.get(step.targetId)??step.targetId})?.id,'a77');
});
