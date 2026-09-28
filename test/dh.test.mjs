import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst,drawCount,overdraws} from '../src/policy.mjs';
import {describe} from '../src/describe.mjs';
import {fromState,apply,moves,signature,cardModel} from '../src/sim.mjs';
import {search,menu,actionFor} from '../src/plan.mjs';
import {prepare,rulePick} from '../src/choose.mjs';
import {respectsDHTactics} from '../src/dh-tactics.mjs';
import {parsePower,publicState,candidates,createParser} from '../src/power.mjs';

const db=JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url)));
let serial=100;
function card(name,extra={}){
  const d=db.find(c=>c.name===name&&(c.collectible||c.type==='HERO_POWER'));
  assert.ok(d,name);
  return {entityId:serial++,cardId:d.id,name:d.name,text:d.text,CARDTYPE:d.type,
    COST:d.cost,ATK:d.attack,HEALTH:d.health,...extra};
}
const end={id:'end',type:'END_TURN'};
const act=(c,target)=>({id:`a${c.entityId}${target?.entityId??''}`,type:'POWER',entityId:c.entityId,
  ...(target?{targetId:target.entityId}:{})});
const fixture=({hand=[],mine=[],theirs=[],mana=10,hp=30,hero={}}={})=>({
  me:{heroClass:'DEMONHUNTER',current:true,mana,hand,deckCount:20,
    board:[{entityId:1,CARDTYPE:'HERO',name:'Illidan',ATK:0,HEALTH:30,NUM_ATTACKS_THIS_TURN:0,...hero},...mine]},
  opponent:{board:[{entityId:2,CARDTYPE:'HERO',name:'Enemy',HEALTH:hp},...theirs]}});

test('DH retains Outcast enablers and attacks but spends playable bodies before ending',()=>{
  const left=card('Glacial Shard'),sight=card('Spectral Sight'),right=card('Cult Neophyte');
  const minion=card('Cult Neophyte',{entityId:10});
  const s=fixture({hand:[left,sight,right],mine:[minion],mana:3});
  const actions=[end,act(left,s.opponent.board[0]),act(sight),act(right),act(minion,s.opponent.board[0])];
  assert.deepEqual(spendFirst(s,constrainActions(s,actions)),actions.filter(a=>a!==end));
});

test('Seas and generated Souls take mana before Demon Claws and fallback attack plans',()=>{
 for(const name of ['Sigil of the Seas','Void Soul','Cult Neophyte']){
  const c=card(name),hp=card('Demon Claws'),s=fixture({hand:[c],mine:[hp],mana:2});
  const actions=[end,act(hp),act(c)];
  const p=prepare(s,constrainActions(s,actions));
  assert.equal(p.forced?.action.entityId,c.entityId);
  const fallback={state:s,acts:actions,crit:Object.fromEntries(actions.map(a=>[a.id,{}])),plans:{p1:[{}]}};
  assert.equal(rulePick(fallback),act(c).id);
 }
});

test('Shard freezes the highest attack legal unfrozen active enemy minion',()=>{
 const shard=card('Glacial Shard');
 const small=card('Cult Neophyte',{ATK:2}),big=card('Cult Neophyte',{ATK:8});
 const frozen=card('Cult Neophyte',{ATK:12,FROZEN:1}),dormant=card('Cult Neophyte',{ATK:15,DORMANT:1});
 const s=fixture({hand:[shard],theirs:[small,big,frozen,dormant]});
 const actions=[end,...s.opponent.board.map(t=>act(shard,t))];
 assert.deepEqual(constrainActions(s,actions),[end,act(shard,big)]);
 const legal=[end,act(shard,s.opponent.board[0]),act(shard,small)];
 assert.deepEqual(constrainActions(s,legal),[end,act(shard,small)]);
});

test('tempo spending does not override lethal or force summons on a full board',()=>{
 const seas=card('Sigil of the Seas'),hp=card('Demon Claws');
 const lethal=fixture({hand:[seas],mine:[hp],mana:1,hp:1});
 assert.equal(prepare(lethal,[end,act(hp),act(seas)]).lethal?.action.entityId,hp.entityId);
 const full=fixture({hand:[seas],mine:Array.from({length:7},()=>card('Cult Neophyte'))});
 assert.deepEqual(spendFirst(full,[end,act(seas)]),[end,act(seas)]);
});

