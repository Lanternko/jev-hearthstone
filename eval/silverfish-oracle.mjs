// Independent, exhaustive reference for ONLY the declared synthetic subset.
// Does not import production simulator, search, evaluation weights or policy.
// Throws on unsupported mechanics rather than silently validating them.
const hp=c=>c.HEALTH-(c.DAMAGE??0);
export function referenceState(state,actions){
  const ready=new Set(actions.filter(a=>a.targetId!=null).map(a=>a.entityId));
  const read=c=>({...c,hp:hp(c),attack:c.ATK??0,used:0,ready:ready.has(c.entityId),
    max:c.WINDFURY?2:1,shield:!!c.DIVINE_SHIELD,taunt:!!c.TAUNT,armor:c.ARMOR??0});
  return {mine:state.me.board.filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(read),
    enemy:state.opponent.board.filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(read),
    hand:state.me.hand.map(read),mana:state.me.mana,weapon:state.me.board.find(c=>c.CARDTYPE==='WEAPON'),token:0};
}
const hero=s=>s.mine.find(c=>c.CARDTYPE==='HERO');
const slots=s=>7-s.mine.filter(c=>c.CARDTYPE==='MINION').length;
const grow=c=>c.name==='Duke of Below';
const hit=(c,n)=>{
  if(c.shield){c.shield=false;return;}
  const soak=Math.min(c.armor,n);c.armor-=soak;c.hp-=n-soak;
};
function lose(s,mode){
  if(!s.hand.length)return;
  const costs=s.hand.map(c=>c.COST);
  const k=(mode==='low'?Math.min:Math.max)(...costs);
  const eligible=s.hand.filter(c=>c.COST===k);
  if(eligible.length!==1)throw Error('Reference refuses random discard');
  const c=eligible[0];s.hand=s.hand.filter(x=>x!==c);
  for(const d of [...s.hand,...s.mine])if(grow(d)){d.attack+=2;d.hp+=2;}
  if(['Walking Dead','Silverware Golem'].includes(c.name)){
    if(slots(s)>0)s.mine.push({...c,ready:false,used:0,taunt:c.name==='Walking Dead'});
  }
  else if(c.name==='Boneweb Egg'){
    for(let i=0;i<2&&slots(s)>0;i++)s.mine.push({entityId:-(++s.token),name:'Spider',CARDTYPE:'MINION',
      attack:2,hp:1,armor:0,used:0,max:1,ready:false,shield:false,taunt:false});
  }else if(/discard|draw|random/i.test(c.text??''))throw Error('Unsupported discarded effect');
}
export function referenceApply(input,m){
  const s=structuredClone(input);
  if(m.kind==='attack'){
    const a=s.mine.find(c=>c.entityId===m.id),t=s.enemy.find(c=>c.entityId===m.targetId);
    if(!a?.ready||a.used>=a.max||a.attack<=0||!t)throw Error('Illegal reference attack');
    if(s.enemy.some(c=>c.taunt)&&!t.taunt)throw Error('Reference Taunt restriction');
    if(a.rushOnly&&t.CARDTYPE==='HERO')throw Error('Reference Rush restriction');
    hit(t,a.attack);if(t.CARDTYPE==='MINION')hit(a,t.attack);
    a.used++;s.mine=s.mine.filter(c=>c.hp>0);s.enemy=s.enemy.filter(c=>c.hp>0);
    if(a.CARDTYPE==='HERO'&&s.weapon&&a.hp>0)lose(s,'high');
  }else if(m.kind==='play'){
    const c=s.hand.find(c=>c.entityId===m.id);
    if(!c||c.COST>s.mana)throw Error('Illegal reference play');
    s.hand=s.hand.filter(x=>x!==c);s.mana-=c.COST;
    if(c.name==='Wicked Whispers'){
      lose(s,'low');for(const b of s.mine)if(b.CARDTYPE==='MINION'){b.attack++;b.hp++;}
    }else if(c.CARDTYPE==='MINION'){
      if(slots(s)<=0)throw Error('Reference full board');
      s.mine.push({...c,ready:grow(c),rushOnly:grow(c),used:0});
    }else throw Error('Unsupported reference card');
  }else throw Error('Unsupported reference action');
  return s;
}
export function referenceReplay(c,steps){
  return steps.reduce(referenceApply,referenceState(c.state,c.actions));
}
export function meetsExpected(s,e){
  if(e.lethal)return !s.enemy.some(c=>c.CARDTYPE==='HERO'&&c.hp+c.armor>0)&&hero(s)?.hp>0;
  const bodies=s.mine.filter(c=>c.CARDTYPE==='MINION');
  return bodies.length===e.bodies&&bodies.reduce((n,c)=>n+c.attack,0)>=e.attack
    &&bodies.reduce((n,c)=>n+c.hp,0)>=e.health;
}
export function combatOracle(c){
  const start=referenceState(c.state,c.actions),enemyHp=start.enemy.find(c=>c.CARDTYPE==='HERO').hp;
  let maximum=0,visited=0;
  function walk(s){
    visited++;const h=s.enemy.find(c=>c.CARDTYPE==='HERO');
    maximum=Math.max(maximum,enemyHp-(h?.hp??0));
    if(!h)return;
    const targets=s.enemy.some(c=>c.taunt)?s.enemy.filter(c=>c.taunt):s.enemy;
    for(const a of s.mine)if(a.ready&&a.used<a.max&&a.attack>0)
      for(const t of targets)walk(referenceApply(s,{kind:'attack',id:a.entityId,targetId:t.entityId}));
  }
  walk(start);return {maximum,lethal:maximum>=enemyHp,visited};
}
