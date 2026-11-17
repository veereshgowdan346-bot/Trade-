# PHASE 6.1 — WALK-FORWARD EFFICIENCY (WFE) CORRECTION REPORT
**Project:** OmniTradePro Apex V2.0  
**Audit Mode:** Forensic Mathematical Discrepancy Resolution  
**Execution Guardrail:** REAL-MONEY BROKER EXECUTION STRICTLY DISABLED  
**Audit Date:** 2026-11-17  
**Artifact Path:** `c:\Users\veere\Desktop\g4\PHASE61_WFE_CORRECTION.md`  

---

## 1. Executive Summary & Problem Statement

In the Phase 6 reports, a numerical contradiction was identified regarding the Walk-Forward Efficiency (WFE) metric:
- In `scripts/run_phase6_audit.js` and `scripts/phase6_audit_output.json`, WFE was logged as **4.64**.
- In `PHASE6_WALK_FORWARD_VALIDATION.md` and `PHASE6_FINAL_INDEPENDENT_VERDICT.md`, WFE was reported as **1.86**.

The mandate of Phase 6.1 Task 1 is to:
1. Inspect the exact mathematical definitions of both formulas.
2. Re-derive both figures directly from the primary In-Sample (IS) and Out-of-Sample (OOS) trade ledgers.
3. Formally explain the arithmetic origin of the $4.64$ vs. $1.86$ divergence.
4. Provide a definitive institutional statistical assessment without altering formulas merely to force a preferred narrative.

---

## 2. In-Sample vs. Out-of-Sample Trade Ledger Re-Derivation

The 1,500-bar dataset was partitioned into two non-overlapping 750-bar segments ($T_{\text{IS}} = T_{\text{OOS}} = 750 \text{ minutes} = 2.0 \text{ trading days}$):

### 2.1 In-Sample (IS) Partition Ledger (Bars 0 to 750)
- **Period:** Days 1 and 2 (09:15 IST Nov 17, 2026 to 15:30 IST Nov 18, 2026)
- **Completed Trades ($N_{\text{IS}}$):** **4 Trades**
- **Trade Results:**
  - Trade 1: $+₹192.25$
  - Trade 2: $+₹193.86$
  - Trade 3: $-₹254.27$
  - Trade 4: $+₹195.24$
- **Total Realized Net P&L:** $$\text{Net}_{\text{IS}} = \mathbf{+₹327.08}$$
- **Average Trade Expectancy:** $$\bar{x}_{\text{IS}} = \frac{+₹327.08}{4} = \mathbf{+₹81.77 \text{ per trade}}$$

### 2.2 Out-of-Sample (OOS) Partition Ledger (Bars 751 to 1,500)
- **Period:** Days 3 and 4 (09:15 IST Nov 19, 2026 to 15:30 IST Nov 20, 2026)
- **Completed Trades ($N_{\text{OOS}}$):** **10 Trades**
- **Trade Results:**
  - Trade 5: $+₹217.58$
  - Trade 6: $+₹376.28$
  - Trade 7: $+₹433.37$
  - Trade 8: $+₹349.17$
  - Trade 9: $-₹348.12$
  - Trade 10: $-₹356.34$
  - Trade 11: $+₹335.83$
  - Trade 12: $+₹396.07$
  - Trade 13: $-₹359.27$
  - Trade 14: $+₹473.28$
- **Total Realized Net P&L:** $$\text{Net}_{\text{OOS}} = \mathbf{+₹1,517.85}$$
- **Average Trade Expectancy:** $$\bar{x}_{\text{OOS}} = \frac{+₹1,517.85}{10} = \mathbf{+₹151.785 \approx +₹151.79 \text{ per trade}}$$

---

## 3. Mathematical Origin of the $4.64$ vs. $1.86$ Discrepancy

The numerical divergence between $4.64$ and $1.86$ originates from two distinct definitions of Walk-Forward Efficiency existing in quantitative literature:

### 3.1 Formula 1: Time-Normalized Aggregate Net Return Ratio (Logged as 4.64)
In Robert Pardo's classic framework (*The Evaluation and Optimization of Trading Strategies*, 2008), WFE is defined as the annualized or time-normalized ratio of out-of-sample profit to in-sample profit:

