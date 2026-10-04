import {drawImpact} from './draw-risk.mjs';
import {textOf,immediateDraws} from './mechanics.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const active=c=>c.CARDTYPE==='MINION'&&c.DORMANT!==1&&c.DORMANT!=='1';

// User rulings, game 179 turns 1/3. Acquire information before an irreversible
// mana/discard commitment only when its visible costs preserve the intended play.
export function warlockInformationAction(state,actions){
 if(state.choice||state.status!=='RUNNING'||!state.me?.current||state.me.heroClass!=='WARLOCK')return null;
 const hand=state.me.hand??[],board=state.me.board??[],mana=Number(state.me.mana??0);
 const card=id=>hand.find(c=>c.entityId===id);
 const free=actions.find(a=>{
  const c=card(a.entityId);
  return a.targetId==null&&c&&cost(c)===0&&/discover another card from your deck/i.test(textOf(c))
   &&/temporary/i.test(textOf(c))&&Number(state.me.deckCount)>0&&hand.length<10;
 });
 if(free)return {action:free,source:'free_discover_first'};

 const whispers=actions.find(a=>{
  const c=card(a.entityId);
  if(!c||!/discard your lowest cost card/i.test(textOf(c))||!/give your minions \+1\/\+1/i.test(textOf(c)))return false;
  const rest=hand.filter(x=>x.entityId!==c.entityId),low=Math.min(...rest.map(cost));
  const lost=rest.filter(x=>cost(x)===low);
  return board.filter(active).length>=2&&lost.length>0&&lost.every(x=>x.CARDTYPE==='WEAPON');
 });
 if(!whispers)return null;
 const power=board.find(c=>c.CARDTYPE==='HERO_POWER'&&immediateDraws(c)===1);
 const tap=power&&actions.find(a=>a.entityId===power.entityId&&a.targetId==null);
 if(!tap||mana<cost(power)+cost(card(whispers.entityId)))return null;
 const risk=drawImpact(state,1),hero=board.find(c=>c.CARDTYPE==='HERO');
 const hp=Number(hero?.HEALTH??hero?.baseHealth??0)-Number(hero?.DAMAGE??0)+Number(hero?.ARMOR??0);
 const hit=Number(textOf(power).match(/take \$?(\d+) damage/i)?.[1]??0);
 const incoming=(state.opponent?.board??[]).filter(active).reduce((n,c)=>n+Number(c.ATK??c.baseAttack??0),0);
 // Keep room and at least one ordinary card for the next compulsory draw.
 if(risk.usable==null||risk.usable<2||risk.burnMax>0||risk.damageMax==null||hp<=hit+risk.damageMax+incoming)return null;
 return {action:tap,source:'draw_before_weapon_discard'};
}
