# Architecture Audit

## Inspected
Two cooperating stacks inside one repository:

1. **Operational application (TypeScript / Next.js 15 App Router)** — the shipped runtime:
   `src/app/api/**` (19 route handlers), `src/components/pages/**` (dashboard UI),
   `src/lib/*` (risk, tax, strategies, intelligence, indicators, backtest engine,
   apiGuard, brokers, engine), Drizzle ORM over SQLite (`drizzle/`), token/vault auth.
2. **Quantitative Python library** — `core/` (engine, broker adapter, EOD square-off),
   `simulation/paper_trading.py`, `risk/` (rate spec, statutory cost, cost guardrail),
   `strategies/` (base + 6 strategy classes + decision engine with 6 skills), `tests/`.

## Findings
* **No TypeScript→Python bridge exists** (`grep` for `spawn`/`execSync`/`child_process` in
  `src/` returns nothing). The Python stack is a tested library and audit/research target,
  not part of the request path of the running app. This is a **documentation-accuracy issue**
  in older reports that imply a single unified runtime — recorded here so no reader assumes
  the Python engine executes the UI's orders.
* Both stacks implement the same cost model independently and are pinned together by a
  cross-language parity suite (`tests/test_cost_parity.py`, `scripts/cost_parity_ts.js`,
  17 fixtures) — parity verified in this phase.
* Configuration is centralised: `config/statutory_rates.json` is the single authoritative
  rate spec; TypeScript loads it at runtime (`src/lib/rateSpec.ts`) and Python mirrors it
  (`risk/rate_spec.py`). Neither stack statically imports the JSON in TS (avoided because
  `resolveJsonModule` flattens the test build).
* Fail-closed design: unsupported segments throw `UnsupportedSegmentError` in both stacks and
  are refused rather than priced with a guess.
* Live execution is structurally impossible in both stacks: `LIVE_BROKER_EXECUTION_DISABLED`
  plus a `normaliseRisk` guard on the TS side; hard-coded `is_paper_trading = True` and an
  explicit interlock in `core/engine.py` on the Python side.

## Corrected
Two lifecycle/state-sync defects at the boundary between the engine and its paper engine
(PAUSE-001, PAPER-002) — both are pure wiring/state defects, fixed without touching the
financial model or any threshold.

## Not changed (deliberate)
No architectural rewrite, no new abstraction layer, no framework change. The quadratic
backtest path (PERF-001) was left intact because incrementally caching recursive indicators
would risk silently changing signal values — an unauthorised modification of the financial
model.

## Remaining risks
* Python stack is unreachable from the UI; anyone expecting the UI to drive the Python engine
  would be surprised. Documented, not changed (architecture decision requires authorisation).
* Backtest scaling ceiling restricts realistic multi-year 1-minute studies.

## Verification status
**PASS** (architecture internally coherent and fully documented, including its two-stack
split). Architectural change proposals: **BLOCKED** pending authorisation.
