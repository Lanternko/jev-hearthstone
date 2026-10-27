// Hard-position restarts of train/ppo.py --restart-frac: a share of the training games does not begin
// with a new deal but at a position from a pool, one where the side to move has a step whose effect
// comes later (Kazakus and its picks, rituals, trials: touchesDelayed of src/selfplay-rollout.mjs).
// The learner then plays on from there as in any game, so ordinary PPO gets many samples of these
// decisions with the network as it is now.
//
// The pool has two parts: positions seeded from greedy games of a fixed network (never replaced), and
// a ring of positions the training games passed through, so that the pool follows the learner.
// Every position is stored as a copy and handed out as a copy: the games that play on from it
// change their state, the pool must not. The hidden half is dealt afresh at each restart (redeal of
// src/selfplay-search.mjs, from the view of the side to move): the opponent's hand and the order of
// both decks.
import {moves,apply} from './sim.mjs';
import {newGame,winner} from './selfplay.mjs';
import {encode} from './selfplay-encode.mjs';
import {redeal} from './selfplay-search.mjs';
import {touchesDelayed} from './selfplay-rollout.mjs';

// A state with everything copied but the shared card tables of its game.
export function copyState(s){
  const {game,...rest}=s;
  return {game,...structuredClone(rest)};
}

// A number in [0,1) that depends on k and salt alone.
export function unit(k,salt){
  let x=(k^salt)>>>0;
  x=Math.imul(x^x>>>16,0x85ebca6b);
  x=Math.imul(x^x>>>13,0xc2b2ae35);
  return ((x^x>>>16)>>>0)/4294967296;
}

export class RestartPool{
  constructor({cap=5000}={}){Object.assign(this,{cap,fixed:[],ring:[],at:0,taken:0})}
  get size(){return this.fixed.length+this.ring.length}
  // Keep a copy of s if its side to move has a delayed step; seats are the decks (indexes of the lists) in
  // seat 0 and seat 1. -> whether it was kept.
  add(s,legal,seats,{fixed=false}={}){
    if(!touchesDelayed(s,legal))return false;
    const e={s:copyState(s),seats:[...seats]};
    if(fixed)this.fixed.push(e);
    else if(this.ring.length<this.cap)this.ring.push(e);
    else{this.ring[this.at]=e;this.at=(this.at+1)%this.cap}
    return true;
  }
  // The position at u in [0,1) of all of them, redealt from `seed`: {s,seats}.
  pick(u,seed){
    const k=Math.min(this.size-1,Math.floor(u*this.size));
    const e=k<this.fixed.length?this.fixed[k]:this.ring[k-this.fixed.length];
    this.taken++;
    return {s:redeal(copyState(e.s),seed),seats:[...e.seats]};
  }
}

// Greedy games of `net` (loadNet) over the pairings of `lists` given as pairs of indexes, seats and decks
// alternating from game to game; the delayed positions of each (at most `perGame`, spread over the game)
// go into the pool as fixed ones until it holds `limit` of them. -> how many were added.
export function seedPool(pool,{lists,pairs,net,limit,seed=1,perGame=4,maxSteps=600,maxGames=null}){
  let added=0;
  maxGames??=limit*4;
  for(let g=0;g<maxGames&&added<limit;g++){
    const seats=pairs[g%pairs.length],id=seed+g;
    let s=newGame({lists:seats.map(i=>lists[i]),seed:id});
    const found=[];
    let last='';
    for(let n=0;n<maxSteps&&winner(s)==null;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const key=`${s.seat}|${s.turn}|${s.choice?legal.map(m=>m.id).join():''}`;
      if(key!==last&&touchesDelayed(s,legal)){found.push({s:copyState(s),legal});last=key}
      let pick=0;
      if(legal.length>1){
        const {obs,acts}=encode(s,legal,net.vocab),{logits}=net.forward(obs,acts);
        pick=logits.indexOf(Math.max(...logits));
      }
      s=apply(s,legal[pick]).s;
    }
    const step=found.length/perGame;
    for(let j=0;j<Math.min(perGame,found.length)&&added<limit;j++){
      const f=found[Math.floor(j*Math.max(1,step))];
      if(pool.add(f.s,f.legal,seats,{fixed:true}))added++;
    }
  }
  return added;
}
