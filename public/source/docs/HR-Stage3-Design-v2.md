# HR رضوان — مرحله ۳ (نسخه ۲): Permission Map، Schema، API، Validation، قواعد فیلدهای حساس

**وضعیت: DESIGNED / UNTESTED.** هیچ کدی اجرا نشده؛ PostgreSQL، FastAPI و Argon2 در محیط من نیست. `dashboard-41.html` تغییر نکرده و Frontend وصل نشده است. Backend ساخته نشده و منتظر تأیید نهایی شماست. فایل SQL همراه: `schema-proposed-v2.sql` (Syntax-check هم نشده).

برچسب‌ها: `IMPLEMENTED` · `DESIGNED` · `UNTESTED` · `REQUIRES REAL DATA` · `REQUIRES CODE VERIFICATION`

## ۰. اعمال دستورهای شما
| دستور | اقدام در v2 | وضعیت |
|---|---|---|
| `approve_records` فعال | در `permissions` با وضعیت ACTIVE؛ کنترل `laSet`، `attSetHr`، `otSetStatus` | DESIGNED |
| `export_data` ساخته نشود | ساخته نشد؛ `aiExport` با Permissionهای خواندن موجود کنترل می‌شود | DESIGNED |
| view هرگز مجوز نوشتن نیست | Constraint در `function_permission_map`؛ بازبینی ۳۶ تابع و ۱۰ تابع موجود | DESIGNED |
| حساس‌ها در `extra` نمانند | ستون‌های جدا + CHECK + قاعده‌ی Migration (بخش ۴) | DESIGNED |
| Validation برای `hr_records` | جدول `collection_specs` (بخش ۵) | DESIGNED |
| Effective Access | بخش ۱ | DESIGNED |
| Audit کاملاً Append-only | بخش ۷ | DESIGNED |
| Collectionهای تحت قفل از کد | بخش ۸ — **یافته‌ی مهم** | IMPLEMENTED (مشاهده از کد) |

## ۱. اصول قطعی
**Effective Access = Permission AND Unit Scope AND Record Scope.**
- `users.all_units = true` فقط یعنی «همه‌ی Unitها»؛ هیچ Permissionی را دور نمی‌زند و Record Scope را هم برنمی‌دارد.
- `admin` در کد `['*']` است؛ در Schema این ویژگی **Role** است (`roles.all_permissions`)، نه کاربر و نه `all_units`.
- view_* فقط برای مشاهده است. هر عملیات نوشتن/تأیید/حذف یک Permission عملیاتی می‌خواهد. اگر داده‌ی حساس لمس شود، Permission خواندنِ آن هم **به‌علاوه** لازم است.
- کنترل در سطح فیلد: درخواستی که فیلد حساس دارد، فقط با Permission خواندن و نوشتن همان فیلد پذیرفته می‌شود؛ در غیر این‌صورت `403`. فیلد حساس بدون Permission اصلاً در پاسخ نمی‌آید (حذف می‌شود، نه null).
- `approve_records`: Permission فعال است، ولی **واگذاری آن به Role** هنوز نیاز به تأیید شما دارد. پیشنهاد: `hr_manager` (ردیف `PROPOSED`). بدون واگذاری فقط admin می‌تواند تأیید کند.

## ۲. Permission Map بازبینی‌شده‌ی ۳۶ تابع (PROPOSED / PENDING_APPROVAL)
«AND با» یعنی علاوه بر Permission عملیاتی. هیچ Permission جدیدی جز `approve_records` لازم نیست.

