// A small, honest simulator for the part of a turn that is arithmetic.
//
// Jev scores one option at a time, so a turn that needs three attacks in the right order -- kill
// the Taunt, then go face -- exists in none of its options. The answer is not more prose; it is
// to compute the sequences and hand Jev whole plans to choose between. That needs a model of what
// each step does, and the model must never pretend: a step it cannot predict is marked inexact,
// the plan ends there, and the turn is re-planned from the real board after it.
//
// Exact in the supported subset: combat arithmetic, fixed bodies/buffs, unique
// lowest/highest discards summoning Walking Dead/Golem/Spiders and Duke growth.
// Unknown draws, ties, random damage/summons, choices and unmodelled triggers stop the plan.

import {textOf,heroAttackGain,ignoresTaunt,immediateDraws} from './mechanics.mjs';
import {drawImpact} from './draw-risk.mjs';
import {assessEffect} from './effect-state.mjs';
import {discardModel,discardGrowth} from './discard-model.mjs';
import {matchupObjective} from './matchup-objective.mjs';
const flat=t=>textOf({text:t});
const on=(c,tag)=>c?.[tag]===1||c?.[tag]==='1';
const num=v=>Number(v??0);
const cost=c=>num(c?.COST??c?.baseCost);
const silenced=c=>on(c,'SILENCED');
// A keyword counts when the tag says so, or -- for a card whose tags are not set yet -- its text.
// Only the keyword list the text opens with is the card's own: Sickly Grimewalker's "give it
// Poisonous" made the 2/4 itself Poisonous, so the Duke never attacked it (10-05 batch, game 1,
// turn 5). Power.log omits tags whose value is 0, so on the board this fallback is the common case.
const OWN_KEYWORDS=/^(?:\s*(?:taunt|rush|charge|divine shield|windfury|mega-windfury|stealth|poisonous|lifesteal|reborn|elusive|magnetic|tradeable|echo|twinspell|spell damage \+\d+|colossal \+\d+)\s*[.,]?\s*(?:and\b)?)+/i;
// The tag and the silence are read every time; only what the text says is kept, per text and word.
const OWN_KW=new Map();
const ownKeyword=(text,word)=>{
  let byText=OWN_KW.get(word);
  if(!byText)OWN_KW.set(word,byText=new Map());
  let v=byText.get(text);
  if(v===undefined){
    v=new RegExp(`\\b${word}\\b`,'i').test(flat(text).replace(/all friendly attacks ignore taunt\.?/i,'').match(OWN_KEYWORDS)?.[0]??'');
    if(byText.size>=20000)byText.clear();
    byText.set(text,v);
  }
  return v;
};
const kw=(c,tag,word)=>c?.[tag]!=null?on(c,tag):(!silenced(c)&&ownKeyword(c?.text,word));

// Things that happen in combat the model does not follow. Any of them on a participant makes the
// swing inexact. Deathrattle and Reborn only matter when the body actually dies.
// Match the event before the comma, not its reward: Mana Wyrm's
// "Whenever you cast a spell, gain +1 Attack" does not trigger during combat.
const COMBAT_TRIGGER=/\b(?:after|whenever|when)\b[^.,]*\b(?:attacks?|damaged?|dies|die|destroy|kills?)\b|\boverkill\b|\bfrenzy\b|\bhonorable kill\b|\bspellburst\b/i;
const ON_DEATH=/\bdeathrattle\b|\breborn\b/i;
// Text a card hands to others sits in quotes: Braingill's Battlecry gives Murlocs "Deathrattle:
// Draw a card." and has none itself. Reading it as its own Deathrattle cut every plan that killed it.
const ownText=t=>(t??'').replace(/"[^"]*"/g,'');
// An enemy whose every effect is "draw a card" only grows their hand: the board stays exact.
// Treating Chillfallen Baron and Acolyte of Death as unpredictable ended every plan at the first
// kill, so the menu never held the clear "1/1 Rush takes one, Duke the other" (10-05, game 5, turn 6).
const DRAW_CLAUSE=/(?:(?:battlecry and )?deathrattle|battlecry|(?:after|whenever) [^.,:]*):?,?\s*draw (?:a|\d+) cards?\.?/gi;
const enemyDrawOnly=b=>{const t=ownText(b?.text);return b?.side==='opp'&&!!t.match(DRAW_CLAUSE)&&!t.replace(DRAW_CLAUSE,'').trim()};
// Chronoclaws: the swing is plain arithmetic; only the hand changes, and predictably so.
const DISCARD_HIGH=/^after your hero attacks, discard your highest cost card\.?$/i;

export function body(c,side){
  const hp=num(c.HEALTH??c.baseHealth)-num(c.DAMAGE);
  return {id:c.entityId,cardId:c.cardId,effectAssessment:assessEffect(c,{zone:'PLAY'}),side,type:c.CARDTYPE,name:c.name,text:silenced(c)?'':flat(c.text),
    atk:num(c.ATK??c.baseAttack),hp,maxHp:num(c.HEALTH??c.baseHealth),armor:num(c.ARMOR),
    legendary:!!c.legendary,
    race:c.race??null,
    taunt:kw(c,'TAUNT','taunt'),ds:on(c,'DIVINE_SHIELD'),stealth:on(c,'STEALTH'),
    poison:kw(c,'POISONOUS','poisonous'),lifesteal:kw(c,'LIFESTEAL','lifesteal'),
    windfury:kw(c,'WINDFURY','windfury'),rush:kw(c,'RUSH','rush'),ignoreTaunt:ignoresTaunt(c),
    reborn:kw(c,'REBORN','reborn'),
    exhausted:on(c,'EXHAUSTED'),
    zeroReady:c.CARDTYPE==='MINION'&&num(c.ATK??c.baseAttack)===0
      &&(c.EXHAUSTED===0||c.EXHAUSTED==='0')&&!on(c,'FROZEN')&&!on(c,'DORMANT'),
    dormant:on(c,'DORMANT'),immune:on(c,'IMMUNE'),frozen:on(c,'FROZEN'),elusive:on(c,'ELUSIVE'),
    attacks:num(c.NUM_ATTACKS_THIS_TURN)};
}

// The planning view of a public state. `canAttack` and `targets` come from the game's own options
// at the start, because only the game knows about summoning sickness, Rush and odd restrictions.
// `full` (eval-sim-fidelity.mjs only) also models the cards the live search leaves out on purpose:
// Discovers, targeted burn with a random discard, locations and their activation. Most of these
// steps are inexact; they exist so a replay or a rollout can take them, not so a plan can run past them.
export function fromState(state,actions=[],{full=false}={}){
  // A minion at 0 Health is already dead; the log just has not moved it to the graveyard yet.
  const live=b=>b.type==='HERO'||b.hp>0;
  const mine=(state.me.board??[]).filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(c=>body(c,'me')).filter(live);
  const theirs=(state.opponent.board??[]).filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(c=>body(c,'opp')).filter(live);
  const weapon=(state.me.board??[]).find(c=>c.CARDTYPE==='WEAPON');
  const locations=(state.me.board??[]).filter(c=>c.CARDTYPE==='LOCATION').length;
  const t0=new Map();
  for(const a of actions)if(a.targetId!=null&&mine.some(b=>b.id===a.entityId)){
    if(!t0.has(a.entityId))t0.set(a.entityId,new Set());
    t0.get(a.entityId).add(a.targetId);
  }
  const oppHero=theirs.find(b=>b.type==='HERO');
  const tauntUp=theirs.some(guards);
  for(const b of mine){
    b.canAttack=t0.has(b.id);
    b.targets=t0.get(b.id)??new Set();
    // Rush on its first turn: may swing at minions only. Visible directly when nothing guards the
    // hero; behind a Taunt it cannot be told, so a Rush body is assumed to be the rush-only kind.
    b.rushOnly=b.canAttack&&!!oppHero&&!b.targets.has(oppHero.id)&&(!tauntUp||b.rush);
    b.maxAttacks=b.windfury?2:1;
  }
  const plays=new Set(actions.filter(a=>a.targetId==null&&(state.me.hand??[]).some(c=>c.entityId===a.entityId)).map(a=>a.entityId));
  // A battlecry that discards a chosen card is offered once per hand target.
  const inHand=id=>(state.me.hand??[]).some(c=>c.entityId===id);
  for(const a of actions)if(a.targetId!=null&&inHand(a.entityId)&&inHand(a.targetId))plays.add(a.entityId);
  // Game 19 (2026-09-29), turn 14: on a full board the game offers no minion from hand, so Duke of
  // Below, 16/16 Rush, was never searched; a 1/1 popping Taelan's shield would have made the room.
  // A minion the mana covers is playable once a death frees a slot (moves() checks the room).
  if(mine.filter(b=>b.type==='MINION').length+locations>=7)
    for(const c of state.me.hand??[])if(c.CARDTYPE==='MINION'&&cost(c)<=num(state.me.mana))plays.add(c.entityId);
  const aims=new Map(),sites=[];
  if(full){
    for(const a of actions)if(inHand(a.entityId)){
      plays.add(a.entityId);
      if(a.targetId!=null&&!inHand(a.targetId))aims.set(a.entityId,[...(aims.get(a.entityId)??[]),a.targetId]);
    }
    for(const c of state.me.board??[])if(c.CARDTYPE==='LOCATION')
      sites.push({...weaponBody(c),ready:actions.some(a=>a.entityId===c.entityId)});
  }
  const hp=(state.me.board??[]).find(c=>(heroAttackGain(c)>0||immediateDraws(c,state)>0)
    &&actions.some(a=>a.entityId===c.entityId&&a.targetId==null));
  return {objective:matchupObjective(state),mana:num(state.me.mana),hand:(state.me.hand??[]).map(c=>handCard(c,plays.has(c.entityId))),
    me:mine,opp:theirs,weapon:weapon?weaponBody(weapon):null,
    power:hp?{id:hp.entityId,name:hp.name,cost:cost(hp),gain:heroAttackGain(hp),draw:immediateDraws(hp,state),
      selfHit:Number(/take \$?(\d+)\s*damage/i.exec(flat(hp.text))?.[1]??0),used:on(hp,'EXHAUSTED')}:null,
    drawState:{me:{deckCount:state.me.deckCount,fatigue:state.me.fatigue,drawHazards:state.me.drawHazards}},
    locations,tauntAtStart:tauntUp,faceDealt:0,nextToken:0,...(full?{full,aims,sites}:{})};
}

export const handCard=(c,playable)=>({id:c.entityId,name:c.name,type:c.CARDTYPE,cost:cost(c),text:flat(c.text),
  atk:num(c.ATK??c.baseAttack),hp:num(c.HEALTH??c.baseHealth),raw:c,playable});
const weaponBody=c=>({id:c.entityId,name:c.name,text:flat(c.text),atk:num(c.ATK??c.baseAttack),
  durability:c.HEALTH!=null||c.baseHealth!=null?num(c.HEALTH??c.baseHealth)-num(c.DAMAGE)
    :c.DURABILITY!=null?num(c.DURABILITY):null});
const clone=s=>({...s,hand:s.hand.map(c=>({...c})),me:s.me.map(b=>({...b})),opp:s.opp.map(b=>({...b})),
  weapon:s.weapon&&{...s.weapon},power:s.power&&{...s.power}});
const room=s=>7-s.me.filter(b=>b.type==='MINION').length-s.locations;
const guards=b=>b.type==='MINION'&&b.taunt&&!b.stealth&&!b.dormant;
export const hero=(s,side)=>(side==='me'?s.me:s.opp).find(b=>b.type==='HERO');
export const hpOf=b=>b?b.hp+b.armor:0;

