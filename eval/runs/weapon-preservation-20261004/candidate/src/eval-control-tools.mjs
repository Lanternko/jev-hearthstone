import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {reviewTimeline} from './replay-review.mjs';
import {replayText} from './history-matchup.mjs';
import {wilson} from './eval-strength.mjs';
const source='eval/runs/history-classified-2026-10-01T19-18-06-561Z/games.json';
const bytes=await readFile(source),games=JSON.parse(bytes).filter(g=>g.matchup.type==='control');
if(games.length!==54||games.filter(g=>g.result==='Win').length!==27)throw Error('Frozen control scope mismatch');
const hash=b=>createHash('sha256').update(b).digest('hex'),tag=(s,k)=>s.match(new RegExp(`<${k}>([^<]*)</${k}>`))?.[1]??'';
const tracker=join(process.env.APPDATA,'HearthstoneDeckTracker'),metadata=new Map(),sourceHashes={};
for(const file of ['DeckStats.xml','DefaultDeckStats.xml']){
  const b=await readFile(join(tracker,file));sourceHashes[file]=hash(b);
  for(const m of b.toString().matchAll(/<Game>([\s\S]*?)<\/Game>/g)){
    const s=m[1],id=tag(s,'GameId');if(!games.some(g=>g.id===id))continue;
    const url=tag(s,'ReplayUrl');
    if(!/^https:\/\/hsreplay\.net\/uploads\/upload\/[A-Za-z0-9]+\/$/.test(url))throw Error('Missing stored URL');
    metadata.set(id,{url,file:tag(s,'ReplayFile')});
  }
}
const cardBytes=await readFile('data/cards.enUS.json'),cards=Object.fromEntries(JSON.parse(cardBytes).map(c=>[c.id,c]));
sourceHashes.cards=hash(cardBytes);
const core=['Cursed Catacombs','Platysaur','Party Fiend','Disposable Acolytes'],buffs=['Wicked Whispers','Entropic Continuity'];
const summarize=gs=>{const n=gs.length,wins=gs.filter(g=>g.result==='Win').length;return {n,wins,winRate:n?wins/n:null,ci95:wilson(wins,n),ordinals:gs.map(g=>g.ordinal)};};
const rows=[];
for(const g of games){
  const meta=metadata.get(g.id);if(!meta)throw Error('Missing metadata');
  const zip=await readFile(join(tracker,'Replays',meta.file));if(hash(zip)!==g.replaySHA256)throw Error('Replay SHA mismatch');
  const t=reviewTimeline(replayText(zip),{friendlyPlayerId:g.friendlyPlayerId,coin:g.coin,cards});
  const publicPlays=t.actions.filter(a=>a.side==='opponent'&&a.kind==='PLAY'&&a.card&&a.card.type!=='HERO_POWER').map(a=>[a.engineTurn,a.entityId,a.card.cardId]);
  if(JSON.stringify(publicPlays)!==JSON.stringify(g.evidence.plays.map(a=>[a.engineTurn,a.entityId,a.cardId])))throw Error(`PLAY sequence mismatch #${g.ordinal}`);
  const own=t.actions.filter(a=>a.side==='own'&&a.depth===0),plays=own.filter(a=>a.kind==='PLAY');
  const buffPlays=plays.filter(a=>buffs.includes(a.card?.name));
  const weapons=plays.filter(a=>a.card?.name==='Chronoclaws');
  const weaponAttacks=own.filter(a=>a.kind==='ATTACK'&&a.entityId===a.before.own.heroId&&a.before.own.weapons.some(w=>w.name==='Chronoclaws'));
  for(const a of weaponAttacks){
    const next=own.find(b=>b.sequence>a.sequence)?.sequence??Infinity;
    a.weaponDiscards=t.handTransitions.filter(e=>e.sequence>a.sequence&&e.sequence<next&&e.engineTurn===a.engineTurn&&e.sources.some(c=>c.name==='Chronoclaws')).map(e=>e.card);
  }
  const ocular=plays.filter(a=>a.card?.name==='Ocular Occultist');
  // For these observed roots, a material leaving hand while Ocular resolves is unambiguously its discard.
  const ocularDiscards=ocular.map(a=>({turn:a.turn,cardId:a.card.cardId,discard:a.handToGraveyard.map(c=>c.name)}));
  rows.push({ordinal:g.ordinal,id:g.id,result:g.result,opponent:g.opponentClass,initiative:g.coin?'second':'first',url:meta.url,
    replaySHA256:g.replaySHA256,offered:g.evidence.opening.offered,kept:g.evidence.kept,finalOpening:g.evidence.finalOpening.cards,
    ownTurnThree:t.turnStarts.some(e=>e.side==='own'&&e.turn===3),ownTurnFive:t.turnStarts.some(e=>e.side==='own'&&e.turn===5),
    shortEnd:t.turnEnds.at(-1).turn<=2,firstBuffTurn:buffPlays[0]?.turn??null,buffPlays,weapons,weaponAttacks,ocular,ocularDiscards,...t});
}
const ocularSix=rows.filter(g=>g.initiative==='second'&&g.finalOpening.some(c=>c.name==='Ocular Occultist')&&g.finalOpening.some(c=>core.includes(c.name)));
if(ocularSix.length!==6||ocularSix.filter(g=>g.ownTurnThree).length!==5||ocularSix.filter(g=>g.ownTurnThree&&g.ocular[0]?.turn===3).length!==5)throw Error('Ocular-six boundary mismatch');
const metrics=Object.fromEntries(['first','second'].map(side=>{
  const gs=rows.filter(g=>g.initiative===side),atFive=gs.filter(g=>g.ownTurnFive);
  const group=eligible=>Object.fromEntries([4,5].map(deadline=>[deadline,{cast:summarize(eligible.filter(g=>g.firstBuffTurn!==null&&g.firstBuffTurn<=deadline)),notCast:summarize(eligible.filter(g=>g.firstBuffTurn===null||g.firstBuffTurn>deadline))}]));
  const handMetric=key=>{
    const withWeapon=gs.filter(g=>g[key].some(c=>c.name==='Chronoclaws'));
    return {withWeapon:summarize(withWeapon),withCore:summarize(withWeapon.filter(g=>g[key].some(c=>core.includes(c.name)))),withoutCore:summarize(withWeapon.filter(g=>!g[key].some(c=>core.includes(c.name))))};
  };
  const stats={baseline:summarize(gs),buffAll:group(gs),buffReachedOwnFive:group(atFive),weaponKept:handMetric('kept'),weaponFinal:handMetric('finalOpening'),
    weaponPlayed:summarize(gs.filter(g=>g.weapons.length)),weaponNeverPlayed:summarize(gs.filter(g=>!g.weapons.length)),noBuffWins:gs.filter(g=>g.result==='Win'&&g.firstBuffTurn===null).map(g=>({ordinal:g.ordinal,url:g.url,short:g.shortEnd}))};
  for(const partition of [stats.buffAll,stats.buffReachedOwnFive])for(const split of Object.values(partition)){
    const expected=partition===stats.buffAll?gs:atFive;
    if(split.cast.n+split.notCast.n!==expected.length||split.cast.wins+split.notCast.wins!==expected.filter(g=>g.result==='Win').length)throw Error('Buff partition mismatch');
  }
  return [side,stats];
}));
const dir=`eval/runs/control-tools-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/games.json`,JSON.stringify(rows,null,2));
await writeFile(`${dir}/results.json`,JSON.stringify({metrics,ocularSix:ocularSix.map(g=>({ordinal:g.ordinal,result:g.result,url:g.url,reachedOwnThree:g.ownTurnThree,firstOcular:g.ocular[0]??null}))},null,2));
const sourceFiles=['eval-control-tools.mjs','replay-review.mjs','power.mjs','history-matchup.mjs','eval-strength.mjs'];
for(const file of sourceFiles){const b=await readFile(`src/${file}`);sourceHashes[file]=hash(b);await writeFile(`${dir}/${file}`,b);}
await writeFile(`${dir}/manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),source,sourceSHA256:hash(bytes),sourceHashes,n:54,wins:27,checks:'All replay SHA and public PLAY sequences conserved; both initiative parities checked; six Ocular cases and buff partitions independently checked',definitions:'Buff before turn five = own T1–T4; by turn five = own T1–T5. Own-five eligibility = observed MAIN_ACTION on own fifth turn. Turn starts do not imply all opponents survive to turn end.',limits:'Exploratory observational data, no causal estimate of keeping a weapon or casting buff; played-card groups depend on draws, survival and player decisions. Includes historical/manual/interrupted games. Successful weapon finishing is not proof it should be kept in initial hand. No strategy/model/game changes.'},null,2));
console.log(JSON.stringify({dir,metrics,ocularSix:ocularSix.map(g=>({ordinal:g.ordinal,discards:g.ocularDiscards[0]}))},null,2));
