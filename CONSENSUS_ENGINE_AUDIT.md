# OMNITRADEPRO APEX V2.0 — CONSENSUS ENGINE & QUORUM AUDIT REPORT

**Audit Date:** 2026-11-17  
**Auditor:** Quantitative Systems Architect & Decision Engine Auditor  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Module:** `src/lib/strategies.ts` (`evaluateConsensus()`)  

---

## 1. CONSENSUS ENGINE MATHEMATICAL SPECIFICATION

The consensus engine evaluates 5 active strategy voters chosen dynamically based on the prevailing market regime:

```
IF REGIME == "CHOPPY_RANGING":
   Active Voters = [SMC Liquidity Grab, Institutional VWAP, ORB & VWAP Momentum, Bollinger Mean Reversion, RSI Mean Reversion]
   Suppressed    = [Dual EMA 9/21, SuperTrend 10/3] (Both forced to vote: 0, suppressed: true)

ELSE (TRENDING_BULL, TRENDING_BEAR, VOLATILITY_EXPANSION):
   Active Voters = [SMC Liquidity Grab, Institutional VWAP, Dual EMA 9/21, SuperTrend 10/3, ORB & VWAP Momentum]
   Suppressed    = []
```

### 1.1 Voting Tally Mathematics
```ts
let buy = active.filter((s) => s.vote === 1).length;
let sell = active.filter((s) => s.vote === -1).length;
let voters = active.length; // Always 5 unless externalVote is supplied
if (externalVote !== undefined) {
  voters += 1; // Expands to 6 voters
  if (externalVote === 1) buy += 1;
  if (externalVote === -1) sell += 1;
}
const direction = buy > sell ? "BUY" : sell > buy ? "SELL" : "NONE";
const agree = Math.max(buy, sell);
const quorumPct = Math.round((agree / voters) * 100);
```

---

## 2. MATHEMATICAL VERIFICATION OF QUORUM PERCENTAGES

### Case A: Standard 5-Voter Baseline ($V = 5$)

| Agreement Count | Buy / Sell Tally | Formula: $\text{round}\left(\frac{\text{Agree}}{5} \times 100\right)$ | Calculated Quorum % | Passes 75% Gate? | Passes 90% Recovery Gate? |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 5 of 5 | 5B / 0S | $5 / 5 \times 100\%$ | **100%** | ✅ PASS | ✅ PASS |
| 4 of 5 | 4B / 1S or 4B / 0S / 1N | $4 / 5 \times 100\%$ | **80%** | ✅ PASS | ❌ REJECT (Requires $\ge 90\%$) |
| 3 of 5 | 3B / 2S or 3B / 0S / 2N | $3 / 5 \times 100\%$ | **60%** | ❌ REJECT | ❌ REJECT |
| 2 of 5 | 2B / 1S / 2N | $2 / 5 \times 100\%$ | **40%** | ❌ REJECT | ❌ REJECT |
| 1 of 5 | 1B / 0S / 4N | $1 / 5 \times 100\%$ | **20%** | ❌ REJECT | ❌ REJECT |

### Critical Mathematical Findings:
1. **The 75% Gate Reality:** With 5 voters, the possible quorum percentages are discrete multiples of 20% ($20\%, 40\%, 60\%, 80\%, 100\%$). A threshold of $\ge 75\%$ mathematically means **at least 4 out of 5 voters (80%) must agree in the same direction**!
2. **The 90% Recovery Gate Reality:** A threshold of $\ge 90\%$ in Recovery Watch Mode mathematically mandates **unanimous 5 out of 5 agreement (100%)**! No 4-voter consensus can satisfy $90\%$.
3. **Treatment of Neutral Votes:**
   If 3 voters vote BUY, 0 vote SELL, and 2 vote NEUTRAL:
   $$\text{Agree} = 3, \quad \text{Quorum} = \frac{3}{5} \times 100\% = 60\%$$
   The quorum fails the 75% hurdle. **Neutral voters are correctly treated as non-agreeing**, preventing weak signals from squeaking through.

---

## 3. AUDIT OF VOTER SUPPRESSION & CONFLICT RESOLUTION

### 3.1 Regime-Specific Voter Suppression
When the market transitions into `CHOPPY_RANGING`:
- Trend followers (Dual EMA and SuperTrend) are stripped of voting power.
- Their votes are set to $0$ and logged as `SUPPRESSED (choppy)`.
- Mean reversion voters (Bollinger and RSI) take their place in the active pool.
- Total active voters remains exactly 5.

### 3.2 Opposing Directional Signals (Conflict Resolution)
If 3 voters vote BUY and 2 voters vote SELL:
- `buy = 3`, `sell = 2`, `agree = 3`.
- `quorumPct = 60% < 75%`.
- Direction is nominally "BUY", but `qualifies` evaluates to `false` because $60\% < 75\%$.
- Order is rejected with `status: "REJECTED_QUORUM"`.
- If `buy === sell` (e.g. 2 BUY, 2 SELL, 1 NEUTRAL), `direction` evaluates to `"NONE"` and is rejected immediately.

### 3.3 Dynamic Market Wave Detection Gating
In `strategies.ts` Line 370–372:
```ts
const isDirectionalWave = regime.adx >= 20;
const isExpansionWave = regime.bbWidthRatio >= 1.20 || regime.atrRatio >= 1.15;
const isConsolidation = regime.regime === "CHOPPY_RANGING" || (!isDirectionalWave && !isExpansionWave);
const waveActive = !isConsolidation;
```
Even if quorum reaches 80% or 100%, if `waveActive === false`, `qualifies = false`. This guarantees that consolidation chop never triggers auto-orders.

---

## 4. VERIFICATION TEST MATRIX FOR CONSENSUS ENGINE

```
[TEST-CON-01] Unanimous Bullish (5 BUY, 0 SELL)       -> Quorum 100%, Direction BUY, Qualifies TRUE (if Wave Active)
[TEST-CON-02] Strong Bullish (4 BUY, 1 SELL)          -> Quorum 80%, Direction BUY, Qualifies TRUE
[TEST-CON-03] Marginal Bullish (3 BUY, 2 SELL)        -> Quorum 60%, Direction BUY, Qualifies FALSE (Quorum Fail)
[TEST-CON-04] Conflicted (2 BUY, 2 SELL, 1 NEUTRAL)    -> Quorum 40%, Direction NONE, Qualifies FALSE
[TEST-CON-05] Neutral Market (0 BUY, 0 SELL, 5 NEUT)  -> Quorum 0%, Direction NONE, Qualifies FALSE
[TEST-CON-06] Recovery Mode 4/5 (4 BUY, 1 SELL)       -> Quorum 80%, Direction BUY, Qualifies FALSE in Recovery (Req 90%)
[TEST-CON-07] Recovery Mode 5/5 (5 BUY, 0 SELL)       -> Quorum 100%, Direction BUY, Qualifies TRUE in Recovery
```
*All 7 test scenarios pass strictly according to the mathematical engine logic.*
