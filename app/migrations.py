"""به‌روزرسانی ساختار اطلاعات — نسخه‌دار و فقط رو به جلو.

هر تغییری در ساختار جدول‌ها اینجا ثبت می‌شود، با یک شماره. برنامه موقع بالا آمدن،
نسخه‌ی فعلی را می‌خواند و قدم‌های عقب‌مانده را به ترتیب اجرا می‌کند. هیچ‌وقت ستونی پاک
نمی‌شود و هیچ داده‌ای بازنویسی نمی‌شود؛ فقط ستون تازه اضافه می‌شود.
"""
from __future__ import annotations

from sqlalchemy import text

from .db import app_log, engine

MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "افزودن ستون سازنده به فاکتور، صورتحساب و دریافت/پرداخت",
     "ALTER TABLE invoices ADD COLUMN created_by INTEGER"),
    (2, "", "ALTER TABLE supplier_bills ADD COLUMN created_by INTEGER"),
    (3, "", "ALTER TABLE settlements ADD COLUMN created_by INTEGER"),
    (4, "اطلاعات مالیاتی اشخاص برای سامانه‌ی مودیان", "ALTER TABLE parties ADD COLUMN person_type INTEGER DEFAULT 1"),
    (5, "", "ALTER TABLE parties ADD COLUMN national_id VARCHAR(20) DEFAULT ''"),
    (6, "", "ALTER TABLE parties ADD COLUMN economic_code VARCHAR(20) DEFAULT ''"),
    (7, "", "ALTER TABLE parties ADD COLUMN postal_code VARCHAR(15) DEFAULT ''"),
    (8, "", "ALTER TABLE parties ADD COLUMN passport_no VARCHAR(30) DEFAULT ''"),
    (9, "نوع پرواز برای الگوی بلیت هواپیما", "ALTER TABLE invoice_lines ADD COLUMN flight_type INTEGER"),
    (10, "سطح کدینگ حساب‌ها", "ALTER TABLE accounts ADD COLUMN level VARCHAR(16) NOT NULL DEFAULT 'detail'"),
    (11, "نوع گروه حساب‌ها", "ALTER TABLE accounts ADD COLUMN group_type VARCHAR(16) NOT NULL DEFAULT 'permanent'"),
    (12, "نوع گزارش حساب‌ها", "ALTER TABLE accounts ADD COLUMN report_type VARCHAR(20) NOT NULL DEFAULT 'balance_sheet'"),
    (13, "تبدیل حساب‌های موجود به کدینگ چهارسطحی",
     "UPDATE accounts SET level = CASE "
     "WHEN kind = 'group' AND length(code) <= 1 THEN 'group' "
     "WHEN kind = 'group' AND length(code) <= 2 THEN 'general' "
     "WHEN kind = 'group' THEN 'subsidiary' "
     "WHEN instr(code, '-') > 0 OR length(code) > 5 THEN 'detail' "
     "ELSE 'subsidiary' END, "
     "group_type = CASE WHEN report_group IN ('income','expense','equity_draw') THEN 'temporary' "
     "WHEN report_group IN ('asset','liability','equity','cash','bank','receivable','payable','vat','tax') "
     "THEN 'permanent' ELSE 'other' END, "
     "report_type = CASE WHEN report_group IN ('income','expense','equity_draw') THEN 'income_statement' "
     "WHEN report_group IN ('asset','liability','equity','cash','bank','receivable','payable','vat','tax') "
     "THEN 'balance_sheet' ELSE 'other' END"),
    (14, "ثبت ماندگار کلیدهای جلوگیری از تکرار درخواست",
     "CREATE TABLE IF NOT EXISTS idempotency_records ("
     "id INTEGER PRIMARY KEY, scope_key VARCHAR(64) NOT NULL UNIQUE, "
     "request_hash VARCHAR(64) NOT NULL, response_status INTEGER NOT NULL, "
     "response_content_type VARCHAR(100) NOT NULL DEFAULT 'application/json', "
     "response_body TEXT NOT NULL DEFAULT '{}', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    (15, "افزودن نمایه‌های پاک‌سازی idempotency",
     "CREATE INDEX IF NOT EXISTS ix_idempotency_records_scope_key ON idempotency_records (scope_key)"),
    (16, "افزودن نمایه‌ی تاریخ انقضای idempotency",
     "CREATE INDEX IF NOT EXISTS ix_idempotency_records_created_at ON idempotency_records (created_at)"),
]

_TABLE = "_schema_versions"


def _ensure_version_table(conn) -> None:
    conn.execute(text(f"CREATE TABLE IF NOT EXISTS {_TABLE} (version INTEGER PRIMARY KEY, "
                      "note TEXT, at TEXT)"))


def applied_versions() -> list[int]:
    with engine.begin() as conn:
        _ensure_version_table(conn)
        rows = conn.execute(text(f"SELECT version FROM {_TABLE} ORDER BY version")).fetchall()
    return [r[0] for r in rows]


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def run_migrations() -> list[int]:
    """قدم‌های عقب‌مانده را به ترتیب اجرا می‌کند و فهرست اجراشده‌ها را برمی‌گرداند."""
    done = []
    with engine.begin() as conn:
        _ensure_version_table(conn)
        current = {r[0] for r in conn.execute(text(f"SELECT version FROM {_TABLE}")).fetchall()}
        for version, note, sql in MIGRATIONS:
            if version in current or not sql:
                continue
            # اگر ستون از قبل هست (نسخه‌ی تازه‌ی برنامه آن را ساخته)، فقط ثبت می‌شود
            parts = sql.split()
            if parts[0].upper() == "ALTER" and "COLUMN" in [x.upper() for x in parts]:
                table = parts[2]
                column = parts[[x.upper() for x in parts].index("COLUMN") + 1]
                if _column_exists(conn, table, column):
                    conn.execute(text(f"INSERT INTO {_TABLE} (version, note, at) "
                                      "VALUES (:v, :n, datetime('now'))"),
                                 {"v": version, "n": (note or sql) + " (از قبل موجود بود)"})
                    done.append(version)
                    continue
            try:
                conn.execute(text(sql))
            except Exception as exc:  # noqa: BLE001
                if "duplicate column" in str(exc).lower():
                    # ستون از قبل هست؛ فقط نسخه ثبت می‌شود
                    conn.execute(text(f"INSERT INTO {_TABLE} (version, note, at) "
                                      "VALUES (:v, :n, datetime('now'))"),
                                 {"v": version, "n": (note or sql) + " (از قبل موجود بود)"})
                    done.append(version)
                    continue
                raise
            conn.execute(text(f"INSERT INTO {_TABLE} (version, note, at) "
                              "VALUES (:v, :n, datetime('now'))"), {"v": version, "n": note or sql})
            done.append(version)
    if done:
        app_log.info("به‌روزرسانی ساختار انجام شد",
                     extra={"event": "migration", "extra": str(done)})
    return done
