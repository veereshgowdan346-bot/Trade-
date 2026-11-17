# OMNITRADEPRO APEX V2.0 — STRATEGY MATHEMATICAL SPECIFICATION & AUDIT

**Audit Date:** 2026-11-17  
**Auditor:** Quantitative Systems Architect & Financial Mathematics Auditor  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Modules:** `src/lib/strategies.ts`, `src/lib/intelligence.ts`, `strategies/*.json`  

---

## 1. COMPREHENSIVE STRATEGY REGISTRY

OmniTradePro Apex V2.0 implements a hybrid consensus engine comprising 8 built-in strategy voters, 1 predictive mathematical gate, and declarative JSON plugin drivers.

```
BUILT-IN QUORUM VOTERS:
├── [STRUCTURE]      smc_liquidity_grab       (SMC Liquidity Grab)
├── [STRUCTURE]      institutional_vwap       (Institutional VWAP)
├── [TREND]          dual_ema_9_21            (Dual EMA 9/21 - Active in Trending)
├── [TREND]          supertrend_10_3          (SuperTrend 10,3 - Active in Trending)
├── [STRUCTURE]      orb_vwap_momentum        (ORB & VWAP Momentum)
├── [MEAN_REVERSION] bb_mean_reversion        (Bollinger Mean Reversion - Active in Choppy)
└── [MEAN_REVERSION] rsi_mean_reversion       (RSI Mean Reversion - Active in Choppy)

PREDICTIVE FILTER:
└── [PROBABILITY]    gbm_gate                 (Geometric Brownian Motion 15-min Gate)

DECLARATIVE JSON PLUGINS:
├── [BREAKOUT]       donchian_breakout_20     (Donchian Channel 20-period Breakout)
└── [TREND]          fast_ema_5_13            (Fast EMA 5/13 Crossover)
```

---

## 2. INDIVIDUAL STRATEGY AUDIT & SPECIFICATIONS

### Strategy 1: SMC Liquidity Grab (`smc_liquidity_grab`)
- **File:** `src/lib/strategies.ts` (Lines 23–44)
- **Family:** Structure & Order Flow
- **Mathematical Formula:**
  $$\text{Lookback Window } W_{\text{structure}} = [t-26, \, t-3]$$
  $$\text{Swing High} = \max_{i \in W_{\text{structure}}} (H_i), \quad \text{Swing Low} = \min_{i \in W_{\text{structure}}} (L_i)$$
  $$\text{Recent Sweep Window } W_{\text{sweep}} = [t-2, \, t]$$
- **Signal Generation Conditions:**
  - **Long Sweep (+1):** $\exists i \in W_{\text{sweep}} : (L_i < \text{Swing Low} \land C_i > \text{Swing Low} \land C_i > O_i)$ $\implies \text{Vote} = +1, \text{Strength} = 85$.
  - **Short Sweep (-1):** $\exists i \in W_{\text{sweep}} : (H_i > \text{Swing High} \land C_i < \text{Swing High} \land C_i < O_i)$ $\implies \text{Vote} = -1, \text{Strength} = 85$.
  - **Bullish Expansion (+1):** $C_t > \text{Swing High} \implies \text{Vote} = +1, \text{Strength} = 75$.
  - **Bearish Breakdown (-1):** $C_t < \text{Swing Low} \implies \text{Vote} = -1, \text{Strength} = 75$.
  - **Neutral (0):** Inside structure range $[\text{Swing Low}, \text{Swing High}] \implies \text{Vote} = 0, \text{Strength} = 20$.
- **Input Data Requirements:** Array of at least 30 OHLCV candles (`c: Candle[]`).
- **Warm-Up Requirements:** Minimum 26 bars.
- **Missing-Data Behaviour:** If candle count $< 30$, consensus returns neutral with zero votes.
- **Market Regime Compatibility:** Valid in all regimes (`TRENDING_BULL`, `TRENDING_BEAR`, `CHOPPY_RANGING`, `VOLATILITY_EXPANSION`).
- **False-Positive Risk:** In prolonged runaway trends, successive higher highs may trigger false short sweeps if wicks momentarily exceed previous highs before breaking out.
- **Implementation Correctness:** **VERIFIED**. Correctly checks candle polarity ($C_i > O_i$ for bullish reclaim and $C_i < O_i$ for bearish rejection).

