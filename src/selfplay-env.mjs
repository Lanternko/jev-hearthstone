// Many simulator games side by side, for a policy that lives in another process (train/ppo.py).
// Each table shows the acting seat its encoded state and steps and takes back the index of one step;
// a finished game reports its result and a fresh one is dealt on the same table.
//
// One JSON object a line on stdin, one a line back:
//   {"cmd":"reset","n":64,"seed":1,"decks":["warlock-discard","warlock-discard"],"rival":null}
//       -> {"obs":<state length>,"act":<step length>,"names":[...],"envs":[view,...]}
//   {"cmd":"step","actions":[index,...]}   -> {"envs":[view,...]}
//   {"cmd":"stats"}                        -> {"stats":{...}}   (after a reset with "audit":true)
//   {"cmd":"plan","tables":[i,...],"samples":2,"width":8}
//       -> {"ask":[state,...]}, to be answered with {"cmd":"values","v":[value,...]} (the value of
//          each state for the seat to act in it) until the reply is {"scores":[[score per step],...]}:
//          the look ahead of src/selfplay-search.mjs for the seat to act at each of those tables.
//   {"cmd":"fork","table":i,"steps":[k,...],"games":100,"seed":1}
//       -> {"envs":[view,...]}: for each of those legal steps of table i, `games` copies of the game
//          with the step taken, each on its own deal of the hidden cards (the same deals for every
//          step). They are played on with {"cmd":"side","actions":[index per view]} -> {"envs":[...]}
//          of the copies still going, until {"envs":[],"tally":[[wins,draws,losses],...]} for the seat
//          that took the step. The tables themselves do not move.
// view = {seat,obs,acts,ended?}. Without a rival both seats ask the caller and ended is
// {winner:0|1|"draw",turns}. With "rival":"random" the caller holds one seat (they alternate from
// game to game), the other moves inside this process, at random or by the script of rushPolicy
// ("rival":"rush"), and ended is {result:1|0|-1,turns}.
// With "audit":true the caller's steps are also counted by src/selfplay-audit.mjs.
// With "bin":true every reply that carries envs sends their numbers as two base64 blocks of float32,
// "obsBin" (one state after another) and "actsBin" (every step of every view in order), and each view
// keeps {seat,steps,ended?} with steps the count of its rows in actsBin: parsing JSON lists of floats
// cost the caller more than the games did (2026-10-24). A look ahead's {"ask"} goes the same way, as
// {"askBin","asked"} with asked the count of states: in --distill those were most of the time.
// With "swap":true every game dealt on an odd seed gives the second list to seat 0 (which goes first),
// so with two different decks each deck goes first in half the games; the vocabulary stays that of
// "decks" as given. Without it seat 0 always plays decks[0].
// With "hold":true a finished game is not dealt again at once: its view is the finished position with
// ended beside it, and the table waits for {"cmd":"deal","tables":[i,...],"seeds":[seed,...]} ->
// {"envs":[view,...]}. train/ppo.py --workers splits the tables over several of these processes and
// hands out the seeds in the order one process would have used them, so the games are the same.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,randomPolicy,rushPolicy} from './selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from './selfplay-encode.mjs';
import {blank,before,after} from './selfplay-audit.mjs';
import {search,redeal} from './selfplay-search.mjs';

const RIVALS={random:randomPolicy,rush:rushPolicy};

