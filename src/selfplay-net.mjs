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
// A weight also kept by columns (t), so that linear can walk one column of all the rows at a time.
function weight(doc){
  const w=tensor(doc),[rows,cols]=w.shape,t=new Float32Array(w.a.length);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)t[c*rows+r]=w.a[r*cols+c];
  return {...w,t};
}

// y = W x + b, W stored by rows as PyTorch keeps it; `relu` clips at zero. With `from`, x is only
// the columns from `skip` on and each row starts at from[r], the sum over the columns before (see
// partial). Every row adds its columns in order, a column of all the rows at a time, and the columns
// where x is zero are passed over: the sums come out the same to the last bit as row by row.
function linear(layer,x,relu,from=null,skip=0){
  const sum=partial(layer,x,from,skip),y=new Float32Array(sum.length);
  for(let r=0;r<sum.length;r++)y[r]=relu&&sum[r]<0?0:sum[r];
  return y;
}
// The sums of linear's rows before rounding and relu: bias (or from) plus x in columns skip on.
function partial({w,b},x,from=null,skip=0){
  const rows=w.shape[0],t=w.t,sum=new Float64Array(rows);
  if(from)sum.set(from);else sum.set(b.a);
  for(let c=0;c<x.length;c++){
    const v=x[c];
    if(v===0)continue;
    for(let r=0,at=(skip+c)*rows;r<rows;r++)sum[r]+=t[at+r]*v;
  }
  return sum;
}

export function loadNet(path=MODEL){
  const doc=JSON.parse(readFileSync(path,'utf8'));
  const layer=name=>({w:weight(doc.tensors[`${name}.weight`]),b:tensor(doc.tensors[`${name}.bias`])});
  const L={body0:layer('body.0'),body2:layer('body.2'),step0:layer('step.0'),
    score0:layer('score.0'),score2:layer('score.2'),value0:layer('value.0'),value2:layer('value.2')};
  const vocab={names:doc.names,index:new Map(doc.names.map((n,i)=>[n,i])),size:doc.names.length+1,timers:!!doc.timers,extra:!!doc.extra,stages:!!doc.stages,imbue:!!doc.imbue};
  if(obsSize(vocab)!==doc.obs||actSize(vocab)!==doc.act)
    throw Error(`${path}: made for states of ${doc.obs} and steps of ${doc.act}, the encoder now gives ${obsSize(vocab)} and ${actSize(vocab)}`);
  // -> {logits:[one per step], value}; the value is for the seat to act, between about -1 and 1.
  function forward(obs,acts){
    // score.0 reads the state's half e and then the step's half: the sums over e are the same for every step.
    const e=linear(L.body2,linear(L.body0,obs,true),true),half=partial(L.score0,e);
    const logits=acts.map(a=>linear(L.score2,linear(L.score0,linear(L.step0,a,true),true,half,e.length))[0]);
    return {logits,value:linear(L.value2,linear(L.value0,e,true))[0]};
  }
  // The value alone of an encoded state, as train/ppo.py's look_ahead asks it.
  const value=obs=>linear(L.value2,linear(L.value0,linear(L.body2,linear(L.body0,obs,true),true),true))[0];
  // The network's reading of a simulator state: every legal step with its share of the choice.
  function rank(s,legal=moves(s)){
    const {obs,acts}=encode(s,legal,vocab),{logits,value}=forward(obs,acts);
    const top=Math.max(...logits),e=logits.map(x=>Math.exp(x-top)),sum=e.reduce((a,b)=>a+b,0);
    return {value,steps:legal.map((move,i)=>({move,logit:logits[i],p:e[i]/sum})).sort((a,b)=>b.logit-a.logit)};
  }
  return {vocab,decks:doc.decks,iters:doc.iters,sim:doc.sim??null,forward,value,rank};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [path=MODEL,games=200,seed=1]=process.argv.slice(2);
  const net=loadNet(path),lists=net.decks.slice(0,2).map(loadList),tally=[0,0,0];  // a network of three decks or more is shown the first two
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