| # | تابع | عملیات | Permission عملیاتی | AND با | توضیح |
|---|---|---|---|---|---|
| 1 | laSave | create | write_records | — | — |
| 2 | laSet | approve | approve_records | — | — |
| 3 | laDel | delete | delete_sensitive | — | — |
| 4 | v24Del | delete | delete_sensitive | خواندنِ همان Collection | Whitelist سه Collection |
| 5 | v24EidiSave | create | write_records | view_salary | — |
| 6 | saveEidiCfg | manage | edit_settings | — | — |
| 7 | v24SickSave | create | write_records | view_confidential_docs | تصمیم D-D |
| 8 | v24IncSave | create | write_records | — | — |
| 9 | v24IncStatus | edit | write_records | — | — |
| 10 | v24IncAction | edit | write_records | — | — |
| 11 | v24ExtraSave | edit | write_personnel | — | Allowlist فیلد: REQUIRES CODE VERIFICATION |
| 12 | v24DisStep | edit | write_discipline | view_discipline | — |
| 13 | stlSave | edit | write_personnel | view_salary | وضعیت نهایی/پرداخت‌شده: approve_payroll |
| 14 | probSave | create | write_records | — | — |
| 15 | ctUpdate | edit | write_records | — | — |
| 16 | attAddStep | edit | write_records | — | — |
| 17 | attSetHr | approve | approve_records | — | — |
| 18 | presExcuse | approve | approve_records | — | قضاوت من؛ تأیید شما لازم (D-B) |
| 19 | trashRestore | restore | delete_sensitive | — | Whitelist Collection |
| 20 | aiInsSave | edit | write_records | view_salary | — |
| 21 | aiPay | create | write_records | view_salary | — |
| 22 | aiDelPay | delete | delete_sensitive | view_salary | — |
| 23 | aiExport | export | view_salary | view_national_id (فقط نوع بیمه) | export_data ساخته نمی‌شود |
| 24 | acctSave | manage | edit_settings | — | — |
| 25 | slipOrgSave | manage | edit_settings | — | — |
| 26 | otSetStatus | approve | approve_records | — | قفل ماه: HARD_BLOCK |
| 27 | otDel | delete | delete_records | — | قفل ماه: HARD_BLOCK |
| 28 | saveMinWage | manage | edit_settings | — | — |
| 29 | lrSave | manage | edit_settings | — | — |
| 30 | lrNewYear | manage | edit_settings | — | — |
| 31 | holAdd | create | edit_settings | — | — |
| 32 | holDel | delete | edit_settings | — | — |
| 33 | unitSchedSave | manage | edit_settings | — | — |
| 34 | saveLeavePolicy | manage | edit_settings | — | — |
| 35 | resetLeavePolicy | manage | edit_settings | — | — |
| 36 | hrPickFile | upload | write_docs | — | — |

**تغییر نسبت به v1:** `v24EidiSave`، `stlSave`، `aiInsSave`، `aiPay`، `aiDelPay` دیگر با `view_salary` تنها کنترل نمی‌شوند. `view_salary` فقط شرط مشاهده می‌ماند. `laSet`، `attSetHr`، `otSetStatus` به `approve_records` رفتند. `presExcuse` را هم به `approve_records` بردم؛ این قضاوت من است (بخشیدن کسر کار یک تصمیم است) و تأیید شما لازم است (D-B).

### ۲.۱ ده تابع موجود که الان با `view_salary` کنترل می‌شوند (همان نقض اصل)
این‌ها جزو ۳۶ نیستند (Guard دارند)، ولی در Server با همان اصل باید اصلاح شوند. `IMPLEMENTED` از FN_PERMS.

| تابع | وضعیت فعلی | پیشنهاد |
|---|---|---|
| submitLoan، adjustLoanOverdue | view_salary | write_records + view_salary |
| submitAdjustment | view_salary | write_records + view_salary |
| submitBenefit | view_salary | write_records + view_salary |
| updateSalary | view_salary | write_personnel + view_salary (+ قفل: بخش ۸) |
| markPayrollReviewed | view_salary | **approve_payroll + view_salary** (D-C تأییدشده) |
| openLoanModal، openAdjustmentModal، openBenefitModal | view_salary | ظاهراً فقط باز می‌کنند؛ خواندن بماند (بررسی نشده) |
| editAdjustment | view_salary | REQUIRES CODE VERIFICATION (نقش دقیق مشخص نشد) |

### ۲.۲ اثر روی Roleها (تغییر رفتار نسبت به امروز)
امروز این ۳۶ تابع برای همه باز است. بعد از اعمال: `hr_specialist` (فاقد `view_salary`، `delete_sensitive`، `write_discipline`، `edit_settings`، و بدون `approve_records`) نمی‌تواند عیدی/پرداخت/بیمه، حذف حساس، انضباط، تنظیمات و تأییدها را انجام دهد. `viewer` و `ceo` هیچ نوشتنی ندارند.