test('DH allows a minion attack before a weapon attack and a weapon replacement',()=>{
  const w=card('Stardust Scythe'),next=card('Stardust Scythe'),m=card('Cult Neophyte');
  const s=fixture({hand:[next],mine:[w,m],hero:{ATK:3}});
  const actions=[end,act(s.me.board[0],s.opponent.board[0]),act(m,s.opponent.board[0]),act(next)];
  assert.deepEqual(spendFirst(s,constrainActions(s,actions)),actions);
});

test('Spectral Sight counts the Outcast draw before it leaves hand',()=>{
  const sight=card('Spectral Sight'),a=card('Cult Neophyte'),b=card('Glacial Shard');
  for(const [hand,n] of [[[sight,a,b],2],[[a,sight,b],1],[[a,b,sight],2],[[sight],2]]){
    const s=fixture({hand});assert.equal(drawCount(sight,s),n);
    s.me.deckCount=1;assert.equal(overdraws(s,sight),n===2);
  }
  const s=fixture({hand:[...Array.from({length:9},()=>card('Cult Neophyte')),sight]});
  assert.equal(overdraws(s,sight),true);
  assert.deepEqual(constrainActions(s,[end,act(sight)]),[end]);
  assert.match(describe(s,act(sight)),/draws 2 card\(s\) now/);
});

test('Demon Claws creates a one-damage lethal from zero Attack',()=>{
  const power=card('Demon Claws');const s=fixture({mine:[power],mana:1,hp:1});
  const actions=[end,act(power)];
  const p=prepare(s,constrainActions(s,actions));
  assert.equal(p.lethal?.action.entityId,power.entityId);
  assert.equal(p.rest[0].targetId,2);
  const {start,plans}=search(s,actions);
  const after=apply(start,plans[0].steps[0]).s;
  assert.equal(after.mana,0);assert.equal(after.me[0].atk,1);
  assert.ok(!moves(after).some(m=>m.kind==='power'));
  const real=structuredClone(s);real.me.mana=0;real.me.board[0].ATK=1;real.me.board[1].EXHAUSTED=1;
  assert.equal(signature(fromState(real)),signature(after));
  assert.match(menu(s,actions,Object.fromEntries(actions.map(a=>[a.id,a]))).criteria.p1.description,/Use Demon Claws/);
});

test('Demon Claws does not buy an attack when frozen or already spent',()=>{
  for(const hero of [{FROZEN:1},{NUM_ATTACKS_THIS_TURN:1},{EXHAUSTED:1}]){
    const hp=card('Demon Claws'),s=fixture({mine:[hp],hero});
    const actions=[end,act(hp)];
    assert.deepEqual(constrainActions(s,actions),[end]);
    assert.equal(moves(fromState(s,actions)).length,0);
  }
});

test('the Coin is not spent solely to buy Demon Claws after the hero has attacked',()=>{
  const hp=card('Demon Claws'),coin={entityId:90,name:'The Coin',CARDTYPE:'SPELL',COST:0,text:'Gain 1 Mana Crystal this turn only.'};
  const s=fixture({hand:[coin],mine:[hp],mana:0,hero:{NUM_ATTACKS_THIS_TURN:1}});
  assert.deepEqual(constrainActions(s,[end,act(coin)]),[end]);
});

test('Kayn opens a lethal behind Taunt and the first step remains a real legal play',()=>{
  const kayn=card('Kayn Sunfury'),a=card('Cult Neophyte',{ATK:4,HEALTH:4});
  const wall=card('Vicious Voidscale',{TAUNT:1,ATK:1,HEALTH:20,text:'Taunt'});
  const s=fixture({hand:[kayn],mine:[a],theirs:[wall],mana:4,hp:7});
  const actions=[end,act(kayn),act(a,wall)];
  const {plans}=search(s,actions);
  assert.equal(plans[0].score,1e4);
  assert.equal(plans[0].steps[0].id,kayn.entityId);
  assert.equal(actionFor(actions,plans[0].steps[0]).entityId,kayn.entityId);
  assert.equal(prepare(s,actions).lethal?.action.entityId,kayn.entityId);
});

