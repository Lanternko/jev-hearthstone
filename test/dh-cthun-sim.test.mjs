import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,hpOf,handCard,costOf,flip} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

const DB=cardDb(),LIST=loadList('dh-cthun');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
// Seat 0 to act with exactly the hands and decks a test names.
const table=({hand=[],deck=[],oppDeck=[],mana=10,seed=7}={})=>{
  const s=newGame({lists:[LIST,LIST],seed});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:[],deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const choose=(s,id)=>step(s,{kind:'choose',id});
const end=s=>step(s,{kind:'end'});
const filler=(n,at=80)=>Array.from({length:n},(_,i)=>C('RLK_532',at+i));
const minions=bs=>bs.filter(b=>b.type==='MINION');
const find=(bs,name)=>bs.find(b=>b.name===name);
const names=cs=>cs.map(c=>c.name);
// A plain enemy minion with the stats a test needs.
const foe=(s,over={})=>({...hero(s,'opp'),id:-9,type:'MINION',name:'Boar',atk:1,hp:5,maxHp:5,armor:0,taunt:false,stealth:false,
  frozen:false,canAttack:false,attacks:0,maxAttacks:1,side:'opp',...over});
// One of ours that has stood since the last turn.
const stands=(s,id,eid)=>{
  s=play({...s,hand:[...s.hand,H(id,eid)]},eid);
  return {...s,me:s.me.map(b=>b.id===eid?{...b,canAttack:true,attacks:0}:b)};
};

test('the list is thirty cards, Broxigar waits outside the deck, every card is a step at ten mana', ()=>{
  assert.equal(Object.values(LIST.cards).reduce((a,b)=>a+b,0),30);
  const g=newGame({lists:[LIST,LIST],seed:3});
  assert.equal(g.brox.cardId,'TIME_020');
  assert.ok(![...g.hand,...g.deck].some(c=>c.name==='Broxigar'));
  assert.equal(g.hand.length+g.deck.length,29);
  for(const id of Object.keys(LIST.cards)){
    const s=table({hand:[H(id,50),H('BE_204',51)],deck:filler(5),oppDeck:filler(5)});
    assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50),DB[id].name);
  }
});

test('Glacial Shard freezes the enemy it hits; the frozen minion cannot attack and thaws when its turn ends', ()=>{
  let s=table({hand:[H('CORE_UNG_205',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,opp:[...s.opp,foe(s,{atk:3})]};
  assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50&&m.targetId===-9));
  s=play(s,50,-9);
  assert.ok(find(s.opp,'Boar').frozen);
  s=end(s);                                                       // the other seat: Boar stands on its own side
  s={...s,me:s.me.map(b=>b.id===-9?{...b,canAttack:true}:b)};
  assert.ok(!moves(s).some(m=>m.kind==='attack'&&m.id===-9));
  s=end(s);
  s=end(s);
  const boar=find(s.opp.length?s.opp:[],'Boar')??find(s.me,'Boar');
  assert.ok(!boar.frozen);
});

test('Grim Harvest draws a card and plants a Dreadseed that sleeps, cannot be hit, and wakes on its schedule', ()=>{
  const wanted={'Hound Dreadseed':2,'Crow Dreadseed':1,'Serpent Dreadseed':3},seen=new Set();
  for(let seed=1;seed<80&&seen.size<3;seed++){
    let s=play(table({hand:[H('EDR_840',50)],deck:filler(5),oppDeck:filler(5),seed}),50);
    const b=minions(s.me)[0];
    if(seen.has(b.name))continue;
    seen.add(b.name);
    assert.equal(s.hand.length,1,'the draw');
    assert.ok(b.dormant);
    assert.equal(b.wake,wanted[b.name]);
    const mark={...b};
    s={...s,opp:[...s.opp]};
    assert.ok(!moves(flip(end(s))).some(m=>m.targetId===b.id),'a sleeping seed is no target');
    for(let k=0;k<wanted[b.name];k++){
      assert.ok(find(s.me,b.name).dormant,`${b.name} sleeps before its turn ${k+1}`);
      s=end(end(s));
    }
    const up=find(s.me,b.name);
    assert.ok(!up.dormant);
    assert.equal(up.atk,mark.atk);
    if(b.name==='Hound Dreadseed')assert.ok(hero(s,'me').atk>=3,'the Hound hits through the hero');
  }
  assert.equal(seen.size,3,'all three seeds come up');
});

test("Wyvern's Slumber: two Dormant Dreadseeds, or 2 damage to every awake minion", ()=>{
  let s=play(table({hand:[H('EDR_820',50)],deck:filler(5),oppDeck:filler(5)}),50);
  assert.deepEqual(s.choice.options,['EDR_820a','EDR_820b']);
  const seeds=choose(s,'EDR_820a');
  assert.equal(minions(seeds.me).length,2);
  assert.ok(minions(seeds.me).every(b=>b.dormant&&/Dreadseed/.test(b.name)));
  // 2 damage: our 3/2 dies, a 5-health enemy drops to 3, the sleeper is untouched
  let t=table({hand:[H('EDR_820',50)],deck:filler(5),oppDeck:filler(5)});
  t=stands(t,'CORE_SCH_713',60);
  t={...t,me:[...t.me,...minions(seeds.me).slice(0,1)],opp:[...t.opp,foe(t)]};
  const sleeper=minions(t.me).find(b=>b.dormant),hp=sleeper.hp;
  t=choose(play(t,50),'EDR_820b');
  assert.ok(!find(t.me,'Cult Neophyte'));
  assert.equal(find(t.opp,'Boar').hp,3);
  assert.equal(find(t.me,sleeper.name).hp,hp);
});

test('Infestation hands out two Gorishi Stingers; each hits for 2 and leaves a 2/1 Rush Grub', ()=>{
  let s=play(table({hand:[H('TLC_902',50)],deck:filler(5),oppDeck:filler(5)}),50);
  assert.deepEqual(names(s.hand),['Gorishi Stinger','Gorishi Stinger']);
  const face=hero(s,'opp'),id=s.hand[0].id;
  assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===id&&m.targetId===face.id));
  const t=play(s,id,face.id);
  assert.equal(hpOf(hero(t,'opp')),28);
  const grub=find(t.me,'Silithid Grub');
  assert.deepEqual([grub.atk,grub.hp,grub.rushOnly],[2,1,true]);
});

