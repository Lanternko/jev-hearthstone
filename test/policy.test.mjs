import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainActions,reliableOutletFor,deadWhispers,whispersWorthCasting,forcedAction,incomingDamage,myHeroHp,forbidsSelfDamage,taunted,deadCoin,spendableAt} from '../src/policy.mjs';
test('no low tempo opening never keeps four-cost weapon',()=>{
 const state={choice:{type:'MULLIGAN',entities:[{entityId:1,CARDTYPE:'MINION',COST:3},{entityId:2,CARDTYPE:'WEAPON',COST:4},{entityId:3,CARDTYPE:'MINION',COST:3}]}};
 const actions=Array.from({length:8},(_,mask)=>({replace:[1,2,3].filter((x,i)=>mask&(1<<i))}));
 assert.ok(constrainActions(state,actions).every(a=>a.replace.includes(2)));
});
test('only end-turn bypasses model entirely',()=>{
 const a={id:'o0',type:'END_TURN'};assert.equal(forcedAction({},[a]).action,a);assert.equal(forcedAction({},[a,{id:'o1'}]),null);
});

// The board that beat us: five attackers totalling 18 against 17 Health, with every option
// carrying the words "that is already lethal" -- and Jev answered END_TURN. Lethal is now
// settled before Jev is asked anything.
const lethalBoard=(hp,atks)=>({
 me:{board:atks.map((ATK,i)=>({entityId:10+i,CARDTYPE:'MINION',ATK}))},
 opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:hp,DAMAGE:0}]}
});
const swings=atks=>atks.map((_,i)=>({id:`o${i+1}t0`,entityId:10+i,targetId:99}));

test('a lethal board never reaches the model',()=>{
 const atks=[5,4,3,3,3];
 const f=forcedAction(lethalBoard(17,atks),[{id:'o0',type:'END_TURN'},...swings(atks)]);
 assert.equal(f.source,'forced_lethal');
 assert.equal(f.action.targetId,99);
 // Biggest swing first, purely so the sequence is deterministic.
 assert.equal(f.action.id,'o1t0');
});

test('one point short is still a judgement call',()=>{
 const atks=[5,4,3,3,3];
 assert.equal(forcedAction(lethalBoard(19,atks),[{id:'o0',type:'END_TURN'},...swings(atks)]),null);
});

test('damage that cannot reach the face is not lethal',()=>{
 // A Taunt means no option names the hero, so the face total is 0 however big the board is.
 const s=lethalBoard(2,[5,4]);
 s.opponent.board.push({entityId:77,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 const blocked=[{id:'o1t0',entityId:10,targetId:77},{id:'o2t0',entityId:11,targetId:77}];
 assert.equal(forcedAction(s,[{id:'o0',type:'END_TURN'},...blocked]),null);
});

test('armour counts toward the hero that has to be killed',()=>{
 const atks=[5,4];
 const s=lethalBoard(9,atks);s.opponent.board[0].ARMOR=1;
 assert.equal(forcedAction(s,[{id:'o0',type:'END_TURN'},...swings(atks)]),null);
});

test('a self-damaging hero power is off the table once their board already kills us',()=>{
  const state={
    me:{board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:26},
               {entityId:2,CARDTYPE:'HERO_POWER',text:'<b>Hero Power</b>\nDraw a card and take $2 damage.'},
               {entityId:3,CARDTYPE:'MINION',ATK:2}],hand:[]},
    opponent:{board:[{entityId:9,CARDTYPE:'HERO',ATK:0},
                     {entityId:10,CARDTYPE:'MINION',ATK:4},
                     {entityId:11,CARDTYPE:'MINION',ATK:1}]}
  };
  assert.equal(incomingDamage(state),5);
  assert.equal(myHeroHp(state),4);
  assert.equal(forbidsSelfDamage(state),true);
  const actions=[{id:'o1',entityId:2},{id:'o2',entityId:3}];
  assert.deepEqual(constrainActions(state,actions).map(a=>a.id),['o2']);
});

test('the same hero power stays available while the board cannot reach us',()=>{
  const state={
    me:{board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},
               {entityId:2,CARDTYPE:'HERO_POWER',text:'Draw a card and take $2 damage.'},
               {entityId:3,CARDTYPE:'MINION',ATK:2}],hand:[]},
    opponent:{board:[{entityId:10,CARDTYPE:'MINION',ATK:4}]}
  };
  assert.equal(forbidsSelfDamage(state),false);
  const actions=[{id:'o1',entityId:2},{id:'o2',entityId:3}];
  assert.deepEqual(constrainActions(state,actions).map(a=>a.id),['o1','o2']);
});

test('a Taunt in the way is health they must get through first',()=>{
  const base=hp=>({
    me:{board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:30-hp},
               {entityId:2,CARDTYPE:'HERO_POWER',text:'Draw a card and take $2 damage.'},
               {entityId:3,CARDTYPE:'MINION',ATK:2,HEALTH:5,DAMAGE:2,TAUNT:1}],hand:[]},
    opponent:{board:[{entityId:10,CARDTYPE:'MINION',ATK:4},{entityId:11,CARDTYPE:'MINION',ATK:1}]}
  });
  // 4 HP behind a 3-health Taunt: five damage is one short of getting through both.
  const safe=base(4);
  assert.equal(taunted(safe),3);
  assert.equal(forbidsSelfDamage(safe),false);
  assert.deepEqual(constrainActions(safe,[{id:'o1',entityId:2}]).map(a=>a.id),['o1']);
  // Same board, 2 HP: five damage clears the Taunt and the hero.
  const dead=base(2);
  assert.equal(forbidsSelfDamage(dead),true);
  assert.deepEqual(constrainActions(dead,[{id:'o1',entityId:2},{id:'o2',entityId:3}]).map(a=>a.id),['o2']);
});

test('the Coin is forbidden when the extra crystal buys nothing',()=>{
  const coin={entityId:1,name:'The Coin',cardId:'GAME_005',COST:0};
  const hp={entityId:2,CARDTYPE:'HERO_POWER',COST:2,EXHAUSTED:1};
  const big={entityId:3,CARDTYPE:'MINION',COST:6};
  const board=[{entityId:9,CARDTYPE:'HERO',HEALTH:30},hp];
  // One mana, a six-drop and a tapped-out hero power: two mana still casts nothing.
  const dead={me:{mana:1,hand:[coin,big],board},opponent:{board:[]}};
  assert.equal(deadCoin(dead),true);
  assert.deepEqual(constrainActions(dead,[{id:'o1',entityId:1},{id:'o0'}]).map(a=>a.id),['o0']);
  // Same mana, a two-drop in hand: the crystal reaches it, so the Coin is allowed.
  const live={me:{mana:1,hand:[coin,{entityId:4,CARDTYPE:'MINION',COST:2}],board},opponent:{board:[]}};
  assert.equal(deadCoin(live),false);
  assert.deepEqual(constrainActions(live,[{id:'o1',entityId:1},{id:'o0'}]).map(a=>a.id),['o1','o0']);
  // A usable hero power is enough on its own.
  const tap={me:{mana:1,hand:[coin,big],board:[{entityId:9,CARDTYPE:'HERO',HEALTH:30},{entityId:2,CARDTYPE:'HERO_POWER',COST:2}]},opponent:{board:[]}};
  assert.equal(spendableAt(tap,2),true);
  assert.equal(spendableAt(tap,1),false);
});

