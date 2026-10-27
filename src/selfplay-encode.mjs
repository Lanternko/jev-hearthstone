// A game state and its legal steps as numbers, for the learned policy (train/ppo.py). The state is
// seen from the acting chair and holds only what that player may know: the other hand and both deck
// orders enter as counts, never as cards. Every step gets its own vector, so the policy scores the
// steps it is offered and needs no fixed action table.
import {hero,hpOf,costOf,stateCost} from './sim.mjs';
import {cardDb} from './selfplay.mjs';

// Cards a list card makes during a game: the options of its picks (C'Thun abilities, Kazakus effects
// and trials, offered as card ids) and the tokens it summons or shuffles. They enter the vocabulary
// only when the list holds the maker, so the lists of the older nets keep the vocabulary they had.
const MADE={
  BE_726:['BE_013t1','BE_013t2','BE_013t3','BE_013t4','BE_013t5'],
  BE_085:['BE_085t'],
  CAP_405:[...Array.from({length:9},(_,i)=>`CAP_405t${i+1}`),'CAP_405tb1','CAP_405tb2','CAP_405tb3','LOOT_368'],
  TIME_025:['TIME_025t'],TIME_027:['TIME_025t'],
  CATA_210:['CATA_210t'],
  // The C'Thun demon hunter: Studies finds the four Outcast cards, the Dreadseeds and the Stingers,
  // the Portals to Argus (with the Demons they send) and C'Thun's picks.
  CORE_YOP_001:['CORE_BT_480','CORE_BT_491','CS3_017','BT_814'],
  EDR_840:['EDR_840t','EDR_840t1','EDR_840t2'],
  EDR_820:['EDR_840t','EDR_840t1','EDR_840t2','EDR_820a','EDR_820b'],
  TLC_902:['TLC_630t','TLC_903t'],
  TIME_020:['TIME_020t3','TIME_020t4','TIME_020t5','TIME_020t2t','TIME_020t3t','TIME_020t4t','TIME_020t5t'],
  CATA_528:['CATA_528t'],
  BE_204:['BE_013t1','BE_013t2','BE_013t3','BE_013t4','BE_013t5'],
  BE_014:['BE_013t1','BE_013t2','BE_013t3','BE_013t4','BE_013t5'],
  BE_771:['BE_013t1','BE_013t2','BE_013t3','BE_013t4','BE_013t5'],
  // decks/priest-egg: the 20/20 Khelos the Egg hatches, and the Ectoplasm Slime 'em! hands back.
  DINO_410:['DINO_410t'],
  CAP_805:['CAP_805t'],
  // decks/shaman-cthun: Fire Fly's Elemental and the Soldier Skywall Sentinel heralds. The basic
  // Totems and Watfin's Discover of any minion cannot be named here: they take the "other" slot.
  CORE_UNG_809:['UNG_809t1'],
  CATA_565:['CATA_565t'],
};

// One slot per card of the lists, The Coin, the Spider token, the cards the lists make (MADE), and a
// last one for everything else (the random minions of Disposable Acolytes).
// With `timers` the state also holds what is set to happen later (DELAYED); the nets made before it
// was added go without, and see the state they were trained on. `extra` is the same for the
// demon hunter's: one more cell at the very end (how many C'Thun abilities have been triggered, of
// four), and the costs of the hand as the cards now cost, discounts included. `stages` adds one cell
// for each body of each chair with how much of the Egg of Khelos is left (breaks remaining / 5, 0 for
// a body that is not an egg), so the network can tell the five cracked stages apart.
export function vocabulary(lists,cards=cardDb(),{timers=false,extra=false,stages=false}={}){
  const ids=lists.flatMap(l=>Object.keys(l.cards));
  const names=[...new Set([...ids.map(id=>cards[id].name),'The Coin','Spider',...ids.flatMap(id=>(MADE[id]??[]).map(m=>cards[m].name))])];
  return {names,index:new Map(names.map((n,i)=>[n,i])),size:names.length+1,timers,extra,stages};
}

