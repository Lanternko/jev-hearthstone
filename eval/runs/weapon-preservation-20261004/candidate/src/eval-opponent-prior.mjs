import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {opponentPrior} from './opponent-prior.mjs';
const d=JSON.parse(readFileSync(new URL('../data/opponent-prior.json',import.meta.url)));
const sorted=[...d.rows].sort((a,b)=>Date.parse(a.endedAt)-Date.parse(b.endedAt));
const training=sorted.slice(0,-50),heldout=sorted.slice(-50),data={...d,rows:training};
const types=['control','tempo','combo','unknown'];
const brier=(p,y)=>types.reduce((s,t)=>s+(p[t]-Number(y===t))**2,0);
const rows=heldout.map(g=>{
 const opening={turn:0,choice:{type:'MULLIGAN'},opponent:{heroClass:g.heroClass}};
 const global=opponentPrior({opponent:{}},data),cls=opponentPrior(opening,data);
 // Forty-Health is evaluated separately from class. No cards from this game
 // are supplied to the predictor; they exist only as retrospective labels.
 const forty=g.forty?opponentPrior({...opening,opponent:{...opening.opponent,initialHealth:40}},data):cls;
 return {id:g.id,label:g.type,class:g.heroClass,forty:g.forty,
  globalBrier:brier(global.probabilities,g.type),classBrier:brier(cls.probabilities,g.type),openingBrier:brier(forty.probabilities,g.type)};
});
const mean=k=>rows.reduce((s,r)=>s+r[k],0)/rows.length;
const report={trainingGames:training.length,holdoutGames:rows.length,trainingThrough:training.at(-1).endedAt,
 scores:{global:mean('globalBrier'),class:mean('classBrier'),classAndForty:mean('openingBrier')},
 note:'Chronological holdout, Brier lower is better. Includes unresolved label as a fourth category; descriptive analyst/user labels are not externally verified archetype ground truth. Not win-rate evidence or proof of well-calibrated probabilities.',rows};
const dir=new URL('../eval/runs/class-prior-20261002/',import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(new URL('holdout.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({trainingGames:report.trainingGames,holdoutGames:report.holdoutGames,scores:report.scores}));
