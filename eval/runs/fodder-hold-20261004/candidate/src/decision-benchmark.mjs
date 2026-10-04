// Scores a fixed candidate menu; failures remain in the denominator.
export function scorePick(label, options, pick) {
  if (!options.some(o => o.id === pick)) return {points:0, verdict:'invalid'};
  if (label.best.includes(pick)) return {points:1, verdict:'best'};
  if ((label.ok ?? []).includes(pick)) return {points:0.5, verdict:'acceptable'};
  return {points:0, verdict:'wrong'};
}
export function summarizeModel(rows) {
  const successful=rows.filter(r=>r.status==='ok');
  const latency=successful.map(r=>r.latencyMs).sort((a,b)=>a-b);
  const quantile=p=>latency.length?latency[Math.ceil(p*latency.length)-1]:null;
  return {n:rows.length,points:rows.reduce((n,r)=>n+(r.points??0),0),
    best:rows.filter(r=>r.verdict==='best').length,
    acceptable:rows.filter(r=>r.verdict==='acceptable').length,
    errors:rows.filter(r=>r.status!=='ok').length,
    invalid:rows.filter(r=>r.verdict==='invalid').length,
    latencyMedianMs:quantile(0.5),latencyP95Ms:quantile(0.95),
    costUSD:successful.reduce((n,r)=>n+(Number(r.costUSD)||0),0),
    missingCostReceipts:successful.filter(r=>r.costUSD==null).length};
}
export function pairedComparison(rows, models) {
  const pairs=new Map();
  for(const r of rows){const k=`${r.track}:${r.id}:${r.repeat}`;
    const pair=pairs.get(k)??{};
    if(pair[r.requestedModel])throw Error('duplicate paired result');
    pair[r.requestedModel]=r;pairs.set(k,pair);
  }
  let leftBetter=0,rightBetter=0,equal=0,incomplete=0;
  for(const p of pairs.values()){
    if(!p[models[0]]||!p[models[1]]){incomplete++;continue;}
    const d=(p[models[0]].points??0)-(p[models[1]].points??0);
    if(d>0)leftBetter++;else if(d<0)rightBetter++;else equal++;
  }
  return {left:models[0],right:models[1],leftBetter,rightBetter,equal,incomplete,
    note:'Repeated positions are correlated. Development rulings are not a blind strength or win-rate test.'};
}
