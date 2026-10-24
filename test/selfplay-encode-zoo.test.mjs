import test from 'node:test';
import assert from 'node:assert/strict';
import {moves} from '../src/sim.mjs';
import {newGame,loadList,cardDb} from '../src/selfplay.mjs';
import {vocabulary,encode,actSize} from '../src/selfplay-encode.mjs';

// The warlock-zoo picks name their options by card id (C'Thun abilities, Kazakus effects and
// trials); the encoder must tell each option apart, and the older lists keep their vocabulary.
const DB=cardDb(),ZOO=loadList('warlock-zoo'),DISCARD=loadList('warlock-discard');
const V=vocabulary([ZOO,DISCARD]);
const KAZ=Array.from({length:9},(_,i)=>`CAP_405t${i+1}`);
const PICKS={cthun:['BE_013t1','BE_013t2','BE_013t3','BE_013t4'],kaz1:KAZ,kaz2:KAZ,kaz3:['CAP_405tb1','CAP_405tb2','CAP_405tb3']};

const picking=(kind,options)=>({...newGame({lists:[ZOO,DISCARD],seed:3}),choice:{kind,options}});

test('zoo vocabulary holds the pick options, the trials and the tokens', ()=>{
  for(const id of [...Object.values(PICKS).flat(),'BE_013t5','BE_085t','LOOT_368','TIME_025t','CATA_210t'])
    assert.ok(V.index.has(DB[id].name),DB[id].name);
});

test('warlock-discard vocabulary is the one the older nets were made with', ()=>{
  const v=vocabulary([DISCARD,DISCARD]);
  assert.deepEqual(v.names,[...new Set([...Object.keys(DISCARD.cards).map(id=>DB[id].name),'The Coin','Spider'])]);
});

for(const [kind,options] of Object.entries(PICKS))
  test(`${kind}: every option encodes to its own step, none in the catch-all slot`, ()=>{
    const s=picking(kind,options),legal=moves(s);
    assert.deepEqual(legal.map(m=>m.id),options);
    const {acts}=encode(s,legal,V);
    assert.equal(new Set(acts.map(a=>a.join())).size,options.length);
    for(const a of acts){
      assert.equal(a.length,actSize(V));
      assert.equal(a[6+V.size-1],0);                 // KINDS has six entries; the last name slot is "other"
    }
  });
