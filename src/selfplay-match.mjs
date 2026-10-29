// Two self-play networks against each other in the simulator, each with its own deck and its own
// vocabulary: net.rank encodes the state with the vocabulary of that file, so nets of different
// sizes (v5 knows 19 names, zoo-v1 53) can share a game. Both play greedy (the top step), as the
// numbers of docs/selfplay-versions.md are read.
//
//   node src/selfplay-match.mjs <modelA> <modelB> [games=200] [seed=1] [deckA] [deckB | --decks A B] [--look a|b|both]
//       [--samples 2] [--beam 8] [--prior 0.001] [--depth 1] [--expand 4] [--replies 2] [--reply <model>] [--own-value] [--json]
//       `games` games with A first and as many with B first; each net plays the first deck of its file
//       unless the deck is named (decks/<name>), after the games or with --decks A B (A for model A, B for
//       model B; say `--decks warlock-zoo dh-cthun`). --look lets that net look ahead before every step as
//       train/ppo.py --search does (src/selfplay-search.mjs, its own value network); --depth 2 looks on
//       through the other side's next turn, played by --reply (the looking net itself unless named);
//       --own-value values the positions where the other side is to play from the looking net's own chair
//       (selfplay-search.mjs seatView; F-882), and the look of the --json line then reads "<who>+own";
//       --json adds one line of the tallies for a script to add up, with the simulator version the games
//       were played in (sim, src/sim-version.mjs) and the one each net was trained in (trained); a net
//       trained in another version is named on stderr (gate G2). src/selfplay-compare.mjs compares
//       such lines and refuses lines of different versions (gate G3).
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {encode} from './selfplay-encode.mjs';
import {search} from './selfplay-search.mjs';
import {eggGuard} from './egg-guard.mjs';
import {simVersion} from './sim-version.mjs';

// The step of train/ppo.py's think with a look ahead: the best score plus `prior` times the log of the
// policy's own probability, clipped at -10. The deals are those of src/selfplay-env.mjs's plan: one
// set for every step of a turn. -> {pick, scores, logits}
export function lookStep(net,s,legal,{samples=2,width=8,prior=1e-3,seed=1,turns=1,expand=4,replies=2,reply=net,ownValue=false}={}){
  const {logits}=net.forward(...Object.values(encode(s,legal,net.vocab)));
  if(legal.length<2)return {pick:0,scores:[0],logits};
  const g=search(s,legal,net.vocab,{samples,width,turns,expand,replies,reply,ownValue,seed:Math.imul(seed,7919)+Math.imul(s.turn,104729)});
  let r=g.next();
  while(!r.done)r=g.next(r.value.map(net.value));
  const top=Math.max(...logits),lse=top+Math.log(logits.reduce((a,x)=>a+Math.exp(x-top),0));
  const at=k=>r.value[k]+prior*Math.max(-10,logits[k]-lse);
  let pick=0;
  for(let k=1;k<legal.length;k++)if(at(k)>at(pick))pick=k;
  return {pick,scores:r.value,logits};
}

// nets[k] plays seat k (seat 0 moves first) with lists[k]; look[k], when given, is that seat's look
// ahead ({samples,width,prior}, and turns, expand, replies, reply for two turns) and onLook sees each of its decisions.
// With `guard`, the egg guard plays Haunt on our own Egg of Khelos whenever it can (src/egg-guard.mjs):
// that step is then the only one the net is offered, as in training with --egg. -> [first won, drawn, second
// won]; a game still going after maxSteps counts as drawn and also in `cut`.
export function match(nets,lists,{games=200,seed=1,maxSteps=1500,look=[],onLook,guard=false}={}){
  const tally=[0,0,0];let cut=0;
  for(let g=0;g<games;g++){
    let s=newGame({lists,seed:seed+g}),n=0;
    for(;n<maxSteps;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const net=nets[s.seat],opt=look[s.seat],egg=guard?eggGuard(s,legal):null;
      const ask=egg?[egg]:legal;
      let move=net.rank(s,ask).steps[0].move;
      if(opt){
        const r=lookStep(net,s,ask,{...opt,seed:seed+g});
        onLook?.({game:seed+g,s,legal,...r});
        move=ask[r.pick];
      }
      s=apply(s,move).s;
    }
    const w=winner(s)??'draw';
    if(w==='draw'&&n>=maxSteps)cut++;
    tally[w==='draw'?1:w===0?0:2]++;
  }
  return {tally,cut};
}

