// Free, replayable comparison of frozen/current policy + planner. No model call.
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as current from './choose.mjs';
import {constrainActions} from './policy.mjs';

const run=resolve(process.argv[2]??'eval/runs/opening-burst-2026-10-01T21-23-06-621Z');
const baseline=await import(pathToFileURL(join(run,'baseline/src/choose.mjs')));
const oldPolicy=await import(pathToFileURL(join(run,'baseline/src/policy.mjs')));
const hash=s=>createHash('sha256').update(s).digest('hex');
async function snapshot(dir,target){
 await cp(dir,target,{recursive:true,errorOnExist:true,force:false});
 const hashes={};
 async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){
  const f=join(d,e.name);if(e.isDirectory())await walk(f);else hashes[f]=hash(await readFile(f));
 }}
 await walk(target);return hashes;
}

const inputsPath=join(run,'inputs.json'),newPath=join(run,'new');
const replay=process.argv.includes('--replay');
let newEngine=current,newPolicy={constrainActions},cases;
if(replay){
 const manifest=JSON.parse(await readFile(join(run,'new-manifest.json'),'utf8'));
 if(hash(await readFile(inputsPath))!==manifest.inputsSHA256)throw Error('Frozen inputs hash changed');
 const oldManifest=JSON.parse(await readFile(join(run,'baseline-manifest.json'),'utf8'));
 for(const [file,expected] of Object.entries(oldManifest.hashes)){
  const relative=file.replaceAll('\\','/').split('/baseline/')[1];
  if(!relative||hash(await readFile(join(run,'baseline',relative)))!==expected)throw Error(`Baseline hash changed: ${relative}`);
 }
 for(const [file,expected] of Object.entries(manifest.sourceHashes)){
  const relative=file.replaceAll('\\','/').split('/new/')[1];
  if(!relative||hash(await readFile(join(newPath,relative)))!==expected)throw Error(`New source hash changed: ${relative}`);
 }
 cases=JSON.parse(await readFile(inputsPath,'utf8'));
 newEngine=await import(pathToFileURL(join(newPath,'src/choose.mjs')));
 newPolicy=await import(pathToFileURL(join(newPath,'src/policy.mjs')));
}else{
 const {pairedCases}=await import('../test/fixtures/opening-burst-cases.mjs');
 const sourceHashes={...await snapshot(resolve('src'),join(newPath,'src')),
  ...await snapshot(resolve('decks'),join(newPath,'decks'))};
 const positionsText=await readFile('eval/positions.json','utf8'),labelsText=await readFile('eval/labels.json','utf8');
 const labels=JSON.parse(labelsText);
 cases=[...pairedCases(),...JSON.parse(positionsText).filter(p=>labels[p.id]&&!labels[p.id].skip&&labels[p.id].best?.length)
  .map(p=>({id:p.id,origin:'Existing labelled position; historical observed menu',state:p.state,
   options:p.options.map(({description,label,...a})=>a),label:labels[p.id]}))];
 for(const file of ['game120-turn2-coin-occultist.json','single-body-occultist.json']){
  const f=JSON.parse(await readFile('test/fixtures/user-rulings/'+file,'utf8'));
  if(f.state&&f.options)cases.push({id:file,origin:'Replay-derived user ruling, reconstructed options',state:f.state,options:f.options});
 }
 await writeFile(inputsPath,JSON.stringify(cases,null,2),{flag:'wx'});
 await writeFile(join(run,'new-manifest.json'),JSON.stringify({version:'silverfish-v1-opening-burst-v1',createdAt:new Date().toISOString(),
  sourceHashes,inputsSHA256:hash(await readFile(inputsPath)),positionsSHA256:hash(positionsText),labelsSHA256:hash(labelsText),
  notes:'Fixed inputs and source copies; paired deterministic policy/planner/fallback, no model or games. Do not infer win-rate uplift.'},null,2),{flag:'wx'});
}
function decide(engine,policy,c){
 const p=engine.prepare(c.state,policy.constrainActions(c.state,c.options));
 const forced=p.forced??p.lethal;
 const picked=forced?forced.action:engine.resolve(p,engine.rulePick(p)).action;
 const selectable=forced?[forced.action.id]:[...p.acts.map(a=>a.id),...Object.values(p.plans).map(s=>
  p.acts.find(a=>a.entityId===s[0].id&&(a.targetId??null)===(s[0].target??null))?.id).filter(Boolean)];
 const best=c.label?.best??[],ok=c.label?.ok??[];
 return {pick:picked.id,entityId:picked.entityId??null,targetId:picked.targetId??null,
  source:forced?.source??'deterministic_rule_fallback',selectable,
  bestAvailable:best.length?best.some(id=>selectable.includes(id)):null,
  forcedWrong:best.length&&forced?![...best,...ok].includes(picked.id):false,
  userExamplePass:c.expected?c.expected.length?c.expected.includes(picked.entityId):!c.forbid.includes(picked.entityId):null};
}
const rows=cases.map(c=>({id:c.id,origin:c.origin,baseline:decide(baseline,oldPolicy,c),new:decide(newEngine,newPolicy,c)}));
const examples=rows.filter(r=>r.new.userExamplePass!=null),labelled=rows.filter(r=>r.new.bestAvailable!=null);
const summary={examples:{n:examples.length,baselinePass:examples.filter(r=>r.baseline.userExamplePass).length,newPass:examples.filter(r=>r.new.userExamplePass).length},
 labelled:{n:labelled.length,baselineBestAvailable:labelled.filter(r=>r.baseline.bestAvailable).length,newBestAvailable:labelled.filter(r=>r.new.bestAvailable).length,
  baselineForcedWrong:labelled.filter(r=>r.baseline.forcedWrong).length,newForcedWrong:labelled.filter(r=>r.new.forcedWrong).length},
 newRegressions:labelled.filter(r=>r.baseline.bestAvailable&&!r.new.bestAvailable||!r.baseline.forcedWrong&&r.new.forcedWrong).map(r=>r.id)};
