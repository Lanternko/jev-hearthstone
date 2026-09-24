// Deterministic lethal detection.
//
// Jev scores each option on its own, so a sum across several attacks exists nowhere in its
// input; it has lost a won board twice. Lethal is arithmetic over a closed, fully observed
// state, which is exactly what code does perfectly and a scorer cannot do at all. So the
// arithmetic is taken away from Jev rather than explained to it.

export const atkOf=(state,entityId)=>{
  const c=(state?.me?.board??[]).find(x=>x.entityId===entityId);
  return c?(c.ATK??c.baseAttack??0):0;
};

// Guards a partial state: no opponent means no hero, which means no lethal, not a crash.
export const enemyHero=state=>(state?.opponent?.board??[]).find(c=>c.CARDTYPE==='HERO');

export const heroHp=hero=>hero?(hero.HEALTH??0)-(hero.DAMAGE??0)+(hero.ARMOR??0):0;

// Attack options whose attacker is a body we control. A Taunt on the other side simply means
// no such option names the hero, so the face total falls to 0 on its own.
export const attackOptions=(state,actions)=>{
  const board=state?.me?.board??[];
  return actions.filter(a=>a.targetId!=null
    &&board.some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE)));
};

export const faceAttacks=(state,actions)=>{
  const hero=enemyHero(state);
  return hero?attackOptions(state,actions).filter(a=>a.targetId===hero.entityId):[];
};

export const faceDamage=(state,actions)=>
  faceAttacks(state,actions).reduce((n,a)=>n+atkOf(state,a.entityId),0);

// One step of a lethal, or null. Deliberately not a whole plan: the caller re-derives the
// state after every click, and each swing lowers the hero's Health by exactly the damage it
// removes from the total, so the condition still holds at the next step. Attacking the face
// costs nothing -- a hero deals no damage back -- so there is no cost to weigh against it.
//
// It stays silent whenever the win is not already on the table: it never counts cards in
// hand, mana, or anything a buff might add. Setting a lethal up is judgement; finishing one
// is arithmetic.
export function lethalStrike(state,actions){
  if(state?.choice)return null;                       // mulligan or a pending card choice
  const hero=enemyHero(state);
  if(!hero)return null;
  const hp=heroHp(hero);
  if(hp<=0)return null;
  const face=faceAttacks(state,actions);
  if(!face.length)return null;
  if(faceDamage(state,actions)<hp)return null;
  // Order is irrelevant to the total; biggest first keeps it deterministic and spends the
  // swing that is most likely to be answered before the opponent can answer it.
  const best=[...face].sort((a,b)=>atkOf(state,b.entityId)-atkOf(state,a.entityId))[0];
  return {action:best,source:'forced_lethal'};
}
