"""
Shared secret-scanning logic (SEC-001 remediation).

Why this module exists
----------------------
The repository previously stored REAL broker credentials — a client/user id, an API secret and a
TOTP seed prefix — as literal strings inside two scanner scripts, so that the scanners could detect
them if they reappeared. That works for detection but means the secrets themselves are committed,
copied on every clone and pushed to any remote. Storing the secret to detect the secret is not an
acceptable control.

What we do instead
------------------
Only SHA-256 digests (uppercase-normalised) of the known identifiers are stored, in
`data/security/leaked_identifiers.json`. Scanners tokenise each file, hash every candidate token and
compare digests. Detection quality is unchanged; the plaintext is gone from the working tree.

Residual risk that this module CANNOT fix
-----------------------------------------
The values remain in git history. Editing files does not un-leak them. The credentials must be
treated as compromised and ROTATED by their owner. History rewriting is out of scope (and prohibited
in this project), so this is recorded as an open blocker, not a resolved one.

Note: hiding secrets is not the same as removing the exposure. The digests below are one-way, so this
file leaks nothing usable; the plaintext did.
"""
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDENTIFIER_FILE = os.path.join(ROOT, "data", "security", "leaked_identifiers.json")

# Generic patterns that do not embed any real value.
GENERIC_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|apikey|secret|token|password|passwd|auth[_-]?token)[ \t]*[:=][ \t]*["\']([^"\'\n]{8,})["\']'),
     "credential_assignment", "HIGH"),
    (re.compile(r'(?i)bearer\s+[a-zA-Z0-9_\-\.]{16,}'), "bearer_token", "MEDIUM"),
    (re.compile(r'-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----'), "private_key_header", "HIGH"),
]

TOKEN_RE = re.compile(r"[A-Za-z0-9]{6,64}")

# Values that are demonstrably fixtures, with the reason recorded. Anything not listed here is reported.
FIXTURE_ALLOWLIST = {
    "scripts/run_comprehensive_tests.js": "test fixtures: sample JWT and fake broker keys used by assertions",
    "scripts/scan_source_files.py": "scanner source (no secrets after SEC-001)",
    "scripts/scan_repo_secrets.py": "scanner source (no secrets after SEC-001)",
    "tests/test_phase69_security_reliability_audit.py": "test fixture bearer token",
    "src/lib/instruments.ts": "PENDING_MASTER sentinel, not a credential",
}

SKIP_DIRS = {".git", "node_modules", ".next", "dist_test_cjs", ".venv", "__pycache__", "data/external", "data/omnitrade-pg"}
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pyc", ".gz", ".tar", ".zip", ".pack", ".idx", ".db", ".sqlite"}


def load_identifiers():
    if not os.path.exists(IDENTIFIER_FILE):
        return []
    with open(IDENTIFIER_FILE) as fh:
        data = json.load(fh)
    return [d["sha256"] for d in data.get("identifiers", [])]


def redact(value):
    v = str(value)
    if len(v) <= 6:
        return v[:1] + "***"
    return f"{v[:3]}***{v[-2:]}"


def scan_text(text, identifier_digests):
    """Return findings as dicts {kind, severity, evidence}. Evidence is always redacted."""
    findings = []
    for pattern, kind, severity in GENERIC_PATTERNS:
        for m in pattern.finditer(text):
            findings.append({"kind": kind, "severity": severity, "evidence": redact(m.group(0))})
    for token in TOKEN_RE.findall(text):
        digest = hashlib.sha256(token.upper().encode()).hexdigest()
        if digest in identifier_digests:
            findings.append({"kind": "known_leaked_identifier", "severity": "CRITICAL", "evidence": redact(token)})
    return findings


def iter_files(start=None, use_git=True):
    if use_git:
        import subprocess
        res = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
        for rel in res.stdout.splitlines():
            full = os.path.join(ROOT, rel)
            if os.path.exists(full) and os.path.splitext(rel)[1].lower() not in SKIP_EXT:
                yield rel, full
        return
    base = start or ROOT
    for root, dirs, files in os.walk(base):
        rel_root = os.path.relpath(root, ROOT)
        if any(part in SKIP_DIRS for part in rel_root.split(os.sep)):
            continue
        for name in files:
            if os.path.splitext(name)[1].lower() in SKIP_EXT:
                continue
            full = os.path.join(root, name)
            yield os.path.relpath(full, ROOT), full
