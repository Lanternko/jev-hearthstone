// Shared, visible-card arithmetic. Unknown/conditional effects stay with Jev and a fresh
// observation; these helpers never infer hidden cards or read the deck order.
// The flat text depends on the printed text alone, so each distinct text is flattened once:
// self-play asks for the same few dozen texts on every step.
const FLAT=new Map();
export const textOf=c=>{
  const t=c?.text??'';
  let v=FLAT.get(t);
  if(v===undefined){
    v=t.replace(/\[x\]/g,' ').replace(/<[^>]+>/g,'').replace(/&/g,' ').replace(/\$[a-z]?(\d+)/gi,'$1').replace(/\s+/g,' ').trim();
    if(FLAT.size>=20000)FLAT.clear();
    FLAT.set(t,v);
  }
  return v;
};
export const tagOn=(c,t)=>c?.[t]===1||c?.[t]==='1';
export const isOutcast=c=>/\bOutcast:/i.test(textOf(c));
export function outcastActive(state,c){
  const hand=state?.me?.hand??[],i=hand.findIndex(x=>x.entityId===c?.entityId);
  return i>=0&&(i===0||i===hand.length-1);
}
export function immediateDraws(c,state){
  const text=textOf(c),parts=text.split(/\bOutcast:\s*/i);
  const count=t=>[...t.matchAll(/\bdraw (a|an|one|two|three|\d+) cards?\b/gi)]
    .reduce((n,m)=>n+({a:1,an:1,one:1,two:2,three:3}[m[1].toLowerCase()]??Number(m[1])),0);
  // Delayed and conditional text is not a draw that happens when the card is played.
  if(/^(?:at |after |whenever |deathrattle:|if )/i.test(parts[0]))return 0;
  let n=count(parts[0]);
  if(parts[1]&&outcastActive(state,c))n+=count(parts[1])+(/\bdraw another\b/i.test(parts[1])?1:0);
  return n;
}
export function heroAttackGain(c){
  if(c?.CARDTYPE!=='HERO_POWER')return 0;
  const m=/^(?:Hero Power )?\+(\d+) Attack this turn\.?$/i.exec(textOf(c));
  return m?Number(m[1]):0;
}
export function heroCanSwing(state){
  const h=(state?.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
  return !!h&&!tagOn(h,'FROZEN')&&!tagOn(h,'EXHAUSTED')
    &&Number(h.NUM_ATTACKS_THIS_TURN??0)<(tagOn(h,'WINDFURY')?2:1);
}
export const ignoresTaunt=c=>!tagOn(c,'SILENCED')&&!tagOn(c,'DORMANT')
  &&/\ball friendly attacks ignore taunt\b/i.test(textOf(c));