## ۳. Schema
فایل `schema-proposed-v2.sql`: ۲۷ جدول. تغییرات نسبت به v1: `roles.all_permissions`؛ `function_permission_map` با `operation` و `also_requires` و CHECK ضد view→write؛ `collection_specs`؛ CHECK ضد فیلد حساس در `employees.extra`؛ `employee_sensitive.settlement_amount`؛ `payroll_lock_amendments`؛ تریگر TRUNCATE برای Audit؛ و Seed واقعی (۳۴ Permission از کد + `approve_records`، Grantهای ۴ Role، ۳۶ تابع، ۲۵ Collection).

## ۴. قواعد Migration فیلدهای حساس — `employees`
فیلدهای واقعی فایل (اجتماع دو کارمند): **۴۱ فیلد**.

| دسته | فیلدها | مقصد | Permission |
|---|---|---|---|
| ستون عادی (۱۰) | id، full_name، department (→unit)، level، manager_id، hire_date، exit_date، phone، code، settlement_status | `employees` | view_personnel |
| **Tier A** (۶) | salary، settlement_amount | `employee_sensitive` | view_salary |
| | national_id | `employee_sensitive` | view_national_id |
| | bank، account، sheba | `employee_sensitive` | view_bank |
| **Tier B** (25) | married، children، probation_months، birth_date، real_start_date، education، field_of_study، skills، supplementary_insurance، gender، birthplace، military_status، emg_name، emg_phone، address، position، notes، resignation_date، exit_reason، exit_satisfaction، exit_interview_notes، exit_suggestions، equipment_checklist، documents_returned، exit_hr_note | `employees.extra` | view_personnel |

**نتیجه‌ی اسکن نمونه (مشاهده از داده):**
- کارمند `…y4x5`: 8 فیلد؛ Tier A موجود: salary؛ Tier B: 0 فیلد.
- کارمند `…whrx`: 41 فیلد؛ Tier A موجود: salary، national_id، bank، account، sheba، settlement_amount؛ Tier B: 25 فیلد.
- هیچ فیلد Tier A داخل یک شیء تو در تو (مثل `equipment_checklist`) دیده نشد؛ مقدار حساسی چاپ نشد.

**الگوریتم (DESIGNED / UNTESTED):**
1. هر فیلد Tier A از رکورد جدا و در `employee_sensitive` نوشته می‌شود؛ مقدار `''` به `NULL` (فقط در لایه‌ی Migration).
2. فیلد ناشناس (خارج از ۴۱ فیلد شناخته‌شده) **در `extra` نمی‌رود**؛ در گزارش `DATA_INSUFFICIENT: unknown_field` می‌آید تا انسان تصمیم بگیرد.
3. اسکن نهایی: کلیدهای `extra` (بازگشتی) با الگوی `salary|wage|national|nid|sheba|iban|account|bank|card` تطبیق داده می‌شوند؛ هر تطبیق = `Failed` برای آن رکورد (نه اصلاح خودکار).
4. DB: `CHECK employees_extra_no_sensitive`. API: همان کلیدها در نوشتن رد می‌شوند.
5. بعد از Migration: Query بررسی «هیچ ردیف `extra` با کلید حساس» و گزارش آن.

**فیلدهای حساس داخل Collectionهای دیگر (فیلتر پاسخ):** `contracts.salary_snapshot`، `candidates.proposed_salary` و مقادیر `jobHistory` وقتی `field=salary` فقط با `view_salary` برگردانده می‌شوند.

**تصمیم باز D-F:** Tier B شامل آدرس، تماس اضطراری، تاریخ تولد، وضعیت نظام‌وظیفه و یادداشت‌های مصاحبه‌ی خروج است. در کد، `viewer` هم `view_personnel` دارد. آیا مشاهده‌ی این‌ها واقعاً در UI فعلی محدود شده، بررسی نشد. Permission جدید نمی‌سازم مگر شما بخواهید.

