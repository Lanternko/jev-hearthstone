// Block until a game is RUNNING, so `npm run game` can be started from the deck screen and the
// loop does not exit at once on the previous game's COMPLETE state.
import {inspect} from './bridge.mjs';
const until=Date.now()+10*60000;
while(Date.now()<until){
  try{if((await inspect()).state.status==='RUNNING')process.exit(0)}catch{}
  await new Promise(r=>setTimeout(r,3000));
}
console.error('no game started within 10 minutes');process.exit(1);
