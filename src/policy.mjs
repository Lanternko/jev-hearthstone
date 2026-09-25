import {isCurse,roles,mulliganWR,mulliganKept,bodies,summoned} from './describe.mjs';
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
// Third ruling (2026-09-25): the public opening-hand win rates (data/mulligan.json) replace the
// whitelist wherever a card has one. The whitelist threw back Cursed Catacombs (71.9%, kept by
// 95% of players) and Ocular Occultist (70.7%), and forced Hand of Gul'dan (62.5%) to stay as
// fodder. Now: >=70% always stays, <=62.5% always goes, and the middle band is Jev's call with
// the number in the option text. A card with no stat (none in this list today) falls back to
// the whitelist, which then only forces the toss.
// User ruling (2026-09-25, game 7): Jev kept Soul Barrage (65.2%, kept by only 18% of players).
// Not a new win-rate line -- "可能有少數場合可以留" -- but when both the win rate and the keep
// rate are low there is nothing to think about, so a middle-band card almost nobody keeps goes.
export const MULL_KEEP=70,MULL_TOSS=62.5,MULL_RARELY_KEPT=25;
export function mulliganVerdict(c){
 const wr=mulliganWR(c);
 if(wr==null)return keepInOpening(c)?'free':'toss';
 if(wr>=MULL_KEEP)return 'keep';
 if(wr<=MULL_TOSS)return 'toss';
 const kept=mulliganKept(c);
 return kept!=null&&kept<MULL_RARELY_KEPT?'toss':'free';
}
// Same ruling: "4 費牌要很後面才會用到，手上沒有低費牌時不可能留". A 4+ cost card may stay only
// beside a kept card of 2 or less.
const MULL_LATE=4,MULL_EARLY=2;
const keepsLateAlone=(cards,a)=>{
 const kept=cards.filter(c=>!a.replace?.includes(c.entityId));
 return kept.some(c=>costOf(c)>=MULL_LATE)&&!kept.some(c=>costOf(c)<=MULL_EARLY);
};
// User ruling (2026-09-25, after game 6): 「可以高機率留的組合是：低語+侍僧；魔眼+殭屍；派對+buff」.
// With both halves in the opening hand, both stay, over the win-rate bands (Continuity's 62.1
// would otherwise force the buff back beside Party Fiend). One buff is enough for Party Fiend.
// Soulfire stays a toss: 「靈魂之火還是換掉吧，畢竟是隨機棄牌」 -- its 61.7 already does that.
const named=n=>c=>c?.name===n;
const MULL_COMBOS=[
 [named('Wicked Whispers'),named('Disposable Acolytes')],
 [named('Ocular Occultist'),named('Walking Dead')],
 [named('Party Fiend'),c=>roles(c).includes('buff')],
];
export function mulliganCombos(cards){
 const keep=new Set();
 for(const [a,b] of MULL_COMBOS){
  const x=cards.find(c=>a(c)),y=cards.filter(c=>b(c)&&c!==x).sort((p,q)=>costOf(p)-costOf(q))[0];
  if(x&&y){keep.add(x.entityId);keep.add(y.entityId)}
 }
 return keep;
}
function mulliganConstraint(state,actions){
 const cards=(state.choice.entities??[]).filter(c=>!isCoin(c));
 const combo=mulliganCombos(cards);
 const toss=cards.filter(c=>mulliganVerdict(c)==='toss'&&!combo.has(c.entityId)).map(c=>c.entityId);
 const keep=cards.filter(c=>mulliganVerdict(c)==='keep'||combo.has(c.entityId)).map(c=>c.entityId);
 let out=actions.filter(a=>toss.every(id=>a.replace?.includes(id))&&!keep.some(id=>a.replace?.includes(id)));
 if(!out.length)out=actions;
 const early=out.filter(a=>!keepsLateAlone(cards,a));
 return early.length?early:out;
}