// What a card from hand does, if the model can say exactly. null means: not a plan step.
const KEYWORDS=/\b(?:taunt|rush|charge|divine shield|windfury|stealth|poisonous|lifesteal)\b/gi;
const BUFF=/^give your (other )?minions \+(\d+)\/\+(\d+)\.?$/i;
const IGNORABLE=/^shuffle [^.]* into your deck\.?$/i;         // deck contents are not on the board
const DISCARD_LOW=/^discard your lowest cost card\.?$/i;
// Battlecries whose whole effect is fixed: summon N plain X/Y tokens (keywords allowed), and a
// flat hit to your own hero. Anything else in the text -- "for your opponent", "for each", a
// random or conditional clause -- leaves the minion unmodelled.
const COUNT={a:1,an:1,one:1,two:2,three:3};
const SUMMON=/^battlecry: summon (a|an|one|two|three) (\d+)\/(\d+) [a-z' -]+?(?: with ((?:(?:taunt|rush|divine shield|poisonous|lifesteal|windfury|stealth)(?:,? and |, | )?)+))?\.?$/i;
const CHOOSE_DISCARD=/battlecry: choose a card in your hand to discard\.?/i;
const SELF_HIT=/^deal (\d+) damage to your hero\.?$/i;
// Entropic Continuity, Twilight Timehopper, Tachyon Barrage: Shreds of Time go into the deck.
const SHREDS=/^(?:battlecry: )?shuffle (\d+|a|an|one|two|three) shreds? of time into your deck\.?$/i;
const SHRED_NOTE=/^when drawn, deal \d+ damage to your hero\.?$/i;  // the Shred's own text, reminded
const shredCount=m=>COUNT[m[1].toLowerCase()]??Number(m[1]);
export function cardModel(c){
  if(c.type==='SPELL'&&/^gain 1 mana crystal this turn only\.?$/i.test(c.text))return {kind:'mana',gain:1};
  if(c.type==='SPELL'){
    const d=discardModel(c);
    if(d.kind==='randomBodies')return {kind:'randomSummon',n:d.n,cost:d.cost};
  }
  // Kayn's continuous aura is recalculated from the surviving board after every swing.
  if(c.type==='MINION'&&/^charge\s+all friendly attacks ignore taunt\.?$/i.test(c.text))return {kind:'minion'};
  // Equip itself is deterministic; Scythe's generated card makes its later swing terminal.
  // Game 16 (2026-09-29), turn 16: Chronoclaws in hand was left out of the search, which then
  // missed ten damage of lethal. Its discard is simulated on the swing, like an equipped one.
  if(c.type==='WEAPON'&&(!c.text||/^after your hero attacks, get a void soul\.?$/i.test(c.text)||DISCARD_HIGH.test(c.text)))return {kind:'weapon'};
  if(c.type==='MINION'){
    let summon=null,selfHit=0,shreds=0;
    // Duke of Below: the growth is already in the tags, so it is a statline, not an effect.
    let text=c.text.replace(/\b(?:has|gains) \+\d+\/\+\d+ for each card you'?ve discarded this game\.?/i,'');
    if(discardModel(c).kind==='body')text=text.replace(/If you discard this minion, summon it\.?/i,'');
    // Ocular Occultist: the discard is the player's pick, carried by the step's targetId.
    const pick=CHOOSE_DISCARD.test(text);
    text=text.replace(CHOOSE_DISCARD,'');
    for(const p of text.split(/(?<=\.)\s+/).filter(Boolean)){
      const m=/\b(?:for|each|if|random|opponent)\b/i.test(p)?null:SUMMON.exec(p);
      if(m&&!summon){summon={n:COUNT[m[1].toLowerCase()],atk:Number(m[2]),hp:Number(m[3]),with:(m[4]??'').toLowerCase()};continue}
      const h=SELF_HIT.exec(p);
      if(h){selfHit+=Number(h[1]);continue}
      const sh=SHREDS.exec(p);
      if(sh){shreds+=shredCount(sh);continue}
      if(shreds&&SHRED_NOTE.test(p))continue;
      if(p.replace(KEYWORDS,'').replace(/[\s.,]/g,''))return null;
    }
    return {kind:'minion',...(summon?{summon}:{}),...(selfHit?{selfHit}:{}),...(shreds?{shreds}:{}),...(pick?{chooseDiscard:true}:{})};
  }
  if(c.type!=='SPELL')return null;
  if(/^draw (?:a|an|one|two|three|\d+) cards?\.(?: they are temporary\.| at the end of turn, discard them\.)?$/i.test(c.text))
    return {kind:'draw',n:immediateDraws(c.raw)};
  const parts=c.text.split(/(?<=\.)\s+/).filter(Boolean);
  let buff=null,discard=false,shreds=0;
  for(const p of parts){
    const m=BUFF.exec(p);
    if(m){buff={other:!!m[1],atk:Number(m[2]),hp:Number(m[3])};continue}
    if(DISCARD_LOW.test(p)){discard=true;continue}
    const sh=SHREDS.exec(p);
    if(sh){shreds+=shredCount(sh);continue}
    if(IGNORABLE.test(p))continue;
    return null;
  }
  return buff?{kind:'buff',...buff,discard,...(shreds?{shreds}:{})}:null;
}
// Rule-release searches only (rule-release.mjs, s.additive): a minion whose battlecry draws is a
// body plus unknown cards, like Platysaur ("Battlecry: Draw a card. Deathrattle: Discard it.").
// The ordinary search leaves it unmodelled. Its Deathrattle is the death check's business: a
// trade that kills it already ends the plan there.
const BATTLECRY_DRAW=/^battlecry: draw (a|an|one|two|three) cards?\.?$/i;
export function drawMinionModel(c){
  if(c?.type!=='MINION')return null;
  let n=0;
  for(const p of c.text.split(/(?<=\.)\s+/).filter(Boolean)){
    const m=BATTLECRY_DRAW.exec(p);
    if(m){n+=COUNT[m[1].toLowerCase()];continue}
    if(/^deathrattle:/i.test(p))continue;
    if(p.replace(KEYWORDS,'').replace(/[\s.,]/g,''))return null;
  }
  return n?{kind:'minion',draw:n}:null;
}
// Earlier unknown draws in the same plan (pastAdditive) still take hand space and deck cards.
const drawFrom=(s,n)=>{
  const k=s.drawnUnknown??0,d=s.drawState.me.deckCount;
  return drawImpact({me:{...s.drawState.me,deckCount:k&&d!=null?Math.max(0,Number(d)-k):d,hand:[...s.hand,...Array(k).fill({})]}},n);
};
// s.full only. Cursed Catacombs, Soulfire, Soul Barrage, any location, and a body whose only text
// is its Deathrattle (Boneweb Egg; Platysaur through drawMinionModel).
const DISCOVER_DECK=/^discover another card from your deck\. make it temporary\.?$/i;
const BOLT=/^deal (\d+) damage\. discard a random card\.?$/i;
const BARRAGE=/^when you play or discard this, deal (\d+) damage randomly split among all enemies\.?$/i;
const SPLIT=/^deal (\d+) damage (?:randomly )?split among all enemies\.?$/i;
const SITE_DISCARD_DRAW=/^look at 3 cards in your hand and choose one to discard\. draw two cards\.?$/i;
export function fullModel(c){
  if(c?.type==='LOCATION')return {kind:'location'};
  if(c?.type==='SPELL'){
    if(DISCOVER_DECK.test(c.text))return {kind:'discover'};
    const b=BOLT.exec(c.text);if(b)return {kind:'bolt',damage:Number(b[1])};
    const r=BARRAGE.exec(c.text);if(r)return {kind:'barrage',damage:Number(r[1])};
    // Tachyon Barrage: the split damage, then the Shreds.
    let split=0,shreds=0;
    for(const p of c.text.split(/(?<=\.)\s+/).filter(Boolean)){
      const d=SPLIT.exec(p);if(d&&!split){split=Number(d[1]);continue}
      const sh=SHREDS.exec(p);if(sh){shreds+=shredCount(sh);continue}
      split=0;break;
    }
    if(split)return {kind:'barrage',damage:split,...(shreds?{shreds}:{})};
    return null;
  }
  if(c?.type!=='MINION')return null;
  const draws=drawMinionModel(c);
  if(draws)return draws;
  let death=false;
  for(const p of c.text.split(/(?<=\.)\s+/).filter(Boolean)){
    if(/^deathrattle:/i.test(p)||/^if you discard this, trigger its deathrattle\.?$/i.test(p)){death=true;continue}
    if(p.replace(KEYWORDS,'').replace(/[\s.,]/g,''))return null;
  }
  return death?{kind:'minion'}:null;
}
// s.game only (self-play): warlock-zoo cards whose effect needs the whole game -- the other
// side's next turn, board positions, the deck. Live play leaves them unmodelled as before.
const NEOPHYTE=/^battlecry: your opponent's spells cost \((\d+)\) more next turn\.?$/i;
const ADJACENT=/^battlecry and deathrattle: give adjacent minions \+(\d+)\/\+(\d+)\.?$/i;
const WHELP_EGG=/^deathrattle: summon a \S+ whelp\. \(gains \+1\/\+1 at the start of your turns!\)$/i;
const GUARDS=/^summon (a|an|one|two|three) (\d+)\/(\d+) [a-z' -]+? with taunt\. assemble a minion\.?$/i;
const TWICE=/^deal (\d+) damage to all enemies\. if this is the highest cost card in your hand, do it again\.?$/i;
const COPY_SHRED=/^rush battlecry: cast a shred of time from your deck to summon a copy of this\.?$/i;
const FATEBREAKER=/^lifesteal battlecry: cast a shred of time from your deck to gain \+3\/\+3\.?$/i;
const SPELL_AURA=/^all spells cost \((\d+)\) more\.?$/i;
const RITUAL_SUMMON=/^in 2 turns, summon two 3\/5 c'thraxxi with taunt\.?$/i;
const RITUAL_CTHUN=/^in 2 turns, choose a c'thun ability to trigger\.?$/i;
const LESSONS=/^give a minion and a random one in your hand stats equal to double this card's cost\.?$/i;
// Where a minion goes: one that buffs its neighbours (Vaultkeeper) wants one on each side, so with two or more minions
// on the board it goes in the middle; everything else goes to the right end. Slot counts minions only, from the left.
export function adjacentSlot(text,n){
  return ADJACENT.test(flat(text??''))&&n>=2?Math.floor(n/2):n;
}
const PLOT=/^battlecry: plot a custom sham trial! then choose the trial's length\.?$/i;
// The C'Thun demon hunter (decks/dh-cthun). Texts are the flat ones of the database.
const STUDIES=/^discover an outcast card\. your next one costs \(1\) less\.?$/i;
const HARVEST=/^draw a card\. summon a random dormant dreadseed\.?$/i;
const SLUMBER=/^choose one - summon two dormant dreadseeds; or deal \$?2 damage to all minions\.?$/i;
const INFEST=/^get two 1-cost gorishi stingers\. each one deals \$?2 damage and summons a 2\/1 grub with rush\.?$/i;
const STING=/^deal \$?2 damage\. summon a 2\/1 grub with rush\.?$/i;
const LAST_STAND=/^deal \$?1 damage to all minions\. draw a card for each that died\.?$/i;
const SIGIL=/^at the start of your next turn,\s*summon a 3\/3 naga with taunt\./i;
const CAVERN=/^lifesteal\. deal \$?2 damage\. if a friendly minion died this turn, this costs \(0\)\.?$/i;
const PORTAL=/^summon an? ([1-4])\/1 demon for your opponent\. when it dies, (?:draw a card and shuffle the next portal into your deck|broxigar reappears in your hand)\.?$/i;
const FREEZE=/^battlecry: freeze an enemy\.?$/i;
const ZAKAJZ=/^battlecry: reduce the cost of minions in your hand and deck by \((\d+)\) and increase the cost of spells by \((\d+)\)\.?$/i;
const XAVIUS=/^battlecry: discover a minion from your deck\. give it a dark gift\.?$/i;
const SLITHERER=/^taunt battlecry: choose a c'thun ability to trigger\.?$/i;
const SPAWN=/^battlecry: if c'thun started in your deck, choose one of its abilities to trigger\.?$/i;
const OLD_GOD=/^old god\. if you've triggered all 4 c'thun abilities this game, this minion's abilities are tripled\.?$/i;
const BROXIGAR=/^fabled, charge start of game: disappear\. kill all 4 demons from argus to reappear in hand\.?$/i;
const REMNANT=/^costs \(1\) less for each minion that died this turn\. battlecry: draw 2 cards\.?$/i;
const AXE=/^lifesteal after your hero attacks and kills a minion, draw a portal to argus\.?$/i;
const LASH=/^after your hero attacks, reduce the cost of c'thun by \(1\)\. choose a c'thun ability to trigger\.?$/i;
// decks/priest-egg (2026-10-27). The Egg of Khelos breaks through five 0/3 bodies to a 20/20 Taunt;
// Medivh's Triumph and the clears; N'Zoth's cost; the rest of the list.
const EGG=/^deathrattle: summon (?:a|the) (?:slightly |more |very |most )*cracked egg\./i;
const EGG_NEXT={DINO_410:'DINO_410t2',DINO_410t2:'DINO_410t3',DINO_410t3:'DINO_410t4',DINO_410t4:'DINO_410t5',DINO_410t5:'DINO_410t'};
const NZOTH=/^old god cost \(1\) less for each deathrattle minion you've summoned this game\.?$/i;
const FORESIGHT=/^draw a card and reduce its cost by \(2\)\./i;
const SERVANT=/^battlecry: silence a minion\.?$/i;
const HAUNT=/^give a minion \+2\/\+3, reborn, and taunt\.?$/i;
const SLIME=/^destroy all minions\. each player gets a 3-cost spell that resummons theirs\.?$/i;
const ECTOPLASM=/^resummon all friendly minions that were slimed\.?$/i;
const MEDIVH=/^deal 4 damage to all minions\. costs \(1\) if you control a legendary card\.?$/i;
const SMITE=/^deal 3 damage to a minion\.?$/i;
const RUIN=/^destroy all minions with 5 or more attack\.?$/i;
const EGGBEARER=/^battlecry: draw a 0-attack minion\.?$/i;
const PRIESTESS=/^battlecry: give all enemy minions -2 attack until your next turn\. imbue your hero power\.?$/i;
const FIREBOLT=/^lifesteal deal 3 damage to a minion\. if it dies, return this to your hand at the end of your turn\.?$/i;
const HOLD_OFF=/^prepare give a minion \+5\/\+5 and lifesteal\.?$/i;
const UNDEATH=/^trigger the deathrattle of a random friendly minion that died this game\.?$/i;
const UMBRA=/^battlecry: trigger the deathrattles of 5 friendly minions that died this game\.?$/i;
const OOZE=/^battlecry: destroy a friendly minion\./i;
const SUNBLOOM=/^draw 2 cards\. kindred: this costs \(2\) less\.?$/i;
const SOOTHSAYER=/^prepare, taunt deathrattle: restore #?6 health to your hero\. summon a random 6-cost minion\.?$/i;
// decks/priest-egg, the Imbue build (2026-10-27): Imbue turns the Hero Power into Blessing of the Moon
// (EDR_449p) and each further Imbue makes its card one cheaper; the copies of the opponent's deck.
const LUNARWING=/^lifesteal battlecry: imbue your hero power.?$/i;
const FATE=/^discover a copy of a card from your deck and one from your opponent's.?$/i;
const CONJURER=/^battlecry: copy a card in your opponent['’]s deck and add it to your hand.?$/i;
const BARRIER=/^give a character divine shield. give minions in your hand \+2 health.?$/i;
const LIGHTSPAWN=/^lifesteal battlecry: deal damage to an enemy minion equal to this minion's health.?$/i;
const SMUGGLER=/^prepare. battlecry: give a friendly minion \+2 attack and rush.?$/i;
const FLAY=/^deal 3 damage to a random enemy./i;
// The Outcast cards Illidari Studies can find; the bonus fires from either end of the hand.
// decks/shaman-cthun (2026-10-27): Eyemaul and Tiny Pal's swings, the elementals, Warden Maiev,
// Wailing Vapor, Hijacked Securitybot, Skywall Sentinel's Herald, Unstable Prototype, the Discovers.
const EYEMAUL=/^after your hero attacks, summon two 2\/2 elementals with rush\.?$/i;
const TINY_PAL=/elemental ammunition/i;
const MUGZEE=/^start of game: if your deck has no other minions/i;
const WARDEN=/^after you play a minion, give it \+3\/\+3 and make it go dormant for 1 turn\.?$/i;
const VAPOR=/^after you play an elemental, gain \+1 attack\.?$/i;
const SECURITY=/^prepare battlecry: give your other minions \+1\/\+1\.?$/i;
const UNSTABLE=/^reborn deathrattle: give all minions in your hand \+1\/\+1\.?$/i;
const FIREFLY=/^battlecry: add a 1\/2 elemental to your hand\.?$/i;
const WATFIN=/^battlecry: discover a minion\. pick the suspicious one to gain \+1\/\+1\.?$/i;
const MADNESS=/^battlecry: discover any spell with cost equal to this minion's attack\./i;
const APPRENTICE=/^taunt battlecry: add a random shaman spell to your hand\.?$/i;
const HERALD=/^taunt battlecry: herald \{0\}\.?$/i;
const RUNNER=/^outcast: draw a card\.?$/i;
const SIGHT=/^draw a card\. outcast: draw another\.?$/i;
const GLAIVE=/^outcast: give your hero \+3 attack this turn\.?$/i;
const FELBLADE=/^rush outcast: gain immune this turn\.?$/i;
const VOIDLORD=/^taunt deathrattle: summon three (\d+)\/(\d+) demons with taunt\.?$/i;
export function gameModel(c){
  if(c?.type==='SPELL'){
    // The trial card Godfather Kazakus plotted: it carries its length and its two effects.
    if(c.trial)return {kind:'trial',turns:c.trial.turns};
    if(RITUAL_SUMMON.test(c.text))return {kind:'ritual',turns:2,effect:'summon'};
    if(RITUAL_CTHUN.test(c.text))return {kind:'ritual',turns:2,effect:'cthun'};
    if(LESSONS.test(c.text))return {kind:'lessons'};
    const g=GUARDS.exec(c.text);
    if(g)return {kind:'tokens',summon:{n:COUNT[g[1].toLowerCase()],atk:Number(g[2]),hp:Number(g[3]),with:'taunt',name:'Depthguard'}};
    const t=TWICE.exec(c.text);if(t)return {kind:'blast',damage:Number(t[1]),again:true};
    if(STUDIES.test(c.text))return {kind:'studies'};
    if(HARVEST.test(c.text))return {kind:'harvest'};
    if(SLUMBER.test(c.text))return {kind:'slumber'};
    if(INFEST.test(c.text))return {kind:'infest'};
    if(STING.test(c.text))return {kind:'sting'};
    if(LAST_STAND.test(c.text))return {kind:'laststand'};
    if(SIGIL.test(c.text))return {kind:'ritual',turns:1,effect:'naga'};
    if(CAVERN.test(c.text))return {kind:'cavern'};
    const p=PORTAL.exec(c.text);if(p)return {kind:'portal',stage:Number(p[1])};
    if(SIGHT.test(c.text))return {kind:'draw',n:1,outcast:{draw:1}};
    // decks/priest-egg
    if(FORESIGHT.test(c.text))return {kind:'drawReduce',n:1,cut:2};
    if(HAUNT.test(c.text))return {kind:'buffMinion',atk:2,hp:3,taunt:true,reborn:true,target:'any'};
    if(SLIME.test(c.text))return {kind:'slime'};
    if(ECTOPLASM.test(c.text))return {kind:'ectoplasm'};
    if(MEDIVH.test(c.text))return {kind:'aoe',damage:4};
    if(SMITE.test(c.text))return {kind:'boltMinion',damage:3,target:'any'};
    if(FIREBOLT.test(c.text))return {kind:'boltMinion',damage:3,lifesteal:true,returnOnKill:true,target:'any'};
    if(RUIN.test(c.text))return {kind:'ruin'};
    if(HOLD_OFF.test(c.text))return {kind:'buffMinion',atk:5,hp:5,lifesteal:true,target:'any'};
    if(UNDEATH.test(c.text))return {kind:'undeath',n:1};
    if(SUNBLOOM.test(c.text))return {kind:'draw',n:2};
    if(FATE.test(c.text))return {kind:'fate'};
    if(BARRIER.test(c.text))return {kind:'barrier',target:'friend',optional:true};
    if(FLAY.test(c.text))return {kind:'flay',damage:3};
    return null;
  }
  if(c?.type==='WEAPON')return AXE.test(c.text)||LASH.test(c.text)||EYEMAUL.test(c.text)||TINY_PAL.test(c.text)?{kind:'weapon'}:null;
  if(c?.type!=='MINION')return null;
  // decks/priest-egg
  if(EGG.test(c.text))return {kind:'minion',egg:true};
  if(SOOTHSAYER.test(c.text))return {kind:'minion'};
  if(NZOTH.test(c.text))return {kind:'minion',nzoth:true};
  if(SERVANT.test(c.text))return {kind:'minion',silence:true,target:'any'};
  if(EGGBEARER.test(c.text))return {kind:'minion',drawZeroAtk:true};
  if(PRIESTESS.test(c.text))return {kind:'minion',priestess:true,imbue:true};
  if(LUNARWING.test(c.text))return {kind:'minion',imbue:true};
  if(CONJURER.test(c.text))return {kind:'minion',conjurer:true};
  if(LIGHTSPAWN.test(c.text))return {kind:'minion',lightspawn:true,target:'enemy',optional:true};
  if(SMUGGLER.test(c.text))return {kind:'minion',smuggler:true,target:'friend',optional:true};
  if(UMBRA.test(c.text))return {kind:'minion',umbra:5};
  if(OOZE.test(c.text))return {kind:'minion',ooze:true,target:'friend'};
  const z=ZAKAJZ.exec(c.text);if(z)return {kind:'minion',zakajz:{down:Number(z[1]),up:Number(z[2])}};
  if(FREEZE.test(c.text))return {kind:'minion',freeze:true};
  if(XAVIUS.test(c.text))return {kind:'minion',xavius:true};
  if(SLITHERER.test(c.text))return {kind:'minion',cthun:'always'};
  if(SPAWN.test(c.text))return {kind:'minion',cthun:'started'};
  if(OLD_GOD.test(c.text))return {kind:'minion',oldGod:true};
  if(BROXIGAR.test(c.text)||FELBLADE.test(c.text))return {kind:'minion'};
  if(REMNANT.test(c.text))return {kind:'minion',draw:2,keep:true};
  if(RUNNER.test(c.text))return {kind:'minion',outcast:{draw:1}};
  if(GLAIVE.test(c.text))return {kind:'minion',outcast:{hero:3}};
  if(PLOT.test(c.text))return {kind:'minion',plot:true};
  const n=NEOPHYTE.exec(c.text);if(n)return {kind:'minion',tax:Number(n[1])};
  const a=ADJACENT.exec(c.text);if(a)return {kind:'minion',adjacent:{atk:Number(a[1]),hp:Number(a[2])}};
  if(COPY_SHRED.test(c.text))return {kind:'minion',copyShred:true};
  if(FATEBREAKER.test(c.text))return {kind:'minion',fatebreaker:true};
  if(WHELP_EGG.test(c.text)||SPELL_AURA.test(c.text))return {kind:'minion'};
  // decks/shaman-cthun
  if(MUGZEE.test(c.text))return {kind:'minion'};                    // its Start-of-Game power is not modelled
  if(WARDEN.test(c.text))return {kind:'minion',warden:true};
  if(VAPOR.test(c.text))return {kind:'minion',vapor:true};
  if(SECURITY.test(c.text))return {kind:'minion',buffOthers:{atk:1,hp:1}};
  if(UNSTABLE.test(c.text))return {kind:'minion'};                  // Reborn in the body, the Deathrattle in reap
  if(FIREFLY.test(c.text))return {kind:'minion',addToken:'Flame Elemental'};
  if(WATFIN.test(c.text))return {kind:'minion',discoverMinion:1};
  if(MADNESS.test(c.text)||APPRENTICE.test(c.text))return {kind:'minion'};  // the generated spell is left out
  if(HERALD.test(c.text))return {kind:'minion',herald:true};
  return null;
}
// What a card costs to play now. Live tags already carry every aura; self-play adds Mawman
// Cultist's on either board and Cult Neophyte's tax for this turn.
export function costOf(s,c){
  if(!s.game)return c.cost;
  // Remnant of Rage: one less for each minion that died this turn, on either side.
  if(c.type==='MINION'){
    if(costKind(c.text)===1)return Math.max(0,c.cost-(s.died??0)-(s.them.died??0));
    // N'Zoth, Dream's End: one less for each Deathrattle minion summoned this game.
    if(NZOTH.test(c.text))return Math.max(0,c.cost-(s.rattles??0));
    return c.cost;
  }
  if(c.type!=='SPELL')return c.cost;
  let tax=s.spellTax??0,base=c.cost;
  for(const b of [...s.me,...s.opp])if(b.type==='MINION'&&b.hp>0&&!b.dormant)tax+=auraOf(b.text);
  // Medivh's Triumph: 1 while a Legendary card of ours is on the board.
  if(MEDIVH.test(c.text)&&s.me.some(b=>b.type==='MINION'&&b.hp>0&&b.legendary))base=1;
  const k=costKind(c.text);
  if(k===2&&(s.died??0)>0)base=0;                                  // Hungering Cavern
  else if(k===3&&(s.studies??0)>0)base=Math.max(0,base-1);         // Illidari Studies
  return base+tax;
}
// Whether a card's cost follows the demon hunter's state (Remnant of Rage, Hungering Cavern, Illidari Studies).
export const dhCost=c=>costKind(c.text)>0;
// Cards whose price follows the board beyond the demon hunter's: Medivh's Triumph and N'Zoth (decks/priest-egg).
export const stateCost=c=>dhCost(c)||MEDIVH.test(c.text??'')||NZOTH.test(c.text??'');
const COST_KINDS=new Map();
const costKind=t=>{
  let v=COST_KINDS.get(t);
  if(v===undefined){
    v=REMNANT.test(t)?1:CAVERN.test(t)?2:STUDIES.test(t)?3:0;
    if(COST_KINDS.size>=20000)COST_KINDS.clear();
    COST_KINDS.set(t,v);
  }
  return v;
};
const AURAS=new Map();
const auraOf=t=>{
  let v=AURAS.get(t);
  if(v===undefined){v=Number(SPELL_AURA.exec(t)?.[1]??0);if(AURAS.size>=20000)AURAS.clear();AURAS.set(t,v)}
  return v;
};
// s.game only: Hand of Gul'dan cast from hand draws like its discard does.
const castDraw=c=>{const d=c.type==='SPELL'?discardModel(c):null;return d?.kind==='draw'?{kind:'draw',n:d.n}:null};
const readModel=(s,c)=>cardModel(c)??(s.additive?drawMinionModel(c):null)??(s.full?fullModel(c):null)??(s.game?castDraw(c)??gameModel(c):null);
// The models read the card's type, its flat text, the raw text a draw count comes from, and --
// for a discard-summoned body -- whether it has Health; the search flags pick which models run.
// Nothing else, so the answer is kept under those. A plotted trial carries its own length and is
// read fresh. The kept models are frozen: a step that wrote into one would change every later card.
const MODELS=new Map(),SIZE={n:0};
const freeze=o=>{if(o&&typeof o==='object'){for(const v of Object.values(o))freeze(v);Object.freeze(o)}return o};
const level=(m,k)=>{let v=m.get(k);if(!v)m.set(k,v=new Map());return v};
const modelOf=(s,c)=>{
  if(c.trial)return readModel(s,c);
  const flags=(s.additive?1:0)|(s.full?2:0)|(s.game?4:0)|(c.hp>0?8:0);
  const byRaw=level(level(level(MODELS,flags),c.type),c.text),raw=c.raw?.text;
  let m=byRaw.get(raw);
  if(m===undefined){
    if(++SIZE.n>20000){MODELS.clear();SIZE.n=0;return modelOf(s,c)}
    m=freeze(readModel(s,c));
    byRaw.set(raw,m);
  }
  return m;
};
// Spell Damage on our side changes the number; the model does not read how much.
const boosted=s=>s.me.some(b=>b.type==='MINION'&&/\bspell damage\b/i.test(b.text));
const spider=s=>({id:-(++s.nextToken),name:'Spider',atk:2,hp:1,raw:{CARDTYPE:'MINION',name:'Spider',ATK:2,HEALTH:1}});
function summonDiscard(s,c){
  if(room(s)<=0)return;
  const b=body({...c.raw,entityId:c.id,ATK:c.atk,HEALTH:c.hp,DAMAGE:0},'me');
  const charge=kw(c.raw,'CHARGE','charge'),rush=kw(c.raw,'RUSH','rush');
  Object.assign(b,{canAttack:!b.dormant&&(charge||rush),zeroReady:false,attacks:0,
    rushOnly:rush&&!charge,targets:new Set(s.opp.map(t=>t.id)),maxAttacks:b.windfury?2:1});
  s.me.push(b);
  noteSummon(s,b);
}

// Mutates only a cloned planning state. No arbitrary first-card surrogate for ties.
function discard(s,mode,pickId){
  // Past an additive draw (search pastAdditive) the hand holds unknown cards; any could be the one.
  if(s.drawnUnknown>0){s.uncertainDiscard=[{unknown:true}];return {exact:false,note:'discard after an unknown draw; no particular outcome assumed'}}
  if(!s.hand.length)return {exact:true,note:''};
  const picked=mode==='pick'?s.hand.find(c=>c.id===pickId):null;
  if(mode==='pick'&&!picked)return {exact:true,note:''};
  const extreme=(mode==='low'?Math.min:Math.max)(...s.hand.map(c=>c.cost));
  let tied=picked?[picked]:s.hand.filter(c=>c.cost===extreme);
  if(s.game&&tied.length>1)tied=[tied[roll(s,tied.length)]];
  if(tied.length>1){
    s.uncertainDiscard=tied.map(c=>({id:c.id,name:c.name,cost:c.cost}));
    return {exact:false,note:`random ${mode==='low'?'lowest':'highest'}-cost discard among ${tied.map(c=>c.name).join(', ')}; no particular outcome assumed`};
  }
  const lost=tied[0],model=discardModel(lost);
  s.hand=s.hand.filter(c=>c.id!==lost.id);
  if(s.game)s.discardCount=(s.discardCount??0)+1;
  else s.discarded=[...(s.discarded??[]),lost];
  // Tags already include historical growth. Add only this newly simulated discard.
  for(const c of s.hand){
    const gain=discardGrowth(c);
    if(gain){c.atk+=gain;c.hp+=gain;c.raw={...c.raw,ATK:c.atk,HEALTH:c.hp};}
  }
  for(const b of s.me){const gain=discardGrowth(b);if(gain){b.atk+=gain;b.hp+=gain;b.maxHp+=gain}}
  if(model.kind==='body'){s.fixedDiscard=true;summonDiscard(s,lost);return {exact:true,note:`discard summons ${lost.name} if space permits`}}
  if(model.kind==='spiders'){
    s.fixedDiscard=true;
    for(let i=0;i<model.n&&room(s)>0;i++)summonDiscard(s,spider(s));
    return {exact:true,note:'discard summons up to two 2/1 Spiders before the buff'};
  }
  if(s.game){
    const hit=BARRAGE.exec(lost.text);
    if(hit)volley(s,Number(hit[1]));
    if(model.kind==='draw')pull(s,model.n);
    if(model.kind==='randomBodies')conjure(s,model.n,model.cost);
    return {exact:true,note:''};
  }
  if(model.kind==='draw'){
    const r=drawFrom(s,model.n);
    const h=hero(s,'me');if(h)strike({},h,r.damageMin);
    s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
    return {exact:false,note:`discard draw ${model.n}: at least ${r.damageMin} damage; observe and replan`};
  }
  if(model.kind==='randomBodies'){
    s.pendingSummons={sourceId:lost.id,n:model.n,cost:model.cost,via:'discard'};
    return {exact:false,note:`discarding ${lost.name} triggers an unmodelled effect; observe and replan`};
  }
  return {exact:model.kind==='none',note:model.kind==='none'?'':`discarding ${lost.name} triggers an unmodelled effect; observe and replan`};
}

// Every exact-or-terminal step available in s. Each is {kind,id,targetId?}.
export function moves(s){
  if(s.game&&(hero(s,'me').hp<=0||hero(s,'opp').hp<=0))return [];
  if(s.choice)return s.choice.options.map(id=>({kind:'choose',id}));
  const out=[];
  const oppAlive=s.opp.filter(b=>b.hp>0);
  const wall=oppAlive.some(guards);
  const bypass=s.me.some(b=>b.hp>0&&b.ignoreTaunt);
  for(const a of s.me){
    if(!a.canAttack||a.hp<=0||a.atk<=0||a.frozen||a.dormant||a.attacks>=a.maxAttacks)continue;
    for(const t of oppAlive){
      if(t.stealth||t.dormant||t.immune)continue;
      if(wall&&!bypass&&!guards(t))continue;
      if(t.type==='HERO'&&a.rushOnly)continue;
      // A hero swinging into a minion takes its Attack back. A game was lost on exactly that:
      // 5 Health into a 7-Attack Void Terror, planned as an ordinary trade.
      if(!s.game&&a.type==='HERO'&&t.type==='MINION'&&!a.immune&&!a.ds&&t.atk>=hpOf(a))continue;
      // The game's own targets rule while the Taunt picture is unchanged; once the last Taunt
      // is gone, the bodies behind it open up.
      const known=s.game||a.targets.has(t.id)||(s.tauntAtStart&&(!wall||bypass));
      if(!known)continue;
      out.push({kind:'attack',id:a.id,targetId:t.id});
    }
  }
  const h=hero(s,'me');
  if(s.power&&!s.power.used&&s.power.cost<=s.mana&&h
    &&(s.power.draw||s.power.bless||!h.frozen&&!h.exhausted&&h.attacks<h.maxAttacks))
    out.push({kind:'power',id:s.power.id});
  const free=room(s);
  for(const c of s.hand){
    if(!c.playable||costOf(s,c)>s.mana)continue;
    const m=modelOf(s,c);
    if(!m||((m.kind==='minion'||m.kind==='location')&&free<=0))continue;
    if(m.kind==='bolt'){
      for(const id of s.game?aimable(s):s.aims?.get(c.id)??[])if([...s.me,...s.opp].some(b=>b.id===id&&(b.hp>0||b.type==='HERO')))out.push({kind:'play',id:c.id,targetId:id});
      continue;
    }
    if(m.kind==='sting'||m.kind==='cavern'){
      for(const id of aimable(s))out.push({kind:'play',id:c.id,targetId:id});
      continue;
    }
    if(m.freeze){
      const foes=s.opp.filter(t=>t.hp>0&&!t.dormant&&!t.stealth&&!t.immune);
      if(foes.length){for(const t of foes)out.push({kind:'play',id:c.id,targetId:t.id});continue}
    }
    if(m.kind==='lessons'){
      for(const b of [...s.me,...s.opp])if(b.type==='MINION'&&b.hp>0&&!b.dormant&&!(b.side==='opp'&&b.stealth))out.push({kind:'play',id:c.id,targetId:b.id});
      continue;
    }
    // decks/priest-egg: a spell or battlecry that points at one minion (Haunt, Hold Them Off!,
    // Holy Smite, Eternal Firebolt, Servant of Zuramat, Dissolving Ooze).
    if(m.target){
      const ids=targetsOf(s,m);
      for(const id of ids)out.push({kind:'play',id:c.id,targetId:id});
      // A battlecry with no target still lands the body; Power Word: Barrier still grows the hand.
      if(!ids.length&&m.optional)out.push({kind:'play',id:c.id});
      continue;                                        // with no legal target the card is not playable
    }
    if(m.chooseDiscard){
      const picks=s.hand.filter(x=>x.id!==c.id);
      if(picks.length){for(const x of picks)out.push({kind:'play',id:c.id,targetId:x.id});continue}
    }
    out.push({kind:'play',id:c.id});
  }
  for(const x of s.sites??[])if(x.ready&&SITE_DISCARD_DRAW.test(x.text))out.push({kind:'use',id:x.id});
  if(s.game)out.push({kind:'end'});
  return out;
}

function strike(dealer,victim,n){
  if(n<=0)return;
  if(victim.ds){victim.ds=false;return}
  if(victim.immune)return;
  if(victim.type==='HERO'){const soak=Math.min(victim.armor,n);victim.armor-=soak;n-=soak}
  victim.hp-=n;
  if(dealer.poison&&victim.type==='MINION')victim.hp=Math.min(victim.hp,0);
  return true;
}

// Apply a step. Returns {s,exact,note}: exact=false means the result is a best guess and the plan
// must stop after this step.
function applyStep(s0,m){
  const s=clone(s0);
  if(m.kind==='end')return {s:passTurn(s),exact:true,note:''};
  if(m.kind==='choose'){
    const {kind}=s.choice;
    s.choice=null;settle(s,kind,m.id);
    // A second Ritual of C'Thun that came due on the same turn waits for the first pick to finish.
    if(!s.choice&&s.pendingCthun>0){s.pendingCthun--;cthun(s)}
    return {s,exact:true,note:''};
  }
  if(m.kind==='power'){
    const h=hero(s,'me');
    s.mana-=s.power.cost;s.power.used=true;h.atk+=s.power.gain;
    // Blessing of the Moon: three Priest cards the mana left can pay for after the cut; the pick is Temporary.
    if(s.power.bless&&s.game){
      const cut=s.power.bless,picks=sample(s,blessPool(s).filter(r=>Math.max(0,cost(r)-cut)<=s.mana),3).map(r=>r.cardId);
      if(picks.length)offer(s,'bless',picks);
      return {s,exact:true,note:''};
    }
    // Lesser Heal and its imbued versions: restore Health to the hero, else to the worst-wounded body.
    if(s.power.heal){
      const hurt=s.me.filter(b=>b.type==='MINION'&&b.hp<b.maxHp).sort((a,b)=>(a.hp-a.maxHp)-(b.hp-b.maxHp));
      const t=h.hp<h.maxHp?h:hurt[0];
      if(t)t.hp=Math.min(t.maxHp,t.hp+s.power.heal);
      return {s,exact:true,note:''};
    }
    if(s.power.draw&&s.game){
      pull(s,s.power.draw);strike({},h,s.power.selfHit);
      return {s,exact:true,note:''};
    }
    if(s.power.draw){
      const r=drawFrom(s,s.power.draw);
      strike({},h,s.power.selfHit+r.damageMin);
      s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
      return {s,exact:false,note:`draw ${s.power.draw}; at most ${r.cardsMax} hand cards, at least ${r.damageMin} draw damage and ${s.power.selfHit} self-damage; observe the hand and replan`};
    }
    // Totemic Call: a random basic Totem (the deck's own power under Mug'Zee's start is not modelled).
    if(s.power.summon){if(s.game)totem(s);return {s,exact:true,note:''}}
    enableHero(s,h);
    return {s,exact:true,note:''};
  }
  if(m.kind==='attack'){
    const a=s.me.find(b=>b.id===m.id),t=s.opp.find(b=>b.id===m.targetId);
    let exact=true;const notes=[];
    if(COMBAT_TRIGGER.test(a.text)||COMBAT_TRIGGER.test(t.text)&&!enemyDrawOnly(t)){exact=false;notes.push('a combat trigger fires')}
    // After-attack discards resolve after combat and death frees board space.
    const afterWeapon=a.type==='HERO'&&s.weapon?.text?s.weapon.text:null;
    const before=hpOf(t);
    const hitT=strike(a,t,a.atk);
    if(t.type==='MINION')strike(t,a,t.atk);
    if(hitT&&a.lifesteal){const h=hero(s,'me');if(h)h.hp=Math.min(h.maxHp,h.hp+a.atk)}
    if(t.type==='HERO')s.faceDealt+=before-hpOf(t);
    a.attacks++;a.stealth=false;
    if(a.type==='HERO'&&s.weapon?.durability!=null){
      s.weapon.durability--;
      if(s.weapon.durability<=0){a.atk=Math.max(0,a.atk-s.weapon.atk);s.weapon=null;if(s.game)a.lifesteal=false}
    }
    for(const b of [a,t])if(b.hp<=0&&b.type==='MINION'&&ON_DEATH.test(ownText(b.text))&&!enemyDrawOnly(b)){exact=false;notes.push(`${b.name} dies with a Deathrattle/Reborn`)}
    bury(s);
    if(afterWeapon&&s.game&&AXE.test(afterWeapon)){
      if(t.type==='MINION'&&t.hp<=0)axeDraw(s);
    }else if(afterWeapon&&s.game&&LASH.test(afterWeapon)){
      lash(s);
    }else if(afterWeapon&&s.game&&EYEMAUL.test(afterWeapon)){
      tokens(s,{n:2,atk:2,hp:2,with:'rush',name:'Elemental'});
    }else if(afterWeapon&&s.game&&TINY_PAL.test(afterWeapon)){
      tinyPal(s);
    }else if(afterWeapon){
      if(DISCARD_HIGH.test(afterWeapon)&&a.hp>0){const r=discard(s,'high');exact&&=r.exact;if(r.note)notes.push(r.note)}
      else if(!DISCARD_HIGH.test(afterWeapon)){exact=false;notes.push('weapon triggers an unmodelled effect')}
    }
    return {s,exact,note:notes.join('; ')};
  }
  if(m.kind==='use'){
    s.sites=s.sites.map(x=>({...x}));
    const x=s.sites.find(x=>x.id===m.id);
    x.ready=false;
    if(x.durability!=null&&--x.durability<=0){s.sites=s.sites.filter(y=>y!==x);s.locations--}
    if(s.game){
      // Closed for the owner's next turn, open again on the one after.
      x.cooldown=2;
      offer(s,'site',sample(s,s.hand.map(c=>c.id),3));
      return {s,exact:true,note:''};
    }
    // The game shows three of the hand and the player picks: which three is not ours to know.
    if(s.hand.length)s.uncertainDiscard=s.hand.map(c=>({id:c.id,name:c.name,cost:c.cost}));
    const r=drawFrom(s,2);
    const h=hero(s,'me');if(h)strike({},h,r.damageMin);
    s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
    return {s,exact:false,note:`${x.name}: a chosen discard, then draw 2; at least ${r.damageMin} draw damage; observe the hand and replan`};
  }
  if(m.kind==='play'){
    const i=s.hand.findIndex(c=>c.id===m.id),c=s.hand[i],model=modelOf(s,c);
    s.mana-=costOf(s,c);s.hand.splice(i,1);
    const edge=i===0||i===s.hand.length;                          // Outcast: played from either end of the hand
    if(model.kind==='studies'){
      s.studies=1;
      const pool=s.game.outcast;
      if(pool.length)offer(s,'studies',sample(s,pool,3));
      else pull(s,1);
      return {s,exact:true,note:''};
    }
    if(model.kind==='harvest'){pull(s,1);dormantSeed(s);return {s,exact:true,note:''}}
    if(model.kind==='slumber'){offer(s,'slumber',['EDR_820a','EDR_820b']);return {s,exact:true,note:''}}
    if(model.kind==='infest'){
      for(let k=0;k<2;k++)gain(s,{...s.game.extra['Gorishi Stinger'],entityId:-(++s.nextToken)});
      return {s,exact:true,note:''};
    }
    if(model.kind==='sting'||model.kind==='cavern'){
      const t=[...s.me,...s.opp].find(b=>b.id===m.targetId);
      if(t){
        if(model.kind==='sting'){strike({},t,2);spawn(s,'Silithid Grub',1)}
        else hurt(s,t,2,true);
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='laststand'){
      const all=[...s.me,...s.opp].filter(b=>b.type==='MINION'&&!b.dormant);
      for(const b of all)strike({},b,1);
      pull(s,all.filter(b=>b.hp<=0).length);
      return {s,exact:true,note:''};
    }
    if(model.kind==='portal'){portal(s,model.stage);return {s,exact:true,note:''}}
    if(model.kind==='location'){
      s.locations++;
      if(s.sites)s.sites=[...s.sites,{...weaponBody(c.raw),ready:!!s.game}];
      return {s,exact:true,note:''};
    }
    // decks/priest-egg
    if(model.kind==='aoe'){
      for(const b of [...s.me,...s.opp])if(b.type==='MINION'&&!b.dormant)strike({},b,model.damage);
      return {s,exact:true,note:''};
    }
    if(model.kind==='ruin'){
      for(const b of [...s.me,...s.opp])if(b.type==='MINION'&&!b.dormant&&b.atk>=5)b.hp=0;
      return {s,exact:true,note:''};
    }
    if(model.kind==='boltMinion'){
      const t=[...s.me,...s.opp].find(b=>b.id===m.targetId);
      if(t){
        strike({},t,model.damage);
        if(model.lifesteal){const h=hero(s,'me');if(h)h.hp=Math.min(h.maxHp,h.hp+model.damage)}
        // Eternal Firebolt comes back at the end of the turn; here at once (documented approximation).
        if(model.returnOnKill&&t.hp<=0)gain(s,{...c.raw,entityId:-(++s.nextToken)});
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='buffMinion'){
      const t=[...s.me,...s.opp].find(b=>b.id===m.targetId);
      if(t){
        grow(t,{atk:model.atk,hp:model.hp});
        if(model.taunt)t.taunt=true;
        if(model.reborn)t.reborn=true;
        if(model.lifesteal)t.lifesteal=true;
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='slime'){slimeBurst(s);return {s,exact:true,note:''}}
    if(model.kind==='ectoplasm'){
      for(const e of s.slimePile??[])summonDiscard(s,{id:-(++s.nextToken),name:e.raw.name,atk:e.atk,hp:e.hp,raw:e.raw});
      s.slimePile=[];
      return {s,exact:true,note:''};
    }
    if(model.kind==='undeath'){rattleSome(s,model.n);return {s,exact:true,note:''}}
    // Intertwined Fate: a copy from our deck, then one from theirs (picked by card id).
    if(model.kind==='fate'&&s.game){
      offer(s,'fate1',sample(s,[...new Set(s.deck.map(d=>d.cardId))],3));
      return {s,exact:true,note:''};
    }
    if(model.kind==='barrier'){
      const t=s.me.find(b=>b.id===m.targetId);if(t)t.ds=true;
      for(const x of s.hand)if(x.type==='MINION')growCard(x,0,2);
      return {s,exact:true,note:''};
    }
    if(model.kind==='flay'){
      // Elder Word: Flay; the repeat on the next Shadow spell is not modelled.
      const foes=s.opp.filter(b=>(b.type==='HERO'||b.type==='MINION'&&b.hp>0)&&!b.dormant&&!b.immune);
      if(foes.length){
        const t=foes[roll(s,foes.length)],before=hpOf(t);strike({},t,model.damage);
        if(t.type==='HERO')s.faceDealt+=before-hpOf(t);
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='drawReduce'&&s.game){
      const got=pull(s,model.n);
      for(const id of got){
        const d=s.hand.find(x=>x.id===id);
        if(d){d.cost=Math.max(0,d.cost-model.cut);d.raw={...d.raw,COST:d.cost}}
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='discover'&&s.game){
      // Three different cards of the deck, never another copy of the spell itself.
      const names=[...new Set(s.deck.filter(d=>d.name!==c.name).map(d=>d.name))];
      offer(s,'discover',sample(s,names,3).map(n=>s.deck.find(d=>d.name===n).entityId));
      return {s,exact:true,note:''};
    }
    if(model.kind==='discover'){
      const left=s.drawState.me.deckCount==null?null:Number(s.drawState.me.deckCount)-(s.drawnUnknown??0);
      if(left!=null&&left<=0)return {s,exact:true,note:''};
      s.drawnUnknown=(s.drawnUnknown??0)+1;
      return {s,exact:false,note:'discover a card from the deck; observe the hand and replan'};
    }
    if(model.kind==='bolt'){
      const t=[...s.me,...s.opp].find(b=>b.id===m.targetId),before=hpOf(t);
      let exact=!boosted(s);const notes=exact?[]:['Spell Damage changes the hit'];
      strike({},t,model.damage);
      if(t.side==='opp'&&t.type==='HERO')s.faceDealt+=before-hpOf(t);
      if(t.hp<=0&&t.type==='MINION'&&ON_DEATH.test(ownText(t.text))&&!enemyDrawOnly(t)){exact=false;notes.push(`${t.name} dies with a Deathrattle/Reborn`)}
      bury(s);
      if(s.game){
        if(s.hand.length)discard(s,'pick',s.hand[roll(s,s.hand.length)].id);
        return {s,exact:true,note:''};
      }
      // One card left is the one discarded; among several the game picks at random.
      if(s.hand.length<=1||s.drawnUnknown>0){const r=discard(s,'high');exact&&=r.exact;if(r.note)notes.push(r.note)}
      else{s.uncertainDiscard=s.hand.map(c=>({id:c.id,name:c.name,cost:c.cost}));exact=false;notes.push(`random discard among ${s.hand.map(c=>c.name).join(', ')}; no particular outcome assumed`)}
      return {s,exact,note:notes.join('; ')};
    }
    if(model.kind==='barrage'&&s.game){volley(s,model.damage);if(model.shreds)shuffleShreds(s,model.shreds);return {s,exact:true,note:''}}
    if(model.kind==='barrage'){
      if(model.shreds)shuffleShreds(s,model.shreds);
      const h=hero(s,'opp'),others=s.opp.filter(b=>b.type==='MINION'&&b.hp>0&&!b.dormant&&!b.immune),before=hpOf(h);
      // Every point a minion cannot absorb lands on the hero: a floor, exact when the board is empty.
      const least=Math.max(0,model.damage-others.reduce((n,b)=>n+b.hp+(b.ds?1:0),0));
      if(h)for(let k=0;k<(others.length?least:model.damage);k++)strike({},h,1);
      s.faceDealt+=before-hpOf(h);
      if(!others.length&&!boosted(s))return {s,exact:true,note:''};
      return {s,exact:false,note:`${model.damage} damage split at random among all enemies; at least ${least} to the hero; observe and replan`};
    }
    if(model.kind==='mana'){
      s.mana+=model.gain;
      // A newly affordable supported card is a future step, not an invented
      // current game option. The live queue still checks its actual legality.
      for(const held of s.hand)if(costOf(s,held)>s0.mana&&costOf(s,held)<=s.mana&&modelOf(s,held))held.playable=true;
      return {s,exact:true,note:''};
    }
    if(model.kind==='randomSummon'&&s.game){conjure(s,model.n,model.cost);return {s,exact:true,note:''}}
    if(model.kind==='randomSummon'){
      s.pendingSummons={sourceId:c.id,n:model.n,cost:model.cost,via:'play'};
      return {s,exact:false,note:`summon up to ${model.n} random ${model.cost}-Cost minions; identities, stats and buff eligibility unknown; observe and replan`};
    }
    if(model.kind==='draw'&&s.game){
      pull(s,model.n,/\btemporary\b/i.test(c.text));
      if(model.outcast&&edge)pull(s,model.outcast.draw);
      return {s,exact:true,note:''};
    }
    if(model.kind==='draw'){
      const r=drawFrom(s,model.n);
      const h=hero(s,'me');if(h)strike({},h,r.damageMin);
      s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
      return {s,exact:false,note:`draw ${model.n}; at most ${r.cardsMax} hand cards and at least ${r.damageMin} draw damage; observe the hand and replan`};
    }
    if(model.kind==='weapon'){
      const h=hero(s,'me'),previous=s.weapon;
      s.weapon=weaponBody(c.raw);
      if(h){h.atk=Math.max(0,h.atk-(previous?.atk??0))+s.weapon.atk;enableHero(s,h)}
      if(h&&s.game)h.lifesteal=weaponSteals(s.weapon);
      // Replacing an unknown Deathrattle weapon may change the board or hand.
      const exact=!previous||!ON_DEATH.test(previous.text);
      return {s,exact,note:exact?'':'replaced weapon has a Deathrattle'};
    }
    if(model.kind==='minion'){
      const b=body({...c.raw,entityId:c.id},'me');
      const charge=kw(c.raw,'CHARGE','charge'),rush=kw(c.raw,'RUSH','rush');
      Object.assign(b,{canAttack:!b.dormant&&(charge||rush),zeroReady:false,rushOnly:rush&&!charge,targets:new Set(),maxAttacks:b.windfury?2:1});
      // A fresh body has no targets from the game's options; charge/rush may hit what is open.
      if(b.canAttack)for(const t of s.opp)b.targets.add(t.id);
      const row=s.me.filter(x=>x.type==='MINION');
      const slot=model.adjacent?adjacentSlot(c.text,row.length):row.length;
      if(slot<row.length)s.me.splice(s.me.indexOf(row[slot]),0,b);
      else s.me.push(b);
      if(model.chooseDiscard&&m.targetId!=null){
        const r=discard(s,'pick',m.targetId);
        if(!r.exact)return {s,exact:false,note:r.note};
      }
      if(model.summon)tokens(s,model.summon);
      if(model.freeze&&m.targetId!=null){const t=s.opp.find(x=>x.id===m.targetId);if(t)t.frozen=true}
      if(model.zakajz)zakajz(s,model.zakajz);
      if(model.xavius){
        const seen=new Set(),ids=[];
        for(const d of s.deck)if(d.CARDTYPE==='MINION'&&!seen.has(d.name)){seen.add(d.name);ids.push(d.entityId)}
        offer(s,'xavius',sample(s,ids,3));
      }
      if(model.cthun==='always'||model.cthun==='started'&&s.cthunStart)cthun(s);
      if(model.oldGod)oldGod(s,b);
      if(model.outcast&&edge){
        if(model.outcast.draw)pull(s,model.outcast.draw);
        if(model.outcast.hero){const h=hero(s,'me');h.atk+=model.outcast.hero;enableHero(s,h)}
      }
      if(model.selfHit){const h=hero(s,'me');if(h)strike({},h,model.selfHit)}
      if(model.shreds)shuffleShreds(s,model.shreds);
      if(model.tax)s.them={...s.them,spellTax:(s.them.spellTax??0)+model.tax};
      if(model.plot)offer(s,'kaz1',sample(s,KAZAKUS,3));
      if(model.adjacent){
        // Both neighbours grow; with one or no minion beside it (adjacentSlot) it sits at the right end and has just the left one.
        const row=s.me.filter(x=>x.type==='MINION'),i=row.indexOf(b);
        for(const x of [row[i-1],row[i+1]])if(x)grow(x,model.adjacent);
      }
      // decks/priest-egg: the battlecries of Servant of Zuramat, Dissolving Ooze, Kaldorei Priestess,
      // Endbringer Umbra and Holy Eggbearer.
      if(model.silence&&m.targetId!=null){const t=[...s.me,...s.opp].find(x=>x.id===m.targetId);if(t)silence(t)}
      if(model.ooze&&m.targetId!=null){const t=s.me.find(x=>x.id===m.targetId);if(t&&t!==b)t.hp=0}
      if(model.priestess){
        for(const t of s.opp)if(t.type==='MINION'&&!t.dormant)t.atk=Math.max(0,t.atk-2);
      }
      if(model.imbue)imbue(s);
      if(model.conjurer&&s.game&&s.them.deck.length){
        const r=s.them.deck[roll(s,s.them.deck.length)];
        gain(s,{...r,entityId:-(++s.nextToken)});
      }
      if(model.lightspawn&&m.targetId!=null){
        // Cleansing Lightspawn: as much damage as its own Health, healed back through its Lifesteal.
        const t=s.opp.find(x=>x.id===m.targetId),n=b.hp;
        if(t&&n>0){strike({},t,n);if(b.lifesteal){const h=hero(s,'me');if(h)h.hp=Math.min(h.maxHp,h.hp+n)}}
      }
      if(model.smuggler&&m.targetId!=null){
        // Defias Smuggler: +2 Attack and Rush; a body that could not swing yet may now hit minions. Prepare is not modelled.
        const t=s.me.find(x=>x.id===m.targetId&&x!==b);
        if(t){t.atk+=2;t.rush=true;if(!t.canAttack){t.canAttack=true;t.rushOnly=true}}
      }
      if(model.umbra)rattleSome(s,model.umbra);
      // decks/shaman-cthun: the battlecries and the after-you-play triggers of the list.
      if(model.addToken&&s.game){const raw=s.game.extra[model.addToken];if(raw)gain(s,{...raw,entityId:-(++s.nextToken)})}
      if(model.buffOthers)for(const x of s.me)if(x!==b&&x.type==='MINION'&&x.hp>0)grow(x,model.buffOthers);
      if(model.herald&&s.game&&room(s)>0){
        // Skywall Sentinel heralds the Soldier of Al'Akir; its adjacent-Attack aura is read once, at the summon.
        tokens(s,{n:1,atk:1,hp:2,with:'',name:"Soldier of Al'Akir"});
        const row=s.me.filter(x=>x.type==='MINION'),i=row.indexOf(s.me.at(-1));
        for(const x of [row[i-1],row[i+1]])if(x)x.atk+=1;
      }
      if(model.discoverMinion&&s.game){
        const picks=sample(s,s.game.allMinions,3).map(r=>r.cardId);
        s.pickPool={ids:picks};
        offer(s,'discoverMinion',picks);
      }
      // Warden Maiev and Wailing Vapor watch the minions played after them.
      for(const x of s.me)if(x!==b&&x.type==='MINION'&&x.hp>0&&!x.dormant){
        if(WARDEN.test(ownText(x.text))){grow(b,{atk:3,hp:3});b.dormant=true;b.wake=1;b.canAttack=false;b.targets=new Set()}
        if(VAPOR.test(ownText(x.text))&&b.race==='ELEMENTAL')x.atk+=1;
      }
      noteSummon(s,b);
      if(model.drawZeroAtk&&s.game){
        const pool=s.deck.filter(d=>d.CARDTYPE==='MINION'&&num(d.ATK??d.baseAttack)===0);
        if(pool.length){const pick=pool[roll(s,pool.length)];s.deck=s.deck.filter(d=>d!==pick);gain(s,pick)}
        return {s,exact:true,note:''};
      }
      if(model.copyShred||model.fatebreaker){
        const k=s.deck.findIndex(d=>d.name==='Shred of Time');
        if(k>=0){
          const shred=s.deck[k];s.deck=s.deck.filter((d,j)=>j!==k);
          const h=hero(s,'me');if(h)strike({},h,Number(/deal (\d+) damage to your hero/i.exec(flat(shred.text))?.[1]??0));
          // Fatebreaker (2026-10-25): the cast Shred buffs the minion itself, no copy.
          if(model.fatebreaker)grow(b,{atk:3,hp:3});
          else if(room(s)>0){
            const copy=body({...c.raw,entityId:-(++s.nextToken)},'me');
            Object.assign(copy,{canAttack:!copy.dormant&&(charge||rush),zeroReady:false,rushOnly:rush&&!charge,targets:new Set(s.opp.map(t=>t.id)),maxAttacks:copy.windfury?2:1});
            s.me.push(copy);
          }
        }
      }
      // The body remembers what it drew: Platysaur's Deathrattle discards exactly that card.
      if(model.draw&&s.game){const got=pull(s,model.draw);if(!model.keep)b.drew=got;return {s,exact:true,note:''}}
      if(model.draw){
        const r=drawFrom(s,model.draw);
        const h=hero(s,'me');if(h)strike({},h,r.damageMin);
        s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
        return {s,exact:false,note:`battlecry draw ${model.draw}; at most ${r.cardsMax} hand cards and at least ${r.damageMin} draw damage; observe the hand and replan`};
      }
      return {s,exact:true,note:''};
    }
    if(model.kind==='tokens'){tokens(s,model.summon);return {s,exact:true,note:''}}
    if(model.kind==='ritual'){s.timers=[...(s.timers??[]),{left:model.turns,effect:model.effect}];return {s,exact:true,note:''}}
    if(model.kind==='trial'){
      if(model.turns>0)s.timers=[...(s.timers??[]),{left:model.turns,effect:'trial',effects:c.trial.effects}];
      else castTrial(s,c.trial.effects);
      return {s,exact:true,note:''};
    }
    if(model.kind==='lessons'){
      // Double the Cost this card has now, after Mawman Cultist and any tax.
      const x=2*costOf(s,c),target=[...s.me,...s.opp].find(b=>b.id===m.targetId);
      if(target)grow(target,{atk:x,hp:x});
      const held=s.hand.filter(h=>h.type==='MINION');
      if(held.length)growCard(held[roll(s,held.length)],x,x);
      return {s,exact:true,note:''};
    }
    if(model.kind==='blast'){
      // "Highest Cost" is read from the hand left after this card is gone; ties count.
      const twice=model.again&&s.hand.every(x=>x.cost<=c.cost);
      for(let k=0;k<(twice?2:1);k++)for(const t of s.opp)if(t.type==='HERO'||!t.dormant)strike({},t,model.damage);
      return {s,exact:true,note:''};
    }
    let exact=true;const notes=[];
    if(model.discard){
      const r=discard(s,'low');exact&&=r.exact;if(r.note)notes.push(r.note);
    }
    if(model.shreds)shuffleShreds(s,model.shreds);
    for(const b of s.me)if(b.type==='MINION'&&!b.dormant){
      b.atk+=model.atk;b.hp+=model.hp;b.maxHp+=model.hp;
      // A ready 0-Attack egg had no printed targets before the buff. Explicit
      // readiness tags let it join the plan; never grant attacks to a new body.
      if(b.zeroReady&&b.atk>0){b.canAttack=true;b.targets=new Set(s.opp.map(t=>t.id))}
    }
    return {s,exact,note:notes.join('; ')};
  }
  throw Error(`unknown move ${m.kind}`);
}

export function apply(s0,m){
  const r=applyStep(s0,m);
  if(s0.game){reap(r.s);return r}
  const summoned=r.s.me.some(b=>!s0.me.some(x=>x.id===b.id))||!!r.s.pendingSummons;
  const discarded=(r.s.discarded?.length??0)>(s0.discarded?.length??0)||!!r.s.uncertainDiscard;
  // Do not call a fixed summon/buff exact in the presence of an unmodelled
  // friendly cast/summon/discard engine (e.g. Knife Juggler).
  const trigger=s0.me.some(b=>b.type==='MINION'&&!b.dormant&&
    [...b.text.matchAll(/\b(?:after|whenever|when)\b[^.,]*/gi)].some(([event])=>
      summoned&&/\bsummon\b/i.test(event)||discarded&&/\bdiscard\b/i.test(event)
      ||m.kind==='play'&&/\b(?:cast|play)\b/i.test(event)));
  if(trigger){r.exact=false;r.note=[r.note,'unmodelled friendly event trigger; observe and replan'].filter(Boolean).join('; ')}
  return r;
}

function enableHero(s,h){
  if(h.frozen||h.exhausted||h.attacks>=h.maxAttacks)return;
  h.canAttack=true;
  // A hero at zero Attack had no printed attack options before the power/equip.
  h.targets=new Set(s.opp.map(t=>t.id));
}

// Enough of the board to tell whether reality followed the prediction: who is where, at what
// stats, and what is still in hand. Attack counts and exhaustion are left out; they are tags the
// log flushes late and they never change the next step's legality in a way the options miss.
export const signature=s=>JSON.stringify([
  s.me.map(b=>[b.id,b.atk,b.hp,b.armor,b.ds,b.taunt,b.dormant,b.frozen,b.ignoreTaunt]).sort((x,y)=>x[0]-y[0]),
  s.opp.map(b=>[b.id,b.atk,b.hp,b.armor,b.ds,b.taunt,b.dormant,b.frozen]).sort((x,y)=>x[0]-y[0]),
  s.hand.map(c=>c.id),s.mana,s.weapon&&[s.weapon.id,s.weapon.atk,s.weapon.durability]]);

// Did the real board `s` follow the predicted signature `before`? Returns null when it did not,
// else a map from predicted to real entity id for our bodies that are there under another id:
// a minion summoned by its own discard is a new entity in the game, while the sim keeps the hand
// card's id. Such a board is the predicted one, yet the strict comparison dropped the rest of the
// plan 105 times in 262 games (2026-10-12, mostly Ocular Occultist discarding Walking Dead).
// The sim's own tokens (negative ids) still end the plan, as before.
export function followed(before,s){
  const now=signature(s);
  if(now===before)return new Map();
  const [mine,...rest]=JSON.parse(before),[real,...realRest]=JSON.parse(now);
  if(JSON.stringify(rest)!==JSON.stringify(realRest))return null;
  const stats=b=>JSON.stringify(b.slice(1)),left=new Map(real.map(b=>[b[0],b])),loose=[],ids=new Map();
  for(const b of mine){
    const r=left.get(b[0]);
    if(!r){loose.push(b);continue}
    if(stats(r)!==stats(b))return null;
    left.delete(b[0]);
  }
  for(const b of loose){
    const r=b[0]>=0&&[...left.values()].find(r=>stats(r)===stats(b));
    if(!r)return null;
    left.delete(r[0]);ids.set(b[0],r[0]);
  }
  return left.size?null:ids;
}

// Search equivalence is stricter than the live observation signature. Readiness,
// remaining attacks, card costs/stats and resource history affect future moves.
export const searchSignature=s=>JSON.stringify([
  ...['me','opp'].map(side=>s[side].map(b=>[b.id,b.atk,b.hp,b.maxHp,b.armor,b.ds,b.taunt,
    b.stealth,b.poison,b.lifesteal,b.windfury,b.rush,b.ignoreTaunt,b.dormant,b.immune,b.frozen,
    b.attacks,b.maxAttacks,b.canAttack,b.rushOnly,b.zeroReady,[...b.targets??[]].sort((a,b)=>a-b)])
    .sort((a,b)=>a[0]-b[0])),
  s.hand.map(c=>[c.id,c.cost,c.atk,c.hp,c.playable]),s.mana,s.weapon,s.power,s.locations,s.sites,
  s.drawState,s.discarded?.map(c=>[c.id,c.cost]),s.fixedDiscard,s.uncertainDiscard,s.pendingSummons,s.drawnUnknown,s.faceDealt,s.nextToken]);

// ---- Whole games (s.game, built by selfplay.mjs) -------------------------------------------------
// The planner above stops where it cannot know. A game played inside the simulator has no board to
// re-read, so with s.game set the same steps finish: a draw takes the real top card of s.deck, a
// random outcome is rolled from s.seed, a player's pick becomes a 'choose' step, and 'end' hands the
// turn over. Everything the acting side owns sits on s; the other side's hidden half sits in s.them.
const SEAT=['hand','deck','weapon','power','locations','sites','mana','crystals','fatigue','discardCount','seat','spellTax','timers',
  'died','cthunSeen','cthunStart','brox','studies','grave','rattles','slimePile'];

// mulberry32, with the counter kept in the state: equal states roll equal outcomes.
export function roll(s,n){
  let t=s.seed=(s.seed+0x6D2B79F5)|0;
  t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);
  return Math.floor(((t^t>>>14)>>>0)/4294967296*n);
}
function sample(s,list,k){
  const a=[...list];
  for(let i=0;i<Math.min(k,a.length);i++){const j=i+roll(s,a.length-i);[a[i],a[j]]=[a[j],a[i]]}
  return a.slice(0,k);
}

// The same game seen from the other chair.
export function flip(s){
  const t=s.them,turned=(bs,side)=>bs.map(b=>({...b,side}));
  return {...s,...t,hand:t.hand.map(c=>({...c})),weapon:t.weapon&&{...t.weapon},power:t.power&&{...t.power},
    me:turned(s.opp,'me'),opp:turned(s.me,'opp'),them:Object.fromEntries(SEAT.map(k=>[k,s[k]]))};
}

function gain(s,raw,temp){
  if(s.hand.length>=10)return null;                              // a full hand burns the card
  const c=handCard(raw,true),g=discardGrowth(c)*(s.discardCount??0);
  if(g){c.atk+=g;c.hp+=g;c.raw={...c.raw,ATK:c.atk,HEALTH:c.hp}}
  if(temp)c.temp=true;
  s.hand.push(c);
  return c.id;
}
// Draw n real cards for the acting side; returns the ids that reached the hand.
function pull(s,n,temp=false){
  const got=[],h=hero(s,'me');
  for(let k=0;k<n;k++){
    if(!s.deck.length){s.fatigue=(s.fatigue??0)+1;strike({},h,s.fatigue);continue}
    const [raw,...rest]=s.deck;s.deck=rest;
    // Shred of Time: it casts, and the draw it interrupted still happens.
    if(/\bcasts when drawn\b/i.test(flat(raw.text))){
      strike({},h,Number(/deal (\d+) damage to your hero/i.exec(flat(raw.text))?.[1]??0));
      n++;continue;
    }
    const id=gain(s,raw,temp);
    if(id!=null)got.push(id);
  }
  return got;
}
export const drawCards=pull;

// Fixed tokens from a battlecry or a spell. Tokens have no entity id until the game makes them;
// a live plan's next step is re-checked against the real board anyway (bridge compares signatures).
function tokens(s,spec){
  const t=spec.with,count=Math.min(spec.n,room(s));
  for(let k=0;k<count;k++)s.me.push({id:-(++s.nextToken),side:'me',type:'MINION',name:spec.name??'token',text:'',
    atk:spec.atk,hp:spec.hp,maxHp:spec.hp,armor:0,taunt:/taunt/.test(t),ds:/divine shield/.test(t),
    stealth:/stealth/.test(t),poison:/poisonous/.test(t),lifesteal:/lifesteal/.test(t),windfury:/windfury/.test(t),
    dormant:false,immune:false,frozen:false,attacks:0,canAttack:/rush/.test(t),rushOnly:true,
    targets:new Set(/rush/.test(t)?s.opp.filter(o=>o.type==='MINION').map(o=>o.id):[]),maxAttacks:/windfury/.test(t)?2:1});
}
const grow=(b,{atk,hp})=>{b.atk+=atk;b.hp+=hp;b.maxHp+=hp};
// Shreds of Time at random places in the deck. Outside self-play only the count and the
// 3-damage draw hazards are known.
function shuffleShreds(s,n){
  if(s.game){
    const shred=s.game.extra['Shred of Time'];
    s.deck=[...s.deck];
    for(let k=0;k<n;k++)s.deck.splice(roll(s,s.deck.length+1),0,{...shred,entityId:-(++s.nextToken)});
  }else if(s.drawState?.me?.deckCount!=null){
    s.drawState={me:{...s.drawState.me,deckCount:Number(s.drawState.me.deckCount)+n,drawHazards:[...(s.drawState.me.drawHazards??[]),...Array(n).fill(3)]}};
  }
}
// Soul Barrage: one point at a time, each on a living enemy.
function volley(s,n){
  for(let k=0;k<n;k++){
    const live=s.opp.filter(b=>b.type==='HERO'||b.hp>0&&!b.dormant&&!b.immune);
    if(!live.length)return;
    strike({},live[roll(s,live.length)],1);
  }
}
function conjure(s,n,cost){
  const pool=s.game.minions[cost]??[];
  for(let k=0;k<n&&pool.length&&room(s)>0;k++){
    const raw=pool[roll(s,pool.length)];
    summonDiscard(s,{id:-(++s.nextToken),name:raw.name,atk:num(raw.ATK??raw.baseAttack),hp:num(raw.HEALTH??raw.baseHealth),raw});
  }
}
// decks/priest-egg: a silence strips the body of its text and keywords (the Egg stops hatching).
function silence(b){
  Object.assign(b,{text:'',silenced:true,taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,
    windfury:false,rush:false,rushOnly:false,ignoreTaunt:false,elusive:false,reborn:false});
}
// A Deathrattle minion summoned this game, for N'Zoth, Dream's End's cost.
function noteSummon(s,b){
  if(b&&/\bdeathrattle\b/i.test(ownText(b.text)))s.rattles=(s.rattles??0)+1;
}
// A card of the database the simulator summons: the Egg's stages, the Khelos they hatch.
function spawnCard(s,id,hp){
  const raw=s.game?.tokens?.[id];
  if(!raw)return;
  summonDiscard(s,{id:-(++s.nextToken),name:raw.name,atk:num(raw.ATK),hp:hp??num(raw.HEALTH),raw});
}
// Undeath Sentence and Endbringer Umbra: trigger n Deathrattles at random from the grave.
function rattleSome(s,n){
  const pool=s.grave??[];
  for(const rec of sample(s,pool,Math.min(n,pool.length)))rattle(s,{...rec,reborn:false});
}
// Slime 'em!: every minion dies and each seat gets the Ectoplasm that brings its own back.
// A board minion has no raw card; a copy needs its id and text back, or an Egg of Khelos stops cracking.
const rawOf=b=>({CARDTYPE:'MINION',text:b.text,legendary:b.legendary,race:b.race,...(b.raw??{}),cardId:b.cardId??b.raw?.cardId,name:b.name});
// Resummons (Reborn, Ectoplasm) come back as the printed card: buffs, Haunt's Taunt and Reborn included, are gone.
const printed=(s,b)=>{const id=b.cardId??b.raw?.cardId;return (id&&(s.game?.allById?.[id]??s.game?.tokens?.[id]))||null};
const fresh=(s,b)=>{const p=printed(s,b);return p?{raw:{...p},atk:num(p.ATK),hp:num(p.HEALTH)}:{raw:rawOf(b),atk:b.atk,hp:b.maxHp??b.hp}};
function slimeBurst(s){
  const pile=bs=>bs.filter(b=>b.type==='MINION'&&!b.dormant).map(b=>fresh(s,b));
  s.slimePile=[...(s.slimePile??[]),...pile(s.me)];
  s.them={...s.them,slimePile:[...(s.them.slimePile??[]),...pile(s.opp)]};
  for(const b of [...s.me,...s.opp])if(b.type==='MINION')b.hp=0;
  const ecto=s.game?.tokens?.CAP_805t;
  if(!ecto)return;
  if(s.hand.length<10)s.hand.push(handCard({...ecto,entityId:-(++s.nextToken)},true));
  if((s.them.hand?.length??0)<10)s.them={...s.them,hand:[...(s.them.hand??[]),handCard({...ecto,entityId:-(++s.nextToken)},true)]};
}
const growCard=(c,atk,hp)=>{c.atk+=atk;c.hp+=hp;c.raw={...c.raw,ATK:c.atk,HEALTH:c.hp}};
// A token card of the database (s.game.extra), summoned at its printed stats and keywords.
function spawn(s,name,n){
  const raw=s.game.extra[name];
  for(let k=0;k<n&&room(s)>0;k++)summonDiscard(s,{id:-(++s.nextToken),name:raw.name,atk:num(raw.ATK),hp:num(raw.HEALTH),raw});
}
const hurtGlare=(s,t,n=5)=>{if(strike({lifesteal:true},t,n)){const h=hero(s,'me');h.hp=Math.min(h.maxHp,h.hp+n)}};
const glareable=s=>s.opp.filter(b=>b.type==='MINION'&&b.hp>0&&!b.dormant&&!b.stealth&&!b.elusive);

// Delayed effects. A timer sits on the seat of the player who made it and counts only that
// player's own turn starts: the first one after the cast takes it from 2 to 1, the second fires it.
const CTHUN=['BE_013t1','BE_013t2','BE_013t3','BE_013t4'];
const abilities=(s,skip=[])=>CTHUN.filter(id=>!skip.includes(id)&&(id!=='BE_013t3'||glareable(s).length));
function cthun(s){
  if(s.choice){s.pendingCthun=(s.pendingCthun??0)+1;return}
  offer(s,'cthun',abilities(s));
}
// One ability. While C'Thun's body is picking (s.god), it is multiplied by s.god.times.
// s.god is shared between clones, so it is replaced, never changed in place.
function pickAbility(s,id){
  const god=s.god,times=god?.times??1;
  if(god)s.god={...god,picked:[...god.picked,id]};
  s.cthunSeen=[...new Set([...(s.cthunSeen??[]),id])];
  if(id==='BE_013t1')volley(s,7*times);
  else if(id==='BE_013t2'){
    const row=s.me.filter(b=>b.type==='MINION'&&b.hp>0&&b.id!==god?.self);
    for(const b of sample(s,row,2))grow(b,{atk:2*times,hp:3*times});
  }
  else if(id==='BE_013t4')spawn(s,'Faceless Fanatic',2*times);
  if(id==='BE_013t3'){s.glareHit=5*times;offer(s,'glare',glareable(s).map(b=>b.id))}
  else godNext(s);
}
// Glare: one target; tripled it deals (and heals) 15 in one hit.
function glare(s,id){
  const t=s.opp.find(b=>b.id===id);
  if(t)hurtGlare(s,t,s.glareHit??5);
  s.glareHit=null;
  godNext(s);
}
// The body's second pick, then done.
function godNext(s){
  if(!s.god||s.choice)return;
  const opts=s.god.picked.length<2?abilities(s,s.god.picked):[];
  if(opts.length)offer(s,'cthun',opts);
  else s.god=null;
}
// The C'Thun body: pick two of the four abilities, each tripled once every kind has been triggered
// this game (before the body is played).
function oldGod(s,self){
  const times=CTHUN.every(id=>(s.cthunSeen??[]).includes(id))?3:1;
  s.god={times,picked:[],self:self?.id};
  godNext(s);
}
// Tentacle Lash: C'Thun gets cheaper, in the hand and in the deck, and an ability is picked.
function lash(s){
  const cut=x=>x.cardId==='BE_013'?{...x,COST:Math.max(0,num(x.COST)-1)}:x;
  s.deck=s.deck.map(cut);
  for(const c of s.hand)if(c.raw?.cardId==='BE_013'){c.cost=Math.max(0,c.cost-1);c.raw={...c.raw,COST:c.cost}}
  cthun(s);
}
// Zakajz the Corruptor: minions in the hand and the deck get cheaper, spells get dearer.
function zakajz(s,{down,up}){
  const recost=x=>{
    if(x.CARDTYPE==='MINION')return {...x,COST:Math.max(0,num(x.COST)-down)};
    if(x.CARDTYPE==='SPELL')return {...x,COST:num(x.COST)+up};
    return x;
  };
  s.deck=s.deck.map(recost);
  for(const c of s.hand){
    if(c.type==='MINION'){c.cost=Math.max(0,c.cost-down);c.raw={...c.raw,COST:c.cost}}
    else if(c.type==='SPELL'){c.cost+=up;c.raw={...c.raw,COST:c.cost}}
  }
}
// Dreadseeds: stats, turns asleep. They count the owner's turn starts down and wake at 0.
const SEEDS=[['Hound Dreadseed',2],['Crow Dreadseed',1],['Serpent Dreadseed',3]];
function dormantSeed(s){
  if(room(s)<=0)return;
  const [name,wake]=SEEDS[roll(s,SEEDS.length)],raw=s.game.extra[name];
  summonDiscard(s,{id:-(++s.nextToken),name,atk:num(raw.ATK),hp:num(raw.HEALTH),raw});
  Object.assign(s.me.at(-1),{dormant:true,wake,canAttack:false,targets:new Set()});
}
function awaken(s){
  for(const b of s.me)if(b.dormant&&--b.wake<=0){
    b.dormant=false;b.canAttack=true;b.targets=new Set(s.opp.map(t=>t.id));
    if(b.cardId==='EDR_840t'){const h=hero(s,'me');h.atk+=3;enableHero(s,h)}
  }
}
const aoe=(s,n)=>{for(const b of [...s.me,...s.opp])if(b.type==='MINION'&&!b.dormant)strike({},b,n)};
function hurt(s,t,n,steal){
  if(strike({},t,n)&&steal){const h=hero(s,'me');h.hp=Math.min(h.maxHp,h.hp+n)}
}
const weaponSteals=w=>/^lifesteal\b/i.test(w?.text??'');
// decks/shaman-cthun: Tiny Pal's four ammunitions (JAIL_458t1..t4), one at random after each swing
// (the pick itself is not modelled): Freeze two enemies, 1 damage to all enemies, a random 3-Cost
// minion with Taunt, or a random Battlecry minion at 2 less.
function tinyPal(s){
  const k=roll(s,4);
  if(k===0){
    const foes=s.opp.filter(b=>b.type==='MINION'&&b.hp>0&&!b.dormant);
    for(const b of sample(s,foes,2))b.frozen=true;
  }else if(k===1){
    for(const t of s.opp)if(t.type==='HERO'||!t.dormant)strike({},t,1);
  }else if(k===2){
    if(room(s)>0){conjure(s,1,3);const b=s.me.at(-1);if(b?.type==='MINION')b.taunt=true}
  }else{
    const pool=(s.game.allMinions??[]).filter(c=>/battlecry/i.test(flat(c.text)));
    if(pool.length){
      const raw=pool[roll(s,pool.length)],cid=gain(s,{...raw,entityId:-(++s.nextToken)});
      if(cid!=null){const c=s.hand.find(x=>x.id===cid);c.cost=Math.max(0,c.cost-2);c.raw={...c.raw,COST:c.cost}}
    }
  }
}
// Totemic Call: a random basic Totem (duplicates allowed; Healing Totem's end-of-turn heal is left out).
const TOTEMS=['Searing Totem','Stoneclaw Totem','Wrath of Air Totem','Healing Totem'];
function totem(s){
  if(room(s)<=0)return;
  spawn(s,TOTEMS[roll(s,TOTEMS.length)],1);
}
// Broxigar and the Portals to Argus: a Demon for the other side whose death draws, shuffles the next
// Portal in and, at the end of the chain, gives Broxigar back. Stage n is the card TIME_020t(n+1).
const PORTALS=['TIME_020t2','TIME_020t3','TIME_020t4','TIME_020t5'],DEMONS=['TIME_020t2t','TIME_020t3t','TIME_020t4t','TIME_020t5t'];
function portal(s,stage){
  const raw=Object.values(s.game.extra).find(x=>x.cardId===DEMONS[stage-1]);
  if(7-s.opp.filter(b=>b.type==='MINION').length-s.them.locations<=0)return;
  const b=body({...raw,entityId:-(++s.nextToken),DAMAGE:0},'opp');
  Object.assign(b,{canAttack:false,zeroReady:false,attacks:0,rushOnly:false,targets:new Set(),maxAttacks:1});
  s.opp=[...s.opp,b];
}
// The demon died on the other side: s is the hunter's chair.
function portalDeath(s,stage){
  if(stage<4){
    pull(s,1);
    const raw=Object.values(s.game.extra).find(x=>x.cardId===PORTALS[stage]);
    s.deck=[...s.deck];
    s.deck.splice(roll(s,s.deck.length+1),0,{...raw,entityId:-(++s.nextToken)});
  }else if(s.brox){
    gain(s,{...s.brox,entityId:-(++s.nextToken)});
    s.brox=null;
  }
}
function axeDraw(s){
  const k=s.deck.findIndex(d=>PORTALS.includes(d.cardId));
  if(k<0)return;
  const raw=s.deck[k];
  s.deck=s.deck.filter((_,j)=>j!==k);
  gain(s,raw);
}
// Godfather Kazakus: nine effects, two picks of three from them, then the length of the trial.
const KAZAKUS=Array.from({length:9},(_,i)=>`CAP_405t${i+1}`);
const TRIALS=[{id:'CAP_405tb1',name:'Rushed Trial',turns:0},{id:'CAP_405tb2',name:'Grueling Trial',turns:1},{id:'CAP_405tb3',name:'Unending Trial',turns:4}];
function castEffect(s,id){
  const h=hero(s,'me'),minion=b=>b.type==='MINION'&&b.hp>0&&!b.dormant;
  if(id==='CAP_405t1'){
    // Simplified: each minion, in board order, fights one random other living minion.
    const all=[...s.me,...s.opp].filter(minion);
    for(const a of all){
      const foes=all.filter(b=>b!==a&&b.hp>0);
      if(a.hp<=0||!foes.length)continue;
      const t=foes[roll(s,foes.length)];
      strike(a,t,a.atk);strike(t,a,t.atk);
    }
  }else if(id==='CAP_405t2'){
    const pool=s.opp.filter(minion);
    if(pool.length&&room(s)>0){
      const b=pool[roll(s,pool.length)];
      s.opp=s.opp.filter(x=>x!==b);
      Object.assign(b,{side:'me',canAttack:false,attacks:0,rushOnly:false,targets:new Set()});
      s.me.push(b);
    }
  }else if(id==='CAP_405t3'){
    const take=sample(s,s.them.hand.map((_,i)=>i),2);
    const stolen=take.map(i=>s.them.hand[i]);
    s.them={...s.them,hand:s.them.hand.filter((_,i)=>!take.includes(i))};
    for(const c of stolen)if(s.hand.length<10)s.hand.push({...c,playable:true,temp:false});
  }else if(id==='CAP_405t4')pull(s,3);
  else if(id==='CAP_405t5'){
    for(const b of s.me)if(b.type==='MINION')grow(b,{atk:3,hp:3});
    for(const c of s.hand)if(c.type==='MINION')growCard(c,3,3);
  }else if(id==='CAP_405t6')conjure(s,3,3);
  else if(id==='CAP_405t7'){
    for(const c of s.hand)if(c.type==='MINION'){c.cost=Math.max(0,c.cost-2);c.raw={...c.raw,COST:c.cost}}
  }else if(id==='CAP_405t8')h.hp=Math.min(h.maxHp,h.hp+12);
  else if(id==='CAP_405t9')spawn(s,'Voidlord',1);
}
// The two effects of a trial happen together in the game: Spurious Shiv's +3/+3 also reaches the minions that Criminal
// Contract summons, whichever was picked first. So what makes or moves minions and cards resolves first, and the buff
// and the cost cut (Shiv, Potion of Perjury) last.
const LAST_EFFECTS=['CAP_405t5','CAP_405t7'];
const castTrial=(s,effects)=>{
  const last=e=>LAST_EFFECTS.includes(e);
  for(const e of [...effects.filter(e=>!last(e)),...effects.filter(last)])castEffect(s,e);
};
function fireTimers(s){
  const due=[];
  s.timers=(s.timers??[]).map(t=>({...t,left:t.left-1})).filter(t=>t.left>0||!due.push(t));
  for(const t of due){
    if(t.effect==='summon')spawn(s,"C'thrax Brute",2);
    else if(t.effect==='naga')spawn(s,'Naga Monstrosity',1);
    else if(t.effect==='cthun')cthun(s);
    else castTrial(s,t.effects);
  }
}
const aimable=s=>[...s.opp.filter(b=>!b.stealth),...s.me].filter(b=>!b.immune&&!b.dormant&&!b.elusive).map(b=>b.id);
// decks/priest-egg: the minions a step of model m may point at ('any', 'friend' or 'enemy').
function targetsOf(s,m){
  const pool=m.target==='friend'?s.me:m.target==='enemy'?s.opp:[...s.me,...s.opp];
  return pool.filter(b=>b.type==='MINION'&&b.hp>0&&!b.dormant&&!b.immune&&!b.elusive&&!(b.side==='opp'&&b.stealth)).map(b=>b.id);
}

// A pick the player makes mid-step. One option needs no asking; none skips the pick.
// Imbue: the first one makes the Hero Power Blessing of the Moon, every one cuts its card by one more.
function imbue(s){
  if(!s.power)return;
  s.power={...s.power,name:'Blessing of the Moon',cost:2,gain:0,draw:0,summon:0,heal:0,selfHit:0,bless:(s.power.bless??0)+1};
}
// The Priest cards Blessing of the Moon may offer: the collectible ones the simulator can play.
const BLESS=new WeakMap();
function blessPool(s){
  let p=BLESS.get(s.game);
  if(!p)BLESS.set(s.game,p=(s.game.priest??[]).filter(r=>modelOf(s,handCard(r,true))));
  return p;
}
function offer(s,kind,options){
  if(options.length>1)s.choice={kind,options};
  else settle(s,kind,options[0]);
}
function settle(s,kind,id){
  if(kind==='site'){
    if(id!=null)discard(s,'pick',id);
    pull(s,2);
  }else if(kind==='cthun')pickAbility(s,id);
  else if(kind==='slumber'){
    if(id==='EDR_820a'){dormantSeed(s);dormantSeed(s)}
    else aoe(s,2);
  }else if(kind==='studies'){
    const raw=s.game.byId[id];
    if(raw)gain(s,{...raw,entityId:-(++s.nextToken)});
  }else if(kind==='xavius'){
    const raw=s.deck.find(d=>d.entityId===id);
    s.deck=s.deck.filter(d=>d!==raw);
    // The Dark Gift card of the database is a placeholder; the gift is +2/+2.
    const cid=raw&&gain(s,raw);
    if(cid!=null)growCard(s.hand.find(c=>c.id===cid),2,2);
  }
  else if(kind==='glare')glare(s,id);
  else if(kind==='discoverMinion'){
    // Watfin: the suspicious pick comes to hand with +1/+1 (the card's own reading of the text).
    const raw=s.game.allById[id];s.pickPool=null;
    if(raw){const cid=gain(s,{...raw,entityId:-(++s.nextToken)});if(cid!=null)growCard(s.hand.find(c=>c.id===cid),1,1)}
  }
  else if(kind==='bless'){
    // The picked card is Temporary and costs (Imbue count) less (EDR_449e Fleeting Magic).
    const raw=blessPool(s).find(r=>r.cardId===id),cid=raw&&gain(s,{...raw,entityId:-(++s.nextToken)},true);
    const x=cid!=null&&s.hand.find(c=>c.id===cid);
    if(x){x.cost=Math.max(0,x.cost-s.power.bless);x.raw={...x.raw,COST:x.cost}}
  }else if(kind==='fate1'||kind==='fate2'){
    const raw=id!=null&&(kind==='fate1'?s.deck:s.them.deck).find(d=>d.cardId===id);
    if(raw)gain(s,{...raw,entityId:-(++s.nextToken)});
    if(kind==='fate1'){
      const theirs=[...new Set(s.them.deck.map(d=>d.cardId))];
      if(theirs.length)offer(s,'fate2',sample(s,theirs,3));
    }
  }else if(kind==='kaz1'){
    s.kaz={first:id};
    offer(s,'kaz2',sample(s,KAZAKUS.filter(e=>e!==id),3));
  }else if(kind==='kaz2'){
    s.kaz={...s.kaz,second:id};
    offer(s,'kaz3',TRIALS.map(t=>t.id));
  }else if(kind==='kaz3'){
    // The trial card is plotted now; its clock starts when it is played.
    const t=TRIALS.find(t=>t.id===id),cid=gain(s,{...s.game.extra[t.name],entityId:-(++s.nextToken)});
    if(cid!=null)s.hand.find(c=>c.id===cid).trial={turns:t.turns,effects:[s.kaz.first,s.kaz.second]};
    s.kaz=null;
  }else if(id!=null){
    const raw=s.deck.find(d=>d.entityId===id);
    s.deck=s.deck.filter(d=>d!==raw);
    gain(s,raw,true);
  }
}

const gone=b=>b.type==='MINION'&&b.hp<=0;
function bury(s){
  if(s.game)return reap(s);
  s.me=s.me.filter(b=>!gone(b));s.opp=s.opp.filter(b=>!gone(b));
}
// Deaths, and the Deathrattles this deck has: Boneweb Egg's Spiders and Platysaur's discard. One on
// the other side runs with the chairs swapped, so its payoffs land on its owner's board and hand.
function rattle(s,b){
  if(b.silenced)return;
  // Reborn: the body comes back once with 1 Health, without Reborn of its own.
  if(b.reborn&&room(s)>0){const f=fresh(s,b);summonDiscard(s,{id:-(++s.nextToken),name:b.name,atk:f.atk,hp:1,raw:{...f.raw,HEALTH:1,DAMAGE:0,REBORN:0}})}
  // The Egg of Khelos: the next cracked stage, and at the fifth break the 20/20 Khelos.
  const eggStage=EGG_NEXT[b.cardId];
  if(eggStage)spawnCard(s,eggStage);
  // Soothsayer: restore 6 Health to the hero, then a random 6-Cost minion.
  if(SOOTHSAYER.test(b.text)){const h=hero(s,'me');if(h)h.hp=Math.min(h.maxHp,h.hp+6);conjure(s,1,6)}
  if(discardModel(b).kind==='spiders')for(let i=0;i<2&&room(s)>0;i++)summonDiscard(s,spider(s));
  // Twilight Egg: the Whelp at its printed stats; its growth while the Egg waits is not kept.
  if(WHELP_EGG.test(b.text)&&room(s)>0){
    const raw=s.game?.extra?.['Accelerated Whelp']??{CARDTYPE:'MINION',name:'Accelerated Whelp',ATK:2,HEALTH:1,text:''};
    summonDiscard(s,{id:-(++s.nextToken),name:raw.name,atk:Number(raw.ATK??2),hp:Number(raw.HEALTH??1),raw});
  }
  // Voidlord: three Demons with Taunt.
  const v=VOIDLORD.exec(b.text);
  if(v)tokens(s,{n:3,atk:Number(v[1]),hp:Number(v[2]),with:'taunt',name:'Demon'});
  // Unstable Prototype: every minion in hand gets +1/+1.
  if(UNSTABLE.test(b.text))for(const c of s.hand)if(c.type==='MINION')growCard(c,1,1);
  // Fleeing demons: the hunter on the other chair draws, and the next Portal (or Broxigar) comes.
  const stage=DEMONS.indexOf(b.cardId)+1;
  if(stage){const g=flip(s);portalDeath(g,stage);Object.assign(s,flip(g))}
  // Vaultkeeper: the minions that stood on either side of it when it died.
  const a=ADJACENT.exec(b.text);
  if(a&&b.slot!=null){
    const row=s.me.filter(x=>x.type==='MINION');
    for(const x of [row[b.slot-1],row[b.slot]])if(x)grow(x,{atk:Number(a[1]),hp:Number(a[2])});
  }
  for(const id of b.drew??[])discard(s,'pick',id);
}
function reap(s){
  for(let pass=0;pass<40;pass++){
    const dead=[...s.me,...s.opp].filter(gone);
    if(!dead.length)return;
    // Where each dead minion stood among the living ones, for an adjacency Deathrattle.
    for(const side of [s.me,s.opp]){let i=0;for(const b of side)if(b.type==='MINION'){if(gone(b))b.slot=i;else i++}}
    s.me=s.me.filter(b=>!gone(b));s.opp=s.opp.filter(b=>!gone(b));
    for(const b of dead){
      if(b.side==='me')s.died=(s.died??0)+1;
      else s.them={...s.them,died:(s.them.died??0)+1};
      // The grave: the Deathrattle minions each seat has lost, for Undeath Sentence and Umbra.
      if(!b.silenced&&ON_DEATH.test(ownText(b.text))){
        const rec={...b,side:'me'};
        if(b.side==='me')s.grave=[...(s.grave??[]),rec];
        else s.them={...s.them,grave:[...(s.them.grave??[]),rec]};
      }
      if(b.side==='me')rattle(s,b);
      else{const f=flip(s);rattle(f,b);Object.assign(s,flip(f))}
    }
  }
}

// Start of the acting side's turn: a crystal, fresh attacks, the location cooldown, a card.
export function beginTurn(s){
  s.crystals=Math.min(10,s.crystals+1);s.mana=s.crystals;
  if(s.power)s.power.used=false;
  s.sites=s.sites.map(x=>{const cooldown=Math.max(0,(x.cooldown??0)-1);return {...x,cooldown,ready:!cooldown}});
  for(const b of s.me){
    b.attacks=0;b.exhausted=false;b.rushOnly=false;
    if(b.type==='HERO'){b.atk=s.weapon?.atk??0;b.canAttack=b.atk>0;b.lifesteal=weaponSteals(s.weapon)}
    else b.canAttack=!b.dormant;
  }
  s.died=0;s.them={...s.them,died:0};
  awaken(s);
  if(s.game&&s.timers?.length)fireTimers(s);                      // after the refresh: new bodies stay sick
  pull(s,1);
  reap(s);
}
// End of turn: Temporary cards are discarded (their payoffs fire), the hero's Attack is its own
// turn's only, then the other side begins.
function passTurn(s){
  for(const c of s.hand.filter(c=>c.temp))discard(s,'pick',c.id);
  reap(s);
  s.spellTax=0;                                                   // Cult Neophyte's tax lasted one turn
  const h=hero(s,'me');h.atk=0;h.canAttack=false;
  for(const b of s.me)b.frozen=false;                             // a frozen body thaws at the end of its owner's turn
  const f=flip(s);
  f.turn=(f.turn??0)+1;
  beginTurn(f);
  return f;
}
