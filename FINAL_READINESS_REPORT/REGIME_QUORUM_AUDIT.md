# Market Regime, Consensus & Quorum Audit

## Inspected
`src/lib/intelligence.ts` (`classifyRegime`, GBM probability), `src/lib/strategies.ts`
(`evaluateConsensus`, voter aggregation, plugin execution), `strategies/decision_engine.py`
(Python twin: `MarketRegime`, `SkillRegistry`, `CentralDecisionEngine`, `TradeProposal`).

## Pipeline verified
1. **Strategy votes** — each voter emits `1 / 0 / −1` plus strength/confidence detail.
2. **Weighted/binary aggregation** — `buy` and `sell` counts over *active* voters only.
3. **Quorum** — `quorumPct = round(max(buy,sell)/voters × 100)`; must be ≥ `cfg.quorumPct`
   (default **75**).
4. **Minimum participation** — suppressed voters are excluded from the denominator, so
   suppression cannot be exploited to lower the bar.
5. **Regime detection** — trending / sideways / volatile / abnormal / insufficient-data.
6. **Volatility filters** — ATR-normalised; `CHOPPY_RANGING` suppresses the two trend voters.
7. **Confidence** — `gbmProbability` directional probability must be ≥ `cfg.gbmMin` (65).
8. **Conflicting signals** — a tie yields `direction = NONE` → no trade.
9. **Fail-closed** — thin data and conflicts always produce `qualifies: false`.

## Scenario results (this phase, `final_readiness_probes_output.json`)
| Scenario | Observed | Verdict |
|---|---|---|
| Trending | regime classified as a trend state, distinct from sideways | PASS |
| Sideways | distinct non-trend classification | PASS |
| Volatile | classified without throw, finite ATR% | PASS |
| Abnormal (isolated price spike) | handled, no exception, finite output | PASS |
| Insufficient data (6 bars) | `qualifies: false` — never trades | PASS |
| Conflicting signals (alternating) | `qualifies: false` — never trades | PASS |
| No exception / NaN anywhere | 0 throws, all regime outputs finite | PASS |

## Threshold integrity
`quorumPct` (75) and `gbmMin` (65) were **not modified**. Suppression logic was not weakened.
No threshold was tuned to produce more trades — explicitly prohibited and not done.

## TypeScript ↔ Python consistency
Both stacks implement the same decision structure (votes → quorum → regime gate → decision).
They are not byte-identical implementations, and the Python engine is not reachable from the
UI (see `ARCHITECTURE_AUDIT.md`). Where the same cost/risk arithmetic exists in both, parity
is proven by the 17-fixture parity suite. Regime *classifier* outputs were not compared
cross-language — that comparison is **UNVERIFIED** (no shared fixture in the suite).

## Remaining risks
Regime classification quality is not validated against labelled historical regimes; it is
internally consistent and fail-closed, which is the property that matters for safety.

## Verification status
**PASS** for pipeline behaviour and fail-closed safety. Cross-language regime equivalence:
**UNVERIFIED**.