test('the Portals to Argus: four Demons for the other side, each death draws and shuffles the next Portal, the last brings Broxigar back', ()=>{
  const stages=['TIME_020t2','TIME_020t3','TIME_020t4','TIME_020t5'];
  const demons=["Fleeing Ur'zul",'Fleeing Incubus','Fleeing Wrathguard','Fleeing Terrorguard'];
  let s=table({hand:[],deck:filler(12),oppDeck:filler(5)});
  s={...s,brox:{...C('TIME_020',0)}};
  for(let i=0;i<4;i++){
    const card=s.hand.find(c=>c.name===DB[stages[i]].name);
    s={...s,mana:10,hand:[...s.hand.filter(c=>c!==card),...(card?[card]:[H(stages[i],50+i)])]};
    const id=s.hand.find(c=>c.name===DB[stages[i]].name).id;
    s=play(s,id);
    assert.ok(find(s.opp,demons[i]),`${demons[i]} stands on the other side`);
    // the demon dies: Broxigar's Last Stand deals 1 to the 1-health demons, so hit it directly instead
    const d=find(s.opp,demons[i]);
    s={...s,me:[...s.me],hand:[...s.hand,H('CATA_526',70+i)],opp:s.opp.map(b=>b.id===d.id?{...b,hp:1}:b)};
    const drawn=s.hand.length;
    s=play(s,70+i);
    assert.ok(!find(s.opp,demons[i]),`${demons[i]} died`);
    if(i<3){
      const next=DB[stages[i+1]].name;
      const k=s.deck.findIndex(c=>c.name===next);
      assert.ok(k>=0,`${next} was shuffled into the deck`);
      assert.ok(s.hand.length>=drawn-1+1,'the death drew a card');
      s={...s,hand:[...s.hand,handCard(s.deck[k],true)],deck:s.deck.filter((_,j)=>j!==k)};
    }
  }
  assert.ok(s.hand.some(c=>c.name==='Broxigar'));
  assert.equal(s.brox,null);
});

test('Broxigar played from the hand is a 12/12 with Charge', ()=>{
  const s=play(table({hand:[H('TIME_020',50)],deck:filler(3),oppDeck:filler(3)}),50);
  const b=find(s.me,'Broxigar');
  assert.deepEqual([b.atk,b.hp,b.canAttack],[12,12,true]);
});

test('Axe of Cenarius: a hero attack that kills a minion draws a Portal from the deck, and heals', ()=>{
  let s=table({hand:[H('TIME_020t1',50)],deck:[...filler(4),C('TIME_020t2',51)],oppDeck:filler(3)});
  s=play(s,50);
  assert.ok(hero(s,'me').lifesteal);
  s=end(end(s));
  s={...s,hand:[],opp:[...s.opp,foe(s,{atk:0,hp:1,maxHp:1})],me:s.me.map(b=>b.type==='HERO'?{...b,hp:20}:b)};
  const hit={kind:'attack',id:hero(s,'me').id,targetId:-9};
  assert.ok(moves(s).some(m=>m.kind==='attack'&&m.id===hit.id&&m.targetId===-9));
  const t=step(s,hit);
  assert.ok(names(t.hand).includes('First Portal to Argus'));
  assert.equal(hero(t,'me').hp,23);
});

