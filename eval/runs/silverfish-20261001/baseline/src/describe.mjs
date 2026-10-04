import {atkOf,enemyHero,heroHp,attackOptions,faceDamage} from './lethal.mjs';
import {isCoin} from './power.mjs';
import {deckFor} from './deck.mjs';
import {immediateDraws,heroAttackGain,heroCanSwing,textOf} from './mechanics.mjs';
import {drawRiskText} from './draw-risk.mjs';
import {effectNote} from './effect-state.mjs';
// Public stats for this list: how often games were won when the card stayed in the opening hand.
// Only that column is passed on. Played win rate is confounded by *when* a card gets played --
// Hand of Gul'dan shows 31.7% because it is hard-cast once the discard plan has failed -- and
// read as a verdict on the card it would talk Jev out of plays that are right.
// The numbers belong to one list, so they come from the deck the state is playing (deck.mjs).
const MULL=state=>deckFor(state).mulligan;
export const mulliganWR=(c,state)=>MULL(state).cards?.[c?.name]?.mulliganWR??null;
export const mulliganKept=(c,state)=>MULL(state).cards?.[c?.name]?.kept??null;
export const mulliganRelative=(c,state)=>MULL(state).cards?.[c?.name]?.relativeToDeck??null;
const mullStat=(c,state)=>{
  const wr=mulliganWR(c,state);
  if(wr==null)return '';
  const kept=mulliganKept(c,state),relative=mulliganRelative(c,state);
  if(deckFor(state).name==='dh-void')
    return `; opening-hand WR ${wr}%, kept ${kept??'?'}%${relative?`, ${relative} this deck's average`:''}`;
  return `; kept in opening hands it wins ${wr}% vs the deck's ${MULL(state).deckWinrate}% average`;
};
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
  const label=c=>(DISCARD_PAYOFF.test(flat(c.text))
    ?`${name(c)} (discarding it: "${flat(c.text)}")`
    :`${name(c)} (nothing happens when it is discarded; the card is simply lost)`)
    +(immediateDraws(c,state)?drawRiskText({...state,me:{...state.me,hand:(state.me.hand??[]).filter(x=>x.entityId!==c.entityId&&x.entityId!==src.entityId)}},immediateDraws(c,state)):'');
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
// User ruling (2026-09-25, game 9): the opponent shuffled Abyssal Curse into our hand and Jev
// never saw it as a threat. Its text arrives with the numbers unfilled ("take {0} damage"), so
// the damage-reading patterns miss it; the phrasing alone says what it is.
export const isCurse=c=>c?.CARDTYPE==='SPELL'&&/at the start of your turn,? take/i.test(flat(c?.text));
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
  if(isCurse(card))out.push('curse: damages you every turn while held -- discard it or cast it to be rid of it');
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

// Board slots a card fills when played: the minion itself plus what its text summons.
const SUMMONS=/\bsummon (a|an|one|two|three|four|\d+)\b/i;
const COUNT={a:1,an:1,one:1,two:2,three:3,four:4};
export const summoned=c=>{const m=SUMMONS.exec(flat(c?.text));return m?COUNT[m[1].toLowerCase()]??Number(m[1]):0};

