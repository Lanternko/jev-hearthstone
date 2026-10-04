import test from 'node:test';
import assert from 'node:assert/strict';
import {buffImpact,describe} from '../src/describe.mjs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';

const continuity={entityId:1,name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,
 text:'Give your minions +1/+1. Shuffle two Shreds of Time into your deck.'};
const whispers={entityId:2,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,
 text:'Discard your lowest Cost card. Give your minions +1/+1.'};
const egg={entityId:3,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,ATK:0,HEALTH:2,
 text:'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'};
const tap={entityId:4,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'};
const state=(n=3,mana=4,hand=[continuity,egg])=>({me:{heroClass:'WARLOCK',mana,deckCount:20,hand,
 board:[{entityId:5,CARDTYPE:'HERO',HEALTH:30},tap,
 ...Array.from({length:n},(_,i)=>({entityId:10+i,CARDTYPE:'MINION',ATK:1,HEALTH:1}))]},
 opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30}]}});
const menu=s=>[{id:'end',type:'END_TURN'},{id:'tap',entityId:4},
 ...s.me.hand.filter(c=>c.COST<=s.me.mana).map(c=>({id:`play${c.entityId}`,entityId:c.entityId}))];

test('three bodies keep the one-mana buff ahead of Life Tap even without an exact mana spend',()=>{
 const s=state(),out=constrainActions(s,menu(s));
 assert.ok(!out.some(a=>a.entityId===continuity.entityId),'develop the affordable body before a planned buff');
 assert.ok(!out.some(a=>a.id==='tap'));
 assert.equal(prepare(s,out,{planner:false}).forced.action.entityId,egg.entityId);
 const below=state(2);
 assert.ok(constrainActions(below,menu(below)).some(a=>a.id==='tap'));
});

test('draw-three remains an alternative but cannot hide a productive cheap board buff',()=>{
 const soul={entityId:6,CARDTYPE:'SPELL',COST:2,text:'Draw 3 cards. They are Temporary.'};
 const s=state(3,4,[continuity,soul]),out=constrainActions(s,menu(s));
 assert.ok(out.some(a=>a.entityId===1)&&out.some(a=>a.entityId===6));
});

test('reserve both buffs before hard-casting an egg; keep body-first available when all three fit',()=>{
 const s=state(5,3,[continuity,whispers,egg]);
 assert.ok(!constrainActions(s,menu(s)).some(a=>a.entityId===egg.entityId));
 // A passive body with no discard outlet can precede a buff when both are affordable.
 const fits=state(3,3,[continuity,egg]);
 assert.ok(constrainActions(fits,menu(fits)).some(a=>a.entityId===egg.entityId));
});

test('game 51 discover takes Whispers, then Continuity, then Whispers discarding the egg',()=>{
 const s=state(5,2,[continuity,egg,{entityId:7,CARDTYPE:'SPELL',COST:4,name:'Soul Barrage'}]);
 const offeredEgg={...egg,entityId:8};
 s.choice={id:1,type:'GENERAL',source:{text:'Discover another card from your deck. Make it Temporary.'},
 entities:[offeredEgg,whispers,{entityId:9,CARDTYPE:'MINION',COST:3,ATK:3,text:'Taunt. Choose a card in your hand to discard.'}]};
 const picks=s.choice.entities.map(c=>({id:`pick${c.entityId}`,type:'CHOICE',entityId:c.entityId}));
 assert.deepEqual(constrainActions(s,picks).map(a=>a.entityId),[2]);
 assert.match(describe(s,picks[1]),/total \+12 Attack\/\+12 Health/);
 assert.match(describe(s,picks[1]),/second buff reaches 7 minions and discards Boneweb Egg/);
 delete s.choice;s.me.hand.push(whispers);
 const before=spendFirst(s,constrainActions(s,menu(s)));
 assert.deepEqual(before.map(a=>a.entityId),[1]);
 s.me.hand=s.me.hand.filter(c=>c.entityId!==1);s.me.mana=1;
 const after=spendFirst(s,constrainActions(s,menu(s)));
 assert.deepEqual(after.map(a=>a.entityId),[2]);
 const impact=buffImpact(s,whispers);
 assert.equal(impact.recipients,7);assert.equal(impact.attack,7);
});

test('buff arithmetic excludes dormant bodies, counts locations for space, and respects discard ties',()=>{
 const s=state(5,2,[whispers,egg]);
 s.me.board.push({entityId:20,CARDTYPE:'LOCATION'});
 assert.equal(buffImpact(s,whispers).recipients,6,'only one spider can fit');
 s.me.board[2].DORMANT=1;
 assert.equal(buffImpact(s,whispers).recipients,5,'dormant minion occupies a slot but gets no buff');
 s.me.hand.push({entityId:21,CARDTYPE:'SPELL',COST:2,text:'Draw a card.'});
 const tied=buffImpact(s,whispers);
 assert.equal(tied.added,0);assert.equal(tied.safeDiscard,false);
});

