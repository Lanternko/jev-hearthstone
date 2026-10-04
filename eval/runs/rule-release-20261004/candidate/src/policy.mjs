import {isCurse,roles,mulliganWR,mulliganKept,mulliganRelative,bodies,summoned,buffImpact,valuableBuff,buffManaReserve} from './describe.mjs';
import {lethalStrike,enemyHero,heroHp,faceDamage} from './lethal.mjs';
import {isCoin} from './power.mjs';
import {deckFor} from './deck.mjs';
import {immediateDraws,heroAttackGain,heroCanSwing} from './mechanics.mjs';
import {drawImpact} from './draw-risk.mjs';
import {resourceDrawWindow,OBJECTIVE_WEIGHTS} from './matchup-objective.mjs';
import {combinationAdmission,admittedFirstIds,admittedLines,admissionEvidence,comparisonFirstIds} from './combo-admission.mjs';
import {weaponBuffAssessment} from './weapon-buff.mjs';
import {divineShieldAssessment} from './divine-shield.mjs';
import {temporaryDiscardAssessments} from './temporary-discard.mjs';
import {handRetentionAssessment} from './hand-retention.mjs';
import {search,score,actionFor} from './plan.mjs';
import {FODDER_HOLD_VERSION,holdValue} from './fodder-hold.mjs';
import {releasing} from './rule-release.mjs';
const isDH=state=>deckFor(state).name==='dh-void';

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
 // Second deck (Demon Hunter, 2026-09-27): its list has no win rates yet, so this whitelist decides
 // every card, and a tempo list lives on 1-2 mana cantrips and discovers. A cheap spell that adds
 // a body or a card stays open to Jev, as long as it is not also a damage spell.
 return c?.CARDTYPE==='SPELL'&&cost<=2&&/\b(summon|draw|discover|get)\b/i.test(t)&&!/\bdeal\b/i.test(t);
}
// Third ruling (2026-09-25): the public opening-hand win rates (decks/<deck>/mulligan.json) replace the
// whitelist wherever a card has one. The whitelist threw back Cursed Catacombs (71.9%, kept by
// 95% of players) and Ocular Occultist (70.7%), and forced Hand of Gul'dan (62.5%) to stay as
// fodder. Now: >=70% always stays, <=62.5% always goes, and the middle band is Jev's call with
// the number in the option text. A card with no stat (none in this list today) falls back to
// the whitelist, which then only forces the toss.
// User ruling (2026-09-25, game 7): Jev kept Soul Barrage (65.2%, kept by only 18% of players).
// Not a new win-rate line -- "可能有少數場合可以留" -- but when both the win rate and the keep
// rate are low there is nothing to think about, so a middle-band card almost nobody keeps goes.
export const MULL_KEEP=70,MULL_TOSS=62.5,MULL_RARELY_KEPT=25;
const passiveEgg=c=>c?.name==='Boneweb Egg'&&Number(c.ATK??c.baseAttack??0)===0;
// Opening tempo means bodies now, not a Deathrattle that needs another card to activate.
const openingBody=c=>costOf(c)<=2&&(c.CARDTYPE==='MINION'
 ?Number(c.ATK??c.baseAttack??0)>0||/battlecry:.*summon/i.test(flat(c.text))
 :c.CARDTYPE==='SPELL'&&/^when you play or discard this, summon/i.test(flat(c.text)));
