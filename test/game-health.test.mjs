import test from 'node:test';
import assert from 'node:assert/strict';
import {resultOf,modelTrouble,lastGameLog} from '../src/game-health.mjs';

test('game archive starts at authoritative GameState, retaining the opening before client CREATE_GAME',()=>{
 const old='D 10:00 GameState.DebugPrintPower() - CREATE_GAME\nold opening\n';
 const current='D 11:00 GameState.DebugPrintPower() - CREATE_GAME\nopening entities and choices\nD 11:20 PowerTaskList.DebugPrintPower() - CREATE_GAME\nreceipt\n';
 assert.equal(lastGameLog(old+current),current);
 assert.match(lastGameLog(old+current),/opening entities and choices/);
});

const me='Local#1234';
const line=(who,v)=>`D 15:26:57.8 GameState.DebugPrintPower() - TAG_CHANGE Entity=${who} tag=PLAYSTATE value=${v} \n`;

test('result is our PLAYSTATE in the last game only', ()=>{
  const old='CREATE_GAME\n'+line(me,'WON');
  assert.equal(resultOf(old+'CREATE_GAME\n'+line(me,'LOST')+line('Foe#1','WON'),me),'Loss');
  assert.equal(resultOf(old+'CREATE_GAME\n'+line(me,'PLAYING'),me),null);
  assert.equal(resultOf('CREATE_GAME\n'+line('Foe#1','LOST')+line(me,'WON'),me),'Win');
});

test('an access or budget error stops the run at once', ()=>{
  assert.match(modelTrouble([{source:'rule_fallback',error:'No access to this model'}]),/model error/);
  assert.equal(modelTrouble([{source:'rule_fallback',error:'No access to this model at this time.'}]),null,'a 429 throttle is not fatal');
  assert.match(modelTrouble([{source:'jev',error:'User budget exceeded. Current spend: $5.21'}]),/budget/);
});

test('repeated rule_fallback stops the run; one transient does not', ()=>{
  assert.equal(modelTrouble([{source:'jev'},{source:'rule_fallback',error:'fetch failed'}]),null);
  const fb={source:'rule_fallback',error:'No access to this model at this time.'};
  assert.equal(modelTrouble([fb,fb]),null);
  assert.match(modelTrouble([fb,fb,fb]),/3 rule_fallback/);
  assert.equal(modelTrouble([]),null);
});
