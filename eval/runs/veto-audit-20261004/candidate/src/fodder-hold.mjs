// Step 2 of the rule-tier plan (user, 2026-10-04): turn the wastedFodder delete into a score.
//
// The simulator gave a card in hand no value, so it always preferred hard-casting discard fodder
// over keeping it for the outlet that would discard it for free. policy.mjs therefore deleted
// those casts outright, which also deleted them when the cast was the only thing standing between
// us and their lethal (step 1, morning games g1 T16 and g2 T15: Silverware Golem held while dying).
//
// holdValue is what the simulator itself would award for the discard: the same board value
// plan.mjs gives the summoned body or spiders, or the draws at the objective's draw weight. It is
// not discounted for the chance the outlet never fires: wastedFodder already requires a reliable
// outlet, and an undiscounted value means a plain cast (body for mana) never beats holding. Only
// a cast that buys something beyond its own body -- a Taunt against lethal, a trade -- can win.
import {discardModel} from './discard-model.mjs';
export const FODDER_HOLD_VERSION='fodder-hold-v1';

const randomBody=cost=>2*cost+1;              // a vanilla-ish c-cost minion: c/c plus card text
// c is a simulator hand card: {id,name,type,cost,text,atk,hp}.
export function holdValue(c,w){
  const m=discardModel({type:c.type,name:c.name,text:c.text,hp:c.hp});
  if(m.kind==='body')return c.atk+c.hp+(/^Taunt\b/i.test(c.text)?2:0)+(c.text?1:0);
  if(m.kind==='spiders')return m.n*(m.atk+m.hp);
  if(m.kind==='draw')return m.n*w.draw;
  if(m.kind==='randomBodies')return m.n*randomBody(m.cost);
  return 0;
}

// Penalty for every held fodder card that left the hand without being discarded, i.e. was cast.
export function fodderHoldPenalty(start,s,w){
  let v=0;
  for(const id of start.fodderHold??[]){
    const c=start.hand.find(x=>x.id===id);
    if(!c||s.hand.some(x=>x.id===id)||(s.discarded??[]).some(x=>x.id===id))continue;
    v+=holdValue(c,w);
  }
  return v;
}

export const holdGuidance=(c,v,outlet)=>`Hard-casting ${c.name} gives up its free discard payoff (about ${Math.round(v*10)/10} board/card value) that ${outlet} would collect for no mana. Cast it only when the cast itself buys more than that, such as a Taunt against lethal.`;
