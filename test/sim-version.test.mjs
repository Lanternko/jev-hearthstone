import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {simFiles,simVersion} from '../src/sim-version.mjs';
import {compare} from '../src/selfplay-compare.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));

test('G2: the simulator version covers the rules, the card data and the decks, and nothing of the network', ()=>{
  const files=simFiles();
  for(const f of ['src/sim.mjs','src/selfplay.mjs','src/mechanics.mjs','data/cards.enUS.json','decks/warlock-zoo/list.json'])assert.ok(files.includes(f),f);
  assert.ok(!files.some(f=>/selfplay-(net|encode|env|match)|^train\//.test(f)),files.join(' '));
  assert.match(simVersion(),/^[0-9a-f]{12}$/);
  assert.equal(simVersion(),simVersion());
});

test('G2: the version does not change with Windows line ends, and does with one rule', ()=>{
  const dir=mkdtempSync(join(tmpdir(),'simv-'));
  try{
    for(const f of simFiles())cpSync(join(root,f),join(dir,f));
    const lf=simVersion(dir);
    writeFileSync(join(dir,'src/sim.mjs'),String(spawnSync('node',['-e',"process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8').replace(/\\r?\\n/g,'\\r\\n'))",join(root,'src/sim.mjs')],{windowsHide:true}).stdout));
    assert.equal(simVersion(dir),lf);
    writeFileSync(join(dir,'src/sim.mjs'),'// one more line\n',{flag:'a'});
    assert.notEqual(simVersion(dir),lf);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('G2: the env names its simulator version when it is reset', ()=>{
  const r=spawnSync('node',['src/selfplay-env.mjs'],{cwd:root,input:JSON.stringify({cmd:'reset',n:1,seed:1})+'\n',encoding:'utf8',windowsHide:true,timeout:60000});
  const out=JSON.parse(r.stdout.split('\n').find(l=>l.startsWith('{')));
  assert.equal(out.sim,simVersion());
});

const run=(path,o={})=>({path,a:'x.json',b:'y.json',deck:['warlock-zoo','priest-egg'],look:'',guard:'egg',seed:1,sim:'26db915e1733',
  orders:[{first:0,games:50,a:30},{first:1,games:50,a:20}],...o});

test('G3: two sides played in different simulators, or one without a version, are not compared', ()=>{
  const r=compare([run('base')],[run('cand',{sim:'000000000000'})]);
  assert.equal(r.comparable,false);
  assert.match(r.problems.join('\n'),/different simulator versions/);
  const old=compare([run('base',{sim:undefined})],[run('cand')]);
  assert.equal(old.comparable,false);
  assert.match(old.problems.join('\n'),/base: no simulator version/);
});

test('G3: two sides that did not play the same opponent, guard, seeds or games are not compared', ()=>{
  for(const o of [{b:'z.json'},{guard:''},{seed:2},{deck:['warlock-zoo','shaman-x']},{orders:[{first:0,games:40,a:30},{first:1,games:50,a:20}]}])
    assert.equal(compare([run('base')],[run('cand',o)]).comparable,false,JSON.stringify(o));
});

test('G3: runs of a side whose seeds are closer than their games replay the same deals and are not added up', ()=>{
  const r=compare([run('b1'),run('b2',{seed:2})],[run('c1'),run('c2',{seed:2})]);
  assert.equal(r.comparable,false);
  assert.match(r.problems.join('\n'),/b1 \(games 1–50\) and b2 \(from 2\) replay the same games/);
  assert.equal(compare([run('b1'),run('b2',{seed:51})],[run('c1'),run('c2',{seed:51})]).comparable,true);
});

test('G3: several seeds a side are added up and tested against the gate', ()=>{
  const base=[run('b1'),run('b2',{seed:1001})];
  const up=o=>[run('c1',{orders:[{first:0,games:50,a:40},{first:1,games:50,a:35}]}),run('c2',{seed:1001,orders:[{first:0,games:50,a:40},{first:1,games:50,a:35}],...o})];
  const r=compare(base,up(),{beat:true,maxDrop:1.5});
  assert.equal(r.comparable,true);
  assert.equal(r.seeds,2);
  assert.deepEqual([r.base.wins,r.base.games,r.cand.wins,r.cand.games],[100,200,150,200]);
  assert.equal(r.ok,true);
  const down=compare(base,[run('c1',{orders:[{first:0,games:50,a:29},{first:1,games:50,a:19}]}),run('c2',{seed:1001,orders:[{first:0,games:50,a:29},{first:1,games:50,a:19}]})],{maxDrop:1.5});
  assert.equal(down.ok,false);
  assert.match(down.fails[0],/2\.0 points below/);
  assert.equal(compare(base,base,{beat:true}).ok,false);
});
