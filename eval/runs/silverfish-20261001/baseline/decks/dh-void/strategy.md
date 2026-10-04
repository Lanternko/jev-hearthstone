# Void Demon Hunter strategy

Principles only, as for every deck: card mechanics are spelled out in each option by
`describe.mjs`, and anything that is arithmetic over the visible state is enforced in
`policy.mjs` and `lethal.mjs`. This is a fast aggro list: cheap bodies, cheap card flow, and a
weapon that keeps the hero swinging. It wins by damage before the opponent stabilises.

## The turn, in order

1. Lethal first. If the damage on the table reaches their Health plus Armour, take it and
   ignore everything below. (Enforced in `lethal.mjs`.)
2. Plan Outcast, mana, board slots and attacks together. Draw/discover early when it helps,
   but use a valuable right-edge Outcast before adding cards; play its neighbour first when
   that opens the bonus. Do not sacrifice lethal, an existing weapon swing or tempo just to draw.
   Prefer resolving Studies and affordable draw/discover before spending mana on known plays:
   the new information can change the whole turn. Replan after each result; reserve mana for
   an urgent answer, avoid overdraw, and protect active Outcast bonuses.
3. A Rush body clears on the turn it lands but cannot hit the enemy hero then. Trade first
   when a full board prevents the summons you need. Saving removal or ending with spare mana
   can be correct for situational removal. Develop affordable bodies before spending mana on
   Demon Claws; do not end with useful bodies, Sigil of the Seas or Void Souls unplayed.

## Outcast

An Outcast bonus fires only when the card is the leftmost or rightmost card in hand. Every
play option states whether its Outcast is on right now, whether playing it opens another
Outcast card to an end, and whether the cards it adds push one off the right end -- read it.

Order matters: play the Outcast card while it is at an end, before a draw or discover puts a
new card to its right. When an Outcast card sits one step from an end, playing the card beside
it first opens it. A discovered card arrives at the right end, so it is an edge card at once.

## Board and tempo

Trade arithmetic runs both ways: the target dies only if your Attack reaches its remaining
Health, and your attacker dies if its Attack reaches yours. Take the favourable trade before
going face, and remove minions with a recurring trigger first; otherwise the face is the
target. This deck runs out of cards before a slower deck does, so every turn should add damage.

The hero attacks too. With a weapon equipped, swing it every turn it is safe to, and count the
hero among your attackers. Your hero takes the target's Attack back, so a big minion is a poor
target for the hero unless it has to die now.

Spend mana productively, not automatically. Demon Claws adds Attack for this turn and does
not grant another attack. Use it before swinging when the extra point matters; do not use
it after the hero has spent its attacks or while frozen. A weapon replacement also does not
refresh attacks. Consider using the old weapon before replacing it.

Kayn's Charge and Taunt-bypass aura can make immediate lethal. All friendly attacks ignore
Taunt only while Kayn remains alive, active and unsilenced. If Kayn dies trading, the remaining
attackers must respect Taunt again. The aura does not remove Rush's first-turn face restriction.

## Cards

The Coin is tempo, not mana: play it only in a turn where the extra crystal buys a bigger play.
Draw probabilities are not draws. Replan after every random effect.

- Spectral Sight draws one card in the middle of the hand, two at an end. Count both against
  deck size and the ten-card hand limit. When deciding order, include newly generated cards.
- Hive Map: a discovered spell played this turn unlocks a second pick from the other original
  offers. Count the mana remaining after Map, required targets and board room. Do not assume
  an unaffordable or unplayable spell earns the second card. Treat each new choice as a fresh
  prompt; never reuse the previous choice's entity or position.
- Illidari Studies: the next Outcast card costs one less. It is one shared discount; an
  Outcast already in hand can consume it before the discovered card.
