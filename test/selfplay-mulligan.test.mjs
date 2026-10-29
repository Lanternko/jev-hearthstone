import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNet} from '../src/selfplay-net.mjs';
import {loadList,newGame} from '../src/selfplay.mjs';
import {match} from '../src/selfplay-match.mjs';
import {withMulligan,mulliganMatch,keepAll,randomPolicy,oldPolicy,huntPolicy,tablePolicy,features,sampleRow,CORE} from '../src/selfplay-mulligan.mjs';

const zak=loadList('warlock-zakajz');

test('mulligan: keeping everything plays the very games of selfplay-match', ()=>{
  const net=loadNet('models/selfplay/warlock-zoo-0.2.0.json'),lists=[zak,zak];
  const ours=mulliganMatch([net,net],lists,{games:6,seed:41,first:0,policy:keepAll});
  assert.deepEqual(ours,match([net,net],lists,{games:6,seed:41}).tally);
});

test('mulligan: hand sizes stay, the turn-one card is drawn after, thrown cards go back into the deck', ()=>{
  for(let seed=1;seed<40;seed++){
    const s0=newGame({lists:[zak,zak],seed}),size=[s0.hand.length],deck=s0.deck.length;
    const all=({hand})=>hand.map(c=>c.id);
    const {s,thrown}=withMulligan(newGame({lists:[zak,zak],seed}),[all,all]);
    assert.equal(s.hand.length,size[0]);
    assert.equal(s.deck.length,deck,'as many cards in the deck as before');
    assert.equal(thrown[0].length,3);assert.equal(thrown[1].length,4,'the coin is never thrown');
    assert.ok(s.hand.slice(0,3).every(c=>c.raw),'replacements are real cards');
  }
});

test('mulligan: the replacements come off the top, so a card thrown is never its own replacement', ()=>{
  let back=0;
  for(let seed=1;seed<200;seed++){
    const s0=newGame({lists:[zak,zak],seed}),top=[s0.hand[3].raw,...s0.deck].slice(0,4).map(c=>c.name);
    const one=({hand})=>[hand[0].id];
    const {s}=withMulligan(newGame({lists:[zak,zak],seed}),[one,null]);
    assert.equal(s.hand[0].name,top[0],'the replacement is the turn-one card that was put back');
    if(s.hand.slice(0,3).some(c=>c.raw===s0.hand[0].raw))back++;   // (the turn-one draw may find it, as in the client)
  }
  assert.equal(back,0);
});

test('mulligan: the random policy throws about half, and the same seed throws the same', ()=>{
  const hand=Array.from({length:4},(_,i)=>({id:i,name:'x'}));
  const p=randomPolicy(5),q=randomPolicy(5);
  let n=0;for(let k=0;k<400;k++){const a=p({hand}),b=q({hand});assert.deepEqual(a,b);n+=a.length}
  assert.ok(n>700&&n<900,n);
});

const card=(id,name,cost,type='MINION',atk=1)=>({id,name,raw:{entityId:id,name,COST:cost,CARDTYPE:type,ATK:atk,text:''}});
const hand=(...cs)=>cs.map((c,i)=>card(i+1,...c));

test('mulligan: the live rule throws a lone Velocidrake and Zakajz and keeps Floating Lessons (the complaint)', async ()=>{
  const old=await oldPolicy('warlock-zakajz');
  const h=hand(['Ruinous Velocidrake',5],['Floating Lessons',1,'SPELL'],['Zakajz the Corruptor',4,'MINION',5]);
  assert.deepEqual(old({hand:h,first:true,coin:false}).sort(),[1,3]);
});

test('mulligan: the hunt rule keeps the core, throws all without it, and fills the curve beside it', ()=>{
  const noCore=hand(['Glacial Shard',1],['Floating Lessons',1,'SPELL'],['Cult Neophyte',2]);
  assert.deepEqual(huntPolicy({cheap:1})({hand:noCore}),[1,2,3]);
  const withCore=hand(["Ritual of C'Thun",1,'SPELL'],['Glacial Shard',1],['Tachyon Barrage',2,'SPELL'],['Cult Neophyte',2]);
  assert.deepEqual(huntPolicy({})({hand:withCore}),[2,3,4]);
  assert.deepEqual(huntPolicy({cheap:1})({hand:withCore}),[3,4]);
  assert.deepEqual(huntPolicy({cheap:2})({hand:withCore}),[3]);
  assert.equal(CORE.size,3);
});