export class Arena{
  constructor({lists,n,seed=1,rival=null,maxSteps=1500,audit=false,hold=false,swap=false,timers=false}){
    if(rival!=null&&!RIVALS[rival])throw Error(`unknown rival ${rival}`);
    Object.assign(this,{lists,rival,maxSteps,hold,swap,next:seed|0,vocab:vocabulary(lists,undefined,{timers}),stats:audit?blank():null});
    this.tables=Array.from({length:n},()=>this.deal({}));
  }
  get dims(){return {obs:obsSize(this.vocab),act:actSize(this.vocab),names:this.vocab.names,timers:this.vocab.timers}}
  deal(t,seed=this.next++){
    Object.assign(t,{s:newGame({lists:this.swap&&seed&1?[...this.lists].reverse():this.lists,seed}),seed,steps:0,memo:[{},{}],
      ...(this.rival?{mine:seed&1,pick:RIVALS[this.rival](seed)}:{})});
    return this.settle(t);
  }
  // Let the rival play until the caller is asked again or the game is over.
  settle(t){
    t.legal=moves(t.s);
    while(this.rival&&t.legal.length&&t.s.seat!==t.mine&&t.steps<this.maxSteps){
      t.s=apply(t.s,t.pick(t.s,t.legal)).s;t.steps++;
      t.legal=moves(t.s);
    }
    return t;
  }
  view(t,ended){return {seat:t.s.seat,...encode(t.s,t.legal,this.vocab),...(ended?{ended}:{})}}
  views(){return this.tables.map(t=>this.view(t))}
  // Start a look ahead at these tables; -> {ask} or {scores}, see answer().
  plan(tables,{samples=2,width=8}={}){
    this.plans=tables.map(i=>{
      const t=this.tables[i];
      if(!t)throw Error(`no table ${i}`);
      // The same deals for every step of one turn: a line begun on them is still there to be finished.
      const g=search(t.s,t.legal,this.vocab,{samples,width,seed:Math.imul(t.seed,7919)+Math.imul(t.s.turn,104729)});
      return {g,r:g.next()};
    });
    return this.asked();
  }
  asked(){
    if(this.plans.every(p=>p.r.done)){const scores=this.plans.map(p=>p.r.value);this.plans=null;return {scores}}
    return {ask:this.plans.flatMap(p=>p.r.done?[]:p.r.value)};
  }
  answer(v){
    if(!this.plans)throw Error('no look ahead is waiting for values');
    let at=0;
    for(const p of this.plans)if(!p.r.done){const n=p.r.value.length;p.r=p.g.next(v.slice(at,at+n));at+=n}
    if(at!==v.length)throw Error(`${v.length} values for ${at} states`);
    return this.asked();
  }
  // Games played on from one position, to measure a step by the results instead of by a guess.
  fork(i,{steps,games=100,seed=1}={}){
    const t=this.tables[i];
    if(!t)throw Error(`no table ${i}`);
    steps??=t.legal.map((_,k)=>k);
    this.side={seat:t.s.seat,tally:steps.map(()=>[0,0,0]),live:[]};
    steps.forEach((k,at)=>{
      if(!t.legal[k])throw Error(`table ${i}: no step ${k} among ${t.legal.length}`);
      for(let g=0;g<games;g++)this.side.live.push({s:apply(redeal(t.s,seed+g),t.legal[k]).s,at,steps:0});
    });
    return this.sided();
  }
  sided(){
    const {side}=this;
    side.live=side.live.filter(c=>{
      c.legal=moves(c.s);
      if(c.legal.length&&c.steps<this.maxSteps)return true;
      const w=winner(c.s)??'draw';
      side.tally[c.at][w==='draw'?1:w===side.seat?0:2]++;
    });
    return {envs:side.live.map(c=>this.view(c)),...(side.live.length?{}:{tally:side.tally})};
  }
  play(actions){
    const live=this.side?.live;
    if(!live?.length)throw Error('no forked games are waiting for steps');
    if(actions.length!==live.length)throw Error(`${actions.length} actions for ${live.length} forked games`);
    live.forEach((c,j)=>{
      const m=c.legal[actions[j]];
      if(!m)throw Error(`forked game ${j}: no step ${actions[j]} among ${c.legal.length}`);
      c.s=apply(c.s,m).s;c.steps++;
    });
    return this.sided();
  }
  step(actions){
    if(actions.length!==this.tables.length)throw Error(`${actions.length} actions for ${this.tables.length} tables`);
    const held=this.tables.findIndex(t=>t.held);
    if(held>=0)throw Error(`table ${held}: the finished game waits for a deal`);
    return this.tables.map((t,i)=>{
      const m=t.legal[actions[i]];
      if(!m)throw Error(`table ${i}: no step ${actions[i]} among ${t.legal.length}`);
      const pre=this.stats&&before(t.s,t.legal,m),seat=t.s.seat;
      t.s=apply(t.s,m).s;t.steps++;
      if(pre)after(this.stats,t.memo[seat],pre,t.s);
      this.settle(t);
      if(t.legal.length&&t.steps<this.maxSteps)return this.view(t);
      const w=winner(t.s)??'draw',turns=t.s.turn;                // a game cut off at maxSteps is a draw
      const ended=this.rival?{result:w==='draw'?0:w===t.mine?1:-1,turns}:{winner:w,turns};
      if(this.hold){t.held=true;return this.view(t,ended)}
      return this.view(this.deal(t),ended);
    });
  }
  // New games at these held tables, from these seeds (see "hold" above).
  dealAt(tables,seeds){
    if(tables.length!==seeds.length)throw Error(`${seeds.length} seeds for ${tables.length} tables`);
    return tables.map((i,k)=>{
      const t=this.tables[i];
      if(!t?.held)throw Error(`table ${i} has no finished game waiting`);
      t.held=false;
      return this.view(this.deal(t,seeds[k]));
    });
  }
}

