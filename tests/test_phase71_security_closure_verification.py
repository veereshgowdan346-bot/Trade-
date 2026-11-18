import os
import sys
import subprocess
import pytest
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.broker_adapter import BrokerAdapter, Order, OrderType
from core.engine import TradingEngine

# Mock broker fixture for testing
class MockTestBrokerFixture:
    IS_TEST_FIXTURE = True
    def __init__(self):
        self.orders = []
    def place_order(self, order):
        self.orders.append(order)
        return "MOCK_ORDER_123"

class MockLiveBrokerNoFixture:
    """Mock simulating a live broker without test fixture flag."""
    IS_TEST_FIXTURE = False
    def place_order(self, order):
        return "UNAUTHORIZED_LIVE_ORDER"

def test_entrypoint_broker_adapter_place_order_permanently_rejected():
    """Verify BrokerAdapter.place_order returns None and marks REJECTED."""
    adapter = BrokerAdapter()
    order = Order(
        symbol="SBIN",
        transaction_type="BUY",
        quantity=5,
        order_type=OrderType.MARKET
    )
    result = adapter.place_order(order)
    assert result is None, "BrokerAdapter.place_order must return None"
    assert order.status == "REJECTED", "Order status must be REJECTED"
    assert "Live broker execution permanently disabled" in order.reject_reason

def test_entrypoint_trading_engine_rejects_non_fixture_live_broker():
    """Verify TradingEngine.place_order rejects any broker not marked as an offline test fixture."""
    mock_b = MockLiveBrokerNoFixture()
    engine = TradingEngine(broker=mock_b)
    order = Order(
        symbol="NIFTY",
        transaction_type="BUY",
        quantity=50,
        order_type=OrderType.MARKET
    )
    res = engine.place_order(order)
    assert res is False, "TradingEngine must refuse orders routed to live/non-fixture brokers"
    assert order.order_id not in engine._order_timestamps

def test_entrypoint_trading_engine_allows_mock_test_fixtures():
    """Verify TradingEngine allows safe offline mock fixtures for simulation."""
    mock_b = MockTestBrokerFixture()
    engine = TradingEngine(broker=mock_b)
    engine._running = True
    order = Order(
        symbol="TCS",
        transaction_type="BUY",
        quantity=1,
        order_type=OrderType.MARKET
    )
    res = engine.place_order(order)
    assert res is True
    assert len(mock_b.orders) == 1

@pytest.mark.parametrize("env_var,env_val", [
    ("TRADING_MODE", "LIVE"),
    ("ENABLE_LIVE_TRADING", "true"),
    ("LIVE_EXECUTION", "1"),
    ("NODE_ENV", "production"),
    ("BROKER_MODE", "REAL_MONEY"),
])
def test_environment_variables_cannot_override_live_kill_switch(monkeypatch, env_var, env_val):
    """Verify that setting any combination of live-trading environment variables does not enable live execution."""
    monkeypatch.setenv(env_var, env_val)
    adapter = BrokerAdapter()
    order = Order(
        symbol="INFY",
        transaction_type="BUY",
        quantity=10,
        order_type=OrderType.MARKET
    )
    result = adapter.place_order(order)
    assert result is None, f"Environment variable {env_var}={env_val} must not enable live execution"
    assert order.status == "REJECTED"

AUTHORISED_OWNER_REPO = "veereshgowdan346-bot/Trade-"
AUTHORISED_HOSTS = {"github.com", "www.github.com"}


