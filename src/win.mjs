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
// 2026-09-30: every one of our attacks came 2.68-2.70s after the last, a tell no human has
// (they chain at 0.7-1.5s, and vary). So every wait and every gesture timing is drawn from a
// range, and the pointer lands a few pixels off the centre, as a hand would.
export const between=(lo,hi)=>Math.round(lo+Math.random()*(hi-lo));
const off=()=>between(-3,3);
export async function click(x,y,{settle=between(140,260),hold=between(50,95)}={}){return call({op:'click',x:Math.round(x)+off(),y:Math.round(y)+off(),settle,hold})}
export async function drag(x,y,x2,y2,{settle=between(150,250),hold=between(90,140)}={}){return call({op:'drag',x:Math.round(x)+off(),y:Math.round(y)+off(),x2:Math.round(x2)+off(),y2:Math.round(y2)+off(),settle,hold})}
// An attack as a player makes it: grab the attacker, barely pause, swing the arrow onto the
// target along a slight curve and let go. No hover on either card. See the 'fling' op.
// JEV_FLING_SCALE stretches the whole fling (hold, travel, rest) for timing sweeps; 1 = as measured.
const FS=Number(process.env.JEV_FLING_SCALE)||1,fs=n=>Math.round(n*FS);
export async function fling(x,y,x2,y2,{settle=fs(between(30,90)),hold=fs(between(40,100)),steps=between(9,15),stepMs=fs(between(6,12)),bend=(Math.random()*2-1)*0.08,rest=fs(between(25,60))}={}){
  return call({op:'fling',x:Math.round(x)+off(),y:Math.round(y)+off(),x2:Math.round(x2)+off(),y2:Math.round(y2)+off(),settle,hold,steps,stepMs,bend,rest});
}
// Saves the Hearthstone client area as a JPEG at an absolute path.
export async function shot(path,{quality=80,width=1600}={}){return call({op:'shot',path,quality,width})}
export async function cancel(){return call({op:'cancel'})}
export function stop(){if(proc){proc.stdin.end();proc=null;ready=null}}
