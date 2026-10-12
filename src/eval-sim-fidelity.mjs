// How often does sim.mjs predict what the game then did? Replays every archived game
// (runtime/ranked-*/game-NNNN-Power.log): at each of our own root PLAY/ATTACK blocks the board
// before it goes through fromState/moves/apply, and the prediction is compared with the real
// board at the next options packet -- the same moment the bridge compares signatures.
// Reads archives only; plays nothing. Also tallies the opponents met, by class.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createParser,publicState,candidates} from './power.mjs';
import {fromState,moves,apply,cardModel,signature,followed,hpOf} from './sim.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const cards=Object.fromEntries(JSON.parse(await readFile(join(root,'data/cards.enUS.json'),'utf8')).map(c=>[c.id,c]));
// --plain measures the simulator the live planner uses; the default adds sim.mjs's `full` models.
const plain=process.argv.includes('--plain'),[only,show]=process.argv.slice(2).filter(a=>a!=='--plain');

// Bodies are matched by entity id first, then by statline: the sim's own tokens carry negative
// ids, and a minion summoned by its discard is a new entity in the game while the sim keeps the
// hand card's id. `renamed` reports the second case -- the board is right, the bridge's signature is not.
const FIELDS=['atk','hp','armor','ds','taunt','dormant','frozen'];
function diff(pred,real){
  const out=[];let renamed=false;
  for(const side of ['me','opp']){
    const left=new Map(real[side].map(b=>[b.id,b])),loose=[];
    for(const b of pred[side]){
      const r=left.get(b.id);
      if(!r){loose.push(b);continue}
      left.delete(b.id);
      if(b.type==='HERO'){if(hpOf(b)!==hpOf(r))out.push(`${side}:hero health`);if(b.atk!==r.atk)out.push(`${side}:hero atk`);continue}
      for(const f of FIELDS)if(b[f]!==r[f])out.push(`${side}:minion ${f}`);
    }
    for(const b of loose){
      const r=[...left.values()].find(r=>r.type===b.type&&FIELDS.every(f=>r[f]===b[f]));
      if(r){left.delete(r.id);renamed||=b.id>=0}else out.push(`${side}:${b.id<0?'token':b.type==='HERO'?'hero':'minion'} predicted, not there`);
    }
    for(const r of left.values())out.push(`${side}:${r.type==='HERO'?'hero':'minion'} there, not predicted`);
  }
  const ph=new Set(pred.hand.map(c=>c.id)),rh=new Set(real.hand.map(c=>c.id));
  if([...ph].some(id=>!rh.has(id)))out.push('hand:card predicted, gone');
  if([...rh].some(id=>!ph.has(id)))out.push('hand:card gained');
  if(pred.mana!==real.mana)out.push('mana');
  const w=x=>x?`${x.atk}/${x.durability}`:'';
  if(w(pred.weapon)!==w(real.weapon))out.push('weapon');
  return {miss:[...new Set(out)],renamed};
}

const bump=(o,k,n=1)=>{o[k]=(o[k]??0)+n};
const total={games:0,truncated:0,own:0,opponentActions:0,covered:0,exactClaimed:0,exactMatched:0,exactStrict:0,exactFollowed:0,exactRenamed:0,inexact:0,inexactMatched:0,noAfter:0};
const byLabel={},uncovered={},missKinds={},examples={},inexactNotes={};
const classes={},seen={};
const label=(s0,m,state)=>{
  if(m.kind==='attack'){const a=s0.me.find(b=>b.id===m.id),t=s0.opp.find(b=>b.id===m.targetId);return `attack ${a?.type==='HERO'?'hero':'minion'}>${t?.type==='HERO'?'face':'minion'}`}
  const c=[...state.me.hand,...state.me.board].find(c=>c.entityId===m.id);
  return `${m.kind} ${c?.name??'?'}`;
};

