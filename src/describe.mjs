import {atkOf,enemyHero,heroHp,attackOptions,faceDamage} from './lethal.mjs';
import {isCoin} from './power.mjs';
// Candidates reach Jev as raw option records: {"option":1,"entityId":49,"targetId":78}.
// Nothing in that says "attack the enemy hero with a 1/1", so spell it out.
// Heroes included: with a weapon equipped "Attack with your hero" otherwise hides both
// how hard it hits and how much life the swing risks.
// A missing ATK tag means zero, not unknown. Rendering it "?" made an undefended enemy
// hero look like it might hit back, and Jev ended a turn with three free attacks unused.
const stats=c=>['MINION','WEAPON','HERO'].includes(c?.CARDTYPE)
  ?` ${c.ATK??c.baseAttack??0}/${(c.HEALTH??c.baseHealth??0)-(c.DAMAGE??0)}`:'';
const name=c=>c?.name??`entity ${c?.entityId}`;
const flat=t=>(t??'').replace(/\[x\]/g,' ').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();

// This deck wins by discarding cards that pay for it. Whether a discard outlet is worth
// using depends entirely on what is in hand right now, so say so: Jev ended a turn rather
// than discard a Boneweb Egg for two free bodies because nothing named the payoff.
const DISCARD_PAYOFF=/if you discard this|when you (?:play or )?discard this/i;
function payoffs(state,src){
  if(!/discard/i.test(flat(src?.text)))return '';
  const hits=(state.me.hand??[]).filter(c=>DISCARD_PAYOFF.test(flat(c.text)));
  return hits.length
    ? ` Cards in your hand that reward being discarded: ${hits.map(c=>`${name(c)} ("${flat(c.text)}")`).join('; ')}.`
    : ' No card in your hand rewards being discarded.';
}

// "Discard your highest Cost card" is a gamble priced entirely by what else is in hand,
// and ties resolve at random. Name the candidates or the option cannot be evaluated.
function discardTargets(state,src){
  const m=/discard your (highest|lowest) cost card/i.exec(flat(src?.text));
  if(!m)return '';
  const rest=(state.me.hand??[]).filter(c=>c.entityId!==src.entityId);
  if(!rest.length)return ' Your hand would be empty, so nothing would be discarded.';
  const cost=c=>c.COST??c.baseCost??0,want=m[1].toLowerCase();
  const pick=want==='highest'?Math.max(...rest.map(cost)):Math.min(...rest.map(cost));
  const tied=rest.filter(c=>cost(c)===pick);
  // Naming the card that gets discarded is not enough. Told only that Wicked Whispers would
  // discard a Boneweb Egg or a Disposable Acolytes, Jev ranked END_TURN above it at 0.60 --
  // to a scorer a discard reads as a cost, and nothing said these two pay out when discarded.
  // So each named candidate carries its own discard text, and the option says plainly whether
  // the discard is a loss or a payoff.
  const label=c=>DISCARD_PAYOFF.test(flat(c.text))
    ?`${name(c)} (discarding it: "${flat(c.text)}")`
    :`${name(c)} (nothing happens when it is discarded; the card is simply lost)`;
  const every=tied.every(c=>DISCARD_PAYOFF.test(flat(c.text)));
  const verdict=every
    ?` Every card the discard can hit pays out when discarded, so the discard costs you no card.`
    :'';
  return tied.length>1
    ? ` The ${want}-cost cards remaining in hand tie at ${pick} mana -- ${tied.map(label).join('; ')} -- so the discard picks one of them at random (1 in ${tied.length} each).${verdict}`
    : ` It would discard ${label(tied[0])} (${pick} mana).${verdict}`;
}

