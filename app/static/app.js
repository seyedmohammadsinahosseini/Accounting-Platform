/* سامانه‌ی حسابداری آژانس مسافرتی — بخش نمایش */
"use strict";

const state = { token: null, user: null, accounts: [], page: "dashboard", moduleId: null,
  pendingRequests: new Map(), retryKeys: new Map() };
const $ = (sel, root = document) => root.querySelector(sel);

/* آیکون‌های منو — خط‌های ساده، بدون تصویر بیرونی */
const ICONS = {
  dash: '<path d="M3 3h7v7H3V3Zm11 0h7v4h-7V3ZM3 14h7v7H3v-7Zm11-3h7v10h-7V11Z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/>',
  book: '<path d="M4 3h7v18H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 1h6a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-6V4Z"/>',
  invoice: '<path d="M6 2h9l4 4v16l-3-2-3 2-3-2-3 2V3a1 1 0 0 1 1-1Zm2 6h8v2H8V8Zm0 4h8v2H8v-2Z"/>',
  purchase: '<path d="M7 4h10l1 4h2l-1.5 12h-13L4 8h2l1-4Zm2 2-.5 2h7L15 6H9Zm-.5 6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm7 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"/>',
  wallet: '<path d="M3 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h-8a3 3 0 0 0 0 6h8v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm11 5h7v2h-7a1 1 0 0 1 0-2Z"/>',
  plane: '<path d="M2 13.5 21 4l-6 16-3.2-6.3L2 13.5Z"/>',
  people: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 13c3.2 0 5.8 1.7 5.8 4v3H3.2v-3C3.2 14.7 5.8 13 9 13Zm7.5.5c2.4 0 4.3 1.3 4.3 3v3h-5.3v-3c0-1.1-.4-2.1-1.1-2.9.7-.1 1.4-.1 2.1-.1Z"/>',
  calendar: '<path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Z"/>',
  payroll: '<path d="M12 2v20a10 10 0 1 0 0-20Zm1 5h5v2h-3.2c-.6 0-1 .3-1 .8s.4.7 1.3 1l1 .3c1.7.5 2.7 1.4 2.7 2.9 0 1.6-1.2 2.6-3 2.9V18h-2v-1.9c-1.9-.3-3.2-1.3-3.4-3.2h2.1c.2.8.8 1.3 1.9 1.3 1.1 0 1.7-.4 1.7-1.1 0-.6-.4-.9-1.5-1.2l-.9-.3c-1.5-.4-2.5-1.3-2.5-2.7 0-1.4 1-2.4 2.6-2.8V7Z"/>',
  refresh: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>',
  ledger: '<path d="M5 4h14v16H5a2 2 0 0 1 0-4h12V8H5a2 2 0 0 1 0-4Zm2 10h3v2H7v-2Z"/>',
  scale: '<path d="M12 3v3h6v2h-2.2l3 6h-2.1l-.8-1.7-2.6 5.2a1 1 0 0 1-1.8 0L9 12.3 8.2 14H6.1l3-6H7V6h5V3Zm0 12.6 1.6-3.2h-3.2L12 15.6ZM4 20h16v2H4v-2Z"/>',
  cash: '<path d="M3 6h18v12H3V6Zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 9v6h1.2A4.8 4.8 0 0 1 6 9Zm12 0a4.8 4.8 0 0 1-1.2 6H18V9Z"/>',
  chart: '<path d="M4 20h16v2H4v-2Zm2-4V9h3v7H6Zm5 0V4h3v12h-3Zm5 0v-5h3v5h-3Z"/>',
  excel: '<path d="M6 2h8l4 4v16H6V2Zm2 7 2.4 3.5L8 16h2.3l1.7-2.5L13.7 16H16l-2.4-3.5L16 9h-2.3l-1.7 2.5L10.3 9H8Z"/>',
  tree: '<path d="M3 4h8v4H8v3h5v4h-3v5H8v-5H3v-4h5V8H3V4Zm11 0h7v4h-7V4Z"/>',
  lock: '<path d="M12 2a4 4 0 0 0-4 4v2H6v14h12V8h-2V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2h-4Z"/>',
  history: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 9.6 4 2.3-1 1.7-5-2.9V7h2v5.6Z"/>',
  asset: '<path d="M4 7h16v13H4V7Zm2-3h12v2H6V4Zm4 6h4v2h-4V10Z"/>',
  closing: '<path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Z"/>',
  file: '<path d="M6 2h8l4 4v16H6V2Zm8 1.5V7h3.5L14 3.5Z"/>',
};

const NAV = [
  { sep: "صفحه‌ی اصلی" },
  { id: "dashboard", title: "صفحه‌ی اصلی", perm: "dashboard.view", icon: "dash" },

  { sep: "عملیات حسابداری" },
  { id: "entries", title: "سند روزنامه", hint: "ثبت و پیگیری سندهای روزانه", color: "tile-purple", perm: ["journal.view", "journal.view_own"], icon: "book" },
  { id: "approvals", title: "صف تأیید", hint: "بررسی و ثبت نهایی پیش‌نویس‌ها", color: "tile-red", perm: "journal.post", icon: "check" },
  { id: "recurring", title: "سندهای تکراری", hint: "ساخت سندهای دوره‌ای", color: "tile-slate", perm: ["journal.view", "journal.view_own"], icon: "refresh" },

  { sep: "فروش، خرید و سفر" },
  { id: "invoices", title: "فاکتور فروش", hint: "صدور فاکتور خدمات سفر", color: "tile-green", perm: ["journal.view", "reports.view", "journal.create"], icon: "invoice" },
  { id: "purchases", title: "فاکتور خرید", hint: "ثبت صورتحساب تأمین‌کنندگان", color: "tile-orange", perm: ["journal.view", "reports.view", "journal.create"], icon: "purchase" },
  { id: "trips", title: "پرونده‌های سفر", hint: "سفرها، خدمات و مسافران", color: "tile-slate", perm: ["journal.view", "reports.view"], icon: "plane" },

  { sep: "اطلاعات پایه" },
  { id: "accounts", title: "کدینگ حساب‌ها", hint: "گروه، کل، معین و تفصیلی", color: "tile-teal", perm: "accounts.view", icon: "tree" },
  { id: "parties", title: "مشتری‌ها و تأمین‌کنندگان", hint: "اطلاعات تماس و مالیاتی", color: "tile-blue", perm: ["journal.view", "reports.view"], icon: "people" },

  { sep: "دریافت و پرداخت" },
  { id: "settlements", title: "دریافت و پرداخت", hint: "وصول مطالبات و پرداخت بدهی‌ها", color: "tile-green", perm: ["journal.view", "reports.view", "journal.create"], icon: "cash" },
  { id: "treasury", title: "صندوق و بانک", hint: "حساب‌ها و انتقال‌های نقدی", color: "tile-teal", perm: "cash.view", icon: "cash" },
  { id: "calendar", title: "تقویم پول", hint: "سررسید دریافت‌ها و پرداخت‌ها", color: "tile-blue", perm: "reports.view", icon: "calendar" },

  { sep: "حقوق و دارایی‌ها" },
  { id: "payroll", title: "حقوق و دستمزد", hint: "محاسبه و ثبت کارکرد ماهانه", color: "tile-purple", perm: ["payroll.view", "payroll.manage"], icon: "payroll" },
  { id: "assets", title: "دارایی‌های ثابت", hint: "خرید، استهلاک و واگذاری", color: "tile-brown", perm: "assets.view", icon: "asset" },

  { sep: "مالیات و گزارش‌ها" },
  { id: "moadian", title: "سامانه‌ی مودیان", hint: "کنترل صورتحساب و گزارش مالیات", color: "tile-red", perm: "moadian.view", icon: "file" },
  { id: "trial", title: "تراز آزمایشی", hint: "مانده‌ی بدهکار و بستانکار", color: "tile-blue", perm: "reports.view", icon: "scale" },
  { id: "ledger", title: "دفتر حساب", hint: "گردش هر حساب در دوره", color: "tile-teal", perm: "reports.view", icon: "ledger" },
  { id: "receivables", title: "طلب و بدهی", hint: "مانده‌های باز مشتری و تأمین‌کننده", color: "tile-orange", perm: "reports.view", icon: "chart" },
  { id: "statements", title: "صورت‌های مالی", hint: "سود و زیان، ترازنامه و جریان نقدی", color: "tile-purple", perm: "reports.view", icon: "chart" },
  { id: "closing", title: "بستن سال مالی", hint: "کنترل و بستن دوره‌ی سالانه", color: "tile-brown", perm: "fiscal.view", icon: "closing" },
  { id: "excel", title: "خروجی و ورودی اکسل", hint: "گزارش‌ها و قالب‌های اکسل", color: "tile-green", perm: ["journal.view", "journal.view_own", "accounts.view"], icon: "excel" },

  { sep: "مدیریت سامانه" },
  { id: "periods", title: "دوره‌های مالی", hint: "مدیریت سال‌ها و دوره‌ها", color: "tile-slate", perm: "fiscal.view", icon: "calendar" },
  { id: "users", title: "کاربران و دسترسی‌ها", hint: "نقش‌ها و سطح دسترسی", color: "tile-purple", perm: "users.manage", icon: "lock" },
  { id: "storage", title: "پشتیبان و سلامت داده", hint: "بررسی و ساخت پشتیبان", color: "tile-brown", perm: "users.manage", icon: "asset" },
  { id: "audit", title: "ردّ کار", hint: "سوابق تغییر و ورود کاربران", color: "tile-blue", perm: "audit.view", icon: "history" },
];

const RIBBON = [
  { id: "dashboard", title: "صفحه‌ی اصلی", hint: "نمای کلی سامانه", icon: "dash", color: "tile-slate", page: "dashboard", perm: "dashboard.view" },
  { id: "accounting", title: "عملیات حسابداری", hint: "اسناد، تأیید و ثبت‌های دوره‌ای", icon: "book", color: "tile-purple", pages: ["entries", "approvals", "recurring"] },
  { id: "sales", title: "عملیات فروش", hint: "فاکتور فروش و پرونده‌های سفر", icon: "invoice", color: "tile-green", pages: ["invoices", "trips"] },
  { id: "purchases", title: "عملیات خرید", hint: "فاکتورهای خرید از تأمین‌کنندگان", icon: "purchase", color: "tile-orange", pages: ["purchases"] },
  { id: "cash", title: "دریافت و پرداخت", hint: "صندوق، بانک و تقویم سررسید", icon: "cash", color: "tile-teal", pages: ["settlements", "treasury", "calendar"] },
  { id: "base", title: "اطلاعات پایه", hint: "کدینگ و اشخاص تجاری", icon: "tree", color: "tile-blue", pages: ["accounts", "parties"] },
  { id: "payroll", title: "حقوق و دستمزد", hint: "محاسبه‌ی حقوق و بیمه", icon: "payroll", color: "tile-purple", pages: ["payroll"] },
  { id: "assets", title: "دارایی ثابت", hint: "خرید، استهلاک و واگذاری", icon: "asset", color: "tile-brown", pages: ["assets"] },
  { id: "reports", title: "گزارش‌ها", hint: "دفترها و صورت‌های مالی", icon: "chart", color: "tile-slate", pages: ["trial", "ledger", "receivables", "statements", "closing", "excel"] },
  { id: "tax", title: "عملیات مالیاتی", hint: "صورتحساب و گزارش مودیان", icon: "file", color: "tile-red", pages: ["moadian"] },
  { id: "management", title: "مدیریت سامانه", hint: "کاربران، دوره و پشتیبان", icon: "lock", color: "tile-brown", pages: ["periods", "users", "storage", "audit"] },
];

