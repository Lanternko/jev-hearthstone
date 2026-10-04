// Mulligan card clicks toggle selection. Only confirmation may be retried blindly.
export function createMulliganRetry(){
 let pending=null,attempted=false,attempts=0;
 return {
  get pending(){return pending},
  get attempts(){return attempts},
  retain(decision){
   pending??=decision;
   return pending;
  },
  steps(planned){
   const result=attempted?planned.filter(s=>s.what==='confirm mulligan'):planned;
   // Mark before injection: a worker exception may occur after partial card selection.
   attempted=true;attempts++;
   return result;
  },
  clear(){pending=null;attempted=false;attempts=0},
 };
}
// A Power.log clock time (HH:MM:SS.fffffff, local) as epoch ms for today.
export function clockToday(clock,now=Date.now()){
 const m=String(clock??'').match(/^(\d\d):(\d\d):(\d\d(?:\.\d+)?)$/);if(!m)return null;
 const d=new Date(now);d.setHours(+m[1],+m[2],0,0);let t=d.getTime()+Math.round(parseFloat(m[3])*1000);
 if(t-now>60000)t-=86400000;          // written just before midnight
 return t;
}
