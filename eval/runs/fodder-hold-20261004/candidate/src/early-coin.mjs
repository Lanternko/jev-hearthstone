import {isCoin} from './power.mjs';
import {deckFor} from './deck.mjs';

const cost=c=>Number(c?.COST??c?.baseCost??0);
const text=c=>(c?.text??'').replace(/<[^>]+>|\[x\]/g,'').replace(/\s+/g,' ').trim();
const payoff=c=>c?.CARDTYPE==='MINION'&&Number(c.ATK??c.baseAttack??0)>0
 &&/^\s*(?:Taunt\s*)?If you discard this minion, summon it\.?$/i.test(text(c));
const egg=c=>c?.name==='Boneweb Egg'&&Number(c.ATK??c.baseAttack??0)===0;

// Game 120 T2: known two-body development plus an existing T3 play beats a bare
// Egg. This is a narrow visible-hand ruling, not a general rule to spend Coin.
// Execute one legal step then observe again; never queue a future discard choice.
export function earlyCoinDevelopment(state,actions){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current
   ||deckFor(state).name!=='warlock-discard'||Number(state.me.maxMana)!==2
   ||[...(state.me.board??[]),...(state.opponent?.board??[])].some(c=>['MINION','LOCATION'].includes(c.CARDTYPE)))return null;
 const hand=state.me.hand??[],mana=Number(state.me.mana);
 if(mana!==2&&mana!==3)return null;
 const outlet=hand.find(c=>c.name==='Ocular Occultist'&&c.CARDTYPE==='MINION'&&cost(c)===3
   &&/^Taunt Battlecry: Choose a card in your hand to discard\.?$/i.test(text(c)));
 if(!outlet||!hand.some(egg))return null;
 // An affordable active play/information source is another real line to compare.
 if(hand.some(c=>!isCoin(c)&&!egg(c)&&cost(c)<=2))return null;
 const targets=hand.filter(payoff).filter(c=>c!==outlet)
   .sort((a,b)=>Number(b.name==='Walking Dead')-Number(a.name==='Walking Dead'));
 const nextMana=Number(state.me.maxMana)+1;
 const target=targets.find(c=>hand.some(next=>next!==c&&next!==outlet
   &&next.CARDTYPE==='MINION'&&cost(next)===nextMana&&Number(next.ATK??next.baseAttack??0)>0));
 if(!target)return null;
 if(mana===2){
  const action=actions.find(a=>hand.some(c=>c.entityId===a.entityId&&isCoin(c)));
  return action?{action,source:'early_coin_development'}:null;
 }
 // Prefer a proven body target when the engine exposes direct Battlecry targets.
 // Some engines expose the target only in the subsequent choice observation.
 const action=actions.find(a=>a.entityId===outlet.entityId&&a.targetId===target.entityId)
   ??actions.find(a=>a.entityId===outlet.entityId&&a.targetId==null);
 return action?{action,source:'early_coin_development'}:null;
}
