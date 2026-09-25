// Whole-turn plans for the arithmetic part of a turn, offered to Jev as options.
//
// Per-option scoring cannot see a sequence: "kill the Taunt with two minions, then the third goes
// face" is three options, each of which looks mediocre alone. So the attack options are taken out
// of the menu and replaced by the best few complete combat plans, each stated with its outcome.
// Cards the simulator cannot predict (discard outlets, random damage, Discover) stay single
// options exactly as before; after one of them the turn is simply planned again from the real
// board. The search only shortlists: the heuristic below orders thousands of sequences, Jev still
// makes the call between the handful that survive, with the consequences spelled out.
import {fromState,moves,apply,signature,hero,hpOf,cardModel} from './sim.mjs';

const value=b=>b.type==='HERO'?0:b.atk+b.hp+(b.taunt?2:0)+(b.ds?b.atk:0)+(b.text?1:0);
const boardValue=list=>list.reduce((n,b)=>n+value(b),0);
const threat=s=>s.opp.filter(b=>!b.dormant&&!b.frozen).reduce((n,b)=>n+b.atk,0);
const wall=s=>s.me.filter(b=>b.type==='MINION'&&b.taunt).reduce((n,b)=>n+Math.max(0,b.hp),0);

// Board trade value, face damage, and survival. Weights are coarse on purpose: this ranks, Jev decides.
export function score(start,s){
  const opp=hero(s,'opp'),me=hero(s,'me');
  if(me&&hpOf(me)<=0)return -1e4;               // before the win check: trading heroes is a draw at best
  if(opp&&hpOf(opp)<=0)return 1e4;
  const hp0=hpOf(hero(start,'opp'));
  const faceW=hp0<=12?1.3:0.6;
  let v=(boardValue(start.opp)-boardValue(s.opp))-(boardValue(start.me)-boardValue(s.me))+faceW*s.faceDealt;
  const spent=start.mana-s.mana;
  v-=spent*0.5;                                  // a card from hand is not free
  for(const c of s.discarded??[])v-=/if you discard this|when you (?:play or )?discard this/i.test(c.text)?-2:c.cost;
  // Health is a resource while it is plentiful: a weapon soaking a big minion's hit keeps our
  // board, and the board is what wins. Low, every point counts as much as a minion's.
  const hurt=hpOf(hero(start,'me'))-hpOf(me);
  if(me&&hurt>0)v-=hurt*(hpOf(me)>15?0.1:1);
  // Leaving their lethal on the board when this plan could have prevented it.
  if(me&&threat(s)>=hpOf(me)+wall(s))v-=50;
  return v;
}

// User ruling (2026-09-26, game 13, turn 4): Platysaur 2/2 hit a Risen Footman 1/3 and left it at
// 1/1, then Walking Dead 3/3 finished it -- Walking Dead alone kills it, so Platysaur's swing was
// thrown away. A plan that chips a minion and later kills it with an attacker that would have
// killed it unaided has a wasted step; the same plan without the chip is always also searched.
export function wastedChip(start,steps){
  let s=start;const chipped=new Map();          // target id -> Health before the first chip
  for(const m of steps){
    const r=apply(s,m);
    if(m.kind==='attack'){
      const t0=who(s,m.targetId),t1=who(r.s,m.targetId),a0=who(s,m.id);
      if(t0?.type==='MINION'){
        const dead=!t1||t1.hp<=0;
        if(dead&&chipped.has(m.targetId)&&a0&&a0.atk>=chipped.get(m.targetId))return true;
        if(!dead&&!t0.ds&&!chipped.has(m.targetId))chipped.set(m.targetId,t0.hp);
      }
    }
    s=r.s;
  }
  return false;
}

