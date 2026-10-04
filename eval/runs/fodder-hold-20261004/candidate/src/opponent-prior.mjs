import {readFileSync} from 'node:fs';
const snapshot=JSON.parse(readFileSync(new URL('../data/opponent-prior.json',import.meta.url),'utf8'));
export const PRIOR_VERSION='local-class-prior-v2';
const types=['control','tempo','combo','unknown'];
const norm=s=>String(s??'').replace(/[^a-z]/gi,'').toUpperCase();
const counts=rows=>Object.fromEntries(types.map(t=>[t,rows.filter(r=>r.type===t).length]));
const predictive=(rows,base,strength=8)=>{
 const c=counts(rows),den=rows.length+strength;
 return Object.fromEntries(types.map(t=>[t,(c[t]+strength*base[t])/den]));
};

// These are smoothed local frequencies, not accuracy-validated probabilities.
// Unknown labels remain a separate mass; wins/losses never enter this model.
export function opponentPrior(state,data=snapshot){
 const cls=norm(state.opponent?.heroClass),rows=data.rows;
 const uniform=Object.fromEntries(types.map(t=>[t,0.25]));
 const population=predictive(rows,uniform,4),classRows=rows.filter(r=>norm(r.heroClass)===cls);
 let selected=classRows,probabilities=predictive(classRows,population),evidence=[`opponent class: ${cls||'unknown'}`];
 const opening=state.choice?.type==='MULLIGAN';
 const openingTotal=Number(state.opponent?.deckCount)+Number(state.opponent?.handCount);
 // The public counts can include the Coin before the starting-Health effect
 // appears. This conventional second-player opening is a forty-card signal,
 // not knowledge of a hidden card or proof of the opponent's archetype.
 const fortyWithExtra=opening&&Number(state.opponent?.deckCount)===36&&Number(state.opponent?.handCount)===5;
 const forty=state.opponent?.initialHealth===40||opening&&openingTotal===40||fortyWithExtra;
 if(forty){
  const same=classRows.filter(r=>r.forty),all=rows.filter(r=>r.forty);
  // Small class+40 cohorts borrow the measured overall 40-Health distribution.
  selected=same;probabilities=predictive(same,predictive(all,probabilities));
  evidence.push(fortyWithExtra&&state.opponent?.initialHealth!==40
   ?'mulligan deck 36 + hand 5: inferred forty-card opening with an extra starting card, consistent with Coin'
   :'public starting Health 40 or mulligan deck+hand=40');
 }
 const plays=(state.opponent?.publicPlays??[]).filter(c=>c.public===true&&Number(c.engineTurn)>0&&Number(c.engineTurn)<=Number(state.turn));
 const ids=[...new Set(plays.map(c=>c.cardId).filter(Boolean))];
 // Match the joint observed signature, not multiply correlated card signals.
 // No exact-card update with fewer than three comparable historical examples.
 const matching=selected.filter(r=>ids.length&&ids.every(id=>r.cards.includes(id)));
 if(matching.length>=3){selected=matching;probabilities=predictive(matching,probabilities);evidence.push(`joint public card signature (${ids.length} cards)`);}
 const c=counts(selected),known=selected.length-c.unknown;
 const confidence=Math.min(0.8,known/(selected.length+12));
 // The chronological check found class alone worse than population frequency.
 // Keep its influence weak; opening/public observations can receive more weight.
 const decisionWeight=Math.min(0.35,confidence*(forty||matching.length>=3?1:0.15));
 const ordered=types.filter(t=>t!=='unknown').sort((a,b)=>probabilities[b]-probabilities[a]);
 return {version:PRIOR_VERSION,source:data.source,window:data.window,trainedThrough:data.trainedThrough,
  probabilities,counts:c,sampleSize:selected.length,classSampleSize:classRows.length,
  mulliganProbabilities:{pressure:probabilities.control+probabilities.combo,board:probabilities.tempo,unknown:probabilities.unknown},
  mulliganGrouping:{pressure:['control','combo'],board:['tempo'],unknown:['unknown'],
   guidance:'Control and combo share one opening strategy: establish attacking bodies and a reliable curve/discard payoff. Do not invent different mulligan rules from the diagnostic subtype. Preserve subtype only for review; observed quests, clears and recovery guide later turns.'},
  confidence,decisionWeight,highProbability:confidence>=0.5&&probabilities[ordered[0]]>=0.7?ordered[0]:null,
  evidence,publicCards:ids,
  interpretation:'Local smoothed frequency estimates; unknown mass is unresolved classification. Confidence reflects sample support, not effect strength or validated forecast accuracy. Class is a soft prior; public evidence overrides it. No fixed lethal deadline.'};
}
