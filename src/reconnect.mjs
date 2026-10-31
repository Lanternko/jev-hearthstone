// Battle.net drop recovery (F-893, L-039). The NTNU VPN is a full tunnel, so when its session drops
// every connection moves to the Wi-Fi route. The game server reconnects by itself; the Battle.net
// connection never does (ReconnectMgr attempts=0, type LOGIN): the client keeps its reconnect dialog
// up and swallows every click until it is restarted through Battle.net.
import {readdir,readFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {connect} from 'node:net';
import {homedir} from 'node:os';
import {LOG_ROOT} from './power.mjs';

export const BNET='D:/遊戲/Battle.net/Battle.net.exe';
const VPN_PROBE={host:'140.122.184.29',port:22};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// One folder per client launch, named Hearthstone_YYYY_MM_DD_HH_MM_SS, so the last name is the live client.
export async function sessionDir(root=LOG_ROOT){
  const names=(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name.startsWith('Hearthstone_')).map(d=>d.name).sort();
  return names.length?join(root,names.at(-1)):null;
}
export const countDrops=text=>(text.match(/Bnet_OnDisconnected/g)??[]).length;
export async function bnetDrops(root=LOG_ROOT){
  const dir=await sessionDir(root);
  const text=dir?await readFile(join(dir,'BattleNet.log'),'utf8').catch(()=>''):'';
  return {dir,count:countDrops(text)};
}
// A drop the live client logged after `base` was taken; a client launched since counts all of its own.
export const droppedSince=(base,now)=>now.dir!==base.dir?now.count>0:now.count>base.count;

export function probe({host,port}=VPN_PROBE,ms=4000){
  return new Promise(resolve=>{
    const s=connect({host,port});const done=ok=>{s.destroy();resolve(ok)};
    s.setTimeout(ms,()=>done(false));s.once('connect',()=>done(true));s.once('error',()=>done(false));
  });
}
// Run the VPN keepalive now instead of at its next minute (the task ignores a second start while one runs).
// Detached: the loop calls this right before process.exit(3), and libuv kills attached children with their
// parent on Windows (2026-10-30 05:37 drill: the kick never ran and the keepalive waited for its next minute, 34 s).
export function kickVpn(){spawn('schtasks',['/Run','/TN','NTNU VPN Keepalive'],{detached:true,windowsHide:true,stdio:'ignore'}).unref()}
// 2026-10-29: Battle.net dropped a second time at 23:44:36, 29 s after the keepalive logged `VPN up`,
// so a restart while the tunnel is coming back is wasted. Wait for it (the keepalive needs up to ~4
// minutes for two tries); past the limit it is out of tries, and the client goes out over Wi-Fi.
// The settle was 20 s; E-294 put the whole recovery at 86 s against a 90 s turn, so it is 5 s now (user's call,
// 2026-10-30): restartClient re-sends the launch until Battle.net takes it, which covers a slow login.
export async function waitVpn({limitMs=5*60000,settleMs=5000,check=probe,sleep=wait,now=Date.now}={}){
  const until=now()+limitMs;
  while(now()<until){if(await check()){await sleep(settleMs);return true}await sleep(1000)}
  return false;
}

// NTNU's BIG-IP ends every session 8 hours after it started (keepalive log 10-27..10-29: 04:48 -> 12:48 -> 20:52
// -> 04:53, and 15:40 -> 23:41 cut ranked game 21). Renewing it between games moves that drop off the board.
// The session's start is the last `VPN up` the keepalive logged; a session started by hand after it only makes the
// age look older, so the renewal comes early, never late.
export const VPN_LOG=join(homedir(),'automations/logs/vpn-ntnu.log');
export const VPN_RENEW_MS=7.5*3600000;
export function lastVpnUp(text){
  const m=[...text.matchAll(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) VPN up/gm)].at(-1);
  return m?new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6]).getTime():null;
}
export async function vpnAgeMs(now=Date.now(),log=VPN_LOG){
  const up=lastVpnUp(await readFile(log,'utf8').catch(()=>''));
  return up==null?null:now-up;
}
// 2026-10-30: the 5090 moved to Tailscale and the keepalive task was disabled, so there is no VPN to wait for or
// renew; with the task disabled, waitVpn would spend its whole 5 minutes on every drop and every game.
export const keepaliveOn=csv=>/"(Ready|Running)"\s*$/m.test(csv);
export async function vpnInUse(){return keepaliveOn(await run('schtasks',['/Query','/TN','NTNU VPN Keepalive','/FO','CSV','/NH']))}
const F5='C:/Program Files (x86)/F5 VPN/f5fpc.exe';
// Stop the session the gentle way (`-stop /s <id>`; killing f5fpclientW took the Wi-Fi down with it, L-074),
// have the keepalive start a new one, and wait for it. The client's Battle.net link drops with the old route.
export async function renewVpn(){
  const id=(await run(F5,['-info'])).match(/^\s*(\d+)\s+\d+\s+session established/m)?.[1];
  if(id)await run(F5,['-stop','/s',id]);
  await wait(3000);
  kickVpn();
  return waitVpn();
}

