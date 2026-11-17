# OMNITRADEPRO_06 — QUORUM CONSENSUS VERIFICATION

**Module:** `evaluateConsensus` (src/lib/strategies.ts) + gates in `placeOrder`/`scanAndTrade` (engine.ts) + recovery state.  
**Verdict: PARTIALLY PASSED** — mechanisms verified against every boundary class; two semantic findings (QUORUM-002 neutral dilution, QUORUM-003 stale comment) and one parallel-implementation divergence (QUORUM-001).

## 1. Documented thresholds vs implementation (verification, not endorsement)

| Parameter | Documented | Implemented | Location | Verified |
|-----------|-----------|-------------|----------|----------|
| Standard quorum | 75% | `cfg.quorumPct` floor-clamped to ≥75 in `normaliseRisk` | risk.ts | ✅ matches |
| GBM probability | 65% | `cfg.gbmMin` floor-clamped ≥65 | risk.ts | ✅ matches |
| Recovery quorum | 90% | `ultraQuorumMin` default 90, clamp [75,100] | risk.ts + engine 4c | ✅ matches |
| Recovery GBM | 85% | `ultraGbmMin` default 85, clamp [50,100] | risk.ts + engine 4c | ✅ matches |

Note: `normaliseRisk` silently *raises* user-supplied values below the floors (cannot weaken quorum/GBM via API) ✓ safety-consistent. Raising them is allowed (e.g. 80/70) — recorded.

## 2. Voting mechanics — boundary verification (executed where callable)

| Concern | Behavior | Verified |
|---------|----------|----------|
| Active voter count | 5 built-in voters both regime sets (trend set: SMC/VWAP/EMA/ST/ORB; chop set: SMC/VWAP/ORB/BB/RSI) +1 external vote if provided | ✅ code + harness |
| Neutral voters | vote 0 **stays in denominator** → 3 BUY + 2 neutral = 60% fails 75% (QUORUM-002) | ✅ pinned semantics |
| Disabled voters | core voters have no enabled flag; suppression (chop) **removes** trend voters from `active` entirely | ✅ |
| Suppressed voters | forced vote 0 and moved to `suppressed[]`, excluded from counts | ✅ cannot inflate confidence |
| Failed voters | GA-001: no try/catch per voter — a throw aborts consensus (order fails safe as error/reject) | ✅ fail-safe, ⚠️ not fail-granular |
| Missing voters | insufficient candles (<30) → early return `qualifies:false` with fixed 5-voter label | ✅ fail-closed |
| Duplicate voters | `active` built from fixed literals; `externalVote` adds ≤1; plugins never counted | ✅ no double-vote path found |
| Correlated concentration | SMC/ORB/EMA/ST all trend-correlated; no decorrelation weighting — concentration risk documented (e.g. 4/5 trend voices agreeing is not 4 independent confirmations) | ⚠️ acknowledged limitation |
| BUY/SELL conflict | `direction = buy>sell ? BUY : sell>buy ? SELL : NONE`; ties → NONE ✓; quorum % uses `max(buy,sell)` | ✅ |
| Conflict quorum math | 3 BUY / 2 SELL → 60% < 75 fails; 4/1 → 80% passes if GBM+wave OK; 5/0 → 100% | ✅ boundary-checked |
| Minimum data | 30 candles + live tick required up-stack | ✅ |
| Denominator/rounding | `quorumPct = Math.round(agree/voters × 100)` — rounding to integer percent can lift 74.6→75 | ⚠️ edge noted (favorable rounding ≤0.5pp) |
| Wave Gate interaction | `qualifies` requires `waveActive`; engine 4b re-checks | ✅ double-gated |
| GBM direction | `forDirection = BUY?up : SELL?down : max(up,down)`; gate `forDirection ≥ gbmMin` | ✅ |
| GBM confidence | feeds sizing via `confidenceMultiplier(p)` ∈ [0.25,1] — cannot exceed 1 (RISK-001 clamp) | ✅ |
| Recovery interaction | engine 4c: recovery active ⇒ require quorum ≥ ultraQuorumMin AND GBM ≥ ultraGbmMin (defaults 90/85) before entry; recovery capital caps sizing (`remainingCapital`) | ✅ code-verified |
| Recovery triggers | `checkCircuit`: sessionPnL ≤ −drawdownFloor ⇒ recovery ON; recover > −floor/2 ⇒ OFF; hard stop at max(3×floor, 90% capital) ⇒ circuit trips + square-off | ✅ |
| Plugins/external | JSON plugins informational only; webhook external vote counts once (5th voter wording) | ✅ |

## 3. Evidence produced in executed runs
- Multiday fixture slice scan: 715 slices → 47 qualifying consensus states (quorum 80–100, GBM 99.6–100 in TRENDING_BULL), 24 quorum-fails, 1 GBM-fail, 454 wave-pauses, 189 no-direction — each gate demonstrably discriminates.
- `scanAndTrade` path re-validates consensus inside `placeOrder` (second evaluation) — a stale `qualifies` cannot bypass fresh gates ✓.

## 4. Findings
- **QUORUM-001 (MEDIUM, OPEN):** Python `decision_engine` consensus (≥2 concordant skills) is a completely different mechanism from the TS quorum — two "consensus engines" coexist (ARCH-001).
- **QUORUM-002 (LOW, OPEN):** neutral-dilution semantics differ from "share of active directional voters" reading; documented, not changed (Category C semantics).
- **QUORUM-003 (LOW, OPEN):** stale comment ("4 active quorum voters").
- Rounding edge: `Math.round` can promote 74.6% to 75% (max +0.5pp favorability). Recommend floor() for strictness (would *tighten* safety → safe direction, but still a quorum-semantics change; left as recommendation).

## 5. Assurance statement
Unavailable strategies (suppressed, disabled, missing-data, plugin, failed) **cannot accidentally increase quorum confidence** — verified structurally and by executed boundary scans. Quorum cannot be lowered below 75/65 (or 90/85 in recovery) through any API path (`normaliseRisk` floors).
