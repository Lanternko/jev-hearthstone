import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPosition,synthParsed} from '../src/regress.mjs';
import {shadowView} from '../src/selfplay-shadow.mjs';
import {cardDb,loadList} from '../src/selfplay.mjs';
import {moves,apply} from '../src/sim.mjs';
import {simRoot} from '../src/net-search.mjs';

// E-300 (2026-10-31): the live view gives the opponent's minions no maxAttacks, and `attacks>=undefined` is never
// true, so in a look ahead from a live position their next turn let one Remnant of Rage hit our face six times.
test('a minion of the opponent read from the live view attacks once on its next turn', ()=>{
  const file='test/fixtures/user-rulings/ranked1031-g1-small-minion-into-taunt.json';
  const {state,options,extra}=loadPosition({source:{file,state:'state',options:'options',parsed:'parsed'}});
  const view=shadowView(synthParsed(state,extra??{}),state,options,{cards:cardDb(),list:loadList('warlock-zakajz')});
  let s=apply(simRoot(view.s,'warlock-zakajz'),{kind:'end'}).s;
  const face=s.opp.find(b=>b.type==='HERO').id;
  const swing=()=>moves(s).find(m=>m.kind==='attack'&&m.id===41&&m.targetId!==face);
  assert.ok(swing(),'Remnant of Rage can attack on its turn');
  s=apply(s,swing()).s;
  assert.equal(moves(s).some(m=>m.kind==='attack'&&m.id===41),false,'and only once');
});
