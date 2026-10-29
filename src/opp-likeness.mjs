// How much the simulated egg priest plays like real ones: the games of real egg priests found in Power.log
// next to the games a self-play pilot plays in the simulator, from the egg priest's side on both.
//
// Turns are the egg priest's own: its first turn is 1 whether it went first or second, so engine turn t (1 = the
// first player's first turn) is own turn ceil(t/2) for either seat. The length of a game is the number of turns
// the egg priest began: ceil(T/2) going first, floor(T/2) going second, T being the last engine turn of the game.
//
//   node src/opp-likeness.mjs extract [--out file] [--root dir]       real games -> json
//   node src/opp-likeness.mjs report <dir> [--boot 2000]             <dir>/real-egg.json + sim-*.json -> score.json, report.md
//   (the sim json is `node src/selfplay-cardwin.mjs <pilot> <zoo> N seed --decks priest-egg warlock-zoo --guard egg --json --records`)
//
// A game summary, the same from either source:
//   {eggFirst, endTurn, eggTurns, plays:{name:{first,n}}, hatchTurn, eggAttacks, stage}
// first = own turn of the first play, stage = how many times the egg broke (0 = the first egg, 5 = Khelos).
import {pathToFileURL} from 'node:url';
import {createReadStream,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {join} from 'node:path';

export const EGG_STAGES=['DINO_410','DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5','DINO_410t'];
export const EGG='The Egg of Khelos';
export const ownTurn=t=>Math.ceil(t/2);
export const turnsBegun=(endTurn,eggFirst)=>eggFirst?Math.ceil(endTurn/2):Math.floor(endTurn/2);

// ---- real games: Power.log ----

const ENT=/\bid=(\d+) zone=(\w+) zonePos=\d+ cardId=(\S*) player=(\d+)\]/;
const parseEnt=s=>{const m=ENT.exec(s??'');return m?{id:Number(m[1]),zone:m[2],cardId:m[3],player:Number(m[4])}:null};

