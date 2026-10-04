// Mulligan click timing: for every gesture of every mulligan, how long after the log offered the
// choice it went out, and whether it landed. The latest dead click and the earliest landed one bracket
// the moment the mulligan UI becomes live (src/loop.mjs MULLIGAN_LIVE).
//
// Sources, per game of every runtime/ranked-*/ batch:
// - runtime/mulligan-timing.jsonl (src/loop.mjs, from 2026-10-05): exact time of every step.
// - otherwise the mulligan screenshots, taken just before the first step (…-before-<ms>.jpg) and
//   just before the confirm (…-preconfirm-<ms>.jpg); toss times between them are interpolated.
// Landed: a toss landed if its card is not in the server's kept list (SendChoices); a confirm
// landed if SendChoices followed within 4s. Tosses never land on their own after a dead confirm --
// only confirms are retried -- so a toss's fate is final.
//
// node eval/mulligan-timing.mjs [--json]
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {clockToday} from '../src/mulligan-retry.mjs';

const RT=new URL('../runtime/',import.meta.url);
const at=p=>new URL(p,RT);
const lines=p=>existsSync(p)?readFileSync(p,'utf8').split('\n').filter(Boolean):[];
const json=l=>{try{return JSON.parse(l)}catch{return null}};

const shots=readdirSync(at('shots/')).map(f=>f.match(/^mulligan-g\d+-(before|preconfirm)-(\d+)\.jpg$/))
 .filter(Boolean).map(m=>({kind:m[1],t:Number(m[2])})).sort((a,b)=>a.t-b.t);
const live=lines(at('mulligan-timing.jsonl')).map(json).filter(Boolean);

const rows=[];
for(const dir of readdirSync(RT).filter(d=>/^ranked-\d/.test(d)).sort()){
 for(const f of readdirSync(at(dir+'/')).filter(f=>/^game-\d+-Power\.log$/.test(f))){
  const n=f.match(/\d+/)[0],power=at(`${dir}/${f}`);
  const dec=lines(at(`${dir}/game-${n}-decisions.jsonl`)).map(json).filter(r=>r?.action?.type==='MULLIGAN');
  if(!dec.length)continue;
  const d=dec[0],choiceId=d.action.choiceId,offeredAt=d.state.choice?.offeredAt;
  const offer=clockToday(offeredAt,Date.parse(d.createdAt));
  if(!offer)continue;
  // The server's receipt: when our choice went out, and which cards it kept.
  const text=readFileSync(power,'utf8').split('\n');
  let sent=null,kept=[];
  for(let i=0;i<text.length;i++){
   const m=text[i].match(/^D (\S+) GameState\.SendChoices\(\) - id=(\d+) ChoiceType=MULLIGAN/);
   if(!m||Number(m[2])!==choiceId)continue;
   sent=clockToday(m[1],offer+120000);
   for(let j=i+1;j<text.length&&/m_chosenEntities/.test(text[j]);j++)kept.push(Number(text[j].match(/ id=(\d+)/)[1]));
   break;
  }
  const hero=b=>(b??[]).find(c=>c.CARDTYPE==='HERO')?.cardId??null;
  const base={batch:dir,game:Number(n),offeredAt,me:hero(d.state.me?.board),foe:hero(d.state.opponent?.board),
   sentMs:sent&&sent-offer};
  const name=id=>d.state.choice?.entities?.find(e=>e.entityId===id)?.name??String(id);
  const gestures=[];
  const mine=live.filter(r=>r.offeredAt===offeredAt&&Math.abs(r.offerMs-offer)<5000);
  if(mine.length){
   for(const r of mine)for(const s of r.steps)gestures.push({what:s.what,entityId:s.entityId??null,t:s.at,source:'live'});
  }else{
   // Screenshot times, one attempt per "before" shot inside the mulligan's window.
   const end=(sent??offer+90000)+5000;
   const win=shots.filter(s=>s.t>=offer&&s.t<=end);
   const tossIds=d.action.replace??[];
   for(let k=0;k<win.length;k++){
    const s=win[k];
    if(s.kind==='before'){
     const next=win[k+1]?.kind==='preconfirm'?win[k+1]:null;
     if(!tossIds.length)continue;
     // The confirm-only retries open with a preconfirm shot; a before shot opens the full plan.
     const step=next?(next.t-s.t)/tossIds.length:700;
     tossIds.forEach((id,i)=>gestures.push({what:`toss ${name(id)}`,entityId:id,t:Math.round(s.t+i*step),source:i?'interpolated':'shot'}));
    }else gestures.push({what:'confirm mulligan',entityId:null,t:s.t,source:'shot'});
   }
  }
  for(const g of gestures){
   const landed=g.entityId!=null?(sent?!kept.includes(g.entityId):false)
    :!!(sent&&sent>=g.t-500&&sent-g.t<=4000);
   rows.push({...base,what:g.what,offsetMs:g.t-offer,landed,source:g.source});
  }
 }
}

if(process.argv.includes('--json')){for(const r of rows)console.log(JSON.stringify(r));process.exit(0)}
const s=ms=>(ms/1000).toFixed(1)+'s';
const games=new Set(rows.map(r=>r.batch+'#'+r.game)).size;
console.log(`${rows.length} gestures in ${games} games\n`);
const bracket=(label,rs)=>{
 const dead=rs.filter(r=>!r.landed).map(r=>r.offsetMs),ok=rs.filter(r=>r.landed).map(r=>r.offsetMs);
 const late=dead.length?Math.max(...dead):null,early=ok.length?Math.min(...ok):null;
 console.log(`${label.padEnd(26)} n=${String(rs.length).padStart(3)}  latest dead ${late==null?'-':s(late)}  earliest landed ${early==null?'-':s(early)}${late!=null&&early!=null&&late>early?'  (overlap)':''}`);
};
bracket('all',rows);
bracket('tosses',rows.filter(r=>r.what.startsWith('toss')));
bracket('confirms',rows.filter(r=>r.what==='confirm mulligan'));
console.log('\nby opponent hero');
const foes=[...new Set(rows.map(r=>r.foe))].sort();
for(const f of foes)bracket(String(f),rows.filter(r=>r.foe===f));
console.log('\nevery gesture between 14s and 26s');
for(const r of rows.filter(r=>r.offsetMs>=14000&&r.offsetMs<=26000).sort((a,b)=>a.offsetMs-b.offsetMs))
 console.log(`  ${s(r.offsetMs).padStart(6)} ${r.landed?'landed':'DEAD  '} ${r.what.padEnd(34)} vs ${r.foe}  ${r.batch.slice(7,23)} g${r.game} (${r.source})`);
