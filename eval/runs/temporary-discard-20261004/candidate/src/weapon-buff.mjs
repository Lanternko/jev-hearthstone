import {combinationAdmission,admittedLines} from './combo-admission.mjs';
import {deckFor} from './deck.mjs';
import {textOf} from './mechanics.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const high=c=>/^after your hero attacks, discard your highest cost card\.?$/i.test(textOf(c));
const pureBuff=c=>/^give your minions \+1\/\+1\./i.test(textOf(c))&&!/discard/i.test(textOf(c));
const wide=c=>/^when you play or discard this, summon two random 1-cost minions\.?$/i.test(textOf(c));

// Compatibility view of the shared development search. This module makes
// the user's three-case decision; it never simulates a second board or creates
// independent executable plans. A forced first step requires the SAME proof
// that survives candidate filtering and reaches the combo menu.
export function weaponBuffAssessment(state,actions,{admission=combinationAdmission(state,actions)}={}){
 if(state.choice||deckFor(state).name!=='warlock-discard')return null;
 const hand=state.me?.hand??[],board=state.me?.board??[],mana=Number(state.me?.mana??0);
 const buff=hand.find(pureBuff),payoff=hand.find(wide);
 if(!buff||!payoff)return null;
 const equipped=board.find(c=>c.CARDTYPE==='WEAPON'&&high(c));
 const weapon=equipped??hand.find(c=>c.CARDTYPE==='WEAPON'&&high(c));
 if(!weapon)return null;
 const reserve=cost(buff),weaponCost=equipped?0:cost(weapon);
 const rest=hand.filter(c=>equipped||c.entityId!==weapon.entityId);
 const highest=Math.max(...rest.map(cost));
 const targets=rest.filter(c=>cost(c)===highest);
 const unique=targets.length===1&&targets[0].entityId===payoff.entityId;
 const paths=(admission.weaponRoutes??[]).filter(p=>p.weaponId===weapon.entityId
  &&p.steps.length===(equipped?1:2)&&p.steps[0].kind===(equipped?'attack':'play')
  &&(equipped||p.steps[0].id===weapon.entityId))
  .map(p=>({...p,firstAction:actions.find(a=>a.id===p.firstActionId)}));
 paths.sort((a,b)=>Number(b.killsTarget&&[3,4].includes(b.targetHealth))-Number(a.killsTarget&&[3,4].includes(a.targetHealth))
  ||Number(b.killsTarget)-Number(a.killsTarget)||a.targetAttack-b.targetAttack);
 const proofs=admittedLines(admission,actions);
 const safe=paths.find(p=>p.firstAction&&p.knownCombat&&p.safeContinuation&&p.knownDevelopment
  &&p.slotsAfter>=2&&proofs.some(l=>l.weaponRouteKey===p.key&&l.followup.buffId===buff.entityId
   &&l.development.sourceId===payoff.entityId&&l.development.via==='discard'));
 const canBuff=weaponCost+reserve<=mana;
 const mode=unique?(canBuff?'weapon_discard_then_buff':'compare_weapon_or_direct_buff'):'compare_other_discard_or_direct_buff';
 const preferred=mode==='weapon_discard_then_buff'&&safe&&Number(state.opponent?.secretCount??0)===0?safe.firstAction:null;
 return {version:'weapon-discard-buff-v2',evidenceVersion:admission.version,mode,weaponId:weapon.entityId,payoffId:payoff.entityId,buffId:buff.entityId,
  mana:{available:mana,weapon:weaponCost,discardTrigger:0,buff:reserve,total:weaponCost+reserve,
   directPayoffPlusBuff:cost(payoff)+reserve,directAffordable:cost(payoff)+reserve<=mana},
  discard:{uniquePayoff:unique,targets:targets.map(c=>({entityId:c.entityId,name:c.name,cost:cost(c)})),ties:targets.length>1},
  preferred,proofKey:preferred?safe.key:null,paths,compare:!preferred&&paths.some(p=>p.firstAction),
  guidance:'If a safe weapon swing uniquely discards the summon payoff and preserves buff mana, equip/swing first, observe random summons, then buff before minion attacks. If weapon leaves no buff mana, compare weapon+discard against direct payoff+buff. If another card is highest, compare its actual discard payoff and safe removal of a 3/4-Health target against direct payoff+buff. Ties are random. Equip alone never triggers the discard. Secrets and unknown combat require comparison; no forced uncertain continuation.'};
}