test('a dormant or frozen body is not incoming damage (game 4, turn 15)',()=>{
  // The board that banned Life Tap on a turn that was never lethal: 17 attack that could swing,
  // plus 9 attack asleep in two dormant Dreadseeds, against 19 health.
  const state={
    me:{board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:11},
               {entityId:2,CARDTYPE:'HERO_POWER',text:'<b>Hero Power</b>\nDraw a card and take $2 damage.'},
               {entityId:3,CARDTYPE:'MINION',ATK:1,HEALTH:2}],hand:[]},
    opponent:{board:[{entityId:9,CARDTYPE:'HERO',ATK:0},
                     {entityId:10,CARDTYPE:'MINION',name:"The Legion's Bane",ATK:17},
                     {entityId:11,CARDTYPE:'MINION',name:'Serpent Dreadseed',ATK:5,DORMANT:1},
                     {entityId:12,CARDTYPE:'MINION',name:'Hound Dreadseed',ATK:4,DORMANT:1}]}
  };
  assert.equal(myHeroHp(state),19);
  assert.equal(incomingDamage(state),17);
  assert.equal(forbidsSelfDamage(state),false);
  assert.deepEqual(constrainActions(state,[{id:'o1',entityId:2},{id:'o2',entityId:3}]).map(a=>a.id),['o1','o2']);
  // Wake them and it is lethal after all.
  const awake=structuredClone(state);
  for(const c of awake.opponent.board)delete c.DORMANT;
  assert.equal(incomingDamage(awake),26);
  assert.equal(forbidsSelfDamage(awake),true);
  // Frozen counts the same way: it misses the swing that matters.
  const frozen=structuredClone(awake);
  frozen.opponent.board.find(c=>c.entityId===10).FROZEN=1;
  assert.equal(incomingDamage(frozen),9);
});

