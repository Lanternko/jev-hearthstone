// Regression question bank (exam only -- NEVER training data).  Grades a self-play network on the positions the user
// has ruled on, so a new model cannot quietly bring an old mistake back.
//
//   npm run regress -- --deck warlock-discard [--model models/selfplay/X.json]
//   npm run regress -- --all-live                       the four live networks
//   npm run regress -- --deck D --model F --baseline eval/regress/baseline-<live model>.json
//   npm run regress -- --all-live --save-baseline       also writes eval/regress/baseline-<model>.json (tracked)
//   other flags: --no-f881  --f881-limit N  --out DIR
//
// Questions live in eval/regress/questions.json:
//   position: a recorded live state; the deck's network is asked through the live bridge (shadowView + net.rank).
//     pass = its top move is in best, ok = in ok, fail = forbidden or outside best/ok.  With no best, pass unless forbidden.
//   category: a generated family of positions (F-881, src/regress-f881.mjs), graded as a rate.
//   unsupported: listed with the reason it cannot be graded; never counted as a pass.
// evidence 'user' = a user ruling (a judgement), 'measured' = backed by an experiment.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {basename,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadNet} from './selfplay-net.mjs';
import {shadowView,assertEncoded,MODELS} from './selfplay-shadow.mjs';
import {loadList,cardDb} from './selfplay.mjs';
import {F881_DECKS,loadExamNets,gradeF881} from './regress-f881.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const QUESTIONS=resolve(ROOT,'eval/regress/questions.json');
export const MODEL_DIR=resolve(ROOT,'models/selfplay');
// The live network of each deck (the first three are selfplay-shadow's MODELS; the egg priest is not shadowed yet).
export const LIVE_MODELS={...MODELS,'priest-egg-hsr':'priest-egg-0.1.0'};
export const F881_TOLERANCE=0.03;
const RANK={pass:2,ok:1,fail:0};

const abs=p=>resolve(ROOT,p);
const readJson=p=>JSON.parse(readFileSync(abs(p),'utf8'));
const dig=(o,path)=>path.split('.').reduce((x,k)=>x?.[k],o);

export function loadQuestions(file=QUESTIONS){return JSON.parse(readFileSync(file,'utf8')).questions}

// "re:..." is a regular expression, anything else an exact option id.
export const idMatches=(spec,id)=>id!=null&&(spec.startsWith('re:')?new RegExp(spec.slice(3)).test(id):spec===id);
const anyMatch=(specs,id)=>(specs??[]).some(sp=>idMatches(sp,id));

// The state and the option menu of a position question (read from its fixture; nothing is copied into the manifest).
export function loadPosition(q){
  const src=q.source;
  let j=readJson(src.file);
  if(src.id)j=j.find(x=>x.id===src.id);
  else if(Array.isArray(j))j=j[src.index??0];
  if(!j)throw Error(`${q.id}: source not found`);
  const state=dig(j,src.state),options=dig(j,src.options);
  if(!state||!options)throw Error(`${q.id}: state or options missing (${src.state}, ${src.options})`);
  return {state,options};
}

// The parser output the live bridge reads, rebuilt from the recorded state alone: both players (first player from the
// turn's parity), our hand and board (so the hidden deck is the list minus what is visible).  What the recording does
// not hold stays unknown: the discard count (0), ritual and trial clocks (none), Shreds of Time.
export function synthParsed(state){
  const me=state.me.playerId,op=state.opponent.playerId;
  const first=Number(state.turn)%2===1;
  const player=(pid,isFirst,side)=>({id:100+pid,playerId:pid,tags:{CONTROLLER:String(pid),CARDTYPE:'PLAYER',RESOURCES:String(side.maxMana??0),FATIGUE:String(side.fatigue??0),...(isFirst?{FIRST_PLAYER:'1'}:{})}});
  const card=(c,zone)=>({id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(me),ZONE:zone,CARDTYPE:c.CARDTYPE}});
  const ents=[player(me,first,state.me),player(op,!first,state.opponent),
    ...(state.me.hand??[]).map(c=>card(c,'HAND')),...(state.me.board??[]).map(c=>card(c,'PLAY'))];
  return {entities:new Map(ents.map(e=>[e.id,e])),gameNumber:state.gameNumber,publicPlays:[]};
}

