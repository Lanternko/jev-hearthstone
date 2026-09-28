# Jev Hearthstone

本機 Jev 決策接入與爐石公開狀態讀取器。尚未完成全自動對局驗證。

## 使用

### 開一場休閒對戰

1. 先執行 `npm run smoke` 驗證 Jev 存取。若回覆模型無權限、額度或價格確認錯誤，先報告；API 並未可用，不能把規則備援稱為 Jev 正常思考。
2. 爐石已開啟時直接選其現有視窗；斷線則先重連。主選單進入「爐石戰記」。
3. 套牌頁右上角模式徽章選太陽圖示，確認頁首寫「休閒模式」。選 `Void Demon Hunter`，確認藍色選取框與右側套牌名稱。模式只點一次；英雄說明浮層可點空白處關閉。
4. 在此專案執行一次 `npm run game`，再點遊戲中的「開始」。這個命令只等待並接管對局，**不會替你開啟遊戲、切模式或按開始**。不要啟動第二份。
5. 「尋找對手」只代表排隊；確認進入對戰／起手換牌後才回報已開始。之後放手，對局後一次讀取 `runtime/last-game.log`、決策紀錄與 `npm run gestures`。

存取被拒時，執行中的備援會立即接手，且本次程序不再重試同一存取錯誤；修好 Gateway 設定後須重新啟動程序。備援不是 Jev 模型。

Node.js 22，執行 `npm ci`。將 Gateway key 放入本目錄 `.env.local`，格式見 `.env.example`；不要貼進對話或 vault。

- `npm run smoke`：真正呼叫 `typesafe-ai/jev`，驗證選擇 API；缺金鑰會明確失敗。
- `npm run decide -- --inspect`：讀取最新 Power.log，只顯示本方手牌及公開盤面。
- `npm run decide`：在活躍回合以遊戲回報的合法選項呼叫 Jev，將單步決策存於 `runtime/decision.json`。
- `npm run calibrate`：只移動游標、不點擊，逐一停在每個可點目標上，用來校正 `src/layout.mjs`。加 `--live` 改用當前對局的真實手牌與場面。
- `npm run play`：執行 `runtime/decision.json` 的決策；`--dry` 只移動游標。
- `npm test`：解析器、資訊遮罩、合法候選、結束狀態、座標與手勢測試。

執行由 `src/play.mjs` 以 SendInput 直接點擊完成，不需要視覺模型。座標來自 `src/layout.mjs`：常數是 16:9 內容區的比例，執行時乘上實際 client rect，因此 1920x1080 視窗與 2560x1440 全螢幕共用同一組數字；非 16:9 的 client 會自動算出信箱邊框。視窗以 process 名稱定位（標題是《爐石戰記》，不是 Hearthstone）。

**`src/layout.mjs` 的常數是估計值，首次使用前必須跑一次 `npm run calibrate` 校正。** 每次執行後重新解析 Power.log 核對盤面是否真的改變；沒變就是座標沒對準。模型錯誤、舊日誌、已結束對局與狀態變更都停止；不以其他模型代替 Jev。

`data/cards.enUS.json` 是 2026-09-20 下載的完整卡面快照，SHA256 `079C41A102D386A289BCF2676815799967A8AA0AAEB6B0A5958C76BDD4A20AC3`。來源：https://api.hearthstonejson.com/v1/latest/enUS/cards.json。

## 限制

尚待現場驗證：Mulligan/Discover 選牌、subOption 類行動、召喚擺位、特殊地點、暫時牌及新增機制。遇到不支援的 subOption 不產生候選。不能把解析成功視為已完成遊戲控制。

API 僅傳送過濾盤面、策略與候選，不含 BattleTag、GameAccountId、原始日誌、對手手牌或牌堆順序。Vercel 官方 Jev 免費優惠標示至 2026-09-25；效期後應重查計價。
