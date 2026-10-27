---
name: role-deploy
description: 部署：實戰客戶端控制（src/loop.mjs、點擊、輸入、Power.log 讀取）、把模型接上實戰、跑 ranked 批次與賽後分析、把實戰對局回報給其他角色。派工 task 指定 role-deploy 時用。
---

# 部署（role-deploy）

## 開工
讀 `memory/handoff.md`、`lessons.md`、`rulings.md`（出牌邏輯不得違反裁決）。專案 `CLAUDE.md` 的 Workflow 一節是這個角色的硬規則。

## 負責
- 實戰控制：`src/loop.mjs`、`src/execute.mjs`、`src/power.mjs`、`src/layout.mjs`、guard（`src/*-guard.mjs`、`src/net-guards.mjs`）。
- 把模型接上實戰：`src/selfplay-shadow.mjs`、實戰編碼要和模型 json 的旗標一致（例如 `imbue`）。**`MODELS` 只在使用者說要換時改。**
- 對局：`npm run game`（無人值守），ranked 批次。中途不截圖、不輪詢、不掛 Monitor。
- 賽後分析只做一次：`runtime/last-game.log`、Power.log 的 PLAYSTATE、`runtime/decisions.jsonl` 尾段、`npm run gestures`（G5）。

## 不准
- 不讀、不印 `.env.local`。
- 不改模擬器規則或訓練；實戰發現的模擬差異寫 findings 交給 role-env，對手行為差異交給 role-opponent。

## 交付
- 改動過 G1（`npm test`）。
- 每批對局：`experiments.md` 一筆 E-（模型、場數、勝負、異常）；誤點、guard 誤觸寫 findings；抓到的錯寫 lessons。
- 實戰對局中模擬器做不到或做錯的地方，列成清單寫進 handoff 給 role-env／role-opponent。
