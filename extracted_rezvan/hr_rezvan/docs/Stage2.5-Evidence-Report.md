# HR رضوان — مرحله ۲.۵: شواهد از `dashboard-41.html` و Gap Analysis اولیه

**وضعیت:** فقط خواندن کد. هیچ فایلی تغییر نکرد، Migration اجرا نشد، Permission یا Lock جدیدی اضافه نشد. هر آنچه این‌جا آمده `IMPLEMENTED` (مشاهده‌شده در کد) است، مگر برچسب دیگری داشته باشد. بخش A (اسکن مجدد با Export کامل) منتظر فایل شماست.

شماره خط‌ها مربوط به `dashboard-41.html` است.

---

## ۱. Settings و مقدارهای پیش‌فرض
نتیجه‌ی کلیدی: چون Path A محاسبات را در Client نگه می‌دارد، **پیش‌فرض‌ها هم در Client می‌مانند** (با `Object.assign` روی مقدار ذخیره‌شده). Server لازم نیست پیش‌فرض بسازد؛ کلید غایب یعنی «Client پیش‌فرض خودش را اعمال کند».

| کلید | رفتار در کد | پیش‌فرض قابل‌تعیین از کد؟ |
|---|---|---|
| alertConfig | `ALERT_DEFAULTS` (۱۶ کلید، خط ۶۸۱۹) با مقدار ذخیره ادغام می‌شود | بله |
| economicAssumptions | `DEFAULT_ECON_ASSUMPTIONS` (بیشتر `null`، خط ~۳۳۹۵) | بله |
| leavePolicy | `DEFAULT_LEAVE_POLICY` = {annualDays 30، monthlyDays 2.5، workingDays 26، fridays 4، maxCarry 9، dailyRateDivisor 30} (خط ۶۳۲۹)، سپس بازنویسی با `laborRuleFor` | بله |
| accountMap | فهرست `ACC` با ۱۰ حساب، کد خالی (خط ۸۳۷۸) | بله |
| laborRules | `{}`؛ ساختار `rules[سال][کلید] = {value: عدد}`؛ `laborRuleFor` بدون مقدار `null` می‌دهد (خط ۷۸۰۶) | پیش‌فرضی وجود ندارد (null) |
| laborRulesLog | `[]` در اولین ثبت ساخته می‌شود | `[]` |
| holidays | `[]` | `[]` |
| unitSchedules | `{}`؛ **کلیدها نام Department هستند** (خط ۳۲۴۱) | `{}` |
| eidi | `{}`؛ نبودن پارامتر = «ثبت نشده» (خط ۷۶۳۲) | پیش‌فرضی نیست |
| minWage | بدون پیش‌فرض (فقط خواندن/نوشتن) | پیش‌فرضی نیست |
| payslipOrg | فقط دو ارجاع؛ پیش‌فرض صریح نیست | مشخص نیست |
| lockDisabled / legacyLockMigrated | نبودن کلید = falsy | پیش‌فرضی نیست |

## ۲. قفل حقوق
**کلیدهای نوشته‌شده هنگام Lock (خط ۳۳۴۸)** — قبلاً REQUIRES CODE VERIFICATION بود و حالا مشخص است:
`status='locked'`، `snapshotVersion=2`، `snapshot` (ردیف‌های کارمندی)، `workingDays`، `dailyHours`، `rulesYear`، `rulesSnapshot` (کپی `getCoeffs()`)، `leavePolicySnapshot`، `eidiSnapshot`، `holidaysCountSnapshot`، `laborCostComponentsSnapshot`، `approved_by`، `approved_by_name`، `approved_at`.
- **Review** (خط ۳۳۱۹): `status='hr_reviewed'`، `reviewed_by/_name/_at`، ردیف History.
- **Unlock** (خط ۳۳۵۹): `status` به `hr_reviewed` برمی‌گردد؛ `unlocked_by/_name/_at/unlock_reason`؛ **Snapshot و کلیدهای Snapshotهای جانبی پاک نمی‌شوند**.
- قفل نمونه فاقد `snapshotVersion` و ۵ Snapshot جانبی است، یعنی با نسخه‌ی قدیمی ساخته شده (استنباط).
- `approved_by` و دوستان `who.id` می‌گیرند، ولی در داده‌ی نمونه مقدار `'admin'` (نام‌کاربری) است نه `users.id`.

