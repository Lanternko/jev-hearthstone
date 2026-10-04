import test from 'node:test';
import assert from 'node:assert/strict';
import {scorePick,summarizeModel,pairedComparison} from '../src/decision-benchmark.mjs';
test('missing candidates cannot earn a labelled best score',()=>{
  assert.deepEqual(scorePick({best:['x'],ok:['a']},[{id:'a'}],'x'),{points:0,verdict:'invalid'});
  assert.equal(scorePick({best:['x'],ok:['a']},[{id:'a'}],'a').points,0.5);
});
test('API failures remain in score denominator and incomplete pairs are explicit',()=>{
  const rows=[{track:'selector',id:'x',repeat:0,requestedModel:'a',status:'error',points:0},
    {track:'selector',id:'x',repeat:0,requestedModel:'b',status:'ok',points:1,verdict:'best',latencyMs:20,costUSD:0.01},
    {track:'selector',id:'y',repeat:0,requestedModel:'a',status:'ok',points:1,verdict:'best',latencyMs:10}];
  assert.equal(summarizeModel(rows.filter(r=>r.requestedModel==='a')).n,2);
  assert.equal(summarizeModel(rows.filter(r=>r.requestedModel==='a')).missingCostReceipts,1);
  const p=pairedComparison(rows,['a','b']);assert.equal(p.rightBetter,1);assert.equal(p.incomplete,1);
  assert.throws(()=>pairedComparison([...rows,rows[0]],['a','b']),/duplicate/);
});
