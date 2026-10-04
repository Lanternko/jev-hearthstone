// Access/configuration failures cannot recover by retrying every turn.
export function permanentJevFailure(error){
  return [401,402,403].includes(Number(error?.statusCode??error?.status)) ||
    /free tier users do not have access|missing AI_GATEWAY_API_KEY|pricing was last checked|invalid api key|insufficient (?:credits|quota)/i.test(error?.message??'');
}
// 2026-09-30: TypeSafe AI answered 429 "No access to this model at this time" in bursts. A
// probe a few minutes later went through, but the loop retried every 0.8s for 5s and then played
// the rule pick, so most of a game fell back. A throttle is waited out with growing gaps instead.
export function rateLimited(error){
  return Number(error?.statusCode??error?.status)===429 ||
    /no access to this model at this time|rate limit|too many requests/i.test(error?.message??'');
}
// Waits between throttled attempts; the error carries the next one as retryAfterMs.
const BACKOFF=[2000,4000,8000];
export function createJevRecovery({now=Date.now,budgetMs=5000,rateBudgetMs=30000,cooldownMs=60000}={}){
  let disabled=null,since=null,tries=0,gaveUp=-Infinity;
  return async (request,fallback)=>{
    if(disabled)return fallback(disabled);
    since??=now();
    try{const result=await request();since=null;tries=0;return result}
    catch(error){
      if(permanentJevFailure(error)){disabled=error;return fallback(error)}
      // A throttle that already cost one decision its long wait gets only the short budget for
      // a while, so a turn is not spent waiting twice.
      const throttled=rateLimited(error),budget=throttled&&now()-gaveUp>=cooldownMs?rateBudgetMs:budgetMs;
      if(now()-since<budget){if(throttled)error.retryAfterMs=BACKOFF[Math.min(tries++,BACKOFF.length-1)];throw error}
      if(throttled&&budget===rateBudgetMs)gaveUp=now();
      since=null;tries=0;return fallback(error);
    }
  };
}
