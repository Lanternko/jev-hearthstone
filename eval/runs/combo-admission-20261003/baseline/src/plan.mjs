// Whole-turn plans for the arithmetic part of a turn, offered to Jev as options.
//
// Per-option scoring cannot see a sequence: "kill the Taunt with two minions, then the third goes
// face" is three options, each of which looks mediocre alone. So the attack options are taken out
// of the menu and replaced by the best few complete combat plans, each stated with its outcome.
// Cards the simulator cannot predict (choices, random damage, Discover) stay single
// options exactly as before; after one of them the turn is simply planned again from the real
// board. The search only shortlists: the heuristic below orders thousands of sequences, Jev still
// makes the call between the handful that survive, with the consequences spelled out.
import {fromState,moves,apply,signature,searchSignature,hero,hpOf,cardModel} from './sim.mjs';
import {deckFor} from './deck.mjs';
import {assessEffect,effectNote} from './effect-state.mjs';
import {OBJECTIVE_WEIGHTS} from './matchup-objective.mjs';
import {isCoin} from './power.mjs';

// A spent Battlecry has no future board value. Persistent triggers/auras do;
// this is a coarse premium, not a prediction of the opponent's unseen cards.
export function ongoingEffectValue(b){
  if(!b||b.type!=='MINION'||b.dormant)return 0;
  const e=b.effectAssessment??assessEffect(b,{zone:'PLAY'});
  return e.status==='active'?e.removalPremium*e.confidence:0;
}
const value=b=>b.type==='HERO'?0:b.atk+b.hp+(b.taunt?2:0)+(b.ds?b.atk:0)+(b.text?1:0)+ongoingEffectValue(b);
const boardValue=list=>list.reduce((n,b)=>n+value(b),0);
const threat=s=>s.opp.filter(b=>!b.dormant&&!b.frozen).reduce((n,b)=>n+b.atk,0);
const wall=s=>s.me.filter(b=>b.type==='MINION'&&b.taunt).reduce((n,b)=>n+Math.max(0,b.hp),0);

