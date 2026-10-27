// Many simulator games side by side, for a policy that lives in another process (train/ppo.py).
// Each table shows the acting seat its encoded state and steps and takes back the index of one step;
// a finished game reports its result and a fresh one is dealt on the same table.
//
// One JSON object a line on stdin, one a line back:
//   {"cmd":"reset","n":64,"seed":1,"decks":["warlock-discard","warlock-discard"],"rival":null}
//       -> {"obs":<state length>,"act":<step length>,"names":[...],"envs":[view,...]}
//   {"cmd":"step","actions":[index,...]}   -> {"envs":[view,...]}
//   {"cmd":"stats"}                        -> {"stats":{...}}   (after a reset with "audit":true)
//   {"cmd":"plan","tables":[i,...],"samples":2,"width":8[,"turns":2,"expand":4,"replies":2,"reply":"<net.json>"]}
//       -> {"ask":[state,...]}, to be answered with {"cmd":"values","v":[value,...]} (the value of
//          each state for the seat to act in it) until the reply is {"scores":[[score per step],...]}:
//          the look ahead of src/selfplay-search.mjs for the seat to act at each of those tables.
//   {"cmd":"fork","table":i,"steps":[k,...],"games":100,"seed":1}
//       -> {"envs":[view,...]}: for each of those legal steps of table i, `games` copies of the game
//          with the step taken, each on its own deal of the hidden cards (the same deals for every
//          step). They are played on with {"cmd":"side","actions":[index per view]} -> {"envs":[...]}
//          of the copies still going, until {"envs":[],"tally":[[wins,draws,losses],...]} for the seat
//          that took the step. The tables themselves do not move.
//   {"cmd":"roll","forks":[{"id":n,"table":i,"steps":[k,...],"seed":s},...],"games":16,"follow":27}
//       -> {"queued":copies}: the rollouts of train/ppo.py --rollout (src/selfplay-rollout.mjs), each step of
//          each table branched on `games` deals from its seed, the same deals for every step; the copies
//          are taken at once, so the tables go on. They are played with {"cmd":"rstep","actions":[index per
//          view of the last rstep, [] the first time]} -> {"envs":[view+since,...],"done":[{id,win,lines}]}
//          until envs is empty; win is the score of each step (1 win, 1/2 draw, 0 loss, with the follow-up
//          picks of the same card played out, see there) and since the copy's steps since its branch.
// With "marks":true at reset each table's view also carries late:1 when one of its steps plays or picks a card
// whose effect comes later (Kazakus, its picks and trials, Rituals), for --rollout to choose decisions by.
// With "restart":{frac,cap} a share frac of the games dealt (by the hash of the seed, so every process agrees)
// begins at a position of the pool instead of anew (src/selfplay-restart.mjs, train/ppo.py --restart-frac):
// the positions the games pass through with a step whose effect comes later go into a ring of cap, and
//   {"cmd":"seedpool","net":"<net.json>","limit":n,"seed":s[,"games":g]} -> {seeded:n}
// adds up to n from greedy games of that network over the decks (zoo mirror and both seatings against the
// next deck). The ended of a game that began so carries restart:true. Without it nothing changes.
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
// With "raw":true beside "bin" the blocks are not base64 in the line: the line names their sizes in
// bytes, "raw":{"obsBin":n,"actsBin":m} (or {"askBin":n}), and the bytes follow it on stdout in that
// order; "values" may come as {"cmd":"values","vBin":<base64 of float32>}. Decoding base64 and long
// lines of it was a fifth of the caller's time in --distill with 18 processes (2026-10-25).
// With "swap":true every game dealt on an odd seed gives the second list to seat 0 (which goes first),
// so with two different decks each deck goes first in half the games; the vocabulary stays that of
// "decks" as given. Without it seat 0 always plays decks[0].
// With three decks or more the vocabulary is the union of all of them, in the order given, and every
// game is decks[0] against one of the others: the rival deck turns with the seed (the same one for a
// pair of seeds, so "swap" still gives decks[0] each seat once), or by "mix":[w,...], the weights of
// decks[1:]. "mirror":p deals decks[0] against itself in a share p of the games. Either way ended
// also carries decks:[deck of seat 0, deck of seat 1] as indexes into "decks" (and, with a rival, mine:
// the seat of the caller).
// With "oracle":true the dims carry oracle (its length) and every view (of the copies of fork and roll too) carries orc, the
// hidden cards of oracle() in src/selfplay-encode.mjs for the value head of train/ppo.py --oracle; with "bin" they go as
// one more block, "orcBin", after the other two. Without it nothing changes.
// With "seatDecks":true every view also carries decks, the indexes into "decks" of the decks in seat 0 and seat 1 (train/ppo.py --opp).
// "extra":true is the vocabulary flag of the demon hunter's cards (see src/selfplay-encode.mjs).
// With "shape":{board,hand,health,pending} every view also carries phi, the board score of
// src/board-score.mjs with those weights for the seat to act, and turn, the game's turn: train/ppo.py
// --shape adds their change from turn to turn to the reward.
// With "hold":true a finished game is not dealt again at once: its view is the finished position with
// ended beside it, and the table waits for {"cmd":"deal","tables":[i,...],"seeds":[seed,...]} ->
// {"envs":[view,...]}. train/ppo.py --workers splits the tables over several of these processes and
// hands out the seeds in the order one process would have used them, so the games are the same.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,randomPolicy,rushPolicy} from './selfplay.mjs';
import {vocabulary,encode,obsSize,actSize,oracle,oracleSize} from './selfplay-encode.mjs';
import {blank,before,after} from './selfplay-audit.mjs';
import {search,redeal} from './selfplay-search.mjs';
import {Rollouts,touchesDelayed} from './selfplay-rollout.mjs';
import {loadNet} from './selfplay-net.mjs';
import {phi} from './board-score.mjs';
import {RestartPool,seedPool,unit as hash} from './selfplay-restart.mjs';

