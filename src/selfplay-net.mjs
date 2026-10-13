// The self-play network of train/ppo.py, read from the JSON file train/export.py writes and run here
// without Python: a state and its legal steps in, one score per step and the value of the state out.
// The state and the steps are those of src/selfplay-encode.mjs, with the vocabulary of the file.
//
//   node src/selfplay-net.mjs [model=models/selfplay/warlock-discard-v5.json] [games=200] [seed=1]
//       the network against the script of rushPolicy, as a check that it plays as it did in training
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,rushPolicy} from './selfplay.mjs';
import {encode,obsSize,actSize} from './selfplay-encode.mjs';

export const MODEL=new URL('../models/selfplay/warlock-discard-v5.json',import.meta.url);

function tensor({shape,data}){
  const b=Buffer.from(data,'base64'),a=new Float32Array(b.length/4);
  for(let i=0;i<a.length;i++)a[i]=b.readFloatLE(4*i);
  return {shape,a};
}

// y = W x + b, W stored by rows as PyTorch keeps it; `relu` clips at zero.
function linear({w,b},x,relu){
  const [rows,cols]=w.shape,y=new Float32Array(rows);
  for(let r=0;r<rows;r++){
    let sum=b.a[r];
    for(let c=0,at=r*cols;c<cols;c++)sum+=w.a[at+c]*x[c];
    y[r]=relu&&sum<0?0:sum;
  }
  return y;
}

export function loadNet(path=MODEL){
  const doc=JSON.parse(readFileSync(path,'utf8'));
  const layer=name=>({w:tensor(doc.tensors[`${name}.weight`]),b:tensor(doc.tensors[`${name}.bias`])});
  const L={body0:layer('body.0'),body2:layer('body.2'),step0:layer('step.0'),
    score0:layer('score.0'),score2:layer('score.2'),value0:layer('value.0'),value2:layer('value.2')};
  const vocab={names:doc.names,index:new Map(doc.names.map((n,i)=>[n,i])),size:doc.names.length+1};
  if(obsSize(vocab)!==doc.obs||actSize(vocab)!==doc.act)
    throw Error(`${path}: made for states of ${doc.obs} and steps of ${doc.act}, the encoder now gives ${obsSize(vocab)} and ${actSize(vocab)}`);
  // -> {logits:[one per step], value}; the value is for the seat to act, between about -1 and 1.
  function forward(obs,acts){
    const e=linear(L.body2,linear(L.body0,obs,true),true),w=e.length;
    const logits=acts.map(a=>{
      const both=new Float32Array(2*w);
      both.set(e);both.set(linear(L.step0,a,true),w);
      return linear(L.score2,linear(L.score0,both,true))[0];
    });
    return {logits,value:linear(L.value2,linear(L.value0,e,true))[0]};
  }
  // The network's reading of a simulator state: every legal step with its share of the choice.
  function rank(s,legal=moves(s)){
    const {obs,acts}=encode(s,legal,vocab),{logits,value}=forward(obs,acts);
    const top=Math.max(...logits),e=logits.map(x=>Math.exp(x-top)),sum=e.reduce((a,b)=>a+b,0);
    return {value,steps:legal.map((move,i)=>({move,logit:logits[i],p:e[i]/sum})).sort((a,b)=>b.logit-a.logit)};
  }
  return {vocab,decks:doc.decks,iters:doc.iters,forward,rank};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [path=MODEL,games=200,seed=1]=process.argv.slice(2);
  const net=loadNet(path),lists=net.decks.map(loadList),tally=[0,0,0];
  for(let g=0;g<Number(games);g++){
    const id=Number(seed)+g,mine=id&1,pick=rushPolicy(id);
    let s=newGame({lists,seed:id});
    for(let n=0;n<1500;n++){
      const legal=moves(s);
      if(!legal.length)break;
      s=apply(s,s.seat===mine?net.rank(s,legal).steps[0].move:pick(s,legal)).s;
    }
    const w=winner(s)??'draw';
    tally[w==='draw'?1:w===mine?0:2]++;
  }
  console.log(`${net.decks.join(' v ')}, iteration ${net.iters}: ${tally[0]} won, ${tally[1]} drawn, ${tally[2]} lost against the script (${(100*tally[0]/Number(games)).toFixed(1)}%)`);
}
