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
import {search,score,actionFor,additiveStep} from './plan.mjs';
import {moves,apply} from './sim.mjs';
export const RULE_RELEASE_VERSION='rule-release-v1';

export function ruleRelease(state,before,after,rule,{fodderHold}={}){
  if(state?.choice)return null;
  const kept=new Set(after.map(a=>a.id));
  const removed=before.filter(a=>!kept.has(a.id));
  if(!removed.length||!after.length)return null;
  const opts={pastAdditive:true,...(fodderHold?.length?{fodderHold}:{})};
  const {start,plans}=search(state,before,opts);
  const open=new Map();
  for(const m of moves(start)){
    const x=actionFor(before,m);if(!x)continue;
    const r=apply(start,m);
    open.set(x.id,(open.get(x.id)??false)||r.exact||additiveStep(start,r));
  }
  if(after.some(a=>a.type!=='END_TURN'&&!open.get(a.id)))return null;
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
