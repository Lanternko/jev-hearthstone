import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clockToday} from '../src/mulligan-retry.mjs';

// Games 55/57/59 (2026-09-30): the mulligan wait is anchored on the Power.log offer time.
test('a Power.log clock reads as today, and a pre-midnight line as yesterday',()=>{
 const now=new Date(2026,8,30,10,10,47).getTime();
 assert.equal(clockToday('10:10:44.4241681',now),new Date(2026,8,30,10,10,44,424).getTime());
 const early=new Date(2026,8,30,0,0,5).getTime();
 assert.equal(clockToday('23:59:50.0000000',early),new Date(2026,8,29,23,59,50).getTime());
 assert.equal(clockToday(undefined,now),null);
});
