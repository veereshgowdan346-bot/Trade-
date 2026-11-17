#!/usr/bin/env python3
"""
GATE 3 — independent NSE trading-calendar cross-check.

Source: pandas_market_calendars (third-party open-source library, PyPI), calendar "NSE".
This is INDEPENDENT of the dataset vendor, but it is NOT an official NSE/SEBI publication, so a
match does not confer authenticity: it only means two independent parties agree on the session list.
Year status is therefore THIRD_PARTY_CROSSCHECKED, never VERIFIED.

Discrepancies are reported, never smoothed:
  data_only    = sessions present in the data but absent from the calendar (expected for weekend
                 Muhurat and special Saturday sessions, which exchange calendars usually omit)
  calendar_only= sessions the calendar expects but the data does not contain (potential data gap)

Years the calendar cannot cover stay UNCHECKED.

Usage: python3 scripts/calendar_crosscheck.py
"""
import csv
import datetime as dt
import json
import pathlib
import sys

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "provenance" / "calendar_crosscheck.json"
YEARS = [2022, 2023, 2024]

try:
    import pandas_market_calendars as mcal
except ImportError:
    print("pandas_market_calendars not installed: pip3 install pandas_market_calendars --break-system-packages", file=sys.stderr)
    raise SystemExit(2)


def data_sessions(path):
    days = set()
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            days.add(dt.datetime.fromtimestamp(int(row["Epoch"]), IST).date().isoformat())
    return days


def main():
    cal = mcal.get_calendar("NSE")
    sched = cal.schedule(start_date="2022-01-01", end_date="2024-12-31")
    cal_all = {d.date().isoformat() for d in sched.index}

    report = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "command": "python3 scripts/calendar_crosscheck.py",
        "calendarSource": {
            "library": "pandas_market_calendars",
            "calendar": "NSE",
            "authority": "THIRD_PARTY",
            "note": "Independent of the dataset vendor but NOT an official NSE/SEBI publication. Agreement does not establish authenticity.",
        },
        "appCalendarCoverage": {
            "module": "src/lib/nse_calendar.ts",
            "modelledYears": [2026],
            "note": "The application's own holiday model covers 2026 only, so 2022-2025 remain UNCHECKED internally.",
        },
        "years": [],
    }

    for y in YEARS:
        path = ROOT / "data" / "external" / "nse" / f"NIFTY50_1min_{y}.csv"
        if not path.exists():
            report["years"].append({"year": y, "status": "UNCHECKED", "reason": "local dataset missing"})
            continue
        days = data_sessions(path)
        cal_y = {d for d in cal_all if d.startswith(str(y))}
        data_only = sorted(days - cal_y)
        cal_only = sorted(cal_y - days)

        def classify(d):
            wd = dt.date.fromisoformat(d).strftime("%A")
            if wd in ("Saturday", "Sunday"):
                return f"weekend_special_session ({wd})"
            return f"weekday_discrepancy ({wd}) — requires manual adjudication"

        report["years"].append(
            {
                "year": y,
                "status": "THIRD_PARTY_CROSSCHECKED",
                "dataSessions": len(days),
                "calendarSessions": len(cal_y),
                "agree": not data_only and not cal_only,
                "dataOnly": [{"date": d, "classification": classify(d)} for d in data_only],
                "calendarOnly": [{"date": d, "classification": classify(d)} for d in cal_only],
            }
        )

    report["years"].append({"year": 2025, "status": "UNCHECKED", "reason": "no dataset for 2025; not assessed"})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")

    for y in report["years"]:
        if y.get("status") == "UNCHECKED":
            print(f"{y['year']}: UNCHECKED ({y['reason']})")
            continue
        print(f"{y['year']}: data={y['dataSessions']} calendar={y['calendarSessions']} agree={y['agree']}")
        for d in y["dataOnly"]:
            print(f"   data-only     {d['date']}  {d['classification']}")
        for d in y["calendarOnly"]:
            print(f"   calendar-only {d['date']}  {d['classification']}")
    unresolved = [d for y in report["years"] if y.get("status") == "THIRD_PARTY_CROSSCHECKED" for d in y["calendarOnly"] if "weekday" in d["classification"]]
    print(f"\nunresolved weekday discrepancies: {len(unresolved)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