test('mulligan: a table keeps the subset with the best score; its rows give the features it scores', ()=>{
  const h=hand(['Godfather Kazakus',3],['Tachyon Barrage',2,'SPELL'],['Glacial Shard',1]);
  const doc={w:{'k:Godfather Kazakus':1,'k:Tachyon Barrage':-0.5,'k:Glacial Shard|core':0.2,'k:Glacial Shard|nocore':-0.3}};
  assert.deepEqual(tablePolicy(doc)({hand:h,first:true}),[2]);
  const row=sampleRow({opp:'dh-cthun',first:false,seed:3,won:1,offered:h.map(c=>c.name),thrown:['Tachyon Barrage']});
  assert.deepEqual(row.f,features(h.map(c=>c.name),[1,0,1],false));
  assert.equal(row.f['k:Glacial Shard|core'],1);
  assert.equal(row.c['o:Tachyon Barrage|2nd'],1);
  assert.equal(row.c['opp:dh-cthun|2nd'],1);
  // a pair offered and one thrown: one kept
  const two=sampleRow({opp:'x',first:true,seed:1,won:0,offered:['Twilight Egg','Twilight Egg','Platysaur'],thrown:['Twilight Egg']});
  assert.equal(two.f['k:Twilight Egg'],1);assert.equal(two.f['dup:Twilight Egg'],undefined);
});

test('mulligan: the frozen zakajz table (E-281) keeps the core and Timehopper and throws Tachyon Barrage, Glacial Shard and Vaultkeeper', async ()=>{
  const {loadPolicy}=await import('../src/selfplay-mulligan.mjs');
  const pol=await loadPolicy('models/mulligan/warlock-zoo-0.2.1.json');
  const h=hand(["Ritual of C'Thun",1,'SPELL'],['Tachyon Barrage',2,'SPELL'],['Twilight Timehopper',2,'MINION',4],['Glacial Shard',1,'MINION',2]);
  for(const first of [true,false])assert.deepEqual(pol({hand:h,first}).sort(),[2,4]);
  const late=hand(['Vaultkeeper',5,'MINION',3],['Godfather Kazakus',3,'MINION',3],['Blasphemy',4,'SPELL']);
  assert.deepEqual(pol({hand:late,first:true}).sort(),[1,3]);
});

test('mulligan: the live warlock-zakajz mulligan keeps exactly what the table keeps, and only for its network', async ()=>{
  const {constrainActions}=await import('../src/policy.mjs');
  const {MODELS}=await import('../src/selfplay-shadow.mjs');
  const {TABLES}=await import('../src/mulligan-table.mjs');
  const doc=JSON.parse((await import('node:fs')).readFileSync(`models/mulligan/${TABLES['warlock-zakajz']}.json`,'utf8'));
  assert.equal(doc.net,MODELS['warlock-zakajz'],'the table was fit to the network that drives the deck');
  const names=["Ritual of C'Thun",'Tachyon Barrage','Twilight Timehopper','Glacial Shard'];
  const entities=names.map((name,i)=>({entityId:11+i,name,cost:1,tags:{}}));
  const state={me:{heroClass:'WARLOCK',hand:entities},opponent:{},choice:{type:'MULLIGAN',id:1,entities}};
  const acts=Array.from({length:16},(_,m)=>({id:`m${m}`,type:'MULLIGAN',choiceId:1,replace:entities.filter((_,i)=>m&(1<<i)).map(e=>e.entityId)}));
  const prev=process.env.JEV_DECK;process.env.JEV_DECK='warlock-zakajz';
  try{
    const out=constrainActions(state,acts);
    assert.equal(out.length,1);assert.deepEqual([...out[0].replace].sort(),[12,14]);
    process.env.JEV_NET_MODEL='models/selfplay/warlock-zoo-v9.json';
    const {mulliganTable}=await import('../src/mulligan-table.mjs');
    assert.equal(mulliganTable('warlock-zakajz'),null,'another network: no table');
  }finally{
    if(prev===undefined)delete process.env.JEV_DECK;else process.env.JEV_DECK=prev;
    delete process.env.JEV_NET_MODEL;
  }
});
