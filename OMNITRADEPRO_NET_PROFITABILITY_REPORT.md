# OMNITRADEPRO NET PROFITABILITY REPORT (CONSOLIDATED)

Detailed metrics: `OMNITRADEPRO_10_NET_PERFORMANCE_AUDIT.md`.

## Verdict: NOT VERIFIED (Gate 10)

**No claim of profitability is made. No claim of future performance is made.**

## The complete honest record
- The only trades reproducible in this audit: **3 trades** on a synthetic SAMPLE fixture (₹5L capital): gross −₹128.37, statutory+slippage friction ₹474.59 (Shoonya) / ₹580.79 (Angel), **net −₹602.96 / −₹709.16**, win rate 0%, expectancy −₹200.99/trade, all exits −1R stops.
- Cost sensitivity demonstrated: zero-friction net = −₹128.37 → **79% of the loss was friction** at realistic costs.
- All metrics reported AFTER charges; gross is never presented as net anywhere (enforced by the charge model at every exit path).
- Sample size n=3 on synthetic data = **zero statistical significance**. Sharpe/Sortino outputs exist but are methodologically invalid (BT-004) and must not be cited.

## Status of prior claims
The repository's legacy reports (PHASE4–7.4 series) contain extensive performance figures. **None are reproducible:** the datasets backing them are not in the repository (all bundled fixtures are SAMPLE/SYNTHETIC provenance; the provenance system itself correctly refuses to label them GENUINE_HISTORICAL). Those figures are classified **UNVERIFIED CLAIMS** — neither endorsed nor refuted.

## What verification would require
1. GENUINE_HISTORICAL datasets ingested through the provenance-checked pipeline (SHA-256 manifests, quality scores).
2. Walk-forward train/val/OOS runs with the fixed cost model (post-TZ/ORD/TSL/BT fixes).
3. Regime-stratified samples with n large enough for confidence intervals; cost/execution sensitivity bands.
4. Re-audit of every reported metric under the corrected execution model (TSL-001 materially changes exits).