/* ------------------------------------------------------------------ ابزارها */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function faDigits(s) {
  return String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
function fmt(n) {
  const v = Number(n || 0);
  return faDigits(v.toLocaleString("en-US"));
}
function money(n) { return fmt(n) + " ریال"; }
function todayJalali() {
  const d = new Date();
  return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm, jd;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
function jalaliToGregorian(jy, jm, jd) {
  jy = Number(jy) - 979; jm = Number(jm) - 1; jd = Number(jd) - 1;
  let dayNo = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jm; i++) dayNo += i < 6 ? 31 : 30;
  dayNo += jd;
  let gNo = dayNo + 79;
  let gy = 1600 + 400 * Math.floor(gNo / 146097);
  gNo %= 146097;
  if (gNo >= 36525) {
    gNo--; gy += 100 * Math.floor(gNo / 36524); gNo %= 36524;
    if (gNo >= 365) gNo++;
  }
  gy += 4 * Math.floor(gNo / 1461); gNo %= 1461;
  let leap = true;
  if (gNo >= 366) { leap = false; gNo--; gy += Math.floor(gNo / 365); gNo %= 365; }
  let gd = gNo + 1;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 12 && gd > days[gm]) { gd -= days[gm]; gm++; }
  return new Date(gy, gm, gd);
}
let miniCal = null;
let miniCalSelected = "";
function renderMiniCalendar() {
  const box = $("#mini-calendar");
  if (!box) return;
  if (!miniCal) {
    const parts = todayJalali().split("/").map(Number);
    miniCal = { year: parts[0], month: parts[1] };
    miniCalSelected = todayJalali();
  }
  const { year, month } = miniCal;
  const first = jalaliToGregorian(year, month, 1);
  const offset = (first.getDay() + 1) % 7;
  const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : 29;
  const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
  const cells = Array(offset).fill('<span class="mini-cal-empty"></span>');
  for (let day = 1; day <= maxDay; day++) {
    const value = `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
    const isToday = value === todayJalali();
    const selected = value === miniCalSelected;
    cells.push(`<button type="button" class="mini-cal-day ${isToday ? "today" : ""} ${selected ? "selected" : ""}"
      data-date="${value}" aria-pressed="${selected}" aria-label="${faDigits(value)}">${faDigits(day)}</button>`);
  }
  box.innerHTML = `
    <div class="mini-cal-head">
      <button type="button" data-month-step="-1" aria-label="ماه قبل">‹</button>
      <strong>${JALALI_MONTHS[month - 1]} ${faDigits(year)}</strong>
      <button type="button" data-month-step="1" aria-label="ماه بعد">›</button>
    </div>
    <div class="mini-cal-week">${weekdays.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="mini-cal-grid">${cells.join("")}</div>
    <div class="mini-cal-foot"><span>تاریخ انتخابی</span><strong>${faDigits(miniCalSelected || todayJalali())}</strong></div>`;
  box.querySelectorAll("[data-month-step]").forEach((button) => button.addEventListener("click", () => {
    let m = miniCal.month + Number(button.dataset.monthStep);
    let y = miniCal.year;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    miniCal = { year: y, month: m };
    renderMiniCalendar();
  }));
  box.querySelectorAll("[data-date]").forEach((button) => button.addEventListener("click", () => {
    miniCalSelected = button.dataset.date;
    renderMiniCalendar();
  }));
}

function numToLatin(s) {
  return String(s == null ? "" : s)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}
function parseMoney(s) {
  let t = numToLatin(s).replace(/[,\s٬]/g, "").replace("ریال", "").replace("تومان", "");
  let mult = 1;
  if (t.includes("میلیارد")) { mult = 1e9; t = t.replace("میلیارد", ""); }
  else if (t.includes("میلیون")) { mult = 1e6; t = t.replace("میلیون", ""); }
  else if (t.includes("هزار")) { mult = 1e3; t = t.replace("هزار", ""); }
  const n = Number(t || 0);
  return Math.round(n * mult) || 0;
}
/* پیام‌های کوتاه گوشه‌ی صفحه: آیکن + متن + دکمه‌ی بستن.
   خطاها بلند خوانده می‌شوند (role=alert)، بقیه آرام (role=status). */
const TOAST_ICONS = {
  ok: "M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm-1 12.6L5.7 11l1.2-1.2 2.1 2.1 4.3-4.3 1.2 1.2L9 14.2Z",
  bad: "M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm3.5 11.1-1.3 1.3L10 11.8l-2.2 2.2-1.3-1.3 2.2-2.2-2.2-2.2 1.3-1.3L10 9.2l2.2-2.2 1.3 1.3-2.2 2.2 2.2 2.2Z",
  warn: "M10 1.8 1.4 17h17.2L10 1.8Zm1 11.4H9v-2h2v2Zm0-3.4H9V7h2v2.8Z",
  info: "M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8ZM11 15H9V9h2v6Zm0-8H9V5h2v2Z",
};

function toast(msg, kind = "") {
  const box = document.createElement("div");
  box.className = "toast " + kind;
  box.setAttribute("role", kind === "bad" ? "alert" : "status");

  const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ic.setAttribute("class", "toast-ico");
  ic.setAttribute("viewBox", "0 0 20 20");
  ic.setAttribute("width", "18");
  ic.setAttribute("height", "18");
  ic.setAttribute("fill", "currentColor");
  ic.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", TOAST_ICONS[kind] || TOAST_ICONS.info);
  ic.appendChild(path);

  const text = document.createElement("span");
  text.className = "toast-msg";
  text.textContent = msg;

  const x = document.createElement("button");
  x.type = "button";
  x.className = "toast-x";
  x.setAttribute("aria-label", "بستن پیام");
  x.textContent = "✕";
  x.addEventListener("click", () => box.remove());

  box.appendChild(ic);
  box.appendChild(text);
  box.appendChild(x);
  $("#toast-root").appendChild(box);
  setTimeout(() => box.remove(), kind === "bad" ? 9000 : 6000);
}
function can(perm) {
  if (!state.user) return false;
  const list = Array.isArray(perm) ? perm : [perm];
  const mine = state.user.permissions || [];
  return list.some((p) => mine.includes(p));
}

/* ----------------------------------------- قاب برنامه: روشنایی، منو، جست‌وجو */
/* سه چیز کوچک ولی پرکاربرد: حالت شب، باز و بسته کردن منو روی موبایل،
   و کادر «پیدا کردن صفحه» داخل منو. */
const THEME_KEY = "acct_theme_v2";

function currentTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch (err) { return "dark"; }
}

function applyTheme(name) {
  const theme = name === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "dark" : "light");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", "#0b1319");
  const btn = $("#btn-theme");
  if (btn) {
    btn.title = theme === "dark" ? "روشن کردن صفحه" : "تیره کردن صفحه";
    btn.setAttribute("aria-label", btn.title);
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* بی‌اهمیت */ }
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function openDrawer() {
  const side = $("#sidebar");
  if (!side) return;
  side.classList.add("open");
  const back = $("#drawer-back");
  if (back) back.hidden = false;
  document.body.classList.add("drawer-open");
  const btn = $("#btn-drawer");
  if (btn) btn.setAttribute("aria-expanded", "true");
}

function closeDrawer() {
  const side = $("#sidebar");
  if (!side || !side.classList.contains("open")) return;
  side.classList.remove("open");
  const back = $("#drawer-back");
  if (back) back.hidden = true;
  document.body.classList.remove("drawer-open");
  const btn = $("#btn-drawer");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

/* کادر جست‌وجوی منو: صفحه‌ها را بر اساس نامشان فیلتر می‌کند؛
   گروه‌هایی که هیچ صفحه‌ی ماندنی ندارند هم پنهان می‌شوند. */
function filterNav() {
  const box = $("#nav-filter");
  const nav = $("#nav");
  if (!box || !nav) return;
  const q = (box.value || "").trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
  let sep = null;
  let shown = 0;
  Array.from(nav.children).forEach((el) => {
    if (el.classList.contains("nav-none")) return;
    if (el.classList.contains("nav-sep")) {
      if (sep) sep.hidden = shown === 0;
      sep = el; shown = 0;
      return;
    }
    const text = (el.textContent || "").trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
    const hit = !q || text.includes(q);
    el.hidden = !hit;
    if (hit) shown += 1;
  });
  if (sep) sep.hidden = shown === 0;

  const anyVisible = Array.from(nav.querySelectorAll("button")).some((b) => !b.hidden);
  let none = nav.querySelector(".nav-none");
  if (!anyVisible) {
    if (!none) {
      none = document.createElement("div");
      none.className = "nav-none";
      nav.appendChild(none);
    }
    none.textContent = "صفحه‌ای با نام «" + box.value.trim() + "» پیدا نشد.";
    none.hidden = false;
  } else if (none) {
    none.hidden = true;
  }
}

function initShell() {
  applyTheme(currentTheme());
  const viewForScroll = $("#view");
  if (viewForScroll) {
    viewForScroll.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("button,[role=tab]")) {
        window.setTimeout(() => updateSingleTableLayout(viewForScroll, state.page), 0);
      }
    });
    viewForScroll.addEventListener("change", () => {
      window.setTimeout(() => updateSingleTableLayout(viewForScroll, state.page), 0);
    });
  }
  let tableLayoutResizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(tableLayoutResizeTimer);
    tableLayoutResizeTimer = window.setTimeout(() => {
      const currentView = $("#view");
      if (currentView) updateSingleTableLayout(currentView, state.page);
    }, 100);
  });
  const theme = $("#btn-theme");
  if (theme) theme.addEventListener("click", toggleTheme);

  const menu = $("#btn-drawer");
  if (menu) menu.addEventListener("click", () => {
    if ($("#sidebar").classList.contains("open")) closeDrawer(); else openDrawer();
  });
  const back = $("#drawer-back");
  if (back) back.addEventListener("click", closeDrawer);

  const filter = $("#nav-filter");
  if (filter) {
    filter.addEventListener("input", filterNav);
    filter.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { filter.value = ""; filterNav(); filter.blur(); }
    });
  }

  document.addEventListener("keydown", (e) => {
    const openWithKeys = (e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K");
    if (openWithKeys) {
      e.preventDefault();
      if ($("#app").classList.contains("hidden")) return;
      openDrawer();
      const f = $("#nav-filter");
      if (f) { f.focus(); f.select(); }
      return;
    }
    if (e.key === "Escape") closeDrawer();
  });
}


/* ------------------------------------------------------------------ درگاه */
function _requestHash(text) {
  // هش سبک فقط برای ادغام درخواست‌های هم‌زمان در همین مرورگر است؛ کلید واقعی
  // Idempotency تصادفی و مستقل است و سمت سرور SHA-256 می‌شود.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function _newIdempotencyKey() {
  try { return "ui-" + crypto.randomUUID(); }
  catch (err) { return "ui-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2); }
}
function _getRetryKey(fingerprint) {
  if (state.retryKeys.has(fingerprint)) return state.retryKeys.get(fingerprint);
  try {
    const saved = JSON.parse(sessionStorage.getItem("acct_idem_retry:" + fingerprint) || "null");
    if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000 && saved.key) {
      state.retryKeys.set(fingerprint, saved.key);
      return saved.key;
    }
    sessionStorage.removeItem("acct_idem_retry:" + fingerprint);
  } catch (err) { /* storage may be disabled */ }
  return "";
}
function _setRetryKey(fingerprint, key) {
  state.retryKeys.set(fingerprint, key);
  try { sessionStorage.setItem("acct_idem_retry:" + fingerprint, JSON.stringify({ key, at: Date.now() })); }
  catch (err) { /* storage may be disabled */ }
}
function _clearRetryKey(fingerprint) {
  state.retryKeys.delete(fingerprint);
  try { sessionStorage.removeItem("acct_idem_retry:" + fingerprint); }
  catch (err) { /* storage may be disabled */ }
}

function api(path, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  const bodyText = opts.body == null ? "" : JSON.stringify(opts.body);
  const fingerprint = String(state.user?.id || "anon") + "|" + method + "|" + path + "|" + _requestHash(bodyText);
  // دو کلیک سریع با همان ورودی در یک مرورگر، یک Promise و یک درخواست شبکه می‌گیرند.
  if (mutating && state.pendingRequests.has(fingerprint)) return state.pendingRequests.get(fingerprint);

  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  const sensitive = path.startsWith("/auth/") || path === "/me/password" || /\/reveal$/.test(path);
  let idemKey = headers["Idempotency-Key"] || headers["idempotency-key"] || "";
  if (mutating && !sensitive) {
    idemKey = idemKey || _getRetryKey(fingerprint) || _newIdempotencyKey();
    headers["Idempotency-Key"] = idemKey;
    delete headers["idempotency-key"];
    _setRetryKey(fingerprint, idemKey);
  }

  const request = (async () => {
    try {
      const res = await fetch("/api" + path, {
        method, headers, body: opts.body == null ? undefined : bodyText,
      });
      if (res.status === 401) { logout(false); }
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        const msg = (data && (data.detail || data.message)) || "خطایی پیش آمد.";
        const error = new Error(typeof msg === "string" ? msg : "خطایی پیش آمد.");
        error.status = res.status;
        throw error;
      }
      if (mutating && !sensitive) _clearRetryKey(fingerprint);
      return data;
    } catch (err) {
      // فقط خطای شبکه/سرور نگه‌داشتن همان شناسه را لازم دارد؛ خطای اعتبارسنجی
      // پس از اصلاح فرم باید با درخواست تازه دوباره بررسی شود.
      if (mutating && !sensitive && idemKey) {
        if (err.status == null || err.status >= 500) _setRetryKey(fingerprint, idemKey);
        else _clearRetryKey(fingerprint);
      }
      throw err;
    }
  })();
  if (mutating) {
    state.pendingRequests.set(fingerprint, request);
    const clear = () => setTimeout(() => {
      if (state.pendingRequests.get(fingerprint) === request) state.pendingRequests.delete(fingerprint);
    }, 700);
    request.then(clear, clear);
  }
  return request;
}

/* ------------------------------------------------------------------ فایل اکسل */
function fileNameFrom(headers, fallback) {
  const cd = headers.get("Content-Disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) { try { return decodeURIComponent(star[1]); } catch (e) { /* بی‌اهمیت */ } }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}

async function downloadXlsx(path, fallbackName) {
  return downloadFile(path, fallbackName || "khorooji.xlsx", "فایل اکسل آماده شد: ");
}

/* هر فایلی (اکسل یا JSON) را با نام درست و همراه توکن می‌گیرد و روی سیستم ذخیره می‌کند. */
async function downloadFile(path, fallbackName, okPrefix) {
  try {
    const res = await fetch("/api" + path, {
      headers: state.token ? { Authorization: "Bearer " + state.token } : {},
    });
    if (!res.ok) {
      let msg = "خروجی گرفته نشد.";
      try { const d = await res.json(); msg = d.detail || msg; } catch (e) { /* بی‌اهمیت */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name = fileNameFrom(res.headers, fallbackName || "file");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    toast((okPrefix || "فایل آماده شد: ") + name, "ok");
    // اگر مرورگر داخل قاب پیش‌نمایش دانلود را بست، این لینک کار را راه می‌اندازد
    const bar = document.createElement("div");
    bar.className = "toast";
    bar.innerHTML = 'دانلود شروع نشد؟ <a class="toast-link" href="' + url + '" download="' + esc(name) +
      '">همین‌جا بزن</a>';
    $("#toast-root").appendChild(bar);
    setTimeout(() => bar.remove(), 60000);
  } catch (err) { toast(err.message, "bad"); }
}

async function apiUpload(path, formData) {
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: state.token ? { Authorization: "Bearer " + state.token } : {},
    body: formData,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && (data.detail || data.message)) || "فایل خوانده نشد.");
  return data;
}

/* ------------------------------------------------------------------ ورود/خروج */
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  const username = $("#login-username").value.trim();
  const password = $("#login-password").value;
  try {
    const data = await api("/auth/login", { method: "POST", body: { username, password } });
    state.token = data.token;
    state.user = data.user;
    try { sessionStorage.setItem("acct_token", data.token); } catch (err) { /* قاب پیش‌نمایش */ }
    await enterApp();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#btn-logout").addEventListener("click", () => logout(true));
$("#btn-password").addEventListener("click", () => passwordModal());

function logout(callServer) {
  if (callServer && state.token) { api("/auth/logout", { method: "POST" }).catch(() => {}); }
  state.pendingRequests.clear();
  state.retryKeys.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("acct_idem_retry:")) sessionStorage.removeItem(key);
    }
  } catch (err) { /* storage may be disabled */ }
  state.token = null; state.user = null;
  try { sessionStorage.removeItem("acct_token"); } catch (err) { /* بی‌اهمیت */ }
  const currentView = $("#view");
  if (currentView) clearSingleTableLayout(currentView);
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-password").value = "";
}

async function tryRestore() {
  let token = null;
  try { token = sessionStorage.getItem("acct_token"); } catch (err) { token = null; }
  if (!token) return false;
  state.token = token;
  try { state.user = await api("/me"); return true; } catch (err) { state.token = null; return false; }
}

async function enterApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  // فهرست دسترسی‌ها را از سرور می‌گیریم تا منو دقیقاً بر اساس نقش کاربر ساخته شود
  try { state.user = Object.assign({}, state.user, await api("/me")); } catch (err) { /* بی‌اهمیت */ }
  const initials = (state.user.full_name || state.user.username || "؟").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]).join("");
  $("#side-user").innerHTML =
    `<span class="avatar">${esc(initials)}</span>` +
    `<span class="who"><strong>${esc(state.user.full_name || state.user.username)}</strong>` +
    `<span>${esc(state.user.role_label)}</span></span>`;
  if (!state.accounts.length) {
    try { const a = await api("/accounts"); state.accounts = a.rows; } catch (err) { state.accounts = []; }
  }
  const filter = $("#nav-filter");
  if (filter) filter.value = "";                 // هر بار ورود، منو کامل نشان داده می‌شود
  renderMiniCalendar();
  renderNav();
  enterAppReady();
  go("dashboard");
  if (state.user.must_change_password) {
    setTimeout(() => {
      toast("رمز اولیه است؛ پیش از ادامه، آن را به رمز شخصی خود تغییر دهید.", "warn");
      passwordModal();
    }, 0);
  }
}

// چیزهایی که بعد از ورود باید آماده شوند (اگر لازم بود، جای اضافه‌کردن هست)
function enterAppReady() {
  closeDrawer();
}

function renderNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  // اول گزینه‌های مجاز را در گروه‌های خودشان می‌چینیم، بعد گروه‌های خالی را نشان نمی‌دهیم
  const blocks = [];
  let current = null;
  NAV.forEach((n) => {
    if (n.sep) {
      current = { title: n.sep, items: [] };
      blocks.push(current);
      return;
    }
    if (!can(n.perm)) return;
    if (!current) {
      current = { title: "", items: [] };
      blocks.push(current);
    }
    current.items.push(n);
  });
  blocks.filter((b) => b.items.length).forEach((b) => {
    if (b.title) {
      const head = document.createElement("div");
      head.className = "nav-sep";
      head.textContent = b.title;
      nav.appendChild(head);
    }
    b.items.forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.page = n.id;
      btn.innerHTML = icon(n.icon) + "<span>" + esc(n.title) + "</span>";
      btn.addEventListener("click", () => go(n.id));
      nav.appendChild(btn);
    });
  });
  // اگر در کادر جست‌وجو چیزی نوشته شده باشد، همان فیلتر دوباره اعمال می‌شود
  filterNav();
  const active = nav.querySelector("button.active");
  if (active) {
    active.setAttribute("aria-current", "page");
    // صفحه‌ی جاری در فهرست بلند منو دیده شود — فقط خودِ منو اسکرول می‌شود،
    // تا وقتی منو بسته است صفحه جابه‌جا نشود.
    const top = active.offsetTop - nav.clientHeight / 2 + active.offsetHeight / 2;
    nav.scrollTop = Math.max(0, top);
  }
  renderRibbon();
}

function modulePages(module) {
  return (module?.pages || []).map((id) => NAV.find((item) => item.id === id))
    .filter((item) => item && can(item.perm));
}

function renderRibbon() {
  const ribbon = $("#ribbon-nav");
  if (!ribbon) return;
  ribbon.innerHTML = "";
  RIBBON.forEach((item) => {
    if (item.page && !can(item.perm)) return;
    if (!item.page && modulePages(item).length === 0) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ribbon-item";
    button.dataset.module = item.id;
    button.setAttribute("aria-label", item.title + (item.page ? "" : " — نمایش زیر‌بخش‌ها"));
    button.setAttribute("aria-haspopup", item.page ? "false" : "true");
    button.innerHTML = icon(item.icon) + "<span>" + esc(item.title) + "</span>";
    button.addEventListener("click", () => {
      if (item.page) go(item.page);
      else go("moduleHome", { moduleId: item.id });
    });
    ribbon.appendChild(button);
  });
  markRibbon(state.page);
}

function markRibbon(page) {
  let activeModule = null;
  if (page === "dashboard") activeModule = "dashboard";
  else if (page === "moduleHome") activeModule = state.moduleId;
  else activeModule = RIBBON.find((item) => item.pages?.includes(page))?.id || null;
  $("#ribbon-nav")?.querySelectorAll(".ribbon-item").forEach((button) => {
    const active = button.dataset.module === activeModule;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function icon(name) {
  const d = ICONS[name] || ICONS.file;
  return '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">' + d + "</svg>";
}

function markNav(page) {
  // صفحه‌ی جاری هم رنگی می‌شود و هم به صفحه‌خوان‌ها اعلام می‌شود (aria-current)
  $("#nav").querySelectorAll("button").forEach((b) => {
    const on = b.dataset.page === page;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const module = page === "moduleHome" ? RIBBON.find((m) => m.id === state.moduleId) : null;
  const item = module || NAV.find((n) => n.id === page);
  const title = item ? item.title : "";
  $("#page-title").textContent = title;
  document.title = (title ? title + " — " : "") + "سامانه‌ی حسابداری آژانس مسافرتی";
  document.body.dataset.page = page || "";
  markRibbon(page);
}

function clearSingleTableLayout(view) {
  document.body.classList.remove("single-table-page");
  view.classList.remove("single-table-view");
  view.querySelectorAll(".single-table-track, .single-table-panel, .single-table-fill").forEach((el) => {
    el.classList.remove("single-table-track", "single-table-panel", "single-table-fill");
  });
}

function updateSingleTableLayout(view, page) {
  if (state.page !== page) return;
  clearSingleTableLayout(view);
  if (page === "dashboard" || page === "moduleHome") return;
  const tables = Array.from(view.querySelectorAll(".table-wrap"))
    .filter((el) => el.getClientRects().length > 0);
  if (tables.length !== 1) return;

  const tableWrap = tables[0];
  const panel = tableWrap.closest(".card");
  if (panel) panel.classList.add("single-table-panel");
  if (panel) {
    let parent = tableWrap.parentElement;
    while (parent && parent !== panel) {
      parent.classList.add("single-table-fill");
      parent = parent.parentElement;
    }
  }
  let track = panel || tableWrap;
  while (track.parentElement && track.parentElement !== view) track = track.parentElement;
  if (track !== view) track.classList.add("single-table-track");
  document.body.classList.add("single-table-page");

  requestAnimationFrame(() => {
    if (state.page !== page || !document.body.classList.contains("single-table-page")) return;
    // اگر محتوای ثابتِ همین صفحه خودش از ارتفاع نمایشگر بیشتر باشد، صفحه را قفل نکن.
    if (view.scrollHeight > view.clientHeight + 4) clearSingleTableLayout(view);
  });
}

const views = {};
async function go(page, params) {
  const options = params || {};
  state.page = page;
  state.moduleId = page === "moduleHome" ? (options.moduleId || null) : null;
  markNav(page);
  closeDrawer();
  window.scrollTo(0, 0);
  $("#top-info").innerHTML = state.user.today
    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Z"/></svg>' +
      "<span>امروز: " + faDigits(state.user.today) + "</span>"
    : "";
  const view = $("#view");
  clearSingleTableLayout(view);
  view.innerHTML = `<div class="card loading-card"><span class="spinner"></span> در حال بارگذاری…</div>`;
  try {
    const renderer = views[page];
    if (typeof renderer !== "function") throw new Error("این بخش در نسخه‌ی فعلی تعریف نشده است.");
    await renderer(view, options);
    updateSingleTableLayout(view, page);
  } catch (err) {
    clearSingleTableLayout(view);
    view.innerHTML = `<div class="card"><div class="note bad">${esc(err.message)}</div></div>`;
  }
}

/* ------------------------ صفحه‌ی دسته‌بندی: کاشی‌های زیر‌بخش در فضای مرکزی */
views.moduleHome = async (view, params) => {
  const module = RIBBON.find((item) => item.id === params.moduleId && !item.page);
  if (!module) throw new Error("دسته‌بندی انتخاب‌شده پیدا نشد.");
  const pages = modulePages(module);
  view.innerHTML = `
    <div class="classic-dashboard-head module-home-head card">
      <div><span class="eyebrow">دسته‌بندی سامانه</span><h2>${esc(module.title)}</h2>
        <p class="small muted">${esc(module.hint || "برای ورود، یکی از زیر‌بخش‌ها را انتخاب کنید.")}</p></div>
      <span class="module-count">${faDigits(pages.length)} زیر‌بخش</span>
    </div>
    ${pages.length ? `<div class="classic-module-grid module-page-grid">${pages.map((item) => `
      <button type="button" class="module-tile ${item.color || "tile-slate"}" data-module-page="${item.id}"
        aria-label="ورود به ${esc(item.title)}">
        <span class="module-tile-icon">${icon(item.icon)}</span><strong>${esc(item.title)}</strong>
        <small>${esc(item.hint || "ورود به این بخش")}</small>
      </button>`).join("")}</div>`
      : `<div class="card empty">در این نقش، زیر‌بخشی برای نمایش وجود ندارد.</div>`}`;
  view.querySelectorAll("[data-module-page]").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.modulePage));
  });
};

/* ------------------------------------------------------------------ داشبورد */
views.dashboard = async (view) => {
  const d = await api("/dashboard");
  const balanced = d.trial.balanced;
  const qa = [];
  if (can("journal.create")) qa.push(`<button class="btn primary" data-qa="new-entry">سند جدید</button>`);
  if (can("journal.create")) qa.push(`<button class="btn" data-qa="invoice">فاکتور فروش تازه</button>`);
  if (can("journal.create")) qa.push(`<button class="btn" data-qa="purchase">فاکتور خرید تازه</button>`);
  if (can("journal.create")) qa.push(`<button class="btn" data-qa="settle">دریافت / پرداخت</button>`);
  if (can("assets.view")) qa.push(`<button class="btn" data-qa="assets">دارایی‌های ثابت</button>`);
  if (can("reports.view")) qa.push(`<button class="btn" data-qa="statements">صورت‌های مالی</button>`);
  // صفحه‌ی اصلی همان دسته‌بندی‌های نوار بالاست؛ ورود به هر کاشی زیر‌بخش‌های آن را نشان می‌دهد.
  const modules = RIBBON.filter((item) => !item.page && modulePages(item).length > 0);

  view.innerHTML = `
    <div class="classic-dashboard-head card">
      <div><span class="eyebrow">${faDigits(todayJalali())}</span><h2>خوش آمدید${state.user.full_name ? `، ${esc(state.user.full_name)}` : ""}</h2>
        <p class="small muted">برای ورود به عملیات اصلی، یکی از بخش‌ها را انتخاب کنید.</p></div>
      <div class="quick">${qa.join("")}</div>
    </div>
    <div class="classic-module-grid">${modules.map((m) => `<button type="button" class="module-tile ${m.color}" data-module="${m.id}">
      <span class="module-tile-icon">${icon(m.icon)}</span><strong>${esc(m.title)}</strong><small>${esc(m.hint)}</small>
    </button>`).join("")}</div>
    <div class="grid cols-4">
      <div class="card kpi"><span class="label">نقدی و بانکی</span>
        <span class="value num">${money(d.cash.total)}</span>
        <span class="small muted">صندوق و همه‌ی حساب‌های بانکی</span></div>
      <div class="card kpi"><span class="label">درآمد سال مالی ${faDigits(d.fiscal_year)}</span>
        <span class="value num">${money(d.income)}</span></div>
      <div class="card kpi gold"><span class="label">هزینه‌ی سال مالی</span>
        <span class="value num">${money(d.expense)}</span></div>
      <div class="card kpi info"><span class="label">سود تا امروز</span>
        <span class="value num ${d.profit >= 0 ? "pos" : "neg"}">${money(d.profit)}</span>
        <span class="small muted">درآمد منهای هزینه</span></div>
    </div>

    <div class="grid cols-3" style="margin-top:16px">
      <div class="card kpi"><span class="label">سندهای ثبت‌نهایی‌شده (سال مالی)</span>
        <span class="value">${faDigits(d.posted_count)}</span></div>
      <div class="card kpi ${d.draft_count ? "gold" : ""}"><span class="label">پیش‌نویس‌های باقی‌مانده</span>
        <span class="value">${faDigits(d.draft_count)}</span>
        <span class="small muted">تا ثبت نهایی نشوند وارد دفتر نمی‌شوند</span></div>
      <div class="card kpi"><span class="label">کاربران فعال</span>
        <span class="value">${faDigits(d.active_users)}</span></div>
    </div>

    <div class="grid cols-2 tables-pair dashboard-bottom" style="margin-top:16px">
      <div class="card">
        <h3>آخرین کارهای دفتر</h3>
        ${d.recent && d.recent.length ? `<div class="table-wrap"><table>
          <thead><tr><th>شماره</th><th>تاریخ</th><th>شرح</th><th>مبلغ</th><th>وضعیت</th></tr></thead>
          <tbody>${d.recent.map((e) => `<tr><td class="num">${esc(e.entry_no)}</td>
            <td class="num">${faDigits(e.date)}</td><td>${esc(e.description)}</td>
            <td class="num">${fmt(e.amount)}</td>
            <td><span class="badge ${e.status}">${e.status === "posted" ? "ثبت نهایی"
              : e.status === "draft" ? "پیش‌نویس" : "ابطال‌شده"}</span></td></tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty">هنوز سندی در این سال مالی ثبت نشده است.</div>`}
      </div>
      <div class="card dashboard-balance-card">
        <h3>وضعیت تراز</h3>
        ${balanced
          ? `<div class="note">جمع بدهکار و بستانکار برابر است: <strong class="num">${money(d.trial.total_debit)}</strong>.
              دفتر در تعادل است و صورت‌های مالی هم تراز می‌شود.</div>`
          : `<div class="note bad">جمع بدهکار و بستانکار برابر نیست. این حالت نباید پیش بیاید و باید فوری بررسی شود.</div>`}
      </div>
    </div>`;

  view.querySelectorAll("[data-qa]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.qa;
    if (k === "new-entry") entryEditor(null);
    else if (k === "invoice") quickInvoice();
    else if (k === "purchase") quickPurchaseInvoice();
    else if (k === "settle") quickSettle();
    else go(k === "assets" ? "assets" : "statements");
  }));
  view.querySelectorAll("[data-module]").forEach((b) => {
    b.addEventListener("click", () => go("moduleHome", { moduleId: b.dataset.module }));
  });
};

async function quickInvoice() {
  try {
    const meta = await loadMeta();
    invoiceEditor(meta, await loadParties(), await loadTrips());
  } catch (err) { toast(err.message, "bad"); }
}
async function quickPurchaseInvoice() {
  try {
    const [parties, trips, data] = await Promise.all([
      loadParties(), loadTrips(), api("/accounts"),
    ]);
    const accounts = data.rows.filter((a) => a.kind === "ledger" && a.report_group === "expense");
    billEditor(parties, trips, accounts);
  } catch (err) { toast(err.message, "bad"); }
}
async function quickSettle() {
  try {
    settlementEditor("in", await loadParties(), await loadTrips(), {}, () => go("settlements"));
  } catch (err) { toast(err.message, "bad"); }
}

/* ------------------------------------------------------------------ سند روزنامه */
views.entries = async (view, params) => {
  const from = params.from || state.fyStart || `${todayJalali().slice(0, 4)}/01/01`;
  const to = params.to || todayJalali();
  const status = params.status || "all";
  const q = params.q || "";
  const data = await api(`/entries?frm=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
    `&status=${status}&q=${encodeURIComponent(q)}`);
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>از تاریخ <input id="f-from" value="${esc(from)}" size="12"></label>
        <label>تا تاریخ <input id="f-to" value="${esc(to)}" size="12"></label>
        <label>وضعیت
          <select id="f-status">
            <option value="all"${status === "all" ? " selected" : ""}>همه</option>
            <option value="draft"${status === "draft" ? " selected" : ""}>پیش‌نویس</option>
            <option value="posted"${status === "posted" ? " selected" : ""}>ثبت نهایی</option>
            <option value="reversed"${status === "reversed" ? " selected" : ""}>ابطال‌شده</option>
          </select></label>
        <label>جست‌وجو <input id="f-q" value="${esc(q)}" placeholder="شرح یا شماره سند"></label>
        <button id="f-go" class="btn">نمایش</button>
        ${can("journal.create") ? `<button id="f-new" class="btn primary">سند جدید</button>` : ""}
        <button id="x-journal" class="btn">خروجی اکسل</button>
        <button id="x-template" class="btn">فایل نمونه برای ورود</button>
      </div>
      <p class="small muted">تاریخ‌ها شمسی‌اند، مثل ${faDigits(todayJalali())}.</p>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>شماره سند</th><th>تاریخ</th><th>شرح</th><th>منبع</th>
            <th>بدهکار</th><th>بستانکار</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>
          ${data.rows.length ? data.rows.map((e) => `
            <tr>
              <td class="num">${e.entry_no ? esc(e.entry_no) : "—"}</td>
              <td class="num">${faDigits(e.date)}</td>
              <td>${esc(e.description)}</td>
              <td><span class="pill">${sourceLabel(e.source)}</span></td>
              <td class="num">${fmt(e.debit_total)}</td>
              <td class="num">${fmt(e.credit_total)}</td>
              <td><span class="badge ${e.status}">${statusLabel(e.status)}</span></td>
              <td><div class="row-actions">
                <button class="btn small" data-view="${e.id}">مشاهده</button>
                ${e.status === "draft" && can("journal.post") ? `<button class="btn small primary" data-post="${e.id}">ثبت نهایی</button>` : ""}
                ${e.status === "draft" && can("journal.create") ? `<button class="btn small" data-edit="${e.id}">ویرایش</button>` : ""}
                ${e.status === "posted" && can("journal.create") ? `<button class="btn small" data-repeat="${e.id}">تکرار ماهانه</button>` : ""}
                ${e.status === "posted" && can("journal.reverse") ? `<button class="btn small danger" data-rev="${e.id}">ابطال</button>` : ""}
              </div></td>
            </tr>`).join("") : `<tr><td colspan="8" class="empty">در این بازه سندی پیدا نشد.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $("#f-go").addEventListener("click", () => go("entries", {
    from: $("#f-from").value, to: $("#f-to").value,
    status: $("#f-status").value, q: $("#f-q").value,
  }));
  const newBtn = $("#f-new");
  if (newBtn) newBtn.addEventListener("click", () => entryEditor(null));
  $("#x-journal").addEventListener("click", () => downloadXlsx(
    `/export/journal.xlsx?frm=${encodeURIComponent($("#f-from").value)}&to=${encodeURIComponent($("#f-to").value)}` +
    `&status=${$("#f-status").value}&q=${encodeURIComponent($("#f-q").value)}`, "سند-روزنامه.xlsx"));
  $("#x-template").addEventListener("click", () => downloadXlsx("/export/template.xlsx?kind=journal",
    "فایل-نمونه-سند-روزنامه.xlsx"));

  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", async () => {
    const e = await api("/entries/" + b.dataset.view);
    entryDetail(e);
  }));
  view.querySelectorAll("[data-post]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("این پیش‌نویس ثبت نهایی شود و وارد دفتر شود؟")) return;
    try {
      const e = await api(`/entries/${b.dataset.post}/post`, { method: "POST" });
      toast(`سند ${e.entry_no} ثبت نهایی شد.`, "ok");
      go("entries", { from, to, status, q });
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
    const e = await api("/entries/" + b.dataset.edit);
    entryEditor(e);
  }));
  view.querySelectorAll("[data-repeat]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const e = await api("/entries/" + b.dataset.repeat);
      recurringFromEntry(e);
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-rev]").forEach((b) => b.addEventListener("click", async () => {
    const reason = prompt("دلیل ابطال این سند را بنویسید (در دفتر می‌ماند):");
    if (!reason) return;
    try {
      const rev = await api(`/entries/${b.dataset.rev}/reverse`, { method: "POST", body: { reason } });
      toast(`سند ابطال شد؛ سند معکوس شماره ${rev.entry_no} ثبت شد.`, "ok");
      go("entries", { from, to, status, q });
    } catch (err) { toast(err.message, "bad"); }
  }));
};

function statusLabel(s) {
  return { draft: "پیش‌نویس", posted: "ثبت نهایی", reversed: "ابطال‌شده" }[s] || s;
}
function sourceLabel(s) {
  return {
    manual: "دستی", transfer: "انتقال وجه", receipt: "دریافت", payment: "پرداخت",
    payroll: "حقوق و دستمزد", depreciation: "استهلاک", opening: "افتتاحیه",
    closing: "بستن", reversal: "ابطال", system: "خودکار",
  }[s] || s;
}

/* ------------------------------------------------------------------ ویرایشگر سند */
function ledgerAccounts() {
  return state.accounts.filter((a) => a.kind === "ledger" && a.is_active);
}

function entryEditor(entry) {
  const isNew = !entry;
  const lines = isNew
    ? [{ account_id: "", debit: "", credit: "", description: "" }, { account_id: "", debit: "", credit: "", description: "" }]
    : entry.lines.map((l) => ({ account_id: String(l.account_id), debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", description: l.description }));
  const idemKey = "ui-" + Math.random().toString(36).slice(2) + Date.now();
  const modal = openModal(`
    <h3>${isNew ? "سند جدید" : "ویرایش پیش‌نویس"}</h3>
    <div class="grid cols-2">
      <label>تاریخ سند (شمسی) <input id="e-date" value="${esc(entry ? entry.date : todayJalali())}"></label>
      <label>شرح سند <input id="e-desc" value="${esc(entry ? entry.description : "")}" placeholder="مثلاً دریافت از مشتری بابت تور"></label>
    </div>
    <div class="lines" style="margin-top:14px">
      <div class="line line-head"><span>حساب</span><span>بدهکار</span><span>بستانکار</span><span>شرح سطر</span><span></span></div>
      <div id="lines-body"></div>
    </div>
    <button id="add-line" class="btn small" style="margin-top:10px">افزودن سطر</button>
    <div class="totals">
      <span>جمع بدهکار: <strong class="num" id="t-debit">0</strong></span>
      <span>جمع بستانکار: <strong class="num" id="t-credit">0</strong></span>
      <span id="t-state"></span>
    </div>
    <p class="small muted">در هر سطر فقط یکی از دو ستون بدهکار یا بستانکار پر می‌شود. می‌توانید بنویسید «۱۲ میلیون».</p>
    <div class="modal-actions">
      <button id="save-draft" class="btn primary">ذخیره پیش‌نویس</button>
      ${can("journal.post") ? `<button id="save-post" class="btn primary">ذخیره و ثبت نهایی</button>` : ""}
      <button id="cancel" class="btn">بستن</button>
    </div>`);

  const body = $("#lines-body", modal);
  function options(sel) {
    return `<option value="">— انتخاب حساب —</option>` + ledgerAccounts().map((a) =>
      `<option value="${a.id}"${String(a.id) === String(sel) ? " selected" : ""}>${esc(a.code)} — ${esc(a.name)}</option>`).join("");
  }
  function drawLines() {
    body.innerHTML = lines.map((l, i) => `
      <div class="line">
        <select data-line="${i}" data-field="account_id">${options(l.account_id)}</select>
        <input data-line="${i}" data-field="debit" class="num" value="${esc(l.debit ? fmt(l.debit) : "")}" placeholder="0">
        <input data-line="${i}" data-field="credit" class="num" value="${esc(l.credit ? fmt(l.credit) : "")}" placeholder="0">
        <input data-line="${i}" data-field="description" value="${esc(l.description)}">
        <button class="btn small" data-remove="${i}" title="حذف سطر">✕</button>
      </div>`).join("");
    body.querySelectorAll("[data-line]").forEach((inp) => {
      const onEdit = () => {
        const i = Number(inp.dataset.line), f = inp.dataset.field;
        lines[i][f] = inp.value;
        if (f === "debit" && inp.value.trim() !== "") { lines[i].credit = ""; body.querySelector(`[data-line="${i}"][data-field="credit"]`).value = ""; }
        if (f === "credit" && inp.value.trim() !== "") { lines[i].debit = ""; body.querySelector(`[data-line="${i}"][data-field="debit"]`).value = ""; }
        updateTotals();
      };
      inp.addEventListener("input", onEdit);
      inp.addEventListener("change", onEdit);
      if (inp.tagName === "INPUT" && inp.dataset.field !== "description") {
        inp.addEventListener("blur", () => {
          const v = parseMoney(inp.value);
          inp.value = v ? fmt(v) : "";
          lines[Number(inp.dataset.line)][inp.dataset.field] = v ? String(v) : "";
          updateTotals();
        });
      }
    });
    body.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
      if (lines.length <= 2) { toast("سند حداقل دو سطر دارد.", "bad"); return; }
      lines.splice(Number(b.dataset.remove), 1);
      drawLines(); updateTotals();
    }));
    updateTotals();
  }
  function totals() {
    const d = lines.reduce((s, l) => s + parseMoney(l.debit), 0);
    const c = lines.reduce((s, l) => s + parseMoney(l.credit), 0);
    return { d, c, diff: d - c };
  }
  function updateTotals() {
    const t = totals();
    $("#t-debit", modal).textContent = fmt(t.d);
    $("#t-credit", modal).textContent = fmt(t.c);
    const st = $("#t-state", modal);
    if (t.d === 0 && t.c === 0) st.innerHTML = `<span class="muted">مبالغ را وارد کنید</span>`;
    else if (t.diff === 0) st.innerHTML = `<span class="ok">سند تراز است</span>`;
    else st.innerHTML = `<span class="bad">سند تراز نیست — اختلاف ${money(Math.abs(t.diff))}</span>`;
    const postBtn = $("#save-post", modal);
    if (postBtn) postBtn.disabled = (t.diff !== 0 || t.d === 0);
  }
  $("#add-line", modal).addEventListener("click", () => {
    lines.push({ account_id: "", debit: "", credit: "", description: "" }); drawLines();
  });
  drawLines();

  function payload() {
    return {
      date: $("#e-date", modal).value,
      description: $("#e-desc", modal).value,
      lines: lines.filter((l) => l.account_id).map((l) => ({
        account_id: Number(l.account_id), debit: parseMoney(l.debit), credit: parseMoney(l.credit),
        description: l.description || "",
      })),
    };
  }
  async function save(thenPost) {
    try {
      const p = payload();
      let saved;
      if (isNew) saved = await api("/entries", { method: "POST", body: p, headers: { "Idempotency-Key": idemKey } });
      else saved = await api("/entries/" + entry.id, { method: "PUT", body: p });
      if (thenPost) {
        const posted = await api(`/entries/${saved.id}/post`, { method: "POST", headers: { "Idempotency-Key": idemKey + "-post" } });
        toast(`سند ${posted.entry_no} ثبت نهایی شد.`, "ok");
      } else {
        toast("پیش‌نویس ذخیره شد؛ تا ثبت نهایی وارد دفتر نمی‌شود.", "ok");
      }
      closeModal();
      go("entries");
    } catch (err) { toast(err.message, "bad"); }
  }
  $("#save-draft", modal).addEventListener("click", () => save(false));
  const pb = $("#save-post", modal);
  if (pb) pb.addEventListener("click", () => save(true));
  $("#cancel", modal).addEventListener("click", closeModal);
}

function entryDetail(e) {
  const modal = openModal(`
    <h3>سند ${e.entry_no ? esc(e.entry_no) : "پیش‌نویس"} <span class="badge ${e.status}">${statusLabel(e.status)}</span></h3>
    <p class="small muted">تاریخ ${faDigits(e.date)} • منبع: ${sourceLabel(e.source)} • ساخته‌شده در ${faDigits(e.created_at)}${e.posted_at ? " • ثبت نهایی " + faDigits(e.posted_at) : ""}</p>
    <p>${esc(e.description)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>حساب</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th></tr></thead>
      <tbody>${e.lines.map((l) => `<tr><td class="num">${faDigits(l.line_no)}</td><td>${esc(l.account_label)}</td>
        <td>${esc(l.description)}</td><td class="num">${l.debit ? fmt(l.debit) : "—"}</td>
        <td class="num">${l.credit ? fmt(l.credit) : "—"}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">جمع</td><td class="num">${fmt(e.debit_total)}</td><td class="num">${fmt(e.credit_total)}</td></tr></tfoot>
    </table></div>
    ${e.balanced ? `<div class="note" style="margin-top:12px">سند تراز است.</div>`
      : `<div class="note bad" style="margin-top:12px">سند تراز نیست و ثبت نهایی نمی‌شود.</div>`}
    <div class="modal-actions"><button id="close-it" class="btn">بستن</button></div>`);
  $("#close-it", modal).addEventListener("click", closeModal);
}

/* ------------------------------------------------------------------ دفتر حساب */
views.ledger = async (view, params) => {
  const accId = params.account_id || (state.accounts.find((a) => a.kind === "ledger") || {}).id;
  const from = params.from || todayJalali().slice(0, 4) + "/01/01";
  const to = params.to || todayJalali();
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>حساب <select id="l-acc">${ledgerAccounts().map((a) =>
          `<option value="${a.id}"${String(a.id) === String(accId) ? " selected" : ""}>${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select></label>
        <label>از <input id="l-from" value="${esc(from)}" size="12"></label>
        <label>تا <input id="l-to" value="${esc(to)}" size="12"></label>
        <button id="l-go" class="btn">نمایش</button>
        <button id="x-ledger" class="btn">خروجی اکسل</button>
      </div>
    </div>
    <div id="l-result"></div>`;
  $("#l-go").addEventListener("click", () => go("ledger", {
    account_id: $("#l-acc").value, from: $("#l-from").value, to: $("#l-to").value,
  }));
  $("#x-ledger") && $("#x-ledger").addEventListener("click", () => downloadXlsx(
    `/export/ledger.xlsx?account_id=${$("#l-acc").value}&frm=${encodeURIComponent($("#l-from").value)}` +
    `&to=${encodeURIComponent($("#l-to").value)}`, "دفتر-حساب.xlsx"));
  if (!accId) { $("#l-result").innerHTML = `<div class="card empty">حسابی برای نمایش وجود ندارد.</div>`; return; }
  const d = await api(`/reports/ledger?account_id=${accId}&frm=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  $("#l-result").innerHTML = `
    <div class="card">
      <h3>${esc(d.account.code)} — ${esc(d.account.name)}</h3>
      <p class="small muted">ماهیت حساب: ${d.account.nature === "debit" ? "بدهکار" : "بستانکار"} • مانده از قبل: ${money(d.opening)}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>تاریخ</th><th>شماره سند</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((r) => `<tr>
          <td class="num">${faDigits(r.date)}</td><td class="num">${esc(r.entry_no || "—")}</td>
          <td>${esc(r.description)}</td><td class="num">${r.debit ? fmt(r.debit) : "—"}</td>
          <td class="num">${r.credit ? fmt(r.credit) : "—"}</td><td class="num">${fmt(r.running)}</td></tr>`).join("")
          : `<tr><td colspan="6" class="empty">گردشی در این بازه نبوده است.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">جمع گردش</td><td class="num">${fmt(d.total_debit)}</td>
          <td class="num">${fmt(d.total_credit)}</td><td class="num">${fmt(d.closing)}</td></tr></tfoot>
      </table></div>
    </div>`;
};

/* ------------------------------------------------------------------ تراز آزمایشی */
views.trial = async (view, params) => {
  const from = params.from || todayJalali().slice(0, 4) + "/01/01";
  const to = params.to || todayJalali();
  const d = await api(`/reports/trial-balance?frm=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>از <input id="t-from" value="${esc(from)}" size="12"></label>
        <label>تا <input id="t-to" value="${esc(to)}" size="12"></label>
        <button id="t-go" class="btn">نمایش</button>
        <button id="x-trial" class="btn">خروجی اکسل</button>
      </div>
      ${d.balanced
        ? `<div class="note">جمع بدهکار و بستانکار برابر است: <strong class="num">${money(d.total_debit)}</strong></div>`
        : `<div class="note bad">تراز نیست؛ اختلاف ${money(Math.abs(d.total_debit - d.total_credit))}</div>`}
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>نام حساب</th><th>بدهکار</th><th>بستانکار</th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((r) => `<tr>
          <td class="num">${esc(r.code)}</td><td>${esc(r.name)}</td>
          <td class="num">${r.debit ? fmt(r.debit) : "—"}</td>
          <td class="num">${r.credit ? fmt(r.credit) : "—"}</td></tr>`).join("")
          : `<tr><td colspan="4" class="empty">در این بازه گردشی ثبت نشده است.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="2">جمع</td><td class="num">${fmt(d.total_debit)}</td>
          <td class="num">${fmt(d.total_credit)}</td></tr></tfoot>
      </table></div>
    </div>`;
  $("#t-go").addEventListener("click", () => go("trial", { from: $("#t-from").value, to: $("#t-to").value }));
  $("#x-trial").addEventListener("click", () => downloadXlsx(
    `/export/trial.xlsx?frm=${encodeURIComponent($("#t-from").value)}&to=${encodeURIComponent($("#t-to").value)}`,
    "تراز-آزمایشی.xlsx"));
};

/* ------------------------------------------------------------------ صندوق و بانک */
views.treasury = async (view) => {
  const d = await api("/reports/treasury");
  const cashBank = d.rows;
  view.innerHTML = `
    <div class="card">
      <h3>مانده‌ی صندوق و حساب‌های بانکی</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>حساب</th><th>نوع</th><th>مانده</th></tr></thead>
        <tbody>${cashBank.map((r) => `<tr><td class="num">${esc(r.code)}</td><td>${esc(r.name)}</td>
          <td><span class="pill">${r.group === "cash" ? "صندوق" : "بانک"}</span></td>
          <td class="num">${fmt(r.balance)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="3">جمع</td><td class="num">${fmt(d.total)}</td></tr></tfoot>
      </table></div>
      <div class="modal-actions"><button id="x-treasury" class="btn">خروجی اکسل</button></div>
      <p class="small muted" style="margin-top:10px">مانده‌ی منفی یعنی از آن حساب بیشتر از موجودی خارج شده؛ پیشنهاد می‌کنم بررسی شود.</p>
    </div>
    ${can("cash.transfer") ? `
    <div class="card">
      <h3>انتقال وجه بین حساب‌های خودمان</h3>
      <p class="small muted">این کار هیچ درآمد و هزینه‌ای ایجاد نمی‌کند؛ فقط جای پول عوض می‌شود.</p>
      <div class="grid cols-2">
        <label>از حساب <select id="tr-from">${cashBank.map((r) => `<option value="${r.id}">${esc(r.code)} — ${esc(r.name)}</option>`).join("")}</select></label>
        <label>به حساب <select id="tr-to">${cashBank.map((r, i) => `<option value="${r.id}"${i === 1 ? " selected" : ""}>${esc(r.code)} — ${esc(r.name)}</option>`).join("")}</select></label>
        <label>مبلغ (ریال) <input id="tr-amount" class="num" placeholder="۵ میلیون یا 5000000"></label>
        <label>تاریخ <input id="tr-date" value="${todayJalali()}"></label>
        <label>شرح <input id="tr-desc" placeholder="مثلاً واریز به حساب بانک برای چک"></label>
      </div>
      <div class="modal-actions"><button id="tr-go" class="btn primary">ثبت انتقال</button></div>
    </div>` : ""}`;

  $("#x-treasury").addEventListener("click", () => downloadXlsx("/export/treasury.xlsx", "صندوق-و-بانک.xlsx"));
  const go_ = $("#tr-go");
  if (go_) go_.addEventListener("click", async () => {
    try {
      const e = await api("/treasury/transfer", {
        method: "POST",
        body: {
          from_account_id: Number($("#tr-from").value),
          to_account_id: Number($("#tr-to").value),
          amount: $("#tr-amount").value,
          date: $("#tr-date").value,
          description: $("#tr-desc").value,
        },
      });
      toast(`انتقال ثبت شد؛ سند شماره ${e.entry_no}.`, "ok");
      go("treasury");
    } catch (err) { toast(err.message, "bad"); }
  });
};

/* ------------------------------------------------------------------ طلب و بدهی */
views.receivables = async (view) => {
  const d = await api("/reports/receivables");
  setTimeout(() => {
    const b = $("#x-recv");
    if (b) b.addEventListener("click", () => downloadXlsx("/export/receivables.xlsx", "طلب-و-بدهی.xlsx"));
  }, 0);
  const label = {
    receivable: "طلب از مشتریان", cheque_received: "چک‌های دریافتی",
    prepaid_supplier: "پیش‌پرداخت به تأمین‌کننده", payable: "بدهی به تأمین‌کنندگان",
    cheque_paid: "چک‌های پرداختی", advance_customer: "پیش‌دریافت از مشتریان",
  };
  view.innerHTML = `
    <div class="card">
      <h3>طلب‌ها و بدهی‌ها</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>نوع</th><th>حساب</th><th>مانده</th><th>به نفع</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr>
          <td class="num">${esc(r.code)}</td><td>${esc(label[r.group] || r.group)}</td><td>${esc(r.name)}</td>
          <td class="num">${fmt(Math.abs(r.balance))}</td>
          <td>${r.sign === "debit" ? "ما" : (r.sign === "credit" ? "آن‌ها" : "—")}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="modal-actions"><button id="x-recv" class="btn">خروجی اکسل</button></div>
      <div class="note" style="margin-top:12px">ریز هر مشتری و هر تأمین‌کننده در فاز دوم ساخته می‌شود؛ الان جمع هر حساب را می‌بینید.</div>
    </div>`;
};

/* ------------------------------------------------------------------ کدینگ حساب‌ها */
views.accounts = async (view) => {
  const d = await api("/accounts");
  const levelInfo = [
    { key: "group", title: "گروه حساب", codeLabel: "کد گروه", parent: null },
    { key: "general", title: "حساب کل", codeLabel: "کد کل", parent: "group" },
    { key: "subsidiary", title: "حساب معین", codeLabel: "کد معین", parent: "general" },
    { key: "detail", title: "حساب تفصیلی", codeLabel: "کد تفصیلی", parent: "subsidiary" },
  ];
  const reportLabels = { asset: "دارایی", liability: "بدهی", equity: "حقوق مالکانه", income: "درآمد",
    expense: "هزینه", cash: "صندوق", bank: "بانک", receivable: "دریافتنی", payable: "پرداختنی",
    vat: "ارزش افزوده", tax: "مالیات", other: "سایر" };
  function tableFor(level) {
    const rows = d.rows.filter((a) => a.level === level);
    const body = rows.length ? rows.map((a, i) => {
      const common = `<td class="num">${faDigits(i + 1)}</td><td class="num">${esc(a.code)}</td>
        <td>${esc(a.name)}${a.is_system ? ' <span class="pill">حساب سیستمی</span>' : ""}</td>`;
      const parent = a.parent_code ? `<td class="num">${esc(a.parent_code)} — ${esc(a.parent_name)}</td>` : `<td>—</td>`;
      const nature = `<td>${a.nature === "debit" ? "بدهکار" : "بستانکار"}</td>`;
      const balance = `<td class="num">${a.can_post ? fmt(a.balance) : "—"}</td>`;
      const active = `<td>${a.is_active ? '<span class="badge open">فعال</span>' : '<span class="badge closed">غیرفعال</span>'}</td>`;
      const action = `<td>${can("accounts.manage") && !a.is_system
        ? `<button class="btn small" data-toggle="${a.id}" data-active="${a.is_active}">${a.is_active ? "غیرفعال کن" : "فعال کن"}</button>` : ""}</td>`;
      if (level === "group") return `<tr>${common}<td>${esc(a.group_type_label)}</td>
        <td>${esc(a.report_type_label)}</td><td>${esc(reportLabels[a.report_group] || a.report_group)}</td>
        ${active}${action}</tr>`;
      if (level === "general") return `<tr>${common}${parent}${nature}${balance}${active}${action}</tr>`;
      if (level === "subsidiary") return `<tr>${common}${parent}${nature}<td>${esc(a.report_type_label)}</td>
        ${balance}${active}${action}</tr>`;
      return `<tr>${common}${parent}${nature}<td>${esc(a.report_type_label)}</td>${balance}${active}${action}</tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">در این سطح حسابی ثبت نشده است.</td></tr>`;
    const headers = level === "group"
      ? "<th>ردیف</th><th>کد گروه</th><th>عنوان گروه</th><th>نوع گروه</th><th>نوع گزارش</th><th>دسته</th><th>وضعیت</th><th></th>"
      : level === "general"
        ? "<th>ردیف</th><th>کد کل</th><th>عنوان کل</th><th>حساب گروه</th><th>ماهیت</th><th>مانده</th><th>وضعیت</th><th></th>"
        : level === "subsidiary"
          ? "<th>ردیف</th><th>کد معین</th><th>عنوان معین</th><th>حساب کل</th><th>ماهیت</th><th>نوع گزارش</th><th>مانده</th><th>وضعیت</th><th></th>"
          : "<th>ردیف</th><th>کد تفصیلی</th><th>عنوان تفصیلی</th><th>حساب معین</th><th>ماهیت</th><th>نوع گزارش</th><th>مانده</th><th>وضعیت</th><th></th>";
    return `<section class="account-level-panel" data-level-panel="${level}" ${level === "group" ? "" : "hidden"}>
      <div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>
    </section>`;
  }
  const countFor = (level) => d.rows.filter((a) => a.level === level).length;
  const reportGroupOptions = Object.entries(reportLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  view.innerHTML = `
    <div class="card account-chart-card">
      <div class="account-chart-head"><div><h3>کدینگ حساب‌ها</h3>
        <p class="small muted">ساختار چهارسطحی گروه ← کل ← معین ← تفصیلی. حساب‌های قدیمی حفظ شده‌اند و مانده‌ی تاریخی آن‌ها تغییر نمی‌کند.</p></div>
        <div class="row-actions"><button id="x-accounts" class="btn">خروجی اکسل</button>
          <button id="x-accounts-template" class="btn">قالب ورود / خروج</button></div>
      </div>
      <div class="account-tabs" role="tablist" aria-label="سطوح کدینگ حساب">
        ${levelInfo.map((l) => `<button type="button" class="account-tab${l.key === "group" ? " active" : ""}"
          data-level-tab="${l.key}" role="tab" aria-selected="${l.key === "group"}">
          <span>${l.title}</span><b class="num">${faDigits(countFor(l.key))}</b></button>`).join("")}
      </div>
      ${levelInfo.map((l) => tableFor(l.key)).join("")}
    </div>
    ${can("accounts.manage") ? `
    <div class="card">
      <h3>افزودن به کدینگ</h3>
      <p class="small muted">برای سطوح کل، معین و تفصیلی، حساب والد را از سطح بالاتر انتخاب کنید. حساب تفصیلی همان سطحی است که برای ثبت سند انتخاب می‌شود.</p>
      <div class="grid cols-4">
        <label>سطح حساب <select id="a-level">${levelInfo.map((l) => `<option value="${l.key}">${l.title}</option>`).join("")}</select></label>
        <label><span id="a-code-label">کد گروه</span><input id="a-code" class="num" maxlength="20" placeholder="مثلاً 1"></label>
        <label>عنوان <input id="a-name" maxlength="160" placeholder="عنوان حساب"></label>
        <label>حساب والد <select id="a-parent"><option value="">— بدون والد —</option></select></label>
        <label>ماهیت <select id="a-nature"><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></label>
        <label>نوع گروه <select id="a-group-type">${d.group_types.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join("")}</select></label>
        <label>نوع گزارش <select id="a-report-type">${d.report_types.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join("")}</select></label>
        <label>دسته‌ی گزارش داخلی <select id="a-report-group">${reportGroupOptions}</select></label>
      </div>
      <div class="modal-actions"><button id="a-go" class="btn primary">افزودن حساب</button></div>
    </div>` : ""}
    <div class="card">
      <h3>نرخ‌های مالیات</h3>
      <p class="small muted">نرخ‌ها تاریخ‌دار و قابل تنظیم‌اند؛ نرخ دلخواه از ۰ تا ۱۰۰٪ و حتی نرخ اختصاصی هر نوع خدمت ثبت کنید. صدور بعدی از نرخ موثر در تاریخ فاکتور استفاده می‌کند؛ اسناد قبلی تغییر نمی‌کنند.</p>
      <div id="tax-rows"></div>
      ${can("accounts.manage") ? `
      <div class="grid cols-4" style="margin-top:12px">
        <label>عنوان <input id="tr-title" placeholder="مثلاً مالیات ارزش افزوده"></label>
        <label>درصد <input id="tr-rate" class="num" inputmode="decimal" placeholder="مثلاً ۹٫۵"></label>
        <label>از تاریخ (شمسی) <input id="tr-from" value="${todayJalali()}"></label>
        <label>مبنای خدمت <select id="tr-service"><option value="">همه‌ی خدمات</option>
          <option value="tour">تور</option><option value="ticket">بلیت</option><option value="visa">ویزا</option>
          <option value="hotel">اقامت</option><option value="insurance">بیمه</option><option value="transfer">ترانسفر</option>
          <option value="commission">کمیسیون</option><option value="other">سایر</option></select></label>
        <label class="wide-field">یادداشت <input id="tr-note" placeholder="مبنای تغییر نرخ"></label>
      </div>
      <div class="modal-actions"><button id="tr-go" class="btn primary">ثبت نرخ تازه</button></div>` : ""}
    </div>`;

  const tr = await api("/tax-rates");
  $("#tax-rows", view).innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>عنوان</th><th>مبنای خدمت</th><th>درصد</th><th>از تاریخ</th><th>تا تاریخ</th><th>یادداشت</th>${can("accounts.manage") ? "<th></th>" : ""}</tr></thead>
    <tbody>${tr.rows.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.service_type_label || "همه‌ی خدمات")}</td>
      <td class="num">${faDigits(r.rate_percent)}٪</td><td class="num">${faDigits(r.from)}</td>
      <td class="num">${r.to === "—" ? "جاری" : faDigits(r.to)}</td><td class="small">${esc(r.note)}</td>
      ${can("accounts.manage") ? `<td><button class="btn small" data-edit-tax="${r.id}">ویرایش</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;

  view.querySelectorAll("[data-edit-tax]").forEach((button) => button.addEventListener("click", () => {
    const rate = tr.rows.find((x) => String(x.id) === button.dataset.editTax);
    if (!rate) return;
    const modal = openModal(`<h3>ویرایش نرخ مالیات</h3>
      <div class="grid cols-2">
        <label>عنوان <input id="te-title" value="${esc(rate.title)}"></label>
        <label>درصد <input id="te-rate" class="num" inputmode="decimal" value="${esc(rate.rate_percent)}"></label>
        <label>از تاریخ (شمسی) <input id="te-from" value="${esc(rate.from)}"></label>
        <label>مبنای خدمت <select id="te-service">
          <option value=""${!rate.service_type ? " selected" : ""}>همه‌ی خدمات</option>
          ${Object.entries({ tour: "تور", ticket: "بلیت", visa: "ویزا", hotel: "اقامت", insurance: "بیمه", transfer: "ترانسفر", commission: "کمیسیون", other: "سایر" })
            .map(([k, v]) => `<option value="${k}"${rate.service_type === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wide-field">یادداشت <input id="te-note" value="${esc(rate.note)}"></label>
      </div>
      <div class="modal-actions"><button id="te-save" class="btn primary">ذخیره نرخ</button>
        <button id="te-cancel" class="btn">انصراف</button></div>`);
    $("#te-cancel", modal).addEventListener("click", closeModal);
    $("#te-save", modal).addEventListener("click", async () => {
      try {
        await api(`/tax-rates/${rate.id}`, { method: "PATCH", body: {
          title: $("#te-title", modal).value,
          rate_percent: Number(numToLatin($("#te-rate", modal).value).replace(",", ".")),
          from_date: $("#te-from", modal).value,
          service_type: $("#te-service", modal).value || null,
          note: $("#te-note", modal).value,
        } });
        closeModal(); cache.meta = null; toast("نرخ مالیات به‌روز شد.", "ok"); go("accounts");
      } catch (err) { toast(err.message, "bad"); }
    });
  }));

  view.querySelectorAll("[data-level-tab]").forEach((tab) => tab.addEventListener("click", () => {
    view.querySelectorAll("[data-level-tab]").forEach((x) => {
      const active = x === tab;
      x.classList.toggle("active", active);
      x.setAttribute("aria-selected", String(active));
    });
    view.querySelectorAll("[data-level-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.levelPanel !== tab.dataset.levelTab;
    });
  }));
  const levelSelect = $("#a-level", view);
  function refreshParentOptions() {
    if (!levelSelect) return;
    const picked = levelInfo.find((x) => x.key === levelSelect.value);
    const parentSel = $("#a-parent", view);
    $("#a-code-label", view).textContent = picked.codeLabel;
    const options = picked.parent ? d.rows.filter((a) => a.level === picked.parent && a.is_active) : [];
    parentSel.innerHTML = `<option value="">${picked.parent ? "— انتخاب حساب والد —" : "— بدون والد —"}</option>` +
      options.map((a) => `<option value="${esc(a.code)}">${esc(a.code)} — ${esc(a.name)}</option>`).join("");
    parentSel.required = Boolean(picked.parent);
  }
  if (levelSelect) {
    levelSelect.addEventListener("change", refreshParentOptions);
    refreshParentOptions();
  }
  const trGo = $("#tr-go", view);
  if (trGo) trGo.addEventListener("click", async () => {
    try {
      const rate = Number(numToLatin($("#tr-rate", view).value).replace(",", "."));
      await api("/tax-rates", { method: "POST", body: { title: $("#tr-title", view).value,
        rate_percent: rate, from_date: $("#tr-from", view).value,
        service_type: $("#tr-service", view).value || null, note: $("#tr-note", view).value } });
      toast("نرخ مالیاتی تازه ثبت شد.", "ok"); cache.meta = null; go("accounts");
    } catch (err) { toast(err.message, "bad"); }
  });
  $("#x-accounts", view).addEventListener("click", () => downloadXlsx("/export/accounts.xlsx", "کدینگ-حساب‌ها.xlsx"));
  $("#x-accounts-template", view).addEventListener("click", () => downloadXlsx(
    "/export/template.xlsx?kind=accounts", "قالب-کدینگ-حساب‌ها.xlsx"));
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api("/accounts/" + b.dataset.toggle, { method: "PATCH", body: { is_active: b.dataset.active !== "true" } });
      toast("وضعیت حساب به‌روز شد.", "ok");
      state.accounts = (await api("/accounts")).rows;
      go("accounts");
    } catch (err) { toast(err.message, "bad"); }
  }));
  const aGo = $("#a-go", view);
  if (aGo) aGo.addEventListener("click", async () => {
    try {
      await api("/accounts", { method: "POST", body: {
        code: numToLatin($("#a-code", view).value).trim(), name: $("#a-name", view).value.trim(),
        nature: $("#a-nature", view).value, level: $("#a-level", view).value,
        parent_code: $("#a-parent", view).value || null,
        group_type: $("#a-group-type", view).value, report_type: $("#a-report-type", view).value,
        report_group: $("#a-report-group", view).value,
      } });
      state.accounts = (await api("/accounts")).rows;
      toast("حساب به کدینگ افزوده شد.", "ok");
      go("accounts");
    } catch (err) { toast(err.message, "bad"); }
  });
};

/* ------------------------------------------------------------------ دوره‌ها */
views.periods = async (view) => {
  const d = await api("/periods");
  view.innerHTML = `
    <div class="card">
      <h3>دوره‌های مالی</h3>
      <p class="small muted">دوره‌ی بسته یعنی دیگر سند جدیدی در آن ماه ثبت نمی‌شود؛ اسناد قبلی دست‌نخورده می‌مانند.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>دوره</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.map((p) => `<tr><td>${esc(p.title)}</td>
          <td><span class="badge ${p.status}">${p.status === "open" ? "باز" : "بسته"}</span></td>
          <td>${can("fiscal.manage") ? `<button class="btn small" data-jy="${p.jy}" data-jm="${p.jm}" data-status="${p.status}">
            ${p.status === "open" ? "بستن دوره" : "باز کردن دوره"}</button>` : ""}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>`;
  view.querySelectorAll("[data-jy]").forEach((b) => b.addEventListener("click", async () => {
    const closing = b.dataset.status === "open";
    if (closing && !confirm("این ماه بسته شود؟ بعد از بستن، ثبت سند جدید در این ماه ممکن نیست تا بازش کنید.")) return;
    try {
      await api(closing ? "/periods/close" : "/periods/reopen", { method: "POST", body: { jy: Number(b.dataset.jy), jm: Number(b.dataset.jm) } });
      toast(closing ? "دوره بسته شد." : "دوره باز شد.", "ok");
      go("periods");
    } catch (err) { toast(err.message, "bad"); }
  }));
};

/* ------------------------------------------------------------------ کاربران */
views.users = async (view) => {
  const d = await api("/users");
  view.innerHTML = `
    <div class="card">
      <h3>کاربران</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>نام کاربری</th><th>نام</th><th>نقش</th><th>آخرین ورود</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.map((u) => `<tr>
          <td class="num">${esc(u.username)}</td><td>${esc(u.full_name)}</td>
          <td><span class="badge role">${esc(u.role_label)}</span></td>
          <td class="num">${esc(u.last_login)}</td>
          <td>${u.is_active ? '<span class="badge open">فعال</span>' : '<span class="badge closed">غیرفعال</span>'}</td>
          <td><div class="row-actions">
            <button class="btn small" data-act="${u.id}" data-active="${u.is_active}">${u.is_active ? "غیرفعال کن" : "فعال کن"}</button>
            <button class="btn small" data-role="${u.id}">تغییر نقش</button>
            <button class="btn small" data-reset="${u.id}">رمز تازه</button>
          </div></td></tr>`).join("")}</tbody>
      </table></div>
      <p class="small muted" style="margin-top:10px">هر نقش، فقط بخش کار خودش را می‌بیند: کارمند فروش پرونده‌ی خودش، حسابرس فقط خواندن، حسابدار همه‌ی کار دفتر.</p>
    </div>
    <div class="card">
      <h3>کاربر جدید</h3>
      <div class="grid cols-4">
        <label>نام کاربری <input id="u-username"></label>
        <label>نام و نام خانوادگی <input id="u-full"></label>
        <label>نقش <select id="u-role">${d.roles.map((r) => `<option value="${r.key}">${esc(r.label)}</option>`).join("")}</select></label>
        <label>رمز موقت <input id="u-pass" placeholder="حداقل ۱۰ نویسه"></label>
      </div>
      <div class="modal-actions"><button id="u-go" class="btn primary">ساختن کاربر</button></div>
      <p class="small muted">رمز موقت را خودتان به کاربر بگویید و از او بخواهید بعد از اولین ورود عوضش کند.</p>
    </div>`;

  view.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api("/users/" + b.dataset.act, { method: "PATCH", body: { is_active: b.dataset.active !== "true" } });
      toast("وضعیت کاربر عوض شد.", "ok"); go("users");
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-role]").forEach((b) => b.addEventListener("click", async () => {
    const role = prompt("نقش جدید را بنویسید: admin / manager / accountant / employee / auditor");
    if (!role) return;
    try { await api("/users/" + b.dataset.role, { method: "PATCH", body: { role: role.trim() } });
      toast("نقش عوض شد.", "ok"); go("users");
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", async () => {
    const pwd = prompt("رمز موقت تازه (حداقل ۱۰ نویسه):");
    if (!pwd) return;
    try { await api(`/users/${b.dataset.reset}/reset-password`, { method: "POST", body: { new_password: pwd } });
      toast("رمز تازه گذاشته شد؛ کاربر باید بعد از ورود عوضش کند.", "ok");
    } catch (err) { toast(err.message, "bad"); }
  }));
  $("#u-go").addEventListener("click", async () => {
    try {
      await api("/users", { method: "POST", body: {
        username: numToLatin($("#u-username").value).trim().toLowerCase(),
        full_name: $("#u-full").value.trim(), role: $("#u-role").value, password: $("#u-pass").value,
      } });
      toast("کاربر ساخته شد.", "ok"); go("users");
    } catch (err) { toast(err.message, "bad"); }
  });
};

/* ------------------------------------------------ سلامت سامانه و پشتیبان */
views.storage = async (view) => {
  const [health, backups] = await Promise.all([api("/admin/storage-health"), api("/admin/backups")]);
  const b = health.backups || {};
  const d = health.database || {};
  const e = health.encryption || {};
  const disk = health.disk || {};
  const warnings = health.warnings || [];
  const encryptionGood = !!e.available && !e.plaintext_records_detected && (!e.encrypted_data_present || e.key_present);
  const statusCard = (title, value, detail, good) => `
    <div class="card health-card ${good ? "health-good" : "health-warn"}">
      <span class="health-kicker">${esc(title)}</span><strong>${esc(value)}</strong><span class="small">${esc(detail)}</span>
    </div>`;
  view.innerHTML = `
    <div class="storage-heading card">
      <div><span class="eyebrow">نگهداری اطلاعات</span><h3>سلامت داده و پشتیبان‌ها</h3>
        <p class="small muted">اعتبارسنجی SQLite و checksum پشتیبان آخر، وضعیت رمزنگاری و فضای دیسک.</p></div>
      <button id="storage-refresh" class="btn">بازآزمایی</button>
      <button id="storage-backup" class="btn primary">ساخت پشتیبان اکنون</button>
    </div>
    <div class="grid cols-4 storage-kpis">
      ${statusCard("پایگاه داده", d.integrity === "ok" ? "سالم" : "نیازمند بررسی",
        `${d.size_mb || 0} مگابایت · مجوز ${d.permissions || "—"}`, d.integrity === "ok")}
      ${statusCard("رمزنگاری اطلاعات", encryptionGood ? (e.key_present ? "کلید آماده" : "رمزنگاری فعال") : "بررسی لازم",
        e.plaintext_records_detected ? "اطلاعات قدیمی/بدون رمز شناسایی شد" :
          e.key_present ? `کلید با مجوز ${e.key_permissions || "—"}` : "کلید رمزنگاری محلی موجود نیست",
        encryptionGood)}
      ${statusCard("آخرین پشتیبان", b.last ? `${b.age_hours ?? "—"} ساعت پیش` : "وجود ندارد",
        b.last ? `${b.last.file} · checksum ${b.last_verification?.checksum_ok ? "تأیید شد" : "تأیید نشد"}` : "بلافاصله یک پشتیبان بسازید",
        !!b.last && b.last_verification?.ok !== false && b.age_hours <= Math.max(1, b.schedule_hours || 1) * 2)}
      ${statusCard("فضای آزاد", `${disk.free_mb ?? "—"} مگابایت`, `از ${disk.total_mb ?? "—"} مگابایت`,
        Number(disk.free_mb || 0) > 512)}
    </div>
    ${warnings.length ? `<div class="card"><h3>موارد نیازمند رسیدگی</h3><div class="storage-warnings">${warnings.map((w) => `<div class="note warn">${esc(w)}</div>`).join("")}</div></div>`
      : `<div class="card"><div class="note">کنترل‌های فعلی مشکلی پیدا نکردند. این وضعیت جایگزین نسخه‌ی پشتیبان خارج از سرور نیست.</div></div>`}
    <div class="card">
      <h3>نسخه‌های محلی</h3>
      <p class="small muted">فایل‌ها هر شب به‌طور زمان‌بندی‌شده بررسی می‌شوند. فایل کلید رمزنگاری همراه پشتیبان است؛ نسخه‌ی خارج از سرور را در فضای رمزگذاری‌شده نگه دارید.</p>
      <div class="table-wrap"><table><thead><tr><th>نام فایل</th><th>زمان</th><th>حجم</th><th>کلید</th><th>Checksum</th></tr></thead>
      <tbody>${backups.rows.length ? backups.rows.map((r) => `<tr><td class="ltr">${esc(r.file)}</td>
        <td>${faDigits(r.jalali)} · ${faDigits(r.at)}</td><td>${faDigits(r.size_kb)} کیلوبایت</td>
        <td>${r.contains_key ? '<span class="badge open">همراه فایل</span>' : '<span class="badge">ندارد</span>'}</td>
        <td>${r.checksum_present ? '<span class="badge">آماده‌ی بررسی</span>' : '<span class="badge closed">ندارد</span>'}</td></tr>`).join("")
        : `<tr><td colspan="5" class="center muted">هنوز پشتیبانی ساخته نشده است.</td></tr>`}</tbody></table></div>
    </div>
    <p class="small muted storage-footnote">برای بازیابی، ابتدا نسخه را در محیط آزمایشی بررسی کنید؛ دسترسی به فایل پشتیبان و کلید همراه آن را محدود نگه دارید.</p>`;
  $("#storage-refresh", view).addEventListener("click", () => go("storage"));
  $("#storage-backup", view).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await api("/admin/backups", { method: "POST", body: {} });
      toast(`پشتیبان ${result.file} ساخته و بررسی شد.`, "ok");
      go("storage");
    } catch (err) { toast(err.message, "bad"); button.disabled = false; }
  });
};

/* ------------------------------------------------------------------ ردّ کار */
views.audit = async (view) => {
  const d = await api("/audit");
  const label = {
    "entry.draft": "ساختن پیش‌نویس", "entry.draft_update": "ویرایش پیش‌نویس", "entry.post": "ثبت نهایی سند",
    "entry.reverse": "ابطال سند", "user.login": "ورود", "user.create": "ساختن کاربر",
    "user.update": "تغییر کاربر", "user.password_change": "تغییر رمز", "user.reset_password": "رمز تازه کاربر",
    "account.create": "حساب جدید", "account.update": "تغییر حساب",
    "period.close": "بستن دوره", "period.reopen": "باز کردن دوره",
  };
  view.innerHTML = `
    <div class="card">
      <h3>ردّ کار</h3>
      <p class="small muted">هر کار مهم با نام کاربر و زمان ثبت می‌شود؛ این فهرست پاک نمی‌شود.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>زمان</th><th>کاربر</th><th>کار</th><th>جزئیات</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr><td class="num">${faDigits(r.at)}</td><td>${esc(r.username)}</td>
          <td>${esc(label[r.action] || r.action)}</td><td>${esc(r.detail)}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>`;
};

/* ------------------------------------------------------------------ پنجره و رمز */
/* پنجره‌ها: عنوان برای صفحه‌خوان، فوکوس‌بندی داخل پنجره، و برگرداندن فوکوس جایی که بود */
let modalReturnFocus = null;

function _modalFocusable(modal) {
  return Array.from(modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function _trapTab(e) {
  if (e.key !== "Tab") return;
  const modal = e.currentTarget.querySelector(".modal");
  if (!modal) return;
  const items = _modalFocusable(modal);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function openModal(html) {
  modalReturnFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "modal-back";
  const box = document.createElement("div");
  box.className = "modal";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.tabIndex = -1;
  box.innerHTML = html;
  // عنوان پنجره به صفحه‌خوان‌ها معرفی می‌شود
  const title = box.querySelector("h3, h2");
  if (title) {
    if (!title.id) title.id = "modal-title";
    box.setAttribute("aria-labelledby", title.id);
  }
  back.appendChild(box);
  back.addEventListener("click", (e) => { if (e.target === back) closeModal(); });
  back.addEventListener("keydown", _trapTab);
  $("#modal-root").appendChild(back);
  document.body.classList.add("modal-open");
  // فوکوس روی اولین جای مفید می‌رود تا با کیبورد هم بشود کار کرد
  const first = box.querySelector("[autofocus]") ||
    box.querySelector("input:not([type='hidden']), select, textarea") ||
    box.querySelector("button.primary, button");
  (first || box).focus();
  return box;
}
function closeModal() {
  // همیشه بالاترین پنجره بسته می‌شود؛ اگر پنجره‌ای روی پنجره‌ی دیگر باز باشد، آن یکی سر جایش می‌ماند.
  const root = $("#modal-root");
  if (root.lastElementChild) root.lastElementChild.remove();
  if (!root.children.length) document.body.classList.remove("modal-open");
  if (modalReturnFocus && document.contains(modalReturnFocus)) {
    try { modalReturnFocus.focus(); } catch (err) { /* بی‌اهمیت */ }
  }
  modalReturnFocus = null;
}

// کلید Esc هم پنجره‌ی باز را می‌بندد؛ از همان closeModal استفاده می‌کنیم
// تا فوکوس هم به جای قبلی‌اش برگردد.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const root = $("#modal-root");
  if (root && root.lastElementChild) { closeModal(); e.preventDefault(); }
});

function passwordModal() {
  const modal = openModal(`
    <h3>تغییر رمز</h3>
    <label>رمز فعلی <input id="p-old" type="password"></label>
    <label style="margin-top:10px">رمز تازه <input id="p-new" type="password" placeholder="حداقل ۱۰ نویسه، ترکیب حرف و عدد"></label>
    <div class="modal-actions">
      <button id="p-go" class="btn primary">عوض کن</button>
      <button id="p-cancel" class="btn">بستن</button></div>`);
  $("#p-cancel", modal).addEventListener("click", closeModal);
  $("#p-go", modal).addEventListener("click", async () => {
    try {
      await api("/me/password", { method: "POST", body: { old_password: $("#p-old", modal).value, new_password: $("#p-new", modal).value } });
      closeModal();
      toast("رمز عوض شد؛ دوباره وارد شوید.", "ok");
      logout(false);
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* ------------------------------------------------------------------ شروع */
(async function boot() {
  initShell();                                   // روشنایی، منوی موبایل و جست‌وجوی منو
  if (await tryRestore()) { await enterApp(); }
})();

/* ------------------------------------------------------------------ ورود و خروج اکسل */
let pendingFile = null;

views.excel = async (view) => {
  view.innerHTML = `
    <div class="card">
      <h3>هر فایلی که اینجا می‌گیری، دوباره به برنامه برمی‌گردد</h3>
      <p>خروجی‌ها فایل اکسل معمولی هستند: در اکسل باز می‌شوند، می‌توانی دست بزنی، جمع بزنی و چاپ کنی.
      فایل‌های «سند روزنامه» و «کدینگ حساب‌ها» را می‌شود همان‌طور که هستند به برنامه برگرداند.</p>
      <div class="note">فایل‌های سند روزنامه و کدینگ حساب‌ها برمی‌گردند؛ فایل‌های گزارش (تراز، دفتر، صندوق، طلب و بدهی) فقط برای دیدن و چاپ‌اند و برگشتنشان معنا ندارد.</div>
    </div>
    <div class="card">
      <h3>۱. فایل نمونه یا خروجی فعلی را بگیر</h3>
      <div class="modal-actions">
        <button id="d-tpl-journal" class="btn primary">فایل نمونه‌ی سند روزنامه</button>
        <button id="d-tpl-accounts" class="btn primary">فایل نمونه‌ی کدینگ حساب‌ها</button>
        <button id="d-now-journal" class="btn">خروجی سندهای فعلی</button>
        <button id="d-now-accounts" class="btn">خروجی کدینگ فعلی</button>
      </div>
      <p class="small muted" style="margin-top:10px">تاریخ‌ها شمسی (مثل ${faDigits(todayJalali())}) و مبالغ به ریال و بدون جداکننده نوشته می‌شوند.</p>
    </div>
    <div class="card">
      <h3>۲. فایل را برگردان</h3>
      <div class="grid cols-2">
        <label>این فایل چیست؟
          <select id="i-kind">
            <option value="journal">سند روزنامه</option>
            <option value="accounts">کدینگ حساب‌ها</option>
            <option value="parties">اشخاص (مشتری و تأمین‌کننده)</option>
          </select></label>
        <label>فایل اکسل <input id="i-file" type="file" accept=".xlsx"></label>
      </div>
      <div class="modal-actions">
        <button id="i-check" class="btn primary">بررسی فایل</button>
        <button id="i-clear" class="btn">پاک کردن</button>
      </div>
    </div>
    <div id="i-result"></div>`;

  $("#d-tpl-journal").addEventListener("click", () => downloadXlsx("/export/template.xlsx?kind=journal", "فایل-نمونه-سند-روزنامه.xlsx"));
  $("#d-tpl-accounts").addEventListener("click", () => downloadXlsx("/export/template.xlsx?kind=accounts", "فایل-نمونه-کدینگ-حساب‌ها.xlsx"));
  $("#d-now-journal").addEventListener("click", () => downloadXlsx("/export/journal.xlsx", "سند-روزنامه.xlsx"));
  $("#d-now-accounts").addEventListener("click", () => downloadXlsx("/export/accounts.xlsx", "کدینگ-حساب‌ها.xlsx"));
  $("#i-clear").addEventListener("click", () => { pendingFile = null; $("#i-file").value = ""; $("#i-result").innerHTML = ""; });

  $("#i-check").addEventListener("click", async () => {
    const f = $("#i-file").files[0];
    if (!f) { toast("اول فایل اکسل را انتخاب کن.", "bad"); return; }
    pendingFile = f;
    const kind = $("#i-kind").value;
    const box = $("#i-result");
    box.innerHTML = `<div class="card center"><span class="spinner"></span> در حال خواندن فایل…</div>`;
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await apiUpload(`/import/preview?kind=${kind}`, fd);
      box.innerHTML = kind === "accounts" ? accountsPreview(r)
        : (kind === "parties" ? partiesPreview(r) : journalPreview(r));
      bindImportActions(r, kind);
    } catch (err) {
      box.innerHTML = `<div class="card"><div class="note bad">${esc(err.message)}</div></div>`;
    }
  });

  function warningsHtml(list, title) {
    if (!list.length) return "";
    return `<div class="note warn" style="margin-top:12px"><strong>${esc(title)}</strong>
      <ul style="margin:8px 0 0">${list.slice(0, 40).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
  }

  function problemsHtml(list, title) {
    if (!list.length) return "";
    return `<div class="note bad" style="margin-top:12px"><strong>${esc(title)}</strong>
      <ul style="margin:8px 0 0">${list.slice(0, 60).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      ${list.length > 60 ? `<p class="small">و ${faDigits(list.length - 60)} ایراد دیگر…</p>` : ""}</div>`;
  }

  function journalPreview(r) {
    const ok = r.groups.filter((g) => !g.problems);
    const bad = r.groups.filter((g) => g.problems);
    const dup = r.groups.filter((g) => g.duplicate);
    const warned = r.groups.flatMap((g) => g.warnings || []);
    return `
      <div class="card">
        <h3>نتیجه‌ی بررسی فایل</h3>
        <p>این فایل <strong>${faDigits(r.row_count)}</strong> سطر دارد که <strong>${faDigits(r.groups.length)}</strong> سند می‌سازند.
        <strong>${faDigits(ok.length)}</strong> سند سالم است${bad.length ? ` و <strong>${faDigits(bad.length)}</strong> سند ایراد دارد` : ""}${dup.length ? ` و <strong>${faDigits(dup.length)}</strong> سند شبیه سند ثبت‌شده‌ی موجود است` : ""}.</p>
        <div class="note">هر سند سالمی که تأیید کنی، به‌صورت <strong>پیش‌نویس</strong> ساخته می‌شود؛ هیچ سندی خودکار ثبت نهایی نمی‌شود.</div>
        <div class="table-wrap" style="max-height:40vh;margin-top:12px"><table>
          <thead><tr><th>ردیف سند</th><th>تاریخ</th><th>شرح</th><th>سطرها</th><th>بدهکار</th><th>بستانکار</th><th>وضعیت</th></tr></thead>
          <tbody>${r.groups.map((g) => `<tr>
            <td>${esc(g.key)}</td><td class="num">${esc(g.date_raw || "—")}</td>
            <td>${esc(g.description)}</td><td class="num">${faDigits(g.lines.length)}</td>
            <td class="num">${fmt(g.debit_total)}</td><td class="num">${fmt(g.credit_total)}</td>
            <td>${g.problems.length ? '<span class="badge reversed">ایراد دارد</span>'
                 : (g.duplicate ? '<span class="badge draft">تکراری</span>' : '<span class="badge posted">سالم</span>')}</td>
          </tr>`).join("")}</tbody>
        </table></div>
        ${warningsHtml(warned, "سندهای ناتراز (ساخته می‌شوند ولی تا اصلاح نشوند ثبت نهایی نمی‌شوند):")}
        ${problemsHtml(bad.flatMap((g) => g.problems), "چیزهایی که باید در فایل درست کنی:")}
        <div class="modal-actions">
          <button id="i-apply" class="btn primary"${ok.filter((g) => !g.duplicate).length ? "" : " disabled"}>
            تأیید و ساختن پیش‌نویس‌ها</button>
          <label class="small" style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="i-dup" style="width:auto"> سندهای تکراری را هم بساز</label>
        </div>
      </div>`;
  }

  function accountsPreview(r) {
    const ok = r.rows.filter((i) => !i.problems);
    return `
      <div class="card">
        <h3>نتیجه‌ی بررسی فایل</h3>
        <p>این فایل <strong>${faDigits(r.row_count)}</strong> حساب دارد؛ <strong>${faDigits(ok.length)}</strong> حساب تازه ساخته می‌شود.</p>
        <div class="table-wrap" style="max-height:40vh;margin-top:12px"><table>
          <thead><tr><th>سطر</th><th>کد</th><th>نام</th><th>وضعیت</th></tr></thead>
          <tbody>${r.rows.map((i) => `<tr><td class="num">${faDigits(i.row)}</td><td class="num">${esc(i.code)}</td>
            <td>${esc(i.name)}</td>
            <td>${i.exists ? '<span class="badge draft">از قبل هست</span>'
                 : (i.problems.length ? '<span class="badge reversed">ایراد دارد</span>' : '<span class="badge posted">ساخته می‌شود</span>')}</td></tr>`).join("")}</tbody>
        </table></div>
        ${problemsHtml(r.rows.flatMap((i) => i.problems).filter((p) => !p.includes("از قبل")), "چیزهایی که باید در فایل درست کنی:")}
        <div class="modal-actions">
          <button id="i-apply" class="btn primary"${ok.length ? "" : " disabled"}>تأیید و ساختن حساب‌ها</button>
        </div>
      </div>`;
  }

  function partiesPreview(r) {
    const ok = r.rows.filter((i) => !i.problems);
    const kindLabel = { customer: "مشتری", supplier: "تأمین‌کننده", both: "هر دو" };
    return `
      <div class="card">
        <h3>نتیجه‌ی بررسی فایل</h3>
        <p>این فایل <strong>${faDigits(r.row_count)}</strong> شخص دارد؛ <strong>${faDigits(ok.length)}</strong> نفر تازه ساخته می‌شود.</p>
        <div class="table-wrap" style="max-height:40vh;margin-top:12px"><table>
          <thead><tr><th>سطر</th><th>کد</th><th>نام</th><th>نوع</th><th>وضعیت</th></tr></thead>
          <tbody>${r.rows.map((i) => `<tr><td class="num">${faDigits(i.row)}</td><td class="num">${esc(i.code || "خودکار")}</td>
            <td>${esc(i.name)}</td><td>${esc(kindLabel[i.kind] || i.kind)}</td>
            <td>${i.exists ? '<span class="badge draft">از قبل هست</span>'
                 : (i.problems.length ? '<span class="badge reversed">ایراد دارد</span>' : '<span class="badge posted">ساخته می‌شود</span>')}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="modal-actions">
          <button id="i-apply" class="btn primary"${ok.length ? "" : " disabled"}>تأیید و ساختن اشخاص</button>
        </div>
      </div>`;
  }

  function bindImportActions(r, kind) {
    const btn = $("#i-apply");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const allowDup = $("#i-dup") && $("#i-dup").checked ? "true" : "false";
        const res = await apiUpload(`/import/apply?kind=${kind}&allow_duplicates=${allowDup}`, fd);
        toast(res.message, "ok");
        state.accounts = (await api("/accounts")).rows;
        const box = $("#i-result");
        box.innerHTML = `<div class="card"><div class="note">${esc(res.message)}</div>
          <p class="small muted">سندهای ساخته‌شده در صفحه‌ی «سند روزنامه» با وضعیت پیش‌نویس هستند؛
          بعد از بررسی، خودت ثبت نهایی‌شان کن.</p>
          <div class="modal-actions"><button id="i-goto" class="btn primary">دیدن سندها</button></div></div>`;
        $("#i-goto").addEventListener("click", () => go("entries", { status: "draft" }));
      } catch (err) { toast(err.message, "bad"); }
    });
  }
};

function recurringFromEntry(e) {
  const modal = openModal(`
    <h3>تکرار ماهانه‌ی این سند</h3>
    <p class="small muted">سند «${esc(e.description)}» (${faDigits(e.date)}) هر ماه با یک کلیک ساخته می‌شود.
      مبالغ و حساب‌هایش همان‌هایی است که در این سند می‌بینی.</p>
    <div class="grid cols-2">
      <label>عنوان <input id="rc-title" value="${esc(e.description)}"></label>
      <label>روز ماه <input id="rc-day" class="num" value="${faDigits(Number(numToLatin(faDigits(e.date).split("/")[2])))}"></label>
      <label>شرح سند ساخته‌شده <input id="rc-desc" value="${esc(e.description)}"></label>
    </div>
    <div class="modal-actions">
      <button id="rc-go" class="btn primary">بساز</button>
      <button id="rc-close" class="btn">بستن</button>
    </div>`);
  $("#rc-close", modal).addEventListener("click", closeModal);
  $("#rc-go", modal).addEventListener("click", async () => {
    try {
      const body = { title: $("#rc-title", modal).value,
        day_of_month: Number(numToLatin($("#rc-day", modal).value)) || 1,
        description: $("#rc-desc", modal).value,
        lines: e.lines.map((l) => ({ account_id: l.account_id, debit: l.debit, credit: l.credit,
                                     description: l.description })) };
      await api("/recurring", { method: "POST", body });
      toast("سند تکراری ساخته شد؛ در صفحه‌ی «سندهای تکراری» می‌بینی‌اش.", "ok");
      closeModal(); go("recurring");
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* ================================================================== بخش فروش */
const cache = { parties: [], trips: [], meta: null };

async function loadParties(force) {
  if (!cache.parties.length || force) cache.parties = (await api("/parties")).rows;
  return cache.parties;
}
async function loadTrips(force) {
  if (!cache.trips.length || force) cache.trips = (await api("/trips")).rows;
  return cache.trips;
}
async function loadMeta() {
  if (!cache.meta) cache.meta = await api("/meta/sales");
  return cache.meta;
}
function partyOptions(list, selected, filter) {
  const rows = list.filter((p) => !filter || p.kind === filter || p.kind === "both");
  return `<option value="">— انتخاب کنید —</option>` + rows.map((p) =>
    `<option value="${p.id}"${String(p.id) === String(selected) ? " selected" : ""}>${esc(p.name)}</option>`).join("");
}
function tripOptions(list, selected) {
  return `<option value="">— بدون سفر —</option>` + list.map((t) =>
    `<option value="${t.id}"${String(t.id) === String(selected) ? " selected" : ""}>${esc(t.title)}</option>`).join("");
}
function serviceOptions(list, selected) {
  return list.map((s) => `<option value="${s.key}"${s.key === selected ? " selected" : ""}>${esc(s.label)}</option>`).join("");
}
function vatPercentOn(rates, isoDate) {
  const live = rates.filter((r) => r.from <= isoDate || true);
  const sorted = live.slice().sort((a, b) => (a.from < b.from ? 1 : -1));
  return sorted.length ? sorted[0].rate_percent : 0;
}

/* -------- صف تأیید -------- */
views.approvals = async (view) => {
  const d = await api("/approvals");
  view.innerHTML = `
    <div class="grid cols-3">
      <div class="card kpi"><span class="label">پیش‌نویس‌های منتظر تأیید</span>
        <span class="value">${faDigits(d.count)}</span></div>
      <div class="card kpi"><span class="label">فاکتورهای پیش‌نویس</span>
        <span class="value">${faDigits(d.draft_invoices)}</span></div>
      <div class="card kpi"><span class="label">صورتحساب و دریافت/پرداخت پیش‌نویس</span>
        <span class="value">${faDigits(d.draft_bills + d.draft_settlements)}</span></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>سندهایی که منتظر تأیید تو هستند</h3>
      <p class="small muted">کارکنان ثبت می‌کنند، ولی تا تو تأیید نکنی هیچ سندی وارد دفتر نمی‌شود.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>تاریخ</th><th>شرح</th><th>ثبت‌کننده</th><th>مبلغ</th><th>تراز</th><th></th></tr></thead>
        <tbody>${d.entries.length ? d.entries.map((e) => `<tr>
          <td class="num">${faDigits(e.date)}</td><td>${esc(e.description)}</td>
          <td>${esc(e.by)} <span class="badge role">${esc(e.role)}</span></td>
          <td class="num">${fmt(e.amount)}</td>
          <td>${e.balanced ? '<span class="badge posted">تراز</span>' : '<span class="badge reversed">ناتراز</span>'}</td>
          <td><div class="row-actions">
            <button class="btn small" data-view="${e.id}">مشاهده</button>
            <button class="btn small primary" data-ok="${e.id}"${e.balanced ? "" : " disabled"}>تأیید و ثبت نهایی</button>
          </div></td></tr>`).join("") : `<tr><td colspan="6" class="empty">چیزی در صف نیست.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", async () => {
    entryDetail(await api("/entries/" + b.dataset.view));
  }));
  view.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const e = await api(`/entries/${b.dataset.ok}/post`, { method: "POST" });
      toast(`سند ${e.entry_no} تأیید و ثبت نهایی شد.`, "ok");
      go("approvals");
    } catch (err) { toast(err.message, "bad"); }
  }));
};

/* -------- اشخاص -------- */
views.parties = async (view) => {
  const d = await api("/parties");
  cache.parties = d.rows;
  const label = { customer: "مشتری", supplier: "تأمین‌کننده", both: "مشتری و تأمین‌کننده" };
  view.innerHTML = `
    <div class="card">
      <h3>مشتری‌ها و تأمین‌کنندگان</h3>
      <p class="small muted">هر شخص حساب تفصیلی خودش را دارد؛ پس ریز حساب هر کس همیشه جدا و دقیق است.</p>
      <div class="modal-actions"><button id="p-export" class="btn">خروجی اکسل</button></div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>کد</th><th>نام</th><th>نوع</th><th>تلفن</th><th>اطلاعات مالیاتی</th>
          <th>مانده</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((p) => `<tr>
          <td class="num">${esc(p.code)}</td><td>${esc(p.name)}</td>
          <td><span class="pill">${esc(label[p.kind] || p.kind)}</span></td>
          <td class="num">${esc(p.phone || "—")}</td>
          <td>${p.tax_ready ? `<span class="badge posted">تکمیل</span> <span class="small num">${esc(p.national_id)}</span>`
            : '<span class="badge draft">ناقص</span>'}</td>
          <td class="num">${fmt(Math.abs(p.balance))} <span class="small muted">${esc(p.balance_label)}</span></td>
          <td>${p.is_active ? '<span class="badge open">فعال</span>' : '<span class="badge closed">غیرفعال</span>'}</td>
          <td><div class="row-actions">
            ${can("journal.create") ? `<button class="btn small" data-tax="${p.id}">اطلاعات مالیاتی</button>` : ""}
            ${can("journal.create") ? `<button class="btn small" data-toggle="${p.id}" data-active="${p.is_active}">${p.is_active ? "غیرفعال کن" : "فعال کن"}</button>` : ""}
          </div></td>
        </tr>`).join("") : `<tr><td colspan="8" class="empty">هنوز کسی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>
    ${can("journal.create") ? `
    <div class="card">
      <h3>شخص جدید</h3>
      <div class="grid cols-4">
        <label>نام <input id="np-name" placeholder="نام مشتری یا شرکت"></label>
        <label>نوع <select id="np-kind"><option value="customer">مشتری</option>
          <option value="supplier">تأمین‌کننده</option><option value="both">هر دو</option></select></label>
        <label>تلفن (اختیاری) <input id="np-phone" class="num"></label>
        <label>یادداشت (اختیاری) <input id="np-note"></label>
        <label>شخص حقیقی است یا حقوقی؟
          <select id="np-ptype"><option value="1">شخص حقیقی (کد ملی ۱۰ رقم)</option>
            <option value="2">شخص حقوقی/شرکت (شناسه ملی ۱۱ رقم)</option></select></label>
        <label>کد ملی / شناسه‌ی ملی <input id="np-nid" class="num" placeholder="برای سامانه‌ی مودیان"></label>
        <label>شماره اقتصادی (اختیاری) <input id="np-eco" class="num"></label>
        <label>کد پستی (اختیاری) <input id="np-post" class="num"></label>
      </div>
      <p class="small muted">این چهار قلم را برای صورتحساب الکترونیکی سامانه‌ی مودیان لازم دارید؛
        اگر الآن نداشته باشید هم ثبت می‌شود، ولی بعداً کاملش کنید.</p>
      <div class="modal-actions"><button id="np-go" class="btn primary">ثبت</button></div>
    </div>` : ""}`;
  $("#p-export").addEventListener("click", () => downloadXlsx("/export/parties.xlsx", "اشخاص.xlsx"));
  const go_ = $("#np-go");
  if (go_) go_.addEventListener("click", async () => {
    try {
      await api("/parties", { method: "POST", body: {
        name: $("#np-name").value, kind: $("#np-kind").value,
        phone: numToLatin($("#np-phone").value), note: $("#np-note").value,
        person_type: Number($("#np-ptype").value),
        national_id: numToLatin($("#np-nid").value), economic_code: numToLatin($("#np-eco").value),
        postal_code: numToLatin($("#np-post").value) } });
      toast("ثبت شد.", "ok"); await loadParties(true); go("parties");
    } catch (err) { toast(err.message, "bad"); }
  });
  view.querySelectorAll("[data-tax]").forEach((b) => b.addEventListener("click", () => {
    const p = d.rows.find((x) => String(x.id) === b.dataset.tax);
    if (p) partyTaxEditor(p);
  }));
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api("/parties/" + b.dataset.toggle, { method: "PATCH", body: { is_active: b.dataset.active !== "true" } });
      toast("وضعیت عوض شد.", "ok"); await loadParties(true); go("parties");
    } catch (err) { toast(err.message, "bad"); }
  }));
};

/* -------- فاکتور فروش -------- */
views.invoices = async (view, params) => {
  const status = params.status || "all";
  const meta = await loadMeta();
  const parties = await loadParties();
  const trips = await loadTrips();
  const d = await api(`/invoices?status=${status}` + (params.party_id ? `&party_id=${params.party_id}` : ""));
  const st = { draft: ["پیش‌نویس", "draft"], issued: ["صادرشده", "posted"], cancelled: ["ابطال‌شده", "reversed"] };
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>وضعیت <select id="v-status">
          <option value="all"${status === "all" ? " selected" : ""}>همه</option>
          <option value="draft"${status === "draft" ? " selected" : ""}>پیش‌نویس</option>
          <option value="issued"${status === "issued" ? " selected" : ""}>صادرشده</option>
          <option value="cancelled"${status === "cancelled" ? " selected" : ""}>ابطال‌شده</option>
        </select></label>
        <button id="v-go" class="btn">نمایش</button>
        ${can("journal.create") ? `<button id="v-new" class="btn primary">فاکتور جدید</button>` : ""}
        <button id="v-export" class="btn">خروجی اکسل</button>
      </div>
      <p class="small muted">مالیات با نرخ همان تاریخ فاکتور حساب می‌شود (الان ${faDigits(vatPercentOn(meta.vat, todayJalali()))}٪).
      ${can("journal.post") ? "" : "فاکتوری که می‌سازی <strong>پیش‌نویس</strong> است و بعد از تأیید حسابدار صادر می‌شود."}</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>شماره</th><th>تاریخ</th><th>سررسید</th><th>مشتری</th><th>سفر</th><th>خدمات</th>
          <th>جمع</th><th>دریافت‌شده</th><th>مانده</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((i) => `<tr>
          <td class="num">${i.number ? esc(i.number) : "—"}</td>
          <td class="num">${faDigits(i.date)}</td>
          <td class="num">${i.due === "—" ? "—" : faDigits(i.due)}</td>
          <td>${esc(i.party)}</td><td class="small">${esc(i.trip)}</td>
          <td class="small">${esc(i.lines.map((l) => l.service_label).filter((v2, ix, a) => a.indexOf(v2) === ix).join("، "))}</td>
          <td class="num">${fmt(i.total)}</td><td class="num">${fmt(i.paid)}</td>
          <td class="num">${i.open > 0 ? fmt(i.open) : "—"}</td>
          <td><span class="badge ${st[i.status][1]}">${st[i.status][0]}</span></td>
          <td><div class="row-actions">
            <button class="btn small" data-view="${i.id}">جزئیات</button>
            ${can("passengers.manage") && i.lines.some((l) => l.service_type === "ticket")
              ? `<button class="btn small" data-pax="${i.id}">مسافران بلیت</button>` : ""}
            ${i.status === "draft" && can("journal.post") ? `<button class="btn small primary" data-issue="${i.id}">صدور</button>` : ""}
            ${i.status === "issued" && can("cash.transfer") ? `<button class="btn small" data-settle="${i.id}">دریافت پول</button>` : ""}
            ${i.status !== "cancelled" && can("journal.reverse") ? `<button class="btn small danger" data-cancel="${i.id}">ابطال</button>` : ""}
          </div></td></tr>`).join("") : `<tr><td colspan="11" class="empty">فاکتوری در این فهرست نیست.</td></tr>`}</tbody>
      </table></div>
    </div>`;

  $("#v-go").addEventListener("click", () => go("invoices", { status: $("#v-status").value }));
  $("#v-export").addEventListener("click", () => downloadXlsx(`/export/invoices.xlsx?status=${status}`, "فاکتورها.xlsx"));
  const nb = $("#v-new");
  if (nb) nb.addEventListener("click", () => invoiceEditor(meta, parties, trips));
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    const inv = d.rows.find((r) => String(r.id) === b.dataset.view);
    invoiceDetail(inv);
  }));
  view.querySelectorAll("[data-issue]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("فاکتور صادر شود؟ (سندش ساخته و ثبت نهایی می‌شود)")) return;
    try {
      const inv = await api(`/invoices/${b.dataset.issue}/issue`, { method: "POST" });
      toast(`فاکتور ${inv.number} صادر شد.`, "ok");
      await loadParties(true); go("invoices", { status });
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    const reason = prompt("دلیل ابطال فاکتور:");
    if (reason === null) return;
    try {
      await api(`/invoices/${b.dataset.cancel}/cancel`, { method: "POST", body: { reason } });
      toast("فاکتور ابطال شد؛ سند معکوسش ثبت شد.", "ok");
      await loadParties(true); go("invoices", { status });
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-pax]").forEach((b) => b.addEventListener("click", () => {
    const inv = d.rows.find((r) => String(r.id) === b.dataset.pax);
    invoicePassengersEditor(inv, trips);
  }));
  view.querySelectorAll("[data-settle]").forEach((b) => b.addEventListener("click", () => {
    const inv = d.rows.find((r) => String(r.id) === b.dataset.settle);
    settlementEditor("in", parties, trips, { party_id: inv.party_id, amount: inv.open, trip_id: inv.trip_id,
      description: `دریافت بابت فاکتور ${inv.number || ""}` }, () => go("invoices", { status }));
  }));
};

function invoiceEditor(meta, parties, trips) {
  const lines = [{ service_type: "tour", description: "", qty: "1", unit_price: "", discount: "",
                   taxable: true, flight_type: 1 }];
  const idemKey = "inv-" + Math.random().toString(36).slice(2) + Date.now();
  const modal = openModal(`
    <h3>فاکتور فروش جدید</h3>
    <div class="grid cols-3">
      <label>مشتری <select id="iv-party">${partyOptions(parties, "", "customer")}</select></label>
      <label>سفر (اختیاری) <select id="iv-trip">${tripOptions(trips, "")}</select></label>
      <label>تاریخ فاکتور <input id="iv-date" value="${todayJalali()}"></label>
      <label>سررسید (اختیاری) <input id="iv-due" value="${todayJalali()}"></label>
      <label>شرح فاکتور <input id="iv-desc" placeholder="مثلاً تور آنتالیا — آقای رضایی"></label>
    </div>
    <div class="lines" style="margin-top:14px">
      <div class="line line-head"><span>نوع خدمت</span><span>مبلغ</span><span>تخفیف</span><span>شرح</span><span></span></div>
      <div id="iv-lines"></div>
    </div>
    <div class="grid cols-3" style="margin-top:10px">
      <label>تعداد <input id="iv-qty-last" class="num" value="1"></label>
      <label>با مالیات <select id="iv-taxable"><option value="1">بله</option><option value="0">معاف / بدون مالیات</option></select></label>
    </div>
    <button id="iv-add" class="btn small" style="margin-top:10px">افزودن سطر</button>
    <div class="totals">
      <span>جمع سطرها: <strong class="num" id="iv-t-sub">0</strong></span>
      <span>تخفیف: <strong class="num" id="iv-t-disc">0</strong></span>
      <span>مالیات: <strong class="num" id="iv-t-vat">0</strong></span>
      <span>جمع کل: <strong class="num" id="iv-t-total">0</strong></span>
    </div>
    <div class="modal-actions">
      <button id="iv-draft" class="btn">${can("journal.post") ? "ذخیره پیش‌نویس" : "ثبت برای تأیید حسابدار"}</button>
      ${can("journal.post") ? `<button id="iv-issue" class="btn primary">ذخیره و صدور</button>` : ""}
      <button id="iv-close" class="btn">بستن</button>
    </div>
    ${can("journal.post") ? "" : `<p class="note" style="margin-top:12px">این فاکتور به‌صورت پیش‌نویس ثبت می‌شود و بعد از تأیید حسابدار صادر و وارد دفتر می‌شود. تا آن موقع هیچ سندی در دفتر ساخته نمی‌شود.</p>`}`);

  const box = $("#iv-lines", modal);
  function draw() {
    box.innerHTML = lines.map((l, i) => `
      <div class="line">
        <select data-i="${i}" data-f="service_type">${serviceOptions(meta.service_types, l.service_type)}</select>
        <input data-i="${i}" data-f="unit_price" class="num" value="${esc(l.unit_price ? fmt(l.unit_price) : "")}" placeholder="مبلغ">
        <input data-i="${i}" data-f="discount" class="num" value="${esc(l.discount ? fmt(l.discount) : "")}" placeholder="0">
        <input data-i="${i}" data-f="description" value="${esc(l.description)}" placeholder="شرح سطر">
        <button class="btn small" data-del="${i}">✕</button>
      </div>
      ${l.service_type === "ticket" ? `<div class="sub-line">
        <span>این بلیت مربوط به پرواز است:</span>
        <select data-i="${i}" data-f="flight_type">
          <option value="1"${Number(l.flight_type || 1) === 1 ? " selected" : ""}>پرواز داخلی</option>
          <option value="2"${Number(l.flight_type) === 2 ? " selected" : ""}>پرواز خارجی</option>
        </select>
        <label class="chk"><input type="checkbox" data-i="${i}" data-f="taxable"
          ${l.taxable ? "checked" : ""}> مشمول مالیات است</label>
        <span>بلیت حمل‌ونقل مسافر طبق قانون از مالیات معاف است؛ اگر می‌خواهی مالیات بگیرد، تیک بزن.</span>
      </div>` : ""}`).join("");
    box.querySelectorAll("[data-i]").forEach((el) => {
      const ev = () => {
        const row = lines[Number(el.dataset.i)];
        row[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
        totals();
      };
      el.addEventListener("input", ev); el.addEventListener("change", ev);
    });
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (lines.length <= 1) { toast("فاکتور حداقل یک سطر دارد.", "bad"); return; }
      lines.splice(Number(b.dataset.del), 1); draw();
    }));
  }
  function totals() {
    const rate = vatPercentOn(meta.vat, $("#iv-date", modal).value || todayJalali());
    let sub = 0, disc = 0, vat = 0;
    lines.forEach((l) => {
      const gross = parseMoney(l.unit_price) * Math.max(1, Number(numToLatin($("#iv-qty-last", modal).value) || 1));
      const d2 = parseMoney(l.discount);
      sub += gross; disc += d2;
      if (l.taxable) vat += Math.floor((gross - d2) * rate * 100 / 10000);
    });
    const total = sub - disc + vat;
    $("#iv-t-sub", modal).textContent = fmt(sub);
    $("#iv-t-disc", modal).textContent = fmt(disc);
    $("#iv-t-vat", modal).textContent = fmt(vat);
    $("#iv-t-total", modal).textContent = fmt(total);
  }
  $("#iv-date", modal).addEventListener("change", totals);
  $("#iv-add", modal).addEventListener("click", () => {
    lines.push({ service_type: "tour", description: "", qty: $("#iv-qty-last", modal).value,
                 unit_price: "", discount: "", taxable: $("#iv-taxable", modal).value === "1",
                 flight_type: 1 });
    draw();
  });
  draw(); totals();

  async function save(issue) {
    try {
      const body = {
        party_id: Number($("#iv-party", modal).value),
        date: $("#iv-date", modal).value,
        due_date: $("#iv-due", modal).value || $("#iv-date", modal).value,
        trip_id: $("#iv-trip", modal).value ? Number($("#iv-trip", modal).value) : null,
        description: $("#iv-desc", modal).value,
        issue,
        lines: lines.map((l) => ({
          service_type: l.service_type, description: l.description,
          qty: Math.max(1, Number(numToLatin($("#iv-qty-last", modal).value) || 1)),
          unit_price: parseMoney(l.unit_price), discount: parseMoney(l.discount),
          taxable: !!l.taxable,
          flight_type: l.service_type === "ticket" ? Number(l.flight_type || 1) : null })),
      };
      if (!body.party_id) throw new Error("مشتری را انتخاب کنید.");
      const res = await api("/invoices", { method: "POST", body, headers: { "Idempotency-Key": idemKey } });
      toast(issue ? `فاکتور ${res.number} صادر شد.`
                  : (can("journal.post") ? "پیش‌نویس فاکتور ذخیره شد."
                                         : "فاکتور برای تأیید حسابدار ثبت شد."), "ok");
      closeModal();
      await loadParties(true); await loadTrips(true);
      go("invoices");
    } catch (err) { toast(err.message, "bad"); }
  }
  $("#iv-draft", modal).addEventListener("click", () => save(false));
  const ivIssue = $("#iv-issue", modal);
  if (ivIssue) ivIssue.addEventListener("click", () => save(true));
  $("#iv-close", modal).addEventListener("click", closeModal);
}

function invoiceDetail(inv) {
  const modal = openModal(`
    <h3>فاکتور ${inv.number ? esc(inv.number) : "پیش‌نویس"}</h3>
    <p class="small muted">${faDigits(inv.date)} • سررسید ${faDigits(inv.due)} • مشتری: ${esc(inv.party)} • سفر: ${esc(inv.trip)}</p>
    <p>${esc(inv.description)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>خدمت</th><th>شرح</th><th>تعداد</th><th>مبلغ</th><th>تخفیف</th><th>مالیات</th><th>خالص</th></tr></thead>
      <tbody>${inv.lines.map((l) => `<tr><td>${esc(l.service_label)}</td><td>${esc(l.description)}</td>
        <td class="num">${faDigits(l.qty)}</td><td class="num">${fmt(l.unit_price)}</td>
        <td class="num">${l.discount ? fmt(l.discount) : "—"}</td>
        <td class="num">${l.taxable ? fmt(l.vat) + " (" + faDigits(l.rate_percent) + "٪)" : "معاف"}</td>
        <td class="num">${fmt(l.net)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5">جمع کل</td><td class="num">${fmt(inv.vat)}</td>
        <td class="num">${fmt(inv.total)}</td></tr></tfoot>
    </table></div>
    <p style="margin-top:10px">دریافت‌شده: <strong class="num">${fmt(inv.paid)}</strong> —
      مانده: <strong class="num">${fmt(inv.open)}</strong></p>
    <div class="modal-actions"><button id="iv-x" class="btn">بستن</button></div>`);
  $("#iv-x", modal).addEventListener("click", closeModal);
}

/* -------- فاکتور خرید و صورتحساب تأمین‌کننده -------- */
views.purchases = async (view, params) => {
  const parties = await loadParties();
  const trips = await loadTrips();
  const accounts = (await api("/accounts")).rows.filter((a) => a.kind === "ledger" && a.report_group === "expense");
  const d = await api("/bills");
  const st = { draft: ["پیش‌نویس", "draft"], issued: ["صادرشده", "posted"], cancelled: ["ابطال‌شده", "reversed"] };
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        ${can("journal.create") ? `<button id="b-new" class="btn primary">ثبت فاکتور خرید</button>` : ""}
        <button id="b-export" class="btn">خروجی اکسل</button>
      </div>
      <p class="small muted">فاکتور خرید از هتل، ایرلاین و دیگر تأمین‌کنندگان را اینجا ثبت کنید؛ مالیات خرید و مانده‌ی پرداخت هم پیگیری می‌شود. فاکتورهای متصل به سفر در سود همان سفر محاسبه می‌شوند.</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>شماره</th><th>تاریخ</th><th>سررسید</th><th>طرف حساب</th><th>سفر</th><th>شرح</th>
          <th>جمع</th><th>پرداخت‌شده</th><th>مانده</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((b) => `<tr>
          <td class="num">${b.number ? esc(b.number) : "—"}</td>
          <td class="num">${faDigits(b.date)}</td><td class="num">${b.due === "—" ? "—" : faDigits(b.due)}</td>
          <td>${esc(b.party)}</td><td class="small">${esc(b.trip)}</td><td class="small">${esc(b.description)}</td>
          <td class="num">${fmt(b.total)}</td><td class="num">${fmt(b.paid)}</td>
          <td class="num">${b.open > 0 ? fmt(b.open) : "—"}</td>
          <td><span class="badge ${st[b.status][1]}">${st[b.status][0]}</span></td>
          <td><div class="row-actions">
            ${b.status === "draft" && can("journal.post") ? `<button class="btn small primary" data-issue="${b.id}">صدور</button>` : ""}
            ${b.status === "issued" && b.open > 0 && can("cash.transfer") ? `<button class="btn small" data-pay="${b.id}">پرداخت</button>` : ""}
            ${b.status !== "cancelled" && can("journal.reverse") ? `<button class="btn small danger" data-cancel="${b.id}">ابطال</button>` : ""}
          </div></td></tr>`).join("") : `<tr><td colspan="11" class="empty">فاکتور خریدی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;

  $("#b-export").addEventListener("click", () => downloadXlsx("/export/bills.xlsx", "فاکتورهای-خرید.xlsx"));
  const nb = $("#b-new");
  if (nb) nb.addEventListener("click", () => billEditor(parties, trips, accounts));
  view.querySelectorAll("[data-issue]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await api(`/bills/${b.dataset.issue}/issue`, { method: "POST" });
      toast(`صورتحساب ${r.number} صادر شد.`, "ok"); await loadParties(true); go("purchases");
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    const reason = prompt("دلیل ابطال:");
    if (reason === null) return;
    try { await api(`/bills/${b.dataset.cancel}/cancel`, { method: "POST", body: { reason } });
      toast("ابطال شد.", "ok"); await loadParties(true); go("purchases");
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => {
    const bill = d.rows.find((r) => String(r.id) === b.dataset.pay);
    settlementEditor("out", parties, trips, { party_id: bill.party_id, amount: bill.open,
      trip_id: bill.trip_id, description: `پرداخت بابت ${bill.number || ""}` }, () => go("purchases"));
  }));
};

function billEditor(parties, trips, accounts) {
  const modal = openModal(`
    <h3>ثبت فاکتور خرید</h3>
    <div class="grid cols-3">
      <label>تأمین‌کننده <select id="bl-party">${partyOptions(parties, "", "supplier")}</select></label>
      <label>سفر (اختیاری) <select id="bl-trip">${tripOptions(trips, "")}</select></label>
      <label>نوع هزینه <select id="bl-acc">${accounts.map((a) =>
        `<option value="${a.id}"${a.code === "5101" ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
      <label>تاریخ <input id="bl-date" value="${todayJalali()}"></label>
      <label>سررسید <input id="bl-due" value="${todayJalali()}"></label>
      <label>مبلغ بدون مالیات <input id="bl-net" class="num" placeholder="مثلاً ۱۸۰ میلیون"></label>
      <label>مالیات (خالی = خودکار) <input id="bl-vat" class="num" placeholder="خودکار"></label>
      <label>شرح <input id="bl-desc" placeholder="مثلاً اقامت ۱۴ مسافر — هتل آکوا"></label>
    </div>
    <div class="modal-actions">
      <button id="bl-draft" class="btn">${can("journal.post") ? "ذخیره پیش‌نویس" : "ثبت برای تأیید حسابدار"}</button>
      ${can("journal.post") ? `<button id="bl-issue" class="btn primary">ذخیره و صدور</button>` : ""}
      <button id="bl-close" class="btn">بستن</button>
    </div>`);
  async function save(issue) {
    try {
      const body = {
        party_id: Number($("#bl-party", modal).value), date: $("#bl-date", modal).value,
        due_date: $("#bl-due", modal).value, trip_id: $("#bl-trip", modal).value ? Number($("#bl-trip", modal).value) : null,
        net: parseMoney($("#bl-net", modal).value),
        vat: $("#bl-vat", modal).value.trim() === "" ? null : parseMoney($("#bl-vat", modal).value),
        expense_account_id: Number($("#bl-acc", modal).value),
        description: $("#bl-desc", modal).value, issue,
      };
      if (!body.party_id) throw new Error("تأمین‌کننده را انتخاب کنید.");
      if (!body.net) throw new Error("مبلغ را بنویسید.");
      const r = await api("/bills", { method: "POST", body });
      toast(issue ? `صورتحساب ${r.number} ثبت شد.` : "پیش‌نویس ذخیره شد.", "ok");
      closeModal(); await loadParties(true); go("purchases");
    } catch (err) { toast(err.message, "bad"); }
  }
  $("#bl-draft", modal).addEventListener("click", () => save(false));
  const blIssue = $("#bl-issue", modal);
  if (blIssue) blIssue.addEventListener("click", () => save(true));
  $("#bl-close", modal).addEventListener("click", closeModal);
}

/* -------- دریافت و پرداخت -------- */
views.settlements = async (view, params) => {
  const parties = await loadParties();
  const trips = await loadTrips();
  const treasury = (await api("/reports/treasury")).rows;
  const direction = params.direction || "all";
  const d = await api(`/settlements?direction=${direction}`);
  const st = { draft: ["پیش‌نویس", "draft"], issued: ["ثبت‌شده", "posted"], cancelled: ["ابطال‌شده", "reversed"] };
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>نوع <select id="s-dir">
          <option value="all"${direction === "all" ? " selected" : ""}>همه</option>
          <option value="in"${direction === "in" ? " selected" : ""}>دریافت‌ها</option>
          <option value="out"${direction === "out" ? " selected" : ""}>پرداخت‌ها</option>
        </select></label>
        <button id="s-go" class="btn">نمایش</button>
        ${can("journal.create") ? `
          <button id="s-in" class="btn primary">دریافت از مشتری</button>
          <button id="s-out" class="btn">پرداخت به تأمین‌کننده</button>` : ""}
        <button id="s-export" class="btn">خروجی اکسل</button>
      </div>
      <p class="small muted">هر دریافت/پرداخت خودش سند می‌سازد و به قدیمی‌ترین فاکتور بازِ همان شخص می‌چسبد.</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>شماره</th><th>تاریخ</th><th>نوع</th><th>طرف حساب</th><th>حساب</th>
          <th>مبلغ</th><th>بابت</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((s) => `<tr>
          <td class="num">${s.number ? esc(s.number) : "—"}</td><td class="num">${faDigits(s.date)}</td>
          <td>${s.direction === "in" ? '<span class="badge posted">دریافت</span>' : '<span class="badge draft">پرداخت</span>'}</td>
          <td>${esc(s.party)}</td><td class="small">${esc(s.account)}</td>
          <td class="num">${fmt(s.amount)}</td>
          <td class="small">${esc(s.description)}</td>
          <td><span class="badge ${st[s.status][1]}">${st[s.status][0]}</span></td>
          <td>${s.status !== "cancelled" && can("journal.reverse")
            ? `<button class="btn small danger" data-cancel="${s.id}">ابطال</button>` : ""}</td>
        </tr>`).join("") : `<tr><td colspan="9" class="empty">چیزی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  $("#s-go").addEventListener("click", () => go("settlements", { direction: $("#s-dir").value }));
  $("#s-export").addEventListener("click", () => downloadXlsx(`/export/settlements.xlsx?direction=${direction}`, "دریافت-و-پرداخت.xlsx"));
  const si = $("#s-in"), so = $("#s-out");
  if (si) si.addEventListener("click", () => settlementEditor("in", parties, trips, {}, () => go("settlements")));
  if (so) so.addEventListener("click", () => settlementEditor("out", parties, trips, {}, () => go("settlements")));
  view.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    const reason = prompt("دلیل ابطال:");
    if (reason === null) return;
    try { await api(`/settlements/${b.dataset.cancel}/cancel`, { method: "POST", body: { reason } });
      toast("ابطال شد و پول به فاکتورها برگشت.", "ok"); await loadParties(true); go("settlements", { direction });
    } catch (err) { toast(err.message, "bad"); }
  }));
};

async function settlementEditor(direction, parties, trips, preset, onDone) {
  const treasury = (await api("/reports/treasury")).rows;
  const isIn = direction === "in";
  const modal = openModal(`
    <h3>${isIn ? "دریافت از مشتری" : "پرداخت به تأمین‌کننده"}</h3>
    <div class="grid cols-2">
      <label>${isIn ? "مشتری" : "تأمین‌کننده"} <select id="st-party">${partyOptions(parties, preset.party_id || "", isIn ? "customer" : "supplier")}</select></label>
      <label>${isIn ? "به حساب" : "از حساب"} <select id="st-acc">${treasury.map((t) =>
        `<option value="${t.id}">${esc(t.name)} (مانده ${fmt(t.balance)})</option>`).join("")}</select></label>
      <label>مبلغ <input id="st-amount" class="num" value="${preset.amount ? fmt(preset.amount) : ""}" placeholder="مثلاً ۱۰۰ میلیون"></label>
      <label>تاریخ <input id="st-date" value="${todayJalali()}"></label>
      <label>سفر (اختیاری) <select id="st-trip">${tripOptions(trips, preset.trip_id || "")}</select></label>
      <label>شرح <input id="st-desc" value="${esc(preset.description || "")}"></label>
    </div>
    <div class="modal-actions">
      <button id="st-go" class="btn primary">${isIn ? "ثبت دریافت" : "ثبت پرداخت"}</button>
      <button id="st-draft" class="btn">فقط پیش‌نویس</button>
      <button id="st-close" class="btn">بستن</button>
    </div>`);
  async function save(issue) {
    try {
      const body = { direction, party_id: Number($("#st-party", modal).value),
        account_id: Number($("#st-acc", modal).value), amount: parseMoney($("#st-amount", modal).value),
        date: $("#st-date", modal).value,
        trip_id: $("#st-trip", modal).value ? Number($("#st-trip", modal).value) : null,
        description: $("#st-desc", modal).value, issue };
      if (!body.party_id) throw new Error("طرف حساب را انتخاب کنید.");
      if (!body.amount) throw new Error("مبلغ را بنویسید.");
      const s = await api("/settlements", { method: "POST", body });
      toast(issue ? `${isIn ? "دریافت" : "پرداخت"} ${s.number} ثبت شد.` : "پیش‌نویس ذخیره شد.", "ok");
      closeModal(); await loadParties(true);
      if (onDone) onDone();
    } catch (err) { toast(err.message, "bad"); }
  }
  $("#st-go", modal).addEventListener("click", () => save(true));
  $("#st-draft", modal).addEventListener("click", () => save(false));
  $("#st-close", modal).addEventListener("click", closeModal);
}

/* -------- پرونده‌های سفر -------- */
views.trips = async (view) => {
  const d = await api("/trips");
  const parties = await loadParties();
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        ${can("journal.create") ? `<button id="t-new" class="btn primary">سفر جدید</button>` : ""}
        <button id="t-export" class="btn">خروجی اکسل</button>
      </div>
      <p class="small muted">هر سفر یک پرونده است: فروش، هزینه و سود همان سفر — لحظه‌ای و از روی خود دفتر.</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>عنوان</th><th>مقصد</th><th>شروع</th><th>فروش</th><th>هزینه</th>
          <th>سود</th><th>درصد</th><th>مانده دریافتنی</th><th>مانده پرداختنی</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((t) => `<tr>
          <td class="num">${esc(t.code)}</td><td>${esc(t.title)}</td><td>${esc(t.destination)}</td>
          <td class="num">${faDigits(t.start)}</td>
          <td class="num">${fmt(t.revenue)}</td><td class="num">${fmt(t.cost)}</td>
          <td class="num"${t.lost ? ' style="color:var(--danger)"' : ""}>${fmt(t.profit)}</td>
          <td class="num">${faDigits(t.margin_percent)}٪</td>
          <td class="num">${t.receivable_open ? fmt(t.receivable_open) : "—"}</td>
          <td class="num">${t.payable_open ? fmt(t.payable_open) : "—"}</td>
          <td><button class="btn small" data-view="${t.id}">جزئیات</button></td>
        </tr>`).join("") : `<tr><td colspan="11" class="empty">هنوز سفری ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  $("#t-export").addEventListener("click", () => downloadXlsx("/export/trips.xlsx", "پرونده-سفرها.xlsx"));
  const nb = $("#t-new");
  if (nb) nb.addEventListener("click", () => tripEditor());
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", async () => {
    tripDetail(await api("/trips/" + b.dataset.view));
  }));
};

function tripEditor() {
  const modal = openModal(`
    <h3>سفر جدید</h3>
    <div class="grid cols-2">
      <label>عنوان <input id="tp-title" placeholder="مثلاً تور آنتالیا — مهر"></label>
      <label>مقصد <input id="tp-dest" placeholder="آنتالیا"></label>
      <label>تاریخ شروع <input id="tp-start" value="${todayJalali()}"></label>
      <label>تاریخ پایان (اختیاری) <input id="tp-end"></label>
      <label>یادداشت <input id="tp-note" placeholder="مثلاً ۱۴ مسافر"></label>
    </div>
    <div class="modal-actions">
      <button id="tp-go" class="btn primary">ثبت سفر</button>
      <button id="tp-close" class="btn">بستن</button>
    </div>`);
  $("#tp-close", modal).addEventListener("click", closeModal);
  $("#tp-go", modal).addEventListener("click", async () => {
    try {
      await api("/trips", { method: "POST", body: {
        title: $("#tp-title", modal).value, start_date: $("#tp-start", modal).value,
        end_date: $("#tp-end", modal).value || null, destination: $("#tp-dest", modal).value,
        note: $("#tp-note", modal).value } });
      toast("سفر ساخته شد.", "ok"); closeModal(); await loadTrips(true); go("trips");
    } catch (err) { toast(err.message, "bad"); }
  });
}

function tripDetail(d) {
  const modal = openModal(`
    <h3>${esc(d.trip.title)} <span class="pill">${esc(d.trip.code)}</span></h3>
    <p class="small muted">${esc(d.trip.destination)} • ${faDigits(d.trip.start)} تا ${faDigits(d.trip.end)}${d.trip.note ? " • " + esc(d.trip.note) : ""}</p>
    <div class="grid cols-4">
      <div class="card kpi"><span class="label">فروش (بدون مالیات)</span><span class="value num">${money(d.totals.revenue)}</span></div>
      <div class="card kpi"><span class="label">هزینه‌ی سفر</span><span class="value num">${money(d.totals.cost)}</span></div>
      <div class="card kpi"><span class="label">سود سفر</span><span class="value num">${money(d.totals.profit)}</span></div>
      <div class="card kpi"><span class="label">درصد سود</span><span class="value">${faDigits(d.totals.margin_percent)}٪</span></div>
    </div>
    ${d.totals.lost ? `<div class="note bad" style="margin-top:12px">این سفر ضرر داده است؛ خوب است هزینه‌ها و قیمت فروش دوباره نگاه شود.</div>` : ""}
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card"><h3>فروش این سفر</h3>
        <table><tbody>${d.invoices.length ? d.invoices.map((i) => `<tr>
          <td class="num">${esc(i.number || "پیش‌نویس")}</td><td>${esc(i.party)}</td>
          <td class="num">${fmt(i.total)}</td><td class="num">${i.total - i.paid > 0 ? "مانده " + fmt(i.total - i.paid) : "تسویه"}</td>
        </tr>`).join("") : `<tr><td class="empty">فاکتوری ندارد.</td></tr>`}</tbody></table></div>
      <div class="card"><h3>هزینه‌های این سفر</h3>
        <table><tbody>${d.bills.length ? d.bills.map((b) => `<tr>
          <td class="num">${esc(b.number || "پیش‌نویس")}</td><td>${esc(b.party)}</td>
          <td class="num">${fmt(b.total)}</td><td class="num">${b.total - b.paid > 0 ? "مانده " + fmt(b.total - b.paid) : "تسویه"}</td>
        </tr>`).join("") : `<tr><td class="empty">هزینه‌ای ثبت نشده.</td></tr>`}</tbody></table></div>
    </div>
    <div class="card" style="margin-top:14px" id="trip-pax-card">
      <h3>مسافران این سفر</h3>
      <p class="small muted">شماره‌ی ملی و گذرنامه رمزنگاری‌شده نگه‌داری می‌شوند و اینجا ماسک‌شده
        دیده می‌شوند. برای دیدن شماره‌ی کامل، دکمه‌ی «نمایش کامل» را بزنید (در ردّ کار ثبت می‌شود).</p>
      <div id="trip-pax"></div>
      ${can("passengers.manage") ? `<div class="modal-actions">
        <button id="pax-add" class="btn primary small">مسافر جدید</button>
        <button id="pax-export" class="btn small">خروجی اکسل</button>
        ${can("passengers.purge") ? `<button id="pax-purge" class="btn small">پاک‌کردن اطلاعات هویتی بعد از سفر</button>` : ""}
      </div>` : ""}
    </div>
    <div class="card" style="margin-top:14px"><h3>پول‌هایی که برای این سفر رد و بدل شده</h3>
      <table><tbody>${d.settlements.length ? d.settlements.map((s) => `<tr>
        <td class="num">${faDigits(s.date)}</td><td>${s.direction === "in" ? "دریافت از" : "پرداخت به"} ${esc(s.party)}</td>
        <td class="num">${fmt(s.amount)}</td></tr>`).join("") : `<tr><td class="empty">چیزی ثبت نشده.</td></tr>`}</tbody></table></div>
    <div class="modal-actions">
      <button id="tpx" class="btn">بستن</button>
      <button id="tpy" class="btn">خروجی اکسل همه‌ی سفرها</button>
    </div>`);
  $("#tpx", modal).addEventListener("click", closeModal);
  $("#tpy", modal).addEventListener("click", () => downloadXlsx("/export/trips.xlsx", "پرونده-سفرها.xlsx"));
  renderTripPassengers(d.trip.id, d.trip.code);
}

const PAX_KINDS = { adult: "بزرگسال", child: "کودک", infant: "نوزاد" };

/* فهرست مسافران یک سفر (یا یک فاکتور) — ماسک‌شده، با دکمه‌ی نمایش کامل */
async function renderTripPassengers(tripId, code, invoiceId) {
  const box = $("#trip-pax");
  if (!box) return;
  const q = invoiceId ? `invoice_id=${invoiceId}` : `trip_id=${tripId}`;
  const d = await api("/passengers?" + q);
  const stateBadge = { ok: "posted", soon: "draft", expired: "reversed", unknown: "closed" };
  box.innerHTML = d.rows.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>نام</th><th>نوع</th><th>تابعیت</th><th>کد ملی</th><th>گذرنامه</th>
        <th>انقضای گذرنامه</th><th>تلفن</th><th></th></tr></thead>
      <tbody>${d.rows.map((p) => `<tr data-px="${p.id}">
        <td>${esc(p.name)}</td><td class="small">${esc(p.kind_label)}</td>
        <td class="small">${esc(p.person_type_label)}</td>
        <td class="num">${esc(p.national_id || "—")}</td>
        <td class="num">${esc(p.passport_no || "—")}</td>
        <td class="small">${p.passport_expiry ? faDigits(p.passport_expiry) +
          ` <span class="badge ${stateBadge[p.passport_state]}">${esc(p.passport_state_label)}</span>` : "—"}</td>
        <td class="num">${esc(p.phone || "—")}</td>
        <td><div class="row-actions" style="white-space:nowrap">
          ${can("passengers.view_full") ? `<button class="btn small" data-full="${p.id}">نمایش کامل</button>` : ""}
          ${can("passengers.manage") ? `<button class="btn small" data-pedit="${p.id}">ویرایش</button>
            <button class="btn small" data-pdel="${p.id}">حذف</button>` : ""}
        </div></td></tr>`).join("")}</tbody>
    </table></div>
    ${d.masked_note ? `<p class="small muted">${esc(d.masked_note)}</p>` : ""}` :
    `<div class="empty">هنوز مسافری برای این ${invoiceId ? "فاکتور" : "سفر"} ثبت نشده است.
      ${can("passengers.manage") ? "با دکمه‌ی «مسافر جدید» شروع کنید." : ""}</div>`;

  const refresh = () => renderTripPassengers(tripId, code, invoiceId);
  box.querySelectorAll("[data-full]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const res = await api(`/passengers/${b.dataset.full}/reveal`, { method: "POST", body: {} });
      const p = res.row;
      alert(`نام: ${p.name}\nکد ملی: ${p.national_id || "—"}\nگذرنامه: ${p.passport_no || "—"}` +
            `\nانقضای گذرنامه: ${p.passport_expiry || "—"}\n\n${res.message}`);
    } catch (err) { toast(err.message, "bad"); }
  }));
  box.querySelectorAll("[data-pdel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("این مسافر حذف شود؟")) return;
    try { await api(`/passengers/${b.dataset.pdel}`, { method: "DELETE" }); toast("حذف شد.", "ok"); refresh(); }
    catch (err) { toast(err.message, "bad"); }
  }));
  box.querySelectorAll("[data-pedit]").forEach((b) => b.addEventListener("click", async () => {
    const row = d.rows.find((x) => String(x.id) === b.dataset.pedit);
    passengerEditor({ tripId, code, row, invoiceId, onDone: refresh });
  }));
  const add = $("#pax-add", $("#modal-root"));
  if (add && !add.dataset.bound) {
    add.dataset.bound = "1";
    add.addEventListener("click", () => passengerEditor({ tripId, code, invoiceId, onDone: refresh }));
  }
  const ex = $("#pax-export", $("#modal-root"));
  if (ex && !ex.dataset.bound) {
    ex.dataset.bound = "1";
    ex.addEventListener("click", () => downloadXlsx(
      "/export/passengers.xlsx?" + q, "مسافران.xlsx"));
  }
  const pg = $("#pax-purge", $("#modal-root"));
  if (pg && !pg.dataset.bound) {
    pg.dataset.bound = "1";
    pg.addEventListener("click", async () => {
    if (!confirm("اطلاعات هویتی مسافران این سفر پاک شود؟ (نام و بقیه‌ی اطلاعات می‌ماند؛ این کار برگشت‌پذیر نیست)")) return;
    try {
        const res = await api(`/trips/${tripId}/purge-passengers`, { method: "POST" });
        toast(res.message, "ok"); refresh();
      } catch (err) { toast(err.message, "bad"); }
    });
  }
}

/* انتخاب مسافران یک فاکتور بلیت از بین مسافران همان سفر */
async function invoicePassengersEditor(inv, trips) {
  if (!inv.trip_id) {
    toast("این فاکتور به هیچ سفری وصل نیست؛ اول در ویرایش فاکتور، سفر را انتخاب کن — یا در صفحه‌ی پرونده‌ی سفر، مسافرها را ثبت کن.", "bad");
    return;
  }
  const trip = trips.find((t) => t.id === inv.trip_id);
  const all = await api(`/passengers?trip_id=${inv.trip_id}`);
  const linked = await api(`/passengers?invoice_id=${inv.id}`);
  const linkedIds = new Set(linked.rows.map((r) => r.id));
  const modal = openModal(`
    <h3>مسافران بلیت — فاکتور ${esc(inv.number || "پیش‌نویس")}</h3>
    <p class="small muted">سفر: ${esc(trip ? trip.title : "—")} — اطلاعات هویتی مسافر در صورتحساب
      سامانه‌ی مودیان استفاده می‌شود (کد ملی یا شماره‌ی گذرنامه).</p>
    ${all.rows.length ? `<div class="table-wrap"><table>
      <tbody>${all.rows.map((p) => `<tr>
        <td style="width:34px"><input type="checkbox" class="ip-pax" value="${p.id}"
          ${linkedIds.has(p.id) ? "checked" : ""} style="width:17px"></td>
        <td>${esc(p.name)}</td><td class="small">${esc(p.kind_label)}</td>
        <td class="num">${esc(p.national_id || "—")}</td><td class="num">${esc(p.passport_no || "—")}</td>
      </tr>`).join("")}</tbody></table></div>` :
      `<div class="empty">برای این سفر مسافری ثبت نشده است.</div>`}
    <div class="modal-actions">
      <button id="ip-save" class="btn primary">ذخیره</button>
      <button id="ip-new" class="btn">مسافر جدید</button>
      <button id="ip-close" class="btn">بستن</button>
    </div>`);
  $("#ip-close", modal).addEventListener("click", closeModal);
  $("#ip-new", modal).addEventListener("click", () => {
    closeModal();
    passengerEditor({ tripId: inv.trip_id, code: trip ? trip.code : "",
                      invoiceId: inv.id, onDone: () => go("invoices") });
  });
  $("#ip-save", modal).addEventListener("click", async () => {
    const ids = Array.from(modal.querySelectorAll(".ip-pax:checked")).map((c) => Number(c.value));
    try {
      const res = await api(`/invoices/${inv.id}/passengers`, { method: "POST",
        body: { passenger_ids: ids } });
      closeModal();
      toast(res.message, "ok");
      go("invoices");
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* ثبت/ویرایش مسافر */
function passengerEditor({ tripId, code, row, invoiceId, onDone }) {
  const isNew = !row;
  const modal = openModal(`
    <h3>${isNew ? "مسافر جدید" : "ویرایش مسافر"} ${code ? `<span class="pill">${esc(code)}</span>` : ""}</h3>
    <div class="grid cols-3">
      <label>نام و نام خانوادگی <input id="px-name" value="${esc(row ? row.name : "")}"></label>
      <label>نوع <select id="px-kind">
        ${Object.keys(PAX_KINDS).map((k) => `<option value="${k}"${row && row.kind === k ? " selected" : ""}>${PAX_KINDS[k]}</option>`).join("")}
      </select></label>
      <label>تابعیت <select id="px-ptype">
        <option value="1"${!row || row.person_type === 1 ? " selected" : ""}>ایرانی</option>
        <option value="2"${row && row.person_type === 2 ? " selected" : ""}>غیرایرانی</option>
      </select></label>
      <label>کد ملی (۱۰ رقم) <input id="px-nid" class="num"
        value="${esc(row && row.person_type === 1 ? row.national_id : "")}" placeholder="برای ایرانی"></label>
      <label>شماره‌ی گذرنامه <input id="px-pass"
        value="${esc(row && row.person_type === 2 ? row.passport_no : "")}" placeholder="برای غیرایرانی"></label>
      <label>انقضای گذرنامه <input id="px-exp" value="${esc(row ? row.passport_expiry : "")}" placeholder="۱۴۰۶/۰۵/۱۲"></label>
      <label>تلفن <input id="px-phone" class="num" value="${esc(row ? row.phone : "")}"></label>
      <label>یادداشت <input id="px-note" value="${esc(row ? row.note : "")}"></label>
    </div>
    <p class="small muted">شماره‌ها رمزنگاری‌شده ذخیره می‌شوند. تاریخ‌ها شمسی، مثل ۱۴۰۶/۰۵/۱۲.</p>
    <div class="modal-actions">
      <button id="px-save" class="btn primary">ذخیره</button>
      <button id="px-cancel" class="btn">بستن</button>
    </div>`);
  $("#px-cancel", modal).addEventListener("click", closeModal);
  $("#px-save", modal).addEventListener("click", async () => {
    const body = {
      full_name: $("#px-name", modal).value.trim(),
      kind: $("#px-kind", modal).value,
      person_type: Number($("#px-ptype", modal).value),
      national_id: numToLatin($("#px-nid", modal).value).trim(),
      passport_no: $("#px-pass", modal).value.trim(),
      passport_expiry: $("#px-exp", modal).value.trim(),
      phone: numToLatin($("#px-phone", modal).value).trim(),
      note: $("#px-note", modal).value.trim(),
      trip_id: tripId || null, invoice_id: invoiceId || null };
    try {
      const res = isNew ? await api("/passengers", { method: "POST", body })
                        : await api(`/passengers/${row.id}`, { method: "PATCH", body });
      closeModal();
      toast(res.message || "ذخیره شد.", "ok");
      if (onDone) onDone();
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* -------- تقویم پول -------- */
views.calendar = async (view, params) => {
  const days = params.days || 30;
  const d = await api("/calendar?days=" + days);
  const rowsTable = (rows, empty) => rows.length ? rows.map((r) => `<tr>
      <td class="num">${faDigits(r.date)}</td><td>${esc(r.title)}</td><td class="small">${esc(r.party)}</td>
      <td class="num">${r.direction === "in" ? fmt(r.amount) : "—"}</td>
      <td class="num">${r.direction === "out" ? fmt(r.amount) : "—"}</td>
      <td class="num">${r.days_left < 0 ? faDigits(Math.abs(r.days_left)) + " روز گذشته" : faDigits(r.days_left) + " روز"}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty">${esc(empty)}</td></tr>`;
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <label>تا چند روز آینده؟ <select id="c-days">
          ${[14, 30, 60, 90].map((n) => `<option value="${n}"${n === Number(days) ? " selected" : ""}>${faDigits(n)} روز</option>`).join("")}
        </select></label>
        <button id="c-go" class="btn">نمایش</button>
        <button id="c-export" class="btn">خروجی اکسل</button>
      </div>
      <p class="small muted">${faDigits(d.from)} تا ${faDigits(d.to)} — فقط من همین بازه را می‌بینم.</p>
    </div>
    <div class="grid cols-4">
      <div class="card kpi"><span class="label">پولی که باید بیاید</span><span class="value num">${money(d.total_in)}</span></div>
      <div class="card kpi"><span class="label">پولی که باید برود</span><span class="value num">${money(d.total_out)}</span></div>
      <div class="card kpi"><span class="label">معوق — طلب ما</span><span class="value num">${money(d.overdue_in)}</span></div>
      <div class="card kpi"><span class="label">معوق — بدهی ما</span><span class="value num">${money(d.overdue_out)}</span></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${d.overdue.length ? "معوق — تاریخش گذشته" : ""}</h3>
      ${d.overdue.length ? `<div class="table-wrap"><table>
        <thead><tr><th>تاریخ</th><th>چه چیزی</th><th>طرف حساب</th><th>ورودی</th><th>خروجی</th><th>چند وقت</th></tr></thead>
        <tbody>${rowsTable(d.overdue, "")}</tbody></table></div>` : `<div class="note">چیز معوقی نیست. خوب است.</div>`}
    </div>
    <div class="card">
      <h3>${faDigits(days)} روز آینده</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>تاریخ</th><th>چه چیزی</th><th>طرف حساب</th><th>ورودی</th><th>خروجی</th><th>چند وقت</th></tr></thead>
        <tbody>${rowsTable(d.items, "در این بازه چیزی برای پرداخت یا دریافت نیست.")}</tbody></table></div>
    </div>`;
  $("#c-go").addEventListener("click", () => go("calendar", { days: $("#c-days").value }));
  $("#c-export").addEventListener("click", () => downloadXlsx(`/export/calendar.xlsx?days=${days}`, "تقویم-پول.xlsx"));
};

/* -------- سندهای تکراری -------- */
views.recurring = async (view) => {
  const d = await api("/recurring");
  const today = todayJalali();
  view.innerHTML = `
    <div class="card">
      <h3>سندهای تکراری</h3>
      <p class="small muted">برای کارهای هر ماه مثل اجاره و حقوق: یک بار تعریف می‌کنی و هر ماه با یک کلیک سندش ساخته می‌شود.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>عنوان</th><th>روز ماه</th><th>مبلغ</th><th>آخرین ماه ساخته‌شده</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((r) => `<tr>
          <td>${esc(r.title)}</td><td class="num">${faDigits(r.day)}</td>
          <td class="num">${fmt(r.amount)}</td>
          <td class="num">${r.last_period ? faDigits(r.last_period) : "—"}</td>
          <td>${r.is_active ? '<span class="badge open">فعال</span>' : '<span class="badge closed">غیرفعال</span>'}</td>
          <td><div class="row-actions">
            ${can("journal.create") ? `<button class="btn small primary" data-gen="${r.id}">ساخت سند این ماه</button>` : ""}
            ${can("journal.create") ? `<button class="btn small" data-toggle="${r.id}" data-active="${r.is_active}">${r.is_active ? "غیرفعال کن" : "فعال کن"}</button>` : ""}
          </div></td></tr>`).join("") : `<tr><td colspan="6" class="empty">سند تکراری نداری. از صفحه‌ی سند روزنامه می‌توانی یکی بسازی.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  view.querySelectorAll("[data-gen]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api(`/recurring/${b.dataset.gen}/generate`, { method: "POST" });
      toast(r.message, "ok"); go("recurring");
    } catch (err) { toast(err.message, "bad"); }
  }));
  view.querySelectorAll("[data-tax]").forEach((b) => b.addEventListener("click", () => {
    const p = d.rows.find((x) => String(x.id) === b.dataset.tax);
    if (p) partyTaxEditor(p);
  }));
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
    try { await api("/recurring/" + b.dataset.toggle, { method: "PATCH", body: { is_active: b.dataset.active !== "true" } });
      toast("وضعیت عوض شد.", "ok"); go("recurring");
    } catch (err) { toast(err.message, "bad"); }
  }));
};

/* ================================================================== حقوق و دستمزد */
const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const RUN_STATUS = { draft: ["پیش‌نویس", "draft"], posted: ["ثبت‌شده", "posted"],
  paid: ["پرداخت‌شده", "open"], cancelled: ["برگشت‌خورده", "reversed"] };

const pay = { employees: [], items: [], loans: [], settings: [], runs: [], tab: "runs",
  run: null, year: null };

function jNow() {
  const parts = todayJalali().split("/");
  return { jy: Number(parts[0]), jm: Number(parts[1]), jd: Number(parts[2]) };
}

async function loadPay(force) {
  if (!pay.employees.length || force) {
    const d = await api("/payroll/employees");
    pay.employees = d.rows;
  }
  if (!pay.items.length || force) {
    pay.items = (await api("/payroll/items")).rows;
  }
  if (!pay.settings.length || force) {
    pay.settings = (await api("/payroll/settings")).rows;
  }
  return pay;
}

function employeeOptions(selected) {
  return pay.employees.filter((e) => e.is_active).map((e) =>
    `<option value="${e.id}"${Number(selected) === e.id ? " selected" : ""}>${esc(e.name)} (${esc(e.code)})</option>`).join("");
}

function rulesNote(rules) {
  if (!rules) return "";
  if (rules.fell_back) {
    return `<div class="note bad">اعداد قانونی سال ${faDigits(rules.settings_year)} استفاده شده چون برای امسال عددی ثبت نشده است.
      اگر قانون امسال عوض شده، در سربرگ «اعداد قانونی» اعداد تازه را وارد کنید.</div>`;
  }
  if (!rules.confirmed) {
    return `<div class="note bad">اعداد قانونی این سال هنوز توسط حسابدار تأیید نشده است.
      در سربرگ «اعداد قانونی» با قانون جاری تطبیق بدهید و دکمه‌ی تأیید را بزنید.</div>`;
  }
  return "";
}

views.payroll = async (view, params) => {
  await loadPay(true);
  pay.tab = params.tab || pay.tab;
  const j = jNow();
  if (!pay.year) pay.year = j.jy;
  const tabs = [["runs", "لیست حقوق ماهانه"], ["employees", "کارکنان و حکم حقوقی"],
    ["loans", "مساعده و وام"], ["items", "اقلام حقوق"], ["settings", "اعداد قانونی"]];
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        ${tabs.map((t) => `<button class="btn ${pay.tab === t[0] ? "primary" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}
      </div>
      <p class="small muted">اینجا حقوق ماهانه‌ی کارکنان حساب می‌شود، سند می‌خورد و فیش هر نفر درمی‌آید.
        همه‌ی مبالغ ریال است. اعداد قانونی (بیمه، پله‌های مالیات) در سربرگ «اعداد قانونی» است و خودتان می‌توانید عوضش کنید.</p>
    </div>
    <div id="pay-body"></div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => go("payroll", { tab: b.dataset.tab })));
  const body = $("#pay-body", view);
  if (pay.tab === "runs") await payRuns(body, j);
  else if (pay.tab === "employees") await payEmployees(body);
  else if (pay.tab === "loans") await payLoans(body);
  else if (pay.tab === "items") await payItems(body);
  else await paySettings(body);
};

/* -------- لیست حقوق ماهانه -------- */
async function payRuns(body, j) {
  const d = await api("/payroll/runs");
  pay.runs = d.rows;
  body.innerHTML = `
    <div class="card">
      <h3>محاسبه‌ی حقوق یک ماه</h3>
      <div class="filters">
        <label>سال <input id="pr-jy" class="num" value="${faDigits(pay.year)}" size="6"></label>
        <label>ماه <select id="pr-jm">${J_MONTHS.map((m, i) =>
          `<option value="${i + 1}"${i + 1 === j.jm ? " selected" : ""}>${m}</option>`).join("")}</select></label>
        ${can("payroll.manage") ? `<button id="pr-calc" class="btn primary">محاسبه‌ی لیست حقوق</button>` : ""}
        <button id="pr-brackets" class="btn">خروجی اعداد قانونی</button>
      </div>
      <p class="small muted">اگر برای همان ماه قبلاً محاسبه کرده باشید، با همین دکمه از نو حساب می‌شود (تا وقتی سندش ثبت نشده).</p>
    </div>
    <div class="card">
      <h3>لیست‌های حساب‌شده</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>شماره</th><th>دوره</th><th>کارکنان</th><th>جمع حقوق</th>
          <th>بیمه سهم کارمند</th><th>بیمه سهم کارفرما</th><th>مالیات</th><th>قسط وام</th>
          <th>خالص پرداختی</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${pay.runs.length ? pay.runs.map((r) => {
          const st = RUN_STATUS[r.status] || ["?", "draft"];
          return `<tr>
            <td class="num">${r.number ? faDigits(r.number) : "—"}</td><td>${faDigits(r.period)}</td>
            <td class="num">${faDigits(r.employees)}</td>
            <td class="num">${fmt(r.gross)}</td><td class="num">${fmt(r.insurance_employee)}</td>
            <td class="num">${fmt(r.insurance_employer)}</td><td class="num">${fmt(r.tax)}</td>
            <td class="num">${fmt(r.loan)}</td><td class="num"><strong>${fmt(r.net)}</strong></td>
            <td><span class="badge ${st[1]}">${st[0]}</span></td>
            <td><button class="btn small" data-open="${r.id}">باز کردن</button></td></tr>`;
        }).join("") : `<tr><td colspan="11" class="empty">هنوز لیست حقوقی حساب نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  $("#pr-brackets").addEventListener("click", () => downloadXlsx("/export/tax-brackets.xlsx", "اعداد-قانونی-حقوق.xlsx"));
  const calc = $("#pr-calc");
  if (calc) calc.addEventListener("click", async () => {
    try {
      pay.year = Number(numToLatin($("#pr-jy").value)) || pay.year;
      const out = await api("/payroll/runs", { method: "POST", body: {
        jy: pay.year, jm: Number($("#pr-jm").value), employees: null, overtime: {} } });
      toast(`${out.message} خالص پرداختی: ${money(out.totals.net)}`, "ok");
      await loadPay(true);
      go("payroll", { tab: "runs" });
      runModal(await api(`/payroll/runs/${out.id}`));
    } catch (err) { toast(err.message, "bad"); }
  });
  body.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", async () => {
    try { runModal(await api("/payroll/runs/" + b.dataset.open)); } catch (err) { toast(err.message, "bad"); }
  }));
}

