"""
OmniTradePro Apex V2.0 — Phase 7.2
Offline Market Data Fixture Generator

Generates standardized offline fixtures:
1. synthetic_gbm_1m.json (SYNTHETIC): 375 bars of 1m GBM simulated data (2026-02-18)
2. sample_nifty50_1m.json (SAMPLE): 375 bars of representative NIFTY50 index candles (2026-02-18)
3. multiday_overnight_1m.json (SAMPLE): 750 bars across 2 trading days (2026-02-18 to 2026-02-19)
4. corrupted_anomalies_1m.json (TEST_CORRUPTED): Controlled anomalies (geometry, negatives, duplicates, gaps, breaches)
"""

import json
import math
import os
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def generate_fixtures():
    fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "data", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    # 1. Day 1: 2026-02-18 (Wednesday), 09:15 to 15:29 IST (375 bars)
    # Start: 2026-02-18 09:15:00 IST
    dt_day1_start = datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST)
    start_ts_ms = int(dt_day1_start.timestamp() * 1000)

    # Fixture 1: Synthetic GBM 1m (375 bars)
    synthetic_bars = []
    price = 22500.0
    for i in range(375):
        t = start_ts_ms + (i * 60 * 1000)
        # Deterministic pseudo-random drift and shock
        drift = 0.2 * math.sin(i / 15.0)
        shock = 2.5 * math.cos(i / 7.0)
        o = round(price, 2)
        c = round(price + drift + shock, 2)
        h = round(max(o, c) + abs(math.sin(i)) * 3.5 + 0.5, 2)
        l = round(min(o, c) - abs(math.cos(i)) * 3.5 - 0.5, 2)
        v = round(15000 + abs(math.sin(i)) * 5000, 0)
        synthetic_bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
        price = c

    synth_path = os.path.join(fixtures_dir, "synthetic_gbm_1m.json")
    with open(synth_path, "w", encoding="utf-8") as f:
        json.dump(synthetic_bars, f, indent=2)

    # Fixture 2: Sample NIFTY50 1m (375 bars)
    sample_bars = []
    base_nifty = 22450.0
    for i in range(375):
        t = start_ts_ms + (i * 60 * 1000)
        trend = (i / 375.0) * 45.0  # +45 pts intraday trend
        cycle = 12.0 * math.sin(i / 20.0)
        o = round(base_nifty + trend + cycle, 2)
        c = round(o + (math.cos(i / 10.0) * 3.0), 2)
        h = round(max(o, c) + abs(math.sin(i * 1.5)) * 4.0 + 0.25, 2)
        l = round(min(o, c) - abs(math.cos(i * 1.5)) * 4.0 - 0.25, 2)
        v = round(25000 + abs(math.sin(i)) * 10000, 0)
        sample_bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})

    sample_path = os.path.join(fixtures_dir, "sample_nifty50_1m.json")
    with open(sample_path, "w", encoding="utf-8") as f:
        json.dump(sample_bars, f, indent=2)

    # Fixture 3: Multi-day 1m with Overnight Gap (750 bars: 375 on Day 1 + 375 on Day 2)
    # Day 2: 2026-02-19 (Thursday) 09:15:00 IST
    dt_day2_start = datetime(2026, 2, 19, 9, 15, 0, tzinfo=IST)
    start_day2_ts_ms = int(dt_day2_start.timestamp() * 1000)

    multiday_bars = list(sample_bars) # Day 1
    day2_base = sample_bars[-1]["c"] + 35.0 # +35 pts overnight gap up
    for i in range(375):
        t = start_day2_ts_ms + (i * 60 * 1000)
        trend = -(i / 375.0) * 20.0
        cycle = 8.0 * math.sin(i / 18.0)
        o = round(day2_base + trend + cycle, 2)
        c = round(o - (math.sin(i / 12.0) * 2.5), 2)
        h = round(max(o, c) + abs(math.cos(i)) * 3.0 + 0.2, 2)
        l = round(min(o, c) - abs(math.sin(i)) * 3.0 - 0.2, 2)
        v = round(22000 + abs(math.cos(i)) * 8000, 0)
        multiday_bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})

    multiday_path = os.path.join(fixtures_dir, "multiday_overnight_1m.json")
    with open(multiday_path, "w", encoding="utf-8") as f:
        json.dump(multiday_bars, f, indent=2)

    # Fixture 4: Corrupted Anomalies Fixture (100 bars with injected defects)
    corrupted_bars = []
    for i in range(100):
        t = start_ts_ms + (i * 60 * 1000)
        o, c = 22000.0, 22010.0
        h, l = 22020.0, 21990.0
        v = 5000.0

        if i == 10:
            # Anomaly: Negative price
            o, h, l, c = -100.0, 22020.0, 21990.0, 22010.0
        elif i == 20:
            # Anomaly: Negative volume
            v = -500.0
        elif i == 30:
            # Anomaly: Invalid OHLC geometry (H < max(O,C))
            o, c = 22000.0, 22050.0
            h = 22020.0 # High is less than Close!
        elif i == 40:
            # Anomaly: Duplicate timestamp (same as bar 39)
            t = start_ts_ms + (39 * 60 * 1000)
        elif i == 50:
            # Anomaly: Temporal inversion / out of order
            t = start_ts_ms + (45 * 60 * 1000)
        elif i == 60:
            # Anomaly: Intrasession dropout (skips 5 minutes: from bar 59 to bar 65)
            t = start_ts_ms + (65 * 60 * 1000)
        elif i == 70:
            # Anomaly: Flash jump (> 10%)
            o = 25000.0 # ~13.6% jump from ~22010
            h = 25020.0
            l = 24990.0
            c = 25010.0
        elif i == 90:
            # Anomaly: Out-of-session hours (e.g. 08:30 IST)
            dt_pre = datetime(2026, 2, 18, 8, 30, 0, tzinfo=IST)
            t = int(dt_pre.timestamp() * 1000)

        corrupted_bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})

    corrupted_path = os.path.join(fixtures_dir, "corrupted_anomalies_1m.json")
    with open(corrupted_path, "w", encoding="utf-8") as f:
        json.dump(corrupted_bars, f, indent=2)

    print(f"Generated 4 fixtures in {fixtures_dir}:")
    print(f" - synthetic_gbm_1m.json: {len(synthetic_bars)} bars")
    print(f" - sample_nifty50_1m.json: {len(sample_bars)} bars")
    print(f" - multiday_overnight_1m.json: {len(multiday_bars)} bars")
    print(f" - corrupted_anomalies_1m.json: {len(corrupted_bars)} bars")

if __name__ == "__main__":
    generate_fixtures()
