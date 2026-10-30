# 經驗教訓：實戰客戶端

跑實戰或 ranked 批次、改 `src/loop.mjs`／`src/reconnect.mjs`／`src/layout.mjs`／`src/input-worker.ps1`、從實戰做位置題時讀。

欄位定義與寫入規則見 [lessons.md](lessons.md)（通則，每次都讀）。ID 全域共用，查某個 ID 在哪個檔用 [lessons-ids.md](lessons-ids.md)。

---

## 點擊與視窗

### L-063 點擊沒反應：先查前景視窗
- 日期：2026-09-29～2026-10-30
- 發生什麼：
  1. 批次對戰時爐石視窗不在最上層，點擊無效；結算動畫中按「開始」會失效。（L-011）
  2. 把爐石視窗改成 1600×900 後結束回合連續死 8 次：gestures 的 hwnd 是 HDT 的透明覆蓋視窗，HDT 右側面板寬度近乎固定，視窗越窄越往左蓋，蓋住了結束回合。F-879 那次 1227×739 的死點擊很可能也是這個原因。（L-063）
  3. 點練習模式的「選擇」一直沒反應，是 Claude 桌面 App 最大化蓋在爐石上（使用者指出）。（L-077）
  4. 再犯：天梯批次「開始」按三次沒排到隊，click trace 的 hwnd 是 Claude 視窗（看起來已縮小、截圖照不到，實際上蓋在爐石上）；下午點模式徽章沒反應很可能也是它，當時卻被當成徽章的問題。（L-082）
- 規則：
  1. 實戰只用 2560×1440 全螢幕（Alt+Enter 後確認視窗 style 是 WS_POPUP、client 原點 0,0；第一次 Alt+Enter 可能落在帶標題列、client 偏移 10,42 的中間狀態）。
  2. 點擊沒反應時，先看 click trace 的 `probes[].hwnd`／gestures 的 hwnd 屬於哪個程序，不要先猜座標或解析度。輸入 worker 會在按下前檢查游標下的最上層視窗，是 `claude` 程序就先縮小它；其他擋住的視窗用 user32 `ShowWindow(h,6)` 縮小，事後 `ShowWindow(h,9)` 還原。
  3. 結算畫面先點掉再按「開始」。現行排隊流程見 docs/client-runbook.md。
- 對應測試或關卡：`test/reconnect.test.mjs`「the input worker moves the Claude window aside…」；`src/input-worker.ps1` Arm；賽後看 `runtime/last-game.log` 第 2 行是 `client 2560x1440`
- 相關：F-161、F-879、E-294、L-062
- 合併自：L-011、L-063、L-077、L-082
- 來源：archive/STATUS-2026-10-27.md 第 1759 行；2026-10-29、10-30 App 與使用者指出

### L-062 改點擊幾何之後
- 日期：2026-10-29
- 發生什麼：
  1. 點擊座標只在 2560×1440 驗過；1227×739 的視窗最右邊手牌點兩次都點到牌外（F-879），於是改了 letterbox 的座標公式。（L-061；後來 L-063 查出真因多半是 HDT 面板，這個方向是治標）
  2. 這個修正只靠一個推論和單元測試就開 50 場 ranked，第 1 局換牌和結束回合全部點錯，整批停掉。單元測試只驗證了「改法符合推論」，沒驗證推論本身。（L-062）
- 規則：改了點擊幾何（`src/layout.mjs`、runner 的點擊），先用 `npm run game-zakajz` 打單局、賽後看 gestures 全部 ok，再開批次。單元測試要鎖住實戰點中過的座標（例：1227×739 的 end turn 997,335），不是只鎖公式。死點擊先照 L-063 查前景視窗。
- 對應測試或關卡：`test/layout.test.mjs`「a narrower client is letterboxed…（F-879）」
- 相關：F-879、E-276、L-063
- 合併自：L-061、L-062

### L-012
- 日期：2026-09-30
- 發生什麼：留牌卡牌點擊是切換狀態，盲目重試整組會取消已完成的選取；只看 choice 消失會錯報成功。
- 規則：重試時選卡只做一次，之後只重按確認；驗證要以遊戲回報的實際保留 entity 比對預期，不以 choice 消失或 fingerprint 變動當成功。
- 對應測試或關卡：src/mulligan-retry.mjs；verify.mjs 按 entity ID 比較；留牌測試六題
- 相關：F-179、F-180
- 來源：archive/STATUS-2026-10-27.md 第 1715 行（2026-09-30 留牌重試與執行驗證修正（離線驗證））


