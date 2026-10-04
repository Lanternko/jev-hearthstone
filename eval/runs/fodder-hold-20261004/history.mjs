// Every recorded decision with a state and a menu: how often is a wasted-fodder cast on the menu,
// and how often does the hold-aware search release it.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {wastedFodder,fodderRelease} from '../../../src/policy.mjs';
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const files=[];
for(const d of readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))
 for(const f of readdirSync(ROOT+d).filter(f=>/decisions\.jsonl$/.test(f)))files.push(ROOT+d+'/'+f);
files.push(ROOT+'decisions.jsonl');
const seen=new Set(),hits=[];let rows=0,candidates=0,ms=0,max=0;
for(const p of files){let text;try{text=readFileSync(p,'utf8')}catch{continue}
 for(const l of text.split('\n')){if(!l.trim())continue;let r;try{r=JSON.parse(l)}catch{continue}
  const state=r.state,opts=r.rawOptions??r.options;if(!state?.me||!Array.isArray(opts))continue;
  const k=r.createdAt??l.slice(0,200);if(seen.has(k))continue;seen.add(k);rows++;
  let w;try{w=wastedFodder(state)}catch{continue}
  if(!opts.some(a=>w.has(a.entityId)))continue;candidates++;
  const t=performance.now();let rel=null;try{rel=fodderRelease(state,opts,w)}catch(e){rel={error:String(e).slice(0,120)}}
  const dt=performance.now()-t;ms+=dt;max=Math.max(max,dt);
  if(rel)hits.push({file:p.slice(ROOT.length),createdAt:r.createdAt,turn:r.turn,...rel});
 }}
const out={files:files.length,rows,candidates,released:hits.length,searchMs:{total:Math.round(ms),max:Math.round(max)},hits};
writeFileSync('history.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({...out,hits:hits.map(h=>[h.file,h.turn,h.name,h.error,h.score&&+h.score.toFixed(1),h.rivalScore&&+h.rivalScore.toFixed(1),h.idleScore&&+h.idleScore.toFixed(1)])},null,0));
