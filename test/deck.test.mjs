import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deckName,loadDeck} from '../src/deck.mjs';
import {describe as say,mulliganWR} from '../src/describe.mjs';
import {mulliganVerdict,mulliganCombos} from '../src/policy.mjs';
import {parsePower,publicState} from '../src/power.mjs';

const DH={me:{heroClass:'DEMONHUNTER'}},WL={me:{heroClass:'WARLOCK'}};
const defs=JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url),'utf8'));
let next=100;
// Real card text from the card DB, shaped like a hand card in publicState.
const card=n=>{const d=defs.find(c=>c.name===n&&c.collectible);
  return {entityId:next++,name:d.name,text:d.text,CARDTYPE:d.type,COST:d.cost,ATK:d.attack,HEALTH:d.health};};

test('the deck follows the hero class, and JEV_DECK overrides it',()=>{
  assert.equal(deckName(DH),'dh-void');
  assert.equal(deckName(WL),'warlock-discard');
  assert.equal(deckName({me:{}}),'warlock-discard');   // pre-heroClass fixtures keep the old deck
  process.env.JEV_DECK='dh-void';
  try{assert.equal(deckName(WL),'dh-void')}finally{delete process.env.JEV_DECK}
  assert.match(loadDeck('dh-void').strategy,/^# Void Demon Hunter/);
  assert.match(loadDeck('warlock-discard').strategy,/^# Discard Warlock/);
  assert.throws(()=>loadDeck('no-such-deck'),/ENOENT/);
});

test('heroClass is read off the hero card on the board',()=>{
  const power=s=>s.split('\n').map(x=>`D 00:00:00 GameState.DebugPrintPower() - ${x}`).join('\n');
  const p=parsePower(power(`CREATE_GAME
GameEntity EntityID=1
tag=STATE value=RUNNING
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
FULL_ENTITY - Creating ID=4 CardID=MY_HERO
tag=CONTROLLER value=1
tag=ZONE value=PLAY
tag=CARDTYPE value=HERO`));
  const s=publicState(p,1,{MY_HERO:{name:'Illidan',cardClass:'DEMONHUNTER'}});
  assert.equal(s.me.heroClass,'DEMONHUNTER');
  assert.equal(deckName(s),'dh-void');
});

test('win rates and combos belong to their own deck only',()=>{
  const egg={name:'Boneweb Egg'};
  assert.equal(mulliganWR(egg,WL),64.2);
  assert.equal(mulliganWR(egg,DH),null);
  const pair=[{entityId:1,name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},
              {entityId:2,name:'Disposable Acolytes',CARDTYPE:'SPELL',COST:2,text:'x'}];
  assert.equal(mulliganCombos(pair,WL).size,2);
  assert.equal(mulliganCombos(pair,DH).size,0);
  // DH has its own screenshot statistics, without a numeric deck-wide baseline.
  const m={...DH,me:{...DH.me,hand:[card('Spectral Sight')]},opponent:{board:[]},choice:{type:'MULLIGAN',entities:[]}};
  const text=say(m,{id:'m0',type:'MULLIGAN',replace:[]});
  assert.match(text,/opening-hand WR 52.3%/);
  assert.doesNotMatch(text,/null%|67.5%/);
});

test('DH screenshot keeps use its own relative stats and retain a no-data fallback',()=>{
  const v=n=>mulliganVerdict(card(n),DH);
  for(const n of ['Spectral Sight','Illidari Studies','Infestation','Cult Neophyte','Press the Advantage'])
    assert.equal(v(n),'free',n);
  for(const n of ['Hive Map','Glacial Shard','Rustrot Viper','Kayn Sunfury'])
    assert.equal(v(n),'toss',n);
  for(const n of ['Void Soul','Sigil of the Seas','Sizzling Cinder','Grim Harvest','Void Blast','Vicious Voidscale','Stardust Scythe'])
    assert.equal(v(n),'keep',n);
  assert.equal(mulliganVerdict({...card('Spectral Sight'),name:'Unknown draw'},DH),'free');
  assert.equal(mulliganVerdict({...card('Void Blast'),name:'Unknown damage'},DH),'toss');
});

const play=(hand,c)=>say({...DH,me:{...DH.me,mana:10,hand,board:[]},opponent:{board:[]}},{id:'p',type:'POWER',option:1,entityId:c.entityId});

test('an Outcast card says whether it is at an end of the hand',()=>{
  const sight=card('Spectral Sight'),a=card('Cult Neophyte'),b=card('Glacial Shard');
  assert.match(play([sight,a,b],sight),/leftmost card in your hand, so its Outcast is active: "Draw another\."/);
  assert.match(play([a,b,sight],sight),/rightmost card in your hand, so its Outcast is active/);
  assert.match(play([a,sight,b],sight),/Outcast is not active: .*1 card\(s\) to its left, 1 to its right/);
  assert.doesNotMatch(play([a,b],a),/Outcast/);
});

test('a play that opens an Outcast card, or buries one, says so',()=>{
  const sight=card('Spectral Sight'),a=card('Cult Neophyte'),b=card('Glacial Shard'),press=card('Press the Advantage');
  assert.match(play([a,sight,b],a),/leaves Spectral Sight at an end of your hand, which turns on its Outcast/);
  assert.doesNotMatch(play([a,b,sight],a),/leaves Spectral Sight/);   // already at the end
  assert.match(play([press,a,sight],press),/go to the right end, pushing Spectral Sight off that end/);
  assert.doesNotMatch(play([b,a,sight],b),/pushing/);                  // Glacial Shard adds no card
});
