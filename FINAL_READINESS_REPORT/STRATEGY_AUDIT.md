# Strategy Audit

## Inspected
Documentation (`OMNITRADEPRO_MASTER_STRATEGY_ARCHITECTURE_MANUAL.md` and predecessors),
JSON configuration (`strategies/*.json`), TypeScript voters (`src/lib/strategies.ts`,
`src/lib/strategies_extended.ts`), Python classes (`strategies/*.py`) and the consensus
pipeline. Four documented layers were compared against code.

## Complete inventory (documented = configured = implemented)

### Layer 1 — TypeScript core quorum voters (7 signals + 1 gate)
| ID | Family | Code | Status |
|---|---|---|---|
| `smc_liquidity_grab` | STRUCTURE | `strategies.ts` | **PASS** |
| `institutional_vwap` | STRUCTURE | `strategies.ts` | **PASS** |
| `dual_ema_9_21` | TREND | `strategies.ts` | **PASS** |
| `supertrend_10_3` | TREND | `strategies.ts` | **PASS** |
| `orb_vwap_momentum` | STRUCTURE | `strategies.ts` | **PASS** |
| `bb_mean_reversion` | MEAN_REVERSION | `strategies.ts` | **PASS** |
| `rsi_mean_reversion` | MEAN_REVERSION | `strategies.ts` | **PASS** |
| `gbm_gate` (gate, not a voter) | — | `strategies.ts` | **PASS** |

Vote semantics verified: each voter returns `1 / 0 / -1` plus a suppressed flag; votes are
counted, direction requires strict majority, quorum = `max(buy,sell)/voters*100` must reach
`cfg.quorumPct` (default 75), probability gate must reach `cfg.gbmMin` (default 65), and the
wave/structure condition must hold. Ties produce `NONE` — no trade.

### Layer 2 — Declarative JSON plugins (3 configured, 3 implemented)
`rsi_reversion.json` → `rsi_reversion_14`, `breakout_20.json` → `donchian_breakout_20`,
`fast_ema_5_13.json` → `fast_ema_5_13`. All three load, validate, run and vote through
`runPlugin`. **PASS**

### Layer 3 — Research strategies (10 implemented, 10 verified, 0 in quorum)
`macd_momentum`, `ichimoku_cloud`, `keltner_channel`, `choppiness_index`,
`obv_volume_confirmation`, `parabolic_sar`, `fibonacci_retracement`, `volume_profile`,
`donchian_trend_50`, `mtf_trend_confirmation` — all in `strategies_extended.ts`, all default
`enabled: false`, none wired into consensus. Exercised by the test harness. **PASS (research
scope)** — explicitly *not* part of trade decisions.

### Layer 4 — Python native strategies (6 + decision engine with 6 skills)
`BreakoutStrategy`, `EMACrossoverStrategy`, `MeanReversionStrategy`, `MomentumStrategy`,
`SuperTrendStrategy`, `VWAPStrategy`; skills `VWAPSkill`, `EMACrossoverSkill`,
`SuperTrendSkill`, `MomentumSkill`, `BreakoutSkill`, `MeanReversionSkill` behind
`SkillRegistry` + `CentralDecisionEngine`. **PASS**

## Tests executed
* Strategy discovery and configuration validation (plugin loader, JSON schema checks).
* Entry/exit and BUY/SELL/HOLD semantics per voter.
* Duplicate-signal and conflicting-signal suppression (`CHOPPY_RANGING` suppresses the two
  trend voters — verified in code and by probe).
* Regime compatibility, risk integration, position sizing, stop-loss behaviour.
* Reproducibility: identical inputs produce identical votes across repeated runs
  (`P6_concurrent_determinism`).
* Missing-implementation check: every documented strategy has code; nothing was invented.

## Found / corrected
No strategy defect requiring a code change. No signal was weakened and no threshold was
altered to generate more trades. Two structural notes recorded: (a) Layer-3 research
strategies are intentionally outside the quorum; (b) the Python strategy layer is not
reachable from the UI (see `ARCHITECTURE_AUDIT.md`).

## Remaining risks
Signal quality is unproven: net expectancy on every audited dataset is negative after costs
(see `PROFITABILITY_RESEARCH.md`). Correctness of implementation ≠ profitability.

## Verification status
**PASS** for implementation, discovery, semantics and reproducibility.
**UNVERIFIED** for profitability (no adequate OOS evidence).