// Card roles, derived from the card's own text rather than a list of card names. The deck is
// fixed, but Discover and Cursed Catacombs pull from the whole collection, so a hardcoded list
// would go blind exactly where the judgement is hardest.
// Outlets do not share a phrasing: Wicked Whispers says \"Discard your lowest Cost card\",
// Ocular Occultist says \"Choose a card in your hand to discard\", Platysaur says \"Discard it\".
// Match the act of discarding, and exclude the retrospective 'cards you've discarded this
// game' that counters like Duke of Below use -- those count discards, they do not cause them.
const DISCARD_OUTLET=/\bto discard\b|\bdiscards? (?:a|an|your|the|it|them|one|two|three|\d)\b/i;
const DISCARD_COUNTER=/you'?ve discarded|you have discarded|cards? you discarded/i;
const DRAWS=/\bdraws? (?:a|your|one|two|three|\d|cards)\b/i;
// A card in hand has no keyword tags yet, so its text is the only source; a body already in
// play has tags, and once it is Silenced the tag is gone while the text still reads Taunt.
// Trust the tag alone in that case, or a silenced Taunt keeps being counted as a wall.
const keyword=(c,tag,word)=>{
  const on=c?.[tag]===1||c?.[tag]==='1';
  if(on)return true;
  if(c?.SILENCED===1||c?.SILENCED==='1')return false;
  return word.test(flat(c?.text));
};
const hasRush=c=>keyword(c,'RUSH',/\brush\b/i);
const hasTaunt=c=>keyword(c,'TAUNT',/\btaunt\b/i);
// Grim Rally's whole text is '+1/+1.', so the stat pattern alone has to count as a buff.
// Duke of Below's 'Has +2/+2 for each card you've discarded' is a statline that grows, not
// a buff it hands out, so that phrasing is stripped before the test. A card that did both
// would still be caught, since only the 'Has +X/+X' clause is removed.
const isBuff=c=>/\+\d+\/\+\d+/.test(flat(c?.text).replace(/\bhas \+\d+\/\+\d+/ig,''));
export function roles(card){
  const t=flat(card?.text),out=[];
  if(DISCARD_OUTLET.test(t)&&!DISCARD_COUNTER.test(t))out.push('discard outlet');
  if(DISCARD_PAYOFF.test(t))out.push('discard fodder');
  if(isBuff(card))out.push('buff');
  if(hasRush(card))out.push('rush');
  // Taunt is not flavour here: our own Taunts are health the opponent must chew through
  // before a point reaches our hero, which is exactly what `policy.mjs` prices when it
  // decides whether their board is already lethal.
  if(hasTaunt(card))out.push('taunt');
  if(DRAWS.test(t))out.push('draw');
  if(!out.length&&card?.CARDTYPE==='MINION')out.push('plain minion');
  return out;
}

// A label repeated on every option is worth nothing to a scorer, so the role only earns its
// place where it differs between options. The case that keeps costing games: hard-casting a
// card that pays out from the discard while an outlet sits in hand. Six mana buys what the
// outlet gives for nothing, and no single option ever said so.
function roleNote(state,src){
  const r=roles(src);
  if(!r.length)return '';
  let s=` Role: ${r.join(', ')}.`;
  if(r.includes('discard fodder')){
    const outlets=(state.me.hand??[]).filter(c=>c.entityId!==src.entityId&&roles(c).includes('discard outlet'));
    s+=outlets.length
      ?` You also hold ${outlets.length} discard outlet(s) -- ${outlets.map(name).join('; ')} -- and each would trigger this card's discard text without spending its ${src?.COST??src?.baseCost} mana.`
      :` No discard outlet is in your hand, so casting it is the only way to use it now.`;
  }
  return s;
}

// The Coin is one crystal, and the only question is what that crystal buys. Jev reads the
// option in isolation, where "Gain 1 Mana Crystal this turn only" says nothing about whether
// anything in hand is waiting on it. `policy.mjs` already removes a Coin that buys nothing at
// all; this is the softer half -- the crystal can be legal and still be wasted, as it is when
// it takes you to 3 mana and the hand tops out at 2.
function coinNote(state,src){
  if(!isCoin(src))return '';
  const mana=state.me?.mana??0;
  const cost=c=>c.COST??c.baseCost??0;
  const rest=(state.me?.hand??[]).filter(c=>c.entityId!==src.entityId);
  const unlocked=rest.filter(c=>cost(c)===mana+1);
  const already=rest.filter(c=>cost(c)<=mana);
  return ` You have ${mana} mana; the Coin makes it ${mana+1}.`
    +(unlocked.length
      ?` It brings within reach: ${unlocked.map(c=>`${name(c)} (${cost(c)})`).join('; ')}.`
      :` Nothing in your hand costs exactly ${mana+1}, so the crystal unlocks no card on its own.`)
    +(already.length
      ?` Castable without it: ${already.map(c=>`${name(c)} (${cost(c)})`).join('; ')}.`
      :` Nothing in your hand is castable without it.`);
}

