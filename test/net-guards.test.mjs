import test from 'node:test';
import assert from 'node:assert/strict';
import {cardDb,rawCard} from '../src/selfplay.mjs';
import {guardPick} from '../src/net-guards.mjs';

// 2026-10-25 zoo game: the network attacked before Entropic Continuity, and ended a turn with 2 mana and Life Tap unused.
const cards=cardDb();
const C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
const tap={entityId:4,name:'Life Tap',CARDTYPE:'HERO_POWER',COST:2,text:'Draw a card and take $2 damage.'};
function fixture({mana=3,hp=30,oppAtk=3,handCount,deckCount=20}={}){
  const hand=[C('TIME_026',41),C('TLC_603',42)];
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:7,
    me:{playerId:1,mana,maxMana:mana,handCount:handCount??hand.length,deckCount,hand,
      board:[C('HERO_07',1,{HEALTH:hp}),tap,C('TLC_603',45,{EXHAUSTED:0})]},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:[C('HERO_07',2,{HEALTH:30}),C('TLC_603',51,{ATK:oppAtk,HEALTH:3})]}};
  const actions=[{id:'end',type:'END_TURN'},{id:'tap',type:'POWER',entityId:4},
    {id:'buff',type:'PLAY',entityId:41},{id:'draw',type:'PLAY',entityId:42},
    {id:'attack',type:'ATTACK',entityId:45,targetId:2}];
  return {state,actions,a:id=>actions.find(x=>x.id===id)};
}

test('a board-wide buff the hand can cast goes before a minion attack',()=>{
  const f=fixture();
  const g=guardPick(f.state,f.actions,f.a('attack'));
  assert.equal(g.action,f.a('buff'));
  assert.equal(g.guard,'buff_before_attack');
});

test('no buff guard when the buff costs more than the mana left, or the pick is not an attack',()=>{
  const f=fixture({mana:0});
  assert.equal(guardPick(f.state,f.actions,f.a('attack')),null);
  const g=fixture();
  assert.equal(guardPick(g.state,g.actions,g.a('draw')),null);
});

test('Life Tap instead of ending the turn when it is safe',()=>{
  const f=fixture();
  const g=guardPick(f.state,f.actions,f.a('end'));
  assert.equal(g.action,f.a('tap'));
  assert.equal(g.guard,'life_tap_before_end');
});

test('no Life Tap at low health, with a full hand or an empty deck',()=>{
  for(const opts of [{hp:10,oppAtk:4},{handCount:10},{deckCount:0}]){
    const f=fixture(opts);
    assert.equal(guardPick(f.state,f.actions,f.a('end')),null,JSON.stringify(opts));
  }
});

test('a pending choice is left to the network',()=>{
  const f=fixture();
  f.state.choice={type:'GENERAL',entities:[]};
  assert.equal(guardPick(f.state,f.actions,f.a('end')),null);
});

// 2026-10-25 live zoo game: 4 mana, hand Mawman Cultist, Darkest Depths, The Coin, Tachyon Barrage, Ruinous Velocidrake.
// The network played Mawman first and every spell then cost 1 more. Coin -> 2-cost spell -> Mawman fits.
function mawmanFixture({mana=4,hand=['BE_729','BE_087','GAME_005','TIME_027','TIME_029'],board=[]}={}){
  const cardsInHand=hand.map((id,i)=>C(id,60+i));
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:7,
    me:{playerId:1,mana,maxMana:mana,handCount:cardsInHand.length,deckCount:20,hand:cardsInHand,board:[C('HERO_07',1,{HEALTH:30}),tap,...board]},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:[C('HERO_07',2,{HEALTH:30})]}};
  const actions=[{id:'end',type:'END_TURN'},...cardsInHand.filter(c=>c.COST<=mana+1).map(c=>({id:'p'+c.entityId,type:'PLAY',entityId:c.entityId}))];
  const byCard=id=>actions.find(a=>a.entityId===cardsInHand.find(c=>c.cardId===id)?.entityId);
  return {state,actions,byCard};
}

