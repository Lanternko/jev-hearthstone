import {roles} from './describe.mjs';
import {lethalStrike,enemyHero,heroHp,faceDamage} from './lethal.mjs';
import {isCoin} from './power.mjs';

// Explicit user correction: early tempo takes precedence over speculative combos.
// Second correction (2026-09-24, "為什麼留靈魂之火？"): with Disposable Acolytes in hand the old
// rule let everything stay, and Jev kept Soulfire, Whispers and Continuity -- a burn spell that
// throws away a random card and two buffs with no board to buff. strategy.md's mulligan is a
// whitelist, so it is enforced as one: a cheap minion, a cheap spell that makes bodies, discard
// fodder and a location stay; everything else goes back. Jev may still throw back more.
export function keepInOpening(c){
 const t=flat(c?.text),cost=costOf(c);
 if(c?.CARDTYPE==='MINION')return cost<=2;
 if(c?.CARDTYPE==='LOCATION')return true;
 if(PAYS_ON_DISCARD.test(t))return true;
 return c?.CARDTYPE==='SPELL'&&cost<=2&&/\bsummon\b/i.test(t)&&!/\bdeal\b/i.test(t);
}
function mulliganConstraint(state,actions){
 const toss=(state.choice.entities??[]).filter(c=>!isCoin(c)&&!keepInOpening(c)).map(c=>c.entityId);
 const out=actions.filter(a=>toss.every(id=>a.replace?.includes(id)));
 return out.length?out:actions;
}

