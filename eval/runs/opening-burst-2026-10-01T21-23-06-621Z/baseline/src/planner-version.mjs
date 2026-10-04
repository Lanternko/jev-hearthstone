// Freeze-aware switch for prospective A/B games. Never silently substitute the
// current engine when a requested baseline is missing.
export async function loadDecisionEngine(version=process.env.JEV_SEARCH_VERSION??'silverfish-v1-execution-v2'){
  if(!['silverfish-v1','silverfish-v1-execution-v2','baseline-20261001'].includes(version))throw Error(`Unknown JEV_SEARCH_VERSION: ${version}`);
  const url=version==='baseline-20261001'
    ?new URL('../eval/runs/silverfish-20261001/baseline/src/choose.mjs',import.meta.url)
    :new URL('./choose.mjs',import.meta.url);
  return {version,...await import(url)};
}
