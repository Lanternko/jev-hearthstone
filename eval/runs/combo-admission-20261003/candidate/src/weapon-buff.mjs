import {fromState,moves,apply,hero,hpOf,signature} from './sim.mjs';
import {deckFor} from './deck.mjs';
import {textOf} from './mechanics.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const high=c=>/^after your hero attacks, discard your highest cost card\.?$/i.test(textOf(c));
const pureBuff=c=>/^give your minions \+1\/\+1\./i.test(textOf(c))&&!/discard/i.test(textOf(c));
const wide=c=>/^when you play or discard this, summon two random 1-cost minions\.?$/i.test(textOf(c));

// Simulate equip/combat only; never invent the random summoned identities.
export function weaponBuffAssessment(state,actions){
 if(state.choice||deckFor(state).name!=='warlock-discard')return null;
 const hand=state.me?.hand??[],board=state.me?.board??[],mana=Number(state.me?.mana??0);
 const buff=hand.find(pureBuff),payoff=hand.find(wide);
 if(!buff||!payoff)return null;
 const equipped=board.find(c=>c.CARDTYPE==='WEAPON'&&high(c));
 const weapon=equipped??hand.find(c=>c.CARDTYPE==='WEAPON'&&high(c));
 if(!weapon)return null;
 const equip=equipped?null:actions.find(a=>a.entityId===weapon.entityId&&a.targetId==null);
 const reserve=cost(buff),weaponCost=equipped?0:cost(weapon);
 const rest=hand.filter(c=>equipped||c.entityId!==weapon.entityId);
 const highest=Math.max(...rest.map(cost));
 const targets=rest.filter(c=>cost(c)===highest);
 const unique=targets.length===1&&targets[0].entityId===payoff.entityId;
 const start=fromState(state,actions),paths=[];
 if(equipped||equip){
  const first=equipped?null:{kind:'play',id:weapon.entityId};
  const played=first?apply(start,first):{s:start,exact:true,note:''};
  if(played.exact){
   const h=hero(played.s,'me');
   for(const attack of moves(played.s).filter(m=>m.kind==='attack'&&m.id===h?.id)){
    const target=played.s.opp.find(c=>c.id===attack.targetId),hit=apply(played.s,attack);
    if(hpOf(hero(hit.s,'me'))<=0)continue;
    // Check combat independently of the discard's expected random boundary.
    // Diagnostic wording may change as the discard simulator gains models.
    const combat=apply({...played.s,weapon:played.s.weapon&&{...played.s.weapon,text:''}},attack);
    const slots=7-hit.s.me.filter(c=>c.type==='MINION').length-hit.s.locations,steps=[];
    const incoming=hit.s.opp.filter(c=>c.type==='MINION'&&!c.dormant&&!c.frozen).reduce((n,c)=>n+c.atk,0);
    const walls=hit.s.me.filter(c=>c.type==='MINION'&&c.taunt&&!c.dormant).reduce((n,c)=>n+c.hp,0);
    if(first)steps.push({...first,exact:played.exact,before:signature(start),after:signature(played.s),note:played.note});
    steps.push({...attack,exact:hit.exact,before:signature(played.s),after:signature(hit.s),note:hit.note});
    paths.push({firstAction:equipped?actions.find(a=>a.entityId===attack.id&&a.targetId===attack.targetId):equip,
     targetId:attack.targetId,targetName:target?.name,targetHealth:target?.hp,targetAttack:target?.atk,
     killsTarget:target?.type==='MINION'&&!hit.s.opp.some(c=>c.id===target.id),heroHealthAfter:hpOf(hero(hit.s,'me')),
     slotsAfter:slots,knownCombat:combat.exact,safeContinuation:hpOf(hero(hit.s,'me'))+walls>incoming,steps});
   }
  }
 }
 paths.sort((a,b)=>Number(b.killsTarget&&[3,4].includes(b.targetHealth))-Number(a.killsTarget&&[3,4].includes(a.targetHealth))
  ||Number(b.killsTarget)-Number(a.killsTarget)||a.targetAttack-b.targetAttack);
 const safe=paths.find(p=>p.firstAction&&p.knownCombat&&p.safeContinuation&&p.slotsAfter>=2);
 const canBuff=weaponCost+reserve<=mana;
 const mode=unique?(canBuff?'weapon_discard_then_buff':'compare_weapon_or_direct_buff'):'compare_other_discard_or_direct_buff';
 const preferred=mode==='weapon_discard_then_buff'&&safe&&Number(state.opponent?.secretCount??0)===0?safe.firstAction:null;
 return {version:'weapon-discard-buff-v1',mode,weaponId:weapon.entityId,payoffId:payoff.entityId,buffId:buff.entityId,
  mana:{available:mana,weapon:weaponCost,discardTrigger:0,buff:reserve,total:weaponCost+reserve,
   directPayoffPlusBuff:cost(payoff)+reserve,directAffordable:cost(payoff)+reserve<=mana},
  discard:{uniquePayoff:unique,targets:targets.map(c=>({entityId:c.entityId,name:c.name,cost:cost(c)})),ties:targets.length>1},
  preferred,paths,compare:!preferred&&paths.some(p=>p.firstAction),
  guidance:'If a safe weapon swing uniquely discards the summon payoff and preserves buff mana, equip/swing first, observe random summons, then buff before minion attacks. If weapon leaves no buff mana, compare weapon+discard against direct payoff+buff. If another card is highest, compare its actual discard payoff and safe removal of a 3/4-Health target against direct payoff+buff. Ties are random. Equip alone never triggers the discard. Secrets and unknown combat require comparison; no forced uncertain continuation.'};
}
