// Read runtime/gestures.jsonl and say what separates the gestures that worked from the ones
// that did not. Only differences matter: a fact true of every gesture explains nothing.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const raw=await readFile(fileURLToPath(new URL('../runtime/gestures.jsonl',import.meta.url)),'utf8')
  .catch(()=>'');
const rows=raw.split('\n').filter(Boolean).map(l=>JSON.parse(l));
if(!rows.length){console.log('No gestures logged yet -- play a game with src/loop.mjs first.');process.exit(0)}

// How long the mouse sat still before this gesture. Derived rather than recorded, because it
// only became worth asking after the first real batch: every mechanical fault column came back
// empty, and idle time was the one thing left that told the two columns apart.
let last=null;
for(const r of rows){
  const t=Date.parse(r.createdAt);
  r.idleMs=last==null?null:t-last;
  last=t;
}
const live=rows.filter(r=>!r.dead),dead=rows.filter(r=>r.dead);
const pct=(n,d)=>d?`${(100*n/d).toFixed(0)}%`:'--';
const probe=(r,tag)=>r.probes?.find(p=>p.tag===tag);
const miss=p=>p&&p.dx!=null?Math.hypot(p.dx,p.dy):null;

// Each feature is a yes/no question asked of one gesture. A feature that answers yes at the
// same rate in both columns is not the cause, however plausible it sounded.
const features={
  'drag (not click)'        : r=>r.kind==='drag',
  'had to re-take focus'    : r=>r.refocused===true,
  'not foreground at down'  : r=>probe(r,'down')?.fg===false,
  'not foreground at up'    : r=>probe(r,'up')?.fg===false,
  'cursor off at arm >2px'  : r=>miss(probe(r,'armed'))>2,
  'cursor off at down >2px' : r=>miss(probe(r,'down'))>2,
  'cursor off at drop >2px' : r=>miss(probe(r,'rested')??probe(r,'up'))>2,
  'another window at down'  : r=>{const a=probe(r,'armed'),d=probe(r,'down');return !!a&&!!d&&a.hwnd!==d.hwnd},
  'window under != client'  : r=>{const d=probe(r,'down');return !!d&&d.hwnd!==r.handle},
  'an event was not sent'   : r=>[r.rc?.arm,r.rc?.down,r.rc?.up].some(v=>v===0)||r.badMoves>0,
  'armed settle <150ms'     : r=>probe(r,'armed')?.at<150,
  'down->up over 400ms'     : r=>{const d=probe(r,'down'),u=probe(r,'up');return !!d&&!!u&&u.at-d.at>400},
  'idle over 5s before it'  : r=>r.idleMs>5000,
};

console.log(`${rows.length} gestures: ${live.length} live, ${dead.length} dead (${pct(dead.length,rows.length)})\n`);

// Live is not the same as right. Rows logged since verify.mjs carry a verdict; a misfire moved
// the board the wrong way (neighbouring card, attacker or target), which "dead" never counted.
const judged=rows.filter(r=>r.verdict);
if(judged.length){
  const by=v=>judged.filter(r=>r.verdict===v).length;
  console.log(`verified: ${by('ok')} ok, ${by('misfire')} misfire, ${by('unverified')} unverified, ${by('dead')} dead`);
  for(const r of judged.filter(r=>r.misfire))console.log(`  misfire  turn ${r.turn} ${r.action} ${r.kind??''}`);
  // The heartbeat claim: a pointer that never sits still 10s+ should stop the idle deaths.
  const long=judged.filter(r=>r.idleMs>10000);
  console.log(`idle >10s since heartbeat: ${long.filter(r=>r.dead).length}/${long.length} dead (was 17/18 before)\n`);
}
console.log('feature                      dead      live   split');
for(const [name,f] of Object.entries(features)){
  const d=dead.filter(f).length,l=live.filter(f).length;
  const dr=dead.length?d/dead.length:0,lr=live.length?l/live.length:0;
  const gap=Math.abs(dr-lr);
  console.log(`${name.padEnd(26)} ${pct(d,dead.length).padStart(4)} ${pct(l,live.length).padStart(9)}   ${gap>=0.3?'<<< SUSPECT':gap>=0.15?'  maybe':''}`);
}

// A dead gesture with no fault is the interesting case: the input was delivered to the right
// window at the right pixel and the game still did nothing, which points at the option or the
// client's own timing, not at the mouse. 'drag' and the hold duration describe a gesture rather
// than accuse it, so they are not faults.
const DESCRIPTIVE=new Set(['drag (not click)','down->up over 400ms']);
const faults=Object.entries(features).filter(([n])=>!DESCRIPTIVE.has(n)).map(([,f])=>f);
const clean=dead.filter(r=>!faults.some(f=>f(r)));
console.log(`\n${clean.length} of ${dead.length} dead gestures look mechanically perfect.`);

console.log('\nlast 10 dead:');
for(const r of dead.slice(-10)){
  const t=r.target,to=t?.x2!=null?`${t.x},${t.y} -> ${t.x2},${t.y2}`:`${t?.x},${t?.y}`;
  console.log(` t${r.turn} ${r.kind.padEnd(5)} ${to.padEnd(24)} ${r.what.join(' -> ')}`);
  for(const p of r.probes??[])
    console.log(`    ${String(p.at).padStart(5)}ms ${p.tag.padEnd(10)} at ${p.x},${p.y}`
      +(p.dx!=null?` (off by ${p.dx},${p.dy})`:'')+` fg=${p.fg} hwnd=${p.hwnd}`);
}