async function game(path,id){
  const p=createParser();let depth=0,pending=null,cls=null;
  const close=parsed=>{
    const a=pending;pending=null;
    const real=fromState(publicState(parsed,a.me,cards),[]);
    const {miss:d,renamed}=diff(a.r.s,real),row=byLabel[a.label]??={n:0,exact:0,exactMatched:0,inexact:0,inexactMatched:0};
    row.n++;
    if(a.r.exact){
      total.exactClaimed++;row.exact++;
      if(signature(a.r.s)===signature(real))total.exactStrict++;
      if(followed(signature(a.r.s),real))total.exactFollowed++;
      if(!d.length){total.exactMatched++;row.exactMatched++;if(renamed)total.exactRenamed++}
      else{if(show&&a.label.includes(show))console.log(`${id} turn ${a.turn} ${a.label}: ${d.join('; ')}
  before ${a.before}
  pred   ${signature(a.r.s)}
  real   ${signature(real)}`);
      for(const k of d){bump(missKinds,k);const e=examples[`${a.label} | ${k}`]??=[];if(e.length<3)e.push(`${id} turn ${a.turn}`)}}
    }else{
      total.inexact++;row.inexact++;bump(inexactNotes,a.r.note.replace(/\d+/g,'N').replace(/among .*?;/,'among …;').replace(/discarding .*? triggers/,'discarding X triggers').replace(/^.* dies with/,'X dies with').slice(0,90));
      if(!d.length){total.inexactMatched++;row.inexactMatched++}
    }
  };
  // An archive cut after the game began has no GameState CREATE_GAME: no heroes, no turn, no options.
  const text=await readFile(path,'utf8');
  if(!text.includes('GameState.DebugPrintPower() - CREATE_GAME')){total.truncated++;return}
  for(const line of text.split(/\r?\n/)){
    if(pending&&line.includes('GameState.DebugPrintOptions() - id='))close(p.result());
    const s=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/)?.[1];
    if(s==='CREATE_GAME')depth=0;
    else if(s==='BLOCK_END')depth=Math.max(0,depth-1);
    else if(s?.startsWith('BLOCK_START')){
      const m=depth++===0&&s.match(/^BLOCK_START BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b/);
      if(m){
        const parsed=p.result(),me=parsed.localPlayer,e=parsed.entities.get(Number(m[2]));
        if(pending)close(parsed);
        if(Number(e?.tags.CONTROLLER)!==me)total.opponentActions++;
        else{
          total.own++;
          const state=publicState(parsed,me,cards),actions=candidates(parsed,state),s0=fromState(state,actions,{full:!plain});
          cls??=state.opponent.heroClass;
          const targetId=Number(s.match(/\bTarget=\[.*?\bid=(\d+)\b/)?.[1]??0)||null;
          const kind=m[1]==='ATTACK'?'attack':e.tags.CARDTYPE==='HERO_POWER'?'power':!plain&&e.tags.CARDTYPE==='LOCATION'&&e.tags.ZONE==='PLAY'?'use':'play';
          const same=moves(s0).filter(x=>x.kind===kind&&x.id===e.id);
          const move=kind==='attack'||same.some(x=>x.targetId!=null)?same.find(x=>x.targetId===targetId):same[0];
          if(!move){
            const c=s0.hand.find(c=>c.id===e.id),name=cards[e.cardId]?.name??e.cardId;
            const why=kind==='attack'?'attack not among sim moves':kind==='power'?`hero power ${name}`
              :!c?`${e.tags.CARDTYPE?.toLowerCase()} ${name}`:targetId&&!s0.hand.some(c=>c.id===targetId)?`targeted ${name}`:cardModel(c)?`modelled but not offered: ${name}`:`no model: ${name}`;
            bump(uncovered,why);
            if(show&&why.includes(show))console.log(`${id} turn ${state.turn} ${why}: target ${targetId}, mana ${s0.mana}, options ${actions.length}, sim moves for it ${JSON.stringify(same)}
  before ${signature(s0)}`);
          }else{
            total.covered++;
            pending={me,turn:state.turn,label:label(s0,move,state),before:signature(s0),r:apply(s0,move)};
          }
        }
      }
    }
    p.feed(line);
  }
  if(pending){pending=null;total.noAfter++}
  const parsed=p.result(),me=parsed.localPlayer;
  if(![1,2].includes(me))return;
  const state=publicState(parsed,me,cards);cls??=state.opponent.heroClass??'?';
  const c=classes[cls]??={games:0,won:0,lost:0};
  c.games++;total.games++;
  if(state.me.playstate==='WON')c.won++;else if(['LOST','CONCEDED'].includes(state.me.playstate))c.lost++;
  const names=new Set(state.opponent.publicPlays.map(p=>p.name));
  for(const n of names)bump(seen[cls]??={},n);
}