test('Remnant of Rage costs one less for every minion that died this turn, on either side, and forgets them next turn', ()=>{
  let s=table({hand:[H('END_004',50),H('CATA_526',51)],deck:filler(6),oppDeck:filler(5)});
  s=stands(s,'CORE_UNG_205',60);
  s={...s,opp:[...s.opp,foe(s,{hp:1,maxHp:1})]};
  const remnant=()=>s.hand.find(c=>c.name==='Remnant of Rage');
  assert.equal(costOf(s,remnant()),7);
  s=play(s,51);                                                   // 1 damage to all: both 1-health minions die
  assert.equal(s.died,1);
  assert.equal(s.them.died,1);
  assert.equal(costOf(s,remnant()),5);
  const n=s.hand.length,mana=s.mana;
  const t=play({...s,mana:5},50);
  assert.equal(t.hand.length,n-1+2);                              // Battlecry: draw 2
  assert.equal(t.mana,0);
  const next=end(end(s));
  assert.equal(costOf(next,next.hand.find(c=>c.name==='Remnant of Rage')),7);
  assert.ok(mana>=0);
});

test('Hungering Cavern costs 0 once a friendly minion has died this turn, and heals what it deals', ()=>{
  let s=table({hand:[H('BE_877',50),H('CATA_526',51)],deck:filler(6),oppDeck:filler(5)});
  const cavern=()=>s.hand.find(c=>c.name==='Hungering Cavern');
  assert.equal(costOf(s,cavern()),2);
  s=stands(s,'CORE_UNG_205',60);
  s={...s,opp:[...s.opp,foe(s,{hp:1,maxHp:1})]};
  s=play(s,51);                                                   // an enemy died: still 2
  assert.equal(s.died,1);                                         // ours died too
  assert.equal(costOf(s,cavern()),0);
  const face=hero(s,'opp');
  s={...s,me:s.me.map(b=>b.type==='HERO'?{...b,hp:20}:b)};
  const mana=s.mana,t=play(s,50,face.id);
  assert.equal(t.mana,mana);
  assert.equal(hpOf(hero(t,'opp')),28);
  assert.equal(hero(t,'me').hp,22);
});

test("Broxigar's Last Stand hits every minion for 1 and draws a card for each that died", ()=>{
  let s=table({hand:[H('CATA_526',50)],deck:filler(8),oppDeck:filler(5)});
  s=stands(s,'CORE_UNG_205',60);                                  // 2/1
  s=stands(s,'CORE_SCH_713',61);                                  // 3/2
  const n=s.hand.length;
  s=play(s,50);
  assert.equal(minions(s.me).length,1);
  assert.equal(find(s.me,'Cult Neophyte').hp,1);
  assert.equal(s.hand.length,n-1+1);
});

test('Sigil of the Seas summons a 3/3 Naga with Taunt at the start of your next turn', ()=>{
  let s=play(table({hand:[H('CATA_528',50)],deck:filler(5),oppDeck:filler(5)}),50);
  assert.equal(minions(s.me).length,0);
  s=end(end(s));
  const naga=find(s.me,'Naga Monstrosity');
  assert.deepEqual([naga.atk,naga.hp,naga.taunt],[3,3,true]);
});

test("Gargantuan Slitherer offers the four C'Thun abilities; Spawn of C'Thun only if C'Thun started in the deck", ()=>{
  let s=table({hand:[H('BE_204',50),H('BE_014',51)],deck:filler(6),oppDeck:filler(5)});
  s={...s,opp:[...s.opp,foe(s)]};
  s=play(s,50);
  assert.equal(s.choice.kind,'cthun');
  assert.equal(s.choice.options.length,4);
  s=choose(s,'BE_013t4');
  assert.equal(minions(s.me).filter(b=>b.name==='Faceless Fanatic').length,2);
  assert.deepEqual(s.cthunSeen,['BE_013t4']);
  assert.equal(play({...s,cthunStart:true},51).choice?.kind,'cthun');
  assert.equal(play({...s,cthunStart:false},51).choice,null);
});

test('Tentacle Lash: after the hero attacks C\'Thun is one cheaper in hand and deck, and an ability is picked', ()=>{
  let t=table({hand:[H('BE_771',50),H('BE_013',51)],deck:[...filler(4),C('BE_013',52)],oppDeck:filler(5)});
  t=play(t,50);
  assert.equal(t.hand.find(c=>c.name.startsWith("C'Thun")).cost,10);
  t=end(end(t));
  t={...t,me:t.me.map(b=>b.type==='HERO'?{...b,atk:1,canAttack:true,attacks:0}:b)};
  t=step(t,{kind:'attack',id:hero(t,'me').id,targetId:hero(t,'opp').id});
  assert.equal(t.choice.kind,'cthun');
  assert.equal(t.hand.find(c=>c.name.startsWith("C'Thun")).cost,9);
  assert.equal(t.deck.find(c=>c.cardId==='BE_013').COST,9);
});

