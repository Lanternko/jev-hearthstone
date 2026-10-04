// Narrow, text-checked models for the fixed discard effects in this deck.
// Random summons/damage, draws and choices remain observation boundaries.
export function discardModel(c){
  const t=c.text??'';
  const random=/^When you play or discard this, summon (a|an|one|two|three|\d+) random (\d+)-Cost minions?\.?$/i.exec(t);
  if(random)return {kind:'randomBodies',n:({a:1,an:1,one:1,two:2,three:3}[random[1].toLowerCase()]??Number(random[1])),cost:Number(random[2])};
  if(c.type==='MINION'&&['Walking Dead','Silverware Golem'].includes(c.name)
    &&/^(?:Taunt\s+)?If you discard this minion, summon it\.?$/i.test(t)
    &&c.hp>0)return {kind:'body'};
  if(c.type==='MINION'&&c.name==='Boneweb Egg'
    &&/^Deathrattle: Summon two 2\/1 Spiders\. If you discard this, trigger its Deathrattle\.?$/i.test(t))
    return {kind:'spiders',n:2,atk:2,hp:1};
  const draw=/^(?:When|If) you (?:play or )?discard this, draw (a|an|one|two|three|\d+) cards?\.?$/i.exec(t);
  if(draw)return {kind:'draw',n:({a:1,an:1,one:1,two:2,three:3}[draw[1].toLowerCase()]??Number(draw[1]))};
  return /\bdiscard\b/i.test(t)?{kind:'unknown'}:{kind:'none'};
}

export function discardGrowth(c){
  if(c.name!=='Duke of Below')return 0;
  return /\b(?:Has|Gains) \+2\/\+2 for each card you'?ve discarded this game\.?/i.test(c.text??'')?2:0;
}
