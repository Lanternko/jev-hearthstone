import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verdict} from '../src/verify.mjs';
import {recoverCommittedMulligan} from '../src/mulligan-recovery.mjs';
import {prepare} from '../src/choose.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/ranked22-mulligan-misfire.json',import.meta.url)));

test('real ranked22 receipt remains a misfire, but the committed hand can safely be played',()=>{
 assert.equal(verdict(f.before,f.action,f.after),'misfire');
 const recovered=recoverCommittedMulligan(f.before,f.action,f.after);
 assert.deepEqual(recovered,{choiceId:1,actualKept:[4,21,15,14],stopAfterGame:true});
 assert.deepEqual(f.after.me.hand.filter(c=>c.cardId==='RLK_534').map(c=>c.entityId),[15]);
 // Later decisions use the actual server state, including the retained Barrage.
 const state={...f.after,step:'MAIN_ACTION',me:{...f.after.me,current:true}};
 const end={id:'end',type:'END_TURN'};
 assert.equal(prepare(state,[end]).forced.action.id,'end');
});

test('incomplete, open, foreign, duplicate and unknown-entity receipts cannot trigger recovery',()=>{
 const change=r=>({...f.after,mulliganResult:{...f.after.mulliganResult,...r}});
 for(const after of [change({complete:false}),change({choiceId:99}),change({kept:[999]}),change({kept:[4,4]}),
   {...f.after,choice:f.before.choice},{...f.after,status:'COMPLETE'},
   {...f.after,gameNumber:99},{...f.after,me:{...f.after.me,playerId:2}}])
   assert.equal(recoverCommittedMulligan(f.before,f.action,after),null);
 assert.equal(recoverCommittedMulligan(f.before,f.action,change({kept:[4,21,14]})),null,'correct mulligan needs no recovery');
});
