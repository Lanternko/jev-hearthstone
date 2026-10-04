import test from 'node:test';
import assert from 'node:assert/strict';
import {createJevRecovery} from '../src/jev-recovery.mjs';

test('access denial falls back immediately and is not retried on later decisions',async()=>{
 let calls=0;const recover=createJevRecovery();
 const request=async()=>{calls++;throw Error('Free tier users do not have access to this model.')};
 for(let i=0;i<3;i++)assert.equal(await recover(request,()=> 'fallback'),'fallback');
 assert.equal(calls,1);
});
test('transient failures have a bounded budget across changing decisions and recover',async()=>{
 let time=0;const recover=createJevRecovery({now:()=>time,budgetMs:5000});
 const request=async()=>{throw Error('high demand')};
 await assert.rejects(recover(request,()=> 'fallback'),/high demand/);
 time=5000;assert.equal(await recover(request,()=> 'fallback'),'fallback');
 assert.equal(await recover(async()=> 'model',()=> 'fallback'),'model');
 await assert.rejects(recover(request,()=> 'fallback'),/high demand/);
});
test('a throttle backs off and waits up to 30s before the rule pick',async()=>{
 let time=0;const recover=createJevRecovery({now:()=>time});
 const request=async()=>{const e=Error('No access to this model at this time.');e.statusCode=429;throw e};
 const gaps=[];
 for(const t of [0,2000,6000,14000,22000]){time=t;await recover(request,()=> 'fallback').catch(e=>gaps.push(e.retryAfterMs))}
 assert.deepEqual(gaps,[2000,4000,8000,8000,8000]);
 time=30000;assert.equal(await recover(request,()=> 'fallback'),'fallback');
 // Right after giving up, the next decision gets only the short budget.
 time=31000;await assert.rejects(recover(request,()=> 'fallback'));
 time=36000;assert.equal(await recover(request,()=> 'fallback'),'fallback');
 // Once the cooldown passes, the long wait is back; a success clears everything.
 time=100000;await assert.rejects(recover(request,()=> 'fallback'));
 time=110000;assert.equal(await recover(async()=> 'model',()=> 'fallback'),'model');
});
