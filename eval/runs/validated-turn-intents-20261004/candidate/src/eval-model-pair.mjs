// Frozen, bounded, read-only API comparison. Never launches or clicks a game.
import {readFile,writeFile,mkdir,cp,readdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepare,resolve,INSTRUCTIONS} from './choose.mjs';
import {constrainActions} from './policy.mjs';
import {criteria} from './describe.mjs';
import {deckFor} from './deck.mjs';
import {boardEffectAssessments,EFFECT_VERSION} from './effect-state.mjs';
import {ask} from './jev.mjs';
import {scorePick,summarizeModel,pairedComparison} from './decision-benchmark.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const models=['typesafe-ai/jev','liquid/d1'],repeats=2,budgetUSD=0.25,timeoutMs=5000;
const live=process.argv.includes('--live');
const replayArg=process.argv.indexOf('--replay');
const replayDir=replayArg<0?null:process.argv[replayArg+1];
if(replayArg>=0&&!replayDir)throw Error('--replay requires a frozen run directory');
const replayManifest=replayDir?JSON.parse(await readFile(join(replayDir,'manifest.json'),'utf8')):null;
const hash=s=>createHash('sha256').update(s).digest('hex');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const dir=join(root,'eval/runs',`model-pair-${stamp}`);
await mkdir(dir,{recursive:true});
const positionsText=await readFile(replayDir?join(replayDir,'positions.json'):join(root,'eval/positions.json'),'utf8');
const labelsText=await readFile(replayDir?join(replayDir,'labels.json'):join(root,'eval/labels.json'),'utf8');
const labels=JSON.parse(labelsText);
const positions=JSON.parse(positionsText).filter(p=>labels[p.id]&&!labels[p.id].skip&&labels[p.id].best.length);
await cp(join(root,'src'),join(dir,'source/src'),{recursive:true});
await cp(join(root,'decks'),join(dir,'source/decks'),{recursive:true});
await cp(join(root,'package.json'),join(dir,'source/package.json'));
await writeFile(join(dir,'positions.json'),positionsText);
await writeFile(join(dir,'labels.json'),labelsText);
const sourceHashes={};
for(const f of await readdir(join(root,'src')))
  sourceHashes[`src/${f}`]=hash(await readFile(join(root,'src',f)));

const catalogResponse=await fetch('https://ai-gateway.vercel.sh/v1/models');
if(!catalogResponse.ok)throw Error(`Public catalog HTTP ${catalogResponse.status}`);
const catalog=await catalogResponse.json();
const prices=Object.fromEntries(models.map(id=>{
  const m=catalog.data.find(m=>m.id===id);
  if(!m||m.type!=='evaluation'||!Number.isFinite(Number(m.pricing?.input))
    ||Number(m.pricing.input)>0.00000005||Number(m.pricing.output)!==0)
    throw Error(`Unexpected model/price for ${id}; no calls made`);
  return [id,{input:Number(m.pricing.input),output:Number(m.pricing.output),context:m.context_window}];
}));
const requests=[],pipeline=[];
if(replayDir){
  const frozen=JSON.parse(await readFile(join(replayDir,'requests.json'),'utf8'));
  if(hash(JSON.stringify(frozen))!==replayManifest.requestsHash
    ||hash(positionsText)!==replayManifest.positionsHash||hash(labelsText)!==replayManifest.labelsHash)
    throw Error('Frozen input checksum mismatch; no calls made');
  requests.push(...frozen);pipeline.push(...replayManifest.pipeline);
}
for(const p of replayDir?[]:positions){
  const options=p.options.map(({label,description,...a})=>a);
  const direct={crit:criteria(p.state,options)};
  const state={board:p.state,strategy:deckFor(p.state).strategy,
    effectAssessments:{version:EFFECT_VERSION,cards:boardEffectAssessments(p.state)}};
  const questions={move:{type:'choice',instructions:INSTRUCTIONS,criteria:direct.crit}};
  for(let repeat=0;repeat<repeats;repeat++)requests.push({track:'selector',id:p.id,repeat,state,questions,options});
  const pr=prepare(p.state,constrainActions(p.state,options));
  if(pr.forced||pr.lethal){const f=pr.forced??pr.lethal;
    pipeline.push({id:p.id,kind:'forced',source:f.source,pick:f.action.id,
      ...scorePick(labels[p.id],options,f.action.id)});
  }else{
    const mapping=Object.fromEntries(Object.keys(pr.crit).map(id=>[id,resolve(pr,id).action.id]));
    pipeline.push({id:p.id,kind:'model',bestAvailable:Object.values(mapping).some(id=>labels[p.id].best.includes(id)),mapping});
    requests.push({track:'pipeline',id:p.id,repeat:0,state,
      questions:{move:{type:'choice',instructions:INSTRUCTIONS,criteria:pr.crit}},options,mapping});
  }
}
const conservativeCost=requests.reduce((sum,r)=>sum+models.reduce((s,m)=>s+
  Buffer.byteLength(JSON.stringify({state:r.state,questions:r.questions}),'utf8')*prices[m].input,0),0);
