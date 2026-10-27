import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDeck} from '../src/deck.mjs';
import {mulliganCombos,mulliganVerdict} from '../src/policy.mjs';

// 小T's keeps for the zoo Warlock (decks/warlock-zoo, runtime/videos/xiaot-20261025/decisions d08 d16 d22 d46).
const zoo={me:{heroClass:'WARLOCK',hand:[]},opponent:{board:[]}};
const withZoo=f=>{const old=process.env.JEV_DECK;process.env.JEV_DECK='warlock-zoo';
  try{return f()}finally{old==null?delete process.env.JEV_DECK:process.env.JEV_DECK=old}};
const card=(entityId,name,CARDTYPE,COST)=>({entityId,name,CARDTYPE,COST,text:''});

test('both Rituals and Godfather Kazakus stay together as a combo',()=>withZoo(()=>{
  const hand=[card(1,'Ritual of Summoning','SPELL',2),card(2,"Ritual of C'Thun",'SPELL',1),
              card(3,'Godfather Kazakus','MINION',3),card(4,'Vaultkeeper','MINION',5)];
  assert.deepEqual([...mulliganCombos(hand,zoo)].sort(),[1,2,3]);
}));

test('the turn-order keeps the schema cannot say reach Jev through strategy.md',()=>withZoo(()=>{
  // Twilight Egg stays Jev's call, so the strategy's condition decides it.
  const egg=card(5,'Twilight Egg','MINION',1);
  assert.equal(mulliganVerdict(egg,{...zoo,choice:{type:'MULLIGAN',entities:[egg]}}),'free');
  const {strategy}=loadDeck('warlock-zoo');
  assert.match(strategy,/Keep Twilight Egg only going first with Godfather Kazakus/);
  assert.match(strategy,/Toss Cursed Catacombs going second/);
  assert.match(strategy,/minion to play on turn two/);
}));