test('Mawman Cultist: the Coin and a 2-cost spell go first, then Mawman passes through',()=>{
  const f=mawmanFixture();
  let g=guardPick(f.state,f.actions,f.byCard('BE_729'));
  assert.equal(g.guard,'spells_before_mawman');
  assert.equal(g.action,f.byCard('GAME_005'));
  // Next state: the Coin is spent (5 mana), the network picks Mawman again.
  const h=mawmanFixture({mana:5,hand:['BE_729','BE_087','TIME_027','TIME_029']});
  g=guardPick(h.state,h.actions,h.byCard('BE_729'));
  assert.equal(g.guard,'spells_before_mawman');
  assert.equal(g.action,h.byCard('BE_087'));
  // Next state: one spell cast (3 mana); the other would leave too little for Mawman.
  const k=mawmanFixture({mana:3,hand:['BE_729','TIME_027','TIME_029']});
  assert.equal(guardPick(k.state,k.actions,k.byCard('BE_729')),null);
});

test('Mawman Cultist: no spare mana, no override; the Coin is not spent when it buys nothing',()=>{
  const f=mawmanFixture({mana:3});
  assert.equal(guardPick(f.state,f.actions,f.byCard('BE_729')),null);
  const g=mawmanFixture({mana:5,hand:['BE_729','GAME_005','TIME_029']});
  assert.equal(guardPick(g.state,g.actions,g.byCard('BE_729')),null);
});

test('Mawman Cultist: already on our board, or a pick that is not Mawman, is left alone',()=>{
  const f=mawmanFixture({board:[C('BE_729',77,{EXHAUSTED:0})]});
  assert.equal(guardPick(f.state,f.actions,f.byCard('BE_729')),null);
  const g=mawmanFixture();
  assert.equal(guardPick(g.state,g.actions,g.byCard('TIME_029')),null);
});

// Live options call a card play POWER (until 2026-10-27 the buff guard matched only PLAY and never fired live).
test('the buff guard also reads a card play the game calls POWER',()=>{
  const f=fixture();
  const actions=f.actions.map(a=>a.type==='PLAY'?{...a,type:'POWER'}:a);
  const g=guardPick(f.state,actions,actions.find(a=>a.id==='attack'));
  assert.equal(g?.guard,'buff_before_attack');
  assert.equal(g.action.id,'buff');
});

// 2026-10-27 v9 game 6 vs priest, turn 10: 5 mana, Zakajz first, then Ritual of C'Thun cost 2 with 1 mana left.
test('Zakajz the Corruptor: the 1-cost spell goes first; a board buff waits for Zakajz',()=>{
  const f=mawmanFixture({mana:5,hand:['BE_728','BE_726','TIME_026','EDR_463'],board:[C('TLC_603',77,{EXHAUSTED:0})]});
  const actions=f.actions.map(a=>({...a,type:'POWER'}));
  const by=id=>actions.find(a=>a.entityId===f.byCard(id)?.entityId);
  const g=guardPick(f.state,actions,by('BE_728'));
  assert.equal(g?.guard,'spells_before_mawman');
  assert.equal(g.action,by('BE_726'));
  // Exactly 4 mana: nothing fits before Zakajz.
  const h=mawmanFixture({mana:4,hand:['BE_728','BE_726']});
  assert.equal(guardPick(h.state,h.actions,h.byCard('BE_728')),null);
});

// 2026-10-27 v9 game 5, turn 7: 1 mana, two Glacial Shards (one drawn by Platysaur, doomed), and the network ended the turn.
function expiringFixture({doomed=true,temporary=false,mana=1}={}){
  const shard=C('UNG_205',57,{...(doomed?{doomed:true}:{}),...(temporary?{temporary:{expires:'end_of_own_turn',confidence:1}}:{})});
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:7,
    me:{playerId:1,mana,maxMana:4,handCount:2,deckCount:20,hand:[C('UNG_205',44),shard],
      board:[C('HERO_07',1,{HEALTH:30}),tap,C('TLC_603',46,{EXHAUSTED:1})]},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:[C('HERO_07',68,{HEALTH:30}),C('TLC_603',102,{ATK:2,HEALTH:1})]}};
  const actions=[{id:'o0',type:'END_TURN'},{id:'o1t2',type:'POWER',entityId:44,targetId:102},{id:'o2t2',type:'POWER',entityId:57,targetId:102}];
  return {state,actions};
}

test('a card about to be discarded is played instead of ending the turn',()=>{
  for(const opts of [{doomed:true},{doomed:false,temporary:true}]){
    const f=expiringFixture(opts);
    const g=guardPick(f.state,f.actions,f.actions[0]);
    assert.equal(g?.guard,'expiring_card_before_end',JSON.stringify(opts));
    assert.equal(g.action.id,'o2t2');
  }
  const f=expiringFixture({doomed:false});
  assert.equal(guardPick(f.state,f.actions,f.actions[0]),null);
});