// A Discover pick is judged as a card to play, but Cursed Catacombs makes it Temporary: it is
// discarded at the end of this turn. With 0 mana left Jev took Wicked Whispers (a 1-mana buff it
// could never cast) over Disposable Acolytes, whose "when you discard this" summons two minions
// for free at end of turn. What the pick is worth depends on the mana left and on that trigger.
const cost=c=>c?.COST??c?.baseCost??0;
function pickNote(state,c){
  if(!c)return '';
  const mana=state.me?.mana??0,temp=/\btemporary\b/i.test(flat(state.choice?.source?.text));
  const castable=cost(c)<=mana;
  if(!temp)return ` You have ${mana} mana left this turn${castable?'':', so it cannot be cast this turn'}.`;
  const onDiscard=DISCARD_PAYOFF.test(flat(c.text))
    ?' Being discarded triggers its text, so it pays out at end of turn even if never cast.'
    :' Nothing happens when it is discarded, so an uncast copy is simply lost.';
  return ` ${name(state.choice.source)} makes the pick Temporary: it is discarded at the end of this turn.`
    +` You have ${mana} mana left, so `+(castable?`it can still be cast this turn.`:`it cannot be cast this turn and is only worth what its discard does.`)
    +onDiscard;
}

// The hero power is spare-mana value: 2 mana for a card later. Offered Life Tap at 3 mana
// beside two 3-mana minions, Jev tapped (0.44) and cast neither -- nothing said the tap is what
// made them unaffordable.
function crowdOut(state,src){
  const mana=state.me?.mana??0,left=mana-cost(src);
  const lost=(state.me?.hand??[]).filter(c=>cost(c)<=mana&&cost(c)>left);
  return ` You have ${mana} mana; this leaves ${Math.max(0,left)}.`
    +(lost.length?` Castable now but not after it: ${lost.map(c=>`${name(c)} (${cost(c)})`).join('; ')}.`:' It prices no card in your hand out of this turn.');
}

