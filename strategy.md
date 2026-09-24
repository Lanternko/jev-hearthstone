# Discard Warlock strategy

Principles only. Card-by-card mechanics belong in the option descriptions `describe.mjs`
builds; anything that is arithmetic over a fully observed state belongs in `policy.mjs` and
`lethal.mjs`, where it is enforced rather than argued. The long prose version of this file,
with every worked example behind these rules, is kept at `runtime/strategy-long-2026-09-21.md`.

## The turn, in order

1. Lethal first. If the damage on the table reaches their Health plus Armour, take it and
   ignore everything below. (Enforced in `lethal.mjs`.)
2. Resolve draws, discovers and location activations before committing any attack. Free
   information first; an attack cannot be undone.
3. Put bodies down before buffs. A buff can miss a minion that never got cast.
4. Attack last, once the board is what it is going to be.

## Board

Trade arithmetic runs in both directions: the target dies only if your Attack reaches its
remaining Health, and your attacker dies if its Attack reaches yours. Winning only the second
half hands over a minion for nothing.

Take the favourable trade before going face. Attack with everything means everything attacks,
not that everything attacks the hero. A Rush minion exists to clear on the turn it lands.

Remove enemy minions with a recurring trigger -- per-turn draw, summon, or any "at the
start/end of turn" -- ahead of face damage. A 0-Attack body costs nothing to kill.

Board-wide buffs need a board: price them by how many bodies they touch, counting 0-Attack
minions, which generate no attack option and so vanish from any damage tally until buffed.
Seven slots, locations included; a spent location frees its slot.

## Cards

Never hard-cast a card your own discard outlets want. Prefer the outlet to the hard cast
whenever both lines exist -- it converts a dead card into board presence for free.

The Coin is tempo, not mana: play it only in a turn where the extra crystal buys a bigger
play, or where the Coin itself is blocking a discard outlet. Otherwise hold it. A Coin that
leaves nothing castable is removed from the options outright; a Coin that takes you to 3 while
the hand tops out at 2 is still legal and still usually wrong -- the option says what the
crystal unlocks, so read it.

The hero power spends what the hand cannot. When its 2 mana would stop you casting a card this
turn, cast the card -- unless that card is fodder an outlet already in hand wants. The option
says which cards the hero power prices out, so read it.

A Temporary pick (Cursed Catacombs) is discarded at end of turn. If it cannot be cast this turn,
it is worth only what its discard does.

Draw probabilities are not draws. Replan after every random effect.

## Burn

A damage spell goes at a minion, not the enemy hero, unless it finishes the hero this turn
together with the attacks on board. Face damage is worth nothing until it wins.

## Against a human opponent

Speed and consistency beat cleverness. Spend the whole mana pool, hold the board over small
face damage, and attack with every minion -- stopping to price the trade only against a Taunt.

## Mulligan

Keep a cheap minion for turns 1-2 and discard fodder for the outlets; keep a location, which
costs nothing to hold. With neither a cheap minion nor fodder, throw everything else back. Burn (Soulfire) and buffs
go back too: early they have no target worth the card and no board to buff.
