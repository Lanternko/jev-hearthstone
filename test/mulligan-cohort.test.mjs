import test from 'node:test';
import assert from 'node:assert/strict';
import {keptReceipt,cohortStats} from '../src/mulligan-cohort.mjs';
test('server receipt rejects duplicates, incomplete packets and foreign originals',()=>{
  const h='GameState.DebugPrintEntitiesChosen() - id=2 Player=example EntitiesCount=2\n';
  const e=id=>`GameState.DebugPrintEntitiesChosen() - Entities[0]=[id=${id} cardId=X player=1]\n`;
  const ctx={choiceId:2,playerId:1,offeredIds:[3,4]};
  assert.equal(keptReceipt(h+e(3),ctx).complete,false);
  assert.equal(keptReceipt(h+e(3)+e(3),ctx).complete,false);
  assert.equal(keptReceipt(h+e(3)+e(5),ctx).complete,false);
  assert.deepEqual(keptReceipt(h+e(3)+e(4),ctx).kept,[3,4]);
});
test('unknown opponents do not contaminate other; duplicate card copies count one game',()=>{
  const base={receiptComplete:true,initiative:'first',result:'Win',offered:[{name:'A'},{name:'A'}],kept:[{name:'A'},{name:'A'}]};
  const s=cohortStats([{...base,id:'unknown',matchup:{type:null}},{...base,id:'known',matchup:{type:'control'}}]);
  assert.equal(s.quadrants.other_first.n,0);assert.equal(s.unclassifiedGames.length,1);
  assert.equal(s.quadrants.control_first.cards.A.offeredGames,1);
  assert.equal(s.quadrants.control_first.cards.A.keptGames,1);
  assert.throws(()=>cohortStats([{...base,id:'x'},{...base,id:'x'}]),/duplicate/);
});
test('a combination requires distinct cards and counts games rather than copies',()=>{
  const base={receiptComplete:true,initiative:'first',result:'Win',matchup:{type:'control'}};
  const single=[{name:'A',roles:['buff']}],pair=[...single,{name:'B',roles:['buff']}];
  const s=cohortStats([{...base,id:'one',offered:single,kept:single},{...base,id:'two',offered:pair,kept:pair}],{combos:[['A','role:buff']]});
  assert.equal(s.quadrants.control_first.combos[0].offeredGames,1);
  assert.equal(s.quadrants.control_first.combos[0].keptGames,1);
});
