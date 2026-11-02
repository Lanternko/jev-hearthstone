import test from 'node:test';
import assert from 'node:assert/strict';
import {MODELS,SPECIALISTS,modelFor,modelFile} from '../src/selfplay-shadow.mjs';
import {checkModel} from '../src/game-zoo.mjs';

// Specialists (the user, 2026-11-01): a deck's network fine-tuned against one opponent class takes over when the
// opponent's hero is of that class; every other class, and a class not known yet, keeps the deck's own network.
const withEnv=async(env,f)=>{
  const old={};
  for(const k of Object.keys(env)){old[k]=process.env[k];if(env[k]==null)delete process.env[k];else process.env[k]=env[k]}
  try{return await f()}finally{for(const k of Object.keys(env))old[k]==null?delete process.env[k]:process.env[k]=old[k]}
};
const withSpecialists=async(table,f)=>{
  const old={...SPECIALISTS};
  for(const k of Object.keys(SPECIALISTS))delete SPECIALISTS[k];
  Object.assign(SPECIALISTS,table);
  try{return await f()}finally{for(const k of Object.keys(SPECIALISTS))delete SPECIALISTS[k];Object.assign(SPECIALISTS,old)}
};

// User 2026-11-01: demon hunters get dh-v1 (E-305 B); priests (0.2.2 pulled, F-918) and every other class keep 0.2.0.
test('warlock-zakajz plays dh-v1 against demon hunters and 0.2.0 against priests and the rest', async()=>{
  await withEnv({JEV_NET_MODEL:null},()=>{
    assert.deepEqual(SPECIALISTS,{'warlock-zakajz':{DEMONHUNTER:'warlock-zakajz-dh-v1-20261101'}});
    assert.equal(modelFor('warlock-zakajz','PRIEST'),'warlock-zoo-0.2.0');
    assert.equal(modelFor('warlock-zakajz','DEMONHUNTER'),'warlock-zakajz-dh-v1-20261101');
    assert.equal(modelFor('warlock-zakajz','SHAMAN'),'warlock-zoo-0.2.0');
    assert.equal(modelFor('warlock-zakajz',undefined),'warlock-zoo-0.2.0');
    assert.equal(checkModel('warlock-zakajz').ok,true);
  });
});

test('the live network pick against a priest comes from zoo 0.2.0 and encodes the position', async()=>{
  const {cardDb,rawCard}=await import('../src/selfplay.mjs');
  const cards=cardDb(),C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
  const player=(id,first=false)=>({id:100+id,playerId:id,tags:{CONTROLLER:String(id),RESOURCES:'4',FATIGUE:'0',...(first?{FIRST_PLAYER:'1'}:{})}});
  const ent=(c,playerId,zone)=>({id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(playerId),ZONE:zone,CARDTYPE:c.CARDTYPE}});
  const hand=[C('CORE_UNG_205',41),C('BE_728',42)],board=[C('HERO_07',1,{HEALTH:30})],oppBoard=[C('HERO_09',2,{HEALTH:30}),C('CS2_231',51)];
  const state={gameNumber:4,status:'RUNNING',step:'MAIN_ACTION',turn:4,
    me:{playerId:1,current:true,mana:4,maxMana:4,fatigue:0,handCount:2,deckCount:20,hand,board,heroClass:'WARLOCK'},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:oppBoard,heroClass:'PRIEST'}};
  const actions=[{id:'end',type:'END_TURN',option:0},{id:'shard',type:'POWER',option:1,entityId:41,targetId:51},{id:'zak',type:'POWER',option:2,entityId:42}];
  const parsed={entities:new Map([player(1,true),player(2),...board.map(c=>ent(c,1,'PLAY')),...hand.map(c=>ent(c,1,'HAND')),...oppBoard.map(c=>ent(c,2,'PLAY'))].map(e=>[e.id,e])),gameNumber:4,publicPlays:[]};
  const {netPick}=await import('../src/selfplay-shadow.mjs');
  await withEnv({JEV_NET_MODEL:null,JEV_DECK:'warlock-zakajz'},async()=>{
    const pick=await netPick({parsed,state,actions});
    assert.ok(pick,'the network picks');
    assert.equal(pick.model,'warlock-zoo-0.2.0');
    const dh=await netPick({parsed,state:{...state,opponent:{...state.opponent,heroClass:'DEMONHUNTER'}},actions});
    assert.equal(dh.model,'warlock-zakajz-dh-v1-20261101');
    const shaman=await netPick({parsed,state:{...state,opponent:{...state.opponent,heroClass:'SHAMAN'}},actions});
    assert.equal(shaman.model,'warlock-zoo-0.2.0');
  });
});

test('the specialist plays against its class only, the deck network against the rest', async()=>{
  await withEnv({JEV_NET_MODEL:null},()=>withSpecialists({'warlock-zakajz':{PRIEST:'warlock-zoo-v9'}},()=>{
    assert.equal(modelFor('warlock-zakajz','PRIEST'),'warlock-zoo-v9');
    assert.match(modelFile('warlock-zakajz','PRIEST'),/warlock-zoo-v9\.json$/);
    for(const cls of ['DEMONHUNTER','PALADIN',undefined])assert.equal(modelFor('warlock-zakajz',cls),MODELS['warlock-zakajz'],String(cls));
    assert.equal(modelFor('warlock-zoo','PRIEST'),MODELS['warlock-zoo'],'other decks keep theirs');
    assert.equal(checkModel('warlock-zakajz').ok,true);
  }));
});

test('a missing specialist file stops the run before a game, and JEV_NET_MODEL still wins', async()=>{
  await withSpecialists({'warlock-zakajz':{PRIEST:'not-built-yet'}},async()=>{
    await withEnv({JEV_NET_MODEL:null},()=>{
      const check=checkModel('warlock-zakajz');
      assert.equal(check.ok,false);
      assert.match(check.error,/specialist .* PRIEST not found/);
    });
    await withEnv({JEV_NET_MODEL:'models/selfplay/warlock-zoo-v9.json'},()=>{
      assert.equal(modelFor('warlock-zakajz','PRIEST'),'warlock-zoo-v9');
      assert.equal(checkModel('warlock-zakajz').ok,true);
    });
  });
});