test('discover preference preserves urgent removal and does not affect choose-to-discard prompts',()=>{
 const s=state(5,2,[egg]);
 const removal={entityId:8,CARDTYPE:'SPELL',COST:1,text:'Deal 4 damage.'};
 s.choice={type:'GENERAL',source:{text:'Discover another card from your deck. Make it Temporary.'},entities:[whispers,removal]};
 const picks=s.choice.entities.map(c=>({type:'CHOICE',entityId:c.entityId}));
 assert.deepEqual(constrainActions(s,picks),picks);
 s.choice.source.text='Look at three cards in your hand. Choose one to discard, then draw two cards.';
 assert.ok(constrainActions(s,picks).some(a=>a.entityId===8));
});

test('model descriptions expose total buff value and do not call the heuristic a guaranteed result',()=>{
 const s=state(3);
 assert.match(describe(s,{entityId:1}),/total \+3 Attack\/\+3 Health/);
 assert.match(describe(s,{entityId:1}),/User tempo estimate: about 2.5 mana/);
 assert.match(describe(s,{entityId:4}),/known board gain takes priority/);
});

const acolytes={entityId:30,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,
 text:'When you play or discard this, summon two random 1-Cost minions.'};
const occultist={entityId:31,name:'Ocular Occultist',CARDTYPE:'MINION',COST:3,ATK:3,HEALTH:6,
 text:'Taunt. Battlecry: Choose a card in your hand to discard.'};
const platysaur={entityId:32,name:'Platysaur',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:2,
 text:'Battlecry: Draw a card. Deathrattle: Discard it.'};
const screenshot=()=>{
 const s=state(5,5,[continuity,acolytes,platysaur,occultist]);
 s.me.board[0].HEALTH=30;s.me.board[0].DAMAGE=12;
 s.me.board[3].ATK=0;s.me.board[3].HEALTH=2;
 s.me.board[4].ATK=3;s.me.board[4].HEALTH=6;s.me.board[4].DAMAGE=4;
 return s;
};

test('screenshot: Acolytes fill the two slots before Continuity despite a discard outlet and a draw minion',()=>{
 const s=screenshot(),actions=[...menu(s),{id:'discardAcolytes',entityId:31,targetId:30}];
 const out=constrainActions(s,actions);
 assert.ok(out.some(a=>a.entityId===30),'hard-cast Acolytes must not be protected as fodder');
 assert.equal(prepare(s,out).forced.action.entityId,30);
 assert.equal(prepare(s,out).forced.source,'buff_setup');
 // After random summons, observe the actual board again rather than inventing their stats.
 s.me.hand=s.me.hand.filter(c=>c.entityId!==30);s.me.mana=3;
 s.me.board.push({entityId:40,CARDTYPE:'MINION',ATK:1,HEALTH:2},
                 {entityId:41,CARDTYPE:'MINION',ATK:2,HEALTH:1});
 const next=[{id:'end',type:'END_TURN'},{id:'buff',entityId:1},{id:'tap',entityId:4}];
 assert.equal(prepare(s,constrainActions(s,next)).forced.action.entityId,1);
 assert.equal(buffImpact(s,continuity).recipients,7);
});

test('summon-buff setup must fit in both mana and slots, and cannot replace visible survival or lethal',()=>{
 const s=screenshot();s.me.mana=2;
 assert.equal(prepare(s,constrainActions(s,menu(s))).forced?.action.entityId,32,'one body plus buff still fits, even though Acolytes do not');
 s.me.mana=5;s.me.board.push({entityId:50,CARDTYPE:'LOCATION'});
 assert.equal(prepare(s,constrainActions(s,menu(s))).forced?.action.entityId,32,'use the single free slot rather than requiring seven bodies');
 const unsafe=screenshot();unsafe.me.board[0].DAMAGE=29;
 unsafe.opponent.board.push({entityId:60,CARDTYPE:'MINION',ATK:5,HEALTH:5});
 assert.notEqual(prepare(unsafe,constrainActions(unsafe,menu(unsafe))).forced?.source,'buff_setup');
 const lethal=screenshot();lethal.opponent.board[0].HEALTH=1;
 const full=[...menu(lethal),{id:'kill',entityId:10,targetId:99}];
 assert.equal(prepare(lethal,constrainActions(lethal,full)).forced.source,'forced_lethal');
 // No direct attack kills: searched buff-then-attack must beat the setup priority too.
 const planned=screenshot();planned.opponent.board[0].HEALTH=2;
 assert.equal(prepare(planned,constrainActions(planned,[...menu(planned),
   {id:'hit',entityId:10,targetId:99}])).lethal.source,'planned_lethal');
 const info=screenshot();info.me.hand.push({entityId:61,CARDTYPE:'SPELL',COST:0,text:'Discover a card.'});
 assert.notEqual(prepare(info,constrainActions(info,menu(info))).forced?.source,'buff_setup');
});
