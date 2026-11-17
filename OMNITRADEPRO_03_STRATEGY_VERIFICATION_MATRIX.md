# OMNITRADEPRO_03 — STRATEGY VERIFICATION MATRIX

**Rule applied:** no strategy is marked BACKTEST-VALIDATED or PAPER-TESTED without executable evidence produced in this audit. Historical claims in repo docs were not trusted.

## Status legend
IMPLEMENTED · EXECUTABLE · PAPER-TESTED · BACKTEST-VALIDATED · DISABLED · INCOMPLETE · FAILED · UNVERIFIED

---

## Layer A — Core Quorum Voters (src/lib/strategies.ts)

| # | Strategy | Implementation | Math | Warm-up | Signals (B/S/N) | Strength | Quorum role | Status |
|---|----------|----------------|------|---------|-----------------|----------|-------------|--------|
| 1 | SMC Liquidity Grab (`smc_liquidity_grab`) | ✅ 23-bar swing window + 3-bar sweep/reclaim | Sound (swing extrema, body-confirm) | <26 bars → guarded by 30-bar consensus floor | sweep-reclaim 85; breakdown/expansion 75; inside 20 | fixed/clamped | voter (both regime sets) | **EXECUTABLE** (fixture: votes observed in harness) |
| 2 | Institutional VWAP (`institutional_vwap`) | ✅ cumulative typical-price VWAP | Verified vs hand vector (math harness) | needs vol>0; zero-vol fallback = close | ±0.02% band → neutral; dev-scaled strength clamp | 45+200·|dev| | voter | **EXECUTABLE** |
| 3 | Dual EMA 9/21 (`dual_ema_9_21`) | ✅ seeded-EMA gap + cross flag | EMA verified vs reference | 2 bars min (guarded) | gap sign; +20 on fresh cross | 45+250·gap | voter (trend regimes) | **EXECUTABLE** |
| 4 | SuperTrend 10/3 (`supertrend_10_3`) | ✅ ATR bands, ratcheted final bands, flip on close cross | Verified: flip-once property, direction correctness (harness) | 10 bars | dir ±1 always (never neutral) | 50+120·dist | voter (trend regimes) | **EXECUTABLE** |
| 5 | ORB & VWAP Momentum (`orb_vwap_momentum`) | ✅ 10–20 bar opening range + VWAP + 3-bar momentum | Sound; division guarded (orbRange>0) | <15 bars → neutral | 5 distinct cases + range-position fallback | 55–95 | voter | **EXECUTABLE** |
| 6 | Bollinger Mean-Reversion (`bb_mean_reversion`) | ✅ 20/2 bands, band-position tilt | Verified vs reference | 20 bars | touch bands 85; ±60% tilt 65 | | voter **only in CHOPPY_RANGING** — but see WAVE-001 (can never qualify) | **IMPLEMENTED** (execution path dead) |
| 7 | RSI Mean-Reversion (`rsi_mean_reversion`) | ✅ 14-period RSI thresholds 30/70, 40/60 tilts | Steady-state verified; warmup deviation MATH-003 | 14 bars | 90/65/15 ladder | | same as #6 | **IMPLEMENTED** (execution path dead) |
| 8 | GBM Probability Gate (`gbm_gate`) | ✅ log-return μ/σ, z=(μ·T)/(σ√T), A&S normal CDF | Verified: symmetry, rally>65, kernel error<1e-5, degenerate→50/50 (MATH-002) | ≥2 returns | gate ≥65% (config floor) | gate, not voter | **EXECUTABLE** |

**Quorum participation:** voters = 5 active strategies (+1 if external webhook vote). Plugins are computed but **do not vote** (QUORUM-002 note). Suppressed strategies are removed from the active set entirely (cannot raise confidence ✓). No strategy can double-vote (fixed array construction).

## Layer B — JSON Plugins (strategies/*.json)

| # | Strategy | File | Implementation | Status |
|---|----------|------|----------------|--------|
| 9 | Fast EMA Crossover 5/13 | `fast_ema_5_13.json` | `runPlugin` ema_cross, params honored | **EXECUTABLE** (discovered, cached, informational) |
| 10 | Donchian Breakout 20 | `breakout_20.json` | `runPlugin` breakout, lookback honored, excludes current bar ✓ no look-ahead | **EXECUTABLE** (informational) |
| 11 | Declarative RSI Plugin | **MISSING** | engine supports `rsi_reversion` type; **no JSON instance exists** | **INCOMPLETE** (STR-001) — documented inventory claims 3 plugins; repo ships 2 |

Plugin loader verified: malformed JSON skipped; TTL cache 10s; discovery is async and non-blocking.

