import {deckFor} from './deck.mjs';
import {tagOn,textOf,immediateDraws,isOutcast,heroCanSwing} from './mechanics.mjs';
import {fromState,apply,hpOf,hero} from './sim.mjs';

const cost=c=>Number(c.COST??c.baseCost??0);
const hp=c=>Number(c.HEALTH??c.baseHealth??0)-Number(c.DAMAGE??0);
const atk=c=>Number(c.ATK??c.baseAttack??0);

// Resolve card information before committing the rest of the turn. Keep mana to use what
// is found, and do not bury another currently playable right-edge Outcast or burn a draw.
function informationFirst(state,actions){
 const hand=state.me.hand??[],mana=Number(state.me.mana??0),right=hand.at(-1);
 const h=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
 const incoming=(state.opponent.board??[]).filter(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'DORMANT')&&!tagOn(c,'FROZEN')).reduce((n,c)=>n+atk(c),0);
 const wall=(state.me.board??[]).filter(c=>c.CARDTYPE==='MINION'&&tagOn(c,'TAUNT')&&!tagOn(c,'DORMANT')).reduce((n,c)=>n+hp(c),0);
 if(h&&incoming>=hp(h)+Number(h.ARMOR??0)+wall)return null;
 const picks=actions.filter(a=>{
  const c=hand.find(c=>c.entityId===a.entityId);
  if(!c||c.CARDTYPE!=='SPELL'||a.targetId!=null||cost(c)>=mana)return false;
  const draw=immediateDraws(c,state),discover=/^Discover\b/i.test(textOf(c));
  // Chaos Strike is an attack investment as well as a draw. Its extra Attack must earn
  // its mana; do not force it merely because the text contains "Draw a card".
  if(/give your hero \+\d+ attack/i.test(textOf(c)))return false;
  if(!discover&&(!draw||/\b(deal|destroy|discard|summon)\b/i.test(textOf(c))))return false;
  if(hand.length-1+(discover?1:draw)>10||draw>Number(state.me.deckCount??Infinity))return false;
  return right===c||hand.length<=2||!isOutcast(right)||!actions.some(x=>x.entityId===right.entityId);
 }).sort((a,b)=>cost(hand.find(c=>c.entityId===a.entityId))-cost(hand.find(c=>c.entityId===b.entityId)));
 return picks[0]?{action:picks[0],source:'dh_information_first'}:null;
}

function cinderBeforeAttackDraw(state,actions){
 const hand=state.me.hand??[],board=state.me.board??[];
 const sigil=actions.find(a=>hand.some(c=>c.entityId===a.entityId&&c.name==='Sigil of Cinder'));
 const chaos=actions.find(a=>hand.some(c=>c.entityId===a.entityId&&c.name==='Chaos Strike'));
 if(!sigil||!chaos)return null;
 const h=board.find(c=>c.CARDTYPE==='HERO');
 if(!h)return null;
 const enemies=(state.opponent.board??[]).filter(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'DORMANT'));
 if(!enemies.length)return null;
 const incoming=enemies.filter(c=>!tagOn(c,'FROZEN')).reduce((n,c)=>n+atk(c),0);
 const wall=board.filter(c=>c.CARDTYPE==='MINION'&&tagOn(c,'TAUNT')&&!tagOn(c,'DORMANT')).reduce((n,c)=>n+hp(c),0);
 if(incoming>=hp(h)+Number(h.ARMOR??0)+wall)return null;
 const opposingHero=(state.opponent.board??[]).find(c=>c.CARDTYPE==='HERO');
 if(heroCanSwing(state)&&opposingHero&&hp(opposingHero)+Number(opposingHero.ARMOR??0)<=atk(h)+2)return null;
 const usefulTrade=heroCanSwing(state)&&enemies.some(c=>!tagOn(c,'STEALTH')&&!tagOn(c,'IMMUNE')&&
   !tagOn(c,'DIVINE_SHIELD')&&hp(c)<=atk(h)+2&&hp(h)+Number(h.ARMOR??0)>atk(c));
 return usefulTrade?null:{action:sigil,source:'dh_cinder_before_attack_draw'};
}

