export interface SourceFileItem {
  id: string;
  name: string;
  category: 'react-dashboard' | 'lan-frontend' | 'backend-api' | 'database' | 'scripts' | 'docs';
  categoryLabel: string;
  relativePath: string;
  fetchUrl: string;
  language: string;
  description: string;
  badge?: string;
}

export const SOURCE_CATALOG: SourceFileItem[] = [
  // React Modern Dashboard
  {
    id: 'react-app',
    name: 'App.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/App.tsx',
    fetchUrl: '/source/src/App.tsx',
    language: 'typescript',
    description: 'نقطه ورود مرکزی داشبورد، مدیریت نشست‌های کاربری بر مبنای نقش (RBAC) و کنترل وضعیت سراسری سامانه',
    badge: 'Core Controller'
  },
  {
    id: 'react-ceo',
    name: 'CeoDashboardView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/CeoDashboardView.tsx',
    fetchUrl: '/source/src/components/views/CeoDashboardView.tsx',
    language: 'typescript',
    description: 'کاکپیت تصمیم‌گیری مدیرعامل، پایش سود و زیان ماهانه با پشتیبانی از سود منفی، کنترل ظرفیت کارگاه و شاخص‌های FTE',
    badge: 'CEO Cockpit'
  },
  {
    id: 'react-oven',
    name: 'OvenTrackingView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/OvenTrackingView.tsx',
    fetchUrl: '/source/src/components/views/OvenTrackingView.tsx',
    language: 'typescript',
    description: 'رهگیری فرآیند ساخت تنورهای صنعتی، تفکیک ۲ تیم آهنگری و ۳ تیم بنایی، و ۴ مرحله مجزای بنایی بدون زمان‌های استاندارد ساختگی',
    badge: 'Shop Floor Tracker'
  },
  {
    id: 'react-kpi',
    name: 'ProductionKpiView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/ProductionKpiView.tsx',
    fetchUrl: '/source/src/components/views/ProductionKpiView.tsx',
    language: 'typescript',
    description: 'پیاده‌سازی دقیق منطق کارانه رضوان با حدنصاب ۵۰ امتیاز، تفکیک ۶۰٪ تیمی و ۴۰٪ انفرادی، و قابلیت انتقال اختیاری و برگشت (Revert)',
    badge: 'Rezvan Bonus Engine'
  },
  {
    id: 'react-payroll',
    name: 'PayrollManagementView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/PayrollManagementView.tsx',
    fetchUrl: '/source/src/components/views/PayrollManagementView.tsx',
    language: 'typescript',
    description: 'محاسبه فیش حقوقی، تفکیک حق فنی از پایه، کسر بیمه ۷٪ کارگر، محاسبه بیمه ۲۳٪ کارفرما، مالیات پله‌ای و صدور فیش چاپی رسمی',
    badge: 'Payroll & Payslip'
  },
  {
    id: 'react-scenarios',
    name: 'FinancialScenariosView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/FinancialScenariosView.tsx',
    fetchUrl: '/source/src/components/views/FinancialScenariosView.tsx',
    language: 'typescript',
    description: 'شبیه‌ساز بازگشت سرمایه استخدام با مدل Ramp-up خطی ۱۲ ماهه و شبیه‌ساز اثر افزایش حقوق و حق فنی بر سودآوری شرکت',
    badge: 'ROI Simulator'
  },
  {
    id: 'react-economics',
    name: 'HrEconomicsView.tsx',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/components/views/HrEconomicsView.tsx',
    fetchUrl: '/source/src/components/views/HrEconomicsView.tsx',
    language: 'typescript',
    description: 'تحلیل اقتصاد نیروی انسانی، نرخ خروج، هزینه جایگزینی، هزینه ساعت کاری پرسنل و تطبیق صورت سود و زیان شرکت',
    badge: 'HR Economics'
  },
  {
    id: 'react-mockdata',
    name: 'mockData.ts',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/data/mockData.ts',
    fetchUrl: '/source/src/data/mockData.ts',
    language: 'typescript',
    description: 'بانک داده‌های مهندسی شامل اطلاعات ۳۴ پرسنل، ۵ تیم کارگاهی، سفارشات فعال تنور و تاریخچه مالی ماهانه',
    badge: 'Data Store'
  },
  {
    id: 'react-types',
    name: 'types/index.ts',
    category: 'react-dashboard',
    categoryLabel: 'سورس داشبورد مدرن (React)',
    relativePath: 'src/types/index.ts',
    fetchUrl: '/source/src/types/index.ts',
    language: 'typescript',
    description: 'اینترفیس‌ها و تعاریف تایپ‌های دامنه‌ای پرسنل، کارانه، مراحل تنورسازی و ارزیابی تیمی',
    badge: 'Domain Models'
  },

  // Standalone LAN Frontend Dashboard
  {
    id: 'lan-dashboard-html',
    name: 'dashboard-41.html',
    category: 'lan-frontend',
    categoryLabel: 'سورس فرانت‌اند مستقل LAN (لوکال)',
    relativePath: 'frontend/dashboard-41.html',
    fetchUrl: '/lan/dashboard-41.html',
    language: 'html',
    description: 'تک‌صفحه کامل وب فرانت‌اند مستقل جهت اجرا روی شبکه محلی کارگاه رضوان بدون نیاز به اینترنت و بدون فریم‌ورک‌های سنگین',
    badge: 'Standalone LAN Dashboard'
  },
  {
    id: 'lan-oven-js',
    name: 'oven-tracking.js',
    category: 'lan-frontend',
    categoryLabel: 'سورس فرانت‌اند مستقل LAN (لوکال)',
    relativePath: 'frontend/oven-tracking.js',
    fetchUrl: '/lan/oven-tracking.js',
    language: 'javascript',
    description: 'اسکریپت کلاینت فرانت‌اند LAN برای مدیریت جریان تحویل شاسی از آهنگری به بنایی و ثبت مراحل ۴ گانه',
    badge: 'Workshop Logic'
  },
  {
    id: 'lan-kpi-js',
    name: 'kpi-team.js',
    category: 'lan-frontend',
    categoryLabel: 'سورس فرانت‌اند مستقل LAN (لوکال)',
    relativePath: 'frontend/kpi-team.js',
    fetchUrl: '/lan/kpi-team.js',
    language: 'javascript',
    description: 'اسکریپت کلاینت فرانت‌اند LAN برای ارزیابی عملکرد تیمی، کنترل حدنصاب ۵۰ امتیاز و محاسبه تسهیم ۶۰/۴۰',
    badge: 'Bonus Logic'
  },
  {
    id: 'lan-theme-css',
    name: 'rezvan-unified-theme.css',
    category: 'lan-frontend',
    categoryLabel: 'سورس فرانت‌اند مستقل LAN (لوکال)',
    relativePath: 'frontend/rezvan-unified-theme.css',
    fetchUrl: '/lan/rezvan-unified-theme.css',
    language: 'css',
    description: 'استایل‌شیت یکپارچه و بهینه‌سازی‌شده برای نمایش راست‌چین صنعتی در محیط شبکه کارگاه',
    badge: 'Design System CSS'
  },
  {
    id: 'lan-build-script',
    name: 'build_frontend.py',
    category: 'lan-frontend',
    categoryLabel: 'سورس فرانت‌اند مستقل LAN (لوکال)',
    relativePath: 'frontend/build_frontend.py',
    fetchUrl: '/source/frontend/build_frontend.py',
    language: 'python',
    description: 'اسکریپت تضمین کیفیت و راستی‌آزمایی ماژول‌های فرانت‌اند قبل از استقرار روی شبکه داخلی',
    badge: 'QA Build Tool'
  },

  // Backend Python / FastAPI
  {
    id: 'py-main',
    name: 'main.py',
    category: 'backend-api',
    categoryLabel: 'سورس بک‌اند و وب‌سرویس‌ها (Python/FastAPI)',
    relativePath: 'backend/app/main.py',
    fetchUrl: '/source/backend/app/main.py',
    language: 'python',
    description: 'نقطه ورود اپلیکیشن FastAPI، پیکربندی CORS، مدیریت خطاهای سراسری و ثبت روت‌های ماژول‌های کارگاهی و پرسنلی',
    badge: 'FastAPI Entry Point'
  },
  {
    id: 'py-kpi-api',
    name: 'kpi_payroll_api.py',
    category: 'backend-api',
    categoryLabel: 'سورس بک‌اند و وب‌سرویس‌ها (Python/FastAPI)',
    relativePath: 'backend/app/routers/kpi_payroll_api.py',
    fetchUrl: '/source/backend/app/routers/kpi_payroll_api.py',
    language: 'python',
    description: 'اندپوینت‌های بک‌اند برای پیش‌نمایش، انتقال اختیاری و لغو (Revert) کارانه تولید به فیش حقوقی',
    badge: 'API Endpoint'
  },
  {
    id: 'py-ovens-api',
    name: 'oven_orders_api.py',
    category: 'backend-api',
    categoryLabel: 'سورس بک‌اند و وب‌سرویس‌ها (Python/FastAPI)',
    relativePath: 'backend/app/routers/oven_orders_api.py',
    fetchUrl: '/source/backend/app/routers/oven_orders_api.py',
    language: 'python',
    description: 'اندپوینت‌های رهگیری و تغییر وضعیت سفارشات شاسی و دیگ تنورهای سنتی و صنعتی رضوان',
    badge: 'API Endpoint'
  },
  {
    id: 'py-payroll-api',
    name: 'payroll_api.py',
    category: 'backend-api',
    categoryLabel: 'سورس بک‌اند و وب‌سرویس‌ها (Python/FastAPI)',
    relativePath: 'backend/app/routers/payroll_api.py',
    fetchUrl: '/source/backend/app/routers/payroll_api.py',
    language: 'python',
    description: 'اندپوینت‌های صدور فیش، محاسبات مالیات و بیمه سهم کارگر و کارفرما بر اساس فرمول‌های تاییدشده',
    badge: 'API Endpoint'
  },
  {
    id: 'py-models',
    name: 'models/hr.py',
    category: 'backend-api',
    categoryLabel: 'سورس بک‌اند و وب‌سرویس‌ها (Python/FastAPI)',
    relativePath: 'backend/app/models/hr.py',
    fetchUrl: '/source/backend/app/models/hr.py',
    language: 'python',
    description: 'مدل‌های داده‌ای Pydantic برای اعتبارسنجی ورودی‌ها و ساختار پایگاه داده',
    badge: 'Pydantic Models'
  },

  // PostgreSQL Database Schema
  {
    id: 'db-schema',
    name: 'schema.sql',
    category: 'database',
    categoryLabel: 'ساختار پایگاه داده (PostgreSQL)',
    relativePath: 'db/schema.sql',
    fetchUrl: '/source/db/schema.sql',
    language: 'sql',
    description: 'تعریف جداول پرسنلی، احکام، سفارشات تنور، ارزیابی کارانه، صورت‌های مالی ماهانه و لاگ سوابق تغییرات',
    badge: 'Database Schema'
  },
  {
    id: 'db-migration',
    name: '1405_initial.sql',
    category: 'database',
    categoryLabel: 'ساختار پایگاه داده (PostgreSQL)',
    relativePath: 'db/migrations/1405_initial.sql',
    fetchUrl: '/source/db/migrations/1405_initial.sql',
    language: 'sql',
    description: 'اسکریپت مهاجرت ساختاری نسخه ۱۴۰۵ جهت اعمال فیلدهای جدید (دوره آزمایشی، حق فنی، وضعیت تنورها) بدون حذف داده‌های قبلی',
    badge: 'Migration'
  },

  // LAN Scripts
  {
    id: 'script-run',
    name: 'run-lan.bat',
    category: 'scripts',
    categoryLabel: 'اسکریپت‌های استقرار شبکه محلی (LAN)',
    relativePath: 'scripts/run-lan.bat',
    fetchUrl: '/source/scripts/run-lan.bat',
    language: 'batch',
    description: 'راه‌اندازی سرور روی پورت ۸۰۰۰ با آی‌پی 0.0.0.0 جهت دسترسی کلاینت‌های اداری و کارگاهی در شبکه محلی',
    badge: 'LAN Launcher'
  },
  {
    id: 'script-backup',
    name: 'backup.bat',
    category: 'scripts',
    categoryLabel: 'اسکریپت‌های استقرار شبکه محلی (LAN)',
    relativePath: 'scripts/backup.bat',
    fetchUrl: '/source/scripts/backup.bat',
    language: 'batch',
    description: 'تهیه پشتیبان خودکار روزانه از پایگاه داده PostgreSQL و پوشه اسناد شرکت رضوان با برچسب زمانی',
    badge: 'Backup'
  },
  {
    id: 'script-verify',
    name: 'verify-backup.bat',
    category: 'scripts',
    categoryLabel: 'اسکریپت‌های استقرار شبکه محلی (LAN)',
    relativePath: 'scripts/verify-backup.bat',
    fetchUrl: '/source/scripts/verify-backup.bat',
    language: 'batch',
    description: 'تست یکپارچگی و بازگشت آزمایشی فایل پشتیبان برای اطمینان از سلامت داده‌های شرکت',
    badge: 'Integrity Check'
  },

  // Official Audit Docs
  {
    id: 'doc-audit',
    name: 'AUDIT-FULL-REPORT-FA.md',
    category: 'docs',
    categoryLabel: 'مستندات ممیزی و فنی',
    relativePath: 'AUDIT-FULL-REPORT-FA.md',
    fetchUrl: '/source/AUDIT-FULL-REPORT-FA.md',
    language: 'markdown',
    description: 'گزارش رسمی و جامع ممیزی ۹ مرحله‌ای، شرح باگ‌های شناسایی‌شده و راهکارهای مهندسی ارتقا',
    badge: 'Full Audit Report'
  },
  {
    id: 'doc-upgrade',
    name: 'UPGRADE-AND-INSTALL-GUIDE-FA.md',
    category: 'docs',
    categoryLabel: 'مستندات ممیزی و فنی',
    relativePath: 'UPGRADE-AND-INSTALL-GUIDE-FA.md',
    fetchUrl: '/source/UPGRADE-AND-INSTALL-GUIDE-FA.md',
    language: 'markdown',
    description: 'راهنمای گام‌به‌گام ارتقای امن بدون تخریب داده‌های موجود با استفاده از init-db و بک‌آپ گیری',
    badge: 'Upgrade Protocol'
  },
  {
    id: 'doc-changelog',
    name: 'CHANGELOG-1405.md',
    category: 'docs',
    categoryLabel: 'مستندات ممیزی و فنی',
    relativePath: 'CHANGELOG-1405.md',
    fetchUrl: '/source/CHANGELOG-1405.md',
    language: 'markdown',
    description: 'سیاهه رسمی تغییرات و اصلاحات فرمولی و رابط کاربری نسخه ۱۴۰۵.۱۰.۰',
    badge: 'Changelog'
  }
];