---

### Strategy 2: Institutional VWAP (`institutional_vwap`)
- **File:** `src/lib/strategies.ts` (Lines 46–58)
- **Family:** Structure & Benchmark Deviation
- **Mathematical Formula:**
  $$\text{Typical Price (TP)}_i = \frac{H_i + L_i + C_i}{3}$$
  $$\text{VWAP}_t = \frac{\sum_{i=1}^t (\text{TP}_i \times V_i)}{\sum_{i=1}^t V_i}$$
  $$\text{Deviation (\%)} = \left(\frac{C_t - \text{VWAP}_t}{\text{VWAP}_t}\right) \times 100\%$$
- **Signal Generation Conditions:**
  - **Neutral (0):** $|\text{Deviation}| < 0.02\% \implies \text{Vote} = 0, \text{Strength} = 15$.
  - **Bullish (+1):** $\text{Deviation} \ge +0.02\% \implies \text{Vote} = +1, \text{Strength} = \min(100, \max(0, 45 + |\text{Deviation}| \times 200))$.
  - **Bearish (-1):** $\text{Deviation} \le -0.02\% \implies \text{Vote} = -1, \text{Strength} = \min(100, \max(0, 45 + |\text{Deviation}| \times 200))$.
- **Input Data Requirements:** Intraday session candles with positive non-zero volume.
- **Warm-Up Requirements:** Session start candle ($t=0$ has volume $>0$).
- **Missing-Data Behaviour:** If total session volume is 0, falls back to close price ($P = \text{VWAP}$), resulting in a neutral vote.
- **Market Regime Compatibility:** All regimes.
- **False-Positive Risk:** In choppy sideways markets, price oscillates above and below VWAP rapidly, causing high-frequency signal flipping if not gated by the Wave Gate.
- **Implementation Correctness:** **VERIFIED**. Correct cumulative volume weighting.

---

### Strategy 3: Dual EMA 9/21 (`dual_ema_9_21`)
- **File:** `src/lib/strategies.ts` (Lines 60–74)
- **Family:** Trend Following
- **Mathematical Formula:**
  $$k_9 = \frac{2}{10} = 0.2, \quad k_{21} = \frac{2}{22} \approx 0.0909$$
  $$\text{EMA}_{9, t} = C_t \times 0.2 + \text{EMA}_{9, t-1} \times 0.8$$
  $$\text{EMA}_{21, t} = C_t \times 0.0909 + \text{EMA}_{21, t-1} \times 0.9091$$
  $$\text{Gap (\%)} = \left(\frac{\text{EMA}_{9, t} - \text{EMA}_{21, t}}{\text{EMA}_{21, t}}\right) \times 100\%$$
- **Signal Generation Conditions:**
  - **Neutral (0):** $|\text{Gap}| < 0.01\% \implies \text{Vote} = 0, \text{Strength} = 10$.
  - **Bullish (+1):** $\text{Gap} \ge +0.01\% \implies \text{Vote} = +1, \text{Strength} = \text{clamp}(45 + \text{Gap} \times 250 + (\text{FreshCross} ? 20 : 0))$.
  - **Bearish (-1):** $\text{Gap} \le -0.01\% \implies \text{Vote} = -1, \text{Strength} = \text{clamp}(45 + |\text{Gap}| \times 250 + (\text{FreshCross} ? 20 : 0))$.
- **Regime Suppression:** **MANDATORY SUPPRESSION** in `CHOPPY_RANGING` regime:
  `vote = 0, suppressed = true, detail = "SUPPRESSED (choppy)"`.
- **False-Positive Risk:** Lagging indicator; prone to whipsaws at the tail end of trends.
- **Implementation Correctness:** **VERIFIED**. Correctly checks sign transition for `FreshCross`.

---