// 2026-10-27 v9 game 5, turn 7: Twilight Egg, then Life Tap drew Ritual of Summoning with 1 mana left.
test('Life Tap goes first when the network would tap right after the play',async()=>{
  const {tapFirst}=await import('../src/net-guards.mjs');
  const {shadowView}=await import('../src/selfplay-shadow.mjs');
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:7,gameNumber:1,
    me:{playerId:1,heroClass:'WARLOCK',mana:4,maxMana:4,handCount:1,deckCount:20,hand:[C('CATA_210',41)],
      board:[C('HERO_07',1,{HEALTH:30}),{...tap,entityId:71}]},
    opponent:{playerId:2,heroClass:'PRIEST',mana:3,maxMana:3,handCount:5,deckCount:22,board:[C('HERO_07',68,{HEALTH:30})]}};
  const actions=[{id:'o0',type:'END_TURN'},{id:'o1',type:'POWER',entityId:41},{id:'o2',type:'POWER',entityId:71}];
  const view=shadowView({entities:new Map(),publicPlays:[]},state,actions);
  const egg=view.legal.findIndex(m=>m.kind==='play'),power=view.legal.findIndex(m=>m.kind==='power');
  const net=wants=>({rank:(s,legal)=>({steps:[{move:legal.find(m=>m.kind===wants)??legal[0],p:1}]})});
  assert.equal(tapFirst(net('power'),view,egg,'warlock-zoo'),power);
  assert.equal(tapFirst(net('end'),view,egg,'warlock-zoo'),-1);
  assert.equal(tapFirst(net('power'),view,power,'warlock-zoo'),-1);
});

// 2026-10-27 v9 game vs warlock, turn 16: live options call a minion attack POWER as well, so the buff guard missed it.
test('the buff guard also reads a minion attack the game calls POWER',()=>{
  const f=fixture();
  const actions=f.actions.map(a=>a.type==='PLAY'||a.type==='ATTACK'?{...a,type:'POWER'}:a);
  const g=guardPick(f.state,actions,actions.find(a=>a.id==='attack'));
  assert.equal(g?.guard,'buff_before_attack');
  assert.equal(g.action.id,'buff');
  // Life Tap is POWER with no target: not an attack.
  assert.equal(guardPick(f.state,actions,actions.find(a=>a.id==='tap')),null);
});

// Same game, turn 12: 6 mana, Ritual of C'Thun first left 1 mana, and Kazakus (3 -> 2 after Zakajz) stayed in hand.
test('Zakajz: no spell first when the cheaper minions after Zakajz spend the mana anyway',()=>{
  const f=mawmanFixture({mana:6,hand:['BE_728','BE_726','CAP_405','BE_729']});
  const actions=f.actions.map(a=>({...a,type:'POWER'}));
  const by=id=>actions.find(a=>a.entityId===f.byCard(id)?.entityId);
  assert.equal(guardPick(f.state,actions,by('BE_728')),null);
});

// Same game, turn 18: 3 mana, Cursed Catacombs offered Ritual of Summoning (3), Shred of Time and Blasphemy (5); it took
// Blasphemy, which was Temporary and could not be cast.
function discoverFixture(mana=3){
  const ent=(entityId,cardId,name,COST,text)=>({entityId,cardId,name,COST,baseCost:COST,text,CARDTYPE:'SPELL'});
  const entities=[ent(217,'BE_085','Ritual of Summoning',3,'In 2 turns, summon two 3/5 C\'thraxxi with <b>Taunt</b>.'),
    ent(219,'TIME_025t','Shred of Time',0,'<b>Casts When Drawn</b>\nDeal $3 damage to your hero.'),
    ent(215,'BE_086','Blasphemy',5,'Deal $2 damage to all enemies.')];
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:18,
    choice:{id:12,type:'GENERAL',min:1,max:1,entities,source:{entityId:29,cardId:'TLC_451',name:'Cursed Catacombs',text:'<b>Discover</b> another\ncard from your deck. Make it <b>Temporary</b>.'}},
    me:{playerId:1,mana,maxMana:9,handCount:1,deckCount:10,hand:[],board:[C('HERO_07',1,{HEALTH:30}),tap]},
    opponent:{playerId:2,mana:3,maxMana:9,handCount:5,deckCount:12,board:[C('HERO_07',2,{HEALTH:30})]}};
  const actions=entities.map(e=>({id:'c12e'+e.entityId,type:'CHOICE',choiceId:12,entityId:e.entityId}));
  const top=[215,219,217].map(id=>({kind:'choose',id}));
  return {state,actions,top,by:id=>actions.find(a=>a.entityId===id)};
}

