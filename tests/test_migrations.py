"""مهاجرت نسخه‌ای از دیتابیس قدیمی به ساختار جاری."""
from __future__ import annotations

from sqlalchemy import create_engine, text

from app import migrations


def test_legacy_schema_migrates_forward_and_is_repeatable(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}", future=True)
    monkeypatch.setattr(migrations, "engine", engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE invoices (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE supplier_bills (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE settlements (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE parties (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE invoice_lines (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE accounts (id INTEGER PRIMARY KEY, code TEXT NOT NULL, "
                          "name TEXT NOT NULL, kind TEXT NOT NULL, nature TEXT NOT NULL, "
                          "parent_code TEXT, report_group TEXT NOT NULL)"))
        conn.execute(text("INSERT INTO accounts (code,name,kind,nature,parent_code,report_group) "
                          "VALUES ('1','دارایی','group','debit',NULL,'asset')"))
        conn.execute(text("INSERT INTO accounts (code,name,kind,nature,parent_code,report_group) "
                          "VALUES ('110201','بانک','ledger','debit','1','bank')"))

    applied = migrations.run_migrations()
    assert applied == list(range(1, 17))
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(accounts)"))}
        assert {"level", "group_type", "report_type"} <= columns
        rows = conn.execute(text("SELECT code,level,group_type,report_type FROM accounts ORDER BY code")).all()
        assert rows[0] == ("1", "group", "permanent", "balance_sheet")
        assert rows[1] == ("110201", "detail", "permanent", "balance_sheet")
        idem_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(idempotency_records)"))}
        assert {"scope_key", "request_hash", "response_body", "created_at"} <= idem_columns
    assert migrations.run_migrations() == []
    engine.dispose()