## ۵. Validation Rules برای `hr_records` (و جدول‌های اختصاصی)
JSONB یعنی «Schema انعطاف‌پذیر»، نه «بدون Validation». قواعد عمومی (DESIGNED / UNTESTED):
- هر Collection فقط از `collection_specs` (FK). نام Collection نامعتبر → `422`.
- کلید خارج از `allowed_fields` → `422` با فهرست کلیدها؛ **هیچ** Mass Assignment (فیلدهای `id`، `version`، `created*`، `updated*`، `deleted*`، `legacy_id`، `employee_id` بعد از ایجاد، و وضعیت‌های تأیید فقط توسط Server/Action Endpoint).
- `employee_id` باید موجود و در Unit Scope باشد؛ نوع و فرمت (تاریخ ISO، مبلغ عدد صحیح غیرمنفی، ماه `YYYY-MM`) کنترل می‌شود؛ حداکثر اندازه‌ی Payload.
- مقادیر Enum (مثل `status`، `kind`) از داده‌ی واقعی دیده نشده‌اند → **REQUIRES REAL DATA**؛ تا آن زمان فقط نوع رشته و حداکثر طول.
- **Path A:** محاسبات (عیدی، Snapshot و …) سمت Client می‌مانند. Server مقدار ارسالی را ذخیره و Audit می‌کند ولی صحت آن را تضمین نمی‌کند (بازمحاسبه = پروژه‌ی آینده).
- فیلدها از **نوشته‌های ایجاد رکورد در کد** استخراج شده‌اند؛ مسیرهای ویرایش ممکن است کلید دیگری اضافه کنند → **REQUIRES CODE VERIFICATION** و Export کامل.

