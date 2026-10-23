> **به‌روزرسانی اکتبر ۱۴۰۵:** راهنمای ارتقا و ورود ماهانه در [UPDATE-LAN-FA.md](UPDATE-LAN-FA.md) است. نسخه جدید داده‌های واقعی حقوق را در فایل عمومی HTML قرار نمی‌دهد.

# HR رضوان — نسخه چندکاربره روی شبکه داخلی (LAN)

`dashboard-41.html` ← FastAPI ← PostgreSQL. ظاهر و منطق محاسبات همان برنامه‌ی فعلی است؛ فقط ذخیره‌سازی، ورود، کاربران و فایل‌ها به سرور وصل شده‌اند.

## ساختار
```
backend/   app/ (main, routers, services, core, migration, cli, ops)  tests/  requirements.txt  .env.example
frontend/  dashboard-41.html (آماده‌ی اجرا)  hr-api-shim.js  build_frontend.py  dashboard-41.original.html (نسخه‌ی اصلی بدون تغییر)
db/        schema.sql  grants.sql
scripts/   install  first-run  run  stop  backup  restore  verify-backup   (.bat برای Windows، .sh برای Linux)
docs/      طراحی و گزارش شواهد
```

## نصب (یک بار، روی کامپیوتر سرور)
نیازها: **Python 3.11+** و **PostgreSQL 14+** (به‌صورت سرویس نصب شده و رمز کاربر `postgres` را می‌دانید).
1. `scripts\install.bat` — محیط پایتون و بسته‌ها را می‌سازد و `backend\.env` را تولید می‌کند.
2. فایل `backend\.env` را باز کنید و در `HR_ADMIN_DATABASE_URL` رمز کاربر `postgres` را بگذارید. (اگر `pg_dump` در PATH نیست: `HR_PG_BIN` را به پوشه‌ی bin نصب PostgreSQL بدهید.)
3. `scripts\first-run.bat` — پایگاه‌داده، جدول‌ها، نقش‌ها و **اولین کاربر مدیر** را می‌سازد (نام کاربری و رمز را می‌پرسد).

## مهاجرت داده‌های فعلی (فقط با فایل کامل Export)
```
cd backend
..\.venv\Scripts\python.exe -m app.cli migrate-preview C:\path\hr-dashboard-data.json --report preview.json
..\.venv\Scripts\python.exe -m app.cli migrate-apply   C:\path\hr-dashboard-data.json --files-root "C:\پوشه-قدیمی-داده"
```
- ابتدا گزارش پیش‌نمایش را بخوانید. اگر مورد `blocking` داشت، اجرا متوقف می‌شود و چیزی نوشته نمی‌شود (فیلد/مجموعه‌ی ناشناس حدس زده نمی‌شود). فیلدی که معتبر است را در `HR_FIELD_OVERRIDES` اضافه کنید یا با `--accept-blocking` آگاهانه ردش کنید.
- فایل JSON اصلی هرگز تغییر نمی‌کند. اجرای دوباره‌ی همان فایل کاری انجام نمی‌دهد (Idempotent).
- کاربران با **همان رمز فعلی** منتقل می‌شوند (PBKDF2؛ SHA-256 قدیمی پس از اولین ورود به Argon2id ارتقا می‌یابد). کاربر `system` به کاربر سیستمی غیرقابل‌ورود تبدیل می‌شود.
- پیش‌فرض: همه‌ی نقش‌ها «همه‌ی واحدها» را می‌بینند (رفتار امروز). برای محدودکردن: `--all-units-roles admin` و بعد برای هر کاربر واحد تعیین کنید.

## اجرا
`scripts\run.bat` → از هر کامپیوتر شبکه: `http://نام-یا-IP-سرور:8000` — توقف: `scripts\stop.bat`.
اگر کامپیوترهای دیگر وصل نشدند، پورت 8000 را در Windows Firewall برای شبکه‌ی خصوصی باز کنید.
**کاربر اولیه:** همان کاربری که در `first-run` ساختید؛ اگر داده را مهاجرت کرده‌اید، کاربر `admin` فایل داده‌ی شما با رمز قبلی‌اش. فراموشی رمز: `python -m app.cli set-password admin`.

## پشتیبان‌گیری و بازیابی
- `scripts\backup.bat` — دیتابیس + پوشه‌ی اسناد، با Checksum و بررسی خودکار؛ ۳۰ نسخه‌ی آخر نگه داشته می‌شود. روزانه با Task Scheduler زمان‌بندی کنید.
- `scripts\verify-backup.bat پوشه-پشتیبان` — بررسی و **تست بازیابی** در یک دیتابیس موقت.
- `scripts\restore.bat پوشه-پشتیبان` — (ابتدا سرور را متوقف کنید) از وضعیت فعلی هم نسخه می‌گیرد، بعد بازیابی می‌کند.

## امنیت (سمت سرور)
ورود با Session و کوکی HttpOnly/SameSite=Strict، CSRF، Timeout بیکاری/مطلق، محدودیت تلاش ورود، رمزهای جدید Argon2id؛ Permission AND Unit Scope AND Record Scope روی هر عملیات؛ فیلدهای حساس (حقوق، کد ملی، بانک، شماره بیمه) فقط برای دارندگان Permission ارسال می‌شوند؛ Audit فقط‌افزودنی (بدون API حذف/ویرایش، با Trigger و محدودیت DB)؛ فایل‌ها بدون URL عمومی و فقط با بررسی دسترسی.

