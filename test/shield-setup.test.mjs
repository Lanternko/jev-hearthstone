import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preferredShieldSetup} from '../src/divine-shield.mjs';
import {prepare,allowsPlanContinuation} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game2-shield-pop-alternatives.json',import.meta.url)));

test('setup uses full text, low Attack, affordable observed finisher and no queued random outcome',()=>{
 const c=fixture();c.state.me.board.find(c=>c.entityId===80).name='Another growing egg';
 c.state.me.hand.find(c=>c.entityId===33).cardId='RENAMED';
 const p=preferredShieldSetup(c.state,c.options);
 assert.equal(p.action.entityId,80);assert.equal(p.evidence.reserveMana,4);
 assert.equal(p.evidence.executeOnlyPop,true);
});

test('insufficient follow-up mana, missing finisher and modified strong body do not force shield setup',()=>{
 for(const mode of ['mana','missing','weak','no-rush','unknown-battlecry']){
  const c=fixture(),f=c.state.me.hand.find(c=>c.entityId===33);
  if(mode==='mana')c.state.me.mana=3;
  if(mode==='missing')c.options=c.options.filter(a=>a.entityId!==33);
  if(mode==='weak')f.ATK=3;
  if(mode==='no-rush'){f.RUSH=0;f.text='';}
  if(mode==='unknown-battlecry')f.text+=' Battlecry: Destroy a random minion.';
  assert.equal(preferredShieldSetup(c.state,c.options),null,mode);
 }
});

test('source damage, healing, unknown deathrattle and sleeping bodies require separate comparison',()=>{
 for(const mutate of [b=>b.text='Deathrattle: Draw a card.',b=>b.text+=' Deal 3 damage to your hero.',b=>b.POISONOUS=1,b=>b.LIFESTEAL=1,b=>b.EXHAUSTED=1,b=>b.ATK=3]){
  const c=fixture();mutate(c.state.me.board.find(b=>b.entityId===80));
  assert.equal(preferredShieldSetup(c.state,c.options),null);
 }
});

test('enemy engine, secrets, extra enemies, self-lethal exposure and missing shield do not hard prefer setup',()=>{
 for(const mode of ['engine','secret','extra','low-health','no-shield']){
  const c=fixture(),t=c.state.opponent.board.find(b=>b.entityId===46);
  if(mode==='engine')t.text+=' After a minion dies, draw a card.';
  if(mode==='secret')c.state.opponent.secretCount=1;
  if(mode==='extra')c.state.opponent.board.push({entityId:900,CARDTYPE:'MINION',ATK:1,HEALTH:1});
  if(mode==='low-health')c.state.me.board.find(b=>b.CARDTYPE==='HERO').DAMAGE=26;
  if(mode==='no-shield')t.DIVINE_SHIELD=0;
  assert.equal(preferredShieldSetup(c.state,c.options),null,mode);
 }
});

test('after playing Rush finisher the stale high-Attack pop is blocked and low pop stays first',()=>{
 const c=fixture(),f=c.state.me.hand.find(c=>c.entityId===33);
 c.state.me.hand=c.state.me.hand.filter(c=>c.entityId!==33);c.state.me.mana=1;
 c.state.me.board.push({...f,EXHAUSTED:0,NUM_ATTACKS_THIS_TURN:0});
 c.options=c.options.filter(a=>a.entityId!==33);c.options.push({id:'duke-attack',type:'POWER',entityId:33,targetId:46});
 const full=constrainActions(c.state,c.options),p=prepare(c.state,full);
 assert.equal(p.forced.action.entityId,80);assert.equal(p.forced.evidence.reserveMana,0);
 assert.equal(allowsPlanContinuation(c.state,full,full.find(a=>a.id==='o9t0')),false);
 assert.equal(allowsPlanContinuation(c.state,full,full.find(a=>a.id==='o6t0')),true);
});
