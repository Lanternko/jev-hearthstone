# Zoo Warlock strategy

The self-play network picks this deck's actions in live games (JEV_FOLLOW_NET); this file is
the backup the rules and Jev read. Current legal options, public state and card text decide
what is possible. Never invent draws or random bodies.

## Decision priority

1. Reject known fatal self-damage and attacks. Count Health, Armor, hand space and the
   3 damage each Shred of Time deals when drawn. Survival precedes mana-spending.
2. Take a fully supported immediate lethal.
3. Spend all mana on useful development every turn; an idle turn is the worst outcome.
4. Attack when the trade or face damage is good; keep Taunt bodies back when ahead on board.

## Curve and development

Fill the board early. Cheap bodies on turns one to three, then the biggest body the mana
allows. Ritual of Summoning and Ritual of C'Thun are best on turn one or two: they pay
off two turns later and cost tempo late. Play a Ritual before a minion when both fit.
At the C'Thun choice take the ability that fits the board: damage to clear, or stats and
bodies when ahead.

Floating Lessons, Vaultkeeper and Entropic Continuity are board buffs. Cast them with at
least two bodies to give stats to; a lone recipient is a weak play. Vaultkeeper buffs
adjacent minions, so place it between bodies. Mawman Cultist makes ALL spells cost 1 more,
yours too: cast the cheap spells first, or hold Cultist until the spells are cast.

Blasphemy is a board clear against small enemy bodies, not a face spell. Twice as much
when it is the highest Cost card in hand. Tachyon Barrage splits 6 damage among enemies
and is removal first.

## Shreds of Time

Twilight Timehopper, Tachyon Barrage and Entropic Continuity shuffle 2 Shreds of Time each
into the deck. Each Shred, when drawn, deals 3 damage to your hero and replaces itself.
Check the Health before any draw, and before shuffling more in when low. Ruinous
Velocidrake casts a Shred from the deck to summon a copy of itself: play it when a Shred
is in the deck.

## Zakajz the Corruptor and Glacial Shard

Zakajz the Corruptor (4 mana 5/5) reduces the Cost of minions in your hand and deck by (1)
and increases the Cost of spells by (1). Play it when the hand holds several minions and
few key spells: the discount comes with a body on the board, while every spell gets dearer.
Cast the spells you need first, or hold Zakajz until they are cast. The reduction also
applies to minions still in the deck, so it pays off on later draws.

Glacial Shard (1 mana 2/1) freezes one enemy. Aim it at an enemy minion that threatens our
board or blocks a lethal attack, not at a body that does nothing this turn.

## Opening and mulligan

Keep a one- or two-mana body, a Ritual and a curve to three. Replace Velocidrake and
Vaultkeeper in the opening hand unless the hand already has a curve. Coin is for a Ritual
or a body that curves out; do not spend it on nothing.

The rules below come from 小T, a top Chinese-server player, streaming this deck on
2026-10-25 (runtime/videos/xiaot-20261025/decisions, ids in brackets). Going second means the
Coin is in the offer.

- The core keep is both Rituals and Godfather Kazakus (小T d46); mulligan.json keeps them
  together.
- Keep Twilight Egg only going first with Godfather Kazakus in the same hand (小T d08).
  Otherwise toss it to dig for early cards (小T d16).
- The kept hand must have a minion to play on turn two: Cult Neophyte, Twilight Timehopper,
  or a 1-mana body with the Coin. Toss for one when there is none (小T d16).
- Going second, plan the curve around Coin into a 2-drop on turn one, not Coin into a
  3-drop. Toss Cursed Catacombs going second (小T d22).

## Lines and choices (小T)

These sit below the Decision priority above: survival and supported lethal come first.

1. Take the line with the biggest payoff. Do not give up damage or break your own board to
   guard against an AOE, removal or weapon the opponent only might have. Defend only when
   your own Health is in danger (小T d30, d33, d10, d57).
2. Lethal. When lethal is on, first kill the minion that blocks the damage, then send
   everything face (小T d06). A line that sets up lethal is worth a risk when it is not
   fatal to you (小T d11). When your Health is safe and the opponent may have an answer,
   do not go all-in: keep pressing lethal over several turns (小T d07).
3. Race what you cannot remove: against a big minion you cannot answer, go face (小T d03).
   When the opponent has Lifesteal on board, face damage is worth little: clear the board
   instead (小T d45).
4. Draw or tempo. When the hand already covers the mana of the next turns, do not trade
   damage or tempo for a card: Platysaur and the Crate of Contraband draw are worth less
   than a hit (小T d28, d35, d51). Draw only when the opponent's hand is small and you
   need to find a late win condition still in the deck (小T d55).
5. Order. Open Cursed Catacombs (0 mana) before deciding how to spend the rest, and draw
   with Platysaur first when no Ritual competes for the mana (小T d38, d44). Do not play
   a body the opponent can trade into for free next turn when another play fits; look at
   next turn's curve, e.g. Kazakus now so its trial fits next turn (小T d14).
6. Discover and Godfather Kazakus picks:
   - First check which option spends the mana exactly (小T d34, d24).
   - Prefer a big body that can hit the board now (小T d02).
   - Between Criminal Contract (three random 3-Cost minions) and Tonic of Tyranny
     (Voidlord): Criminal Contract when the opponent's class shows no AOE, Tonic of
     Tyranny when it does (小T d59, d31).
   - Prefer the option or play that keeps the curve smooth over the next turns: skip
     Coin into Kazakus when it jams the mana, play the 4-drop and then the 5-mana
     Velocidrake instead (小T d58).
   - When your win condition is too slow for the board, take immediate damage (小T d50).
7. Buff targets (Floating Lessons, Spurious Shiv, Vaultkeeper):
   - Put the buff on the high-Attack minion the opponent would trade into for free, or
     on the biggest body, so it outgrows their answers (小T d19, d54, d60).
   - Spread several buffs over several minions so one Silence does not undo them all
     (小T d01).
