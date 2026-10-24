// Real games as teacher data for the self-play network: every decision of ours in the archived
// Power.logs, encoded as src/selfplay-env.mjs shows a state to train/ppo.py, with the step that was
// taken and how the game ended.
//
//   npm run bc-export -- [deck] [deck]     (the --decks of ppo.py; default warlock-discard twice)
//       -> runtime/bc/<deck>.jsonl, one line a position:
//          {game,src,turn,kind,pick,legal,result,opp,obs,acts,unknown}
//          kind is the step taken (play/attack/power/use/end/choose), pick its index among acts,
//          result 1 won, -1 lost, 0 tied, for our side.
//          and runtime/bc/<deck>-summary.json with the counts printed at the end.
//
// The games are HDT's replays (%APPDATA%/HearthstoneDeckTracker/Replays/*.hdtreplay, a zip around
// one Power.log) and runtime/ranked-*/game-*-Power.log; a game kept by both is taken once. Only games
// whose own revealed cards fit the first deck best are used, since the deck we cannot see is filled
// in from that list. Tavern brawls are left out.
//
// The positions are those of npm run shadow (src/eval-shadow.mjs) with two more: the end of our turn
// (the STEP MAIN_END that follows our menu) and our pick in a discover. Only the outermost
// BLOCK_START counts as a decision; a card played by another card's effect opens a nested one.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createParser,publicState,candidates} from './power.mjs';
import {cardDb,loadList} from './selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from './selfplay-encode.mjs';
import {shadowView} from './selfplay-shadow.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const HDT_REPLAYS=join(process.env.APPDATA??'','HearthstoneDeckTracker','Replays');
const LINE=/^D (\S+) GameState\.DebugPrintPower\(\) - ( *)(.*)$/;

// The one file in a zip, without a zip library: the central directory gives the sizes.
export function unzipFirst(buf){
  let end=buf.length-22;
  while(end>=0&&buf.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0)throw Error('not a zip');
  const at=buf.readUInt32LE(end+16);
  if(buf.readUInt32LE(at)!==0x02014b50)throw Error('bad zip directory');
  const method=buf.readUInt16LE(at+10),size=buf.readUInt32LE(at+20),local=buf.readUInt32LE(at+42);
  const data=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
  const raw=buf.subarray(data,data+size);
  if(method===0)return raw;
  if(method===8)return inflateRawSync(raw);
  throw Error(`zip method ${method}`);
}

// A log cut at each CREATE_GAME of the server's stream; lines before the first one are dropped.
export function splitGames(text){
  const games=[];
  for(const line of text.split(/\r?\n/)){
    if(/GameState\.DebugPrintPower\(\) -\s*CREATE_GAME\s*$/.test(line))games.push([]);
    games.at(-1)?.push(line);
  }
  return games;
}

const BLOCK=/^BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b/;
const same=(a,b)=>a.kind===b.kind&&(a.id??null)===(b.id??null)&&(a.targetId??null)===(b.targetId??null);

// What one game says about itself, from a first pass over it.
export function gameFacts(lines,cards,lists){
  const p=createParser();
  for(const l of lines)p.feed(l);
  const r=p.result(),me=r.localPlayer;
  const text=lines.slice(0,400).join('\n');
  const names=[...text.matchAll(/DebugPrintGame\(\) - PlayerID=\d+, PlayerName=(.+)/g)].map(m=>m[1].trim()).sort();
  const facts={key:`${lines[0].match(/^D (\S+)/)?.[1]}|${names.join('|')}`,me,
    gameType:text.match(/GameType=(\w+)/)?.[1]??null,format:text.match(/FormatType=(\w+)/)?.[1]??null,result:null,deck:null};
  if(![1,2].includes(me))return facts;
  const player=[...r.entities.values()].find(e=>e.playerId===me);
  facts.result={WON:1,LOST:-1,TIED:0}[player?.tags?.PLAYSTATE]??null;
  const state=publicState(r,me,cards);
  facts.heroClass=state.me.heroClass??null;facts.opp=state.opponent.heroClass??null;
  // The deck: the list most of our own starting cards belong to.
  const own=[...r.entities.values()].filter(e=>Number(e.tags.CONTROLLER)===me&&e.cardId&&!e.created).map(e=>e.cardId);
  let best=null,bestHits=0,tie=false;
  for(const [name,list] of Object.entries(lists)){
    const hits=own.filter(id=>list.cards[id]).length;
    if(hits>bestHits){best=name;bestHits=hits;tie=false}else if(hits&&hits===bestHits)tie=true;
  }
  facts.deck=bestHits>=3&&!tie?best:null;
  return facts;
}

