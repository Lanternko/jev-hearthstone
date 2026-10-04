import test from 'node:test';
import assert from 'node:assert/strict';
import {mulliganMatchup} from '../src/mulligan-matchup.mjs';
import {prepare} from '../src/choose.mjs';
import {matchupObjective} from '../src/matchup-objective.mjs';
const prior=(decisionWeight,board=.8)=>({confidence:decisionWeight*2,decisionWeight,mulliganProbabilities:{board,pressure:1-board,unknown:0}});
test('confidence scales aggression preferences continuously and zero evidence is neutral',()=>{
 const none=mulliganMatchup(prior(0)),weak=mulliganMatchup(prior(.05)),strong=mulliganMatchup(prior(.35));
 assert.deepEqual(Object.values(none.preferences),[1,1,1,1]);
 assert.ok(strong.preferences.efficientTrade>weak.preferences.efficientTrade);
 assert.ok(strong.preferences.conditionalSlowSetup<weak.preferences.conditionalSlowSetup);
 assert.ok(mulliganMatchup(prior(.35,.1)).preferences.immediatePressure>strong.preferences.immediatePressure);
});
test('live mulligan preparation exposes the weighted strategy in logged objective',()=>{
 const state={turn:1,me:{heroClass:'WARLOCK',hand:[],board:[],maxMana:0},opponent:{heroClass:'MAGE',board:[],publicPlays:[]},choice:{type:'MULLIGAN',entities:[]}};
 const p=prepare(state,[{id:'m1',type:'MULLIGAN',replace:[]},{id:'m2',type:'MULLIGAN',replace:[]}]);
 assert.equal(p.objective.mulligan.version,'confidence-mulligan-v1');
 assert.equal(p.objective.mulligan.decisionWeight,p.objective.prior.decisionWeight);
 assert.ok(p.objective.mulligan.guess.unknown>0);
 assert.equal(matchupObjective({...state,choice:null}).mulligan,null);
});