| Collection | ذخیره | خواندن | نوشتن (AND) | حذف | تأیید | قفل ماه | فیلدهای حساس (Permission) | فیلدهای مجاز |
|---|---|---|---|---|---|---|---|---|
| contracts | hr_records | view_personnel | write_records | delete_sensitive | — | NONE_OBSERVED | salary_snapshot→view_salary | employee_id، type، contract_no، start_date، end_date، position، salary_snapshot، notes |
| payTerms | hr_records | view_salary | write_personnel + view_salary | — | — | NONE_OBSERVED | — | employee_id، from، basis، taxMode، insured، amount، note |
| attendance | hr_records | view_personnel | write_records | delete_records | approve_records | NONE_OBSERVED | — | employee_id، type، date، minutes، note، justified |
| overtime | hr_records | view_personnel | write_records | delete_records | approve_records | HARD_BLOCK | — | employee_id، department، month، hours |
| disciplinary | hr_records | view_discipline | write_discipline | delete_sensitive | — | NONE_OBSERVED | — | employee_id، date، violation_type، description، action |
| sickLeaves | hr_records | view_confidential_docs | write_records | delete_sensitive | — | NONE_OBSERVED | — | employee_id، start_date، end_date، reason، doc_status، cert_no، sso_status، internal_status، file_ref، hr_note |
| incidents | hr_records | view_personnel | write_records | delete_sensitive | — | NONE_OBSERVED | — | employee_id، date، time، place، desc، kind، severity، witnesses، cause، immediate، treatment، absent_days، owner، files، final_note |
| laborActions | hr_records | view_personnel | write_records | delete_sensitive | approve_records | NONE_OBSERVED | — | employee_id، date، kind، action، reason، doc_ref، review، result، ref |
| eidiRecords | hr_records | view_salary | write_records + view_salary | delete_sensitive | — | NONE_OBSERVED | calc→view_salary؛ paid→view_salary؛ snapshot→view_salary | employee_id، year، calc، basis، days_worked، fraction، snapshot، paid، paid_date، status، note |
| settlements | hr_records | view_salary | write_personnel + view_salary | — | approve_payroll | NONE_OBSERVED | items→view_salary | employee_id، items، pay_date، receipt، approved_by، note، status |
| probations | hr_records | view_personnel | write_records | — | — | NONE_OBSERVED | — | employee_id، evaluation_status، result، decision_by، decision_date، note |
| insuranceMonths | hr_records | view_salary | write_records + view_salary | — | — | NONE_OBSERVED | — | month، status، sent_date، paid_date، receipt، note |
| payrollPayments | hr_records | view_salary | write_records + view_salary | delete_sensitive | — | NONE_OBSERVED | — | employee_id، month، amount، date، method، reference |
| loans | hr_records | view_salary | write_records + view_salary | delete_sensitive | — | AMEND_WITH_REASON | — | employee_id، type، amount، installments، start_date، notes |
| benefits | hr_records | view_salary | write_records + view_salary | delete_sensitive | — | NONE_OBSERVED | — | employee_id، type، amount، date، notes |
| trainings | hr_records | view_training | write_records | delete_records | — | NONE_OBSERVED | — | employee_id، title، date، score، note |
| evaluations | hr_records | view_personnel | write_records | delete_sensitive | — | NONE_OBSERVED | — | employee_id، position_at_eval، period، date، scores، final_score، notes |
| candidates | hr_records | view_recruitment | write_recruitment | write_recruitment | — | NONE_OBSERVED | proposed_salary→view_salary | name، phone، position، source، stage، applied_date، interviewer، interview1_date، interview1_department، interview1_interviewer، interview2_date، interview2_department، interview2_interviewer، proposed_salary، rejection_reason، notes |
| jobHistory | hr_records | view_personnel | — (Server) | — | — | NONE_OBSERVED | old_value|new_value (وقتی field=salary)→view_salary | — (فقط Server) |
| empExtra | hr_records | view_personnel | write_personnel | — | — | NONE_OBSERVED | — | ⚠ نامشخص (نوشتن غیرفعال) |
| monthlyFinancials | hr_records | view_economics | edit_economic_assumptions | edit_economic_assumptions | — | NONE_OBSERVED | — | month، revenue، netProfit، operatingProfit، fixedCosts، variableCosts، headcount، production، laborHours، notes |
| hiringScenarios | hr_records | view_economics | manage_scenarios | manage_scenarios | — | NONE_OBSERVED | — | ⚠ نامشخص (نوشتن غیرفعال) |
| turnoverCosts | hr_records | view_economics | edit_economic_assumptions | edit_economic_assumptions | — | NONE_OBSERVED | — | employee_id، recruitmentCost، interviewCost، onboardingCost، trainingCost، overtimeReplacementCost، adminExitCost، lostProductivityManual، rampUpDays، dailyProductivityGap، costPerProductivityUnit، notes |
| leaves | dedicated | view_leave | write_records | delete_records | — | NONE_OBSERVED | — | employee_id، type، start_date، end_date، advance، note |
| payrollAdjustments | dedicated | view_salary | write_records + view_salary | delete_sensitive | — | AMEND_WITH_REASON | — | employee_id، kind، type، type_label، calc، hours، days، amount، date، payroll_month، apply_to_payroll، notes |

`empExtra` و `hiringScenarios` کلیدهای پویا دارند (کد کلیدها را از شناسه‌ی فرم یا پارامتر می‌سازد)؛ تا استخراج کد، نوشتن آن‌ها در API **غیرفعال** می‌ماند.

## ۶. API Contract (DESIGNED)
خطاها: `{code,message,details}` با 400، 401، 403، 404، 409، 422، 423، 429، 500 و کدهای `PERMISSION_DENIED`، `UNIT_ACCESS_DENIED`، `VERSION_CONFLICT`، `PAYROLL_LOCKED`، `LOCK_AMENDMENT_REQUIRED`، `DATA_INSUFFICIENT`، `DOCUMENT_ACCESS_DENIED`. همه‌ی مسیرها Session و CSRF می‌خواهند (جز login). رکورد خارج از Unit → `404`.

