// A position scored by what stands on it, for the seat to act: Φ = Σ w_i·feature_i.
// The result alone does not say early enough that a delayed payoff (a Kazakus trial, a ritual) was
// worth setting up; these features, looked at a few of our turns ahead, do (train/fit_score.py fits
// the weights, train/ppo.py --shape uses Φ as a potential).
//
// Every feature is ours less theirs, so features(flip(s)) is -features(s):
//   board   - Attack + Health of the living minions that are awake
//   hand    - cards in hand
//   health  - hero Health + Armor (a dead hero counts 0)
//   pending - what is set to happen later, at a rough worth in board units (Attack + Health), less a
//             quarter for each turn it still waits: the clocks of rituals and trials, a trial card in
//             hand (ours only: theirs is hidden), sleeping minions.
import {hpOf} from './sim.mjs';

export const FEATURES=['board','hand','health','pending'];
export const WAIT=0.75;
// Godfather Kazakus's nine effects (CAP_405t1..t9, see castEffect in src/sim.mjs), in board units.
// A card counts 3; t3 takes two of theirs (4 cards of swing), t6 is three 3-drops (6 each on average
// over the simulator's pool), t9 is Voidlord 3/9 and half the worth of its three 1/3s.
export const EFFECT_WORTH={CAP_405t1:0,CAP_405t2:6,CAP_405t3:12,CAP_405t4:9,CAP_405t5:9,CAP_405t6:18,CAP_405t7:3,CAP_405t8:6,CAP_405t9:18};
// The other clocks (fireTimers in src/sim.mjs): two C'thrax Brutes 3/5, a Naga Monstrosity 3/3, a C'Thun ability.
export const RITUAL_WORTH={summon:16,naga:6,cthun:15};

const worthOfEffects=effects=>(effects??[]).reduce((a,e)=>a+(EFFECT_WORTH[e]??0),0);
const timerWorth=t=>(t.effect==='trial'?worthOfEffects(t.effects):RITUAL_WORTH[t.effect]??0)*WAIT**Math.max(0,t.left-1);
const awake=b=>b.type==='MINION'&&b.hp>0&&!b.dormant;
const sleeping=b=>b.type==='MINION'&&b.hp>0&&b.dormant;
const heroOf=side=>side.find(b=>b.type==='HERO');

function sideOf(bodies,timers,hand){
  const minions=bodies.filter(awake),h=heroOf(bodies);
  let pending=(timers??[]).reduce((a,t)=>a+timerWorth(t),0);
  for(const b of bodies.filter(sleeping))pending+=(b.atk+b.hp)*WAIT**Math.max(0,(b.wake??1)-1);
  for(const c of hand??[])if(c.trial)pending+=worthOfEffects(c.trial.effects)*WAIT**c.trial.turns;
  return {board:minions.reduce((a,b)=>a+b.atk+b.hp,0),health:h?Math.max(0,hpOf(h)):0,pending};
}

// -> {board,hand,health,pending} for `seat` (the seat to act when not given).
export function features(s,seat=s.seat){
  const me=sideOf(s.me,s.timers,s.hand),them=sideOf(s.opp,s.them?.timers,null);
  const f={board:me.board-them.board,hand:s.hand.length-(s.them?.hand.length??0),health:me.health-them.health,pending:me.pending-them.pending};
  if(seat!==s.seat)for(const k of FEATURES)f[k]=-f[k];
  return f;
}

// Φ for these weights ({board,hand,health,pending}; a missing one is 0).
export function phi(s,w,seat=s.seat){
  const f=features(s,seat);
  return FEATURES.reduce((a,k)=>a+(w[k]??0)*f[k],0);
}
