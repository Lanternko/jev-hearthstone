// Plain mistakes of a self-play seat, counted from the states on either side of each step it takes.
// The win rate against a weak player stops moving long before the play is good; these keep moving,
// and each of them is a thing the user has ruled on in real games: a win left on the board, a buff
// cast after the swing it should have fed, a minion thrown away into a bigger one, a turn passed
// with something still to do, a damage spell aimed at our own side.
//
// None is a mistake every single time (a minion may die on purpose to free a slot), so they are
// rates to compare between two players, not a count of errors.
//
// The buff after the swing is the one that is also split by whether it can be excused. Only
// `lateClear` has no excuse: a card that gives the whole side Attack was in hand and paid for when a
// minion swung, the swing left its target standing (or went to the face), that minion then got the
// Attack it had just swung without, and the turn did not win the game anyway. The rest of buffLate:
//   lateOther  the Attack came from something else (Duke of Below growing with a discard)
//   lateDrawn  the card was not in hand, or not paid for, when the minion swung
//   lateFree   every such swing killed what it hit: the Attack would have changed nothing
//   lateWon    the game was won in that same turn
//
//   node src/selfplay-audit.mjs [games=500] [random|rush] [seed=1]
import {pathToFileURL} from 'node:url';
import {hero,hpOf,moves,apply} from './sim.mjs';
import {newGame,loadList,randomPolicy,rushPolicy} from './selfplay.mjs';

export const blank=()=>({steps:0,turns:0,manaLeft:0,endAttack:0,endPlay:0,endPower:0,
  lethalTurns:0,lethalMissed:0,buffs:0,buffLate:0,lateClear:0,lateOther:0,lateDrawn:0,lateFree:0,lateWon:0,trades:0,tradeLost:0,aimed:0,aimedOwn:0});

// Is the other hero dead to the swings already on the board? Counts nothing from the hand.
export function lethalOnBoard(s,legal){
  const face=hero(s,'opp'),seen=new Set();
  let dmg=0;
  for(const m of legal){
    if(m.kind!=='attack'||m.targetId!==face.id||seen.has(m.id))continue;
    seen.add(m.id);
    const a=s.me.find(b=>b.id===m.id);
    dmg+=a.atk*Math.max(1,(a.maxAttacks??1)-(a.attacks??0));
  }
  return dmg>0&&dmg>=hpOf(face);
}

const TEAM_BUFF=/give your minions \+\d/i;

// What the step is about to be judged on, read before it is applied.
export function before(s,legal,m){
  const spent=b=>b.canAttack&&(b.attacks??0)>=(b.maxAttacks??1);
  const card=m.kind==='play'?s.hand.find(c=>c.id===m.id):null;
  return {m,lethal:lethalOnBoard(s,legal),mana:s.mana,kinds:new Set(legal.map(x=>x.kind)),
    hand:new Map(s.hand.map(c=>[c.id,c.cost])),teamBuff:TEAM_BUFF.test(card?.raw?.text??''),
    mine:s.me.filter(b=>b.type==='MINION').map(b=>({id:b.id,atk:b.atk,swings:!!b.canAttack,spent:spent(b)})),
    attacker:m.kind==='attack'?s.me.find(b=>b.id===m.id)?.type:null,
    target:m.targetId==null?null:{own:s.me.some(b=>b.id===m.targetId),hp:hpOf([...s.me,...s.opp].find(b=>b.id===m.targetId)),
      type:[...s.me,...s.opp].find(b=>b.id===m.targetId)?.type}};
}

