#!/usr/bin/env python3
"""
SEC-001: scan every git-tracked file for credential material.

Detection is hash-based for the known leaked identifiers (see scripts/secret_scan_lib.py) so that the
scanner does not itself re-commit the secrets it looks for. Generic patterns cover the usual shapes.

Exit codes: 0 = no findings, 1 = findings present.

Usage: python3 scripts/scan_repo_secrets.py
"""
import sys

from secret_scan_lib import FIXTURE_ALLOWLIST, iter_files, load_identifiers, scan_text


def main():
    digests = load_identifiers()
    findings = []
    for rel, full in iter_files(use_git=True):
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
    print(f"scanned tracked files; known-identifier digests: {len(digests)}")
    for f in findings:
        tag = "ALLOWLISTED" if f["allowlisted"] else f["severity"]
        print(f"  [{tag}] {f['file']}: {f['kind']} -> {f['evidence']}")
    print(f"\nblocking findings: {len(blocking)}")
    return 0 if not blocking else 1


if __name__ == "__main__":
    sys.exit(main())
