import {deckFor} from './deck.mjs';
import {textOf} from './mechanics.mjs';
import {opponentPrior} from './opponent-prior.mjs';
import {mulliganMatchup} from './mulligan-matchup.mjs';

export const MATCHUP_OBJECTIVE_VERSION='matchup-objective-v2-class-prior';
export const OBJECTIVE_WEIGHTS=Object.freeze({
 unknown:Object.freeze({face:0.6,finishFace:1.3,draw:2.5,mana:0.5,coin:0}),
 pressure_window:Object.freeze({face:1.1,finishFace:1.3,draw:1,mana:0.8,coin:0.8}),
 board_resource:Object.freeze({face:0.3,finishFace:0.75,draw:3,mana:0.5,coin:0.3}),
});
const n=v=>Number(v??0);
const active=c=>c.CARDTYPE==='MINION'&&!n(c.DORMANT)
 &&n(c.HEALTH??c.baseHealth)>n(c.DAMAGE);
const cost=c=>n(c.COST??c.baseCost);
const CLOCKS=new Set(['The Demon Seed',"Sorcerer's Gambit",'Defend the Dwarven District','Open the Waygate','The Forbidden Sequence']);

// Public observations override a soft class prior fitted to earlier reviewed games.
// The current game's retrospective label is never looked up.
export function matchupObjective(state){
 const neutral={version:MATCHUP_OBJECTIVE_VERSION,mode:'unknown',support:'insufficient public evidence',
  evidence:[],weights:OBJECTIVE_WEIGHTS.unknown,deadlineTurn:null};
 if(deckFor(state).name!=='warlock-discard')return neutral;
 const prior=opponentPrior(state);
 const plays=(state.opponent?.publicPlays??[]).filter(c=>c.public===true&&n(c.engineTurn)>0&&n(c.engineTurn)<=n(state.turn));
 const spells=plays.filter(c=>c.CARDTYPE==='SPELL');
 const aoe=spells.filter(c=>/(?:deal[^.]*\bto|destroy|return|freeze|transform)\s+(?:all|each)\s+(?:(?:other|enemy|friendly)\s+)*(?:minions?|characters|enemies)\b/i.test(textOf(c)));
 const draws=spells.filter(c=>/\bdraw\b/i.test(textOf(c)));
 const ramp=spells.filter(c=>! /Gain 1 Mana Crystal this turn only/i.test(textOf(c))&&/(?:gain|empty).*mana crystals?|mana crystals?.*gain/i.test(textOf(c)));
 const copies=spells.filter(c=>/copy[^.]*opponent|opponent[^.]*copy/i.test(textOf(c)));
 const clock=plays.find(c=>CLOCKS.has(c.name));
 const early=plays.filter(c=>c.engineTurn<=6&&c.CARDTYPE==='MINION'&&cost(c)>=1&&cost(c)<=3&&n(c.ATK??c.baseAttack)>0);
 const strong=early.filter(c=>n(c.ATK??c.baseAttack)+n(c.HEALTH??c.baseHealth)>=2*cost(c)+3);
 const enemy=(state.opponent?.board??[]).filter(active);
 const earlySwarm=n(state.me?.maxMana)<=3&&enemy.length>=2&&enemy.reduce((sum,c)=>sum+n(c.ATK??c.baseAttack),0)>=5;
 const boardPressure=strong.length>0||early.length>=2||earlySwarm;
 const forty=state.opponent?.initialHealth===40;
 const controlSupport=aoe.length>0&&(copies.length>0||ramp.length>0||draws.length>=2||forty);
 const strongControl=aoe.length>0&&(copies.length>0||ramp.length>0||draws.length>=2);
 const evidence=[...(forty?['public initial Health 40']:[]),
  ...aoe.map(c=>`public AOE: ${c.name}`),...draws.map(c=>`public draw spell: ${c.name}`),
  ...ramp.map(c=>`public ramp: ${c.name}`),...copies.map(c=>`public copy: ${c.name}`),
  ...strong.map(c=>`strong early body: ${c.name}`),...(earlySwarm?['strong public early board']:[])];
 let mode='unknown',support=neutral.support;
 if(clock){mode='pressure_window';support='public quest clock; exact payoff turn unknown';evidence.push(`public clock: ${clock.name}`);}
 else if(controlSupport&&(!boardPressure||strongControl)){
  mode='pressure_window';support='combined public removal/resource evidence';
 }else if(boardPressure&&!controlSupport){mode='board_resource';support='public early minion pressure';}
 else if(boardPressure&&controlSupport)support='conflicting early pressure and control evidence';
 const weights={...OBJECTIVE_WEIGHTS[mode]};
 if(mode==='unknown')for(const k of Object.keys(weights)){
  const q=prior.mulliganProbabilities,a=prior.decisionWeight;
  const expected=q.pressure*OBJECTIVE_WEIGHTS.pressure_window[k]
   +q.board*OBJECTIVE_WEIGHTS.board_resource[k]+q.unknown*OBJECTIVE_WEIGHTS.unknown[k];
  weights[k]=(1-a)*weights[k]+a*expected;
 }
 return {...neutral,mode,support,evidence,weights,prior,mulligan:state.choice?.type==='MULLIGAN'?mulliganMatchup(prior):null,
  guidance:mode==='pressure_window'
   ?'Convert limited turns and known cards into board/face pressure. Spend Coin on concrete development/buff or lethal, compare the cost of optional drawing and small buffs. Draw when it fixes missing pieces or depleted resources; no blanket draw ban. Do not assume T5/T6 is a fixed deadline or that an empty opposing board cannot clear.'
   :mode==='board_resource'
    ?'Protect initiative with efficient trades, persistent bodies and resources. A controlled refill can beat maximizing immediate face damage or buff count. Chamber supplies bodies only through a suitable observed discard; Duke uses current tags and Rush for a trade, without assuming the opponent lacks hard removal.'
    :'Use the logged class/opening prior as a soft preference when comparing pressure and board/resource plans, including mulligan. Its confidence is sample support, not a known deck label. Unknown classification remains possible. Retain efficient early development and one retained discard activation per material; do not keep unsupported materials based on a matchup guess. Empty early turns do not identify a deck.'};
}

