// The cards the live view cannot see on the other side, dealt for a look ahead. shadowView() gives the
// opponent's hand and deck as blank objects (the encoder reads only how many); a simulation that steals from the hand
// (Sentenced for Smuggling) or plays the opponent's next turn needs cards. Each sample of the search is dealt its
// own cards from the cards seen in games against that class (data/opponent-prior.json), never one fixed guess.
//
// The prior lists, per recorded game, the cards the opponent was seen to play. Cards of a class weigh most; the
// rows that share cards with what this opponent has already played weigh more (the same deck, if any); cards
// seen played in this game are left out (a played card is not the one still in the hand). With too few cards
// to draw from, generic cards stand in: a vanilla minion or a spell that does nothing.
import {readFileSync} from 'node:fs';
import {cardDb,rawCard} from './selfplay.mjs';
import {handCard} from './sim.mjs';
import {discardGrowth} from './discard-model.mjs';
import {redeal} from './selfplay-search.mjs';

let loaded;
export const loadPrior=()=>loaded??=JSON.parse(readFileSync(new URL('../data/opponent-prior.json',import.meta.url),'utf8'));

const norm=s=>String(s??'').replace(/[^a-z]/gi,'').toUpperCase();
const MIN_POOL=8;
const HAND_ID=700000,DECK_ID=710000;

function rng(seed){
  let a=(seed|0)^0x9e3779b9;
  return ()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
}

// [{id, w}] the opponent of `heroClass` may hold, cards in `played` left out. Empty when the prior has too few.
export function cardPool({heroClass,played=[],prior=loadPrior(),cards=cardDb()}){
  const cls=norm(heroClass),gone=new Set(played),seen=new Set(played);
  const rows=prior.rows,mine=rows.filter(r=>norm(r.heroClass)===cls);
  const eligible=id=>{
    const c=cards[id];
    if(!c||!c.collectible||!['MINION','SPELL','WEAPON','LOCATION'].includes(c.type))return false;
    const classes=c.classes?.length?c.classes:[c.cardClass];
    return classes.includes('NEUTRAL')||classes.some(x=>norm(x)===cls);
  };
  const weight=new Map();
  const add=(r,w)=>{
    const share=r.cards.filter(id=>seen.has(id)).length;
    for(const id of new Set(r.cards))if(!gone.has(id)&&eligible(id))weight.set(id,(weight.get(id)??0)+w*(1+share));
  };
  for(const r of mine)add(r,3);
  for(const r of rows)if(!mine.includes(r))add(r,.5);
  // A class with no recorded game borrows only what any class may hold.
  return weight.size<MIN_POOL?[]:[...weight].map(([id,w])=>({id,w}));
}

// A card that does nothing, of the cost the opponent could be playing.
function generic(r,crystals,entityId){
  const cost=1+Math.floor(r()*Math.min(7,Math.max(1,crystals+1)));
  if(r()<.25)return {entityId,cardId:'GENERIC_SPELL',CARDTYPE:'SPELL',name:'Generic spell',text:'',COST:cost};
  return {entityId,cardId:'GENERIC_MINION',CARDTYPE:'MINION',name:'Generic minion',text:'',COST:cost,ATK:cost,HEALTH:cost+1};
}

// One card from the pool as the simulator takes it. A weapon or a location is something the simulator does not play
// from the other side's hand; it becomes a spell of its cost that does nothing.
function pooled(c,entityId){
  if(c.type==='MINION'||c.type==='SPELL')return rawCard(c,entityId);
  return {entityId,cardId:'GENERIC_SPELL',CARDTYPE:'SPELL',name:'Generic spell',text:'',COST:c.cost??0};
}

// `n` cards for entity ids from `base`, at most two of a card (one of a legendary). Deterministic in `seed`.
export function dealCards({pool,n,seed,base,crystals=10,cards=cardDb()}){
  const r=rng(seed),out=[],held=new Map();
  let total=pool.reduce((a,x)=>a+x.w,0);
  const live=[...pool];
  for(let i=0;i<n;i++){
    if(!live.length){out.push(generic(r,crystals,base+i));continue}
    let x=r()*total,k=0;
    while(k<live.length-1&&x>=live[k].w){x-=live[k].w;k++}
    const {id}=live[k],c=cards[id],got=(held.get(id)??0)+1;
    held.set(id,got);
    if(got>=(c.rarity==='LEGENDARY'?1:2)){total-=live[k].w;live.splice(k,1)}
    out.push(pooled(c,base+i));
  }
  return out;
}

const blank=c=>!c||c.name==null;

// The `deal` of selfplay-search.mjs for this live position: the search's own redeal (our deck, the order of
// everything) with the blank cards of the opponent's hand and deck replaced by a fresh draw from the pool.
export function opponentDealer(state,{prior=loadPrior(),cards=cardDb(),pool}={}){
  const played=(state?.opponent?.publicPlays??[]).filter(c=>c.public===true&&c.cardId).map(c=>c.cardId);
  pool??=cardPool({heroClass:state?.opponent?.heroClass,played,prior,cards});
  return (s,seed)=>{
    const th=s.them,crystals=th.crystals??10;
    const nHand=th.hand.filter(blank).length,nDeck=th.deck.filter(blank).length;
    const grow=c=>{
      const g=discardGrowth(c)*(th.discardCount??0);
      if(g){c.atk+=g;c.hp+=g;c.raw={...c.raw,ATK:c.atk,HEALTH:c.hp}}
      return c;
    };
    const hand=dealCards({pool,n:nHand,seed:seed*2+1,base:HAND_ID,crystals,cards}).map(raw=>grow(handCard(raw,true)));
    const deck=dealCards({pool,n:nDeck,seed:seed*2+2,base:DECK_ID,crystals,cards});
    // The cards we do hold knowledge of (a made card, the Coin) stay where they are, in the place of the blanks that follow.
    const them={...th,hand:[...th.hand.filter(c=>!blank(c)),...hand],deck:[...th.deck.filter(c=>!blank(c)),...deck]};
    // redeal() would rebuild a hand card from the card database by its id; the generic ones are not in it. So it
    // shuffles our side only, and the cards of theirs are put in after.
    const base=redeal({...s,them:{...them,hand:[],deck:[]}},seed,cards);
    return {...base,them};
  };
}
