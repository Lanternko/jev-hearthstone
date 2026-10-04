import {readFile,writeFile} from 'node:fs/promises';
const run=process.argv[2];
if(!/^control-second-review-[\w-]+$/.test(run??''))throw Error('Expected frozen review run');
const dir=`eval/runs/${run}`,games=JSON.parse(await readFile(`${dir}/games.json`)),stats=JSON.parse(await readFile(`${dir}/stats.json`));
const notes={
  5:'換掉行屍／魔像／武器，只留 Ocular；換入三張法術，T1沒有 PLAY，T2硬幣下 Ocular。檢查這是換牌後無可用一費，還是有可行的早期壓力打法；T4 Smothering Starfish、T6 Blood Boil 後的恢復另看。',
  15:'四張全留。T1 Party、T2 Platysaur→Entropic、T3 Ocular；對手T5 Corpse Explosion 前我方七隻，對手回合結束歸零。檢查T4投入／抽牌與T5重新展開，不能只因被清場就判斷不該鋪。',
  16:'勝局對照：只留 Disposable，換入 Soularium／Whispers。T1硬幣→Soularium，T2 Whispers，T3 Ocular；看抽牌／棄牌順序和第5回合前的壓力。',
  22:'保留兩張 Boneweb Egg；T6 Sanitize 前兩張原保留實體仍在手上。當時七隻場面被清空，手牌僅雙蛋＋Hand。檢查雙蛋起手是否缺少可靠觸發器，以及T5是否可保留可用續航。',
  23:'四張全留；T1 Party→硬幣→Whispers，T2 Life Tap。T6 Abyssal Wave 前五隻，回合末剩一隻；下一個本方回合重新展開。檢查留 Soul Barrage 的作用及早期buff與後期資源。',
  26:'勝局對照：只留 Platysaur；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Ocular。與同樣交硬幣buff卻落敗的#105／#177比較，不把單一開局手法直接判為錯誤。',
  43:'勝局對照：留 Disposable＋Catacombs；T1兩次Catacombs、Party、硬幣、Entropic，T2 Platysaur、T3 Ocular。對手有 Reckless Apprentice／Mordresh，AOE法術標記為零不代表沒有清場能力。',
  45:'勝局對照：留 Party＋Disposable；T1 Platysaur→硬幣→Party，T2 Disposable、T3 Ocular，T4 Chamber與Whispers；查看如何在對手跳費期間形成壓力。',
  64:'T1 Party→硬幣→第二張Party，六隻1/1；對手T2 Medivh’s Triumph 後歸零，T3 Holy Nova 再清蜘蛛。檢查硬幣價值、分批投入及抽牌／重建次序，這是最直接的早期AOE檢查案例。',
  66:'原起手 Chronoclaws／Hand／Soulfire／Walking Dead 四張全留；T1 Soulfire 指向對手英雄，T2硬幣硬下Walking Dead、T3再硬下一隻。檢查留牌計畫和Soulfire棄牌結果；T8 Reno, Lone Ranger 前的攻擊／抽牌另看。',
  69:'保留 Chronoclaws＋Egg＋Entropic；T1硬幣下Egg、T3放Chamber並啟動。對手T6 Bob、T7 Spreading Plague、T8疊甲、T9 Eonar；檢查前期是否建立足夠傷害、後期抽牌與剩餘生命，不能簡化為AOE問題。',
  74:'留 Entropic＋Party；T1硬幣雙Party。對手T7 Reno Jackson、T8 Reno, Lone Ranger；看回血前的攻擊目標、T6補牌與T7／T8公爵投入。',
  78:'T1 Platysaur→硬幣→Whispers，第2回合結束勝利。短局，不能當作成功穿過控制套完整清場／回血流程的證據。',
  85:'勝局對照：Catacombs兩張＋Platysaur＋Ocular全留。T1 Platysaur→硬幣→Whispers，T3 Ocular；對手有單解／Aman’Thul且打到第9回合，可用來對照續航，不只看早期爆發。',
  97:'留 Walking Dead＋Ocular＋Golem；T1無PLAY，T2 Egg、T3 Ocular。對手T4／T5連續Medivh’s Triumph，T8 Slime ’em!。檢查兩張棄牌收益卡保留後能否準時觸發及兩次清場間的公爵投入。',
  103:'勝局對照：留 Entropic＋Party＋Platysaur；換入Catacombs。T1 Party→硬幣→Entropic→Catacombs，T3 Soularium→Whispers；對手跳費／招募路線，檢查搶血期限。',
  105:'T1 Party→硬幣→Whispers；對手T3 Crowd Control 前五隻，回合末因亡語剩一隻；T6 Sanitize 再清。看T2是否有更好的資源配置及第一輪清場後的抽牌／魔像硬下。',
  136:'T1 Party＋Catacombs、硬幣＋Platysaur，第2回合結束勝利。與#78同屬短局，保留在原始27場統計，但不據此認定留牌能擊敗後續清場。',
  146:'留 Disposable＋Walking Dead＋Catacombs；T1 Catacombs→Party，T2 Disposable，T3 Party→Disposable，T4 Chronoclaws。對手T4複製棄牌連動鋪場、T5 Intertwined Fate／Soul Barrage；檢查T3／T4解場或搶血選擇。',
  151:'只留 Chamber；T1硬幣下Egg、T2 Disposable、T3硬下Walking Dead、T4 Chronoclaws。T10 Brawl 前公爵25攻且滿場，手中僅Soul Barrage；看起手是否需要更早壓力，以及大公爵出手時機／是否錯過傷害。',
  160:'留 Disposable＋Walking Dead＋Golem；T1硬幣Disposable，T3／T4硬下Walking Dead／Golem；T7 Medivh’s Triumph 前已僅一隻蜘蛛。優先看T1–T4的棄牌觸發／速度，不把最後一次清場當作全部敗因。',
  163:'留 Disposable＋Platysaur，換入Egg＋Catacombs；T1硬幣Disposable。對手T6 Reno Jackson、T8 Reno, Lone Ranger、T9再Reno，打到T17。看回血前傷害、T5 buff／武器順序及後期公爵，這是長局資源與反覆回血案例。',
  164:'原起手雙Duke＋Hand＋Entropic全部換掉，換後仍有Hand＋Entropic；T1硬幣Disposable。對手T5與T8 Medivh’s Triumph 均清空我方；檢查換入限制、T4公爵與T6／T7重建，不誤把換入Hand算成主動保留。',
  166:'留 Ocular＋Walking Dead；T1 Party、T2 Entropic。對手T3 Aftershocks 清掉三隻，T7 Brawl 再處理滿場；手中尚有Hand／Chamber／硬幣。檢查補牌啟動、公爵與場面投入，而非一律少鋪。',
  177:'留 Whispers＋Disposable；T1 Platysaur→硬幣→Whispers，T2 Life Tap、T3 Chamber並啟動。對手T4 Elemental Destruction、T6 Devolve→Aftershocks；看AOE前保留觸發器、AOE後公爵重建及變形風險。',
  182:'胜局對照：留 Disposable＋Catacombs；T1 Catacombs→Party，交硬幣；T2 Whispers、T3硬下Walking Dead，T4 Golem＋Platysaur。硬下行屍也有勝局，不能單憑「硬下」判成錯。',
  188:'勝局對照：只留雙Catacombs；換入Disposable＋Hand，T1雙Catacombs→硬幣→Disposable、T2 Life Tap、T3 Ocular。換入Hand仍勝，起手相關性不代表單卡好壞的因果。',
};
if(games.some(g=>!notes[g.ordinal]))throw Error('Missing manual review note');
const names=cs=>cs.map(c=>c.name).join('、')||'全換／無保留';
const rate=s=>s.n?`${s.wins}/${s.n}（${(100*s.winRate).toFixed(1)}%）`:'—（0場）';
const labels={Deathknight:'死亡騎士',Priest:'牧師',Warrior:'戰士',Warlock:'術士',Druid:'德魯伊',Rogue:'盜賊',Shaman:'薩滿',Mage:'法師'};
let md=`# 控制・後手：27場重播與留牌檢查\n\n10勝17敗，37.0%；95% Wilson區間21.5%–55.8%。資料取自已分類161場中的控制後手象限，不含待判35場。此批包含人工、舊策略及中斷局，不是新版Jev專屬戰績。\n\n已逐場讀取本機HDT replay的Power log；以下網址是DeckStats中對應GameId的既有ReplayUrl。網頁讀取工具無法載入，未宣稱已在網頁播放器完成觀看。#編號是196場全歷史序號，與runtime批次場號不同。全部27場均有完整原起手、保留回報、換牌後起手；後者不含硬幣／第一回合抽牌。\n\n## 優先檢查\n\n建議先看#66（全留慢牌／Soulfire射臉）、#22（雙蛋直到T6仍在手）、#64（T1硬幣雙Party→T2清場）、#15（T5七隻被清）、#97／#160（棄牌收益牌留而硬下）、#164（全換後的清場重建）。對照#45／#85／#188的勝局；#78／#136在第2回合結束，不作穿過控制套中後期的證明。\n\n27場牌序顯示起手啟動、棄牌觸發、回血前傷害與清場後重建都值得分開檢查。17敗中11場有已公開AOE法術標記；其餘也可能有英雄／手下／持續效果處理場面。這是待裁定的共通機制，不是「應少鋪」或「留某張一定錯」的結論。\n\n## 留牌數據\n\n每個格子為勝／場（勝率），同名雙份按一場計。保留＝原始起手且伺服器確認留下；換後＝換牌完成的手牌；原發＝換牌前拿到。另列「原發但全換掉該卡」；這與保留組互斥，但由當時其他卡／決策選擇造成偏差，不能解讀為換牌的因果收益。\n\n|卡牌|實際保留|換後起手有|原始發牌有|原發但該卡全換掉|\n|---|---:|---:|---:|---:|\n`;
for(const name of Object.keys(stats.metrics.kept.cards)){
  const toss=games.filter(g=>g.offered.some(c=>c.name===name)&&!g.kept.some(c=>c.name===name));
  const n=toss.length,wins=toss.filter(g=>g.result==='Win').length;
  const k=stats.metrics.kept.cards[name].present,o=stats.metrics.original.cards[name].present;
  if(k.n+n!==o.n||k.wins+wins!==o.wins)throw Error('Keep/toss partition mismatch');
  md+=`|${name}|${rate(k)}|${rate(stats.metrics.final.cards[name].present)}|${rate(o)}|${rate({n,wins,winRate:n?wins/n:null})}|\n`;
}
md+='\nCatacombs保留5/6、Platysaur4/6，觀察值較高；Walking Dead保留0/5、Golem0/2、Egg0/2值得查搭配與觸發速度。樣本仍小，而且每場可同時有多張牌；不能把列相加，不能直接改成必留／必換。所有指標的逐局GameId及95%區間在同目錄stats.json。\n\n## 全部重播索引\n\n|歷史序號|結果／職業|HDT重播|實際保留|檢查點|\n|---|---|---|---|---|\n';
for(const g of [...games].sort((a,b)=>(a.result==='Win')-(b.result==='Win')||a.ordinal-b.ordinal))md+=`|#${g.ordinal}|${g.result==='Win'?'勝':'敗'}／${labels[g.opponent]}|[開啟重播](${g.url})|${names(g.kept)}|${notes[g.ordinal]}|\n`;
md+='\n## 逐局起手與牌序\n\n以下為觀察紀錄，非最佳打法裁定或模型原始意圖。Tn表示各方第n回合；同一T先對手後我們。只列最外層PLAY／ATTACK；技能、地標啟動另標，触發產物不當成手動選擇。攻擊目標為已公開卡名／英雄。AOE後狀態取對手該回合結束，可能還包含其他法術、攻擊與亡語，不等同單卡立即造成的損失。\n';
const describe=a=>a.kind==='ATTACK'?`${a.card?.name??'未知實體'}攻擊→${a.targetLabel??'未知目標'}`:
  `${a.card?.name??'未知實體'}${a.card?.type==='HERO_POWER'?'（技能）':a.card?.type==='LOCATION'&&a.originZone==='PLAY'?'（啟動）':''}${a.targetLabel?`→${a.targetLabel}`:''}`;