// The networks that play the other side's turn in a look ahead of two turns, read once each.
const replyNets=new Map();
function replyNet(path){
  if(!path)throw Error('a look ahead of two turns needs "reply", the network of the other side');
  if(!replyNets.has(path))replyNets.set(path,loadNet(path));
  return replyNets.get(path);
}

const RIVALS={random:randomPolicy,rush:rushPolicy};
// A number in [0,1) that depends on k alone, so every process deals the same pairing to a seed.
const unit=(k,salt)=>(Math.imul(Math.imul(k+1,salt)^(k>>>3),0x2545f491)>>>0)/4294967296;

export class Arena{
  constructor({lists,n,seed=1,rival=null,maxSteps=1500,audit=false,hold=false,swap=false,timers=false,extra=false,stages=false,mix=null,mirror=0,shape=null,marks=false,seatDecks=false,restart=null,oracle=false}){
    if(rival!=null&&!RIVALS[rival])throw Error(`unknown rival ${rival}`);
    if(mix&&mix.length!==lists.length-1)throw Error(`${mix.length} weights for ${lists.length-1} rival decks`);
    Object.assign(this,{lists,rival,maxSteps,hold,swap,mix,mirror,shape,marks,seatDecks,oracle,restart:restart&&{frac:restart.frac,pool:new RestartPool({cap:restart.cap})},next:seed|0,vocab:vocabulary(lists,undefined,{timers,extra,stages}),stats:audit?blank():null});
    this.tables=Array.from({length:n},()=>this.deal({}));
  }
  get dims(){return {obs:obsSize(this.vocab),act:actSize(this.vocab),names:this.vocab.names,timers:this.vocab.timers,extra:this.vocab.extra,stages:this.vocab.stages,...(this.oracle?{oracle:oracleSize(this.vocab)}:{})}}
  // Which decks play game `seed`, as indexes of the lists, before "swap" turns the seats.
  pairing(seed){
    const n=this.lists.length,k=seed>>1;                         // the pair of seeds a swap makes shares its deck
    if(this.mirror>0&&unit(k,0x9e3779b1)<this.mirror)return [0,0];
    if(n<=2)return [0,n-1];
    if(!this.mix)return [0,1+k%(n-1)];
    const total=this.mix.reduce((a,b)=>a+b,0);
    let x=unit(k,0x85ebca6b)*total,j=0;
    while(j<this.mix.length-1&&x>=this.mix[j]){x-=this.mix[j];j++}
    return [0,1+j];
  }
  deal(t,seed=this.next++){
    const r=this.restart;
    if(r?.pool.size&&hash(seed,0xc2b2ae35)<r.frac){                // a game that begins at a position of the pool, hidden cards dealt afresh
      const {s,seats}=r.pool.pick(hash(seed,0x27d4eb2f),seed);
      Object.assign(t,{s,seed,steps:0,memo:[{},{}],seats,restarted:true,
        ...(this.rival?{mine:seed&1,pick:RIVALS[this.rival](seed)}:{})});
      return this.settle(t);
    }
    const seats=this.pairing(seed);
    if(this.swap&&seed&1)seats.reverse();
    Object.assign(t,{s:newGame({lists:seats.map(i=>this.lists[i]),seed}),seed,steps:0,memo:[{},{}],seats,restarted:false,
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
    if(this.marks||this.restart)t.late=!!t.legal.length&&touchesDelayed(t.s,t.legal);
    return t;
  }
  // The games of the training pass through the positions the restarts are taken from.
  remember(t){
    const key=`${t.s.seat}|${t.s.turn}`;
    if(!t.late||!t.s.choice&&t.last===key)return;                 // one position a turn, but every pick of a choice
    t.last=key;
    this.restart.pool.add(t.s,t.legal,t.seats);
  }
  // Greedy games of a network, to fill the pool before the first restart.
  seed({net,limit,seed=1,games=null}){
    const pairs=[[0,0],...this.lists.slice(1).flatMap((_,k)=>[[0,k+1],[k+1,0]])];
    return {seeded:seedPool(this.restart.pool,{lists:this.lists,pairs,net:loadNet(net),limit,seed,maxGames:games})};
  }
  view(t,ended){
    const shaped=this.shape?{phi:phi(t.s,this.shape),turn:t.s.turn}:{};
    const late=this.marks&&!ended&&(t.late??touchesDelayed(t.s,t.legal))?{late:1}:{};
    return {seat:t.s.seat,...encode(t.s,t.legal,this.vocab),...shaped,...late,...(this.seatDecks?{decks:t.seats}:{}),...(this.oracle?{orc:oracle(t.s,this.vocab)}:{}),...(ended?{ended}:{})};
  }
  views(){return this.tables.map(t=>this.view(t))}
  // Start a look ahead at these tables; -> {ask} or {scores}, see answer().
  // turns=2 looks on through the other side's next turn, played by the network of the file `reply`.
  plan(tables,{samples=2,width=8,turns=1,expand=4,replies=2,reply=null}={}){
    const ahead=turns>1?{turns,expand,replies,reply:replyNet(reply)}:{};
    this.plans=tables.map(i=>{
      const t=this.tables[i];
      if(!t)throw Error(`no table ${i}`);
      // The same deals for every step of one turn: a line begun on them is still there to be finished.
      const g=search(t.s,t.legal,this.vocab,{samples,width,...ahead,seed:Math.imul(t.seed,7919)+Math.imul(t.s.turn,104729)});
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
  // The rollouts of --rollout, see "roll" above.
  roll(forks,{games=16,follow=27}={}){
    this.rolls??=new Rollouts({follow,maxSteps:this.maxSteps});
    for(const f of forks){
      const t=this.tables[f.table];
      if(!t)throw Error(`no table ${f.table}`);
      this.rolls.add(f.id,t.s,t.legal,f.steps,{games:f.games??games,seed:f.seed??1});
    }
    return {queued:this.rolls.fresh.length};
  }
  rstep(actions){
    const r=this.rolls;
    if(!r)return {envs:[],done:[]};                               // a process that was given none
    const live=r.step(actions);
    return {envs:live.map(c=>({...this.view(c),since:c.since})),done:r.take()};
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
      if(t.legal.length&&t.steps<this.maxSteps){
        if(this.restart)this.remember(t);
        return this.view(t);
      }
      const w=winner(t.s)??'draw',turns=t.s.turn;                // a game cut off at maxSteps is a draw
      const ended=this.rival?{result:w==='draw'?0:w===t.mine?1:-1,turns,decks:t.seats,mine:t.mine}:{winner:w,turns,decks:t.seats,...(t.restarted?{restart:true}:{})};
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
// A reply with its views' numbers moved into the two blocks of "bin" above. With raw they stay
// Float32Arrays under `blocks`, in the order they are written after the line, and `raw` names their
// sizes in bytes.
export function packed(out,dims,{raw=false}={}){
  const {blocks,...rest}=blocked(out,dims);
  if(!blocks)return rest;
  const each=f=>Object.fromEntries(Object.entries(blocks).map(([k,x])=>[k,f(x)]));
  return raw?{...rest,raw:each(x=>x.byteLength),blocks}:{...rest,...each(base64)};
}

function blocked(out,{obs,act,oracle:orcLen=0}){
  if(out.ask){
    const o=new Float32Array(out.ask.length*obs);
    out.ask.forEach((x,i)=>{
      if(x.length!==obs)throw Error(`a state of ${x.length} numbers, not ${obs}`);
      o.set(x,i*obs);
    });
    const {ask,...rest}=out;
    return {...rest,asked:ask.length,blocks:{askBin:o}};
  }
  if(!out.envs?.length)return out;
  const o=new Float32Array(out.envs.length*obs),a=new Float32Array(out.envs.reduce((n,e)=>n+e.acts.length,0)*act);
  let at=0;
  const orc=orcLen&&out.envs.every(e=>e.orc)?new Float32Array(out.envs.length*orcLen):null;
  const envs=out.envs.map(({obs:x,acts,orc:h,...e},i)=>{
    if(x.length!==obs)throw Error(`a state of ${x.length} numbers, not ${obs}`);
    o.set(x,i*obs);
    if(orc){
      if(h.length!==orcLen)throw Error(`hidden cards of ${h.length} numbers, not ${orcLen}`);
      orc.set(h,i*orcLen);
    }
    for(const r of acts){
      if(r.length!==act)throw Error(`a step of ${r.length} numbers, not ${act}`);
      a.set(r,at);at+=act;
    }
    return {...e,steps:acts.length};
  });
  return {...out,envs,blocks:{obsBin:o,actsBin:a,...(orc?{orcBin:orc}:{})}};
}

const floats=b64=>{const b=Buffer.from(b64,'base64');return [...new Float32Array(b.buffer,b.byteOffset,b.length/4)]};

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  let arena,bin=false,raw=false;
  for await(const line of createInterface({input:process.stdin})){
    if(!line.trim())continue;
    let out;
    try{
      const m=JSON.parse(line);
      if(m.cmd==='reset'){
        arena=new Arena({lists:(m.decks??['warlock-discard','warlock-discard']).map(loadList),n:m.n,seed:m.seed,rival:m.rival??null,audit:!!m.audit,hold:!!m.hold,swap:!!m.swap,timers:!!m.timers,extra:!!m.extra,stages:!!m.stages,mix:m.mix??null,mirror:m.mirror??0,shape:m.shape??null,marks:!!m.marks,seatDecks:!!m.seatDecks,restart:m.restart??null,oracle:!!m.oracle});
        bin=!!m.bin;raw=bin&&!!m.raw;
        out={...arena.dims,envs:arena.views()};
      }else if(m.cmd==='step')out={envs:arena.step(m.actions)};
      else if(m.cmd==='deal')out={envs:arena.dealAt(m.tables,m.seeds)};
      else if(m.cmd==='stats')out={stats:arena.stats};
      else if(m.cmd==='plan')out=arena.plan(m.tables,m);
      else if(m.cmd==='values')out=arena.answer(m.vBin==null?m.v:floats(m.vBin));
      else if(m.cmd==='fork')out=arena.fork(m.table,m);
      else if(m.cmd==='side')out=arena.play(m.actions);
      else if(m.cmd==='seedpool')out=arena.seed(m);
      else if(m.cmd==='roll')out=arena.roll(m.forks,m);
      else if(m.cmd==='rstep')out=arena.rstep(m.actions??[]);
      else throw Error(`unknown cmd ${m.cmd}`);
      if(bin)out=packed(out,arena.dims,{raw});
    }catch(e){out={error:String(e?.message??e)}}
    const {blocks,...head}=out;
    process.stdout.write(JSON.stringify(head)+'\n');
    for(const f of Object.values(blocks??{}))process.stdout.write(Buffer.from(f.buffer,f.byteOffset,f.byteLength));
  }
}
