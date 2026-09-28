// Access/configuration failures cannot recover by retrying every turn.
export function permanentJevFailure(error){
  return [401,402,403].includes(Number(error?.statusCode??error?.status)) ||
    /free tier users do not have access|missing AI_GATEWAY_API_KEY|pricing was last checked|invalid api key|insufficient (?:credits|quota)/i.test(error?.message??'');
}
export function createJevRecovery({now=Date.now,budgetMs=5000}={}){
  let disabled=null,since=null;
  return async (request,fallback)=>{
    if(disabled)return fallback(disabled);
    since??=now();
    try{const result=await request();since=null;return result}
    catch(error){
      if(permanentJevFailure(error)){disabled=error;return fallback(error)}
      if(now()-since<budgetMs)throw error;
      since=null;return fallback(error);
    }
  };
}
