// Dead rate and cost per gesture kind since a given ISO time: node runtime/calib-report.mjs 2026-09-30T02:30
import {readFile} from 'node:fs/promises';
const since=Date.parse(process.argv[2]??0),until=process.argv[3]?Date.parse(process.argv[3]):Infinity;
const rows=(await readFile('runtime/gestures.jsonl','utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l))
  .filter(r=>Date.parse(r.createdAt)>=since&&Date.parse(r.createdAt)<=until);
const kinds={};
let prev=null;
for(const r of rows){
  const k=/toss|confirm mulligan/.test(r.what?.join(' '))?'mulligan':/end turn/.test(r.what?.join(' '))?'end':r.kind==='fling'?'attack':r.kind==='drag'?'play':'click';
  const o=kinds[k]??={n:0,dead:0,misfire:0,unver:0,gap:[]};
  o.n++;if(r.dead)o.dead++;if(r.misfire)o.misfire++;if(r.verdict==='unverified')o.unver++;
  if(prev)o.gap.push(Date.parse(r.createdAt)-Date.parse(prev.createdAt));prev=r;
}
const med=a=>a.length?a.slice().sort((x,y)=>x-y)[a.length>>1]:'-';
for(const [k,o] of Object.entries(kinds))console.log(k.padEnd(9),`n=${o.n} dead=${o.dead} (${(100*o.dead/o.n).toFixed(0)}%) misfire=${o.misfire} unverified=${o.unver} medianGap=${med(o.gap)}ms`);
console.log('total',rows.length,'dead',rows.filter(r=>r.dead).length);