// Our decisions in one game: {turn,kind,pick,legal,obs,acts,unknown}, pick -1 when the step taken is
// not in the menu the log shows at that moment.
export function decisions(lines,me,{cards,list,vocab}){
  const p=createParser(),out=[];
  let pendingChoice=null;
  const take=(move,{choice=false}={})=>{
    const parsed=p.result(),state=publicState(parsed,me,cards);
    if(choice!==!!state.choice)return;
    if(!choice&&!state.me.current)return;
    const actions=candidates(parsed,state);
    const view=shadowView(parsed,state,actions,{cards,list});
    if(!view)return null;
    const {obs,acts}=encode(view.s,view.legal,vocab);
    const unknown=new Set();
    for(const c of [...view.s.hand,...view.s.me,...view.s.opp])if(c?.name&&c.type!=='HERO'&&!vocab.index.has(c.name))unknown.add(c.name);
    const row={turn:state.turn,kind:move.kind,pick:view.legal.findIndex(m=>same(m,move)),legal:view.legal.length,obs,acts,unknown:[...unknown]};
    out.push(row);
    return {row,view};
  };
  for(const line of lines){
    const m=line.match(LINE);
    if(m&&!m[2]){
      const s=m[3],b=s.match(BLOCK);
      if(b){
        const e=p.result().entities.get(Number(b[2]));
        if(e&&Number(e.tags.CONTROLLER)===me){
          const targetId=Number(s.match(/\bTarget=\[.*?\bid=(\d+)\b/)?.[1]??0)||null;
          const kind=b[1]==='ATTACK'?'attack':e.tags.CARDTYPE==='HERO_POWER'?'power':e.tags.CARDTYPE==='LOCATION'&&e.tags.ZONE==='PLAY'?'use':'play';
          take({kind,id:e.id,...(targetId!=null?{targetId}:{})});
        }
      }else if(/^TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_END\b/.test(s))take({kind:'end'});
    }
    // A pick we sent: the menu is read at the header (the parser drops the choice on it), the card
    // comes on the next line. A pick the server made when the timer ran out has no SendChoices.
    const sent=line.match(/GameState\.SendChoices\(\) -\s*(.*)/)?.[1];
    if(sent!=null){
      if(/^id=\d+ ChoiceType=GENERAL\b/.test(sent))pendingChoice=take({kind:'choose'},{choice:true});
      else if(pendingChoice){
        const id=Number(sent.match(/^m_chosenEntities\[0\]=.*?\bid=(\d+)\b/)?.[1]);
        pendingChoice.row.pick=pendingChoice.view.legal.findIndex(m=>m.kind==='choose'&&m.id===id);
        pendingChoice=null;
      }
    }
    p.feed(line);
  }
  return out;
}

async function sources(){
  const out=[];
  const hdt=await readdir(HDT_REPLAYS).catch(()=>[]);
  for(const f of hdt.filter(f=>f.endsWith('.hdtreplay')).sort())
    out.push({src:`hdt/${f}`,read:async()=>unzipFirst(await readFile(join(HDT_REPLAYS,f))).toString('utf8')});
  const dirs=(await readdir(join(root,'runtime'),{withFileTypes:true}).catch(()=>[]))
    .filter(d=>d.isDirectory()&&d.name.startsWith('ranked-')).map(d=>d.name).sort();
  for(const d of dirs){
    const files=(await readdir(join(root,'runtime',d)).catch(()=>[])).filter(f=>/^game-\d+-Power\.log$/.test(f)).sort();
    for(const f of files)out.push({src:`${d}/${f}`,read:()=>readFile(join(root,'runtime',d,f),'utf8')});
  }
  return out;
}

const bump=(o,k,n=1)=>{o[k]=(o[k]??0)+n};

export async function exportBC(deckNames=['warlock-discard','warlock-discard'],{out=join(root,'runtime','bc')}={}){
  const cards=cardDb(),target=deckNames[0];
  const lists=Object.fromEntries((await readdir(join(root,'decks'))).flatMap(d=>{try{return [[d,loadList(d)]]}catch{return []}}));
  const vocab=vocabulary(deckNames.map(loadList),cards),obs=obsSize(vocab),act=actSize(vocab);
  const seen=new Set(),rows=[];
  const sum={decks:deckNames,obs,act,files:0,games:0,duplicates:0,skipped:{},kept:0,results:{},
    positions:0,matched:0,forced:0,byKind:{},unmatchedByKind:{},unknown:{}};
  for(const s of await sources()){
    sum.files++;
    let text;
    try{text=await s.read()}catch(e){bump(sum.skipped,'unreadable');continue}
    for(const lines of splitGames(text)){
      sum.games++;
      const f=gameFacts(lines,cards,lists);
      if(seen.has(f.key)){sum.duplicates++;continue}
      seen.add(f.key);
      const why=![1,2].includes(f.me)?'no local player':f.gameType==='GT_TAVERNBRAWL'?'tavern brawl'
        :f.result==null?'unfinished':f.deck!==target?`deck ${f.deck??'unknown'}`:null;
      if(why){bump(sum.skipped,why);continue}
      sum.kept++;bump(sum.results,f.result);
      for(const d of decisions(lines,f.me,{cards,list:lists[target],vocab})){
        if(d.obs.length!==obs||d.acts.some(a=>a.length!==act))throw Error(`${s.src}: encoded to ${d.obs.length}/${d.acts[0]?.length}, not ${obs}/${act}`);
        sum.positions++;bump(sum.byKind,d.kind);
        if(d.pick<0){bump(sum.unmatchedByKind,d.kind);continue}
        sum.matched++;
        if(d.legal===1)sum.forced++;
        for(const n of d.unknown)bump(sum.unknown,n);
        rows.push(JSON.stringify({game:f.key,src:s.src,turn:d.turn,kind:d.kind,pick:d.pick,legal:d.legal,result:f.result,opp:f.opp,obs:d.obs,acts:d.acts,unknown:d.unknown}));
      }
    }
  }
  sum.unknown=Object.fromEntries(Object.entries(sum.unknown).sort((a,b)=>b[1]-a[1]).slice(0,20));
  await mkdir(out,{recursive:true});
  await writeFile(join(out,`${target}.jsonl`),rows.join('\n')+(rows.length?'\n':''));
  await writeFile(join(out,`${target}-summary.json`),JSON.stringify(sum,null,1));
  return sum;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2);
  const sum=await exportBC(args.length?[args[0],args[1]??args[0]]:undefined);
  const pct=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'-';
  console.log(`files ${sum.files}; games ${sum.games}; duplicates ${sum.duplicates}; kept ${sum.kept} (won ${sum.results[1]??0}, lost ${sum.results[-1]??0}, tied ${sum.results[0]??0})`);
  console.log(`skipped: ${Object.entries(sum.skipped).map(([k,v])=>`${k} ${v}`).join(', ')||'-'}`);
  console.log(`positions ${sum.positions}; matched ${sum.matched} (${pct(sum.matched,sum.positions)}); single-option ${sum.forced}`);
  for(const [k,n] of Object.entries(sum.byKind))console.log(`  ${k}: ${n}, not in the menu ${sum.unmatchedByKind[k]??0} (${pct(sum.unmatchedByKind[k]??0,n)})`);
  console.log(`unknown cards: ${Object.entries(sum.unknown).map(([n,c])=>`${n} ${c}`).join(', ')||'-'}`);
}