// Narrow permission to compare Life Tap with a buff: thin hand and a concrete
// public board lead. Safety/draw-risk filters and searched lethal still apply.
export function resourceDrawWindow(state,objective=matchupObjective(state)){
 if(objective.mode!=='board_resource'||state.choice||!state.me?.current)return false;
 const hand=(state.me.hand??[]).filter(c=>c.name!=='The Coin'&&!/Gain 1 Mana Crystal this turn only/i.test(textOf(c)));
 if(hand.length>2)return false;
 const mine=(state.me.board??[]).filter(active),enemy=(state.opponent?.board??[]).filter(active);
 const attack=list=>list.reduce((sum,c)=>sum+n(c.ATK??c.baseAttack),0);
 const health=list=>list.reduce((sum,c)=>sum+n(c.HEALTH??c.baseHealth)-n(c.DAMAGE),0);
 const hero=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO');
 const enemyHero=(state.opponent?.board??[]).find(c=>c.CARDTYPE==='HERO');
 const hp=n(hero?.HEALTH)-n(hero?.DAMAGE)+n(hero?.ARMOR);
 return mine.length>=2&&attack(mine)>attack(enemy)&&health(mine)>health(enemy)
  &&hp>attack(enemy)+n(enemyHero?.ATK)+4&&n(state.me.deckCount)>1;
}

export function resourceToolAssessments(state){
 if(deckFor(state).name!=='warlock-discard')return null;
 const hand=state.me?.hand??[],board=state.me?.board??[];
 const chamber=[...hand,...board].find(c=>c.cardId==='WON_103'||c.name==='Chamber of Viscidus');
 const duke=hand.find(c=>c.cardId==='CATA_493'||c.name==='Duke of Below');
 const payoffs=hand.filter(c=>/if you discard this minion, summon it|when you (?:play or )?discard this,[^.]*summon|if you discard this, trigger/i.test(textOf(c)));
 return {refillWindow:resourceDrawWindow(state),ownCards:hand.length,opponentCards:state.opponent?.handCount??null,
  chamber:chamber?{entityId:chamber.entityId,inHand:hand.includes(chamber),cost:cost(chamber),
   possiblePayoffs:payoffs.map(c=>({entityId:c.entityId,name:c.name})),
   offeredPayoffs:state.choice?.source?.entityId===chamber.entityId?(state.choice.entities??[]).filter(c=>payoffs.some(p=>p.entityId===c.entityId)).map(c=>c.entityId):[],
   limitation:'Installation summons zero bodies. A ready activation costs zero mana; it discards a chosen offered card, then draws two unknown cards. After installation at most three hand cards guarantees a payoff is offered; with more, inspect the actual offer. Count the location against board slots and evaluate the staged development/refill intent in chamberIntents.'}:null,
  duke:duke?{entityId:duke.entityId,attack:n(duke.ATK??duke.baseAttack),health:n(duke.HEALTH??duke.baseHealth)-n(duke.DAMAGE),
   cost:cost(duke),affordable:cost(duke)<=n(state.me?.mana),boardRoom:7-board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length,
   limitation:'Use observed tags, not an invented discard count. Rush can trade on the summoning turn; it does not grant a face attack. Large size does not prove the opponent lacks removal.'}:null};
}
