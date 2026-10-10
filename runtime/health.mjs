// node runtime/health.mjs <game start ISO>  ->  "<Win|Loss|Tie|?> [| STOP <reason>]"; exit 2 on STOP.
import {readFile} from 'node:fs/promises';
import {latestLog} from '../src/power.mjs';
import {resultOf,modelTrouble} from '../src/game-health.mjs';
// JEV_ACCOUNT is our BattleTag as Power.log prints it; it lives in .env.local, never in the repo.
try{process.loadEnvFile(new URL('../.env.local',import.meta.url))}catch{}
if(!process.env.JEV_ACCOUNT)console.error('JEV_ACCOUNT is not set (.env.local): the game result cannot be read.');
const since=process.argv[2]??new Date(0).toISOString();
const log=await readFile((await latestLog()).path,'utf8').catch(()=>'');
const result=resultOf(log,process.env.JEV_ACCOUNT)??'?';
const rows=(await readFile(new URL('./decisions.jsonl',import.meta.url),'utf8').catch(()=>''))
  .split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(r=>r&&r.createdAt>=since);
const why=modelTrouble(rows);
console.log(why?`${result} | STOP ${why}`:result);
process.exit(why?2:0);