// Board trade value, face damage, and survival. Weights are coarse on purpose: this ranks, Jev decides.
export function score(start,s){
  const opp=hero(s,'opp'),me=hero(s,'me');
  if(me&&hpOf(me)<=0)return -1e4;               // before the win check: trading heroes is a draw at best
  if(opp&&hpOf(opp)<=0)return 1e4;
  const hp0=hpOf(hero(start,'opp'));
  const w=start.objective?.weights??OBJECTIVE_WEIGHTS.unknown;
  const faceW=hp0<=12?w.finishFace:w.face;
  let v=(boardValue(start.opp)-boardValue(s.opp))-(boardValue(start.me)-boardValue(s.me))+faceW*s.faceDealt;
  const coinsGone=start.hand.filter(c=>isCoin(c.raw??c)&&!s.hand.some(x=>x.id===c.id));
  const coinsPlayed=coinsGone.filter(c=>!(s.discarded??[]).some(x=>x.id===c.id)).length;
  const spent=start.mana-s.mana+(start.objective?.mode!=='unknown'&&start.objective?coinsPlayed:0);
  v-=spent*w.mana+coinsGone.length*w.coin;         // lost Coin costs a card; only played Coin gives mana
  // Coarse resource estimate only; unknown draws never become invented hand cards.
  v+=(s.drawnUnknown??0)*w.draw;
  // Fixed summon payoffs are already represented in boardValue. Do not award
  // them a second generic discard bonus, especially when the board is full.
  for(const c of s.discarded??[])v-=/if you discard this|when you (?:play or )?discard this/i.test(c.text)?0:c.cost;
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
export function search(state,actions,{beam=300,depth=12,maxNodes=24000,key=searchSignature}={}){
  if(!Number.isInteger(beam)||beam<1||!Number.isInteger(depth)||depth<1||!Number.isInteger(maxNodes)||maxNodes<1)
    throw Error('search budgets must be positive integers');
  const start=fromState(state,actions);
  let frontier=[{s:start,steps:[],open:true}];
  const done=new Map();                           // final signature -> best node
  const stats={expanded:0,generated:0,deduplicated:0,beamPruned:0,depthReached:0,nodeLimit:false,depthLimit:false};
  const keep=n=>{
    if(!n.steps.length)return;
    const k=key(n.s)+(n.open?'':'|end');
    const prev=done.get(k);
    const v=score(start,n.s);
    if(!prev||v>prev.score||v===prev.score&&n.steps.length<prev.steps.length)done.set(k,{...n,score:v});
  };
  for(let d=0;d<depth&&frontier.length;d++){
    const next=new Map();
    for(const n of frontier){
      if(!n.open)continue;
      stats.expanded++;
      for(const m of moves(n.s)){
        if(stats.generated>=maxNodes){stats.nodeLimit=true;break;}
        stats.generated++;
        const r=apply(n.s,m);
        const child={s:r.s,steps:[...n.steps,{...m,exact:r.exact,note:r.note,before:signature(n.s),after:signature(r.s)}],
          open:r.exact&&(!hero(r.s,'opp')||hpOf(hero(r.s,'opp'))>0)};
        if(hero(r.s,'me')&&hpOf(hero(r.s,'me'))<=0)continue;
        keep(child);
        if(!child.open)continue;
        const k=key(r.s),prev=next.get(k);
        if(prev)stats.deduplicated++;
        if(!prev||child.steps.length<prev.steps.length)next.set(k,child);
      }
      if(stats.nodeLimit)break;
    }
    stats.depthReached=d+1;
    stats.beamPruned+=Math.max(0,next.size-beam);
    frontier=[...next.values()].map(n=>({...n,score:score(start,n.s)})).sort((a,b)=>b.score-a.score).slice(0,beam);
    if(stats.nodeLimit)break;
  }
  stats.depthLimit=stats.depthReached>=depth&&frontier.some(n=>moves(n.s).length);
  const all=[...done.values()].sort((a,b)=>b.score-a.score);
  const clean=all.filter(n=>!wastedChip(start,n.steps));
  return {start,plans:clean.length?clean:all,stats};
}

// Top plans, kept different from each other: the best by the overall score, plus the most face
// damage and the most board value if those are not already on the list -- the race-or-control
// axis is exactly the call Jev should be making.
export function shortlist(plans,start,k=5){
  // Offer drawing as its own first-information intent below, not as an incidental
  // final step attached to a combat plan that has already committed all attacks.
  const attacksOnly=plans.filter(p=>(p.steps.some(x=>x.kind==='attack')
    ||p.s.fixedDiscard&&!p.s.uncertainDiscard)&&!p.s.drawnUnknown);
  const out=[];
  const key=m=>`${m.kind}:${m.id}:${m.targetId}`;
  // "Swing with A" next to "swing with A, then B" says nothing new: stopping early is always open.
  const prefix=(p,q)=>p.steps.length<q.steps.length&&p.steps.every((m,i)=>key(m)===key(q.steps[i]));
  const add=p=>{if(p&&!out.includes(p)&&!out.some(q=>prefix(p,q)||prefix(q,p))&&out.length<k+2)out.push(p)};
  for(const p of attacksOnly.slice(0,k))add(p);
  add([...attacksOnly].sort((a,b)=>b.s.faceDealt-a.s.faceDealt||b.score-a.score)[0]);
  const trade=p=>(boardValue(start.opp)-boardValue(p.s.opp))-(boardValue(start.me)-boardValue(p.s.me));
  add([...attacksOnly].sort((a,b)=>trade(b)-trade(a)||b.score-a.score)[0]);
  // Draw is a competing turn intent, not a prerequisite imposed on every play.
  const draw=plans.find(p=>p.steps.length===1&&p.s.drawnUnknown>0);
  if(draw&&!out.includes(draw)){
    if(out.length>=k+2)out.pop();
    out.push(draw);
  }
  return out;
}

const who=(s,id)=>[...s.me,...s.opp].find(b=>b.id===id);

// Jev must not choose a strictly more expensive version of the same trade. Compare only
// matching enemy results, triggers, hero health and hand. A one-for-one survivor swap is
// comparable only for bodies with keywords or already-spent Battlecries/Dormant text.
const plainSurvivor=b=>!!b&&!b.text.replace(/battlecry:[^.]*(?:\.|$)/ig,'')
  .replace(/dormant for \d+ turns?\.?/ig,'')
  .replace(/\b(?:taunt|rush|charge|divine shield|windfury|stealth|poisonous|lifesteal|elusive)\b/ig,'')
  .replace(/[\s.,]/g,'');
const remainingAttacks=b=>b.canAttack&&!b.frozen&&!b.dormant?Math.max(0,b.maxAttacks-b.attacks):0;
const combatKey=b=>[b.id,b.atk,b.hp,b.maxHp,b.armor,b.taunt,b.ds,b.stealth,b.poison,b.lifesteal,
  b.windfury,b.rush,b.ignoreTaunt,b.dormant,b.immune,b.frozen,b.attacks,b.maxAttacks,b.canAttack,b.rushOnly];
// Game 137 turn 4: killing the 2/3 Mana Wyrm and killing the 2/3 Informant
// leave identical friendly boards. Don't offer the inferior target as another intent.
// Only compare exact outcomes with a single equivalent survivor swapped; triggers,
// Deathrattles, different stats/keywords, resources and lethal remain separate choices.
export function ongoingTradePlans(start,plans){
  const own=p=>JSON.stringify([p.s.me,p.s.hand,p.s.mana,p.s.weapon,p.s.locations,
    p.s.discarded,p.s.drawnUnknown,p.s.faceDealt]);
  const sameBody=(a,b)=>JSON.stringify(combatKey(a).slice(1))===JSON.stringify(combatKey(b).slice(1));
  return plans.filter(p=>!plans.some(q=>{
    if(p===q||q.score<=p.score||!p.steps.every(m=>m.exact)||!q.steps.every(m=>m.exact)||own(p)!==own(q))return false;
    const left=p.s.opp.filter(a=>!q.s.opp.some(b=>b.id===a.id));
    const right=q.s.opp.filter(b=>!p.s.opp.some(a=>a.id===b.id));
    if(left.length!==1||right.length!==1)return false;
    const a=left[0],b=right[0];
    const eb=b.effectAssessment??assessEffect(b,{zone:'PLAY'});
    if(!ongoingEffectValue(a)||eb.confidence<0.8||!['inactive','none'].includes(eb.status)||!plainSurvivor(b)||!sameBody(a,b))return false;
    if(!sameBody(who(start,a.id),who(start,b.id)))return false;
    return p.s.opp.filter(x=>x.id!==a.id).every(x=>{
      const y=q.s.opp.find(y=>y.id===x.id);return y&&JSON.stringify(combatKey(x))===JSON.stringify(combatKey(y));
    });
  }));
}
const tradeOutcome=p=>{
 const s=p.s,h=hero(s,'me');
 const hkey=h?combatKey({...h,atk:remainingAttacks(h)?h.atk:0}):null;
 return JSON.stringify([s.opp.map(combatKey).sort((a,b)=>a[0]-b[0]),hkey,s.weapon,s.locations,
   s.hand.map(c=>[c.id,c.cost]),s.discarded??[],s.faceDealt,
   p.steps.filter(m=>!m.exact).map(m=>m.note)]);
};
export function efficientTradePlans(start,plans){
 const keys=new Map(plans.map(p=>[p,tradeOutcome(p)]));
 return plans.filter(p=>!plans.some(q=>{
  if(p===q||q.score<=p.score||q.s.mana<p.s.mana||keys.get(p)!==keys.get(q))return false;
  const weaker=p.s.me.filter(b=>b.type==='MINION'),stronger=q.s.me.filter(b=>b.type==='MINION');
  if(weaker.length!==stronger.length)return false;
  for(const a of weaker){
   const b=stronger.find(b=>b.id===a.id);
   if(b&&JSON.stringify(combatKey(a))!==JSON.stringify(combatKey(b)))return false;
  }
  const lost=weaker.filter(a=>!stronger.some(b=>b.id===a.id));
  const gained=stronger.filter(b=>!weaker.some(a=>a.id===b.id));
  if(!lost.length&&!gained.length)return true; // Same board and more unspent mana.
  if(lost.length!==1||gained.length!==1)return false;
  const a=lost[0],b=gained[0];
  if(![a,b,who(start,a.id),who(start,b.id)].every(plainSurvivor))return false;
  if(b.atk<a.atk||b.hp<a.hp||b.maxHp<a.maxHp||remainingAttacks(b)<remainingAttacks(a))return false;
  if(b.frozen&&!a.frozen||b.dormant&&!a.dormant||b.rushOnly&&!a.rushOnly)return false;
  if(/elusive/i.test(a.text)&&!/elusive/i.test(b.text))return false;
  return ['taunt','ds','stealth','poison','lifesteal','windfury','rush','ignoreTaunt','immune']
    .every(k=>!a[k]||b[k]);
 }));
}
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
    }else if(m.kind==='power'){
      lines.push(`${i+1}) Use ${s.power.name} (${s.power.cost} mana): `+(s.power.draw
        ?`draw ${s.power.draw} unknown card(s), take ${s.power.selfHit} damage.`
        :`your hero gains ${s.power.gain} Attack this turn.`));
    }else{
      const c=hand(s,m.id),model=cardModel(c);
      const extra=model.summon?`, summoning ${model.summon.n} ${model.summon.atk}/${model.summon.hp}`+(model.selfHit?` and dealing ${model.selfHit} damage to your hero`:'')
        :model.selfHit?`, dealing ${model.selfHit} damage to your hero`:'';
      // The planner only sequences minions it can model. Any other minion that fits in the mana
      // left would also be buffed if played first; say so rather than let the order hide it.
      const before=model.kind==='buff'?s.hand.filter(x=>x.id!==c.id&&x.type==='MINION'&&x.playable&&x.cost+c.cost<=s.mana):[];
      lines.push(`${i+1}) Play ${c.name} (${c.cost} mana)`+(model.kind==='buff'?`: your minions get +${model.atk}/+${model.hp}`
        :model.kind==='draw'?`: draw ${model.n} unknown card(s)`
        :model.kind==='weapon'?`: equip ${c.atk} Attack; your hero has ${hero(r.s,'me')?.atk??0} Attack`:` as a ${c.atk}/${c.hp}${extra}`)
        +(before.length?` (the buff misses any minion played after it; still affordable before it: ${before.map(x=>`${x.name} (${x.cost})`).join(', ')})`:'')
        +((r.s.discarded?.length??0)>(s.discarded?.length??0)?`, discarding ${r.s.discarded.at(-1).name}`:'')+'.');
    }
    if(!m.exact)lines.push(`   After this step the result is not predictable (${m.note}), so the turn is re-planned from the real board.`);
    else if(m.note)lines.push(`   ${m.note}.`);
    if(r.s.drawnUnknown>(s.drawnUnknown??0)){
      const buffs=r.s.hand.filter(c=>cardModel(c)?.kind==='buff'&&c.cost<=r.s.mana);
      lines.push(`Drawing is optional: choose this intent only if the draw is worth its mana and Health. If this turn includes both drawing and these affordable buffs (${buffs.map(c=>c.name).join(', ')||'none'}), draw before committing their targets/attacks, then re-evaluate with ${r.s.mana} mana left. Do not assume any card you will draw or execute a continuation across this information boundary.`);
    }
    s=r.s;
  }
  const oppH0=hero(start,'opp'),oppH=hero(s,'opp'),me=hero(s,'me');
  const killed=start.opp.filter(b=>b.type==='MINION'&&!s.opp.some(x=>x.id===b.id));
  const lost=start.me.filter(b=>b.type==='MINION'&&!s.me.some(x=>x.id===b.id));
  const unused=s.me.filter(b=>b.canAttack&&b.hp>0&&b.atk>0&&b.attacks<b.maxAttacks);
  const out=[`Plan of ${plan.steps.length} step(s), carried out in this order:`,...lines,
    `${!plan.steps.every(m=>m.exact)?'Known partial result; unmodelled effects remain':'Result'}: enemy hero ${hpOf(oppH0)} -> ${hpOf(oppH)} Health`+(hpOf(oppH)<=0?' (dead in the model)':'')+'.',
    `Enemy minions killed: ${killed.length?killed.map(b=>`${b.name} (${b.atk} Attack)`).join(', '):'none'}.`,
    `Persistent enemy effects removed: ${killed.filter(b=>ongoingEffectValue(b)).map(effectNote).join('; ')||'none'}. Persistent enemy effects remaining: ${s.opp.filter(b=>ongoingEffectValue(b)).map(effectNote).join('; ')||'none'}.`,
    `Effect evidence for killed targets: ${killed.map(effectNote).join('; ')||'none'}. Unknown remaining effects (not assumed blank): ${s.opp.filter(b=>b.type==='MINION'&&(b.effectAssessment??assessEffect(b)).status==='unknown').map(effectNote).join('; ')||'none'}.`,
    `Your minions lost: ${lost.length?lost.map(b=>b.name).join(', '):'none'}.`,
    `Their board can then attack for ${threat(s)} next turn, against your ${hpOf(me)} Health`+(wall(s)?` behind ${wall(s)} Health of Taunt`:'')+`; before this plan it was ${threat(start)}.`,
    unused.length?`Still able to attack afterwards: ${unused.map(b=>b.type==='HERO'?'your hero':b.name).join(', ')}.`:'No attacker is left unused.',
    `Cards and mana not used by this plan stay available afterwards (${s.mana} mana left).`];
  return out.join(' ');
}

