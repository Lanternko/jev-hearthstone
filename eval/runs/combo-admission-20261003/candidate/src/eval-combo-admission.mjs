// Offline paired pipeline replay. No gateway, environment file, mouse or game.
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {position,claws} from '../eval/silverfish-cases.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const output=resolve(root,arg('--output')??'eval/runs/combo-admission-20261003/replay');
const baseline=resolve(root,arg('--baseline')??'eval/runs/combo-admission-20261003/baseline');
const candidate=resolve(root,arg('--candidate')??'.');
if(process.env.JEV_DECK)throw Error('unset JEV_DECK for multi-deck replay');
const load=async dir=>({policy:await import(pathToFileURL(join(dir,'src/policy.mjs'))),
 choose:await import(pathToFileURL(join(dir,'src/choose.mjs'))),
 combo:await import(pathToFileURL(join(dir,'src/combo-admission.mjs'))).catch(e=>{
  if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return null;
 })});
const versions={baseline:await load(baseline),candidate:await load(candidate)};
const buff={name:'Alternate buff',CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'};
const payload=(n=3,cost=2)=>({name:'Alternate payoff',CARDTYPE:'SPELL',COST:cost,
 text:`When you play or discard this, summon ${n} random 1-Cost minions.`});
let cases=[{...JSON.parse(await readFile(join(root,'test/fixtures/user-rulings/new50-game18-combo-input.json'),'utf8')),
 split:'observed-ruling',expectedFirst:59,expectWeapon:true}];
// Fixed mechanic-derived grid. The test corpus informed this change: these
// are development/sensitivity results, not held-out human strategic labels.
for(const count of [1,2,3])for(const bodies of [0,1,2,4])for(const cost of [1,2,3]){
 const p=position({mana:cost+1,mine:Array.from({length:bodies},()=>({ATK:1,HEALTH:2,EXHAUSTED:1})),hand:[payload(count,cost),buff]});
 cases.push({id:`direct/${count}/${bodies}/${cost}`,split:'mechanics-grid',...p,expectedFirst:80});
}
for(const bodies of [0,1,2,4]){
 const p=position({mana:5,mine:Array.from({length:bodies},()=>({ATK:1,HEALTH:2,EXHAUSTED:1})),hand:[claws,payload(3),buff]});
 cases.push({id:`weapon/${bodies}`,split:'mechanics-grid',...p,expectWeapon:true});
}
const coin={name:'The Coin',CARDTYPE:'SPELL',COST:0,text:'Gain 1 Mana Crystal this turn only.'};
cases.push({id:'coin/future-body',split:'mechanics-grid',...position({mana:1,hand:[coin,
 {name:'Plain body',CARDTYPE:'MINION',COST:2,ATK:2,HEALTH:3,text:''},{...buff,COST:0}]}),expectedFirst:80});
let negatives=[];
for(const [id,change] of [
 ['frozen',c=>c.state.me.board[0].FROZEN=1],
 ['exhausted',c=>c.state.me.board[0].EXHAUSTED=1],
 ['tie',c=>c.state.me.hand.push({...payload(3),entityId:999})],
 ['secret',c=>c.state.opponent.secretCount=1],
 ['clipped',c=>{while(c.state.me.board.filter(x=>x.CARDTYPE==='MINION').length<5)c.state.me.board.push({entityId:900+c.state.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:2});}],
 ['no-buff-mana',c=>c.state.me.mana=0],
 ['unmodelled-summon-engine',c=>c.state.me.board.push({entityId:999,CARDTYPE:'MINION',ATK:1,HEALTH:2,text:'After you summon a minion, deal 1 damage to a random enemy.'})]
 ]){
 const c={id,...position({mana:1,hand:[payload(3),buff],weapon:claws})};change(c);negatives.push(c);
}
if(arg('--inputs')){
 const frozen=JSON.parse(await readFile(resolve(root,arg('--inputs')),'utf8'));
 cases=frozen.cases;negatives=frozen.negatives;
}
const empty={version:'combo-admission-v1-disabled',lines:[],stats:{generated:0,maxNodes:256,depth:4}};
function replay(v,c,{ablate=false}={}){
 const start=performance.now(),trace={};
 const options=structuredClone(c.actions),state=structuredClone(c.state);
 const actions=v.policy.constrainActions(state,options,{trace,...(ablate?{admission:empty}:{})});
 const p=v.choose.prepare(state,actions,{admission:ablate?empty:trace.admission});
 const hard=p.forced??p.lethal;
 const first=hard?[hard.action]:Object.keys(p.crit).map(id=>v.choose.resolve(p,id).action);
 const proofs=p.combinationEvidence?.lines??[];
 return {firstActions:[...new Set(first.map(a=>a.entityId))],preferredFirstAvailable:c.expectedFirst==null?null:first.some(a=>a.entityId===c.expectedFirst),
  wholeIntentAvailable:c.expectWeapon?proofs.some(l=>l.development.via==='discard'):
   proofs.some(l=>l.steps[0].id===c.expectedFirst),
  forced:hard?.source??null,pick:(hard?.action??v.choose.resolve(p,v.choose.rulePick(p)).action).entityId,
  comboPlanIds:Object.keys(p.plans??{}).filter(id=>id.startsWith('combo')),
  combinationEvidence:p.combinationEvidence??null,ms:performance.now()-start};
}
const repeated=(v,c,opts)=>{
 const samples=Array.from({length:3},()=>replay(v,c,opts));
 return {...samples[2],ms:samples.map(r=>r.ms).sort((a,b)=>a-b)[1],timingSamples:samples.map(r=>r.ms)};
};
const rows=cases.map(c=>({id:c.id,split:c.split,baseline:repeated(versions.baseline,c),
 candidate:repeated(versions.candidate,c),withoutAdmission:repeated(versions.candidate,c,{ablate:true})}));
const safety=negatives.map(c=>{
 const a=versions.candidate.combo.combinationAdmission(c.state,c.actions);
 return {id:c.id,weaponProofs:a.lines.filter(l=>l.development.via==='discard').length,
  queuedAfterUnknown:a.lines.filter(l=>l.steps.findIndex(m=>!m.exact)>=0&&l.steps.findIndex(m=>!m.exact)!==l.steps.length-1).length};
});
const summary={};
for(const name of ['baseline','candidate','withoutAdmission']){
 const values=rows.map(r=>r[name].ms).sort((a,b)=>a-b);
 summary[name]={cases:rows.length,wholeIntentsAvailable:rows.filter(r=>r[name].wholeIntentAvailable).length,
  preferredFirstAvailable:rows.filter(r=>r[name].preferredFirstAvailable===true).length,
  preferredFirstCases:rows.filter(r=>r[name].preferredFirstAvailable!=null).length,
  comboMenuCases:rows.filter(r=>r[name].comboPlanIds.length).length,
  medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.floor(values.length*0.95)],maxMs:values.at(-1)};
}
async function hashes(dir){
 const out={};
 async function walk(sub){for(const e of await readdir(join(dir,sub),{withFileTypes:true})){
  const rel=`${sub}/${e.name}`;if(e.isDirectory())await walk(rel);else out[rel]=createHash('sha256').update(await readFile(join(dir,rel))).digest('hex');
 }}
 for(const sub of ['src','decks','data'])await walk(sub);return out;
}
const result={schema:1,createdAt:new Date().toISOString(),node:process.version,
 scope:'offline whole-intent admission and original legal-option replay; mechanic-derived development cases, no model accuracy or win-rate claim',
 baseline,candidate,budgets:{mainSearch:{beam:300,depth:12,maxNodes:24000},comboProof:{maxNodes:256,depth:4},
  note:'baseline lacks the new extra proof pass; candidate ablation isolates admission with the same new simulator and concurrent weapon-specific rule'},
 hashes:{baseline:await hashes(baseline),candidate:await hashes(candidate)},summary,safety,rows};
await mkdir(output,{recursive:true});
await writeFile(join(output,'inputs.json'),JSON.stringify({cases,negatives},null,2));
await writeFile(join(output,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,summary,safety},null,2));
if(safety.some(r=>r.weaponProofs||r.queuedAfterUnknown))process.exitCode=1;
