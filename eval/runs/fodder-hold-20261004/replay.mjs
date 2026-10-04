// Replay the morning decisions (policy-impact-20261004/all.jsonl) through the current policy and
// report every wastedFodder deletion and whether the hold-aware search released it.
import {readFileSync,writeFileSync} from 'node:fs';
import {constrainActions,wastedFodder} from '../../../src/policy.mjs';
import {prepare} from '../../../src/choose.mjs';
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const index=readFileSync('../policy-impact-20261004/all.jsonl','utf8').trim().split('\n').map(JSON.parse);
const out=[];let ms=0,max=0;
for(const x of index){
 const r=JSON.parse(readFileSync(ROOT+x.batch+'/'+x.file,'utf8').split('\n')[x.line]);
 const state=r.state,raw=r.rawOptions;if(!state||!raw)continue;
 const wasted=wastedFodder(state);if(!wasted.size)continue;
 const t0=performance.now(),trace={};const acts=constrainActions(state,raw,{trace});const dt=performance.now()-t0;
 ms+=dt;max=Math.max(max,dt);
 const p=prepare(state,acts,{admission:trace.admission});
 const name=id=>(state.me.hand??[]).find(c=>c.entityId===id)?.name;
 out.push({game:x.batch.slice(-13)+'/'+x.file.slice(5,9),turn:x.turn,mana:x.mana,hp:state.me.board?.find(c=>c.CARDTYPE==='HERO')?.HEALTH,
  wasted:[...wasted].map(name),simBestDeletedByFodder:x.bestRemovedBy==='wastedFodder',simBest:x.sim?.bestLabel,actual:x.actualLabel,
  release:trace.fodderRelease?{name:trace.fodderRelease.name,score:+trace.fodderRelease.score.toFixed(2),rival:trace.fodderRelease.rivalScore&&+trace.fodderRelease.rivalScore.toFixed(2),idle:+trace.fodderRelease.idleScore.toFixed(2),hold:trace.fodderRelease.holdValue}:null,
  notes:Object.entries(p.crit??{}).filter(([,c])=>c.fodderHold).map(([id])=>id),ms:Math.round(dt)});
}
writeFileSync('replay.json',JSON.stringify(out,null,1));
for(const o of out)console.log(o.game,'T'+o.turn,'mana',o.mana,'hp',o.hp,o.simBestDeletedByFodder?'[simBest deleted]':'',o.wasted.join('+'),'| sim',o.simBest,'| actual',o.actual,'| release',JSON.stringify(o.release),o.notes.join(','),o.ms+'ms');
console.log('rows',out.length,'released',out.filter(o=>o.release).length,'of simBest-deleted',out.filter(o=>o.simBestDeletedByFodder).length,'total ms',Math.round(ms),'max',Math.round(max));
