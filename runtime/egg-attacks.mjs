// How often the zoo side attacks the Egg of Khelos (decks/priest-egg), which the deck's plan says to
// leave alone. Greedy play of both networks, the same way src/selfplay-match.mjs plays.
//
//   node runtime/egg-attacks.mjs <zooNet.json> <priestNet.json> [games=200] [seed=1]
//
// Counts zoo attack steps whose target is any of the five Egg stages (not the hatched Khelos), the
// games with at least one, and the games where Khelos was hatched. Prints one JSON line.
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,winner} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';

const EGGS=new Set(['DINO_410','DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5']);
const [zooPath,priestPath,games='200',seed='1']=process.argv.slice(2);
if(!zooPath||!priestPath)throw Error('usage: node runtime/egg-attacks.mjs <zooNet.json> <priestNet.json> [games] [seed]');
const zoo=loadNet(zooPath),priest=loadNet(priestPath);
const zooList=loadList('warlock-zoo'),priestList=loadList('priest-egg');

const out={games:0,zooEggAttacks:0,gamesWithEggAttack:0,zooAttacks:0,hatchedGames:0,zooWins:0,priestWins:0,draws:0};
const n=Number(games),base=Number(seed);
for(let g=0;g<n;g++){
  const zooFirst=g%2===0;
  const lists=zooFirst?[zooList,priestList]:[priestList,zooList];
  const nets=zooFirst?[zoo,priest]:[priest,zoo];
  const zooSeat=zooFirst?0:1;
  let s=newGame({lists,seed:base+g}),eggHits=0,hatched=false;
  for(let k=0;k<1500;k++){
    const legal=moves(s);
    if(!legal.length)break;
    const m=nets[s.seat].rank(s,legal).steps[0].move;
    if(m.kind==='attack'&&s.seat===zooSeat){
      out.zooAttacks++;
      const t=s.opp.find(b=>b.id===m.targetId);
      if(t&&EGGS.has(t.cardId))eggHits++;
    }
    s=apply(s,m).s;
    if(!hatched&&[...s.me,...s.opp].some(b=>b.cardId==='DINO_410t'))hatched=true;
  }
  const w=winner(s);
  out.games++;
  out.zooEggAttacks+=eggHits;
  if(eggHits)out.gamesWithEggAttack++;
  if(hatched)out.hatchedGames++;
  if(w===null||w==='draw')out.draws++;
  else if(w===zooSeat)out.zooWins++;
  else out.priestWins++;
}
out.avgEggAttacksPerGame=out.zooEggAttacks/out.games;
out.shareGamesWithEggAttack=out.gamesWithEggAttack/out.games;
console.log(JSON.stringify(out));
