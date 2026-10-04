# Discard Warlock strategy

Principles only. Card-by-card mechanics belong in the option descriptions `describe.mjs`
builds; anything that is arithmetic over a fully observed state belongs in `policy.mjs` and
`lethal.mjs`, where it is enforced rather than argued. The long prose version of this file,
with every worked example behind these rules, is kept at `runtime/strategy-long-2026-09-21.md`.

## The turn, in order

1. Lethal first. If the damage on the table reaches their Health plus Armour, take it and
   ignore everything below. (Enforced in `lethal.mjs`.)
2. Decide whether this turn needs drawing; having a draw option does not make it mandatory.
   If the chosen turn includes drawing, resolve it before committing buffs/attacks when
   costs, survival and visible triggers allow. Preserve mana for the intended continuation.
   Unknown cards require a fresh observation, not a guessed continuation. Free information
   first; an attack cannot be undone.
3. Put bodies down before buffs. A buff can miss a minion that never got cast.
4. Attack last, once the board is what it is going to be.

## T2/T3 burst openings against a slow opponent

Compare a small buff now with a known-hand wider buff turn over the next one or
two turns. Against control or a slow public opening, prefer developing three or
four recipients and buffing them on the SAME turn. Preserve Coin when it funds
that concrete line: T1 Platysaur, T2 Disposable Acolytes -> Coin -> buff; or an
existing early board, T3 Ocular Occultist -> discard a summoning payoff -> Coin
-> buff. Coin may be played before the development when needed to pay for it.
Do not assume the next draw supplies a missing piece. Recompute after every draw,
random summon, Battlecry choice and opponent turn; future plans require survival.
Use openingBurst's zero/one/two-body-loss sensitivity, visible opponent pressure,
revealed removal and time pressure to judge whether saving resources is sensible.
An empty board does not identify a control deck; a buff is not protection from
all AOE, destroy effects or transformation. Unknown random one-drops may not even
be eligible recipients until observed.

A lone +1/+1 without a useful trade usually wastes the burst resource, especially
on the draw against control. Exceptions: lethal, survival, winning a trade, or
Whispers discarding a payoff that FIRST adds bodies. Acolytes/Spiders before the
buff can turn an apparent one-body cast into three recipients. Do not spend
Whispers on Coin, another buff, a discovery card or a random low-cost tie merely
to satisfy a timing rule. If an early board is removed, revise the plan instead
of buffing an empty board or waiting indefinitely for an ideal four-body board.

## Board assessment

Effect assessments distinguish current applicability, classification confidence and
estimated strength. Confidence is rule evidence, not a measured probability of a
future trigger. At equal combat cost, prefer a verified active beneficial engine
over an inactive effect. Different bodies or stronger effects require comparing
the whole resource cost and survival; spending several resources can be warranted.
Unknown effects retain their full text and must be judged, not treated as blank.
Game 175, own turn two: Patches' deck-only summon is inactive on board, while
Ship's Chirurgeon can repeatedly buff new summons. Having triggered once does not
exhaust a repeatable effect. Lethal and survival still come before engine removal.

After Slime 'em! clears your board, evaluate Ectoplasm using the known friendly
recovery pool. User ruling, game 153 (2026-10-01): on own turn five, spend 3 mana
to recover the five stored minions before developing a location or drawing. On an
empty board with room for at least three known summons, recovery takes priority
after lethal checks. Unknown pools require judgment; do not invent their contents.
Observe the resolved board before planning attacks or buffs; resummoning does not
trigger Battlecries or by itself grant immediate attacks.

Trade arithmetic runs in both directions: the target dies only if your Attack reaches its
remaining Health, and your attacker dies if its Attack reaches yours. Winning only the second
half hands over a minion for nothing.

Take the favourable trade before going face. Attack with everything means everything attacks,
not that everything attacks the hero. A Rush minion exists to clear on the turn it lands.

Remove enemy minions with a recurring trigger -- per-turn draw, summon, or any "at the
start/end of turn" -- ahead of face damage. The same goes for aura and engine minions, whose
text buffs or rewards the rest of their board ("your other minions have...", "after you
summon/play a X, give it..."): a small body like Treasure Distributor (1 mana 1/2, +1 Attack
to every Pirate) is worth more than its stats, so kill it on sight, even with a trade
that costs you a minion. A 0-Attack body costs nothing to kill.

Lumia (9/9 Lifesteal) makes a hero Immune for the rest of the turn once it takes damage, so
only the first hit on their hero each turn lands. With Lumia up, remove it first, or make the
first face hit the biggest single chunk available -- never open with a 1-Attack poke. Game 17
(2026-09-30) dealt no net face damage all game against it.

Board-wide buffs need a board: price them by how many bodies they touch, counting 0-Attack
minions, which generate no attack option and so vanish from any damage tally until buffed.
Seven slots, locations included; a spent location frees its slot.