const dirs=(await readdir(join(root,'runtime'),{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name.startsWith('ranked-')&&(!only||d.name.includes(only))).map(d=>d.name).sort();
for(const d of dirs)for(const f of (await readdir(join(root,'runtime',d))).filter(f=>/^game-\d+-Power\.log$/.test(f)).sort())
  await game(join(root,'runtime',d,f),`${d.slice(7,23)}/${f.slice(0,9)}`);

const pct=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'-';
const top=(o,n=15)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
console.log(`games ${total.games} (${total.truncated} truncated archives skipped); own actions ${total.own}; opponent actions ${total.opponentActions} (not simulated at all)`);
console.log(`coverage: ${total.covered}/${total.own} ${pct(total.covered,total.own)} of own actions are sim moves`);
console.log(`exact claimed: ${total.exactClaimed} (${pct(total.exactClaimed,total.covered)} of covered); reality agreed ${total.exactMatched} ${pct(total.exactMatched,total.exactClaimed)} (strict signature ${pct(total.exactStrict,total.exactClaimed)}, bridge continues on ${pct(total.exactFollowed,total.exactClaimed)}; ${total.exactRenamed} right boards under a new entity id)`);
console.log(`inexact (plan stops): ${total.inexact}; best guess right anyway ${pct(total.inexactMatched,total.inexact)}; no board after (game ended) ${total.noAfter}`);
console.log(`whole-step fidelity over all own actions: ${pct(total.exactMatched,total.own)}`);
console.log('\nby step            n  exact  agreed  inexact');
for(const [k,v] of Object.entries(byLabel).sort((a,b)=>b[1].n-a[1].n).slice(0,30))console.log(`${k.padEnd(34)} ${String(v.n).padStart(5)} ${String(v.exact).padStart(5)} ${pct(v.exactMatched,v.exact).padStart(7)} ${String(v.inexact).padStart(5)}`);
console.log('\nnot sim moves:');for(const [k,v] of top(uncovered,30))console.log(`  ${String(v).padStart(5)} ${k}`);
console.log('\nwhy an exact claim was wrong:');for(const [k,v] of top(missKinds))console.log(`  ${String(v).padStart(5)} ${k}`);
console.log('\nwhy steps were inexact:');for(const [k,v] of top(inexactNotes))console.log(`  ${String(v).padStart(5)} ${k}`);
console.log('\nopponents:');for(const [k,v] of Object.entries(classes).sort((a,b)=>b[1].games-a[1].games))
  console.log(`  ${k.padEnd(12)} ${String(v.games).padStart(3)} ${pct(v.games,total.games).padStart(6)}  ${v.won}W-${v.lost}L  ${top(seen[k]??{},8).map(([n,c])=>`${n} ${c}`).join(', ')}`);
const dir=join(root,'eval/runs',`sim-fidelity-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(dir,{recursive:true});
await writeFile(join(dir,'summary.json'),JSON.stringify({plain,total,byLabel,uncovered,missKinds,inexactNotes,examples,classes,seen},null,1));
console.log(`\n${dir}`);
