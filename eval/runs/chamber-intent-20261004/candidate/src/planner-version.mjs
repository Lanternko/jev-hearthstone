// Freeze-aware switch for prospective A/B games. Never silently substitute the
// current engine when a requested baseline is missing.
export async function loadDecisionEngine(version=process.env.JEV_SEARCH_VERSION??'silverfish-v1-chamber-intent-v1'){
  if(!['silverfish-v1-chamber-intent-v1','silverfish-v1-combo-admission-v2','silverfish-v1-combo-admission-v1','silverfish-v1-class-prior-v1','silverfish-v1','silverfish-v1-execution-v2','silverfish-v1-opening-burst-v1','silverfish-v1-matchup-objective-v1','baseline-before-opening-burst-20261002','baseline-20261001'].includes(version))throw Error(`Unknown JEV_SEARCH_VERSION: ${version}`);
  const url=version==='silverfish-v1-combo-admission-v2'
    ?new URL('../eval/runs/combo-consolidation-20261003/candidate/src/choose.mjs',import.meta.url)
    :version==='silverfish-v1-combo-admission-v1'
    ?new URL('../eval/runs/combo-admission-20261003/candidate/src/choose.mjs',import.meta.url)
    :['silverfish-v1-class-prior-v1','silverfish-v1','silverfish-v1-matchup-objective-v1'].includes(version)
    ?new URL('../eval/runs/combo-admission-20261003/baseline/src/choose.mjs',import.meta.url)
    :version==='silverfish-v1-opening-burst-v1'
    ?new URL('../eval/runs/matchup-objective-2026-10-01T21-40-29-477Z/baseline/src/choose.mjs',import.meta.url)
    :['baseline-before-opening-burst-20261002','silverfish-v1-execution-v2'].includes(version)
    ?new URL('../eval/runs/opening-burst-2026-10-01T21-23-06-621Z/baseline/src/choose.mjs',import.meta.url)
    :version==='baseline-20261001'
    ?new URL('../eval/runs/silverfish-20261001/baseline/src/choose.mjs',import.meta.url)
    :new URL('./choose.mjs',import.meta.url);
  const policy=await import(new URL('./policy.mjs',url));
  return {version,...await import(url),constrainActions:policy.constrainActions,spendFirst:policy.spendFirst};
}
