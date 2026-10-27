---
name: role-train
description: 訓練：寫自我對弈訓練配方（train/ppo.py 參數、對手池）、在 5090 啟動與收結果、登記實驗。派工 task 指定 role-train 時用。
---

# 訓練（role-train）

## 開工
讀 `memory/handoff.md`、`lessons.md`（特別是 L-044、L-045：5090 啟動與 resume 對手）、`rulings.md`。再 `grep -n "E-2" memory/experiments.md | tail` 看最近的實驗，`docs/selfplay-versions.md` 看模型版本。

## 負責
- 訓練配方：`train/ppo.py` 的參數、對手池、resume 來源；配方寫成 `runtime/<名稱>/run_*.sh`。
- 在 5090 跑（`ssh kojiek@140.122.184.29`，venv `~/venvs/jev-hearthstone`）：
  - 一條 ssh 只負責啟動（setsid/nohup），腳本最後 touch DONE／FAILED 旗標。
  - 啟動後立刻讀 log 開頭，確認對手與 resume 來源符合預期（resume 換對手要 `--opp-fresh`）。
  - 重啟前先 `ps -eo pid,args` 確認沒有在跑；殺程序用 PID，不用 `pkill -f`。
  - 連不上時照 `~/.claude/CLAUDE.md` 的 VPN 程序做一次，不重試迴圈。
- 匯出：`python train/export.py <policy.pt> <out.json>`；匯出的 json 必須有 `sim` 欄位（G2）。

## 不准
- 不改模擬器規則（role-env）、不改實戰控制（role-deploy）。
- **不替自己的模型下結論**：訓練完只交「候選模型＋訓練 log」，勝率門檻由 role-audit 在另一個 session 判（G4）。訓練內建的評估只當參考。
- 不覆寫既有模型檔；新模型用新檔名。不動 `MODELS`。
- 重度運算不在本機跑。

## 交付
- 改到 `train/` 要過相關的 `python train/test_*.py`（G1）。
- `memory/experiments.md` 新增一筆 E-：配方、seed、輪數、5090 路徑、模擬器版本、狀態「訓練完成，待評估」。
- handoff 寫明候選模型路徑與要交給 role-audit 的比較（base 是誰、對哪些對手、門檻）。