- Infestation puts two Stingers into hand. Each still costs one mana, deals two damage, and
  needs room to summon its Rush Grub. It does not put two attackers on the board immediately.
  With no enemy minions and Grim Harvest available, develop with Harvest first. Count the
  follow-up mana before buying Stingers. With spare mana and hand space, bank the Stingers now
  even if no enemy minions exist or neither Stinger can be used yet. This saves two mana on a
  later removal turn; prefer it over Demon Claws or ending with unused crystals.
- A small ready minion can set up Void Blast: trade a 2/1 into a 4/4, then Blast the remainder
  and receive the Soul. If a shield or random deathrattle is involved, resolve the attack and
  reobserve before choosing the spell. Do not sacrifice a minion when Blast already kills unaided.
- Press the Advantage gives +1 hero Attack and draws. If using both it and a hero attack this
  turn, cast it before swinging. A ping on one enemy and the boosted swing on another can use
  both damage sources efficiently. Re-evaluate after the draw; preserve verified lethal first.
- Each Gorishi Stinger has TWO resources: a 2-damage spell hit, then a 2/1 Rush Grub that can
  immediately trade into a legal enemy minion. These may hit different targets; never count it
  as unconditional 4 damage or immediate face damage from the Grub. Replan after the summon.
  Use existing ready Rush bodies to finish small targets before committing more removal.
  Allocate only enough damage to clear; spend the saved mana on Void Souls and retain spare spells.
- With a weapon, prioritise a safe legal kill on an enemy minion over nonlethal face damage.
  Stealthed enemies cannot be targeted. Do not sacrifice the hero or miss a verified lethal.
- Grim Harvest's random Dreadseed is Dormant. It occupies a slot without attacking or acting
  as a Taunt wall until awake. Sigil of the Seas summons next turn, not this turn.
  Harvest also draws to the right edge: removing Harvest from the right of Eye Beam does NOT
  guarantee an Outcast discount after resolution. Budget for playing the new card as well;
  at three mana, Harvest leaves one, while an unexposed discounted Eye Beam may still cost two.
- Chaos Strike combines a draw with temporary hero Attack. Evaluate the safe removal or lethal
  that Attack enables before spending mana; do not treat it as a mandatory draw-first spell.
  When its Attack has no useful exchange and survival allows delay, develop Sigil of Cinder.
  Cinder's six random damage happens next turn and is not a guaranteed targeted removal now.
- For an equivalent enemy kill, preserve the more valuable friendly body and spend fewer
  resources: a 4-Attack hero plus a 2/1 already kills a 6/6. Do not sacrifice a 3/3 or buy another
  point of hero Attack for the same result. Account separately for Deathrattles and other triggers.
- Stardust Scythe produces a Void Soul after attacking. Reobserve the hand afterwards; the
  generated card can bury a right-edge Outcast. Track remaining weapon durability.
- Void Soul summons a random Demon and improves future copies. Value the long-term engine,
  but never count the unknown summon as guaranteed damage or invent its stats. It still spends
  one mana to put one real 1-Cost Demon on the board now; use it as a normal body when there is
  room, unless a higher-priority response needs that mana.
- Play Sigil of the Seas proactively: one mana for a next-turn 3/3 Taunt is efficient development,
  not a removal spell to save. Use generated Void Souls readily while there is board room.
- Glacial Shard freezes the highest-Attack unfrozen, active enemy minion among legal targets.
  Do not waste the freeze on a harmless hero while such a minion is available.

## Burn

A damage spell goes at a minion unless it finishes the hero this turn together with the attacks
on board.

## Mulligan

Use the deck's supplied opening-hand win rate, its up/down comparison to the deck average, and
player keep rate in `mulligan.json`. Keep cards above the deck average or kept by at least 80% of
players; send back below-average cards that fewer than 25% keep. The supplied screenshot omits the
numeric deck average, so do not apply another deck's absolute win-rate cutoff. In the remaining
middle, weigh curve, matchup and hand context. A four-cost card still needs an early play beside it.
These are aggregate stats, not matchup guarantees.
