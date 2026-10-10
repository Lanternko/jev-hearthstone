// Waits for a live game before the loop starts. Power.log keeps the finished game on disk, so
// starting the loop straight away just reads COMPLETE and quits; poll until a game is RUNNING.
import {inspect} from '../src/bridge.mjs';
const stamp=()=>new Date().toTimeString().slice(0,8);
for(let i=0;i<900;i++){
  try{
    const {state,source}=await inspect();
    if(state.status==='RUNNING'){
      console.log(`${stamp()} game ${state.gameNumber} RUNNING (${state.step}) in ${source}`);
      process.exit(0);
    }
    if(i%10===0)console.log(`${stamp()} waiting: ${state.status}/${state.step}/game${state.gameNumber}`);
  }catch(e){if(i%10===0)console.log(`${stamp()} waiting: ${e.message}`)}
  await new Promise(r=>setTimeout(r,2000));
}
console.log('no game started within 30 minutes');process.exit(1);