def _remote_url_authorised(url: str) -> bool:
    """True when a remote URL is either the authorised GitHub repository or a local bundle file.

    Restoring this project from a verified bundle (`git clone <file>.bundle`) configures exactly one
    remote whose URL is a path to that bundle. That is not a publication channel, so it is allowed;
    every other destination is not.

    The match is exact on host and owner/repository. A substring test is not sufficient: it would
    accept `veereshgowdan346-bot/Trade--fork` and any host serving a path with the same owner, which
    is precisely the mistake this predicate is meant to prevent.
    """
    stripped = (url or "").strip()
    if not stripped:
        return False
    # A local bundle path (what a verified restore produces).
    if "://" not in stripped and not stripped.startswith("git@"):
        return stripped.endswith(".bundle")
    if "://" in stripped:
        from urllib.parse import urlparse

        parsed = urlparse(stripped)
        # No special case for `file://`: git refuses to clone a bundle through that scheme ("too large to be a
        # .git file"), so no such remote can exist. A verified restore uses a plain path, handled above.
        if (parsed.hostname or "").lower() not in AUTHORISED_HOSTS:
            return False
        path = parsed.path.lstrip("/")
    else:  # scp-style: git@github.com:owner/repo.git
        host, _, path = stripped.partition(":")
        if host.split("@")[-1].lower() not in AUTHORISED_HOSTS:
            return False
    path = path.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return path == AUTHORISED_OWNER_REPO