// Ask `net` about one position.  Returns {top,pBest,pForbidden,result,notes} or {unsupported}.
export function gradePosition(q,net,{cards=cardDb(),list,parsed='synth'}={}){
  const {state,options}=loadPosition(q);
  const view=shadowView(parsed==='synth'?synthParsed(state):null,state,options,{cards,list});
  if(!view)return {unsupported:'shadowView returned null (not a RUNNING decision, or a mulligan)'};
  assertEncoded(view,net);
  const r=net.rank(view.s,view.legal);
  const idOf=m=>{const i=view.legal.indexOf(m);return i<0?null:options[i].id};
  const top=idOf(r.steps[0].move);
  const mass=specs=>r.steps.filter(x=>anyMatch(specs,idOf(x.move))).reduce((a,x)=>a+x.p,0);
  let result;
  if(anyMatch(q.forbidden,top))result='fail';
  else if(q.best?.length)result=anyMatch(q.best,top)?'pass':anyMatch(q.ok,top)?'ok':'fail';
  else result='pass';
  return {top,result,pBest:q.best?.length?+mass(q.best).toFixed(4):null,pForbidden:q.forbidden?.length?+mass(q.forbidden).toFixed(4):null,notes:view.notes};
}

export function modelFileFor(model){return model.includes('/')||model.includes('\\')||model.endsWith('.json')?abs(model):resolve(MODEL_DIR,`${model}.json`)}

export function loadModel(model){
  const file=modelFileFor(model);
  const net=loadNet(file);
  net.modelName=basename(file,'.json');
  return {net,file};
}

// Grade every question of `deck` with the network `modelArg` (a file or a model name; default the deck's live network).
export function runDeck(deck,{modelArg=LIVE_MODELS[deck],questions=loadQuestions(),f881=true,f881Limit=null,onProgress=null,parsed='synth'}={}){
  const {net,file}=loadModel(modelArg);
  const mine=questions.filter(q=>q.deck===deck);
  const out=[];
  let cards=null,list=null;
  for(const q of mine){
    if(q.unsupported){out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'unsupported',reason:q.unsupported});continue}
    if(q.kind==='position'){
      cards??=cardDb();list??=loadList(deck);
      let g;
      try{g=gradePosition(q,net,{cards,list,parsed})}catch(e){g={error:String(e?.message??e)}}
      if(g.unsupported)out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'unsupported',reason:g.unsupported});
      else if(g.error)out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'error',reason:g.error});
      else out.push({id:q.id,kind:q.kind,evidence:q.evidence,...g});
    }else if(q.kind==='category'&&q.category==='f881'){
      if(!f881){out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'skipped',reason:'--no-f881'});continue}
      if(!F881_DECKS[deck]){out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'unsupported',reason:`no F-881 category for ${deck}`});continue}
      const idx=readJson(q.index).decks[deck];
      let entries=idx.entries.map(([g,ownTurn,turn])=>({g,ownTurn,turn}));
      if(f881Limit)entries=entries.slice(0,f881Limit);
      const t0=Date.now();
      const r=gradeF881(deck,net,entries,{nets:loadExamNets(deck)});
      out.push({id:q.id,kind:q.kind,evidence:q.evidence,result:'measured',dry:r.dry,tach:r.tach,stale:r.stale,rate:r.rate,meanPTach:r.meanPTach,
        indexed:entries.length,generator:idx.generator,seconds:Math.round((Date.now()-t0)/1000)});
    }
    onProgress?.(q.id);
  }
  return {model:net.modelName,file:file.replace(ROOT,'').replace(/\\/g,'/').replace(/^\//,''),deck,at:new Date().toISOString(),parsed,summary:summarize(out),questions:out};
}

export function summarize(rows){
  const s={pass:0,ok:0,fail:0,unsupported:0,error:0,categories:0};
  for(const r of rows){
    if(r.result in s)s[r.result]++;
    else if(r.result==='measured')s.categories++;
  }
  return s;
}

// Compare a candidate report with a baseline report.  Regressions: a question that got worse (pass>ok>fail), and an F-881
// rate above the baseline by more than F881_TOLERANCE.
export function compareReports(base,cur,{tolerance=F881_TOLERANCE}={}){
  const b=new Map(base.questions.map(r=>[r.id,r]));
  const regressions=[],improvements=[],added=[],missing=[];
  const seen=new Set();
  for(const r of cur.questions){
    seen.add(r.id);
    const o=b.get(r.id);
    if(!o){added.push(r.id);continue}
    if(r.result==='measured'&&o.result==='measured'){
      const d=r.rate-o.rate;
      const row={id:r.id,evidence:r.evidence,from:`${(o.rate*100).toFixed(1)}%`,to:`${(r.rate*100).toFixed(1)}%`,baseline:o.rate,candidate:r.rate};
      if(d>tolerance)regressions.push(row);else if(d<-tolerance)improvements.push(row);
      continue;
    }
    if(!(r.result in RANK)||!(o.result in RANK))continue;
    const row={id:r.id,evidence:r.evidence,from:o.result,to:r.result,top:r.top};
    if(RANK[r.result]<RANK[o.result])regressions.push(row);
    else if(RANK[r.result]>RANK[o.result])improvements.push(row);
  }
  for(const id of b.keys())if(!seen.has(id))missing.push(id);
  return {baseline:base.model,candidate:cur.model,regressions,improvements,added,missing};
}

export function renderReport(rep,cmp=null){
  const L=[];
  const s=rep.summary;
  L.push(`model ${rep.model}  deck ${rep.deck}  ${rep.at}  (${rep.parsed==='synth'?'state rebuilt from the recording':'no parser data'})`);
  L.push(`pass ${s.pass}  ok ${s.ok}  fail ${s.fail}  unsupported ${s.unsupported}  error ${s.error}  categories ${s.categories}`);
  for(const r of rep.questions){
    if(r.result==='measured')L.push(`  [measured] ${r.id}: casts Tachyon in ${r.tach}/${r.dry} DRY positions = ${(r.rate*100).toFixed(1)}%, mean P ${(r.meanPTach*100).toFixed(1)}%, stale ${r.stale}, ${r.seconds}s`);
    else if(r.result==='pass'||r.result==='ok')continue;
    else if(r.result==='fail')L.push(`  FAIL ${r.id}: top ${r.top}${r.pBest!=null?`, P(best) ${(r.pBest*100).toFixed(0)}%`:''}${r.pForbidden!=null?`, P(forbidden) ${(r.pForbidden*100).toFixed(0)}%`:''} [${r.evidence}]`);
    else L.push(`  ${r.result.toUpperCase()} ${r.id}: ${r.reason}`);
  }
  if(cmp){
    L.push(`vs baseline ${cmp.baseline}: ${cmp.regressions.length} regressions, ${cmp.improvements.length} improvements`);
    for(const r of cmp.regressions)L.push(`  REGRESSION ${r.id}: ${r.from} -> ${r.to} [${r.evidence}]`);
    for(const r of cmp.improvements)L.push(`  improved ${r.id}: ${r.from} -> ${r.to}`);
    if(cmp.added.length)L.push(`  new questions: ${cmp.added.join(', ')}`);
    if(cmp.missing.length)L.push(`  missing questions: ${cmp.missing.join(', ')}`);
  }
  return L.join('\n');
}

const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\..*/,'').replace('T','-');