const base64=f=>Buffer.from(f.buffer,f.byteOffset,f.byteLength).toString('base64');
// A reply with its views' numbers moved into the two blocks of "bin" above.
export function packed(out,{obs,act}){
  if(out.ask){
    const o=new Float32Array(out.ask.length*obs);
    out.ask.forEach((x,i)=>{
      if(x.length!==obs)throw Error(`a state of ${x.length} numbers, not ${obs}`);
      o.set(x,i*obs);
    });
    const {ask,...rest}=out;
    return {...rest,askBin:base64(o),asked:ask.length};
  }
  if(!out.envs?.length)return out;
  const o=new Float32Array(out.envs.length*obs),a=new Float32Array(out.envs.reduce((n,e)=>n+e.acts.length,0)*act);
  let at=0;
  const envs=out.envs.map(({obs:x,acts,...e},i)=>{
    if(x.length!==obs)throw Error(`a state of ${x.length} numbers, not ${obs}`);
    o.set(x,i*obs);
    for(const r of acts){
      if(r.length!==act)throw Error(`a step of ${r.length} numbers, not ${act}`);
      a.set(r,at);at+=act;
    }
    return {...e,steps:acts.length};
  });
  return {...out,envs,obsBin:base64(o),actsBin:base64(a)};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  let arena,bin=false;
  for await(const line of createInterface({input:process.stdin})){
    if(!line.trim())continue;
    let out;
    try{
      const m=JSON.parse(line);
      if(m.cmd==='reset'){
        arena=new Arena({lists:(m.decks??['warlock-discard','warlock-discard']).map(loadList),n:m.n,seed:m.seed,rival:m.rival??null,audit:!!m.audit,hold:!!m.hold,swap:!!m.swap,timers:!!m.timers});
        bin=!!m.bin;
        out={...arena.dims,envs:arena.views()};
      }else if(m.cmd==='step')out={envs:arena.step(m.actions)};
      else if(m.cmd==='deal')out={envs:arena.dealAt(m.tables,m.seeds)};
      else if(m.cmd==='stats')out={stats:arena.stats};
      else if(m.cmd==='plan')out=arena.plan(m.tables,m);
      else if(m.cmd==='values')out=arena.answer(m.v);
      else if(m.cmd==='fork')out=arena.fork(m.table,m);
      else if(m.cmd==='side')out=arena.play(m.actions);
      else throw Error(`unknown cmd ${m.cmd}`);
      if(bin)out=packed(out,arena.dims);
    }catch(e){out={error:String(e?.message??e)}}
    process.stdout.write(JSON.stringify(out)+'\n');
  }
}
