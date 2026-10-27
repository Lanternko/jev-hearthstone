// Win rate of a zoo network against the scripted rush player, with warlock-zoo on both sides.
// src/selfplay-net.mjs plays the script's games with the network's own first two decks; a run trained
// with four decks gets warlock-discard there, so this fixes the deck to compare zoo nets fairly.
//
//   node runtime/rush-check.mjs <net.json> [games=1000] [seed=1]
//
// Prints one JSON line.
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,winner,rushPolicy} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';

const [path,games='1000',seed='1']=process.argv.slice(2);
if(!path)throw Error('usage: node runtime/rush-check.mjs <net.json> [games] [seed]');
const net=loadNet(path),list=loadList('warlock-zoo');
let won=0,drawn=0,lost=0;
for(let g=0;g<Number(games);g++){
  const id=Number(seed)+g,mine=id&1,pick=rushPolicy(id);
  let s=newGame({lists:[list,list],seed:id});
  for(let n=0;n<1500;n++){
    const legal=moves(s);
    if(!legal.length)break;
    s=apply(s,s.seat===mine?net.rank(s,legal).steps[0].move:pick(s,legal)).s;
  }
  const w=winner(s)??'draw';
  if(w==='draw')drawn++;else if(w===mine)won++;else lost++;
}
const n=Number(games);
console.log(JSON.stringify({net:path,games:n,won,drawn,lost,winRate:won/n}));
