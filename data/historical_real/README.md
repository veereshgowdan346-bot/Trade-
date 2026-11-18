# Offline real-data input (paper research only)

Place a single NSE **equity** one-, five-, or fifteen-minute OHLCV CSV at `data/historical_real/market.csv` and its JSON manifest at `data/historical_real/manifest.json`. Files in this directory other than this README are git-ignored. Do not upload credentials or private account information. This pipeline does not fetch data.

CSV format: UTF-8, exact header `timestamp,open,high,low,close,volume`. One record per declared interval, chronological ascending, no duplicates. Missing bars are reported, never filled; they can invalidate replay outcomes. Timestamp is the **start** of the minute, either Unix seconds/milliseconds or ISO 8601 with `Z` or `+05:30`; naive timestamps are rejected. Prices must be positive numeric rupees, volume nonnegative. Example format only (not a usable dataset):

```csv
timestamp,open,high,low,close,volume
2024-01-01T09:15:00+05:30,100.00,100.50,99.90,100.25,5000
2024-01-01T09:16:00+05:30,100.25,100.60,100.10,100.40,4200
```

Provide at least **30 sessions** for 5- or 15-minute bars or **5 sessions** for 1-minute bars. Regular sessions begin at 09:15 IST; timestamps must align to the interval. Incomplete sessions are flagged in the report and may reflect special sessions or data gaps. The parser does not validate trading holidays or market identity. Do not fill gaps with invented data. Raw TradingView/NSE exports may require conversion to this exact schema and correct bar-start timestamps. Verify adjustments, corporate actions, source license and symbol independently.

Calculate the hash locally with `sha256sum data/historical_real/market.csv`, then create the manifest below (replace all values in angle brackets, including the hash):

```json
{
  "market": "NSE",
  "instrument": "<actual NSE equity symbol>",
  "dataKind": "REAL_HISTORICAL_INTRADAY",
  "intervalMinutes": 5,
  "provider": "<data provider>",
  "sourceReference": "<local provenance reference, no credentials>",
  "attestedReal": true,
  "csvSha256": "<64 lowercase hexadecimal SHA-256 characters>"
}
```

After an explicit decision to run, compile and execute:

```sh
npm run test:prep
node scripts/run_real_blind_replay.js
```

The script writes `replay_report.json` here and refuses to overwrite an existing report. Rename or archive an old report yourself before a later run. It uses a fixed long-only MACD strategy and the locked research parameters in the report, with ₹3,000 capital; it is not a train/validation/OOS study. A same-day exit aborts the replay rather than applying delivery charges to an intraday trade. The strategy can therefore abort without a P&L report. Open positions are marked, not liquidated. There is no proof of authenticity or execution realism: prices, settlement, slippage, corporate actions and rate effective dates need independent verification. The user-provided cost scenario is not officially verified. Do not call the results real profit or a validated OOS estimate.

## Automated provider fetch

Where Yahoo Finance is reachable, `node scripts/fetch_and_replay.js RELIANCE.NS 5m` fetches 60 calendar days, validates, writes the CSV and manifest, compiles and runs the paper replay. Use `1m` for a 7-calendar-day request or `15m` for 60 days. Availability, accuracy and permitted use depend on the provider; no premium account or authentication is configured. If there are too few sessions, or a file already exists, it stops without starting a replay. The `attestedReal` flag on automatically generated manifests means only that the provider supplied the data, **not** that a user or independent auditor verified it. Missing bars, same-day-exit aborts and all other replay limitations still apply.