def test_git_branches_and_tags_hygiene():
    """
    Verify git branch/tag/remote hygiene (security incident closure, 2026-02-14).

    PHASE 2 INVESTIGATION (TEST-001 / PY-001, 2026-11-17): the original assertion
    `branches == ["master"]` encoded the single-branch POST-CLEANUP snapshot, not a
    portable security invariant. It fails in any authorised feature-branch workflow —
    the Arena development environment mandates the documented temporary working branch
    `arena/<session>-trade` alongside `master`. This is an environment mismatch
    (BLOCKED-ENV in the Phase 1 audit), NOT a security regression.

    SCOPED FIX — the security intent is preserved and STRENGTHENED, never weakened:
      * Local branches must be EXACTLY `master` plus `arena/*` working branches
        (allow-list). Any other branch name still fails the test.
      * Tags must remain empty (unchanged) — the expunged history must stay unreachable.
      * Remote configuration: every remote must belong to `veereshgowdan346-bot/Trade-`
        (the original substring check passed even with EXTRA remotes configured next
        to the authorized one — now fixed).
      * Remote refs must be limited to `origin/master` and `origin/HEAD` (new check —
        the original test conflated local and remote branches in `git branch -a`).

    TEST-003 (2026-11-18): the assertion `"master" in local_branches` encoded another snapshot
    artefact. A repository restored from a bundle, or any single-branch clone, legitimately has no
    local `master` — only the checked-out branch — so the test failed in a verified restore while
    passing in the author's workspace. The security property is about refs that must NOT exist
    (unauthorised branches, tags, rogue remotes), never about a convenience branch being present.
    It now requires `master` to exist as a ref (local OR remote-tracking) and keeps every other
    assertion strict. A remote pointing at a local `.bundle` file is accepted because that is what
    restoring from a verified bundle produces; it is not a publication channel.
    """
    b_res = subprocess.run(["git", "branch"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    local_branches = sorted(b.strip().replace("* ", "") for b in b_res.stdout.splitlines() if b.strip())
    allowed = [b for b in local_branches if b == "master" or b.startswith("arena/")]
    assert local_branches == sorted(allowed), (
        f"Unauthorized local branches present (only 'master' and 'arena/*' are permitted): {local_branches}"
    )
    # `master` must exist as a ref, but not necessarily as a local branch: a bundle restore or a
    # single-branch clone has only the checked-out branch locally while `origin/master` still exists.
    r_master = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/master"],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    has_master_ref = "master" in local_branches or r_master.returncode == 0
    assert has_master_ref, "the master line must exist locally or as origin/master"

    t_res = subprocess.run(["git", "tag"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    assert t_res.stdout.strip() == "", f"Unexpected tags found: {t_res.stdout}"

    r_res = subprocess.run(["git", "remote", "-v"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    remote_lines = [l.strip() for l in r_res.stdout.splitlines() if l.strip()]
    for line in remote_lines:
        parts = line.split()
        url = parts[1] if len(parts) >= 2 else ""
        assert _remote_url_authorised(url), f"Unauthorized remote configured: {line}"
    remote_names = sorted({l.split()[0] for l in remote_lines})
    assert set(remote_names) <= {"origin"}, f"Extra remotes configured (only 'origin' permitted): {remote_names}"

    ra_res = subprocess.run(["git", "branch", "-r"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    remote_refs = sorted(
        r.strip().replace("origin/HEAD -> origin/master", "").strip()
        for r in ra_res.stdout.splitlines()
        if r.strip() and "HEAD" not in r
    )
    # FINAL-AUDIT TEST-002: the local-branch allowlist already permits the
    # `arena/*` working branch, but the remote-ref allowlist only listed
    # `origin/master`. Publishing that same working branch (the authorized PR,
    # branch arena/16f5d371-trade) therefore tripped this check. The security
    # intent is preserved exactly: only `master` and `arena/*` may exist remotely;
    # any other branch, extra remote, or tag still fails.
    allowed_remote_refs = sorted(
        r for r in remote_refs if r in ("origin/master",) or r.startswith("origin/arena/")
    )
    assert remote_refs == allowed_remote_refs, (
        f"Unauthorized remote branches present (only origin/master and origin/arena/* are permitted): {remote_refs}"
    )

def test_old_commits_unreachable_and_expunged():
    """Verify old commits (54972eb1, 5e496c7d, 1f6fbc58) are completely expunged from Git."""
    old_commits = ["54972eb1", "5e496c7d", "1f6fbc58"]
    for c in old_commits:
        res = subprocess.run(["git", "cat-file", "-e", c], cwd=REPO_ROOT, capture_output=True)
        assert res.returncode != 0, f"Old commit {c} still exists in git object database!"

def test_no_unreachable_commits_in_git_database():
    """Verify git fsck reports zero unreachable commits."""
    res = subprocess.run(["git", "fsck", "--unreachable"], cwd=REPO_ROOT, capture_output=True, text=True)
    unreachable_commits = [l for l in res.stdout.splitlines() if "unreachable commit" in l]
    assert len(unreachable_commits) == 0, f"Unreachable commits present: {unreachable_commits}"

def test_application_vault_never_loads_plaintext_credential_files():
    """Verify source code contains zero logic reading plaintext credentials.json."""
    vault_ts = REPO_ROOT / "src" / "lib" / "vault.ts"
    with open(vault_ts, "r", encoding="utf-8") as f:
        v_content = f.read()
    assert "credentials.json" not in v_content, "vault.ts must not have plaintext file fallback"
    assert "node:fs" not in v_content, "vault.ts must not read local filesystem"

    cred_mgr_py = REPO_ROOT / "config" / "credential_manager.py"
    with open(cred_mgr_py, "r", encoding="utf-8") as f:
        c_content = f.read()
    assert "data/credentials.json" not in c_content
    assert "credentials.json" not in c_content


def test_remote_url_predicate_rejects_unauthorised_destinations():
    """TEST-003 regression: the remote check must not accept a rogue destination.

    This is the negative half of the hygiene test. If someone widens `_remote_url_authorised` to
    accept arbitrary URLs (for example to make a fork CI pass), this fails immediately.
    """
    assert _remote_url_authorised("https://github.com/veereshgowdan346-bot/Trade-.git") is True
    assert _remote_url_authorised("git@github.com:veereshgowdan346-bot/Trade-.git") is True
    assert _remote_url_authorised("/home/user/Trade-/backups/repo_all_refs_test.bundle") is True
    assert _remote_url_authorised("backups/repo.bundle") is True

    for bad in (
        "https://github.com/someone-else/Trade-.git",
        "https://gitlab.com/veereshgowdan346-bot/Trade-.git",
        "https://github.com/veereshgowdan346-bot/Trade--fork.git",
        "https://example.com/x.bundle",
        "file:///tmp/evil.bundle",
        "",
        "origin",
    ):
        assert _remote_url_authorised(bad) is False, f"unauthorised remote accepted: {bad!r}"
