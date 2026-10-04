import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const rulingText=readFileSync(new URL('eval/history-matchup-rulings.json',root),'utf8'),rulings=JSON.parse(rulingText);
const gamesText=readFileSync(new URL(`eval/runs/${rulings.inputRun}/games.json`,root),'utf8'),games=JSON.parse(gamesText);
const end=Math.max(...games.map(g=>Date.parse(g.end))),start=end-7*864e5;
const labels=new Map();
for(const group of rulings.groups)for(const ordinal of group.ordinals){
 if(labels.has(ordinal))throw Error('Duplicate ruling');
 labels.set(ordinal,group.key==='combo_deadline'?'combo':group.type==='control'?'control':group.type==='other'?'tempo':'unknown');
}
const seen=new Set();
const rows=games.filter(g=>Date.parse(g.end)>=start&&Date.parse(g.end)<=end).map(g=>{
 if(seen.has(g.id))throw Error('Duplicate game');seen.add(g.id);
 return {id:g.id,endedAt:g.end,heroClass:g.opponentClass,type:labels.get(g.ordinal)??'unknown',
  forty:g.evidence?.initialHealth===40,cards:[...new Set((g.evidence?.plays??[]).map(c=>c.cardId).filter(Boolean))]};
});
const hash=s=>createHash('sha256').update(s).digest('hex');
const data={version:'local-class-prior-v1',source:`audited ${rulings.inputRun}; user/analyst public replay rulings`,
 window:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},trainedThrough:new Date(end).toISOString(),
 scope:'Local Warlock/Wild/Ranked encounters; not a region/rank-matched global meta estimate. Unknown labels included. Rebuild after reviewing newly completed games.',
 hashes:{games:hash(gamesText),rulings:hash(rulingText)},rows};
writeFileSync(new URL('data/opponent-prior.json',root),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({n:rows.length,window:data.window}));
