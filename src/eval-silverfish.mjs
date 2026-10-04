// Paired, offline evaluation. No API, mouse input, environment-file loading or live game.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {tacticalCases,combatCases} from '../eval/silverfish-cases.mjs';
import {referenceReplay,meetsExpected,combatOracle} from '../eval/silverfish-oracle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
const baseline=resolve(root,arg('--baseline')??'eval/runs/silverfish-20261001/baseline');
const output=resolve(root,arg('--output')??'eval/runs/silverfish-20261001');
if(process.env.JEV_DECK)throw Error('Unset JEV_DECK for a reproducible multi-deck evaluation');
const load=async dir=>({plan:await import(pathToFileURL(join(dir,'src/plan.mjs'))),
  choose:await import(pathToFileURL(join(dir,'src/choose.mjs')))});
const versions={baseline:await load(baseline),candidate:await load(root)};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function manifest(dir){
  const out={};
  async function walk(sub){
    for(const e of (await readdir(join(dir,sub),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const p=join(sub,e.name);
      if(e.isDirectory())await walk(p);else out[p.replaceAll('\\','/')]=hash(await readFile(join(dir,p)));
    }
  }
  await walk('src');await walk('decks');return out;
}
const timed=fn=>{const t=performance.now(),result=fn();return {result,ms:performance.now()-t}};
const tactical=[];
for(const c of tacticalCases()){
  const row={id:c.id,expect:c.expect};
  for(const [name,v] of Object.entries(versions)){
    const {result,ms}=timed(()=>v.plan.search(c.state,c.actions));
    const exact=result.plans.filter(p=>p.steps.every(m=>m.exact));
    const match=exact.find(p=>meetsExpected(referenceReplay(c,p.steps),c.expect));
    const offered=v.plan.menu(c.state,c.actions,{});
    const expectedMenu=c.expect.lethal?!!offered.lethal:Object.values(offered.plans)
      .some(steps=>steps.every(m=>m.exact)&&meetsExpected(referenceReplay(c,steps),c.expect));
    row[name]={covered:!!match,offered:expectedMenu,ms,stats:result.stats??null,
      matchingSteps:match?.steps.map(({kind,id,targetId})=>({kind,id,targetId}))??null};
  }
  tactical.push(row);
}

const combat=[];
for(const [split,seed,n] of [['development',20261001,64],['held-out',20261002,128]]){
  for(const c of combatCases(seed,n)){
    const oracle=combatOracle(c),row={id:`${split}/${c.id}`,split,seed,oracle};
    for(const [name,v] of Object.entries(versions)){
      const {result,ms}=timed(()=>v.plan.search(c.state,c.actions));
      const health=c.state.opponent.board.find(b=>b.CARDTYPE==='HERO').HEALTH;
      const damage=Math.min(health,Math.max(0,...result.plans.map(p=>p.s.faceDealt)));
      const lethal=v.plan.menu(c.state,c.actions,{}).lethal;
      const proof=lethal?meetsExpected(referenceReplay(c,lethal),{lethal:true}):false;
      row[name]={damage,optimal:damage===oracle.maximum,lethal:!!lethal,proof,ms};
    }
    combat.push(row);
  }
}

// Existing expert rulings are regression data, not an unseen strength benchmark.
const positions=JSON.parse(await readFile(join(root,'eval/positions.json'),'utf8'));
const labels=JSON.parse(await readFile(join(root,'eval/labels.json'),'utf8'));
const rulings=[];
for(const c of positions.filter(c=>labels[c.id]&&!labels[c.id].skip)){
  const actions=c.options.map(({description,label,...a})=>a),row={id:c.id,label:labels[c.id]};
  for(const [name,v] of Object.entries(versions)){
    const {result:p,ms}=timed(()=>v.choose.prepare(c.state,actions));
    const hard=p.forced??p.lethal;
    const available=hard?[hard.action.id]:[...new Set(Object.keys(p.crit).map(k=>v.choose.resolve(p,k).action.id))];
    const pick=hard?.action??v.choose.resolve(p,v.choose.rulePick(p)).action;
    const credit=id=>row.label.best.includes(id)?1:row.label.ok.includes(id)?0.5:0;
    row[name]={availableBest:available.some(id=>credit(id)===1),ruleFallbackPick:pick.id,
      ruleFallbackPoints:credit(pick.id),forced:!!hard,source:hard?.source??'rule_fallback',ms};
  }
  rulings.push(row);
}

const fixtures=[];
for(const f of (await readdir(join(root,'test/fixtures/user-rulings'))).filter(f=>f.endsWith('.json')).sort()){
  const data=JSON.parse(await readFile(join(root,'test/fixtures/user-rulings',f),'utf8'));
  for(const c of Array.isArray(data)?data:[data]){
    const actions=c.options??c.actions??c.recordedOptions;
    if(!c.state||!actions?.length)continue;
    const row={id:c.id??f,expected:c.expected??null};
    for(const [name,v] of Object.entries(versions)){
      const times=[];let p;
      for(let i=0;i<3;i++){const r=timed(()=>v.choose.prepare(c.state,actions));p=r.result;times.push(r.ms)}
      const hard=p.forced??p.lethal;
      const action=hard?.action??v.choose.resolve(p,v.choose.rulePick(p)).action;
      row[name]={pick:action.id,entityId:action.entityId,targetId:action.targetId,
        source:hard?.source??'rule_fallback',medianMs:times.sort((a,b)=>a-b)[1],searchStats:p.searchStats??null};
    }
    fixtures.push(row);
  }
}

const summary={};
for(const name of Object.keys(versions)){
  const lethalRows=combat.filter(r=>r.oracle.lethal);
  summary[name]={tacticalCovered:tactical.filter(r=>r[name].covered).length,tacticalOffered:tactical.filter(r=>r[name].offered).length,
    tacticalTotal:tactical.length,combatOptimal:combat.filter(r=>r[name].optimal).length,combatTotal:combat.length,
    lethalRecall:lethalRows.filter(r=>r[name].lethal&&r[name].proof).length,lethalTotal:lethalRows.length,
    falseLethals:combat.filter(r=>r[name].lethal&&!r[name].proof).length,
    rulingBestAvailable:rulings.filter(r=>r[name].availableBest).length,rulingTotal:rulings.length,
    ruleFallbackPoints:rulings.reduce((n,r)=>n+r[name].ruleFallbackPoints,0),
    fixtureMedianMs:fixtures.map(r=>r[name].medianMs).sort((a,b)=>a-b)[Math.floor(fixtures.length/2)],
    fixtureMaxMedianMs:Math.max(...fixtures.map(r=>r[name].medianMs))};
}
const regression={lostTactics:tactical.filter(r=>r.baseline.covered&&!r.candidate.covered).map(r=>r.id),
  lostCombat:combat.filter(r=>r.baseline.optimal&&!r.candidate.optimal).map(r=>r.id),
  lostRulingAvailability:rulings.filter(r=>r.baseline.availableBest&&!r.candidate.availableBest).map(r=>r.id),
  worseFallback:rulings.filter(r=>r.candidate.ruleFallbackPoints<r.baseline.ruleFallbackPoints).map(r=>r.id)};
const result={schema:1,createdAt:new Date().toISOString(),node:process.version,platform:process.platform,
  scope:'offline search capability, exact synthetic oracle, existing ruling regressions; no model calls or win-rate evidence',
  baseline:relative(root,baseline),sourceHashes:{baseline:await manifest(baseline),candidate:await manifest(root)},
  corpusHashes:{cases:hash(await readFile(join(root,'eval/silverfish-cases.mjs'))),oracle:hash(await readFile(join(root,'eval/silverfish-oracle.mjs'))),
    positions:hash(await readFile(join(root,'eval/positions.json'))),labels:hash(await readFile(join(root,'eval/labels.json'))),
    packageLock:hash(await readFile(join(root,'package-lock.json')))},
  summary,regression,tactical,combat,rulings,fixtures};
await mkdir(output,{recursive:true});
await writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
const b=summary.baseline,a=summary.candidate;
const report=`# Silverfish 可複驗離線比較\n\n執行時間：${result.createdAt}；Node ${result.node}。基準保存的是本次修改前、包含既有未提交改動的 src 與 decks。來源與題庫 SHA256、每題序列、截斷資訊與結果見 results.json。\n\n| 指標 | 修改前 | 修改後 |\n|---|---:|---:|\n| 固定棄牌戰術可搜尋 | ${b.tacticalCovered}/${b.tacticalTotal} | ${a.tacticalCovered}/${a.tacticalTotal} |\n| 固定棄牌戰術進入實際選單 | ${b.tacticalOffered}/${b.tacticalTotal} | ${a.tacticalOffered}/${a.tacticalTotal} |\n| 窮舉最佳有效打臉傷害 | ${b.combatOptimal}/${b.combatTotal} | ${a.combatOptimal}/${a.combatTotal} |\n| 斬殺召回（獨立重播確認） | ${b.lethalRecall}/${b.lethalTotal} | ${a.lethalRecall}/${a.lethalTotal} |\n| 錯誤斬殺宣告 | ${b.falseLethals} | ${a.falseLethals} |\n| 舊裁定最佳第一步仍可選 | ${b.rulingBestAvailable}/${b.rulingTotal} | ${a.rulingBestAvailable}/${a.rulingTotal} |\n| 規則備援裁定分數（非 Jev） | ${b.ruleFallbackPoints}/${b.rulingTotal} | ${a.ruleFallbackPoints}/${a.rulingTotal} |\n| 真實 fixture 中位耗時 | ${b.fixtureMedianMs.toFixed(2)} ms | ${a.fixtureMedianMs.toFixed(2)} ms |\n| 最慢 fixture 中位耗時 | ${b.fixtureMaxMedianMs.toFixed(2)} ms | ${a.fixtureMaxMedianMs.toFixed(2)} ms |\n\n回歸：${JSON.stringify(regression)}\n\n64 個 development 與 128 個 held-out 純戰鬥盤面由固定種子產生，窮舉器不引用正式 sim/plan/policy 或評分權重。8 個棄牌案例為規則推導的針對性測試；它們證明新增能力，不代表整體棋力。舊裁定是已用於開發的資料，不算盲測。未知抽牌、隨機傷害/召喚、同費並列皆停下觀察；沒有驗證完整爐石事件系統。\n\n本報告沒有呼叫 Jev，也沒有新舊版本實戰。因此可以判斷搜尋能力與指定局面正確性，不能宣稱 Jev 決策更好或實戰勝率提升。時間會受同機負載影響，重跑時看量級與最慢題，不要求毫秒一致。\n\n重跑：在專案根目錄執行 npm run eval-silverfish。\n`;
await writeFile(join(output,'report.md'),report);
console.log(JSON.stringify({summary,regression,report:join(output,'report.md')},null,2));
if(regression.lostTactics.length||regression.lostCombat.length||regression.lostRulingAvailability.length||regression.worseFallback.length
  ||summary.candidate.falseLethals)process.exitCode=1;
