import test from 'node:test';
import assert from 'node:assert/strict';
import {ownTurn,turnsBegun,wasserstein1,rateDistance,firstTurnDistance,eggDistance,likeness,bootstrap,rng,scanText,eggGame,EGG} from '../src/opp-likeness.mjs';

const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('engine turn -> the egg priest\'s own turn, for either seat',()=>{
  // going first it plays engine turns 1,3,5; going second 2,4,6: own turns 1,2,3 both ways
  assert.deepEqual([1,3,5].map(ownTurn),[1,2,3]);
  assert.deepEqual([2,4,6].map(ownTurn),[1,2,3]);
});

test('game length = turns the egg priest began',()=>{
  assert.equal(turnsBegun(7,true),4);   // 1,3,5,7
  assert.equal(turnsBegun(7,false),3);  // 2,4,6
  assert.equal(turnsBegun(8,true),4);   // 1,3,5,7
  assert.equal(turnsBegun(8,false),4);  // 2,4,6,8
  assert.equal(turnsBegun(1,false),0);
});

test('wasserstein1: identical = 0, small known examples',()=>{
  assert.equal(wasserstein1([1,2,3],[3,2,1]),0);
  near(wasserstein1([0,0],[1,1]),1);
  near(wasserstein1([1,2],[2,3]),1);
  // CDFs {0:.5,1:1} and {0:.5,2:1} differ by .5 over [1,2)
  near(wasserstein1([0,1],[0,2]),0.5);
  assert.ok(Number.isNaN(wasserstein1([],[1])));
});

const G=(plays,extra={})=>({eggTurns:8,endTurn:16,stage:0,hatchTurn:null,eggAttacks:0,plays:Object.fromEntries(Object.entries(plays).map(([k,v])=>[k,{first:v,n:1}])),...extra});

test('rateDistance and firstTurnDistance on a hand-worked example',()=>{
  const real=[G({A:2,B:3}),G({A:4})],sim=[G({A:5}),G({C:1})];
  // rates real A=1 B=.5 C=0; sim A=.5 B=0 C=.5 -> |.5|,|.5|,|.5| -> .5
  near(rateDistance(real,sim),0.5);
  // only A is played on both sides: mean first 3 vs 5
  const f=firstTurnDistance(real,sim);
  near(f.d,2);assert.equal(f.cards,1);
});

test('eggDistance and likeness: the same games score 0',()=>{
  const gs=[G({[EGG]:3,A:2},{stage:5,hatchTurn:7,eggAttacks:3}),G({A:4},{stage:-1})];
  const e=eggDistance(gs,gs);
  near(e.hatchRate,0);near(e.stage,0);near(e.attacks,0);
  const s=likeness(gs,[...gs]);
  near(s.composite,0);near(s.length,0);
  const other=[G({[EGG]:6},{eggTurns:12,endTurn:24,stage:1})];
  assert.ok(likeness(gs,other).composite>0);
});

test('bootstrap: same seed -> same interval, and the point estimate is inside the cloud',()=>{
  const real=Array.from({length:6},(_,i)=>G({A:1+i%3,[EGG]:2+i%2},{eggTurns:6+i,endTurn:12+2*i}));
  const sim=Array.from({length:40},(_,i)=>G({A:1+i%4,B:2},{eggTurns:8+i%5,endTurn:16+i%9}));
  const a=bootstrap(real,sim,{boot:200,seed:5}),b=bootstrap(real,sim,{boot:200,seed:5});
  assert.deepEqual(a.ci,b.ci);
  const [lo,hi]=a.ci.composite;
  assert.ok(lo<=hi&&Number.isFinite(a.point.composite));
  assert.ok(a.floor.composite>=0);
  const r=rng(3);assert.ok([r(),r(),r()].every(x=>x>=0&&x<1));
});