| Endpoint | Permission (AND) | Scope | Audit | خطاهای خاص |
|---|---|---|---|---|
| POST /api/auth/login | — | — | login، login_failed | 401، 429 |
| POST /api/auth/logout، GET /api/auth/me | Session | — | logout | 401 |
| POST /api/auth/change-password | Session + رمز فعلی | خود کاربر | password_change | 401، 422 |
| GET/POST/PATCH /api/users، POST /api/users/{id}/reset-password | manage_users | — | create/edit/permission_change | 409 |
| GET/PUT /api/users/{id}/units | manage_users | — | permission_change | — |
| GET /api/{collection} | read_permission مجموعه | Unit + Record؛ فیلدهای حساس فیلتر | view_sensitive (برای حساس‌ها) | 403، 404 |
| POST /api/{collection} | write_permissions مجموعه | Unit | create | 403، 422، 423 |
| PATCH /api/{collection}/{id} (+ expected_version) | write_permissions | Unit + Record | edit (قبل/بعد) | 409، 422، 423 |
| DELETE /api/{collection}/{id} | delete_permission | Unit + Record | delete | 403، 423 |
| POST /api/{collection}/{id}/restore | delete_sensitive | Unit | restore | 404 |
| DELETE /api/{collection}/{id}/permanent | purge_data | Unit | permanent_delete | 403 |
| POST /api/{laborActions\|attendance\|overtime}/{id}/decision | approve_records | Unit + Record | approve، reject | 409، 423 |
| GET/PATCH /api/employees/{id} | view_personnel؛ فیلد حساس: Permission خودش | Unit | view_sensitive، edit | 403 |
| GET/PUT /api/payroll-locks/{month}/…/review،lock،unlock | approve_records+view_salary؛ lock: approve_payroll؛ unlock: purge_data | — | lock، unlock | 409، 423 |
| POST /api/payroll-locks/{month}/amendments | مطابق سیاست بخش ۸ | — | amendment | `LOCK_AMENDMENT_REQUIRED` |
| POST /api/documents، GET /api/documents/{id}/download | write_docs؛ دانلود: view_personnel (+view_confidential_docs برای محرمانه) | Unit + Document | upload، download | `DOCUMENT_ACCESS_DENIED` |
| GET/PUT /api/settings/{key} | خواندن: Session؛ نوشتن: edit_settings | Global/Unit | edit | 409 |
| GET/PATCH /api/alerts/{key} | manage_alerts | Unit | edit | — |
| GET /api/exports/{kind} | view_salary (+view_national_id برای بیمه) | Unit | export | 403 |
| GET /api/audit | view_audit | Unit | view_audit | — |
| POST /api/admin/migration/preview | admin | — | migration_preview | — |
| POST /api/admin/backup | backup | — | backup | — |

## ۷. Audit — Append-only کامل (DESIGNED / UNTESTED)
- **هیچ Endpoint** برای تغییر یا حذف Audit وجود ندارد، حتی برای admin؛ فقط `GET /api/audit`.
- DB: تریگر روی UPDATE/DELETE/TRUNCATE؛ نقش برنامه (`hr_app`) فقط INSERT و SELECT دارد (REVOKE).
- محدودیت صادقانه: ادمین سطح PostgreSQL یا دسترسی به فایل پشتیبان می‌تواند دست ببرد. کاهش ریسک: زنجیره‌ی Hash (`prev_hash/row_hash`) و خروجی دوره‌ای Audit به محل جدا. هر دو UNTESTED.

## ۸. قفل حقوق — Collectionهای تحت اثر (از کد، `IMPLEMENTED`)
**یافته‌ی مهم: در کد فعلی قفل حقوق در بیشتر موارد قفل سخت نیست.** پس بخش «رد همه‌ی نوشتن‌ها با ۴۲۳» در v1 با واقعیت کد نمی‌خواند و اصلاح می‌شود.

| سطح | موارد در کد | رفتار |
|---|---|---|
| **HARD_BLOCK** | `otSetStatus`، `otDel` (اضافه‌کاری ماه قفل‌شده)؛ `removeEmployee` (حذف دائمی کارمند) وقتی در Snapshot قفل‌شده است **یا** پرداخت حقوق دارد **یا** پرونده‌ی تسویه دارد | رد کامل |
| **AMEND_WITH_REASON** | `updateSalary` (حقوق پایه)، `submitLoan`، `removeLoan`، `submitAdjustment`، `removeAdjustment` | بعد از هشدار/Confirm مجاز؛ عدد فریزشده تغییر نمی‌کند؛ «اصلاحیه» در `lock.amendments` و Audit ثبت می‌شود |
| NONE_OBSERVED | بقیه (حضور و غیاب، مرخصی، عیدی، بیمه، پرداخت‌ها، مزایا، payTerms، …) | در اسکن کد، بررسی قفلی پیدا نشد (روی همه‌ی مسیرهای ممکن اطمینان کامل ندارم) |