test("C'Thun's body picks two of the four abilities, each tripled once every kind has been triggered", ()=>{
  const setup=seen=>{
    const s=table({hand:[H('BE_013',50)],deck:filler(6),oppDeck:filler(5)});
    return {...s,cthunSeen:seen,opp:[...s.opp,foe(s,{hp:40,maxHp:40})]};
  };
  const fans=s=>minions(s.me).filter(b=>b.name==='Faceless Fanatic').length;
  const dealt=s=>(30-hpOf(hero(s,'opp')))+(40-find(s.opp,'Boar').hp);
  const boar=s=>find(s.opp,'Boar').id;
  // Plain: Servants then Glare, two picks only.
  let plain=play(setup([]),50);
  assert.equal(plain.choice.kind,'cthun');
  assert.equal(plain.choice.options.length,4);
  plain=choose(plain,'BE_013t4');
  assert.deepEqual([...plain.choice.options].sort(),['BE_013t1','BE_013t2','BE_013t3']);
  plain=choose(plain,'BE_013t3');   // one enemy minion: Glare needs no pick
  assert.equal(plain.choice,null);
  assert.equal(fans(plain),2);
  assert.equal(dealt(plain),5);
  // Tripled: Wrath (21 split) and Servants (6 Fanatics).
  let triple=play(setup(['BE_013t1','BE_013t2','BE_013t3','BE_013t4']),50);
  triple=choose(triple,'BE_013t1');
  triple=choose(triple,'BE_013t4');
  assert.equal(triple.choice,null);
  assert.equal(fans(triple),6);
  assert.equal(dealt(triple),21);
  // Tripled Glare: one pick, one hit of 15 (two targets here, so it asks).
  const two=seen=>{const s=setup(seen);return {...s,opp:[...s.opp,foe(s,{id:-10,name:'Yak',hp:40,maxHp:40})]}};
  let g=play(two(['BE_013t1','BE_013t2','BE_013t3','BE_013t4']),50);
  g=choose(g,'BE_013t3');
  assert.equal(g.choice.kind,'glare');
  g=choose(g,boar(g));
  assert.equal(40-find(g.opp,'Boar').hp,15);
  assert.equal(find(g.opp,'Yak').hp,40);
  assert.equal(g.choice.kind,'cthun');
  assert.equal(g.choice.options.includes('BE_013t3'),false);
});

test('Illidari Studies discovers an Outcast card and makes the next Studies cost 1 less', ()=>{
  let s=table({hand:[H('CORE_YOP_001',50),H('CORE_YOP_001',51)],deck:filler(5),oppDeck:filler(5)});
  assert.equal(costOf(s,s.hand[0]),1);
  s=play(s,50);
  assert.equal(s.choice.kind,'studies');
  assert.equal(s.choice.options.length,3);
  const pick=s.choice.options[0];
  s=choose(s,pick);
  assert.ok(names(s.hand).includes(DB[pick].name));
  assert.equal(costOf(s,s.hand.find(c=>c.name==='Illidari Studies')),0);
});

test('Outcast: Crimson Sigil Runner draws only when played from either end of the hand', ()=>{
  const run=at=>{
    const hand=[H('CORE_UNG_205',60),H('CORE_UNG_205',61),H('CORE_UNG_205',62)];
    hand.splice(at,0,H('CORE_BT_480',50));
    const s=table({hand,deck:filler(5),oppDeck:filler(5)});
    return play(s,50).hand.length-(hand.length-1);
  };
  assert.equal(run(0),1);
  assert.equal(run(3),1);
  assert.equal(run(1),0);
});

test('Nightmare Lord Xavius discovers a minion of the deck and hands it over with +2/+2', ()=>{
  let s=table({hand:[H('EDR_856',50)],deck:[C('BE_204',51),C('CORE_SCH_713',52),C('CORE_UNG_205',53),...filler(3)],oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(s.choice.kind,'xavius');
  const id=s.choice.options[0],raw=s.deck.find(d=>d.entityId===id);
  s=choose(s,id);
  const got=s.hand.find(c=>c.name===raw.name);
  assert.deepEqual([got.atk,got.hp],[Number(raw.ATK)+2,Number(raw.HEALTH)+2]);
  assert.ok(!s.deck.some(d=>d.entityId===id));
});
