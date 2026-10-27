// What the live look ahead (src/net-search.mjs) does on recorded games: replays the Power.log of ranked runs, and at
// every step of ours (an attack or a play, and every general choice such as Kazakus' effects) asks the network for its
// greedy pick and the search for its own. One JSON line per position; a summary table at the end.
//
//   node src/eval-net-search.mjs [--model models/selfplay/warlock-zoo-v5.json] [--deck warlock-zoo]
//        [--samples 4] [--turns 1] [--cap 60000] [--every 1] [--out file.jsonl] [--only 2026-10-25T19-22-47-174Z/game-0001]
//        [dir ...]      (dirs under runtime/, default: every ranked-* one holding a game of that deck)
//   --cap is the time cap in ms (60000 measures the search uncapped; the live default is 3000).
import {readFile,readdir,appendFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createParser,publicState,candidates} from './power.mjs';
import {loadNet} from './selfplay-net.mjs';
import {cardDb,loadList} from './selfplay.mjs';
import {shadowView} from './selfplay-shadow.mjs';
import {searchedPick,searchConfig} from './net-search.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

const same=(a,b)=>a&&b&&a.kind===b.kind&&(a.id??null)===(b.id??null)&&(a.targetId??null)===(b.targetId??null);
const own=(parsed,state,line)=>{
  const m=line.match(/^BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b/);
  const e=m&&parsed.entities.get(Number(m[2]));
  return !!e&&Number(e.tags.CONTROLLER)===state.me.playerId;
};

const pct=(xs,q)=>{const a=[...xs].sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.floor(q*a.length))]:null};
export const timing=xs=>({n:xs.length,median:pct(xs,.5),p95:pct(xs,.95),max:xs.length?Math.max(...xs):null});

export async function replayGame(path,{net,cards,list,cfg,every=1,onRow,tag}){
  const text=await readFile(path,'utf8'),p=createParser();
  let k=0;
  for(const line of text.split(/\r?\n/)){
    const s=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/)?.[1];
    const choiceLine=/GameState\.SendChoices\(\) - id=\d+ ChoiceType=GENERAL/.test(line);
    if(s?.startsWith('BLOCK_START')||choiceLine){
      const parsed=p.result(),me=parsed.localPlayer;
      if([1,2].includes(me)){
        const state=publicState(parsed,me,cards);
        if(choiceLine||own(parsed,state,s)){
          const actions=candidates(parsed,state),view=shadowView(parsed,state,actions,{cards,list});
          if(view&&view.legal.length>1&&k++%every===0){
            const ranked=net.rank(view.s,view.legal);
            const r=searchedPick({net,view,ranked,state,cfg});
            const name=m=>m?{...m,name:[...view.s.hand,...view.s.me,...view.s.opp].find(c=>c.id===m.id)?.name??(m.kind==='choose'?(state.choice?.entities??[]).find(e=>e.entityId===m.id||e.cardId===m.id)?.name:null)}:null;
            onRow({tag,turn:state.turn,choice:!!state.choice&&choiceLine,legal:view.legal.length,mana:view.s.mana,oppHand:state.opponent.handCount,
              oppClass:state.opponent.heroClass,ms:r.ms,timedOut:!!r.timedOut,error:r.error??null,reason:r.reason??null,covered:r.covered??null,
              override:!!r.override,greedy:name(r.greedy),pick:name(r.pick),scores:r.scores??null,
              top:ranked.steps.slice(0,3).map(x=>({p:+x.p.toFixed(3),...name(x.move)}))});
          }
        }
      }
    }
    p.feed(line);
  }
}

function deckOf(text,lists){
  const ids=new Set(text.match(/\b[A-Z][A-Z0-9_]*_[0-9A-Za-z]+\b/g)??[]);
  return Object.entries(lists).map(([name,l])=>[name,Object.keys(l.cards).filter(id=>ids.has(id)).length]).sort((a,b)=>b[1]-a[1])[0];
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2),flag=(n,d)=>{const i=args.indexOf(`--${n}`);return i<0?d:args.splice(i,2)[1]};
  const model=flag('model',join(root,'models/selfplay/warlock-zoo-v5.json')),deck=flag('deck','warlock-zoo');
  const cfg={...searchConfig({}),samples:Number(flag('samples',4)),turns:Number(flag('turns',1)),ms:Number(flag('cap',60000))};
  const every=Number(flag('every',1)),out=flag('out',null),only=flag('only',null);
  const net=loadNet(model),cards=cardDb(),list=loadList(deck);
  process.env.JEV_DECK=deck;
  const dirs=args.length?args:(await readdir(join(root,'runtime'),{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name.startsWith('ranked-')).map(d=>d.name).sort();
  const rows=[];
  if(out){await mkdir(dirname(out),{recursive:true});await writeFile(out,'')}
  for(const d of dirs){
    const files=(await readdir(join(root,'runtime',d)).catch(()=>[])).filter(f=>/^game-\d+-Power\.log$/.test(f)).sort();
    for(const f of files){
      const tag=`${d}/${f.replace('-Power.log','')}`;
      if(only&&!tag.includes(only))continue;
      const path=join(root,'runtime',d,f),text=await readFile(path,'utf8');
      const [name,hits]=deckOf(text,{[deck]:list});
      if(hits<10){console.log(`skip ${tag}: ${hits} cards of ${deck}`);continue}
      await replayGame(path,{net,cards,list,cfg,every,tag,onRow:r=>{rows.push(r);if(out)appendFile(out,JSON.stringify(r)+'\n')}});
      console.log(`${tag}: ${rows.filter(r=>r.tag===tag).length} positions`);
    }
  }
  const by=pred=>rows.filter(pred);
  const show=(label,rs)=>console.log(`${label}: ${JSON.stringify(timing(rs.map(r=>r.ms)))} override ${rs.filter(r=>r.override).length}/${rs.length} timedOut ${rs.filter(r=>r.timedOut).length} errors ${rs.filter(r=>r.error).length}`);
  show('all',rows);show('turn<=5',by(r=>r.turn<=5));show('turn>5',by(r=>r.turn>5));
  show('choices',by(r=>r.choice));
}
