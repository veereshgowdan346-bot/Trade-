# PHASE 6.2 — WALK-FORWARD EFFICIENCY (WFE) TERMINOLOGY & FORMULATION AUDIT

**Document Status:** INSTITUTIONAL MATHEMATICAL AUDIT — COMPLETE  
**Execution Mode:** STRICT OFFLINE RESEARCH & PAPER TRADING ONLY  
**Live Brokerage Execution:** PERMANENTLY DISABLED  
**Artifact References:** `scripts/phase61_audit_output.json`, `scripts/phase62_audit_output.json`

---

## 1. Executive Summary & Problem Formulation

In Phase 6, a walk-forward analysis was performed by splitting a 1,500-candle synthetic dataset into an In-Sample (IS) calibration set (candles 1–750) and an Out-of-Sample (OOS) evaluation set (candles 751–1,500).

During the subsequent reviews, two conflicting figures emerged:
- **Phase 6 reported:** Walk-Forward Efficiency (WFE) $= \mathbf{1.86}$
- **Direct calculation of Net Returns:** $\frac{\text{Net P\&L}_{\text{OOS}}}{\text{Net P\&L}_{\text{IS}}} = \frac{₹1,517.85}{₹327.08} = \mathbf{4.64}$

This document formally audits both mathematical definitions, documents the exact conversion identity, examines the statistical validity of the metric, and establishes unambiguous terminology for future research.

---

## 2. Mathematical Formulations & Decomposition

### 2.1 Raw Empirical Data (Synthetic 1,500 Bars)
- **Time Window:** 
  - $T_{\text{IS}} = 750 \text{ minutes}$ (Bars 1–750)
  - $T_{\text{OOS}} = 750 \text{ minutes}$ (Bars 751–1,500)
  - Window Ratio: $T_{\text{OOS}} / T_{\text{IS}} = 1.00$ (Identical time length)
- **In-Sample Performance:**
  - Trade Count: $N_{\text{IS}} = 4 \text{ trades}$
  - Net Realized P&L: $\text{Net}_{\text{IS}} = \mathbf{₹327.08}$
  - Mean Net Expectancy per Trade: $\bar{x}_{\text{IS}} = \frac{327.08}{4} = \mathbf{₹81.770}$
- **Out-of-Sample Performance:**
  - Trade Count: $N_{\text{OOS}} = 10 \text{ trades}$
  - Net Realized P&L: $\text{Net}_{\text{OOS}} = \mathbf{₹1,517.85}$
  - Mean Net Expectancy per Trade: $\bar{x}_{\text{OOS}} = \frac{1,517.85}{10} = \mathbf{₹151.785}$

---

### 2.2 Formulation A: Time-Normalized Aggregate Net Return Ratio
Under classical Robert Pardo walk-forward analysis, WFE is defined as the annualized or time-normalized rate of return achieved out-of-sample divided by the rate of return achieved in-sample:

$$\text{WFE}_{\text{total}} = \frac{\text{Net}_{\text{OOS}} / T_{\text{OOS}}}{\text{Net}_{\text{IS}} / T_{\text{IS}}}$$

Since $T_{\text{OOS}} = T_{\text{IS}} = 750 \text{ bars}$:

$$\text{WFE}_{\text{total}} = \frac{\text{Net}_{\text{OOS}}}{\text{Net}_{\text{IS}}} = \frac{₹1,517.85}{₹327.08} = \mathbf{4.6406} \approx \mathbf{4.64}$$

**Interpretation:** Over identical elapsed time windows (750 minutes each), the strategy generated $4.64\times$ more total net rupees out-of-sample than in-sample.

---

### 2.3 Formulation B: Per-Trade Expectancy Ratio
In algorithmic trading systems where trade frequency varies drastically across regimes, researchers frequently evaluate the ratio of mean profit per trade:

$$\text{WFE}_{\text{per-trade}} = \frac{\bar{x}_{\text{OOS}}}{\bar{x}_{\text{IS}}} = \frac{\text{Net}_{\text{OOS}} / N_{\text{OOS}}}{\text{Net}_{\text{IS}} / N_{\text{IS}}}$$

Substituting the empirical values:

$$\text{WFE}_{\text{per-trade}} = \frac{₹151.785}{₹81.770} = \mathbf{1.8562} \approx \mathbf{1.86}$$

**Interpretation:** On average, each trade in the out-of-sample period earned $1.86\times$ as much net profit as each trade in the in-sample period.

---

