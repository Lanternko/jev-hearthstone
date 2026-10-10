// User-authorized unattended ranked batch. Inspect only between games.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile,rename,open,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import * as win from '../src/win.mjs';
const limitArg=process.argv.find(a=>a.startsWith('--games='));
const gameLimit=limitArg?Number(limitArg.slice('--games='.length)):null;
if(gameLimit!==null&&(!Number.isInteger(gameLimit)||gameLimit<1))throw Error('Invalid --games limit');
// 2026-10-09 batch: a hard-coded default here lagged two versions behind and ran all 50 games on fodder-hold-v1.
const {defaultVersion}=await import('../src/planner-version.mjs');
process.env.JEV_SEARCH_VERSION??=defaultVersion;
try {process.loadEnvFile('.env.local')} catch(e) {if(e.code!=='ENOENT')throw e}
const {inspect}=await import('../src/bridge.mjs');
const {latestLog}=await import('../src/power.mjs');
const {lastGameLog}=await import('../src/game-health.mjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const startedAt=new Date().toISOString();
const tag='ranked-'+startedAt.replace(/[:.]/g,'-');
const dir=join('runtime',tag);
const lock='runtime/runner.lock';
await mkdir(dir,{recursive:true});
const oldPid=Number(await readFile(lock,'utf8').catch(()=>''));
if(oldPid){let alive=false;try{process.kill(oldPid,0);alive=true}catch{}if(alive)throw Error('Another runner owns the lock');await rename(lock,join(dir,'previous-runner.lock'))}
const lease=await open(lock,'wx');await lease.writeFile(String(process.pid));await lease.close();
await rename('runtime/stop',join(dir,'previous-stop')).catch(e=>{if(e.code!=='ENOENT')throw e});
const hashes={};for(const f of (await readdir('src')).filter(f=>f.endsWith('.mjs')).sort())hashes[f]=createHash('sha256').update(await readFile(join('src',f))).digest('hex');
const priorSnapshot=await readFile('data/opponent-prior.json');
hashes['data/opponent-prior.json']=createHash('sha256').update(priorSnapshot).digest('hex');
await writeFile(join(dir,'opponent-prior-at-launch.json'),priorSnapshot);
const state={tag,pid:process.pid,startedAt,plannerVersion:process.env.JEV_SEARCH_VERSION,gameLimit,phase:'starting',games:0,wins:0,losses:0,ties:0,consecutiveLosses:0,stopAfterConsecutiveLosses:6,results:[],sourceHashes:hashes};
await writeFile('runtime/active-ranked-run.json',JSON.stringify({tag,dir,pid:process.pid,statusPath:join(dir,'status.json')},null,2));
// 2026-10-10: the Legend promotion went unrecorded because the sidecar had to be started by hand. Launch it with every batch.
if(!process.argv.includes('--no-record')){const out=await open(join(dir,'record-legend.log'),'w');const rec=spawn(process.execPath,['runtime/record-legend.mjs','--active-ranked'],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:['ignore',out.fd,out.fd]});rec.unref();await out.close()}
async function save(){state.updatedAt=new Date().toISOString();await writeFile(join(dir,'status.tmp'),JSON.stringify(state,null,2));await rename(join(dir,'status.tmp'),join(dir,'status.json'))}
async function note(s){await appendFile('runtime/batch.txt',`${new Date().toISOString()} | ${tag} | ${s}\n`);console.log(s)}
function child(file,args=[],{outputFile,timeoutMs}={}){return new Promise(async(resolve,reject)=>{
 let fd;try{if(outputFile)fd=await open(outputFile,'w');const p=spawn(process.execPath,[file,...args],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore',fd?.fd??'pipe',fd?.fd??'pipe']});let text='';if(!fd){p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b)}let timedOut=false;const timer=timeoutMs?setTimeout(()=>{timedOut=true;p.kill()},timeoutMs):null;p.once('error',reject);p.once('close',async code=>{if(timer)clearTimeout(timer);await fd?.close();resolve({code,text:text.trim(),timedOut})})}catch(e){await fd?.close();reject(e)}
})}
async function click(x,y){await win.focus();const g=await win.geometry();await win.click(x*g.width/2560,y*g.height/1440)}
async function stopRequested(){return readFile('runtime/stop').then(()=>true,()=>false)}
await save();await note(`continuous ranked start; ${state.plannerVersion}; six consecutive losses stop`);
try {
 // A freshly launched client may not create Power.log until its first match.
 // Only that exact missing-log condition is safe to treat as no active game.
 let initialStatus;
 try{initialStatus=(await inspect()).state.status}catch(e){if(e.message!=='No Power.log found')throw e}
 if(initialStatus==='RUNNING')throw Error('An existing game is running; refusing to queue over it');
 while(true){
  if(gameLimit!==null&&state.games>=gameLimit){state.stopReason='game_limit_reached';break}
  if(await stopRequested()){state.stopReason='user_stop';break}
  const ordinal=state.games+1;state.currentGame=ordinal;state.phase='queueing';await save();
  let started=false;
  for(let attempt=1;attempt<=3;attempt++){
   if(await stopRequested())break;
   if(ordinal>1||attempt>1||process.argv.includes('--dismiss-results')){await click(1267,866);await wait(2000);for(let k=0;k<4;k++){await click(1280,1300);await wait(3000)}}
   await click(1867,1174);
   const ready=await child('src/await-game.mjs',[],{timeoutMs:150000});
   if(ready.code===0){started=true;break}
  }
  if(!started){state.stopReason=await stopRequested()?'user_stop':'match_failed_to_start';break}
  const since=new Date().toISOString();state.phase='playing';state.currentGameStartedAt=since;await save();await note(`game ${ordinal} started`);
  const logPath=join(dir,`game-${String(ordinal).padStart(4,'0')}.log`);
  const run=await child('src/loop.mjs',[],{outputFile:logPath,timeoutMs:48*60000});
  await writeFile('runtime/last-game.log',await readFile(logPath));
  await wait(20000);
  const health=await child('runtime/health.mjs',[since]);
  const rank=await child('runtime/rank.mjs');
  const post=(await inspect()).state;
  const text=await readFile((await latestLog()).path,'utf8');
  await writeFile(join(dir,`game-${String(ordinal).padStart(4,'0')}-Power.log`),lastGameLog(text));
  const rows=(await readFile('runtime/decisions.jsonl','utf8')).split('\n').filter(Boolean).filter(l=>{try{return JSON.parse(l).createdAt>=since}catch{return false}});
  await writeFile(join(dir,`game-${String(ordinal).padStart(4,'0')}-decisions.jsonl`),rows.join('\n')+'\n');
  const result=/^(Win|Loss|Tie)\b/.exec(health.text)?.[1]??'Unknown';
  state.results.push({ordinal,since,finishedAt:new Date().toISOString(),result,health:health.text,rank:rank.text,plannerVersion:state.plannerVersion,logPath});state.games++;
  if(result==='Win'){state.wins++;state.consecutiveLosses=0}else if(result==='Loss'){state.losses++;state.consecutiveLosses++}else if(result==='Tie'){state.ties++;state.consecutiveLosses=0}
  await note(`game ${ordinal} done | ${health.text} | HDT: ${rank.text} | losses in row ${state.consecutiveLosses}`);
  state.phase='between_games';await save();
  if(health.code!==0){state.stopReason='model_trouble';break}
  if(run.code===2&&post.status==='COMPLETE'&&result!=='Unknown'){state.stopReason='mulligan_execution_misfire';break}
  if(run.code!==0||run.timedOut||post.status!=='COMPLETE'||result==='Unknown'){state.stopReason='game_incomplete_or_runner_error';break}
  if(state.consecutiveLosses>=6){state.stopReason='six_consecutive_losses';break}
 }
}catch(e){state.stopReason='runner_error';state.error=e.message;await note(`STOP ${e.message}`)}
finally{
 win.stop();state.phase='stopped';state.finishedAt=new Date().toISOString();await save();await note(`STOP ${state.stopReason}; ${state.games} games, ${state.wins} wins, ${state.losses} losses, ${state.ties} ties`);
 if(Number(await readFile(lock,'utf8').catch(()=>''))===process.pid)await rename(lock,join(dir,'finished-runner.lock'));
}
