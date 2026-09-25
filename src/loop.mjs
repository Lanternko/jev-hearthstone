// Drive a turn: ask Jev for one action, click it, confirm the board moved, repeat.
// Stops on the first click that changes nothing, because that means the coordinates are wrong.
import {next,inspect} from './bridge.mjs';
import {verdict} from './verify.mjs';
import {plan,run,box as boxOf} from './execute.mjs';
import * as win from './win.mjs';
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Every gesture, live or dead, with the worker's trace of what Windows actually did. Three
// games at an unchanged 26% failure rate is two fixes aimed at guesses; this file is what
// replaces the guessing. runtime/gesture-report.mjs reads it.
const GESTURES=fileURLToPath(new URL('../runtime/gestures.jsonl',import.meta.url));
async function record(rows){
  if(!rows.length)return;
  try{await appendFile(GESTURES,rows.map(r=>JSON.stringify(r)).join('\n')+'\n')}
  catch(e){console.log(`${stamp()} gesture log failed: ${e.message}`)}
}

const arg=n=>{const a=process.argv.find(x=>x.startsWith(`--${n}=`));return a?Number(a.split('=')[1]):null};
const dry=process.argv.includes('--dry');
const maxActions=arg('max')??300;   // a whole game; 40 once stopped one mid-turn
const until=Date.now()+(arg('minutes')??45)*60000;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stamp=()=>new Date().toTimeString().slice(0,8);
// The game flushes Power.log behind the animation, so poll for the change instead of
// sampling once: a single late sample reads as "nothing happened" when it plainly did.
// "Changed" is not "worked": a drag that picks up the neighbouring card changes the board too.
// So poll until verify.mjs sees the intended effect (ok) or a different one (misfire). A board
// that moved but shows neither within a short grace is 'unverified' -- random effects and
// half-flushed animations land here, and the loop treats them as it always did: as done.
async function settled(state,action,ms=9000,grace=2500){
 let until=Date.now()+ms,moved=null;
 while(Date.now()<until){
  const s=await inspect();
  const v=verdict(state,action,s.state);
  if(v!=='pending')return {s,verdict:v};
  if(s.state.decisionFingerprint!==state.decisionFingerprint&&!moved){moved=s;until=Math.min(until,Date.now()+grace)}
  if(moved)moved=s;
  await wait(250);
 }
 return moved?{s:moved,verdict:'unverified'}:null;
}

// Measured over a whole game: of 18 gestures that followed 10+ seconds of a motionless pointer,
// 17 died; of 41 that followed less, none did. Nothing else told the two apart -- the pointer
// was on target to the pixel, Hearthstone was in front, every event was injected. So the
// pointer is never allowed to go still: a one-pixel jitter every few seconds while we wait for
// Jev or for the opponent. It hovers nothing new and is skipped while a gesture is running.
let busy=false;
const heartbeat=dry?null:setInterval(()=>{if(!busy)win.nudge().catch(()=>{})},3000);

// Measured 2026-09-24 over two games: the first gesture of every one of our turns died (8 of 8),
// and so did most gestures sent about a second after an attack or a play resolved. The log runs
// ahead of the screen: it reports the new turn while "Your Turn" and the draw are still animating,
// and a resolved attack while the attacker is still flying back. Clicks during an animation are
// dropped. Each dead one costs the 9s settle, so a short wait up front is far cheaper.
// A fixed 3.5s wait did not help (6 of 6 turns still died): the server hands us our turn 3.4 to
// 8.5s before the client has finished playing the opponent's. So wait for the playback copy of
// the log to reach our turn, then for the "Your Turn" banner.
// User ruling (2026-09-26, game 12): "第六回合的第一次出牌要稍微再等久一點" -- the Duke drag died
// as the first gesture of the turn. 2s after the banner was not enough; 3.5s.
const TURN_SETTLE=3500,ACTION_SETTLE=1200,DRAW_SETTLE=3000,DRAW_EACH=800;
let lastTurn=null;
// The mulligan is offered while the hero intro still plays; gestures then are dropped.
const MULLIGAN_INTRO=6000;
let mullSeen=null;
async function onScreen(turn,ms=20000){
 const until=Date.now()+ms;
 while(Date.now()<until){
  try{if(((await inspect()).parsed.shownTurn??0)>=turn)break}catch{}
  await wait(250);
 }
 await wait(TURN_SETTLE);
}

