// Step 2b of the rule-tier plan (user, 2026-10-04): the ordering deletes become defaults the
// simulator can overturn, the way fodderRelease overturns wastedFodder.
//
// weaponFirst, overflowWaits, buffBeforeTap and bodyBeforeBuff each remove the actions that would
// go first in the wrong order. Most of them exist because the search stopped at the first unknown:
// Platysaur's draw ended every plan, so "Platysaur, then the buff" could not be scored. The search
// here continues past steps whose only unknown is cards drawn (plan.mjs pastAdditive), and models
// battlecry-draw minions (sim.mjs drawMinionModel), so both orders are on the board.
//
// The delete stays the default. One removed action comes back only when the best plan starts with
// it and scores strictly higher than the best plan whose first step the rule keeps (searched with
// the removed actions barred from the first step only) and than doing nothing. A tie keeps the
// rule: two orders reaching the same board are the user's ruling's call, not the simulator's.
// The same holds when the simulator cannot see past a kept action: one it cannot play at all
// (game 11: an unarmed hero swing), or one whose outcome ends the plan -- a Chronoclaws swing or
// Wicked Whispers discards an unknown card. The rule's own line, "that first, then the rest", is
// then cut off after its first step and would lose to any longer plan for that reason alone.
// Step 3 (veto audit) makes every non-choice preference delete go through here, so the cheap
// test comes first: the searches run only when the kept side is fully playable. A removed
// END_TURN is never released -- no plan starts with it -- and alone it triggers no search.
import {search,score,actionFor,additiveStep} from './plan.mjs';
import {moves,apply,fromState} from './sim.mjs';
export const RULE_RELEASE_VERSION='rule-release-v2';

// Hold rules keep a card for a later turn rather than reorder this one. The search scores one
// turn and gives a card left in hand no value, so any play beats holding it -- game 46 (Coin kept
// over a lone Egg), New50 game9 T2 (buff held on one sleeping body) and the draw-over-buff ruling
// were all released on that bias alone. They stay the default with no simulator release, as do
// the discard picks the simulator does not model (doomed draws, Occultist, board-first).
export const HOLD_RULES=new Set(['deferHardCast','saferCopies','passiveEggCoin','wastedBurn','splitToFace',
  'overdrawWaits','deadWhispers','whispersWaits','whispersEatsPlayable','newBodyBuffWaits','buffTapMana',
  'pricedOut','doomedPick','boardFirstDiscard','occultistPick']);

export function ruleRelease(state,before,after,rule,{fodderHold}={}){
  if(state?.choice||HOLD_RULES.has(rule))return null;
  const kept=new Set(after.map(a=>a.id));
  const removed=before.filter(a=>!kept.has(a.id)&&a.type!=='END_TURN');
  if(!removed.length||!after.length)return null;
  const opts={pastAdditive:true,...(fodderHold?.length?{fodderHold}:{})};
  const s0=fromState(state,before);
  if(fodderHold?.length)s0.fodderHold=fodderHold;
  s0.additive=true;
  const open=new Map();
  for(const m of moves(s0)){
    const x=actionFor(before,m);if(!x)continue;
    const r=apply(s0,m);
    open.set(x.id,(open.get(x.id)??false)||r.exact||additiveStep(s0,r));
  }
  if(after.some(a=>a.type!=='END_TURN'&&!open.get(a.id)))return null;
  const {start,plans}=search(state,before,opts);
  const best=plans[0],a=best&&actionFor(before,best.steps[0]);
  if(!a||kept.has(a.id))return null;
  const barred=new Set(removed.map(x=>x.id));
  const held=search(state,before,{...opts,firstAllowed:m=>{const x=actionFor(before,m);return !x||!barred.has(x.id)}});
  const rival=held.plans[0]?.score??-Infinity,idle=score(start,start);
  if(!(best.score>Math.max(rival,idle)))return null;
  return {version:RULE_RELEASE_VERSION,rule,actionId:a.id,entityId:a.entityId,targetId:a.targetId??null,
    score:best.score,rivalScore:rival,idleScore:idle,
    steps:best.steps.map(m=>({kind:m.kind,id:m.id,targetId:m.targetId??null,exact:m.exact}))};
}

// Apply one rule's delete with its release. Returns the menu and records the release in `log`.
export function releasing(state,before,after,rule,log,opts){
  const r=ruleRelease(state,before,after,rule,opts);
  if(!r)return after;
  log?.push(r);
  const back=before.find(a=>a.id===r.actionId);
  return [...after,back];
}