for(const g of games){
  md+=`\n### #${g.ordinal} ${g.result==='Win'?'勝':'敗'}／${labels[g.opponent]}\n\n[HDT重播](${g.url}) · 開始 ${g.date}\n\n- 原發：${names(g.offered)}\n- 保留：${names(g.kept)}\n- 換後：${names(g.finalOpening)}\n- 檢查：${notes[g.ordinal]}\n\n|回合|對手出牌與攻擊|我們出牌與攻擊|本方回合末場面／手牌數|\n|---|---|---|---|\n`;
  for(let turn=1;turn<=g.ends.at(-1).turn;turn++){
    const actions=g.actions.filter(a=>a.turn===turn&&a.depth===0),end=g.ends.find(e=>e.engineTurn===turn*2);
    md+=`|T${turn}|${actions.filter(a=>a.side==='opponent').map(describe).join('；')||'—'}|${actions.filter(a=>a.side==='own').map(describe).join('；')||'—'}|${end?`${end.state.own.board.length}隻／${end.state.own.hand.length}張`:'未到本方回合末'}|\n`;
  }
  for(const a of g.aoes)md+=`\n- 對手T${a.turn} ${a.name}：施放前我方${a.before.own.board.length}隻（${a.before.own.board.map(c=>`${c.name} ${c.attack}/${c.health}`).join('、')}）；當時手牌：${names(a.before.own.hand)}；該對手回合末我方${a.afterOpponentTurn?.own.board.length??'未知'}隻。\n`;
}
md+=`\n## 複驗與資料\n\n來源：eval/runs/history-classified-2026-10-01T19-18-06-561Z 與 opening-winrates-2026-10-01T19-20-03-029Z。本次凍結：${dir}，含27場URL／牌序／盤面／起手、統計、來源與生成器SHA256、生成器快照。\n\n全部27份replay SHA與原凍結資料相同；全部對手公開PLAY之回合／實體／卡ID序列與原抽取逐項相符；本方最外層动作回合符合後手；三種留牌分母均27且每卡有／無分組守恆，保留／全換分組也守恆。\n\n重跑：\n\n\`\`\`powershell\nnode src/review-control-second.mjs\nnode src/report-control-second.mjs <剛產生的control-second-review資料夾名稱>\n\`\`\`\n\n本次只作離線分析，不修改正式策略／分類，不呼叫模型、不恢復排位、不提交Git。\n`;
await writeFile(`${dir}/report.md`,md);
await writeFile('docs/control-second-review-20261002.md',md);
await writeFile(`${dir}/report-generator.mjs`,await readFile('src/report-control-second.mjs'));
console.log(JSON.stringify({report:'docs/control-second-review-20261002.md',games:games.length,losses:17,cardRows:Object.keys(stats.metrics.kept.cards).length}));