// Press draws, so never queue a predicted continuation. Take its useful ping and +1 Attack
// before a safe hero trade; reobserve both the card drawn and the board afterwards.
function pressBeforeSwing(state,actions){
 if(!heroCanSwing(state))return null;
 const board=state.me.board??[],enemy=state.opponent.board??[],hand=state.me.hand??[];
 const h=board.find(c=>c.CARDTYPE==='HERO'),choices=[];
 for(const a of actions){
  const c=hand.find(c=>c.entityId===a.entityId),target=enemy.find(c=>c.entityId===a.targetId);
  if(c?.name!=='Press the Advantage'||!target||target.CARDTYPE!=='MINION'||tagOn(target,'IMMUNE'))continue;
  for(const swing of actions.filter(x=>x.entityId===h.entityId)){
   const t=enemy.find(c=>c.entityId===swing.targetId);
   if(t?.CARDTYPE!=='MINION'||tagOn(t,'IMMUNE')||hp(h)+Number(h.ARMOR??0)+1<=atk(t))continue;
   const same=t.entityId===target.entityId,shield=tagOn(t,'DIVINE_SHIELD');
   const remaining=hp(t)-(same&&!shield?1:0);
   if(remaining<=0||(!same&&shield)||atk(h)+1<remaining)continue;
   // Do not force the spell just to buff an already sufficient swing, unless its own ping kills.
   const pingKill=!tagOn(target,'DIVINE_SHIELD')&&hp(target)<=1;
   if(atk(h)>=hp(t)&&!shield&&!pingKill)continue;
   choices.push({action:a,source:'dh_press_before_swing',value:(pingKill?10:0)+(!same?3:0)+atk(t)});
  }
 }
 choices.sort((a,b)=>b.value-a.value);
 return choices[0]??null;
}

// A small non-Rush attacker can put a target in Blast range too. A random deathrattle is
// deliberately only a first step: crack a shield, observe the pings, then decide again.
function blastSetup(state,actions,start){
 const hand=state.me.hand??[],board=state.me.board??[],enemy=state.opponent.board??[];
 for(const spell of actions){
  const c=hand.find(c=>c.entityId===spell.entityId),t=enemy.find(c=>c.entityId===spell.targetId);
  if(c?.name!=='Void Blast'||!t||t.CARDTYPE!=='MINION'||tagOn(t,'IMMUNE'))continue;
  const damage=Number(/^Deal (\d+) damage/i.exec(textOf(c))?.[1]??0);
  if(!damage)continue;
  for(const a of actions){
   if(!tagOn(t,'DIVINE_SHIELD')&&hp(t)<=damage)break;
   const b=board.find(c=>c.entityId===a.entityId);
   if(a.targetId!==t.entityId||b?.CARDTYPE!=='MINION'||cost(b)>2||atk(b)+hp(b)>4)continue;
   const after=apply(start,{kind:'attack',id:a.entityId,targetId:a.targetId}).s;
   const remaining=after.opp.find(x=>x.id===t.entityId);
   const cinderDies=b.name==='Sizzling Cinder'&&!tagOn(b,'SILENCED')&&!after.me.some(x=>x.id===b.entityId);
   if(remaining&&!remaining.ds&&remaining.hp>0&&
     (remaining.hp<=damage||cinderDies&&tagOn(t,'DIVINE_SHIELD')&&remaining.hp<=damage+2))
    return {action:a,source:'dh_chip_before_blast'};
  }
  if(!tagOn(t,'DIVINE_SHIELD')&&hp(t)<=damage&&
    !actions.some(a=>{const b=board.find(c=>c.entityId===a.entityId);return a.targetId===t.entityId&&b?.CARDTYPE==='MINION'&&atk(b)>=hp(t)}))
   return {action:spell,source:'dh_finish_blast'};
 }
 return null;
}

