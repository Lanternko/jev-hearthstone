// Replays logged positions through the CURRENT descriptions and compares with what Jev
// answered at the time. Any change to describe.mjs should be run past this before a game:
// a description is only worth shipping if it moves a decision that was actually wrong.
//
// Reconstruction is deliberately conservative. decisions.jsonl stores only the chosen
// action, not the option list that was sent, so a position is replayed only when the
// mapping from option id to attacker is forced: the opponent controls no minions (every
// attack must name the hero) and we control exactly as many attack-capable minions as
// there are attack options (nobody is summoning sick). Everything else is skipped rather
// than guessed at.
import {readFile} from 'node:fs/promises';
import {ask} from './jev.mjs';
import {criteria} from './describe.mjs';
import {forcedAction} from './policy.mjs';

const strategy=await readFile(new URL('../strategy.md',import.meta.url),'utf8');
const log=(await readFile(new URL('../runtime/decisions.jsonl',import.meta.url),'utf8'))
  .trim().split('\n').map(l=>JSON.parse(l));

const rebuild=r=>{
  const p=r.answers?.move?.probabilities;
  if(!p||!r.model)return null;
  // Decisions logged after the options started being recorded need no reconstruction.
  if(r.options?.length)return {state:r.state,then:p,thenChoice:r.answers.move.choice,actions:r.options};
  const st=r.state,opp=st.opponent?.board??[];
  if(opp.some(c=>c.CARDTYPE==='MINION'))return null;
  const hero=opp.find(c=>c.CARDTYPE==='HERO');
  if(!hero)return null;
  const ids=Object.keys(p).filter(i=>i!=='o0');
  if(!ids.length||!ids.every(i=>/^o\d+t0$/.test(i)))return null;
  const mine=(st.me.board??[]).filter(c=>c.CARDTYPE==='MINION'&&(c.ATK??0)>0);
  if(mine.length!==ids.length)return null;
  const sorted=ids.sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  return {state:st,then:p,thenChoice:r.answers.move.choice,
    actions:[{id:'o0',type:'END_TURN'},
      ...sorted.map((id,i)=>({id,entityId:mine[i].entityId,targetId:hero.entityId}))]};
};

const only=process.argv[2];
const cases=log.map(rebuild).map((c,i)=>c&&{i,...c}).filter(Boolean)
  .filter(c=>only?String(c.i)===only:c.thenChoice==='o0');
console.log(`${cases.length} replayable position(s) out of ${log.length} logged decisions\n`);

for(const c of cases){
  const hero=c.state.opponent.board.find(x=>x.CARDTYPE==='HERO');
  const hp=(hero.HEALTH??0)-(hero.DAMAGE??0)+(hero.ARMOR??0);
  const dmg=c.actions.filter(a=>a.targetId).reduce((n,a)=>
    n+((c.state.me.board.find(x=>x.entityId===a.entityId)?.ATK)??0),0);
  console.log(`#${c.i} turn ${c.state.turn}: ${c.actions.length-1} free face attack(s) worth ${dmg} against ${hp} Health`);
  const kill=forcedAction(c.state,c.actions);
  if(kill){console.log(`   ${kill.source} -> ${kill.action.id} (never reaches Jev)\n`);continue}
  const out=await ask({board:c.state,strategy},{move:{type:'choice',instructions:'Select the best ONE next legal action. Use entity IDs to identify cards and targets. Do not assume opponent hidden cards or deck order. Re-evaluation follows each action.',criteria:criteria(c.state,c.actions)}});
  const now=out.answers.move.probabilities,pick=out.answers.move.choice;
  console.log(`   then P(END_TURN)=${c.then.o0}  chose ${c.thenChoice}`);
  console.log(`   now  P(END_TURN)=${now.o0}  chose ${pick}  ${pick==='o0'?'STILL ENDS THE TURN':'attacks'}\n`);
}
