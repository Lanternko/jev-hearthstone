import test from 'node:test';
import assert from 'node:assert/strict';
import {openingCardStats} from '../src/opening-card-stats.mjs';
const card=name=>({name}),game=(id,result,offered,kept,final,flags={})=>({id,result,initiative:'first',matchup:{type:'other'},
  offered:offered.map(card),kept:kept.map(card),finalOpening:final.map(card),
  originalOpeningComplete:true,receiptComplete:true,finalOpeningComplete:true,...flags});
test('offered, kept and final distinguish replacements and count duplicate copies once',()=>{
  const gs=[game('a','Win',['A','A'],['A','A'],['A','A']),game('b','Loss',['A'],[],['B']),game('c','Win',['B'],[],['A'])];
  const q=openingCardStats(gs).quadrants.other_first;
  assert.equal(q.metrics.original.cards.A.present.n,2);assert.equal(q.metrics.original.cards.A.present.wins,1);
  assert.equal(q.metrics.kept.cards.A.present.n,1);assert.equal(q.metrics.kept.cards.A.present.wins,1);
  assert.equal(q.metrics.final.cards.A.present.n,2);assert.equal(q.metrics.final.cards.A.present.wins,2);
  assert.equal(q.metrics.final.cards.A.without.n,1);
});
test('incomplete receipt does not exclude separately verified final hand; unknown opponent stays excluded',()=>{
  const gs=[game('a','Win',['A'],[],['B'],{receiptComplete:false}),game('b','Loss',['A'],['A'],[],{finalOpeningComplete:false}),
    game('c','Win',['A'],['A'],['A'],{matchup:{type:null}})];
  const s=openingCardStats(gs,{cardNames:['Never']}),q=s.quadrants.other_first;
  assert.equal(s.classifiedValid,2);assert.equal(q.metrics.kept.baseline.n,1);assert.equal(q.metrics.final.baseline.n,1);
  assert.equal(q.metrics.original.baseline.n,2);assert.equal(q.metrics.final.cards.Never.present.winRate,null);
  assert.throws(()=>openingCardStats([gs[0],gs[0]]),/Duplicate/);
});
