# OMNITRADEPRO REMAINING ISSUES

Open items after this audit. Fixed items are listed in `OMNITRADEPRO_MASTER_AUDIT_REPORT.md` §Change Log (13 Category-A fixes). Severity = impact if left unresolved.

## OPEN — Critical / High
| ID | Severity | Summary | Needs |
|----|----------|---------|-------|
| TAX-003 | HIGH (blocks Gate 7) | All statutory rates UNVERIFIED — no official sources in repo/reachable | Official tariff documents |
| TAX-001 | HIGH | Delivery/CNC STT mis-costed (intraday sell-only); DP charges missing; CDS falls into equity rates | Authorized delivery rate table |
| TAX-002 | HIGH | `calculateNetPnL` fallback fabricates component breakdown (₹25/₹55) | Category C decision |
| TAX-006 | HIGH | Python cost engine diverges (no STT/exchange/stamp; wrong SEBI basis) | Architecture decision + parity tests |
| ARCH-001 | HIGH | Dual trading stacks with unreconciled financial logic | Architecture decision |
| MICRO-001 | HIGH | ≤₹2,000 accounts trade with −₹50 expected-net hurdle (5% of ₹1k) | Category C decision |

## OPEN — Medium
| ID | Summary | Needs |
|----|---------|-------|
| TAX-004 | Angel/Groww per-leg brokerage formula dead (flat ₹40 RT floor always binds) | Category C |
| TAX-005 | Hurdle constants conflict (₹55 vs ₹70) across modules | Consolidation |
| QUORUM-001 | Python 2-skill consensus vs TS 75%/65% quorum | Architecture decision |
| QUORUM-002 | Neutral votes dilute quorum denominator (semantics choice) | Category C semantics |
| WAVE-001 | Choppy-regime mean-reversion voters can never trade (wave gate always pauses chop) | Product decision |
| RT-001 | Live analysis includes forming candle (repainting; live/backtest divergence) | Closed-candle policy (Category C) |
| BT-003 | Backtest lacks per-day EOD square-off, holiday gating, in-engine walk-forward | Implementation |
| BT-004 | Sharpe/Sortino annualization invalid (per-trade × √252) | Metric redesign |
| SEC-001 | No API auth/CSRF/rate-limit/replay/idempotency; webhook secret optional | Implementation |
| ARCH-002 | PySide6 hard dependency in core engine | Decoupling |
| DATA-001 | No GENUINE_HISTORICAL data in repo — all performance claims unverifiable | Data acquisition |

## OPEN — Low / Informational
| ID | Summary |
|----|---------|
| MATH-003 | RSI/ATR warm-up seeding one bar early vs canonical Wilder (transient) |
| MATH-004 | ADX zero-TR bars folded to 0 (transient bias) |
| MATH-005 | Flat-series RSI = 100 instead of neutral |
| WAVE-002 | Regime ratios include current observation in their own trailing mean |
| QUORUM-003 | Stale "4 active voters" comment |
| GA-001 | No per-voter try/catch in consensus (a throw aborts all) |
| BT-005/006 | Same-bar SL-first convention; PF/RF sentinel 999; zero-net counted as loss |
| STR-001 | Declarative RSI plugin JSON missing from inventory |
| PY-001 | `test_git_branches_and_tags_hygiene` fails: asserts `['master']`-only repo vs mandated session branch `arena/16f5d371-trade` — test preserved; owner should whitelist authorized work branches |
| SEC-002 | 12 secret-scan findings all inert — keep monitored |
| ENGINE-001 | Cosmetic comment inaccuracies ("Zero Brokerage" wording) |
| Harness | JS test harness exits 0 even on failures (reporting weakness) |
| UI | No browser E2E; icon aria-labels incomplete; capital-matrix guidance missing in UI |

## Note on scope
Items requiring external evidence (TAX-003) cannot be closed in an offline environment — they are documented with complete registers so verification is a data-entry exercise once sources arrive. No issue above was hidden, downgraded for convenience, or "fixed" by weakening tests.
