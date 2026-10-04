// Synthetic tactical cases: rule-derived expectations, not labels from the new scorer.
export const whispers={name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,
  text:'Discard your lowest Cost card. Give your minions +1/+1.'};
export const walking={name:'Walking Dead',CARDTYPE:'MINION',COST:3,ATK:2,HEALTH:5,
  text:'Taunt If you discard this minion, summon it.'};
export const golem={name:'Silverware Golem',CARDTYPE:'MINION',COST:3,ATK:3,HEALTH:4,
  text:'If you discard this minion, summon it.'};
export const egg={name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,ATK:0,HEALTH:2,
  text:'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'};
export const duke={name:'Duke of Below',CARDTYPE:'MINION',COST:4,ATK:2,HEALTH:2,
  text:"Rush Has +2/+2 for each card you've discarded this game."};
export const claws={name:'Chronoclaws',CARDTYPE:'WEAPON',COST:4,ATK:4,HEALTH:3,
  text:'After your hero attacks, discard your highest Cost card.'};

export function position({mine=[],enemy=[],hand=[],mana=0,enemyHp=30,myHp=30,weapon=null}={}){
  const board=[{entityId:1,name:'Hero',CARDTYPE:'HERO',HEALTH:myHp,ATK:weapon?.ATK??0,EXHAUSTED:0},
    ...mine.map((c,i)=>({entityId:10+i,CARDTYPE:'MINION',EXHAUSTED:0,ATK:1,HEALTH:1,...c}))];
  if(weapon)board.push({entityId:4,...weapon});
  const opp=[{entityId:2,name:'Enemy hero',CARDTYPE:'HERO',HEALTH:enemyHp,ATK:0},
    ...enemy.map((c,i)=>({entityId:50+i,CARDTYPE:'MINION',ATK:1,HEALTH:1,...c}))];
  const cards=hand.map((c,i)=>({entityId:80+i,ZONE_POSITION:i+1,...c}));
  const state={turn:9,me:{heroClass:'WARLOCK',mana,maxMana:mana,current:true,deckCount:20,board,hand:cards},opponent:{board:opp}};
  const targets=opp.some(c=>c.TAUNT)?opp.filter(c=>c.TAUNT):opp;
  const actions=[{id:'end',type:'END_TURN'}];
  for(const c of board)if(['HERO','MINION'].includes(c.CARDTYPE)&&c.ATK>0&&!c.EXHAUSTED)
    for(const t of targets)actions.push({id:`a${c.entityId}t${t.entityId}`,type:'POWER',entityId:c.entityId,targetId:t.entityId});
  for(const c of cards)if(c.COST<=mana&&(c.CARDTYPE!=='MINION'||mine.length<7))
    actions.push({id:`c${c.entityId}`,type:'POWER',entityId:c.entityId});
  return {state,actions};
}

export function tacticalCases(){
  const cases=[
    {id:'walking-before-buff',p:{mana:1,mine:[{name:'A'}],hand:[whispers,walking]},expect:{bodies:2,attack:5,health:8}},
    {id:'golem-before-buff',p:{mana:1,mine:[{name:'A'}],hand:[whispers,golem]},expect:{bodies:2,attack:6,health:7}},
    {id:'egg-before-buff',p:{mana:1,mine:[{name:'A'}],hand:[whispers,egg]},expect:{bodies:3,attack:8,health:6}},
    {id:'egg-one-slot',p:{mana:1,mine:Array.from({length:6},(_,i)=>({name:`A${i}`,EXHAUSTED:1})),hand:[whispers,egg]},expect:{bodies:7,attack:15,health:14}},
    {id:'walking-full-board',p:{mana:1,mine:Array.from({length:7},(_,i)=>({name:`A${i}`,EXHAUSTED:1})),hand:[whispers,walking]},expect:{bodies:7,attack:14,health:14}},
    {id:'duke-on-board-lethal',p:{mana:1,enemyHp:5,mine:[duke],hand:[whispers,walking]},expect:{lethal:true}},
    {id:'claws-grow-duke-lethal',p:{enemyHp:8,mine:[duke],hand:[walking],weapon:claws},expect:{lethal:true}},
    {id:'grow-hand-duke-open-taunt',p:{mana:5,enemyHp:3,mine:[{name:'A',ATK:2,HEALTH:2}],
      enemy:[{name:'Wall',ATK:1,HEALTH:4,TAUNT:1}],hand:[whispers,walking,duke]},expect:{lethal:true}}
  ];
  return cases.map(({p,...c})=>({...c,...position(p)}));
}

// Seeded held-out combat combinations; no card effects or scorer-dependent labels.
export function combatCases(seed=20261001,n=64){
  let x=seed>>>0;
  const rnd=k=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return Math.floor(x/4294967296*k)};
  return Array.from({length:n},(_,i)=>({id:`combat-${i}`,...position({
    mine:Array.from({length:2+rnd(2)},(_,j)=>({name:`A${j}`,ATK:1+rnd(5),HEALTH:1+rnd(5)})),
    enemy:Array.from({length:rnd(3)},(_,j)=>({name:`T${j}`,ATK:1+rnd(4),HEALTH:1+rnd(5),
      TAUNT:rnd(2),DIVINE_SHIELD:rnd(3)===0?1:0})),enemyHp:1+rnd(12)})}));
}
