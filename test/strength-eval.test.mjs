import test from 'node:test';
import assert from 'node:assert/strict';
import {schedule,wilson,analyzeStrength,VERSIONS} from '../src/eval-strength.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const fill=(rows,win=true)=>rows.map(r=>({...r,result:win?'WIN':'LOSS',gameId:`game-${r.trial}`,
  model:'fixed-model',deckHash:'fixed-deck',mode:'fixed-mode'}));
test('prospective schedule is reproducible, balanced within each time block',()=>{
  const a=schedule(20,99);assert.deepEqual(a,schedule(20,99));
  for(let i=0;i<a.length;i+=2)assert.deepEqual(a.slice(i,i+2).map(r=>r.version).sort(),[...VERSIONS].sort());
  assert.equal(analyzeStrength(a).conclusion,'experiment_incomplete');
});
test('zero/all wins get bounded non-degenerate uncertainty; equal groups are inconclusive',()=>{
  assert.equal(wilson(0,0),null);assert.ok(wilson(0,10)[1]>0);assert.ok(wilson(10,10)[0]<1);
  const r=analyzeStrength(fill(schedule(10)));
  assert.equal(r.difference,0);assert.equal(r.conclusion,'inconclusive');
  assert.ok(r.ci95[0]<0&&r.ci95[1]>0);
});
test('in-game failures are non-wins; pending games cannot establish an improvement',()=>{
  const rows=fill(schedule(100)).map(r=>({...r,result:r.version===VERSIONS[0]?'FAILURE':'WIN'}));
  assert.equal(analyzeStrength(rows).conclusion,'evidence_of_improvement');
  assert.equal(analyzeStrength(rows).groups[VERSIONS[0]].failures,100);
  rows[0].result=null;
  assert.equal(analyzeStrength(rows).conclusion,'experiment_incomplete');
});
test('duplicated games and mixed evaluation conditions are rejected',()=>{
  const rows=fill(schedule(2));
  assert.throws(()=>analyzeStrength([...rows,rows[0]]));
  rows[1].gameId=rows[0].gameId;assert.throws(()=>analyzeStrength(rows));
  rows[1].gameId='other';rows[1].model='different';assert.throws(()=>analyzeStrength(rows));
});
test('completed subsets cannot pass for the registered full experiment',()=>{
  const expectedSchedule=schedule(3),rows=fill(expectedSchedule);
  assert.throws(()=>analyzeStrength(rows.slice(0,2),{expectedSchedule}));
  assert.equal(analyzeStrength(rows,{expectedSchedule}).complete,true);
});
test('live version switch uses the new engine and rejects typos',async()=>{
  const current=await loadDecisionEngine('silverfish-v1');
  assert.equal(current.version,'silverfish-v1');assert.equal(typeof current.prepare,'function');
  await assert.rejects(loadDecisionEngine('typo'));
});