With three or more recipients, a 1-mana +1/+1 board buff is a productive tempo play:
three recipients add +3 Attack/+3 Health (user estimate: about 2.5 mana of value),
five add +5/+5 (about 4-5 mana). Life Tap costs 2 mana and 2 Health for one unknown
card (user estimate: 1-1.5 mana of value). Prefer the known buff gain over tapping
or hard-casting a passive egg, while respecting lethal, survival and discard costs.
Bodies go first when both body and buff fit; do not spend the buff's mana on a
body or a draw that prevents the stronger buff line this turn.

Discover picks must include this turn's affordable buff combinations. With five
bodies, two mana, Continuity and Boneweb Egg in hand, take Whispers: Continuity
first clears the cheaper card, then Whispers discards the egg, summons two spiders,
and buffs all seven. Count +12 Attack/+12 Health across both buffs, rather than
valuing the discover pick in isolation. Lowest-cost ties remain random.

With five bodies and two free slots, prefer directly playing Disposable Acolytes
then an affordable Continuity: two more bodies receive the buff, so all seven gain
+1/+1. Do not protect Acolytes merely because Occultist can discard it. Playing
Occultist occupies a slot first and wastes one Acolyte summon. This body-then-buff
line takes priority over speculative drawing, after immediate/planned lethal.
Count random summons as bodies with unknown identities, not guaranteed damage.

## Cards

User ruling, game 148, own turn 3 (2026-10-01): with at most two friendly
minions, when a chosen-discard outlet spends all remaining mana, prefer a discard
that immediately summons bodies over Hand of Gul'dan's draw. Occultist discarding
Walking Dead adds a 2/5 Taunt this turn; drawn cards cannot be played with no mana.
Check summon space, including the outlet's own body. Leave comparisons open with
spare mana, a developed board, or an opponent already in burn range.

Never hard-cast a card your own discard outlets want. Prefer the outlet to the hard cast
whenever both lines exist -- it converts a dead card into board presence for free.

The Coin is tempo, not mana: play it only in a turn where the extra crystal buys a bigger
play, or where the Coin itself is blocking a discard outlet. Otherwise hold it. A Coin that
leaves nothing castable is removed from the options outright; a Coin that takes you to 3 while
the hand tops out at 2 is still legal and still usually wrong -- the option says what the
crystal unlocks, so read it.

User ruling, game 46 (2026-09-30): preserve turn-one Coin when its only newly
affordable card is a lone 0/2 Boneweb Egg on an empty board. That is not productive
tempo. This does not prohibit Coin for multiple bodies or to unblock a discard payoff.

The hero power spends what the hand cannot. When its 2 mana would stop you casting a card this
turn, cast the card -- unless that card is fodder an outlet already in hand wants. The option
says which cards the hero power prices out, so read it.

A Temporary pick (Cursed Catacombs) is discarded at end of turn. If it cannot be cast this turn,
it is worth only what its discard does.

User ruling, game 179 turns 1 and 3 (2026-10-01): inspect zero-cost Catacombs
before spending the mana for your early minion. If no offered card pays off when
discarded, compare a useful one-cost pick that can be played this turn while mana
is still available; do not assume the offers before discovering. With Whispers and
Chronoclaws as the only hand cards, casting Whispers certainly discards the weapon.
When a safe draw plus Whispers both fit, draw first to see whether a lower-cost
card or another four-cost card changes that target. A four-cost tie only creates a
chance to keep Chronoclaws. Reassess the real hand after drawing; retain lethal,
survival, hand-space and fatigue checks, rather than drawing whenever it is legal.

User ruling, game 17 (2026-09-30): when a discover offers a cheap card that discards at
random and the hand holds only discard payoffs, the cheap card is usually the pick -- but only
while plenty of mana remains after it to play what the payoff draws. At 6 mana with two Hand of
Gul'dan in hand, Soulfire (1 mana, 4 aimed damage, the discard draws 3) with 5 mana left beats
hard-casting Soul Barrage for 4, which is worth more waiting to be discarded. With little mana
left over, the drawn cards sit unplayed and this does not apply.

User ruling, game 18 (2026-09-30): when the Temporary pick cannot be cast this turn, compare
what each option leaves behind once discarded. Normally Walking Dead (a 2/5 Taunt, fixed) beats
Disposable Acolytes (two random 1-cost minions). Take Acolytes only when a board buff is still
in hand for next turn's combo, where the extra bodies each take the buff. A pick whose discard
does nothing is worth nothing. Open the discover before spending a buff this turn, so the pick
is known before the mana is committed.

User ruling, game 4 (2026-09-30): a discarded Soul Barrage splits 5 among every enemy, so
against their hero and one 3/3 it lands about 2.5 on the minion and kills it only half the time;
even the kill is worth about 2.5 mana. Walking Dead's discard is a guaranteed 3-mana 2/5 Taunt.
Discard the body; Barrage is the pick only into three or more minions at 2 Health or less, into
such minions with 5 or more Attack between them, or a hero in burn range. (Enforced in `policy.mjs`.)

