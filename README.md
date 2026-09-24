# Jev Hearthstone

本機 Jev 決策接入與爐石公開狀態讀取器。尚未完成全自動對局驗證。

## 使用

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
