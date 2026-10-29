import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {moves,apply,body} from '../src/sim.mjs';
import {newGame,loadList,winner,randomPolicy,rushPolicy} from '../src/selfplay.mjs';

// The simulator reads each card's text once and keeps what it found (2026-10-24). Reading it
// again on every step gave these same games; the hash below was taken before the caches existed,
// so any cached answer that leans on a changing stat or tag shows up here as a different game.
const ZOO=loadList('warlock-zoo'),DISCARD=loadList('warlock-discard');
// Fields the C'Thun demon hunter added to a seat or a body (2026-10-25) are left out: these decks never
// set them, and the hash stays the one taken before they existed.
const NEW=new Set(['game','died','cthunSeen','cthunStart','brox','studies','elusive',
  // decks/priest-egg (2026-10-27): each seat now keeps a grave, its Deathrattle summons and any
  // Slimed pile, a body says whether it is Legendary, and a Hero Power how much it restores.
  'grave','rattles','slimePile','legendary','heal',
  // decks/shaman-cthun (2026-10-27): a body now reads its printed Reborn and its race, and a Hero
  // Power says whether it summons a Totem. The zoo lists set none of them, so the hash stands.
  'reborn','race','summon',
  // decks/priest-egg (2026-10-28): a card's spell school and minion types, the Elder Word waiting for
  // a Shadow spell, the kinds played this turn and last (Kindred), a Prepared card and Kaldorei
  // Priestess's -2 Attack. The zoo lists set none of them either.
  'school','races','elderWord','playedKinds','lastKinds','prepared','chill']);
const plain=(k,v)=>NEW.has(k)?undefined:v instanceof Set?[...v]:v instanceof Map?[...v]:v;
function trace(){
  const h=createHash('sha256'),results=[];
  const pairs=[[ZOO,DISCARD],[DISCARD,ZOO],[ZOO,ZOO],[DISCARD,DISCARD]];
  for(let seed=3;seed<15;seed++){
    const lists=pairs[seed%4],policy=seed%3?rushPolicy:randomPolicy;
    let s=newGame({lists,seed});
    const pick=policy(seed);
    let n=0;
    for(;n<3000;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const m=pick(s,legal),r=apply(s,m);
      h.update(JSON.stringify([legal,m,r.exact,r.note,r.s],plain));
      s=r.s;
    }
    results.push([n,winner(s)]);
  }
  return {hash:h.digest('hex'),results};
}

test('cached card text plays the same games, step for step, as reading it every time', ()=>{
  const {hash,results}=trace();
  assert.deepEqual(results,GOLDEN.results);
  assert.equal(hash,GOLDEN.hash);
});

// Self-play cards carry their keyword tags, so the games above never reach the text fallback.
// Same text, asked again: the tag and the silence still decide, the kept text answer only fills in.
test('a kept keyword answer still yields to the tag and to silence', ()=>{
  const card=extra=>({entityId:1,CARDTYPE:'MINION',name:'Guard',text:'<b>Taunt</b>. Battlecry: Give a minion Poisonous.',ATK:2,HEALTH:3,...extra});
  for(let k=0;k<2;k++){
    assert.equal(body(card({}),'me').taunt,true);
    assert.equal(body(card({}),'me').poison,false);
    assert.equal(body(card({TAUNT:0}),'me').taunt,false);
    assert.equal(body(card({SILENCED:1}),'me').taunt,false);
    assert.equal(body(card({POISONOUS:1}),'me').poison,true);
  }
});

// Retaken 2026-10-25: Vaultkeeper now goes in the middle and grows both neighbours, and a Kazakus trial casts its two
// effects together (seeds 4 and 5 play them). The caches themselves were not touched.
// Retaken again 2026-10-25: the zoo list swaps Darkest Depths for Fatebreaker, which changes every zoo deck order; the old
// list with the new rule still gives the old hash, and seeds 5, 9, 10 and 14 play Fatebreaker.
// Retaken 2026-10-29: a Shred of Time picked by Cursed Catacombs now casts (3 to the hero) and a normal draw replaces it;
// seed 8 is the only game that picks one (step 4).
const GOLDEN={hash:'6415d89c22f7ee08ad1ddabb1ae4723d3357f7e6623c6aeb046341ffcbbe54b5',
  results:[[50,1],[49,0],[40,1],[39,0],[53,1],[37,1],[37,1],[25,1],[55,1],[54,0],[61,1],[56,0]]};

