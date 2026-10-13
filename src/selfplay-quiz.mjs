// A fixed set of turns with a provable mistake in them, to count how often a policy makes it.
//
// A question is the first position of a turn from which two ways of playing the turn hand over
// positions of which one is plainly better (src/selfplay-dominance.mjs), or from which the game can
// be won this turn. Every way of playing the turn is played out in the simulator (turnTree), so the
// answer is known without any guess. A line that got a better random outcome is not a better line,
// so two lines are compared only when they part after the last dice either of them rolls: from one
// and the same position on, both are played without chance.
//
// A policy answers a question by playing the turn. Its answer is
//   kill    it handed the turn over though from some position on its way a win without dice was there;
//   hero / own / foe / mixed   it handed over a position that another line plainly beats, and what
//           the two differ in (hero Health / an own minion / a foe minion / several);
//   ok      none of these.
//
// The same process serves train/probes/quiz.py, as src/selfplay-env.mjs does, with these on top:
//   {"cmd":"collect","on":true,"cap":4000,"stride":1,"each":3}   questions are gathered at each turn start of the games played with reset/step
//   {"cmd":"bank"}   -> {"bank":[{seed,hist,turn,ends,cats,grades,pairs}],"seen":turns looked at,"big":turns over the cap}
//       with "count":true only how many questions there are, in place of the questions
//       grades: a short hash of each end of the turn that is not 'ok' -> its answer. pairs: up to `each`
//       of the question's pairs {what,good,bad} as the states the value network is shown (seen by the
//       seat to act next); `good` is plainly better for the seat that played.
//   {"cmd":"quiz","bank":[...]}              -> {"envs":[view|null,...]}: the questions as tables, to be played with
//   {"cmd":"turn","actions":[index|null,...]} -> {"envs":[view|null,...]} until every table is null, then also {"answers":[...]}
//   {"cmd":"plan",...,"dominance":true}      the look ahead with the rule of src/selfplay-search.mjs switched on
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {moves,apply,roll} from './sim.mjs';
import {newGame,loadList,winner} from './selfplay.mjs';
import {encode} from './selfplay-encode.mjs';
import {search} from './selfplay-search.mjs';
import {Arena} from './selfplay-env.mjs';
import {exact,shape,beaten} from './selfplay-dominance.mjs';

// Every position this turn can reach from `root` -> {ends, kill, faults} or null past `cap` positions.
// ends: exact text of a position that ends the turn -> {s, anchor, won?, what?} where anchor names the
// last position on the way at which dice were rolled, won says the game is over in our favour, and
// what names the mistake of handing this position over (see above) when there is one.
export function turnTree(root,{cap=4000}={}){
  const seat=root.seat,seen=new Set([exact(root)]),ends=new Map();
  let open=[{s:root,anchor:0}],anchors=0;
  while(open.length){
    const next=[];
    for(const {s,anchor} of open)for(const m of moves(s)){
      const t=apply(s,m).s,w=winner(t),k=exact(t);
      if(seen.has(k))continue;
      seen.add(k);
      if(seen.size>cap)return null;
      const rolled=t.seed!==s.seed?++anchors:anchor;
      if(w!=null)ends.set(k,{s:t,anchor:rolled,over:true,won:w===seat});
      else if(t.seat!==seat)ends.set(k,{s:t,anchor});              // dice rolled as the turn passes are the same for all
      else next.push({s:t,anchor:rolled});
    }
    open=next;
  }
  const all=[...ends.values()],handed=all.filter(e=>!e.over),wins=new Set(all.filter(e=>e.won).map(e=>e.anchor));
  const shapes=handed.map(e=>{const x=shape(e.s);x.rest=`${e.anchor}|${x.rest}`;return x});
  const pairs=beaten(shapes).map(([i,j,what])=>({good:handed[j],bad:handed[i],what}));
  for(const p of pairs)p.bad.what=p.what;
  for(const e of handed)if(wins.has(e.anchor))e.what='kill';
  return {ends,pairs,faults:handed.filter(e=>e.what).length};
}

// The position a question names: its game dealt again and the same steps taken.
export function replay(lists,q){
  let s=newGame({lists,seed:q.seed});
  for(const k of q.hist)s=apply(s,moves(s)[k]).s;
  return s;
}

const grade=e=>e.what??'ok';
const hash=s=>createHash('sha1').update(exact(s)).digest('hex').slice(0,12);

