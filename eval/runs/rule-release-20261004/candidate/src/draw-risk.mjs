// Bounds from known composition, never deck order. Casts When Drawn replace themselves.
export function drawImpact(state,n,{played=false}={}){
 const requested=Math.max(0,Number(n)||0),raw=state?.me?.deckCount;
 const deck=raw==null?null:Number(raw);
 const hand=Math.max(0,(state?.me?.hand??[]).length-(played?1:0));
 const fatigue=Math.max(0,Number(state?.me?.fatigue)||0);
 if(deck==null||!Number.isFinite(deck))return {requested,hand,deck:null,usable:null,cardsMax:requested,burnMax:Math.max(0,hand+requested-10),fatigueDraws:0,damageMin:0,damageMax:null};
 const hazards=(state?.me?.drawHazards??[]).slice(0,deck).map(Number).filter(Number.isFinite);
 const usable=Math.max(0,deck-hazards.length),cardsMax=Math.min(requested,usable);
 const fatigueDraws=Math.max(0,requested-usable);
 const fatigueDamage=fatigueDraws*(2*fatigue+fatigueDraws+1)/2;
 const shredDamage=hazards.reduce((s,x)=>s+x,0);
 // With space in hand, exhausting ordinary cards forces all known auto-casts too.
 // At a full hand cards may burn instead; do not claim those casts are guaranteed.
 const casting=hand<10&&requested>0;
 // Ordinary cards may fill the hand mid-effect, so later auto-casts can burn.
 // A guaranteed chain requires fewer ordinary cards than the remaining slots.
 const chainCertain=casting&&usable<10-hand;
 const fatigueMin=Math.max(0,requested-(chainCertain?usable:deck));
 const minimumFatigueDamage=fatigueMin*(2*fatigue+fatigueMin+1)/2;
 return {requested,hand,deck,usable,cardsMax,burnMax:Math.max(0,hand+cardsMax-10),
  fatigueDraws:fatigueMin,
  damageMin:minimumFatigueDamage+(chainCertain&&requested>usable?shredDamage:0),
  damageMax:casting?fatigueDamage+shredDamage:null,
  knownAutoCasts:hazards.length,nextFatigue:fatigue+1};
}
export function drawRiskText(state,n,options){
 const r=drawImpact(state,n,options);
 return ` Draw assessment: ${r.hand}/10 hand cards after costs; deck ${r.deck??'unknown'}, at most ${r.usable??'unknown'} ordinary cards remaining; at most ${r.cardsMax} new hand card(s), up to ${r.burnMax} burned. Known self-damaging auto-casts ${r.knownAutoCasts??'unknown'}; minimum draw damage ${r.damageMin}${r.damageMax!=null?`, known-composition upper bound ${r.damageMax}`:''}; unavoidable fatigue draws ${r.fatigueDraws}; next fatigue hit starts at ${r.nextFatigue??'unknown'} and increases with each failed draw. These are bounds, not a predicted draw order. Compare spending existing cards, mana for follow-ups, and reserve for next turn's mandatory draw before choosing more resources.`;
}