test('a Temporary Discover takes a card the mana can pay for, and never a Casts When Drawn card',()=>{
  const f=discoverFixture();
  const g=guardPick(f.state,f.actions,f.by(215),f.top);
  assert.equal(g?.guard,'affordable_temporary_discover');
  assert.equal(g.action,f.by(217));
  // Enough mana for Blasphemy: keep the network's pick.
  const h=discoverFixture(5);
  assert.equal(guardPick(h.state,h.actions,h.by(215),h.top),null);
});

// Same game, turns 14 and 16: Mawman Cultist waits in hand with Entropic Continuity, and the network attacks.
import {constrainActions} from '../src/policy.mjs';
function developFixture(mana){
  const hand=[C('TIME_026',41),C('BE_729',43)];
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:16,
    me:{playerId:1,mana,maxMana:mana,handCount:2,deckCount:20,hand,board:[C('HERO_07',1,{HEALTH:30}),tap,C('TLC_603',45,{EXHAUSTED:0})]},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:[C('HERO_07',2,{HEALTH:30}),C('TLC_603',51,{ATK:2,HEALTH:5})]}};
  const raw=[{id:'end',type:'END_TURN'},{id:'tap',type:'POWER',entityId:4},{id:'buff',type:'POWER',entityId:41},
    {id:'maw',type:'POWER',entityId:43},{id:'hit',type:'POWER',entityId:45,targetId:51}];
  return {state,menu:constrainActions(state,raw)};
}

test('Mawman makes the buff dearer: with 4 mana the buff is not held for it, and goes before the attack',()=>{
  const f=developFixture(4);
  assert.ok(f.menu.some(a=>a.id==='buff'));
  assert.equal(guardPick(f.state,f.menu,f.menu.find(a=>a.id==='hit'))?.action.id,'buff');
});

test('a buff held for a body: the body goes before the attack',()=>{
  const f=developFixture(7);
  assert.ok(!f.menu.some(a=>a.id==='buff'));
  const g=guardPick(f.state,f.menu,f.menu.find(a=>a.id==='hit'));
  assert.equal(g?.guard,'develop_before_buff');
  assert.equal(g.action.id,'maw');
});

// 2026-10-27 game 15, turn 11 (runtime/decisions.jsonl): Doomsayer 0/7 on the other side, Mawman Cultist 4/7 and
// Faceless Fanatic 2/6 ready, Ruinous Velocidrake 5/5 (Rush) in hand. The net sent the two ready minions face, then the
// Velocidrake into the Doomsayer for 5 (leaving 2), and all five minions died at the start of the next turn.
function wipeFixture({mana=6,wipeHealth=7,shield=false,hand=['TIME_029','BE_086'],attackers=[104,41],
  heroDamage=8,oppAtk=3,oppHp=3}={}){
  const handCards=hand.map((id,i)=>C(id,51+i));
  const board=[C('HERO_07',66,{HEALTH:30}),C('CATA_210t',95,{ATK:0,HEALTH:1}),C('BE_013t5',103,{ATK:0,HEALTH:3}),
    C('BE_013t5',104,{ATK:2,HEALTH:6}),C('BE_729',41,{ATK:4,HEALTH:7})];
  const opp=[C('HERO_07',64,{HEALTH:30,DAMAGE:heroDamage}),C('EDR_970',16,{ATK:oppAtk,HEALTH:oppHp})];
  if(wipeHealth!=null)opp.push(C('NEW1_021',33,{HEALTH:wipeHealth,...(shield?{DIVINE_SHIELD:1}:{})}));
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:11,gameNumber:15,
    me:{playerId:1,mana,maxMana:6,handCount:handCards.length,deckCount:20,hand:handCards,board},
    opponent:{playerId:2,mana:6,maxMana:6,handCount:5,deckCount:12,board:opp}};
  const actions=[{id:'end',type:'END_TURN'},{id:'tap',type:'POWER',entityId:67}];
  for(const c of handCards)actions.push({id:'play'+c.entityId,type:'POWER',entityId:c.entityId});
  for(const id of attackers)for(const t of [64,16,33])
    actions.push({id:`a${id}t${t}`,type:'POWER',entityId:id,targetId:t});
  const a=(e,t)=>actions.find(x=>x.entityId===e&&(x.targetId??null)===(t??null));
  return {state,actions,a,play:i=>actions.find(x=>x.entityId===handCards[i].entityId&&x.targetId==null)};
}

