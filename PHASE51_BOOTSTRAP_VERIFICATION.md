# PHASE 5.1 — BOOTSTRAP RE-SAMPLING & STATISTICAL POWER AUDIT
**Project:** OmniTradePro Apex V2.0  
**Audit Mode:** Non-Parametric Bootstrap Reproduction & Power Sizing Audit  
**Execution Guardrail:** REAL-MONEY BROKER EXECUTION STRICTLY DISABLED  
**Audit Date:** 2026-11-17  
**Artifact Path:** `c:\Users\veere\Desktop\g4\PHASE51_BOOTSTRAP_VERIFICATION.md`  

---

## 1. Executive Summary & Objective

In Phase 5, statistical claims were made regarding the significance of the 15-trade sample, including a statement that $N = 114$ trades represents a minimum sample threshold for statistical confidence.

This audit independently:
1. Reproduces the 2,000-iteration non-parametric bootstrap resampling using an explicit pseudo-random number generator (PRNG) algorithm and seed.
2. Computes the empirical 95% confidence intervals for Expectancy, Win Rate, and Profit Factor.
3. Conducts a formal statistical power analysis.
4. Explains mathematically why $N = 114$ trades is an idealized Gaussian lower bound and **NOT a guaranteed minimum** in non-stationary financial markets.

---

## 2. Experimental Specification & PRNG Implementation

To guarantee 100% deterministic reproducibility across systems, the bootstrap analysis was executed using:
- **Resampling Iterations:** $B = 2,000$
- **Base Sample Size:** $N = 15$ trades
- **PRNG Algorithm:** Linear Congruential Generator (LCG) matching Numerical Recipes standard:
  $$X_{n+1} = (1664525 \cdot X_n + 1013904223) \pmod{2^{32}}$$
- **PRNG Seed:** `1337`
- **Output Artifact:** `scripts/phase51_bootstrap_output.json`
- **Verification Script:** `scripts/verify_bootstrap_phase51.js`

### 2.1 Base Sample Input Metrics ($N = 15$)
- **Sample Mean Net P&L ($\bar{x}$):** **+₹58.38**
- **Sample Standard Deviation ($s$):** **₹317.84**
- **Standard Error of the Mean ($\text{SE}$):**
  $$\text{SE} = \frac{s}{\sqrt{N}} = \frac{317.84}{\sqrt{15}} = \mathbf{\pm ₹82.07}$$
- **Cohen's $d$ (Standardized Effect Size):**
  $$d = \frac{\bar{x}}{s} = \frac{58.38}{317.84} = \mathbf{0.1837} \quad (\text{Small Effect Size})$$
- **$t$-Statistic vs. Zero Mean ($H_0: \mu = 0$):**
  $$t = \frac{\bar{x} - 0}{\text{SE}} = \frac{58.38}{82.07} = \mathbf{0.7113} \quad (p \approx 0.489, \text{Not Significant})$$

---

## 3. Bootstrap Percentile Confidence Intervals ($B = 2,000$)

Across 2,000 bootstrap resamples with replacement, empirical distributions were constructed by taking the 2.5th and 97.5th percentiles:

```
Bootstrap Expectancy Distribution (2,000 Resamples):
  Min:     -₹207.12
  2.5%:    -₹102.45  <--- 95% CI Lower Bound (Negative)
  25%:      +₹3.22
  Median:   +₹56.79
  75%:     +₹112.56
  97.5%:   +₹205.63  <--- 95% CI Upper Bound (Positive)
  Max:     +₹318.44
```

### 3.1 Metric Summary Table

| Metric | Point Estimate ($N=15$) | Bootstrap Median | Bootstrap 95% CI (2.5% - 97.5%) | Statistical Significance |
|--------|-------------------------|------------------|----------------------------------|--------------------------|
| **Net Expectancy (₹)** | +₹58.38 | +₹56.79 | **[-₹102.45, +₹205.63]** | **Inconclusive** (Spans 0) |
| **Win Rate (%)** | 60.00% (9/15) | 60.00% | **[33.33%, 80.00%]** | Broad confidence spread |
| **Profit Factor** | 1.46 | 1.47 | **[0.48, 5.00]** | Spans < 1.0 (unprofitable) |

