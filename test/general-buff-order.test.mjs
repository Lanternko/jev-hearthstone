import test from 'node:test';
import assert from 'node:assert/strict';
import {buffDevelopmentActions,constrainActions} from '../src/policy.mjs';
const make=(n,mana,bodyCost,buffCost,count=1)=>{
 const buff={entityId:10,name:'Unnamed buff',CARDTYPE:'SPELL',COST:buffCost,text:'Give your minions +1/+1.'};
 const body=count===1?{entityId:11,name:'Unseen ordinary body',CARDTYPE:'MINION',COST:bodyCost,ATK:2,HEALTH:3,text:''}
  :{entityId:11,name:'Unseen random summon',CARDTYPE:'SPELL',COST:bodyCost,text:`Summon ${count} random 1-Cost minions.`};
 const state={status:'RUNNING',turn:8,me:{heroClass:'WARLOCK',current:true,mana,maxMana:mana,hand:[buff,body],board:[
  {entityId:1,CARDTYPE:'HERO',HEALTH:30},...Array.from({length:n},(_,i)=>({entityId:100+i,CARDTYPE:'MINION',ATK:1,HEALTH:2,EXHAUSTED:1}))]},
  opponent:{board:[{entityId:2,CARDTYPE:'HERO',HEALTH:100}]}};
 const actions=[{id:'end',type:'END_TURN'},{id:'buff',type:'POWER',entityId:10},{id:'body',type:'POWER',entityId:11}];
 return {state,buff,body,actions};
};
test('ordering invariant spans board counts, body/buff costs and summon counts without name or fill-seven dependence',()=>{
 let cases=0;
 for(let n=0;n<=6;n++)for(let cost=1;cost<=3;cost++)for(let buffCost=1;buffCost<=2;buffCost++)for(let count=1;count<=3;count++){
  const {state,buff,actions}=make(n,cost+buffCost,cost,buffCost,count);
  const develop=buffDevelopmentActions(state,actions,buff);
  assert.equal(develop.length>0,n+count<=7,`board=${n}, body cost=${cost}, buff cost=${buffCost}, summons=${count}`);
  if(n+count<=7)assert.ok(!constrainActions(state,actions).some(a=>a.id==='buff'));
  state.me.mana--;
  assert.equal(buffDevelopmentActions(state,actions,buff).length,0,'cannot consume reserved buff mana');cases++;
 }
 assert.equal(cases,126);
});
test('ordering excludes unsafe/unknown/delayed development and does not block buff lethal',()=>{
 for(const change of [
  x=>x.body.text='Battlecry: Destroy all other minions.',
  x=>x.body.text='Dormant for 2 turns.',
  x=>{x.body.text='Battlecry: Deal 3 damage to your hero.';x.state.me.board[0].HEALTH=3;},
 ]){const x=make(2,3,2,1);change(x);assert.equal(buffDevelopmentActions(x.state,x.actions,x.buff).length,0);}
 const x=make(1,3,2,1);x.state.me.board[1].EXHAUSTED=0;x.state.opponent.board[0].HEALTH=2;
 x.actions.push({id:'hit',type:'POWER',entityId:100,targetId:2});
 assert.ok(constrainActions(x.state,x.actions).some(a=>a.id==='buff'),'buff-enabled lethal remains available');
});
test('Deathrattle bodies are not mistaken for immediate extra buff targets',()=>{
 const x=make(6,3,2,1);x.body.text='Deathrattle: Summon two 2/1 minions.';
 assert.equal(buffDevelopmentActions(x.state,x.actions,x.buff).length,1,'the minion itself fits one slot');
});
