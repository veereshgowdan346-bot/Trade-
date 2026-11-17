"""
OmniTradePro Apex V2.0 — Phase 7.4.2
Deterministic CSV Synthetic Fixture Generator

Generates offline benchmark CSV fixtures strictly classified as SYNTHETIC:
1. sample_nifty50_1m.csv (SYNTHETIC): Full regular equity day (375/375 bars, 100% coverage, 2026-02-18 09:15 to 15:29 IST)
2. multiday_overnight_1m.csv (SYNTHETIC): Full 2 consecutive regular equity days (750/750 bars, 100% coverage, 2026-02-18 & 2026-02-19)
3. corrupted_anomalies_1m.csv (SYNTHETIC): Partial session (100 bars) with deliberately injected synthetic defects
4. special_sessions_1m.csv (SYNTHETIC): Partial multi-session fixture (115 bars):
   - 45 bars of DR session (2026-03-05 09:15 to 09:59 IST, partial 12% slice of 375-bar full DR session per NSE/MSD/73126)
   - 70 bars of Muhurat session (2026-11-08 14:20 to 15:29 IST, full 100% continuous trading session per NSE/CMTR/76941)
"""

import json
import math
import os
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))


def generate_csv_fixtures():
    fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "data", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    # 1. Day 1: 2026-02-18 (Wednesday), 09:15 to 15:29 IST (375 bars)
    dt_day1_start = datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST)
    start_ts_ms = int(dt_day1_start.timestamp() * 1000)

    # 1. sample_nifty50_1m.csv
    sample_csv_path = os.path.join(fixtures_dir, "sample_nifty50_1m.csv")
    with open(sample_csv_path, "w", encoding="utf-8", newline="") as f:
        f.write("timestamp,open,high,low,close,volume\n")
        base_nifty = 22450.0
        for i in range(375):
            t_ms = start_ts_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            trend = (i / 375.0) * 45.0
            cycle = 12.0 * math.sin(i / 20.0)
            o = round(base_nifty + trend + cycle, 2)
            c = round(o + (math.cos(i / 10.0) * 3.0), 2)
            h = round(max(o, c) + abs(math.sin(i * 1.5)) * 4.0 + 0.25, 2)
            l = round(min(o, c) - abs(math.cos(i * 1.5)) * 4.0 - 0.25, 2)
            v = int(round(25000 + abs(math.sin(i)) * 10000, 0))
            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")

    # 2. multiday_overnight_1m.csv (Day 1 + Day 2 = 750 bars)
    dt_day2_start = datetime(2026, 2, 19, 9, 15, 0, tzinfo=IST)
    start_day2_ms = int(dt_day2_start.timestamp() * 1000)

    multiday_csv_path = os.path.join(fixtures_dir, "multiday_overnight_1m.csv")
    with open(multiday_csv_path, "w", encoding="utf-8", newline="") as f:
        f.write("timestamp,open,high,low,close,volume\n")
        # Day 1
        base_nifty = 22450.0
        last_c = base_nifty
        for i in range(375):
            t_ms = start_ts_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            trend = (i / 375.0) * 45.0
            cycle = 12.0 * math.sin(i / 20.0)
            o = round(base_nifty + trend + cycle, 2)
            c = round(o + (math.cos(i / 10.0) * 3.0), 2)
            h = round(max(o, c) + abs(math.sin(i * 1.5)) * 4.0 + 0.25, 2)
            l = round(min(o, c) - abs(math.cos(i * 1.5)) * 4.0 - 0.25, 2)
            v = int(round(25000 + abs(math.sin(i)) * 10000, 0))
            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")
            last_c = c

        # Day 2
        day2_base = last_c + 35.0 # Overnight gap up
        for i in range(375):
            t_ms = start_day2_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            trend = -(i / 375.0) * 20.0
            cycle = 8.0 * math.sin(i / 18.0)
            o = round(day2_base + trend + cycle, 2)
            c = round(o - (math.sin(i / 12.0) * 2.5), 2)
            h = round(max(o, c) + abs(math.cos(i)) * 3.0 + 0.2, 2)
            l = round(min(o, c) - abs(math.sin(i)) * 3.0 - 0.2, 2)
            v = int(round(22000 + abs(math.cos(i)) * 8000, 0))
            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")

    # 3. corrupted_anomalies_1m.csv (100 rows with injected defects)
    corrupted_csv_path = os.path.join(fixtures_dir, "corrupted_anomalies_1m.csv")
    with open(corrupted_csv_path, "w", encoding="utf-8", newline="") as f:
        f.write("timestamp,open,high,low,close,volume\n")
        for i in range(100):
            t_ms = start_ts_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            o, c = 22000.0, 22010.0
            h, l = 22020.0, 21990.0
            v = 5000

            if i == 10:
                # Anomaly: Negative price
                o = -100.0
            elif i == 20:
                # Anomaly: Negative volume
                v = -500
            elif i == 30:
                # Anomaly: Invalid OHLC geometry (H < Close)
                o, c = 22000.0, 22050.0
                h = 22020.0
            elif i == 40:
                # Anomaly: Duplicate timestamp (same as row 39)
                t_prev = start_ts_ms + (39 * 60 * 1000)
                iso_str = datetime.fromtimestamp(t_prev / 1000.0, tz=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
            elif i == 50:
                # Anomaly: Out-of-order timestamp (< prev)
                t_inv = start_ts_ms + (45 * 60 * 1000)
                iso_str = datetime.fromtimestamp(t_inv / 1000.0, tz=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
            elif i == 60:
                # Anomaly: Intrasession missing bars (skips 5 minutes)
                t_skip = start_ts_ms + (65 * 60 * 1000)
                iso_str = datetime.fromtimestamp(t_skip / 1000.0, tz=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
            elif i == 70:
                # Anomaly: Unadjusted corporate action split drop (-50%)
                o, h, l, c = 11000.0, 11010.0, 10990.0, 11005.0
            elif i == 90:
                # Anomaly: Pre-market out of session (08:30 IST)
                dt_pre = datetime(2026, 2, 18, 8, 30, 0, tzinfo=IST)
                iso_str = dt_pre.strftime("%Y-%m-%d %H:%M:%S")

            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")

    # 4. special_sessions_1m.csv (Chronological: DR Session on 2026-03-05, then Muhurat on 2026-11-08)
    # 45 bars of DR session (2026-03-05 09:15 to 09:59 IST per Circular NSE/MSD/73126)
    # 70 bars of Muhurat session (2026-11-08 14:20 to 15:29 IST per Circular NSE/CMTR/76941)
    special_csv_path = os.path.join(fixtures_dir, "special_sessions_1m.csv")
    with open(special_csv_path, "w", encoding="utf-8", newline="") as f:
        f.write("timestamp,open,high,low,close,volume\n")
        # 1. DR Session: 2026-03-05 09:15 IST (Thursday - Authorized DR Site Live Trading per NSE/MSD/73126)
        dt_dr = datetime(2026, 3, 5, 9, 15, 0, tzinfo=IST)
        start_dr_ms = int(dt_dr.timestamp() * 1000)
        p = 22800.0
        for i in range(45):
            t_ms = start_dr_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            o = round(p, 2)
            c = round(o + math.cos(i / 5.0) * 1.5, 2)
            h = round(max(o, c) + 2.0, 2)
            l = round(min(o, c) - 2.0, 2)
            v = 12000
            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")
            p = c

        # 2. Muhurat Session: 2026-11-08 14:20 IST (Sunday - Official Diwali Muhurat Session per NSE/CMTR/76941)
        dt_muhurat = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        start_muhurat_ms = int(dt_muhurat.timestamp() * 1000)
        p = 23000.0
        for i in range(70):
            t_ms = start_muhurat_ms + (i * 60 * 1000)
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc).astimezone(IST)
            iso_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            o = round(p, 2)
            c = round(o + math.sin(i / 5.0) * 2.0, 2)
            h = round(max(o, c) + 2.0, 2)
            l = round(min(o, c) - 2.0, 2)
            v = 15000
            f.write(f"{iso_str},{o:.2f},{h:.2f},{l:.2f},{c:.2f},{v}\n")
            p = c

    print("Generated 4 CSV fixtures successfully:")
    print(f" - {sample_csv_path}")
    print(f" - {multiday_csv_path}")
    print(f" - {corrupted_csv_path}")
    print(f" - {special_csv_path}")


if __name__ == "__main__":
    generate_csv_fixtures()