// Line by line: feed(line,lineNo) for every line of a Power.log (only the GameState copy is read, the
// PowerTaskList one repeats it), finish() -> every game seen, whoever's it was. A game is
//   {startLine,endLine,startTime,complete,firstPlayer,endTurn,result:{1,2},players:{p:{cardIds,plays,created}},attacks}
export function createScanner({file=''}={}){
  const games=[];let g=null,cur=null,turn=0,block=null;
  // the log names the local player only later: a name it has not matched is the player without one
  let names=new Map(),unnamed=null;
  const who=name=>{
    const n=name.trim();
    if(names.has(n))return names.get(n);
    if(unnamed!=null&&!/^\d+$/.test(n)&&n!=='GameEntity'){names.set(n,unnamed);const p=unnamed;unnamed=null;return p}
    return undefined;
  };
  const close=()=>{if(g){g.endTurn=turn;g.complete=g.result[1]!=null&&g.result[2]!=null;games.push(g)}g=null};
  const side=p=>g.players[p]??(g.players[p]={plays:[],created:[],seen:new Set(),ids:new Map()});
  function feed(line,no){
    const gp=line.indexOf('GameState.DebugPrintGame() - ');
    if(gp>=0){
      const m=/PlayerID=(\d+), PlayerName=(.+)/.exec(line.slice(gp));
      if(m){if(m[2].trim()==='UNKNOWN HUMAN PLAYER')unnamed=Number(m[1]);else names.set(m[2].trim(),Number(m[1]))}
      return;
    }
    const i=line.indexOf('GameState.DebugPrintPower() - ');
    if(i<0)return;
    const p=line.slice(i+30).trimEnd(),raw=p.trimStart();
    if(raw==='CREATE_GAME'){close();g={file,startLine:no,startTime:line.slice(2,17),firstPlayer:null,result:{1:null,2:null},players:{},attacks:[],entPlayer:new Map()};turn=0;cur=null;block=null;names=new Map();unnamed=null;return}
    if(!g)return;
    g.endLine=no;
    let m;
    if(raw.startsWith('tag=')){
      if(!cur)return;
      if((m=/^tag=CONTROLLER value=(\d)/.exec(raw))){cur.player=Number(m[1]);return}
      if((m=/^tag=ZONE value=(\w+)/.exec(raw))){
        cur.zone=m[1];
        if(cur.creating&&m[1]==='PLAY'&&cur.player&&EGG_STAGES.includes(cur.cardId))side(cur.player).created.push({cardId:cur.cardId,turn});
      }
      return;
    }
    cur=null;
    if((m=/^Player EntityID=(\d+) PlayerID=(\d+)/.exec(raw))){g.entPlayer.set(m[1],Number(m[2]));return}
    if((m=/^TAG_CHANGE Entity=GameEntity tag=TURN value=(\d+)/.exec(raw))){turn=Number(m[1]);return}
    if((m=/^TAG_CHANGE Entity=(.+?) tag=FIRST_PLAYER value=1\b/.exec(raw))){
      const p=g.entPlayer.get(m[1])??who(m[1]);if(p)g.firstPlayer=p;return}
    if((m=/^TAG_CHANGE Entity=(.+?) tag=PLAYSTATE value=(WON|LOST|CONCEDED|TIED)\b/.exec(raw))){
      const p=g.entPlayer.get(m[1])??who(m[1]);
      if(p&&g.result[p]!=='CONCEDED')g.result[p]=m[2];
      return}
    if((m=/^BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[(.*?)\] EffectCardId/.exec(raw))){
      const e=parseEnt(m[2]+']');
      if(m[1]==='PLAY'&&e&&e.zone==='HAND'){
        const rec={id:e.id,turn,cardId:e.cardId};
        side(e.player).plays.push(rec);block=rec;
      }else if(m[1]==='ATTACK'){
        const t=parseEnt(raw.slice(raw.indexOf(' Target=')+8));
        if(t&&EGG_STAGES.includes(t.cardId))g.attacks.push({cardId:t.cardId,player:t.player,turn});
      }
      return;
    }
    if((m=/^(SHOW_ENTITY|CHANGE_ENTITY) - Updating Entity=(\[.*?\]|\S+) CardID=(\S*)/.exec(raw))){
      const e=parseEnt(m[2]);
      if(e&&m[3]){
        const s=side(e.player);s.seen.add(m[3]);
        // a card played from the hand is hidden until the play reveals it
        if(block&&block.id===e.id&&!block.cardId)block.cardId=m[3];
        cur={id:e.id,cardId:m[3],player:e.player,creating:false};
      }
      return;
    }
    if((m=/^FULL_ENTITY - Creating ID=(\d+) CardID=(\S*)/.exec(raw))){
      cur={id:Number(m[1]),cardId:m[2],player:0,creating:true};
      if(m[2])cur.created=true;
    }
  }
  return {feed,finish(){close();return games}};
}

export function scanText(text,{file=''}={}){
  const s=createScanner({file});let n=0;
  for(const line of text.split(/\r?\n/))s.feed(line,++n);
  return s.finish();
}

export async function scanFile(path){
  const s=createScanner({file:path}),rl=createInterface({input:createReadStream(path,{encoding:'utf8'}),crlfDelay:Infinity});
  let n=0;
  for await(const line of rl)s.feed(line,++n);
  return s.finish();
}

// A scanned game -> the summary of the egg priest's side, or null when no egg priest is in it.
//   cards: id -> name; deckIds: the egg priest's decklist (a player who plays five of its cards is one too, egg seen or not)
export function eggGame(g,{cards,deckIds=new Set(),minSignature=5}={}){
  const seat=p=>{
    const s=g.players[p];if(!s)return null;
    const seen=s.seen.has('DINO_410')||s.plays.some(x=>x.cardId==='DINO_410')||s.created.length>0;
    const sig=new Set(s.plays.map(x=>x.cardId).filter(c=>deckIds.has(c))).size;
    return {p,seen,sig};
  };
  const cand=[1,2].map(seat).filter(x=>x&&(x.seen||x.sig>=minSignature));
  if(cand.length!==1)return cand.length?{ambiguous:true,file:g.file,startLine:g.startLine}:null;
  const {p,seen,sig}=cand[0],s=g.players[p];
  const eggFirst=g.firstPlayer===p,plays={};
  for(const x of s.plays){
    const name=cards[x.cardId]??x.cardId;if(!x.cardId)continue;
    const r=plays[name]??(plays[name]={first:ownTurn(x.turn),n:0,cardId:x.cardId});r.n++;
  }
  const stages=[...s.created.map(c=>EGG_STAGES.indexOf(c.cardId)),...(plays[EGG]?[0]:[])];
  const hatch=s.created.find(c=>c.cardId==='DINO_410t');
  return {file:g.file,startLine:g.startLine,endLine:g.endLine,startTime:g.startTime,complete:g.complete,
    eggPlayer:p,eggSeen:seen,signature:sig,result:g.result[p],eggFirst,endTurn:g.endTurn,eggTurns:turnsBegun(g.endTurn,eggFirst),
    plays,hatchTurn:hatch?ownTurn(hatch.turn):null,
    eggAttacks:g.attacks.filter(a=>a.player===p&&a.cardId!=='DINO_410t').length,stage:stages.length?Math.max(...stages):-1};
}