// ---- a small synthetic Power.log ----
const P='D 10:00:00.0000000 GameState.DebugPrintPower() - ';
const H='D 10:00:00.0000000 GameState.DebugPrintGame() - ';
const ent=(id,zone,card,player)=>`[entityName=UNKNOWN ENTITY [cardType=INVALID] id=${id} zone=${zone} zonePos=1 cardId=${card} player=${player}]`;
function playBlock(id,card,player){
  return [`${P}BLOCK_START BlockType=PLAY Entity=${ent(id,'HAND','',player)} EffectCardId=System.Collections.Generic.List\`1[System.String] EffectIndex=0 Target=0 SubOption=-1`,
    `${P}        SHOW_ENTITY - Updating Entity=${ent(id,'HAND','',player)} CardID=${card}`,
    `${P}            tag=ZONE value=PLAY`,
    `${P}BLOCK_END`];
}
const turn=n=>`${P}TAG_CHANGE Entity=GameEntity tag=TURN value=${n} `;
function created(id,card,player){
  return [`${P}FULL_ENTITY - Creating ID=${id} CardID=${card}`,`${P}    tag=CONTROLLER value=${player}`,`${P}    tag=ZONE value=PLAY`];
}
// player 1 goes first (the zoo); player 2 is the egg priest, played the Egg on its first turn (engine turn 2),
// Soothsayer on its second (4), the egg took a hit on turn 5 and hatched on turn 6; the game ends on turn 7.
const LOG=[
  `${P}CREATE_GAME`,
  `${P}    Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]`,
  `${P}    Player EntityID=3 PlayerID=2 GameAccountId=[hi=1 lo=3]`,
  `${H}PlayerID=1, PlayerName=Opponent#1234`,
  `${H}PlayerID=2, PlayerName=UNKNOWN HUMAN PLAYER`,
  `${P}TAG_CHANGE Entity=Opponent#1234 tag=FIRST_PLAYER value=1 `,
  turn(1),
  ...playBlock(10,'X_ZOO',1),
  turn(2),
  ...playBlock(20,'DINO_410',2),
  ...created(30,'DINO_410',2),
  turn(3),
  turn(4),
  ...playBlock(21,'SOOTH',2),
  ...playBlock(22,'SOOTH',2),
  ...playBlock(23,'CAT_A',2),
  turn(5),
  `${P}BLOCK_START BlockType=ATTACK Entity=${ent(10,'PLAY','X_ZOO',1)} EffectCardId=System.Collections.Generic.List\`1[System.String] EffectIndex=0 Target=${ent(30,'PLAY','DINO_410',2)} SubOption=-1`,
  `${P}BLOCK_END`,
  `${P}BLOCK_START BlockType=ATTACK Entity=${ent(10,'PLAY','X_ZOO',1)} EffectCardId=System.Collections.Generic.List\`1[System.String] EffectIndex=0 Target=${ent(2,'PLAY','',1)} SubOption=-1`,
  `${P}BLOCK_END`,
  turn(6),
  ...created(31,'DINO_410t',2),
  turn(7),
  `${P}TAG_CHANGE Entity=Opponent#1234 tag=PLAYSTATE value=LOST `,
  `${P}TAG_CHANGE Entity=UNKNOWN HUMAN PLAYER tag=PLAYSTATE value=WON `,
].join('\n');
const CARDS={DINO_410:EGG,SOOTH:'Soothsayer',CAT_A:'Cat',X_ZOO:'Zoo Card'};

test('scanText: finds the game, its first player, both results and the plays by player',()=>{
  const [g,...rest]=scanText(LOG,{file:'syn.log'});
  assert.equal(rest.length,0);
  assert.equal(g.startLine,1);
  assert.equal(g.firstPlayer,1);
  assert.equal(g.endTurn,7);
  assert.deepEqual(g.result,{1:'LOST',2:'WON'});
  assert.equal(g.complete,true);
  assert.deepEqual(g.players[2].plays.map(p=>[p.cardId,p.turn]),[['DINO_410',2],['SOOTH',4],['SOOTH',4],['CAT_A',4]]);
  assert.deepEqual(g.players[1].plays.map(p=>p.cardId),['X_ZOO']);
});

test('eggGame: the egg priest\'s own turns, length, egg stats and the signature rule',()=>{
  const [g]=scanText(LOG,{file:'syn.log'});
  const s=eggGame(g,{cards:CARDS,deckIds:new Set(['SOOTH','CAT_A'])});
  assert.equal(s.eggPlayer,2);
  assert.equal(s.eggFirst,false);
  assert.equal(s.eggTurns,3);           // engine turns 2,4,6 of 7
  assert.equal(s.result,'WON');
  assert.deepEqual(s.plays[EGG],{first:1,n:1,cardId:'DINO_410'});   // engine turn 2 -> own turn 1
  assert.equal(s.plays.Soothsayer.first,2);
  assert.equal(s.plays.Soothsayer.n,2);
  assert.equal(s.plays['Zoo Card'],undefined);
  assert.equal(s.hatchTurn,3);          // engine turn 6 -> own turn 3
  assert.equal(s.eggAttacks,1);         // the hit on the egg, not the one on the hero
  assert.equal(s.stage,5);
});

test('eggGame: no egg and too few deck cards -> not an egg priest',()=>{
  const [g]=scanText(LOG.replace(/DINO_410/g,'OTHER_1').replace(/OTHER_1t/g,'OTHER_2'),{file:'syn.log'});
  assert.equal(eggGame(g,{cards:CARDS,deckIds:new Set(['SOOTH','CAT_A'])}),null);
});