// Wilson 95% interval of k successes in n.
export function wilson(k,n,z=1.96){
  if(!n)return [0,1];
  const p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [c-h,c+h];
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2),flag=(name,dflt)=>{const i=args.indexOf(`--${name}`);return i<0?dflt:args.splice(i,2)[1]};
  const json=args.includes('--json');if(json)args.splice(args.indexOf('--json'),1);
  const own=args.includes('--own-value');if(own)args.splice(args.indexOf('--own-value'),1);
  const who=flag('look',''),opt={samples:Number(flag('samples',2)),width:Number(flag('beam',8)),prior:Number(flag('prior',1e-3)),
    turns:Number(flag('depth',1)),expand:Number(flag('expand',4)),replies:Number(flag('replies',2)),ownValue:own};
  const reply=flag('reply',null);
  if(reply)opt.reply=loadNet(reply);
  const guard=flag('guard','')==='egg';
  const named=args.indexOf('--decks'),pair=named<0?[]:args.splice(named,3).slice(1);
  const [a,b,games=200,seed=1,...decks]=args,[deckA,deckB]=pair.length?pair:decks;
  if(!a||!b||!['','a','b','both'].includes(who))throw Error('usage: node src/selfplay-match.mjs <modelA> <modelB> [games] [seed] [deckA] [deckB] [--look a|b|both] [--samples N] [--beam N] [--prior x] [--depth 1|2] [--expand N] [--replies N] [--reply model] [--own-value] [--guard egg] [--json]');
  if(own&&!who)throw Error('--own-value changes a look ahead: name the net that looks with --look a|b|both');
  const nets=[loadNet(a),loadNet(b)],sim=simVersion();
  for(const [k,p] of [a,b].entries())if(nets[k].sim!==sim)
    console.error(`G2: ${p} was trained in simulator ${nets[k].sim??'(not recorded)'}, these games are played in ${sim}`);
  const lists=nets.map((n,k)=>loadList([deckA,deckB][k]??n.decks[0]));
  const looks=[0,1].map(k=>who==='both'||who===['a','b'][k]?{...opt,reply:opt.reply??nets[k]}:null);
  const deck=[deckA??nets[0].decks[0],deckB??nets[1].decks[0]];
  const label=[a,b].map((p,k)=>`${p.replace(/^.*[\/]/,'').replace(/\.json$/,'')}(${deck[k]})${looks[k]?(looks[k].turns>1?'+look2':'+look')+(own?'+own':''):''}`);
  const pct=([lo,hi])=>`${(100*lo).toFixed(1)}–${(100*hi).toFixed(1)}%`;
  const share=(k,n)=>`${k} (${(100*k/n).toFixed(1)}%, ${pct(wilson(k,n))})`;
  const total=[0,0,0],n=Number(games),orders=[];
  for(const [i,j] of [[0,1],[1,0]]){
    const {tally,cut}=match([nets[i],nets[j]],[lists[i],lists[j]],{games:n,seed:Number(seed),look:[looks[i],looks[j]],guard});
    const winsA=i===0?tally[0]:tally[2],winsB=i===0?tally[2]:tally[0];
    total[0]+=winsA;total[1]+=tally[1];total[2]+=winsB;
    orders.push({first:i===0?'a':'b',games:n,a:winsA,drawn:tally[1],b:winsB,cut});
    console.log(`${label[i]} first v ${label[j]}: ${n} games, ${label[0]} ${share(winsA,n)}, ${label[1]} ${share(winsB,n)}, drawn ${tally[1]} (cut off ${cut})`);
  }
  console.log(`together: ${2*n} games, ${label[0]} ${share(total[0],2*n)}, ${label[1]} ${share(total[2],2*n)}, drawn ${total[1]}`);
  if(json)console.log(JSON.stringify({a,b,deck,look:own?`${who}+own`:who,guard:guard?'egg':'',seed:Number(seed),sim,trained:nets.map(x=>x.sim),orders}));
}
