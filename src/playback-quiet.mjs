// 2026-10-26, zakajz game, turn 9: Ritual of Summoning fired at the start of our turn. The turn
// was on screen at 22:28:35.9, but the client kept playing the ritual back (two 3/5s, the ritual
// leaving, the draw) until 22:28:40.6. The first drop, sent after the fixed settle, died. So wait
// at least `min` ms, and beyond that until the playback copy of the log has not moved for `quiet`
// ms with no block left open. The log is watched during `min` too, so on an ordinary turn this costs nothing extra.
// read() returns {played, depth}: the playback line count and how many blocks are open.
export async function untilQuiet(read,{min=0,quiet=1500,cap=12000,step=250,wait,now=Date.now}={}){
  const t0=now();let cur=await read(),last=cur?.played,since=t0;
  for(;;){
    const t=now();
    if(t-t0>=min&&t-since>=quiet&&!(cur?.depth>0))return {waited:t-t0,extra:Math.max(0,t-t0-min),quiet:true};
    if(t-t0>=min+cap)return {waited:t-t0,extra:t-t0-min,quiet:false};
    await wait(step);
    cur=await read();
    if(cur?.played!==last){last=cur?.played;since=now()}
  }
}