// memo belongs to one game; stats is the running total.
export function after(stats,memo,pre,s){
  const {m}=pre,ended=m.kind==='end';
  // After 'end' the chairs are swapped: what was ours is now s.opp.
  const mine=ended?s.opp:s.me,theirs=ended?s.me:s.opp;
  stats.steps++;
  if(pre.lethal)memo.lethal=true;
  const won=!ended&&hpOf(theirs.find(b=>b.type==='HERO'))<=0,lost=hpOf(mine.find(b=>b.type==='HERO'))<=0;
  if(memo.lethal&&(ended||won||lost)){stats.lethalTurns++;if(!won)stats.lethalMissed++;memo.lethal=false}
  if(ended||won||lost){
    stats[won?'lateWon':'lateClear']+=memo.late??0;
    memo.late=0;memo.swings=null;
  }
  if(ended){
    stats.turns++;stats.manaLeft+=pre.mana;
    if(pre.kinds.has('attack'))stats.endAttack++;
    if(pre.kinds.has('play')||pre.kinds.has('use'))stats.endPlay++;
    if(pre.kinds.has('power'))stats.endPower++;
    return;
  }
  if(m.kind==='attack'){
    if(pre.attacker==='MINION'&&pre.target?.type==='MINION'){
      stats.trades++;
      if(!mine.some(b=>b.id===m.id&&b.hp>0)&&theirs.some(b=>b.id===m.targetId&&b.hp>0))stats.tradeLost++;
    }
    // What this swing would have had to gain from a buff cast before it: the hand and mana it was
    // made with, and whether more Attack could have done anything (the target still stands).
    if(pre.attacker==='MINION')((memo.swings??={})[m.id]??=[]).push({hand:pre.hand,mana:pre.mana,
      short:pre.target?.type==='HERO'||theirs.some(b=>b.id===m.targetId&&b.hp>0)});
    return;
  }
  // A step that raised the Attack of minions able to swing this turn: late when one had already swung.
  const raised=pre.mine.filter(b=>b.swings&&mine.some(x=>x.id===b.id&&x.atk>b.atk));
  if(raised.length){
    stats.buffs++;
    const swung=raised.filter(b=>b.spent).flatMap(b=>memo.swings?.[b.id]??[]);
    if(raised.some(b=>b.spent)){
      stats.buffLate++;
      const could=swung.filter(x=>x.hand.get(m.id)<=x.mana);
      if(!pre.teamBuff)stats.lateOther++;
      else if(!could.length)stats.lateDrawn++;
      else if(!could.some(x=>x.short))stats.lateFree++;
      else memo.late=(memo.late??0)+1;                       // lateClear or lateWon, known when the turn is over
    }
  }
  if(m.kind==='play'&&pre.target){
    stats.aimed++;
    const now=mine.find(b=>b.id===m.targetId);
    if(pre.target.own&&(!now||hpOf(now)<pre.target.hp))stats.aimedOwn++;
  }
}

const pct=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'-';
export const report=x=>({
  'lethal missed':`${pct(x.lethalMissed,x.lethalTurns)} of ${x.lethalTurns}`,
  'buff after the swing':`${pct(x.buffLate,x.buffs)} of ${x.buffs}`,
  'buff after the swing, no excuse':`${pct(x.lateClear,x.buffs)} of ${x.buffs}`,
  'minion lost for nothing':`${pct(x.tradeLost,x.trades)} of ${x.trades}`,
  'damage at own side':`${pct(x.aimedOwn,x.aimed)} of ${x.aimed}`,
  'passed with an attack':pct(x.endAttack,x.turns),'passed with a card':pct(x.endPlay,x.turns),
  'passed without tapping':pct(x.endPower,x.turns),'mana left':x.turns?(x.manaLeft/x.turns).toFixed(2):'-'});

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [games=500,who='rush',seed=1]=process.argv.slice(2);
  const lists=[loadList('warlock-discard'),loadList('warlock-discard')],stats=blank();
  for(let g=0;g<Number(games);g++){
    const pick=({random:randomPolicy,rush:rushPolicy})[who](Number(seed)+g),memo=[{},{}];
    let s=newGame({lists,seed:Number(seed)+g});
    for(let n=0;n<5000;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const m=pick(s,legal),seat=s.seat,pre=before(s,legal,m);
      s=apply(s,m).s;
      after(stats,memo[seat],pre,s);
    }
  }
  console.log(`${who} against itself, ${games} games`);
  console.table(report(stats));
}
