// Paired rule/search/fallback check. No live models, no game or historical-label writes.
import {readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const run=resolve(process.argv[2]??'eval/runs/matchup-objective-2026-10-01T21-40-29-477Z');
const replay=process.argv.includes('--replay'),hash=x=>createHash('sha256').update(x).digest('hex');
const load=async root=>({engine:await import(pathToFileURL(join(root,'src/choose.mjs'))),policy:await import(pathToFileURL(join(root,'src/policy.mjs')))});
const old=await load(join(run,'baseline'));
async function hashes(root){
 const out={};async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const f=join(dir,e.name);if(e.isDirectory())await walk(f);else out[f.slice(root.length+1).replaceAll('\\','/')]=hash(await readFile(f));
 }}await walk(root);return out;
}
let cases;
if(!replay){
 // Tests are retained as test-source.zip, outside Node's recursive discovery.
 for(const dir of ['src','decks'])await cp(resolve(dir),join(run,'new',dir),{recursive:true,errorOnExist:true,force:false});
 const opening=await import('../test/fixtures/opening-burst-cases.mjs'),matchup=await import('../test/fixtures/matchup-objective-cases.mjs');
 const positions=await readFile('eval/positions.json'),labelsBytes=await readFile('eval/labels.json'),labels=JSON.parse(labelsBytes);
 cases=[...matchup.pairedCases(),...opening.pairedCases().map(c=>({...c,expected:c.expected.length?c.options.filter(a=>c.expected.includes(a.entityId)).map(a=>a.id):undefined,
  forbidAvailable:c.forbid?.flatMap(id=>c.options.filter(a=>a.entityId===id).map(a=>a.id))})),
  ...JSON.parse(positions).filter(p=>labels[p.id]?.best?.length&&!labels[p.id].skip).map(p=>({id:p.id,origin:'Existing human-labelled position',state:p.state,
   options:p.options.map(({label,description,...a})=>a),label:labels[p.id]}))];
 await writeFile(join(run,'inputs.json'),JSON.stringify(cases,null,2),{flag:'wx'});
 await writeFile(join(run,'manifest.json'),JSON.stringify({version:'silverfish-v1-matchup-objective-v1',baselineVersion:'silverfish-v1-opening-burst-v1',
  createdAt:new Date().toISOString(),baseline:await hashes(join(run,'baseline')),new:await hashes(join(run,'new')),
  inputsSHA256:hash(await readFile(join(run,'inputs.json'))),positionsSHA256:hash(positions),labelsSHA256:hash(labelsBytes),
  limitations:'Synthetic user cases and existing labels; policy/search/fallback comparison, no model calls or win-rate estimate.'},null,2),{flag:'wx'});
}else{
 const manifest=JSON.parse(await readFile(join(run,'manifest.json')));
 for(const version of ['baseline','new'])for(const [file,expected] of Object.entries(manifest[version]))
  if(hash(await readFile(join(run,version,file)))!==expected)throw Error(`Frozen ${version} source changed: ${file}`);
 if(hash(await readFile(join(run,'inputs.json')))!==manifest.inputsSHA256)throw Error('Frozen inputs changed');
 cases=JSON.parse(await readFile(join(run,'inputs.json')));
}
const current=await load(join(run,'new'));
function decide({engine,policy},c){
 const p=engine.prepare(c.state,policy.constrainActions(c.state,c.options));
 const forced=p.forced??p.lethal,action=forced?.action??engine.resolve(p,engine.rulePick(p)).action;
 const available=forced?[action.id]:p.acts.map(a=>a.id);
 const pass=c.expected?c.expected.includes(action.id):c.requireAvailable?c.requireAvailable.every(id=>available.includes(id))
  :c.forbidAvailable?c.forbidAvailable.every(id=>!available.includes(id)):null;
 return {pick:action.id,entityId:action.entityId??null,targetId:action.targetId??null,source:forced?.source??'rule_fallback',available,
  mode:p.objective?.mode??null,pass,
  bestAvailable:c.label?c.label.best.some(id=>available.includes(id)):null,
  forcedWrong:c.label&&forced?![...c.label.best,...c.label.ok].includes(action.id):false};
}
const rows=cases.map(c=>({id:c.id,origin:c.origin,baseline:decide(old,c),new:decide(current,c)}));
const examples=rows.filter(r=>r.new.pass!==null),labelled=rows.filter(r=>r.new.bestAvailable!==null);
const summary={examples:{n:examples.length,baselinePass:examples.filter(r=>r.baseline.pass).length,newPass:examples.filter(r=>r.new.pass).length},
 labelled:{n:labelled.length,baselineBestAvailable:labelled.filter(r=>r.baseline.bestAvailable).length,newBestAvailable:labelled.filter(r=>r.new.bestAvailable).length,
  baselineForcedWrong:labelled.filter(r=>r.baseline.forcedWrong).length,newForcedWrong:labelled.filter(r=>r.new.forcedWrong).length},
 regressions:labelled.filter(r=>r.baseline.bestAvailable&&!r.new.bestAvailable||!r.baseline.forcedWrong&&r.new.forcedWrong).map(r=>r.id)};
const result={summary,rows};
if(replay){
 if(JSON.stringify(result)!==JSON.stringify(JSON.parse(await readFile(join(run,'results.json')))))throw Error('Frozen replay differs');
 console.log(JSON.stringify({replayed:true,...summary}));
}else{
 await writeFile(join(run,'results.json'),JSON.stringify(result,null,2),{flag:'wx'});
 const lines=['# 對局目標配對驗證','',`指定路線：舊版 ${summary.examples.baselinePass}/${examples.length}；新版 ${summary.examples.newPass}/${examples.length}。`,
  `既有人工標註：${labelled.length}；最佳可選 ${summary.labelled.baselineBestAvailable} → ${summary.labelled.newBestAvailable}，强制選錯 ${summary.labelled.baselineForcedWrong} → ${summary.labelled.newForcedWrong}。`,
  '','合成盤面／規則／搜尋／備援的驗證，沒有模型呼叫、實戰勝率或即時分類準確率證明。抽牌案例只驗證合理選項不再被封鎖，沒有宣稱模型一定會選抽牌。','',
  '| 案例 | 舊版 | 新版 | 新版模式 |','|---|---|---|---|',...rows.filter(r=>r.new.pass!==null).map(r=>
   `| ${r.id} | ${r.baseline.pick}${r.baseline.available.includes('tap')?'（可抽）':''} | ${r.new.pick}${r.new.available.includes('tap')?'（可抽）':''} | ${r.new.mode??'forced'} |`),'',
  `重播：node "${join(run,'new/src/eval-matchup-objective.mjs')}" "${run}" --replay`];
 await writeFile(join(run,'report.md'),lines.join('\n'),{flag:'wx'});console.log(JSON.stringify(summary));
}
if(summary.regressions.length||summary.examples.newPass!==examples.length)process.exitCode=1;
