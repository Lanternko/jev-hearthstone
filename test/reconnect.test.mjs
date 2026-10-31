import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {countDrops,droppedSince,sessionDir,bnetDrops,lastMode,sceneMode,waitVpn,toDeckScreen,HUB_PLAY,lastVpnUp,vpnAgeMs,VPN_RENEW_MS,keepaliveOn} from '../src/reconnect.mjs';

// 2026-10-29 23:40:35, ranked game 21 (F-893): the VPN session dropped, Battle.net logged this line,
// and the reconnect dialog ate eight clicks until the loop gave up as "coordinates are off".
const DROP='E 23:40:35.9858929 [] EnqueueErrorInfo Triggered: Bnet, Bnet_OnDisconnected, 1901 (BattleNetCSharp.cs EnqueueErrorInfo:1222)\n';

async function logs(sessions){
  const root=await mkdtemp(join(tmpdir(),'hs-logs-'));
  for(const [name,files] of Object.entries(sessions)){
    await mkdir(join(root,name));
    for(const [f,text] of Object.entries(files))await writeFile(join(root,name,f),text);
  }
  return root;
}

test('Battle.net drops are counted in the newest client session only',async()=>{
  assert.equal(countDrops('I 23:40:00 ok\n'+DROP+DROP),2);
  const root=await logs({
    Hearthstone_2026_10_29_07_45_44:{'BattleNet.log':DROP+DROP+DROP},
    Hearthstone_2026_10_29_21_02_19:{'BattleNet.log':DROP},
  });
  assert.equal(await sessionDir(root),join(root,'Hearthstone_2026_10_29_21_02_19'));
  assert.deepEqual(await bnetDrops(root),{dir:join(root,'Hearthstone_2026_10_29_21_02_19'),count:1});
});

test('a drop counts only if it came after the loop started, or in a client launched since',()=>{
  const base={dir:'A',count:1};
  assert.equal(droppedSince(base,{dir:'A',count:1}),false);
  assert.equal(droppedSince(base,{dir:'A',count:2}),true);
  assert.equal(droppedSince(base,{dir:'B',count:0}),false);
  assert.equal(droppedSince(base,{dir:'B',count:1}),true);
});

test('the scene is the last currMode in LoadingScreen.log',async()=>{
  const text='D 01:23:56 LoadingScreen.OnSceneLoaded() - prevMode=JOURNAL currMode=HUB\nD 01:24:00 LoadingScreen.OnSceneLoaded() - prevMode=HUB currMode=TOURNAMENT\n';
  assert.equal(lastMode(text),'TOURNAMENT');
  assert.equal(lastMode(''),null);
  const root=await logs({Hearthstone_2026_10_30_01_22_09:{'LoadingScreen.log':text}});
  assert.equal(await sceneMode(root),'TOURNAMENT');
});

test('waitVpn returns once the probe answers, and gives up at the limit',async()=>{
  let t=0,calls=0;const now=()=>t,sleep=async ms=>{t+=ms};
  assert.equal(await waitVpn({check:async()=>++calls>=3,now,sleep,limitMs:60000}),true);
  assert.equal(calls,3);
  t=0;
  assert.equal(await waitVpn({check:async()=>false,now,sleep,limitMs:60000}),false);
  assert.ok(t>=60000);
});

test('toDeckScreen clicks 《爐石戰記》 only while the hub is the scene',async()=>{
  // 2026-10-30: the batch's own dismiss click opened 日誌 on the hub, and 《爐石戰記》's spot on the deck screen is a deck tile.
  const modes=['LOGIN','HUB','HUB','JOURNAL','HUB','TOURNAMENT'];const clicks=[];
  const ok=await toDeckScreen(async(x,y)=>clicks.push([x,y]),{mode:async()=>modes.shift(),sleep:async()=>{}});
  assert.equal(ok,true);
  assert.deepEqual(clicks,[HUB_PLAY,HUB_PLAY,HUB_PLAY]);
  assert.equal(await toDeckScreen(async()=>{},{mode:async()=>'JOURNAL',sleep:async()=>{},tries:3}),false);
});