**Collectionهای تحت قفل** (بدون تغییر نسبت به v2؛ اسکن جدید چیز تازه‌ای نیافت):
- سخت: وضعیت/حذف اضافه‌کاری؛ حذف دائمی کارمندِ داخل Snapshot قفل‌شده، دارای پرداخت یا پرونده‌ی تسویه.
- اصلاحیه با دلیل: حقوق پایه، وام (ثبت/حذف)، تعدیل (ثبت/حذف). نقش دقیق `editAdjustment`: هنوز تأییدنشده.
- بقیه: بررسی قفلی در کد دیده نشد (NONE_OBSERVED).

## ۳. حذف نرم و `deletedRecords`
دو سازوکار موازی وجود دارد:
1. **پرچم روی رکورد** (`v24Del` خط ۷۶۲۶ و `laDel` خط ۸۱۶۸): `deleted=true` و `deleted_at`؛ رکورد در Collection می‌ماند و UI با `!x.deleted` فیلترش می‌کند.
2. **آرشیو** `deletedRecords` (خط ۸۲۰۷–۸۲۲۲): برای ۸ Collection قدیمی (حضور، انضباط، تعدیل، مرخصی، قرارداد، وام، مزایا، آموزش) و همچنین `payrollPayments` و `overtime`. رکورد از Collection **فیزیکی حذف** می‌شود و موردی به شکل `{id:'del…', coll, label, rec:<کپی کامل>, at}` در آرشیو می‌ماند. بازیابی `rec` را به Collection برمی‌گرداند و مورد آرشیو را حذف می‌کند.

## ۴. `documents`
رکورد (خط ۵۹۰۱ و ۷۴۲۹): `{id:'doc…', employee_id, title, category, fileName, relativePath, created_at, expiry_date, confidential, size, source?}`.
- `relativePath` به شکل `پرسنل/<code کارمند>/…` است؛ بررسی سازگاری آن با `code` در خط ۷۱۷۱ هست. پس **تغییر `code` کارمند مسیر فایل را می‌شکند**.
- `confidential` برای دسته‌های «قرارداد» و «استعلاجی» پیش‌فرض true است (مسیر روابط کار).
- فایل‌ها روی دیسک (File System Access API) هستند، نه در JSON: انتقال واقعی نیازمند خودِ پوشه است (**REQUIRES REAL DATA**).
- `employees.photo_path` هم مسیر فایل عکس است (خط ۵۵۵۳).

## ۵. `empExtra` و `hiringScenarios`
- **empExtra** (خط ۷۷۰۴–۷۷۰۹): یک رکورد برای هر کارمند (upsert بر اساس `employee_id`). کلیدها ۱۸ مورد: `id`، `employee_id`، `start`، `end`، `hours`، `rest`، `shift`، `shifttype`، `night`، `nighth`، `fri`، `hol`، `ins_no`، `ins_type`، `ins_status`، `ins_note`، `ins_start`، `updated`. لیست قطعی است.
- **hiringScenarios** (خط ۴۶۴۸ و ۴۷۸۵): Collection چندنوعی با `type` برابر `hiring` (پیش‌فرض) یا `salary_increase`. رکورد = `{id، createdAt، title، type}` + پارامترهای پویا + `results`. کلیدهای پارامتر از خروجی توابع محاسبه می‌آیند → **REQUIRES CODE VERIFICATION** (عمیق).

## ۶. فیلدهای کارمند
- `status` که ۷۴ بار خوانده می‌شود، **فیلد ذخیره‌شده نیست**؛ در View-Model محاسبه می‌شود (مثلاً `terminated` از `exit_date`).
- تنها فیلد ذخیره‌شده‌ای که در کد روی رکورد کارمند نوشته می‌شود ولی در ۴۱ فیلد نمونه نیست: **`photo_path`**.
- کارمند جدید با `Object.assign({id, hire_date, exit_date:null, exit_reason:null}, fields)` ساخته می‌شود (خط ۶۰۸۵).

---