function dhDiscoverNote(state,picked){
  if(deckFor(state).name!=='dh-void'||!state.choice?.source||
    !/discover/i.test(flat(state.choice.source.text)))return '';
  const offers=state.choice.entities??[],mana=Number(state.me?.mana??0);
  const tagged=(c,key)=>c?.[key]===1||c?.[key]==='1';
  const bodiesOnBoard=(state.me?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&!tagged(c,'DORMANT')).length;
  const handSize=(state.me?.hand??[]).length;
  // Stealth prevents targeting, not attacking next turn. Only Dormant or currently Frozen
  // minions are excluded from the opponent's likely next-turn attack total.
  const enemy=(state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&!tagged(c,'DORMANT')&&!tagged(c,'FROZEN'));
  const incoming=enemy.reduce((n,c)=>n+Number(c.ATK??c.baseAttack??0),0);
  const hero=(state.me?.board??[]).find(c=>c.CARDTYPE==='HERO');
  const health=Math.max(0,Number(hero?.HEALTH??hero?.baseHealth??0)-Number(hero?.DAMAGE??0));
  const urgency=incoming>=health&&incoming>0;
  const describeOffer=c=>{
    const t=flat(c.text),cost=Number(c.COST??c.baseCost??0);
    const removal=/\bdeal \d+ damage\b|\bdestroy\b|\bkill\b|\btransform\b|\bsilence\b|\bfreeze\b/i.test(t);
    const dormant=tagged(c,'DORMANT')||/\bdormant\b/i.test(t);
    const delayed=dormant||/at the start of your next turn|next turn/i.test(t);
    const draw=/\bdraw (?:a|one|two|three|\d+) cards?\b/i.test(t);
    const body=c.CARDTYPE==='MINION'||/\bsummon\b/i.test(t);
    const tags=[];
    if(removal)tags.push('解場候選');
    if(body)tags.push(dormant?'休眠手下（暫不攻擊）':delayed?'下回合生效':'手下／鋪場');
    if(draw)tags.push('抽牌');
    if(!tags.length)tags.push('其他效果，依卡文評估');
    return `${name(c)} (${cost}費：${tags.join('、')}${cost>mana?'；本回合費用不足':''}${delayed?'；不會立即生效':''})`;
  };
  const selected=offers.find(c=>c.entityId===picked?.entityId);
  return ` 惡魔獵人發現選擇請按當前需求比較：目前敵方可攻擊手下約有 ${incoming} 攻擊、我方 ${health} 血${urgency?'（已達致命線，先找本回合能移除或阻止攻擊的牌）':''}；我方有 ${bodiesOnBoard} 隻非休眠手下、手牌 ${handSize} 張、剩餘 ${mana} 費。選項分類：${offers.map(describeOffer).join('; ')}。解場要確認目標合法且傷害足以擊殺；若場面不急且手牌少，抽牌較有價值；若場面空或落後，優先能立刻站場的手下。休眠或下回合才召喚的牌不算立即解場／防斬殺。${selected?`目前候選 ${name(selected)}，依上述局勢評估是否比其他選項更合適。`:''}`;
}
export const bodies=c=>(c?.CARDTYPE==='MINION'?1:0)+summoned(c);