---

## 斷線、重試與等待

### L-039 斷線與重連
- 日期：2026-10-27～2026-10-30
- 發生什麼：
  1. 爐石跳出離線視窗，按重新連線失敗、要求重開遊戲。（L-039）
  2. 重開後關每日任務彈窗，照關結果畫面的點法點 (1280,1300)，彈窗關完後那一下點到大廳的「日誌」；大廳《爐石戰記》的位置在套牌畫面上是「核心牧師」套牌。（L-070）
  3. 斷線恢復只掛在對局中的「點擊沒反應」分支；E-290 演練時斷線發生在兩局之間，用戶端安靜地離線停在套牌畫面，runner 照常按「開始」，三次逾時後停掉整批。（L-071）
  4. 演練時連 `f5fpclientW.exe` 一起砍掉，路由和 DNS 沒還原，整台電腦斷網，直到使用者手動重連 Wi-Fi；真實斷線是 session 掉線，不是用戶端被砍。（L-074）
  5. parser 遇到 CREATE_GAME 就清掉整個狀態，但接回對局的用戶端在 CREATE_GAME 之前就收到 options；被清掉後 loop 閒置 30 分鐘、被踢出對局。正常開局不會發生，900 多個測試都沒抓到。（L-075）
- 規則：
  1. 恢復順序：重新連線失敗 → 退出遊戲 → `Battle.net.exe --exec="launch WTCG"` → 主選單點《爐石戰記》到套牌畫面 → 再開打。2026-10-30 起 runner 自動處理（`src/reconnect.mjs`，F-893）；人工時照這個順序。
  2. 同一個座標在不同畫面意思不同。連點前用 `LoadingScreen.log` 最後的 `currMode=`（HUB、TOURNAMENT＝套牌畫面、JOURNAL、GAMEPLAY）確認畫面，只在 HUB 點《爐石戰記》。
  3. 處理外部故障時列出它可能發生的每個階段（對局中、排隊中、兩局之間），每個階段都要有偵測點；只修最近一次發生的那個階段不夠。
  4. 能演練就實際製造一次故障，用最接近真實故障的方式；會影響整台電腦的演練先講清楚副作用並備好復原方法，結果和預期不同就馬上停。
  5. 收到快照就重設狀態時，想清楚快照之前到的資料是不是同一局的；「等某件事發生才動作」的迴圈要有「等太久就做最保守的動作」的出口。
- 對應測試或關卡：`test/reconnect.test.mjs`「toDeckScreen clicks 《爐石戰記》 only while the hub is the scene」「the loop hands a Battle.net drop to the runner as exit 3…」「a rejoined client with our turn and no options ends the turn instead of idling」；`test/power.test.mjs`「a rejoined game takes the shown turn from the CREATE_GAME snapshot」
- 相關：F-811、F-893、F-895、E-239、E-290、E-291、E-293、L-069
- 合併自：L-039、L-070、L-071、L-074、L-075
- 來源：archive/STATUS-2026-10-27.md 第 149 行；2026-10-30 App 實測與演練、使用者回報

### L-069 自動重試與背景腳本
- 日期：2026-10-30
- 發生什麼：
  1. VPN keepalive 第一次重連失敗後只記 log、等下一輪；log 裡已出現 4 次「第一次失敗、下一輪才好」沒人當成問題。（L-069）
  2. PowerShell 把只有一個元素的 `@(...)` 回傳值攤平成單一 `DateTime`，`$recent += Get-Date` 變成兩個日期相加而丟錯；剛好 1 筆時每一輪都死，VPN 斷了 29 分鐘。上次演練是 0 筆所以沒抓到。（L-072）
  3. 「每小時最多 3 次登入」把成功的登入也算進去，演練第 3 次時重試被擋掉。（L-073）
  4. loop 在 `process.exit(3)` 前 `spawn('schtasks', …)`，Windows 上沒 detached 的子程序跟著父程序被殺，schtasks 沒執行。（L-076）
