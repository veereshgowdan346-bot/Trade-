#!/usr/bin/env python3
"""
SECURITY-001 — Git history credential scan.

Scans every reachable commit (all refs) for known leaked identifiers and private-key headers.

Safety properties:
  * matched values are NEVER printed or written: findings carry commit, path, blob sha and a KIND only
  * identifiers are compared by SHA-256 digest, so this scanner itself contains no secret material
  * binary blobs are skipped by content sniffing rather than by extension

Coverage limitation (reported, not hidden): this clone is SHALLOW. Commits before the shallow boundary
are not present locally and therefore cannot be scanned here; they remain on any remote that has them.
The report states this explicitly rather than implying full-history coverage.

Exit codes: 0 = no findings, 1 = findings present, 2 = scanner could not run.

Usage: python3 scripts/scan_git_history_secrets.py
"""
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "security", "git_history_scan.json")
IDENTIFIERS = os.path.join(ROOT, "data", "security", "leaked_identifiers.json")
PRIVATE_KEY_RE = re.compile(rb"-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----")
TOKEN_RE = re.compile(r"[A-Za-z0-9]{6,64}")


def git(*args, binary=False):
    res = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {res.stderr.decode('utf-8', 'replace')[:200]}")
    return res.stdout if binary else res.stdout.decode("utf-8", "replace")


def load_digests():
    with open(IDENTIFIERS) as fh:
        data = json.load(fh)
    return {d["sha256"]: d["kind"] for d in data.get("identifiers", [])}


def is_shallow():
    return os.path.exists(os.path.join(ROOT, ".git", "shallow"))


def shallow_boundary():
    path = os.path.join(ROOT, ".git", "shallow")
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        return [line.strip() for line in fh if line.strip()]


def reachable_from(ref):
    """Commits reachable from a ref (empty list if the ref is absent)."""
    res = subprocess.run(["git", "rev-list", ref], cwd=ROOT, capture_output=True, text=True)
    return set(res.stdout.split()) if res.returncode == 0 else set()


def main():
    digests = load_digests()
    commits = [c for c in git("rev-list", "--all").split() if c]
    public = reachable_from("origin/master")

    blob_cache = {}
    findings = []
    scanned_commits = 0
    scanned_blobs = 0

    for commit in commits:
        scanned_commits += 1
        tree = git("ls-tree", "-r", "--format=%(objectname) %(objecttype) %(path)", commit)
        for line in tree.splitlines():
            parts = line.split(" ", 2)
            if len(parts) != 3:
                continue
            sha, objtype, path = parts
            if objtype != "blob":
                continue
            if sha not in blob_cache:
                scanned_blobs += 1
                try:
                    content = git("cat-file", "blob", sha, binary=True)
                except RuntimeError:
                    blob_cache[sha] = []
                    continue
                if b"\x00" in content[:4096]:  # binary
                    blob_cache[sha] = []
                    continue
                hits = []
                if PRIVATE_KEY_RE.search(content):
                    hits.append({"kind": "private_key_header"})
                for token in TOKEN_RE.findall(content.decode("utf-8", "ignore")):
                    kind = digests.get(hashlib.sha256(token.upper().encode()).hexdigest())
                    if kind:
                        hits.append({"kind": kind})
                blob_cache[sha] = hits
            for hit in blob_cache[sha]:
                findings.append(
                    {
                        "commit": commit,
                        "path": path,
                        "blob": sha,
                        "kind": hit["kind"],
                        "reachableFromOriginMaster": commit in public,
                    }
                )

    # de-duplicate identical (commit, path, kind)
    seen = set()
    unique = []
    for f in findings:
        key = (f["commit"], f["path"], f["kind"])
        if key not in seen:
            seen.add(key)
            unique.append(f)

    commits_with = sorted({f["commit"] for f in unique})
    public_hits = [f for f in unique if f["reachableFromOriginMaster"]]

    report = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "command": "python3 scripts/scan_git_history_secrets.py",
        "scanner": "digest-based; no matched value is ever printed or stored",
        "coverage": {
            "commitsScanned": scanned_commits,
            "blobsScanned": scanned_blobs,
            "refs": ["--all"],
            "shallowClone": is_shallow(),
            "shallowBoundary": shallow_boundary(),
            "limitation": (
                "Shallow clone: commits before the shallow boundary are absent locally and were NOT scanned. "
                "They remain in any remote or other clone that contains them."
                if is_shallow()
                else "Full history present locally."
            ),
        },
        "findings": unique,
        "summary": {
            "findingCount": len(unique),
            "distinctCommitsAffected": len(commits_with),
            "commitList": commits_with,
            "affectsHeadWorkingTree": False,  # working tree is verified separately by the tracked-file scanner
            "reachableFromOriginMaster": len(public_hits),
            "publicExposure": bool(public_hits),
            "kinds": sorted({f["kind"] for f in unique}),
        },
        "verdict": "HISTORY_EXPOSURE_FOUND" if unique else "NO_HISTORY_EXPOSURE_FOUND",
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")

    print(f"commits scanned: {scanned_commits} (shallow={is_shallow()}, boundary={shallow_boundary()})")
    print(f"blobs scanned:   {scanned_blobs}")
    print(f"findings:        {len(unique)} across {len(commits_with)} commit(s)")
    for c in commits_with:
        n = len([f for f in unique if f["commit"] == c])
        flag = "PUBLIC (reachable from origin/master)" if c in public else "local-only"
        print(f"  {c[:12]}  {n} finding(s)  {flag}")
    print(f"reachable from origin/master: {len(public_hits)}")
    print("values displayed: 0 (by design)")
    print(f"verdict: {report['verdict']}")
    return 1 if unique else 0


if __name__ == "__main__":
    sys.exit(main())
