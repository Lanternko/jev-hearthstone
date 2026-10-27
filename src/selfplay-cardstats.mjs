// How often each card of a deck is drawn into the hand and how often it is played, over whole random
// or scripted games: a card drawn many times and never played is a card the simulator cannot play.
//
//   node src/selfplay-cardstats.mjs [deckA=dh-cthun] [deckB=warlock-zoo] [games=300] [seed=1] [random|rush]
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,randomPolicy,rushPolicy} from './selfplay.mjs';

// -> Map name -> {seen, played} for the seat named `who` (0 or 1) of the decks.
export function cardStats(names,{games=300,seed=1,policy='random',who=0}={}){
  const lists=names.map(loadList),stats=new Map(),row=n=>{let r=stats.get(n);if(!r)stats.set(n,r={seen:0,played:0});return r};
  for(let g=0;g<games;g++){
    const id=seed+g,pick=(policy==='rush'?rushPolicy:randomPolicy)(id);
    let s=newGame({lists,seed:id});
    const known=new Set();
    for(let n=0;n<3000;n++){
      const legal=moves(s);
      if(!legal.length)break;
      if(s.seat===who)for(const c of s.hand)if(!known.has(c.id)){known.add(c.id);row(c.name).seen++}
      const m=pick(s,legal);
      if(s.seat===who&&m.kind==='play'){
        const c=s.hand.find(x=>x.id===m.id);
        if(c)row(c.name).played++;
      }
      s=apply(s,m).s;
    }
  }
  return stats;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [a='dh-cthun',b='warlock-zoo',games=300,seed=1,policy='random']=process.argv.slice(2);
  const stats=cardStats([a,b],{games:Number(games),seed:Number(seed),policy});
  console.log(`${a} (first seat) v ${b}, ${games} games, ${policy} policy: card, seen, played`);
  for(const [n,r] of [...stats].sort((x,y)=>y[1].seen-x[1].seen))console.log(`${n.padEnd(28)} ${String(r.seen).padStart(5)} ${String(r.played).padStart(5)}${r.seen>20&&!r.played?'   <-- never played':''}`);
}
