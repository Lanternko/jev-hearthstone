import {readFileSync} from 'node:fs';
const cards=JSON.parse(readFileSync(new URL('../../data/cards.enUS.json',import.meta.url)));
export const card=(name,entityId)=>{
 const c=cards.find(c=>c.collectible&&c.name===name);
 if(!c)throw Error(`Missing card ${name}`);
 return {entityId,name,cardId:c.id,CARDTYPE:c.type,COST:c.cost,ATK:c.attack,HEALTH:c.health,text:c.text};
};
export const buff=card('Entropic Continuity',1),whispers=card('Wicked Whispers',2),aco=card('Disposable Acolytes',3),
 dead=card('Walking Dead',4),ocular=card('Ocular Occultist',5),party=card('Party Fiend',6),platy=card('Platysaur',7),
 catacombs=card('Cursed Catacombs',8),egg=card('Boneweb Egg',9);
export const coin={entityId:10,name:'The Coin',cardId:'GAME_005',COST:0,CARDTYPE:'SPELL',text:'Gain 1 Mana Crystal this turn only.'};
export function state(maxMana,mana,hand,n=1){
 return {status:'RUNNING',turn:maxMana*2,me:{current:true,heroClass:'WARLOCK',maxMana,mana,deckCount:20,hand:structuredClone(hand),
 board:[{entityId:900,CARDTYPE:'HERO',HEALTH:30},{entityId:901,CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take 2 damage.'},
 ...Array.from({length:n},(_,i)=>i===0?{...platy,entityId:100,EXHAUSTED:1}:
 {entityId:100+i,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:1})]},
 opponent:{board:[{entityId:999,CARDTYPE:'HERO',HEALTH:30}],secretCount:0}};
}
// Synthetic legal menus for user examples; not live engine receipts.
export function options(s){
 const out=[{id:'end',type:'END_TURN'}];
 if(s.me.mana>=2)out.push({id:'tap',type:'POWER',entityId:901});
 const slots=s.me.board.filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
 for(const c of s.me.hand){
  if(c.COST>s.me.mana||c.CARDTYPE==='MINION'&&slots>=7)continue;
  if(c.name==='Ocular Occultist'){
   for(const t of s.me.hand.filter(t=>t!==c))out.push({id:`play${c.entityId}discard${t.entityId}`,type:'POWER',entityId:c.entityId,targetId:t.entityId});
  }else out.push({id:`play${c.entityId}`,type:'POWER',entityId:c.entityId});
 }
 return out;
}
export function pairedCases(){
 return [
  {id:'T1-after-Platysaur-preserve-Coin',state:state(1,0,[buff,coin,aco,dead]),expected:[],forbid:[coin.entityId]},
  {id:'T2-Acolytes-before-Coin-and-buff',state:state(2,2,[buff,coin,aco,dead]),expected:[aco.entityId]},
  {id:'T2-actual-three-bodies-Coin',state:state(2,0,[buff,coin,dead],3),expected:[coin.entityId]},
  {id:'T2-after-Coin-buff-three',state:state(2,1,[buff,dead],3),expected:[buff.entityId]},
  {id:'T3-Occultist-discard-body-before-Coin-buff',state:state(3,3,[buff,coin,ocular,dead],2),expected:[ocular.entityId]},
  {id:'T3-actual-four-bodies-Coin',state:state(3,0,[buff,coin],4),expected:[coin.entityId]},
  {id:'T3-after-Coin-buff-four',state:state(3,1,[buff],4),expected:[buff.entityId]},
  {id:'Whispers-single-board-summons-two-exception',state:state(1,1,[whispers,aco,dead]),expected:[whispers.entityId]},
  {id:'free-Catacombs-before-burst',state:state(2,2,[buff,coin,aco,dead,catacombs]),expected:[catacombs.entityId]},
 ].map(c=>({...c,origin:'User-proposed line, synthetic state and options, local card database text',options:options(c.state)}));
}