// ---- distances ----

const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

// 1-Wasserstein between the empirical distributions of two samples (integers or not), in the unit of the values.
export function wasserstein1(a,b){
  if(!a.length||!b.length)return NaN;
  const x=[...a].sort((u,v)=>u-v),y=[...b].sort((u,v)=>u-v);
  const xs=[...new Set([...x,...y])].sort((u,v)=>u-v);
  let d=0,i=0,j=0;
  for(let k=0;k<xs.length-1;k++){
    while(i<x.length&&x[i]<=xs[k])i++;
    while(j<y.length&&y[j]<=xs[k])j++;
    d+=Math.abs(i/x.length-j/y.length)*(xs[k+1]-xs[k]);
  }
  return d;
}

// The sim side of a bootstrap never changes: keep what is computed from it.
const memo=f=>{const c=new WeakMap();return gs=>{let v=c.get(gs);if(v===undefined)c.set(gs,v=f(gs));return v}};

export const playRates=memo(gs=>{
  const m=new Map();
  for(const g of gs)for(const name of Object.keys(g.plays))m.set(name,(m.get(name)??0)+1);
  return new Map([...m].map(([k,v])=>[k,v/gs.length]));
});
export const firstTurns=memo(gs=>{
  const m=new Map();
  for(const g of gs)for(const [name,r] of Object.entries(g.plays)){const e=m.get(name)??{sum:0,n:0};e.sum+=r.first;e.n++;m.set(name,e)}
  return new Map([...m].map(([k,v])=>[k,{mean:v.sum/v.n,n:v.n}]));
});

// Mean absolute difference of the play rate over every card either side played.
export function rateDistance(a,b){
  const ra=playRates(a),rb=playRates(b),names=new Set([...ra.keys(),...rb.keys()]);
  if(!names.size)return 0;
  return mean([...names].map(n=>Math.abs((ra.get(n)??0)-(rb.get(n)??0))));
}
// Mean absolute difference of the mean first-play turn over the cards both sides played. -> {d,cards}
export function firstTurnDistance(a,b){
  const fa=firstTurns(a),fb=firstTurns(b),both=[...fa.keys()].filter(n=>fb.has(n));
  return {d:both.length?mean(both.map(n=>Math.abs(fa.get(n).mean-fb.get(n).mean))):NaN,cards:both.length};
}
// The egg: hatch rate, how far it broke, how often it was attacked (per game) and when it hatched.
export const eggStats=memo(gs=>{
  const h=gs.filter(g=>g.hatchTurn!=null);
  return {hatchRate:mean(gs.map(g=>g.hatchTurn!=null?1:0)),hatchTurn:h.length?mean(h.map(g=>g.hatchTurn)):NaN,
    stage:mean(gs.map(g=>Math.max(g.stage,0))),attacks:gs.every(g=>g.eggAttacks==null)?NaN:mean(gs.map(g=>g.eggAttacks??0)),
    eggTurn:(()=>{const e=gs.filter(g=>g.plays[EGG]);return e.length?mean(e.map(g=>g.plays[EGG].first)):NaN})()};
});
export function eggDistance(a,b){
  const x=eggStats(a),y=eggStats(b);
  return {hatchRate:Math.abs(x.hatchRate-y.hatchRate),stage:Math.abs(x.stage-y.stage),attacks:Math.abs(x.attacks-y.attacks),
    hatchTurn:Math.abs(x.hatchTurn-y.hatchTurn),eggTurn:Math.abs(x.eggTurn-y.eggTurn)};
}

