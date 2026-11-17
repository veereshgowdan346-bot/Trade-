# OMNITRADEPRO_05 — MARKET INTELLIGENCE AND REGIME ENGINE AUDIT

**Module:** `src/lib/intelligence.ts` (80 LOC) + Wave Gate in `src/lib/strategies.ts` + freshness gates in `src/lib/market.ts`/`angelWs.ts`.  
**Verdict: PARTIALLY PASSED** — core regime math verified; two behavioral contradictions documented (WAVE-001/002); forming-candle repainting (RT-001) remains open.

## 1. Regime Classification — Verified Flow
Inputs: 14-period ADX/±DI, ATR14 ratio (vs trailing 50-bar mean), Bollinger 20/2 width ratio (vs trailing 50-bar mean). Thresholds as implemented (recorded as *configuration requiring verification*, not claimed optimal):

| Condition (in order) | Regime |
|---------------------|--------|
| atrRatio ≥ 1.5 **or** (bbWidthRatio ≥ 1.6 **and** atrRatio ≥ 1.2) | VOLATILITY_EXPANSION |
| adx ≥ 25 | TRENDING_BULL/BEAR by ±DI comparison |
| adx ≥ 20 **and** |+DI − −DI| ≥ 10 | TRENDING_BULL/BEAR by ±DI |
| else | CHOPPY_RANGING |

Gate flags: `trendFollowingAllowed = regime ≠ CHOPPY_RANGING`; `meanReversionActive = regime === CHOPPY_RANGING` (internal consistency ✓).

## 2. Verification Performed
- **Boundary values:** adx exactly 20/25, |DI diff| exactly 10, ratios exactly 1.2/1.5/1.6 — evaluated in-order (documented precedence: volatility expansion outranks trend — a strong trend with expansion is labeled VOLATILITY_EXPANSION; trend voters remain enabled there since suppression keys only on CHOPPY_RANGING ✓ consistent).
- **Rapidly changing conditions:** 400-bar seeded walk produced a regime mix (CHOPPY 626/715 slices, BULL 55, BEAR 31, VOL_EXP 3 on the multiday fixture) — transitions occur without state leakage (classifier is stateless per call ✓ no sticky state to corrupt).
- **Contradictory classifications:** impossible by construction (single in-order branch chain). Legacy/freshness inputs (atrNow NaN → `round()` maps non-finite to 0) — acceptable.
- **Look-ahead check:** classifier consumes only the candles handed to it. Backtest path (`candles.slice(0, i)`) is provably causal (closed bars only) ✓ **no future candles used to classify the current regime** in backtests. **Live path includes the forming minute bar** → same-bar readings can change intra-bar (RT-001): not future data, but repainting vs the validated historical behavior.
- **Self-inclusion (WAVE-002):** ATR-ratio and BB-width-ratio denominators include the current observation (trailing-50 window includes now), shrinking ratios toward 1; boundary cases (1.15/1.20/1.5/1.6) may trip one call later than a strict ex-current computation. LOW severity; disclosed.
- **30-bar floor:** inputs <30 bars return a safe CHOPPY_RANGING/zero reading with `trendFollowingAllowed=false` ✓ fail-closed.

## 3. Wave Gate (Dynamic Volatility/Momentum Gate)
Implemented in `evaluateConsensus` (thresholds: ADX ≥ 20 **or** BB-width ratio ≥ 1.20 **or** ATR ratio ≥ 1.15; consolidation ⇒ paused). Verified in executed runs: on the multiday fixture, **454/715 slices were wave-paused**, matching the "sideways accumulation" intent; qualifying clusters occurred only under TRENDING_BULL with wave active.

Findings:
- **WAVE-001 (MEDIUM, OPEN):** CHOPPY_RANGING *always* forces `waveActive=false`, so the regime's promoted mean-reversion voters (BB/RSI — "active in choppy regimes") can never produce a qualifying trade. Either the gate or the active-set design is wrong; needs a Category C product decision.
- Gate thresholds (20 / 1.20 / 1.15) are hard-coded constants inside `evaluateConsensus`, not in `RiskConfig` — recorded as configuration; not tuned (mandate).

## 4. Data Freshness
- `isLiveTickReady` → `hasFreshLiveTick(symbol)` (WS tick freshness window in `angelWs`).
- `placeOrder` gate 0b rejects orders without a genuine live tick (`NO_LIVE_FEED`), with crash-protection lock on WS drop (0d) — verified fail-closed.
- `snapshot()` labels feed source (`ANGEL_WS_V2`/`ANGEL_HIST`/`DISCONNECTED`) consistently; `marketFeedMode` reconciles with WS status.
- Bracket evaluation refuses to act on missing/stale prices (`evaluatePositionBracket` returns false on null LTP; `checkBrackets` crash-protection refuses blind SL firing) ✓.

## 5. Recommendations
1. Resolve WAVE-001 (choose: pause-all-in-chop **or** enable mean-reversion with relaxed gate).
2. Move wave-gate thresholds into `RiskConfig` (configurability without semantic change).
3. RT-001: evaluate regime/consensus on closed candles only in live mode to match backtest semantics.
4. WAVE-002: exclude the current bar from ratio denominators (cosmetic).
