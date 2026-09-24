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
  assert.deepEqual(ids(hand(tight),tight),['o4','o6','o101']);
  const loose=[...tight,FILLER(2)];
  assert.deepEqual(ids(hand(loose),loose).sort(),['o1','o102','o2','o4','o6','o101'].sort());
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
  assert.equal(reliableOutletFor(hand(cheaper),EGG),null);
  const dearest=[WHISPERS,EGG,{...FILLER(1),COST:3}];        // now the Egg is the cheapest
  assert.equal(reliableOutletFor(hand(dearest),EGG)?.entityId,8);
  assert.deepEqual(ids(hand(dearest),dearest),['o8','o101']);
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
  assert.deepEqual(ids(hand(loss,[body(1)]),loss),['o8','o101']);
  // A tie it might survive is Jev's call, not ours.
  const tied=[WHISPERS,FILLER(1),{...EGG,COST:1}];
  assert.ok(ids(hand(tied),tied).includes('o8'));
});

test('three bodies out and whispers in hand takes END_TURN away',()=>{
  const h=[WHISPERS,FILLER(1)];
  const board=[body(1),body(2),body(3)];
  const acts=[{id:'o8',entityId:8},{id:'o101',entityId:101},{id:'end',type:'END_TURN'}];
  assert.deepEqual(constrainActions(hand(h,board),acts).map(a=>a.id),['o8','o101']);
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