// The menu Jev sees: the non-attack options unchanged, attack options replaced by plans.
// Returns {criteria, plans}. plans maps a menu id to the steps it stands for.
export function menu(state,actions,base){
  const {start,plans,stats}=search(state,actions);
  // Two Zealots, or two copies of Whispers in hand, make plans that differ only in entity ids.
  // To Jev they read identically, so only the first of each wording survives.
  const seen=new Set();
  const distinct=plans.filter(p=>{const t=narrate(start,p);if(seen.has(t))return false;seen.add(t);p.text=t;return true});
  const shortlisted=shortlist(ongoingTradePlans(start,distinct),start);
  const picked=deckFor(state).name==='dh-void'?efficientTradePlans(start,shortlisted):shortlisted;
  // A forced lethal must have a wholly exact proof. An optimistic terminal
  // state following an unmodelled trigger is never automatically executed.
  const lethal=plans.find(p=>p.score>=1e4&&p.steps.every(m=>m.exact))?.steps??null;
  if(!picked.length)return {criteria:base,plans:{},lethal,stats};
  const isAttack=a=>a.targetId!=null&&(state.me.board??[]).some(c=>c.entityId===a.entityId&&['MINION','HERO'].includes(c.CARDTYPE));
  const criteria=Object.fromEntries(Object.entries(base).filter(([id])=>!isAttack(actions.find(a=>a.id===id))));
  const map={};
  picked.forEach((p,i)=>{
    const id=`p${i+1}`;
    map[id]=p.steps;
    criteria[id]={id,type:'PLAN',description:p.text};
  });
  return {criteria,plans:map,lethal,stats};
}

// The live option that carries out one planned step, or null if the game no longer offers it.
export const actionFor=(actions,step)=>actions.find(a=>a.entityId===step.id
  &&(step.kind==='attack'?a.targetId===step.targetId:a.targetId==null));