// What a Ritual or a Kazakus trial does when its clock runs out: the two rituals and the nine effects.
const DELAYED=['summon','cthun',...Array.from({length:9},(_,i)=>`CAP_405t${i+1}`)];

const KINDS=['play','attack','power','use','choose','end'];
const SLOT=8,FOE=6,SCALARS=30,TARGET=7;
// The Egg of Khelos breaks five times before Khelos; each cracked stage is its own card id.
const EGG_STAGE={DINO_410:5,DINO_410t2:4,DINO_410t3:3,DINO_410t4:2,DINO_410t5:1};
const STAGE_COLS=14;  // seven bodies of each chair, as the blocks above
const breaks=b=>EGG_STAGE[b.cardId]??0;
export const obsSize=v=>SCALARS+7*SLOT+7*FOE+4*v.size+(v.timers?3*DELAYED.length:0)+(v.extra?1:0)+(v.stages?STAGE_COLS:0);
export const actSize=v=>KINDS.length+v.size+3+TARGET+v.size;

const t=n=>(n??0)/10;
const slot=(v,name)=>v.index.get(name)??v.size-1;
const minions=bs=>bs.filter(b=>b.type==='MINION');
// With the extra cell the cost a card is shown at follows the discounts of the demon hunter; any other card keeps its printed cost, as before.
const cost=(s,c,v)=>v.extra&&stateCost(c)?costOf(s,c):c.cost;
const ready=b=>b.canAttack&&b.atk>0&&!b.frozen&&!b.dormant&&(b.attacks??0)<(b.maxAttacks??1);

function observe(s,v){
  const o=new Array(obsSize(v)).fill(0),me=hero(s,'me'),foe=hero(s,'opp'),th=s.them;
  let k=0;
  for(const x of [t(hpOf(me)),t(hpOf(foe)),t(s.mana),t(s.crystals),t(th.crystals),t(s.hand.length),t(th.hand.length),
    t(s.deck.length),t(th.deck.length),t(s.fatigue),t(th.fatigue),t(s.discardCount),t(th.discardCount),
    t(s.weapon?.atk),t(s.weapon?.durability),t(th.weapon?.atk),t(th.weapon?.durability),t(me.atk),+!!ready(me),
    +(!!s.power&&!s.power.used&&s.power.cost<=s.mana),s.seat,t(s.turn),+!s.choice,+(s.choice?.kind==='discover'),
    +(s.choice?.kind==='site'),t(s.sites.length),t(s.sites.filter(x=>x.ready).length),t(th.locations),
    t(s.hand.filter(c=>c.temp).length),t(s.hand.filter(c=>cost(s,c,v)<=s.mana).length)])o[k++]=x;
  minions(s.me).slice(0,7).forEach((b,i)=>{
    o.splice(k+i*SLOT,SLOT,1,t(b.atk),t(b.hp),+!!ready(b),+!!b.taunt,+!!b.rush,+!!b.ds,+!!b.rushOnly);
  });
  k+=7*SLOT;
  minions(s.opp).slice(0,7).forEach((b,i)=>{
    o.splice(k+i*FOE,FOE,1,t(b.atk),t(b.hp),+!!b.taunt,+!!b.ds,+!!b.stealth);
  });
  k+=7*FOE;
  for(const [list,at] of [[s.hand,0],[minions(s.me),1],[minions(s.opp),2],[s.deck,3]])
    for(const c of list)o[k+at*v.size+slot(v,c.name)]+=.1;
  k+=4*v.size;
  if(v.timers){
    // Three blocks: my clocks and the other chair's, each effect weighed by how soon it comes (1 when
    // it comes at the start of the next turn), then the trials in my hand and a Kazakus pick under way.
    const add=(block,e,w)=>{const i=DELAYED.indexOf(e);if(i>=0)o[k+block*DELAYED.length+i]+=w};
    const clocks=(block,ts)=>{for(const x of ts??[])for(const e of x.effect==='trial'?x.effects:[x.effect])add(block,e,1/x.left)};
    clocks(0,s.timers);clocks(1,th.timers);
    for(const c of s.hand)if(c.trial)for(const e of c.trial.effects)add(2,e,1/(c.trial.turns+1));
    for(const e of [s.kaz?.first,s.kaz?.second])if(e)add(2,e,1);
    k+=3*DELAYED.length;
  }
  if(v.extra)o[k++]=(s.cthunSeen?.length??0)/4;
  if(v.stages){
    // How many breaks each egg on the table still has, mine first and then the other chair's.
    minions(s.me).slice(0,7).forEach((b,i)=>{o[k+i]=breaks(b)/5});
    minions(s.opp).slice(0,7).forEach((b,i)=>{o[k+7+i]=breaks(b)/5});
  }
  return o;
}

