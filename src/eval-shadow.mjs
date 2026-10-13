import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createParser,publicState,candidates} from './power.mjs';
import {loadNet} from './selfplay-net.mjs';
import {cardDb,loadList} from './selfplay.mjs';
import {assertEncoded,readShadowRows,shadowRow,shadowView} from './selfplay-shadow.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const cards=cardDb(),list=loadList('warlock-discard'),net=loadNet();
const pct=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'-';
const bump=(o,k,n=1)=>{o[k]=(o[k]??0)+n};
const same=(a,b)=>a&&b&&a.kind===b.kind&&(a.id??null)===(b.id??null)&&(a.targetId??null)===(b.targetId??null);

function bucket(stats,mirror){
  return stats[mirror?'mirror':'nonMirror'];
}

// A menu of one (the forced end of turn) agrees by construction and says nothing about the network.
export function add(stats,row,matched=true){
  const b=bucket(stats,row.mirror);
  if(row.legal===1){b.forced++;return}
  b.positions++;
  if(matched)b.matched++;
  if(row.agree)b.top1++;
  if(row.jev&&row.jev.rank>=0&&row.jev.rank<3)b.top3++;
  for(const n of row.unknown)bump(stats.unknown,n);
}

export function emptyStats(){
  const b=()=>({positions:0,forced:0,matched:0,top1:0,top3:0});
  return {games:0,positions:0,matched:0,top1:0,top3:0,mirror:b(),nonMirror:b(),unknown:{}};
}

function printStats(stats){
  console.log(`games ${stats.games}; positions with a choice ${stats.positions}; single-option steps ${stats.mirror.forced+stats.nonMirror.forced} (left out below)`);
  for(const k of ['mirror','nonMirror']){
    const b=stats[k];
    console.log(`${k}: positions ${b.positions}; single-option ${b.forced}; matched ${b.matched}/${b.positions} ${pct(b.matched,b.positions)}; top1 ${pct(b.top1,b.matched)}; top3 ${pct(b.top3,b.matched)}`);
  }
  const unknown=Object.entries(stats.unknown).sort((a,b)=>b[1]-a[1]).slice(0,15);
  console.log(`unknown: ${unknown.length?unknown.map(([n,c])=>`${n} ${c}`).join(', '):'-'}`);
}

function blockMove(parsed,state,line){
  const m=line.match(/^BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b/);
  if(!m)return null;
  const e=parsed.entities.get(Number(m[2]));
  if(!e||Number(e.tags.CONTROLLER)!==state.me.playerId)return null;
  const targetId=Number(line.match(/\bTarget=\[.*?\bid=(\d+)\b/)?.[1]??0)||null;
  const kind=m[1]==='ATTACK'?'attack':e.tags.CARDTYPE==='HERO_POWER'?'power':e.tags.CARDTYPE==='LOCATION'&&e.tags.ZONE==='PLAY'?'use':'play';
  return {kind,id:e.id,...(targetId!=null?{targetId}:{})};
}

async function replayGame(path,id,stats){
  const p=createParser();
  let seenGame=false,used=false;
  const text=await readFile(path,'utf8');
  if(!text.includes('GameState.DebugPrintPower() - CREATE_GAME'))return;
  seenGame=true;
  for(const line of text.split(/\r?\n/)){
    const s=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/)?.[1];
    if(s?.startsWith('BLOCK_START')){
      const parsed=p.result(),me=parsed.localPlayer;
      if([1,2].includes(me)){
        const state=publicState(parsed,me,cards),move=blockMove(parsed,state,s);
        if(move){
          const actions=candidates(parsed,state),view=shadowView(parsed,state,actions,{cards,list});
          if(view){
            try{assertEncoded(view,net)}
            catch(e){throw Error(`${id} turn ${state.turn}: ${e.message}`)}
            const index=view.legal.findIndex(m=>same(m,move));
            // A real move the menu does not hold still counts as a position, or the matched rate is always 100%.
            const row=shadowRow(net,view,{action:actions[index],source:'replay',state});
            add(stats,row,index>=0);used=true;
          }
        }
      }
    }
    p.feed(line);
  }
  if(seenGame){stats.games++;if(!used)stats.noPositions=(stats.noPositions??0)+1}
}

async function replayArchives(){
  const stats=emptyStats();
  const dirs=(await readdir(join(root,'runtime'),{withFileTypes:true}).catch(()=>[]))
    .filter(d=>d.isDirectory()&&d.name.startsWith('ranked-')).map(d=>d.name).sort();
  for(const d of dirs){
    const files=(await readdir(join(root,'runtime',d)).catch(()=>[])).filter(f=>/^game-\d+-Power\.log$/.test(f)).sort();
    for(const f of files)await replayGame(join(root,'runtime',d,f),`${d}/${f}`,stats);
  }
  stats.positions=stats.mirror.positions+stats.nonMirror.positions;
  stats.matched=stats.mirror.matched+stats.nonMirror.matched;
  printStats(stats);
}

async function liveRows(){
  const stats=emptyStats(),rows=await readShadowRows();
  stats.games=new Set(rows.map(r=>r.gameNumber).filter(x=>x!=null)).size;
  for(const r of rows)add(stats,r,!!r.jev);
  stats.positions=stats.mirror.positions+stats.nonMirror.positions;
  stats.matched=stats.mirror.matched+stats.nonMirror.matched;
  printStats(stats);
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  if(process.argv[2]==='live')await liveRows();
  else await replayArchives();
}