// User ruling, third game running: with a discard outlet in hand, hard-casting a card that pays
// out when discarded is a strict error, and the option is to be taken away rather than argued
// against. Which outlets count is the user's own line: only the ones that reliably hit the card.
const GULDAN={entityId:1,name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'};
const BARRAGE={entityId:2,name:'Soul Barrage',CARDTYPE:'SPELL',COST:4,text:'When you play or discard this, deal $5 damage randomly split among all enemies.'};
const OCCULTIST={entityId:3,name:'Ocular Occultist',CARDTYPE:'MINION',COST:3,text:'<b>Taunt</b>\n<b>Battlecry:</b> Choose a card in your hand to discard.'};
const CHAMBER={entityId:4,name:'Chamber of Viscidus',CARDTYPE:'LOCATION',COST:3,text:'Look at 3 cards in your hand and choose one to discard. Draw two cards.'};
const CLAWS={entityId:5,name:'Chronoclaws',CARDTYPE:'WEAPON',COST:4,ATK:3,text:'After your hero attacks, discard your highest Cost card.'};
const SOULARIUM={entityId:6,name:'The Soularium',CARDTYPE:'SPELL',COST:2,text:'Draw 3 cards. They are <b>Temporary</b>.'};
const FILLER=n=>({entityId:100+n,name:`Voidwalker ${n}`,CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:3,text:'<b>Taunt</b>'});
const hand=(cards,board=[])=>({me:{mana:10,hand:cards,board},opponent:{board:[]}});
const ids=(state,cards)=>constrainActions(state,cards.map(c=>({id:`o${c.entityId}`,entityId:c.entityId}))).map(a=>a.id);

test('a free-choice outlet in hand blocks hard-casting the fodder (game 4, turns 5 and 7)',()=>{
  const h=[GULDAN,OCCULTIST,FILLER(1)];
  // The Occultist chooses any card in hand, so it always reaches Hand of Gul'dan. Casting it for
  // six mana buys what the Occultist gives away for nothing.
  assert.deepEqual(ids(hand(h),h),['o3','o101']);
  assert.equal(reliableOutletFor(hand(h),GULDAN)?.entityId,3);
  // No outlet, and casting it is the only way to use it.
  const alone=[GULDAN,FILLER(1)];
  assert.deepEqual(ids(hand(alone),alone),['o1','o101']);
  assert.equal(reliableOutletFor(hand(alone),GULDAN),null);
});

test('a look-at-3 outlet blocks only while at most two cards in hand are not fodder',()=>{
  // Three cards are shown out of the hand the Chamber leaves behind; with two non-fodder cards
  // left, one of the three must be fodder. A third non-fodder card and it is a gamble again.
  const tight=[GULDAN,BARRAGE,CHAMBER,SOULARIUM,FILLER(1)];
  assert.equal(reliableOutletFor(hand(tight),GULDAN)?.entityId,4);
  const loose=[...tight,FILLER(2)];
  assert.equal(reliableOutletFor(hand(loose),GULDAN),null);
  // Game-10 ruling on top: the cards that draw go first either way, so the menu is those two.
  assert.deepEqual(ids(hand(tight),tight),['o4','o6']);
  assert.deepEqual(ids(hand(loose),loose),['o4','o6']);
});

test('a highest-cost outlet blocks only while the fodder is the dearest thing in hand',()=>{
  // Chronoclaws discards the highest-cost card after a swing, so it reaches Hand of Gul'dan at
  // six and nothing else. It counts equipped as well as in hand: the text is already on the board.
  const equipped=[GULDAN,BARRAGE,FILLER(1)];
  assert.deepEqual(ids(hand(equipped,[CLAWS]),equipped),['o2','o101']);
  // Soul Barrage at four is not the highest, so casting it stays Jev's call.
  assert.equal(reliableOutletFor(hand(equipped,[CLAWS]),BARRAGE),null);
  // A dearer non-fodder card in hand and even Gul'dan is a coin flip.
  const outbid=[...equipped,{entityId:7,name:'Sludge Slurper',CARDTYPE:'MINION',COST:7,text:'<b>Taunt</b>'}];
  assert.equal(reliableOutletFor(hand(outbid,[CLAWS]),GULDAN),null);
  // A tie with another fodder card is still fine: whichever it takes, it pays out.
  const tied=[GULDAN,{...BARRAGE,COST:6},FILLER(1)];
  assert.equal(reliableOutletFor(hand(tied,[CLAWS]),GULDAN)?.entityId,5);
});

test('blocking the fodder never leaves Jev with nothing to pick',()=>{
  const h=[GULDAN,OCCULTIST];
  const only=[{id:'o1',entityId:1}];
  assert.deepEqual(constrainActions(hand(h),only),only);
});

// Wicked Whispers, the user's three rulings. The cards it is fine to lose -- Disposable
// Acolytes, Boneweb Egg, Silverware Golem, Walking Dead -- all put a body on the board when
// discarded, and the buff then lands on that body too.
const WHISPERS={entityId:8,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'};
const EGG={entityId:9,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,ATK:1,HEALTH:3,text:'[x]<b>Deathrattle:</b> Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'};
const GOLEM={entityId:10,name:'Silverware Golem',CARDTYPE:'MINION',COST:3,ATK:3,HEALTH:4,text:'If you discard this minion, summon it.'};
const body=n=>({entityId:200+n,CARDTYPE:'MINION',ATK:2,HEALTH:2});

test('whispers reaches the fodder only when the fodder is the cheapest card in hand',()=>{
  const cheaper=[WHISPERS,EGG,FILLER(1)];                    // the 1-cost filler goes first
  const short=hand(cheaper);short.me.mana=1;                 // ...unless it can be cast before
  assert.equal(reliableOutletFor(short,EGG),null);
  const spell=[WHISPERS,EGG,{...FILLER(1),CARDTYPE:'SPELL',text:'Draw a card.'}];
  assert.equal(reliableOutletFor(hand(spell),EGG),null);     // a cheaper non-body always blocks
  const dearest=[WHISPERS,EGG,{...FILLER(1),COST:3}];        // now the Egg is the cheapest
  assert.equal(reliableOutletFor(hand(dearest),EGG)?.entityId,8);
  const poor=(...a)=>{const x=hand(...a);x.me.mana=Math.min(...a[0].map(c=>c.COST??0).filter(Boolean).slice(1));return x}; // room for one card, so whispersWaits stays out of it
  assert.deepEqual(ids(poor(dearest),dearest),['o8','o101']);
  // The Golem at three is not reached while the Egg at two sits beside it.
  const both=[WHISPERS,EGG,GOLEM];
  assert.equal(reliableOutletFor(hand(both),GOLEM),null);
  assert.equal(reliableOutletFor(hand(both),EGG)?.entityId,8);
});

test('whispers is off the table with no board and a real card as the cheapest',()=>{
  // Nothing to buff and a card thrown away for it: both halves do nothing.
  const loss=[WHISPERS,FILLER(1)];
  assert.deepEqual(ids(hand(loss),loss),['o101']);
  // The cheapest card pays out when discarded, so the discard half still works -- and the Egg
  // itself is then hard-cast for nothing, which the outlet rule above already takes away.
  const payoff=[WHISPERS,EGG];
  assert.deepEqual(ids(hand(payoff),payoff),['o8']);
  // One body on board and the buff half works, whatever it eats.
  const one1=hand(loss,[body(1)]);one1.me.mana=1;
  assert.deepEqual(ids(one1,loss),['o8','o101']);
  // A tie it might survive is Jev's call, not ours.
  const tied=[WHISPERS,FILLER(1),{...EGG,COST:1}];
  const t1=hand(tied);t1.me.mana=1;
  assert.ok(ids(t1,tied).includes('o8'));
});

// 2026-09-25 game, our 3rd turn: 3 mana, Whispers, Acolytes, Party Fiend in hand, one body out.
// Jev cast Whispers first; the user's line is Fiend, then Whispers eating Acolytes.
const ACOLYTES={entityId:11,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,text:'Summon two 1/1 Acolytes. If you discard this, summon them.'};
const FIEND={entityId:12,name:'Party Fiend',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:1,text:'<b>Battlecry:</b> Summon two 1/1 Felhounds.'};
const TAP={entityId:13,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'};
test('bodies go down before whispers',()=>{
  const h=[WHISPERS,ACOLYTES,FIEND,{...GULDAN,entityId:14}];
  const s=hand(h,[body(1),TAP]);s.me.mana=3;
  const menu=[{id:'end',type:'END_TURN'},...h.slice(0,3).map(c=>({id:`o${c.entityId}`,entityId:c.entityId})),{id:'o13',entityId:13}];
  const c=constrainActions(s,menu);
  assert.deepEqual(c.map(a=>a.id),['end','o12','o13']);  // Acolytes waits to be eaten
  assert.deepEqual(spendFirst(s,c).map(a=>a.id),['o12']); // and Life Tap would price the line out
  // Fiend played, 2 mana left: now Whispers, eating Acolytes.
  const after=hand([WHISPERS,ACOLYTES,{...GULDAN,entityId:14}],[body(1),body(2),TAP]);after.me.mana=2;
  assert.deepEqual(constrainActions(after,menu.filter(a=>a.id!=='o12')).map(a=>a.id),['end','o8','o13']);
  // No room for both: Whispers would eat the Fiend. Game 12's ruling covers this -- cast the Fiend,
  // and Whispers is left to eat the Acolytes on a later turn.
  const tight=hand(h,[body(1)]);tight.me.mana=1;
  assert.deepEqual(constrainActions(tight,menu).map(a=>a.id).filter(id=>id==='o8'||id==='o12'),['o12']);
});

test('three bodies out and whispers in hand takes END_TURN away',()=>{
  const h=[WHISPERS,FILLER(1)];
  const board=[body(1),body(2),body(3)];
  const acts=[{id:'o8',entityId:8},{id:'o101',entityId:101},{id:'end',type:'END_TURN'}];
  const full=hand(h,board);full.me.mana=1;                // room for one card, so Whispers is not waiting
  assert.deepEqual(constrainActions(full,acts).map(a=>a.id),['o8','o101']);
  // Two bodies is the user's line, and below it ending the turn stays legal.
  assert.ok(constrainActions(hand(h,[body(1),body(2)]),acts).map(a=>a.id).includes('end'));
  // No mana for it and there is nothing to stay for.
  const dry={...hand(h,board)};dry.me.mana=0;
  assert.ok(constrainActions(dry,acts).map(a=>a.id).includes('end'));
  // Never leaves the turn with no way out.
  assert.deepEqual(constrainActions(hand(h,board),[{id:'end',type:'END_TURN'}]).map(a=>a.id),['end']);
});
test('a Temporary pick that cannot be cast keeps only the picks that pay out from the discard',()=>{
 const src={name:'Cursed Catacombs',text:'Discover another card from your deck. Make it <b>Temporary</b>.'};
 const entities=[{entityId:94,COST:1,text:'Discard it.'},{entityId:95,COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},{entityId:96,COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'}];
 const actions=entities.map(e=>({id:`c4e${e.entityId}`,type:'CHOICE',entityId:e.entityId}));
 const at=mana=>constrainActions({me:{mana},choice:{type:'GENERAL',source:src,entities}},actions).map(a=>a.id);
 assert.deepEqual(at(0),['c4e96']);
 assert.equal(at(1).length,3,'with a castable pick Jev still decides');
 assert.equal(constrainActions({me:{mana:0},choice:{type:'GENERAL',entities}},actions).length,3,'not Temporary: untouched');
});

// Live 2026-09-24 against Innkeeper Warlock: Acolytes let everything stay, Soulfire included.
test('mulligan throws back everything but the opening whitelist',()=>{
 const entities=[{entityId:11,CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'},
  {entityId:4,CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},
  {entityId:5,CARDTYPE:'SPELL',COST:1,text:'Deal $4 damage. Discard a random card.'},
  {entityId:18,CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'}];
 const ids=[11,4,5,18];
 const actions=Array.from({length:16},(_,mask)=>({replace:ids.filter((x,i)=>mask&(1<<i))}));
 const out=constrainActions({choice:{type:'MULLIGAN',entities}},actions);
 assert.ok(out.length>0&&out.every(a=>[4,5,18].every(id=>a.replace.includes(id))));
 assert.ok(out.some(a=>!a.replace.includes(11)),'Acolytes may stay');
});

test('mulligan follows the opening-hand win rates where a card has one',()=>{
 const entities=[
  {entityId:1,name:'Cursed Catacombs',CARDTYPE:'SPELL',COST:0,text:'Discover another card from your deck. Make it Temporary.'},  // 71.9 keep
  {entityId:2,name:'Ocular Occultist',CARDTYPE:'MINION',COST:3,text:'Taunt Battlecry: Choose a card in your hand to discard.'},  // 70.7 keep
  {entityId:3,name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'},             // 62.5 toss
  {entityId:4,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,text:'Deathrattle: Summon two 1/2 Spiders. If you discard this, trigger its Deathrattle.'}]; // 64.2 free
 const ids=[1,2,3,4];
 const actions=Array.from({length:16},(_,mask)=>({replace:ids.filter((x,i)=>mask&(1<<i))}));
 const out=constrainActions({choice:{type:'MULLIGAN',entities}},actions);
 assert.ok(out.every(a=>a.replace.includes(3)&&!a.replace.includes(1)&&!a.replace.includes(2)));
 assert.deepEqual(out.map(a=>a.replace.includes(4)).sort(),[false,true],'the middle band is Jev\'s call');
});

test('burn goes face only when it finishes the game',()=>{
 const soulfire={entityId:5,CARDTYPE:'SPELL',COST:1,text:'Deal $4 damage. Discard a random card.'};
 const st=hp=>({me:{mana:2,hand:[soulfire],board:[{entityId:10,CARDTYPE:'MINION',ATK:3}]},
  opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:hp,DAMAGE:0},{entityId:50,CARDTYPE:'MINION',ATK:2,HEALTH:2}]}});
 const acts=[{id:'o0',type:'END_TURN'},{id:'o1t0',entityId:5,targetId:99},{id:'o1t1',entityId:5,targetId:50},{id:'o2t0',entityId:10,targetId:99}];
 assert.ok(!constrainActions(st(30),acts).some(a=>a.id==='o1t0'),'no face at 30');
 assert.ok(constrainActions(st(30),acts).some(a=>a.id==='o1t1'),'the minion is still a target');
 assert.ok(constrainActions(st(7),acts).some(a=>a.id==='o1t0'),'4 + 3 on board kills 7');
});

test('a hero attack into Attack >= its Health is never offered',()=>{
  const state={me:{board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:25,ATK:4}],hand:[]},
    opponent:{board:[{entityId:2,CARDTYPE:'HERO',HEALTH:30},{entityId:40,CARDTYPE:'MINION',ATK:7,HEALTH:4},{entityId:41,CARDTYPE:'MINION',ATK:2,HEALTH:2}]}};
  const acts=[{id:'o0',type:'END_TURN'},{id:'o4t0',type:'POWER',entityId:1,targetId:40},{id:'o4t1',type:'POWER',entityId:1,targetId:41}];
  assert.deepEqual(constrainActions(state,acts).map(a=>a.id),['o0','o4t1']);
});

// Game 3 (2026-09-24), turn 11: full board, six crystals, two Bananas and Life Tap castable --
// and END_TURN won because Bananas was split over sixteen target options.
import {spendFirst} from '../src/policy.mjs';
const spendBoard=({mana=6,hp=30,theirAtk=3,hand}={})=>({
 me:{mana,hand:hand??[{entityId:85,name:'Bananas',text:'Give a minion +1/+1.',COST:1,CARDTYPE:'SPELL'}],
  board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,DAMAGE:30-hp},
         {entityId:2,CARDTYPE:'HERO_POWER',COST:2,text:'<b>Hero Power</b>\nDraw a card and take $2 damage.'},
         {entityId:10,CARDTYPE:'MINION',ATK:3}]},
 opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0},{entityId:98,CARDTYPE:'MINION',ATK:theirAtk,HEALTH:3}]}
});
const turnMenu=[{id:'o0',type:'END_TURN'},{id:'o1t0',type:'POWER',entityId:85,targetId:10},
 {id:'o2',type:'POWER',entityId:2},{id:'o3t0',type:'POWER',entityId:10,targetId:99},{id:'o3t1',type:'POWER',entityId:10,targetId:98}];