function earlyEggOutlet(cards,egg,mana=3){
 const hand=cards.filter(c=>!isCoin(c)).sort((a,b)=>costOf(a)-costOf(b));
 const outlet=reliableOutletFor({me:{hand,board:[],mana}},egg);
 return outlet&&costOf(outlet)<=mana?outlet:null;
}
export function mulliganVerdict(c,state){
 if(!isDH(state)){
  const cards=(state?.choice?.entities??state?.me?.hand??[]).filter(c=>!isCoin(c));
  // User ruling, game 120: one Occultist activates one payoff. Cheap board
  // development does not create an extra discard activation.
  // Prefer Walking Dead by default; no postgame control label reaches mulligan.
  if(cards.filter(x=>x.name==='Ocular Occultist').length===1){
   const payoffs=cards.filter(x=>['Walking Dead','Silverware Golem'].includes(x.name));
   const preferred=payoffs.find(x=>x.name==='Walking Dead')??payoffs[0];
   if(payoffs.some(x=>x.entityId===c.entityId)&&c.entityId!==preferred?.entityId)return 'toss';
  }
  if(passiveEgg(c)&&!earlyEggOutlet(cards,c))return 'toss';
  const whispersSetup=c.name==='Wicked Whispers'&&(cards.some(x=>['Walking Dead','Silverware Golem'].includes(x.name))
   ||(state.choice?.entities??[]).some(isCoin)&&cards.some(x=>x.name==='Cursed Catacombs'));
  if(roles(c).includes('buff')&&!whispersSetup&&!cards.some(openingBody)
    &&!cards.some(egg=>passiveEgg(egg)&&earlyEggOutlet(cards,egg)?.entityId===c.entityId))return 'toss';
 }
 const wr=mulliganWR(c,state);
 if(wr==null)return keepInOpening(c)?'free':'toss';
 const kept=mulliganKept(c,state);
 if(wr>=MULL_KEEP)return 'keep';
 if(isDH(state)){
  // The DH screenshot gives arrows relative to this deck's average but omits the baseline.
  // Do not apply another deck's absolute-WR toss cutoff to these numbers.
  const keepOverride=Number(deckFor(state).mulligan.keepRateOverride??Infinity);
  if(kept!=null&&kept>=keepOverride)return 'keep';
  if(mulliganRelative(c,state)==='above')return 'keep';
  if(kept!=null&&kept<MULL_RARELY_KEPT)return 'toss';
  return 'free';
 }
 // This deck's supplied data shows several highly successful cards are nearly always kept,
 // despite sitting below the generic absolute-WR cutoff. Respect that deck-specific evidence.
 const keepOverride=Number(deckFor(state).mulligan.keepRateOverride??Infinity);
 if(kept!=null&&kept>=keepOverride)return 'keep';
 if(wr<=MULL_TOSS)return 'toss';
 return kept!=null&&kept<MULL_RARELY_KEPT?'toss':'free';
}
// Same ruling: "4 費牌要很後面才會用到，手上沒有低費牌時不可能留". A 4+ cost card may stay only
// beside a kept card of 2 or less.
const MULL_LATE=4,MULL_EARLY=2;
const keepsLateAlone=(cards,a,state)=>{
 const kept=cards.filter(c=>!a.replace?.includes(c.entityId));
 return kept.some(c=>costOf(c)>=MULL_LATE)&&!kept.some(c=>isDH(state)?costOf(c)<=MULL_EARLY:openingBody(c));
};
// User ruling (2026-09-25, after game 6): 「可以高機率留的組合是：低語+侍僧；魔眼+殭屍；派對+buff」.
// With both halves in the opening hand, both stay, over the win-rate bands (Continuity's 62.1
// would otherwise force the buff back beside Party Fiend). One buff is enough for Party Fiend.
// Soulfire stays a toss: 「靈魂之火還是換掉吧，畢竟是隨機棄牌」 -- its 61.7 already does that.
// The pairs live in the deck's mulligan.json ("combos"): a card name, or "role:<role>" for any
// card roles() tags that way.
const matcher=k=>k.startsWith('role:')?c=>roles(c).includes(k.slice(5)):c=>c?.name===k;
export function mulliganCombos(cards,state){
 const keep=new Set();
 for(const [a,b] of (deckFor(state).mulligan.combos??[]).map(p=>p.map(matcher))){
  const x=cards.find(c=>a(c)),y=cards.filter(c=>b(c)&&c!==x).sort((p,q)=>costOf(p)-costOf(q))[0];
  if(x&&y){keep.add(x.entityId);keep.add(y.entityId)}
 }
 return keep;
}
function mulliganConstraint(state,actions){
 const cards=(state.choice.entities??[]).filter(c=>!isCoin(c));
 const combo=mulliganCombos(cards,state);
 const toss=cards.filter(c=>mulliganVerdict(c,state)==='toss'&&!combo.has(c.entityId)).map(c=>c.entityId);
 const keep=cards.filter(c=>mulliganVerdict(c,state)==='keep'||combo.has(c.entityId)).map(c=>c.entityId);
 let out=actions.filter(a=>toss.every(id=>a.replace?.includes(id))&&!keep.some(id=>a.replace?.includes(id)));
 if(!out.length)out=actions;
 // Game 14: offered outlets do not count if the action redraws them. One
 // retained early discard activation supports at most one 3-cost summon payoff.
 // Whispers is an outlet as well as a buff; Coin/Catacombs can be spent first.
 if(!isDH(state)){
  const supported=out.filter(a=>{
   const retained=cards.filter(c=>!a.replace?.includes(c.entityId));
   const activations=retained.filter(c=>['Ocular Occultist','Wicked Whispers','Chamber of Viscidus'].includes(c.name)).length;
   return retained.filter(c=>['Walking Dead','Silverware Golem'].includes(c.name)).length<=activations;
  });
  if(supported.length)out=supported;
 }
 const early=out.filter(a=>!keepsLateAlone(cards,a,state));
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
export function worstDraw(state,n,options){
 return drawImpact(state,n,options).damageMin;
}
const DRAWS_ON_DISCARD=/\bdiscard this\b/i;
function afterSwingDraws(state){
 const weapon=(state.me?.board??[]).find(c=>c.CARDTYPE==='WEAPON');
 if(!weapon||!DISCARDS_HIGHEST.test(flat(weapon.text)))return 0;
 const hand=state.me?.hand??[];
 const top=Math.max(-Infinity,...hand.map(costOf));
 return Math.max(0,...hand.filter(c=>costOf(c)===top&&DRAWS_ON_DISCARD.test(flat(c.text))).map(c=>worstDraw(state,drawCount(c),{played:true})));
}
// A draw that can kill us through a known Shred of Time waits, like a draw that overdraws.
function drawKills(state){
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const hp=myHeroHp(state);
 if(!board.some(c=>c.CARDTYPE==='HERO'))return ()=>false;
 return a=>{
  const c=hand.find(x=>x.entityId===a.entityId)??board.find(x=>x.entityId===a.entityId&&x.CARDTYPE==='HERO_POWER');
  const n=drawCount(c,state),dmg=n?selfDamageCost(c)+worstDraw(state,n,{played:hand.includes(c)}):0;
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
 const room=boardRoom(state);
 const hero=board.find(c=>c.CARDTYPE==='HERO');
 const trades=actions.some(a=>isAttackAction(state,a)&&a.entityId!==hero?.entityId);
 return a=>{
  // The swing itself is an attack; it waits only for the minions' swings.
  if(hero&&a.entityId===hero.entityId&&!trades)return false;
  const n=landing(state,a);
  return n>1&&n>room;
 };
}
const boardRoom=state=>7-(state.me?.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
// User ruling (2026-09-30, game 58 turn 5): 「第五回合沒有空間了。應該自殺一些怪清出空間，才能下新的」.
// Five minions down, Occultist discarded Boneweb Egg (1 + two Spiders into two slots), then the
// Chronoclaws swing discarded Walking Dead onto a full board. Bodies from a discard count too.
const discardBodies=c=>/if you discard this minion, summon it/i.test(flat(c?.text))?1:bodiesOnDiscard(c)?summoned(c):0;
function landing(state,a){
 const hand=state.me?.hand??[];
 const board=state.me?.board??[];
 const card=hand.find(c=>c.entityId===a.entityId);
 if(card)return bodies(card)+discardBodies(hand.find(c=>c.entityId===a.targetId));
 const w=board.find(c=>c.CARDTYPE==='WEAPON'&&DISCARDS_HIGHEST.test(flat(c.text)));
 const hero=board.find(c=>c.CARDTYPE==='HERO');
 if(!w||!hero||a.entityId!==hero.entityId||a.targetId==null)return 0;
 const top=Math.max(-Infinity,...hand.map(costOf));
 return Math.max(0,...hand.filter(c=>costOf(c)===top).map(discardBodies));
}
// What the hand could still land this turn if played at its best, discards included.
function pendingBodies(state){
 const hand=state.me?.hand??[],mana=Number(state.me?.mana??0);
 const chooses=c=>/choose a card in\s*your hand to discard/i.test(flat(c.text));
 return Math.max(0,...hand.filter(c=>costOf(c)<=mana).map(c=>bodies(c)
  +(chooses(c)?Math.max(0,...hand.filter(x=>x!==c).map(discardBodies)):0)));
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
export function singleBuffTradeGain(state,card,actions){
 const v=buffImpact(state,card);
 if(v?.existing!==1||v.recipients!==1)return false;
 const b=(state.me?.board??[]).find(c=>c.CARDTYPE==='MINION'&&!on(c,'DORMANT'));
 if(!b)return false;
 const attack=Number(b.ATK??b.baseAttack??0),hp=hpOf(b);
 return actions.some(a=>a.entityId===b.entityId&&a.targetId!=null
  &&(state.opponent?.board??[]).some(t=>t.entityId===a.targetId&&t.CARDTYPE==='MINION'
   &&!on(t,'DORMANT')&&!on(t,'DIVINE_SHIELD')&&!on(t,'POISONOUS')&&!on(t,'IMMUNE')
   &&attack+v.attack>=hpOf(t)&&hp+v.health>Number(t.ATK??0)
   &&!(attack>=hpOf(t)&&hp>Number(t.ATK??0))));
}

// Explicit user correction, second live game: the hero power was tapped for a card on a turn
// the opponent already had lethal on board. Life Tap's two health is not a cost to weigh
// there, it is simply off the table -- and the same holds for any hero power whose own text
// says it damages us. Board damage is arithmetic over a fully observed state, so like lethal
// it is taken away from Jev rather than explained to it.
const SELF_DAMAGE=/take \$?(\d+) damage/i;
export const selfDamageCost=card=>{
 let t=flat(card?.text);
 // A minion's future Deathrattle/trigger is not an immediate play cost.
 if(card?.CARDTYPE==='MINION'){
  if(!/battlecry:/i.test(t))return 0;
  t=t.split(/battlecry:/i)[1].split(/deathrattle:|at the (?:start|end)|after /i)[0];
 }
 const take=SELF_DAMAGE.exec(t),deal=/deal \$?(\d+) damage to your hero/i.exec(t);
 return Number(take?.[1]??0)+Number(deal?.[1]??0);
};
export function lethalSelfDamage(state,a){
 if(a.type==='CHOICE'||a.type==='MULLIGAN'||a.type==='END_TURN')return false;
 const hero=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
 if(!hero||hero.IMMUNE===1||hero.IMMUNE==='1')return false;
 const c=(state.me?.hand??[]).find(c=>c.entityId===a.entityId)
  ??(state.me?.board??[]).find(c=>c.entityId===a.entityId&&c.CARDTYPE==='HERO_POWER');
 const hit=selfDamageCost(c);
 return hit>0&&hit>=myHeroHp(state);
}
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
// Game 51: 6 Health, two enemy 2-Attack bodies, no Taunt. A tap makes
// their existing board lethal (4 >= 6-2), even though it was not lethal before.
export function tapExposesBoardLethal(state,card){
 if(card?.CARDTYPE!=='HERO_POWER'||selfDamageCost(card)<=0)return false;
 const hp=myHeroHp(state);
 if(hp<=0||taunted(state)>0)return false; // preserve the existing Taunt handling
 const after=hp-selfDamageCost(card)-worstDraw(state,drawCount(card,state));
 return incomingDamage(state)>=after;
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
  const hpReady=hp&&!(hp.EXHAUSTED===1||hp.EXHAUSTED==='1')&&(hp.COST??hp.baseCost??2)<=mana
    &&(!heroAttackGain(hp)||heroCanSwing(state));
  return hand.some(c=>(c.COST??c.baseCost??0)<=mana)||!!hpReady;
};
export const deadCoin=state=>!spendableAt(state,(state?.me?.mana??0)+1);
// User ruling, game 46: turn-one Coin -> a lone 0/2 Egg is not productive tempo.
export function passiveEggCoin(state){
 if(isDH(state)||Number(state?.me?.mana)!==1||myMinions(state)>0)return false;
 const hand=(state?.me?.hand??[]).filter(c=>!isCoin(c));
 const unlocked=hand.filter(c=>costOf(c)>1&&costOf(c)<=2);
 return unlocked.length>0&&unlocked.every(passiveEgg)
  &&!unlocked.some(egg=>earlyEggOutlet(hand,egg,2));
}

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
// Game 15 (2026-09-29), our turn 6: a Frozen hero with Chronoclaws kept both Boneweb Eggs in
// hand with 3 mana spare -- the weapon discards only when the hero swings, so a hero that cannot
// swing this turn is no outlet today.
const outletUsable=(state,o)=>o.CARDTYPE==='WEAPON'?heroCanSwing(state):costOf(o)<=Number(state?.me?.mana??0);
const without=(state,c)=>({...state,me:{...state.me,hand:(state.me?.hand??[]).filter(x=>x.entityId!==c.entityId)}});
// User screenshot ruling: five bodies + Acolytes + Continuity on five mana.
// Fill the two slots directly, then buff seven; an Occultist would occupy one
// of those slots before discarding Acolytes and lose one of its summoned bodies.
// User ruling 2026-10-01: one-body +1/+1 loses to Occultist -> Walking Dead.
// This is a known targeted discard, not a forecast of random summons.
export function lowBoardDiscardActions(state,actions){
 if(isDH(state)||state.choice)return [];
 const hand=state.me?.hand??[],board=state.me?.board??[],mana=Number(state.me?.mana??0);
 if(myMinions(state)!==1||hand.some(isCurse)||incomingDamage(state)>=myHeroHp(state)+taunted(state))return [];
 const room=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 if(room<2)return [];
 const buffs=hand.filter(c=>pureBoardBuff(c)&&buffImpact(state,c)?.recipients===1);
 if(!buffs.length)return [];
 return actions.filter(a=>{
  const source=hand.find(c=>c.entityId===a.entityId),target=hand.find(c=>c.entityId===a.targetId);
  return source?.name==='Ocular Occultist'&&target?.name==='Walking Dead'
   &&costOf(source)<=mana&&buffs.some(b=>costOf(b)+costOf(source)>mana);
 });
}
export function buffDevelopmentActions(state,actions,buff){
 if(isDH(state)||state.choice)return [];
 const hp=myHeroHp(state);
 if(hp>0&&incomingDamage(state)>=hp+taunted(state))return [];
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const slots=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 if(slots<=0||!pureBoardBuff(buff))return [];
 const mana=Number(state.me?.mana??0);
 return actions.filter(a=>{
  const c=hand.find(c=>c.entityId===a.entityId),t=flat(c?.text).trim();
  if(!c||c===buff||a.targetId!=null||lethalSelfDamage(state,a)
   ||costOf(c)+buffManaReserve(state,buff)>mana)return false;
  const spell=c.CARDTYPE==='SPELL'&&/^(?:when you play or discard this, )?summon\b/i.test(t)
   &&!/\bif\b|next turn|end of|dormant/i.test(t);
  // Ordinary bodies and simple summon/draw/self-hit Battlecries add buff targets.
  // Complex destructive/conditional Battlecries require planning, not this rule.
  const battlecry=t.match(/battlecry:([\s\S]*?)(?:deathrattle:|$)/i)?.[1]?.trim();
  const simple=!battlecry||battlecry.split(/\.\s*/).filter(Boolean).every(p=>
   /^(?:summon (?:a|an|one|two|three|\d+) |draw (?:a|one|two|three|\d+) cards?\b|deal \$?\d+ damage to your hero\b)/i.test(p)
   &&!/\bif\b|destroy|discard|next turn|end of|dormant/i.test(p));
  const minion=c.CARDTYPE==='MINION'&&!on(c,'DORMANT')&&!/dormant/i.test(t)&&simple;
  const n=spell?summoned(c):1+summoned({text:battlecry??''});
  return (spell||minion)&&n>0&&n<=slots;
 });
}
export function buffSetupActions(state,actions){
 // Whether a buff is worthwhile remains distinct from ordering its setup.
 const buffs=(state.me?.hand??[]).filter(c=>valuableBuff(state,c)&&pureBoardBuff(c));
 return actions.filter(a=>buffs.some(b=>buffDevelopmentActions(state,actions,b).includes(a)));
}
function protectedFodder(state,c){
 const o=reliableOutletFor(state,c);
 if(!o)return false;
 if(outletUsable(state,o))return true;
 const after=without(state,c);
 return !(after.me.hand).some(f=>f.entityId!==o.entityId&&isFodder(f)&&reliableOutletFor(after,f));
}
export const wastedFodder=state=>new Set(
 (state?.me?.hand??[]).filter(c=>isFodder(c)&&protectedFodder(state,c)).map(c=>c.entityId));

// Step 2 of the rule-tier plan (user, 2026-10-04). The delete above stays the default: prose did
// not move Jev. It is lifted for one cast only when the search, now charging every cast fodder the
// discard payoff it forfeits (fodder-hold.mjs), still ranks that cast as the strictly best first
// step -- better than every line that starts elsewhere and than doing nothing. Step 1 found the
// cases this exists for: Silverware Golem held while their board was lethal (morning g1 T16, g2 T15).
export function fodderRelease(state,actions,wasted=wastedFodder(state)){
 if(state.choice||!actions.some(a=>wasted.has(a.entityId)))return null;
 const {start,plans}=search(state,actions,{fodderHold:[...wasted]});
 const first=p=>actionFor(actions,p.steps[0]);
 const best=plans[0],a=best&&first(best);
 if(!a||!wasted.has(a.entityId))return null;
 const rival=plans.find(p=>{const x=first(p);return x&&!wasted.has(x.entityId);});
 const idle=score(start,start),floor=Math.max(rival?.score??-Infinity,idle);
 if(!(best.score>floor))return null;
 const card=start.hand.find(c=>c.id===a.entityId),raw=(state.me.hand??[]).find(c=>c.entityId===a.entityId);
 const w=start.objective?.weights??OBJECTIVE_WEIGHTS.unknown;
 return {version:FODDER_HOLD_VERSION,actionId:a.id,entityId:a.entityId,name:card?.name,
  outlet:reliableOutletFor(state,raw)?.name??null,holdValue:card?holdValue(card,w):0,
  score:best.score,rivalScore:rival?.score??null,idleScore:idle,
  steps:best.steps.map(m=>({kind:m.kind,id:m.id,targetId:m.targetId??null}))};
}

// User ruling (2026-09-25, game 4, turn 3): Occultist with nothing of ours on the board, and Jev
// discarded Hand of Gul'dan (draw 3) over Acolytes and Boneweb Egg. With no board, board beats
// hand: while some target summons something when discarded, targets that do not are cut.
// The user's own exception: with the kill close, drawing three for burn beats two 1-drops, so
// once their hero is in burn range (the 12 plan.mjs switches to racing at) the pick is Jev's again.
const bodiesOnDiscard=c=>isFodder(c)&&/\bsummon/i.test(flat(c?.text));
const BURN_RANGE=12;
export function boardFirstDiscard(state,actions){
 const count=myMinions(state);
 if(count>2)return actions;
 const foe=enemyHero(state);
 if(foe&&heroHp(foe)<=BURN_RANGE)return actions;
 const hand=state?.me?.hand??[];
 const inHand=id=>hand.find(c=>c.entityId===id);
 const picks=a=>CHOOSES_DISCARD.test(flat(inHand(a.entityId)?.text))&&inHand(a.targetId);
 const room=7-(state.me?.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const fits=a=>discardBodies(inHand(a.targetId))>0&&discardBodies(inHand(a.targetId))<=room-(inHand(a.entityId)?.CARDTYPE==='MINION'?1:0);
 if(!actions.some(a=>picks(a)&&bodiesOnDiscard(inHand(a.targetId))&&fits(a)))return actions;
 if(count===0)return actions.filter(a=>!picks(a)||bodiesOnDiscard(inHand(a.targetId)));
 // User ruling, game 148 turn 3: after spending all mana on Occultist,
 // a draw-three payoff cannot develop this turn. Prefer a summon payoff on a low board.
 return actions.filter(a=>!picks(a)||isCurse(inHand(a.targetId))
  ||bodiesOnDiscard(inHand(a.targetId))&&fits(a)
  ||Number(state.me?.mana??0)>costOf(inHand(a.entityId))
  ||!actions.some(b=>b.entityId===a.entityId&&picks(b)&&bodiesOnDiscard(inHand(b.targetId))&&fits(b)));
}

// User ruling (2026-09-30, game 4, turn 8): Ocular Occultist discarded Soul Barrage with Walking
// Dead in hand and a lone 3/3 across. 「彈幕打5，對面一只怪，期望值會受到2.5點傷害」: split
// among hero and one minion, the 3/3 dies only half the time, and even the kill is worth about
// 2.5 mana -- less than the 2/5 Taunt the Walking Dead discard summons. The split damage stays a
// pick only against a swarm (boardFirstDiscard's SWARM), small minions with 5+ Attack between them,
// or with their hero in burn range.
// `card(a)` names the card a discard option throws away.
const SMALL_PUNCH=5;
function splitBurnWaits(state,actions,card){
 const foe=enemyHero(state);
 if(foe&&heroHp(foe)<=BURN_RANGE)return actions;
 // The user's addition: 「或是對面2血以下的怪 的攻擊力合 >= 5」 -- small minions hitting that hard
 // together are worth the gamble even when there are fewer than three.
 const small=(state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&hpOf(c)<=SMALL);
 if(small.length>=SWARM||small.reduce((n,c)=>n+Number(c.ATK??c.baseAttack??0),0)>=SMALL_PUNCH)return actions;
 const split=a=>{const c=card(a);return !!c&&PAYS_ON_DISCARD.test(flat(c.text))&&SPLITS_DAMAGE.test(flat(c.text))};
 if(!actions.some(a=>card(a)&&bodiesOnDiscard(card(a))))return actions;
 const kept=actions.filter(a=>!split(a));
 return kept.length?kept:actions;
}
function occultistPick(state,actions){
 const hand=state?.me?.hand??[],inHand=id=>hand.find(c=>c.entityId===id);
 const picks=a=>CHOOSES_DISCARD.test(flat(inHand(a.entityId)?.text))&&inHand(a.targetId);
 return splitBurnWaits(state,actions,a=>picks(a)?inHand(a.targetId):null);
}

// User ruling (2026-09-30, game 4, turn 4): 「這邊 先鴨嘴龍再buff」. Two mana, Entropic
// Continuity and Platysaur in hand; Jev buffed first, and Platysaur came down after as a bare
// 1/2. strategy.md already said bodies before buffs and the plan text even named Platysaur as
// still affordable, but a minion whose battlecry draws cannot be planned past, so every full
// plan on the menu started with the buff. While a minion from hand fits beside the buff and
// there is a slot for it, the buff waits until the minion is down.
function bodyBeforeBuff(state,actions){
 if(isDH(state)||state.choice||boardRoom(state)<=0)return actions;
 const hand=state.me?.hand??[],mana=Number(state.me?.mana??0);
 const held=a=>hand.find(c=>c.entityId===a.entityId);
 const buffs=actions.filter(a=>{const c=held(a);return c?.CARDTYPE==='SPELL'&&pureBoardBuff(c)});
 // Discard fodder is worth more thrown away than cast (Cards, strategy.md); whether to cast
 // it at all stays Jev's call, so it does not hold the buff back.
 const bodies=actions.filter(a=>held(a)?.CARDTYPE==='MINION'&&!isFodder(held(a)));
 const early=b=>bodies.some(m=>costOf(held(m))+costOf(held(b))<=mana);
 const kept=actions.filter(a=>!(buffs.includes(a)&&early(a)));
 return kept.length?kept:actions;
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

// Game 51 T2: five bodies, Continuity, Egg, two mana; Catacombs offers
// Egg / Whispers / unaffordable Occultist. Pick the buff, not more passive fodder.
function tempoBuffPick(state,actions){
 if(isDH(state)||!/discover/i.test(flat(state.choice?.source?.text))
   ||!/temporary/i.test(flat(state.choice?.source?.text)))return actions;
 const cards=state.choice.entities??[],card=a=>cards.find(c=>c.entityId===a.entityId);
 const view=c=>({...state,me:{...state.me,hand:[...(state.me.hand??[]),c]}});
 const buffs=actions.filter(a=>{
  const c=card(a),v=buffImpact(view(c),c);
  return valuableBuff(view(c),c)&&v.recipients>=5;
 });
 if(!buffs.length)return actions;
 const passive=c=>c?.CARDTYPE==='MINION'&&Number(c.ATK??c.baseAttack??0)===0
   &&isFodder(c)&&!roles(c).includes('rush')&&!roles(c).includes('taunt');
 // Keep removal, active bodies, draw payoffs and other meaningful alternatives available.
 return actions.filter(a=>buffs.includes(a)||!passive(card(a))
   &&!(costOf(card(a))>Number(state.me?.mana??0)&&!isFodder(card(a))));
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
 // User ruling (2026-09-29, game 21, turn 9): Chamber of Viscidus showed Soul Barrage, Cursed
 // Catacombs and Party Fiend on 0 mana, and Jev threw away Catacombs -- a 0-cost Discover it could
 // still cast. 「應該棄靈魂彈幕。然後 0 費繼續找牌」: while some pick pays out when discarded, a pick
 // that does not is kept in hand.
 {const pays=a=>a.type!=='CHOICE'||PAYS_ON_DISCARD.test(flat(card(a)?.text))||bodiesOnDiscard(card(a));
  if(picks.some(pays))actions=actions.filter(pays);}
 actions=splitBurnWaits(state,actions,a=>a.type==='CHOICE'?card(a):null);
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
export function drawCount(card,state){
 if(state)return immediateDraws(card,state);
 const m=DRAW_N.exec(flat(card?.text));
 if(!m)return 0;
 return WORDS[m[1].toLowerCase()]??Number(m[1]);
}
export function overdraws(state,card,played=true){
 const n=played?drawCount(card,state):drawCount(card);
 if(!n)return false;
 const r=drawImpact(state,n,{played});
 return r.fatigueDraws>0||r.burnMax>0;
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

function buffBeforeTap(state,actions){
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const buffs=actions.map(a=>hand.find(c=>c.entityId===a.entityId)).filter(c=>valuableBuff(state,c));
 if(!buffs.length)return actions;
 const room=Number(state.me?.mana??0)-Math.max(...buffs.map(c=>buffManaReserve(state,c)));
 const refill=resourceDrawWindow(state);
 return actions.filter(a=>{
  if(board.some(c=>c.entityId===a.entityId&&c.CARDTYPE==='HERO_POWER'&&drawCount(c)>0))return refill;
  const c=hand.find(c=>c.entityId===a.entityId);
  // A passive egg that consumes the buff's mana is weaker than buffing the existing board.
  // If both fit, keep the body-first line available; active/Rush/Taunt plays remain choices.
  return !(c?.CARDTYPE==='MINION'&&Number(c.ATK??c.baseAttack??0)===0&&isFodder(c)
    &&!roles(c).includes('rush')&&!roles(c).includes('taunt')&&costOf(c)>room);
 });
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
 // User ruling (2026-09-29, game 16, turn 20): 「遇到聖盾手下，應該先讓低攻擊的人先破盾」. The hero
 // at 9 Health popped a 7/9 Chronological Drake's shield itself while a 1-Attack Boneweb Egg could
 // have. A Divine Shield is popped by the smallest attacker, so a minion with less Attack than
 // the hero may still swing into one.
 const foe=new Map((state.opponent?.board??[]).map(c=>[c.entityId,c]));
 const heroAtk=Number(hero.ATK??0);
 const pops=a=>on(foe.get(a.targetId),'DIVINE_SHIELD')&&Number(board.find(c=>c.entityId===a.entityId)?.ATK??0)<heroAtk;
 return out.filter(a=>!isAttackAction(state,a)||a.entityId===hero.entityId||pops(a));
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
function freezeThreatFirst(state,actions){
 const shard=(state.me?.hand??[]).filter(c=>c.name==='Glacial Shard');
 let out=actions;
 for(const c of shard){
  const choices=out.filter(a=>a.entityId===c.entityId);
  const threats=choices.map(a=>(state.opponent?.board??[]).find(t=>t.entityId===a.targetId))
   .filter(t=>t?.CARDTYPE==='MINION'&&!on(t,'FROZEN')&&!on(t,'DORMANT')&&Number(t.ATK??t.baseAttack??0)>0);
  if(!threats.length)continue;
  const highest=Math.max(...threats.map(t=>Number(t.ATK??t.baseAttack??0)));
  const targets=new Set(threats.filter(t=>Number(t.ATK??t.baseAttack??0)===highest).map(t=>t.entityId));
  out=out.filter(a=>a.entityId!==c.entityId||targets.has(a.targetId));
 }
 return out;
}

// Only productive board development: removal/discover and unknown random damage still wait
// for judgement. A delayed Seas summon is good tempo, but is never immediate lethal damage.
export function dhTempoActions(state,actions){
 if(!isDH(state)||state.choice)return [];
 const room=7-(state.me?.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 return actions.filter(a=>{
  const c=(state.me?.hand??[]).find(c=>c.entityId===a.entityId);
  if(c?.name==='Infestation')return (state.me.hand??[]).length<=9;
  if(c?.name==='Sigil of Cinder')return true;
  return room>0&&c&&(c.CARDTYPE==='MINION'||['Sigil of the Seas','Void Soul','Grim Harvest'].includes(c.name));
 });
}

export function constrainActions(state,actions,{trace,admission=combinationAdmission(state,actions)}={}){
 const comboFirst=admittedFirstIds(admission);
 if(state.choice?.type==='MULLIGAN')return mulliganConstraint(state,actions);
 if(state.choice)return discardPick(state,doomedPick(state,tempoBuffPick(state,temporaryPick(state,actions))));
 // Verified expiring self-summons pay out without spending their printed mana.
 // Keep attacks, safe draws and END_TURN; immediate-use exceptions remain.
 const deferred=new Set(temporaryDiscardAssessments(state,actions).filter(c=>c.deferHardCast).map(c=>c.playActionId));
 if(deferred.size)actions=actions.filter(a=>!deferred.has(a.id));
 const saferCopies=new Set(handRetentionAssessment(state,actions).copyPreferences.flatMap(p=>p.deferredEntityIds));
 actions=actions.filter(a=>a.targetId!=null||!saferCopies.has(a.entityId));
 let out=freezeThreatFirst(state,actions);
 if(deadCoin(state)||passiveEggCoin(state)){
  const hand=state.me?.hand??[];
  out=out.filter(a=>!hand.some(c=>c.entityId===a.entityId&&isCoin(c)));
  if(!out.length)out=actions;
 }
 {
  const board=state.me.board??[];
  out=out.filter(a=>{
   const e=board.find(c=>c.entityId===a.entityId);
   return !(e?.CARDTYPE==='HERO_POWER'&&selfDamageCost(e)>0
     &&(forbidsSelfDamage(state)||tapExposesBoardLethal(state,e)));
  });
  if(!out.length)out=actions;
 }
 // Game 16 (2026-09-29), turn 20: a discovered 1-mana Ocular Occultist sat in hand while the
 // hero swung Chronoclaws, which discarded it. A card we can play and that gains nothing from the
 // discard goes onto the board before the swing.
 {const w=(state.me?.board??[]).find(c=>c.CARDTYPE==='WEAPON'&&DISCARDS_HIGHEST.test(flat(c.text)));
  const hero=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
  const hand=state.me?.hand??[];
  const top=Math.max(-Infinity,...hand.map(costOf));
  const lost=hand.filter(c=>costOf(c)===top);
  if(w&&hero&&lost.length&&lost.every(c=>!isFodder(c)&&costOf(c)<=Number(state.me?.mana??0))&&out.some(a=>lost.some(c=>c.entityId===a.entityId))){
   const kept=out.filter(a=>!(a.entityId===hero.entityId&&a.targetId!=null));
   if(kept.length)out=kept;
  }}
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
 const wasted=wastedFodder(state);
 // Ordering deletes the simulator may overturn (rule-release.mjs); the delete is the default.
 const releases=[],hold={fodderHold:[...wasted]};
 if(!isDH(state))out=releasing(state,out,weaponFirst(state,out),'weaponFirst',releases,hold);
 let released=null;
 if(wasted.size){
  // Development may make a buff valuable even when the current board is thin.
  const setups=new Set((state.me.hand??[]).filter(pureBoardBuff)
   .flatMap(b=>buffDevelopmentActions(state,out,b)).map(a=>a.entityId));
  const kept=a=>!wasted.has(a.entityId)||setups.has(a.entityId)||comboFirst.has(a.id);
  if(out.some(a=>!kept(a)))released=fodderRelease(state,out,wasted);
  out=out.filter(a=>kept(a)||a.id===released?.actionId);
  if(!out.length)out=actions;
 }
 out=occultistPick(state,boardFirstDiscard(state,doomedPick(state,out)));
 out=counterFirst(state,out);
 {const kept=out.filter(a=>!overflowWaits(state,out)(a));if(kept.length)out=releasing(state,out,kept,'overflowWaits',releases,hold);}
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
 // Warlock's historical rulings must not hide DH's Outcast enablers, attacks before weapon
 // replacement, or attacks before a generated card buries the rightmost Outcast.
 // Decide WHETHER to draw before ordering it. Availability alone is not a draw intent.
 if(!isDH(state))out=releasing(state,out,buffBeforeTap(state,out),'buffBeforeTap',releases,hold);
 else out=out.filter(a=>{
  const hp=(state.me.board??[]).find(c=>c.entityId===a.entityId&&c.CARDTYPE==='HERO_POWER');
  return !heroAttackGain(hp)||heroCanSwing(state);
 });
 // An earlier fallback must never resurrect a tap that exposes certain lethal.
 out=out.filter(a=>!tapExposesBoardLethal(state,(state.me?.board??[]).find(c=>c.entityId===a.entityId)));
 // No fallback may resurrect a lethal draw or a pure resource draw with no resources left.
 const fatalDraw=drawKills(state);
 out=out.filter(a=>{
  if(fatalDraw(a))return false;
  const c=[...(state.me?.hand??[]),...(state.me?.board??[])].find(c=>c.entityId===a.entityId);
  const n=drawCount(c,state);
  if(!n)return true;
  const pure=c?.CARDTYPE==='HERO_POWER'||/^draw (?:a|one|two|three|\d+) cards?\./i.test(flat(c?.text));
  return !pure||drawImpact(state,n,{played:c.CARDTYPE!=='HERO_POWER'}).usable!==0;
 });
 if(passiveEggCoin(state))out=out.filter(a=>!(state.me?.hand??[]).some(c=>c.entityId===a.entityId&&isCoin(c)));
 const hand=state.me.hand??[];
 const tap=out.find(a=>(state.me.board??[]).some(c=>c.entityId===a.entityId&&c.CARDTYPE==='HERO_POWER'&&selfDamageCost(c)>0));
 const weaponBuff=weaponBuffAssessment(state,out,{admission});
 const safe=out.filter(a=>{
  // Terminal safety gate: earlier fallback filters must not resurrect Party
  // Fiend at 3 Health, nor allow forced_spend to pick a known fatal play.
  if(lethalSelfDamage(state,a))return false;
  const c=hand.find(c=>c.entityId===a.entityId);
  if(!pureBoardBuff(c))return true;
  const v=buffImpact(state,c);
  if(v?.recipients===0)return false;
  // New50 game9 T2: spare mana is not a reason to spend a permanent buff
  // on one newly summoned body against an empty board. No attack/trade payoff
  // exists this turn; hold it for development. Temporary buffs remain choices.
  const single=(state.me.board??[]).filter(x=>x.CARDTYPE==='MINION'&&!on(x,'DORMANT'));
  const emptyEnemy=!(state.opponent?.board??[]).some(x=>x.CARDTYPE==='MINION'&&!on(x,'DORMANT'));
  if(v?.recipients===1&&single.length===1&&on(single[0],'EXHAUSTED')&&emptyEnemy
   &&!c.temporary&&Number(state.me.maxMana)<=2)return false;
  const hp=(state.me.board??[]).find(c=>c.entityId===tap?.entityId);
  const foe=enemyHero(state);
  const canFinish=foe&&faceDamage(state,out)+Number(v?.attack??0)>=heroHp(foe);
  const ready=(state.me.board??[]).filter(x=>x.CARDTYPE==='MINION'&&!on(x,'DORMANT')&&!on(x,'EXHAUSTED')&&!on(x,'FROZEN'));
  const buffLethalPossible=foe&&faceDamage(state,out)+ready.length*Number(v?.attack??0)>=heroHp(foe);
  if(!buffLethalPossible&&weaponBuff?.preferred&&c.entityId===weaponBuff.buffId)return false;
  // General ordering invariant, independent of current board size/card names.
  // Keep lethal and immediate trade options; otherwise develop before this buff.
  if(!buffLethalPossible&&!singleBuffTradeGain(state,c,out)&&buffDevelopmentActions(state,out,c).length)return false;
  return !(v?.recipients===1&&tap&&costOf(c)+costOf(hp)>Number(state.me.mana)
   &&!singleBuffTradeGain(state,c,out)&&!canFinish);
 });
 if(trace){trace.admission=admission;trace.evidence=admissionEvidence(admission,safe);
  trace.fodderRelease=released;
  trace.ruleReleases=releases;
  trace.evidence.softHoldExemptions=actions.filter(a=>wasted.has(a.entityId)&&comboFirst.has(a.id)&&safe.some(x=>x.id===a.id)).map(a=>a.id);}
 return safe;
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
// Drawing and the hero power are optional turn intents. The power still waits while
// its mana would price out a card we must spend.
// A kill on the board is settled before this runs (bridge.mjs), so it never hides a lethal swing.
const heroPowerOf=state=>(state?.me?.board??[]).find(c=>c.CARDTYPE==='HERO_POWER');
// A target in our own hand is a battlecry picking a card (Ocular Occultist), never a swing --
// the log can list the minion on the board while its battlecry is still being chosen.
const isAttackAction=(state,a)=>a?.targetId!=null
 &&!(state?.me?.hand??[]).some(c=>c.entityId===a.targetId)
 &&(state?.me?.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE));
// Known multi-body recovery beats developing a location after a full clear.
// The real engine resolves the summon; do not promise immediate attacks or stats.
export function boardRecoveryActions(state,actions){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current||myMinions(state)>0)return [];
 const room=7-(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 return actions.filter(a=>{
  const c=(state.me.hand??[]).find(c=>c.entityId===a.entityId);
  return a.type==='POWER'&&c?.cardId==='CAP_805t'&&costOf(c)<=Number(state.me.mana)
   &&Math.min(room,c.resummons?.length??0)>=3;
 });
}
export function mustSpend(state,actions){
 const hand=state?.me?.hand??[];
 const hp=heroPowerOf(state);
 const mana=Number(state?.me?.mana??0);
 const develop=lowBoardDiscardActions(state,actions).length>0;
 const cards=actions.filter(a=>{
  const c=hand.find(x=>x.entityId===a.entityId);
  if(pureBoardBuff(c)&&buffImpact(state,c)?.recipients<=1&&!singleBuffTradeGain(state,c,actions))return false;
  return c&&!isCoin(c)&&!roles(c).includes('discard outlet')&&!roles(c).includes('draw')
   &&!(develop&&pureBoardBuff(c));
 });
 const hpCost=Number(hp?.COST??hp?.baseCost??2);
 // A body-then-Whispers line that is waiting to be played counts as one card of its whole cost.
 const w=hand.find(isWhispers);
 const line=w&&whispersWaits(state,w,actions)
  ?costOf(w)+Math.min(...actions.map(a=>hand.find(x=>x.entityId===a.entityId)).filter(makesBodies).map(costOf)):0;
 const refill=resourceDrawWindow(state);
 const pricedOut=!!hp&&(cards.some(a=>{
  const c=hand.find(x=>x.entityId===a.entityId);
  return !(refill&&pureBoardBuff(c))&&costOf(c)>mana-hpCost;
 })||line>mana-hpCost);
 const safeTap=!!hp&&myHeroHp(state)-selfDamageCost(hp)>incomingDamage(state);
 const power=actions.filter(a=>hp&&a.entityId===hp.entityId&&!pricedOut&&safeTap);
 return {cards,power,pricedOut};
}
export function setupFirst(state,actions){
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const mana=Number(state.me?.mana??0);
 const resting=locationResting(state);
 const buff=c=>c?.CARDTYPE==='SPELL'&&givesBoardBuff(c)&&!deadWhispers(state,c)
  &&(buffImpact(state,c)?.recipients>1||singleBuffTradeGain(state,c,actions));
 const coinBuys=hand.some(c=>buff(c)&&costOf(c)===mana+1);
 return actions.filter(a=>{
  if(board.some(c=>c.entityId===a.entityId&&c.CARDTYPE==='LOCATION'))return !resting(a);
  const c=hand.find(c=>c.entityId===a.entityId);
  return !!c&&(buff(c)&&costOf(c)<=mana||(isCoin(c)&&coinBuys));
 });
}
export function spendFirst(state,actions,{admission=combinationAdmission(state,actions),trace}={}){
 if(state?.choice)return actions;
 // DH has damage spells, delayed Sigils and generated cards whose order is a real choice.
 // Keep those alternatives (including saving a removal spell) available to the planner/Jev.
 if(isDH(state)){
  const tempo=dhTempoActions(state,actions);
  if(!tempo.length)return actions;
  const hp=heroPowerOf(state);
  return actions.filter(a=>a.type!=='END_TURN'&&a.entityId!==hp?.entityId);
 }
 const {cards,pricedOut}=mustSpend(state,actions);
 const hp=heroPowerOf(state);
 let out=actions;
 if(pricedOut)out=out.filter(a=>a.entityId!==hp.entityId);
 // Drawing is an optional intent, including Life Tap. It must not suppress
 // attacks or END_TURN merely because there is spare mana to pay for it.
 // Except the trades that free a slot the hand needs (game 58 turn 5, see landing()).
 const hero=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
 const minion=new Set((state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION').map(c=>c.entityId));
 const crowded=pendingBodies(state)>boardRoom(state);
 const trade=a=>crowded&&isAttackAction(state,a)&&a.entityId!==hero?.entityId&&minion.has(a.targetId);
 if(cards.length)out=out.filter(a=>a.type!=='END_TURN'&&(!isAttackAction(state,a)||trade(a)));
 // User ruling (2026-09-30, game 58, turn 3): 「地標也沒有先抽卡，所以最後損失了 buff 的傷害」. Five
 // minions swung, then Chamber of Viscidus, the Coin and Wicked Whispers went down -- the +1/+1
 // landed on minions that had already attacked. A ready location and a whole-board buff (or the
 // Coin that pays for one) come before the swings; only the crowded trades above stay beside them.
 if(setupFirst(state,out).length)out=out.filter(a=>!isAttackAction(state,a)||trade(a));
 // User ruling (2026-09-30, game 55, turn 5): 「為什麼剩 2 費不抽牌？又沒事做」. 27 Health, two
 // cards in hand, a full deck, and the menu was END_TURN or Life Tap; Jev ended at 0.58. When
 // the tap is the only other thing left and has survived every safety filter (constrainActions
 // already dropped overdraws, fatigue and taps that expose lethal), unspent mana is just waste.
 // Same game, turn 7: 4 mana, empty hand, the menu END_TURN / Life Tap / one hero swing, and
 // END_TURN again at 0.30 -- attacks left on the menu must not keep the turn-ender in. So the
 // rule is "no card left to play from hand", and the swings stay for Jev to order.
 const fromHand=out.some(a=>(state?.me?.hand??[]).some(c=>c.entityId===a.entityId));
 const tapOn=hp&&out.some(a=>a.entityId===hp.entityId);
 if(tapOn&&!fromHand&&drawCount(hp)>0&&!pricedOut
  &&myHeroHp(state)-selfDamageCost(hp)>incomingDamage(state))out=out.filter(a=>a.type!=='END_TURN');
 // Here, not in constrainActions: a lethal that needs the buff now is found on the full menu first.
 {const log=[];out=releasing(state,out,bodyBeforeBuff(state,out),'bodyBeforeBuff',log,{fodderHold:[...wastedFodder(state)]});
  if(trace)trace.ruleReleases=[...(trace.ruleReleases??[]).filter(r=>r.rule!=='bodyBeforeBuff'),...log];}
 // An attack that triggers the proved development is setup, not premature
 // combat. Restore only that game's offered first step, never arbitrary attacks.
 const first=admittedFirstIds({lines:admittedLines(admission,actions)});
 for(const id of comparisonFirstIds(admission))first.add(id);
 for(const a of actions)if(first.has(a.id)&&isAttackAction(state,a)&&!out.includes(a))out.push(a);
 // A shield pop may have an unknown Deathrattle. Keep the one-step
 // information boundary as an alternative to committing mana/high damage.
 // Never restore it ahead of a beneficial buff that is already waiting.
 const buffWaiting=setupFirst(state,actions).some(a=>{
  const c=(state.me?.hand??[]).find(c=>c.entityId===a.entityId);
  return !!c&&(buffImpact(state,c)||isCoin(c));
 });
 if(!buffWaiting){
  const pops=new Set(divineShieldAssessment(state,actions).flatMap(i=>i.lowAttackIds));
  for(const a of actions)if(pops.has(a.id)&&!out.includes(a))out.push(a);
 }
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
