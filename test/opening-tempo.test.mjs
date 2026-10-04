import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,passiveEggCoin,mulliganVerdict} from '../src/policy.mjs';

const cases=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game46-opening.json',import.meta.url)));
const opening=cases[0].state;
const entities=opening.choice.entities.filter(c=>c.name!=='The Coin');
const masks=cards=>Array.from({length:2**cards.length},(_,mask)=>({type:'MULLIGAN',replace:cards.filter((_,i)=>mask&(1<<i)).map(c=>c.entityId)}));
const egg=entities.find(c=>c.name==='Boneweb Egg');
const card=(name,cost,type,text,atk)=>({entityId:200,name,COST:cost,CARDTYPE:type,text,ATK:atk});

test('game 46 complete recorded opening: toss all four, including unsupported Egg',()=>{
 const out=constrainActions(opening,masks(entities));
 assert.equal(out.length,1);
 assert.deepEqual(out[0].replace,entities.map(c=>c.entityId));
});

test('Egg is supported by early targeted or lowest-cost discard, not a four-cost weapon',()=>{
 const verdict=other=>mulliganVerdict(egg,{...opening,choice:{...opening.choice,entities:[egg,other]}});
 assert.equal(verdict(card('Ocular Occultist',3,'MINION','Battlecry: Choose a card in your hand to discard.',3)),'free');
 assert.equal(verdict(card('Wicked Whispers',1,'SPELL','Discard your lowest Cost card. Give your minions +1/+1.')),'free');
 assert.equal(verdict(entities.find(c=>c.name==='Chronoclaws')),'toss');
 assert.equal(verdict(entities.find(c=>c.name==='Entropic Continuity')),'toss');
});

test('Party Fiend and buff remain a supported opening combo',()=>{
 const cards=[card('Party Fiend',1,'MINION','Battlecry: Summon two 1/1 Felbeasts. Deal 3 damage to your hero.',1),entities.find(c=>c.name==='Entropic Continuity')];
 const out=constrainActions({...opening,choice:{...opening.choice,entities:cards}},masks(cards));
 assert.equal(out.length,1);
 assert.deepEqual(out[0].replace,[]);
});

test('game 46 complete turn-one record: preserve Coin instead of a lone 0/2 Egg',()=>{
 const c=cases[1];
 assert.equal(passiveEggCoin(c.state),true);
 const out=constrainActions(c.state,c.recordedOptions);
 assert.ok(out.length>0);
 assert.ok(!out.some(a=>a.entityId===c.recordedAction.entityId));
});

test('Coin remains possible for two bodies, a discard payoff, or an existing board',()=>{
 const s=cases[1].state;
 const change=hand=>({...s,me:{...s.me,hand}});
 assert.equal(passiveEggCoin(change([...s.me.hand,card('Disposable Acolytes',2,'SPELL','When you play or discard this, summon two random 1-Cost minions.')])) ,false);
 assert.equal(passiveEggCoin(change([s.me.hand.find(c=>c.name==='The Coin'),egg,card('Wicked Whispers',1,'SPELL','Discard your lowest Cost card. Give your minions +1/+1.')])) ,false);
 assert.equal(passiveEggCoin({...s,me:{...s.me,board:[...s.me.board,card('Party Fiend',1,'MINION','',1)]}}),false);
 assert.equal(passiveEggCoin({...s,me:{...s.me,mana:2}}),false);
});
