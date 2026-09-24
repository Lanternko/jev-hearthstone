// Mouse control and Hearthstone window geometry, via one long-lived PowerShell worker.
// Long-lived because spawning powershell.exe per click costs ~300ms, which is the whole budget.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const WORKER=fileURLToPath(new URL('./input-worker.ps1',import.meta.url));
let proc=null,queue=[],buf='',ready=null;

function start(){
  if(proc)return;
  proc=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',WORKER],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data',d=>{
    buf+=d;
    let i;
    while((i=buf.indexOf('\n'))>=0){
      const line=buf.slice(0,i).trim();buf=buf.slice(i+1);
      if(!line)continue;
      const w=queue.shift();if(!w)continue;
      let v;try{v=JSON.parse(line)}catch{w.reject(Error('Bad worker reply: '+line));continue}
      w.resolve(v);
    }
  });
  let err='';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data',d=>{err+=d});
  proc.on('exit',c=>{
    const q=queue;queue=[];proc=null;ready=null;
    for(const w of q)w.reject(Error(`Input worker exited (${c})${err?': '+err.trim():''}`));
  });
  ready=new Promise((resolve,reject)=>queue.push({resolve,reject}));
}
function send(cmd){
  start();
  return new Promise((resolve,reject)=>{queue.push({resolve,reject});proc.stdin.write(JSON.stringify(cmd)+'\n')});
}
async function call(cmd){start();await ready;const r=await send(cmd);if(!r.ok)throw Error(r.error||'input_failed');return r}

export async function geometry(){return call({op:'geo'})}
export async function focus(){return call({op:'focus'})}
export async function cursor(){return call({op:'cursor'})}
export async function move(x,y){return call({op:'move',x:Math.round(x),y:Math.round(y)})}
// Keeps the pointer from going motionless; see the 'nudge' op in the worker for why.
export async function nudge(){return call({op:'nudge'})}
export async function click(x,y,{settle=200,hold=70}={}){return call({op:'click',x:Math.round(x),y:Math.round(y),settle,hold})}
export async function drag(x,y,x2,y2,{settle=200,hold=110}={}){return call({op:'drag',x:Math.round(x),y:Math.round(y),x2:Math.round(x2),y2:Math.round(y2),settle,hold})}
export function stop(){if(proc){proc.stdin.end();proc=null;ready=null}}
