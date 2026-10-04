// What legend.sh checks after every game: did we win, and is Jev still the one playing?
//
// 2026-09-30: HDT stopped writing games at 03:35Z, so rank.mjs kept printing that last Win and the
// run logged forty "Win"s it never had -- the six-losses guard never saw a loss. Over the same
// hours the Gateway answered "No access to this model" and then "User budget exceeded", every
// decision fell back to the rule pick, and the run kept queuing games it could not play well.
// The result now comes from Power.log itself, and any sign of the model going away stops the run.

// Win | Loss | Tie | null for the last game in a Power.log text, from our own PLAYSTATE.
export function lastGameLog(text){
  // PowerTaskList repeats CREATE_GAME after GameState has already emitted the
  // entities and choices. That client marker must not discard the opening.
  const start=[...text.matchAll(/^.*GameState\.DebugPrintPower\(\) -\s*CREATE_GAME.*$/gm)].at(-1)?.index;
  if(start!=null)return text.slice(start);
  return text.slice(Math.max(0,text.lastIndexOf('CREATE_GAME')));
}
export function resultOf(text,account){
  const game=lastGameLog(text);
  const esc=account.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=[...game.matchAll(new RegExp(`TAG_CHANGE Entity=${esc} tag=PLAYSTATE value=(WON|LOST|TIED|CONCEDED)`,'g'))].at(-1);
  return m?{WON:'Win',LOST:'Loss',CONCEDED:'Loss',TIED:'Tie'}[m[1]]:null;
}

// Errors that will not go away by retrying: access, billing, auth. "No access to this model at
// this time" is TypeSafe AI's 429 throttle, which does pass (2026-09-30); only the rule picks it
// actually forced count, through the fallback tally below.
const FATAL=/no access to this model(?! at this time)|budget|quota|credit|insufficient|unauthori[sz]ed|forbidden|\b40[123]\b/i;

// Why the run should stop, or null. `rows` are decisions.jsonl entries written since the game began.
export function modelTrouble(rows,{maxFallbacks=3}={}){
  const fatal=rows.find(r=>r.error&&FATAL.test(r.error));
  if(fatal)return `model error: ${fatal.error.slice(0,120)}`;
  const fallbacks=rows.filter(r=>r.source==='rule_fallback');
  if(fallbacks.length>=maxFallbacks)return `${fallbacks.length} rule_fallback decisions (last: ${(fallbacks.at(-1).error??'').slice(0,120)})`;
  return null;
}