if(conservativeCost>budgetUSD)throw Error(`Conservative input bound ${conservativeCost} exceeds ${budgetUSD}; no calls made`);
const manifest={createdAt:new Date().toISOString(),models,repeats,budgetUSD,conservativeCost,timeoutMs,
  maxCalls:requests.length*models.length,prices,catalogURL:'https://ai-gateway.vercel.sh/v1/models',
  sourceHashes,positionsHash:hash(positionsText),labelsHash:hash(labelsText),
  requestsHash:hash(JSON.stringify(requests)),scorablePositions:positions.length,
  replayedFrom:replayDir,originalBuilderHashes:replayManifest?.sourceHashes??null,
  modelVersionCaveat:'Gateway IDs are aliases; the current response does not expose a pinned vendor weights checkpoint. Replay fixes inputs, not future answers.',
  policy:'Alternate model order by position/repeat; no retry or fallback; 3 consecutive errors stop a model; errors score zero; no changes to labels after observing answers.',
  pipelineContract:replayManifest?.pipelineContract??'constrainActions(state, options) -> prepare -> ask -> resolve first action, matching bridge.mjs',
  scope:'Development regression only. Includes restored synthetic options. No held-out or ranked win-rate claim.',pipeline};
await writeFile(join(dir,'requests.json'),JSON.stringify(requests,null,2));
await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({dir,positions:positions.length,calls:manifest.maxCalls,conservativeCost,live}));
if(!live){console.log('Dry preparation only; add --live for bounded API comparison.');process.exit(0)}
// Public prices above were checked in this process. No .env.local edits.
process.env.JEV_PRICING_CHECKED_UNTIL=new Date(Date.now()+24*60*60*1000).toISOString();
const rows=[],streak=Object.fromEntries(models.map(m=>[m,0]));
let stopped=false,knownCost=0;
for(let i=0;i<requests.length&&!stopped;i++){
  const req=requests[i],order=(i%2)?[...models].reverse():models;
  for(const model of order){
    const row={track:req.track,id:req.id,repeat:req.repeat,requestedModel:model,requestHash:hash(JSON.stringify(req))};
    if(streak[model]>=3){Object.assign(row,{status:'circuit_open',points:0});}
    else try{
      const r=await ask(req.state,req.questions,{model,timeoutMs});
      const pick=r.answers.move.choice;
      if(!Object.hasOwn(req.questions.move.criteria,pick))throw Error('Returned choice outside frozen candidate menu');
      Object.assign(row,{status:'ok',returnedModel:r.model,pick,actionPick:req.mapping?.[pick]??pick,
        latencyMs:r.latencyMs,answers:r.answers,usage:r.usage,metadata:r.metadata,
        costUSD:r.metadata?.gateway?.cost==null?null:Number(r.metadata.gateway.cost)});
      Object.assign(row,scorePick(labels[req.id],req.options,row.actionPick));
      streak[model]=0;knownCost+=row.costUSD??0;
    }catch(e){Object.assign(row,{status:'error',error:String(e.message).slice(0,500),points:0});streak[model]++;}
    rows.push(row);await appendFile(join(dir,'results.jsonl'),JSON.stringify(row)+'\n');
    console.log(`${req.track} ${req.id} repeat ${req.repeat+1} ${model}: ${row.verdict??row.status}`);
    if(knownCost>=budgetUSD){stopped=true;break;}
  }
}
const summary={createdAt:new Date().toISOString(),knownCostUSD:knownCost,stoppedForBudget:stopped,
  byTrack:Object.fromEntries(['selector','pipeline'].map(track=>[track,{
    models:Object.fromEntries(models.map(model=>[model,summarizeModel(rows.filter(r=>r.track===track&&r.requestedModel===model))])),
    pairs:pairedComparison(rows.filter(r=>r.track===track),models)}]))};
await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));
const table=track=>models.map(m=>{const s=summary.byTrack[track].models[m];return `| ${m} | ${s.points}/${s.n} | ${s.best} | ${s.errors} | ${s.latencyMedianMs??'—'} | ${s.latencyP95Ms??'—'} | ${s.costUSD.toFixed(6)} |`;}).join('\n');
const report=`# Jev / d1 固定盤面配對比較\n\n${manifest.createdAt}；16 個既有開發裁定不是盲測；恢復的 synthetic 候選也不是原始完整合法選單。兩次重複不是新增独立盤面。\n\n## 固定候選直接比較\n\n| 模型 | 分數 | 最佳次數 | 服務錯誤 | 延遲中位 ms | P95 ms | 收據費用 US$ |\n|---|---:|---:|---:|---:|---:|---:|\n${table('selector')}\n\n配對：${JSON.stringify(summary.byTrack.selector.pairs)}\n\n## 現行規則與搜尋流程\n\n${pipeline.filter(p=>p.kind==='forced').length} 題由程式決定，${pipeline.filter(p=>p.kind==='model').length} 題交給模型。forced 題不算任一模型的成績；只評判計畫第一步，未裁定整段計畫。先 constrainActions 再 prepare，與 bridge 的順序一致。\n\n| 模型 | 分數 | 最佳次數 | 服務錯誤 | 延遲中位 ms | P95 ms | 收據費用 US$ |\n|---|---:|---:|---:|---:|---:|---:|\n${table('pipeline')}\n\n配對：${JSON.stringify(summary.byTrack.pipeline.pairs)}\n\n總收據費用 US$${knownCost.toFixed(6)}；缺失費用收據不得當作免費。API 錯誤保留並以零分计入。原標籤、來源與請求 SHA256、候選及完整答案保存在本目錄。未啟動排位、未更換正式模型。\n\n重跑：node --env-file-if-exists=.env.local src/eval-model-pair.mjs --live（建立新時間戳批次）；歷史 frozen requests 可用相同 ask 介面重播，不能覆寫本批次。\n`;
await writeFile(join(dir,'report.md'),report);
console.log(JSON.stringify({dir,summary}));
