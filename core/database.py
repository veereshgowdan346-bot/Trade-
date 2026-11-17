"""
Database and Persistence Module for AuraTrader-AngelOne.
Provides SQLite persistent storage for orders, positions, trades, watchlists,
settings, and execution logs with thread-safety, integrity, and backups.
"""

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any


class DatabaseManager:
    """
    Thread-safe SQLite Database Manager.
    Stores application state persistently across restarts.
    """

    @classmethod
    def _resolve_default_db_path(cls) -> Path:
        env_path = os.environ.get("AURATRADER_DB_PATH")
        if env_path:
            return Path(env_path)
        try:
            local_dir = Path(__file__).resolve().parent.parent / "data"
            local_dir.mkdir(parents=True, exist_ok=True)
            return local_dir / "auratrader.db"
        except Exception:
            try:
                home_dir = Path.home() / ".auratrader"
                home_dir.mkdir(parents=True, exist_ok=True)
                return home_dir / "auratrader.db"
            except Exception:
                return Path(":memory:")

    DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "auratrader.db"

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else self._resolve_default_db_path()
        if str(self.db_path) != ":memory:":
            try:
                self.db_path.parent.mkdir(parents=True, exist_ok=True)
            except Exception:
                self.db_path = Path(":memory:")
        self._lock = threading.RLock()
        self.logger = logging.getLogger(f"{__name__}.DatabaseManager")
        self.init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Get a configured SQLite connection with in-memory fallback."""
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        except sqlite3.OperationalError:
            self.logger.warning(f"Unable to open {self.db_path}, falling back to in-memory SQLite database")
            conn = sqlite3.connect(":memory:", timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
        except sqlite3.OperationalError:
            pass
        return conn

    def init_db(self) -> None:
        """Initialize database schema."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # Orders table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS orders (
                        order_id TEXT PRIMARY KEY,
                        symbol TEXT NOT NULL,
                        transaction_type TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        order_type TEXT NOT NULL,
                        price REAL,
                        trigger_price REAL,
                        status TEXT NOT NULL,
                        mode TEXT DEFAULT 'PAPER',
                        strategy TEXT,
                        timestamp TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # Positions table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS positions (
                        symbol TEXT PRIMARY KEY,
                        side TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        avg_price REAL NOT NULL,
                        current_price REAL NOT NULL,
                        unrealised_pnl REAL DEFAULT 0.0,
                        realised_pnl REAL DEFAULT 0.0,
                        mode TEXT DEFAULT 'PAPER',
                        updated_at TEXT NOT NULL
                    );
                """)

                # Trades table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS trades (
                        trade_id TEXT PRIMARY KEY,
                        order_id TEXT,
                        symbol TEXT NOT NULL,
                        side TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        price REAL NOT NULL,
                        fee REAL DEFAULT 0.0,
                        pnl REAL DEFAULT 0.0,
                        strategy TEXT,
                        timestamp TEXT NOT NULL
                    );
                """)

                # Settings table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # Watchlists table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS watchlists (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        exchange TEXT DEFAULT 'NSE',
                        added_at TEXT NOT NULL,
                        UNIQUE(name, symbol)
                    );
                """)

                # Execution logs table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS execution_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        level TEXT NOT NULL,
                        message TEXT NOT NULL,
                        module TEXT,
                        timestamp TEXT NOT NULL
                    );
                """)

                # Prepopulate default watchlists if empty
                cursor.execute("SELECT COUNT(*) FROM watchlists")
                count = cursor.fetchone()[0]
                if count == 0:
                    defaults = [
                        ("DEFAULT", "NIFTY 50", "NSE"),
                        ("DEFAULT", "BANKNIFTY", "NSE"),
                        ("DEFAULT", "FINNIFTY", "NSE"),
                        ("DEFAULT", "NSE:RELIANCE", "NSE"),
                        ("DEFAULT", "NSE:TCS", "NSE"),
                        ("DEFAULT", "NSE:INFY", "NSE"),
                        ("DEFAULT", "NSE:HDFCBANK", "NSE"),
                        ("DEFAULT", "NSE:ITC", "NSE")
                    ]
                    now_str = datetime.now().isoformat()
                    for name, sym, exch in defaults:
                        cursor.execute(
                            "INSERT OR IGNORE INTO watchlists (name, symbol, exchange, added_at) VALUES (?, ?, ?, ?)",
                            (name, sym, exch, now_str)
                        )

                conn.commit()
                self.logger.info(f"Database initialized at {self.db_path}")

    # --- Orders ---
    def save_order(self, order_dict: Dict[str, Any]) -> None:
        """Insert or update order."""
        with self._lock:
            with self._get_connection() as conn:
                now_str = datetime.now().isoformat()
                conn.execute("""
                    INSERT OR REPLACE INTO orders 
                    (order_id, symbol, transaction_type, quantity, order_type, price, trigger_price, status, mode, strategy, timestamp, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    order_dict.get('order_id', f"ORD_{int(datetime.now().timestamp()*1000)}"),
                    order_dict.get('symbol', ''),
                    order_dict.get('transaction_type', 'BUY'),
                    order_dict.get('quantity', 0),
                    order_dict.get('order_type', 'MARKET'),
                    order_dict.get('price', 0.0),
                    order_dict.get('trigger_price', 0.0),
                    order_dict.get('status', 'NEW'),
                    order_dict.get('mode', 'PAPER'),
                    order_dict.get('strategy', ''),
                    order_dict.get('timestamp', now_str),
                    now_str
                ))
                conn.commit()

    def get_orders(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieve latest orders."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM orders ORDER BY timestamp DESC LIMIT ?", (limit,))
                return [dict(row) for row in cursor.fetchall()]

    # --- Positions ---
    def save_position(self, pos_dict: Dict[str, Any]) -> None:
        """Insert or update active position."""
        with self._lock:
            with self._get_connection() as conn:
                now_str = datetime.now().isoformat()
                conn.execute("""
                    INSERT OR REPLACE INTO positions
                    (symbol, side, quantity, avg_price, current_price, unrealised_pnl, realised_pnl, mode, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    pos_dict['symbol'],
                    pos_dict.get('side', 'LONG'),
                    pos_dict.get('quantity', 0),
                    pos_dict.get('avg_price', 0.0),
                    pos_dict.get('current_price', 0.0),
                    pos_dict.get('unrealised_pnl', 0.0),
                    pos_dict.get('realised_pnl', 0.0),
                    pos_dict.get('mode', 'PAPER'),
                    now_str
                ))
                conn.commit()

    def delete_position(self, symbol: str) -> None:
        """Remove a closed position."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM positions WHERE symbol = ?", (symbol,))
                conn.commit()

    def get_positions(self) -> List[Dict[str, Any]]:
        """Retrieve all active positions."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM positions WHERE quantity > 0")
                return [dict(row) for row in cursor.fetchall()]

    # --- Trades ---
    def save_trade(self, trade_dict: Dict[str, Any]) -> None:
        """Record completed trade execution."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO trades
                    (trade_id, order_id, symbol, side, quantity, price, fee, pnl, strategy, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    trade_dict.get('trade_id', f"TRD_{int(datetime.now().timestamp()*1000)}"),
                    trade_dict.get('order_id', ''),
                    trade_dict.get('symbol', ''),
                    trade_dict.get('side', 'BUY'),
                    trade_dict.get('quantity', 0),
                    trade_dict.get('price', 0.0),
                    trade_dict.get('fee', 0.0),
                    trade_dict.get('pnl', 0.0),
                    trade_dict.get('strategy', ''),
                    trade_dict.get('timestamp', datetime.now().isoformat())
                ))
                conn.commit()

    def get_trades(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get trade execution history."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?", (limit,))
                return [dict(row) for row in cursor.fetchall()]

    # --- Watchlists ---
    def get_watchlist(self, name: str = "DEFAULT") -> List[str]:
        """Get list of symbols in a watchlist."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT symbol FROM watchlists WHERE name = ?", (name,))
                return [row[0] for row in cursor.fetchall()]

    def add_to_watchlist(self, name: str, symbol: str, exchange: str = "NSE") -> bool:
        """Add instrument to watchlist."""
        with self._lock:
            with self._get_connection() as conn:
                try:
                    conn.execute(
                        "INSERT OR IGNORE INTO watchlists (name, symbol, exchange, added_at) VALUES (?, ?, ?, ?)",
                        (name, symbol, exchange, datetime.now().isoformat())
                    )
                    conn.commit()
                    return True
                except Exception as e:
                    self.logger.error(f"Error adding to watchlist: {e}")
                    return False

    def remove_from_watchlist(self, name: str, symbol: str) -> bool:
        """Remove instrument from watchlist."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM watchlists WHERE name = ? AND symbol = ?", (name, symbol))
                conn.commit()
                return True

    # --- Settings ---
    def set_setting(self, key: str, value: Any) -> None:
        """Save a configuration setting."""
        with self._lock:
            with self._get_connection() as conn:
                val_str = json.dumps(value) if not isinstance(value, str) else value
                conn.execute("""
                    INSERT OR REPLACE INTO settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                """, (key, val_str, datetime.now().isoformat()))
                conn.commit()

    def get_setting(self, key: str, default: Any = None) -> Any:
        """Retrieve a configuration setting."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row[0])
                    except Exception:
                        return row[0]
                return default

    # --- Execution Logs ---
    def log_execution(self, level: str, message: str, module: str = "core") -> None:
        """Record system execution event with sensitive credential scrubbing."""
        from config.credential_manager import redact_secrets
        sanitized_msg = redact_secrets(message)
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO execution_logs (level, message, module, timestamp)
                    VALUES (?, ?, ?, ?)
                """, (level, sanitized_msg, module, datetime.now().isoformat()))
                conn.commit()

    def get_recent_logs(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Retrieve latest execution logs."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM execution_logs ORDER BY id DESC LIMIT ?", (limit,))
                return [dict(row) for row in cursor.fetchall()]

    # --- Backup & Recovery ---
    def backup_database(self, backup_path: Optional[Path] = None) -> Path:
        """Create a full snapshot backup of the SQLite database."""
        with self._lock:
            if not backup_path:
                backup_dir = self.db_path.parent / "backups"
                backup_dir.mkdir(parents=True, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = backup_dir / f"auratrader_backup_{timestamp}.db"

            with self._get_connection() as src_conn:
                dest_conn = sqlite3.connect(str(backup_path))
                src_conn.backup(dest_conn)
                dest_conn.close()

            self.logger.info(f"Database backup created successfully at {backup_path}")
            return backup_path


# Global database instance
db_manager = DatabaseManager()

