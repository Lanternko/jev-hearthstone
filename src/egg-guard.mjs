// decks/priest-egg (2026-10-27): the human egg priests cast Haunt (CAP_801: +2/+3, Reborn, Taunt) on
// their own Egg of Khelos, so the opponent has to break it to reach anything, and its Reborn gives one
// more cracked egg. The pilot nets never learned it; this scripted guard plays it whenever it can.
// Self-play: eggGuard(s,legal) -> that step, or null to leave the pick to the policy.
// Live: net-guards.mjs guardPick calls eggHaunt on the sim view and finds the game's option for it.
const EGG=new Set(['DINO_410','DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5']);
const HAUNT='CAP_801';

// {haunts,eggs}: ids of the Haunts in hand and of our living, not yet Reborn Eggs; null when either is missing.
export function eggHaunt(s){
  if(s.choice)return null;
  const eggs=new Set(s.me.filter(b=>b.type==='MINION'&&b.hp>0&&EGG.has(b.cardId)&&!b.reborn&&!b.silenced).map(b=>b.id));
  const haunts=new Set(s.hand.filter(c=>(c.raw?.cardId??c.cardId)===HAUNT).map(c=>c.id));
  return eggs.size&&haunts.size?{haunts,eggs}:null;
}

export function eggGuard(s,legal){
  const e=eggHaunt(s);
  return e&&(legal.find(m=>m.kind==='play'&&e.haunts.has(m.id)&&e.eggs.has(m.targetId))??null);
}

// The egg priest decks (decks/priest-egg and its variants decks/priest-egg-hsr): the ones that get the egg guard
// and the stages/imbue/pile/egg observation flags. Match on the name, never on a list of exact strings.
export const isEggDeck=name=>/^priest-egg(-|$)/.test(name??'');
