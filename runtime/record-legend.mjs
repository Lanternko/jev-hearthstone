// Local recording sidecar: no model calls, no game inputs, no screenshot polling.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,appendFile,mkdir,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
const exec=promisify(execFile),wait=ms=>new Promise(r=>setTimeout(r,ms));
const windowTitle=process.argv.find(a=>a.startsWith('--window-title='))?.slice('--window-title='.length)??'《爐石戰記》';
const runnerPid=process.argv.includes('--active-ranked')
 ?Number(JSON.parse(await readFile('runtime/active-ranked-run.json','utf8')).pid)
 :Number((await readFile('runtime/batch154-203.pid','utf8')).trim());
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
const existing=Number(await readFile('runtime/record-legend.pid','utf8').catch(()=>''));
if(existing&&alive(existing))throw Error('Legend recorder already running');
await writeFile('runtime/record-legend.pid',String(process.pid));
await mkdir('runtime/videos',{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const base=`runtime/videos/legend-${stamp}`;
const log=async event=>{const row={time:new Date().toISOString(),...event};console.log(JSON.stringify(row));await appendFile(`${base}.events.jsonl`,JSON.stringify(row)+'\n')};
let recorder=null,recordingExit=null,failed=false,legendAt=null,lastRank=null,finishRequested=false;
const deadline=Date.now()+9*60*60*1000;
async function rank(){
 let stdout;
 try{({stdout}=await exec(process.execPath,['runtime/rank.mjs'],{windowsHide:true,timeout:10000}))}
 catch(e){if(e.code===1&&e.stdout)stdout=e.stdout;else throw e}
 const level=Number(stdout.match(/level (\d+)/)?.[1]);
 if(!level)throw Error('No recorded rank');
 return {level,summary:stdout.trim()};
}
async function record(){
 const out=`${base}-%03d.mkv`;
 recorder=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-f','gdigrab','-framerate','15',
  '-i',`title=${windowTitle}`,'-vf','scale=1280:-2','-c:v','libx264','-preset','veryfast',
  '-crf','28','-pix_fmt','yuv420p','-force_key_frames','expr:gte(t,n_forced*1800)',
  '-f','segment','-segment_time','1800','-reset_timestamps','1',out],
  {windowsHide:true,stdio:['pipe','ignore','pipe']});
 recorder.stdin.on('error',()=>{});
 const errors=createWriteStream(`${base}.ffmpeg.log`);recorder.stderr.pipe(errors);
 recordingExit=new Promise(resolve=>{
  recorder.once('error',e=>{failed=true;errors.end();resolve({error:e.message})});
  recorder.once('exit',(code,signal)=>{if(!finishRequested)failed=true;errors.end();resolve({code,signal})});
 });
 await log({event:'recording_started',rank:lastRank,pathPattern:out});
 await wait(3000);
 const first=await stat(`${base}-000.mkv`).catch(()=>null);
 if(!first?.size||failed)throw Error('Recording did not produce video data');
 await log({event:'video_data_verified',bytes:first.size});
}
await log({event:'armed',runnerPid,trigger:'Diamond 2 (StarLevel >=49)',afterLegendSeconds:60,window:windowTitle});
try{
 while(Date.now()<deadline&&alive(runnerPid)&&!failed){
  const r=await rank();
  if(r.summary!==lastRank){lastRank=r.summary;await log({event:'rank',...r})}
  if(!recorder&&r.level>=49)await record();
  if(r.level>=51&&legendAt===null){legendAt=Date.now();await log({event:'legend_confirmed',rank:r.summary})}
  if(legendAt!==null&&Date.now()-legendAt>=60000)break;
  await wait(15000);
 }
}catch(e){failed=true;await log({event:'error',message:e.message})}
finally{
 finishRequested=true;
 if(recorder&&recorder.exitCode===null){
  recorder.stdin.write('q\n');
  const result=await Promise.race([recordingExit,wait(15000).then(()=>null)]);
  if(result===null){recorder.kill();await log({event:'recording_stop_timeout'})}
  else await log({event:'recording_closed',...result});
 }
 await log({event:'finished',reason:failed?'error':legendAt!==null?'legend captured':alive(runnerPid)?'9 hour limit':'batch stopped',pathPattern:recorder?`${base}-%03d.mkv`:null});
 await writeFile('runtime/record-legend.pid','');
}
