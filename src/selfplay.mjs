// Whole games inside the simulator: no client, no log, no Gateway. Two lists, one seed, and
// src/sim.mjs with s.game set plays every step to a result. This is the ground the learned policy
// (the user's ruling, 2026-10-12) will train on; the policy here is only a random one, enough to
// show that a game runs from the first draw to a dead hero and that the same seed replays it.
//
//   node src/selfplay.mjs [games=200] [seed=1] [deckA=warlock-discard] [deckB=deckA]
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {body,handCard,hero,moves,apply,flip,roll,drawCards,beginTurn} from './sim.mjs';
import {heroAttackGain,textOf} from './mechanics.mjs';

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
let db;
export const cardDb=()=>db??=Object.fromEntries(read('../data/cards.enUS.json').map(c=>[c.id,c]));
export const loadList=name=>read(`../decks/${name}/list.json`);

// A card of the database in the shape Power.log gives one, so the simulator reads both alike.
const TAGS=['TAUNT','RUSH','CHARGE','DIVINE_SHIELD','STEALTH','POISONOUS','LIFESTEAL','WINDFURY'];
export const rawCard=(c,entityId)=>({entityId,cardId:c.id,CARDTYPE:c.type,name:c.name,text:c.text??'',COST:c.cost??0,
  ...(c.attack!=null?{ATK:c.attack}:{}),...(c.health||c.durability?{HEALTH:c.health||c.durability}:{}),
  ...Object.fromEntries((c.mechanics??[]).filter(m=>TAGS.includes(m)).map(m=>[m,1]))});

function context(cards){
  const minions={};
  for(const c of Object.values(cards))if(c.collectible&&c.type==='MINION')(minions[c.cost]??=[]).push(rawCard(c,0));
  return {minions,extra:{'Shred of Time':rawCard(cards.TIME_025t,0)}};
}
const contexts=new WeakMap();

function seat(k,list,cards,s){
  const ids=Object.entries(list.cards).flatMap(([id,n])=>Array(n).fill(id));
  for(const id of [list.hero,list.power,...ids])if(!cards[id])throw Error(`unknown card ${id}`);
  const deck=ids.map((id,i)=>rawCard(cards[id],(k+1)*100+i));
  for(let i=deck.length-1;i>0;i--){const j=roll(s,i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}
  const p=rawCard(cards[list.power],(k+1)*100+99),t=textOf(p);
  return {seat:k,hand:[],deck,weapon:null,locations:0,sites:[],mana:0,crystals:0,fatigue:0,discardCount:0,
    power:{id:p.entityId,name:p.name,cost:p.COST,gain:heroAttackGain(p),draw:/\bdraw a card\b/i.test(t)?1:0,
      selfHit:Number(/take \$?(\d+)\s*damage/i.exec(t)?.[1]??0),used:false}};
}
const heroBody=(c,k,side)=>({...body(rawCard(c,k+1),side),canAttack:false,rushOnly:false,targets:new Set(),maxAttacks:1});

// Seat 0 goes first with three cards; seat 1 gets four and The Coin. No mulligan yet.
export function newGame({lists,seed=1,cards=cardDb()}){
  if(!contexts.has(cards))contexts.set(cards,context(cards));
  let s={game:contexts.get(cards),seed:seed|0,turn:1,full:true,additive:true,objective:null,drawState:{me:{}},
    tauntAtStart:false,faceDealt:0,nextToken:0,choice:null};
  const [a,b]=lists.map((list,k)=>seat(k,list,cards,s));
  s={...s,...a,them:b,me:[heroBody(cards[lists[0].hero],0,'me')],opp:[heroBody(cards[lists[1].hero],1,'opp')]};
  drawCards(s,3);
  s=flip(s);
  drawCards(s,4);
  s.hand.push(handCard(rawCard(cards.GAME_005,-(++s.nextToken)),true));
  s=flip(s);
  beginTurn(s);
  return s;
}

// The seat that won, 'draw' when both heroes are dead, null while the game goes on.
export function winner(s){
  const mine=hero(s,'me').hp<=0,theirs=hero(s,'opp').hp<=0;
  return mine&&theirs?'draw':mine?s.them.seat:theirs?s.seat:null;
}

// pick(s,legal) -> one of legal, asked of whichever seat is to act (s.seat).
export function playout(s,pick,{maxSteps=5000}={}){
  let steps=0;
  for(;steps<maxSteps;steps++){
    const legal=moves(s);
    if(!legal.length)break;
    s=apply(s,pick(s,legal)).s;
  }
  return {s,steps,winner:winner(s)};
}

// Its own stream, so the policy's dice never move the game's.
export function randomPolicy(seed=1){
  const dice={seed:seed|0};
  return (s,legal)=>{
    const acts=legal.filter(m=>m.kind!=='end');
    return acts.length&&(acts.length===legal.length||roll(dice,10)<9)?acts[roll(dice,acts.length)]:legal[legal.length-1];
  };
}

// A scripted player for the learned policy to be measured against once the random one is no test:
// spend the mana on the dearest card, use a location, hit the face with everything, tap last, and
// never aim anything at its own side while there is another step.
export function rushPolicy(seed=1){
  const dice={seed:seed|0},RANK={choose:0,play:1,use:2,attack:3,power:4};
  return (s,legal)=>{
    const own=new Set(s.me.map(b=>b.id)),face=hero(s,'opp').id;
    const acts=legal.filter(m=>m.kind!=='end'&&!own.has(m.targetId));
    if(!acts.length)return legal.find(m=>m.kind==='end')??legal[roll(dice,legal.length)];
    const cost=m=>m.kind==='play'?s.hand.find(c=>c.id===m.id)?.cost??0:0;
    const key=m=>[RANK[m.kind]??5,-cost(m),m.targetId===face?0:1];
    let best=[];
    for(const m of acts){
      const k=key(m),d=best.length?k.findIndex((x,i)=>x!==best[0].k[i]):-1;
      if(!best.length||(d>=0&&k[d]<best[0].k[d]))best=[{m,k}];
      else if(d<0)best.push({m,k});
    }
    return best[roll(dice,best.length)].m;
  };
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [games=200,seed=1,nameA='warlock-discard',nameB=nameA]=process.argv.slice(2);
  const lists=[loadList(nameA),loadList(nameB)],tally={0:0,1:0,draw:0,unfinished:0};
  let turns=0,steps=0;const t0=Date.now();
  for(let g=0;g<Number(games);g++){
    const r=playout(newGame({lists,seed:Number(seed)+g}),randomPolicy(Number(seed)+g));
    tally[r.winner??'unfinished']++;turns+=r.s.turn;steps+=r.steps;
  }
  const n=Number(games),ms=Date.now()-t0;
  console.log(`${nameA} vs ${nameB}, ${n} games from seed ${seed}, random legal moves`);
  console.log(`first seat ${tally[0]}  second seat ${tally[1]}  draw ${tally.draw}  unfinished ${tally.unfinished}`);
  console.log(`${(turns/n).toFixed(1)} turns and ${(steps/n).toFixed(0)} steps a game; ${(ms/n).toFixed(1)} ms a game, ${Math.round(steps/ms*1000)} steps/s`);
}