> [!WARNING] Critical Quantitative Finding
> The 95% bootstrap confidence interval for net expectancy spans from **-₹102.45 to +₹205.63**. Because the lower bound is deeply negative, we **cannot reject the null hypothesis ($H_0$) that the strategy has zero or negative edge**. The positive performance observed in Phase 4 is statistically indistinguishable from random noise at $N = 15$.

---

## 4. Formal Statistical Power Analysis & Sample Sizing

### 4.1 Derivation of $N = 114$ Trades (Zero Lower Bound)
The claim that $N = 114$ represents a significant sample size originates from calculating the sample size where the lower bound of a two-sided 95% confidence interval ($\alpha = 0.05, Z_{0.025} = 1.96$) strictly clears zero:

$$\bar{x} - 1.96 \cdot \frac{s}{\sqrt{N}} > 0 \implies \sqrt{N} > \frac{1.96 \cdot s}{\bar{x}} = \frac{1.96}{d}$$
$$\sqrt{N} > \frac{1.96}{0.1837} = 10.6695$$
$$N > (10.6695)^2 = 113.84 \implies \mathbf{N = 114 \text{ trades}}$$

At $N = 114$ trades, *assuming the mean and standard deviation remain invariant*, the 95% CI lower bound reaches exactly ₹0.00.

### 4.2 Power Sizing for Statistical Edge Confirmation
In rigorous quantitative research, merely touching zero is insufficient; the test must possess adequate statistical power ($1 - \beta$) to detect an effect without committing a Type II error (false negative).

For a two-tailed test with $\alpha = 0.05$ ($Z_{\alpha/2} = 1.96$):
$$N = \left( \frac{Z_{\alpha/2} + Z_{\beta}}{d} \right)^2$$

1. **For 80% Statistical Power ($\beta = 0.20, Z_{\beta} = 0.8416$):**
   $$N = \left( \frac{1.9600 + 0.8416}{0.1837} \right)^2 = \left( \frac{2.8016}{0.1837} \right)^2 = (15.251)^2 = 232.59 \implies \mathbf{N = 233 \text{ trades}}$$

2. **For 90% Statistical Power ($\beta = 0.10, Z_{\beta} = 1.2816$):**
   $$N = \left( \frac{1.9600 + 1.2816}{0.1837} \right)^2 = \left( \frac{3.2416}{0.1837} \right)^2 = (17.646)^2 = 311.39 \implies \mathbf{N = 312 \text{ trades}}$$

---

## 5. Non-Normality, Non-Stationarity & Regime Risk Disclosure

### Why $N = 114$ is NOT a Guaranteed Minimum in Real-World Trading

The parametric sample size calculations above ($N = 114$, $N = 233$, $N = 312$) rely on strict mathematical assumptions:
1. Returns are independent and identically distributed (i.i.d.).
2. The underlying distribution is Gaussian (normal).
3. The underlying market regime and data-generating process are strictly stationary.

**None of these assumptions hold in financial markets:**

1. **Fat Tails & Kurtosis:** Financial trade returns exhibit heavy tails (leptokurtosis) and negative skewness due to slippage during volatility spikes. Outlier losses can severely depress $\bar{x}$ and inflate $s$.
2. **Volatility Clustering & Autocorrelation:** Wins and losses frequently cluster due to market regime shifts. Trade $i+1$ is not strictly independent of trade $i$.
3. **Regime Shifts & Edge Degradation:** A strategy operating in a trending regime during the first 100 trades may encounter a choppy mean-reverting regime during the subsequent 100 trades. The observed effect size ($d = 0.1837$) can deteriorate to zero or become negative.
4. **Survivorship & Selection Bias:** If parameters were selected based on backtest performance, out-of-sample effect size will suffer from parameter shrinkage (the "Winner's Curse").

### Institutional Recommendation
$N = 114$ is merely a theoretical lower bound under ideal Gaussian conditions. In institutional quantitative trading:
- **A minimum sample of $N \ge 250$ to $500+$ trades** spanning at least 6 to 12 months across diverse market regimes (bull, bear, sideways, high-volatility, low-volatility) is mandatory before deploying real capital.
- Forward paper simulation must continue until $N \ge 250$ before any capital scaling is evaluated.
