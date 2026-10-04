import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replayText,extractEvidence,matchupSignals} from './history-matchup.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const tracker=join(process.env.APPDATA,'HearthstoneDeckTracker');
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const tag=(s,k)=>decode(s.match(new RegExp(`<${k}>([^<]*)</${k}>`))?.[1]??'');
const metadata=new Map(),sourceHashes={};
for(const f of ['DeckStats.xml','DefaultDeckStats.xml']){
  const text=await readFile(join(tracker,f),'utf8');sourceHashes[f]=hash(text);
  for(const m of text.matchAll(/<Game>([\s\S]*?)<\/Game>/g)){
    const s=m[1];if(tag(s,'PlayerHero')!=='Warlock'||tag(s,'Format')!=='Wild'||tag(s,'GameMode')!=='Ranked')continue;
    const id=tag(s,'GameId');if(!id)throw Error('Missing GameId');
    if(!['true','false'].includes(tag(s,'Coin')))throw Error('Missing authoritative Coin flag');
    const g={id,start:tag(s,'StartTime'),end:tag(s,'EndTime'),result:tag(s,'Result'),opponentClass:tag(s,'OpponentHero'),
      coin:tag(s,'Coin')==='true',friendlyPlayerId:Number(tag(s,'FriendlyPlayerId')),deckId:tag(s,'DeckId'),replayFile:tag(s,'ReplayFile')};
    if(metadata.has(id)&&JSON.stringify(metadata.get(id))!==JSON.stringify(g))throw Error('Conflicting GameId');
    metadata.set(id,g);
  }
}
if(metadata.size!==196||new Set([...metadata.values()].map(g=>g.deckId)).size!==1)
  throw Error('Historical scope changed; expected the audited 196 games from one deck ID');
const dir=join(root,'eval/runs',`history-quadrants-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(dir,{recursive:true});
const cardsText=await readFile(join(root,'data/cards.enUS.json'),'utf8');
sourceHashes['data/cards.enUS.json']=hash(cardsText);
const cards=Object.fromEntries(JSON.parse(cardsText).map(c=>[c.id,c]));
await mkdir(join(dir,'source'),{recursive:true});
for(const file of ['history-matchup.mjs','eval-history-quadrants.mjs','power.mjs','mulligan-cohort.mjs','eval-strength.mjs']){
  const source=await readFile(join(root,'src',file));sourceHashes[`src/${file}`]=hash(source);
  await writeFile(join(dir,'source',file),source);
}
const games=[];
for(const [i,g] of [...metadata.values()].sort((a,b)=>a.start.localeCompare(b.start)).entries()){
  const {replayFile,...safe}=g,row={...safe,ordinal:i+1,initiative:g.coin?'second':'first',matchup:{type:null,source:null}};
  try{
    const zip=await readFile(join(tracker,'Replays',replayFile));row.replaySHA256=hash(zip);
    row.evidence=extractEvidence(replayText(zip),{friendlyPlayerId:g.friendlyPlayerId,coin:g.coin,cards});
    row.signals=matchupSignals(row.evidence);
  }catch(e){row.error=e.message;}
  games.push(row);if((i+1)%25===0)console.log(`Extracted ${i+1}/${metadata.size}`);
}
await writeFile(join(dir,'games.json'),JSON.stringify(games,null,2));
await writeFile(join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceHashes,
  extractorSHA256:hash(await readFile(join(root,'src/history-matchup.mjs'))),n:games.length,
  scope:'All explicitly Warlock/Wild/Ranked tracker games; may include manual, interrupted and older strategy versions. Opponent evidence is public plays/boards only.',
  criteria:'User: early strong bodies mean non-control; 40 health, AOE, many draw spells, weak bodies, ramp, idle first two turns are control signals. Conflicting/insufficient evidence requires user ruling.'},null,2));
console.log(JSON.stringify({dir,n:games.length,extracted:games.filter(g=>g.evidence).length,errors:games.filter(g=>g.error).map(g=>({ordinal:g.ordinal,error:g.error})),receiptComplete:games.filter(g=>g.evidence?.receiptComplete).length}));