### 2.4 The Exact Mathematical Identity Linking Both Formulations
The discrepancy between $4.64$ and $1.86$ is completely accounted for by the **Trade Frequency Multiplier**:

$$\begin{aligned}
\text{WFE}_{\text{total}} &= \frac{\text{Net}_{\text{OOS}}}{\text{Net}_{\text{IS}}} = \frac{N_{\text{OOS}} \cdot \bar{x}_{\text{OOS}}}{N_{\text{IS}} \cdot \bar{x}_{\text{IS}}} \\
&= \left(\frac{\bar{x}_{\text{OOS}}}{\bar{x}_{\text{IS}}}\right) \times \left(\frac{N_{\text{OOS}}}{N_{\text{IS}}}\right) \\
&= \text{WFE}_{\text{per-trade}} \times \text{Trade Frequency Multiplier}
\end{aligned}$$

Substituting the exact figures:
$$\text{Trade Frequency Multiplier} = \frac{10}{4} = \mathbf{2.50}$$
$$\text{WFE}_{\text{total}} = 1.8562 \times 2.50 = \mathbf{4.6406} \approx \mathbf{4.64}$$

Both metrics are mathematically valid within their respective definitions:
- **4.64** measures **aggregate capital accumulation efficiency** over time.
- **1.86** measures **per-trade execution expectancy efficiency**.
- The factor of **2.50** reflects the fact that the out-of-sample regime triggered $2.5\times$ as many trade opportunities.

---

## 3. Rigorous Quantitative Critique & Statistical Deficiencies

While the arithmetic connection is verified, a quantitative auditor must evaluate whether either metric represents a credible measure of walk-forward robustness. 

### 3.1 Small-Sample Instability ($N = 4$)
An In-Sample sample size of $N_{\text{IS}} = 4$ trades is statistically catastrophic:
- The standard error of the mean with $N = 4$ is $\sigma / \sqrt{4} = 0.5 \sigma$.
- A single marginal trade outcome of $\pm ₹100$ swings the In-Sample mean from $₹81.77$ to $₹106.77$ or $₹56.77$, causing the WFE metric to swing wildly between $3.5$ and $6.0$.
- In statistical hypothesis testing, an $N=4$ sample has virtually zero degrees of freedom ($df = 3$), rendering any t-statistic or p-value meaningless.

### 3.2 Purely Synthetic Provenance
Both the In-Sample and Out-of-Sample datasets were generated via a single pseudo-random number generator (PRNG) run in Python. 
- There are **no genuine bid-ask spreads, order queue dynamics, market impact cascades, or liquidity vacuums**.
- A higher OOS performance on PRNG data merely indicates that the synthetic series possessed a stronger directional drift or lower intraday noise in bars 751–1,500 than in bars 1–750.
- It does **not** demonstrate that the strategy discovered an invariant economic market anomaly.

---

## 4. Formal Classification & Audit Verdict

| Metric | Value | Classification | Empirical Validity |
|:-------|:-----:|:--------------:|:------------------:|
| **Time-Normalized Aggregate Ratio** | 4.64 | Internal Research Metric | **NOT VERIFIED** |
| **Per-Trade Expectancy Ratio** | 1.86 | Internal Research Metric | **NOT VERIFIED** |
| **Frequency Multiplier ($N_{\text{OOS}}/N_{\text{IS}}$)** | 2.50 | Exact Arithmetic Property | **VERIFIED** |
| **Empirical Walk-Forward Robustness** | — | Unproven (Synthetic Data) | **NOT VERIFIED** |

### Mandatory Governance Rules:
1. **Terminology Prohibition:** The OmniTradePro documentation and research code must never refer to either $4.64$ or $1.86$ as "empirically validated walk-forward efficiency."
2. **Explicit Labeling:** In all future technical reports, these figures must be labeled as:  
   *`"Research-Only Synthetic WFE Ratio (IS N=4, OOS N=10; Not Validated on Real Market Data)"`*.
3. **Institutional Prerequisite:** Walk-forward efficiency cannot be certified until evaluated on at least 100+ out-of-sample trades across multiple years of tick-level historical data from the National Stock Exchange of India (NSE).

---

## 5. Audit Attestation & Sign-Off

- **Lead Auditor:** Quantitative Systems & Algorithmic Trading Auditor
- **Audit Date:** 2026-11-17
- **Verification Status:** **NOT VERIFIED FOR LIVE TRADING; ARITHMETIC RECONCILED AS SYNTHETIC RESEARCH ONLY**.
