"""درگاه برنامه (API).

نکته‌های داخلی که رعایت شده‌اند:
- هر ورودی در همین مرز اعتبارسنجی می‌شود؛ به منطق داخلی داده‌ی خام نمی‌رسد.
- خطاها نوع مشخص دارند و پیام فارسی قابل‌فهم برمی‌گردانند.
- هر عملیاتی که تکرار آن ممکن است (ثبت نهایی سند) شناسه‌ی یکتا می‌پذیرد تا دوبار اثر نکند.
- سقف تعداد درخواست وجود دارد (لایه ۰۹).
- خطاهای مدیریت‌نشده با شناسه‌ی پیگیری به فایل هشدار می‌روند (لایه ۱۲).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import re
import shutil
import stat
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from . import backup, config, dates as jd, services as svc
from .db import alert_log, app_log, new_tracking_id, session_scope
from .models import IdempotencyRecord, JournalEntry, Passenger, Session, User
from .money import format_amount_fa, parse_amount
from .rules import DomainError
from .security import (ROLE_LABELS, new_token, role_has, session_expiry,
                       token_fingerprint, verify_password, hash_password, password_problem)

app = FastAPI(
    title="Accounting Platform API",
    description="Enterprise-grade double-entry financial accounting and ERP backend engine.",
    version="1.0.0",
    docs_url="/docs" if config.ENABLE_DOCS else None,
    redoc_url="/redoc" if config.ENABLE_DOCS else None,
)

# برنامه هم‌مبدأ سرو می‌شود؛ CORS به‌صورت پیش‌فرض بسته است و فقط با فهرست صریحِ
# ACCT_CORS_ORIGINS برای پنل جداگانه باز می‌شود. نشست با Bearer token است، نه کوکی.
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

_hits: dict[str, deque] = defaultdict(deque)
_login_fails: dict[str, deque] = defaultdict(deque)
_idempotency_locks: dict[str, asyncio.Lock] = {}
_idempotency_prune_at = 0.0


def _rate_limit(key: str, limit: int, window_sec: int) -> bool:
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > window_sec:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def _cached_auth_error(request: Request, token: str) -> JSONResponse | None:
    """پاسخ ذخیره‌شده را فقط پس از تکرار احراز هویت/مجوز جاری برمی‌گرداند."""
    with session_scope() as sess:
        session_row = sess.execute(select(Session).where(
            Session.token_hash == token_fingerprint(token), Session.closed_at.is_(None)
        )).scalar_one_or_none()
        if session_row is None or session_row.expires_at < datetime.now():
            return JSONResponse({"detail": "نشست شما تمام شده است؛ دوباره وارد شوید."}, status_code=401)
        user = sess.get(User, session_row.user_id)
        if user is None or not user.is_active:
            return JSONResponse({"detail": "حساب کاربری شما غیرفعال است."}, status_code=403)
        if user.must_change_password and request.url.path not in {
                "/api/me", "/api/me/password", "/api/auth/logout"}:
            return JSONResponse({"detail": "برای ادامه، ابتدا رمز موقت را از بخش «تغییر رمز» عوض کنید."},
                                status_code=403)
        role = user.role
        session_row.expires_at = session_expiry(config.SESSION_TTL_HOURS)
    for route in app.router.routes:
        if not hasattr(route, "matches"):
            continue
        match, _scope = route.matches(request.scope)
        if getattr(match, "name", "") != "FULL":
            continue
        for dependency in getattr(getattr(route, "dependant", None), "dependencies", []):
            required = getattr(dependency.call, "__required_permissions__", ())
            if required and not any(role_has(role, permission) for permission in required):
                return JSONResponse({"detail": "برای این کار دسترسی ندارید."}, status_code=403)
        break
    return None


@app.middleware("http")
async def _logging_and_limits(request: Request, call_next):
    global _idempotency_prune_at
    path = request.url.path
    ip = (request.client.host if request.client else "?") or "?"
    if path.startswith("/api/"):
        if not _rate_limit(f"api:{ip}", config.RATE_API_PER_MIN, 60):
            return JSONResponse(
                {"detail": "درخواست‌های شما در این دقیقه زیاد شده است؛ چند لحظه بعد دوباره تلاش کنید."},
                status_code=429,
            )

    started = time.time()
    response = None
    lock = None
    scope_key = None
    request_hash = None
    method = request.method.upper()
    idem = request.headers.get("Idempotency-Key", "").strip()
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    excluded = (path.startswith("/api/auth/") or path == "/api/me/password"
                or path.endswith("/reveal"))
    if (idem and method in {"POST", "PUT", "PATCH", "DELETE"} and path.startswith("/api/")
            and token and not excluded and not request.headers.get("content-type", "").startswith("multipart/")):
        if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", idem):
            response = JSONResponse({"detail": "شناسه‌ی درخواست تکراری نامعتبر است."}, status_code=400)
        else:
            body = await request.body()
            sent = False

            async def replay_body():
                nonlocal sent
                if sent:
                    return {"type": "http.request", "body": b"", "more_body": False}
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}

            # middleware بدنه را برای هش می‌خواند و همان بایت‌ها را دوباره به route می‌دهد.
            request._receive = replay_body
            # HMAC با token خام؛ در پایگاه داده اثرانگشتِ بدنه‌ی رمزهای عبور به‌صورت قابل حدس ذخیره نمی‌شود.
            request_hash = hmac.new(token.encode("utf-8"), body, hashlib.sha256).hexdigest()
            scope_text = "|".join((token_fingerprint(token), method, request.url.path,
                                   request.url.query, idem))
            scope_key = hashlib.sha256(scope_text.encode("utf-8")).hexdigest()
            lock = _idempotency_locks.setdefault(scope_key, asyncio.Lock())
            await lock.acquire()
            try:
                with session_scope() as sess:
                    cached = sess.execute(select(IdempotencyRecord).where(
                        IdempotencyRecord.scope_key == scope_key)).scalar_one_or_none()
                    if (cached is not None and cached.created_at < datetime.now() - timedelta(
                            hours=max(1, config.IDEMPOTENCY_TTL_HOURS))):
                        sess.delete(cached)
                        cached = None
                    if cached is not None:
                        auth_error = _cached_auth_error(request, token)
                        if auth_error is not None:
                            response = auth_error
                        elif cached.request_hash != request_hash:
                            response = JSONResponse(
                                {"detail": "این شناسه‌ی درخواست قبلاً برای داده‌ی دیگری استفاده شده است؛ درخواست تازه بسازید."},
                                status_code=409,
                            )
                        else:
                            response = Response(
                                content=cached.response_body.encode("utf-8"),
                                status_code=cached.response_status,
                                media_type=cached.response_content_type,
                                headers={"Cache-Control": "no-store"},
                            )
                if response is None:
                    response = await call_next(request)
                    content_type = response.headers.get("content-type", "")
                    if 200 <= response.status_code < 300 and content_type.startswith("application/json"):
                        response_body = b"".join([chunk async for chunk in response.body_iterator])
                        if len(response_body) <= 1_000_000:
                            response_text = response_body.decode("utf-8")
                            try:
                                with session_scope() as sess:
                                    current = sess.execute(select(IdempotencyRecord).where(
                                        IdempotencyRecord.scope_key == scope_key)).scalar_one_or_none()
                                    if current is None:
                                        sess.add(IdempotencyRecord(
                                            scope_key=scope_key, request_hash=request_hash,
                                            response_status=response.status_code,
                                            response_content_type="application/json",
                                            response_body=response_text,
                                        ))
                            except Exception as exc:  # noqa: BLE001 — idempotency storage must not hide the API result
                                alert_log.warning("ذخیره‌ی کلید جلوگیری از تکرار ناموفق بود", exc_info=exc,
                                                  extra={"event": "idempotency_store_failed"})
                        response = Response(content=response_body, status_code=response.status_code,
                                            headers=dict(response.headers))
            finally:
                lock.release()
                waiters = getattr(lock, "_waiters", None)
                if not lock.locked() and not waiters and _idempotency_locks.get(scope_key) is lock:
                    _idempotency_locks.pop(scope_key, None)

    if response is None:
        response = await call_next(request)

    # رکوردهای محافظ تکرار فقط ۲۴ ساعت لازم‌اند؛ پایگاه داده نباید برای همیشه رشد کند.
    if time.time() >= _idempotency_prune_at:
        _idempotency_prune_at = time.time() + 3600
        try:
            with session_scope() as sess:
                cutoff = datetime.now() - timedelta(hours=max(1, config.IDEMPOTENCY_TTL_HOURS))
                sess.execute(delete(IdempotencyRecord).where(IdempotencyRecord.created_at < cutoff))
        except Exception as exc:  # noqa: BLE001
            alert_log.warning("پاک‌سازی شناسه‌های درخواست ناموفق بود", exc_info=exc,
                              extra={"event": "idempotency_prune_failed"})

    if path.startswith("/api/") and path not in ("/api/health", "/api/dashboard"):
        app_log.info(
            "request",
            extra={"event": "http", "path": path, "method": request.method,
                   "status": response.status_code, "ip": ip,
                   "extra": f"{int((time.time() - started) * 1000)}ms"},
        )
    return response


@app.exception_handler(DomainError)
async def _domain_error(_req: Request, exc: DomainError):
    return JSONResponse({"detail": exc.message, "code": exc.code}, status_code=400)


@app.exception_handler(Exception)
async def _unexpected_error(_req: Request, exc: Exception):
    tid = new_tracking_id()
    alert_log.error(f"خطای مدیریت‌نشده: {type(exc).__name__}", exc_info=exc,
                    extra={"tracking_id": tid, "event": "unhandled_error"})
    return JSONResponse(
        {"detail": "یک خطای غیرمنتظره پیش آمد و ثبت شد. شماره‌ی پیگیری: " + tid,
         "tracking_id": tid},
        status_code=500,
    )


# ------------------------------------------------------------------ ورود و نشست
def current_user(request: Request, authorization: str | None = Header(default=None)) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, "برای دیدن این بخش باید وارد شوید.")
    with session_scope() as sess:
        row = sess.execute(
            select(Session).where(Session.token_hash == token_fingerprint(token),
                                  Session.closed_at.is_(None))
        ).scalar_one_or_none()
        if row is None or row.expires_at < datetime.now():
            raise HTTPException(401, "نشست شما تمام شده است؛ دوباره وارد شوید.")
        user = sess.get(User, row.user_id)
        if user is None or not user.is_active:
            raise HTTPException(403, "حساب کاربری شما غیرفعال است.")
        if user.must_change_password and request.url.path not in {
                "/api/me", "/api/me/password", "/api/auth/logout"}:
            raise HTTPException(403, "برای ادامه، ابتدا رمز موقت را از بخش «تغییر رمز» عوض کنید.")
        row.expires_at = session_expiry(config.SESSION_TTL_HOURS)
        sess.expunge(user)
        return user


def require(permission: str):
    """دسترسی لازم برای یک کار. با require_any می‌توان «یکی از این‌ها» خواست."""
    return require_any(permission)


def require_any(*permissions: str):
    def dep(user: User = Depends(current_user)) -> User:
        if not any(role_has(user.role, p) for p in permissions):
            raise HTTPException(403, "برای این کار دسترسی ندارید.")
        return user

    dep.__required_permissions__ = tuple(permissions)
    return dep


def _client_ip(request: Request) -> str:
    return (request.client.host if request.client else "") or ""


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request):
    ip = _client_ip(request)
    now = time.time()
    fails = _login_fails[ip]
    while fails and now - fails[0] > 900:
        fails.popleft()
    if len(fails) >= config.RATE_LOGIN_PER_15MIN:
        raise HTTPException(429, "تلاش‌های ناموفق زیاد بوده است؛ ۱۵ دقیقه بعد دوباره امتحان کنید.")
    with session_scope() as sess:
        user = sess.execute(select(User).where(User.username == body.username.strip().lower())
                            ).scalar_one_or_none()
        if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
            fails.append(now)
            app_log.warning("login_failed", extra={"event": "login_failed", "user": body.username,
                                                   "ip": ip})
            raise HTTPException(401, "نام کاربری یا رمز درست نیست.")
        token = new_token()
        sess.add(Session(token_hash=token_fingerprint(token), user_id=user.id,
                         expires_at=session_expiry(config.SESSION_TTL_HOURS)))
        user.last_login_at = datetime.now()
        svc.audit(sess, user, "user.login", "user", str(user.id), "", ip)
        fails.clear()
        return {
            "token": token,
            "user": {"id": user.id, "username": user.username, "full_name": user.full_name,
                     "role": user.role, "role_label": ROLE_LABELS.get(user.role, user.role)},
            "must_change_password": user.must_change_password,
        }


@app.post("/api/auth/logout")
def logout(request: Request, authorization: str | None = Header(default=None),
           user: User = Depends(current_user)):
    if authorization:
        with session_scope() as sess:
            row = sess.execute(select(Session).where(
                Session.token_hash == token_fingerprint(authorization[7:].strip()))).scalar_one_or_none()
            if row:
                row.closed_at = datetime.now()
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id, "username": user.username, "full_name": user.full_name,
        "role": user.role, "role_label": ROLE_LABELS.get(user.role, user.role),
        "must_change_password": bool(user.must_change_password),
        "permissions": sorted(ROLE_PERMISSIONS_FOR(user.role)),
        "today": jd.jalali_long(jd.jtoday()),
    }


def ROLE_PERMISSIONS_FOR(role: str) -> set[str]:
    from .security import ROLE_PERMISSIONS

    perms = ROLE_PERMISSIONS.get(role, set())
    if "*" in perms:
        out = set()
        for p in ROLE_PERMISSIONS.values():
            out |= {x for x in p if x != "*"}
        return out
    return perms


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


@app.post("/api/me/password")
def change_password(body: PasswordIn, request: Request, user: User = Depends(current_user)):
    problem = password_problem(body.new_password)
    if problem:
        raise DomainError(problem)
    with session_scope() as sess:
        db_user = sess.get(User, user.id)
        if not verify_password(body.old_password, db_user.password_hash):
            raise DomainError("رمز فعلی درست نیست.")
        db_user.password_hash = hash_password(body.new_password)
        db_user.must_change_password = False
        for s in sess.execute(select(Session).where(Session.user_id == user.id,
                                                    Session.closed_at.is_(None))).scalars():
            s.closed_at = datetime.now()
        svc.audit(sess, db_user, "user.password_change", "user", str(user.id), "", _client_ip(request))
    return {"ok": True, "message": "رمز عوض شد؛ لطفاً دوباره وارد شوید."}


# ------------------------------------------------------------------ داشبورد
@app.get("/api/dashboard")
def dashboard(user: User = Depends(require("dashboard.view"))):
    with session_scope() as sess:
        return svc.dashboard(sess)


@app.get("/api/health")
def health():
    return {"ok": True, "app": config.APP_NAME, "at": datetime.now().isoformat(timespec="seconds")}


@app.get("/api/admin/storage-health")
def storage_health(user: User = Depends(require("users.manage"))):
    """کنترل سلامت SQLite، دسترسی فایل‌ها، کلید مسافران، فضای دیسک و تازگی پشتیبان."""
    from . import vault

    warnings: list[str] = []
    db_stat = config.DB_PATH.stat() if config.DB_PATH.exists() else None
    try:
        db_check = backup.verify_database(config.DB_PATH)
    except Exception as exc:  # noqa: BLE001
        db_check = {"ok": False, "integrity": "failed", "error": str(exc)}
        warnings.append("آزمون سلامت پایگاه داده ناموفق است.")
    key_path = vault.key_path()
    key_exists = key_path.is_file()
    key_mode = stat.S_IMODE(key_path.stat().st_mode) if key_exists else None
    with session_scope() as sess:
        has_encrypted_pii = sess.execute(select(Passenger.id).where(
            Passenger.national_id.like("enc:v1:%") | Passenger.passport_no.like("enc:v1:%")
        ).limit(1)).first() is not None
        has_plaintext_pii = sess.execute(select(Passenger.id).where(
            ((Passenger.national_id != "") & ~Passenger.national_id.like("enc:v1:%")) |
            ((Passenger.passport_no != "") & ~Passenger.passport_no.like("enc:v1:%"))
        ).limit(1)).first() is not None
    try:
        encryption_check = backup.verify_encryption_pair(config.DB_PATH, key_path)
    except Exception as exc:  # noqa: BLE001
        encryption_check = {"encrypted_values": 0, "ok": False, "error": str(exc)}
        warnings.append("بررسی کلید یا داده‌های رمز‌شده‌ی مسافران ناموفق است.")
    if not vault.crypto_available():
        warnings.append("کتابخانه‌ی رمزنگاری در دسترس نیست.")
    if has_encrypted_pii and not key_exists:
        warnings.append("اطلاعات رمز‌شده‌ی مسافران وجود دارد، اما کلید اصلی پیدا نشد.")
    if has_plaintext_pii:
        warnings.append("اطلاعات هویتی قدیمی یا بدون رمز در پایگاه داده پیدا شد؛ آن را ایمن‌سازی کنید.")
    if key_exists and key_mode is not None and key_mode & 0o077:
        warnings.append("دسترسی فایل کلید رمزنگاری برای گروه/سایر کاربران باز است.")
    backups = backup.list_backups()
    latest_backup_check = None
    if backups:
        try:
            latest_backup_check = backup.verify_backup(backups[0]["file"])
        except Exception as exc:  # noqa: BLE001
            latest_backup_check = {"ok": False, "error": str(exc)}
            warnings.append("بررسی صحت آخرین پشتیبان ناموفق است.")
    age = backup.seconds_since_last_backup()
    if age is None:
        warnings.append("هنوز پشتیبان محلی ساخته نشده است.")
    elif age > max(config.BACKUP_EVERY_HOURS, 1) * 3600 * 2:
        warnings.append("پشتیبان محلی از برنامه‌ی زمانی عقب افتاده است.")
    if latest_backup_check and latest_backup_check.get("checksum_ok") is False:
        warnings.append("checksum آخرین پشتیبان با فایل هم‌خوانی ندارد.")
    usage = shutil.disk_usage(config.DATA_DIR)
    wal_path = Path(str(config.DB_PATH) + "-wal")
    return {
        "ok": bool(db_check.get("ok")) and not warnings,
        "database": {"file": config.DB_PATH.name,
                     "size_mb": round(db_stat.st_size / (1024 * 1024), 2) if db_stat else 0,
                     "permissions": f"{stat.S_IMODE(db_stat.st_mode):04o}" if db_stat else "—",
                     "integrity": db_check.get("integrity", "failed"),
                     "foreign_key_errors": db_check.get("foreign_key_errors", -1),
                     "wal_mb": round(wal_path.stat().st_size / (1024 * 1024), 2) if wal_path.exists() else 0},
        "encryption": {"available": vault.crypto_available(), "key_present": key_exists,
                       "key_permissions": f"{key_mode:04o}" if key_mode is not None else "—",
                       "encrypted_data_present": has_encrypted_pii,
                       "encrypted_values_checked": encryption_check.get("encrypted_values", 0),
                       "plaintext_records_detected": has_plaintext_pii,
                       "plaintext_allowed": config.ALLOW_PLAINTEXT_PII},
        "backups": {"count": len(backups), "last": backups[0] if backups else None,
                    "last_verification": latest_backup_check,
                    "age_hours": round(age / 3600, 1) if age is not None else None,
                    "automatic_enabled": config.BACKUP_ENABLED,
                    "schedule_hours": config.BACKUP_EVERY_HOURS,
                    "retention": config.BACKUP_KEEP},
        "disk": {"free_mb": round(usage.free / (1024 * 1024), 1),
                 "total_mb": round(usage.total / (1024 * 1024), 1)},
        "warnings": warnings,
    }


@app.get("/api/admin/backups")
def admin_backups(user: User = Depends(require("users.manage"))):
    return {"rows": backup.list_backups()}


@app.post("/api/admin/backups")
def create_manual_backup(request: Request, user: User = Depends(require("users.manage"))):
    path = backup.make_backup("manual")
    verified = backup.verify_backup(path)
    with session_scope() as sess:
        svc.audit(sess, user, "backup.create", "backup", path.name,
                  f"پشتیبان دستی ساخته و بررسی شد ({verified['size_bytes']} بایت)", _client_ip(request))
    return {"file": path.name, "size_kb": round(path.stat().st_size / 1024, 1),
            "integrity": verified["integrity"], "checksum_ok": verified["checksum_ok"]}


# ------------------------------------------------------------------ کدینگ حساب‌ها
@app.get("/api/accounts")
def accounts(user: User = Depends(require_any("accounts.view", "journal.create"))):
    """فهرست حساب‌ها.

    کارمندی که سند می‌نویسد باید بتواند حساب انتخاب کند، ولی مانده‌ی حساب‌ها کارِ حسابدار است؛
    پس برای کسی که «accounts.view» ندارد، فهرست بدون مانده فرستاده می‌شود.
    """
    with session_scope() as sess:
        rows = svc.list_accounts(sess)
        sums = svc.account_balances(sess)
        by_code = {a.code: a for a in rows}
        child_counts: dict[str, int] = {}
        for a in rows:
            if a.parent_code:
                child_counts[a.parent_code] = child_counts.get(a.parent_code, 0) + 1
        full = role_has(user.role, "accounts.view")
        out = []
        for a in rows:
            s = sums.get(a.id, {"debit": 0, "credit": 0})
            parent = by_code.get(a.parent_code) if a.parent_code else None
            row = {
                "id": a.id, "code": a.code, "name": a.name, "kind": a.kind,
                "level": a.level, "level_label": svc.ACCOUNT_LEVELS.get(a.level, a.level),
                "nature": a.nature, "parent_code": a.parent_code,
                "parent_name": parent.name if parent else "",
                "group_type": a.group_type,
                "group_type_label": svc.GROUP_TYPES.get(a.group_type, a.group_type),
                "report_type": a.report_type,
                "report_type_label": svc.REPORT_TYPES.get(a.report_type, a.report_type),
                "report_group": a.report_group, "children_count": child_counts.get(a.code, 0),
                "can_post": a.kind == "ledger", "is_active": a.is_active,
                "is_system": a.is_system,
            }
            if full:
                row["balance"] = s["debit"] - s["credit"]
            out.append(row)
        return {"rows": out, "limited": not full,
                "levels": [{"key": k, "label": v} for k, v in svc.ACCOUNT_LEVELS.items()],
                "group_types": [{"key": k, "label": v} for k, v in svc.GROUP_TYPES.items()],
                "report_types": [{"key": k, "label": v} for k, v in svc.REPORT_TYPES.items()],
                "groups": ["asset", "liability", "equity", "income", "expense",
                           "cash", "bank", "receivable", "payable", "vat", "tax", "other"]}


class AccountIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=160)
    nature: str = "debit"
    parent_code: str | None = None
    level: str | None = None
    group_type: str | None = None
    report_type: str | None = None
    report_group: str = "other"


@app.post("/api/accounts")
def create_account(body: AccountIn, request: Request, user: User = Depends(require("accounts.manage"))):
    with session_scope() as sess:
        acc = svc.create_account(sess, user, body.code, body.name, body.nature,
                                 body.parent_code, body.report_group, _client_ip(request),
                                 level=body.level, group_type=body.group_type,
                                 report_type=body.report_type,
                                 enforce_hierarchy=body.level is not None)
        return {"id": acc.id, "code": acc.code, "name": acc.name,
                "level": acc.level, "kind": acc.kind}


@app.patch("/api/accounts/{account_id}")
def patch_account(account_id: int, payload: dict, request: Request,
                  user: User = Depends(require("accounts.manage"))):
    with session_scope() as sess:
        acc = svc.update_account(sess, user, account_id, payload.get("name"),
                                 payload.get("is_active"), payload.get("report_group"),
                                 _client_ip(request), payload.get("group_type"),
                                 payload.get("report_type"), payload.get("nature"))
        return {"id": acc.id, "name": acc.name, "is_active": acc.is_active,
                "group_type": acc.group_type, "report_type": acc.report_type,
                "nature": acc.nature}


# ------------------------------------------------------------------ سند روزنامه
def _entry_json(sess, e: JournalEntry) -> dict:
    labels = svc.label_map(sess)
    lines = [{
        "line_no": l.line_no, "account_id": l.account_id,
        "account_label": labels.get(l.account_id, "?"),
        "debit": l.debit_rial, "credit": l.credit_rial,
        "debit_fa": format_amount_fa(l.debit_rial), "credit_fa": format_amount_fa(l.credit_rial),
        "description": l.description,
    } for l in e.lines]
    debit = sum(l.debit_rial for l in e.lines)
    credit = sum(l.credit_rial for l in e.lines)
    return {
        "id": e.id, "entry_no": e.entry_no, "date": jd.jalali_str(e.entry_date),
        "date_iso": e.entry_date.isoformat(),
        "description": e.description, "status": e.status, "source": e.source,
        "source_ref": e.source_ref, "lines": lines,
        "debit_total": debit, "credit_total": credit,
        "debit_total_fa": format_amount_fa(debit), "credit_total_fa": format_amount_fa(credit),
        "balanced": debit == credit,
        "created_at": e.created_at.strftime("%Y-%m-%d %H:%M") if e.created_at else "",
        "posted_at": e.posted_at.strftime("%Y-%m-%d %H:%M") if e.posted_at else "",
        "reversal_of": e.reversal_of_id, "reversed_by": e.reversed_by_id,
    }


class LineIn(BaseModel):
    account_id: int
    debit: str | int | float | None = 0
    credit: str | int | float | None = 0
    description: str = ""


class EntryIn(BaseModel):
    date: str
    description: str = ""
    lines: list[LineIn]


@app.get("/api/entries")
def entries(user: User = Depends(require_any("journal.view", "journal.view_own")), frm: str | None = None,
            to: str | None = None, status: str | None = None, q: str | None = None,
            limit: int = 200):
    with session_scope() as sess:
        only_creator = None if role_has(user.role, "journal.view_all") else user.id
        f = jd.parse_date_any(frm, jd.jtoday().replace(day=1)) if frm else None
        t = jd.parse_date_any(to, jd.jtoday()) if to else None
        rows = svc.list_entries(sess, f, t, status, q, only_creator, min(limit, 500))
        return {"rows": [_entry_json(sess, e) for e in rows]}


@app.get("/api/entries/{entry_id}")
def entry_detail(entry_id: int,
                 user: User = Depends(require_any("journal.view", "journal.view_own"))):
    with session_scope() as sess:
        e = svc.get_entry(sess, entry_id)
        if not role_has(user.role, "journal.view_all") and e.created_by != user.id:
            raise HTTPException(403, "این سند مربوط به شما نیست.")
        return _entry_json(sess, e)


def _raw_lines(lines: list[LineIn]) -> list[dict]:
    return [{"account_id": l.account_id, "debit": l.debit, "credit": l.credit,
             "description": l.description} for l in lines]


@app.post("/api/entries")
def create_entry(body: EntryIn, request: Request, user: User = Depends(require("journal.create")),
                 idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    with session_scope() as sess:
        e = svc.create_draft(sess, user, jd.parse_date_any(body.date), body.description,
                             _raw_lines(body.lines), idempotency_key=idempotency_key,
                             ip=_client_ip(request))
        return _entry_json(sess, e)


@app.put("/api/entries/{entry_id}")
def update_entry(entry_id: int, body: EntryIn, request: Request,
                 user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        e = svc.update_draft(sess, user, entry_id, jd.parse_date_any(body.date),
                             body.description, _raw_lines(body.lines), _client_ip(request))
        return _entry_json(sess, e)


@app.post("/api/entries/{entry_id}/post")
def post_entry(entry_id: int, request: Request, user: User = Depends(require("journal.post")),
               idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    with session_scope() as sess:
        e = svc.post_entry(sess, user, entry_id, _client_ip(request))
        return _entry_json(sess, e)


class ReverseIn(BaseModel):
    reason: str


@app.post("/api/entries/{entry_id}/reverse")
def reverse_entry(entry_id: int, body: ReverseIn, request: Request,
                  user: User = Depends(require("journal.reverse"))):
    with session_scope() as sess:
        rev = svc.reverse_entry(sess, user, entry_id, body.reason, _client_ip(request))
        return _entry_json(sess, rev)


# ------------------------------------------------------------------ گزارش‌ها
@app.get("/api/reports/trial-balance")
def trial_balance(user: User = Depends(require("reports.view")),
                  frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        return svc.trial_balance(sess, f, t)


@app.get("/api/reports/ledger")
def ledger_report(account_id: int, user: User = Depends(require("reports.view")),
                  frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        return svc.ledger(sess, account_id, f, t)


@app.get("/api/reports/treasury")
def treasury(user: User = Depends(require("cash.view"))):
    with session_scope() as sess:
        data = svc.cash_and_bank(sess)
        for r in data["rows"]:
            r["balance_fa"] = format_amount_fa(r["balance"])
        data["total_fa"] = format_amount_fa(data["total"])
        return data


@app.get("/api/reports/receivables")
def receivables(user: User = Depends(require("reports.view"))):
    with session_scope() as sess:
        data = svc.receivables_payables(sess)
        for r in data["rows"]:
            r["balance_fa"] = format_amount_fa(abs(r["balance"]))
        return data


class TransferIn(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: str | int
    date: str
    description: str = ""


@app.post("/api/treasury/transfer")
def transfer(body: TransferIn, request: Request, user: User = Depends(require("cash.transfer")),
             idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    amount = parse_amount(body.amount)
    with session_scope() as sess:
        e = svc.transfer_money(sess, user, body.from_account_id, body.to_account_id, amount,
                               jd.parse_date_any(body.date), body.description, _client_ip(request))
        return _entry_json(sess, e)


# ------------------------------------------------------------------ دوره‌ها
@app.get("/api/periods")
def periods(user: User = Depends(require("fiscal.view"))):
    with session_scope() as sess:
        rows = svc.list_periods(sess)
        return {"rows": [{"jy": p.jy, "jm": p.jm, "title": f"{jd.MONTHS[p.jm - 1]} {p.jy}",
                          "status": p.status} for p in rows]}


class PeriodIn(BaseModel):
    jy: int
    jm: int


@app.post("/api/periods/close")
def period_close(body: PeriodIn, request: Request, user: User = Depends(require("fiscal.manage"))):
    with session_scope() as sess:
        p = svc.close_period(sess, user, body.jy, body.jm, _client_ip(request))
        return {"jy": p.jy, "jm": p.jm, "status": p.status}


@app.post("/api/periods/reopen")
def period_reopen(body: PeriodIn, request: Request, user: User = Depends(require("fiscal.manage"))):
    with session_scope() as sess:
        p = svc.reopen_period(sess, user, body.jy, body.jm, _client_ip(request))
        return {"jy": p.jy, "jm": p.jm, "status": p.status}


# ------------------------------------------------------------------ کاربران
class UserIn(BaseModel):
    username: str
    full_name: str = ""
    role: str
    password: str


@app.get("/api/users")
def users_list(user: User = Depends(require("users.manage"))):
    with session_scope() as sess:
        rows = sess.execute(select(User).order_by(User.id)).scalars()
        return {"rows": [{"id": u.id, "username": u.username, "full_name": u.full_name,
                          "role": u.role, "role_label": ROLE_LABELS.get(u.role, u.role),
                          "is_active": u.is_active,
                          "last_login": u.last_login_at.strftime("%Y-%m-%d %H:%M") if u.last_login_at else "—"}
                         for u in rows],
                "roles": [{"key": k, "label": v} for k, v in ROLE_LABELS.items()]}


@app.post("/api/users")
def users_create(body: UserIn, request: Request, user: User = Depends(require("users.manage"))):
    problem = password_problem(body.password)
    if problem:
        raise DomainError(problem)
    if body.role not in ROLE_LABELS:
        raise DomainError("نقش انتخابی درست نیست.")
    with session_scope() as sess:
        if sess.execute(select(User).where(User.username == body.username.strip().lower())
                        ).scalar_one_or_none():
            raise DomainError("این نام کاربری قبلاً استفاده شده است.")
        u = User(username=body.username.strip().lower(), full_name=body.full_name.strip(),
                 role=body.role, password_hash=hash_password(body.password),
                 must_change_password=True)
        sess.add(u)
        sess.flush()
        svc.audit(sess, user, "user.create", "user", str(u.id), f"{u.username} ({u.role})",
                  _client_ip(request))
        return {"id": u.id, "username": u.username}


@app.patch("/api/users/{user_id}")
def users_patch(user_id: int, payload: dict, request: Request,
                user: User = Depends(require("users.manage"))):
    with session_scope() as sess:
        u = sess.get(User, user_id)
        if u is None:
            raise DomainError("این کاربر پیدا نشد.")
        if u.id == user.id and payload.get("is_active") is False:
            raise DomainError("نمی‌توانید حساب خودتان را غیرفعال کنید.")
        if "is_active" in payload and payload["is_active"] is not None:
            u.is_active = bool(payload["is_active"])
        if payload.get("role"):
            if payload["role"] not in ROLE_LABELS:
                raise DomainError("نقش انتخابی درست نیست.")
            if u.id == user.id:
                raise DomainError("نقش خودتان را نمی‌توانید عوض کنید.")
            u.role = payload["role"]
        if payload.get("full_name") is not None:
            u.full_name = str(payload["full_name"])[:120]
        svc.audit(sess, user, "user.update", "user", str(u.id), str(payload), _client_ip(request))
        return {"id": u.id, "is_active": u.is_active, "role": u.role}


@app.post("/api/users/{user_id}/reset-password")
def users_reset(user_id: int, payload: dict, request: Request,
                user: User = Depends(require("users.manage"))):
    new_password = str(payload.get("new_password") or "")
    problem = password_problem(new_password)
    if problem:
        raise DomainError(problem)
    with session_scope() as sess:
        u = sess.get(User, user_id)
        if u is None:
            raise DomainError("این کاربر پیدا نشد.")
        u.password_hash = hash_password(new_password)
        u.must_change_password = True
        for s in sess.execute(select(Session).where(Session.user_id == u.id,
                                                    Session.closed_at.is_(None))).scalars():
            s.closed_at = datetime.now()
        svc.audit(sess, user, "user.reset_password", "user", str(u.id), "", _client_ip(request))
        return {"ok": True}


# ------------------------------------------------------------------ ردّ کار
@app.get("/api/audit")
def audit_list(user: User = Depends(require("audit.view")), limit: int = 200):
    from .models import AuditLog

    with session_scope() as sess:
        rows = sess.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500))).scalars()
        return {"rows": [{"at": r.at.strftime("%Y-%m-%d %H:%M"), "username": r.username,
                          "action": r.action, "entity": r.entity, "entity_id": r.entity_id,
                          "detail": r.detail} for r in rows]}


# ------------------------------------------------------------------ خروجی اکسل
from fastapi import File, UploadFile  # noqa: E402

from . import excel_io  # noqa: E402

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(data: bytes, name: str, request: Request, user: User) -> Response:
    """فایل اکسل را با نام فارسی برمی‌گرداند (نام بر اساس استاندارد، تا همه‌ی مرورگرها درست بخوانند)."""
    from urllib.parse import quote

    with session_scope() as sess:
        svc.audit(sess, user, "export.excel", "file", name, name, _client_ip(request))
    disposition = "attachment; filename=export.xlsx; filename*=UTF-8''" + quote(name)
    return Response(
        content=data, media_type=XLSX_MIME,
        headers={"Content-Disposition": disposition, "Cache-Control": "no-store"},
    )


def _jalali_name(kind: str) -> str:
    stamp = jd.jalali_str(jd.jtoday()).replace("/", "-")
    return f"{kind}-{stamp}.xlsx"


@app.get("/api/export/journal.xlsx")
def export_journal(request: Request, user: User = Depends(require_any("journal.view", "journal.view_own")),
                   frm: str | None = None, to: str | None = None, status: str | None = None,
                   q: str | None = None):
    today = jd.jtoday()
    f = jd.parse_date_any(frm, jd.fiscal_year_of(today)[1]) if frm else jd.fiscal_year_of(today)[1]
    t = jd.parse_date_any(to, today) if to else today
    with session_scope() as sess:
        only_creator = None if role_has(user.role, "journal.view_all") else user.id
        rows = svc.list_entries(sess, f, t, status, q, only_creator, 2000)
        labels = svc.label_map(sess)
        codes = {a.id: a.code for a in svc.list_accounts(sess)}
        data = excel_io.export_journal(rows, labels, codes, generated_by=user.username)
    return _xlsx(data, _jalali_name("سند-روزنامه"), request, user)


@app.get("/api/export/accounts.xlsx")
def export_accounts(request: Request, user: User = Depends(require("accounts.view"))):
    with session_scope() as sess:
        data = excel_io.export_accounts(svc.list_accounts(sess), generated_by=user.username)
    return _xlsx(data, _jalali_name("کدینگ-حساب‌ها"), request, user)


@app.get("/api/export/trial.xlsx")
def export_trial(request: Request, user: User = Depends(require("reports.view")),
                 frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    f = jd.parse_date_any(frm, jd.fiscal_year_of(today)[1]) if frm else jd.fiscal_year_of(today)[1]
    t = jd.parse_date_any(to, today) if to else today
    with session_scope() as sess:
        tb = svc.trial_balance(sess, f, t)
        rows = [[r["code"], r["name"], r["debit"] or "", r["credit"] or ""] for r in tb["rows"]]
        rows.append(["", "جمع", tb["total_debit"], tb["total_credit"]])
        data = excel_io.export_table(
            "trial", excel_io.COLUMNS["trial"], rows, generated_by=user.username,
            money_columns={3, 4}, widths=[14, 42, 20, 20],
            extra=[("دوره", f"{tb['from']} تا {tb['to']}"),
                   ("تراز", "بله" if tb["balanced"] else "خیر")])
    return _xlsx(data, _jalali_name("تراز-آزمایشی"), request, user)


@app.get("/api/export/ledger.xlsx")
def export_ledger(account_id: int, request: Request, user: User = Depends(require("reports.view")),
                  frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    f = jd.parse_date_any(frm, jd.fiscal_year_of(today)[1]) if frm else jd.fiscal_year_of(today)[1]
    t = jd.parse_date_any(to, today) if to else today
    with session_scope() as sess:
        d = svc.ledger(sess, account_id, f, t)
        rows = [[r["date"], r["entry_no"] or "—", r["description"], r["debit"] or "", r["credit"] or "",
                 r["running"]] for r in d["rows"]]
        rows.append(["", "", "جمع", d["total_debit"], d["total_credit"], d["closing"]])
        data = excel_io.export_table(
            "ledger", excel_io.COLUMNS["ledger"], rows, generated_by=user.username,
            money_columns={4, 5, 6}, widths=[12, 14, 46, 18, 18, 18],
            extra=[("حساب", f"{d['account']['code']} — {d['account']['name']}"),
                   ("مانده از قبل", str(d["opening"]))])
    return _xlsx(data, _jalali_name("دفتر-حساب"), request, user)


@app.get("/api/export/treasury.xlsx")
def export_treasury(request: Request, user: User = Depends(require("cash.view"))):
    with session_scope() as sess:
        d = svc.cash_and_bank(sess)
        rows = [[r["code"], r["name"], "صندوق" if r["group"] == "cash" else "بانک", r["balance"]]
                for r in d["rows"]]
        rows.append(["", "جمع", "", d["total"]])
        data = excel_io.export_table(
            "treasury", excel_io.COLUMNS["treasury"], rows, generated_by=user.username,
            money_columns={4}, widths=[14, 42, 12, 20])
    return _xlsx(data, _jalali_name("صندوق-و-بانک"), request, user)


@app.get("/api/export/receivables.xlsx")
def export_receivables(request: Request, user: User = Depends(require("reports.view"))):
    labels = {"receivable": "طلب از مشتریان", "cheque_received": "چک دریافتی",
              "prepaid_supplier": "پیش‌پرداخت به تأمین‌کننده", "payable": "بدهی به تأمین‌کنندگان",
              "cheque_paid": "چک پرداختی", "advance_customer": "پیش‌دریافت از مشتریان"}
    with session_scope() as sess:
        d = svc.receivables_payables(sess)
        rows = [[r["code"], r["name"], labels.get(r["group"], r["group"]), abs(r["balance"]),
                 "ما" if r["sign"] == "debit" else ("آن‌ها" if r["sign"] == "credit" else "—")]
                for r in d["rows"]]
        data = excel_io.export_table(
            "receivables", excel_io.COLUMNS["receivables"], rows, generated_by=user.username,
            money_columns={4}, widths=[14, 42, 26, 20, 12])
    return _xlsx(data, _jalali_name("طلب-و-بدهی"), request, user)


@app.get("/api/export/template.xlsx")
def export_template(request: Request, user: User = Depends(require("journal.create")),
                    kind: str = "journal"):
    data = (excel_io.template_accounts(user.username) if kind == "accounts"
            else excel_io.template_journal(user.username))
    name = "فایل-نمونه-کدینگ-حساب‌ها.xlsx" if kind == "accounts" else "فایل-نمونه-سند-روزنامه.xlsx"
    return _xlsx(data, name, request, user)


# ------------------------------------------------------------------ ورودی اکسل
@app.post("/api/import/apply")
async def import_apply(request: Request, kind: str = "journal", allow_duplicates: bool = False,
                       file: UploadFile = File(...),
                       user: User = Depends(require_any("journal.create", "accounts.manage"))):
    if kind == "accounts" and not role_has(user.role, "accounts.manage"):
        raise HTTPException(403, "برای ورود کدینگ حساب‌ها دسترسی ندارید.")
    data = await excel_io.read_upload(file)
    with session_scope() as sess:
        if kind == "accounts":
            return excel_io.apply_accounts_import(sess, user, data, _client_ip(request))
        if kind == "parties":
            return excel_io.apply_parties_import(sess, user, data, _client_ip(request))
        return excel_io.apply_journal_import(sess, user, data, allow_duplicates, _client_ip(request))


# =====================================================================
# فروش خدمات آژانس: اشخاص، سفر، فاکتور، صورتحساب، دریافت و پرداخت
# =====================================================================
from . import sales  # noqa: E402


# نکته‌ی امنیتی: کارمند فروش فاکتور و هزینه را «پیش‌نویس» می‌سازد و فقط مال خودش را می‌بیند؛
# ثبت نهایی، دریافت و پرداخت پول، دیدن سود سفر و دیدن مانده‌ی حساب مشتری‌ها کار حسابدار است.


class PartyIn(BaseModel):
    name: str
    kind: str = "customer"
    phone: str = ""
    note: str = ""
    # اطلاعات مالیاتی — برای صورتحساب الکترونیکی سامانه‌ی مودیان
    person_type: int | None = None          # ۱ حقیقی، ۲ حقوقی
    national_id: str = ""                   # کد ملی (۱۰ رقم) یا شناسه‌ی ملی (۱۱ رقم)
    economic_code: str = ""                 # شماره‌ی اقتصادی (۱۱ یا ۱۴ رقم)
    postal_code: str = ""                   # کد پستی ۱۰ رقم
    passport_no: str = ""                   # برای مسافر غیرایرانی


@app.get("/api/meta/sales")
def sales_meta(user: User = Depends(require_any("journal.create", "journal.view"))):
    with session_scope() as sess:
        return {"service_types": [{"key": k, "label": v["label"]} for k, v in sales.SERVICE_TYPES.items()],
                "vat": sales.list_tax_rates(sess)}


@app.get("/api/tax-rates")
def tax_rates(user: User = Depends(require("accounts.view"))):
    with session_scope() as sess:
        return {"rows": sales.list_tax_rates(sess)}


class TaxRateIn(BaseModel):
    title: str
    rate_percent: float
    from_date: str
    service_type: str | None = None
    note: str = ""


@app.post("/api/tax-rates")
def tax_rate_create(body: TaxRateIn, request: Request,
                    user: User = Depends(require("accounts.manage"))):
    with session_scope() as sess:
        r = sales.create_tax_rate(sess, user, body.title, body.rate_percent,
                                  jd.parse_date_any(body.from_date), body.service_type,
                                  body.note, _client_ip(request))
        return {"id": r.id, "title": r.title, "rate_percent": r.rate_bp / 100}


@app.patch("/api/tax-rates/{rate_id}")
def tax_rate_update(rate_id: int, payload: dict, request: Request,
                    user: User = Depends(require("accounts.manage"))):
    if "from_date" in payload and payload["from_date"]:
        payload["from_date"] = jd.parse_date_any(payload["from_date"])
    with session_scope() as sess:
        r = sales.update_tax_rate(sess, user, rate_id, payload, _client_ip(request))
        return {"id": r.id, "title": r.title, "rate_percent": r.rate_bp / 100,
                "from": jd.jalali_str(r.effective_from), "service_type": r.service_type or ""}


# ---------------------------------------------------------------- اشخاص
@app.get("/api/parties")
def parties(user: User = Depends(require_any("journal.view", "reports.view", "journal.create")),
            kind: str | None = None, q: str | None = None):
    with session_scope() as sess:
        rows = sales.list_parties(sess, kind, q)
        if not role_has(user.role, "reports.view"):
            # کارمند فروش نام و مشخصات را لازم دارد، ولی مانده‌ی حساب مشتری‌ها کار حسابدار است
            rows = [{"id": r["id"], "code": r["code"], "name": r["name"], "kind": r["kind"],
                     "phone": r["phone"], "note": "", "is_active": r["is_active"],
                     "person_type": r["person_type"], "national_id": r["national_id"],
                     "economic_code": r["economic_code"], "postal_code": r["postal_code"],
                     "passport_no": r["passport_no"], "tax_ready": r["tax_ready"],
                     "account_id": r["account_id"], "balance": 0, "balance_label": ""} for r in rows]
            return {"rows": rows, "limited": True}
        for r in rows:
            r["balance_fa"] = format_amount_fa(abs(r["balance"]))
        return {"rows": rows}


@app.post("/api/parties")
def party_create(body: PartyIn, request: Request, user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        p = sales.create_party(
            sess, user, body.name, body.kind, body.phone, body.note, _client_ip(request),
            tax={"person_type": body.person_type, "national_id": body.national_id,
                 "economic_code": body.economic_code, "postal_code": body.postal_code,
                 "passport_no": body.passport_no})
        return {"id": p.id, "code": p.code, "name": p.name, "national_id": p.national_id,
                "economic_code": p.economic_code}


@app.patch("/api/parties/{party_id}")
def party_patch(party_id: int, payload: dict, request: Request,
                user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        p = sales.update_party(sess, user, party_id, payload, _client_ip(request))
        return {"id": p.id, "name": p.name, "is_active": p.is_active,
                "person_type": p.person_type, "national_id": p.national_id,
                "economic_code": p.economic_code, "postal_code": p.postal_code,
                "passport_no": p.passport_no}


# ---------------------------------------------------------------- سفر
class TripIn(BaseModel):
    title: str
    start_date: str
    end_date: str | None = None
    destination: str = ""
    note: str = ""


@app.get("/api/trips")
def trips(user: User = Depends(require_any("journal.view", "reports.view", "journal.create")),
          open_only: bool = False):
    with session_scope() as sess:
        rows = sales.list_trips(sess, include_closed=not open_only)
        if not role_has(user.role, "reports.view"):
            # برای انتخاب سفر در فاکتور، فقط نام و تاریخ لازم است — نه سود و نه فروش
            return {"rows": [{"id": r["id"], "code": r["code"], "title": r["title"],
                              "destination": r["destination"], "start": r["start"],
                              "end": r["end"], "status": r["status"]} for r in rows],
                    "limited": True}
        for r in rows:
            for k in ("revenue", "cost", "profit", "receivable_open", "payable_open"):
                r[k + "_fa"] = format_amount_fa(abs(r[k]))
        return {"rows": rows}


@app.get("/api/trips/{trip_id}")
def trip_detail(trip_id: int, user: User = Depends(require_any("journal.view", "reports.view"))):
    with session_scope() as sess:
        d = sales.trip_detail(sess, trip_id)
        for key in ("revenue", "cost", "profit", "receivable_open", "payable_open"):
            d["totals"][key + "_fa"] = format_amount_fa(abs(d["totals"][key]))
        return d


@app.post("/api/trips")
def trip_create(body: TripIn, request: Request, user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        t = sales.create_trip(sess, user, body.title, jd.parse_date_any(body.start_date),
                              jd.parse_date_any(body.end_date) if body.end_date else None,
                              body.destination, body.note, _client_ip(request))
        return {"id": t.id, "code": t.code, "title": t.title}


# ---------------------------------------------------------------- فاکتور فروش
class InvoiceLineIn(BaseModel):
    service_type: str = "tour"
    description: str = ""
    qty: int = 1
    unit_price: str | int = 0
    discount: str | int = 0
    taxable: bool = True
    flight_type: int | None = None      # برای بلیت: ۱ داخلی، ۲ خارجی


class InvoiceIn(BaseModel):
    party_id: int
    date: str
    due_date: str | None = None
    trip_id: int | None = None
    description: str = ""
    lines: list[InvoiceLineIn]
    issue: bool = False


def _invoice_json(sess, inv) -> dict:
    rows = sales.list_invoices(sess, limit=500)
    for r in rows:
        if r["id"] == inv.id:
            return r
    return {"id": inv.id}


@app.get("/api/invoices")
def invoices(user: User = Depends(require_any("journal.view", "reports.view", "journal.create")),
             party_id: int | None = None, trip_id: int | None = None,
             status: str | None = None, q: str | None = None):
    with session_scope() as sess:
        only_creator = None if role_has(user.role, "journal.view_all") else user.id
        rows = sales.list_invoices(sess, party_id, trip_id, status, q, only_creator=only_creator)
        for r in rows:
            for k in ("subtotal", "discount", "vat", "total", "paid", "open"):
                r[k + "_fa"] = format_amount_fa(r[k])
        return {"rows": rows}


@app.post("/api/invoices")
def invoice_create(body: InvoiceIn, request: Request,
                   user: User = Depends(require("journal.create")),
                   idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    payload_lines = [l.model_dump() for l in body.lines]
    with session_scope() as sess:
        inv = sales.create_invoice(
            sess, user, body.party_id, jd.parse_date_any(body.date), payload_lines,
            body.trip_id, body.description,
            jd.parse_date_any(body.due_date) if body.due_date else None,
            body.issue, _client_ip(request))
        return _invoice_json(sess, inv)


@app.post("/api/invoices/{invoice_id}/issue")
def invoice_issue(invoice_id: int, request: Request,
                  user: User = Depends(require("journal.post"))):
    with session_scope() as sess:
        inv = sales.issue_invoice(sess, user, invoice_id, _client_ip(request))
        return _invoice_json(sess, inv)


class CancelIn(BaseModel):
    reason: str = ""


@app.post("/api/invoices/{invoice_id}/cancel")
def invoice_cancel(invoice_id: int, body: CancelIn, request: Request,
                   user: User = Depends(require("journal.reverse"))):
    with session_scope() as sess:
        inv = sales.cancel_invoice(sess, user, invoice_id, body.reason, _client_ip(request))
        return _invoice_json(sess, inv)


# ---------------------------------------------------------------- صورتحساب تأمین‌کننده
class BillIn(BaseModel):
    party_id: int
    date: str
    due_date: str | None = None
    trip_id: int | None = None
    net: str | int
    vat: str | int | None = None
    expense_account_id: int | None = None
    description: str = ""
    issue: bool = False


def _bill_json(sess, bill) -> dict:
    for r in sales.list_bills(sess, limit=500):
        if r["id"] == bill.id:
            return r
    return {"id": bill.id}


@app.get("/api/bills")
def bills(user: User = Depends(require_any("journal.view", "reports.view", "journal.create")),
          party_id: int | None = None, trip_id: int | None = None, status: str | None = None):
    with session_scope() as sess:
        only_creator = None if role_has(user.role, "journal.view_all") else user.id
        rows = sales.list_bills(sess, party_id, trip_id, status, only_creator=only_creator)
        for r in rows:
            for k in ("net", "vat", "total", "paid", "open"):
                r[k + "_fa"] = format_amount_fa(r[k])
        return {"rows": rows}


@app.post("/api/bills")
def bill_create(body: BillIn, request: Request, user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        vat = None if body.vat is None or str(body.vat).strip() == "" else parse_amount(body.vat)
        bill = sales.create_bill(
            sess, user, body.party_id, jd.parse_date_any(body.date), parse_amount(body.net),
            vat, body.expense_account_id, body.trip_id, body.description,
            jd.parse_date_any(body.due_date) if body.due_date else None, body.issue,
            _client_ip(request))
        return _bill_json(sess, bill)


@app.post("/api/bills/{bill_id}/issue")
def bill_issue(bill_id: int, request: Request, user: User = Depends(require("journal.post"))):
    with session_scope() as sess:
        return _bill_json(sess, sales.issue_bill(sess, user, bill_id, _client_ip(request)))


@app.post("/api/bills/{bill_id}/cancel")
def bill_cancel(bill_id: int, body: CancelIn, request: Request,
                user: User = Depends(require("journal.reverse"))):
    with session_scope() as sess:
        return _bill_json(sess, sales.cancel_bill(sess, user, bill_id, body.reason, _client_ip(request)))


# ---------------------------------------------------------------- دریافت و پرداخت
class SettlementIn(BaseModel):
    direction: str
    party_id: int
    account_id: int
    amount: str | int
    date: str
    trip_id: int | None = None
    description: str = ""
    issue: bool = True


def _settlement_json(sess, s) -> dict:
    for r in sales.list_settlements(sess, limit=500):
        if r["id"] == s.id:
            return r
    return {"id": s.id}


@app.get("/api/settlements")
def settlements(user: User = Depends(require_any("journal.view", "reports.view", "journal.create")),
                direction: str | None = None, party_id: int | None = None,
                trip_id: int | None = None):
    with session_scope() as sess:
        only_creator = None if role_has(user.role, "journal.view_all") else user.id
        rows = sales.list_settlements(sess, direction, party_id, trip_id, only_creator=only_creator)
        for r in rows:
            r["amount_fa"] = format_amount_fa(r["amount"])
        return {"rows": rows}


@app.post("/api/settlements")
def settlement_create(body: SettlementIn, request: Request,
                      user: User = Depends(require("journal.create")),
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    with session_scope() as sess:
        s = sales.create_settlement(sess, user, body.direction, body.party_id, body.account_id,
                                    parse_amount(body.amount), jd.parse_date_any(body.date),
                                    body.trip_id, body.description, body.issue, _client_ip(request))
        return _settlement_json(sess, s)


@app.post("/api/settlements/{settlement_id}/issue")
def settlement_issue(settlement_id: int, request: Request,
                     user: User = Depends(require("journal.post"))):
    with session_scope() as sess:
        s = sales.issue_settlement(sess, user, settlement_id, _client_ip(request))
        return _settlement_json(sess, s)


@app.post("/api/settlements/{settlement_id}/cancel")
def settlement_cancel(settlement_id: int, body: CancelIn, request: Request,
                      user: User = Depends(require("journal.reverse"))):
    with session_scope() as sess:
        s = sales.cancel_settlement(sess, user, settlement_id, body.reason, _client_ip(request))
        return _settlement_json(sess, s)


# ---------------------------------------------------------------- تقویم پول، صف تأیید، سند تکراری
@app.get("/api/calendar")
def calendar(user: User = Depends(require("reports.view")), days: int = 30):
    with session_scope() as sess:
        d = sales.cash_calendar(sess, max(1, min(days, 180)))
        for key in ("total_in", "total_out", "overdue_in", "overdue_out"):
            d[key + "_fa"] = format_amount_fa(d[key])
        for group in ("items", "overdue"):
            for row in d[group]:
                row["amount_fa"] = format_amount_fa(row["amount"])
        return d


@app.get("/api/approvals")
def approvals(user: User = Depends(require("journal.post"))):
    with session_scope() as sess:
        d = sales.approvals(sess)
        for row in d["entries"]:
            row["amount_fa"] = format_amount_fa(row["amount"])
        return d


class RecurringIn(BaseModel):
    title: str
    day_of_month: int = 1
    description: str = ""
    lines: list[LineIn]


@app.get("/api/recurring")
def recurring_list(user: User = Depends(require_any("journal.view", "journal.view_own"))):
    with session_scope() as sess:
        rows = sales.list_recurring(sess)
        for r in rows:
            r["amount_fa"] = format_amount_fa(r["amount"])
        return {"rows": rows}


@app.post("/api/recurring")
def recurring_create(body: RecurringIn, request: Request,
                     user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        r = sales.create_recurring(sess, user, body.title, body.day_of_month,
                                   _raw_lines(body.lines), body.description, _client_ip(request))
        return {"id": r.id, "title": r.title}


@app.post("/api/recurring/{recurring_id}/generate")
def recurring_generate(recurring_id: int, request: Request, jy: int | None = None,
                       jm: int | None = None, user: User = Depends(require("journal.create"))):
    today = jd.jtoday()
    jy = jy or jd.jalali_parts(today)[0]
    jm = jm or jd.jalali_parts(today)[1]
    with session_scope() as sess:
        e = sales.generate_recurring(sess, user, recurring_id, jy, jm, _client_ip(request))
        return {"id": e.id, "date": jd.jalali_str(e.entry_date), "description": e.description,
                "message": f"سند «{e.description}» به‌صورت پیش‌نویس برای {jd.MONTHS[jm - 1]} {jy} ساخته شد."}


@app.patch("/api/recurring/{recurring_id}")
def recurring_patch(recurring_id: int, payload: dict, request: Request,
                    user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        r = sales.toggle_recurring(sess, user, recurring_id, bool(payload.get("is_active", True)),
                                   _client_ip(request))
        return {"id": r.id, "is_active": r.is_active}


# ---------------------------------------------------------------- خروجی اکسل تازه
@app.get("/api/export/parties.xlsx")
def export_parties_file(request: Request,
                        user: User = Depends(require_any("journal.view", "reports.view", "journal.create"))):
    with session_scope() as sess:
        data = excel_io.export_parties(sales.list_parties(sess), user.username)
    return _xlsx(data, _jalali_name("اشخاص"), request, user)


@app.get("/api/export/invoices.xlsx")
def export_invoices_file(request: Request, user: User = Depends(require_any("journal.view", "reports.view")),
                         status: str | None = None, trip_id: int | None = None):
    with session_scope() as sess:
        data = excel_io.export_invoices(sales.list_invoices(sess, None, trip_id, status), user.username)
    return _xlsx(data, _jalali_name("فاکتورها"), request, user)


@app.get("/api/export/bills.xlsx")
def export_bills_file(request: Request, user: User = Depends(require_any("journal.view", "reports.view"))):
    with session_scope() as sess:
        bills_rows = sales.list_bills(sess)
        rows = [[b["number"] or "—", b["date"], b["due"], b["party"],
                 b["trip"], b["description"], b["expense_account"], b["net"], b["vat"],
                 b["total"], b["paid"], b["open"],
                 {"draft": "پیش‌نویس", "issued": "صادرشده", "cancelled": "ابطال‌شده"}.get(b["status"], b["status"])]
                for b in bills_rows]
        data = excel_io.export_table(
            "bills", ["شماره", "تاریخ", "سررسید", "تأمین‌کننده", "سفر", "شرح", "حساب هزینه",
                      "مبلغ بدون مالیات", "مالیات", "جمع", "پرداخت‌شده", "مانده", "وضعیت"],
            rows, user.username, money_columns={8, 9, 10, 11, 12},
            widths=[16, 12, 12, 26, 22, 34, 24, 18, 14, 18, 18, 18, 12],
            extra=[("تعداد ردیف", str(len(rows)))])
    return _xlsx(data, _jalali_name("صورتحساب-تأمین‌کنندگان"), request, user)


@app.get("/api/export/settlements.xlsx")
def export_settlements_file(request: Request,
                            user: User = Depends(require_any("journal.view", "reports.view")),
                            direction: str | None = None):
    with session_scope() as sess:
        data = excel_io.export_settlements(sales.list_settlements(sess, direction), user.username)
    return _xlsx(data, _jalali_name("دریافت-و-پرداخت"), request, user)


@app.get("/api/export/trips.xlsx")
def export_trips_file(request: Request, user: User = Depends(require_any("journal.view", "reports.view"))):
    with session_scope() as sess:
        data = excel_io.export_trips(sales.list_trips(sess), user.username)
    return _xlsx(data, _jalali_name("پرونده-سفرها"), request, user)


@app.get("/api/export/calendar.xlsx")
def export_calendar_file(request: Request, user: User = Depends(require("reports.view")),
                         days: int = 30):
    with session_scope() as sess:
        d = sales.cash_calendar(sess, max(1, min(days, 180)))
        rows = d["overdue"] + d["items"]
        for r in rows:
            r["days_left"] = (jd.parse_date_any(r["date"]) - jd.jtoday()).days
        data = excel_io.export_calendar(rows, user.username, period=f"{d['from']} تا {d['to']}")
    return _xlsx(data, _jalali_name("تقویم-پول"), request, user)


# ورودی اشخاص از فایل
@app.post("/api/import/preview")
async def import_preview_parties(request: Request, kind: str = "journal",
                                 file: UploadFile = File(...),
                                 user: User = Depends(require_any("journal.create", "accounts.manage"))):
    data = await excel_io.read_upload(file)
    with session_scope() as sess:
        if kind == "accounts":
            return excel_io.prepare_accounts_import(sess, data)
        if kind == "parties":
            return excel_io.prepare_parties_import(sess, data)
        return excel_io.prepare_journal_import(sess, data)


# =====================================================================
# فاز ۳: حقوق و دستمزد
# =====================================================================
from . import payroll  # noqa: E402

PAYROLL_ROLES = ("users.manage", "fiscal.manage")   # مدیر سیستم و حسابدار


def require_payroll():
    return require_any("payroll.manage", "payroll.view")


@app.get("/api/payroll/employees")
def payroll_employees(user: User = Depends(require_any("payroll.view", "payroll.manage")),
                      text: str | None = None):
    with session_scope() as sess:
        rows = payroll.list_employees(sess, text=text)
        for r in rows:
            r["fixed_total_fa"] = format_amount_fa(r["fixed_total"])
            r["loan_remaining_fa"] = format_amount_fa(r["loan_remaining"])
        return {"rows": rows}


@app.get("/api/payroll/employees/{employee_id}")
def payroll_employee_detail(employee_id: int,
                            user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        return payroll.employee_detail(sess, employee_id)


class EmployeeIn(BaseModel):
    name: str
    position: str = ""
    hire_date: str
    contract_type: str = "permanent"
    work_days: int = 30
    note: str = ""
    items: list[dict] = []


@app.post("/api/payroll/employees")
def payroll_employee_create(body: EmployeeIn, request: Request,
                            user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        emp = payroll.create_employee(sess, user, body.name, body.position,
                                      jd.parse_date_any(body.hire_date), body.contract_type,
                                      body.work_days, body.items, body.note, _client_ip(request))
        return {"id": emp.id, "code": emp.code, "name": emp.name}


@app.patch("/api/payroll/employees/{employee_id}")
def payroll_employee_patch(employee_id: int, payload: dict, request: Request,
                           user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        if "items" in payload:
            payroll.set_employee_items(sess, user, employee_id, payload.pop("items"), _client_ip(request))
        emp = payroll.update_employee(sess, user, employee_id, payload, _client_ip(request))
        return {"id": emp.id, "name": emp.name, "is_active": emp.is_active}


@app.get("/api/payroll/items")
def payroll_items(user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        return {"rows": payroll.list_items(sess)}


class PayItemIn(BaseModel):
    title: str
    kind: str = "earning"
    insurable: bool = True
    taxable: bool = True
    exempt_ceiling: int = 0
    note: str = ""


@app.post("/api/payroll/items")
def payroll_item_create(body: PayItemIn, request: Request,
                        user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        item = payroll.create_item(sess, user, body.title, body.kind, body.insurable,
                                   body.taxable, body.exempt_ceiling, body.note, _client_ip(request))
        return {"id": item.id, "code": item.code, "title": item.title}


@app.patch("/api/payroll/items/{item_id}")
def payroll_item_patch(item_id: int, payload: dict, request: Request,
                       user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        item = payroll.update_item(sess, user, item_id, payload, _client_ip(request))
        return {"id": item.id, "title": item.title, "insurable": item.insurable,
                "taxable": item.taxable}


@app.get("/api/payroll/settings")
def payroll_settings(user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        return {"rows": payroll.list_settings(sess)}


class PayrollSettingsIn(BaseModel):
    year: int
    employee_percent: float
    employer_percent: float
    unemployment_percent: float
    brackets: list[dict] = []
    source_note: str = ""
    standard_monthly_hours: int = 220
    overtime_coefficient: float = 1.4


@app.post("/api/payroll/settings")
def payroll_settings_save(body: PayrollSettingsIn, request: Request,
                          user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        row = payroll.save_settings(sess, user, body.year, body.employee_percent,
                                    body.employer_percent, body.unemployment_percent,
                                    body.brackets, body.source_note,
                                    body.standard_monthly_hours, body.overtime_coefficient,
                                    _client_ip(request))
        return {"id": row.id, "year": row.year, "is_confirmed": row.is_confirmed}


@app.post("/api/payroll/settings/{year}/confirm")
def payroll_settings_confirm(year: int, request: Request, payload: dict | None = None,
                             user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        row = payroll.confirm_settings(sess, user, year, (payload or {}).get("note", ""),
                                      _client_ip(request))
        return {"year": row.year, "is_confirmed": row.is_confirmed,
                "message": f"اعداد قانونی سال {row.year} تأیید شد."}


@app.get("/api/payroll/runs")
def payroll_runs(user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        rows = payroll.list_runs(sess)
        for r in rows:
            for k in ("gross", "insurance_employee", "insurance_employer", "tax", "loan", "net"):
                r[k + "_fa"] = format_amount_fa(r[k])
        return {"rows": rows}


@app.get("/api/payroll/runs/{run_id}")
def payroll_run_detail(run_id: int, user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        return payroll.run_detail(sess, run_id)


class PayrollRunIn(BaseModel):
    jy: int
    jm: int
    employees: list[int] | None = None
    overtime: dict | None = None


@app.post("/api/payroll/runs")
def payroll_run_create(body: PayrollRunIn, request: Request,
                       user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        run = payroll.create_run(sess, user, body.jy, body.jm, body.employees, body.overtime,
                                 _client_ip(request))
        d = payroll.run_detail(sess, run.id)
        return {"id": run.id, "number": run.number, "period": d["period"], "totals": d["totals"],
                "rules": d["rules"], "message": f"لیست حقوق {d['period']} حساب شد."}


@app.post("/api/payroll/runs/{run_id}/post")
def payroll_run_post(run_id: int, request: Request, user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        run = payroll.post_run(sess, user, run_id, _client_ip(request))
        return {"id": run.id, "status": run.status,
                "message": f"سند حقوق {run.number} ثبت شد."}


class PayrollPayIn(BaseModel):
    account_id: int
    date: str | None = None


@app.post("/api/payroll/runs/{run_id}/pay")
def payroll_run_pay(run_id: int, body: PayrollPayIn, request: Request,
                    user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        run = payroll.pay_run(sess, user, run_id, body.account_id,
                              jd.parse_date_any(body.date) if body.date else None,
                              _client_ip(request))
        return {"id": run.id, "status": run.status,
                "message": f"پرداخت حقوق {run.number} ثبت شد."}


@app.post("/api/payroll/runs/{run_id}/cancel")
def payroll_run_cancel(run_id: int, body: CancelIn, request: Request,
                       user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        run = payroll.cancel_run(sess, user, run_id, body.reason, _client_ip(request))
        return {"id": run.id, "status": run.status,
                "message": "لیست حقوق برگشت داده شد؛ سندها ابطال شدند."}


@app.get("/api/payroll/runs/{run_id}/payslip/{employee_id}")
def payroll_payslip(run_id: int, employee_id: int,
                    user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        d = payroll.payslip(sess, run_id, employee_id)
        for key in ("gross", "insurance_employee", "insurance_employer", "unemployment",
                    "tax", "loan", "other_deduction", "net"):
            d[key + "_fa"] = format_amount_fa(d[key])
        for e in d["earnings"]:
            e["amount_fa"] = format_amount_fa(e["amount"])
        return d


# ---------------------------------------------------------------- مساعده و وام
@app.get("/api/payroll/loans")
def payroll_loans(user: User = Depends(require_any("payroll.view", "payroll.manage")),
                  employee_id: int | None = None, status: str | None = "open"):
    with session_scope() as sess:
        rows = payroll.list_loans(sess, employee_id, status)
        for r in rows:
            for k in ("amount", "paid", "remaining", "monthly", "paid_out"):
                r[k + "_fa"] = format_amount_fa(r[k])
        return {"rows": rows}


class LoanIn(BaseModel):
    employee_id: int
    amount: str | int
    kind: str = "advance"
    installments: int = 1
    date: str | None = None
    description: str = ""
    pay_now_from: int | None = None


@app.post("/api/payroll/loans")
def payroll_loan_create(body: LoanIn, request: Request,
                        user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        loan = payroll.create_loan(sess, user, body.employee_id, parse_amount(body.amount),
                                   body.kind, body.installments,
                                   jd.parse_date_any(body.date) if body.date else None,
                                   body.description, body.pay_now_from, _client_ip(request))
        return {"id": loan.id, "number": loan.number,
                "message": f"{'مساعده' if loan.kind == 'advance' else 'وام'} {loan.number} ثبت شد."}


@app.post("/api/payroll/loans/{loan_id}/cancel")
def payroll_loan_cancel(loan_id: int, body: CancelIn, request: Request,
                        user: User = Depends(require("payroll.manage"))):
    with session_scope() as sess:
        loan = payroll.cancel_loan(sess, user, loan_id, body.reason, _client_ip(request))
        return {"id": loan.id, "status": loan.status, "message": "مساعده/وام ابطال شد."}


# ---------------------------------------------------------------- خروجی‌های قانونی
@app.get("/api/export/employees.xlsx")
def export_employees(request: Request,
                     user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    """فهرست کارکنان و حکم حقوقی‌شان: هر قلم یک ستون."""
    with session_scope() as sess:
        rows = payroll.list_employees(sess)
        detail = {r["id"]: payroll.employee_detail(sess, r["id"]) for r in rows}
        earn_codes = []
        for r in rows:
            for it in detail[r["id"]]["items"]:
                if it["code"] and it["code"] not in earn_codes:
                    earn_codes.append(it["code"])
        titles = {i["code"]: i["title"] for i in payroll.list_items(sess, include_inactive=True)}
        headers = (["کد کارمند", "نام", "سمت", "نوع قرارداد", "تاریخ استخدام", "روز کارکرد"]
                   + [titles.get(c, c) for c in earn_codes]
                   + ["جمع اقلام حکم", "مانده مساعده/وام", "وضعیت"])
        data_rows = []
        for r in rows:
            mine = {it["code"]: it["amount"] for it in detail[r["id"]]["items"]}
            data_rows.append([r["code"], r["name"], r["position"], r["contract_label"], r["hire_date"],
                              r["work_days"]] + [mine.get(c, 0) for c in earn_codes]
                             + [r["fixed_total"], r["loan_remaining"],
                                "فعال" if r["is_active"] else "غیرفعال"])
        money_cols = {6 + i for i in range(len(earn_codes) + 2)}
        data = excel_io.export_table(
            "employees", headers, data_rows, user.username, money_columns=money_cols,
            extra=[("تعداد کارکنان", str(len(rows))),
                   ("نکته", "این فایل فقط برای بازبینی حسابدار است؛ برای تغییر حکم حقوقی از خود برنامه استفاده کنید.")])
    return _xlsx(data, "کارکنان-و-حکم-حقوقی.xlsx", request, user)


@app.get("/api/export/payroll.xlsx")
def export_payroll(request: Request, run_id: int,
                   user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    with session_scope() as sess:
        d = payroll.run_detail(sess, run_id)
        rows = []
        for r in d["rows"]:
            rows.append([r["code"], r["employee"], r["work_days"],
                         next((e["amount"] for e in r["earnings"] if e["code"] == "BASE"), 0),
                         sum(e["amount"] for e in r["earnings"] if e["code"] in ("HOUSING", "FOOD", "CHILD", "BONUS")),
                         r["overtime_hours"], r["gross"], r["insurable_base"], r["taxable_base"],
                         r["insurance_employee"], r["insurance_employer"] + r["unemployment"],
                         r["tax"], r["loan"], r["net"]])
        rows.append(["", "جمع", "", "", "", "", d["totals"]["gross"], "", "",
                     d["totals"]["insurance_employee"], d["totals"]["insurance_employer"],
                     d["totals"]["tax"], d["totals"]["loan"], d["totals"]["net"]])
        headers = ["کد کارمند", "نام", "روز کارکرد", "حقوق پایه", "مزایا", "ساعت اضافه‌کاری",
                   "جمع حقوق", "مشمول بیمه", "مشمول مالیات", "بیمه سهم کارمند",
                   "بیمه سهم کارفرما", "مالیات حقوق", "کسر مساعده/وام", "خالص پرداختی"]
        data = excel_io.export_table(
            "payroll", headers, rows, user.username,
            money_columns={4, 5, 7, 8, 9, 10, 11, 12, 13, 14},
            widths=[12, 26, 12, 18, 16, 14, 18, 18, 18, 20, 20, 18, 18, 18],
            extra=[("دوره", d["period"]), ("شماره لیست", d["number"] or "—"),
                   ("درصد بیمه سهم کارمند", str(d["rules"]["insurance_employee_percent"]) + "٪"),
                   ("درصد بیمه سهم کارفرما", str(d["rules"]["insurance_employer_percent"]) + "٪"),
                   ("اعداد قانونی تأییدشده", "بله" if d["rules"]["confirmed"] else "خیر — باید تأیید شود")])
    return _xlsx(data, f"لیست-حقوق-{d['period'].replace(' ', '-')}.xlsx", request, user)


@app.get("/api/export/payroll-insurance.xlsx")
def export_payroll_insurance(request: Request, run_id: int,
                             user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    """کاربرگ بیمه: همان چیزی که برای ارسال به تأمین اجتماعی لازم است."""
    with session_scope() as sess:
        d = payroll.run_detail(sess, run_id)
        rows = [[r["code"], r["employee"], r["work_days"], r["insurable_base"],
                 r["insurance_employee"], r["insurance_employer"] + r["unemployment"]] for r in d["rows"]]
        rows.append(["", "جمع", "", sum(r["insurable_base"] for r in d["rows"]),
                     d["totals"]["insurance_employee"], d["totals"]["insurance_employer"]])
        data = excel_io.export_table(
            "payroll_insurance",
            ["کد کارمند", "نام", "روز کارکرد", "مشمول بیمه", "سهم کارمند", "سهم کارفرما"],
            rows, user.username, money_columns={4, 5, 6}, widths=[12, 26, 12, 20, 18, 18],
            extra=[("دوره", d["period"]),
                   ("نکته", "ابعاد و تعداد سطرها با بخشنامه‌ی جاری سازمان تأمین اجتماعی تطبیق داده شود.")])
    return _xlsx(data, f"کاربرگ-بیمه-{d['period'].replace(' ', '-')}.xlsx", request, user)


@app.get("/api/export/payroll-tax.xlsx")
def export_payroll_tax(request: Request, run_id: int,
                       user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    """کاربرگ مالیات حقوق، همراه با پله‌هایی که محاسبه بر اساسشان انجام شده."""
    with session_scope() as sess:
        d = payroll.run_detail(sess, run_id)
        rows = [[r["code"], r["employee"], r["taxable_base"], r["tax"]] for r in d["rows"]]
        rows.append(["", "جمع", sum(r["taxable_base"] for r in d["rows"]), d["totals"]["tax"]])
        _bracket_rows = [[("بی‌نهایت" if b["up_to"] is None else b["up_to"]), b["rate_bp"] / 100]
                        for b in d["rules"]["brackets"]]
        data = excel_io.export_table(
            "payroll_tax", ["کد کارمند", "نام", "مشمول مالیات", "مالیات"],
            rows, user.username, money_columns={3, 4}, widths=[12, 26, 20, 18],
            extra=[("دوره", d["period"]),
                   ("پله‌ها (تا مبلغ / نرخ)", "؛ ".join(
                       [f"{'بی‌نهایت' if b['up_to'] is None else format_amount_fa(b['up_to'])} → {b['rate_bp']/100}٪"
                        for b in d["rules"]["brackets"]]))])
    return _xlsx(data, f"کاربرگ-مالیات-حقوق-{d['period'].replace(' ', '-')}.xlsx", request, user)


@app.get("/api/export/tax-brackets.xlsx")
def export_tax_brackets(request: Request, user: User = Depends(require_any("payroll.view", "payroll.manage"))):
    """پله‌های مالیات و درصدهای بیمه، برای اینکه حسابدار تطبیقش را امضا کند."""
    with session_scope() as sess:
        rows = []
        for s in payroll.list_settings(sess):
            for b in s["brackets"]:
                rows.append([s["year"], ("بی‌نهایت" if b["up_to"] is None else b["up_to"]),
                             b["rate_bp"] / 100, s["insurance_employee_percent"],
                             s["insurance_employer_percent"],
                             "تأییدشده" if s["is_confirmed"] else "تأییدنشده", s["source_note"]])
        data = excel_io.export_table(
            "tax_brackets",
            ["سال", "تا مبلغ (ریال)", "نرخ مالیات ٪", "بیمه سهم کارمند ٪", "بیمه سهم کارفرما ٪",
             "وضعیت تأیید", "منبع"],
            rows, user.username, money_columns={2}, widths=[10, 20, 14, 20, 20, 14, 50])
    return _xlsx(data, "اعداد-قانونی-حقوق.xlsx", request, user)


# =====================================================================
# فاز ۴: دارایی ثابت، بستن سال، صورت‌های مالی
# =====================================================================
from . import assets as assets_mod, statements  # noqa: E402


@app.get("/api/assets")
def asset_list(user: User = Depends(require("assets.view")), status: str | None = "active",
               q: str | None = None):
    with session_scope() as sess:
        rows = assets_mod.list_assets(sess, status, q)
        for r in rows:
            for key in ("cost", "salvage", "accumulated", "book_value", "disposal_amount"):
                r[key + "_fa"] = format_amount_fa(r[key])
        return {"rows": rows, "summary": assets_mod.summary(sess)}


@app.get("/api/assets/categories")
def asset_categories(user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        return {"rows": assets_mod.list_categories(sess)}


class AssetCategoryIn(BaseModel):
    title: str
    method: str = "declining"
    annual_rate_percent: float = 25
    useful_life_months: int = 48
    asset_account_id: int
    accumulation_account_id: int
    expense_account_id: int | None = None
    source_note: str = ""


@app.post("/api/assets/categories")
def asset_category_create(body: AssetCategoryIn, request: Request,
                          user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        cat = assets_mod.create_category(sess, user, body.title, body.method,
                                         body.annual_rate_percent, body.useful_life_months,
                                         body.asset_account_id, body.accumulation_account_id,
                                         body.expense_account_id, body.source_note,
                                         _client_ip(request))
        return {"id": cat.id, "title": cat.title}


@app.patch("/api/assets/categories/{category_id}")
def asset_category_patch(category_id: int, payload: dict, request: Request,
                         user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        cat = assets_mod.update_category(sess, user, category_id, payload, _client_ip(request))
        return {"id": cat.id, "title": cat.title, "method": cat.method,
                "annual_rate_percent": cat.annual_rate_bp / 100}


@app.get("/api/assets/{asset_id}")
def asset_detail(asset_id: int, user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        d = assets_mod.asset_detail(sess, asset_id)
        for key in ("cost", "salvage", "accumulated", "book_value"):
            d["asset"][key + "_fa"] = format_amount_fa(d["asset"][key])
        for row in d["history"]:
            row["amount_fa"] = format_amount_fa(row["amount"])
        for row in d["schedule"]:
            row["amount_fa"] = format_amount_fa(row["amount"])
            row["book_value_fa"] = format_amount_fa(row["book_value"])
        return d


class AssetIn(BaseModel):
    title: str
    category_id: int
    purchase_date: str
    in_service_date: str | None = None
    cost: str | int
    salvage: str | int = 0
    useful_life_months: int | None = None
    method: str | None = None
    annual_rate_percent: float | None = None
    note: str = ""
    counter_account_id: int | None = None


@app.post("/api/assets")
def asset_create(body: AssetIn, request: Request, user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        asset = assets_mod.create_asset(
            sess, user, body.title, body.category_id, jd.parse_date_any(body.purchase_date),
            jd.parse_date_any(body.in_service_date) if body.in_service_date else None,
            parse_amount(body.cost), parse_amount(body.salvage), body.useful_life_months,
            body.method, body.annual_rate_percent, body.note, body.counter_account_id,
            _client_ip(request))
        return {"id": asset.id, "code": asset.code,
                "message": f"دارایی {asset.code} ثبت شد."}


@app.patch("/api/assets/{asset_id}")
def asset_patch(asset_id: int, payload: dict, request: Request,
                user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        asset = assets_mod.update_asset(sess, user, asset_id, payload, _client_ip(request))
        return {"id": asset.id, "title": asset.title, "cost": asset.cost_rial}


class DisposalIn(BaseModel):
    date: str
    amount: str | int = 0
    account_id: int | None = None
    reason: str = ""


@app.post("/api/assets/{asset_id}/dispose")
def asset_dispose(asset_id: int, body: DisposalIn, request: Request,
                  user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        asset = assets_mod.dispose_asset(sess, user, asset_id, jd.parse_date_any(body.date),
                                        parse_amount(body.amount), body.account_id, body.reason,
                                        _client_ip(request))
        return {"id": asset.id, "status": asset.status,
                "message": f"{'فروش' if asset.status == 'sold' else 'کنارگذاری'} ثبت شد و سندش خورد."}


@app.get("/api/depreciation/runs")
def depreciation_runs(user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        rows = assets_mod.list_runs(sess)
        for r in rows:
            r["total_fa"] = format_amount_fa(r["total"])
        return {"rows": rows}


@app.get("/api/depreciation/runs/{run_id}")
def depreciation_run_detail(run_id: int, user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        d = assets_mod.run_detail(sess, run_id)
        d["entry_id"] = sess.get(__import__("app.models", fromlist=["DepreciationRun"]).DepreciationRun, run_id).entry_id
        d["total_fa"] = format_amount_fa(d["total"])
        for r in d["rows"]:
            r["amount_fa"] = format_amount_fa(r["amount"])
            r["book_value_after_fa"] = format_amount_fa(r["book_value_after"])
        return d


class DepreciationIn(BaseModel):
    jy: int
    jm: int


@app.post("/api/depreciation/runs")
def depreciation_create(body: DepreciationIn, request: Request,
                        user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        run = assets_mod.create_run(sess, user, body.jy, body.jm, _client_ip(request))
        d = assets_mod.run_detail(sess, run.id)
        return {"id": run.id, "number": run.number, "period": d["period"], "total": d["total"],
                "status": run.status, "entry_id": run.entry_id, "rows": d["rows"],
                "message": f"استهلاک {d['period']} حساب شد."}


@app.post("/api/depreciation/runs/{run_id}/post")
def depreciation_post(run_id: int, request: Request, user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        run = assets_mod.post_run(sess, user, run_id, _client_ip(request))
        return {"id": run.id, "status": run.status,
                "message": f"سند استهلاک {run.number} ثبت شد."}


@app.post("/api/depreciation/runs/{run_id}/cancel")
def depreciation_cancel(run_id: int, body: CancelIn, request: Request,
                        user: User = Depends(require("assets.manage"))):
    with session_scope() as sess:
        run = assets_mod.cancel_run(sess, user, run_id, body.reason, _client_ip(request))
        return {"id": run.id, "status": run.status,
                "message": "سند استهلاک ابطال شد و استهلاک انباشته برگشت."}


# ---------------------------------------------------------------- صورت‌های مالی
@app.get("/api/reports/income-statement")
def report_income_statement(user: User = Depends(require("reports.view")),
                            frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        d = statements.income_statement(sess, f, t)
        for row in d["revenue_rows"] + d["expense_rows"]:
            row["amount_fa"] = format_amount_fa(row["amount"])
        for key in ("total_revenue", "total_expense", "profit"):
            d[key + "_fa"] = format_amount_fa(d[key])
        return d


@app.get("/api/reports/balance-sheet")
def report_balance_sheet(user: User = Depends(require("reports.view")), to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        d = statements.balance_sheet(sess, t)
        for row in d["assets"] + d["liabilities"] + d["equity"]:
            row["amount_fa"] = format_amount_fa(row["amount"])
        for key in ("total_assets", "total_liabilities", "total_equity", "open_profit", "difference"):
            d[key + "_fa"] = format_amount_fa(d[key])
        return d


@app.get("/api/reports/cash-flow")
def report_cash_flow(user: User = Depends(require("reports.view")),
                     frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        d = statements.cash_flow(sess, f, t)
        for section in ("operating", "investing", "financing"):
            for row in d[section]:
                row["amount_fa"] = format_amount_fa(row["amount"])
        for key in ("opening_cash", "closing_cash", "change", "total_operating",
                    "total_investing", "total_financing", "net"):
            d[key + "_fa"] = format_amount_fa(d[key])
        return d


@app.get("/api/fiscal/years")
def fiscal_years(user: User = Depends(require("fiscal.view"))):
    with session_scope() as sess:
        rows = statements.fiscal_years(sess)
        for r in rows:
            r["profit_fa"] = format_amount_fa(r["profit"]) if r["profit"] is not None else ""
        return {"rows": rows, "current": jd.fiscal_year_of(jd.jtoday())[0]}


class CloseYearIn(BaseModel):
    jy: int
    note: str = ""


@app.post("/api/fiscal/close-year")
def fiscal_close_year(body: CloseYearIn, request: Request,
                      user: User = Depends(require("fiscal.manage"))):
    with session_scope() as sess:
        closing = statements.close_year(sess, user, body.jy, body.note, _client_ip(request))
        return {"jy": closing.jy, "profit": closing.profit_rial, "profit_fa": format_amount_fa(closing.profit_rial),
                "message": f"سال {closing.jy} بسته شد و سود (زیان) به سود و زیان انباشته منتقل شد."}


@app.post("/api/fiscal/reopen-year")
def fiscal_reopen_year(body: CloseYearIn, request: Request,
                       user: User = Depends(require("fiscal.manage"))):
    with session_scope() as sess:
        statements.reopen_year(sess, user, body.jy, body.note, _client_ip(request))
        return {"jy": body.jy, "message": f"سال {body.jy} باز شد؛ سند اختتامیه ابطال شد."}


# ---------------------------------------------------------------- خروجی‌های اکسل فاز ۴
@app.get("/api/export/assets.xlsx")
def export_assets(request: Request, user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        rows = assets_mod.list_assets(sess, status="all")
        s = assets_mod.summary(sess)
        data_rows = [[r["code"], r["title"], r["category"], r["purchase_date"], r["in_service_date"],
                      r["cost"], r["accumulated"], r["book_value"], r["method_label"],
                      r["annual_rate_percent"], r["useful_life_months"],
                      {"active": "در جریان", "sold": "فروخته‌شده", "retired": "کنارگذاشته"}[r["status"]]]
                     for r in rows]
        data_rows.append(["", "جمع دارایی‌های در جریان", "", "", "", s["cost"], s["accumulated"],
                          s["book_value"], "", "", "", ""])
        data = excel_io.export_table(
            "assets", ["کد", "عنوان", "گروه", "تاریخ خرید", "تاریخ به‌کارگیری", "بهای تمام‌شده",
                       "استهلاک انباشته", "ارزش دفتری", "روش", "نرخ سالانه ٪", "عمر مفید (ماه)", "وضعیت"],
            data_rows, user.username, money_columns={6, 7, 8}, widths=[10, 30, 22, 12, 14, 18, 18, 18, 26, 12, 12, 14],
            extra=[("تعداد دارایی‌های در جریان", str(s["count"]))])
    return _xlsx(data, "دارایی-های-ثابت.xlsx", request, user)


@app.get("/api/export/depreciation.xlsx")
def export_depreciation(request: Request, run_id: int,
                        user: User = Depends(require("assets.view"))):
    with session_scope() as sess:
        d = assets_mod.run_detail(sess, run_id)
        rows = [[r["code"], r["title"], r["amount"], r["accumulated_after"], r["book_value_after"]]
                for r in d["rows"]]
        rows.append(["", "جمع", d["total"], "", ""])
        data = excel_io.export_table(
            "depreciation", ["کد دارایی", "عنوان", "استهلاک این ماه", "استهلاک انباشته", "ارزش دفتری"],
            rows, user.username, money_columns={3, 4, 5}, widths=[12, 30, 18, 18, 18],
            extra=[("دوره", d["period"]), ("شماره سند", d["number"] or "—")])
    return _xlsx(data, f"استهلاک-{d['period'].replace(' ', '-')}.xlsx", request, user)


@app.get("/api/export/income-statement.xlsx")
def export_income_statement(request: Request, user: User = Depends(require("reports.view")),
                            frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        d = statements.income_statement(sess, f, t)
        rows = [["درآمد", r["name"], r["amount"]] for r in d["revenue_rows"]]
        rows.append(["", "جمع درآمدها", d["total_revenue"]])
        rows += [["هزینه", r["name"], r["amount"]] for r in d["expense_rows"]]
        rows.append(["", "جمع هزینه‌ها", d["total_expense"]])
        rows.append(["", "سود (زیان)", d["profit"]])
        data = excel_io.export_table("income_statement", ["نوع", "شرح", "مبلغ (ریال)"], rows,
                                     user.username, money_columns={3}, widths=[12, 40, 20],
                                     extra=[("از تاریخ", d["from"]), ("تا تاریخ", d["to"])])
    return _xlsx(data, "صورت-سود-و-زیان.xlsx", request, user)


@app.get("/api/export/balance-sheet.xlsx")
def export_balance_sheet(request: Request, user: User = Depends(require("reports.view")),
                         to: str | None = None):
    today = jd.jtoday()
    with session_scope() as sess:
        d = statements.balance_sheet(sess, jd.parse_date_any(to, today) if to else today)
        rows = [["دارایی", r["name"], r["amount"]] for r in d["assets"]]
        rows.append(["", "جمع دارایی‌ها", d["total_assets"]])
        rows += [["بدهی", r["name"], r["amount"]] for r in d["liabilities"]]
        rows.append(["", "جمع بدهی‌ها", d["total_liabilities"]])
        rows += [["حقوق مالکانه", r["name"], r["amount"]] for r in d["equity"]]
        rows.append(["", "جمع حقوق مالکانه", d["total_equity"]])
        rows.append(["", "جمع بدهی‌ها و حقوق مالکانه", d["total_liabilities"] + d["total_equity"]])
        data = excel_io.export_table("balance_sheet", ["بخش", "شرح", "مبلغ (ریال)"], rows,
                                     user.username, money_columns={3}, widths=[16, 40, 20],
                                     extra=[("تا تاریخ", d["to"]),
                                            ("تراز است؟", "بله" if d["balanced"] else f"نه — اختلاف {d['difference']}")])
    return _xlsx(data, "ترازنامه.xlsx", request, user)


@app.get("/api/export/cash-flow.xlsx")
def export_cash_flow(request: Request, user: User = Depends(require("reports.view")),
                     frm: str | None = None, to: str | None = None):
    today = jd.jtoday()
    titles = {"operating": "عملیاتی", "investing": "سرمایه‌گذاری", "financing": "تأمین مالی"}
    with session_scope() as sess:
        t = jd.parse_date_any(to, today) if to else today
        # اگر «تا تاریخ» در سال دیگری باشد، «از تاریخ» هم از همان سال حساب می‌شود
        f = jd.parse_date_any(frm, jd.fiscal_year_of(t)[1]) if frm else jd.fiscal_year_of(t)[1]
        d = statements.cash_flow(sess, f, t)
        rows = []
        for section in ("operating", "investing", "financing"):
            for r in d[section]:
                rows.append([titles[section], r["date"], r["description"], r["counter_account"],
                             r["amount"] if r["direction"] == "in" else -r["amount"]])
            rows.append(["", "", f"جمع {titles[section]}", "", d["total_" + section]])
        data = excel_io.export_table("cash_flow",
                                     ["سبد", "تاریخ", "شرح", "حساب مقابل", "مبلغ (ریال)"], rows,
                                     user.username, money_columns={5}, widths=[14, 12, 40, 26, 18],
                                     extra=[("از تاریخ", d["from"]), ("تا تاریخ", d["to"]),
                                            ("مانده نقدی اول دوره", str(d["opening_cash"])),
                                            ("مانده نقدی پایان دوره", str(d["closing_cash"]))])
    return _xlsx(data, "صورت-جریان-نقدی.xlsx", request, user)


# =====================================================================
# فاز ۵: سامانه‌ی مودیان — صورتحساب الکترونیکی
# =====================================================================
from . import moadian  # noqa: E402


@app.get("/api/moadian/overview")
def moadian_overview(user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        moadian.seed_service_map(sess)
        return {"summary": moadian.summary(sess), "settings": moadian.settings_dict(sess),
                "patterns": moadian.PATTERNS, "subjects": moadian.SUBJECTS,
                "statuses": moadian.STATUS_LABELS, "source_note": moadian.SOURCE_NOTE}


@app.get("/api/moadian/queue")
def moadian_queue(status: str | None = "all", user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        return {"rows": moadian.list_queue(sess, status), "summary": moadian.summary(sess)}


class FlightTypeIn(BaseModel):
    line_id: int
    flight_type: int


@app.post("/api/invoices/{invoice_id}/flight-type")
def invoice_flight_type(invoice_id: int, body: FlightTypeIn, request: Request,
                        user: User = Depends(require("journal.create"))):
    with session_scope() as sess:
        sales.set_flight_type(sess, user, invoice_id, body.line_id, body.flight_type,
                              _client_ip(request))
        return {"message": "نوع پرواز ثبت شد."}


@app.get("/api/moadian/queue/{row_id}")
def moadian_queue_detail(row_id: int, user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        return moadian.queue_detail(sess, row_id)


class MoadianBuildIn(BaseModel):
    invoice_ids: list[int] | None = None
    frm: str | None = None
    to: str | None = None
    include_cancelled: bool = True


@app.post("/api/moadian/build")
def moadian_build(body: MoadianBuildIn, request: Request,
                  user: User = Depends(require("moadian.manage"))):
    with session_scope() as sess:
        result = moadian.create_for_invoices(
            sess, user, body.invoice_ids,
            jd.parse_date_any(body.frm) if body.frm else None,
            jd.parse_date_any(body.to) if body.to else None,
            body.include_cancelled, _client_ip(request))
        result["message"] = (f"{result['created']} صورتحساب الکترونیکی ساخته شد"
                             + (f" و {result['skipped']} فاکتور رد شد (قبلاً ساخته شده یا اصل ندارد)."
                                if result["skipped"] else "."))
        return result


@app.post("/api/moadian/queue/{row_id}/rebuild")
def moadian_rebuild(row_id: int, request: Request,
                    user: User = Depends(require("moadian.manage"))):
    with session_scope() as sess:
        m = moadian.rebuild(sess, user, row_id, _client_ip(request))
        return {"id": m.id, "status": m.status, "message": "صورتحساب از نو ساخته شد."}


class MoadianResultIn(BaseModel):
    reference_number: str = ""
    taxid: str = ""
    status: str = "sent"
    error: str = ""


@app.post("/api/moadian/queue/{row_id}/result")
def moadian_result(row_id: int, body: MoadianResultIn, request: Request,
                   user: User = Depends(require("moadian.manage"))):
    with session_scope() as sess:
        m = moadian.mark_sent(sess, user, row_id, body.reference_number, body.taxid,
                              body.status, body.error, _client_ip(request))
        return {"id": m.id, "status": m.status,
                "message": f"وضعیت صورتحساب {m.serial}: {moadian.STATUS_LABELS.get(m.status, m.status)}"}


@app.get("/api/moadian/queue/{row_id}/file")
def moadian_file(row_id: int, request: Request, user: User = Depends(require("moadian.view"))):
    from urllib.parse import quote

    with session_scope() as sess:
        text, name = moadian.payload_file(sess, row_id)
    return Response(content=text.encode("utf-8"), media_type="application/json",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


@app.get("/api/moadian/batch-file")
def moadian_batch(status: str = "ready", user: User = Depends(require("moadian.view"))):
    from urllib.parse import quote

    with session_scope() as sess:
        text, name = moadian.batch_file(sess, status)
    return Response(content=text.encode("utf-8"), media_type="application/json",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


class MoadianSettingsIn(BaseModel):
    taxid: str = ""
    economic_code: str = ""
    seller_name: str = ""
    person_type: int = 2
    branch_code: str = ""
    postal_code: str = ""
    phone: str = ""
    address: str = ""
    send_method: str = "motamed"
    motamed_name: str = ""
    motamed_id: str = ""
    environment: str = "sandbox"
    is_active: bool = False
    note: str = ""


@app.get("/api/moadian/settings")
def moadian_settings(user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        return moadian.settings_dict(sess)


@app.post("/api/moadian/settings")
def moadian_save_settings(body: MoadianSettingsIn, request: Request,
                          user: User = Depends(require("moadian.manage"))):
    with session_scope() as sess:
        moadian.save_settings(sess, user, body.model_dump(), _client_ip(request))
        return {"message": "اطلاعات مالیاتی ذخیره شد."}


@app.get("/api/moadian/service-map")
def moadian_service_map(user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        moadian.seed_service_map(sess)
        return {"rows": moadian.list_service_map(sess), "note": moadian.SOURCE_NOTE,
                "patterns": moadian.PATTERNS}


@app.patch("/api/moadian/service-map/{row_id}")
def moadian_service_patch(row_id: int, payload: dict, request: Request,
                          user: User = Depends(require("moadian.manage"))):
    with session_scope() as sess:
        m = moadian.update_service_map(sess, user, row_id, payload, _client_ip(request))
        return {"id": m.id, "stuff_id": m.stuff_id, "is_confirmed": bool(m.is_confirmed),
                "message": "ذخیره شد."}


@app.get("/api/reports/vat")
def vat_report(jy: int | None = None, jm: int | None = None,
               user: User = Depends(require("reports.view"))):
    today = jd.jtoday()
    year, month, _ = jd.jalali_parts(today)
    with session_scope() as sess:
        return moadian.vat_report(sess, int(jy or year), int(jm or month))


@app.get("/api/export/moadian-queue.xlsx")
def export_moadian_queue(request: Request, status: str = "all",
                         user: User = Depends(require("moadian.view"))):
    with session_scope() as sess:
        queue_rows = moadian.list_queue(sess, status)
        records = []
        for row in queue_rows:
            detail = moadian.queue_detail(sess, row["id"])
            records.append({**row, "payload": detail["payload"], "error": detail["error"]})
        data = excel_io.export_moadian_report(records, generated_by=user.username)
    return _xlsx(data, "گزارش-ساختاریافته-مودیان.xlsx", request, user)


@app.get("/api/export/vat.xlsx")
def export_vat(request: Request, jy: int | None = None, jm: int | None = None,
               user: User = Depends(require("reports.view"))):
    today = jd.jtoday()
    year, month, _ = jd.jalali_parts(today)
    with session_scope() as sess:
        d = moadian.vat_report(sess, int(jy or year), int(jm or month))
        rows = [[r["number"], r["date"],
                 "ابطال‌شده" if r["status"] == "cancelled" else "صادرشده",
                 r["taxable"], r["exempt"], r["vat"], r["total"]] for r in d["rows"]]
        rows.append(["", "", "جمع", d["taxable_sales"], d["exempt_sales"], d["output_vat"], ""])
        data = excel_io.export_table(
            "vat", ["شماره فاکتور", "تاریخ", "وضعیت", "فروش مشمول", "فروش معاف", "مالیات فروش", "جمع فاکتور"],
            rows, user.username, money_columns={4, 5, 6, 7}, widths=[16, 12, 14, 20, 20, 20, 20],
            extra=[("سال", str(d["jy"])), ("فصل", str(d["quarter"])), ("از", d["from"]), ("تا", d["to"]),
                   ("اعتبار مالیاتی خرید", str(d["credit_vat"])),
                   ("مالیات قابل پرداخت", str(d["payable_vat"])),
                   ("یادداشت", "این گزارش برای آماده‌سازی اظهارنامه است و جای تأیید حسابدار را نمی‌گیرد.")])
    return _xlsx(data, f"ارزش-افزوده-فصل-{d['quarter']}-{d['jy']}.xlsx", request, user)


# =====================================================================
# مسافران — اطلاعات هویتی با محافظت (رمزنگاری، ماسک، ثبت دیدن)
# =====================================================================
from . import passengers as pax  # noqa: E402


class PassengerIn(BaseModel):
    full_name: str
    kind: str = "adult"                       # adult | child | infant
    person_type: int = 1                      # ۱ ایرانی، ۲ غیرایرانی
    national_id: str = ""
    passport_no: str = ""
    passport_expiry: str = ""
    birth_date: str = ""
    phone: str = ""
    note: str = ""
    trip_id: int | None = None
    invoice_id: int | None = None


def _pax_view(row, user: User) -> dict:
    data = pax._row(row, reveal=role_has(user.role, "passengers.view_full"))
    return data


@app.get("/api/passengers")
def passengers_list(trip_id: int | None = None, invoice_id: int | None = None,
                    user: User = Depends(require("passengers.view"))):
    with session_scope() as sess:
        reveal = role_has(user.role, "passengers.view_full")
        rows = pax.list_passengers(sess, user, trip_id, invoice_id, reveal)
        return {"rows": rows, "reveal": reveal, "masked_note": "" if reveal else
                "شماره‌ها ماسک‌شده نشان داده می‌شوند؛ برای دیدن کامل، دسترسی مخصوص لازم است.",
                "kinds": pax.KINDS, "person_types": pax.PERSON_TYPES,
                "summary": pax.summary(sess, user)}


@app.post("/api/passengers")
def passenger_create(body: PassengerIn, request: Request,
                     user: User = Depends(require("passengers.manage"))):
    with session_scope() as sess:
        row = pax.create_passenger(sess, user, body.model_dump(), _client_ip(request))
        return {"id": row.id, "name": row.full_name, "message": f"مسافر «{row.full_name}» ثبت شد."}


@app.patch("/api/passengers/{passenger_id}")
def passenger_patch(passenger_id: int, payload: dict, request: Request,
                    user: User = Depends(require("passengers.manage"))):
    with session_scope() as sess:
        row = pax.update_passenger(sess, user, passenger_id, payload, _client_ip(request))
        return {"id": row.id, "name": row.full_name, "message": "ذخیره شد."}


@app.delete("/api/passengers/{passenger_id}")
def passenger_delete(passenger_id: int, request: Request,
                     user: User = Depends(require("passengers.manage"))):
    with session_scope() as sess:
        pax.delete_passenger(sess, user, passenger_id, _client_ip(request))
        return {"message": "مسافر حذف شد."}


@app.post("/api/passengers/{passenger_id}/reveal")
def passenger_reveal(passenger_id: int, request: Request, body: dict | None = None,
                     user: User = Depends(require("passengers.view_full"))):
    with session_scope() as sess:
        data = pax.reveal_passenger(sess, user, passenger_id,
                                    (body or {}).get("reason", ""), _client_ip(request))
        return {"row": data,
                "message": "دیدن شماره‌ی کامل در «ردّ کار» ثبت شد."
                           + (" اطلاعات مسافر رمزنگاری نشده است؛ ابزار رمزنگاری نصب نیست."
                              if data.get("stored_in_clear") else "")}


class InvoicePassengersIn(BaseModel):
    passenger_ids: list[int] = []


@app.post("/api/invoices/{invoice_id}/passengers")
def invoice_passengers(invoice_id: int, body: InvoicePassengersIn, request: Request,
                       user: User = Depends(require("passengers.manage"))):
    with session_scope() as sess:
        res = pax.set_invoice_passengers(sess, user, invoice_id, body.passenger_ids,
                                        _client_ip(request))
        return {"message": f"{res['count']} مسافر به این فاکتور وصل شد.", "count": res["count"]}


@app.post("/api/trips/{trip_id}/purge-passengers")
def trip_purge_passengers(trip_id: int, request: Request,
                          user: User = Depends(require("passengers.purge"))):
    with session_scope() as sess:
        res = pax.purge_trip_passengers(sess, user, trip_id, _client_ip(request))
        return {"message": f"اطلاعات هویتی {res['cleared']} مسافر پاک شد "
                           f"(نام {res['kept']} مسافر ماند).", **res}


@app.get("/api/export/passengers.xlsx")
def export_passengers(request: Request, trip_id: int | None = None,
                      invoice_id: int | None = None,
                      user: User = Depends(require("passengers.view"))):
    """خروجی اکسل مسافران؛ برای کسانی که دسترسی کامل ندارند، ماسک‌شده بیرون می‌آید."""
    with session_scope() as sess:
        reveal = role_has(user.role, "passengers.view_full")
        rows = pax.list_passengers(sess, user, trip_id, invoice_id, reveal)
        data_rows = [[r["name"], r["kind_label"], r["person_type_label"], r["national_id"],
                      r["passport_no"], r["passport_expiry"], r["passport_state_label"],
                      r["phone"], r["note"]] for r in rows]
        data = excel_io.export_table(
            "passengers", ["نام مسافر", "نوع", "تابعیت", "کد ملی", "شماره‌ی گذرنامه",
                           "انقضای گذرنامه", "وضعیت گذرنامه", "تلفن", "یادداشت"],
            data_rows, user.username, widths=[26, 12, 12, 18, 20, 14, 20, 16, 30],
            extra=[("توضیح", "شماره‌ها رمزنگاری‌شده در برنامه نگه‌داری می‌شوند. "
                             + ("این فایل کامل است — مراقبش باشید." if reveal
                                else "این فایل ماسک‌شده است."))])
    return _xlsx(data, "مسافران.xlsx", request, user)