// Explicit user correction (2026-09-24): Soulfire went to the enemy hero on turn 2. Four face
// damage is worth nothing until it ends the game, while the same card kills a minion -- and it
// also discards a random card. A damage spell from hand may target the enemy hero only when it
// finishes them together with the swings already on the board.
const BURN=/\bdeal \$?(\d+) damage\b/i;
// Our hero attacking a minion takes its Attack back; never when that is all our Health.
function suicide(state){
 const me=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
 const hp=myHeroHp(state);
 const foe=new Map((state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION').map(c=>[c.entityId,c.ATK??0]));
 return a=>!!me&&a.entityId===me.entityId&&foe.has(a.targetId)&&foe.get(a.targetId)>=hp;
}
function wastedBurn(state,actions){
 const hero=enemyHero(state);
 if(!hero)return ()=>false;
 const hand=state.me?.hand??[];
 const room=faceDamage(state,actions);
 return a=>{
  if(a.targetId!==hero.entityId)return false;
  const card=hand.find(c=>c.entityId===a.entityId);
  const m=card?.CARDTYPE==='SPELL'&&BURN.exec(flat(card.text));
  return !!m&&heroHp(hero)-Number(m[1])>room;
 };
}

// Explicit user correction: a board-wide +1/+1 with an empty board buffs nothing.
// Wicked Whispers and Grim Rally also discard or destroy, and that half is often the
// reason to play them, so they survive this test. Whispers is then judged again further down,
// where the board and the hand say whether either half of it does anything.
const BUFFS_WHOLE_BOARD=/give your (?:other )?minions \+\d+\/\+\d+/i;
const flat=t=>(t??'').replace(/\[x\]/g,' ').replace(/<[^>]+>/g,'').replace(/\s+/g,' ');
export const pureBoardBuff=card=>{
 const t=flat(card?.text);
 return BUFFS_WHOLE_BOARD.test(t)&&!/discard|destroy/i.test(t);
};
export const myMinions=state=>(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION').length;

// Explicit user correction, second live game: the hero power was tapped for a card on a turn
// the opponent already had lethal on board. Life Tap's two health is not a cost to weigh
// there, it is simply off the table -- and the same holds for any hero power whose own text
// says it damages us. Board damage is arithmetic over a fully observed state, so like lethal
// it is taken away from Jev rather than explained to it.
const SELF_DAMAGE=/take \$?(\d+) damage/i;
export const selfDamageCost=card=>{const m=SELF_DAMAGE.exec(flat(card?.text));return m?Number(m[1]):0};
export const myHeroHp=state=>{const h=(state?.me?.board??[]).find(c=>c.CARDTYPE==='HERO');return h?(h.HEALTH??0)-(h.DAMAGE??0)+(h.ARMOR??0):0};
// Everything they control can swing next turn, summoning sickness included, so nothing is
// discounted. Their weapon rides on the hero's own attack value.
// A body that cannot swing next turn is not incoming damage. Dormant is the one that cost a
// real game: the opponent sat on two dormant Dreadseeds worth 9 attack, the sum read 26 against
// 19 health, the hero power was banned as suicide -- and the only thing that could actually
// attack was a single 17-attack minion. No lethal, and we skipped a free card and 2 damage.
// Frozen is the same argument: it misses the attack that matters.
const on=(c,tag)=>c?.[tag]===1||c?.[tag]==='1';
export const incomingDamage=state=>(state?.opponent?.board??[])
 .filter(c=>['MINION','HERO'].includes(c.CARDTYPE)&&!on(c,'DORMANT')&&!on(c,'FROZEN'))
 .reduce((n,c)=>n+(c.ATK??c.baseAttack??0),0);
// User correction: a Taunt is a wall, not decoration. Their swings have to chew through our
// Taunts before a single point reaches the hero, so that health is part of what they must get
// past. Ignoring it forbade the hero power on turns that were never actually lethal.
export const taunted=state=>(state?.me?.board??[])
 .filter(c=>c.CARDTYPE==='MINION'&&(c.TAUNT===1||c.TAUNT==='1')&&!c.DORMANT)
 .reduce((n,c)=>n+Math.max(0,(c.HEALTH??c.baseHealth??0)-(c.DAMAGE??0)),0);
export function forbidsSelfDamage(state){
 const hp=myHeroHp(state);
 return hp>0&&incomingDamage(state)>=hp+taunted(state);
}

// User ruling: the Coin is a hard constraint, not a preference. After spending it there has to
// be something to spend the crystal on -- a card in hand that can then be cast, or a hero power
// that can be used. Coining into a turn with nothing castable throws the card away for nothing,
// and that much is arithmetic.
//
// It does not forbid the weaker error (the Coin brings you to 3 while the hand tops out at 2),
// because 2 + 1 can still be the right use of three crystals; describe.mjs states whether the
// crystal unlocks anything and leaves that call to Jev.
//
// Playing the Coin to clear it out of the way of a discard outlet still passes: the outlet is
// the thing that gets cast afterwards, so something castable exists by definition.
export const spendableAt=(state,mana)=>{
  const hand=(state?.me?.hand??[]).filter(c=>!isCoin(c));
  const hp=(state?.me?.board??[]).find(c=>c.CARDTYPE==='HERO_POWER');
  const hpReady=hp&&!(hp.EXHAUSTED===1||hp.EXHAUSTED==='1')&&(hp.COST??hp.baseCost??2)<=mana;
  return hand.some(c=>(c.COST??c.baseCost??0)<=mana)||!!hpReady;
};
export const deadCoin=state=>!spendableAt(state,(state?.me?.mana??0)+1);

// User ruling, after the third game in a row that hard-cast a card which pays out when it is
// discarded while a discard outlet sat in hand. describe.mjs already tells Jev which outlets it
// holds and that they cost no mana; three games say prose is not moving it, so the option goes.
//
// Not every outlet counts. The user drew the line at the ones that can be relied on to hit the
// card you mean, and only those:
//   * free choice -- "Choose a card in your hand to discard" always hits it;
//   * look at N and choose -- "Look at 3 cards in your hand and choose one to discard" hits it
//     only when at most N-1 cards in hand are not fodder, so one of the N shown must be fodder;
//   * highest cost -- "After your hero attacks, discard your highest Cost card" hits it only
//     when nothing in hand costing as much or more is anything but fodder.
// "Discard your lowest Cost card" is deliberately left out: the rule did not name it.
//
// Read from card text, not a name list, for the same reason roles() is: Discover and Cursed
// Catacombs pull from the whole collection, so a list goes blind where it matters most.
const CHOOSES_DISCARD=/\bchoose\b[^.]*\bto discard\b/i;
const LOOKS_AT=/look at (\d+) cards? in your hand/i;
const DISCARDS_HIGHEST=/discard your highest[- ]?cost card/i;
const DISCARDS_LOWEST=/discard your lowest[- ]?cost card/i;
const costOf=c=>Number(c?.COST??c?.baseCost??0);
const isFodder=c=>roles(c).includes('discard fodder');

// The outlet that would reliably discard this exact card, or null. An equipped weapon counts:
// its discard text is already on the board waiting for a swing.
export function reliableOutletFor(state,fodder){
 const hand=(state?.me?.hand??[]).filter(c=>c.entityId!==fodder?.entityId);
 const weapons=(state?.me?.board??[]).filter(c=>c.CARDTYPE==='WEAPON');
 for(const o of [...hand,...weapons]){
  if(!roles(o).includes('discard outlet'))continue;
  const t=flat(o.text);
  if(CHOOSES_DISCARD.test(t)){
   const n=LOOKS_AT.exec(t);
   if(!n)return o;                                  // free run of the hand
   // The outlet itself leaves hand when it is played, so it is not one of the cards looked at.
   const rest=hand.filter(c=>c.entityId!==o.entityId);
   if(rest.filter(c=>!isFodder(c)).length<=Number(n[1])-1)return o;
  }
  if(DISCARDS_LOWEST.test(t)){
   // Wicked Whispers takes the cheapest card in hand, so it reaches the fodder only when the
   // fodder is that card. Same tie rule as the weapon, upside down.
   const rest=hand.filter(c=>c.entityId!==o.entityId);
   if(rest.every(c=>costOf(c)>costOf(fodder)||(costOf(c)===costOf(fodder)&&isFodder(c))))return o;
  }
  if(DISCARDS_HIGHEST.test(t)){
   // Nothing in hand may cost more, or the swing takes that card instead. A tie with another
   // fodder card is still fine -- either way the discard pays out; a tie with anything else is
   // a coin flip, which is not "reliably".
   const rest=hand.filter(c=>c.entityId!==o.entityId);
   if(rest.every(c=>costOf(c)<costOf(fodder)||(costOf(c)===costOf(fodder)&&isFodder(c))))return o;
  }
 }
 return null;
}

// Cards in hand that must not be hard-cast this turn, because an outlet in hand or on the board
// would discard that exact card for free.
export const wastedFodder=state=>new Set(
 (state?.me?.hand??[]).filter(c=>isFodder(c)&&reliableOutletFor(state,c)).map(c=>c.entityId));


// User ruling on Wicked Whispers ("Discard your lowest Cost card. Give your minions +1/+1.").
// Its two halves can each be worth nothing, and the state says which:
//   * empty board and the cheapest card in hand is a real card -- the buff hits nobody and the
//     discard is a straight loss, so the option goes;
//   * three or more bodies already out -- the buff is worth more than whatever it eats, so the
//     error is ending the turn with it still in hand, and END_TURN goes instead.
// The named cards ("侍僧、蜘蛛卵、334、325") need no list: Disposable Acolytes, Boneweb Egg,
// Silverware Golem and Walking Dead all say so on their face, and roles() already reads it.
// pureBoardBuff deliberately leaves Whispers alone because the discard half is often the reason
// to cast it; this is that same question asked again with the board actually in front of us.
const givesBoardBuff=c=>BUFFS_WHOLE_BOARD.test(flat(c?.text));
const isWhispers=c=>DISCARDS_LOWEST.test(flat(c?.text))&&givesBoardBuff(c);
// The cards it would actually eat: the cheapest in hand once it has left. A tie is a coin flip,
// so it only counts as a certain loss when every tied card is a certain loss.
const wouldDiscard=(state,src)=>{
 const rest=(state?.me?.hand??[]).filter(c=>c.entityId!==src?.entityId);
 if(!rest.length)return [];
 const low=Math.min(...rest.map(costOf));
 return rest.filter(c=>costOf(c)===low);
};
export const deadWhispers=(state,card)=>{
 if(!isWhispers(card)||myMinions(state)>0)return false;
 const eats=wouldDiscard(state,card);
 return eats.every(c=>!isFodder(c));        // an empty hand eats nothing, and buffs nobody
};
export const whispersWorthCasting=(state,card)=>
 isWhispers(card)&&myMinions(state)>=3&&costOf(card)<=Number(state?.me?.mana??0);

// Explicit user correction (2026-09-24): Cursed Catacombs at 0 mana offered Wicked Whispers and
// Disposable Acolytes, and Jev took the 1-mana buff. The pick is Temporary -- discarded at end of
// turn -- so a card that cannot be cast this turn is worth only its discard trigger, and one with
// no trigger is worth nothing. While some pick does pay out from the discard, the rest are cut.
const PAYS_ON_DISCARD=/if you discard this|when you (?:play or )?discard this/i;
function temporaryPick(state,actions){
 if(!/\btemporary\b/i.test(flat(state.choice?.source?.text)))return actions;
 const mana=Number(state.me?.mana??0);
 const card=a=>(state.choice.entities??[]).find(c=>c.entityId===a.entityId);
 if(actions.some(a=>a.type==='CHOICE'&&costOf(card(a))<=mana))return actions;
 const paying=actions.filter(a=>a.type==='CHOICE'&&PAYS_ON_DISCARD.test(flat(card(a)?.text)));
 return paying.length?paying:actions;
}

export function constrainActions(state,actions){
 if(state.choice?.type==='MULLIGAN')return mulliganConstraint(state,actions);
 if(state.choice)return temporaryPick(state,actions);
 let out=actions;
 if(deadCoin(state)){
  const hand=state.me?.hand??[];
  out=out.filter(a=>!hand.some(c=>c.entityId===a.entityId&&isCoin(c)));
  if(!out.length)out=actions;
 }
 if(forbidsSelfDamage(state)){
  const board=state.me.board??[];
  out=out.filter(a=>{
   const e=board.find(c=>c.entityId===a.entityId);
   return !(e?.CARDTYPE==='HERO_POWER'&&selfDamageCost(e)>0);
  });
  if(!out.length)out=actions;
 }
 const dies=suicide(state);
 out=out.filter(a=>!dies(a));
 if(!out.length)out=actions;
 const burn=wastedBurn(state,actions);
 out=out.filter(a=>!burn(a));
 if(!out.length)out=actions;
 const wasted=wastedFodder(state);
 if(wasted.size){
  out=out.filter(a=>!wasted.has(a.entityId));
  if(!out.length)out=actions;
 }
 const held=id=>(state.me?.hand??[]).find(c=>c.entityId===id);
 out=out.filter(a=>!deadWhispers(state,held(a.entityId)));
 if(!out.length)out=actions;
 // Only while the buff is still on the table to be played: if the option went for some other
 // reason there is nothing to stay for.
 if(out.some(a=>whispersWorthCasting(state,held(a.entityId)))){
  const trimmed=out.filter(a=>a.type!=='END_TURN');
  if(trimmed.length)out=trimmed;
 }
 if(myMinions(state)>0)return out;
 const hand=state.me.hand??[];
 return out.filter(a=>!pureBoardBuff(hand.find(c=>c.entityId===a.entityId)));
}

// User ruling (2026-09-24, after game 3): "先 buff 再攻擊" and "打滿水晶，不是用天生技不打牌".
// The log showed both errors are menu shape, not judgement:
//   * Bananas on a full board was sixteen options (two copies x eight targets), each 1-13%, so
//     END_TURN won at 0.24-0.27 with six crystals and castable cards unspent -- the 1/n effect
//     STATUS.md measured for END_TURN, working the other way round.
//   * The planner only shortlists attack sequences, so a PLAN was the first pick on most turns
//     and the buffs in hand came after the swings, or never.
// Both are fixed as order: while a card we should spend is castable, attacks and END_TURN are
// not on the menu. Once the hand has nothing left to spend they come back as before.
//
// Not every castable card must be spent. Left to Jev:
//   * the Coin -- tempo, not mana (deadCoin already drops the useless one);
//   * discard outlets -- Soulfire and Whispers throw a card away, and whether that is worth it
//     is the call strategy.md gives Jev; a reliable outlet already blocks hard-casting its fodder.
// The hero power counts as spend only while it cannot walk us into their board, and it waits
// while its 2 mana would price out a card we must spend.
// A kill on the board is settled before this runs (bridge.mjs), so it never hides a lethal swing.
const heroPowerOf=state=>(state?.me?.board??[]).find(c=>c.CARDTYPE==='HERO_POWER');
// A target in our own hand is a battlecry picking a card (Ocular Occultist), never a swing --
// the log can list the minion on the board while its battlecry is still being chosen.
const isAttackAction=(state,a)=>a?.targetId!=null
 &&!(state?.me?.hand??[]).some(c=>c.entityId===a.targetId)
 &&(state?.me?.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE));
export function mustSpend(state,actions){
 const hand=state?.me?.hand??[];
 const hp=heroPowerOf(state);
 const mana=Number(state?.me?.mana??0);
 const cards=actions.filter(a=>{
  const c=hand.find(x=>x.entityId===a.entityId);
  return c&&!isCoin(c)&&!roles(c).includes('discard outlet');
 });
 const hpCost=Number(hp?.COST??hp?.baseCost??2);
 const pricedOut=!!hp&&cards.some(a=>costOf(hand.find(x=>x.entityId===a.entityId))>mana-hpCost);
 const safeTap=!!hp&&myHeroHp(state)-selfDamageCost(hp)>incomingDamage(state);
 const power=actions.filter(a=>hp&&a.entityId===hp.entityId&&!pricedOut&&safeTap);
 return {cards,power,pricedOut};
}
export function spendFirst(state,actions){
 if(state?.choice)return actions;
 const {cards,power,pricedOut}=mustSpend(state,actions);
 const hp=heroPowerOf(state);
 let out=actions;
 if(pricedOut)out=out.filter(a=>a.entityId!==hp.entityId);
 if(cards.length||power.length)out=out.filter(a=>a.type!=='END_TURN'&&!isAttackAction(state,a));
 return out.length?out:actions;
}

export function forcedAction(state,actions){
 if(actions.length===1)return {action:actions[0],source:'forced_legal_action'};
 // Lethal is settled before Jev is asked anything. Handed a board that already won -- the
 // option text even said "that is already lethal" on every line -- it answered END_TURN.
 // A win that is on the table is arithmetic, not judgement, so it is not put to a vote.
 const kill=lethalStrike(state,actions);
 if(kill)return kill;
 return null;
}