// User valuation (2026-09-30): three +1/+1 recipients are roughly 2.5 mana of
// tempo; five are roughly 4-5. These are coaching heuristics, not game mechanics.
export function buffImpact(state,card){
  const t=flat(card?.text),m=/give your (?:other )?minions \+(\d+)\/\+(\d+)/i.exec(t);
  if(card?.CARDTYPE!=='SPELL'||!m||/destroy|random|if |until /i.test(t))return null;
  const board=state.me?.board??[];
  const live=board.filter(c=>c.CARDTYPE==='MINION'&&c.DORMANT!==1&&c.DORMANT!=='1'
    &&(c.HEALTH==null&&c.baseHealth==null||Number(c.HEALTH??c.baseHealth)-Number(c.DAMAGE??0)>0));
  const slots=Math.max(0,7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length);
  const lowest=/discard your lowest cost card/i.test(t);
  const rest=(state.me?.hand??[]).filter(c=>c.entityId!==card.entityId);
  const low=Math.min(...rest.map(cost)),targets=lowest?rest.filter(c=>cost(c)===low):[];
  const discardBodies=c=>!DISCARD_PAYOFF.test(flat(c.text))?0
    :/if you discard this minion, summon it/i.test(flat(c.text))?1:summoned(c);
  // A lowest-cost tie is random. Only the minimum known summon payoff is guaranteed.
  const added=targets.length?Math.min(slots,...targets.map(discardBodies)):0;
  const recipients=live.length+added,attack=recipients*Number(m[1]),health=recipients*Number(m[2]);
  return {existing:live.length,recipients,attack,health,added,targets,safeDiscard:targets.every(c=>DISCARD_PAYOFF.test(flat(c.text))),
    tempoMana:m[1]==='1'&&m[2]==='1'?Math.max(0,recipients-0.5):null};
}
export const valuableBuff=(state,c)=>{
  const v=buffImpact(state,c);
  return !!v&&v.existing>=3&&cost(c)<=1&&cost(c)<=Number(state.me?.mana??0)
    &&(v.safeDiscard||buffLines(state,c).length>0);
};
function buffLines(state,c){
  const hand=state.me?.hand??[];
  const pool=hand.some(x=>x.entityId===c?.entityId)?hand:[...hand,c].filter(Boolean);
  const pure=x=>buffImpact(state,x)&&!/discard/i.test(flat(x.text));
  const lines=[];
  for(const first of pool){
    if(!pure(first))continue;
    for(const second of pool){
      if(first.entityId===second.entityId||first.entityId!==c.entityId&&second.entityId!==c.entityId
        ||!/discard your lowest cost card/i.test(flat(second.text))
        ||cost(first)+cost(second)>Number(state.me?.mana??0))continue;
      const before=buffImpact(state,first);
      const after={...state,me:{...state.me,hand:pool.filter(x=>x.entityId!==first.entityId)}};
      const next=buffImpact(after,second);
      if(next?.safeDiscard)lines.push({first,second,mana:cost(first)+cost(second),
        attack:before.attack+next.attack,health:before.health+next.health,next});
    }
  }
  return lines;
}
export const buffManaReserve=(state,c)=>Math.max(cost(c),...buffLines(state,c).map(line=>line.mana));
function buffNote(state,c){
  const v=buffImpact(state,c);
  if(!v||cost(c)>Number(state.me?.mana??0))return '';
  let note=` Board buff: ${v.recipients} recipient(s), total +${v.attack} Attack/+${v.health} Health`
    +(v.added?`, including ${v.added} minion(s) summoned by the discard before the buff`:'')+'.';
  if(v.tempoMana!=null&&v.recipients>=3)
    note+=` User tempo estimate: about ${v.tempoMana} mana of board value for ${cost(c)} mana; Life Tap buys only one unknown card (roughly 1-1.5 mana of value), costs 2 mana and 2 Health. Prefer the productive buff over tapping or hard-casting a passive egg, unless survival, lethal or the discard cost changes the comparison.`;
  // A pure buff clears its own low-cost card before Whispers, preserving both buffs.
  const lines=buffLines(state,c);
  return note+(lines.length?' Available buff sequence: '+lines.map(({first,second,mana,attack,health,next})=>
    `Play ${name(first)} then ${name(second)} for ${mana} mana: total +${attack} Attack/+${health} Health; the second buff reaches ${next.recipients} minions and discards ${next.targets.map(name).join(' or ')||'nothing'}. Newly summoned minions do not gain an immediate face attack.`).join(' '):'');
}
const slotsFree=state=>7-(state.me?.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;

// User ruling (2026-09-25, game 6): Catacombs offered Disposable Acolytes and Silverware Golem at
// 0 mana, and "要考慮" which. Both pay out when discarded; what differs is the board they leave --
// two random 1-Cost minions in two slots, or a 3/3 in one -- against the room left and the
// summoners still in hand. Say both, so the pick weighs them instead of reading two payoffs.
function discardBoard(state,c){
  const t=flat(c.text);
  const n=/\bsummon it\b/i.test(t)?1:summoned(c);
  if(!n)return '';
  const what=/\bsummon it\b/i.test(t)?`itself as a ${c.ATK??c.baseAttack}/${c.HEALTH??c.baseHealth}`:`${n} minion(s) as its text says`;
  const others=(state.me?.hand??[]).filter(x=>bodies(x)>0).map(x=>`${name(x)} (${cost(x)} mana, ${bodies(x)} slot(s))`);
  return ` Discarded, it summons ${what}, filling ${n} of your ${slotsFree(state)} free board slot(s) out of 7.`
    +(others.length?` Cards in hand that also need board slots: ${others.join('; ')}.`:'');
}
function pickNote(state,c){
  if(!c)return '';
  const mana=state.me?.mana??0,temp=/\btemporary\b/i.test(flat(state.choice?.source?.text));
  const castable=cost(c)<=mana;
  if(!temp){
    const source=state.choice?.source,sourceText=flat(source?.text);
    const map=/if you play it this turn, also pick one of the others/i.test(sourceText);
    const studies=/your next one costs \(1\) less/i.test(sourceText)&&/outcast/i.test(sourceText);
    const effective=Math.max(0,cost(c)-(studies?1:0));
    return ` You have ${mana} mana left this turn.`
      +(source?` Choice source: ${name(source)} — "${sourceText}".`:'')
      +(map?` Playing the discovered spell this turn unlocks another pick from the original offers; ${effective<=mana?'its mana cost fits, but it still needs a legal target and board space.':'its cost exceeds your remaining mana, so do not count that bonus this turn.'}`:'')
      +(studies?` Your next Outcast card costs (1) less; if spent on this pick its cost is ${effective}. The discount is shared with other Outcast cards in hand.`:'')
      +(!map&&effective>mana?' This pick cannot be cast this turn with the current mana.':'')
      +(isOutcast(c)?' It enters at the right end, so Outcast is available immediately; adding another card can bury it.':'')
      +dhDiscoverNote(state,c);
  }
  const onDiscard=DISCARD_PAYOFF.test(flat(c.text))
    ?' Being discarded triggers its text, so it pays out at end of turn even if never cast.'
    :' Nothing happens when it is discarded, so an uncast copy is simply lost.';
  return ` ${name(state.choice.source)} makes the pick Temporary: it is discarded at the end of this turn.`
    +` You have ${mana} mana left, so `+(castable?`it can still be cast this turn.`:`it cannot be cast this turn and is only worth what its discard does.`)
    +onDiscard+(DISCARD_PAYOFF.test(flat(c.text))?discardBoard(state,c):'');
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

// Outcast (Demon Hunter) fires only when the card sits at the left or right end of the hand,
// and nothing in a hand list says which cards those are. The hand arrives sorted by
// ZONE_POSITION (power.mjs), and every card that enters the hand -- drawn, discovered, generated
// -- lands at the right end. So each play states three facts: whether this card's own Outcast is
// on right now, whether playing it leaves another Outcast card at an end, and whether the cards
// it adds push a rightmost Outcast card off the end.
export const isOutcast=c=>/\bOutcast:/i.test(flat(c?.text));
const outcastText=c=>flat(c?.text).match(/\bOutcast:\s*([^.]*\.?)/i)?.[1]??'';
const ADDS_CARDS=/\b(draw|draws|get|discover)\b/i;
function outcastNote(state,src){
  const hand=state.me.hand??[],i=hand.findIndex(c=>c.entityId===src?.entityId);
  if(i<0)return '';
  const n=hand.length,out=[];
  if(isOutcast(src)){
    if(i===0||i===n-1)out.push(` It is the ${i===0?'leftmost':'rightmost'} card in your hand, so its Outcast is active: "${outcastText(src)}"`);
    else out.push(` Its Outcast is not active: it is not at either end of your hand (${i} card(s) to its left, ${n-1-i} to its right). Played from here it does only its base text.`);
  }
  // After this card leaves, the hand closes up around the gap.
  const rest=hand.filter(c=>c!==hand[i]),last=rest.length-1;
  const opened=rest.filter((c,j)=>isOutcast(c)&&(j===0||j===last)&&!(hand.indexOf(c)===0||hand.indexOf(c)===n-1));
  if(opened.length)out.push(` Playing it leaves ${opened.map(name).join(' and ')} at an end of your hand, which turns on its Outcast.`);
  const right=rest[last];
  if(ADDS_CARDS.test(flat(src?.text))&&last>0&&isOutcast(right))
    out.push(` Cards it adds to your hand go to the right end, pushing ${name(right)} off that end, so its Outcast turns off.`);
  return out.join('');
}

function dhNote(state,src,target){
  if(deckFor(state).name!=='dh-void')return '';
  const text=textOf(src),n=immediateDraws(src,state),out=[];
  const hit=src?.CARDTYPE==='SPELL'&&/^Deal (\d+) damage\b/i.exec(text);
  if(hit&&target?.CARDTYPE==='MINION'){
    const hp=Number(target.HEALTH??target.baseHealth??0)-Number(target.DAMAGE??0);
    out.push(` Printed spell damage ${hit[1]} versus ${hp} remaining Health (${Math.max(0,Number(hit[1])-hp)} excess before shields or damage modifiers). Check ready weapon/Rush trades before spending this card; extra damage does not improve a kill.`);
  }
  if(n)out.push(` This play draws ${n} card(s) now${isOutcast(src)?' including its currently active Outcast bonus':''}.`);
  if(/at the start of your next turn/i.test(text))out.push(' This effect happens next turn: count no new body, Taunt or damage this turn.');
  if(/summon a random dormant/i.test(text))out.push(' The summoned minion is Dormant: it occupies a slot but cannot attack or protect you with Taunt while dormant.');
  if(src?.CARDTYPE==='WEAPON'){
    const old=(state.me.board??[]).find(c=>c.CARDTYPE==='WEAPON');
    if(old)out.push(` Equipping this replaces ${name(old)}; any remaining attack with the old weapon is lost if you replace it first.`);
    out.push(` Equipping does not reset your hero's attacks. ${heroCanSwing(state)?'Your hero still has an attack available.':'Your hero cannot attack again in its current state.'}`);
  }
  if(/get two 1-Cost Gorishi Stingers/i.test(text))out.push(' This adds two cards, not two minions. Each Stinger costs another 1 mana and needs its own legal target and a board slot for the Rush Grub.');
  if(src?.name==='Infestation'){
    const left=Number(state.me.mana??0)-Number(src.COST??src.baseCost??2);
    out.push(` After this play ${left} mana remains: at printed cost you can pay for ${Math.max(0,Math.min(2,Math.floor(left)))} Stinger(s) now. Without follow-up mana it supplies no board or damage this turn, but banking both Stingers is productive use of spare mana even on an empty enemy board. With no enemy minions, prefer Grim Harvest when available, then bank Stingers rather than waste mana or use Demon Claws.`);
  }
  if(src?.name==='Illidari Studies'||immediateDraws(src,state)>0)
    out.push(' Resolve this new information before committing known plays when mana, hand space and Outcast order allow; replan from the cards actually obtained.');
  if(src?.name==='Grim Harvest')
    out.push(' The card drawn enters at the right end. Playing Harvest to the right of Eye Beam does not guarantee Eye Beam remains Outcast after the draw; you must also afford to play the newly drawn rightmost card. Do not budget an unverified Outcast discount.');
  if(src?.name==='Chaos Strike')
    out.push(' This buys temporary +2 hero Attack as well as a draw. Compare the safe trade it enables with Sigil of Cinder development; do not spend two mana automatically just for the draw or nonlethal face damage.');
  if(src?.name==='Press the Advantage')
    out.push(' Its +1 hero Attack lasts only this turn. If you will cast this and attack with the hero, cast it first so the swing uses the extra Attack; the draw may reveal a better continuation.');
  if(src?.name==='Gorishi Stinger'){
    const room=7-(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
    out.push(' Resolve the 2 spell damage first, then summon a 2/1 Rush Grub.');
    out.push(room>0?' The Grub can attack an enemy minion immediately, possibly a different target, for 2 combat damage; it cannot attack the enemy hero this turn. This is not an unconditional 4-damage spell. Respect Taunt, Stealth, Divine Shield and retaliation, and replan after the summon.':' The board is full: do not count the Grub unless this spell frees a friendly slot.');
    if(target?.CARDTYPE==='MINION'){
      const hp=Number(target.HEALTH??target.baseHealth??0)-Number(target.DAMAGE??0);
      out.push(` The target currently has ${hp} Health. Compare that with the spell hit and your existing ready attackers before spending another removal; preserve mana for Void Souls.`);
    }
  }
  if(/summon a random .*demon.*improve your future void souls/i.test(text))out.push(' Reobserve after summoning the random Demon. Future copies improve; do not count an unknown summoned body as immediate damage.');
  if(/summon a random\s+1-cost demon.*improve your future void souls/i.test(text))out.push(` This costs ${src?.COST??src?.baseCost??1} mana for one actual random 1-Cost Demon body now, then improves future Void Souls; the stats and keywords are uncertain, but it is a real summon rather than a setup-only spell. Use it when there is board room unless an urgent play needs the mana.`);
  return out.join('');
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
        +(flat(c?.text)?`: "${flat(c.text)}"`:'')+mullStat(c,state)+')';
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
      +pickNote(state,c)
      +(/discover/i.test(flat(state.choice?.source?.text))
        ?buffNote({...state,me:{...state.me,hand:[...(state.me.hand??[]),c]}},c):'');
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
      +(!targetInHand&&side==='enemy'&&target.CARDTYPE==='MINION'?` Effect assessment: ${effectNote(target)}.`:'')
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
    const n=immediateDraws(src,state);
    const body=(text?` Text: "${text}"`:'')+(n?drawRiskText(state,n,{played:true}):'');
    const mine=(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION').length;
    // Board space decides whether a card that summons is value or a blank. Locations
    // occupy a slot too, so count them: at 7/7 a summon payoff has nowhere to land.
    const used=(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
    const space=` Your board is ${used}/7; ${7-used} space(s) free${used>=7?', so nothing you summon this turn can enter play':''}.`;
    const context=(/minions/i.test(text)?` You control ${mine} minion(s).`:'')
      +(src?.cardId==='CAP_805t'?(src.resummons?.length
        ?` Known friendly recovery pool: ${src.resummons.map(c=>c.name??c.cardId).join(', ')}; up to ${Math.min(7-used,src.resummons.length)} bodies fit. Resummoning does not trigger Battlecries or guarantee attacks this turn; restored stats and further triggers are resolved by the game.`
        :' Recovery pool is unknown; do not assume an empty pool or invent summons.'):'')
      +(/summon|discover|discard/i.test(text)?space:'')
      +discardTargets(state,src)
      +roleNote(state,src)
      +coinNote(state,src)
      +outcastNote(state,src)
      +dhNote(state,src,target);
    return `Play ${name(src)} from hand for ${src?.COST??src?.baseCost} mana (${(src?.CARDTYPE??'card').toLowerCase()}${stats(src)}).${body}${context}${buffNote(state,src)}${targetText}`;
  }
  if(src?.CARDTYPE==='HERO_POWER'){
    const t=flat(src?.text).replace(/^Hero Power\s*/i,'').replace(/\$(\d+)/g,'$1');
    const gain=heroAttackGain(src),h=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
    const attack=gain?` Your hero's Attack becomes ${Number(h?.ATK??0)+gain} this turn. This does not grant an extra attack${heroCanSwing(state)?'':'; your hero cannot swing in its current state'}.`:'';
    const buffs=(state.me.hand??[]).filter(c=>valuableBuff(state,c));
    const tempo=buffs.length&&/draw a card/i.test(t)?` Productive board buffs already in hand: ${buffs.map(name).join(', ')}. Their known board gain takes priority over this speculative one-card draw.`:'';
    const n=immediateDraws(src,state);
    return `Use hero power ${name(src)} for ${src?.COST??src?.baseCost??2} mana.${t?` Text: "${t}".`:''}${n?drawRiskText(state,n):''}${attack}${crowdOut(state,src)}${tempo}${targetText}`;
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