// Beam search over exact steps. A node whose last step was inexact is terminal: the plan ends
// there and the turn is re-planned from what really happened.
export function search(state,actions,{beam=300,depth=12}={}){
  const start=fromState(state,actions);
  let frontier=[{s:start,steps:[],open:true}];
  const done=new Map();                           // final signature -> best node
  const keep=n=>{
    if(!n.steps.length)return;
    const k=signature(n.s)+(n.open?'':'|end');
    const prev=done.get(k);
    if(!prev||n.steps.length<prev.steps.length)done.set(k,{...n,score:score(start,n.s)});
  };
  for(let d=0;d<depth&&frontier.length;d++){
    const next=new Map();
    for(const n of frontier){
      if(!n.open)continue;
      for(const m of moves(n.s)){
        const r=apply(n.s,m);
        const child={s:r.s,steps:[...n.steps,{...m,exact:r.exact,note:r.note,before:signature(n.s),after:signature(r.s)}],open:r.exact};
        keep(child);
        if(!child.open)continue;
        const k=signature(r.s);
        if(!next.has(k))next.set(k,child);
      }
    }
    frontier=[...next.values()].map(n=>({...n,score:score(start,n.s)})).sort((a,b)=>b.score-a.score).slice(0,beam);
  }
  const all=[...done.values()].sort((a,b)=>b.score-a.score);
  const clean=all.filter(n=>!wastedChip(start,n.steps));
  return {start,plans:clean.length?clean:all};
}

// Top plans, kept different from each other: the best by the overall score, plus the most face
// damage and the most board value if those are not already on the list -- the race-or-control
// axis is exactly the call Jev should be making.
export function shortlist(plans,start,k=5){
  const attacksOnly=plans.filter(p=>p.steps.some(x=>x.kind==='attack'));
  const out=[];
  const key=m=>`${m.kind}:${m.id}:${m.targetId}`;
  // "Swing with A" next to "swing with A, then B" says nothing new: stopping early is always open.
  const prefix=(p,q)=>p.steps.length<q.steps.length&&p.steps.every((m,i)=>key(m)===key(q.steps[i]));
  const add=p=>{if(p&&!out.includes(p)&&!out.some(q=>prefix(p,q)||prefix(q,p))&&out.length<k+2)out.push(p)};
  for(const p of attacksOnly.slice(0,k))add(p);
  add([...attacksOnly].sort((a,b)=>b.s.faceDealt-a.s.faceDealt||b.score-a.score)[0]);
  const trade=p=>(boardValue(start.opp)-boardValue(p.s.opp))-(boardValue(start.me)-boardValue(p.s.me));
  add([...attacksOnly].sort((a,b)=>trade(b)-trade(a)||b.score-a.score)[0]);
  return out;
}

const who=(s,id)=>[...s.me,...s.opp].find(b=>b.id===id);
const hand=(s,id)=>s.hand.find(c=>c.id===id);
const st=b=>b.type==='HERO'?`${hpOf(b)} Health`:`${b.atk}/${b.hp}`;

