import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opponentPrior} from '../src/opponent-prior.mjs';
import {matchupObjective} from '../src/matchup-objective.mjs';
const row=(type,heroClass='MAGE',forty=false,cards=[])=>({type,heroClass,forty,cards});
const data={source:'test',window:{},trainedThrough:'2026-10-01',rows:[
 ...Array.from({length:20},()=>row('tempo')),
 ...Array.from({length:15},()=>row('control','PRIEST',true,['clear'])),
 ...Array.from({length:5},()=>row('combo','MAGE',true,['quest'])),
 ...Array.from({length:5},()=>row('unknown','MAGE'))]};
const state=(heroClass='MAGE')=>({turn:1,me:{heroClass:'WARLOCK',maxMana:0},opponent:{heroClass,board:[],publicPlays:[]}});
test('class priors differ, retain unknown mass, normalize aliases and expose sample support',()=>{
 const a=opponentPrior(state(),data),b=opponentPrior(state('Priest'),data);
 assert.ok(a.probabilities.tempo>b.probabilities.tempo);
 assert.ok(b.probabilities.control>a.probabilities.control);
 assert.ok(a.probabilities.unknown>0);
 assert.equal(a.sampleSize,30);
 assert.equal(a.mulliganProbabilities.pressure,a.probabilities.control+a.probabilities.combo);
 assert.equal(a.mulliganProbabilities.board,a.probabilities.tempo);
 assert.equal(a.mulliganProbabilities.unknown,a.probabilities.unknown);
 assert.ok(a.decisionWeight<a.confidence,'class-only prediction gets weak decision influence');
 assert.ok(Math.abs(Object.values(a.probabilities).reduce((s,x)=>s+x,0)-1)<1e-12);
 assert.deepEqual(opponentPrior(state('Mage'),data),a);
 assert.equal(opponentPrior(state('HUNTER'),data).confidence,0);
});
test('opening forty-card signal updates the class prior but does not hard-label control',()=>{
 const s=state(),before=opponentPrior(s,data);
 s.choice={type:'MULLIGAN'};s.opponent.deckCount=37;s.opponent.handCount=3;
 const after=opponentPrior(s,data);
 assert.ok(after.probabilities.combo>before.probabilities.combo);
 assert.equal(after.sampleSize,5);assert.equal(after.highProbability,null);
 s.choice=null;assert.equal(opponentPrior(s,data).sampleSize,30,'current deck size after drawing cannot masquerade as opening size');
});

test('a conventional forty-card Coin opening uses the same cohort before Health is updated',()=>{
 const first=state();first.choice={type:'MULLIGAN'};first.opponent.deckCount=37;first.opponent.handCount=3;
 const second=structuredClone(first);second.opponent.deckCount=36;second.opponent.handCount=5;
 second.opponent.initialHealth=null;second.opponent.board=[{CARDTYPE:'HERO',HEALTH:30}];
 const a=opponentPrior(first,data),b=opponentPrior(second,data);
 assert.deepEqual(b.probabilities,a.probabilities);assert.equal(b.sampleSize,5);
 assert.equal(b.highProbability,null);assert.match(b.evidence.at(-1),/inferred.*consistent with Coin/);
 second.choice=null;assert.equal(opponentPrior(second,data).sampleSize,30,
  'mid-game counts must not masquerade as a forty-card opening');
});

test('a thirty-card Coin opening and unrelated totals do not get the forty-card prior',()=>{
 for(const [deckCount,handCount] of [[26,5],[35,6],[38,3]]){
  const s=state();s.choice={type:'MULLIGAN'};Object.assign(s.opponent,{deckCount,handCount});
  assert.equal(opponentPrior(s,data).sampleSize,30);
  assert.ok(!opponentPrior(s,data).evidence.some(x=>/inferred forty/.test(x)));
 }
});

test('public count snapshots from the stopped batch expose the corrected opening signal',()=>{
 const {rows}=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-forty-opening-counts.json',import.meta.url)));
 assert.equal(rows.length,4);
 for(const {state:s} of rows){
  const p=opponentPrior(s);
  assert.ok(p.evidence.some(e=>/inferred forty/.test(e)),s.opponent.heroClass);
  assert.ok(p.decisionWeight<=0.35,'a public opening signal stays a bounded soft preference');
 }
});
test('only current public card signatures update; hidden/future cards cannot affect estimates',()=>{
 const s=state();s.opponent.initialHealth=40;
 const baseline=opponentPrior(s,data);
 s.opponent.publicPlays=[{public:false,cardId:'quest',engineTurn:1},{public:true,cardId:'clear',engineTurn:9}];
 assert.deepEqual(opponentPrior(s,data),baseline);
 s.opponent.publicPlays=[{public:true,cardId:'quest',engineTurn:1}];
 assert.ok(opponentPrior(s,data).probabilities.combo>baseline.probabilities.combo);
});
test('live objective exposes priors, changes neutral weights and lets observed pressure/quest override',()=>{
 const s=state('MAGE'),a=matchupObjective(s);
 assert.ok(a.prior.sampleSize>0);assert.equal(a.mode,'unknown');
 assert.notEqual(a.weights.face,0.6);
 s.opponent.publicPlays=[{public:true,engineTurn:1,name:'The Forbidden Sequence',CARDTYPE:'SPELL',text:'Quest: Discover 8 cards.'}];
 assert.equal(matchupObjective(s).mode,'pressure_window');
 s.opponent.publicPlays=[{public:true,engineTurn:1,name:'Aggressive body',CARDTYPE:'MINION',COST:1,ATK:3,HEALTH:3}];
 assert.equal(matchupObjective(s).mode,'board_resource');
});
