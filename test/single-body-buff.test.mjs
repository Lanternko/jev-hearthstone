import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,lowBoardDiscardActions,spendFirst} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/single-body-occultist.json',import.meta.url)));
const game9=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game9-single-buff.json',import.meta.url)));
const run=(s=fixture.state,options=fixture.options,planner=true)=>prepare(s,constrainActions(s,options),{planner});

test('new50 game9 T2: hold buff on one sleeping body even with no affordable Tap',()=>{
 const legal=constrainActions(game9.state,game9.options);
 assert.deepEqual(legal.map(a=>a.type),['END_TURN']);
 for(const planner of [true,false])assert.equal(run(game9.state,game9.options,planner).forced?.action.type,'END_TURN');
});

test('holding early idle single-body buff does not ban a Temporary buff, multiple targets or immediate lethal',()=>{
 const temp=structuredClone(game9.state);temp.me.hand.find(c=>c.entityId===48).temporary={expires:'end_of_own_turn',confidence:1};
 assert.ok(constrainActions(temp,game9.options).some(a=>a.entityId===48));
 const wide=structuredClone(game9.state);wide.me.board.push({...wide.me.board.find(c=>c.CARDTYPE==='MINION'),entityId:990});
 assert.ok(constrainActions(wide,game9.options).some(a=>a.entityId===48));
 const lethal=structuredClone(game9.state);lethal.me.board.find(c=>c.CARDTYPE==='MINION').EXHAUSTED=0;
 lethal.opponent.board.find(c=>c.CARDTYPE==='HERO').HEALTH=2;
 const attack={id:'hit',type:'POWER',entityId:40,targetId:lethal.opponent.board.find(c=>c.CARDTYPE==='HERO').entityId};
 assert.ok(run(lethal,[...game9.options,attack]).lethal,'ready 1-Attack body can buff to lethal');
});

test('recorded one-body board: Occultist discards Walking Dead instead of forced single-body buff',()=>{
 for(const planner of [true,false]){
  const p=run(fixture.state,fixture.options,planner);
  assert.equal(p.forced.source,'low_board_discard');
  assert.equal(p.forced.action.entityId,34);assert.equal(p.forced.action.targetId,40);
 }
 const legal=constrainActions(fixture.state,fixture.options);
 assert.ok(spendFirst(fixture.state,legal).some(a=>a.entityId===34&&a.targetId===40));
});

test('low-board priority requires affordable source, payoff, full room, and mutually exclusive mana',()=>{
 const s=structuredClone(fixture.state);
 s.me.mana=2;assert.equal(lowBoardDiscardActions(s,fixture.options).length,0);
 s.me.mana=4;assert.equal(lowBoardDiscardActions(s,fixture.options).length,0,'can develop then buff');
 s.me.mana=3;s.me.hand=s.me.hand.filter(c=>c.entityId!==40);assert.equal(lowBoardDiscardActions(s,fixture.options).length,0);
 const wide=structuredClone(fixture.state);wide.me.board.push({...wide.me.board.at(-1),entityId:999});
 assert.equal(lowBoardDiscardActions(wide,fixture.options).length,0);
 const crowded=structuredClone(fixture.state);crowded.me.board.push(...Array.from({length:5},(_,i)=>({entityId:900+i,CARDTYPE:'LOCATION'})));
 assert.equal(lowBoardDiscardActions(crowded,fixture.options).length,0);
});

test('single-body buff lethal and free information still precede ordinary development',()=>{
 const lethal=structuredClone(fixture.state);lethal.opponent.board=lethal.opponent.board.filter(c=>c.CARDTYPE!=='MINION');
 lethal.opponent.board.find(c=>c.CARDTYPE==='HERO').HEALTH=3;
 const p=run(lethal);assert.ok(p.lethal,'buff enables three-damage lethal');
 const free=structuredClone(fixture.state);free.me.hand.push({entityId:800,name:'Cursed Catacombs',CARDTYPE:'SPELL',COST:0,text:'Discover another card from your deck.'});
 assert.notEqual(run(free,[...fixture.options,{id:'free',entityId:800}]).forced?.source,'low_board_discard');
});