// Explicit user correction (2026-09-24): Soulfire went to the enemy hero on turn 2. Four face
// damage is worth nothing until it ends the game, while the same card kills a minion -- and it
// also discards a random card. A damage spell from hand may target the enemy hero only when it
// finishes them together with the swings already on the board.
// User ruling (2026-09-25, game 6): with that face option cut, turn-1 Soulfire went into our own
// hero, the only target left. On an empty enemy board casting it is a gamble on the discard and
// fine either way, but "要攻擊選擇對手的臉": a damage spell never aims at our own hero, and with
// no enemy minion to kill, the enemy face is the target.
const BURN=/\bdeal \$?(\d+) damage\b/i;
// User ruling (2026-09-25): damage spells never target our own hero.
// Our hero attacking a minion takes its Attack back; never when that is all our Health.
// 2026-09-26, game 10: at 7 Health the hero swung into a 5-Attack Gnome Muncher -- survivable
// on its own -- but Chronoclaws then discarded Hand of Gul'dan, its draw of three found one of the
// two Shreds of Time the opponent had shuffled into our deck, and the 3 damage killed us. So the
// swing also counts what the weapon's discard can draw, at its worst.
function suicide(state){
 const board=state.me?.board??[];
 const me=board.find(c=>c.CARDTYPE==='HERO');
 const hp=myHeroHp(state);
 const foe=new Map((state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION').map(c=>[c.entityId,c.ATK??0]));
 const after=afterSwingDraws(state);
 return a=>!!me&&a.entityId===me.entityId&&a.targetId!=null&&(foe.get(a.targetId)??0)+after>=hp;
}
// power.mjs lists what the known cards in our deck deal to us when drawn (Shred of Time: 3) as
// bare numbers, so no deck identity leaves the parser. Only the damage a draw cannot avoid
// counts: 「這邊我們本來就劣勢，所以要靠古爾丹被棄牌抽牌，想辦法拿公爵才能逆轉」 (game 10) -- a
// draw that only might hit a Shred is a gamble Jev may take when behind; it sees the hazards
// and the deck size in the state. Forced hits are the smallest ones.
export function worstDraw(state,n){
 const hits=[...(state?.me?.drawHazards??[])].sort((a,b)=>a-b);
 const deck=Number(state?.me?.deckCount);
 if(!Number.isFinite(deck))return 0;
 const forced=Math.max(0,Math.min(n,deck)-(deck-hits.length));
 return hits.slice(0,forced).reduce((s,x)=>s+x,0);
}
const DRAWS_ON_DISCARD=/\bdiscard this\b/i;
function afterSwingDraws(state){
 const weapon=(state.me?.board??[]).find(c=>c.CARDTYPE==='WEAPON');
 if(!weapon||!DISCARDS_HIGHEST.test(flat(weapon.text)))return 0;
 const hand=state.me?.hand??[];
 const top=Math.max(-Infinity,...hand.map(costOf));
 return Math.max(0,...hand.filter(c=>costOf(c)===top&&DRAWS_ON_DISCARD.test(flat(c.text))).map(c=>worstDraw(state,drawCount(c))));
}
// A draw that can kill us through a known Shred of Time waits, like a draw that overdraws.
function drawKills(state){
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const hp=myHeroHp(state);
 if(!board.some(c=>c.CARDTYPE==='HERO'))return ()=>false;
 return a=>{
  const c=hand.find(x=>x.entityId===a.entityId)??board.find(x=>x.entityId===a.entityId&&x.CARDTYPE==='HERO_POWER');
  const n=drawCount(c),dmg=n?selfDamageCost(c)+worstDraw(state,n):0;
  return dmg>0&&dmg>=hp;
 };
}
function wastedBurn(state,actions){
 const hero=enemyHero(state);
 const mine=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
 const hand=state.me?.hand??[];
 const room=faceDamage(state,actions);
 const minions=(state.opponent?.board??[]).some(c=>c.CARDTYPE==='MINION');
 return a=>{
  const card=hand.find(c=>c.entityId===a.entityId);
  const m=card?.CARDTYPE==='SPELL'&&BURN.exec(flat(card.text));
  if(!m)return false;
  if(mine&&a.targetId===mine.entityId)return true;
  if(!hero||a.targetId!==hero.entityId||!minions)return false;
  // User ruling (2026-09-25): 「滿手素材的時候，不失為一個增加場面的方式」. When the rest of the hand
  // is all discard fodder, a discarding burn to the face still builds a board; leave it to Jev.
  const rest=hand.filter(c=>c.entityId!==card.entityId);
  if(/\bdiscard\b/i.test(flat(card.text))&&rest.length&&rest.every(c=>isFodder(c)))return false;
  return heroHp(hero)-Number(m[1])>room;
 };
}

// User ruling (2026-09-25, game 8): turn 3, Coin + Soul Barrage into an empty board -- six to the
// face of a 30-hp hero. 「應該是打手下，而不是離斬殺很遠還用法術打臉」. A random-split spell with no
// enemy minion is pure face damage; outside burn range it waits for a board to clear.
function splitToFace(state){
 const hand=state.me?.hand??[];
 const minions=(state.opponent?.board??[]).some(c=>c.CARDTYPE==='MINION');
 const foe=enemyHero(state);
 const far=!!foe&&heroHp(foe)>BURN_RANGE;
 return a=>{
  if(minions||!far)return false;
  const card=hand.find(c=>c.entityId===a.entityId);
  return card?.CARDTYPE==='SPELL'&&SPLITS_DAMAGE.test(flat(card.text));
 };
}

// User ruling (2026-09-25, game 6): four minions down, Platysaur went out, then Party Fiend with
// two slots left -- one Felbeast lost -- and only then Boneweb Spider traded into the Runesaber
// and died. "既然選擇要解牌，那就先解牌空出位置". A card whose bodies do not all fit waits while
// any attack is still open; after the swings it comes back, with whatever room they freed.
function overflowWaits(state,actions){
 const board=state.me?.board??[];
 const attacking=actions.some(a=>a.targetId!=null&&board.some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE)));
 if(!attacking)return ()=>false;
 const room=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const hand=state.me?.hand??[];
 return a=>{
  const card=hand.find(c=>c.entityId===a.entityId);
  return !!card&&bodies(card)>1&&bodies(card)>room;
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
   // Cheaper bodies do not block it when the mana covers casting them and then the outlet:
   // whispersWaits plays them first, and by then the fodder is the cheapest (Party Fiend, then
   // Whispers eats Acolytes -- the 2026-09-25 line the user asked for).
   let rest=hand.filter(c=>c.entityId!==o.entityId);
   const ahead=rest.filter(c=>!isFodder(c)&&makesBodies(c)&&costOf(c)<costOf(fodder));
   const mana=Number(state?.me?.mana??0);
   if(ahead.length&&ahead.reduce((s,c)=>s+costOf(c),costOf(o))<=mana)rest=rest.filter(c=>!ahead.includes(c));
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
//
// User ruling (2026-09-25, game 4, turn 2): with 2 mana, Occultist (3) in hand and Acolytes,
// Acolytes and Boneweb Egg beside it, the block left Life Tap as the only play. An outlet that
// cannot be cast this turn protects nothing today, and while other fodder is left for it later,
// the body now is worth more than a spare discard target. So the card is freed when both hold:
// no outlet usable this turn, and the outlet still has other fodder to hit afterwards.
const outletUsable=(state,o)=>o.CARDTYPE==='WEAPON'||costOf(o)<=Number(state?.me?.mana??0);
const without=(state,c)=>({...state,me:{...state.me,hand:(state.me?.hand??[]).filter(x=>x.entityId!==c.entityId)}});
function protectedFodder(state,c){
 const o=reliableOutletFor(state,c);
 if(!o)return false;
 if(outletUsable(state,o))return true;
 const after=without(state,c);
 return !(after.me.hand).some(f=>f.entityId!==o.entityId&&isFodder(f)&&reliableOutletFor(after,f));
}
export const wastedFodder=state=>new Set(
 (state?.me?.hand??[]).filter(c=>isFodder(c)&&protectedFodder(state,c)).map(c=>c.entityId));

// User ruling (2026-09-25, game 4, turn 3): Occultist with nothing of ours on the board, and Jev
// discarded Hand of Gul'dan (draw 3) over Acolytes and Boneweb Egg. With no board, board beats
// hand: while some target summons something when discarded, targets that do not are cut.
// The user's own exception: with the kill close, drawing three for burn beats two 1-drops, so
// once their hero is in burn range (the 12 plan.mjs switches to racing at) the pick is Jev's again.
const bodiesOnDiscard=c=>isFodder(c)&&/\bsummon/i.test(flat(c?.text));
const BURN_RANGE=12;
export function boardFirstDiscard(state,actions){
 if(myMinions(state)>0)return actions;
 const foe=enemyHero(state);
 if(foe&&heroHp(foe)<=BURN_RANGE)return actions;
 const hand=state?.me?.hand??[];
 const inHand=id=>hand.find(c=>c.entityId===id);
 const picks=a=>CHOOSES_DISCARD.test(flat(inHand(a.entityId)?.text))&&inHand(a.targetId);
 if(!actions.some(a=>picks(a)&&bodiesOnDiscard(inHand(a.targetId))))return actions;
 return actions.filter(a=>!picks(a)||bodiesOnDiscard(inHand(a.targetId)));
}


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
// User correction (2026-09-25): with 3 mana, Whispers, Disposable Acolytes and Party Fiend in
// hand, Jev cast Whispers first -- the buff hit one minion, then ate the Fiend. Bodies first,
// buff last: while a minion or summon card on the menu fits in the mana alongside Whispers,
// Whispers waits. When both do not fit, which one to cast stays Jev's call.
const makesBodies=c=>c&&(c.CARDTYPE==='MINION'||/\bsummon/i.test(flat(c.text)));
export const whispersWaits=(state,card,actions)=>{
 if(!isWhispers(card))return false;
 const hand=state?.me?.hand??[];
 const room=Number(state?.me?.mana??0)-costOf(card);
 return actions.some(a=>{
  const c=hand.find(x=>x.entityId===a.entityId);
  return c&&c.entityId!==card.entityId&&makesBodies(c)&&costOf(c)<=room;
 });
};
// User ruling (2026-09-26, game 12, turn 4): with 1 mana, Whispers and Entropic Continuity in hand,
// Jev cast Whispers and it ate Continuity. 「應該打連鎖。因為打完連鎖，最低費變成魔像」 -- the card
// Whispers would throw away was castable itself, and casting it leaves Silverware Golem as the
// cheapest, the discard that pays. So when Whispers would eat a real card that is on the menu,
// and casting that card leaves fodder as the cheapest, Whispers waits.
export const whispersEatsPlayable=(state,card,actions)=>{
 if(!isWhispers(card))return false;
 const eats=wouldDiscard(state,card);
 if(!eats.length||eats.some(isFodder))return false;
 const cast=eats.find(c=>actions.some(a=>a.entityId===c.entityId));
 if(!cast)return false;
 // Only when casting it hands Whispers a card worth eating next.
 const after={...state,me:{...state.me,hand:state.me.hand.filter(c=>c.entityId!==cast.entityId)}};
 const next=wouldDiscard(after,card);
 return next.length>0&&next.every(isFodder);
};

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

// User ruling (2026-09-25, game 7, turn 3): Chamber of Viscidus showed Walking Dead, Soul Barrage
// and Platysaur with only Party Fiend on our board, and Jev discarded Soul Barrage. 「應該是要棄掉
// 行尸（因為場面低）」: while the board is low (two minions or fewer) and there is a slot, a
// "choose one to discard" pick takes a card that summons itself when discarded. Same burn-range
// exception as boardFirstDiscard.
// The user's refinement: 「靈魂彈幕主要是解場時比較強，如果對面滿地雜毛（1/2 血）的時候有奇效，其餘時
// 召喚大手下穩定，召喚多個小手下可以配合 buff」. So, in order:
//   * three or more enemy minions at 2 Health or less -- the split-damage discard clears them,
//     and it wins over the bodies whatever our board;
//   * otherwise the body pick; with a board buff in hand, the picks that make several small
//     bodies, and without one, the single big body.
const LOW_BOARD=2,SWARM=3,SMALL=2;
const SPLITS_DAMAGE=/deal \$?\d+ damage randomly split among all enemies/i;
const hpOf=c=>Number(c?.HEALTH??c?.baseHealth??0)-Number(c?.DAMAGE??0);
function discardPick(state,actions){
 if(!CHOOSES_DISCARD.test(flat(state.choice?.source?.text)))return actions;
 const card=a=>(state.choice.entities??[]).find(c=>c.entityId===a.entityId);
 const picks=actions.filter(a=>a.type==='CHOICE');
 // Game 9 rulings: a curse is the ideal thing to throw away, and a card that draws when
 // discarded is not, when the draw would burn cards or run into fatigue.
 const curse=picks.filter(a=>isCurse(card(a)));
 if(curse.length)return curse;
 {const safe=actions.filter(a=>a.type!=='CHOICE'||!overdraws(state,card(a),false));if(safe.some(a=>a.type==='CHOICE'))actions=safe;}
 const chaff=(state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&hpOf(c)<=SMALL).length;
 if(chaff>=SWARM){
  const clear=picks.filter(a=>PAYS_ON_DISCARD.test(flat(card(a)?.text))&&SPLITS_DAMAGE.test(flat(card(a)?.text)));
  if(clear.length)return clear;
 }
 if(myMinions(state)>LOW_BOARD||myMinions(state)>=7)return actions;
 const foe=enemyHero(state);
 if(foe&&heroHp(foe)<=BURN_RANGE)return actions;
 const bodyPicks=picks.filter(a=>bodiesOnDiscard(card(a)));
 if(!bodyPicks.length)return actions;
 const buff=(state.me?.hand??[]).some(c=>givesBoardBuff(c));
 const wide=a=>summoned(card(a))>=2;
 const pref=bodyPicks.filter(a=>buff?wide(a):!wide(a));
 return pref.length?pref:bodyPicks;
}

// User ruling (2026-09-25, game 9): we died to fatigue with one card in the deck and four in
// hand, after Hand of Gul'dan drew three; and a board buff -- one of the deck's win conditions --
// was burned by a full hand. A draw that runs past the deck, or past ten cards in hand, waits.
// `played` says whether the card leaves the hand first (cast) or not (hero power stays on board).
const DRAW_N=/\bdraw (a|one|two|three|\d+) cards?\b/i;
const WORDS={a:1,one:1,two:2,three:3};
export function drawCount(card){
 const m=DRAW_N.exec(flat(card?.text));
 if(!m)return 0;
 return WORDS[m[1].toLowerCase()]??Number(m[1]);
}
export function overdraws(state,card,played=true){
 const n=drawCount(card);
 if(!n)return false;
 const deck=state.me?.deckCount;
 const hand=(state.me?.hand??[]).length-(played?1:0);
 return (deck!=null&&deck<n)||hand+n>10;
}
function overdrawWaits(state){
 const hand=state.me?.hand??[],board=state.me?.board??[];
 return a=>{
  const h=hand.find(c=>c.entityId===a.entityId);
  if(h)return overdraws(state,h,true);
  const b=board.find(c=>c.entityId===a.entityId&&c.CARDTYPE==='HERO_POWER');
  return !!b&&overdraws(state,b,false);
 };
}

// User ruling (2026-09-26, game 10), three turns of the same mistake: 「應該先抽牌再出牌 or 打 1+3 費」,
// 「先抽牌才對。白白浪費一個魔眼」, 「一樣要先抽牌再打 buff」. Turn 7 cast Silverware Golem and
// Entropic Continuity and only then Life Tap; turn 8 equipped Chronoclaws before tapping, the tap
// found The Soularium with no mana left, and the hero's swing discarded it. While Life Tap is
// affordable and safe, a card waits for it -- unless the hand spends every crystal exactly
// without it (the 1+3 the user also accepts), in which case the cards of that exact spend stay.
function drawFirst(state,actions){
 const hp=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO_POWER');
 const mana=Number(state.me?.mana??0);
 if(!hp||!drawCount(hp)||costOf(hp)>mana||!actions.some(a=>a.entityId===hp.entityId))return actions;
 if(myHeroHp(state)-selfDamageCost(hp)<=incomingDamage(state))return actions;
 const hand=state.me?.hand??[];
 const plays=[...new Set(actions.map(a=>hand.find(c=>c.entityId===a.entityId)).filter(c=>c&&!isCoin(c)&&costOf(c)>0))];
 // The line may run through a card an earlier rule is holding back for now (Whispers waits for
 // the body that goes first), so the exact spend is searched over the whole affordable hand.
 const pool=hand.filter(c=>!isCoin(c)&&costOf(c)>0&&costOf(c)<=mana).slice(0,12);
 const exact=new Set();
 for(let m=1;m<1<<pool.length;m++){
  const pick=pool.filter((_,i)=>m>>i&1);
  if(pick.reduce((s,c)=>s+costOf(c),0)===mana)pick.forEach(c=>exact.add(c.entityId));
 }
 const out=actions.filter(a=>!plays.some(c=>c.entityId===a.entityId)||exact.has(a.entityId));
 return out.length?out:actions;
}
// 「應該先用收藏器」: a card that draws goes before the cards that do not -- the draw may be
// the better play, and a card drawn after the mana is gone is one Chronoclaws throws away.
// Discard fodder that draws (Hand of Gul'dan) is worth more discarded, so it does not count.
function drawCardFirst(state,actions){
 const hand=state.me?.hand??[];
 const held=a=>hand.find(c=>c.entityId===a.entityId);
 const draws=a=>{const c=held(a);return !!c&&drawCount(c)>0&&!isFodder(c)};
 if(!actions.some(draws))return actions;
 return actions.filter(a=>draws(a)||!held(a)||isCoin(held(a)));
}
// 「這回合的地標還沒 CD 好，不能點」: a location that is exhausted or cooling down is never clicked.
const locationResting=state=>{
 const board=state.me?.board??[];
 return a=>board.some(c=>c.entityId===a.entityId&&c.CARDTYPE==='LOCATION'&&(on(c,'EXHAUSTED')||Number(c.LOCATION_ACTION_COOLDOWN??0)>0));
};

// User ruling (2026-09-26, game 11, turn 4): 「應該先用武器攻擊，以維持場面的血量」. Occultist and
// Walking Dead traded into Risen Footman and the Necromancer and lost health while Gul'dan, at 30
// Health with Chronoclaws, went face last. While the armed hero still has a swing the suicide
// check allows, our minions' attacks wait; they come back once the hero has swung.
function weaponFirst(state,out){
 const board=state.me?.board??[];
 const hero=board.find(c=>c.CARDTYPE==='HERO');
 if(!hero||!board.some(c=>c.CARDTYPE==='WEAPON'))return out;
 const swings=out.filter(a=>a.entityId===hero.entityId&&isAttackAction(state,a));
 if(!swings.length)return out;
 return out.filter(a=>!isAttackAction(state,a)||a.entityId===hero.entityId);
}
// User ruling (2026-09-26, game 13, turn 4): 「應該棄掉靈魂彈幕，因為 325 本來就會在鴨嘴龍死掉後棄置」.
// Platysaur's deathrattle discards the card it drew, which power.mjs marks doomed. Choosing that
// card for a discard spends the pick on a discard that was coming for free, so while another card
// can be picked, the doomed one is not.
function doomedPick(state,actions){
 const hand=state?.me?.hand??[];
 const inHand=id=>hand.find(c=>c.entityId===id);
 if(state?.choice){
  if(!CHOOSES_DISCARD.test(flat(state.choice.source?.text)))return actions;
  const card=a=>(state.choice.entities??[]).find(c=>c.entityId===a.entityId);
  const kept=actions.filter(a=>a.type!=='CHOICE'||!card(a)?.doomed);
  return kept.some(a=>a.type==='CHOICE')?kept:actions;
 }
 const picks=a=>CHOOSES_DISCARD.test(flat(inHand(a.entityId)?.text))&&inHand(a.targetId);
 const doomed=a=>picks(a)&&inHand(a.targetId).doomed;
 if(!actions.some(doomed))return actions;
 return actions.filter(a=>!doomed(a)||!actions.some(b=>b.entityId===a.entityId&&picks(b)&&!doomed(b)));
}
// User ruling (2026-09-26, game 13, turn 5): 「先打公爵，確保隨機棄牌不會棄掉有價值的公爵」. Soulfire's
// random discard could hit Duke of Below, which grows with every discard. While a card that counts
// our discards can be cast, a play that discards at random waits for it.
const DISCARDS_RANDOM=/discard a random card/i;
const COUNTS_DISCARDS=/for each card you'?ve discarded/i;
function counterFirst(state,out){
 const hand=state?.me?.hand??[];
 const inHand=id=>hand.find(c=>c.entityId===id);
 if(!out.some(a=>COUNTS_DISCARDS.test(flat(inHand(a.entityId)?.text))))return out;
 const kept=out.filter(a=>!DISCARDS_RANDOM.test(flat(inHand(a.entityId)?.text)));
 return kept.length?kept:out;
}
export function constrainActions(state,actions){
 if(state.choice?.type==='MULLIGAN')return mulliganConstraint(state,actions);
 if(state.choice)return discardPick(state,doomedPick(state,temporaryPick(state,actions)));
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
 const split=splitToFace(state);
 out=out.filter(a=>!split(a));
 if(!out.some(a=>a.type!=='END_TURN'))out=out.length?out:actions;
 {const od=overdrawWaits(state);const kept=out.filter(a=>!od(a));if(kept.length)out=kept;}
 {const dk=drawKills(state);const kept=out.filter(a=>!dk(a));if(kept.length)out=kept;}
 {const rest=locationResting(state);const kept=out.filter(a=>!rest(a));if(kept.length)out=kept;}
 out=weaponFirst(state,out);
 const wasted=wastedFodder(state);
 if(wasted.size){
  out=out.filter(a=>!wasted.has(a.entityId));
  if(!out.length)out=actions;
 }
 out=boardFirstDiscard(state,doomedPick(state,out));
 out=counterFirst(state,out);
 {const kept=out.filter(a=>!overflowWaits(state,out)(a));if(kept.length)out=kept;}
 const held=id=>(state.me?.hand??[]).find(c=>c.entityId===id);
 out=out.filter(a=>!deadWhispers(state,held(a.entityId)));
 if(!out.length)out=actions;
 {const menu=out;out=out.filter(a=>!whispersWaits(state,held(a.entityId),menu));}
 {const menu=out;const kept=out.filter(a=>!whispersEatsPlayable(state,held(a.entityId),menu));if(kept.length)out=kept;}
 // Only while the buff is still on the table to be played: if the option went for some other
 // reason there is nothing to stay for.
 if(out.some(a=>whispersWorthCasting(state,held(a.entityId)))){
  const trimmed=out.filter(a=>a.type!=='END_TURN');
  if(trimmed.length)out=trimmed;
 }
 out=drawCardFirst(state,drawFirst(state,out));
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
 // A body-then-Whispers line that is waiting to be played counts as one card of its whole cost.
 const w=hand.find(isWhispers);
 const line=w&&whispersWaits(state,w,actions)
  ?costOf(w)+Math.min(...actions.map(a=>hand.find(x=>x.entityId===a.entityId)).filter(makesBodies).map(costOf)):0;
 const pricedOut=!!hp&&(cards.some(a=>costOf(hand.find(x=>x.entityId===a.entityId))>mana-hpCost)||line>mana-hpCost);
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