test('the loop hands a Battle.net drop to the runner as exit 3, and the runner restarts the client',async()=>{
  const loop=await readFile(new URL('../src/loop.mjs',import.meta.url),'utf8');
  const runner=await readFile(new URL('../runtime/ranked-continuous.mjs',import.meta.url),'utf8');
  // The drop check must come before the eight-dead-gestures stop, or the game is abandoned as a geometry fault.
  assert.ok(loop.indexOf('BNET_DISCONNECTED')<loop.indexOf('Eight dead gestures'));
  assert.match(loop,/BNET_DISCONNECTED[^\n]*process\.exitCode=3;break/);
  assert.match(loop,/mulliganRecovery&&process\.exitCode!==3/);
  // 2026-10-30 drill: dead gestures found the drop 38 s late; the log watch kicks the keepalive and exits 3 at once.
  assert.match(loop,/dropWatch=setInterval[\s\S]{0,200}kickVpn\(\)[\s\S]{0,200}process\.exit\(3\)/);
  assert.match(runner,/run\.code===3/);
  assert.match(runner,/restartClient\(\)/);
  // 2026-10-30 drill: a drop between games has no loop running to catch it, so the runner checks before queueing.
  assert.ok(runner.indexOf('(await bnetDrops()).count>0')<runner.indexOf('await click(1867,1174)'));
  // 2026-10-30 02:41: one launch request sent while Battle.net was still offline was dropped, so it must be re-sent.
  const rc=await readFile(new URL('../src/reconnect.mjs',import.meta.url),'utf8');
  assert.match(rc,/while\(Date\.now\(\)<until\)\{\s*if\(Date\.now\(\)>=next&&!await clientRunning\(\)\)\{launch\(\)/);
  // 2026-10-30 05:37 drill: an attached schtasks child died with the loop's process.exit(3), so the kick never ran.
  assert.match(rc,/export function kickVpn\(\)\{spawn\('schtasks',[^\n]*detached:true[^\n]*\.unref\(\)\}/);
  assert.match(rc,/launch\(\);next=Date\.now\(\)\+10000/);
  // E-294 (user's call A): the dead client goes while the VPN comes back, and the settle after `VPN up` is 5 s.
  assert.ok(runner.indexOf('await killClient()')>0&&runner.indexOf('await killClient()')<runner.indexOf('const vpn=useVpn&&await waitVpn()'));
  assert.match(rc,/waitVpn\(\{limitMs=5\*60000,settleMs=5000,/);
});

test('a rejoined client with our turn and no options ends the turn instead of idling',async()=>{
  // 2026-10-30 kill-and-relaunch drill: options arrived before CREATE_GAME and were dropped; the loop waited 30 minutes.
  const loop=await readFile(new URL('../src/loop.mjs',import.meta.url),'utf8');
  assert.match(loop,/st\.me\.current&&st\.step==='MAIN_ACTION'&&st\.optionsId==null[\s\S]{0,300}type:'END_TURN'/);
});

test('the VPN session age comes from the last `VPN up` in the keepalive log',async()=>{
  // 2026-10-29: up 15:40:50, cut 23:41:25 by the BIG-IP's 8-hour limit, in the middle of ranked game 21.
  const text='2026-10-29 15:40:34 5090 unreachable; starting VPN\n2026-10-29 15:40:50 VPN up; 5090 reachable\n2026-10-29 23:41:25 5090 unreachable; starting VPN\n';
  assert.equal(lastVpnUp(text),new Date(2026,9,29,15,40,50).getTime());
  assert.equal(lastVpnUp('2026-10-30 06:02:40 5090 unreachable; starting VPN (try 1)\n'),null);
  const root=await mkdtemp(join(tmpdir(),'vpn-log-'));const log=join(root,'vpn-ntnu.log');
  await writeFile(log,text+'2026-10-30 06:02:52 VPN up; 5090 reachable (try 1)\n');
  assert.equal(await vpnAgeMs(new Date(2026,9,30,13,32,52).getTime(),log),7.5*3600000);
  assert.equal(await vpnAgeMs(Date.now(),join(root,'missing.log')),null);
  assert.ok(VPN_RENEW_MS<8*3600000-30*60000+1);
});

test('the runner renews an old VPN session before queueing, and restarts the client after it',async()=>{
  const runner=await readFile(new URL('../runtime/ranked-continuous.mjs',import.meta.url),'utf8');
  const renew=runner.indexOf('await renewVpn()');
  assert.ok(renew>0&&runner.indexOf('age>VPN_RENEW_MS')<renew);
  assert.ok(renew<runner.indexOf('await click(1867,1174)'));
  assert.match(runner.slice(renew,renew+120),/restartClient\(\)\|\|!await toDeckScreen\(click\)/);
  const rc=await readFile(new URL('../src/reconnect.mjs',import.meta.url),'utf8');
  // L-074: only the gentle stop; killing f5fpclientW took the PC's Wi-Fi down.
  assert.match(rc,/renewVpn\(\)\{[\s\S]{0,200}\['-stop','\/s',id\]/);
  assert.doesNotMatch(rc,/taskkill[^\n]*f5fpc/i);
});

test('with the keepalive task disabled the runner neither waits for nor renews the VPN',async()=>{
  // 2026-10-30: the 5090 moved to Tailscale and the task was disabled; waitVpn would burn 5 minutes per drop and per game.
  assert.equal(keepaliveOn('"\NTNU VPN Keepalive","N/A","Disabled"\r\n'),false);
  assert.equal(keepaliveOn('"\NTNU VPN Keepalive","2026/10/30 14:00:00","Ready"\r\n'),true);
  const runner=await readFile(new URL('../runtime/ranked-continuous.mjs',import.meta.url),'utf8');
  assert.match(runner,/const age=await vpnInUse\(\)\?await vpnAgeMs\(\):null/);
  assert.match(runner,/if\(await vpnInUse\(\)\)await waitVpn\(\)/);
  assert.doesNotMatch(runner,/^\s*(const vpn=)?await waitVpn\(\)/m);
});

test('the input worker moves the Claude window aside when it lies over the click point',async()=>{
  // L-077 again, 2026-10-30 13:48: the window read as minimized, yet the cursor's hwnd was Claude's and 開始 did nothing.
  const ps=await readFile(new URL('../src/input-worker.ps1',import.meta.url),'utf8');
  const arm=ps.slice(ps.indexOf('function Arm'),ps.indexOf("Reply @{ok=$true;ready=$true}"));
  assert.match(arm,/RootAtCursor\(\)[\s\S]{0,300}ProcessName -match '\^claude\$'[\s\S]{0,80}ShowWindow\(\[intptr\]\$root, 6\)/);
  assert.ok(arm.indexOf('ShowWindow')<arm.indexOf("Probe $g 'armed'"));
});

// F-900: the 2026-10-30 batch ran without HDT and kept no rank, opponent rank, coin or replay.
test('ensureHdt starts HDT only when it is not running, and reports a launch that never comes up', async()=>{
  const {ensureHdt}=await import('../src/reconnect.mjs');
  let launches=0;const sleep=async()=>{};
  assert.equal(await ensureHdt({running:async()=>true,launch:()=>launches++,sleep}),'running');
  assert.equal(launches,0);
  let n=0;
  assert.equal(await ensureHdt({running:async()=>n++>=2,launch:()=>launches++,sleep}),'started');
  assert.equal(launches,1);
  assert.equal(await ensureHdt({running:async()=>false,launch:()=>launches++,sleep,tries:3}),'failed');
  assert.equal(launches,2);
});
test('every way into a game checks HDT first', async()=>{
  assert.match(await readFile('src/await-game.mjs','utf8'),/await ensureHdt\(\)/);
  assert.match(await readFile('runtime/ranked-continuous.mjs','utf8'),/await ensureHdt\(\)/);
});