export class QuizArena extends Arena{
  deal(t){t.hist=[];t.mark=null;return super.deal(t)}
  collect({on=true,cap=4000,stride=1,each=3}={}){Object.assign(this,{collecting:on,cap,stride,each,dice:this.dice??{seed:1},bank:this.bank??[],seen:this.seen??0,big:this.big??0});this.harvest();return {ok:true}}
  // A question from every table that stands at the first step of a turn.
  harvest(){
    if(!this.collecting)return;
    for(const t of this.tables){
      if(t.mark===t.s.turn||t.s.choice||!t.legal.length)continue;
      t.mark=t.s.turn;
      if((t.seed+t.s.turn)%this.stride)continue;
      this.seen++;
      const tree=turnTree(t.s,{cap:this.cap});
      if(!tree){this.big++;continue}
      if(!tree.faults)continue;
      const cats={},grades={},left=[...tree.pairs],pairs=[];
      for(const e of tree.ends.values()){
        const g=grade(e);
        if(g!=='ok')grades[hash(e.s)]=g;
        if(e.what)cats[e.what]=(cats[e.what]??0)+1;
      }
      for(let k=0;k<this.each&&left.length;k++){
        const [p]=left.splice(roll(this.dice,left.length),1);
        pairs.push({what:p.what,good:encode(p.good.s,[],this.vocab).obs,bad:encode(p.bad.s,[],this.vocab).obs});
      }
      this.bank.push({seed:t.seed,hist:[...t.hist],turn:t.s.turn,ends:tree.ends.size,cats,grades,pairs});
    }
  }
  step(actions){
    this.tables.forEach((t,i)=>t.hist.push(actions[i]));
    const out=super.step(actions);
    this.harvest();
    return out;
  }
  quiz(bank){
    this.collecting=false;
    this.answers=bank.map(()=>null);
    this.tables=bank.map(q=>{
      const s=replay(this.lists,q);
      return {s,seed:q.seed,seat:s.seat,grades:q.grades,legal:moves(s),steps:0,hist:[]};
    });
    return {envs:this.views()};
  }
  views(){return this.tables.map(t=>t.done?null:this.view(t))}
  turn(actions){
    if(actions.length!==this.tables.length)throw Error(`${actions.length} actions for ${this.tables.length} tables`);
    this.tables.forEach((t,i)=>{
      if(t.done)return;
      const m=t.legal[actions[i]];
      if(!m)throw Error(`table ${i}: no step ${actions[i]} among ${t.legal.length}`);
      t.s=apply(t.s,m).s;t.legal=moves(t.s);
      if(winner(t.s)!=null||t.s.seat!==t.seat){t.done=true;this.answers[i]=t.grades[hash(t.s)]??'ok'}
    });
    const envs=this.views();
    return envs.some(Boolean)?{envs}:{envs,answers:this.answers};
  }
  plan(tables,{samples=2,width=8,dominance=false}={}){
    this.plans=tables.map(i=>{
      const t=this.tables[i];
      if(!t)throw Error(`no table ${i}`);
      const g=search(t.s,t.legal,this.vocab,{samples,width,dominance,seed:Math.imul(t.seed,7919)+Math.imul(t.s.turn,104729)});
      return {g,r:g.next()};
    });
    return this.asked();
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
        arena=new QuizArena({lists:(m.decks??['warlock-discard','warlock-discard']).map(loadList),n:m.n,seed:m.seed,rival:m.rival??null,audit:!!m.audit});
        out={...arena.dims,envs:arena.views()};
      }else if(m.cmd==='step')out={envs:arena.step(m.actions)};
      else if(m.cmd==='stats')out={stats:arena.stats};
      else if(m.cmd==='plan')out=arena.plan(m.tables,m);
      else if(m.cmd==='values')out=arena.answer(m.v);
      else if(m.cmd==='collect')out=arena.collect(m);
      else if(m.cmd==='bank')out={bank:m.count?(arena.bank??[]).length:arena.bank??[],seen:arena.seen??0,big:arena.big??0};
      else if(m.cmd==='quiz')out=arena.quiz(m.bank);
      else if(m.cmd==='turn')out=arena.turn(m.actions);
      else throw Error(`unknown cmd ${m.cmd}`);
    }catch(e){out={error:String(e?.message??e)}}
    process.stdout.write(JSON.stringify(out)+'\n');
  }
}