test('Kayn aura disappears on death, silence or dormancy; Rush still cannot hit face',()=>{
  const kayn=card('Kayn Sunfury',{HEALTH:1}),rush={entityId:40,CARDTYPE:'MINION',name:'Grub',ATK:2,HEALTH:1,RUSH:1,text:'Rush'};
  const wall=card('Vicious Voidscale',{TAUNT:1,ATK:3,HEALTH:20,text:'Taunt'});
  const s=fixture({mine:[kayn,rush],theirs:[wall]});
  const actions=[act(kayn,wall),act(kayn,s.opponent.board[0]),act(rush,wall)];
  const start=fromState(s,actions);
  assert.equal(start.me.find(b=>b.id===kayn.entityId).taunt,false,'ignoring Taunt does not give Kayn Taunt');
  assert.ok(!moves(start).some(m=>m.id===40&&m.targetId===2));
  const dead=apply(start,{kind:'attack',id:kayn.entityId,targetId:wall.entityId}).s;
  assert.ok(!moves(dead).some(m=>m.targetId===2));
  for(const tag of ['SILENCED','DORMANT']){
    const copy=structuredClone(s);copy.me.board[1][tag]=1;
    const parsed=fromState(copy,actions);
    assert.equal(parsed.me.find(b=>b.id===kayn.entityId).ignoreTaunt,false);
    assert.ok(!moves(parsed).some(m=>m.targetId===2));
  }
});

test('frozen heroes cannot swing with a newly equipped weapon and unknown equip effects stay unmodelled',()=>{
  const w=card('Stardust Scythe'),s=fixture({hand:[w],hero:{FROZEN:1}});
  const after=apply(fromState(s,[act(w)]),{kind:'play',id:w.entityId}).s;
  assert.ok(!moves(after).some(m=>m.kind==='attack'));
  assert.equal(cardModel({type:'WEAPON',text:'Battlecry: Deal 5 damage.'}),null);
});

test('Scythe equip adds weapon Attack without resetting a spent attack; generated Soul ends search',()=>{
  const w=card('Stardust Scythe'),s=fixture({hand:[w],mana:4,hero:{ATK:1}}),actions=[end,act(w)];
  const start=fromState(s,actions),equip=apply(start,{kind:'play',id:w.entityId});
  assert.equal(equip.s.me[0].atk,4);assert.equal(equip.s.weapon.durability,3);
  const hit=apply(equip.s,{kind:'attack',id:1,targetId:2});
  assert.equal(hit.exact,false);assert.equal(hit.s.weapon.durability,2);
  assert.equal(equip.s.weapon.durability,3,'search branches do not mutate each other');
  const real=structuredClone(s);real.me.mana=0;real.me.hand=[];real.me.board[0].ATK=4;real.me.board.push(w);
  assert.equal(signature(fromState(real)),signature(equip.s));
  s.me.board[0].NUM_ATTACKS_THIS_TURN=1;
  assert.ok(!moves(apply(fromState(s,actions),{kind:'play',id:w.entityId}).s).some(m=>m.kind==='attack'));
  const {plans}=search(fixture({hand:[w],mana:4}),actions);
  assert.ok(plans.some(p=>p.steps.some(m=>m.kind==='attack')));
  assert.ok(plans.every(p=>p.steps.findIndex(m=>!m.exact)<0||p.steps.findIndex(m=>!m.exact)===p.steps.length-1));
});

test('a last-durability weapon cannot supply a second Windfury attack after breaking',()=>{
  const w={entityId:9,CARDTYPE:'WEAPON',name:'Plain',ATK:3,HEALTH:1,text:''};
  const s=fixture({mine:[w],hero:{ATK:3,WINDFURY:1}}),actions=[act(s.me.board[0],s.opponent.board[0])];
  const hit=apply(fromState(s,actions),{kind:'attack',id:1,targetId:2});
  assert.equal(hit.s.weapon,null);assert.equal(hit.s.me[0].atk,0);
  assert.ok(!moves(hit.s).some(m=>m.kind==='attack'));
});

test('Hive Map pick accounts for remaining mana and Studies accounts for its shared discount',()=>{
  const sight=card('Spectral Sight');
  const s=fixture({mana:1});s.choice={id:1,type:'GENERAL',entities:[sight],source:card('Hive Map')};
  const pick={type:'CHOICE',entityId:sight.entityId};
  assert.match(describe(s,pick),/cost exceeds your remaining mana/);
  s.choice.source=card('Illidari Studies');
  assert.match(describe(s,pick),/cost is 1/);
  assert.match(describe(s,pick),/right end/);
  s.choice.source=card('Hive Map');s.me.mana=2;
  assert.match(describe(s,pick),/still needs a legal target/);
});