// Whatever a step names: a body on the table, a card in hand, a location, a card still in the deck,
// or a card of the database named by its id.
function thing(s,id,v){
  const b=[...s.me,...s.opp].find(x=>x.id===id);
  if(b)return {name:b.name,cost:0,atk:b.atk,hp:hpOf(b),hero:b.type==='HERO',mine:b.side==='me',taunt:b.taunt,card:false};
  const c=s.hand.find(x=>x.id===id);
  if(c)return {name:c.name,cost:cost(s,c,v),atk:c.atk,hp:c.hp,card:true,mine:true};
  const x=s.sites.find(x=>x.id===id);
  if(x)return {name:x.name,cost:0,atk:0,hp:x.durability,card:false,mine:true};
  const d=s.deck.find(x=>x.entityId===id);
  if(d)return {name:d.name,cost:d.COST??0,atk:d.ATK??0,hp:d.HEALTH??0,card:true,mine:true};
  // An option named by its card id (the C'Thun and Kazakus picks): the card of the database.
  const c2=typeof id==='string'?cardDb()[id]:null;
  return c2?{name:c2.name,cost:c2.cost??0,atk:c2.attack??0,hp:c2.health??0,card:true,mine:true}:null;
}
function act(s,m,v){
  const a=new Array(actSize(v)).fill(0),V=v.size;
  let k=KINDS.length;
  a[KINDS.indexOf(m.kind)]=1;
  const from=m.kind==='power'||m.kind==='end'?null:thing(s,m.id,v);
  if(from){a[k+slot(v,from.name)]=1;a[k+V]=t(from.cost);a[k+V+1]=t(from.atk);a[k+V+2]=t(from.hp)}
  k+=V+3;
  const to=m.targetId!=null?thing(s,m.targetId,v):null;
  if(to){
    a.splice(k,TARGET,1,+!!to.hero,+!!to.mine,+!!to.card,t(to.atk),t(to.hp),+!!to.taunt);
    a[k+TARGET+slot(v,to.name)]=1;
  }
  return a;
}

export const encode=(s,legal,v)=>({obs:observe(s,v),acts:legal.map(m=>act(s,m,v))});

// What the acting chair cannot see, for the value head of train/ppo.py --oracle that learns with it and
// never chooses a step: four blocks of a slot for each card, the other hand and the other deck (0.1 a
// card, as in the state), then the next three cards of the other deck and of ours (1, 1/2, 1/3: the
// top of the deck is s.deck[0]).
export const oracleSize=v=>4*v.size;
export function oracle(s,v){
  const o=new Array(oracleSize(v)).fill(0),th=s.them;
  for(const c of th.hand)o[slot(v,c.name)]+=.1;
  for(const c of th.deck)o[v.size+slot(v,c.name)]+=.1;
  th.deck.slice(0,3).forEach((c,i)=>{o[2*v.size+slot(v,c.name)]+=1/(i+1)});
  s.deck.slice(0,3).forEach((c,i)=>{o[3*v.size+slot(v,c.name)]+=1/(i+1)});
  return o;
}
