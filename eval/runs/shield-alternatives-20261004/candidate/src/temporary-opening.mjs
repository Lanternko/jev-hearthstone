// User ruling, new batch game 10 T1: spend the one mana on the Temporary
// Party Fiend before committing Coin to Acolytes. This is an early-board rule,
// not "play every expiring card". Lethal is checked before this helper.
export function temporaryOpeningAction(state,actions){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current||state.me.heroClass!=='WARLOCK'
   ||Number(state.me.maxMana)>2||Number(state.me.maxMana)<1)return null;
 const mine=state.me.board??[],enemy=state.opponent?.board??[];
 if(mine.some(c=>['MINION','LOCATION'].includes(c.CARDTYPE)))return null;
 const hero=mine.find(c=>c.CARDTYPE==='HERO');
 const hp=Number(hero?.HEALTH??hero?.baseHealth)-Number(hero?.DAMAGE??0)+Number(hero?.ARMOR??0);
 const incoming=enemy.filter(c=>c.CARDTYPE==='MINION'&&!Number(c.DORMANT)).reduce((s,c)=>s+Number(c.ATK??0),0);
 if(!Number.isFinite(hp)||hp<=3+incoming)return null;
 const c=(state.me.hand??[]).find(c=>c.name==='Party Fiend'
   &&c.temporary?.expires==='end_of_own_turn'&&c.temporary.confidence>=0.9
   &&Number(c.COST??c.baseCost)<=Number(state.me.mana));
 if(!c)return null;
 const action=actions.find(a=>a.type==='POWER'&&a.entityId===c.entityId&&a.targetId==null);
 return action?{action,source:'temporary_opening_development'}:null;
}
