// Positions from self-play, each with its board score looked ahead and the result of its game, for
// train/fit_score.py to fit the weights of src/board-score.mjs.
//
//   node src/board-calibrate.mjs [--net models/selfplay/warlock-zoo-v4.json] [--deck warlock-zoo]
//       [--opp warlock-discard] [--games 100] [--seed 1] [--per 2] [--rolls 4] [--turns 3] [--out <file.jsonl>]
//
// `games` games of --deck against --opp, both seats played greedily by --net (as the numbers of
// docs/selfplay-versions.md are), --deck going first on even seeds. In each, `per` of the starts of
// --deck's turns are kept at random. From each kept position the game is played on `rolls` times, each
// time on its own deal of the hidden cards (redeal of src/selfplay-search.mjs), and the features are
// taken where --deck hands each of its next `turns` turns over (the turn it is about to play is the
// first); a game over before then keeps the features of its last position.
// One line a position: {seed,opp,first,j,turn,v,f0,r,roll:[{f:[[...],...],over:[...],r}]}, with r the
// result for --deck (1 won, 0 lost, 0.5 drawn or cut off), j the count of --deck's turns so far, v the
// value head of --net, f0 the features of the position itself; features in the order of FEATURES.
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {moves,apply,roll} from './sim.mjs';
import {newGame,loadList,winner} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {redeal} from './selfplay-search.mjs';
import {features,FEATURES} from './board-score.mjs';

const vec=f=>FEATURES.map(k=>f[k]);
const resultFor=(s,seat)=>{const w=winner(s);return w==null||w==='draw'?0.5:w===seat?1:0};

// Greedy to the end from s, the features taken as `seat` hands over each of its next `turns` turns.
export function playOn(net,s,seat,{turns=3,maxSteps=1500}={}){
  const f=[],over=[];
  let steps=0;
  for(;steps<maxSteps;steps++){
    const legal=moves(s);
    if(!legal.length)break;
    const m=legal.length<2?legal[0]:net.rank(s,legal).steps[0].move;
    if(m.kind==='end'&&s.seat===seat&&f.length<turns){f.push(vec(features(s,seat)));over.push(false)}
    s=apply(s,m).s;
  }
  while(f.length<turns){f.push(vec(features(s,seat)));over.push(true)}
  return {f,over,r:resultFor(s,seat),s};
}

export function positions(net,deck,opp,{seed=1,per=2,rolls=4,turns=3,maxSteps=1500}={}){
  const first=(seed&1)===0,seat=first?0:1;
  const lists=first?[deck,opp]:[opp,deck];
  let s=newGame({lists,seed});
  const starts=[];
  let last=null,j=0,steps=0;
  for(;steps<maxSteps;steps++){
    const legal=moves(s);
    if(!legal.length)break;
    if(s.seat===seat&&s.turn!==last&&!s.choice){last=s.turn;j++;starts.push({s,j,legal})}
    s=apply(s,legal.length<2?legal[0]:net.rank(s,legal).steps[0].move).s;
  }
  const r=resultFor(s,seat),dice={seed:Math.imul(seed,2654435761)|0},kept=[];
  const pool=[...starts];
  for(let k=0;k<per&&pool.length;k++)kept.push(pool.splice(roll(dice,pool.length),1)[0]);
  return kept.sort((a,b)=>a.j-b.j).map(({s:p,j,legal})=>({
    seed,first,j,turn:p.turn,r,v:net.rank(p,legal).value,f0:vec(features(p,seat)),
    roll:Array.from({length:rolls},(_,k)=>{const x=playOn(net,redeal(p,seed*7919+k*104729+p.turn),seat,{turns,maxSteps});return {f:x.f,over:x.over,r:x.r}})
  }));
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const a=Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(x=>{const [k,...v]=x.trim().split(/\s+/);return [k,v.join(' ')]}));
  const net=loadNet(a.net??new URL('../models/selfplay/warlock-zoo-v4.json',import.meta.url));
  const deck=loadList(a.deck??'warlock-zoo'),oppName=a.opp??'warlock-discard',opp=loadList(oppName);
  const games=Number(a.games??100),seed0=Number(a.seed??1),out=a.out??`runtime/board-calibrate-${oppName}-${seed0}.jsonl`;
  const opt={per:Number(a.per??2),rolls:Number(a.rolls??4),turns:Number(a.turns??3)};
  const rows=[],t0=Date.now();
  for(let g=0;g<games;g++)for(const row of positions(net,deck,opp,{seed:seed0+g,...opt}))rows.push(JSON.stringify({opp:oppName,...row}));
  writeFileSync(out,rows.join('\n')+'\n');
  console.log(`${rows.length} positions from ${games} games -> ${out} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
}
