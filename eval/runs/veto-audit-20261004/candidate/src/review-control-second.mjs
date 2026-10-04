// Offline review only. Read whitelisted HDT fields; never export player names or replay filenames.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createParser} from './power.mjs';
import {replayText,cardSignals} from './history-matchup.mjs';
const source='history-classified-2026-10-01T19-18-06-561Z';
const opening='opening-winrates-2026-10-01T19-20-03-029Z';
const tracker=join(process.env.APPDATA,'HearthstoneDeckTracker');
const sha=b=>createHash('sha256').update(b).digest('hex');
const tag=(s,k)=>s.match(new RegExp(`<${k}>([^<]*)</${k}>`))?.[1]??'';
const sourceBytes=await readFile(`eval/runs/${source}/games.json`);
const games=JSON.parse(sourceBytes).filter(g=>g.matchup.type==='control'&&g.coin);
if(games.length!==27||games.filter(g=>g.result==='Win').length!==10)throw Error('Frozen quadrant mismatch');
const metadata=new Map(),hashes={};
for(const file of ['DeckStats.xml','DefaultDeckStats.xml']){
  const bytes=await readFile(join(tracker,file));hashes[file]=sha(bytes);
  for(const m of bytes.toString().matchAll(/<Game>([\s\S]*?)<\/Game>/g)){
    const s=m[1],id=tag(s,'GameId');
    if(!games.some(g=>g.id===id))continue;
    const url=tag(s,'ReplayUrl'),uploadId=tag(s,'UploadId');
    if(!/^https:\/\/hsreplay\.net\/uploads\/upload\/[A-Za-z0-9]+\/$/.test(url)||!url.includes(`/${uploadId}/`))throw Error('Unexpected stored replay URL');
    metadata.set(id,{url,file:tag(s,'ReplayFile')});
  }
}
const cardBytes=await readFile('data/cards.enUS.json');
const cards=Object.fromEntries(JSON.parse(cardBytes).map(c=>[c.id,c]));
function timeline(text,friendly){
  const p=createParser(),actions=[],ends=[];let pending=null,depth=0;
  const card=e=>{
    const c=cards[e?.cardId];if(!c)return null;
    return {entityId:e.id,cardId:c.id,name:c.name,type:c.type,cost:Number(e.tags.COST??c.cost??0),
      attack:Number(e.tags.ATK??c.attack??0),health:Number(e.tags.HEALTH??c.health??0)-Number(e.tags.DAMAGE??0),...cardSignals(c)};
  };
  const snapshot=s=>{
    const es=[...s.entities.values()],side=id=>{
      const player=es.find(e=>e.playerId===id),hero=es.find(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='PLAY'&&e.tags.CARDTYPE==='HERO');
      return {mana:Number(player?.tags.RESOURCES??0)-Number(player?.tags.RESOURCES_USED??0)-Number(player?.tags.OVERLOAD_LOCKED??0),
        maxMana:Number(player?.tags.RESOURCES??0),health:Number(hero?.tags.HEALTH??0)-Number(hero?.tags.DAMAGE??0),armor:Number(hero?.tags.ARMOR??0),
        board:es.filter(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='PLAY'&&e.tags.CARDTYPE==='MINION').map(card).filter(Boolean),
        hand:id===friendly?es.filter(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='HAND').map(card).filter(Boolean):undefined};
    };
    return {own:side(friendly),opponent:side(3-friendly)};
  };
  for(const line of text.split(/\r?\n/)){
    const s=p.result(),engineTurn=Number(s.game?.tags.TURN??0);
    if(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=TURN/.test(line)&&engineTurn){
      ends.push({engineTurn,turn:Math.ceil(engineTurn/2),side:engineTurn%2===0?'own':'opponent',state:snapshot(s)});
    }
    const m=line.match(/GameState\.DebugPrintPower\(\).*BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b.*?\bplayer=(\d+)\]/);
    if(m&&engineTurn){
      const id=Number(m[2]),e=s.entities.get(id),target=line.match(/\bTarget=\[.*?\bid=(\d+)\b/);
      const targetId=target?Number(target[1]):null,targetEntity=s.entities.get(targetId);
      const targetLabel=targetEntity?.tags.CARDTYPE==='HERO'?(Number(targetEntity.tags.CONTROLLER)===friendly?'own hero':'opponent hero'):
        card(targetEntity)?.name??null;
      pending={kind:m[1],engineTurn,turn:Math.ceil(engineTurn/2),side:Number(m[3])===friendly?'own':'opponent',depth,
        entityId:id,card:card(e),originZone:e?.tags.ZONE??null,targetId,targetLabel,before:snapshot(s)};
      actions.push(pending);
    }
    if(/GameState\.DebugPrintPower\(\).*BLOCK_START/.test(line))depth++;
    if(/GameState\.DebugPrintPower\(\) -\s*BLOCK_END\s*$/.test(line))depth=Math.max(0,depth-1);
    p.feed(line);
    if(pending&&!pending.card){const c=card(p.result().entities.get(pending.entityId));if(c)pending.card=c;}
  }
  const s=p.result(),engineTurn=Number(s.game?.tags.TURN??0);
  if(engineTurn)ends.push({engineTurn,turn:Math.ceil(engineTurn/2),side:engineTurn%2===0?'own':'opponent',state:snapshot(s)});
  return {actions,ends};
}
const rows=[];
for(const g of games){
  const meta=metadata.get(g.id);if(!meta)throw Error('Missing HDT metadata');
  const bytes=await readFile(join(tracker,'Replays',meta.file));if(sha(bytes)!==g.replaySHA256)throw Error('Frozen replay changed');
  const t=timeline(replayText(bytes),g.friendlyPlayerId);
  // Independently match the existing public PLAY sequence exactly, not merely its size.
  const actual=t.actions.filter(a=>a.kind==='PLAY'&&a.side==='opponent'&&a.card&&a.card.type!=='HERO_POWER').map(a=>[a.engineTurn,a.entityId,a.card.cardId]);
  const expected=g.evidence.plays.map(a=>[a.engineTurn,a.entityId,a.cardId]);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Opponent sequence mismatch #${g.ordinal}`);
  if(t.actions.some(a=>a.depth===0&&a.side==='own'&&a.engineTurn%2!==0))throw Error('Own-turn parity mismatch');
  const aoes=t.actions.filter(a=>a.kind==='PLAY'&&a.side==='opponent'&&a.card?.aoe).map(a=>({
    turn:a.turn,engineTurn:a.engineTurn,depth:a.depth,name:a.card.name,before:a.before,afterOpponentTurn:t.ends.find(e=>e.engineTurn===a.engineTurn)?.state??null}));
  rows.push({ordinal:g.ordinal,id:g.id,date:g.start,result:g.result,opponent:g.opponentClass,url:meta.url,
    replaySHA256:g.replaySHA256,classification:g.matchup,offered:g.evidence.opening.offered,kept:g.evidence.kept,
    finalOpening:g.evidence.finalOpening.cards,aoes,...t});
  console.log(`Reviewed #${g.ordinal}: ${t.actions.length} actions, ${aoes.length} public AOE spells`);
}
const statsBytes=await readFile(`eval/runs/${opening}/stats.json`);
const quadrant=JSON.parse(statsBytes).quadrants.control_second;
for(const metric of Object.values(quadrant.metrics)){
  if(metric.baseline.n!==27||metric.baseline.wins!==10||metric.excluded.length)throw Error('Opening denominator mismatch');
  for(const c of Object.values(metric.cards))if(c.present.n+c.without.n!==27||c.present.wins+c.without.wins!==10)throw Error('Card partition mismatch');
}
const dir=`eval/runs/control-second-review-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/games.json`,JSON.stringify(rows,null,2));
await writeFile(`${dir}/stats.json`,JSON.stringify(quadrant,null,2));
await writeFile(`${dir}/manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),source,opening,sourceSHA256:sha(sourceBytes),statsSHA256:sha(statsBytes),metadataSHA256:hashes,cardsSHA256:sha(cardBytes),generatorSHA256:sha(await readFile('src/review-control-second.mjs')),n:27,wins:10,losses:17,checks:'All 27 replay hashes match frozen classification; opponent PLAY sequences exactly match prior extractor; own root actions occur on second-player turns; all opening denominators complete and card partitions conserved.',limits:'Stored HDT ReplayUrl; remote replay access not confirmed. Timeline is observed actions, not model intent, counterfactual optimal play or attribution to latest Jev version. AOE list detects public AOE spell text; minion, single-target, generated and conditional effects require user review. After-AOE state is end of opponent turn, not immediate spell resolution.'},null,2));
await writeFile(`${dir}/generator.mjs`,await readFile('src/review-control-second.mjs'));
console.log(JSON.stringify({dir,n:rows.length,wins:10,losses:17}));