let acted=0,idle=0,stuck=0,missed=0;
try{
  const box=await boxOf(win);
  console.log(`${stamp()} client ${box.client.width}x${box.client.height}${dry?' | DRY RUN, cursor only':''}`);

  while(acted<maxActions&&Date.now()<until){
    let before;
    try{before=await inspect()}catch(e){console.log(`${stamp()} transient read: ${e.message}`);await wait(800);continue}
    if(before.state.status!=='RUNNING'){console.log(`${stamp()} game is ${before.state.status}; stopping`);break}

    let d;
    try{d=await next()}catch(e){console.log(`${stamp()} transient decide: ${e.message}`);await wait(800);continue}
    if(!d.ready){
      if(++idle%10===0)console.log(`${stamp()} waiting (${d.reason??'not my turn'})`);
      await wait(1500);continue;
    }
    idle=0;
    // 2026-09-25, game 9: the loop started 2s after the offer, the first read did not show the
    // mulligan yet, the check above never fired, and the toggle retries left one card of four.
    // So the intro wait is also checked against the state the decision was made on.
    if(d.state.choice?.type==='MULLIGAN'&&!dry){
      mullSeen??=Date.now();
      if(mullSeen+MULLIGAN_INTRO>Date.now())continue;
    }

    let steps;
    try{steps=plan(box,d.state,d.action)}catch(e){console.log(`${stamp()} transient plan: ${e.message}`);await wait(800);continue}
    console.log(`${stamp()} #${acted+1} ${d.action.id} [${d.source??d.model??'jev'}${d.plan?` plan ${d.plan}`:''} ${d.latencyMs}ms] :: ${steps.map(s=>s.what).join(' -> ')}`);
    if(dry){await run(steps,win,{dry:true});acted++;await wait(600);continue}

    if(d.action.type!=='MULLIGAN'&&d.state.turn!==lastTurn){lastTurn=d.state.turn;await onScreen(d.state.turn)}
    if(!(await win.geometry()).focused)await win.focus();
    busy=true;
    let gestures;
    try{({gestures}=await run(steps,win))}finally{busy=false}
    // The mulligan is offered while the hero intro still plays, and a confirm then does nothing;
    // retry it every few seconds instead of every nine.
    const after=await settled(d.state,d.action,d.action.type==='MULLIGAN'?3000:9000);
    await record(gestures.map((g,i)=>({
      createdAt:new Date().toISOString(),
      dead:!after,                         // verdict is per action; with one gesture it is exact
      verdict:after?.verdict??'dead',misfire:after?.verdict==='misfire',
      action:d.action.id,turn:d.state.turn,index:i,of:gestures.length,...g,
    })));
    // 2026-09-25, game 8: "play Ocular Occultist -> discard Boneweb Egg". The drag died, the discard
    // click still went out onto a hand card with no battlecry waiting -- which picks that card up --
    // and the retry's drag then played the Egg. Twice. When a two-gesture action does not come out
    // as asked, right-click first, so nothing is left on the cursor for the retry to drop.
    if(d.action.type!=='MULLIGAN'&&gestures.length>1&&(!after||after.verdict==='misfire')){
      try{await win.cancel();console.log(`${stamp()} ${d.action.id}: right-click to drop anything left on the cursor`)}catch(e){console.log(`${stamp()} cancel failed: ${e.message}`)}
      await wait(400);
    }
    if(!after){
      // A click that changes nothing used to stop the run. In a live game that is worse than
      // the bad click: the turn stalls and the clock runs out. Skip the action and ask again.
      // The give-up threshold was three, which turned out to be the trap: each retry waits out
      // the 9s settle, so the retry itself arrives after a long idle and dies for the same
      // reason as the original. Three in a row was self-inflicted, and it abandoned a live
      // game at turn 4. Eight, and only ever as a guard against genuinely wrong coordinates.
      console.log(`${stamp()} no change after ${steps.map(s=>`${Math.round(s.x)},${Math.round(s.y)}`).join(' / ')}; skipping`);
      // A mulligan during the intro is expected to die a few times; it says nothing about geometry.
      if(d.action.type!=='MULLIGAN'&&++stuck>=8){console.log('Eight dead gestures in a row -- coordinates are off; stopping.');break}
      await wait(600);continue;
    }
    stuck=0;
    acted++;
    if(after.verdict==='misfire'){
      // The board moved, but not the way we asked: the click hit a neighbouring card, attacker or
      // target. The new state is still a legal game, so the loop re-decides from it -- but two in
      // a row means the geometry is off and every further click spends a real card on a guess.
      console.log(`${stamp()} MISFIRE: ${d.action.id} did something else at ${steps.map(s=>`${Math.round(s.x)},${Math.round(s.y)}`).join(' / ')}`);
      if(++missed>=2){console.log('Two misfires in a row -- layout is off; stopping.');break}
    }else missed=0;
    if(d.action.type==='END_TURN')console.log(`${stamp()} turn ended`);
    // User ruling (2026-09-25, game 9): a drawn card flies into the hand for about two seconds,
    // and a gesture aimed at the hand meanwhile lands on the wrong card. Wait it out.
    // User ruling (2026-09-26, game 11): "抽牌的動畫要再等久一點才能出牌". Two seconds was not enough:
    // after the Soularium's three draws the Catacombs drag died. The log can also report the draw
    // after the verdict came in, so the hand is read again once the action has settled, and each
    // extra card drawn adds to the wait.
    else{
      const had=new Set((d.state.me?.hand??[]).map(c=>c.entityId));
      const fresh=c=>!had.has(c.entityId);
      await wait(ACTION_SETTLE);
      let hand=after.s.state.me?.hand??[];
      try{const now=(await inspect()).state.me?.hand;if(now&&now.filter(fresh).length>hand.filter(fresh).length)hand=now}catch{}
      const drew=hand.filter(fresh).length;
      if(drew)await wait(DRAW_SETTLE+DRAW_EACH*(drew-1));
    }
  }
  console.log(`${stamp()} done, ${acted} action(s)`);
}catch(e){console.error(`${stamp()} ${e.message}`)}
finally{if(heartbeat)clearInterval(heartbeat);win.stop()}