- 規則：
  1. 自動重連在同一輪內重試，不把重試留給下一個排程週期；log 裡重複出現的「失敗後下一輪才好」就是 bug。
  2. PowerShell 函式回傳的集合在呼叫端也包 `@()`；測有狀態的腳本時 0 筆、1 筆、多筆都要跑過。
  3. 防暴力登入的上限只算連續失敗，成功就清掉計數。
  4. `process.exit` 前起的「發出去就不管」的子程序一律 `detached:true` 加 `.unref()`，並確認它真的有跑（例如看排程的 LastRunTime）。
- 狀態：NTNU VPN Keepalive 排程 2026-10-30 已停用（5090 改走 Tailscale）；規則仍適用於其他自動化腳本。
- 對應測試或關卡：`test/reconnect.test.mjs`「the loop hands a Battle.net drop to the runner as exit 3…」裡的 `kickVpn` detached 斷言；keepalive 腳本在 repo 外，無自動測試
- 相關：E-291、E-294、F-893、L-039
- 合併自：L-069、L-072、L-073、L-076
- 來源：2026-10-30 App 修 keepalive 與演練

### L-022
- 日期：2026-10-09
- 發生什麼：50場批次中runner預設引擎版本過期，且loop無任何看門狗，導致永久卡死與長靜默到逾時才被發現
- 規則：長跑批次啟動前要核對 runner 預設的模型／引擎版本（Jev 時代是 planner-version.mjs）；任何await（截圖、worker、Jev）都要有逾時／看門狗，並在批次結束後做停頓普查（逐場log時間戳）
- 對應測試或關卡：無
- 相關：F-406、F-410
- 來源：archive/STATUS-2026-10-27.md 第 2763 行（2026-10-09：標準1場（解任務）＋棄牌術50場）

### L-084
- 日期：2026-10-30
- 狀態：生效
- 發生什麼：10-30 標準天梯 40 局是在 HDT 沒開的情況下打的，賽後才發現。牌位、對手牌位、先後手、HDT 重播都沒留下，所以「對手是不是比較弱」這題沒有資料能回答（F-900）。runner 每局都印出 `HDT: … level 32`，但那是 10-29 23:44 的舊紀錄，沒有人注意到它一直沒變。
- 規則：打天梯前 HDT 一定要開著。`src/await-game.mjs` 和 runner 每局排隊前都會呼叫 `ensureHdt()`，沒開就用 Update.exe --processStart 啟動它。批次紀錄裡的 HDT 時間如果一直停在同一筆，就是 HDT 沒在記錄。
- 對應測試或關卡：`test/reconnect.test.mjs`「ensureHdt starts HDT only when…」「every way into a game checks HDT first」。


---

## 賽後分析

### L-067 從實戰做位置題
- 日期：2026-10-29
- 發生什麼：
  1. 把 R-157、R-158 做成回歸題時，`synthParsed` 只用錄下的 state 重建局面，缺了儀式計時、牌庫裡的 Shreds、墓地和棄牌數；兩題都判「通過」，實戰網路卻兩題都選錯。拿真實 Power.log 解析重播才重現實戰選擇。第一次重播沒設 `JEV_DECK`，用錯牌表。（L-067）
  2. 照做第 16 局時又兩處不一致：Grueling Trial 在 SECRET 區的計時沒進 fixture；發現進行中的 Cursed Catacombs 在 PLAY 區但不在場上，`gone` 漏了它。（L-068）
- 規則：
  1. 先用該局 Power.log 切到決策當下做 `shadowView`，和 `synthParsed` 的 view 逐欄比對（`deck`、`them`、`timers`），有差就把解析知道的資訊寫進 fixture 的 `parsed`（`kazRuns`、`gone`、`shreds`、`publicPlays`、`discards`、`trials`；question 的 source 加 `parsed:'parsed'`），直到 diff 為空、機率和 decisions.jsonl 一致。
  2. `gone` 收「自己的、不在 DECK/HAND、也不在 state 的手牌和場上」的實體（不含英雄和英雄技能）；SECRET 區的 Kazakus 審判寫進 `parsed.trials`（`{cardId,owner,progress,effects}`）。
  3. fixture 的 `source.livePick` 記下實戰的選擇；重播要帶 `JEV_DECK=<deck>`。
- 對應測試或關卡：`test/zakajz-live.test.mjs`「zoo position questions with a recorded live pick reproduce it from the fixture」
- 相關：R-115、R-114、R-147、F-888、F-889
- 合併自：L-067、L-068

