# Frontend & UI Audit

## Inspected
`src/components/pages/` (`PagesA.tsx`, `PagesB.tsx`, `PagesC.tsx`, `TradeCalendarPage.tsx`),
shared `src/components/ui`, `src/components/ctx`, and the 19 API routes the UI calls.

## Control map — every control performs its documented function
| Control | Documented function | Verified behaviour | Result |
|---|---|---|---|
| Dashboard | live status + P&L from the API | reads `/api/state`, `/api/health`, `/api/trades`, no fabricated values | PASS |
| Capital input | simulation capital | validated, flows into sizing; no default that implies real funds | PASS |
| Strategy selector | enable/disable permitted strategies | writes config, invalid selections rejected server-side | PASS |
| Risk configuration | risk %, SL, hurdle | clamped by `normaliseRisk`; cannot set LIVE, cannot exceed caps | PASS |
| Backtest button | run backtest on selected data | calls the backtest path; shows charges and net, not gross | PASS |
| Algorithm Bot button | start the automated paper loop | starts the paper workflow only | PASS |
| Start Paper Trading | begin simulation | creates a paper session; **never** a broker order | PASS |
| Stop | halt the bot | stops the loop and rejects new orders | PASS |
| Pause | suspend new entries | now genuinely blocks new orders (PAUSE-001 fixed) | PASS |
| Resume | continue after pause | restores RUNNING state | PASS |
| Performance metrics | measured, not invented | derived from stored trades, labelled simulated | PASS |
| Trade history | actual paper fills | reads persisted orders/fills | PASS |
| Error messages | surface failures | toast/error surfaces with the API's machine code | PASS |
| Loading states | indicate in-flight work | explicit loading flags on data fetches | PASS |
| Responsive layout | usable on small screens | Tailwind responsive classes; no fixed-width overflow | PASS |
| API integration | relative URLs, no localhost | UI calls relative `/api/*`; no hard-coded host | PASS |

## Honesty checks (no misleading signals)
* No fake `LIVE` badge: live execution is disabled and the UI does not claim it.
* No fabricated trades or performance: every figure traces to the database.
* Net is always labelled as net; charges are displayed alongside P&L.
* Simulation is visibly labelled as paper/simulated.

## Defect found and fixed — UI-01
`npm run lint` **failed** (1 error, 1 warning):
`TradeCalendarPage.tsx` called `setState` synchronously inside a mount effect
(`react-hooks/set-state-in-effect`), i.e. cascading renders on mount. A first attempt (ref
written during render) introduced `react-hooks/refs` — also fixed. Final shape:
* fetch logic moved to a stable `useCallback` that sets state only after `await`;
* the mount fetch is deferred to a task so state updates land outside the effect's
  synchronous pass;
* the toast ref is synchronized in its own effect;
* the manual **Refresh** button keeps its explicit `setLoading(true)` entry point.

Behaviour is unchanged (one mount fetch, refresh still works); `eslint .` now reports
**0 errors, 0 warnings**. No UI assertion or test was weakened.

## Remaining risks
UI-level controls are exercised through the TypeScript engine and SQLite persistence; the
Python engine is not reachable from the UI (see `ARCHITECTURE_AUDIT.md`). No automated
browser/E2E harness exists in the repository — UI verification is by code inspection plus
type/lint/build gates, so a rendered-DOM regression would not be caught automatically.

## Verification status
**PASS** — every control performs its documented function and no misleading indicator exists.
Browser-automation coverage: **UNVERIFIED** (no E2E harness in repo).
