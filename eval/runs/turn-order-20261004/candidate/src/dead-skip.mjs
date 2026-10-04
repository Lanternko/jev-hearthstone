// Actions the game keeps swallowing, taken off the menu for the rest of the turn.
//
// 2026-09-30, game 15 turn 9: "Ocular Occultist -> Bitterbloom Knight" died eight times in a row.
// Power.log listed the attack as legal (error=NONE) and no SendOption ever went out; each dead
// shot shows the arrow still stuck on the target. The plan offered the same attack after every
// dead one, so the loop re-sent it until the eight-dead guard quit the game for a 45s restart --
// with Jev's turn and the clock gone. Two dead tries now retire that action until the turn ends;
// the rest of the turn is decided without it.
//
// Keyed by what the action does, not its option id: ids are indices into the option list and
// shift as soon as anything else changes.
export const keyOf=a=>`${a.type}:${a.entityId??''}:${a.targetId??''}`;

export function createDeadSkip({limit=2}={}){
  let turn=null;const dead=new Map();
  const reset=t=>{if(t!==turn){turn=t;dead.clear()}};
  return {
    // One more dead try of `action` on `turn`; true once it has hit the limit.
    dead(turn,action){
      reset(turn);
      if(['END_TURN','MULLIGAN','CHOICE'].includes(action.type))return false;
      const k=keyOf(action),n=(dead.get(k)??0)+1;dead.set(k,n);
      return n>=limit;
    },
    // A landed action says nothing about the others; only the turn clears the list.
    skipped(turn,action){reset(turn);return (dead.get(keyOf(action))??0)>=limit},
  };
}