// These are next-action preferences, applied only after immediate and searched lethal.
// Use the game's legal targets; never invent an attack into Stealth or behind Taunt.
export function dhTacticalAction(state,actions){
 if(state.choice||deckFor(state).name!=='dh-void')return null;
 const board=state.me.board??[],hand=state.me.hand??[],enemy=state.opponent.board??[];
 const liveMinions=enemy.filter(c=>c.CARDTYPE==='MINION'&&!tagOn(c,'DORMANT'));
 const harvest=actions.find(a=>hand.some(c=>c.entityId===a.entityId&&c.name==='Grim Harvest'));
 const room=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 if(!liveMinions.length&&harvest&&room>0)
  return {action:harvest,source:'dh_develop_harvest'};

 const press=pressBeforeSwing(state,actions);
 if(press)return press;
 const cinder=cinderBeforeAttackDraw(state,actions);
 if(cinder)return cinder;
 const information=informationFirst(state,actions);
 if(information)return information;

 const start=fromState(state,actions),trades=[];
 for(const a of actions){
  const attacker=board.find(c=>c.entityId===a.entityId);
  const target=liveMinions.find(c=>c.entityId===a.targetId);
  if(!attacker||!target||tagOn(target,'STEALTH')||tagOn(target,'DIVINE_SHIELD')||tagOn(target,'IMMUNE'))continue;
  const weapon=attacker.CARDTYPE==='HERO'&&board.some(c=>c.CARDTYPE==='WEAPON');
  const rush=attacker.CARDTYPE==='MINION'&&tagOn(attacker,'RUSH');
  if(!weapon&&!rush)continue;
  const damage=Number(attacker.ATK??attacker.baseAttack??0);
  const health=Number(target.HEALTH??target.baseHealth??0)-Number(target.DAMAGE??0);
  if(health<=0||damage<health)continue;
  // A buff can preserve the body; leave that order to the ordinary planner.
  if(rush&&actions.some(x=>hand.some(c=>c.entityId===x.entityId&&/give your .*minions \+/i.test(textOf(c)))))continue;
  const after=apply(start,{kind:'attack',id:a.entityId,targetId:a.targetId}).s;
  const remaining=after.opp.filter(b=>!b.frozen&&!b.dormant).reduce((n,b)=>n+b.atk,0);
  if(weapon&&(hpOf(hero(after,'me'))<=remaining||hpOf(hero(after,'me'))<=0))continue;
  // A ready Rush token can finish a small minion without spending another removal card.
  // Avoid sacrificing a valuable Rush body just because it can make a kill.
  const lost=!after.me.some(b=>b.id===a.entityId);
  if(rush&&lost&&damage+(Number(attacker.HEALTH??attacker.baseHealth??0)-Number(attacker.DAMAGE??0))>
    Number(target.ATK??target.baseAttack??0)+health+1)continue;
  trades.push({action:a,source:weapon?'dh_weapon_trade':'dh_rush_trade',value:Number(target.ATK??target.baseAttack??0)*2+health});
 }
 trades.sort((a,b)=>b.value-a.value);
 if(trades.length)return trades[0];
 const setup=blastSetup(state,actions,start);
 if(setup)return setup;
 const infestation=actions.find(a=>hand.some(c=>c.entityId===a.entityId&&c.name==='Infestation'));
 const development=actions.some(a=>hand.some(c=>c.entityId===a.entityId&&
   (c.CARDTYPE==='MINION'||['Sigil of the Seas','Void Soul'].includes(c.name))));
 if(!liveMinions.length&&infestation&&hand.length<=9&&!development)
  return {action:infestation,source:'dh_bank_stingers'};
 return null;
}

export function respectsDHTactics(state,actions,action){
 const preferred=dhTacticalAction(state,actions)?.action;
 return !preferred||(preferred.entityId===action.entityId&&preferred.targetId===action.targetId&&preferred.type===action.type);
}
