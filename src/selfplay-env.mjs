// Many simulator games side by side, for a policy that lives in another process (train/ppo.py).
// Each table shows the acting seat its encoded state and steps and takes back the index of one step;
// a finished game reports its result and a fresh one is dealt on the same table.
//
// One JSON object a line on stdin, one a line back:
//   {"cmd":"reset","n":64,"seed":1,"decks":["warlock-discard","warlock-discard"],"rival":null}
//       -> {"obs":<state length>,"act":<step length>,"names":[...],"envs":[view,...]}
//   {"cmd":"step","actions":[index,...]}   -> {"envs":[view,...]}
// view = {seat,obs,acts,ended?}. Without a rival both seats ask the caller and ended is
// {winner:0|1|"draw",turns}. With "rival":"random" the caller holds one seat (they alternate from
// game to game), the other moves inside this process, at random or by the script of rushPolicy
// ("rival":"rush"), and ended is {result:1|0|-1,turns}.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {moves,apply} from './sim.mjs';
import {newGame,loadList,winner,randomPolicy,rushPolicy} from './selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from './selfplay-encode.mjs';

const RIVALS={random:randomPolicy,rush:rushPolicy};

export class Arena{
  constructor({lists,n,seed=1,rival=null,maxSteps=1500}){
    if(rival!=null&&!RIVALS[rival])throw Error(`unknown rival ${rival}`);
    Object.assign(this,{lists,rival,maxSteps,next:seed|0,vocab:vocabulary(lists)});
    this.tables=Array.from({length:n},()=>this.deal({}));
  }
  get dims(){return {obs:obsSize(this.vocab),act:actSize(this.vocab),names:this.vocab.names}}
  deal(t){
    const seed=this.next++;
    Object.assign(t,{s:newGame({lists:this.lists,seed}),steps:0,
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
  step(actions){
    if(actions.length!==this.tables.length)throw Error(`${actions.length} actions for ${this.tables.length} tables`);
    return this.tables.map((t,i)=>{
      const m=t.legal[actions[i]];
      if(!m)throw Error(`table ${i}: no step ${actions[i]} among ${t.legal.length}`);
      t.s=apply(t.s,m).s;t.steps++;
      this.settle(t);
      if(t.legal.length&&t.steps<this.maxSteps)return this.view(t);
      const w=winner(t.s)??'draw',turns=t.s.turn;                // a game cut off at maxSteps is a draw
      const ended=this.rival?{result:w==='draw'?0:w===t.mine?1:-1,turns}:{winner:w,turns};
      return this.view(this.deal(t),ended);
    });
  }
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  let arena;
  for await(const line of createInterface({input:process.stdin})){
    if(!line.trim())continue;
    let out;
    try{
      const m=JSON.parse(line);
      if(m.cmd==='reset'){
        arena=new Arena({lists:(m.decks??['warlock-discard','warlock-discard']).map(loadList),n:m.n,seed:m.seed,rival:m.rival??null});
        out={...arena.dims,envs:arena.views()};
      }else if(m.cmd==='step')out={envs:arena.step(m.actions)};
      else throw Error(`unknown cmd ${m.cmd}`);
    }catch(e){out={error:String(e?.message??e)}}
    process.stdout.write(JSON.stringify(out)+'\n');
  }
}