## وضعیت تست (صادقانه)
| بخش | وضعیت |
|---|---|
| Permission / Unit / Record Scope، فیلدهای حساس، Mass Assignment، قفل حقوق، 409، حذف نرم و بازیابی، Settings، Audit، مهاجرت (روی ذخیره‌ساز حافظه‌ای و فایل نمونه)، رمزها (PBKDF2/SHA-256)، Rate Limit | **TESTED** — `cd backend && python -m unittest discover -s tests -v` (۶۷ آزمون) |
| سازگاری آداپتور Frontend با سرور (تولید دسته‌ی تغییرات واقعی و پذیرش توسط منطق سرور) | **TESTED** (Node + منطق سرور؛ مرورگر واقعی نه) |
| PostgreSQL، FastAPI/HTTP، Session، CSRF، آپلود/دانلود فایل، Argon2id، Backup/Restore، اسکریپت‌های .bat/.sh | **UNTESTED** — در محیط ساخت وجود نداشتند |
| مهاجرت با Export کامل، enumهای واقعی، پوشه‌ی اسناد واقعی | **REQUIRES REAL DATA** |

## محدودیت‌های شناخته‌شده
- `hiringScenarios`: خواندن فعال، نوشتن غیرفعال (ساختار از کد تأیید نشده).
- فیلدهای مجاز هر مجموعه از کد استخراج شده؛ اگر فیلدی در داده‌ی واقعی بود که نبود، مهاجرت گزارش می‌دهد و با `HR_FIELD_OVERRIDES` اضافه می‌شود.
- محاسبات حقوق همچنان در مرورگر انجام می‌شوند (تصمیم Path A)؛ سرور مقدار ارسالی را ذخیره و Audit می‌کند ولی بازمحاسبه نمی‌کند.
- ORM: به‌جای SQLAlchemy از SQL پارامتری با psycopg استفاده شده (ساده‌تر و بدون لایه‌ی اضافه).
- بازیابی پشتیبان و پاک‌کردن کل داده از داخل برنامه غیرفعال است (فقط اسکریپت سرور).

## اتصال کامپیوتر/واحد دیگر (کلاینت)
کلاینت **هیچ فایلی نصب نمی‌کند**؛ فقط مرورگر.
1. روی سرور: IP ثابت بدهید (`ipconfig` آدرس IPv4 را نشان می‌دهد) و پورت را باز کنید: `netsh advfirewall firewall add rule name="HR Rezvan" dir=in action=allow protocol=TCP localport=8000 profile=private`
2. روی سرور برای آن واحد کاربر بسازید (واحدها از نام «واحد/بخش» کارمندان ساخته شده‌اند):
   `cd backend` سپس `..\.venv\Scripts\python.exe -m app.cli list-users` (واحدها را نشان می‌دهد)
   `..\.venv\Scripts\python.exe -m app.cli create-user ali --name "علی احمدی" --role hr_specialist --units "مالی"`
   (چند واحد: `--units "مالی,تولید"`؛ همه‌ی واحدها: `--all-units`؛ تغییر بعدی: `set-units ali --units "مالی"`)
3. روی کامپیوتر کلاینت در مرورگر باز کنید: `http://IP-سرور:8000` و با همان کاربر وارد شوید. هر تغییری که ثبت کند، روی سرور ذخیره می‌شود و بقیه‌ی کاربران پس از چند ثانیه تا یک دقیقه (یا با بارگذاری مجدد) آن را می‌بینند.
نقش مناسب: `hr_specialist` (کارشناس)، `hr_manager` (مدیر منابع انسانی)، `ceo`، `viewer` (فقط مشاهده)، `admin`.

### دسترسی متفاوت برای هر واحد (ویرایش در یک واحد، فقط‌مشاهده در واحد دیگر)
```
create-user ali --role viewer --units "مالی,تولید"            # نقش اصلی: فقط مشاهده
set-unit-role ali --unit "مالی" --role hr_specialist          # فقط در «مالی» حقوق کارشناس را دارد
set-unit-role ali --unit "مالی" --role none                   # حذف استثنای واحد
```
نقش واحد، جایگزین نقش اصلی فقط **درون همان واحد** می‌شود و دامنه‌ی واحدها را بیشتر نمی‌کند.

## شبکه برای کاربر غیرفنی
1. روی سرور، فایل `scripts\open-network.bat` را با کلیک راست و **Run as administrator** اجرا کنید؛ پورت را باز می‌کند و آدرسی را که باید به بقیه بدهید چاپ می‌کند.
2. همان آدرس را روی کامپیوتر دیگر در مرورگر بزنید. اگر باز نشد: هر دو کامپیوتر باید به یک مودم/سوییچ (یک شبکه) وصل باشند؛ Wi-Fi مهمان معمولاً اجازه نمی‌دهد.
3. برای اینکه آدرس عوض نشود، در مودم برای سرور «DHCP Reservation / IP ثابت» بگذارید (یا از فرد IT شرکت بخواهید).
