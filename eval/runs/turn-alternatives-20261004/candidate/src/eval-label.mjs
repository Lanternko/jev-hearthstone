// Local labelling page for eval/positions.json: `npm run label`, then open the printed URL.
// Each position takes a set of best actions and a set of merely acceptable ones -- two close
// lines can both be best -- or is skipped when the right play cannot be told from the log.
// Every click is saved straight to eval/labels.json. Listens on 127.0.0.1 only.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';

const PORT=Number(process.env.PORT??5178);
const positions=new URL('../eval/positions.json',import.meta.url);
const labels=new URL('../eval/labels.json',import.meta.url);
let saving=Promise.resolve();  // one read-modify-write at a time: clicks can arrive faster than disk
const load=u=>readFile(u,'utf8').then(JSON.parse).catch(()=>({}));

const page=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Jev 評估標記</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f6f5f2;--fg:#1d1d1b;--mut:#6b6a66;--card:#fff;--line:#dcdad4;--best:#1f7a3f;--ok:#9a6b00;--jev:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a19;--fg:#ecebe7;--mut:#9c9a94;--card:#242422;--line:#3a3936;--best:#4cc47a;--ok:#e0b040;--jev:#7d9bff}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,"Microsoft JhengHei",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0;flex:1}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:4px 10px;cursor:pointer}
.bar{height:6px;background:var(--line);border-radius:3px;margin:10px 0 16px}.bar>i{display:block;height:100%;background:var(--best);border-radius:3px}
.zone{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px}
.zone h3{margin:0 0 6px;font-size:13px;color:var(--mut);font-weight:600}
.cards{display:flex;flex-wrap:wrap;gap:6px}
.c{border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:13px}
.c b{font-variant-numeric:tabular-nums}.c.tired{opacity:.55}.c .t{color:var(--mut);font-size:12px}
.opt{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:start;padding:8px 0;border-top:1px solid var(--line)}
.opt:first-child{border-top:0}
.opt .lab{font-weight:600}.opt .desc{color:var(--mut);font-size:12.5px;margin-top:2px}
.pick.best.on{background:var(--best);color:#fff;border-color:var(--best)}
.pick.ok.on{background:var(--ok);color:#fff;border-color:var(--ok)}
.jev{color:var(--jev);font-size:12px;font-weight:600;margin-left:6px}
textarea{width:100%;box-sizing:border-box;min-height:54px;font:inherit;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
.saved{color:var(--mut);font-size:12px}
details summary{cursor:pointer;color:var(--mut);font-size:12.5px}
</style>
<main>
<header><h1 id="title"></h1><button id="prev">← 上一個</button><button id="next">下一個 →</button><button id="todo">下一個未標</button></header>
<div class="bar"><i id="bar"></i></div>
<div id="board"></div>
<div class="zone"><h3>選項 — 「最佳」可以選多個（相差很近時）；「可接受」＝不是最好但不算錯</h3><div id="opts"></div></div>
<div class="row"><label><input type="checkbox" id="skip"> 跳過（從紀錄看不出正解）</label>
<label><input type="checkbox" id="showJev"> 顯示 Jev 當時選擇</label><span class="saved" id="saved"></span></div>
<textarea id="note" placeholder="備註（為什麼，可留空）"></textarea>
</main>
<script>
let P=[],L={},i=0;
const $=id=>document.getElementById(id);
const hp=c=>(c.HEALTH??0)-(c.DAMAGE??0)+(c.ARMOR??0);
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const strip=s=>esc(String(s??'').replace(/<[^>]+>/g,'').replace(/\\[x\\]/g,'').replace(/\\$(\\d+)/g,'$1'));
const kw=c=>['TAUNT','DIVINE_SHIELD','RUSH','CHARGE','POISONOUS','LIFESTEAL','WINDFURY','STEALTH','FROZEN','REBORN'].filter(k=>c[k]).map(k=>k.toLowerCase().replace('_',' ')).join(' ');
function minion(c){
 const tired=c.EXHAUSTED||c.NUM_ATTACKS_THIS_TURN>0;
 return '<span class="c'+(tired?' tired':'')+'" title="'+strip(c.text)+'">'+esc(c.name)+' <b>'+(c.ATK??0)+'/'+hp(c)+'</b>'+(kw(c)?' <span class="t">'+kw(c)+'</span>':'')+'</span>';
}
function card(c){
 const st=c.CARDTYPE==='MINION'?' '+(c.ATK??c.baseAttack??0)+'/'+(c.HEALTH??c.baseHealth??0):'';
 return '<span class="c" title="'+strip(c.text)+'">('+(c.COST??c.baseCost??'?')+') '+esc(c.name)+'<b>'+st+'</b></span>';
}
function zone(t,list,f){return '<div class="zone"><h3>'+t+'</h3><div class="cards">'+(list.length?list.map(f).join(''):'<span class="t">—</span>')+'</div></div>'}
function render(){
 const p=P[i],s=p.state,l=L[p.id]??{best:[],ok:[]};
 const mh=s.me.board.find(c=>c.CARDTYPE==='HERO'),oh=s.opponent.board.find(c=>c.CARDTYPE==='HERO');
 const hpw=s.me.board.find(c=>c.CARDTYPE==='HERO_POWER');
 $('title').textContent=(i+1)+'/'+P.length+'  第 '+s.gameNumber+' 局 第 '+s.turn+' 回合  ·  '+p.id+'  ·  '+p.tags.join(', ');
 const done=P.filter(q=>L[q.id]&&(L[q.id].skip||L[q.id].best?.length)).length;
 $('bar').style.width=(100*done/P.length)+'%';
 $('board').innerHTML=
  zone('對手 '+esc(oh?.name)+'　'+(oh?hp(oh):'?')+' 血　手牌 '+(s.opponent.handCount??'?')+'　水晶 '+(s.opponent.maxMana??'?'),s.opponent.board.filter(c=>c.CARDTYPE==='MINION'),minion)+
  zone('我方 '+esc(mh?.name)+'　'+(mh?hp(mh):'?')+' 血　水晶 '+s.me.mana+'/'+s.me.maxMana+'　技能 '+esc(hpw?.name??'—')+(hpw?.EXHAUSTED?'（已用）':''),s.me.board.filter(c=>c.CARDTYPE==='MINION'),minion)+
  zone('手牌',s.me.hand??[],card)+
  (s.choice?zone('抉擇（'+s.choice.type+'）',s.choice.entities??[],card):'');
 const show=$('showJev').checked;
 $('opts').innerHTML=p.options.map(o=>{
  const b=l.best.includes(o.id),k=l.ok.includes(o.id);
  const jev=show&&p.then.choice===o.id?'<span class="jev">← Jev 選這個'+(p.then.confidence!=null?'（信心 '+p.then.confidence+'）':'')+'</span>':'';
  const pr=show&&p.then.probabilities?.[o.id]!=null?' <span class="t">P='+Number(p.then.probabilities[o.id]).toFixed(2)+'</span>':'';
  return '<div class="opt"><button class="pick best'+(b?' on':'')+'" data-id="'+o.id+'" data-k="best">最佳</button>'+
   '<button class="pick ok'+(k?' on':'')+'" data-id="'+o.id+'" data-k="ok">可接受</button>'+
   '<div><div class="lab">'+esc(o.label)+jev+pr+'</div><details><summary>Jev 看到的描述</summary><div class="desc">'+esc(o.description)+'</div></details></div></div>';
 }).join('')+(show&&p.then.plan?'<div class="desc">Jev 當時選的是整套攻擊計畫：'+esc(p.then.plan)+'</div>':'');
 $('skip').checked=!!l.skip;$('note').value=l.note??'';
}
async function save(){
 const r=await fetch('/label',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:P[i].id,label:L[P[i].id]})});
 $('saved').textContent=r.ok?'已儲存 '+new Date().toLocaleTimeString():'儲存失敗';
}
function cur(){return L[P[i].id]??=({best:[],ok:[]})}
$('opts').onclick=e=>{
 const b=e.target.closest('.pick');if(!b)return;
 const l=cur(),id=b.dataset.id,k=b.dataset.k,o=k==='best'?'ok':'best';
 l[o]=l[o].filter(x=>x!==id);
 l[k]=l[k].includes(id)?l[k].filter(x=>x!==id):[...l[k],id];
 render();save();
};
$('skip').onchange=()=>{cur().skip=$('skip').checked;render();save()};
$('note').onchange=()=>{cur().note=$('note').value;save()};
$('showJev').onchange=render;
const go=d=>{i=(i+d+P.length)%P.length;render();scrollTo(0,0)};
$('prev').onclick=()=>go(-1);$('next').onclick=()=>go(1);
$('todo').onclick=()=>{const j=P.findIndex((q,k)=>k>i&&!(L[q.id]?.skip||L[q.id]?.best?.length));const t=j>=0?j:P.findIndex(q=>!(L[q.id]?.skip||L[q.id]?.best?.length));if(t>=0){i=t;render();scrollTo(0,0)}};
addEventListener('keydown',e=>{if(e.target.tagName==='TEXTAREA')return;if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)});
fetch('/data').then(r=>r.json()).then(d=>{P=d.positions;L=d.labels;const t=P.findIndex(q=>!(L[q.id]?.skip||L[q.id]?.best?.length));i=t>=0?t:0;render()});
</script></html>`;

createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(page)}
  if(req.method==='GET'&&req.url==='/data'){
   res.writeHead(200,{'content-type':'application/json'});
   return res.end(JSON.stringify({positions:await readFile(positions,'utf8').then(JSON.parse),labels:await load(labels)}));
  }
  if(req.method==='POST'&&req.url==='/label'){
   let body='';for await(const chunk of req)body+=chunk;
   const {id,label}=JSON.parse(body);
   await (saving=saving.catch(()=>{}).then(async()=>{
    const all=await load(labels);
    all[id]={best:label.best??[],ok:label.ok??[],...(label.skip?{skip:true}:{}),...(label.note?{note:label.note}:{})};
    await writeFile(labels,JSON.stringify(all,null,1));
   }));
   res.writeHead(204);return res.end();
  }
  res.writeHead(404);res.end();
 }catch(e){res.writeHead(500);res.end(String(e))}
}).listen(PORT,'127.0.0.1',()=>console.log(`labelling on http://127.0.0.1:${PORT}/  (Ctrl+C to stop)`));
