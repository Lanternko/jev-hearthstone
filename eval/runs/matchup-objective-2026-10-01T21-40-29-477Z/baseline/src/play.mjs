// Execute the stored Jev decision with the mouse, then report what the game did.
import {readFile,rename} from 'node:fs/promises';
import {snapshot} from './power.mjs';
import {plan,run,box as contentBoxOf} from './execute.mjs';
import * as win from './win.mjs';

const TTL=60000;
const dry=process.argv.includes('--dry');
const allowEndTurn=process.argv.includes('--end-turn');
try{
  const list=JSON.parse(await readFile(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
  const cards=Object.fromEntries(list.map(c=>[c.id,c]));
  const file=new URL('../runtime/decision.json',import.meta.url);
  const d=JSON.parse(await readFile(file,'utf8'));
  // Consume it before clicking anything. `decide` writes this file whether or not the caller
  // means to execute, so a later `play` -- including one reached because an earlier command in a
  // shell loop failed -- would otherwise replay a stale intent. Cost us a full turn of attacks once.
  if(!dry)await rename(file,new URL('../runtime/last-decision.json',import.meta.url));
  // Ending the turn forfeits every remaining action, so it is the one choice that must be
  // deliberate: it never executes on a bare `play`.
  if((d.action.type==='END_TURN'||d.action.id==='o0')&&!allowEndTurn)
    throw Error('Decision is END_TURN; re-run with --end-turn to confirm forfeiting the remaining actions.');
  const age=Date.now()-Date.parse(d.createdAt);
  if(age>TTL)throw Error(`Decision is ${Math.round(age/1000)}s old (limit ${TTL/1000}s); obtain a new one.`);

  const s=await snapshot(undefined,cards);
  if(s.state.decisionFingerprint!==d.stateFingerprint)throw Error('State has changed; obtain a new decision.');
  if(!s.actions.some(a=>a.id===d.action.id))throw Error('Action no longer available.');

  const box=await contentBoxOf(win);
  const steps=plan(box,s.state,d.action);
  console.log(JSON.stringify({action:d.action,client:box.client,steps:steps.map(x=>({what:x.what,x:Math.round(x.x),y:Math.round(x.y)}))},null,2));
  if(dry){console.log('--dry: cursor moved only, nothing clicked.');await run(steps,win,{dry:true});win.stop();process.exit(0)}

  if(!box.client.focused)await win.focus();
  await run(steps,win);
  // Poll rather than sample once: Power.log lags the animation by seconds.
  let after=s,applied=false;
  for(const until=Date.now()+6000;Date.now()<until;await new Promise(r=>setTimeout(r,250))){
    after=await snapshot(s.state.me.playerId,cards);
    if(after.state.decisionFingerprint!==s.state.decisionFingerprint){applied=true;break}
  }
  console.log(JSON.stringify({applied,turn:after.state.turn,myMana:after.state.me.mana,handCount:after.state.me.handCount,
    note:applied?'board changed; re-run decide for the next action':'board unchanged — check the calibration in src/layout.mjs'},null,2));
  win.stop();
}catch(e){console.error(e.message);win.stop();process.exitCode=1}