test('Sigil, Dormant and generated cards do not pretend to be immediate board damage',()=>{
  for(const [name,re] of [['Sigil of the Seas',/count no new body/],['Grim Harvest',/cannot attack or protect/],
    ['Infestation',/not two minions/],['Void Soul',/Reobserve after/]]){
    const c=card(name),s=fixture({hand:[c]});assert.match(describe(s,act(c)),re);
    assert.equal(cardModel({type:c.CARDTYPE,text:c.text}),null);
  }
});

test('a fresh Hive Map choice replaces the submitted one, with source in its decision fingerprint',()=>{
  const power=s=>s.split('\n').map(x=>`GameState.DebugPrintPower() - ${x}`).join('\n');
  const p=createParser().feed(power(`CREATE_GAME
GameEntity EntityID=1
tag=STATE value=RUNNING
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
FULL_ENTITY - Creating ID=10 CardID=MAP
FULL_ENTITY - Creating ID=11 CardID=PICK
FULL_ENTITY - Creating ID=12 CardID=STUDIES`));
  p.feed('GameState.DebugPrintGame() - PlayerID=1, PlayerName=Local#1');
  const choice=(id,src)=>`GameState.DebugPrintEntityChoices() - id=${id} Player=Local#1 TaskList=1 ChoiceType=GENERAL CountMin=1 CountMax=1\nGameState.DebugPrintEntityChoices() - Source=${src}\nGameState.DebugPrintEntityChoices() - Entities[0]=11`;
  const defs={MAP:{name:'Hive Map'},STUDIES:{name:'Illidari Studies'},PICK:{name:'Fel spell'}};
  p.feed(choice(1,10));const first=publicState(p.result(),1,defs);
  p.feed('GameState.SendChoices() - id=1');p.feed(choice(2,10));
  const next=publicState(p.result(),1,defs);
  assert.equal(next.choice.id,2);assert.equal(candidates(p.result(),next)[0].choiceId,2);
  assert.notEqual(first.decisionFingerprint,next.decisionFingerprint);
  p.feed(choice(2,12));
  assert.notEqual(next.decisionFingerprint,publicState(p.result(),1,defs).decisionFingerprint);
});

test('empty-board turn three develops Harvest before buying Stingers or hero power',()=>{
 const infestation=card('Infestation'),harvest=card('Grim Harvest'),hp=card('Demon Claws');
 const s=fixture({hand:[infestation,harvest],mine:[hp],mana:3});
 const p=prepare(s,constrainActions(s,[end,act(infestation),act(harvest),act(hp)]));
 assert.equal(p.forced?.action.entityId,harvest.entityId);
 assert.equal(p.forced?.source,'dh_develop_harvest');
 assert.match(describe(s,act(infestation)),/pay for 1 Stinger/);
 s.me.mana=2;assert.match(describe(s,act(infestation)),/pay for 0 Stinger/);
});

test('ready Rush Grub finishes a one-health target before another Stinger or Soul',()=>{
 const grub={entityId:117,name:'Silithid Grub',CARDTYPE:'MINION',ATK:2,HEALTH:1,RUSH:1};
 const stinger={entityId:90,name:'Gorishi Stinger',CARDTYPE:'SPELL',COST:1,text:'Deal $2 damage. Summon a 2/1 Grub with <b>Rush</b>.'};
 const soul=card('Void Soul'),target=card('Cult Neophyte',{ATK:1,HEALTH:1});
 const s=fixture({hand:[stinger,soul],mine:[grub],theirs:[target],mana:2});
 const p=prepare(s,constrainActions(s,[end,act(stinger,target),act(soul),act(grub,target)]));
 assert.deepEqual(p.forced?.action,act(grub,target));
 assert.equal(p.forced?.source,'dh_rush_trade');
 const text=describe(s,act(stinger,target));
 assert.match(text,/then summon a 2\/1 Rush Grub/);
 assert.match(text,/possibly a different target/);
 assert.match(text,/1 excess/);
 assert.match(text,/not an unconditional 4-damage/);
 assert.match(text,/cannot attack the enemy hero/);
 s.me.board.push(...Array.from({length:6},()=>card('Cult Neophyte')));
 assert.match(describe(s,act(stinger,target)),/board is full/);
});

