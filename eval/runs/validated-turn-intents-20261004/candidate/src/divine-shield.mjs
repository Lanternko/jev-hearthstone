import {textOf,tagOn} from './mechanics.mjs';
import {fromState,cardModel} from './sim.mjs';
const atk=c=>Number(c?.ATK??c?.baseAttack??0);
const hp=c=>Number(c?.HEALTH??c?.baseHealth??0)-Number(c?.DAMAGE??0);
// Alternatives, not a blanket cheapest-attacker mandate. Poison, survival,
// Deathrattles and active engines can change the value of the complete trade.
export function divineShieldAssessment(state,actions=[]){
 if(state.choice)return [];
 const board=state.me?.board??[],hand=state.me?.hand??[],mana=Number(state.me?.mana??0);
 return (state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&hp(c)>0&&tagOn(c,'DIVINE_SHIELD')).map(target=>{
  const candidates=actions.flatMap(a=>{
   const c=board.find(c=>c.entityId===a.entityId&&c.CARDTYPE==='MINION');
   if(!c||a.targetId!==target.entityId||hp(c)<=0||atk(c)<=0||tagOn(c,'FROZEN')||tagOn(c,'DORMANT')||tagOn(c,'EXHAUSTED'))return [];
   return [{actionId:a.id,entityId:c.entityId,name:c.name,attack:atk(c),health:hp(c),
    survivesRetaliation:tagOn(c,'DIVINE_SHIELD')||tagOn(c,'IMMUNE')||hp(c)>atk(target),
    deathrattle:/\bDeathrattle:/i.test(textOf(c)),text:textOf(c)}];
  }).sort((a,b)=>a.attack-b.attack||Number(b.survivesRetaliation)-Number(a.survivesRetaliation));
  const low=candidates.length?Math.min(...candidates.map(c=>c.attack)):null;
  const packets=actions.flatMap(a=>{
   const c=hand.find(c=>c.entityId===a.entityId);
   const m=/^When you play or discard this, deal (\d+) damage randomly split among all enemies\.?$/i.exec(textOf(c));
   if(!c||c.CARDTYPE!=='SPELL'||a.targetId!=null||!m||Number(c.COST??c.baseCost??0)>mana)return [];
   return [{actionId:a.id,entityId:c.entityId,name:c.name,cost:Number(c.COST??c.baseCost??0),damageBudget:Number(m[1]),
    eligibleEnemies:(state.opponent?.board??[]).filter(c=>['HERO','MINION'].includes(c.CARDTYPE)&&hp(c)>0&&!tagOn(c,'DORMANT')).length,
    shieldBreakGuaranteed:false,observeAfter:true}];
  });
  return {version:'divine-shield-v1',targetId:target.entityId,targetName:target.name,targetAttack:atk(target),targetHealth:hp(target),
   candidates,lowAttackIds:candidates.filter(c=>c.attack===low).map(c=>c.actionId),packets,
   guidance:'Compare random damage then observe, or a low-Attack legal minion to break the shield before committing high-Attack bodies. Shield absorption wastes the whole positive hit, not only one damage. Retaliation, survival, Deathrattles, Poisonous, lost engines, mana and the complete follow-up matter; lowest Attack is not automatically best. Unknown Deathrattle stops the plan after the pop; do not invent its summon stats. Random split damage does not guarantee a hit on this target.'};
 });
}

// A narrow resource-order ruling: a expendable <=1-Attack body can pop a
// single ordinary shielded Taunt while preserving the mana for an observed
// Rush finisher. Only the pop is executed; unknown deathrattles are observed.
export function preferredShieldSetup(state,actions=[]){
 if(state.choice||Number(state.opponent?.secretCount??0)>0)return null;
 const foes=(state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&hp(c)>0&&!tagOn(c,'DORMANT'));
 if(foes.length!==1)return null;
 const t=foes[0];
 if(!tagOn(t,'TAUNT')||!tagOn(t,'DIVINE_SHIELD')||['POISONOUS','LIFESTEAL','REBORN','IMMUNE'].some(k=>tagOn(t,k)))return null;
 if(/\b(?:after|whenever|deathrattle|at the|frenzy|overkill|honorable kill)\b/i.test(textOf(t)))return null;
 // Keyword-only body plus an already spent Battlecry. A future combat engine
 // or Deathrattle must not be erased in order to prove this setup.
 const remaining=textOf(t).replace(/Battlecry:.*$/i,'').replace(/\b(Taunt|Divine Shield)\b/gi,'').replace(/[,.\s]/g,'');
 if(remaining)return null;
 const hero=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
 if(!hero||hp(hero)+Number(hero.ARMOR??0)<=atk(t))return null;
 const assessment=divineShieldAssessment(state,actions)[0];
 const low=assessment?.candidates.find(c=>c.attack<=1&&c.health<=atk(t)&&
  (()=>{const b=state.me.board.find(b=>b.entityId===c.entityId);return !['POISONOUS','LIFESTEAL','DIVINE_SHIELD','IMMUNE'].some(k=>tagOn(b,k))&&
   (!textOf(b)||/^Deathrattle: Summon (?:a|an|one|two|three|\d+) (?:\d+|\{0\})\/(?:\d+|\{1\}) [^.]+\.(?: \(Gains \+\d+\/\+\d+ at the start of your turns!\))?$/i.test(textOf(b)));})());
 if(!low)return null;
 const view=fromState(state,actions),finisher=view.hand.find(c=>c.type==='MINION'&&c.hp>0&&!tagOn(c.raw,'SILENCED')
  &&(tagOn(c.raw,'RUSH')||/\bRush\b/i.test(c.text))&&c.atk>=hp(t)&&c.cost<=view.mana
  &&cardModel(c)?.kind==='minion'&&actions.some(a=>a.entityId===c.id&&a.targetId==null))
  ??view.me.find(c=>c.type==='MINION'&&c.atk>=hp(t)&&cardModel(c)?.kind==='minion'
   &&actions.some(a=>a.entityId===c.id&&a.targetId===t.entityId));
 if(!finisher||state.me.board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length>=7)return null;
 return {action:actions.find(a=>a.id===low.actionId),source:'shield_setup',
  evidence:{targetId:t.entityId,popperId:low.entityId,finisherId:finisher.id,reserveMana:finisher.cost??0,
   executeOnlyPop:true,guidance:'Pop with the expendable low-Attack body first, preserving attacking bodies and the affordable Rush finisher. Observe its Deathrattle and legal board before choosing the finisher; do not assume summoned stats or queue the follow-up.'}};
}
