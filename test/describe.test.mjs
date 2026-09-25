import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describe as say,criteria,roles} from '../src/describe.mjs';

// The turn-5 position where Jev ended the turn rather than swinging three 1/1s at the face.
const state={
  me:{playerId:1,mana:1,maxMana:3,current:true,
    hand:[{entityId:60,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,ATK:0,HEALTH:2},
          {entityId:61,name:'Soul Barrage',CARDTYPE:'SPELL',COST:4}],
    board:[{entityId:1,name:"Gul'dan",CARDTYPE:'HERO'},
           {entityId:2,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2},
           {entityId:49,name:'Party Fiend',CARDTYPE:'MINION',ATK:1,HEALTH:1},
           {entityId:94,name:'Felbeast',CARDTYPE:'MINION',ATK:1,HEALTH:1}]},
  opponent:{playerId:2,board:[{entityId:78,name:'Zombie Queen Scarlet',CARDTYPE:'HERO'},
                              {entityId:80,name:'Ghoul',CARDTYPE:'MINION',ATK:2,HEALTH:3,DAMAGE:1}]},
};

test('an attack names the attacker, the target and which side it is on', () => {
  const s=say(state,{id:'o1t0',type:'POWER',option:1,entityId:49,targetId:78});
  assert.match(s,/Attack with your Party Fiend 1\/1/);
  assert.match(s,/enemy hero Zombie Queen Scarlet/);
});

test('a damaged target reports remaining health, not printed health', () => {
  const s=say(state,{id:'o2t1',type:'POWER',option:2,entityId:94,targetId:80});
  assert.match(s,/enemy minion Ghoul 2\/2\./);   // 3 health, 1 damage
});

test('playing from hand states the cost and card type', () => {
  const s=say(state,{id:'o3',type:'POWER',option:3,entityId:60});
  assert.match(s,/Play Boneweb Egg from hand for 2 mana \(minion 0\/2\)/);
});

test('the hero power is not described as an attack', () => {
  const s=say(state,{id:'o4',type:'POWER',option:4,entityId:2});
  assert.match(s,/Use hero power Life Tap for 2 mana/);
  assert.doesNotMatch(s,/Attack/);
});