// What one unit of each term is worth in the composite: a gap of this size counts as 1.
export const SCALE={length:2,rate:0.10,first:1.5,egg:1};
const EGG_SCALE={hatchRate:0.20,stage:1,attacks:2};

// real, sim: arrays of game summaries. The composite is the mean of four terms, each distance divided by its SCALE;
// the egg term is itself the mean of three (hatch rate / 0.2, stage reached / 1, attacks per game / 2). 0 = alike.
export function likeness(real,sim){
  const length=wasserstein1(real.map(g=>g.eggTurns),sim.map(g=>g.eggTurns));
  const lengthEngine=wasserstein1(real.map(g=>g.endTurn),sim.map(g=>g.endTurn));
  const rate=rateDistance(real,sim),ft=firstTurnDistance(real,sim),e=eggDistance(real,sim);
  const eggTerm=mean(Object.keys(EGG_SCALE).map(k=>e[k]/EGG_SCALE[k]).filter(Number.isFinite));
  const terms={length:length/SCALE.length,rate:rate/SCALE.rate,first:ft.d/SCALE.first,egg:eggTerm/SCALE.egg};
  const composite=mean(Object.values(terms).filter(Number.isFinite));
  return {length,lengthEngine,rate,first:ft.d,firstCards:ft.cards,egg:e,terms,composite};
}

// A small seeded generator, so a report can be rebuilt with the same intervals.
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}};
const draw=(a,n,r)=>Array.from({length:n},()=>a[Math.floor(r()*a.length)]);
const quant=(v,q)=>{const s=v.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(q*s.length))]:NaN};
const flat=o=>{const out={};for(const [k,v] of Object.entries(o))if(typeof v==='number')out[k]=v;else if(v&&typeof v==='object')for(const [k2,v2] of Object.entries(v))if(typeof v2==='number')out[`${k}.${k2}`]=v2;return out};

// Resamples the real games (the sim stays); also the score a perfect simulator would get with that many real
// games (n games drawn from the sim itself against the whole sim): the noise floor.
export function bootstrap(real,sim,{boot=2000,seed=1}={}){
  const r=rng(seed),point=flat(likeness(real,sim)),reps=[],floor=[];
  for(let b=0;b<boot;b++){
    reps.push(flat(likeness(draw(real,real.length,r),sim)));
    floor.push(flat(likeness(draw(sim,real.length,r),sim)));
  }
  const ci={},fl={};
  for(const k of Object.keys(point)){
    const v=reps.map(x=>x[k]);ci[k]=[quant(v,0.025),quant(v,0.975)];
    const f=floor.map(x=>x[k]).filter(Number.isFinite);fl[k]=f.length?mean(f):NaN;
  }
  return {point,ci,floor:fl};
}

// ---- the CLI ----

const ROOT='D:/遊戲/Hearthstone/Logs';
function loadCards(){
  const list=JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
  return Object.fromEntries((Array.isArray(list)?list:Object.values(list)).filter(c=>c.id).map(c=>[c.id,c.name]));
}
const deckIdsOf=name=>new Set(Object.keys(JSON.parse(readFileSync(new URL(`../decks/${name}/${readdirSync(new URL(`../decks/${name}/`,import.meta.url)).find(f=>f.endsWith('.json'))}`,import.meta.url),'utf8')).cards));

export async function extractReal({root=ROOT}={}){
  const cards=loadCards(),deckIds=deckIdsOf('priest-egg'),out=[],ambiguous=[];let scanned=0;
  const files=[];
  for(const d of readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort())
    for(const f of ['Power_old.log','Power.log'])if(existsSync(join(root,d,f)))files.push(join(root,d,f).replaceAll('\\','/'));
  for(const f of files){
    const gs=await scanFile(f);scanned+=gs.length;
    for(const g of gs){const e=eggGame(g,{cards,deckIds});if(e?.ambiguous)ambiguous.push(e);else if(e)out.push(e)}
  }
  return {files,gamesScanned:scanned,ambiguous,games:out};
}

