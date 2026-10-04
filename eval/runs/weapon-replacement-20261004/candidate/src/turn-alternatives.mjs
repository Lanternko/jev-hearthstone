import {textOf,tagOn,immediateDraws} from './mechanics.mjs';
import {temporaryPayoff} from './temporary-discard.mjs';
import {drawImpact} from './draw-risk.mjs';
const cost=c=>Number(c?.COST??c?.baseCost??0);
const live=c=>Number(c.HEALTH??c.baseHealth??0)>Number(c.DAMAGE??0);
// Conditional turn intents annotate existing legal first actions; they never
// fabricate random damage, summons, draws or queue an unobserved follow-up.
export function turnAlternatives(state,actions=[]){
 if(state.choice)return [];
 const hand=state.me?.hand??[],board=state.me?.board??[],mana=Number(state.me?.mana??0);
 const foes=(state.opponent?.board??[]).filter(c=>c.CARDTYPE==='MINION'&&live(c)&&!tagOn(c,'DORMANT'));
 const slots=7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 const developments=actions.flatMap(a=>{
  const c=hand.find(c=>c.entityId===a.entityId),d=c&&temporaryPayoff(c);
  return c&&a.targetId==null&&d.kind==='randomBodies'?[{action:a,card:c,bodies:d.n}]:[];
 });
 const out=[];
 for(const a of actions){
  const c=hand.find(c=>c.entityId===a.entityId);
  const m=c?.CARDTYPE==='SPELL'&&/^when you play or discard this, deal (\d+) damage randomly split among all enemies\.?$/i.exec(textOf(c));
  if(m&&a.targetId==null&&foes.length){
   for(const f of developments.filter(f=>f.card.entityId!==c.entityId&&cost(c)+cost(f.card)<=mana&&f.bodies<=slots)){
    out.push({kind:'random_damage_then_development',firstActionId:a.id,damageEntityId:c.entityId,
     followupEntityId:f.card.entityId,followupName:f.card.name,totalCost:cost(c)+cost(f.card),
     reserveMana:cost(f.card),manaAfterDamage:mana-cost(c),enemyMinions:foes.map(c=>({entityId:c.entityId,health:Number(c.HEALTH??c.baseHealth)-Number(c.DAMAGE??0),shield:tagOn(c,'DIVINE_SHIELD')})),
     baseDamage:Number(m[1]),heroAlsoEligible:true,possibleBodies:f.bodies,slots,queuedFollowup:false,
     guidance:`Compare this whole intent: random damage first, observe actual survivors and triggers, then consider ${f.card.name} while reserving ${cost(f.card)} mana. The enemy hero can receive hits; no kills or random summon identities are guaranteed. Recheck mana, slots, survival and legal actions before developing or trading. Do not queue the follow-up through random damage.`});
   }
  }
  const source=c??board.find(c=>c.entityId===a.entityId);
  const n=source&&a.targetId==null?immediateDraws(source,state):0;
  if(n>0&&cost(source)<=mana)out.push({kind:'draw_then_reobserve',firstActionId:a.id,draws:n,
   manaAfterDraw:mana-cost(source),risk:drawImpact(state,n,{played:!!c}),queuedFollowup:false,
   guidance:'Optional competing information intent: draw first only if the public safety checks permit it and the information is worth its cost. Observe the drawn cards before deciding removal/development; do not invent a draw or keep a follow-up whose total cost no longer fits.'});
 }
 return out;
}
