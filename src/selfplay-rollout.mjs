// Rollout targets of train/ppo.py --rollout: a decision is measured by playing each of its best steps on to
// the end of the game, instead of by a guess of the value half of the network.
//
// add() branches each chosen step of one position on `games` deals of the hidden cards (redeal of
// src/selfplay-search.mjs with the seeds seed+0..seed+games-1, the same deals for every step: common
// random numbers, so two steps are compared on the same futures). The copies are then played on by the
// caller (a frozen network, greedy or at a falling temperature) through step(), and each request is
// scored once all its copies are over.
//
// Follow-up picks. A step that opens picks of the same card (Godfather Kazakus: two effects, then the length
// of the trial; a Discover) would be judged by the frozen network's picks, and a good card would look bad by
// a bad pick. So the picks that come straight after the branched step, for the seat that took it and before
// the caller has made any step in the copy, are not left to the network: every option is played on, each a
// line of its own on the same deal, as long as the lines of that step on that deal stay within `follow`
// (past it the network picks). Lines are named by the ids of the options taken ("/CAP_405t6/CAP_405t9/...").
// The score of a step is then that of the best way to pick, not the best line of each deal (which would be
// told the hidden cards): each line gets its mean result over the deals it was offered on, pulled towards the
// step's mean as if by one more game of that mean, and on each deal the step takes the offered line of the
// highest such score. Without picks there is one line, "", and the score is the plain mean.
// A result is 1 for a win of the seat that took the step, 1/2 for a draw, 0 for a loss.
import {moves,apply,gameModel} from './sim.mjs';
import {winner} from './selfplay.mjs';
import {redeal} from './selfplay-search.mjs';

// Does step m of s play or pick something whose effect comes later: Godfather Kazakus, its effects and
// trials (CAP_405*), a Ritual, or any card the simulator keeps a clock for.
export function delayedStep(s,m){
  if(m.kind==='choose')return String(m.id).startsWith('CAP_405');
  if(m.kind!=='play')return false;
  const c=s.hand.find(h=>h.id===m.id);
  if(!c)return false;
  if(String(c.raw?.cardId??'').startsWith('CAP_405')||c.trial)return true;
  const k=gameModel(c)?.kind;
  return k==='ritual'||k==='trial';
}
export const touchesDelayed=(s,legal)=>legal.some(m=>delayedStep(s,m));

// Does step m of s have a result that depends on cards nobody has seen yet (the deck order, a random
// Discover offer)? --distill-info always asks the look-ahead about such a position (env flag "info").
//   - the hero power with power.draw (Life Tap);
//   - playing a card whose model kind is 'draw', 'drawReduce' (Foresight), 'discover', 'studies' (Discover an
//     Outcast), or 'fate' (Intertwined Fate), or a minion model with a draw (battlecry draw, outcast.draw,
//     drawZeroAtk) or discoverMinion (Watfin) field;
//   - picking from a random offer: s.choice of kind 'discover' (Catacombs' temporary cards), 'discoverMinion',
//     'studies' or 'fate1'/'fate2'.
const INFO_KINDS=new Set(['draw','drawReduce','discover','studies','fate']);
const INFO_PICKS=new Set(['discover','discoverMinion','studies','fate1','fate2']);
export function infoStep(s,m){
  if(m.kind==='power')return (s.power?.draw??0)>0;
  if(m.kind==='choose')return INFO_PICKS.has(s.choice?.kind);
  if(m.kind!=='play')return false;
  const c=s.hand.find(h=>h.id===m.id);
  if(!c)return false;
  const g=gameModel(c);
  return !!g&&(INFO_KINDS.has(g.kind)||!!g.draw||!!g.discoverMinion||!!g.outcast?.draw||!!g.drawZeroAtk);
}
export const touchesInfo=(s,legal)=>legal.some(m=>infoStep(s,m));

export class Rollouts{
  constructor({follow=27,maxSteps=1500}={}){
    Object.assign(this,{follow,maxSteps,live:[],fresh:[],viewed:0,reqs:new Map(),done:[]});
  }
  // Request `id`: the steps (indexes of legal) of s, each on `games` deals from `seed`.
  add(id,s,legal,steps,{games=16,seed=1}={}){
    const req={id,seat:s.seat,games,left:0,res:steps.map(()=>new Map()),lines:steps.map(()=>Array(games).fill(1))};
    this.reqs.set(id,req);
    steps.forEach((k,at)=>{
      if(!legal[k])throw Error(`request ${id}: no step ${k} among ${legal.length}`);
      for(let g=0;g<games;g++){
        this.fresh.push({req,at,g,key:'',since:0,chain:true,s:apply(redeal(s,seed+g),legal[k]).s});
        req.left++;
      }
    });
  }
  // The caller's steps for the copies of the last views (in their order), then the copies still going.
  step(actions){
    if(actions.length!==this.viewed)throw Error(`${actions.length} actions for ${this.viewed} rollout copies`);
    for(let j=0;j<actions.length;j++){
      const c=this.live[j],m=c.legal[actions[j]];
      if(!m)throw Error(`rollout copy ${j}: no step ${actions[j]} among ${c.legal.length}`);
      c.s=apply(c.s,m).s;c.since++;c.chain=false;
    }
    this.live=this.sweep([...this.live,...this.fresh]);
    this.fresh=[];
    this.viewed=this.live.length;
    return this.live;
  }
  // The finished requests since the last take: [{id,win:[score a step],lines:[lines a step]}].
  take(){const d=this.done;this.done=[];return d}
  sweep(list){
    const out=[],todo=[...list];
    while(todo.length){
      const c=todo.shift(),{req}=c,legal=moves(c.s);
      if(!legal.length||c.since>=this.maxSteps){this.finish(c);continue}
      if(c.chain&&c.s.choice&&c.s.seat===req.seat&&req.lines[c.at][c.g]-1+legal.length<=this.follow){
        req.lines[c.at][c.g]+=legal.length-1;req.left+=legal.length-1;
        todo.unshift(...legal.map(m=>({...c,key:`${c.key}/${m.id}`,s:apply(c.s,m).s})));
        continue;
      }
      c.legal=legal;out.push(c);
    }
    return out;
  }
  finish(c){
    const {req}=c,w=winner(c.s)??'draw';                        // a copy cut off at maxSteps is a draw
    const r=w==='draw'?0.5:w===req.seat?1:0,lines=req.res[c.at];
    if(!lines.has(c.key))lines.set(c.key,new Map());
    lines.get(c.key).set(c.g,r);
    if(--req.left>0)return;
    this.reqs.delete(req.id);
    this.done.push({id:req.id,win:req.res.map(l=>score(l,req.games)),lines:req.res.map(l=>l.size)});
  }
}

// The score of one step from its lines (key -> Map deal -> result), see above.
export function score(lines,games){
  const all=[...lines.values()].flatMap(m=>[...m.values()]);
  if(!all.length)return 0.5;
  const mu=all.reduce((a,b)=>a+b,0)/all.length;
  const rank=[...lines.entries()].map(([key,m])=>{
    const v=[...m.values()];
    return {key,m,v:(v.reduce((a,b)=>a+b,0)+mu)/(v.length+1)};
  });
  let sum=0,n=0;
  for(let g=0;g<games;g++){
    let best=null;
    for(const l of rank)if(l.m.has(g)&&(!best||l.v>best.v))best=l;
    if(best){sum+=best.m.get(g);n++}
  }
  return n?sum/n:mu;
}
