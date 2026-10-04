import {textOf,tagOn} from './mechanics.mjs';
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
