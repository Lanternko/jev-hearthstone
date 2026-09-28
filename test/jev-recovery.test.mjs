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