### Strategy 4: SuperTrend (10, 3) (`supertrend_10_3`)
- **File:** `src/lib/strategies.ts` (Lines 76–87); `src/lib/indicators.ts` (Lines 123–148)
- **Family:** Volatility Trailing Trend
- **Mathematical Formula:**
  $$\text{ATR}_{10} = \text{RMA}(\text{TrueRange}, 10)$$
  $$\text{Basic Upper}_t = \frac{H_t + L_t}{2} + 3 \times \text{ATR}_{10, t}, \quad \text{Basic Lower}_t = \frac{H_t + L_t}{2} - 3 \times \text{ATR}_{10, t}$$
  $$\text{Final Upper}_t = (\text{Basic Upper}_t < \text{Final Upper}_{t-1} \lor C_{t-1} > \text{Final Upper}_{t-1}) ? \text{Basic Upper}_t : \text{Final Upper}_{t-1}$$
  $$\text{Final Lower}_t = (\text{Basic Lower}_t > \text{Final Lower}_{t-1} \lor C_{t-1} < \text{Final Lower}_{t-1}) ? \text{Basic Lower}_t : \text{Final Lower}_{t-1}$$
- **Signal Generation Conditions:**
  - **Bullish (+1):** Trend Direction $= +1$ ($C_t > \text{Trailing Line}$) $\implies \text{Vote} = +1, \text{Strength} = \text{clamp}(50 + \text{Dist} \times 120)$.
  - **Bearish (-1):** Trend Direction $= -1$ ($C_t < \text{Trailing Line}$) $\implies \text{Vote} = -1, \text{Strength} = \text{clamp}(50 + \text{Dist} \times 120)$.
- **Regime Suppression:** **MANDATORY SUPPRESSION** in `CHOPPY_RANGING` regime.
- **Implementation Correctness:** **VERIFIED**. Full ratchet logic correctly preserved.

---

### Strategy 5: Opening Range Breakout & VWAP Momentum (`orb_vwap_momentum`)
- **File:** `src/lib/strategies.ts` (Lines 93–160)
- **Family:** Structure & Intraday Momentum
- **Mathematical Formula:**
  $$\text{ORB Window} = \min(20, \max(10, \lfloor N \times 0.35 \rfloor)) \text{ bars}$$
  $$\text{ORB High} = \max_{i \in \text{ORB}} (H_i), \quad \text{ORB Low} = \min_{i \in \text{ORB}} (L_i)$$
  $$\text{Mom}_3 = \left(\frac{C_t - C_{t-3}}{C_{t-3}}\right) \times 100\%$$
- **Signal Generation Conditions:**
  - **Bearish Breakdown (-1):** $C_t < \text{ORB Low} \land C_t < \text{VWAP} \implies \text{Vote} = -1, \text{Strength} = \text{clamp}(80 + |\text{Dev}| \times 150 + (\text{Mom}_3 < 0 ? 15 : 0))$.
  - **Bullish Breakout (+1):** $C_t > \text{ORB High} \land C_t > \text{VWAP} \implies \text{Vote} = +1, \text{Strength} = \text{clamp}(80 + \text{Dev} \times 150 + (\text{Mom}_3 > 0 ? 15 : 0))$.
  - **Bearish VWAP Rejection (-1):** $C_t < \text{VWAP} \land \text{Mom}_3 < -0.15\% \implies \text{Vote} = -1, \text{Strength} = \text{clamp}(65 + |\text{Mom}_3| \times 100)$.
  - **Bullish VWAP Bounce (+1):** $C_t > \text{VWAP} \land \text{Mom}_3 > +0.15\% \implies \text{Vote} = +1, \text{Strength} = \text{clamp}(65 + \text{Mom}_3 \times 100)$.
  - **Inside ORB:** Upper 35% with $C_t > \text{VWAP} \to +1$ (Strength 55); Lower 35% with $C_t < \text{VWAP} \to -1$ (Strength 55); else 0 (Strength 20).
- **Implementation Correctness:** **VERIFIED**. High-conviction multi-condition structural filter.

---

