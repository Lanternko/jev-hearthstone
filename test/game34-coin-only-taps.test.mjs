// 2026-10-05 batch game 34 turn 2 ruling: 「不要硬幣+抽牌。留著下魔眼」 -- on 1 mana with nothing
// costing 2, the Coin would only pay for Life Tap; keep it for Ocular Occultist next turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,coinOnlyTaps} from '../src/policy.mjs';

const load=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game34-coin-keeps-occultist.json',import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};

test('Coin that only buys Life Tap is not played',()=>{
 const f=load();
 assert.equal(coinOnlyTaps(f.state),true);
 assert.deepEqual(kept(f),['o0']);
});

test('a 2-cost card in hand makes the Coin worth playing',()=>{
 const f=load();
 f.state.me.hand.push({entityId:999,name:'Boneweb Egg',CARDTYPE:'MINION',COST:2,baseCost:2,text:''});
 assert.equal(coinOnlyTaps(f.state),false);
});