- نمایش فیش و گزارش ماه قفل‌شده از `snapshot` می‌خوانَد (خطوط ۳۶۳۰، ۳۶۶۸، ۸۳۸۶، ۸۵۱۰، ۸۵۴۲).
- رکورد قفل نمونه Snapshot نسخه‌ی قدیمی است (`snapshotVersion` ندارد)؛ کد فعلی در Lock کلیدهای `snapshotVersion`، `workingDays`، `dailyHours`، `rulesYear`، `rulesSnapshot` را می‌نویسد. فهرست کامل Snapshotهای جانبی (تعطیلات/مرخصی/عیدی): **REQUIRES CODE VERIFICATION** (خط ۳۳۴۸ در بررسی من کامل دیده نشد).
- در Schema: ستون `collection_specs.lock_mode` و جدول `payroll_lock_amendments`.

**تصمیم D-E (مهم‌ترین):** Server همین رفتار فعلی را بازتولید کند (HARD برای اضافه‌کاری، «اصلاحیه» برای حقوق/وام/تعدیل) یا سخت‌تر شود؟ من تا تصمیم شما رفتار فعلی را نگه می‌دارم.

## ۹. وضعیت و تصمیم‌های باز
| موضوع | وضعیت |
|---|---|
| Permission Map، Schema v2، API، Validation، قواعد Migration | DESIGNED / UNTESTED |
| قفل: Collectionهای تحت اثر | IMPLEMENTED (مشاهده)؛ Snapshot جانبی: REQUIRES CODE VERIFICATION |
| Enumها، `documents`، `deletedRecords`، Allowlist کامل ویرایش | REQUIRES REAL DATA |
| allowlist `empExtra`، `hiringScenarios` | REQUIRES CODE VERIFICATION |
| هر اجرای PostgreSQL/FastAPI/Argon2/Concurrency/Backup | UNTESTED |

| کد | تصمیم لازم از شما |
|---|---|
| D-A | واگذاری `approve_records` به `hr_manager`؟ |
| D-B | `presExcuse` → `approve_records`؟ |
| D-C | `markPayrollReviewed` → `approve_records` یا `approve_payroll`؟ |
| D-D | Permission خواندن برای `sickLeaves` (view_confidential_docs)، `laborActions`/`incidents` (فعلاً view_personnel) |
| D-E | سیاست قفل: رفتار فعلی یا سخت‌تر |
| D-F | Tier B بدون Permission جدید بماند؟ |



## ۱۰. تصمیم‌های نهایی (اعمال‌شده در این نسخه)
| کد | تصمیم | اثر |
|---|---|---|
| D-A | `approve_records` → `hr_manager` | ACTIVE در Seed؛ فقط برای عملیات واقعاً تأییدی (`laSet`، `attSetHr`، `presExcuse`، `otSetStatus`) |
| D-B | `presExcuse` → `approve_records` | اعمال شد |
| D-C | `markPayrollReviewed` → `approve_payroll` (+ `view_salary`) | جایگزین پیشنهاد بخش ۲.۱؛ اعمال شد |
| D-D | `sickLeaves` → `view_confidential_docs`؛ `laborActions`، `incidents` → `view_personnel` | همان مقدار `collection_specs` |
| D-E | قفل حقوق = بازتولید رفتار فعلی بدون سخت‌گیری جدید؛ Snapshotهای جانبی REQUIRES CODE VERIFICATION | `locks.py`؛ Collectionهای NONE_OBSERVED قفل جدید نمی‌گیرند |
| D-F | Tier B بدون Permission جدید، با `view_personnel` | همچنان Permission AND Unit Scope AND Record Scope |
| — | `empExtra`، `hiringScenarios`: نوشتن API غیرفعال؛ فیلد ناشناس = `DATA_INSUFFICIENT` | در `collection_specs` و `validation.py` |

این تأیید فقط برای Design/Schema v2 و شروع Implementation است. اجرای Migration و اتصال `dashboard-41.html` هنوز تأیید نشده‌اند.

