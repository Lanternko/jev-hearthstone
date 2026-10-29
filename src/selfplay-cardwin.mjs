// Card win rates of model A's deck in self-play games between two networks, played as src/selfplay-match.mjs
// plays them (greedy, both orders, --guard egg as there): for each card, the games it was drawn in and the
// games it was played in, with A's win rate in each, and the mean turn of its first play. A card drawn
// often and played rarely, or whose played win rate is low, is the one to look at. Cards that are not in
// the decklist (discovered, copied, given by the hero power) are marked +.
// The win rates are not causes: a card played late is played in games that lasted, whoever won them.
//
// With records (an array) every game also pushes one summary of A's side: the length, each card's first play
// by A's own turn count, and the Egg of Khelos (attacks on it, the most cracked stage, the turn it hatched);
// src/opp-likeness.mjs compares these with real games. --records puts them in the --json output.
//
//   node src/selfplay-cardwin.mjs <modelA> <modelB> [games=200] [seed=1] [--decks A B] [--guard egg] [--json] [--records]
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,cardDb} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {eggGuard} from './egg-guard.mjs';
import {wilson} from './selfplay-match.mjs';
import {simVersion} from './sim-version.mjs';

// The Egg of Khelos stages by number of breaks, the 20/20 Khelos last; the stage is how far the egg got.
export const EGG_STAGES=['DINO_410','DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5','DINO_410t'];
const ownTurn=t=>Math.ceil(t/2);

// nets[0] with lists[0] is the side counted; `first` is the seat it takes. -> Map name -> row, and A's wins.
export function cardWins(nets,lists,{games=200,seed=1,first=0,guard=false,maxSteps=1500,rows=new Map(),records=null}={}){
  const row=n=>{let r=rows.get(n);if(!r)rows.set(n,r={drawn:0,drawnWon:0,played:0,playedWon:0,plays:0,turns:0});return r};
  let wins=0;
  for(let g=0;g<games;g++){
    const order=first===0?[0,1]:[1,0];
    let s=newGame({lists:order.map(k=>lists[k]),seed:seed+g});
    const drawn=new Set(),played=new Map(),seen=new Set();
    const rec=records&&{first:first===0,plays:{},eggAttacks:0,stage:-1,hatchTurn:null,unfinished:false};
    // A's board: s.me while A acts, s.opp while B does.
    const look=(s,mine)=>{
      for(const b of mine?s.me:s.opp){
        const k=EGG_STAGES.indexOf(b.cardId??b.raw?.cardId);
        if(k<0)continue;
        if(k>rec.stage)rec.stage=k;
        if(k===5&&rec.hatchTurn==null)rec.hatchTurn=ownTurn(s.turn);
      }
    };
    let n=0;
    for(;n<maxSteps;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const side=order[s.seat],egg=guard?eggGuard(s,legal):null,ask=egg?[egg]:legal;
      const move=nets[side].rank(s,ask).steps[0].move;
      if(rec){
        look(s,side===0);
        if(move.kind==='attack'&&side===1){
          const t=s.opp.find(b=>b.id===move.targetId),k=EGG_STAGES.indexOf(t?.cardId??t?.raw?.cardId);
          if(k>=0&&k<5)rec.eggAttacks++;
        }
      }
      if(side===0){
        for(const c of s.hand)if(!seen.has(c.id)){seen.add(c.id);drawn.add(c.name)}
        if(move.kind==='play'){
          const c=s.hand.find(x=>x.id===move.id);
          if(c){
            row(c.name).plays++;if(!played.has(c.name))played.set(c.name,s.turn);
            if(rec){const p=rec.plays[c.name]??(rec.plays[c.name]={first:ownTurn(s.turn),n:0});p.n++}
          }
        }
      }
      s=apply(s,move).s;
    }
    const won=winner(s)===first;
    if(won)wins++;
    if(rec){
      look(s,order[s.seat]===0);
      // the turns A began: it takes the odd engine turns going first, the even ones going second
      Object.assign(rec,{won,endTurn:s.turn,turns:rec.first?ownTurn(s.turn):Math.floor(s.turn/2),unfinished:n>=maxSteps});
      records.push(rec);
    }
    for(const name of drawn){const r=row(name);r.drawn++;if(won)r.drawnWon++}
    for(const [name,turn] of played){const r=row(name);r.played++;r.turns+=turn;if(won)r.playedWon++}
  }
  return {rows,wins};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2),json=args.includes('--json');if(json)args.splice(args.indexOf('--json'),1);
  const gi=args.indexOf('--guard'),guard=gi>=0&&args.splice(gi,2)[1]==='egg';
  const withRecords=args.includes('--records');if(withRecords)args.splice(args.indexOf('--records'),1);
  const di=args.indexOf('--decks'),pair=di<0?[]:args.splice(di,3).slice(1);
  const [a,b,games=200,seed=1]=args;
  if(!a||!b)throw Error('usage: node src/selfplay-cardwin.mjs <modelA> <modelB> [games] [seed] [--decks A B] [--guard egg] [--json]');
  const nets=[loadNet(a),loadNet(b)],deck=[pair[0]??nets[0].decks[0],pair[1]??nets[1].decks[0]],lists=deck.map(loadList);
  const db=cardDb(),inList=new Set(Object.keys(lists[0].cards).map(id=>db[id]?.name));
  let rows=new Map(),wins=0;const records=withRecords?[]:null;
  for(const first of [0,1]){const r=cardWins(nets,lists,{games:Number(games),seed:Number(seed),first,guard,rows,records});wins+=r.wins}
  const total=2*Number(games),pct=(k,n)=>n?(100*k/n).toFixed(1).padStart(5):'    -';
  if(json){console.log(JSON.stringify({a,b,deck,guard:guard?'egg':'',seed:Number(seed),games:total,wins,sim:simVersion(),rows:Object.fromEntries(rows),...(records?{records}:{})}));process.exit(0)}
  console.log(`${deck[0]} (${a}) v ${deck[1]} (${b}), ${total} games, both orders${guard?', egg guard':''}: won ${wins} (${pct(wins,total).trim()}%)`);
  console.log(`${'card'.padEnd(32)} drawn  won%  played  won%  95%          plays  turn`);
  for(const [name,r] of [...rows].sort((x,y)=>y[1].drawn-x[1].drawn)){
    const [lo,hi]=wilson(r.playedWon,r.played);
    console.log(`${((inList.has(name)?'':'+')+name).padEnd(32)} ${String(r.drawn).padStart(5)} ${pct(r.drawnWon,r.drawn)}  ${String(r.played).padStart(6)} ${pct(r.playedWon,r.played)}  ${r.played?`${(100*lo).toFixed(0).padStart(2)}–${(100*hi).toFixed(0).padStart(3)}%`:'     -    '}  ${String(r.plays).padStart(5)}  ${r.played?(r.turns/r.played).toFixed(1).padStart(4):'   -'}`);
  }
}