// The plan in words: each step with what it does, then where the turn ends up.
export function narrate(start,plan){
  let s=start;const lines=[];
  for(const [i,m] of plan.steps.entries()){
    const r=apply(s,m);
    if(m.kind==='attack'){
      const a0=who(s,m.id),t0=who(s,m.targetId),a1=who(r.s,m.id),t1=who(r.s,m.targetId);
      const tName=t0.type==='HERO'?'the enemy hero':`${t0.name} ${st(t0)}`;
      const res=t0.type==='HERO'?`${hpOf(t0)-hpOf(t1)} damage, leaving ${hpOf(t1)}`
        :!t1?`${t0.name} dies`:t1.ds!==t0.ds?`its Divine Shield pops`:`it survives at ${st(t1)}`;
      const back=t0.type==='HERO'?'':!a1?`; your ${a0.name} dies`:a1.hp<a0.hp?`; your ${a0.name} survives at ${st(a1)}`:'';
      lines.push(`${i+1}) ${a0.type==='HERO'?'Your hero':a0.name} ${st(a0)} attacks ${tName}: ${res}${back}.`);
    }else{
      const c=hand(s,m.id),model=cardModel(c);
      const extra=model.summon?`, summoning ${model.summon.n} ${model.summon.atk}/${model.summon.hp}`+(model.selfHit?` and dealing ${model.selfHit} damage to your hero`:'')
        :model.selfHit?`, dealing ${model.selfHit} damage to your hero`:'';
      // The planner only sequences minions it can model. Any other minion that fits in the mana
      // left would also be buffed if played first; say so rather than let the order hide it.
      const before=model.kind==='buff'?s.hand.filter(x=>x.id!==c.id&&x.type==='MINION'&&x.playable&&x.cost+c.cost<=s.mana):[];
      lines.push(`${i+1}) Play ${c.name} (${c.cost} mana)`+(model.kind==='buff'?`: your minions get +${model.atk}/+${model.hp}`:` as a ${c.atk}/${c.hp}${extra}`)
        +(before.length?` (the buff misses any minion played after it; still affordable before it: ${before.map(x=>`${x.name} (${x.cost})`).join(', ')})`:'')
        +((r.s.discarded?.length??0)>(s.discarded?.length??0)?`, discarding ${r.s.discarded.at(-1).name}`:'')+'.');
    }
    if(!m.exact)lines.push(`   After this step the result is not predictable (${m.note}), so the turn is re-planned from the real board.`);
    s=r.s;
  }
  const oppH0=hero(start,'opp'),oppH=hero(s,'opp'),me=hero(s,'me');
  const killed=start.opp.filter(b=>b.type==='MINION'&&!s.opp.some(x=>x.id===b.id));
  const lost=start.me.filter(b=>b.type==='MINION'&&!s.me.some(x=>x.id===b.id));
  const unused=s.me.filter(b=>b.canAttack&&b.hp>0&&b.atk>0&&b.attacks<b.maxAttacks);
  const out=[`Plan of ${plan.steps.length} step(s), carried out in this order:`,...lines,
    `Result: enemy hero ${hpOf(oppH0)} -> ${hpOf(oppH)} Health`+(hpOf(oppH)<=0?' (dead: this wins the game)':'')+'.',
    `Enemy minions killed: ${killed.length?killed.map(b=>`${b.name} (${b.atk} Attack)`).join(', '):'none'}.`,
    `Your minions lost: ${lost.length?lost.map(b=>b.name).join(', '):'none'}.`,
    `Their board can then attack for ${threat(s)} next turn, against your ${hpOf(me)} Health`+(wall(s)?` behind ${wall(s)} Health of Taunt`:'')+`; before this plan it was ${threat(start)}.`,
    unused.length?`Still able to attack afterwards: ${unused.map(b=>b.type==='HERO'?'your hero':b.name).join(', ')}.`:'No attacker is left unused.',
    `Cards and mana not used by this plan stay available afterwards (${s.mana} mana left).`];
  return out.join(' ');
}

// The menu Jev sees: the non-attack options unchanged, attack options replaced by plans.
// Returns {criteria, plans}. plans maps a menu id to the steps it stands for.
export function menu(state,actions,base){
  const {start,plans}=search(state,actions);
  // Two Zealots, or two copies of Whispers in hand, make plans that differ only in entity ids.
  // To Jev they read identically, so only the first of each wording survives.
  const seen=new Set();
  const distinct=plans.filter(p=>{const t=narrate(start,p);if(seen.has(t))return false;seen.add(t);p.text=t;return true});
  const picked=shortlist(distinct,start);
  // score() returns 1e4 only when the enemy hero ends at 0 or below. Every step but the last is
  // exact by construction, and the last one's damage lands before any trigger it sets off.
  const lethal=plans[0]?.score>=1e4?plans[0].steps:null;
  if(!picked.length)return {criteria:base,plans:{},lethal};
  const isAttack=a=>a.targetId!=null&&(state.me.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE));
  const criteria=Object.fromEntries(Object.entries(base).filter(([id])=>!isAttack(actions.find(a=>a.id===id))));
  const map={};
  picked.forEach((p,i)=>{
    const id=`p${i+1}`;
    map[id]=p.steps;
    criteria[id]={id,type:'PLAN',description:p.text};
  });
  return {criteria,plans:map,lethal};
}

// The live option that carries out one planned step, or null if the game no longer offers it.
export const actionFor=(actions,step)=>actions.find(a=>a.entityId===step.id
  &&(step.kind==='attack'?a.targetId===step.targetId:a.targetId==null));

