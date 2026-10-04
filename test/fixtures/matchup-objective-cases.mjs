import {card,buff,state as openingState,options as openingOptions} from './opening-burst-cases.mjs';
export const visible=(name,id,engineTurn)=>({...card(name,id),public:true,engineTurn});
export const control=s=>{
 s.opponent.initialHealth=40;s.opponent.publicPlays=[visible('Defile',80,4)];return s;
};
export const board=s=>{
 s.opponent.initialHealth=30;s.opponent.publicPlays=[visible('Body Bagger',80,1),visible('Battlefield Necromancer',81,3)];return s;
};
export function combatState(){
 const s=openingState(4,0,[],0);s.turn=8;s.opponent.handCount=2;
 s.me.board.push({entityId:100,CARDTYPE:'MINION',name:'Synthetic attacker',ATK:3,HEALTH:6,EXHAUSTED:0});
 s.opponent.board.push({entityId:110,CARDTYPE:'MINION',name:'Synthetic defender',ATK:3,HEALTH:2});
 return s;
}
export const combatOptions=[{id:'end',type:'END_TURN'},
 {id:'face',type:'POWER',entityId:100,targetId:999},
 {id:'trade',type:'POWER',entityId:100,targetId:110}];
export function refillState(){
 const s=openingState(2,2,[buff],3);s.turn=4;
 s.me.board.filter(c=>c.CARDTYPE==='MINION').forEach(c=>{c.ATK=2;c.HEALTH=3;});
 s.opponent.board.push({entityId:110,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 s.opponent.handCount=0;return s;
}
export function pairedCases(){
 const pressure=control(combatState()),resources=board(combatState());
 return [
  {id:'pressure-convert-face-before-harmless-trade',state:pressure,options:combatOptions,expected:['face']},
  {id:'board-preserve-efficient-trade',state:resources,options:combatOptions,expected:['trade']},
  {id:'board-thin-hand-safe-lead-can-refill',state:board(refillState()),options:openingOptions(board(refillState())),requireAvailable:['tap']},
  {id:'pressure-do-not-price-out-productive-buff-with-Tap',state:control(refillState()),options:openingOptions(control(refillState())),forbidAvailable:['tap']},
 ].map(c=>({...c,origin:'Synthetic paired position from user strategy ruling; local database card text; no live model call'}));
}