test('game 15 T11: a face attack is redirected to the Doomsayer',()=>{
  const f=wipeFixture();
  const g=guardPick(f.state,f.actions,f.a(41,64),[]);
  assert.equal(g?.guard,'kill_board_wipe');
  assert.equal(g.action.entityId,41);   // the largest ready attacker; no single one has 7 Attack
  assert.equal(g.action.targetId,33);   // the 0/7 Doomsayer, not the hero
});

test('game 15 T11: a pick that already hits the Doomsayer is left alone',()=>{
  const f=wipeFixture();
  assert.equal(guardPick(f.state,f.actions,f.a(41,33),[]),null);
});

test('a Doomsayer that cannot be killed: a minion from hand waits, else end the turn',()=>{
  const f=wipeFixture({wipeHealth:7,hand:['BE_013t5','BE_086'],attackers:[104]});
  const pick=f.play(0);
  const g=guardPick(f.state,f.actions,pick,[{kind:'play',id:pick.entityId,targetId:null},{kind:'power',id:67,targetId:null}]);
  assert.equal(g?.guard,'hold_minions_into_wipe');
  assert.equal(g.action.entityId,67);   // Life Tap, the best non-minion action the net ranked
  const h=guardPick(f.state,f.actions,pick,[]);
  assert.equal(h?.guard,'hold_minions_into_wipe');
  assert.equal(h.action.type,'END_TURN');
});

test('no forced kill while our board is smaller than the opponent\'s other minions',()=>{
  const f=wipeFixture({wipeHealth:5,oppAtk:12,oppHp:12});
  assert.equal(guardPick(f.state,f.actions,f.a(41,64),[]),null);
});

test('lethal on the hero this turn leaves the Doomsayer alone',()=>{
  const f=wipeFixture({heroDamage:25});   // 5 Health left; the two ready attackers deal 6
  assert.equal(guardPick(f.state,f.actions,f.a(41,64),[]),null);
});

test('no wipe minion on the board: the guard does not fire',()=>{
  const f=wipeFixture({wipeHealth:null,hand:['BE_013t5','BE_086']});
  assert.equal(guardPick(f.state,f.actions,f.play(0),[]),null);
});

test('a Divine Shield on the Doomsayer eats the smallest hit',()=>{
  // 3 Health, shield, attackers 2 and 4: 6 - 2 >= 3, so it is killable, and the largest attacker swings.
  const f=wipeFixture({wipeHealth:3,shield:true,hand:['BE_086']});
  const g=guardPick(f.state,f.actions,f.a(41,64),[]);
  assert.equal(g?.guard,'kill_board_wipe');
  assert.equal(g.action.entityId,41);
  // 5 Health, shield: 6 - 2 < 5, so the shield keeps it alive and the face attack stands.
  const h=wipeFixture({wipeHealth:5,shield:true,hand:['BE_086']});
  assert.equal(guardPick(h.state,h.actions,h.a(41,64),[]),null);
});

test('decks/priest-egg: Haunt goes on our own Egg of Khelos, live as in self-play',()=>{
  const state={status:'RUNNING',step:'MAIN_ACTION',turn:5,
    me:{playerId:1,mana:3,maxMana:5,handCount:1,deckCount:20,hand:[C('CAP_801',41)],
      board:[C('HERO_09',1,{HEALTH:30}),C('DINO_410',45,{EXHAUSTED:0})]},
    opponent:{playerId:2,mana:5,maxMana:5,handCount:5,deckCount:22,board:[C('HERO_07',2,{HEALTH:30})]}};
  const actions=[{id:'end',type:'END_TURN'},{id:'haunt',type:'POWER',entityId:41,targetId:45},
    {id:'hauntFace',type:'POWER',entityId:41,targetId:2}];
  const g=guardPick(state,actions,actions[0]);
  assert.equal(g?.action,actions[1]);
  assert.equal(g.guard,'haunt_own_egg');
  assert.equal(guardPick(state,actions,actions[1]),null,'already the pick');
});
