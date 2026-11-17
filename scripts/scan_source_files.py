#!/usr/bin/env python3
"""
Working-tree secret scan (including untracked files). Shares its logic with
scripts/scan_repo_secrets.py via secret_scan_lib so the two scanners cannot drift apart.

Usage: python3 scripts/scan_source_files.py
"""
import sys

from secret_scan_lib import FIXTURE_ALLOWLIST, iter_files, load_identifiers, scan_text


def main():
    digests = load_identifiers()
    findings = []
    for rel, full in iter_files(use_git=False):
        try:
            with open(full, encoding="utf-8", errors="ignore") as fh:
                text = fh.read()
        except OSError:
            continue
        for f in scan_text(text, digests):
            f["file"] = rel
            f["allowlisted"] = rel in FIXTURE_ALLOWLIST
            findings.append(f)
    blocking = [f for f in findings if not f["allowlisted"]]
    print(f"scanned working tree; findings: {len(findings)} ({len(blocking)} blocking)")
    for f in findings:
        print(f"  [{'ALLOWLISTED' if f['allowlisted'] else f['severity']}] {f['file']}: {f['kind']} -> {f['evidence']}")
    return 0 if not blocking else 1


if __name__ == "__main__":
    sys.exit(main())