$$\text{WFE}_{\text{aggregate}} = \frac{\text{Net}_{\text{OOS}} / T_{\text{OOS}}}{\text{Net}_{\text{IS}} / T_{\text{IS}}}$$

Because both partitions span identical durations ($T_{\text{IS}} = T_{\text{OOS}} = 2 \text{ trading days}$), the time factor cancels out:

$$\text{WFE}_{\text{aggregate}} = \frac{\text{Net}_{\text{OOS}}}{\text{Net}_{\text{IS}}} = \frac{+₹1,517.85}{+₹327.08} = \mathbf{4.6406} \approx \mathbf{4.64}$$

This formula was implemented in `scripts/run_phase6_audit.js` (line 486) as:
```javascript
const wfaRatio = isSim.netPnL !== 0 ? r2(oosSim.netPnL / isSim.netPnL) : 0; // = 4.64
```

### 3.2 Formula 2: Per-Trade Expectancy Ratio (Reported as 1.86)
An alternative formulation used by risk modelers evaluates whether the strategy's *per-trade edge* (expectancy) remained stable out-of-sample, controlling for trade frequency:

$$\text{WFE}_{\text{per-trade}} = \frac{\bar{x}_{\text{OOS}}}{\bar{x}_{\text{IS}}} = \frac{\text{Net}_{\text{OOS}} / N_{\text{OOS}}}{\text{Net}_{\text{IS}} / N_{\text{IS}}} = \frac{+₹151.785}{+₹81.770} = \mathbf{1.8562} \approx \mathbf{1.86}$$

### 3.3 Exact Mathematical Bridge Between the Two Numbers
The mathematical relationship between the two figures is the ratio of trade counts:

$$\text{Trade Frequency Ratio} = \frac{N_{\text{OOS}}}{N_{\text{IS}}} = \frac{10}{4} = \mathbf{2.50}$$

$$\text{WFE}_{\text{aggregate}} = \text{WFE}_{\text{per-trade}} \times \left( \frac{N_{\text{OOS}}}{N_{\text{IS}}} \right) = 1.8562 \times 2.50 = \mathbf{4.6406}$$

$$\text{WFE}_{\text{per-trade}} = \frac{\text{WFE}_{\text{aggregate}}}{2.50} = \frac{4.6406}{2.50} = \mathbf{1.8562} \approx \mathbf{1.86}$$

---

## 4. Institutional Assessment & Methodological Critique

Why neither metric can be cited as evidence of genuine walk-forward robustness:

1. **Extreme Small-Sample Distortion:** The In-Sample partition generated only **4 trades**. A denominator based on $N = 4$ is statistically unstable. For example, if a single trade had stopped out instead of hitting target, $\text{Net}_{\text{IS}}$ would have dropped from $+₹327.08$ to $+₹68.00$, artificially exploding $\text{WFE}_{\text{aggregate}}$ to $22.3$.
2. **Frequency Distortion:** OOS generated $2.5\times$ more trades (10 trades) than IS (4 trades) across identical time spans (750 bars). This indicates that the market regimes were not stationary between the two halves.
3. **Synthetic Data Constraint:** Because both partitions were generated using an in-memory PRNG, the out-of-sample dataset does not represent genuine historical market complexity.

---

## 5. Audit Verdict & Classification

| Walk-Forward Metric | Mathematical Derivation | Value | Audit Verdict |
| :--- | :--- | :---: | :---: |
| Aggregate Return Ratio | $\text{Net}_{\text{OOS}} / \text{Net}_{\text{IS}}$ | **4.64** | **MATHEMATICALLY RECONCILED** |
| Per-Trade Expectancy Ratio | $\bar{x}_{\text{OOS}} / \bar{x}_{\text{IS}}$ | **1.86** | **MATHEMATICALLY RECONCILED** |
| Discrepancy Reconciliation | $4.64 / 2.50 \equiv 1.86$ | Exact | **ZERO UNRESOLVED VARIANCE** |
| Statistical Reliability | $N=4$ IS vs. $N=10$ OOS | Highly Volatile | **NOT VERIFIED (Insufficient Sample)** |
| Empirical Historical Validity| 100% Synthetic Data | Zero Exchange Records | **NOT VERIFIED FOR LIVE** |
