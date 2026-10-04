import { experimental_evaluate as evaluate } from 'ai';
// JEV_MODEL swaps in another System One model (e.g. liquid/d1) for offline comparison.
export const MODEL = process.env.JEV_MODEL ?? 'typesafe-ai/jev';
export async function ask(state, questions, {model=MODEL, timeoutMs=Number(process.env.JEV_TIMEOUT_MS ?? 5000)}={}) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Missing AI_GATEWAY_API_KEY. Put it in local .env.local (never in the vault).');
  // Not the key's expiry: a cost stop. Vercel lists Jev as free until this date; past it every
  // call may bill. After rechecking the price, set JEV_PRICING_CHECKED_UNTIL in .env.local to the
  // next date worth rechecking -- no code change, and a fresh key or endpoint does not lift it.
  const until = process.env.JEV_PRICING_CHECKED_UNTIL ?? '2026-09-25T00:00:00Z';
  if (Date.now()>=Date.parse(until)) throw new Error(`Jev pricing was last checked for use until ${until}; recheck it, then set JEV_PRICING_CHECKED_UNTIL in .env.local.`);
  // 2026-09-30: TypeSafe AI answered 429 "No access to this model at this time" in bursts; the
  // Gateway lists DigitalOcean serving Jev at the same price (no ZDR, no training -- user approved),
  // so let the Gateway fail over to it instead of pinning TypeSafe alone.
  const start = performance.now();
  const r = await evaluate({model, state: JSON.parse(JSON.stringify(state)), questions: JSON.parse(JSON.stringify(questions)), maxRetries: 0, abortSignal: AbortSignal.timeout(timeoutMs), ...(model==='typesafe-ai/jev'&&{providerOptions:{gateway:{order:['typesafe-ai','digitalocean']}}})});
  return {model: r.response.modelId, latencyMs: Math.round(performance.now()-start), answers:r.answers, usage:r.usage, metadata:r.providerMetadata};
}