### Strategy 6: Bollinger Mean Reversion (`bb_mean_reversion`)
- **File:** `src/lib/strategies.ts` (Lines 162–177)
- **Family:** Mean Reversion
- **Mathematical Formula:**
  $$\text{SMA}_{20} = \frac{1}{20} \sum_{i=0}^{19} C_{t-i}, \quad \sigma = \sqrt{\frac{1}{20} \sum_{i=0}^{19} (C_{t-i} - \text{SMA}_{20})^2}$$
  $$\text{Upper} = \text{SMA}_{20} + 2\sigma, \quad \text{Lower} = \text{SMA}_{20} - 2\sigma$$
- **Signal Generation Conditions:**
  - **Oversold Bounce (BUY / +1):** $C_t \le \text{Lower Band} \implies \text{Vote} = +1, \text{Strength} = 85$.
  - **Overbought Reversal (SELL / -1):** $C_t \ge \text{Upper Band} \implies \text{Vote} = -1, \text{Strength} = 85$.
  - **Tilt Zones ($>60\%$ distance from mid):** Upper stretched $\to -1$ (Strength 65); Lower stretched $\to +1$ (Strength 65).
  - **Inside Band:** $\text{Vote} = 0, \text{Strength} = 10$.
- **Regime Gating:** **ACTIVATED ONLY IN `CHOPPY_RANGING`** (where mean reversion has positive statistical expectancy).

---

### Strategy 7: RSI Mean Reversion (`rsi_mean_reversion`)
- **File:** `src/lib/strategies.ts` (Lines 179–187)
- **Family:** Mean Reversion Oscillator
- **Mathematical Formula:** 14-period Wilder smoothed RSI.
- **Signal Generation Conditions:**
  - **Deeply Oversold (+1):** $\text{RSI}_{14} \le 30 \implies \text{Vote} = +1, \text{Strength} = 90$.
  - **Deeply Overbought (-1):** $\text{RSI}_{14} \ge 70 \implies \text{Vote} = -1, \text{Strength} = 90$.
  - **Oversold Tilt (+1):** $30 < \text{RSI}_{14} \le 40 \implies \text{Vote} = +1, \text{Strength} = 65$.
  - **Overbought Tilt (-1):** $60 \le \text{RSI}_{14} < 70 \implies \text{Vote} = -1, \text{Strength} = 65$.
  - **Neutral Zone (0):** $40 < \text{RSI}_{14} < 60 \implies \text{Vote} = 0, \text{Strength} = 15$.
- **Regime Gating:** **ACTIVATED ONLY IN `CHOPPY_RANGING`**.

---

### Strategy 8: Geometric Brownian Motion (GBM) Predictive Gate (`gbm_gate`)
- **File:** `src/lib/strategies.ts` (Lines 190–211)
- **Mathematical Formula:**
  $$r_i = \ln\left(\frac{C_i}{C_{i-1}}\right), \quad i \in [1, 59] \quad (\text{last 60 candles})$$
  $$\mu = \frac{1}{N} \sum_{i=1}^N r_i, \quad \sigma = \sqrt{\frac{1}{N-1} \sum_{i=1}^N (r_i - \mu)^2}$$
  $$Z = \frac{\mu \times 15}{\sigma \sqrt{15}}$$
  $$P(\text{Up}) = \Phi(Z) = \int_{-\infty}^Z \frac{1}{\sqrt{2\pi}} e^{-\frac{u^2}{2}} du, \quad P(\text{Down}) = 1 - P(\text{Up})$$
- **Approval Threshold:** $P(\text{Direction}) \ge \mathbf{65\%}$ (Normal) or $\ge \mathbf{85\%}$ (Recovery Watch Mode).
- **Audit Assessment:** Treats price log-returns as i.i.d. Gaussian, which ignores fat tails, volatility clustering, and intraday jumps. **High false-confidence risk** during sudden news spikes.

---

### Strategy 9 & 10: Declarative JSON Plugins
- **Donchian Breakout 20 (`donchian_breakout_20`):**
  - High/Low of bars $t-21$ to $t-1$. $C_t > HH \to +1$, $C_t < LL \to -1$, else $0$.
- **Fast EMA Cross 5/13 (`fast_ema_5_13`):**
  - $\text{EMA}_5 > \text{EMA}_{13} \to +1$, $\text{EMA}_5 < \text{EMA}_{13} \to -1$.