const idsOf=a=>a.map(x=>x.id).sort();

test('cards and a safe hero power come before any attack or END_TURN',()=>{
 assert.deepEqual(idsOf(spendFirst(spendBoard(),turnMenu)),['o1t0','o2']);
});
test('the hero power waits while its mana would price out a card',()=>{
 assert.deepEqual(idsOf(spendFirst(spendBoard({mana:2}),turnMenu)),['o1t0']);
});
test('with the hand spent, a safe tap still comes before attacks and END_TURN',()=>{
 const m=turnMenu.filter(a=>a.entityId!==85);
 assert.deepEqual(idsOf(spendFirst(spendBoard({hand:[]}),m)),['o2']);
});
test('a tap into their board is never forced: attacks and END_TURN stay',()=>{
 const m=turnMenu.filter(a=>a.entityId!==85);
 assert.deepEqual(idsOf(spendFirst(spendBoard({hand:[],hp:5,theirAtk:4}),m)),idsOf(m));
});
test('the Coin and discard outlets are not forced spend',()=>{
 const hand=[{entityId:85,name:'The Coin',cardId:'GAME_005',COST:0,CARDTYPE:'SPELL'},
  {entityId:86,name:'Soulfire',text:'Deal $4 damage. Discard a random card.',COST:1,CARDTYPE:'SPELL'}];
 const m=[{id:'o0',type:'END_TURN'},{id:'o1',type:'POWER',entityId:85},{id:'o4t0',type:'POWER',entityId:86,targetId:98},
  {id:'o3t0',type:'POWER',entityId:10,targetId:99}];
 assert.deepEqual(idsOf(spendFirst(spendBoard({hand,hp:5,theirAtk:4}),m)),idsOf(m));
});
test('a battlecry picking a card in hand is not an attack (game 1, turn 11)',()=>{
 const s=spendBoard({mana:3,hand:[{entityId:5,name:"Hand of Gul'dan",text:'When you play or discard this, draw 3 cards.',COST:6,CARDTYPE:'SPELL'}]});
 s.me.board.push({entityId:6,name:'Ocular Occultist',CARDTYPE:'MINION',ATK:3});
 const m=[{id:'o0',type:'END_TURN'},{id:'o5t1',type:'POWER',entityId:6,targetId:5},{id:'o3t0',type:'POWER',entityId:10,targetId:99}];
 assert.ok(spendFirst(s,m).some(a=>a.id==='o5t1'));
});
test('an open choice is left alone',()=>{
 const s={...spendBoard(),choice:{type:'DISCOVER'}};
 assert.equal(spendFirst(s,turnMenu),turnMenu);
});

