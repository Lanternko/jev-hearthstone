// Tempo labels are a proxy for early board aggression, not verified aggro labels.
export function mulliganMatchup(prior){
 const q=prior.mulliganProbabilities,w=prior.decisionWeight;
 return {version:'confidence-mulligan-v1',guess:{aggressive:q.board,pressure:q.pressure,unknown:q.unknown},
  confidence:prior.confidence,decisionWeight:w,
  preferences:{earlyBoard:1+w*q.board,efficientTrade:1+w*q.board,
   immediatePressure:1+w*q.pressure,conditionalSlowSetup:1-w*q.board},
  interpretation:'Aggressive includes tempo in the historical labels; not a calibrated probability of a pure aggro deck. Confidence is sample support. Preferences are soft multipliers, not keep mandates.',
  guidance:'Compare allowed mulligans using these confidence-weighted preferences. Against likely aggression favor immediate 1-2 mana bodies and reliable efficient trades; against control/combo favor immediate attacking pressure with a usable curve and discard payoff. At low confidence stay close to the neutral opening. Never waive one retained activation per retained material, early curve, or unsupported buff/egg restrictions. Do not keep random-discard removal merely because the opponent may be aggressive.'};
}