## Layer C — Extended Research Strategies (src/lib/strategies_extended.ts)

All 10 exist with `enabled: false` **by default** (correct — mandate "do not automatically enable all 27"). Each returns signal/confidence/metrics with explicit warm-up guards and supported-regime lists. Mathematical spot-verification: MACD (EMA-diff + signal cross), Ichimoku (9/26/52 midpoints — note: unshifted Senkou spans, disclosed simplification), Keltner (EMA±mult·ATR), Choppiness (100·log10(ΣTR/(HH-LL))/log10(n)), OBV (signed cumulative volume), PSAR (0.02/0.2 ratchet), Fibonacci (swing-high/low retracements 0.382/0.618), Volume Profile (POC/value-area histogram), Donchian-50 trend, MTF trend (5× downsample + EMA-20 alignment).

| # | Strategy | Status |
|---|----------|--------|
| 12 | MACD Momentum (12/26/9) | **IMPLEMENTED** (DISABLED by default) |
| 13 | Ichimoku Cloud (9/26/52) | **IMPLEMENTED** (DISABLED; Senkou not projected forward — disclosed) |
| 14 | Keltner Channel (20/1.5) | **IMPLEMENTED** (DISABLED) |
| 15 | Choppiness Index (14) | **IMPLEMENTED** (DISABLED) |
| 16 | OBV Volume Confirmation (20) | **IMPLEMENTED** (DISABLED) |
| 17 | Parabolic SAR (0.02/0.20) | **IMPLEMENTED** (DISABLED) |
| 18 | Fibonacci Retracement (0.382/0.618) | **IMPLEMENTED** (DISABLED) |
| 19 | Volume Profile (60/20) | **IMPLEMENTED** (DISABLED) |
| 20 | Donchian Trend Following (50) | **IMPLEMENTED** (DISABLED) |
| 21 | Multi-Timeframe Trend (5m/1m) | **IMPLEMENTED** (DISABLED) |

None of 12–21 feed the live quorum (registry exported for research use; not registered as voters). Cross-checked: no duplicate voting path, no engine wiring (matches "research extensions" framing).

## Layer D — Python Strategy Skills (strategies/*.py)

| # | Strategy | Class | Status |
|---|----------|-------|--------|
| 22 | VWAP Reversion | `VWAPStrategy` | **EXECUTABLE** (Python stack) |
| 23 | EMA Crossover | `EMACrossoverStrategy` | **EXECUTABLE** |
| 24 | SuperTrend | `SuperTrendStrategy` | **EXECUTABLE** |
| 25 | Momentum ROC | `MomentumStrategy` | **EXECUTABLE** |
| 26 | Donchian Breakout | `BreakoutStrategy` | **EXECUTABLE** |
| 27 | Mean Reversion | `MeanReversionStrategy` | **EXECUTABLE** |

All inherit `BaseStrategy` (abstract contract, `StrategySignal` enum) and are consumed by `strategies/decision_engine.py` (consensus = ≥2 concordant skills — QUORUM-001 divergence from the TS 75% quorum). Python skills are exercised by `tests/test_phase*` indirectly via decision-engine tests; not integrated with the TS engine at all.

---

## Inventory Reconciliation
- Documented inventory: 27. **Discovered: 27 concepts / 26 executable implementations** (#11 missing its JSON instance).
- Actually executable in the production TS decision path: **5 voters + GBM gate** (+1 external vote, +2 informational plugins).
- Tested in this audit (executed code paths): Layer A all (harness + suite), plugins 9–10 (suite plugin tests), Layer C all 10 (suite section 3–4 functions), Layer D exercised by 362 pytest tests.
- **BACKTEST-VALIDATED count: 0.** No strategy may claim validated performance: the only executable backtests ran on SAMPLE/synthetic fixtures (3 stop-out trades; see NET_PROFITABILITY), which is illustrative, not validation.
- Duplicates found: SuperTrend/EMA/Donchian/MeanReversion concepts implemented twice (TS + Python) with **different** parameters and consensus wiring (ARCH-001). Parameter inconsistencies: none within TS (defaults documented in code match registry names: 9/21, 10/3, 5/13, 20, 14 etc.).

## Architecture Corrections (required, not performed — Category C)
1. Wire or delete the choppy-regime mean-reversion voters (WAVE-001): decide whether chop pauses all trading (current behavior) or enables #6/#7 with the wave gate relaxed.
2. Add the missing Declarative RSI plugin JSON or drop it from the documented inventory (STR-001).
3. Decide plugin voting rights (currently informational despite "5th voter" webhook wording — the webhook external vote, not plugins, is the 5th voter).
4. Reconcile Python `decision_engine` with the TS quorum or clearly scope the Python stack as a separate research prototype.