export function describe(state,action){
  const all=[...(state.me.hand??[]),...(state.me.board??[]),...(state.opponent.board??[]),...(state.choice?.entities??[])];
  const find=id=>all.find(c=>c.entityId===id);

  if(action.type==='END_TURN')return 'End the turn.';
  // A bare "Replace Platysaur" says nothing about cost, body or text, which is the whole
  // basis for a mulligan. Spell out both sides of the split.
  if(action.type==='MULLIGAN'){
    // Fall back to the bare name when the card's own definition is missing, rather than
    // printing "undefined mana card".
    const card=c=>{
      const cost=c?.COST??c?.baseCost;
      if(cost==null)return name(c);
      return `${name(c)} (${cost} mana ${(c?.CARDTYPE??'card').toLowerCase()}${stats(c)}`
        +(flat(c?.text)?`: "${flat(c.text)}"`:'')+')';
    };
    const hand=state.me.hand??[];
    const out=action.replace.map(id=>find(id)).filter(Boolean);
    const kept=hand.filter(c=>!action.replace.includes(c.entityId));
    const keeping=kept.length?` Keeping ${kept.map(card).join('; ')}.`:' Keeping nothing.';
    return out.length
      ?`Replace ${out.map(card).join('; ')}.${keeping} Replaced cards go back into the deck and are redrawn at random.`
      :`Keep the whole opening hand: ${hand.map(card).join('; ')}.`;
  }
  if(action.type==='CHOICE'){
    // "Choose Boneweb Egg." says nothing about what choosing costs or gains. Name the
    // prompt's own wording and the card's text, or Jev is picking between bare labels.
    const c=find(action.entityId),t=flat(c?.text);
    return `Choose ${name(c)} (${(c?.CARDTYPE??'card').toLowerCase()}, ${c?.COST??c?.baseCost} mana${stats(c)}).`
      +(t?` Its text: "${t}".`:'')
      +pickNote(state,c);
  }

  const src=find(action.entityId);
  const inHand=(state.me.hand??[]).some(c=>c.entityId===action.entityId);
  const target=action.targetId!=null?find(action.targetId):null;
  const side=target&&(state.opponent.board??[]).some(c=>c.entityId===action.targetId)?'enemy':'friendly';
  // A target's own card text is the whole reason to pick it -- a 0/3 that draws a card
  // every turn has to die, and "Mana Tide Totem 0/3" alone does not say so.
  const tText=target&&target.CARDTYPE!=='HERO'?flat(target.text):'';
  const tAtk=target?(target.ATK??target.baseAttack??0):0;
  // A targeted discard ("Choose a card in your hand to discard") aims at a card in hand, not
  // at a body on the board. Calling it a "friendly minion" is wrong whenever the target is a
  // spell, and printing only its text leaves the one fact that decides the pick unsaid.
  // Offered Ocular Occultist discarding Silverware Golem (summons itself) versus discarding
  // Party Fiend (gone for nothing), Jev scored both 0.14 -- it could not tell them apart.
  const targetInHand=target&&(state.me.hand??[]).some(c=>c.entityId===action.targetId);
  const where=targetInHand
    ?'card in your hand'
    :`${side} ${target?.CARDTYPE==='HERO'?'hero':'minion'}`;
  const discarding=targetInHand&&/discard/i.test(flat(src?.text));
  const verdict=!discarding?''
    :DISCARD_PAYOFF.test(tText)
      ?' Discarding it triggers that text, so the card is not lost -- it pays out from the discard.'
      :' Nothing happens when this card is discarded; it is simply lost.';
  const targetText=target
    ? ` Target: ${where} ${name(target)}${stats(target)}.`
      +(tText?` It reads: "${tText}".`:'')
      +verdict
      +(!targetInHand&&target.CARDTYPE==='MINION'&&tAtk===0?' It has 0 Attack, so it deals no damage back.':'')
      +(target.CARDTYPE==='HERO'?' A hero never deals damage back when attacked, so this attack is free.':'')
    : '';

  if(inHand){
    // The board state already carries this card's text, yet a board-wide buff still got played
    // into an empty board. So the deciding facts go where they cannot be skimmed past: the option.
    const text=flat(src?.text);
    // Minion text used to be suppressed as redundant with the board state. It is not:
    // Duke of Below reached Jev as a bare "minion 4/4", with no Rush and no sign that it
    // grows +2/+2 per discard -- the whole reason to hold it rather than play it now.
    const body=text?` Text: "${text}"`:'';
    const mine=(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION').length;
    // Board space decides whether a card that summons is value or a blank. Locations
    // occupy a slot too, so count them: at 7/7 a summon payoff has nowhere to land.
    const used=(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
    const space=` Your board is ${used}/7; ${7-used} space(s) free${used>=7?', so nothing you summon this turn can enter play':''}.`;
    const context=(/minions/i.test(text)?` You control ${mine} minion(s).`:'')
      +(/summon|discover|discard/i.test(text)?space:'')
      +discardTargets(state,src)
      +roleNote(state,src)
      +coinNote(state,src);
    return `Play ${name(src)} from hand for ${src?.COST??src?.baseCost} mana (${(src?.CARDTYPE??'card').toLowerCase()}${stats(src)}).${body}${context}${targetText}`;
  }
  if(src?.CARDTYPE==='HERO_POWER'){
    const t=flat(src?.text).replace(/^Hero Power\s*/i,'').replace(/\$(\d+)/g,'$1');
    return `Use hero power ${name(src)} for ${src?.COST??2} mana.${t?` Text: "${t}".`:''}${crowdOut(state,src)}${targetText}`;
  }
  if(src?.CARDTYPE==='HERO'){
    // Swinging the hero fires the equipped weapon's after-attack text. Left unsaid, Jev was
    // about to attack face with Chronoclaws equipped and burn the 8/8 Duke of Below, the
    // single highest-cost card in hand.
    const w=(state.me.board??[]).find(c=>c.CARDTYPE==='WEAPON');
    const after=w?` Your equipped ${name(w)} then triggers: "${flat(w.text)}".${discardTargets(state,w)}`:'';
    return `Attack with your hero${stats(src)}.${targetText}${after}`;
  }
  // A location is activated, not swung. Calling it an attack made Jev discard the option.
  if(src?.CARDTYPE==='LOCATION'){
    // A location occupies a board slot, and spending its last charge destroys it and gives
    // that slot back. That makes "use the location" a way to make room, which matters when
    // a discard payoff needs somewhere to summon.
    const left=(src.HEALTH??src.baseHealth??0)-(src.DAMAGE??0);
    const used=(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
    const wear=` It has ${left} use(s) left`+(left<=1
      ?`, so using it now destroys it and frees its board slot (your board is ${used}/7).`
      :`; your board is ${used}/7.`);
    return `Use your location ${name(src)}. Text: "${flat(src?.text)}".${wear}${payoffs(state,src)}${targetText}`;
  }
  return `Attack with your ${name(src)}${stats(src)}.${targetText}`;
}

// Jev reads each option in isolation, so nothing ever tells it how much damage the turn
// still has in it. Offered an exactly-lethal board buff, it drew three cards instead: the
// sum 3+3+2+3+1+1 = 13 against 13 Health appears in no single option, and it does not do
// combat arithmetic on its own. Arithmetic it will not do has to arrive as a fact.
//
// The first version of this appended one identical sentence to every option. That is worth
// nothing to a scorer: a term that is constant across the whole option set cannot change
// their order. Offered "-- that is already lethal." on all six lines, Jev ended the turn.
// So each option now states what the clock means FOR THAT OPTION, and END_TURN says what it
// gives up. Still only facts: what ending the turn forfeits, never what it should pick.
const attackers=attackOptions;
function clockFacts(state,actions){
  const hero=enemyHero(state);
  if(!hero)return null;
  // Nothing can attack during a mulligan, so the clock is pure repetition there.
  if(actions.every(a=>a.type==='MULLIGAN'))return null;
  const total=faceDamage(state,actions);
  // A 0-Attack minion generates no attack option at all, so it vanishes from any count of
  // the turn's damage -- and two of them, once buffed, were the last 2 points of a lethal.
  const zero=(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION'&&(c.ATK??c.baseAttack??0)===0).length;
  // With nothing able to swing and no 0-Attack body waiting on a buff, the line says nothing.
  if(!total&&!zero)return null;
  return {hp:heroHp(hero),total,zero,heroId:hero.entityId,lethal:total>=heroHp(hero)&&total>0};
}

function clockFor(state,action,f){
  if(!f)return '';
  const zeroNote=f.zero
    ?` You also control ${f.zero} minion(s) with 0 Attack; they produce no attack option until something gives them Attack.`
    :'';
  if(action.type==='END_TURN'||action.id==='o0')
    return ` Damage clock: ending the turn now gives up ${f.total} damage that is still available`
      +` against the enemy hero's ${f.hp} Health, and those attacks cannot be taken back`
      +(f.lethal?` -- they are enough to kill the enemy hero this turn, so ending the turn now leaves it alive.`:'.')
      +zeroNote;
  if(action.targetId===f.heroId)
    return ` Damage clock: this is ${atkOf(state,action.entityId)} of the ${f.total} damage still available`
      +` against the enemy hero's ${f.hp} Health`
      +(f.lethal?` -- the ${f.total} together are enough to kill the enemy hero this turn.`:'.')
      +zeroNote;
  return ` Damage clock: the attacks still available this turn total ${f.total} against the enemy hero's ${f.hp} Health`
    +(f.lethal?' -- that is already enough to kill the enemy hero this turn.':'.')
    +zeroNote;
}

// A board-wide buff changes the clock, and by how much is the whole question. Count every
// minion it touches, including the 0-Attack ones the clock cannot otherwise see.
function buffProjection(state,actions,action){
  const src=[...(state.me.hand??[]),...(state.choice?.entities??[])].find(c=>c.entityId===action.entityId);
  if(!src)return '';
  const m=/your (?:other )?minions \+(\d+)\/\+\d+/i.exec(flat(src.text));
  if(!m)return '';
  const x=Number(m[1]);
  const hero=(state.opponent.board??[]).find(c=>c.CARDTYPE==='HERO');
  if(!hero)return '';
  const face=attackers(state,actions).filter(a=>a.targetId===hero.entityId
    &&(state.me.board??[]).some(c=>c.entityId===a.entityId&&c.CARDTYPE==='MINION'));
  const total=face.reduce((n,a)=>n+atkOf(state,a.entityId),0);
  const minions=(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION');
  const zero=minions.filter(c=>(c.ATK??c.baseAttack??0)===0).length;
  const swingers=face.length+zero;
  return ` It would give +${x} Attack to all ${minions.length} of your minions, raising this turn's minion damage from ${total} to as much as ${total+x*swingers}`
    +(zero?` -- the ${zero} minion(s) at 0 Attack can attack once buffed, unless summoning sick.`:'.');
}

// What Jev actually receives: the option plus a sentence saying what it does.
export const criteria=(state,actions)=>{
  const f=clockFacts(state,actions);
  return Object.fromEntries(actions.map(a=>
    [a.id,{...a,description:describe(state,a)+buffProjection(state,actions,a)+clockFor(state,a,f)}]));
};
