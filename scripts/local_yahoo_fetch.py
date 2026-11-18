#!/usr/bin/env python3
"""Local Windows/Linux/macOS fetcher; no trading or strategy replay.
Install: py -m pip install yfinance
Run:     py local_yahoo_fetch.py
Creates market.csv and manifest.json in the current directory. Never overwrites.
Yahoo data and exchange identity are not independently verified.
"""
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

SYMBOL = "RELIANCE.NS"   # e.g. ITC.NS
INTERVAL = "5m"          # 5m or 15m; both use a 60-calendar-day request
PERIOD = "60d"


def main():
    if INTERVAL not in ("5m", "15m") or not SYMBOL.endswith(".NS"):
        raise ValueError("Use an NSE .NS symbol and an interval of 5m or 15m")
    minutes = int(INTERVAL[:-1])
    csv_path, manifest_path = Path("market.csv"), Path("manifest.json")
    if csv_path.exists() or manifest_path.exists():
        raise FileExistsError("market.csv or manifest.json already exists; move them before rerunning")

    frame = yf.download(SYMBOL, period=PERIOD, interval=INTERVAL,
                        auto_adjust=False, prepost=False, progress=False,
                        threads=False, multi_level_index=False)
    if frame is None or frame.empty:
        raise RuntimeError("Yahoo returned no data. Retry later or try another .NS symbol.")
    if isinstance(frame.columns, pd.MultiIndex):
        raise RuntimeError("Unexpected multi-level columns; update yfinance and retry.")
    if not isinstance(frame.index, pd.DatetimeIndex) or frame.index.tz is None:
        raise RuntimeError("Expected timezone-aware intraday timestamps; refusing to guess timezone.")
    required = ["Open", "High", "Low", "Close", "Volume"]
    if any(col not in frame.columns for col in required):
        raise RuntimeError("Missing required OHLCV columns in Yahoo response.")

    frame = frame.sort_index()
    if frame.index.has_duplicates:
        raise RuntimeError("Duplicate timestamps in provider response; refusing to deduplicate.")
    rows, sessions = [], {}
    skipped = 0
    now = datetime.now(timezone.utc).timestamp()
    for timestamp, values in frame[required].iterrows():
        local = timestamp.tz_convert("Asia/Kolkata")
        minute = local.hour * 60 + local.minute
        epoch = int(timestamp.timestamp())
        if (timestamp.second != 0 or timestamp.microsecond != 0 or timestamp.nanosecond != 0
                or minute < 555 or minute > 930 - minutes or (minute - 555) % minutes
                or epoch + minutes * 60 > now):
            skipped += 1
            continue
        nums = [float(values[col]) for col in required]
        o, h, l, c, v = nums
        if (not all(math.isfinite(x) for x in nums) or min(o, h, l, c) <= 0 or v < 0
                or h < max(o, l, c) or l > min(o, h, c)):
            skipped += 1
            continue
        # The repository parser accepts decimal notation, not exponent notation.
        fields = [format(x, ".10f").rstrip("0").rstrip(".") or "0" for x in nums]
        rows.append([str(epoch), *fields])
        date = local.strftime("%Y-%m-%d")
        sessions.setdefault(date, set()).add(minute)

    if len(sessions) < 30:
        raise RuntimeError(f"Only {len(sessions)} sessions returned; the replay requires at least 30 for {INTERVAL}.")
    incomplete = {d: 375 // minutes - len(m) for d, m in sessions.items() if len(m) != 375 // minutes}
    # Exclusive creation prevents overwriting existing files.
    with csv_path.open("x", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        writer.writerows(rows)
    digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    manifest = {
        "market": "NSE",
        "instrument": SYMBOL,
        "dataKind": "REAL_HISTORICAL_INTRADAY",
        "intervalMinutes": minutes,
        "provider": "Yahoo Finance via yfinance",
        "sourceReference": f"Yahoo Finance chart: {SYMBOL}, period={PERIOD}, interval={INTERVAL}",
        "attestedReal": True,
        "attestationMeaning": "Provider-supplied historical data; not independently authenticated",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "csvSha256": digest,
        "skippedProviderRows": skipped,
    }
    try:
        with manifest_path.open("x", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
    except Exception:
        print("CSV was created but manifest writing failed. Inspect files before retrying.")
        raise
    print(f"Wrote {csv_path} and {manifest_path}: {len(rows)} bars, {len(sessions)} sessions.")
    print(f"CSV SHA-256: {digest}")
    print(f"Skipped provider rows: {skipped}. Incomplete sessions (date: missing bars): {incomplete}")
    print("Upload BOTH files. Provider origin and historical accuracy are not independently verified.")


if __name__ == "__main__":
    main()