function runModal(d) {
  const st = RUN_STATUS[d.status] || ["?", "draft"];
  const t = d.totals;
  const modal = openModal(`
    <h3>لیست حقوق ${faDigits(d.period)} <span class="badge ${st[1]}">${st[0]}</span></h3>
    <p class="small muted">شماره ${faDigits(d.number || "—")} — ${faDigits(d.rows.length)} کارمند</p>
    ${rulesNote(d.rules)}
    <div class="table-wrap" style="max-height:45vh"><table>
      <thead><tr><th>کد</th><th>نام</th><th>روز</th><th>جمع حقوق</th><th>مشمول بیمه</th>
        <th>مشمول مالیات</th><th>بیمه کارمند</th><th>مالیات</th><th>قسط وام</th><th>خالص</th><th>فیش</th></tr></thead>
      <tbody>${d.rows.map((r) => `<tr>
        <td class="num">${esc(r.code)}</td><td>${esc(r.employee)}</td><td class="num">${faDigits(r.work_days)}</td>
        <td class="num">${fmt(r.gross)}</td><td class="num">${fmt(r.insurable_base)}</td>
        <td class="num">${fmt(r.taxable_base)}</td><td class="num">${fmt(r.insurance_employee)}</td>
        <td class="num">${fmt(r.tax)}</td><td class="num">${fmt(r.loan)}</td>
        <td class="num"><strong>${fmt(r.net)}</strong></td>
        <td><button class="btn small" data-slip="${r.employee_id}">فیش</button></td></tr>`).join("")}
      <tr><td colspan="3"><strong>جمع</strong></td><td class="num"><strong>${fmt(t.gross)}</strong></td>
        <td></td><td></td><td class="num"><strong>${fmt(t.insurance_employee)}</strong></td>
        <td class="num"><strong>${fmt(t.tax)}</strong></td><td class="num"><strong>${fmt(t.loan)}</strong></td>
        <td class="num"><strong>${fmt(t.net)}</strong></td><td></td></tr>
      </tbody></table></div>
    <div class="grid cols-3" style="margin-top:12px">
      <div class="card kpi" style="margin:0"><span class="label">بیمه‌ی پرداختنی (کارمند + کارفرما)</span>
        <span class="value num">${money(t.insurance_employee + t.insurance_employer)}</span></div>
      <div class="card kpi" style="margin:0"><span class="label">هزینه‌ی کل آژانس این ماه</span>
        <span class="value num">${money(t.employer_cost)}</span></div>
      <div class="card kpi" style="margin:0"><span class="label">مالیات حقوق این ماه</span>
        <span class="value num">${money(t.tax)}</span>
        <span class="small muted">${d.rules.confirmed ? "با اعداد تأییدشده" : "اعداد تأییدنشده — باید تأیید شود"}</span></div>
    </div>
    <div class="modal-actions" style="flex-wrap:wrap">
      ${can("payroll.manage") && d.status === "draft" ? `<button id="rn-post" class="btn primary">ثبت سند حقوق</button>` : ""}
      ${can("payroll.manage") && d.status === "posted" ? `<button id="rn-pay" class="btn primary">پرداخت حقوق</button>` : ""}
      ${can("payroll.manage") && d.status !== "draft" && d.status !== "cancelled" ? `<button id="rn-cancel" class="btn danger">برگرداندن لیست</button>` : ""}
      <button id="rn-list" class="btn">خروجی اکسل لیست</button>
      <button id="rn-ins" class="btn">کاربرگ بیمه</button>
      <button id="rn-tax" class="btn">کاربرگ مالیات</button>
      <button id="rn-close" class="btn">بستن</button>
    </div>
    <p class="small muted" style="margin-top:10px">سند حقوق خودش ساخته می‌شود و تراز است؛ پرداخت هم سند جدای خودش را دارد.
      برگرداندن لیست، سندها را ابطال می‌کند و اقساط وام کسرشده را برمی‌گرداند.</p>`);
  $("#rn-close", modal).addEventListener("click", closeModal);
  $("#rn-list", modal).addEventListener("click", () => downloadXlsx(`/export/payroll.xlsx?run_id=${d.id}`, `لیست-حقوق.xlsx`));
  $("#rn-ins", modal).addEventListener("click", () => downloadXlsx(`/export/payroll-insurance.xlsx?run_id=${d.id}`, "کاربرگ-بیمه.xlsx"));
  $("#rn-tax", modal).addEventListener("click", () => downloadXlsx(`/export/payroll-tax.xlsx?run_id=${d.id}`, "کاربرگ-مالیات.xlsx"));
  modal.querySelectorAll("[data-slip]").forEach((b) => b.addEventListener("click", async () => {
    try { payslipModal(await api(`/payroll/runs/${d.id}/payslip/${b.dataset.slip}`)); } catch (err) { toast(err.message, "bad"); }
  }));
  const post = $("#rn-post", modal);
  if (post) post.addEventListener("click", async () => {
    try {
      const r = await api(`/payroll/runs/${d.id}/post`, { method: "POST", body: {} });
      toast(r.message, "ok"); closeModal(); await loadPay(true); go("payroll", { tab: "runs" });
    } catch (err) { toast(err.message, "bad"); }
  });
  const payBtn = $("#rn-pay", modal);
  if (payBtn) payBtn.addEventListener("click", () => payRunModal(d));
  const cancel = $("#rn-cancel", modal);
  if (cancel) cancel.addEventListener("click", async () => {
    const reason = prompt("دلیل برگرداندن لیست:");
    if (reason === null) return;
    try {
      const r = await api(`/payroll/runs/${d.id}/cancel`, { method: "POST", body: { reason } });
      toast(r.message, "ok"); closeModal(); await loadPay(true); go("payroll", { tab: "runs" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

async function payRunModal(d) {
  const treasury = (await api("/reports/treasury")).rows;
  if (!treasury.length) { toast("اول یک حساب صندوق یا بانک بسازید.", "bad"); return; }
  const modal = openModal(`
    <h3>پرداخت حقوق ${faDigits(d.period)}</h3>
    <p>مبلغ پرداختی: <strong class="num">${money(d.totals.net)}</strong></p>
    <div class="grid cols-2">
      <label>از حساب <select id="py-acc">${treasury.map((t) =>
        `<option value="${t.id}">${esc(t.name)} (مانده ${fmt(t.balance)})</option>`).join("")}</select></label>
      <label>تاریخ <input id="py-date" value="${todayJalali()}"></label>
    </div>
    <p class="small muted">با این کار سند پرداخت ثبت می‌شود و بدهی «حقوق پرداختنی» صفر می‌شود.</p>
    <div class="modal-actions">
      <button id="py-go" class="btn primary">ثبت پرداخت</button>
      <button id="py-close" class="btn">بستن</button></div>`);
  $("#py-close", modal).addEventListener("click", closeModal);
  $("#py-go", modal).addEventListener("click", async () => {
    try {
      const r = await api(`/payroll/runs/${d.id}/pay`, { method: "POST",
        body: { account_id: Number($("#py-acc", modal).value), date: $("#py-date", modal).value } });
      toast(r.message, "ok"); closeModal(); await loadPay(true); go("payroll", { tab: "runs" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

function payslipModal(s) {
  const modal = openModal(`
    <h3>فیش حقوقی — ${esc(s.employee.name)}</h3>
    <p class="small muted">${faDigits(s.run.period)} — شماره لیست ${faDigits(s.run.number || "—")} — روز کارکرد ${faDigits(s.work_days)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>مزایا</th><th>مبلغ (ریال)</th></tr></thead>
      <tbody>${s.earnings.map((e) => `<tr><td>${esc(e.title)}</td><td class="num">${fmt(e.amount)}</td></tr>`).join("")}
        <tr><td><strong>جمع حقوق</strong></td><td class="num"><strong>${fmt(s.gross)}</strong></td></tr></tbody>
    </table></div>
    <div class="table-wrap" style="margin-top:12px"><table>
      <thead><tr><th>کسورات</th><th>مبلغ (ریال)</th></tr></thead>
      <tbody>
        <tr><td>بیمه‌ی سهم کارمند</td><td class="num">${fmt(s.insurance_employee)}</td></tr>
        <tr><td>مالیات حقوق</td><td class="num">${fmt(s.tax)}</td></tr>
        <tr><td>قسط مساعده/وام</td><td class="num">${fmt(s.loan)}</td></tr>
        <tr><td>سایر کسورات</td><td class="num">${fmt(s.other_deduction)}</td></tr>
        <tr><td><strong>خالص پرداختی</strong></td><td class="num"><strong>${fmt(s.net)}</strong></td></tr>
      </tbody></table></div>
    <p class="small muted" style="margin-top:10px">بیمه‌ی سهم کارفرما (${fmt(s.insurance_employer + s.unemployment)} ریال) از حقوق کم نمی‌شود و هزینه‌ی آژانس است.</p>
    <div class="modal-actions"><button id="ps-close" class="btn">بستن</button></div>`);
  $("#ps-close", modal).addEventListener("click", closeModal);
}

/* -------- کارکنان -------- */
async function payEmployees(body) {
  body.innerHTML = `
    <div class="card">
      <div class="filters">
        ${can("payroll.manage") ? `<button id="pe-new" class="btn primary">کارمند جدید</button>` : ""}
        <button id="pe-export" class="btn">خروجی اکسل کارکنان</button>
      </div>
      <p class="small muted">برای هر کارمند یک «حکم حقوقی» داریم: چند قلم با مبلغ هر قلم. حقوق ماهانه از همین حکم حساب می‌شود.</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>نام</th><th>سمت</th><th>نوع قرارداد</th><th>روز کارکرد</th>
          <th>جمع اقلام حکم</th><th>مانده وام</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${pay.employees.length ? pay.employees.map((e) => `<tr>
          <td class="num">${esc(e.code)}</td><td>${esc(e.name)}</td><td class="small">${esc(e.position)}</td>
          <td>${esc(e.contract_label)}</td><td class="num">${faDigits(e.work_days)}</td>
          <td class="num">${fmt(e.fixed_total)}</td><td class="num">${fmt(e.loan_remaining)}</td>
          <td>${e.is_active ? '<span class="badge open">فعال</span>' : '<span class="badge closed">غیرفعال</span>'}</td>
          <td><div class="row-actions">
            ${can("payroll.manage") ? `<button class="btn small" data-hokm="${e.id}">حکم حقوقی</button>
            <button class="btn small" data-toggle="${e.id}" data-active="${e.is_active}">${e.is_active ? "خروج از لیست" : "برگشت به لیست"}</button>` : ""}
          </div></td></tr>`).join("") : `<tr><td colspan="9" class="empty">هنوز کارمندی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  const nb = $("#pe-new");
  if (nb) nb.addEventListener("click", () => employeeModal(null));
  $("#pe-export").addEventListener("click", () => downloadXlsx("/export/employees.xlsx", "کارکنان-و-حکم-حقوقی.xlsx"));
  body.querySelectorAll("[data-hokm]").forEach((b) => b.addEventListener("click", async () => {
    try { employeeModal(await api("/payroll/employees/" + b.dataset.hokm)); } catch (err) { toast(err.message, "bad"); }
  }));
  body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api("/payroll/employees/" + b.dataset.toggle, { method: "PATCH",
        body: { is_active: b.dataset.active !== "true" } });
      toast("وضعیت کارمند عوض شد.", "ok"); await loadPay(true); go("payroll", { tab: "employees" });
    } catch (err) { toast(err.message, "bad"); }
  }));
}

function employeeModal(emp) {
  const isNew = !emp;
  const rows = () => pay.items.filter((i) => i.kind === "earning").map((i) => {
    const mine = emp ? (emp.items || []).find((x) => x.pay_item_id === i.id) : null;
    return `<tr><td>${esc(i.title)}${i.insurable ? "" : ' <span class="small muted">(بدون بیمه)</span>'}</td>
      <td><input class="num pay-item" data-item="${i.id}" value="${mine ? fmt(mine.amount) : ""}"
        placeholder="۰"></td></tr>`;
  }).join("");
  const modal = openModal(`
    <h3>${isNew ? "کارمند جدید" : "حکم حقوقی " + esc(emp.name)}</h3>
    <div class="grid cols-2">
      <label>نام و نام خانوادگی <input id="em-name" value="${emp ? esc(emp.name) : ""}"></label>
      <label>سمت <input id="em-pos" value="${emp ? esc(emp.position) : ""}" placeholder="مثلاً کارشناس فروش بلیت"></label>
      <label>تاریخ استخدام <input id="em-hire" value="${emp ? esc(emp.hire_date) : todayJalali()}"></label>
      <label>نوع قرارداد <select id="em-contract">
        <option value="permanent"${emp && emp.contract === "permanent" ? " selected" : ""}>تمام‌وقت</option>
        <option value="temporary"${emp && emp.contract === "temporary" ? " selected" : ""}>موقت</option>
        <option value="part_time"${emp && emp.contract === "part_time" ? " selected" : ""}>پاره‌وقت</option>
      </select></label>
      <label>روز کارکرد در ماه <input id="em-days" class="num" value="${emp ? faDigits(emp.work_days) : faDigits(30)}"></label>
      <label>یادداشت <input id="em-note" value="${emp ? esc(emp.note || "") : ""}"></label>
    </div>
    <h4 style="margin:14px 0 6px">اقلام حقوق (مبلغ ماهانه به ریال — خالی یعنی ندارد)</h4>
    <div class="table-wrap" style="max-height:40vh"><table>
      <thead><tr><th>قلم</th><th>مبلغ</th></tr></thead><tbody>${rows()}</tbody></table></div>
    <p class="small muted">هر قلم مشمول بیمه و مالیات بودنش را از سربرگ «اقلام حقوق» عوض کنید (مثلاً حق اولاد معمولاً نه بیمه دارد نه مالیات).</p>
    <div class="modal-actions">
      <button id="em-go" class="btn primary">${isNew ? "ثبت کارمند" : "ذخیره‌ی حکم"}</button>
      <button id="em-close" class="btn">بستن</button></div>`);
  $("#em-close", modal).addEventListener("click", closeModal);
  $("#em-go", modal).addEventListener("click", async () => {
    try {
      const items = [...modal.querySelectorAll(".pay-item")].map((i) => ({
        pay_item_id: Number(i.dataset.item), amount_rial: parseMoney(i.value) })).filter((i) => i.amount_rial > 0);
      const base = {
        name: $("#em-name", modal).value.trim(), position: $("#em-pos", modal).value.trim(),
        hire_date: $("#em-hire", modal).value, contract_type: $("#em-contract", modal).value,
        work_days: Number(numToLatin($("#em-days", modal).value)) || 30,
        note: $("#em-note", modal).value, items };
      if (base.items.every((i) => !i.amount_rial)) throw new Error("حداقل یک قلم حقوق با مبلغ بنویسید.");
      if (isNew) await api("/payroll/employees", { method: "POST", body: base });
      else await api("/payroll/employees/" + emp.id, { method: "PATCH", body: {
        items: base.items, work_days: base.work_days, position: base.position, note: base.note } });
      toast(isNew ? "کارمند ثبت شد." : "حکم حقوقی ذخیره شد.", "ok");
      closeModal(); await loadPay(true); go("payroll", { tab: "employees" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* -------- مساعده و وام -------- */
async function payLoans(body) {
  const d = await api("/payroll/loans?status=all");
  body.innerHTML = `
    <div class="card">
      <div class="filters">
        ${can("payroll.manage") ? `<button id="pl-new" class="btn primary">مساعده یا وام جدید</button>` : ""}
      </div>
      <p class="small muted">قسط هر ماه، فقط وقتی لیست حقوق آن ماه «ثبت سند» شود از حقوق کسر می‌شود.
        اگر لیست برگردانده شود، قسط هم برمی‌گردد.</p>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>شماره</th><th>کارمند</th><th>نوع</th><th>تاریخ</th><th>مبلغ</th>
          <th>قسط ماهانه</th><th>کسر شده</th><th>مانده</th><th>پرداخت نقدی</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.length ? d.rows.map((l) => `<tr>
          <td class="num">${esc(l.number)}</td><td>${esc(l.employee)}</td><td>${esc(l.kind_label)}</td>
          <td class="num">${faDigits(l.date)}</td><td class="num">${fmt(l.amount)}</td>
          <td class="num">${fmt(l.monthly)}</td><td class="num">${fmt(l.paid)}</td><td class="num">${fmt(l.remaining)}</td>
          <td class="num">${l.paid_out ? fmt(l.paid_out) : "—"}</td>
          <td><span class="badge ${l.status === "open" ? "open" : l.status === "closed" ? "posted" : "reversed"}">
            ${l.status === "open" ? "باز" : l.status === "closed" ? "تسویه‌شده" : "ابطال‌شده"}</span></td>
          <td>${l.status === "open" && can("payroll.manage")
            ? `<button class="btn small danger" data-lc="${l.id}">ابطال</button>` : ""}</td></tr>`).join("")
          : `<tr><td colspan="11" class="empty">مساعده یا وامی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  const nb = $("#pl-new");
  if (nb) nb.addEventListener("click", loanModal);
  body.querySelectorAll("[data-lc]").forEach((b) => b.addEventListener("click", async () => {
    const reason = prompt("دلیل ابطال:");
    if (reason === null) return;
    try { await api("/payroll/loans/" + b.dataset.lc + "/cancel", { method: "POST", body: { reason } });
      toast("ابطال شد.", "ok"); go("payroll", { tab: "loans" });
    } catch (err) { toast(err.message, "bad"); }
  }));
}

async function loanModal() {
  const treasury = (await api("/reports/treasury")).rows;
  const modal = openModal(`
    <h3>مساعده یا وام کارمند</h3>
    <div class="grid cols-2">
      <label>کارمند <select id="ln-emp">${employeeOptions()}</select></label>
      <label>نوع <select id="ln-kind">
        <option value="advance">مساعده (یک‌جا)</option><option value="loan">وام (قسطی)</option></select></label>
      <label>مبلغ <input id="ln-amount" class="num" placeholder="مثلاً ۳۰ میلیون"></label>
      <label>تعداد قسط <input id="ln-inst" class="num" value="${faDigits(1)}"></label>
      <label>تاریخ <input id="ln-date" value="${todayJalali()}"></label>
      <label>شرح <input id="ln-desc" placeholder="مثلاً وام تعمیرات"></label>
    </div>
    <label style="margin-top:10px">پرداخت نقدی
      <select id="ln-acc"><option value="">الان پرداخت نمی‌کنم</option>
        ${treasury.map((t) => `<option value="${t.id}">${esc(t.name)} (مانده ${fmt(t.balance)})</option>`).join("")}</select></label>
    <p class="small muted">اگر حساب را انتخاب کنید، همان لحظه سند پرداخت پول هم ثبت می‌شود (بدهی کارمند بالا می‌رود).</p>
    <div class="modal-actions">
      <button id="ln-go" class="btn primary">ثبت</button>
      <button id="ln-close" class="btn">بستن</button></div>`);
  $("#ln-close", modal).addEventListener("click", closeModal);
  $("#ln-go", modal).addEventListener("click", async () => {
    try {
      const acc = $("#ln-acc", modal).value;
      const out = await api("/payroll/loans", { method: "POST", body: {
        employee_id: Number($("#ln-emp", modal).value), amount: parseMoney($("#ln-amount", modal).value),
        kind: $("#ln-kind", modal).value,
        installments: Number(numToLatin($("#ln-inst", modal).value)) || 1,
        date: $("#ln-date", modal).value, description: $("#ln-desc", modal).value,
        pay_now_from: acc ? Number(acc) : null } });
      toast(out.message, "ok"); closeModal(); await loadPay(true); go("payroll", { tab: "loans" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* -------- اقلام حقوق -------- */
async function payItems(body) {
  body.innerHTML = `
    <div class="card">
      <h3>اقلام حقوق</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>مشمول بیمه</th><th>مشمول مالیات</th>
          <th>سقف معافیت ماهانه (ریال)</th><th></th></tr></thead>
        <tbody>${pay.items.map((i) => `<tr>
          <td>${esc(i.title)}</td><td class="num">${esc(i.code)}</td>
          <td>${i.kind === "earning" ? "مزایا" : "کسورات"}</td>
          <td><input type="checkbox" data-ins="${i.id}"${i.insurable ? " checked" : ""}${can("payroll.manage") ? "" : " disabled"}></td>
          <td><input type="checkbox" data-tax="${i.id}"${i.taxable ? " checked" : ""}${can("payroll.manage") ? "" : " disabled"}></td>
          <td><input class="num" data-ceil="${i.id}" value="${fmt(i.exempt_ceiling)}" size="14"${can("payroll.manage") ? "" : " disabled"}></td>
          <td>${can("payroll.manage") ? `<button class="btn small" data-saveitem="${i.id}">ذخیره</button>` : ""}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="small muted">مشمول بیمه یعنی این قلم در پایه‌ی بیمه می‌آید. مشمول مالیات یعنی در پایه‌ی مالیات می‌آید.
        سقف معافیت یعنی از این قلم، تا آن مبلغ مالیات ندارد (۰ = هیچ معافیتی).</p>
    </div>
    ${can("payroll.manage") ? `<div class="card">
      <h3>قلم تازه</h3>
      <div class="grid cols-4">
        <label>عنوان <input id="it-title" placeholder="مثلاً حق مأموریت"></label>
        <label>نوع <select id="it-kind"><option value="earning">مزایا</option><option value="deduction">کسورات</option></select></label>
        <label>مشمول بیمه <select id="it-ins"><option value="1">بله</option><option value="0">نه</option></select></label>
        <label>سقف معافیت <input id="it-ceil" class="num" placeholder="۰"></label>
      </div>
      <div class="modal-actions"><button id="it-go" class="btn primary">افزودن قلم</button></div>
      <p class="small muted">قلم تازه‌ای که آژانس بخواهد (مأموریت، پاداش فروش، ایاب‌وذهاب) بدون دست‌زدن به برنامه ساخته می‌شود.</p>
    </div>` : ""}`;
  body.querySelectorAll("[data-saveitem]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.saveitem;
    try {
      await api("/payroll/items/" + id, { method: "PATCH", body: {
        insurable: $(`[data-ins="${id}"]`, body).checked, taxable: $(`[data-tax="${id}"]`, body).checked,
        tax_exempt_monthly_rial: parseMoney($(`[data-ceil="${id}"]`, body).value) } });
      toast("قلم ذخیره شد.", "ok"); await loadPay(true);
    } catch (err) { toast(err.message, "bad"); }
  }));
  const goBtn = $("#it-go");
  if (goBtn) goBtn.addEventListener("click", async () => {
    try {
      await api("/payroll/items", { method: "POST", body: {
        title: $("#it-title").value.trim(), kind: $("#it-kind").value,
        insurable: $("#it-ins").value === "1", taxable: true,
        exempt_ceiling: parseMoney($("#it-ceil").value) } });
      toast("قلم اضافه شد.", "ok"); await loadPay(true); go("payroll", { tab: "items" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* -------- اعداد قانونی -------- */
async function paySettings(body) {
  const j = jNow();
  body.innerHTML = `
    <div class="card">
      <h3>اعداد قانونی هر سال</h3>
      <p class="small muted">هیچ عددی داخل برنامه قفل نیست: درصد بیمه، پله‌های مالیات، ساعات موظفی و ضریب اضافه‌کاری را همین‌جا وارد می‌کنید.
        تا وقتی دکمه‌ی تأیید را نزنید، لیست‌های حقوق با علامت «تأییدنشده» نشان داده می‌شوند.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>سال</th><th>بیمه سهم کارمند</th><th>بیمه سهم کارفرما</th><th>از آن، بیمه بیکاری</th>
          <th>ساعات موظفی ماه</th><th>ضریب اضافه‌کاری</th><th>پله‌های مالیات</th><th>تأیید</th><th></th></tr></thead>
        <tbody>${pay.settings.length ? pay.settings.map((s) => `<tr>
          <td class="num">${faDigits(s.year)}</td><td class="num">${faDigits(s.insurance_employee_percent)}٪</td>
          <td class="num">${faDigits(s.insurance_employer_percent)}٪</td>
          <td class="num">${faDigits(s.unemployment_percent)}٪</td>
          <td class="num">${faDigits(s.standard_monthly_hours)}</td><td class="num">${faDigits(s.overtime_coefficient)}</td>
          <td class="small">${(s.brackets || []).map((b) => `${b.up_to ? fmt(b.up_to) : "بی‌نهایت"} ← ${faDigits(b.rate_bp / 100)}٪`).join("<br>")}</td>
          <td>${s.is_confirmed ? '<span class="badge open">تأییدشده</span>' : '<span class="badge draft">تأییدنشده</span>'}</td>
          <td>${can("payroll.manage") ? `<div class="row-actions">
            <button class="btn small" data-edit="${s.year}">ویرایش</button>
            ${s.is_confirmed ? "" : `<button class="btn small primary" data-confirm="${s.year}">تأیید</button>`}</div>` : ""}</td>
        </tr>`).join("") : `<tr><td colspan="9" class="empty">هنوز عددی ثبت نشده است.</td></tr>`}</tbody>
      </table></div>
      <div class="filters" style="margin-top:12px">
        ${can("payroll.manage") ? `<button id="ps-new" class="btn primary">ثبت اعداد یک سال تازه</button>` : ""}
        <button id="ps-export" class="btn">خروجی اکسل اعداد قانونی</button>
      </div>
    </div>`;
  const nb = $("#ps-new");
  if (nb) nb.addEventListener("click", () => settingsModal(j.jy));
  $("#ps-export").addEventListener("click", () => downloadXlsx("/export/tax-brackets.xlsx", "اعداد-قانونی-حقوق.xlsx"));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const s = pay.settings.find((x) => String(x.year) === b.dataset.edit);
    settingsModal(Number(b.dataset.edit), s);
  }));
  body.querySelectorAll("[data-confirm]").forEach((b) => b.addEventListener("click", async () => {
    const note = prompt("منبع یا توضیح تأیید (اختیاری):", "طبق بخشنامه‌ی سال جاری") || "";
    try {
      const r = await api(`/payroll/settings/${b.dataset.confirm}/confirm`, { method: "POST", body: { note } });
      toast(r.message, "ok"); await loadPay(true); go("payroll", { tab: "settings" });
    } catch (err) { toast(err.message, "bad"); }
  }));
}

function settingsModal(year, s) {
  const brackets = (s && s.brackets && s.brackets.length) ? s.brackets : [{ up_to: 0, rate_bp: 0 }];
  const modal = openModal(`
    <h3>اعداد قانونی سال ${faDigits(year)}</h3>
    <div class="grid cols-3">
      <label>بیمه سهم کارمند (٪) <input id="st-emp" class="num" value="${s ? faDigits(s.insurance_employee_percent) : faDigits(7)}"></label>
      <label>بیمه سهم کارفرما (٪ از جمله بیمه بیکاری) <input id="st-er" class="num" value="${s ? faDigits(s.insurance_employer_percent) : faDigits(23)}"></label>
      <label>از آن، بیمه بیکاری (٪) <input id="st-un" class="num" value="${s ? faDigits(s.unemployment_percent) : faDigits(3)}"></label>
      <label>ساعات موظفی ماه <input id="st-hours" class="num" value="${s ? faDigits(s.standard_monthly_hours) : faDigits(220)}"></label>
      <label>ضریب اضافه‌کاری <input id="st-coef" class="num" value="${s ? faDigits(s.overtime_coefficient) : faDigits(1.4)}"></label>
      <label>منبع اعداد <input id="st-src" value="${s ? esc(s.source_note || "") : ""}" placeholder="مثلاً بخشنامه‌ی سازمان امور مالیاتی"></label>
    </div>
    <h4 style="margin:14px 0 6px">پله‌های مالیات (ماهانه، به ریال — «تا مبلغ» خالی یعنی بالاتر از همه)</h4>
    <div class="table-wrap" style="max-height:34vh"><table>
      <thead><tr><th>تا مبلغ (ریال)</th><th>نرخ مالیات (٪)</th><th></th></tr></thead>
      <tbody id="st-rows">${brackets.map((b) => bracketRow(b.up_to ? b.up_to : "", b.rate_bp / 100)).join("")}</tbody>
    </table></div>
    <div class="filters" style="margin-top:8px"><button id="st-add" class="btn small">افزودن پله</button></div>
    <p class="small muted">مثلاً پله‌ی اول: «تا ۲۴۰,۰۰۰,۰۰۰ ریال با نرخ ۰٪» یعنی حقوق تا ۲۴۰ میلیون ریال مالیات ندارد.
      اگر برای امسال عددی ثبت نکنید، برنامه با اعداد سال قبل حساب می‌کند و هشدار می‌دهد.</p>
    <div class="modal-actions">
      <button id="st-save" class="btn primary">ذخیره‌ی اعداد</button>
      <button id="st-close" class="btn">بستن</button></div>`);
  $("#st-close", modal).addEventListener("click", closeModal);
  $("#st-add", modal).addEventListener("click", () => {
    $("#st-rows", modal).insertAdjacentHTML("beforeend", bracketRow("", 0));
    bindBracketRemove(modal);
  });
  bindBracketRemove(modal);
  $("#st-save", modal).addEventListener("click", async () => {
    try {
      const rows = [...modal.querySelectorAll(".br-row")].map((r) => ({
        up_to: parseMoney($(".br-up", r).value) || null,
        rate_percent: Number(numToLatin($(".br-rate", r).value)) || 0 })).filter((b) => b.rate_percent >= 0);
      if (!rows.length) throw new Error("حداقل یک پله‌ی مالیات بنویسید.");
      await api("/payroll/settings", { method: "POST", body: {
        year, employee_percent: Number(numToLatin($("#st-emp", modal).value)) || 0,
        employer_percent: Number(numToLatin($("#st-er", modal).value)) || 0,
        unemployment_percent: Number(numToLatin($("#st-un", modal).value)) || 0,
        standard_monthly_hours: Number(numToLatin($("#st-hours", modal).value)) || 220,
        overtime_coefficient: Number(numToLatin($("#st-coef", modal).value)) || 1.4,
        source_note: $("#st-src", modal).value, brackets: rows } });
      toast("اعداد ذخیره شد. یادتان نرود تأییدش کنید.", "ok");
      closeModal(); await loadPay(true); go("payroll", { tab: "settings" });
    } catch (err) { toast(err.message, "bad"); }
  });
}

function bracketRow(upTo, rate) {
  return `<tr class="br-row">
    <td><input class="num br-up" value="${upTo ? fmt(upTo) : ""}" placeholder="بی‌نهایت"></td>
    <td><input class="num br-rate" value="${faDigits(rate)}" size="6"></td>
    <td><button class="btn small danger br-del">حذف</button></td></tr>`;
}

function bindBracketRemove(modal) {
  modal.querySelectorAll(".br-del").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => b.closest("tr").remove());
  });
}

/* ==================================================================
   فاز ۴ — دارایی‌های ثابت
   ================================================================== */
const ASSET_STATUS = {
  active: ["در جریان", "posted"], sold: ["فروخته‌شده", "closed"],
  retired: ["کنارگذاشته", "reversed"],
};
const ACCOUNT_KINDS = ["cash", "bank"];

views.assets = async (view, params) => {
  const status = params.status || "active";
  const q = params.q || "";
  const d = await api(`/assets?status=${status}&q=${encodeURIComponent(q)}`);
  const s = d.summary;
  const cats = (await api("/assets/categories")).rows;
  const runs = (await api("/depreciation/runs")).rows;
  const jy = todayJalali().slice(0, 4);
  const jm = Number(todayJalali().slice(5, 7));

  view.innerHTML = `
    <div class="grid cols-4">
      <div class="card kpi"><span class="label">دارایی‌های در جریان</span>
        <span class="value">${faDigits(s.count)}</span>
        <span class="small muted">تعداد کارت‌های فعال</span></div>
      <div class="card kpi gold"><span class="label">بهای تمام‌شده</span>
        <span class="value num">${money(s.cost)}</span></div>
      <div class="card kpi info"><span class="label">استهلاک انباشته تا امروز</span>
        <span class="value num">${money(s.accumulated)}</span></div>
      <div class="card kpi"><span class="label">ارزش دفتری</span>
        <span class="value num">${money(s.book_value)}</span>
        <span class="small muted">بها منهای استهلاک</span></div>
    </div>

    <div class="card">
      <h3>فهرست دارایی‌ها</h3>
      <div class="filters">
        <label>وضعیت
          <select id="a-status">
            <option value="active"${status === "active" ? " selected" : ""}>در جریان</option>
            <option value="sold"${status === "sold" ? " selected" : ""}>فروخته‌شده</option>
            <option value="retired"${status === "retired" ? " selected" : ""}>کنارگذاشته</option>
            <option value="all"${status === "all" ? " selected" : ""}>همه</option>
          </select></label>
        <label>جست‌وجو <input id="a-q" value="${esc(q)}" placeholder="نام یا کد دارایی"></label>
        <button id="a-go" class="btn">نمایش</button>
        ${can("assets.manage") ? `<button id="a-new" class="btn primary">دارایی جدید</button>` : ""}
        ${can("assets.manage") ? `<button id="a-cats" class="btn">گروه‌ها و نرخ‌ها</button>` : ""}
        <button id="a-x" class="btn">خروجی اکسل</button>
      </div>
      ${d.rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>کد</th><th>عنوان</th><th>گروه</th><th>به‌کارگیری</th>
          <th>بهای تمام‌شده</th><th>استهلاک انباشته</th><th>ارزش دفتری</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${d.rows.map((r) => {
          const st = ASSET_STATUS[r.status] || ["—", "closed"];
          return `<tr>
            <td class="num">${esc(r.code)}</td>
            <td>${esc(r.title)}</td>
            <td><span class="pill">${esc(r.category)}</span></td>
            <td class="num">${faDigits(r.in_service_date)}</td>
            <td class="num">${fmt(r.cost)}</td>
            <td class="num">${fmt(r.accumulated)}</td>
            <td class="num"><strong>${fmt(r.book_value)}</strong></td>
            <td><span class="badge ${st[1]}">${st[0]}</span></td>
            <td><div class="row-actions">
              <button class="btn small" data-card="${r.id}">کارت</button>
              ${can("assets.manage") && r.status === "active" ? `
                <button class="btn small" data-dispose="${r.id}" data-title="${esc(r.title)}">فروش/کنارگذاری</button>` : ""}
            </div></td></tr>`;
        }).join("")}</tbody>
      </table></div>` : `<div class="empty">هنوز دارایی ثابتی ثبت نشده است.
        ${can("assets.manage") ? "با دکمه‌ی «دارایی جدید» شروع کنید." : ""}</div>`}
      <p class="small muted" style="margin-top:10px">
        استهلاک از ماه به‌کارگیری شروع می‌شود. نرخ و روش را گروه دارایی تعیین می‌کند و هر وقت لازم شد
        از دکمه‌ی «گروه‌ها و نرخ‌ها» قابل تغییر است — هیچ نرخی داخل برنامه قفل نشده.
      </p>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>استهلاک ماهانه</h3>
        <p class="small muted">اول حساب می‌شود، بعد سندش ثبت می‌شود. تا سند ثبت نشود، دفتر دست‌نمی‌خورد.</p>
        ${can("assets.manage") ? `
        <div class="filters" style="border:0;padding:0;margin-bottom:6px">
          <label>سال <input id="d-jy" class="num" value="${faDigits(jy)}" size="6"></label>
          <label>ماه
            <select id="d-jm">${[1,2,3,4,5,6,7,8,9,10,11,12].map((m) =>
              `<option value="${m}"${m === jm ? " selected" : ""}>${MONTH_NAMES[m - 1]}</option>`).join("")}</select></label>
          <button id="d-calc" class="btn primary">حساب کن</button>
        </div>
        <div id="d-result"></div>` : `<p class="small muted">فقط حسابدار می‌تواند استهلاک حساب و ثبت کند.</p>`}
      </div>

      <div class="card">
        <h3>سندهای استهلاک</h3>
        ${runs.length ? `<div class="table-wrap"><table>
          <thead><tr><th>شماره</th><th>دوره</th><th>تعداد</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>${runs.map((r) => `<tr>
            <td class="num">${esc(r.number || "—")}</td><td>${esc(r.period)}</td>
            <td class="num">${faDigits(r.assets)}</td><td class="num">${fmt(r.total)}</td>
            <td><span class="badge ${r.status === "posted" ? "posted" : r.status === "draft" ? "draft" : "reversed"}">
              ${r.status === "posted" ? "ثبت‌شده" : r.status === "draft" ? "پیش‌نویس" : "ابطال‌شده"}</span></td>
            <td><div class="row-actions">
              <button class="btn small" data-run="${r.id}">جزئیات</button>
              ${can("assets.manage") && r.status === "posted"
                ? `<button class="btn small danger" data-run-cancel="${r.id}">ابطال</button>` : ""}
            </div></td></tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty">هنوز سند استهلاکی ثبت نشده است.</div>`}
      </div>
    </div>`;

  $("#a-go").addEventListener("click", () => go("assets", { status: $("#a-status").value, q: $("#a-q").value }));
  $("#a-q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#a-go").click(); });
  const x = $("#a-x"); if (x) x.addEventListener("click", () => downloadXlsx("/export/assets.xlsx", "دارایی-های-ثابت.xlsx"));
  const nb = $("#a-new"); if (nb) nb.addEventListener("click", () => assetModal(cats));
  const cb = $("#a-cats"); if (cb) cb.addEventListener("click", () => categoriesModal(cats));
  const db = $("#a-dispose-help");

  view.querySelectorAll("[data-card]").forEach((b) => b.addEventListener("click", () => assetCard(Number(b.dataset.card))));
  view.querySelectorAll("[data-dispose]").forEach((b) => b.addEventListener("click", () =>
    disposeModal(Number(b.dataset.dispose), b.dataset.title)));
  view.querySelectorAll("[data-run]").forEach((b) => b.addEventListener("click", () => runModal(Number(b.dataset.run))));
  view.querySelectorAll("[data-run-cancel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("سند استهلاک ابطال شود؟ استهلاک انباشته‌ی دارایی‌ها هم برمی‌گردد.")) return;
    try {
      await api(`/depreciation/runs/${b.dataset.runCancel}/cancel`, { method: "POST", body: { reason: "ابطال از روی صفحه‌ی دارایی‌ها" } });
      toast("ابطال شد و استهلاک انباشته برگشت.", "ok");
      go("assets", { status, q });
    } catch (err) { toast(err.message, "bad"); }
  }));

  const calc = $("#d-calc");
  if (calc) calc.addEventListener("click", async () => {
    const body = { jy: Number(numToLatin($("#d-jy").value)), jm: Number($("#d-jm").value) };
    $("#d-result").innerHTML = `<div class="loading-card"><span class="spinner"></span> در حال حساب کردن…</div>`;
    try {
      const run = await api("/depreciation/runs", { method: "POST", body });
      $("#d-result").innerHTML = `
        <div class="note">برای ${esc(run.period)} استهلاک <strong class="num">${money(run.total)}</strong>
          حساب شد (${faDigits(run.rows.length)} دارایی). سندش هنوز ثبت نشده.</div>
        <div class="table-wrap" style="margin:10px 0"><table>
          <thead><tr><th>دارایی</th><th>استهلاک این ماه</th><th>ارزش دفتری بعد از آن</th></tr></thead>
          <tbody>${run.rows.map((r) => `<tr><td>${esc(r.code)} — ${esc(r.title)}</td>
            <td class="num">${fmt(r.amount)}</td><td class="num">${fmt(r.book_value_after)}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="modal-actions" style="border:0;padding:0;margin:0">
          <button id="d-post" class="btn primary">ثبت سند استهلاک</button>
          <button id="d-x" class="btn">خروجی اکسل</button>
        </div>`;
      $("#d-post").addEventListener("click", async () => {
        try {
          const res = await api(`/depreciation/runs/${run.id}/post`, { method: "POST" });
          toast(res.message, "ok");
          go("assets", { status, q });
        } catch (err) { toast(err.message, "bad"); }
      });
      $("#d-x").addEventListener("click", () => downloadXlsx(`/export/depreciation.xlsx?run_id=${run.id}`, `استهلاک-${run.period}.xlsx`));
    } catch (err) {
      $("#d-result").innerHTML = `<div class="note warn">${esc(err.message)}</div>`;
    }
  });
};

function assetModal(cats) {
  const cashAccounts = state.accounts.filter((a) => a.kind === "ledger" &&
    ["cash", "bank"].includes(a.report_group));
  const otherAccounts = state.accounts.filter((a) => a.kind === "ledger" &&
    !["cash", "bank"].includes(a.report_group));
  const modal = openModal(`
    <h3>دارایی ثابت جدید</h3>
    <div class="grid cols-2">
      <label>عنوان دارایی <input id="as-title" placeholder="مثلاً رایانه‌ی دفتر فروش"></label>
      <label>گروه دارایی
        <select id="as-cat">${cats.map((c) => `<option value="${c.id}">${esc(c.title)} — ${esc(c.method_label)}</option>`).join("")}</select></label>
      <label>تاریخ خرید <input id="as-buy" value="${todayJalali()}"></label>
      <label>تاریخ به‌کارگیری <input id="as-serve" value="${todayJalali()}"></label>
      <label>بهای تمام‌شده (ریال) <input id="as-cost" class="num" placeholder="۱۲۰ میلیون"></label>
      <label>ارزش اسقاط (ریال) <input id="as-salvage" class="num" value="۰"></label>
      <label>عمر مفید (ماه، اختیاری) <input id="as-life" class="num" placeholder="از گروه دارایی"></label>
      <label>حساب مقابل (پرداخت یا ثبت)
        <select id="as-counter">
          <option value="">—— بدون سند (فقط ثبت کارت) ——</option>
          <optgroup label="صندوق و بانک">
            ${cashAccounts.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}
          </optgroup>
          <optgroup label="سرمایه، بدهی و بقیه">
            ${otherAccounts.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}
          </optgroup>
        </select></label>
      <label>یادداشت <input id="as-note" placeholder="مثلاً با فاکتور شماره…"></label>
    </div>
    <div class="note" style="margin-top:12px">با انتخاب «حساب مقابل»، سند خرید همان لحظه ثبت می‌شود:
      دارایی بدهکار و آن حساب بستانکار.</div>
    <div class="modal-actions">
      <button id="as-save" class="btn primary">ثبت دارایی</button>
      <button id="as-cancel" class="btn">بستن</button>
    </div>`);
  $("#as-cancel", modal).addEventListener("click", closeModal);
  $("#as-save", modal).addEventListener("click", async () => {
    try {
      const body = {
        title: $("#as-title", modal).value.trim(),
        category_id: Number($("#as-cat", modal).value),
        purchase_date: $("#as-buy", modal).value,
        in_service_date: $("#as-serve", modal).value,
        cost: parseMoney($("#as-cost", modal).value),
        salvage: parseMoney($("#as-salvage", modal).value),
        useful_life_months: Number(numToLatin($("#as-life", modal).value)) || null,
        note: $("#as-note", modal).value,
        counter_account_id: Number($("#as-counter", modal).value) || null,
      };
      if (!body.title) throw new Error("عنوان دارایی را بنویسید.");
      if (!body.cost) throw new Error("بهای تمام‌شده را بنویسید.");
      const res = await api("/assets", { method: "POST", body });
      closeModal();
      toast(res.message, "ok");
      go("assets");
    } catch (err) { toast(err.message, "bad"); }
  });
}

async function assetCard(id) {
  const d = await api(`/assets/${id}`);
  const a = d.asset;
  const st = ASSET_STATUS[a.status] || ["—", "closed"];
  const modal = openModal(`
    <h3>کارت دارایی ${esc(a.code)} <span class="badge ${st[1]}">${st[0]}</span></h3>
    <div class="grid cols-3">
      <div class="kpi"><span class="label">عنوان</span><span class="value" style="font-size:16px">${esc(a.title)}</span></div>
      <div class="kpi"><span class="label">گروه</span><span class="value" style="font-size:16px">${esc(a.category)}</span>
        <span class="small muted">${esc(a.method_label)} • نرخ ${faDigits(a.annual_rate_percent)}٪ • عمر ${faDigits(a.useful_life_months)} ماه</span></div>
      <div class="kpi"><span class="label">تاریخ‌ها</span>
        <span class="value" style="font-size:15px">خرید ${faDigits(a.purchase_date)}</span>
        <span class="small muted">به‌کارگیری ${faDigits(a.in_service_date)}</span></div>
      <div class="kpi"><span class="label">بهای تمام‌شده</span><span class="value num">${money(a.cost)}</span></div>
      <div class="kpi"><span class="label">استهلاک انباشته</span><span class="value num">${money(a.accumulated)}</span></div>
      <div class="kpi"><span class="label">ارزش دفتری</span><span class="value num">${money(a.book_value)}</span></div>
    </div>
    ${a.status !== "active" ? `<div class="note warn" style="margin-top:12px">
      ${st[0]} در تاریخ ${faDigits(a.disposal_date)}${a.disposal_amount ? " با مبلغ " + money(a.disposal_amount) : ""}.</div>` : ""}
    <h4 style="margin-top:16px">استهلاک ماه‌های گذشته</h4>
    ${d.history.length ? `<div class="table-wrap"><table>
      <thead><tr><th>دوره</th><th>مبلغ</th><th>سند</th><th>وضعیت</th></tr></thead>
      <tbody>${d.history.map((h) => `<tr><td>${esc(h.period)}</td><td class="num">${fmt(h.amount)}</td>
        <td class="num">${esc(h.run || "—")}</td>
        <td><span class="badge ${h.status === "posted" ? "posted" : "draft"}">${h.status === "posted" ? "ثبت‌شده" : "پیش‌نویس"}</span></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">برای این دارایی هنوز استهلاکی ثبت نشده است.</div>`}
    <h4 style="margin-top:16px">پیش‌بینی استهلاک ماه‌های آینده</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>دوره</th><th>استهلاک ماه</th><th>استهلاک انباشته</th><th>ارزش دفتری</th></tr></thead>
      <tbody>${d.schedule.map((r) => `<tr><td>${esc(r.period)}</td><td class="num">${fmt(r.amount)}</td>
        <td class="num">${fmt(r.accumulated)}</td><td class="num">${fmt(r.book_value)}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="modal-actions"><button id="ac-close" class="btn">بستن</button></div>`);
  $("#ac-close", modal).addEventListener("click", closeModal);
}

function disposeModal(id, title) {
  const cashAccounts = state.accounts.filter((a) => a.kind === "ledger" && ["cash", "bank"].includes(a.report_group));
  const modal = openModal(`
    <h3>فروش یا کنارگذاری «${esc(title)}»</h3>
    <div class="grid cols-2">
      <label>تاریخ <input id="dp-date" value="${todayJalali()}"></label>
      <label>مبلغ فروش (ریال) <input id="dp-amount" class="num" value="۰"></label>
      <label>پول به کجا رفت
        <select id="dp-account">${cashAccounts.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select></label>
      <label>علت <input id="dp-reason" placeholder="مثلاً فروش به کارمند"></label>
    </div>
    <div class="note" style="margin-top:12px">دارایی از دفاتر خارج می‌شود، استهلاک انباشته بسته می‌شود و
      سود یا زیان فروش خودکار حساب و در سند می‌نشیند. اگر مبلغ را صفر بگذارید، یعنی کنارگذاری بدون فروش.</div>
    <div class="modal-actions">
      <button id="dp-go" class="btn primary">ثبت</button>
      <button id="dp-cancel" class="btn">بستن</button>
    </div>`);
  $("#dp-cancel", modal).addEventListener("click", closeModal);
  $("#dp-go", modal).addEventListener("click", async () => {
    try {
      const amount = parseMoney($("#dp-amount", modal).value);
      const res = await api(`/assets/${id}/dispose`, { method: "POST", body: {
        date: $("#dp-date", modal).value, amount,
        account_id: amount ? Number($("#dp-account", modal).value) : null,
        reason: $("#dp-reason", modal).value } });
      closeModal();
      toast(res.message, "ok");
      go("assets");
    } catch (err) { toast(err.message, "bad"); }
  });
}

function categoriesModal(cats) {
  const ledger = state.accounts.filter((a) => a.kind === "ledger");
  const modal = openModal(`
    <h3>گروه‌های دارایی و نرخ استهلاک</h3>
    <p class="small muted">نرخ‌های پیش‌فرض راه‌اندازی است و «تأییدنشده»؛ وقتی حسابدار تأیید کرد،
      همین‌جا می‌تواند عوض کند. نرخ داخل کد برنامه قفل نیست.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>گروه</th><th>روش</th><th>نرخ سالانه ٪</th><th>عمر (ماه)</th><th>حساب دارایی</th><th>حساب استهلاک</th><th></th></tr></thead>
      <tbody>${cats.map((c) => `<tr data-cat="${c.id}">
        <td>${esc(c.code)} — ${esc(c.title)}</td>
        <td><select class="c-method">
          <option value="declining"${c.method === "declining" ? " selected" : ""}>نزولی (روی مانده)</option>
          <option value="straight"${c.method === "straight" ? " selected" : ""}>مستقیم (خط راست)</option>
        </select></td>
        <td><input class="num c-rate" value="${faDigits(c.annual_rate_percent)}" size="6"></td>
        <td><input class="num c-life" value="${faDigits(c.useful_life_months)}" size="6"></td>
        <td class="small">${esc(c.asset_account || "")}</td>
        <td class="small">${esc(c.accumulation_account || "")}</td>
        <td><button class="btn small primary c-save">ذخیره</button></td></tr>`).join("")}</tbody>
    </table></div>
    <h4 style="margin-top:16px">گروه تازه</h4>
    <div class="grid cols-3">
      <label>عنوان <input id="c-title" placeholder="مثلاً تجهیزات دفتری"></label>
      <label>روش <select id="c-method"><option value="declining">نزولی</option><option value="straight">مستقیم</option></select></label>
      <label>نرخ سالانه ٪ <input id="c-rate" class="num" value="۱۰"></label>
      <label>عمر (ماه) <input id="c-life" class="num" value="۶۰"></label>
      <label>حساب دارایی <select id="c-asset">${ledger.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select></label>
      <label>حساب استهلاک انباشته <select id="c-accum">${ledger.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select></label>
      <label>حساب هزینه استهلاک <select id="c-exp">${ledger.map((a) => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select></label>
    </div>
    <div class="note" style="margin-top:12px">برای حساب دارایی و استهلاک انباشته، حساب‌های
      «۱۱۰۹۰۱ تا ۱۱۰۹۰۳» و «۱۱۱۰۰۱ تا ۱۱۱۰۰۳» کدینگ هستند. حساب هزینه‌ی استهلاک هم معمولاً
      «۵۱۰۷ — هزینه استهلاک» است.</div>
    <div class="modal-actions">
      <button id="c-add" class="btn primary">افزودن گروه</button>
      <button id="c-close" class="btn">بستن</button>
    </div>`);
  $("#c-close", modal).addEventListener("click", closeModal);
  modal.querySelectorAll(".c-save").forEach((b) => b.addEventListener("click", async () => {
    const row = b.closest("tr");
    try {
      await api(`/assets/categories/${row.dataset.cat}`, { method: "PATCH", body: {
        method: $(".c-method", row).value,
        annual_rate_percent: Number(numToLatin($(".c-rate", row).value)) || 0,
        useful_life_months: Number(numToLatin($(".c-life", row).value)) || 0 } });
      toast("نرخ ذخیره شد. دارایی‌های تازه از این نرخ استفاده می‌کنند.", "ok");
    } catch (err) { toast(err.message, "bad"); }
  }));
  $("#c-add", modal).addEventListener("click", async () => {
    try {
      await api("/assets/categories", { method: "POST", body: {
        title: $("#c-title", modal).value.trim(), method: $("#c-method", modal).value,
        annual_rate_percent: Number(numToLatin($("#c-rate", modal).value)) || 0,
        useful_life_months: Number(numToLatin($("#c-life", modal).value)) || 0,
        asset_account_id: Number($("#c-asset", modal).value),
        accumulation_account_id: Number($("#c-accum", modal).value),
        expense_account_id: Number($("#c-exp", modal).value) } });
      closeModal(); toast("گروه تازه ساخته شد.", "ok"); go("assets");
    } catch (err) { toast(err.message, "bad"); }
  });
}

async function runModal(id) {
  const d = await api(`/depreciation/runs/${id}`);
  const modal = openModal(`
    <h3>سند استهلاک ${esc(d.number || "—")} — ${esc(d.period)}</h3>
    <p class="small muted">وضعیت: ${d.status === "posted" ? "ثبت‌شده در دفتر" : d.status === "draft" ? "پیش‌نویس" : "ابطال‌شده"} •
      جمع: <strong class="num">${money(d.total)}</strong></p>
    <div class="table-wrap"><table>
      <thead><tr><th>کد</th><th>دارایی</th><th>استهلاک این ماه</th><th>استهلاک انباشته</th><th>ارزش دفتری</th></tr></thead>
      <tbody>${d.rows.map((r) => `<tr><td class="num">${esc(r.code)}</td><td>${esc(r.title)}</td>
        <td class="num">${fmt(r.amount)}</td><td class="num">${fmt(r.accumulated_after)}</td>
        <td class="num">${fmt(r.book_value_after)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">جمع</td><td class="num">${fmt(d.total)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <div class="modal-actions">
      <button id="r-x" class="btn">خروجی اکسل</button>
      <button id="r-close" class="btn">بستن</button>
    </div>`);
  $("#r-x", modal).addEventListener("click", () => downloadXlsx(`/export/depreciation.xlsx?run_id=${id}`, "استهلاک.xlsx"));
  $("#r-close", modal).addEventListener("click", closeModal);
}

/* ==================================================================
   فاز ۴ — صورت‌های مالی
   ================================================================== */
const MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

views.statements = async (view, params) => {
  const tab = params.tab || "income";
  const fyStart = (todayJalali().slice(0, 4)) + "/01/01";
  const from = params.from || fyStart;
  const to = params.to || todayJalali();
  const qs = `frm=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const tabs = [["income", "سود و زیان"], ["balance", "ترازنامه"], ["cash", "جریان نقدی"]];
  const bar = `
    <div class="card">
      <div class="filters" style="margin-bottom:0">
        ${tabs.map((t) => `<button class="btn ${tab === t[0] ? "primary" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}
        <span style="flex:1"></span>
        ${tab !== "balance" ? `<label>از تاریخ <input id="s-from" value="${esc(from)}" size="12"></label>` : ""}
        <label>تا تاریخ <input id="s-to" value="${esc(to)}" size="12"></label>
        <button id="s-go" class="btn">نمایش</button>
        <button id="s-print" class="btn">چاپ</button>
      </div>
    </div>`;

  let body = "";
  if (tab === "income") {
    const d = await api(`/reports/income-statement?${qs}`);
    body = `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">جمع درآمدها</span><span class="value num">${money(d.total_revenue)}</span></div>
        <div class="card kpi gold"><span class="label">جمع هزینه‌ها</span><span class="value num">${money(d.total_expense)}</span></div>
        <div class="card kpi ${d.profit >= 0 ? "" : "danger"}"><span class="label">${d.is_profit ? "سود" : "زیان"} بازه</span>
          <span class="value num ${d.profit >= 0 ? "pos" : "neg"}">${money(Math.abs(d.profit))}</span></div>
        <div class="card kpi info"><span class="label">حاشیه‌ی سود</span>
          <span class="value num">${faDigits(d.profit_margin_percent)}٪</span>
          <span class="small muted">سود به نسبت درآمد</span></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>درآمدها</h3>
          ${d.revenue_rows.length ? `<div class="table-wrap"><table>
            <thead><tr><th>حساب</th><th>مبلغ</th></tr></thead>
            <tbody>${d.revenue_rows.map((r) => `<tr><td>${esc(r.code)} — ${esc(r.name)}</td>
              <td class="num">${fmt(r.amount)}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>جمع درآمدها</td><td class="num">${fmt(d.total_revenue)}</td></tr></tfoot>
          </table></div>` : `<div class="empty">در این بازه درآمدی ثبت نشده است.</div>`}
        </div>
        <div class="card"><h3>هزینه‌ها</h3>
          ${d.expense_rows.length ? `<div class="table-wrap"><table>
            <thead><tr><th>حساب</th><th>مبلغ</th></tr></thead>
            <tbody>${d.expense_rows.map((r) => `<tr><td>${esc(r.code)} — ${esc(r.name)}</td>
              <td class="num">${fmt(r.amount)}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>جمع هزینه‌ها</td><td class="num">${fmt(d.total_expense)}</td></tr></tfoot>
          </table></div>` : `<div class="empty">در این بازه هزینه‌ای ثبت نشده است.</div>`}
        </div>
      </div>
      <div class="card">
        <h3>نتیجه‌ی بازه — ${faDigits(d.from)} تا ${faDigits(d.to)}</h3>
        <div class="totals" style="font-size:16px">
          <span>درآمد: <strong class="num">${fmt(d.total_revenue)}</strong></span>
          <span>هزینه: <strong class="num">${fmt(d.total_expense)}</strong></span>
          <span class="${d.is_profit ? "ok" : "bad"}">${d.is_profit ? "سود" : "زیان"}:
            <strong class="num">${fmt(Math.abs(d.profit))}</strong> ریال</span>
        </div>
        <div class="modal-actions" style="border:0;padding:0;margin-top:12px">
          <button id="s-x" class="btn">خروجی اکسل</button>
        </div>
      </div>`;
    setTimeout(() => { const b = $("#s-x"); if (b) b.addEventListener("click", () =>
      downloadXlsx(`/export/income-statement.xlsx?${qs}`, "صورت-سود-و-زیان.xlsx")); }, 0);
  } else if (tab === "balance") {
    const d = await api(`/reports/balance-sheet?to=${encodeURIComponent(to)}`);
    const rows = (list) => list.length ? list.map((r) => `<tr><td>${esc(r.code)} — ${esc(r.name)}</td>
      <td class="num">${fmt(r.amount)}</td></tr>`).join("") : `<tr><td colspan="2" class="muted">—</td></tr>`;
    body = `
      <div class="grid cols-3">
        <div class="card kpi"><span class="label">جمع دارایی‌ها</span><span class="value num">${money(d.total_assets)}</span></div>
        <div class="card kpi gold"><span class="label">جمع بدهی‌ها</span><span class="value num">${money(d.total_liabilities)}</span></div>
        <div class="card kpi info"><span class="label">حقوق مالکانه</span><span class="value num">${money(d.total_equity)}</span></div>
      </div>
      <div class="card">
        <h3>ترازنامه — تا ${faDigits(d.to)}</h3>
        ${d.balanced
          ? `<div class="note">تراز است: جمع دارایی‌ها دقیقاً برابر بدهی‌ها + حقوق مالکانه است
              (<strong class="num">${money(d.total_assets)}</strong>).</div>`
          : `<div class="note bad">ناتراز! اختلاف <strong class="num">${money(Math.abs(d.difference))}</strong> ریال.
              این حالت نباید پیش بیاید؛ لطفاً به حسابدار خبر بدهید.</div>`}
        <div class="grid cols-2" style="margin-top:14px">
          <div>
            <h4>دارایی‌ها</h4>
            <div class="table-wrap"><table>
              <thead><tr><th>حساب</th><th>مبلغ</th></tr></thead>
              <tbody>${rows(d.assets)}</tbody>
              <tfoot><tr><td>جمع دارایی‌ها</td><td class="num">${fmt(d.total_assets)}</td></tr></tfoot>
            </table></div>
          </div>
          <div>
            <h4>بدهی‌ها</h4>
            <div class="table-wrap"><table>
              <thead><tr><th>حساب</th><th>مبلغ</th></tr></thead>
              <tbody>${rows(d.liabilities)}</tbody>
              <tfoot><tr><td>جمع بدهی‌ها</td><td class="num">${fmt(d.total_liabilities)}</td></tr></tfoot>
            </table></div>
            <h4 style="margin-top:14px">حقوق مالکانه</h4>
            <div class="table-wrap"><table>
              <thead><tr><th>حساب</th><th>مبلغ</th></tr></thead>
              <tbody>${rows(d.equity)}</tbody>
              <tfoot><tr><td>جمع حقوق مالکانه</td><td class="num">${fmt(d.total_equity)}</td></tr>
                <tr><td>جمع بدهی‌ها و حقوق مالکانه</td>
                  <td class="num">${fmt(d.total_liabilities + d.total_equity)}</td></tr></tfoot>
            </table></div>
          </div>
        </div>
        ${d.open_profit ? `<p class="small muted" style="margin-top:10px">
          سود (زیان) سال بسته‌نشده — <strong class="num">${fmt(d.open_profit)}</strong> ریال — در حقوق مالکانه آمده
          تا دو طرف ترازنامه برابر بماند. با بستن سال، این عدد به «سود و زیان انباشته» منتقل می‌شود.</p>` : ""}
        <div class="modal-actions" style="border:0;padding:0;margin-top:12px">
          <button id="s-x" class="btn">خروجی اکسل</button>
        </div>
      </div>`;
    setTimeout(() => { const b = $("#s-x"); if (b) b.addEventListener("click", () =>
      downloadXlsx(`/export/balance-sheet.xlsx?to=${encodeURIComponent(to)}`, "ترازنامه.xlsx")); }, 0);
  } else {
    const d = await api(`/reports/cash-flow?${qs}`);
    const section = (title, key, total, hint) => `
      <div class="card"><h3>${title}</h3>
        <p class="small muted">${hint}</p>
        ${d[key].length ? `<div class="table-wrap"><table>
          <thead><tr><th>تاریخ</th><th>شرح</th><th>حساب مقابل</th><th>ورود</th><th>خروج</th></tr></thead>
          <tbody>${d[key].map((r) => `<tr><td class="num">${faDigits(r.date)}</td>
            <td>${esc(r.description)}<div class="small muted num">${esc(r.entry_no || "")}</div></td>
            <td>${esc(r.counter_account)}</td>
            <td class="num">${r.direction === "in" ? fmt(r.amount) : ""}</td>
            <td class="num">${r.direction === "out" ? fmt(r.amount) : ""}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="3">جمع ${title}</td><td colspan="2" class="num">${fmt(total)}</td></tr></tfoot>
        </table></div>` : `<div class="empty">در این سبد حرکتی نبوده است.</div>`}
      </div>`;
    body = `
      <div class="grid cols-3">
        <div class="card kpi"><span class="label">موجودی نقدی اول بازه</span><span class="value num">${money(d.opening_cash)}</span></div>
        <div class="card kpi ${d.net >= 0 ? "" : "danger"}"><span class="label">تغییر خالص در بازه</span>
          <span class="value num ${d.net >= 0 ? "pos" : "neg"}">${money(d.net)}</span></div>
        <div class="card kpi info"><span class="label">موجودی نقدی پایان بازه</span><span class="value num">${money(d.closing_cash)}</span></div>
      </div>
      <div class="card">
        ${d.matches_cash
          ? `<div class="note">مانده‌ی پایان بازه با مانده‌ی صندوق و بانک برنامه می‌خواند
              (<strong class="num">${money(d.closing_cash)}</strong>).</div>`
          : `<div class="note warn">جمع این صورت با مانده‌ی صندوق و بانک نمی‌خواند؛ لطفاً به حسابدار بگویید.</div>`}
        <p class="small muted" style="margin-top:8px">بازه: ${faDigits(d.from)} تا ${faDigits(d.to)} —
          انتقال پول بین صندوق و بانک‌های خودمان نه ورود است نه خروج؛ پس در این صورت مبلغ خالصش صفر است.</p>
      </div>
      ${section("جریان نقدی عملیاتی", "operating", d.total_operating, "پول روزمره‌ی آژانس: فروش بلیت و تور، هزینه‌ها و حقوق.")}
      ${section("جریان نقدی سرمایه‌گذاری", "investing", d.total_investing, "خرید و فروش دارایی‌های ثابت.")}
      ${section("جریان نقدی تأمین مالی", "financing", d.total_financing, "آورده‌ی مالک و برداشت‌ها.")}
      <div class="card"><div class="modal-actions" style="border:0;padding:0;margin:0">
        <button id="s-x" class="btn">خروجی اکسل</button>
      </div></div>`;
    setTimeout(() => { const b = $("#s-x"); if (b) b.addEventListener("click", () =>
      downloadXlsx(`/export/cash-flow.xlsx?${qs}`, "صورت-جریان-نقدی.xlsx")); }, 0);
  }

  view.innerHTML = bar + body;
  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    const f = $("#s-from"), t = $("#s-to");
    go("statements", { tab: b.dataset.tab, from: f ? f.value : from, to: t ? t.value : to });
  }));
  $("#s-go").addEventListener("click", () => {
    const f = $("#s-from");
    go("statements", { tab, from: f ? f.value : from, to: $("#s-to").value });
  });
  $("#s-print").addEventListener("click", () => window.print());
};

/* ==================================================================
   فاز ۴ — بستن سال مالی
   ================================================================== */
views.closing = async (view) => {
  const d = await api("/fiscal/years");
  const current = d.current;
  view.innerHTML = `
    <div class="card">
      <h3>سال‌های مالی</h3>
      <p class="small muted">سال مالی آژانس از ۱ فروردین تا ۲۹ اسفند است.
        با بستن سال، یک سند «اختتامیه» ثبت می‌شود: حساب‌های درآمد و هزینه‌ی آن سال صفر می‌شوند و
        سود (زیان) به حساب «سود و زیان انباشته» منتقل می‌شود. بعد از آن، سند جدید در آن سال ثبت نمی‌شود.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>سال</th><th>از</th><th>تا</th><th>وضعیت</th><th>سود (زیان)</th><th>تاریخ بستن</th><th>پیش‌نویس‌ها</th><th></th></tr></thead>
        <tbody>${d.rows.map((y) => `<tr>
          <td><strong>${faDigits(y.title)}</strong>${String(y.jy) === String(current) ? ' <span class="pill">سال جاری</span>' : ""}</td>
          <td class="num">${faDigits(y.start)}</td><td class="num">${faDigits(y.end)}</td>
          <td><span class="badge ${y.status === "closed" ? "closed" : "open"}">${y.status === "closed" ? "بسته" : "باز"}</span></td>
          <td class="num">${y.profit !== null ? fmt(y.profit) : "—"}</td>
          <td class="num">${esc(y.closed_at || "—")}</td>
          <td class="num">${y.draft_count ? `<span class="badge draft">${faDigits(y.draft_count)}</span>` : "—"}</td>
          <td><div class="row-actions">
            ${can("fiscal.manage") && y.status === "open"
              ? `<button class="btn small primary" data-close="${y.jy}">بستن سال</button>` : ""}
            ${can("fiscal.manage") && y.status === "closed"
              ? `<button class="btn small" data-reopen="${y.jy}">باز کردن سال</button>` : ""}
            <button class="btn small" data-view="${y.jy}">گزارش‌های سال</button>
          </div></td></tr>`).join("")}</tbody>
      </table></div>
      ${!can("fiscal.manage") ? `<p class="small muted" style="margin-top:10px">بستن و باز کردن سال فقط کار حسابدار است.</p>` : ""}
    </div>

    <div class="grid cols-2">
      <div class="card"><h3>قبل از بستن سال</h3>
        <ul style="margin:0;padding-inline-start:18px;font-size:14px">
          <li>همه‌ی پیش‌نویس‌های سال تعیین تکلیف شده باشند (ثبت نهایی یا حذف).</li>
          <li>استهلاک دارایی‌های ثابت تا اسفند همان سال ثبت شده باشد.</li>
          <li>حقوق اسفند ثبت و پرداخت شده باشد.</li>
          <li>مانده‌ی صندوق و بانک با صورت‌حساب‌ها خوانده شده باشد.</li>
        </ul></div>
      <div class="card"><h3>بعد از بستن سال</h3>
        <p class="small muted">سال قفل می‌شود؛ اگر بعداً سندی مربوط به آن سال پیدا شد، با دکمه‌ی
          «باز کردن سال» برمی‌گردید، سند را ثبت می‌کنید و دوباره سال را می‌بندید.</p>
        <div class="modal-actions" style="border:0;padding:0;margin:0">
          <button id="cl-st" class="btn">دیدن صورت‌های مالی</button>
        </div></div>
    </div>`;

  $("#cl-st").addEventListener("click", () => go("statements"));
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () =>
    go("statements", { tab: "income", from: `${b.dataset.view}/01/01`, to: `${b.dataset.view}/12/29` })));
  view.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeYearModal(Number(b.dataset.close))));
  view.querySelectorAll("[data-reopen]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`سال ${b.dataset.reopen} باز شود؟ سند اختتامیه ابطال می‌شود و می‌توانید سند تازه ثبت کنید.`)) return;
    try {
      const res = await api("/fiscal/reopen-year", { method: "POST", body: { jy: Number(b.dataset.reopen), note: "باز کردن سال از روی صفحه" } });
      toast(res.message, "ok");
      go("closing");
    } catch (err) { toast(err.message, "bad"); }
  }));
};

async function closeYearModal(jy) {
  let preview = null;
  try {
    preview = await api(`/reports/income-statement?frm=${jy}/01/01&to=${jy}/12/29`);
  } catch (err) { /* پیش‌نمایش اختیاری است */ }
  const modal = openModal(`
    <h3>بستن سال مالی ${faDigits(jy)}</h3>
    ${preview ? `<div class="totals" style="font-size:15px">
      <span>درآمد سال: <strong class="num">${fmt(preview.total_revenue)}</strong></span>
      <span>هزینه سال: <strong class="num">${fmt(preview.total_expense)}</strong></span>
      <span class="${preview.is_profit ? "ok" : "bad"}">${preview.is_profit ? "سود" : "زیان"}:
        <strong class="num">${fmt(Math.abs(preview.profit))}</strong> ریال</span></div>` : ""}
    <div class="note warn" style="margin-top:12px">با تأیید شما این کار انجام می‌شود:
      یک سند اختتامیه ثبت می‌شود، حساب‌های درآمد و هزینه‌ی ${faDigits(jy)} صفر می‌شوند،
      سود (زیان) به «سود و زیان انباشته» می‌رود و ثبت سند جدید در سال ${faDigits(jy)} قفل می‌شود.
      این کار قابل بازگشت است (باز کردن سال).</div>
    <label style="margin-top:12px">یادداشت برای ردّ کار (اختیاری)
      <input id="cy-note" placeholder="مثلاً بستن سال ۱۴۰۴ با تأیید کارفرما"></label>
    <div class="modal-actions">
      <button id="cy-go" class="btn primary">می‌خواهم ببندم</button>
      <button id="cy-cancel" class="btn">بی‌خیال</button>
    </div>`);
  $("#cy-cancel", modal).addEventListener("click", closeModal);
  $("#cy-go", modal).addEventListener("click", async () => {
    try {
      const res = await api("/fiscal/close-year", { method: "POST", body: { jy, note: $("#cy-note", modal).value } });
      closeModal();
      toast(res.message, "ok");
      go("closing");
    } catch (err) { toast(err.message, "bad"); }
  });
}

/* ==================================================================
   فاز ۵ — سامانه‌ی مودیان
   ================================================================== */
const MOADIAN_STATUS = {
  draft: ["ناقص — ایراد دارد", "draft"], ready: ["آماده‌ی ارسال", "open"],
  sent: ["ارسال‌شده — منتظر جواب", "posted"], accepted: ["پذیرفته‌شده", "posted"],
  rejected: ["مردود — باید اصلاح شود", "reversed"],
};

views.moadian = async (view, params) => {
  const tab = params.tab || "queue";
  const ov = await api("/moadian/overview");
  const s = ov.summary;
  const tabs = [["queue", "صف صورتحساب‌ها"], ["services", "شناسه‌ی کالا و خدمت"],
                ["settings", "اطلاعات مالیاتی ما"], ["vat", "گزارش ارزش افزوده"]];
  const bar = `
    <div class="card">
      <div class="filters" style="margin-bottom:0">
        ${tabs.map((t) => `<button class="btn ${tab === t[0] ? "primary" : ""}" data-mtab="${t[0]}">${t[1]}</button>`).join("")}
      </div>
    </div>`;

  let body = "";
  if (tab === "queue") {
    const status = params.status || "all";
    const q = await api(`/moadian/queue?status=${status}`);
    body = `
      <div class="grid cols-4">
        <div class="card kpi ${s.is_active ? "" : "gold"}"><span class="label">وضعیت ارسال واقعی</span>
          <span class="value" style="font-size:17px">${s.is_active ? "فعال" : "هنوز راه نیفتاده"}</span>
          <span class="small muted">${esc(ov.settings.motamed_name || ov.settings.send_method_label || "")}</span></div>
        <div class="card kpi"><span class="label">آماده‌ی ارسال</span>
          <span class="value num">${faDigits(s.counts.ready || 0)}</span>
          <span class="small muted num">${money(s.ready_total)}</span></div>
        <div class="card kpi info"><span class="label">پذیرفته‌شده</span>
          <span class="value num">${faDigits(s.counts.accepted || 0)}</span>
          <span class="small muted num">${money(s.accepted_total)}</span></div>
        <div class="card kpi ${s.counts.draft ? "danger" : ""}"><span class="label">ناقص (نیاز به اصلاح)</span>
          <span class="value num">${faDigits(s.counts.draft || 0)}</span></div>
      </div>

      ${!s.counts.draft && !s.counts.ready && !s.counts.sent && !s.counts.accepted ? `
      <div class="card">
        <h3>از کجا شروع کنم؟ (چهار قدم)</h3>
        <ol style="padding-inline-start:20px;line-height:2;margin:0">
          <li><strong>اطلاعات مالیاتی ما</strong> را پر کنید: شناسه‌ی یکتای حافظه‌ی مالیاتی (۲۲ نویسه)،
            شماره‌ی اقتصادی، نام و آدرس. اینها را از کارپوشه‌ی مالیاتی خودتان بردارید.</li>
          <li>در تبِ <strong>شناسه‌ی کالا و خدمت</strong>، برای هر نوع خدمتی که می‌فروشید
            (تور، بلیت، ویزا، اقامت…) شناسه‌ی ۱۳ رقمی را از سازمان مالیاتی بگیرید و وارد و تأیید کنید.</li>
          <li>در صفحه‌ی <strong>مشتری‌ها</strong>، اطلاعات مالیاتی مشتری‌ها (کد ملی/شناسه‌ی ملی) را وارد کنید؛
            بدون آن، صورتحساب «نوع دوم» می‌شود و مشتری اعتبار مالیاتی نمی‌گیرد.</li>
          <li>دکمه‌ی <strong>ساخت صورتحساب از فاکتورها</strong> را بزنید؛ برنامه از فاکتورهای صادرشده
            صورتحساب الکترونیکی می‌سازد و اگر چیزی کم باشد، به زبان ساده می‌گوید کدام قلم کم است.</li>
        </ol>
        <p class="small muted" style="margin-bottom:0">هیچ‌کدام عجله ندارد؛ اول می‌توانید همین‌جا تمرین کنید
          و بعد ارسال واقعی را شروع کنید.</p>
      </div>` : ""}
      <div class="card">
        <h3>صورتحساب‌های الکترونیکی</h3>
        ${!s.is_active ? `<div class="note warn" style="margin-bottom:12px">
          ارسال واقعی برای آژانس فعال نشده است. تا وقتی در تبِ «اطلاعات مالیاتی ما» تیکِ
          «سامانه‌ی مودیان برای ما فعال است» را نزنید، صورتحساب‌ها فقط اینجا در صف می‌مانند
          و هیچ‌جا فرستاده نمی‌شوند.</div>` : ""}
        <div class="filters">
          <label>وضعیت
            <select id="m-status">
              <option value="all"${status === "all" ? " selected" : ""}>همه</option>
              ${Object.keys(MOADIAN_STATUS).map((k) => `<option value="${k}"${status === k ? " selected" : ""}>${MOADIAN_STATUS[k][0]}</option>`).join("")}
            </select></label>
          <label>از تاریخ <input id="m-from" value="${esc(params.frm || (todayJalali().slice(0, 4) + "/01/01"))}" size="12"></label>
          <label>تا تاریخ <input id="m-to" value="${esc(params.to || todayJalali())}" size="12"></label>
          <button id="m-go" class="btn">نمایش</button>
          ${can("moadian.manage") ? `<button id="m-build" class="btn primary">ساخت صورتحساب از فاکتورها</button>` : ""}
          <button id="m-file" class="btn">فایل دسته‌ای آماده‌ها</button>
          <button id="m-x" class="btn">گزارش اکسل ساختاریافته</button>
        </div>
        ${q.rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>سریال</th><th>فاکتور</th><th>تاریخ</th><th>نوع</th><th>الگو</th><th>موضوع</th>
            <th>جمع</th><th>مالیات</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>${q.rows.map((r) => {
            const st = MOADIAN_STATUS[r.status] || ["—", "closed"];
            return `<tr>
              <td class="num">${esc(r.serial)}</td>
              <td class="num">${esc(r.invoice_number || "—")}</td>
              <td class="num">${faDigits(r.date)}</td>
              <td class="small">${esc(r.type_label)}</td>
              <td class="small">${esc(r.pattern_label)}</td>
              <td class="small">${esc(r.subject_label)}</td>
              <td class="num">${fmt(r.total)}</td>
              <td class="num">${fmt(r.vat)}</td>
              <td><span class="badge ${st[1]}">${st[0]}</span>
                ${r.problems.length ? `<div class="small muted">${esc(r.problems[0]).slice(0, 60)}…</div>` : ""}
                ${r.error ? `<div class="small muted">${esc(r.error)}</div>` : ""}</td>
              <td><div class="row-actions">
                <button class="btn small" data-mview="${r.id}">جزئیات</button>
                ${can("moadian.manage") && r.status === "draft" ? `<button class="btn small" data-mfix="${r.id}">اصلاح</button>` : ""}
                ${can("moadian.manage") && ["ready", "sent"].includes(r.status) ? `<button class="btn small primary" data-mres="${r.id}">ثبت نتیجه‌ی ارسال</button>` : ""}
              </div></td></tr>`;
          }).join("")}</tbody>
        </table></div>` : `<div class="empty">هنوز صورتحساب الکترونیکی ساخته نشده است.
          ${can("moadian.manage") ? "با دکمه‌ی «ساخت صورتحساب از فاکتورها» شروع کنید." : ""}</div>`}
        <p class="small muted" style="margin-top:10px">گزارش اکسل چندبرگی شامل سرآمد، ردیف‌های صورتحساب، پرداخت‌ها و کنترل ایرادهاست؛ ستون‌ها نام فنی فیلدهای سامانه را دارند. این فایل برای تطبیق حسابدار است، نه بارگذاری رسمی؛ فایل ارسال در مسیر شرکت معتمد/سامانه، JSON ساختاریافته است و قالب Excel معتمدها ممکن است اختصاصی باشد.</p>
        <p class="small muted">${esc(ov.source_note)}</p>
      </div>`;
  } else if (tab === "services") {
    const d = await api("/moadian/service-map");
    body = `
      <div class="card">
        <h3>شناسه‌ی کالا و خدمت هر نوع خدمت</h3>
        <p class="small muted">هر ردیف صورتحساب باید شناسه‌ی ۱۳ رقمی داشته باشد. این شناسه‌ها را سازمان مالیاتی
          می‌دهد و برنامه هیچ عدد حدسی نمی‌سازد؛ حسابدار واردش می‌کند و تأیید می‌کند.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>نوع خدمت</th><th>شناسه‌ی کالا/خدمت</th><th>الگوی صورتحساب</th>
            <th>کد واحد</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>${d.rows.map((r) => `<tr data-srv="${r.id}">
            <td>${esc(r.title)}</td>
            <td><input class="num s-stuff" value="${esc(r.stuff_id)}" placeholder="۱۳ رقم" size="15"
              ${can("moadian.manage") ? "" : "disabled"}></td>
            <td><select class="s-pattern" ${can("moadian.manage") ? "" : "disabled"}>
              ${Object.keys(d.patterns).map((k) => `<option value="${k}"${Number(k) === r.invoice_pattern ? " selected" : ""}>${esc(d.patterns[k])}</option>`).join("")}
            </select></td>
            <td><input class="num s-unit" value="${faDigits(r.unit_code)}" size="7" ${can("moadian.manage") ? "" : "disabled"}></td>
            <td>${r.ready ? '<span class="badge posted">آماده</span>'
                : r.is_confirmed ? '<span class="badge draft">شناسه ندارد</span>'
                : '<span class="badge draft">تأییدنشده</span>'}</td>
            <td>${can("moadian.manage") ? `<div class="row-actions">
              <button class="btn small s-save">ذخیره</button>
              <button class="btn small primary s-ok">تأیید</button>
            </div>` : ""}</td></tr>`).join("")}</tbody>
        </table></div>
        ${d.rows.filter((r) => r.used_invoices).length ? `<p class="small muted">الگویی که صورتحساب ساخته‌شده دارد
          تغییرش باعث اختلاف می‌شود؛ اول آن صورتحساب‌ها را تعیین تکلیف کن.</p>` : ""}
      </div>`;
  } else if (tab === "settings") {
    const d = ov.settings;
    body = `
      <div class="card">
        <h3>اطلاعات مالیاتی آژانس</h3>
        <p class="small muted">این‌ها در هر صورتحساب الکترونیکی تکرار می‌شوند و از کارپوشه‌ی مالیاتی خودتان
          کپی می‌شوند. تا وقتی «فعال» را نزنید، برنامه صورتحساب ارسالی نمی‌سازد.</p>
        <div class="grid cols-2">
          <label>شناسه‌ی یکتای حافظه‌ی مالیاتی (۲۲ رقم)
            <input id="ms-taxid" class="num" value="${esc(d.taxid)}" placeholder="از کارپوشه کپی کنید"></label>
          <label>شماره اقتصادی (۱۱ رقم حقوقی / ۱۴ رقم حقیقی)
            <input id="ms-econ" class="num" value="${esc(d.economic_code)}"></label>
          <label>نام فروشنده <input id="ms-name" value="${esc(d.seller_name)}"></label>
          <label>نوع شخص
            <select id="ms-ptype">
              <option value="2"${d.person_type === 2 ? " selected" : ""}>شخص حقوقی (شرکت)</option>
              <option value="1"${d.person_type === 1 ? " selected" : ""}>شخص حقیقی</option>
            </select></label>
          <label>کد شعبه <input id="ms-branch" class="num" value="${esc(d.branch_code)}"></label>
          <label>کد پستی <input id="ms-post" class="num" value="${esc(d.postal_code)}"></label>
          <label>تلفن <input id="ms-phone" class="num" value="${esc(d.phone)}"></label>
          <label>روش ارسال صورتحساب
            <select id="ms-method">
              <option value="motamed"${d.send_method === "motamed" ? " selected" : ""}>از طریق شرکت معتمد مالیاتی</option>
              <option value="direct"${d.send_method === "direct" ? " selected" : ""}>ارسال مستقیم (با گواهی امضا)</option>
            </select></label>
          <label>نام شرکت معتمد <input id="ms-mot" value="${esc(d.motamed_name)}" placeholder="اگر با معتمد کار می‌کنید"></label>
          <label>شناسه‌ی شرکت معتمد <input id="ms-mot-id" value="${esc(d.motamed_id)}"></label>
          <label>محیط کار
            <select id="ms-env">
              <option value="sandbox"${d.environment === "sandbox" ? " selected" : ""}>آزمایشی (برای امتحان کردن)</option>
              <option value="production"${d.environment === "production" ? " selected" : ""}>واقعی (اطلاعات به سازمان می‌رود)</option>
            </select></label>
          <label>آدرس <input id="ms-addr" value="${esc(d.address)}"></label>
          <label>یادداشت <input id="ms-note" value="${esc(d.note)}"></label>
        </div>
        <label style="margin-top:12px;display:flex;gap:10px;align-items:center">
          <input type="checkbox" id="ms-active" ${d.is_active ? "checked" : ""} style="width:18px">
          <span>سامانه‌ی مودیان برای ما فعال است (اگر تیک باشد، برنامه صورتحساب آماده‌ی ارسال می‌سازد)</span></label>
        <div class="modal-actions">
          <button id="ms-save" class="btn primary">ذخیره</button>
          ${d.updated_at ? `<span class="small muted">آخرین تغییر: ${faDigits(d.updated_at)}</span>` : ""}
        </div>
        <div class="note" style="margin-top:12px">
          برای «ارسال مستقیم» به گواهی امضای الکترونیکی (از دفتر پیشخوان یا سامانه‌ی gica.ir) نیاز دارید؛
          با شرکت معتمد، خودِ شرکت این کار را انجام می‌دهد و شما فقط فایل صورتحساب‌ها را به او می‌دهید.
        </div>
      </div>`;
  } else {
    const jy = Number(params.jy || todayJalali().slice(0, 4));
    const jm = Number(params.jm || todayJalali().slice(5, 7));
    const d = await api(`/reports/vat?jy=${jy}&jm=${jm}`);
    body = `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">فروش مشمول مالیات</span><span class="value num">${money(d.taxable_sales)}</span></div>
        <div class="card kpi gold"><span class="label">فروش معاف از مالیات</span><span class="value num">${money(d.exempt_sales)}</span>
          <span class="small muted">بلیت و خدمات معاف</span></div>
        <div class="card kpi info"><span class="label">مالیات فروش (دوره)</span><span class="value num">${money(d.output_vat)}</span></div>
        <div class="card kpi ${d.payable_vat ? "danger" : ""}"><span class="label">مالیات قابل پرداخت</span>
          <span class="value num">${money(d.payable_vat)}</span>
          <span class="small muted">پس از کسر اعتبار خرید (${money(d.credit_vat)})</span></div>
      </div>
      <div class="card">
        <h3>گزارش ارزش افزوده — فصل ${faDigits(d.quarter)} سال ${faDigits(d.jy)}</h3>
        <div class="filters">
          <label>سال <input id="v-jy" class="num" value="${faDigits(jy)}" size="6"></label>
          <label>ماه
            <select id="v-jm">${MONTH_NAMES.map((m, i) => `<option value="${i + 1}"${i + 1 === jm ? " selected" : ""}>${m}</option>`).join("")}</select></label>
          <button id="v-go" class="btn">نمایش</button>
          <button id="v-x" class="btn">خروجی اکسل</button>
        </div>
        <p class="small muted">بازه: ${faDigits(d.from)} تا ${faDigits(d.to)} — هر ماه را انتخاب کنی، فصل همان ماه نشان داده می‌شود.
          در این فصل ${faDigits(d.moadian_sent)} صورتحساب الکترونیکی ساخته یا ارسال شده است.</p>
        ${d.rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>شماره فاکتور</th><th>تاریخ</th><th>وضعیت</th><th>فروش مشمول</th>
            <th>فروش معاف</th><th>مالیات</th><th>جمع فاکتور</th></tr></thead>
          <tbody>${d.rows.map((r) => `<tr><td class="num">${esc(r.number)}</td>
            <td class="num">${faDigits(r.date)}</td>
            <td>${r.status === "cancelled" ? '<span class="badge reversed">ابطال‌شده</span>' : '<span class="badge posted">صادرشده</span>'}</td>
            <td class="num">${fmt(r.taxable)}</td><td class="num">${fmt(r.exempt)}</td>
            <td class="num">${fmt(r.vat)}</td><td class="num">${fmt(r.total)}</td></tr>`).join("")}</tbody>
          <tfoot>
            <tr><td colspan="3">جمع</td><td class="num">${fmt(d.taxable_sales)}</td>
              <td class="num">${fmt(d.exempt_sales)}</td><td class="num">${fmt(d.output_vat)}</td><td></td></tr>
            <tr><td colspan="5">اعتبار مالیاتی خرید و هزینه‌ها</td><td class="num">${fmt(d.credit_vat)}</td><td></td></tr>
            <tr><td colspan="5"><strong>مالیات قابل پرداخت دوره</strong></td>
              <td class="num"><strong>${fmt(d.payable_vat)}</strong></td><td></td></tr>
          </tfoot>
        </table></div>` : `<div class="empty">در این فصل فاکتوری ثبت نشده است.</div>`}
        <div class="note warn" style="margin-top:12px">این گزارش برای آماده‌سازی اظهارنامه است؛
          عدد نهایی را حسابدار با کارپوشه‌ی مالیاتی تطبیق بدهد.</div>
      </div>`;
  }

  view.innerHTML = bar + body;

  view.querySelectorAll("[data-mtab]").forEach((b) => b.addEventListener("click", () =>
    go("moadian", { tab: b.dataset.mtab })));

  if (tab === "queue") {
    const go2 = () => go("moadian", { tab: "queue", status: $("#m-status").value,
      frm: $("#m-from").value, to: $("#m-to").value });
    $("#m-go").addEventListener("click", go2);
    const bb = $("#m-build");
    if (bb) bb.addEventListener("click", async () => {
      if (!confirm(`از فاکتورهای بازه ${$("#m-from").value} تا ${$("#m-to").value} صورتحساب الکترونیکی ساخته شود؟`)) return;
      try {
        const res = await api("/moadian/build", { method: "POST", body: {
          frm: $("#m-from").value, to: $("#m-to").value, include_cancelled: true } });
        toast(res.message, "ok");
        go2();
      } catch (err) { toast(err.message, "bad"); }
    });
    $("#m-file").addEventListener("click", () => downloadFile(
      "/moadian/batch-file?status=ready", "صورتحساب-های-آماده.json",
      "فایل دسته‌ای آماده‌ها گرفته شد — همین را به شرکت معتمد بدهید: "));
    $("#m-x").addEventListener("click", () => downloadXlsx(
      `/export/moadian-queue.xlsx?status=${$("#m-status").value}`, "صورتحساب-های-مودیان.xlsx"));
    view.querySelectorAll("[data-mview]").forEach((b) => b.addEventListener("click", () =>
      moadianDetail(Number(b.dataset.mview))));
    view.querySelectorAll("[data-mfix]").forEach((b) => b.addEventListener("click", async () => {
      try {
        const res = await api(`/moadian/queue/${b.dataset.mfix}/rebuild`, { method: "POST" });
        toast(res.message, "ok");
        go2();
      } catch (err) { toast(err.message, "bad"); }
    }));
    view.querySelectorAll("[data-mres]").forEach((b) => b.addEventListener("click", () =>
      moadianResult(Number(b.dataset.mres), go2)));
  } else if (tab === "services") {
    view.querySelectorAll(".s-save").forEach((b) => b.addEventListener("click", async () => {
      const row = b.closest("tr");
      try {
        await api(`/moadian/service-map/${row.dataset.srv}`, { method: "PATCH", body: {
          stuff_id: numToLatin($(".s-stuff", row).value).trim(),
          invoice_pattern: Number($(".s-pattern", row).value),
          unit_code: Number(numToLatin($(".s-unit", row).value)) || 1627 } });
        toast("ذخیره شد. برای اینکه قابل استفاده شود، «تأیید» را بزنید.", "ok");
        go("moadian", { tab: "services" });
      } catch (err) { toast(err.message, "bad"); }
    }));
    view.querySelectorAll(".s-ok").forEach((b) => b.addEventListener("click", async () => {
      const row = b.closest("tr");
      try {
        await api(`/moadian/service-map/${row.dataset.srv}`, { method: "PATCH", body: {
          stuff_id: numToLatin($(".s-stuff", row).value).trim(),
          invoice_pattern: Number($(".s-pattern", row).value),
          unit_code: Number(numToLatin($(".s-unit", row).value)) || 1627,
          is_confirmed: true } });
        toast("تأیید شد.", "ok");
        go("moadian", { tab: "services" });
      } catch (err) { toast(err.message, "bad"); }
    }));
  } else if (tab === "settings") {
    $("#ms-save").addEventListener("click", async () => {
      try {
        const res = await api("/moadian/settings", { method: "POST", body: {
          taxid: numToLatin($("#ms-taxid").value).trim(),
          economic_code: numToLatin($("#ms-econ").value).trim(),
          seller_name: $("#ms-name").value, person_type: Number($("#ms-ptype").value),
          branch_code: numToLatin($("#ms-branch").value).trim(),
          postal_code: numToLatin($("#ms-post").value).trim(), phone: numToLatin($("#ms-phone").value).trim(),
          address: $("#ms-addr").value, send_method: $("#ms-method").value,
          motamed_name: $("#ms-mot").value, motamed_id: $("#ms-mot-id").value,
          environment: $("#ms-env").value, is_active: $("#ms-active").checked, note: $("#ms-note").value } });
        toast(res.message, "ok");
        go("moadian", { tab: "settings" });
      } catch (err) { toast(err.message, "bad"); }
    });
  } else {
    $("#v-go").addEventListener("click", () => go("moadian", { tab: "vat",
      jy: Number(numToLatin($("#v-jy").value)), jm: Number($("#v-jm").value) }));
    $("#v-x").addEventListener("click", () => downloadXlsx(
      `/export/vat.xlsx?jy=${jy}&jm=${jm}`, "ارزش-افزوده.xlsx"));
  }
};

/* اطلاعات مالیاتی یک مشتری/تأمین‌کننده — همان چیزهایی که سامانه‌ی مودیان می‌خواهد. */
function partyTaxEditor(p) {
  const modal = openModal(`
    <h3>اطلاعات مالیاتی ${esc(p.name)}</h3>
    <p class="small muted">برای صورتحساب الکترونیکی (نوع اول) به کد ملی/شناسه‌ی ملی خریدار نیاز است.
      برای مسافر غیرایرانی، شماره‌ی گذرنامه.</p>
    <div class="grid cols-2">
      <label>شخص حقیقی است یا حقوقی؟
        <select id="pt-type">
          <option value="1"${p.person_type === 1 ? " selected" : ""}>شخص حقیقی</option>
          <option value="2"${p.person_type === 2 ? " selected" : ""}>شخص حقوقی/شرکت</option>
        </select></label>
      <label>کد ملی (۱۰ رقم) / شناسه‌ی ملی (۱۱ رقم)
        <input id="pt-nid" class="num" value="${esc(p.national_id || "")}"></label>
      <label>شماره اقتصادی (۱۱ یا ۱۴ رقم) <input id="pt-eco" class="num" value="${esc(p.economic_code || "")}"></label>
      <label>کد پستی (۱۰ رقم) <input id="pt-post" class="num" value="${esc(p.postal_code || "")}"></label>
      <label>شماره‌ی گذرنامه (برای مسافر غیرایرانی) <input id="pt-pass" value="${esc(p.passport_no || "")}"></label>
    </div>
    <div class="modal-actions">
      <button id="pt-save" class="btn primary">ذخیره</button>
      <button id="pt-close" class="btn">بستن</button>
    </div>`);
  $("#pt-close", modal).addEventListener("click", closeModal);
  $("#pt-save", modal).addEventListener("click", async () => {
    try {
      await api(`/parties/${p.id}`, { method: "PATCH", body: {
        person_type: Number($("#pt-type", modal).value),
        national_id: numToLatin($("#pt-nid", modal).value).trim(),
        economic_code: numToLatin($("#pt-eco", modal).value).trim(),
        postal_code: numToLatin($("#pt-post", modal).value).trim(),
        passport_no: $("#pt-pass", modal).value.trim() } });
      closeModal();
      toast("اطلاعات مالیاتی ذخیره شد.", "ok");
      await loadParties(true);
      go("parties");
    } catch (err) { toast(err.message, "bad"); }
  });
}

async function moadianDetail(id) {
  const d = await api(`/moadian/queue/${id}`);
  const h = d.payload.header || {};
  const modal = openModal(`
    <h3>صورتحساب ${esc(d.serial)} <span class="badge ${(MOADIAN_STATUS[d.status] || ["", "closed"])[1]}">${esc(d.status_label)}</span></h3>
    ${d.problems.length ? `<div class="note bad"><strong>ایرادهایی که باید درست شود:</strong>
      <ul style="margin:6px 0 0;padding-inline-start:18px">${d.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
    ${d.taxid ? `<div class="note">شماره‌ی مالیاتی صورتحساب: <strong class="num">${esc(d.taxid)}</strong>
      ${d.reference_number ? ` • شماره‌ی ارجاع: <strong class="num">${esc(d.reference_number)}</strong>` : ""}</div>` : ""}
    <div class="grid cols-3" style="margin-top:12px">
      <div class="kpi"><span class="label">جمع صورتحساب</span><span class="value num">${d.total_fa} ریال</span></div>
      <div class="kpi"><span class="label">مالیات</span><span class="value num">${d.vat_fa} ریال</span></div>
      <div class="kpi"><span class="label">نوع و الگو</span>
        <span class="value" style="font-size:15px">${h.inty === 1 ? "نوع اول" : "نوع دوم"}</span>
        <span class="small muted">${esc(d.payload.header ? "" : "")}الگوی ${faDigits(h.inp || 1)}</span></div>
    </div>
    <h4 style="margin-top:14px">سرآمد صورتحساب (همان چیزی که به سازمان می‌رود)</h4>
    <div class="table-wrap"><table>
      <tbody>${Object.entries(h).map(([k, v]) => `<tr><td class="num">${esc(k)}</td>
        <td class="num">${v === null ? "—" : faDigits(String(v))}</td></tr>`).join("")}</tbody>
    </table></div>
    ${d.ticket_lines && d.ticket_lines.length ? `<h4 style="margin-top:14px">نوع پرواز بلیت‌ها</h4>
      ${d.ticket_lines.map((l) => `<div class="sub-line" style="padding:4px 0">
        <span>ردیف ${faDigits(l.line_no)} — ${esc(l.description || "بلیت")}:</span>
        <select data-fl="${l.line_id}">
          <option value="1"${l.flight_type === 1 ? " selected" : ""}>پرواز داخلی</option>
          <option value="2"${l.flight_type === 2 ? " selected" : ""}>پرواز خارجی</option>
        </select>
        <button class="btn small" data-flset="${l.line_id}">ثبت</button>
        ${l.flight_type ? "" : '<span class="muted">هنوز انتخاب نشده</span>'}
      </div>`).join("")}` : ""}
    <h4 style="margin-top:14px">ردیف‌ها</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>شناسه کالا/خدمت</th><th>شرح</th><th>تعداد</th><th>فی</th><th>مبلغ</th>
        <th>نرخ مالیات</th><th>مالیات</th></tr></thead>
      <tbody>${(d.payload.body || []).map((l) => `<tr>
        <td class="num">${esc(l.sstid)}</td><td>${esc(l.sstt)}</td>
        <td class="num">${fmt(l.am)}</td><td class="num">${fmt(l.fee)}</td><td class="num">${fmt(l.adis)}</td>
        <td class="num">${faDigits(Math.round((l.vra || 0) * 100))}٪</td><td class="num">${fmt(l.vam)}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="modal-actions">
      <button id="md-file" class="btn">فایل JSON این صورتحساب</button>
      <button id="md-close" class="btn">بستن</button>
    </div>`);
  modal.querySelectorAll("[data-flset]").forEach((b) => b.addEventListener("click", async () => {
    const lid = Number(b.dataset.flset);
    const val = Number(modal.querySelector(`[data-fl="${lid}"]`).value);
    try {
      await api(`/invoices/${d.invoice_id}/flight-type`, { method: "POST",
        body: { line_id: lid, flight_type: val } });
      await api(`/moadian/queue/${id}/rebuild`, { method: "POST" });
      closeModal();
      toast("نوع پرواز ثبت شد و صورتحساب از نو ساخته شد.", "ok");
      go("moadian", { tab: "queue" });
    } catch (err) { toast(err.message, "bad"); }
  }));
  $("#md-close", modal).addEventListener("click", closeModal);
  $("#md-file", modal).addEventListener("click", () => downloadFile(
    `/moadian/queue/${id}/file`, `صورتحساب-${d.serial}.json`, "فایل صورتحساب گرفته شد: "));
}

function moadianResult(id, onDone) {
  const modal = openModal(`
    <h3>ثبت نتیجه‌ی ارسال</h3>
    <p class="small muted">بعد از اینکه صورتحساب را (خودتان یا شرکت معتمد) به سامانه فرستادید،
      نتیجه را همین‌جا ثبت کنید تا سابقه‌اش بماند.</p>
    <label>چه شد؟
      <select id="mr-status">
        <option value="sent">فرستادیم و منتظر جوابیم</option>
        <option value="accepted">پذیرفته شد</option>
        <option value="rejected">مردود شد</option>
      </select></label>
    <div class="grid cols-2" style="margin-top:10px">
      <label>شماره‌ی ارجاع <input id="mr-ref" placeholder="از شرکت معتمد"></label>
      <label>شماره‌ی مالیاتی صورتحساب <input id="mr-tax" placeholder="برای «پذیرفته شد» لازم است"></label>
    </div>
    <label style="margin-top:10px">اگر مردود شد، علتش چه بود؟ <input id="mr-err"></label>
    <div class="modal-actions">
      <button id="mr-go" class="btn primary">ثبت</button>
      <button id="mr-cancel" class="btn">بستن</button>
    </div>`);
  $("#mr-cancel", modal).addEventListener("click", closeModal);
  $("#mr-go", modal).addEventListener("click", async () => {
    try {
      const res = await api(`/moadian/queue/${id}/result`, { method: "POST", body: {
        status: $("#mr-status", modal).value, reference_number: $("#mr-ref", modal).value.trim(),
        taxid: numToLatin($("#mr-tax", modal).value).trim(), error: $("#mr-err", modal).value.trim() } });
      closeModal();
      toast(res.message, "ok");
      if (onDone) onDone();
    } catch (err) { toast(err.message, "bad"); }
  });
}