## ۷. Gap Analysis اولیه (dashboard ↔ Design v2 ↔ Schema v2 ↔ hr_backend)
هیچ‌کدام از اصلاحات زیر اعمال نشده؛ منتظر تأیید شماست.

| # | یافته | وضعیت فعلی v2/hr_backend | اصلاح پیشنهادی |
|---|---|---|---|
| G1 | پیش‌فرض Settings در Client می‌ماند | `GET /api/settings/{key}` خطای 404 `DATA_INSUFFICIENT` می‌دهد؛ سند v2 هم «Data Insufficient» می‌گوید | پاسخ `{exists:false, value:null}`؛ «Data Insufficient» فقط برای ورود به Migration نه خواندن |
| G2 | `unitSchedules` با نام Department کلید می‌خورد | `units.name` از همان مقدارها ساخته می‌شود | کلیدها بدون تغییر نگه داشته شوند؛ تغییر نام Unit باید فهرست `unitSchedules` را هم به‌روز کند (یا ممنوع شود) |
| G3 | ۴ Snapshot جانبی + کلیدهای Lock مشخص شد | `payroll_locks` فقط `rules_snapshot` و `extra_snapshots` دارد؛ `lock_month` در hr_backend فقط همان‌ها را می‌گیرد | ستون یا کلیدهای ثابت برای `leavePolicySnapshot`، `eidiSnapshot`، `holidaysCountSnapshot`، `laborCostComponentsSnapshot` |
| G4 | Actorها در Lock هم نام‌کاربری‌اند | Preview فقط هشدار می‌دهد | قاعده‌ی Mapping در Migration (`username→users.id`) برای `*_by` |
| G5 | دو سازوکار حذف نرم | فقط `deleted_at`؛ Preview پرچم `deleted` را نمی‌شناسد | Migration: `deleted:true` → `deleted_at` (با `deleted_at` موجود) |
| G6 | ساختار `deletedRecords` معلوم شد | `legacy_deleted_records` فقط JSON خام | هر مورد به رکورد حذف‌نرمِ Collection خودش (`coll`+`rec`+`at`) تبدیل شود تا قابل بازیابی بماند؛ `coll` باید Whitelist باشد |
| G7 | `documents` ستون‌های خودش را دارد | Schema: `storage_key`، `legacy_path`، `extra` | ستون‌های `file_name`، `relative_path`، `expiry_date`، `confidential`، `size_bytes`، `source`؛ قاعده‌ی «تغییر `code` کارمند ممنوع/هم‌زمان با جابه‌جایی فایل» |
| G8 | `empExtra` قطعی شد (۱۸ کلید، یکی برای هر کارمند) | نوشتن غیرفعال، فهرست `NULL` | بعد از تأیید شما: Allowlist این ۱۸ کلید + `UNIQUE(employee_id)`؛ تصمیم لازم: آیا `ins_no` (شماره بیمه) حساس است؟ |
| G9 | `hiringScenarios` چندنوعی و پویاست | نوشتن غیرفعال | همین‌طور غیرفعال بماند |
| G10 | `photo_path` در ۴۱ فیلد نبود | Preview برای آن `DATA_INSUFFICIENT: unknown_field` می‌دهد | افزودن به Tier B (`view_personnel`) و انتقال فایل عکس همراه اسناد |
| G11 | `status` مشتق است | اگر در داده‌ی واقعی ذخیره شده باشد، «فیلد ناشناس» می‌شود | رفتار فعلی درست است؛ فقط گزارش شود، ذخیره نشود |

بدون اصلاح: قواعد Lock، Permission Map، مدل Audit و Unit Scope با شواهد جدید در تناقض نیستند.

## ۸. برای بخش A (Export کامل) لازم است
1. `hr-dashboard-data.json` کامل و دست‌نخورده.
2. فهرست پوشه‌ی اسناد (`پرسنل/…`) حتی بدون محتوا: فقط نام فایل‌ها و حجم‌ها، تا ساختار و `code`های ناسازگار بررسی شود.
3. اگر مایلید: تعداد کاربران، چون کاربر `sha256` قدیمی فقط از داده‌ی واقعی معلوم می‌شود.

**توقف:** بدون تأیید شما، نه Backend را تکمیل می‌کنم، نه Gap Analysis را اعمال می‌کنم.
