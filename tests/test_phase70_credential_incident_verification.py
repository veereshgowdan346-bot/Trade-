import os
import subprocess
import pytest
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

def test_git_history_contains_zero_sensitive_blobs():
    """Verify that leaked blob 90ca43600bda2f80c741f3b335d8e86ec9e30dce is purged from entire Git database."""
    res = subprocess.run(
        ["git", "rev-list", "--objects", "--all"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True
    )
    all_objects = res.stdout
    assert "90ca43600bda2f80c741f3b335d8e86ec9e30dce" not in all_objects, (
        "Leaked credentials.json blob hash found in git rev-list"
    )
    assert "ac7b6ce40bb9a6e97e921958084ccef8a6f1ade5" not in all_objects, (
        "Leaked .env blob hash found in git rev-list"
    )
    assert "f30d1645a35efe4b72086dd8c1a17a0e9ee1a1eb" not in all_objects, (
        "Leaked .env.local blob hash found in git rev-list"
    )

def test_git_tracked_files_contain_no_credentials_or_databases():
    """Verify that git ls-files contains no .env, credentials.json, or database paths."""
    res = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True
    )
    files = res.stdout.splitlines()
    for f in files:
        assert not f.endswith("credentials.json"), f"Tracked credentials file: {f}"
        assert f != ".env" and not f.endswith("/.env"), f"Tracked .env file: {f}"
        assert f != ".env.local" and not f.endswith("/.env.local"), f"Tracked .env.local file: {f}"
        assert not f.startswith("data/omnitrade-pg/"), f"Tracked database file: {f}"
        assert not f.endswith(".db"), f"Tracked sqlite database: {f}"
        assert not f.endswith(".pyc"), f"Tracked bytecode file: {f}"

def test_gitignore_protects_all_credential_and_database_patterns():
    """Verify that .gitignore actively ignores sensitive and local database files."""
    test_paths = [
        ".env",
        ".env.local",
        "data/credentials.json",
        "data/omnitrade-pg/PG_VERSION",
        "data/auratrader.db",
        "some/path/secret.key",
        "some/path/cert.pem"
    ]
    for p in test_paths:
        res = subprocess.run(
            ["git", "check-ignore", "-q", p],
            cwd=REPO_ROOT
        )
        assert res.returncode == 0, f"Path {p} is not ignored by .gitignore"

def test_source_code_contains_no_real_client_id():
    """Verify that the user's specific broker user ID does not appear in active source files."""
    real_client_id_prefix = "FN2447" + "56"
    suspicious_files = []
    for root, dirs, files in os.walk(REPO_ROOT):
        # Skip git, node_modules, next, test reports, and audit logs
        if any(skip in root for skip in [".git", "node_modules", ".next", "dist_test_cjs", "logs"]):
            continue
        for f in files:
            if f.endswith((".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".sql")):
                if f in ["scan_source_files.py", "audit_credentials_inventory.py", "native_history_rewrite.py", "scan_repo_secrets.py"]:
                    continue
                fpath = os.path.join(root, f)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as fp:
                        content = fp.read()
                        if real_client_id_prefix in content:
                            suspicious_files.append(fpath)
                except Exception:
                    pass
    assert not suspicious_files, f"Real client ID found in active files: {suspicious_files}"

def test_live_broker_execution_permanently_rejected():
    """Verify that live broker order execution remains strictly blocked."""
    import sys
    sys.path.insert(0, str(REPO_ROOT))
    from core.broker_adapter import BrokerAdapter, Order, OrderType
    adapter = BrokerAdapter()
    order = Order(
        order_id="PHASE70_TEST",
        symbol="SBIN",
        quantity=1,
        order_type=OrderType.MARKET,
        transaction_type="BUY"
    )
    result = adapter.place_order(order)
    assert result is None, "Live broker order must return None"
    assert order.status == "REJECTED", "Live broker order must be marked REJECTED"
    assert "Live broker execution permanently disabled" in order.reject_reason
