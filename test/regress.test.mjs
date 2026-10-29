// Regression question bank (src/regress.mjs, eval/regress/questions.json): structure checks only.  The full model
// run is `npm run regress`, NOT part of npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadQuestions,loadPosition,idMatches,compareReports,LIVE_MODELS,F881_TOLERANCE} from '../src/regress.mjs';
import {EXAM_SEED_BASE,F881_DECKS,loadExamNets,gamePositions,isDry} from '../src/regress-f881.mjs';

const ROOT=resolve(fileURLToPath(import.meta.url),'../..');
const questions=loadQuestions();
const positions=questions.filter(q=>q.kind==='position');
const categories=questions.filter(q=>q.kind==='category');

test('regress: manifest loads, ids are unique, every question names a live deck', () => {
  assert.ok(questions.length>0);
  assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
  for(const q of questions){
    assert.ok(q.deck in LIVE_MODELS,`${q.id}: unknown deck ${q.deck}`);
    assert.ok(['user','measured'].includes(q.evidence),`${q.id}: evidence`);
    assert.ok(q.unsupported===null||(typeof q.unsupported==='string'&&q.unsupported.length>10),`${q.id}: unsupported needs a reason`);
  }
});

test('regress: every supported position has a fixture whose options contain its best / ok / forbidden ids', () => {
  assert.ok(positions.length>0);
  for(const q of positions){
    assert.ok(existsSync(resolve(ROOT,q.source.file)),`${q.id}: missing fixture ${q.source.file}`);
    if(q.unsupported)continue;
    const {state,options}=loadPosition(q);
    assert.ok(state&&Array.isArray(options)&&options.length>0,`${q.id}: no options`);
    const ids=options.map(o=>o.id);
    for(const field of ['best','ok','forbidden']){
      for(const spec of q[field]??[]){
        if(spec.startsWith('re:')){
          const re=new RegExp(spec.slice(3));
          assert.ok(ids.some(i=>re.test(i)),`${q.id}.${field}: ${spec} matches no option`);
        }else assert.ok(ids.includes(spec),`${q.id}.${field}: ${spec} is not an option (${ids.join(',')})`);
      }
    }
    assert.ok(q.best.length||q.forbidden.length,`${q.id}: nothing to grade`);
  }
});

test('regress: idMatches handles exact ids and re: patterns', () => {
  assert.ok(idMatches('o1','o1'));
  assert.ok(!idMatches('o1','o10'));
  assert.ok(idMatches('re:^o3t','o3t2'));
  assert.ok(!idMatches('re:^o3t','o3'));
  assert.ok(!idMatches('o1',null));
});

test('regress: category questions point at an existing index with entries, and the exam seed stays out of training ranges', () => {
  assert.ok(categories.length>0);
  for(const q of categories){
    assert.ok(q.deck in F881_DECKS,`${q.id}: no F-881 generator for ${q.deck}`);
    const idx=JSON.parse(readFileSync(resolve(ROOT,q.index),'utf8'));
    const d=idx.decks[q.deck];
    assert.ok(d&&d.entries.length>0,`${q.id}: empty index`);
    assert.equal(d.generator,q.generator);
    assert.equal(idx.seedBase,EXAM_SEED_BASE);
  }
  assert.ok(EXAM_SEED_BASE>=1_000_000_000,'exam seeds stay above the training / audit / duel / evaluate ranges');
});

test('regress: the F-881 generator is deterministic for a fixed exam seed', () => {
  const deck='warlock-zakajz';
  const nets=loadExamNets(deck);
  const idx=JSON.parse(readFileSync(resolve(ROOT,'eval/regress/f881-index.json'),'utf8')).decks[deck].entries;
  const [g,ownTurn]=idx[0];
  const run=()=>[...gamePositions(g,nets)].map(p=>({ownTurn:p.ownTurn,turn:p.s0.turn,hand:p.s0.hand.map(c=>c.name).join('|'),dry:isDry(p.s0,nets.generator,p.me)}));
  const a=run(),b=run();
  assert.deepEqual(a,b);
  const hit=a.find(p=>p.ownTurn===ownTurn);
  assert.ok(hit&&hit.dry,'the indexed position is still DRY under the generator');
});

test('regress: compareReports flags worse results and a higher F-881 rate, not equal or better ones', () => {
  const mk=rows=>({model:'m',questions:rows});
  const base=mk([{id:'a',result:'pass'},{id:'b',result:'ok'},{id:'c',result:'fail'},{id:'d',result:'pass'},{id:'cat',result:'measured',evidence:'measured',rate:0.10}]);
  const cur=mk([{id:'a',result:'ok',top:'o2'},{id:'b',result:'pass'},{id:'c',result:'fail'},{id:'cat',result:'measured',evidence:'measured',rate:0.10+F881_TOLERANCE+0.01},{id:'e',result:'pass'}]);
  const r=compareReports(base,cur);
  assert.deepEqual(r.regressions.map(x=>x.id).sort(),['a','cat']);
  assert.deepEqual(r.improvements.map(x=>x.id),['b']);
  assert.deepEqual(r.added,['e']);
  assert.deepEqual(r.missing,['d']);
  const same=compareReports(base,base);
  assert.equal(same.regressions.length,0);
  const near=compareReports(base,mk([{id:'cat',result:'measured',evidence:'measured',rate:0.10+F881_TOLERANCE}]));
  assert.equal(near.regressions.length,0);
});

test('regress: tracked baselines exist for every live model and parse', () => {
  for(const model of new Set(Object.values(LIVE_MODELS))){
    const f=resolve(ROOT,`eval/regress/baseline-${model}.json`);
    assert.ok(existsSync(f),`missing baseline ${f}`);
    const b=JSON.parse(readFileSync(f,'utf8'));
    assert.ok(Array.isArray(b.questions));
  }
});