Draw probabilities are not draws. Replan after every random effect.

User ruling 2026-10-01: with one minion, three mana, Continuity and Occultist plus
Walking Dead, develop Occultist and discard Walking Dead. Three mana buys 3/6 and
2/5 Taunts instead of paying one for only +1/+1 and losing access to the three-mana
development this turn. Hold Continuity for more recipients. This priority requires
room for both minions and an actual legal targeted discard; a buff that enables
lethal still comes first. With four mana the development and buff are both affordable,
so compare the whole sequence rather than treating them as exclusive alternatives.

Draw decisions must account for hand space after cards leave hand, actual mana for
follow-ups, ordinary cards remaining, known Casts When Drawn cards, and the current
fatigue counter. Auto-casts replace themselves: two known Shreds in a two-card deck
mean a single draw can hit both Shreds and then fatigue, adding no hand card. In
game 46, Life Tap at nine hand cards cost 2 + 3 + 3 + 1 Health for no resources.
Spend useful existing cards before seeking more cards; preserve a reserve for the
mandatory next-turn draw. Ordinary cards mixed with Shreds expose damage bounds,
not a predicted order. Unknown opponent forced-draw effects are risks, not guaranteed
future plays. Apply the same draw costs to discarding Hand of Gul'dan or swinging
Chronoclaws into that discard. Reobserve after every draw-triggering discard.

## Burn

A damage spell goes at a minion, not the enemy hero, unless it finishes the hero this turn
together with the attacks on board. Face damage is worth nothing until it wins.

## Against a human opponent

Speed and consistency beat cleverness. Spend the whole mana pool, hold the board over small
face damage, and attack with every minion -- stopping to price the trade only against a Taunt.

## Mulligan

User ruling 2026-10-01: Dormant minions cannot receive the current board buff.
On the recorded two-mana Slumbering Sprite board, use the safe hero power to draw
and awaken the Sprite; keep Continuity. A one-recipient buff is optional unless it
creates lethal or a concrete profitable trade (such as turning a mutual death into
a surviving kill). Preserve buffs for development rather than forcing a cast just
because mana remains. Compare against affordable targeted discard development:
Occultist discarding Walking Dead adds two Taunts when both have room to land.

Each mulligan option states, per card, how often games were won when that card stayed in the
opening hand, against the deck's average. Those are results over many games of this exact list:
weigh them above general principles. Cards far above average always stay and cards far below
always go; the ones in between are yours to judge. A card in between is worth more next to an
outlet if it is fodder, and worth more next to a cheap minion if it is a buff.

User rulings override aggregate statistics. Evaluate the retained hand's actual early
plays: a bare 0/2 Boneweb Egg is not an active early body, and a board buff does not
create a board. Toss an Egg without a reliable discard outlet costing at most three;
Chronoclaws at four does not support this opening. Toss an unsupported buff and seek
early bodies or a working discard pair. Party Fiend plus buff and Whispers plus
Acolytes remain supported combinations. For Egg + Continuity + Chronoclaws + Soul
Barrage, replace all four rather than spending Coin to hard-cast the Egg.

User ruling 2026-10-02, game 120: with one Ocular Occultist, regardless of cheap
board development, retain at most one Walking Dead / Silverware Golem payoff. One
Battlecry cannot activate both. Default to Walking Dead; replace the redundant
Golem and Soul Barrage to seek early plays. Do not infer a control matchup from
the opponent's class or use their later revealed cards during mulligan. Golem's
extra Attack may matter against control, but that conditional preference is not
established by this case. Count discard activations when pairing retained outlets
and payoff cards; cheap development does not provide another discard activation.

Game 120 own turn 2: on empty boards with two mana, Coin, Occultist, a fixed
discard-summon body and another three-cost attacking minion for next turn,
prefer Coin -> Occultist -> discard the body to a bare 0/2 Egg. The remaining
known minion supplies the next three-mana turn; do not assume an unknown draw.
Execute and observe each step, especially the Battlecry choice. This narrow
rule does not force Coin with other cheap plays, an occupied board, no payoff
or no remaining three-cost follow-up, and does not replace lethal checks.

User rulings 2026-10-01:
- With only one or two bodies and no mana left after Occultist, prefer discarding
  Walking Dead to Hand of Gul'dan when both Taunts have room. The immediate board
  matters more than three cards that cannot develop this turn; spare mana, a developed
  board, limited summon space and imminent lethal still require comparison.
- When trades leave the same friendly board and remove enemies with identical stats
  and combat keywords, remove the active persistent effect first. Game 137 turn 4:
  Duke 4/4 kills Mana Wyrm 2/3 instead of Anonymous Informant 2/3; both leave Duke
  4/2, but only Wyrm can keep growing. A spent Battlecry adds no continuing threat.
  Different retaliation, Deathrattles, Taunt restrictions and lethal are not equivalent.