test('weapon prioritises a safe legal kill, never invents a Stealth target, and preserves lethal',()=>{
 const weapon=card('Stardust Scythe'),target=card('Cult Neophyte',{ATK:4,HEALTH:1});
 const s=fixture({mine:[weapon],theirs:[target],hero:{ATK:3}});
 const hit=act(s.me.board[0],target),face=act(s.me.board[0],s.opponent.board[0]);
 assert.deepEqual(prepare(s,[end,face,hit]).forced?.action,hit);
 assert.equal(respectsDHTactics(s,[end,face,hit],face),false,'queued equip-then-face must replan when a safe trade opens');
 assert.equal(respectsDHTactics(s,[end,face,hit],hit),true);
 target.STEALTH=1;
 const p=prepare(s,[end,face]);
 assert.notEqual(p.forced?.source,'dh_weapon_trade');
 assert.ok(Object.values(p.plans??{}).flat().every(m=>m.targetId!==target.entityId));
 target.STEALTH=0;s.opponent.board[0].HEALTH=3;
 assert.deepEqual(prepare(s,[end,face,hit]).forced?.action,face);
});

test('tactics do not force a lethal hero trade or consume a Rush body needed for searched lethal',()=>{
 const weapon=card('Stardust Scythe'),target=card('Cult Neophyte',{ATK:7,HEALTH:1});
 const s=fixture({mine:[weapon],theirs:[target],hero:{ATK:3,HEALTH:5}});
 const actions=constrainActions(s,[end,act(s.me.board[0],target),act(s.me.board[0],s.opponent.board[0])]);
 assert.notEqual(prepare(s,actions).forced?.source,'dh_weapon_trade');
 const kayn=card('Kayn Sunfury'),rush=card('Cult Neophyte',{ATK:4,HEALTH:4,RUSH:1});
 const wall=card('Cult Neophyte',{ATK:1,HEALTH:1,TAUNT:1});
 const lethal=fixture({hand:[kayn],mine:[rush],theirs:[wall],mana:4,hp:3});
 assert.ok(prepare(lethal,[end,act(kayn),act(rush,wall)]).lethal);
});

test('spare mana banks Stingers on an empty enemy board, but does not burn a full hand',()=>{
 const infestation=card('Infestation'),power=card('Demon Claws');
 const s=fixture({hand:[infestation],mine:[power],mana:2});
 const actions=[end,act(infestation),act(power)];
 assert.equal(prepare(s,constrainActions(s,actions)).forced?.action.entityId,infestation.entityId);
 s.me.hand.push(...Array.from({length:9},()=>card('Kayn Sunfury')));
 assert.ok(spendFirst(s,actions).includes(end));
 assert.notEqual(prepare(s,actions).forced?.source,'dh_bank_stingers');
});

test('a small ordinary attacker sets up Blast, and the real new board determines the follow-up',()=>{
 const cinder=card('Sizzling Cinder'),blast=card('Void Blast'),target=card('Cult Neophyte',{ATK:4,HEALTH:4});
 const s=fixture({hand:[blast],mine:[cinder],theirs:[target],mana:2});
 const actions=[end,act(cinder,target),act(blast,target)];
 assert.deepEqual(prepare(s,actions).forced?.action,act(cinder,target));
 target.DIVINE_SHIELD=1;
 assert.equal(prepare(s,actions).forced?.source,'dh_chip_before_blast');
 s.me.board=s.me.board.filter(c=>c!==cinder);target.DIVINE_SHIELD=0;target.DAMAGE=2;
 assert.deepEqual(prepare(s,[end,act(blast,target)]).forced?.action,act(blast,target));
 target.DAMAGE=0;
 assert.notEqual(prepare(s,[end,act(blast,target)]).forced?.source,'dh_finish_blast');
 // No gratuitous chip when the removal is already sufficient.
 s.me.board.push(cinder);target.HEALTH=3;
 assert.notEqual(prepare(s,actions).forced?.source,'dh_chip_before_blast');
});

test('Studies reveals options before Souls; active right-edge Outcast and rescue mana remain protected',()=>{
 const soul=card('Void Soul'),studies=card('Illidari Studies'),sight=card('Spectral Sight');
 const s=fixture({hand:[soul,studies],mana:6});
 assert.deepEqual(prepare(s,[end,act(soul),act(studies)]).forced?.action,act(studies));
 s.me.hand=[soul,studies,sight];
 assert.deepEqual(prepare(s,[end,act(soul),act(studies),act(sight)]).forced?.action,act(sight));
 s.me.mana=1;
 assert.notEqual(prepare(s,[end,act(soul),act(studies)]).forced?.source,'dh_information_first');
 s.me.mana=6;s.me.heroClass='WARLOCK';
 assert.notEqual(prepare(s,[end,act(soul),act(studies)]).forced?.source,'dh_information_first');
});

