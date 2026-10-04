import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeadSkip} from '../src/dead-skip.mjs';

const attack={id:'o4t1',type:'ATTACK',entityId:43,targetId:22};

test('an action that dies twice is off the menu for the rest of the turn', ()=>{
  const s=createDeadSkip();
  assert.equal(s.dead(9,attack),false);
  assert.equal(s.skipped(9,attack),false);
  assert.equal(s.dead(9,{...attack,id:'o3t1'}),true);   // option ids shift; same attack
  assert.equal(s.skipped(9,{...attack,id:'o5t2'}),true);
  assert.equal(s.skipped(9,{...attack,targetId:7}),false);
});

test('a new turn clears the list', ()=>{
  const s=createDeadSkip();
  s.dead(9,attack);s.dead(9,attack);
  assert.equal(s.skipped(11,attack),false);
});

test('end turn, mulligan and choices are never retired', ()=>{
  const s=createDeadSkip();
  for(const type of ['END_TURN','MULLIGAN','CHOICE']){
    s.dead(3,{type});s.dead(3,{type});
    assert.equal(s.skipped(3,{type}),false);
  }
});
