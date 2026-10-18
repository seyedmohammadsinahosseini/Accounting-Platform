"""فروش خدمات آژانس، پرونده‌ی سفر، دریافت و پرداخت.

قاعده‌های رعایت‌شده (از فهرست خودت):
- خدمات آژانس: تور، بلیت، ویزا و سایر — نرخ مالیات از جدول نرخ‌ها و بر اساس تاریخ اجرا می‌آید،
  نه از یک عدد ثابت در کد.
- هر فاکتور و هر صورتحساب، خودش یک سند متوازن می‌سازد؛ هیچ منطق حساب‌داری در جای دیگری نیست.
- هیچ سند مالی خودکار «ثبت نهایی» نمی‌شود، مگر از راه خودِ عملیات که حسابدار تأیید می‌کند.
- هر پول دریافتی/پرداختی به فاکتورهای همان مشتری (یا تأمین‌کننده) نسبت داده می‌شود، از قدیمی‌تر.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from sqlalchemy import func, select

from . import dates as jd
from . import services as svc
from .models import (Account, Invoice, InvoiceLine, JournalEntry, Party, RecurringEntry,
                     Settlement, SettlementAllocation, SupplierBill, TaxRate, Trip)
from .money import MoneyError, parse_amount
from .rules import SYSTEM_CODES, DomainError

SERVICE_TYPES = {
    "tour": {"label": "تور", "account": "revenue_tour"},
    "ticket": {"label": "بلیت", "account": "revenue_ticket"},
    "visa": {"label": "ویزا", "account": "revenue_other"},
    "hotel": {"label": "اقامت", "account": "revenue_other"},
    "transfer": {"label": "ترانسفر", "account": "revenue_other"},
    "insurance": {"label": "بیمه مسافرتی", "account": "revenue_other"},
    "commission": {"label": "کمیسیون", "account": "revenue_commission"},
    "other": {"label": "سایر خدمات", "account": "revenue_other"},
}

PARTY_CODES = {"customer": SYSTEM_CODES["receivable"], "supplier": SYSTEM_CODES["payable"],
               "both": SYSTEM_CODES["receivable"]}


# ------------------------------------------------------------------ نرخ مالیات
VAT_SOURCE_1404 = ("نرخ ۱۰٪ از سال ۱۴۰۴ به بعد (احکام بودجه‌ی ۱۴۰۴ و ۱۴۰۵: نرخ عمومی ۱۰٪) — "
                    "تأییدنشده تا حسابدار تأیید کند")


def seed_tax_rates(sess) -> None:
    """نرخ‌های مالیات، تاریخ‌دار.

    نرخ داخل کد قفل نیست: هر نرخ یک بازه‌ی اجرا دارد و با عوض شدن قانون، یک نرخ تازه با
    تاریخ اجرای خودش اضافه می‌شود؛ اسناد قدیمی با نرخ خودشان می‌مانند.
    این تابع هر بار اجرا می‌شود (نه فقط بار اول) تا برنامه‌های به‌روزرسانی‌شده هم نرخ تازه را بگیرند.
    """
    def d(y, m, day):
        return date(*jd.jalali_to_gregorian(y, m, day))

    if not sess.execute(select(TaxRate)).first():
        sess.add(TaxRate(kind="vat", title="مالیات بر ارزش افزوده ۶٪", rate_bp=600,
                         effective_from=d(1397, 1, 1),
                         effective_to=date.fromordinal(d(1399, 1, 1).toordinal() - 1),
                         note="نرخ قدیمی‌تر"))
        sess.add(TaxRate(kind="vat", title="مالیات بر ارزش افزوده ۹٪", rate_bp=900,
                         effective_from=d(1399, 1, 1),
                         effective_to=date.fromordinal(d(1404, 1, 1).toordinal() - 1),
                         note="نرخ سال‌های ۱۳۹۹ تا ۱۴۰۳"))

    has_10 = sess.execute(select(TaxRate).where(TaxRate.kind == "vat",
                                                TaxRate.rate_bp == 1000)).scalar_one_or_none()
    if has_10 is None:
        nine = sess.execute(select(TaxRate).where(TaxRate.kind == "vat", TaxRate.rate_bp == 900)
                            ).scalar_one_or_none()
        if nine is not None and nine.effective_to is None:
            nine.effective_to = date.fromordinal(d(1404, 1, 1).toordinal() - 1)
        sess.add(TaxRate(kind="vat", title="مالیات بر ارزش افزوده ۱۰٪", rate_bp=1000,
                         effective_from=d(1404, 1, 1), effective_to=None, note=VAT_SOURCE_1404))
    sess.flush()


def vat_rate_for(sess, when: date, service_type: str | None = None) -> tuple[int, TaxRate | None]:
    """نرخ مالیات آن روز. نرخ ویژه‌ی یک خدمت بر نرخ عمومی مقدم است."""
    q = select(TaxRate).where(TaxRate.kind == "vat", TaxRate.effective_from <= when)
    rows = list(sess.execute(q).scalars())
    live = [r for r in rows if r.effective_to is None or r.effective_to >= when]
    specific = [r for r in live if r.service_type and r.service_type == (service_type or "")]
    pool = specific or [r for r in live if not r.service_type]
    if not pool:
        return 0, None
    best = max(pool, key=lambda r: r.effective_from)
    return int(best.rate_bp), best


def _check_tax_rate(title: str, rate_percent: float, service_type: str | None) -> tuple[str, int, str | None]:
    title = str(title or "").strip()
    if not title:
        raise DomainError("عنوان نرخ را بنویسید.")
    try:
        value = float(rate_percent)
    except (TypeError, ValueError) as exc:
        raise DomainError("درصد مالیات باید یک عدد باشد.") from exc
    if not 0 <= value <= 100 or round(value * 100) != value * 100:
        raise DomainError("درصد مالیات باید بین ۰ و ۱۰۰ و حداکثر با دو رقم اعشار باشد.")
    scope = str(service_type or "").strip() or None
    if scope and scope not in SERVICE_TYPES:
        raise DomainError("نوع خدمت برای نرخ مالیات شناخته‌شده نیست.")
    return title[:120], int(round(value * 100)), scope


def _normalize_tax_schedule(sess, scope: str | None) -> None:
    rows = list(sess.execute(select(TaxRate).where(
        TaxRate.kind == "vat", TaxRate.service_type == scope
    ).order_by(TaxRate.effective_from, TaxRate.id)).scalars())
    seen_dates: set[date] = set()
    for index, row in enumerate(rows):
        if row.effective_from in seen_dates:
            raise DomainError("برای همین نوع خدمت، دو نرخ از یک تاریخ ثبت شده‌اند.")
        seen_dates.add(row.effective_from)
        next_start = rows[index + 1].effective_from if index + 1 < len(rows) else None
        row.effective_to = date.fromordinal(next_start.toordinal() - 1) if next_start else None


def list_tax_rates(sess, kind: str = "vat") -> list[dict]:
    rows = sess.execute(select(TaxRate).where(TaxRate.kind == kind)
                        .order_by(TaxRate.effective_from.desc())).scalars()
    return [{"id": r.id, "title": r.title, "rate_bp": r.rate_bp, "rate_percent": r.rate_bp / 100,
             "from": jd.jalali_str(r.effective_from),
             "to": jd.jalali_str(r.effective_to) if r.effective_to else "—",
             "service_type": r.service_type or "",
             "service_type_label": SERVICE_TYPES.get(r.service_type or "", {}).get("label", "همه‌ی خدمات"),
             "note": r.note} for r in rows]


def create_tax_rate(sess, user, title: str, rate_percent: float, from_date: date,
                    service_type: str | None = None, note: str = "", ip: str = "") -> TaxRate:
    title, rate_bp, scope = _check_tax_rate(title, rate_percent, service_type)
    duplicate = sess.execute(select(TaxRate).where(
        TaxRate.kind == "vat", TaxRate.service_type == scope,
        TaxRate.effective_from == from_date)).scalar_one_or_none()
    if duplicate is not None:
        raise DomainError("برای همین نوع خدمت، از این تاریخ نرخ ثبت شده است؛ همان ردیف را ویرایش کنید.")
    rate = TaxRate(kind="vat", title=title, rate_bp=rate_bp,
                   effective_from=from_date, service_type=scope, note=str(note or "").strip()[:255])
    sess.add(rate)
    sess.flush()
    _normalize_tax_schedule(sess, scope)
    svc.audit(sess, user, "tax_rate.create", "tax_rate", str(rate.id),
              f"{title} = {rate_bp / 100}% از {jd.jalali_str(from_date)}", ip)
    return rate


def update_tax_rate(sess, user, rate_id: int, payload: dict, ip: str = "") -> TaxRate:
    rate = sess.get(TaxRate, rate_id)
    if rate is None:
        raise DomainError("این نرخ مالیات پیدا نشد.")
    old_scope = rate.service_type
    title, rate_bp, scope = _check_tax_rate(
        payload.get("title", rate.title), payload.get("rate_percent", rate.rate_bp / 100),
        payload.get("service_type", rate.service_type))
    when = payload.get("from_date")
    effective_from = jd.parse_date_any(when) if when else rate.effective_from
    duplicate = sess.execute(select(TaxRate).where(
        TaxRate.kind == "vat", TaxRate.service_type == scope,
        TaxRate.effective_from == effective_from, TaxRate.id != rate.id)).scalar_one_or_none()
    if duplicate is not None:
        raise DomainError("برای همین نوع خدمت، از این تاریخ نرخ دیگری ثبت شده است.")
    rate.title, rate.rate_bp, rate.service_type = title, rate_bp, scope
    rate.effective_from = effective_from
    rate.note = str(payload.get("note", rate.note) or "").strip()[:255]
    sess.flush()
    _normalize_tax_schedule(sess, old_scope)
    if scope != old_scope:
        _normalize_tax_schedule(sess, scope)
    else:
        _normalize_tax_schedule(sess, scope)
    svc.audit(sess, user, "tax_rate.update", "tax_rate", str(rate.id),
              f"{title} = {rate_bp / 100}% از {jd.jalali_str(effective_from)}", ip)
    return rate


# ------------------------------------------------------------------ اشخاص
def list_parties(sess, kind: str | None = None, text: str | None = None) -> list[dict]:
    q = select(Party).order_by(Party.name)
    if kind and kind != "all":
        q = q.where(Party.kind.in_((kind, "both")))
    if text:
        q = q.where(Party.name.ilike(f"%{text.strip()}%") | Party.code.ilike(f"%{text.strip()}%"))
    out = []
    balances = svc.account_balances(sess)
    for p in sess.execute(q).scalars():
        s = balances.get(p.account_id, {"debit": 0, "credit": 0}) if p.account_id else {"debit": 0, "credit": 0}
        net = s["debit"] - s["credit"]
        out.append({"id": p.id, "code": p.code, "name": p.name, "kind": p.kind,
                    "phone": p.phone, "note": p.note, "is_active": p.is_active,
                    "person_type": p.person_type, "national_id": p.national_id,
                    "economic_code": p.economic_code, "postal_code": p.postal_code,
                    "passport_no": p.passport_no, "tax_ready": bool(_digits(p.national_id)),
                    "account_id": p.account_id, "balance": net,
                    "balance_label": "طلب ما" if net > 0 else ("بدهی ما" if net < 0 else "تسویه")})
    return out


def _digits(value) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _fill_party_tax(p: Party, payload: dict) -> None:
    """اطلاعات مالیاتی شخص را با کنترل درست بودن می‌نویسد (برای صورتحساب سامانه‌ی مودیان)."""
    if payload.get("person_type") is not None:
        ptype = int(payload["person_type"])
        if ptype not in (1, 2):
            raise DomainError("نوع شخص باید «حقیقی» یا «حقوقی» باشد.")
        p.person_type = ptype
    if payload.get("national_id") is not None:
        nid = _digits(payload["national_id"])
        if nid and len(nid) not in (10, 11):
            raise DomainError("کد ملی ۱۰ رقم و شناسه‌ی ملی شرکت ۱۱ رقم است؛ "
                              f"چیزی که وارد کردید {len(nid)} رقم است.")
        p.national_id = nid[:20]
    if payload.get("economic_code") is not None:
        eco = _digits(payload["economic_code"])
        if eco and len(eco) not in (11, 14):
            raise DomainError("شماره‌ی اقتصادی ۱۱ رقم (اشخاص حقوقی) یا ۱۴ رقم (اشخاص حقیقی) است؛ "
                              f"چیزی که وارد کردید {len(eco)} رقم است.")
        p.economic_code = eco[:20]
    if payload.get("postal_code") is not None:
        pc = _digits(payload["postal_code"])
        if pc and len(pc) != 10:
            raise DomainError("کد پستی ۱۰ رقم است.")
        p.postal_code = pc[:15]
    if payload.get("passport_no") is not None:
        p.passport_no = "".join(str(payload["passport_no"]).split())[:30]


def create_party(sess, user, name: str, kind: str = "customer", phone: str = "",
                 note: str = "", ip: str = "", tax: dict | None = None) -> Party:
    """شخص تازه می‌سازد. ترتیب پارامترها عوض نشده؛ اطلاعات مالیاتی با tax فرستاده می‌شود."""
    name = (name or "").strip()
    if len(name) < 2:
        raise DomainError("نام شخص را کامل بنویسید.")
    if kind not in PARTY_CODES:
        raise DomainError("نوع شخص باید مشتری، تأمین‌کننده یا هر دو باشد.")
    if kind == "supplier" and tax and any(tax.get(k) for k in
                                          ("national_id", "economic_code", "postal_code")):
        pass      # اطلاعات مالیاتی تأمین‌کننده هم نگه داشته می‌شود (برای اعتبار مالیاتی خرید)
    parent_code = PARTY_CODES[kind]
    parent = svc.account_by_code(sess, parent_code)
    if parent is None:
        raise DomainError(f"حساب والد {parent_code} در کدینگ پیدا نشد.")
    prefix = {"customer": "م", "supplier": "ت", "both": "م"}[kind]
    same = sess.execute(select(func.count(Party.id)).where(Party.code.like(f"{prefix}-%"))).scalar() or 0
    seq = same + 1
    code = f"{prefix}-{seq:05d}"
    while sess.execute(select(Party).where(Party.code == code)).scalar_one_or_none():
        seq += 1
        code = f"{prefix}-{seq:05d}"
    acc_seq = len([a for a in svc.list_accounts(sess) if a.parent_code == parent_code]) + 1
    # کد حساب زیرمجموعه: کد والد + شماره، تا در کدینگ زیر همان حساب بنشیند
    while svc.account_by_code(sess, f"{parent_code}-{acc_seq:04d}"):
        acc_seq += 1
    acc = svc.create_account(sess, user, f"{parent_code}-{acc_seq:04d}", f"{name}",
                             parent.nature, parent_code,
                             "receivable" if kind == "customer" else "payable", ip)
    party = Party(code=code, name=name, kind=kind, phone=phone.strip()[:30], note=note[:255],
                  account_id=acc.id, created_by=user.id)
    _fill_party_tax(party, tax or {})
    sess.add(party)
    sess.flush()
    svc.audit(sess, user, "party.create", "party", str(party.id), f"{code} {name}", ip)
    return party


def update_party(sess, user, party_id: int, payload: dict, ip: str = "") -> Party:
    p = sess.get(Party, party_id)
    if p is None:
        raise DomainError("این شخص پیدا نشد.")
    if payload.get("name"):
        p.name = str(payload["name"]).strip()[:160]
        if p.account_id:
            acc = sess.get(Account, p.account_id)
            if acc:
                acc.name = p.name
    if "phone" in payload and payload["phone"] is not None:
        p.phone = str(payload["phone"])[:30]
    if "note" in payload and payload["note"] is not None:
        p.note = str(payload["note"])[:255]
    if "is_active" in payload and payload["is_active"] is not None:
        p.is_active = bool(payload["is_active"])
    _fill_party_tax(p, payload)
    svc.audit(sess, user, "party.update", "party", str(p.id),
              " | ".join(f"{k}={v}" for k, v in payload.items())[:255], ip)
    return p


# ------------------------------------------------------------------ پرونده‌ی سفر
def create_trip(sess, user, title: str, start_date: date, end_date: date | None = None,
                destination: str = "", note: str = "", ip: str = "") -> Trip:
    title = (title or "").strip()
    if len(title) < 2:
        raise DomainError("عنوان سفر را بنویسید.")
    jy = jd.jalali_parts(start_date)[0]
    seq = sess.execute(select(func.count(Trip.id))).scalar() or 0
    code = f"سفر-{jy}-{seq + 1:04d}"
    while sess.execute(select(Trip).where(Trip.code == code)).scalar_one_or_none():
        seq += 1
        code = f"سفر-{jy}-{seq + 1:04d}"
    if end_date and end_date < start_date:
        raise DomainError("تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.")
    trip = Trip(code=code, title=title, destination=destination.strip()[:120],
                start_date=start_date, end_date=end_date, note=note[:400], created_by=user.id)
    sess.add(trip)
    sess.flush()
    svc.audit(sess, user, "trip.create", "trip", str(trip.id), f"{code} {title}", ip)
    return trip


def list_trips(sess, include_closed: bool = True) -> list[dict]:
    q = select(Trip).order_by(Trip.start_date.desc(), Trip.id.desc())
    if not include_closed:
        q = q.where(Trip.status == "open")
    out = []
    for t in sess.execute(q).scalars():
        s = trip_totals(sess, t.id)
        out.append({"id": t.id, "code": t.code, "title": t.title, "destination": t.destination,
                    "start": jd.jalali_str(t.start_date),
                    "end": jd.jalali_str(t.end_date) if t.end_date else "—",
                    "status": t.status, **s})
    return out


def trip_totals(sess, trip_id: int) -> dict:
    inv = sess.execute(
        select(func.coalesce(func.sum(Invoice.subtotal_rial - Invoice.discount_rial), 0),
               func.coalesce(func.sum(Invoice.total_rial), 0),
               func.coalesce(func.sum(Invoice.total_rial - Invoice.paid_rial), 0),
               func.count(Invoice.id))
        .where(Invoice.trip_id == trip_id, Invoice.status == "issued")).one()
    bills = sess.execute(
        select(func.coalesce(func.sum(SupplierBill.net_rial), 0),
               func.coalesce(func.sum(SupplierBill.total_rial), 0),
               func.coalesce(func.sum(SupplierBill.total_rial - SupplierBill.paid_rial), 0),
               func.count(SupplierBill.id))
        .where(SupplierBill.trip_id == trip_id, SupplierBill.status == "issued")).one()
    revenue = int(inv[0] or 0)
    cost = int(bills[0] or 0)
    profit = revenue - cost
    return {
        "revenue": revenue, "cost": cost, "profit": profit,
        "margin_percent": round(profit / revenue * 100, 1) if revenue else 0,
        "receivable_open": int(inv[2] or 0), "payable_open": int(bills[2] or 0),
        "invoice_count": int(inv[3] or 0), "bill_count": int(bills[3] or 0),
        "lost": profit < 0,
    }


def trip_detail(sess, trip_id: int) -> dict:
    trip = sess.get(Trip, trip_id)
    if trip is None:
        raise DomainError("این سفر پیدا نشود.")
    invoices = sess.execute(select(Invoice).where(Invoice.trip_id == trip_id)
                            .order_by(Invoice.doc_date)).scalars()
    bills = sess.execute(select(SupplierBill).where(SupplierBill.trip_id == trip_id)
                         .order_by(SupplierBill.doc_date)).scalars()
    settlements = sess.execute(select(Settlement).where(Settlement.trip_id == trip_id)
                               .order_by(Settlement.doc_date)).scalars()
    parties = {p.id: p.name for p in sess.execute(select(Party)).scalars()}
    return {
        "trip": {"id": trip.id, "code": trip.code, "title": trip.title,
                 "destination": trip.destination, "start": jd.jalali_str(trip.start_date),
                 "end": jd.jalali_str(trip.end_date) if trip.end_date else "—",
                 "status": trip.status, "note": trip.note},
        "totals": trip_totals(sess, trip_id),
        "invoices": [{"id": i.id, "number": i.number, "date": jd.jalali_str(i.doc_date),
                      "party": parties.get(i.party_id, "?"), "total": i.total_rial,
                      "paid": i.paid_rial, "status": i.status} for i in invoices],
        "bills": [{"id": b.id, "number": b.number, "date": jd.jalali_str(b.doc_date),
                   "party": parties.get(b.party_id, "?"), "total": b.total_rial,
                   "paid": b.paid_rial, "status": b.status} for b in bills],
        "settlements": [{"id": s.id, "number": s.number, "date": jd.jalali_str(s.doc_date),
                         "direction": s.direction, "party": parties.get(s.party_id, "?"),
                         "amount": s.amount_rial, "status": s.status} for s in settlements],
    }


# ------------------------------------------------------------------ شماره‌گذاری
def _next_number(sess, model, jy: int, marker: str) -> str:
    last = sess.execute(select(func.max(model.number)).where(model.number.is_not(None),
                                                             model.number.like(f"{jy}-{marker}-%"))
                        ).scalar()
    seq = int(last.split("-")[-1]) + 1 if last else 1
    return f"{jy}-{marker}-{seq:06d}"


# ------------------------------------------------------------------ فاکتور فروش
def _money(value) -> int:
    if value is None or str(value).strip() == "":
        return 0
    try:
        return parse_amount(value)
    except MoneyError as exc:
        raise DomainError(str(exc)) from exc


def _party(sess, party_id: int, need: str) -> Party:
    p = sess.get(Party, party_id)
    if p is None:
        raise DomainError("مشتری/تأمین‌کننده انتخاب نشده است.")
    if not p.is_active:
        raise DomainError(f"«{p.name}» غیرفعال است.")
    if p.kind not in (need, "both"):
        label = "مشتری" if need == "customer" else "تأمین‌کننده"
        raise DomainError(f"«{p.name}» {label} نیست؛ از فهرست درست انتخاب کنید.")
    return p


def compute_invoice(sess, doc_date: date, raw_lines: list[dict]) -> dict:
    """فاکتور را می‌سازد و مالیات هر سطر را با نرخ همان تاریخ حساب می‌کند."""
    if not raw_lines:
        raise DomainError("فاکتور باید حداقل یک سطر داشته باشد.")
    lines, subtotal, discount_total, vat_total = [], 0, 0, 0
    for i, raw in enumerate(raw_lines, start=1):
        stype = str(raw.get("service_type") or "other")
        if stype not in SERVICE_TYPES:
            raise DomainError(f"سطر {i}: نوع خدمت نامعتبر است.")
        qty = int(raw.get("qty") or 1)
        if qty <= 0:
            raise DomainError(f"سطر {i}: تعداد باید بزرگ‌تر از صفر باشد.")
        unit = _money(raw.get("unit_price"))
        disc = _money(raw.get("discount"))
        gross = qty * unit
        if disc > gross:
            raise DomainError(f"سطر {i}: تخفیف بیشتر از مبلغ سطر است.")
        net = gross - disc
        taxable = bool(raw.get("taxable", True))
        rate_bp, _rate = vat_rate_for(sess, doc_date, stype) if taxable else (0, None)
        vat = (net * rate_bp) // 10000 if rate_bp else 0
        flight = raw.get("flight_type")
        if stype == "ticket" and flight not in (None, "", 0):
            flight = int(flight)
            if flight not in (1, 2):
                raise DomainError(f"سطر {i}: نوع پرواز باید «داخلی» یا «خارجی» باشد.")
        elif stype == "ticket":
            flight = None     # نامعلوم؛ در سامانه‌ی مودیان گفته می‌شود که انتخاب نشده است
        else:
            flight = None
        lines.append({"line_no": i, "service_type": stype,
                      "description": str(raw.get("description") or "")[:300],
                      "qty": qty, "unit_price": unit, "discount": disc, "taxable": taxable,
                      "flight_type": flight,
                      "net": net, "vat": vat, "rate_bp": rate_bp})
        subtotal += gross
        discount_total += disc
        vat_total += vat
    if not lines:
        raise DomainError("فاکتور سطر سالمی ندارد.")
    return {"lines": lines, "subtotal": subtotal, "discount": discount_total, "vat": vat_total,
            "total": subtotal - discount_total + vat_total}


def create_invoice(sess, user, party_id: int, doc_date: date, raw_lines: list[dict],
                   trip_id: int | None = None, description: str = "", due_date: date | None = None,
                   issue: bool = False, ip: str = "") -> Invoice:
    party = _party(sess, party_id, "customer")
    if trip_id and sess.get(Trip, trip_id) is None:
        raise DomainError("پرونده‌ی سفر انتخاب‌شده پیدا نشد.")
    doc = compute_invoice(sess, doc_date, raw_lines)
    inv = Invoice(doc_date=doc_date, due_date=due_date or doc_date, party_id=party.id,
                  trip_id=trip_id, created_by=user.id, description=str(description)[:300],
                  subtotal_rial=doc["subtotal"], discount_rial=doc["discount"],
                  vat_rial=doc["vat"], total_rial=doc["total"], status="draft")
    for l in doc["lines"]:
        inv.lines.append(InvoiceLine(line_no=l["line_no"], service_type=l["service_type"],
                                     description=l["description"], qty=l["qty"],
                                     unit_price_rial=l["unit_price"], discount_rial=l["discount"],
                                     taxable=l["taxable"], flight_type=l.get("flight_type"),
                                     net_rial=l["net"], vat_rial=l["vat"],
                                     rate_bp=l["rate_bp"]))
    sess.add(inv)
    sess.flush()
    svc.audit(sess, user, "invoice.draft", "invoice", str(inv.id),
              f"{party.name} — {inv.total_rial:,} ریال", ip)
    if issue:
        issue_invoice(sess, user, inv.id, ip)
    return inv


def set_flight_type(sess, user, invoice_id: int, line_id: int, flight_type: int, ip: str = "") -> InvoiceLine:
    """نوع پرواز یک ردیف بلیت را ثبت/اصلاح می‌کند (تغییر مالی نیست، برچسب اطلاعاتی است).

    اگر صورتحساب الکترونیکی همان فاکتور ارسال یا پذیرفته شده باشد، اجازه‌ی تغییر نمی‌دهیم؛
    چون آن‌وقت اطلاعات ما با اطلاعات سازمان مالیاتی نمی‌خواند.
    """
    from .models import MoadianInvoice

    inv = sess.get(Invoice, invoice_id)
    if inv is None:
        raise DomainError("فاکتور پیدا نشد.")
    line = sess.get(InvoiceLine, line_id)
    if line is None or line.invoice_id != inv.id:
        raise DomainError("این ردیف به این فاکتور تعلق ندارد.")
    if line.service_type != "ticket":
        raise DomainError("نوع پرواز فقط برای ردیف بلیت معنی دارد.")
    if int(flight_type) not in (1, 2):
        raise DomainError("نوع پرواز باید «داخلی» یا «خارجی» باشد.")
    busy = sess.execute(select(MoadianInvoice).where(
        MoadianInvoice.invoice_id == inv.id,
        MoadianInvoice.status.in_(("sent", "accepted")))).scalars().first()
    if busy is not None:
        raise DomainError("صورتحساب الکترونیکی این فاکتور ارسال شده است؛ تغییر نوع پرواز "
                          "باعث اختلاف با سازمان مالیاتی می‌شود.")
    line.flight_type = int(flight_type)
    sess.flush()
    svc.audit(sess, user, "invoice.flight_type", "invoice_line", str(line.id),
              f"فاکتور {inv.number or inv.id} — ردیف {line.line_no} → "
              + ("داخلی" if int(flight_type) == 1 else "خارجی"), ip)
    return line


def _invoice_entry_lines(sess, inv: Invoice) -> list[dict]:
    party = sess.get(Party, inv.party_id)
    by_service: dict[str, int] = {}
    for l in inv.lines:
        key = SERVICE_TYPES[l.service_type]["account"]
        by_service[key] = by_service.get(key, 0) + l.net_rial
    lines = [{"account_id": party.account_id, "debit": inv.total_rial, "credit": 0,
              "description": f"فاکتور فروش {inv.number or ''} — {party.name}"}]
    for key, amount in by_service.items():
        if amount:
            acc = svc.account_by_code(sess, SYSTEM_CODES[key])
            lines.append({"account_id": acc.id, "debit": 0, "credit": amount,
                          "description": f"درآمد {key}"})
    if inv.vat_rial:
        vat = svc.account_by_code(sess, SYSTEM_CODES["vat_payable"])
        lines.append({"account_id": vat.id, "debit": 0, "credit": inv.vat_rial,
                      "description": "مالیات بر ارزش افزوده فروش"})
    return lines


def issue_invoice(sess, user, invoice_id: int, ip: str = "") -> Invoice:
    inv = sess.get(Invoice, invoice_id)
    if inv is None:
        raise DomainError("این فاکتور پیدا نشد.")
    if inv.status == "issued":
        return inv
    if inv.status == "cancelled":
        raise DomainError("فاکتور ابطال‌شده قابل صدور نیست.")
    if inv.total_rial <= 0:
        raise DomainError("فاکتور بدون مبلغ قابل صدور نیست.")
    jy = jd.jalali_parts(inv.doc_date)[0]
    number = _next_number(sess, Invoice, jy, "ف")
    inv.number = number
    entry = svc.create_draft(sess, user, inv.doc_date,
                             f"فاکتور فروش {number} — {sess.get(Party, inv.party_id).name}",
                             _invoice_entry_lines(sess, inv), source="system",
                             source_ref=number, ip=ip)
    svc.post_entry(sess, user, entry.id, ip)
    inv.entry_id = entry.id
    inv.status = "issued"
    sess.flush()
    svc.audit(sess, user, "invoice.issue", "invoice", str(inv.id), f"{number}", ip)
    return inv


def cancel_invoice(sess, user, invoice_id: int, reason: str, ip: str = "") -> Invoice:
    inv = sess.get(Invoice, invoice_id)
    if inv is None:
        raise DomainError("این فاکتور پیدا نشد.")
    if inv.status == "cancelled":
        return inv
    if inv.paid_rial > 0:
        raise DomainError("برای این فاکتور پول دریافت شده است؛ اول تسویه‌ها را برگردانید.")
    if inv.status == "issued" and inv.entry_id:
        svc.reverse_entry(sess, user, inv.entry_id, reason or "ابطال فاکتور", ip)
    inv.status = "cancelled"
    svc.audit(sess, user, "invoice.cancel", "invoice", str(inv.id), reason, ip)
    return inv


def list_invoices(sess, party_id: int | None = None, trip_id: int | None = None,
                  status: str | None = None, text: str | None = None,
                  limit: int = 300, only_creator: int | None = None) -> list[dict]:
    q = select(Invoice).order_by(Invoice.doc_date.desc(), Invoice.id.desc())
    if only_creator is not None:
        # کارمند فروش فقط فاکتورهای خودش را می‌بیند (همان قاعده‌ی پیش‌نویس‌های سند روزنامه)
        q = q.where(Invoice.created_by == only_creator)
    if party_id:
        q = q.where(Invoice.party_id == party_id)
    if trip_id:
        q = q.where(Invoice.trip_id == trip_id)
    if status and status != "all":
        q = q.where(Invoice.status == status)
    if text:
        q = q.where(Invoice.description.ilike(f"%{text.strip()}%") | Invoice.number.ilike(f"%{text.strip()}%"))
    parties = {p.id: p.name for p in sess.execute(select(Party)).scalars()}
    trips = {t.id: t.title for t in sess.execute(select(Trip)).scalars()}
    out = []
    for i in sess.execute(q.limit(limit)).scalars():
        out.append({"id": i.id, "number": i.number, "date": jd.jalali_str(i.doc_date),
                    "date_iso": i.doc_date.isoformat(),
                    "due": jd.jalali_str(i.due_date) if i.due_date else "—",
                    "party_id": i.party_id, "party": parties.get(i.party_id, "?"),
                    "trip": trips.get(i.trip_id, "—") if i.trip_id else "—", "trip_id": i.trip_id,
                    "description": i.description, "status": i.status,
                    "subtotal": i.subtotal_rial, "discount": i.discount_rial,
                    "vat": i.vat_rial, "total": i.total_rial, "paid": i.paid_rial,
                    "open": i.total_rial - i.paid_rial,
                    "service_types": sorted({l.service_type for l in i.lines}),
                    "lines": [{"service_type": l.service_type,
                               "service_label": SERVICE_TYPES[l.service_type]["label"],
                               "description": l.description, "qty": l.qty,
                               "unit_price": l.unit_price_rial, "discount": l.discount_rial,
                               "net": l.net_rial, "vat": l.vat_rial, "taxable": l.taxable,
                               "rate_percent": l.rate_bp / 100} for l in i.lines]})
    return out


# ------------------------------------------------------------------ صورتحساب تأمین‌کننده
def create_bill(sess, user, party_id: int, doc_date: date, net: int, vat: int | None = None,
                expense_account_id: int | None = None, trip_id: int | None = None,
                description: str = "", due_date: date | None = None, issue: bool = False,
                ip: str = "") -> SupplierBill:
    party = _party(sess, party_id, "supplier")
    if net <= 0:
        raise DomainError("مبلغ صورتحساب باید بزرگ‌تر از صفر باشد.")
    if trip_id and sess.get(Trip, trip_id) is None:
        raise DomainError("پرونده‌ی سفر انتخاب‌شده پیدا نشد.")
    if expense_account_id is None:
        acc = svc.account_by_code(sess, SYSTEM_CODES["cogs"])
        expense_account_id = acc.id
    acc = sess.get(Account, expense_account_id)
    if acc is None or acc.kind != "ledger":
        raise DomainError("حساب هزینه انتخاب‌شده درست نیست.")
    if vat is None:
        # مالیات را خودمان حساب می‌کنیم؛ اگر ۰ داده شود یعنی «معاف» و دست نمی‌زنیم
        rate_bp, _ = vat_rate_for(sess, doc_date)
        vat = (net * rate_bp) // 10000 if rate_bp else 0
    jy = jd.jalali_parts(doc_date)[0]
    bill = SupplierBill(doc_date=doc_date, due_date=due_date or doc_date, party_id=party.id,
                        trip_id=trip_id, created_by=user.id, expense_account_id=acc.id,
                        description=str(description)[:300], net_rial=net, vat_rial=vat,
                        total_rial=net + vat, status="draft")
    sess.add(bill)
    sess.flush()
    bill.number = _next_number(sess, SupplierBill, jy, "خ")
    sess.flush()
    svc.audit(sess, user, "bill.draft", "bill", str(bill.id),
              f"{party.name} — {bill.total_rial:,} ریال", ip)
    if issue:
        issue_bill(sess, user, bill.id, ip)
    return bill


def _bill_entry_lines(sess, bill: SupplierBill) -> list[dict]:
    party = sess.get(Party, bill.party_id)
    lines = [{"account_id": bill.expense_account_id, "debit": bill.net_rial, "credit": 0,
              "description": f"هزینه {bill.description or ''}".strip()[:300]}]
    if bill.vat_rial:
        vat = svc.account_by_code(sess, SYSTEM_CODES["vat_credit"])
        lines.append({"account_id": vat.id, "debit": bill.vat_rial, "credit": 0,
                      "description": "مالیات بر ارزش افزوده خرید — اعتبار مالیاتی"})
    lines.append({"account_id": party.account_id, "debit": 0, "credit": bill.total_rial,
                  "description": f"صورتحساب {bill.number} — {party.name}"})
    return lines


def issue_bill(sess, user, bill_id: int, ip: str = "") -> SupplierBill:
    bill = sess.get(SupplierBill, bill_id)
    if bill is None:
        raise DomainError("این صورتحساب پیدا نشد.")
    if bill.status == "issued":
        return bill
    if bill.status == "cancelled":
        raise DomainError("صورتحساب ابطال‌شده قابل صدور نیست.")
    party = sess.get(Party, bill.party_id)
    entry = svc.create_draft(sess, user, bill.doc_date,
                             f"صورتحساب تأمین‌کننده {bill.number} — {party.name}",
                             _bill_entry_lines(sess, bill), source="system",
                             source_ref=bill.number, ip=ip)
    svc.post_entry(sess, user, entry.id, ip)
    bill.entry_id = entry.id
    bill.status = "issued"
    sess.flush()
    svc.audit(sess, user, "bill.issue", "bill", str(bill.id), bill.number, ip)
    return bill


def cancel_bill(sess, user, bill_id: int, reason: str, ip: str = "") -> SupplierBill:
    bill = sess.get(SupplierBill, bill_id)
    if bill is None:
        raise DomainError("این صورتحساب پیدا نشد.")
    if bill.paid_rial > 0:
        raise DomainError("برای این صورتحساب پول پرداخت شده است؛ اول تسویه‌ها را برگردانید.")
    if bill.status == "issued" and bill.entry_id:
        svc.reverse_entry(sess, user, bill.entry_id, reason or "ابطال صورتحساب", ip)
    bill.status = "cancelled"
    svc.audit(sess, user, "bill.cancel", "bill", str(bill.id), reason, ip)
    return bill


def list_bills(sess, party_id: int | None = None, trip_id: int | None = None,
               status: str | None = None, limit: int = 300,
               only_creator: int | None = None) -> list[dict]:
    q = select(SupplierBill).order_by(SupplierBill.doc_date.desc(), SupplierBill.id.desc())
    if only_creator is not None:
        q = q.where(SupplierBill.created_by == only_creator)
    if party_id:
        q = q.where(SupplierBill.party_id == party_id)
    if trip_id:
        q = q.where(SupplierBill.trip_id == trip_id)
    if status and status != "all":
        q = q.where(SupplierBill.status == status)
    parties = {p.id: p.name for p in sess.execute(select(Party)).scalars()}
    trips = {t.id: t.title for t in sess.execute(select(Trip)).scalars()}
    accounts = svc.account_map(sess)
    return [{"id": b.id, "number": b.number, "date": jd.jalali_str(b.doc_date),
             "date_iso": b.doc_date.isoformat(),
             "due": jd.jalali_str(b.due_date) if b.due_date else "—",
             "party_id": b.party_id, "party": parties.get(b.party_id, "?"),
             "trip": trips.get(b.trip_id, "—") if b.trip_id else "—", "trip_id": b.trip_id,
             "description": b.description, "status": b.status,
             "net": b.net_rial, "vat": b.vat_rial, "total": b.total_rial, "paid": b.paid_rial,
             "open": b.total_rial - b.paid_rial,
             "expense_account": accounts[b.expense_account_id].name if b.expense_account_id in accounts else ""}
            for b in sess.execute(q.limit(limit)).scalars()]


# ------------------------------------------------------------------ دریافت و پرداخت
def _allocate(sess, settlement: Settlement) -> None:
    """پول را به قدیمی‌ترین فاکتور/صورتحساب بازِ همان شخص نسبت می‌دهد."""
    remaining = settlement.amount_rial
    if settlement.direction == "in":
        rows = sess.execute(select(Invoice).where(Invoice.party_id == settlement.party_id,
                                                  Invoice.status == "issued",
                                                  Invoice.total_rial > Invoice.paid_rial)
                            .order_by(Invoice.due_date, Invoice.id)).scalars()
    else:
        rows = sess.execute(select(SupplierBill).where(SupplierBill.party_id == settlement.party_id,
                                                       SupplierBill.status == "issued",
                                                       SupplierBill.total_rial > SupplierBill.paid_rial)
                            .order_by(SupplierBill.due_date, SupplierBill.id)).scalars()
    for doc in rows:
        if remaining <= 0:
            break
        need = doc.total_rial - doc.paid_rial
        amount = min(need, remaining)
        doc.paid_rial += amount
        remaining -= amount
        settlement.allocations.append(SettlementAllocation(
            target_type="invoice" if settlement.direction == "in" else "bill",
            target_id=doc.id, amount_rial=amount))


def create_settlement(sess, user, direction: str, party_id: int, account_id: int, amount: int,
                      doc_date: date, trip_id: int | None = None, description: str = "",
                      issue: bool = False, ip: str = "") -> Settlement:
    if direction not in ("in", "out"):
        raise DomainError("نوع عملیات باید دریافت یا پرداخت باشد.")
    party = _party(sess, party_id, "customer" if direction == "in" else "supplier")
    acc = sess.get(Account, account_id)
    if acc is None or acc.report_group not in ("cash", "bank"):
        raise DomainError("حساب صندوق یا بانک انتخاب‌شده درست نیست.")
    if amount <= 0:
        raise DomainError("مبلغ باید بزرگ‌تر از صفر باشد.")
    jy = jd.jalali_parts(doc_date)[0]
    s = Settlement(direction=direction, doc_date=doc_date, party_id=party.id, trip_id=trip_id,
                   account_id=acc.id, amount_rial=amount, created_by=user.id,
                   description=str(description)[:300], status="draft")
    sess.add(s)
    sess.flush()
    s.number = _next_number(sess, Settlement, jy, "د" if direction == "in" else "پ")
    if issue:
        issue_settlement(sess, user, s.id, ip)
    sess.flush()
    svc.audit(sess, user, "settlement.draft", "settlement", str(s.id),
              f"{'دریافت' if direction == 'in' else 'پرداخت'} {party.name} {amount:,}", ip)
    return s


def issue_settlement(sess, user, settlement_id: int, ip: str = "") -> Settlement:
    s = sess.get(Settlement, settlement_id)
    if s is None:
        raise DomainError("این دریافت/پرداخت پیدا نشد.")
    if s.status == "issued":
        return s
    if s.status == "cancelled":
        raise DomainError("این عملیات ابطال شده است.")
    party = sess.get(Party, s.party_id)
    acc = sess.get(Account, s.account_id)
    if s.direction == "in":
        lines = [{"account_id": acc.id, "debit": s.amount_rial, "credit": 0,
                  "description": f"دریافت از {party.name}"},
                 {"account_id": party.account_id, "debit": 0, "credit": s.amount_rial,
                  "description": f"تسویه حساب {party.name}"}]
        title = f"دریافت {s.number} از {party.name}"
    else:
        lines = [{"account_id": party.account_id, "debit": s.amount_rial, "credit": 0,
                  "description": f"پرداخت به {party.name}"},
                 {"account_id": acc.id, "debit": 0, "credit": s.amount_rial,
                  "description": f"پرداخت از {acc.name}"}]
        title = f"پرداخت {s.number} به {party.name}"
    entry = svc.create_draft(sess, user, s.doc_date, title, lines, source="system",
                             source_ref=s.number, ip=ip)
    svc.post_entry(sess, user, entry.id, ip)
    s.entry_id = entry.id
    s.status = "issued"
    _allocate(sess, s)
    sess.flush()
    svc.audit(sess, user, "settlement.issue", "settlement", str(s.id), s.number, ip)
    return s


def cancel_settlement(sess, user, settlement_id: int, reason: str, ip: str = "") -> Settlement:
    s = sess.get(Settlement, settlement_id)
    if s is None:
        raise DomainError("این عملیات پیدا نشد.")
    if s.status == "issued" and s.entry_id:
        svc.reverse_entry(sess, user, s.entry_id, reason or "ابطال دریافت/پرداخت", ip)
        for a in s.allocations:
            if a.target_type == "invoice":
                doc = sess.get(Invoice, a.target_id)
            else:
                doc = sess.get(SupplierBill, a.target_id)
            if doc:
                doc.paid_rial = max(0, doc.paid_rial - a.amount_rial)
        s.allocations.clear()
    s.status = "cancelled"
    svc.audit(sess, user, "settlement.cancel", "settlement", str(s.id), reason, ip)
    return s


def list_settlements(sess, direction: str | None = None, party_id: int | None = None,
                     trip_id: int | None = None, limit: int = 300,
                     only_creator: int | None = None) -> list[dict]:
    q = select(Settlement).order_by(Settlement.doc_date.desc(), Settlement.id.desc())
    if only_creator is not None:
        q = q.where(Settlement.created_by == only_creator)
    if direction and direction != "all":
        q = q.where(Settlement.direction == direction)
    if party_id:
        q = q.where(Settlement.party_id == party_id)
    if trip_id:
        q = q.where(Settlement.trip_id == trip_id)
    parties = {p.id: p.name for p in sess.execute(select(Party)).scalars()}
    accounts = svc.account_map(sess)
    out = []
    for s in sess.execute(q.limit(limit)).scalars():
        out.append({"id": s.id, "number": s.number, "date": jd.jalali_str(s.doc_date),
                    "direction": s.direction, "party_id": s.party_id,
                    "party": parties.get(s.party_id, "?"),
                    "account": accounts[s.account_id].name if s.account_id in accounts else "",
                    "amount": s.amount_rial, "description": s.description, "status": s.status,
                    "trip_id": s.trip_id,
                    "allocations": [{"target_type": a.target_type, "target_id": a.target_id,
                                     "amount": a.amount_rial} for a in s.allocations]})
    return out


# ------------------------------------------------------------------ تقویم پول و صف تأیید
def cash_calendar(sess, days: int = 30, today: date | None = None) -> dict:
    today = today or jd.jtoday()
    horizon = today + timedelta(days=days)
    parties = {p.id: p.name for p in sess.execute(select(Party)).scalars()}
    items, overdue = [], []

    def push(kind: str, doc, direction: str, title: str, when: date, amount: int,
             ref: str, party_id: int):
        if amount <= 0:
            return
        row = {"kind": kind, "title": title, "ref": ref, "date": jd.jalali_str(when),
               "date_iso": when.isoformat(), "direction": direction, "amount": amount,
               "party": parties.get(party_id, "?"), "days_left": (when - today).days}
        (overdue if when < today else items).append(row)

    for i in sess.execute(select(Invoice).where(Invoice.status == "issued",
                                                Invoice.total_rial > Invoice.paid_rial)).scalars():
        push("invoice", i, "in", f"مانده فاکتور {i.number} — {i.description or ''}".strip(),
             i.due_date or i.doc_date, i.total_rial - i.paid_rial, i.number, i.party_id)
    for b in sess.execute(select(SupplierBill).where(SupplierBill.status == "issued",
                                                     SupplierBill.total_rial > SupplierBill.paid_rial)).scalars():
        push("bill", b, "out", f"مانده صورتحساب {b.number} — {b.description or ''}".strip(),
             b.due_date or b.doc_date, b.total_rial - b.paid_rial, b.number, b.party_id)
    for r in sess.execute(select(RecurringEntry).where(RecurringEntry.is_active.is_(True))).scalars():
        try:
            lines = json.loads(r.lines_json or "[]")
            amount = sum(int(l.get("debit") or 0) for l in lines)
        except Exception:  # noqa: BLE001
            amount = 0
        if amount <= 0:
            continue
        for offset in (0, 1):
            jy, jm, _ = jd.jalali_parts(today)
            jm += offset
            if jm > 12:
                jy, jm = jy + 1, 1
            first, last = jd.daterange_month(jy, jm)
            day = min(max(1, r.day_of_month), last.day)
            when = date.fromordinal(first.toordinal() + day - 1)
            if when < today or when > horizon:
                continue
            items.append({"kind": "recurring", "title": f"سند تکراری: {r.title}", "ref": r.title,
                          "date": jd.jalali_str(when), "date_iso": when.isoformat(),
                          "direction": "out", "amount": amount, "party": "—",
                          "days_left": (when - today).days})

    items.sort(key=lambda r: r["date_iso"])
    overdue.sort(key=lambda r: r["date_iso"])
    return {
        "from": jd.jalali_str(today), "to": jd.jalali_str(horizon), "days": days,
        "items": [i for i in items if i["date_iso"] <= horizon.isoformat()],
        "overdue": overdue,
        "total_in": sum(i["amount"] for i in items if i["direction"] == "in"),
        "total_out": sum(i["amount"] for i in items if i["direction"] == "out"),
        "overdue_in": sum(i["amount"] for i in overdue if i["direction"] == "in"),
        "overdue_out": sum(i["amount"] for i in overdue if i["direction"] == "out"),
    }


def approvals(sess) -> dict:
    """صف تأیید: چیزهایی که کارمند ثبت کرده و منتظر حسابدار است."""
    rows = sess.execute(
        select(JournalEntry).where(JournalEntry.status == "draft")
        .order_by(JournalEntry.entry_date, JournalEntry.id)).scalars()
    users = {u.id: u for u in sess.execute(select(__import__("app.models", fromlist=["User"]).User)).scalars()}
    items = []
    for e in rows:
        owner = users.get(e.created_by)
        items.append({"id": e.id, "date": jd.jalali_str(e.entry_date), "description": e.description,
                      "by": owner.full_name or owner.username if owner else "—",
                      "role": owner.role if owner else "", "amount": sum(l.debit_rial for l in e.lines),
                      "balanced": sum(l.debit_rial for l in e.lines) == sum(l.credit_rial for l in e.lines),
                      "source": e.source})
    draft_inv = sess.execute(select(func.count(Invoice.id)).where(Invoice.status == "draft")).scalar() or 0
    draft_bill = sess.execute(select(func.count(SupplierBill.id)).where(SupplierBill.status == "draft")).scalar() or 0
    draft_settle = sess.execute(select(func.count(Settlement.id)).where(Settlement.status == "draft")).scalar() or 0
    return {"entries": items, "count": len(items), "draft_invoices": draft_inv,
            "draft_bills": draft_bill, "draft_settlements": draft_settle}


# ------------------------------------------------------------------ سندهای تکراری
def create_recurring(sess, user, title: str, day_of_month: int, raw_lines: list[dict],
                     description: str = "", ip: str = "") -> RecurringEntry:
    if len((title or "").strip()) < 2:
        raise DomainError("عنوان سند تکراری را بنویسید.")
    if not (1 <= int(day_of_month) <= 31):
        raise DomainError("روز ماه باید بین ۱ و ۳۱ باشد.")
    check = [{"account_id": l.get("account_id"), "debit": l.get("debit"), "credit": l.get("credit"),
              "description": l.get("description", "")} for l in raw_lines]
    v = svc._validated_lines(sess, check)          # همان بررسی سند معمولی
    if v.problems:
        raise DomainError(v.message(), "invalid_lines")
    lines = [{"account_id": l.account_id, "debit": l.debit, "credit": l.credit,
              "description": l.description} for l in v.lines]
    r = RecurringEntry(title=title.strip()[:120], day_of_month=int(day_of_month),
                       description=description[:300], lines_json=json.dumps(lines, ensure_ascii=False),
                       created_by=user.id)
    sess.add(r)
    sess.flush()
    svc.audit(sess, user, "recurring.create", "recurring", str(r.id), r.title, ip)
    return r


def list_recurring(sess) -> list[dict]:
    out = []
    for r in sess.execute(select(RecurringEntry).order_by(RecurringEntry.day_of_month)).scalars():
        try:
            lines = json.loads(r.lines_json or "[]")
        except Exception:  # noqa: BLE001
            lines = []
        labels = svc.label_map(sess)
        out.append({"id": r.id, "title": r.title, "day": r.day_of_month,
                    "description": r.description, "is_active": r.is_active,
                    "last_period": r.last_period,
                    "amount": sum(int(l.get("debit") or 0) for l in lines),
                    "lines": [{"account_id": l["account_id"],
                               "account": labels.get(l["account_id"], "?"),
                               "debit": l.get("debit", 0), "credit": l.get("credit", 0)} for l in lines]})
    return out


def generate_recurring(sess, user, recurring_id: int, jy: int, jm: int, ip: str = "") -> JournalEntry:
    r = sess.get(RecurringEntry, recurring_id)
    if r is None:
        raise DomainError("این سند تکراری پیدا نشد.")
    period_key = f"{jy}-{jm:02d}"
    if r.last_period == period_key:
        raise DomainError(f"سند «{r.title}» برای {jd.MONTHS[jm - 1]} {jy} از قبل ساخته شده است.")
    first, last = jd.daterange_month(jy, jm)
    day = min(max(1, r.day_of_month), last.day)
    when = date.fromordinal(first.toordinal() + day - 1)
    lines = json.loads(r.lines_json or "[]")
    entry = svc.create_draft(sess, user, when, r.description or r.title, lines,
                             source="system", source_ref=f"تکراری {r.title}", ip=ip)
    r.last_period = period_key
    sess.flush()
    svc.audit(sess, user, "recurring.generate", "recurring", str(r.id),
              f"{r.title} — {period_key}", ip)
    return entry


def toggle_recurring(sess, user, recurring_id: int, is_active: bool, ip: str = "") -> RecurringEntry:
    r = sess.get(RecurringEntry, recurring_id)
    if r is None:
        raise DomainError("این سند تکراری پیدا نشد.")
    r.is_active = bool(is_active)
    svc.audit(sess, user, "recurring.toggle", "recurring", str(r.id), str(is_active), ip)
    return r