test('end turn and mulligan read as plain instructions', () => {
  assert.equal(say(state,{id:'o0',type:'END_TURN',option:0}),'End the turn.');
  const m={...state,choice:{type:'MULLIGAN',entities:[{entityId:70,name:'Chronoclaws',cardId:'END_016'}]}};
  // A mulligan option now states cost, body and text for both sides of the split: the name
  // alone gave Jev no basis to choose. Cards with no definition degrade to the bare name.
  const r=say(m,{id:'m1',type:'MULLIGAN',replace:[70]});
  assert.match(r,/^Replace Chronoclaws\. Keeping /);
  // Cards listed in data/mulligan.json carry their opening-hand win rate; others stay bare.
  assert.match(r,/Boneweb Egg \(2 mana minion 0\/2; kept in opening hands it wins 64\.2% vs the deck's 67\.5% average\)/);
  assert.match(r,/Soul Barrage \(4 mana spell; kept in opening hands it wins 65\.2%/);
  assert.doesNotMatch(r,/Chronoclaws[^;]*wins/);   // no definition -> bare name, no stat
  assert.doesNotMatch(r,/Played|played win/i);
  assert.match(r,/redrawn at random\.$/);
  assert.match(say(m,{id:'m0',type:'MULLIGAN',replace:[]}),/^Keep the whole opening hand: /);
});

test('criteria keeps the option fields Jev must echo back, and adds the sentence', () => {
  const c=criteria(state,[{id:'o1t0',type:'POWER',option:1,entityId:49,targetId:78}]);
  assert.equal(c.o1t0.option,1);
  assert.equal(c.o1t0.targetId,78);
  assert.match(c.o1t0.description,/Attack with your Party Fiend/);
});

import {constrainActions,pureBoardBuff} from '../src/policy.mjs';

const EC={entityId:8,name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,
  text:'[x]Give your minions +1/+1.\nShuffle 2 Shreds of Time\ninto your deck.'};
const WW={entityId:9,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,
  text:'Discard your lowest Cost card. Give your minions +1/+1.'};

test('a buff that only buffs counts as pure; one that also discards does not', () => {
  assert.ok(pureBoardBuff(EC));
  assert.ok(!pureBoardBuff(WW));
  assert.ok(!pureBoardBuff({text:'Deal 3 damage.'}));
  assert.ok(!pureBoardBuff({}));
});

const empty=hand=>({me:{playerId:1,hand,board:[{entityId:1,CARDTYPE:'HERO'}]},opponent:{board:[]}});
const withMinion=hand=>({me:{playerId:1,hand,board:[{entityId:1,CARDTYPE:'HERO'},{entityId:5,CARDTYPE:'MINION',ATK:1,HEALTH:1}]},opponent:{board:[]}});
const acts=[{id:'o0',type:'END_TURN',option:0},{id:'o1',type:'POWER',option:1,entityId:8},{id:'o2',type:'POWER',option:2,entityId:9}];

// Superseded by a later user ruling: Whispers used to stay on an empty board because its
// discard half is often the reason to cast it. Here the only other card in hand is a real one
// (Entropic Continuity buffs, it pays nothing for being discarded), so both halves do nothing
// and it goes too. See 'whispers is off the table...' in test/policy.test.mjs.
test('an empty board removes the pure buff, and Whispers with nothing worth eating', () => {
  const left=constrainActions(empty([EC,WW]),acts).map(a=>a.id);
  assert.deepEqual(left,['o0']);
});

test('one friendly minion is enough to leave the decision to Jev', () => {
  assert.deepEqual(constrainActions(withMinion([EC,WW]),acts).map(a=>a.id),['o0','o1','o2']);
});

test('the option text states the card text and the friendly minion count', () => {
  const s=say(empty([EC]),{id:'o1',type:'POWER',option:1,entityId:8});
  assert.match(s,/Give your minions \+1\/\+1/);
  assert.match(s,/You control 0 minion\(s\)/);
});

// The bug this file exists to prevent a repeat of: the damage clock used to be one identical
// sentence appended to every option. A term that is constant across the whole option set
// cannot change their order, so "-- that is already lethal." on all six lines told a
// per-option scorer nothing, and Jev ended a won turn. Each option must now say something
// only true of itself.
test('the damage clock says something different on each option',()=>{
  const s={
    me:{playerId:1,board:[{entityId:1,name:"Gul'dan",CARDTYPE:'HERO'},
      {entityId:10,name:'Felbeast',CARDTYPE:'MINION',ATK:5,HEALTH:3},
      {entityId:11,name:'Felbeast',CARDTYPE:'MINION',ATK:4,HEALTH:3}],hand:[]},
    opponent:{board:[{entityId:99,name:'Uther',CARDTYPE:'HERO',HEALTH:9,DAMAGE:0}]}};
  const c=criteria(s,[{id:'o0',type:'END_TURN'},
    {id:'o1t0',entityId:10,targetId:99},{id:'o2t0',entityId:11,targetId:99}]);
  const texts=Object.values(c).map(o=>o.description);
  assert.equal(new Set(texts.map(t=>t.slice(t.indexOf('Damage clock')))).size,3,
    'every option repeated the same clock sentence');
  // END_TURN is the one option that has to state what it throws away.
  assert.match(c.o0.description,/ending the turn now gives up 9 damage/);
  assert.match(c.o0.description,/ending the turn now leaves it alive/);
  // An attack states its own share of the total.
  assert.match(c.o1t0.description,/this is 5 of the 9 damage still available/);
  assert.match(c.o2t0.description,/this is 4 of the 9 damage still available/);
});

test('short of lethal, no option claims a kill',()=>{
  const s={
    me:{playerId:1,board:[{entityId:1,CARDTYPE:'HERO'},{entityId:10,CARDTYPE:'MINION',ATK:2,HEALTH:2}],hand:[]},
    opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:9,DAMAGE:0}]}};
  const c=criteria(s,[{id:'o0',type:'END_TURN'},{id:'o1t0',entityId:10,targetId:99}]);
  assert.ok(Object.values(c).every(o=>!/enough to kill/.test(o.description)));
  assert.match(c.o0.description,/gives up 2 damage .*cannot be taken back\./);
});

test('card roles come from the text, not a list of card names',()=>{
  const r=c=>roles(c);
  assert.deepEqual(r({CARDTYPE:'MINION',text:'<b>Battlecry:</b> Choose a card in your hand to discard.'}),['discard outlet']);
  assert.deepEqual(r({CARDTYPE:'SPELL',text:'Discard your lowest Cost card. Give your minions +1/+1.'}),['discard outlet','buff']);
  assert.deepEqual(r({CARDTYPE:'SPELL',text:"Draw 3 cards. If you discard this, draw 3 cards."}),['discard fodder','draw']);
  assert.deepEqual(r({CARDTYPE:'MINION',RUSH:1,text:'[x]<b>Rush</b>'}),['rush']);
  assert.deepEqual(r({CARDTYPE:'MINION',text:'<b>Battlecry:</b> Deal 3 damage to your hero.'}),['plain minion']);
  // A counter reads the discards, it does not cause them.
  assert.deepEqual(r({CARDTYPE:'MINION',text:"<b>Rush</b> Has +2/+2 for each card you've discarded this game."}),['rush']);
});