function parseArgs(argv){
  const a={deck:null,model:null,allLive:false,baseline:null,saveBaseline:false,f881:true,f881Limit:null,out:resolve(ROOT,'runtime/regress')};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(k==='--deck')a.deck=argv[++i];
    else if(k==='--model')a.model=argv[++i];
    else if(k==='--all-live')a.allLive=true;
    else if(k==='--baseline')a.baseline=argv[++i];
    else if(k==='--save-baseline')a.saveBaseline=true;
    else if(k==='--no-f881')a.f881=false;
    else if(k==='--f881-limit')a.f881Limit=+argv[++i];
    else if(k==='--out')a.out=resolve(argv[++i]);
    else throw Error(`unknown flag ${k}`);
  }
  if(!a.deck&&!a.allLive)throw Error('usage: npm run regress -- --deck <deck> [--model <file>] [--baseline <report.json>] | --all-live [--save-baseline]');
  if(a.allLive&&a.model)throw Error('--model names one network; use it with --deck');
  return a;
}

function main(){
  const a=parseArgs(process.argv.slice(2));
  const decks=a.allLive?Object.keys(LIVE_MODELS):[a.deck];
  const questions=loadQuestions();
  mkdirSync(a.out,{recursive:true});
  let regressed=false;
  for(const deck of decks){
    if(!LIVE_MODELS[deck]&&!a.model)throw Error(`no live network for deck ${deck}; pass --model`);
    const rep=runDeck(deck,{modelArg:a.model??LIVE_MODELS[deck],questions,f881:a.f881,f881Limit:a.f881Limit});
    if(!questions.some(q=>q.deck===deck))rep.note=`no questions for ${deck} yet (no recorded states, no F-881 category)`;
    let cmp=null;
    if(a.baseline){
      cmp=compareReports(JSON.parse(readFileSync(resolve(a.baseline),'utf8')),rep);
      rep.comparison=cmp;
      if(cmp.regressions.length)regressed=true;
    }
    const text=renderReport(rep,cmp)+(rep.note?`\n${rep.note}`:'');
    const base=resolve(a.out,`${rep.model}-${stamp(new Date())}`);
    writeFileSync(`${base}.json`,JSON.stringify(rep,null,1)+'\n');
    writeFileSync(`${base}.txt`,text+'\n');
    if(a.saveBaseline){
      const {comparison,...keep}=rep;
      writeFileSync(resolve(ROOT,`eval/regress/baseline-${rep.model}.json`),JSON.stringify(keep,null,1)+'\n');
    }
    console.log(text);
    console.log(`-> ${base.replace(ROOT,'').replace(/\\/g,'/').replace(/^\//,'')}.{json,txt}\n`);
  }
  if(regressed)process.exitCode=1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