// 2026-09-25, game 4. Turn 2: 2 mana, Occultist (3) in hand beside Acolytes, Acolytes and Egg.
// Turn 3: Occultist with no board of ours discarded Hand of Gul'dan over the bodies.
const occultist={entityId:9,name:'Ocular Occultist',CARDTYPE:'MINION',COST:3,text:'<b>Taunt</b> <b>Battlecry:</b> Choose a card in your hand to discard.'};
const acolytes=id=>({entityId:id,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'});
const egg={entityId:32,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,text:'<b>Deathrattle:</b> Summon two 2/1 Spiders. If you discard this, trigger its <b>Deathrattle</b>.'};
const hog={entityId:5,name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'};
const board=[{entityId:64,CARDTYPE:'HERO',HEALTH:30},{entityId:65,CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'}];
test('an outlet out of reach this turn, with fodder to spare, does not hold the fodder back',()=>{
 const state={me:{mana:2,board,hand:[occultist,acolytes(6),egg,acolytes(29)]},opponent:{board:[]}};
 const acts=[{id:'o0',type:'END_TURN'},{id:'hp',entityId:65},{id:'a',entityId:6},{id:'e',entityId:32},{id:'b',entityId:29}];
 assert.deepEqual(constrainActions(state,acts).map(a=>a.id),['o0','hp','a','e','b']);
 // The last fodder card stays protected, and so does any fodder once the outlet is castable.
 const last={me:{mana:2,board,hand:[occultist,acolytes(6)]},opponent:{board:[]}};
 assert.ok(!constrainActions(last,acts).some(a=>a.id==='a'));
 const castable={me:{mana:3,board,hand:[occultist,acolytes(6),egg,acolytes(29)]},opponent:{board:[]}};
 assert.ok(!constrainActions(castable,acts).some(a=>['a','e','b'].includes(a.id)));
});
test('with no board, the Occultist discards a card that makes bodies',()=>{
 const state={me:{mana:3,board,hand:[hog,occultist,acolytes(6),egg]},opponent:{board:[]}};
 const acts=[5,6,32].map(t=>({id:'t'+t,entityId:9,targetId:t}));
 assert.deepEqual(constrainActions(state,acts).map(a=>a.id),['t6','t32']);
 const held={...state,me:{...state.me,board:[...board,{entityId:70,CARDTYPE:'MINION',ATK:2,HEALTH:2}]}};
 assert.equal(constrainActions(held,acts).length,3);
 // Their hero in burn range: drawing for the kill is back on the table.
 const close={...state,opponent:{board:[{entityId:80,CARDTYPE:'HERO',HEALTH:30,DAMAGE:20}]}};
 assert.equal(constrainActions(close,acts).length,3);
});

// 2026-09-25, game 6, turn 1: Soulfire's only offered target was our own hero -- the enemy face was
// cut as "wasted burn" on an empty board. User ruling: 「要攻擊選擇對手的臉」.
const soulfire={entityId:10,name:'Soulfire',CARDTYPE:'SPELL',COST:1,text:'Deal $4 damage. Discard a random card.'};
const burnMenu=[{id:'o0',type:'END_TURN'},{id:'o1t0',type:'POWER',entityId:10,targetId:66},{id:'o1t1',type:'POWER',entityId:10,targetId:68}];
const burnState=theirs=>({me:{mana:1,hand:[soulfire,{entityId:11,CARDTYPE:'MINION',COST:3}],board:[{entityId:66,CARDTYPE:'HERO',HEALTH:30}]},
 opponent:{board:[{entityId:68,CARDTYPE:'HERO',HEALTH:30},...theirs]}});
test('burn never goes to our own face, and goes to theirs on an empty board',()=>{
 assert.deepEqual(constrainActions(burnState([]),burnMenu).map(a=>a.id),['o0','o1t1']);
});
test('burn to a non-lethal face is still cut while they have minions',()=>{
 const m=[...burnMenu,{id:'o1t2',type:'POWER',entityId:10,targetId:70}];
 const ids=constrainActions(burnState([{entityId:70,CARDTYPE:'MINION',ATK:2,HEALTH:2}]),m).map(a=>a.id);
 assert.ok(!ids.includes('o1t0')&&!ids.includes('o1t1')&&ids.includes('o1t2'));
});

// Game 6, turn 5: five on board, Party Fiend (3 bodies) played into 2 slots before the attacks
// cleared any. User ruling: 「先解牌空出位置，再打派對惡魔」.
const fiend={entityId:20,name:'Party Fiend',CARDTYPE:'MINION',COST:1,text:'<b>Battlecry:</b> Summon two 1/1 Felbeasts. Deal 2 damage to your hero.'};
const crowded=n=>({me:{mana:5,hand:[fiend],board:[{entityId:66,CARDTYPE:'HERO',HEALTH:30},
 ...Array.from({length:n},(_,i)=>({entityId:30+i,CARDTYPE:'MINION',ATK:1,HEALTH:1}))]},
 opponent:{board:[{entityId:68,CARDTYPE:'HERO',HEALTH:30},{entityId:70,CARDTYPE:'MINION',ATK:1,HEALTH:1}]}});
const fiendMenu=[{id:'o0',type:'END_TURN'},{id:'o1',type:'POWER',entityId:20},{id:'o2t0',type:'POWER',entityId:30,targetId:70}];
test('a multi-body card that would overflow the board waits for the attacks',()=>{
 assert.ok(!constrainActions(crowded(5),fiendMenu).some(a=>a.id==='o1'));
});
test('with room for every body, or nothing to attack with, it is played',()=>{
 assert.ok(constrainActions(crowded(4),fiendMenu).some(a=>a.id==='o1'));
 assert.ok(constrainActions(crowded(5),fiendMenu.filter(a=>a.id!=='o2t0')).some(a=>a.id==='o1'));
});
test('with a hand of nothing but fodder, a discarding burn may still go face',()=>{
 const s=burnState([{entityId:70,CARDTYPE:'MINION',ATK:2,HEALTH:2}]);
 s.me.hand=[soulfire,{entityId:11,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'}];
 const ids=constrainActions(s,[...burnMenu,{id:'o1t2',type:'POWER',entityId:10,targetId:70}]).map(a=>a.id);
 assert.ok(ids.includes('o1t1')&&!ids.includes('o1t0'));
});

// User ruling (2026-09-25, after game 6): 低語+侍僧；魔眼+殭屍；派對+buff stay together.
test('opening combos stay together, over the win-rate bands',()=>{
 const card=(entityId,name,CARDTYPE,COST,text)=>({entityId,name,CARDTYPE,COST,text});
 const whispers=card(1,'Wicked Whispers','SPELL',1,'Discard your lowest Cost card. Give your minions +1/+1.');
 const acolytes=card(2,'Disposable Acolytes','SPELL',2,'When you play or discard this, summon two random 1-Cost minions.');
 const soulfire=card(3,'Soulfire','SPELL',1,'Deal $4 damage. Discard a random card.');
 const run=entities=>{
  const ids=entities.map(c=>c.entityId);
  const actions=Array.from({length:1<<ids.length},(_,mask)=>({replace:ids.filter((x,i)=>mask&(1<<i))}));
  return constrainActions({choice:{type:'MULLIGAN',entities}},actions);
 };
 assert.deepEqual(run([whispers,acolytes,soulfire]).map(a=>a.replace),[[3]]);
 const occ=card(4,'Ocular Occultist','MINION',3,'Taunt Battlecry: Choose a card in your hand to discard.');
 const dead=card(5,'Walking Dead','MINION',3,'Taunt If you discard this minion, summon it.');
 assert.ok(run([occ,dead,soulfire]).every(a=>!a.replace.includes(5)));
 const fiend=card(6,'Party Fiend','MINION',1,'Battlecry: Summon two 1/1 Felbeasts. Deal 2 damage to your hero.');
 const cont=card(7,'Entropic Continuity','SPELL',2,'Give your minions +1/+1.');
 assert.ok(run([fiend,cont,soulfire]).every(a=>!a.replace.includes(7)&&a.replace.includes(3)));
 // Without its partner, a middle-band card is still Jev's call.
 assert.deepEqual(run([whispers,soulfire]).map(a=>a.replace.includes(1)).sort(),[false,true]);
});

// Game 7 rulings: Soul Barrage (65.2%) is tossed; with a low board, Chamber of Viscidus discards Walking Dead.
test('a middle-band card almost nobody keeps goes back; a 4-drop stays only beside a cheap card',()=>{
 const card=(entityId,name,COST)=>({entityId,name,CARDTYPE:'SPELL',COST,text:''});
 const run=entities=>{
  const ids=entities.map(c=>c.entityId);
  return constrainActions({choice:{type:'MULLIGAN',entities}},Array.from({length:1<<ids.length},(_,m)=>({replace:ids.filter((x,i)=>m&(1<<i))})));
 };
 // Soul Barrage: 65.2% but kept by 18% -- always tossed.
 assert.ok(run([card(1,'Soul Barrage',4),card(2,'Boneweb Egg',2)]).every(a=>a.replace.includes(1)));
 // Duke of Below is already a toss; a middle-band 4-drop needs a cheap card kept beside it.
 const fake={entityId:3,name:'Unknown Four',CARDTYPE:'MINION',COST:4,text:'Taunt'};
 const dead=card(4,'Walking Dead',3);dead.CARDTYPE='MINION';
 const out=constrainActions({choice:{type:'MULLIGAN',entities:[fake,dead]}},[{replace:[]},{replace:[3]},{replace:[4]},{replace:[3,4]}]);
 assert.ok(out.every(a=>a.replace.includes(3)),'no card of 2 or less: the 4-drop goes');
});
test('a choose-to-discard pick on a low board takes the card that summons itself',()=>{
 const entities=[
  {entityId:85,name:'Walking Dead',CARDTYPE:'MINION',COST:3,text:'<b>Taunt</b>\nIf you discard this minion, summon it.'},
  {entityId:88,name:'Soul Barrage',CARDTYPE:'SPELL',COST:4,text:'When you play\nor discard this, deal $5 damage randomly split among all enemies.'},
  {entityId:91,name:'Platysaur',CARDTYPE:'MINION',COST:1,text:'<b>Battlecry:</b> Draw a card. <b>Deathrattle:</b> Discard it.'}];
 const source={name:'Chamber of Viscidus',text:'[x]Look at 3 cards in your\nhand and choose one to\ndiscard. Draw two cards.'};
 const actions=entities.map(c=>({id:`c3e${c.entityId}`,type:'CHOICE',entityId:c.entityId}));
 const s=n=>({me:{mana:0,board:Array.from({length:n},(_,i)=>({entityId:200+i,CARDTYPE:'MINION'}))},
  opponent:{board:[{entityId:66,CARDTYPE:'HERO',HEALTH:30}]},choice:{type:'GENERAL',source,entities}});
 assert.deepEqual(constrainActions(s(1),actions).map(a=>a.id),['c3e85']);
 assert.equal(constrainActions(s(3),actions).length,3,'a full enough board leaves it to Jev');
});
test('a discard pick clears a swarm with Soul Barrage, else weighs bodies against the buff in hand',()=>{
 const E=[
  {entityId:85,name:'Walking Dead',CARDTYPE:'MINION',COST:3,text:'<b>Taunt</b>\nIf you discard this minion, summon it.'},
  {entityId:88,name:'Soul Barrage',CARDTYPE:'SPELL',COST:4,text:'When you play\nor discard this, deal $5 damage randomly split among all enemies.'},
  {entityId:92,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'}];
 const source={name:'Chamber of Viscidus',text:'Look at 3 cards in your hand and choose one to discard. Draw two cards.'};
 const actions=E.map(c=>({id:`c${c.entityId}`,type:'CHOICE',entityId:c.entityId}));
 const s=(foes,hand=[])=>({me:{mana:0,hand,board:[{entityId:200,CARDTYPE:'MINION'}]},
  opponent:{board:[{entityId:66,CARDTYPE:'HERO',HEALTH:30},...foes.map((h,i)=>({entityId:300+i,CARDTYPE:'MINION',HEALTH:h}))]},
  choice:{type:'GENERAL',source,entities:E}});
 const ids=st=>constrainActions(st,actions).map(a=>a.id);
 assert.deepEqual(ids(s([1,2,2])),['c88'],'three small enemy minions: Soul Barrage');
 assert.deepEqual(ids(s([5])),['c85'],'no buff: the big body');
 const whispers={entityId:9,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'};
 assert.deepEqual(ids(s([5],[whispers])),['c92'],'buff in hand: the wide pick');
});

// Game 8 ruling: Soul Barrage into an empty board with the enemy at 30 is only face damage.
test('a random-split spell waits while the enemy has no minions and is far from lethal',()=>{
 const foe=(hp,minions=[])=>({me:{mana:5,hand:[BARRAGE,{entityId:9,name:'Duke',CARDTYPE:'MINION',COST:3}],board:[]},
  opponent:{board:[{entityId:50,CARDTYPE:'HERO',baseHealth:30,HEALTH:30,DAMAGE:30-hp},...minions]}});
 const acts=[{id:'o2',entityId:2},{id:'o9',entityId:9},{id:'o0',type:'END_TURN'}];
 assert.deepEqual(constrainActions(foe(30),acts).map(a=>a.id),['o9','o0']);
 assert.ok(constrainActions(foe(10),acts).some(a=>a.id==='o2'));
 assert.ok(constrainActions(foe(30,[{entityId:51,CARDTYPE:'MINION',HEALTH:2,ATK:1}]),acts).some(a=>a.id==='o2'));
});

// Game 9 rulings.
const GULDAN9={entityId:5,CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'};
const CURSE={entityId:6,CARDTYPE:'SPELL',COST:2,text:'At the start of your turn, take {0} damage. ({1} turns remaining)'};
const drawState=(deckCount,extra=0)=>({me:{mana:10,deckCount,hand:[GULDAN9,...Array.from({length:extra},(_,i)=>({entityId:40+i,CARDTYPE:'MINION',COST:1}))],board:[]},opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30,DAMAGE:0}]}});
const drawActs=[{id:'o0',type:'END_TURN'},{id:'o1',entityId:5},{id:'o2',entityId:40}];
test('a draw-three waits when the deck cannot cover it',()=>{
 assert.deepEqual(constrainActions(drawState(1,3),drawActs).map(a=>a.id),['o0','o2']);
});
test('a draw-three waits when it would burn cards from a full hand',()=>{
 assert.ok(!constrainActions(drawState(20,9),drawActs).some(a=>a.id==='o1'));
 assert.ok(constrainActions(drawState(20,3),drawActs).some(a=>a.id==='o1'));
});
test('a choose-to-discard pick takes the curse first',()=>{
 const state={me:{deckCount:10,hand:[GULDAN9,CURSE],board:[]},opponent:{board:[]},choice:{type:'GENERAL',source:{text:'Choose a card in your hand to discard.'},entities:[GULDAN9,CURSE]}};
 assert.deepEqual(constrainActions(state,[{id:'c1',type:'CHOICE',entityId:5},{id:'c2',type:'CHOICE',entityId:6}]).map(a=>a.id),['c2']);
});

// Game 10 rulings (2026-09-26). Turns 4, 7 and 8: draw first, unless the mana is spent exactly.
const HERO10=(hp=30)=>({entityId:70,CARDTYPE:'HERO',HEALTH:30,DAMAGE:30-hp});
const TAP10={entityId:71,CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'};
const c10=(id,cost,extra={})=>({entityId:id,CARDTYPE:'MINION',COST:cost,text:'',...extra});
const menu10=cards=>[{id:'end',type:'END_TURN'},{id:'tap',entityId:71},...cards.map(c=>({id:`o${c.entityId}`,entityId:c.entityId}))];
const game10=(cards,mana,board=[HERO10(),TAP10],hazards=[])=>({me:{mana,hand:cards,board,deckCount:20,drawHazards:hazards},opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30}]}});
test('with mana left over, Life Tap goes before the plays (game 10, turn 4)',()=>{
 const h=[c10(81,3),c10(82,2)];
 assert.deepEqual(constrainActions(game10(h,4),menu10(h)).map(a=>a.id),['end','tap']);
});
test('a play that spends the mana exactly stays beside Life Tap (the 1+3 line)',()=>{
 const h=[c10(81,3),c10(82,2),c10(83,1)];
 assert.deepEqual(constrainActions(game10(h,4),menu10(h)).map(a=>a.id),['end','tap','o81','o83']);
});
test('a card that draws goes before the cards that do not (game 10, turn 8: the Soularium)',()=>{
 const soul={entityId:84,name:'The Soularium',CARDTYPE:'SPELL',COST:2,text:'Draw 3 cards. At the end of turn, discard them.'};
 const buff={entityId:85,name:'Buff',CARDTYPE:'SPELL',COST:2,text:'Give your minions +1/+1.'};
 const h=[soul,buff];
 const s=game10(h,4,[HERO10(),{entityId:86,CARDTYPE:'MINION',ATK:1,HEALTH:1}]);
 assert.deepEqual(constrainActions(s,[{id:'end',type:'END_TURN'},{id:'o84',entityId:84},{id:'o85',entityId:85}]).map(a=>a.id),['end','o84']);
});
test('a draw that is sure to pull a Shred of Time into lethal waits; one that might is left to Jev',()=>{
 const h=[c10(81,5)];
 const s=(hp,deck)=>{const st=game10(h,4,[HERO10(hp),TAP10],[3]);st.me.deckCount=deck;return st};
 assert.ok(!constrainActions(s(5,1),menu10(h)).some(a=>a.id==='tap'));
 assert.ok(constrainActions(s(6,1),menu10(h)).some(a=>a.id==='tap'));
 assert.ok(constrainActions(s(5,20),menu10(h)).some(a=>a.id==='tap'));
});
// The game-10 swing itself (7 HP, 5-attack Muncher, two Shreds in ten cards) was the user's
// comeback line: only a swing that cannot miss the Shreds is taken away.
test('a Chronoclaws swing that discards Hand of Gul\'dan counts the Shreds it must draw',()=>{
 const claws={entityId:72,CARDTYPE:'WEAPON',ATK:3,text:'After your hero attacks, discard your highest Cost card.'};
 const guldan={entityId:73,CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'};
 const s=(hazards,deckCount=10)=>({me:{mana:0,hand:[guldan,c10(81,1)],board:[HERO10(7),claws],deckCount,drawHazards:hazards},
  opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30},{entityId:98,CARDTYPE:'MINION',ATK:5,HEALTH:3}]}});
 const acts=[{id:'end',type:'END_TURN'},{id:'hit',entityId:70,targetId:98},{id:'face',entityId:70,targetId:99}];
 assert.ok(constrainActions(s([3,3]),acts).some(a=>a.id==='hit'),'game 10: a gamble, left to Jev');
 assert.deepEqual(constrainActions(s([3,3],4),acts).map(a=>a.id),['end','face'],'four cards left, two Shreds: one is certain');
 assert.ok(constrainActions(s([]),acts).some(a=>a.id==='hit'));
});
test('a location still cooling down is never clicked (game 10, turn 4)',()=>{
 const loc=cd=>({entityId:74,CARDTYPE:'LOCATION',LOCATION_ACTION_COOLDOWN:cd});
 const acts=[{id:'end',type:'END_TURN'},{id:'loc',entityId:74}];
 assert.deepEqual(constrainActions(game10([],4,[HERO10(),loc(1)]),acts).map(a=>a.id),['end']);
 assert.ok(constrainActions(game10([],4,[HERO10(),loc(0)]),acts).some(a=>a.id==='loc'));
});
test('the armed hero swings before the minions trade (game 11, turn 4)',()=>{
 const claws={entityId:72,CARDTYPE:'WEAPON',ATK:4,text:'After your hero attacks, discard your highest Cost card.'};
 const occ={entityId:32,CARDTYPE:'MINION',ATK:3,HEALTH:6};
 const s=board=>({me:{mana:0,hand:[],board,deckCount:18,drawHazards:[]},
  opponent:{board:[{entityId:99,CARDTYPE:'HERO',HEALTH:30},{entityId:101,CARDTYPE:'MINION',ATK:1,HEALTH:3,TAUNT:1}]}});
 const acts=[{id:'end',type:'END_TURN'},{id:'occ',entityId:32,targetId:101},{id:'hero',entityId:70,targetId:101}];
 assert.deepEqual(constrainActions(s([HERO10(),claws,occ]),acts).map(a=>a.id),['end','hero']);
 assert.deepEqual(constrainActions(s([HERO10(),claws,occ]),acts.slice(0,2)).map(a=>a.id),['end','occ'],'hero already swung');
 assert.deepEqual(constrainActions(s([HERO10(),occ]),acts.slice(0,2)).map(a=>a.id),['end','occ'],'no weapon');
 assert.deepEqual(constrainActions(s([HERO10(1),claws,occ]),acts).map(a=>a.id),['end','occ'],'a swing that kills us does not hold the minions back');
});
// Game 12 ruling (2026-09-26), turn 4: 「在手上同時有低語和連鎖的情況下，應該打連鎖。因為打完連鎖，最低費變成魔像」.
test('Whispers waits while the card it would eat can be cast instead (game 12, turn 4)',()=>{
 const golem=c10(41,3,{name:'Silverware Golem',text:'If you discard this minion, summon it.'});
 const cont={entityId:42,name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'};
 const whispers={entityId:43,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'};
 const duke=c10(44,4),guldan={entityId:45,CARDTYPE:'SPELL',COST:6,text:'When you play or discard this, draw 3 cards.'};
 const board=[HERO10(),TAP10,{entityId:86,CARDTYPE:'MINION',ATK:3,HEALTH:2}];
 const acts=[{id:'end',type:'END_TURN'},{id:'cont',entityId:42},{id:'wh',entityId:43}];
 assert.deepEqual(constrainActions(game10([golem,guldan,duke,cont,whispers],1,board),acts).map(a=>a.id),['end','cont']);
 // Continuity gone: Whispers now eats the Golem, which is the point.
 assert.ok(constrainActions(game10([golem,guldan,duke,whispers],1,board),acts.filter(a=>a.id!=='cont')).some(a=>a.id==='wh'));
});

// User ruling (2026-09-26, game 13, turn 4): Walking Dead was doomed by Platysaur's deathrattle, so
// Occultist should discard Soul Barrage instead.
test('a choose-discard does not pick the card a deathrattle already discards (game 13)',()=>{
 const occ=c10(3,3,{name:'Ocular Occultist',text:'<b>Taunt</b>\n<b>Battlecry:</b> Choose a card in your hand to discard.'});
 const wd=c10(36,3,{name:'Walking Dead',text:'<b>Taunt</b>\nIf you discard this minion, summon it.',doomed:true});
 const barrage=c10(40,4,{name:'Soul Barrage',CARDTYPE:'SPELL',text:'When you play or discard this, deal $5 damage randomly split among all enemies.'});
 const s=game10([occ,wd,barrage],3,[HERO10(),TAP10]);
 const acts=[{id:'end',type:'END_TURN'},{id:'wd',type:'POWER',entityId:3,targetId:36},{id:'sb',type:'POWER',entityId:3,targetId:40}];
 assert.deepEqual(constrainActions(s,acts).map(a=>a.id),['end','sb']);
 // The same on a Chamber of Viscidus pick.
 const chamber={...s,choice:{type:'GENERAL',source:{text:'Look at 3 cards in your hand and choose one to discard. Draw two cards.'},entities:[wd,barrage]}};
 assert.deepEqual(constrainActions(chamber,[{id:'c36',type:'CHOICE',entityId:36},{id:'c40',type:'CHOICE',entityId:40}]).map(a=>a.id),['c40']);
 // Nothing else to pick: the doomed card stays.
 assert.deepEqual(constrainActions(s,acts.slice(0,2)).map(a=>a.id),['end','wd']);
});

// User ruling (2026-09-26, game 13, turn 5): Soulfire went before Duke of Below, and its random
// discard could have thrown the Duke away.
test('a random discard waits while Duke of Below can be cast (game 13)',()=>{
 const duke=c10(44,4,{name:'Duke of Below',text:"<b>Rush</b>\nGains +2/+2 for each card you've discarded this game."});
 const fire=c10(63,1,{name:'Soulfire',CARDTYPE:'SPELL',text:'Deal $4 damage. Discard a random card.'});
 const s=game10([duke,fire,c10(5,2)],5,[HERO10(),TAP10]);
 const acts=[{id:'end',type:'END_TURN'},{id:'duke',type:'POWER',entityId:44},{id:'fire',type:'POWER',entityId:63,targetId:99}];
 assert.deepEqual(constrainActions(s,acts).map(a=>a.id),['end','duke']);
 assert.deepEqual(constrainActions(s,[acts[0],acts[2]]).map(a=>a.id),['end','fire'],'Duke not castable: Soulfire is free');
});