test('hard-casting fodder names the outlets already in hand',()=>{
  const fodder={entityId:1,CARDTYPE:'MINION',name:'Walking Dead',COST:6,ATK:5,HEALTH:5,
                text:'If you discard this, summon it.'};
  const outlet={entityId:2,CARDTYPE:'MINION',name:'Ocular Occultist',COST:2,
                text:'<b>Battlecry:</b> Choose a card in your hand to discard.'};
  const board=[{entityId:9,CARDTYPE:'HERO',HEALTH:30}];
  const withOutlet=say({me:{hand:[fodder,outlet],board},opponent:{board:[]}},{entityId:1,type:'POWER'});
  assert.match(withOutlet,/Role: discard fodder\./);
  assert.match(withOutlet,/You also hold 1 discard outlet\(s\) -- Ocular Occultist -- and each would trigger this card's discard text without spending its 6 mana\./);
  const alone=say({me:{hand:[fodder],board},opponent:{board:[]}},{entityId:1,type:'POWER'});
  assert.match(alone,/No discard outlet is in your hand, so casting it is the only way to use it now\./);
});

test('buff and taunt are roles too',()=>{
  assert.deepEqual(roles({CARDTYPE:'SPELL',text:'Give your minions +1/+1.'}),['buff']);
  assert.deepEqual(roles({CARDTYPE:'SPELL',text:'+1/+1.'}),['buff']);
  assert.deepEqual(roles({CARDTYPE:'SPELL',text:'Discard your lowest Cost card. Give your minions +1/+1.'}),
    ['discard outlet','buff']);
  // A statline that grows is not a buff the card hands out.
  assert.deepEqual(roles({CARDTYPE:'MINION',text:"<b>Rush</b> Has +2/+2 for each card you've discarded this game."}),['rush']);
  assert.deepEqual(roles({CARDTYPE:'MINION',text:'<b>Taunt</b> <b>Battlecry:</b> Choose a card in your hand to discard.'}),
    ['discard outlet','taunt']);
  // Silence strips the keyword while the text still reads Taunt: trust the tag.
  assert.deepEqual(roles({CARDTYPE:'MINION',SILENCED:1,text:'<b>Taunt</b>'}),['plain minion']);
});

// 2026-09-24, game turn 5: Cursed Catacombs at 0 mana; Jev took Wicked Whispers over Disposable Acolytes.
const catacombs={me:{mana:0,hand:[],board:[]},opponent:{board:[]},
  choice:{id:4,type:'GENERAL',min:1,max:1,source:{entityId:33,name:'Cursed Catacombs',text:'<b>Discover</b> another\ncard from your deck. Make it <b>Temporary</b>.'},
    entities:[{entityId:94,name:'Platysaur',CARDTYPE:'MINION',COST:1,text:'Discard it.'},
              {entityId:95,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},
              {entityId:96,name:'Disposable Acolytes',CARDTYPE:'MINION',COST:2,text:'[x]When you play\nor discard this,\nsummon two random\n1-Cost minions.'}]}};
test('a Temporary pick says it cannot be cast and what its discard does', () => {
  const w=say(catacombs,{id:'c4e95',type:'CHOICE',entityId:95});
  assert.match(w,/Temporary: it is discarded at the end of this turn/);
  assert.match(w,/cannot be cast this turn/);
  assert.match(w,/Nothing happens when it is discarded/);
  assert.match(say(catacombs,{id:'c4e96',type:'CHOICE',entityId:96}),/pays out at end of turn even if never cast/);
});

// 2026-09-24, game turn 11: 3 mana, two 3-drops in hand, Jev chose Life Tap.
test('the hero power names the cards it prices out of the turn', () => {
  const s={me:{mana:3,hand:[{entityId:10,name:'Walking Dead',COST:3},{entityId:11,name:'Silverware Golem',COST:3},{entityId:12,name:"Hand of Gul'dan",COST:6}],
    board:[{entityId:2,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2,text:'<b>Hero Power</b>\nDraw a card and take $2 damage.'}]},opponent:{board:[]}};
  const d=say(s,{id:'o3',type:'POWER',entityId:2});
  assert.match(d,/Text: "Draw a card and take 2 damage."/);
  assert.match(d,/this leaves 1\. Castable now but not after it: Walking Dead \(3\); Silverware Golem \(3\)\./);
  assert.doesNotMatch(d,/Hand of Gul'dan/);
});
