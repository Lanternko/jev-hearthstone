import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {untilQuiet} from '../src/playback-quiet.mjs';
import {createParser} from '../src/power.mjs';

// A fake clock: wait() advances it, read() returns the playback counter at that time.
// open: [start,end] spans during which a playback block is open.
function clock(changesAt,open=[]){
  let t=0;
  return {now:()=>t,wait:async ms=>{t+=ms},read:async()=>({played:changesAt.filter(c=>c<=t).length,depth:open.filter(([a,b])=>a<=t&&t<b).length})};
}

test('an ordinary turn waits only the fixed settle',async()=>{
  const c=clock([200,600]);
  const q=await untilQuiet(c.read,{min:3500,quiet:1500,wait:c.wait,now:c.now});
  assert.equal(q.extra,0);assert.equal(q.waited,3500);assert.ok(q.quiet);
});

test('a ritual still playing back past the settle holds the first click',async()=>{
  // the ritual turn: playback lines at +1.1s (summons), +4.1s (ritual leaves), +4.7s (draw)
  // the ritual's block is open from the turn start until it leaves play, with a 3s pause inside
  const c=clock([0,1100,4100,4150,4750],[[0,4100]]);
  const q=await untilQuiet(c.read,{min:3500,quiet:1500,wait:c.wait,now:c.now});
  assert.ok(q.quiet);
  assert.ok(q.waited>=4750+1500,`waited ${q.waited}`);
  assert.ok(q.extra>0);
});

test('playback that never stops gives up at the cap',async()=>{
  const c=clock(Array.from({length:200},(_,i)=>i*300));
  const q=await untilQuiet(c.read,{min:1000,quiet:1500,cap:5000,wait:c.wait,now:c.now});
  assert.equal(q.quiet,false);assert.ok(q.waited>=6000&&q.waited<6500);
});

test('the parser counts playback lines and keeps their time',()=>{
  const p=createParser();
  p.feed('D 22:28:35.9394680 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=9 \n');
  assert.equal(p.result().played,0);
  p.feed('D 22:28:35.9394680 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=9 \n'
    +'D 22:28:40.0580314 PowerTaskList.DebugPrintPower() - BLOCK_END\n');
  assert.equal(p.result().played,2);
  assert.equal(p.result().playedAt,'22:28:40.0580314');
  assert.equal(p.result().shownTurn,9);
});

test('loop waits for quiet playback before the first gesture of a turn',()=>{
  const src=readFileSync(new URL('../src/loop.mjs',import.meta.url),'utf8');
  assert.match(src,/untilQuiet\([^]*parsed[^]*playDepth[^]*min:loose\(TURN_SETTLE\)/);
});
