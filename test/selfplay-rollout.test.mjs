import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {moves,apply} from '../src/sim.mjs';
import {newGame,loadList,cardDb} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {parsePower} from '../src/power.mjs';
import {shadowView} from '../src/selfplay-shadow.mjs';
import {redeal} from '../src/selfplay-search.mjs';
import {Rollouts,score,delayedStep} from '../src/selfplay-rollout.mjs';
import {Arena} from '../src/selfplay-env.mjs';

const names=cs=>cs.map(c=>c.name).join();
const hidden=s=>`${names(s.them.hand)}|${names(s.them.deck)}`;   // what a play of ours leaves alone

test('every branch of a request is played on the same deals, and the deals differ from each other',()=>{
  const zoo=loadList('warlock-zoo');
  let s=newGame({lists:[zoo,loadList('warlock-discard')],seed:5});
  const playable=x=>moves(x).filter(m=>m.kind==='play').length;
  for(let n=0;n<200&&playable(s)<2;n++){const l=moves(s);s=apply(s,l.find(m=>m.kind==='end')??l[0]).s}
  const legal=moves(s),r=new Rollouts(),plays=legal.map((m,k)=>m.kind==='play'?k:-1).filter(k=>k>=0);
  assert.ok(plays.length>=2);                                             // two steps that keep the turn
  r.add(1,s,legal,plays.slice(0,2),{games:4,seed:77});
  const at=k=>r.fresh.filter(c=>c.at===k);
  assert.ok(at(0).every((c,g)=>hidden(c.s)===hidden(at(1)[g].s)),'the same hidden cards on each deal');
  assert.ok(at(0).every((c,g)=>c.s.seed===at(1)[g].s.seed),'the same dice for what follows too');     // the same dice for what follows too
  assert.ok(new Set(at(0).map(c=>hidden(c.s))).size>1);
  assert.equal(r.fresh.length,8);
});

test('a step takes on each deal the offered line of the best mean, not the best line of the deal',()=>{
  // Line /a wins on deals 0 and 1 and loses on 2; line /b loses on 0, 1, wins on 2: /a (2/3) is taken
  // everywhere, so the step scores 2/3, not the 1 that the best line of each deal would give.
  const lines=new Map([['/a',new Map([[0,1],[1,1],[2,0]])],['/b',new Map([[0,0],[1,0],[2,1]])]]);
  assert.ok(Math.abs(score(lines,3)-2/3)<1e-9);
  assert.equal(score(new Map([['',new Map([[0,1],[1,0.5]])]]),2),0.75);
});

test('the roll and rstep commands of the arena play rollouts to their end and score them',()=>{
  const arena=new Arena({lists:[loadList('warlock-zoo'),loadList('warlock-discard')],n:2,seed:3,marks:true});
  const q=arena.roll([{id:7,table:1,steps:[0,1],seed:9}],{games:2});
  assert.equal(q.queued,4);
  let r=arena.rstep([]),done=[];
  for(let n=0;r.envs.length&&n<3000;n++){done.push(...r.done);r=arena.rstep(r.envs.map(()=>0))}
  done.push(...r.done);
  assert.equal(done.length,1);
  assert.equal(done[0].id,7);
  assert.equal(done[0].win.length,2);
  for(const w of done[0].win)assert.ok(w>=0&&w<=1);
});

// The Kazakus position of runtime/scratch/board-score/kazakus.mjs (zoo, our turn 3: Godfather Kazakus or Mawman
// Cultist first). Its decisions and Power.log are local (runtime/ is not in git); without them the test is skipped.
const RUN=new URL('../runtime/ranked-2026-10-25T07-20-20-650Z/',import.meta.url);
const have=existsSync(new URL('game-0001-decisions.jsonl',RUN))&&existsSync(new URL('game-0001-Power.log',RUN));
test('rollouts at the Kazakus position rank Kazakus, with its picks played out, above Mawman Cultist',{skip:!have&&'no local Kazakus game'},t=>{
  const rows=readFileSync(new URL('game-0001-decisions.jsonl',RUN),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const row=rows[94];
  const log=readFileSync(new URL('game-0001-Power.log',RUN),'utf8').split('\n');
  const cut=log.findIndex(l=>/BLOCK_START BlockType=PLAY.*cardId=BE_729 player=1/.test(l));
  const cards=cardDb(),zoo=loadList('warlock-zoo'),opList=loadList('warlock-discard');
  const view=shadowView(parsePower(log.slice(0,cut).join('\n')),row.state,row.options,{cards,list:zoo});
  const g=newGame({lists:[zoo,opList],seed:1*7919+13});
  let s=view.s;
  s.game=g.game;
  for(const b of s.opp)b.maxAttacks??=b.windfury?2:1;
  s.nextToken=g.nextToken+10;
  const th=g.them,real=s.them;
  s.them={...th,hand:th.hand.filter(c=>c.name!=='The Coin').slice(0,4),deck:th.deck,seat:1-s.seat,timers:[],crystals:real.crystals,mana:0,fatigue:0,
    discardCount:real.discardCount,locations:real.locations,weapon:real.weapon??null,died:0};
  s=redeal(s,1*104729+7);
  const legal=moves(s),nameOf=id=>s.hand.find(c=>c.id===id)?.name;
  const kaz=legal.findIndex(m=>m.kind==='play'&&nameOf(m.id)==='Godfather Kazakus');
  const maw=legal.findIndex(m=>m.kind==='play'&&nameOf(m.id)==='Mawman Cultist');
  assert.ok(kaz>=0&&maw>=0);
  assert.ok(delayedStep(s,legal[kaz])&&!delayedStep(s,legal[maw]));
  const net=loadNet(new URL('../models/selfplay/warlock-zoo-v5.json',import.meta.url));
  const r=new Rollouts({follow:27});
  r.add(1,s,legal,[kaz,maw],{games:16,seed:4242});
  let live=r.step([]);
  for(let n=0;live.length&&n<3000;n++)live=r.step(live.map(c=>c.legal.indexOf(net.rank(c.s,c.legal).steps[0].move)));
  const [d]=r.take();
  assert.ok(d,'the request finished');
  assert.ok(d.lines[0]>1&&d.lines[1]===1,`Kazakus's picks are played out (${d.lines})`);
  t.diagnostic(`Kazakus ${d.win[0].toFixed(3)} (${d.lines[0]} lines) / Mawman ${d.win[1].toFixed(3)}`);
  assert.ok(d.win[0]>d.win[1],`Kazakus ${d.win[0]} above Mawman ${d.win[1]}`);
});