// The client's own scene: LoadingScreen.log ends with `currMode=<MODE>` (HUB, TOURNAMENT = deck screen, JOURNAL, GAMEPLAY).
export const lastMode=text=>[...text.matchAll(/currMode=(\w+)/g)].at(-1)?.[1]??null;
export async function sceneMode(root=LOG_ROOT){
  const dir=await sessionDir(root);
  return dir?lastMode(await readFile(join(dir,'LoadingScreen.log'),'utf8').catch(()=>'')):null;
}
// A fresh login lands on the hub under a stack of quest pop-ups. Any click dismisses a pop-up, so keep
// clicking where 《爐石戰記》 sits on the hub until the deck screen loads. Only ever click while the hub
// is the scene: 2026-10-30 the batch's own dismiss click (1280,1300) opened 日誌 there, and 《爐石戰記》's
// spot is the 核心牧師 tile on the deck screen.
export const HUB_PLAY=[1275,435];
export async function toDeckScreen(click,{mode=sceneMode,sleep=wait,tries=40}={}){
  for(let i=0;i<tries;i++){
    const m=await mode();
    if(m==='TOURNAMENT')return true;
    if(m==='HUB')await click(...HUB_PLAY);
    await sleep(3000);
  }
  return false;
}

function run(cmd,args){return new Promise(r=>execFile(cmd,args,{windowsHide:true},(e,out)=>r(e?'':String(out))))}
export async function clientRunning(){return /Hearthstone\.exe/i.test(await run('tasklist',['/FI','IMAGENAME eq Hearthstone.exe','/NH']))}
// 2026-10-30: the 40-game batch ran without HDT, so no rank, opponent rank, coin or replay was kept for
// any of it (F-900). The runner starts it before every game; it attaches to a client that is already up.
export const HDT_UPDATE=join(process.env.LOCALAPPDATA??'','HearthstoneDeckTracker','Update.exe');
export async function hdtRunning(){return /HearthstoneDeckTracker\.exe/i.test(await run('tasklist',['/FI','IMAGENAME eq HearthstoneDeckTracker.exe','/NH']))}
export async function ensureHdt({running=hdtRunning,launch=()=>spawn(HDT_UPDATE,['--processStart','HearthstoneDeckTracker.exe'],{detached:true,windowsHide:true,stdio:'ignore'}).unref(),sleep=wait,tries=30}={}){
  if(await running())return 'running';
  launch();
  for(let i=0;i<tries;i++){await sleep(2000);if(await running())return 'started'}
  return 'failed';
}
// The runner kills the dead client as soon as the loop reports a drop, while the VPN is still coming back
// (E-294: killing it only after the VPN was up cost ~7 s of the 86 s).
export async function killClient(root=LOG_ROOT){
  const dir=await sessionDir(root);
  if(await clientRunning()){
    await run('taskkill',['/IM','Hearthstone.exe','/F']);
    for(let i=0;i<20&&await clientRunning();i++)await wait(1000);
  }
  // A clean exit renames Power.log to Power_old.log; a killed client does not, and latestLog() would
  // keep reading the dead game as RUNNING until the new client writes a Power.log of its own.
  if(dir)await rename(join(dir,'Power.log'),join(dir,'Power_old.log')).catch(()=>{});
}
// Kill the client and launch it again through Battle.net; resolves to the new log folder, or null.
export async function restartClient({root=LOG_ROOT,limitMs=4*60000}={}){
  const before=await sessionDir(root);
  if(await clientRunning()){await killClient(root);await wait(3000)}
  // 2026-10-30 02:41 drill: launched 5 s after the VPN came back, Battle.net was still offline and dropped
  // the request (no client in 4 minutes); the same call 10 minutes later had a client up in 8 s. So ask again
  // every 10 s until one starts (05:38 drill: the first request, 20 s after the VPN was back, was dropped too,
  // and a 30 s gap made the restart take 41 s).
  const launch=()=>spawn(BNET,['--exec=launch WTCG'],{detached:true,windowsHide:true,stdio:'ignore'}).unref();
  const until=Date.now()+limitMs;let next=0;
  while(Date.now()<until){
    if(Date.now()>=next&&!await clientRunning()){launch();next=Date.now()+10000}
    await wait(2000);
    const dir=await sessionDir(root);
    if(dir&&dir!==before&&await clientRunning())return dir;
  }
  return null;
}