const result={summary,rows};
if(replay){
 const frozen=JSON.parse(await readFile(join(run,'results.json'),'utf8'));
 if(JSON.stringify(result)!==JSON.stringify(frozen))throw Error('Replay differs from frozen paired results');
 console.log(JSON.stringify({replayed:true,...summary}));
}else{
 await writeFile(join(run,'results.json'),JSON.stringify(result,null,2),{flag:'wx'});
 const report=['# 集中鋪場與 buff：凍結配對驗證','',
  `使用者例子：舊版 ${summary.examples.baselinePass}/${examples.length}；新版 ${summary.examples.newPass}/${examples.length}。`,
  `既有標註盤面 ${labelled.length}：最佳動作仍可選 ${summary.labelled.baselineBestAvailable} → ${summary.labelled.newBestAvailable}；強制選錯 ${summary.labelled.baselineForcedWrong} → ${summary.labelled.newForcedWrong}。`,
  `新增退步：${summary.newRegressions.join(', ')||'無'}。`,'',
  '此為規則／搜尋／斷線備援的配對檢查，不是兩個模型的盲測，不是勝率估計。例子是使用者提出的合成盤面；完整來源與歷史標註另存 inputs.json。','',
  '| 案例 | 舊版首步 | 新版首步 | 新版來源 |','|---|---|---|---|',
  ...rows.filter(r=>r.new.userExamplePass!=null||r.baseline.pick!==r.new.pick).map(r=>
   `| ${r.id} | ${r.baseline.pick} | ${r.new.pick} | ${r.new.source} |`),'',
  `重播：node src/eval-opening-burst.mjs "${run}" --replay（使用兩份凍結原始碼和同一 inputs，不呼叫模型）。`];
 await writeFile(join(run,'report.md'),report.join('\n'),{flag:'wx'});
 console.log(JSON.stringify(summary));
}
if(summary.newRegressions.length||summary.examples.newPass!==examples.length)process.exitCode=1;
