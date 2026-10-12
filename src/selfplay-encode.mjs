// A game state and its legal steps as numbers, for the learned policy (train/ppo.py). The state is
// seen from the acting chair and holds only what that player may know: the other hand and both deck
// orders enter as counts, never as cards. Every step gets its own vector, so the policy scores the
// steps it is offered and needs no fixed action table.
import {hero,hpOf} from './sim.mjs';
import {cardDb} from './selfplay.mjs';

// One slot per card of the lists, The Coin, the Spider token, and a last one for everything else
// (the random minions of Disposable Acolytes).
export function vocabulary(lists,cards=cardDb()){
  const names=[...new Set([...lists.flatMap(l=>Object.keys(l.cards).map(id=>cards[id].name)),'The Coin','Spider'])];
  return {names,index:new Map(names.map((n,i)=>[n,i])),size:names.length+1};
}

const KINDS=['play','attack','power','use','choose','end'];
const SLOT=8,FOE=6,SCALARS=30,TARGET=7;
export const obsSize=v=>SCALARS+7*SLOT+7*FOE+4*v.size;
export const actSize=v=>KINDS.length+v.size+3+TARGET+v.size;

const t=n=>(n??0)/10;
const slot=(v,name)=>v.index.get(name)??v.size-1;
const minions=bs=>bs.filter(b=>b.type==='MINION');
const ready=b=>b.canAttack&&b.atk>0&&!b.frozen&&!b.dormant&&(b.attacks??0)<(b.maxAttacks??1);

function observe(s,v){
  const o=new Array(obsSize(v)).fill(0),me=hero(s,'me'),foe=hero(s,'opp'),th=s.them;
  let k=0;
  for(const x of [t(hpOf(me)),t(hpOf(foe)),t(s.mana),t(s.crystals),t(th.crystals),t(s.hand.length),t(th.hand.length),
    t(s.deck.length),t(th.deck.length),t(s.fatigue),t(th.fatigue),t(s.discardCount),t(th.discardCount),
    t(s.weapon?.atk),t(s.weapon?.durability),t(th.weapon?.atk),t(th.weapon?.durability),t(me.atk),+!!ready(me),
    +(!!s.power&&!s.power.used&&s.power.cost<=s.mana),s.seat,t(s.turn),+!s.choice,+(s.choice?.kind==='discover'),
    +(s.choice?.kind==='site'),t(s.sites.length),t(s.sites.filter(x=>x.ready).length),t(th.locations),
    t(s.hand.filter(c=>c.temp).length),t(s.hand.filter(c=>c.cost<=s.mana).length)])o[k++]=x;
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
  return o;
}

// Whatever a step names: a body on the table, a card in hand, a location, or a card still in the deck.
function thing(s,id){
  const b=[...s.me,...s.opp].find(x=>x.id===id);
  if(b)return {name:b.name,cost:0,atk:b.atk,hp:hpOf(b),hero:b.type==='HERO',mine:b.side==='me',taunt:b.taunt,card:false};
  const c=s.hand.find(x=>x.id===id);
  if(c)return {name:c.name,cost:c.cost,atk:c.atk,hp:c.hp,card:true,mine:true};
  const x=s.sites.find(x=>x.id===id);
  if(x)return {name:x.name,cost:0,atk:0,hp:x.durability,card:false,mine:true};
  const d=s.deck.find(x=>x.entityId===id);
  return d?{name:d.name,cost:d.COST??0,atk:d.ATK??0,hp:d.HEALTH??0,card:true,mine:true}:null;
}
function act(s,m,v){
  const a=new Array(actSize(v)).fill(0),V=v.size;
  let k=KINDS.length;
  a[KINDS.indexOf(m.kind)]=1;
  const from=m.kind==='power'||m.kind==='end'?null:thing(s,m.id);
  if(from){a[k+slot(v,from.name)]=1;a[k+V]=t(from.cost);a[k+V+1]=t(from.atk);a[k+V+2]=t(from.hp)}
  k+=V+3;
  const to=m.targetId!=null?thing(s,m.targetId):null;
  if(to){
    a.splice(k,TARGET,1,+!!to.hero,+!!to.mine,+!!to.card,t(to.atk),t(to.hp),+!!to.taunt);
    a[k+TARGET+slot(v,to.name)]=1;
  }
  return a;
}

export const encode=(s,legal,v)=>({obs:observe(s,v),acts:legal.map(m=>act(s,m,v))});
