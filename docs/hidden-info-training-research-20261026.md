# Rollout 的來歷與隱藏資訊遊戲的訓練方式（2026-10-26）

背景：rollout 實驗（STATUS.md「Rollout 目標」）讓卡札決策變確定，但勝率沒贏過 mix，別處反而變差。之後改做困難局面重開（`--restart-frac`）並用 `--kl-weight` 綁住 v5。本文記下當時的文獻脈絡，以及下一步的訓練方向。

**文獻年份與做法都是憑記憶整理的，沒有上網核對。**要引用前先查證。

## 1. Rollout 的來歷

| 時期 | 代表 | 做法 | 和本專案的關係 |
|---|---|---|---|
| 1996 | Tesauro & Galperin，雙陸棋 | 每個候選步模擬多局打到底，選勝率最高的 | 最早的 rollout |
| 1997– | Bertsekas 的 rollout algorithm | 在固定策略上做 rollout，得到的策略不比原策略差 | 前提是實戰當下這樣選，不是拿來訓練網路 |
| 2003 | Lagoudakis & Parr，用分類器做策略迭代 | rollout 選的步當標籤訓練分類器 | 等於 `--rollout` 實驗 |
| 2006–2015 | 圍棋 MCTS（MoGo、Crazy Stone） | 葉節點用隨機 rollout 估勝率 | |
| 2016 | AlphaGo | 價值網路和快速 rollout 各佔一半 | 最後一個還用 rollout 的強模型 |
| 2017 | AlphaGo Zero／AlphaZero；Expert Iteration（Anthony 等） | 拿掉 rollout，改用價值網路＋MCTS，學搜尋後的選擇分佈；每一代都用最新的網路重新搜尋 | 取代 rollout 的做法；look-ahead 蒸餾比較接近這個 |
| 2012– | 橋牌 GIB、Information Set MCTS（Cowling 等）、爐石 AI 競賽 | 重發對手看不到的牌，再做 rollout 或搜尋 | 本專案的 `redeal` |
| 2017–2023 | Libratus、Pluribus、ReBeL、Student of Games | 有限深度搜尋，葉節點考慮好幾種後續策略 | 處理「只對一種後續打法估分」的偏差 |

rollout 被淘汰的三個原因：
- 雜訊大：每個選項 16 局，誤差約 ±12%。
- 後續打法固定：估出來的分數會迎合凍結的 v5。
- 價值網路更便宜，可以拿去支撐更深的搜尋。

困難局面重開：讓一部分訓練局從關鍵局面開始，用目前的網路照 PPO 打完。這樣能補上樣本不足的問題，也不會迎合凍結的網路。但更新權重的影響還是會外溢到其他決策，所以要加 KL 綁住 v5，重開比例也不能太高；局面池要從近期對局取。相關文獻有 Go-Explore、reverse curriculum、prioritized replay。

## 2. 隱藏資訊遊戲怎麼訓練

本專案現況（2026-10-26 查過程式）：
- 網路只看得到對手手牌張數（`opponent-hand.mjs` 開頭的註解：「the encoder reads only how many」）。
- 自我對弈的 `redeal` 從行動方的視角重發對手手牌和牌庫。對手的牌組清單是已知的（zoo／discard），但不會依對手打過什麼來推論手牌。
- 實戰有 `opponent-hand.mjs` 和 `data/opponent-prior.json`，會依對手職業和已打出的牌加權發牌。

逐一評估幾種想法：

| 想法 | 文獻上的名字 | 評價 |
|---|---|---|
| 直接假設知道對手的牌來做決策 | determinization／perfect-information sampling | 只能當評估工具，不能拿來當策略的訓練目標。已知有兩個問題：一是 strategy fusion，在不同發牌下各選各的最佳步，現實中卻只能選同一步；二是學不會「防對手的牌」（play around）。 |
| 訓練時額外讓網路知道對手的牌 | asymmetric actor-critic、oracle guiding（Suphx 麻將）、PerfectDou（鬥地主「完美資訊訓練、不完美資訊執行」） | **最推薦先做**。只讓價值頭（critic）看到對手手牌和牌庫順序，策略頭維持只看自己能看的資訊。價值估計的雜訊會少很多，正好對應卡札學不到的原因（雜訊大、樣本少）。PPO 的基準值可以依賴隱藏資訊，梯度仍然沒有偏差。注意：這個價值頭不能在實戰搜尋時用，要另外留一個只看可見資訊的價值頭（或蒸餾出一個）。 |
| 只知道部分卡牌，回到過去重新決策 | 從關鍵狀態重開＋重發牌；counterfactual re-simulation | 就是現在的 `--restart-frac`＋`redeal`，方向正確。 |
| 猜對手的牌 | belief modeling；ReBeL／Student of Games 的 public belief state | 值得做，用輔助任務的方式：加一個頭預測對手手牌裡有哪些牌（自我對弈時有正確答案，用監督式 loss）。這樣網路會學到從對手的動作推論（例如沒打 2 費隨從，手上大概沒有）。之後搜尋時改從這個預測發牌，取代均勻重發，也可以取代實戰時靠統計的 prior。 |
| Rollout 或 MCTS | Rollout／ISMCTS／ExIt | **MCTS（搜尋）加價值網路葉節點**，不用 rollout。爐石在自己的回合裡對手不能動作，所以搜尋自己的回合幾乎是完全資訊（只差抽牌和隨機效果），搜尋很有效。隱藏資訊只在對手回合才重要，交給價值網路估。要在 K 個發牌上評估**同一個**動作再取平均，也就是 ISMCTS 的做法，不要每個發牌各自挑最佳步，否則又會落入 strategy fusion。搜尋結果蒸餾回網路（ExIt），每一代用最新的網路重新搜尋。 |

CFR 類方法（Libratus、ReBeL）是為了大量詐唬的遊戲設計的。爐石的詐唬價值低，主要是要防對手的牌，所以暫時不需要那麼重的方法。

## 3. 建議順序

1. 先看重開實驗（hard-s7／s8）的評估結果。
2. 加 oracle critic：價值頭多吃對手手牌＋牌庫；保留原本的可見資訊價值頭給搜尋用。兩個種子，對照 hard arm。改動小，預期對樣本效率幫助最大。
3. 加對手手牌預測的輔助頭，用它取代 `redeal` 的均勻發牌。
4. 把 look-ahead 搜尋改成在多個發牌上共用同一個動作（ISMCTS 式），葉節點用價值網路；搜尋分佈蒸餾，每代用最新網路。

## 參考（未核對，憑記憶）

Tesauro & Galperin 1996；Bertsekas & Tsitsiklis rollout；Lagoudakis & Parr 2003；Silver 等 2016、2017；Anthony 等 2017（Expert Iteration）；Cowling, Powley & Whitehouse 2012（ISMCTS）；Pinto 等 2017（asymmetric actor-critic）；Li 等 2020（Suphx）；Yang 等 2022（PerfectDou）；Brown 等 2018–2020（Libratus、Pluribus、ReBeL）；Schmid 等 2023（Student of Games）；Ecoffet 等 2019（Go-Explore）；Florensa 等 2017（reverse curriculum）。