const erfc=x=>{const t=1/(1+0.5*x),r=t*Math.exp(-x*x-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));return r};
const choose=(n,k)=>{let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r};
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'-';
const pct=x=>Number.isFinite(x)?(100*x).toFixed(0)+'%':'-';
const ci=(c,d=2)=>c&&Number.isFinite(c[0])?`[${fmt(c[0],d)}, ${fmt(c[1],d)}]`:'-';
const q=(v,p)=>{const s=[...v].sort((a,b)=>a-b);if(!s.length)return NaN;const i=(s.length-1)*p,lo=Math.floor(i);return s[lo]+(s[Math.min(lo+1,s.length-1)]-s[lo])*(i-lo)};
const dist=v=>`${fmt(mean(v),1)} / ${fmt(q(v,0.5),1)} / ${fmt(q(v,0.25),1)}–${fmt(q(v,0.75),1)}`;

export function buildReport({real,sims,dir,boot=2000,deckNames}){
  const games=real.games,main=games.filter(g=>g.complete&&g.plays[EGG]);
  const L=[];
  const pilots=Object.keys(sims),S={};
  // cardwin records name the length `turns` (turns the egg priest began); the real summaries `eggTurns`
  for(const k of pilots)S[k]=sims[k].records.filter(g=>g.plays[EGG]&&!g.unfinished).map(g=>({...g,eggTurns:g.eggTurns??g.turns}));
  const scores={};
  for(const k of pilots)scores[k]=bootstrap(main,S[k],{boot,seed:7});
  L.push('# 蛋牧像不像真人：實戰 vs 模擬（2026-10-28）','');
  L.push('## 1. 資料來源與場數','');
  L.push(`- 實戰：${real.files.length} 個 Power log（\`D:/遊戲/Hearthstone/Logs/*/Power_old.log\`，目前沒有 Power.log），共 ${real.gamesScanned} 場，其中對手是蛋牧的 **${games.length}** 場（判準：對手側出現 The Egg of Khelos，或打出 ≥5 種蛋牧牌表的牌）。曖昧（兩側都像）${real.ambiguous.length} 場。`);
  const incomplete=games.filter(g=>!g.complete).length,noEgg=games.filter(g=>g.complete&&!g.plays[EGG]).length;
  L.push(`- 比對用 ${main.length} 場（log 完整、蛋牧至少打出一次蛋；排除未完整 ${incomplete} 場、整場沒打出蛋 ${noEgg} 場）。**實戰是靠蛋被打出來認出對手的，所以實戰的蛋打出率先天是 100%；模擬那邊也只取打出蛋的局，兩邊才在同一個條件下比較。**`);
  L.push('','| # | log | 起始行 | 結束行 | 開始時間 | 蛋牧先後手 | 蛋牧回合數 | 引擎回合 | 結果（蛋牧） | 打出蛋 | 孵化 | 蛋被攻擊 |','|--|--|--|--|--|--|--|--|--|--|--|--|');
  games.forEach((g,i)=>L.push(`| ${i+1} | ${g.file.replace(/^.*Logs\//,'')} | ${g.startLine} | ${g.endLine} | ${g.startTime} | ${g.eggFirst?'先手':'後手'} | ${g.eggTurns} | ${g.endTurn} | ${g.result??'未完'} | ${g.plays[EGG]?`第${g.plays[EGG].first}回合`:'無'} | ${g.hatchTurn!=null?`第${g.hatchTurn}回合`:'否'} | ${g.eggAttacks} |`));
  L.push('',`- 模擬：三個駕駛各對 \`warlock-zoo-v9\`，\`--decks priest-egg warlock-zoo --guard egg\`，雙方先後手都打。`);
  for(const k of pilots){const s=sims[k];L.push(`  - ${k}：${s.records.length} 局（seed ${s.seed}…${s.seed+s.games/2-1}，兩座位各 ${s.games/2} 局），模擬器 ${s.sim}；其中打出蛋 ${S[k].length} 局（${pct(S[k].length/s.records.length)}）用於比對。`)}
  L.push('','## 2. 回合換算','');
  L.push('- 一律用「蛋牧自己的第幾個回合」，1 起算。引擎回合 t（先手玩家的第一回合 = 1）→ 蛋牧自己的回合 = ceil(t/2)，先手後手算式相同（先手 t=1,3,5… → 1,2,3…；後手 t=2,4,6… → 1,2,3…）。');
  L.push('- 對局長度 = 蛋牧**開始過的回合數**：先手 ceil(T/2)、後手 floor(T/2)（T = 最後的引擎回合；對手回合結束的局，蛋牧最後一個回合是前一個）。另列引擎回合 T 當對照（舊筆記的 T15.9／T17–T31 是這個單位）。');
  L.push('- 實戰的 T 取該局最後一個 `TAG_CHANGE GameEntity TURN`，模擬取結束時的 `s.turn`。蛋牧先後手由 `FIRST_PLAYER` 標籤判定（實戰）／座位（模擬）。','');
  // metric 1
  L.push('## 3. 指標','','### 3.1 對局長度（蛋牧自己的回合數）','');
  L.push('| 來源 | 局數 | 平均 / 中位 / 四分位 | 引擎回合 T（平均 / 中位 / 四分位） |','|--|--|--|--|');
  L.push(`| 實戰 | ${main.length} | ${dist(main.map(g=>g.eggTurns))} | ${dist(main.map(g=>g.endTurn))} |`);
  for(const k of pilots)L.push(`| ${k} | ${S[k].length} | ${dist(S[k].map(g=>g.eggTurns))} | ${dist(S[k].map(g=>g.endTurn))} |`);
  const res=main.reduce((m,g)=>(m[g.result]=(m[g.result]??0)+1,m),{});
  L.push('',`實戰結果（蛋牧）：${JSON.stringify(res)}。模擬蛋牧勝率：${pilots.map(k=>`${k} ${pct(S[k].filter(g=>g.won).length/S[k].length)}`).join('、')}。`);
  // metric 2
  const rr=playRates(main),ft=firstTurns(main),fs={},rs={};
  for(const k of pilots){rs[k]=playRates(S[k]);fs[k]=firstTurns(S[k])}
  const names=[...new Set([...rr.keys(),...pilots.flatMap(k=>[...rs[k].keys()])])].sort((a,b)=>(rr.get(b)??0)-(rr.get(a)??0)||a.localeCompare(b));
  const inDeck=n=>deckNames.has(n)?'':'+';
  L.push('','### 3.2 每張牌的打出率與首打回合（蛋牧自己的回合）','');
  L.push('「+」＝不在牌表內（發現／複製／英雄技能等產生）。打出率＝打出的場次÷場數；首打＝有打出的場次中，第一次打出的回合平均。實戰 n 很小，打出率只有 1/n 的解析度。','');
  L.push(`| 牌 | 實戰打出率 | 實戰首打 | ${pilots.map(k=>`${k} 打出率 | ${k} 首打`).join(' | ')} |`,`|--|--|--|${pilots.map(()=>'--|--').join('|')}|`);
  for(const n of names)L.push(`| ${inDeck(n)}${n} | ${pct(rr.get(n)??0)} (${Math.round((rr.get(n)??0)*main.length)}/${main.length}) | ${ft.has(n)?fmt(ft.get(n).mean,1):'-'} | ${pilots.map(k=>`${pct(rs[k].get(n)??0)} | ${fs[k].has(n)?fmt(fs[k].get(n).mean,1):'-'}`).join(' | ')} |`);
  // metric 3
  const es=eggStats(main),ek={};for(const k of pilots)ek[k]=eggStats(S[k]);
  L.push('','### 3.3 蛋相關','');
  L.push(`| 項目 | 實戰 | ${pilots.join(' | ')} |`,`|--|--|${pilots.map(()=>'--').join('|')}|`);
  const row=(label,f)=>L.push(`| ${label} | ${f(es)} | ${pilots.map(k=>f(ek[k])).join(' | ')} |`);
  row('蛋打出回合（平均）',s=>fmt(s.eggTurn,1));
  row('孵化（Khelos 出場）的局比例',s=>pct(s.hatchRate));
  row('孵化回合（平均，孵化的局）',s=>fmt(s.hatchTurn,1));
  row('蛋破了幾次（平均，5＝孵化）',s=>fmt(s.stage,2));
  row('蛋被攻擊次數／局',s=>fmt(s.attacks,2));
  L.push('',`蛋被攻擊＝對手（動物園）的 ATTACK 目標是蛋的任一階段（不含 Khelos）；實戰從 \`BLOCK_START BlockType=ATTACK ... Target=[...cardId=DINO_410*]\`（只算 GameState 那份，不重複）數，模擬從 \`attack\` 動作的 targetId 數。蛋「受傷」（DAMAGE 標籤）次數沒量：實戰的法術／AOE 傷害和戰鬥傷害混在一起，模擬沒有對應的逐次紀錄。`);
  // scores
  L.push('','## 4. 像真人分數（越小越像）','');
  L.push('分項（原單位）：');
  L.push('- 局長：1-Wasserstein，單位＝蛋牧回合。');
  L.push('- 打出率：各牌打出率絕對差的平均（取兩邊任一邊有打出的所有牌）。');
  L.push('- 首打：兩邊都打過的牌，首打回合平均的絕對差再平均（單位＝回合）。');
  L.push('- 蛋：孵化率差（÷0.2）、蛋破幾次的平均差（÷1）、蛋被攻擊次數／局的差（÷2）三項取平均。');
  L.push(`合成分數＝四項（局長÷${SCALE.length}、打出率÷${SCALE.rate}、首打÷${SCALE.first}、蛋÷${SCALE.egg}）的平均。除數是「這樣大的差距算 1」的人為尺度（局長差 2 回合、打出率平均差 10 個百分點、首打差 1.5 回合…），不是統計量；換尺度會改變合成分數但不改變分項。95% CI 是對實戰 ${main.length} 場有放回重抽 ${boot} 次（模擬固定）。**雜訊底**＝如果真人其實就是模擬（從該駕駛的模擬局重抽 ${main.length} 場對整體模擬）時期望的分數，實戰 n 太小，這個底不是 0。`,'');
  const T=[['composite','合成分數'],['terms.length','局長項'],['terms.rate','打出率項'],['terms.first','首打項'],['terms.egg','蛋項']];
  const R=[['length','局長 W1（回合）'],['lengthEngine','局長 W1（引擎回合，對照）'],['rate','打出率 MAD'],['first','首打 MAD（回合）'],['egg.hatchRate','孵化率差'],['egg.stage','蛋破幾次差'],['egg.attacks','蛋被攻擊差（次/局）'],['egg.eggTurn','蛋打出回合差'],['egg.hatchTurn','孵化回合差']];
  L.push(`| 分數 | ${pilots.map(k=>`${k}（95% CI／雜訊底）`).join(' | ')} |`,`|--|${pilots.map(()=>'--').join('|')}|`);
  for(const [key,label] of [...T,...R])L.push(`| ${label} | ${pilots.map(k=>{const s=scores[k];return `${fmt(s.point[key],2)} ${ci(s.ci[key])} ／ ${fmt(s.floor[key],2)}`}).join(' | ')} |`);
  L.push('','每個分項附的打出率差距若為 0，表示完全一樣；首打 MAD 只計兩邊都打過的牌（張數見 score.json 的 firstCards）。');
  // gaps: how unlikely each difference is if the real games came from the sim (n = the real games, so most are not rare)
  L.push('','## 5. 差距最大的前 5 項','');
  const best=pilots.slice().sort((a,b)=>scores[a].point.composite-scores[b].point.composite)[0],sb=S[best];
  L.push(`以合成分數最小（最像真人）的 ${best} 為準。實戰只有 ${main.length} 場，不能只看差多少，所以每項算「如果實戰其實是 ${best} 的局，差這麼多的機率 p」再由小到大排：打出率用精確二項檢定（p＝${best} 的打出率），首打回合／局長／蛋指標用 z（${best} 的標準差 ÷ √實戰場數）。p 沒有做多重比較校正（${names.length} 張牌＋其他指標都在比），所以 p＞0.01 的項目很可能只是巧合；同為 p 很小時，比較看實戰 n 夠不夠。`,'');
  const gaps=[],sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const zp=(realVals,simVals)=>{
    if(!realVals.length||!simVals.length)return null;
    const se=sd(simVals)/Math.sqrt(realVals.length);if(!(se>0))return null;
    const z=(mean(realVals)-mean(simVals))/se;return Math.min(1,erfc(Math.abs(z)/Math.SQRT2));
  };
  const binomP=(k,n,p0)=>{
    const p=Math.min(Math.max(p0,0.5/sb.length),1-0.5/sb.length),pm=Array.from({length:n+1},(_,i)=>choose(n,i)*p**i*(1-p)**(n-i));
    return Math.min(1,pm.reduce((t,x)=>t+(x<=pm[k]*(1+1e-9)?x:0),0));
  };
  for(const n of names){
    const a=rr.get(n)??0,b=rs[best].get(n)??0,k=Math.round(a*main.length);
    gaps.push({label:`${inDeck(n)}${n} 打出率`,real:`${pct(a)} (${k}/${main.length})`,sim:pct(b),p:binomP(k,main.length,b)});
    const rf=main.filter(g=>g.plays[n]).map(g=>g.plays[n].first),sf=sb.filter(g=>g.plays[n]).map(g=>g.plays[n].first);
    if(rf.length&&sf.length)gaps.push({label:`${inDeck(n)}${n} 首打回合（實戰 n=${rf.length}）`,real:fmt(mean(rf),1),sim:fmt(mean(sf),1),p:zp(rf,sf)});
  }
  const eggOf=g=>({hatch:g.hatchTurn!=null?1:0,att:g.eggAttacks??0,stage:Math.max(g.stage,0)});
  for(const [label,f,d] of [['孵化率',g=>eggOf(g).hatch,2],['蛋被攻擊次數／局',g=>eggOf(g).att,2],['蛋破幾次',g=>eggOf(g).stage,2],['對局長度（蛋牧回合）',g=>g.eggTurns,1]])
    gaps.push({label,real:fmt(mean(main.map(f)),d),sim:fmt(mean(sb.map(f)),d),p:zp(main.map(f),sb.map(f))});
  const ranked=gaps.filter(x=>x.p!=null).sort((a,b)=>a.p-b.p);
  L.push('| # | 項目 | 實戰 | '+best+' | p |','|--|--|--|--|--|');
  ranked.slice(0,5).forEach((x,i)=>L.push(`| ${i+1} | ${x.label} | ${x.real} | ${x.sim} | ${x.p<0.0001?'<0.0001':x.p.toFixed(4)} |`));
  L.push('',`共比較 ${ranked.length} 項，p<0.05 的有 ${ranked.filter(x=>x.p<0.05).length} 項（純巧合下 5 場大約會有 ${(ranked.length*0.05).toFixed(0)} 項）。`);
  const extra=join(dir,'interpretation.md');
  if(existsSync(extra))L.push('','## 6. 解讀','',readFileSync(extra,'utf8').trim());
  return {report:L.join('\n')+'\n',scores,main:main.length};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [cmd,...rest]=process.argv.slice(2);
  const opt=(k,d)=>{const i=rest.indexOf(k);return i<0?d:rest[i+1]};
  if(cmd==='extract'){
    const out=opt('--out','runtime/likeness-egg-20261028/real-egg.json');
    const r=await extractReal({root:opt('--root',ROOT)});
    writeFileSync(out,JSON.stringify(r));
    console.log(`${r.files.length} logs, ${r.gamesScanned} games, ${r.games.length} egg priest games (${r.games.filter(g=>g.complete&&g.plays[EGG]).length} usable), ${r.ambiguous.length} ambiguous -> ${out}`);
  }else if(cmd==='report'){
    const dir=rest[0]??'runtime/likeness-egg-20261028',boot=Number(opt('--boot',2000));
    const real=JSON.parse(readFileSync(join(dir,'real-egg.json'),'utf8')),sims={};
    for(const f of readdirSync(dir).filter(f=>/^sim-.*\.json$/.test(f)).sort())sims[f.slice(4,-5)]=JSON.parse(readFileSync(join(dir,f),'utf8'));
    const cards=loadCards(),deckNames=new Set([...deckIdsOf('priest-egg')].map(id=>cards[id]));
    const {report,scores,main}=buildReport({real,sims,dir,boot,deckNames});
    writeFileSync(join(dir,'report.md'),report);
    writeFileSync(join(dir,'score.json'),JSON.stringify({realGames:main,boot,scale:SCALE,scores},null,1));
    console.log(`report.md written (${main} real games)`);
    for(const [k,s] of Object.entries(scores))console.log(k,'composite',fmt(s.point.composite),ci(s.ci.composite),'floor',fmt(s.floor.composite));
  }else throw Error('usage: node src/opp-likeness.mjs extract|report ...');
}
