import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cardDb,loadList,rawCard} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {moves,apply} from '../src/sim.mjs';
import {netPick,recordShadowDecision,shadowView} from '../src/selfplay-shadow.mjs';
import {cardPool,dealCards,opponentDealer} from '../src/opponent-hand.mjs';
import {searchedPick,searchConfig,simRoot} from '../src/net-search.mjs';

// The look ahead on a live position (JEV_NET_SEARCH=1) and the opponent hand it is given.
const MODEL=fileURLToPath(new URL('../models/selfplay/warlock-zoo-v5.json',import.meta.url));
const cards=cardDb(),list=loadList('warlock-zoo'),net=loadNet(MODEL);
const C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
const player=(id,first=false)=>({id:100+id,playerId:id,tags:{CONTROLLER:String(id),RESOURCES:'4',FATIGUE:'0',...(first?{FIRST_PLAYER:'1'}:{})}});
const ent=(c,playerId,zone)=>({id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(playerId),ZONE:zone,CARDTYPE:c.CARDTYPE}});
const withEnv=async(env,f)=>{
  const old={};
  for(const k of Object.keys(env)){old[k]=process.env[k];if(env[k]==null)delete process.env[k];else process.env[k]=env[k]}
  try{return await f()}finally{for(const k of Object.keys(env))old[k]==null?delete process.env[k]:process.env[k]=old[k]}
};
const ENV={JEV_DECK:'warlock-zoo',JEV_NET_MODEL:MODEL,JEV_NET_SEARCH:null};

function fixture(heroClass='WARLOCK'){
  const hero=C('HERO_07',1,{HEALTH:30}),oppHero=C('HERO_07',2,{HEALTH:30});
  const hand=[C('BE_085',41),C('BE_726',42),C('TIME_025',43),C('BE_729',44)];
  const board=[hero,C('TLC_603',45,{EXHAUSTED:0})];
  const oppBoard=[oppHero,C('TLC_603',51,{EXHAUSTED:1})];
  const state={gameNumber:3,status:'RUNNING',step:'MAIN_ACTION',turn:5,me:{playerId:1,current:true,mana:4,maxMana:4,fatigue:0,handCount:4,deckCount:20,hand,board,heroClass:'WARLOCK'},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:oppBoard,heroClass,publicPlays:[]}};
  const actions=[{id:'end',type:'END_TURN',option:0},...hand.map((c,i)=>({id:`p${i}`,type:'PLAY',option:1+i,entityId:c.entityId})),
    {id:'attack',type:'ATTACK',option:9,entityId:45,targetId:51}];
  const parsed={entities:new Map([player(1,true),player(2),...board.map(c=>ent(c,1,'PLAY')),...hand.map(c=>ent(c,1,'HAND')),...oppBoard.map(c=>ent(c,2,'PLAY'))].map(e=>[e.id,e])),gameNumber:3,publicPlays:[]};
  return {parsed,state,actions};
}
const viewOf=f=>shadowView(f.parsed,f.state,f.actions,{cards,list});

test('the pool is the class and neutral cards of the prior, without what was played',()=>{
  const pool=cardPool({heroClass:'Mage',played:[]});
  assert.ok(pool.length>=8);
  for(const {id} of pool){
    const c=cards[id];
    assert.ok(c.collectible&&['MINION','SPELL','WEAPON','LOCATION'].includes(c.type));
    assert.ok(['NEUTRAL','MAGE'].includes(c.cardClass)||c.classes?.includes('MAGE'),`${id} ${c.cardClass}`);
  }
  const top=[...pool].sort((a,b)=>b.w-a.w)[0].id;
  assert.ok(!cardPool({heroClass:'Mage',played:[top]}).some(x=>x.id===top));
  assert.deepEqual(cardPool({heroClass:'Mage',prior:{rows:[]}}),[]);
});

test('a deal has the count asked, at most two of a card, and is the same for the same seed',()=>{
  const pool=cardPool({heroClass:'Priest'});
  const a=dealCards({pool,n:30,seed:7,base:1000}),b=dealCards({pool,n:30,seed:7,base:1000}),c=dealCards({pool,n:30,seed:8,base:1000});
  assert.equal(a.length,30);
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.map(x=>x.cardId),c.map(x=>x.cardId));
  const n=new Map();
  for(const x of a)n.set(x.cardId,(n.get(x.cardId)??0)+1);
  assert.ok([...n.values()].every(k=>k<=2));
  assert.equal(new Set(a.map(x=>x.entityId)).size,30);
  assert.ok(a.every(x=>['MINION','SPELL'].includes(x.CARDTYPE)&&Number.isFinite(x.COST)));
});

test('with no prior, generic cards stand in (a vanilla minion or a spell that does nothing)',()=>{
  const out=dealCards({pool:[],n:20,seed:3,base:500,crystals:4});
  assert.equal(out.length,20);
  for(const x of out){
    assert.ok(x.COST>=1&&x.COST<=5);
    assert.ok(x.cardId==='GENERIC_MINION'?x.ATK>0&&x.HEALTH>0:x.cardId==='GENERIC_SPELL');
    assert.equal(x.text,'');
  }
});

