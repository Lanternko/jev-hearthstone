import {verdict} from './verify.mjs';
import {mulliganCards} from './power.mjs';

// A server-confirmed selection cannot be undone. Keep strict verification,
// finish from the actual hand, and let the batch stop after this game.
export function recoverCommittedMulligan(before,action,after){
 if(action.type!=='MULLIGAN'||verdict(before,action,after)!=='misfire')return null;
 const receipt=after.mulliganResult;
 if(after.status!=='RUNNING'||after.gameNumber!==before.gameNumber
   ||after.me?.playerId!==before.me?.playerId||after.choice?.id===action.choiceId)return null;
 const offered=new Set(mulliganCards(before.choice?.entities).map(c=>c.entityId));
 if(!offered.size||new Set(receipt.kept).size!==receipt.kept.length
   ||receipt.kept.some(id=>!offered.has(id)))return null;
 return {choiceId:receipt.choiceId,actualKept:[...receipt.kept],stopAfterGame:true};
}