test('Press buffs before a hero trade and can ping a different target; queued swing must replan',()=>{
 const press=card('Press the Advantage'),wall=card('Vicious Voidscale',{TAUNT:1}),other=card('Cult Neophyte',{HEALTH:4});
 const s=fixture({hand:[press],theirs:[wall,other],mana:4,hero:{ATK:3}});
 const swing=act(s.me.board[0],wall),ping=act(press,other),actions=[end,swing,act(press,wall),ping];
 assert.deepEqual(prepare(s,actions).forced?.action,ping);
 assert.equal(respectsDHTactics(s,actions,swing),false);
 s.me.board[0].NUM_ATTACKS_THIS_TURN=1;
 assert.notEqual(prepare(s,[end,ping]).forced?.source,'dh_press_before_swing');
});

test('Chaos Strike is not forced as pure draw when Cinder is productive development',()=>{
 const chaos=card('Chaos Strike'),sigil=card('Sigil of Cinder'),harvest=card('Grim Harvest');
 const target=card('Cult Neophyte',{ATK:3,HEALTH:8});
 const s=fixture({hand:[chaos,sigil,harvest],theirs:[target],mana:5});
 const actions=[end,act(chaos),act(sigil),act(harvest)];
 assert.deepEqual(prepare(s,constrainActions(s,actions)).forced?.action,act(sigil));
 assert.notEqual(prepare(s,[end,act(chaos)]).forced?.source,'dh_information_first');
 target.HEALTH=2;
 assert.notEqual(prepare(s,actions).forced?.source,'dh_cinder_before_attack_draw','a safe immediate kill may justify the Attack');
 target.HEALTH=8;s.me.board[0].HEALTH=2;
 assert.notEqual(prepare(s,actions).forced?.source,'dh_cinder_before_attack_draw','delayed damage cannot be forced as immediate rescue');
});

test('Harvest draw does not leave the Eye Beam immediately to its left in Outcast position',()=>{
 const shard=card('Glacial Shard'),eye=card('Eye Beam',{COST:2}),harvest=card('Grim Harvest');
 const s=fixture({hand:[shard,eye,harvest],mana:3});
 assert.match(describe(s,act(harvest)),/does not guarantee Eye Beam remains Outcast/);
 // After resolving Harvest, a drawn high-cost card still blocks Eye Beam on the right.
 s.me.hand=[shard,eye,card('Kayn Sunfury')];s.me.mana=1;
 assert.match(describe(s,act(eye)),/Outcast is not active/);
 assert.ok(eye.COST>s.me.mana);
});

test('same enemy kill preserves the 3/3 over a 2/1 and does not buy redundant hero Attack',()=>{
 const small=card('Glacial Shard'),large={entityId:800,name:'Crow Dreadseed',CARDTYPE:'MINION',ATK:3,HEALTH:3,
  text:'Elusive. Dormant for 1 turn.',DORMANT:0};
 const target=card('Soothsayer',{TAUNT:1}),power=card('Demon Claws'),weapon=card('Stardust Scythe');
 const s=fixture({mine:[small,large,power,weapon],theirs:[target],hero:{ATK:4},mana:1});
 const actions=[end,act(small,target),act(large,target),act(power),act(s.me.board[0],target)];
 const m=menu(s,actions,{}),start=fromState(s,actions);
 const kills=Object.values(m.plans).map(steps=>({steps,after:steps.reduce((state,m)=>apply(state,m).s,start)}))
  .filter(p=>!p.after.opp.some(c=>c.id===target.entityId));
 assert.ok(kills.length);
 for(const p of kills){
  assert.ok(p.after.me.some(c=>c.id===large.entityId));
  assert.ok(!p.after.me.some(c=>c.id===small.entityId));
  assert.ok(!p.steps.some(m=>m.kind==='power'));
 }
 // A surviving Deathrattle body has additional value; these alternatives are not equivalent.
 small.text='Deathrattle: Draw a card.';
 const alternatives=Object.values(menu(s,actions,{}).plans);
 assert.ok(alternatives.some(steps=>steps.some(m=>m.id===large.entityId)));
});