test('the dealer fills the blank hand and deck, fresh for each seed, and leaves ours alone',()=>{
  const f=fixture('MAGE'),v=viewOf(f);
  assert.ok(v.s.them.hand.every(c=>c.name==null));
  const deal=opponentDealer(f.state),root=simRoot(v.s);
  const a=deal(root,11),b=deal(root,11),c=deal(root,12);
  assert.equal(a.them.hand.length,5);
  assert.equal(a.them.deck.length,22);
  assert.ok(a.them.hand.every(x=>x.id>0&&x.name&&Number.isFinite(x.cost)));
  assert.deepEqual(a.them.hand.map(x=>x.name),b.them.hand.map(x=>x.name));
  assert.notDeepEqual(a.them.hand.map(x=>x.name),c.them.hand.map(x=>x.name));
  assert.equal(a.hand.length,root.hand.length);
  assert.equal(a.deck.length,root.deck.length);
  assert.ok(root.them.hand.every(c=>c.name==null),'the root is not touched');
  // Their cards play: every class of the prior, and a class without one, deals a hand the simulator can step through.
  for(const cls of ['Mage','Warrior','Priest','Rogue','Paladin','Druid','Shaman','Hunter','Deathknight','DemonHunter','Warlock','Unknown']){
    const g=opponentDealer({opponent:{heroClass:cls,publicPlays:[]}})(root,5);
    assert.equal(g.them.hand.length,5);
    assert.ok(moves(g).length>0);
  }
});

test('the steal of Sentenced for Smuggling takes real cards from the dealt hand',()=>{
  const f=fixture('MAGE'),root=opponentDealer(f.state)(simRoot(viewOf(f).s),4);
  // A trial card (Kazakus' result) played with no turns to wait casts its two effects at once.
  const card={...root.hand[0],cost:0,trial:{turns:0,effects:['CAP_405t3','CAP_405t9']}};
  const s={...root,hand:[card,...root.hand.slice(1)]},play=moves(s).find(m=>m.kind==='play'&&m.id===card.id);
  assert.ok(play,'the trial card can be played');
  const t=apply(s,play).s;
  assert.equal(t.them.hand.length,root.them.hand.length-2);
  assert.equal(t.hand.length,root.hand.length-1+2);
  assert.ok(t.hand.slice(-2).every(c=>c.name&&c.id>0));
});

test('the search path returns a legal step of the menu, and says what it did',()=>{
  const f=fixture(),v=viewOf(f),ranked=net.rank(v.s,v.legal),cfg={...searchConfig({}),samples:2,ms:60000};
  const r=searchedPick({net,view:v,ranked,state:f.state,cfg});
  assert.equal(r.on,true);
  assert.ok(r.error==null,r.error);
  assert.ok(Number.isInteger(r.index)&&r.index>=0&&r.index<v.legal.length);
  assert.ok(r.ms>=0&&r.greedy&&r.pick&&typeof r.override==='boolean'&&r.scores.length===v.legal.length);
  assert.equal(searchedPick({net,view:v,ranked,state:f.state,cfg}).index,r.index,'the same position is searched the same way');
});

test('over the time cap, or on an error, the greedy step stands',()=>{
  const f=fixture(),v=viewOf(f),ranked=net.rank(v.s,v.legal);
  let t=0;
  const slow=searchedPick({net,view:v,ranked,state:f.state,cfg:{...searchConfig({}),ms:50},now:()=>(t+=100)});
  assert.equal(slow.index,null);
  assert.equal(slow.timedOut,true);
  const broken=searchedPick({net,view:v,ranked,state:f.state,dealer:()=>{throw Error('no deal')}});
  assert.equal(broken.index,null);
  assert.match(broken.error,/no deal/);
});

test('JEV_NET_SEARCH unset: netPick is the greedy pick and says nothing of a search',async()=>{
  const f=fixture(),v=viewOf(f),greedy=net.rank(v.s,v.legal).steps[0].move;
  await withEnv(ENV,async()=>{
    const pick=await netPick(f);
    assert.equal(pick.action,f.actions[v.legal.indexOf(greedy)]);
    assert.equal('search' in pick,false);
  });
});

test('JEV_NET_SEARCH=1: netPick searches, the shadow row records it, and a timeout plays the greedy step',async()=>{
  const f=fixture(),v=viewOf(f),greedy=f.actions[v.legal.indexOf(net.rank(v.s,v.legal).steps[0].move)];
  const dir=await mkdtemp(join(tmpdir(),'net-search-'));
  const out=new URL(`file:///${join(dir,'shadow.jsonl').replace(/\\/g,'/')}`);
  try{
    await withEnv({...ENV,JEV_NET_SEARCH:'1',JEV_NET_SEARCH_SAMPLES:'2',JEV_SHADOW:'1'},async()=>{
      const pick=await netPick(f);
      assert.ok(f.actions.includes(pick.action));
      assert.equal(pick.search.on,true);
      assert.ok(pick.search.ms>=0&&pick.search.greedy);
      const row=await recordShadowDecision({...f,action:pick.action,source:'test',out});
      assert.equal(row.search.on,true);
      assert.equal(row.search.greedy.id,greedy.entityId);
      assert.equal('index' in row.search,false);
      assert.equal(JSON.parse((await readFile(out,'utf8')).trim()).search.on,true);
    });
    await withEnv({...ENV,JEV_NET_SEARCH:'1',JEV_NET_SEARCH_MS:'1',JEV_NET_SEARCH_SAMPLES:'64',JEV_NET_SEARCH_TURNS:'2'},async()=>{
      const pick=await netPick(f);
      assert.equal(pick.action,greedy);
      assert.equal(pick.search.timedOut,true);
    });
  }finally{await rm(dir,{recursive:true,force:true})}
});
