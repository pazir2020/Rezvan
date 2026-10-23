import React from 'react';
import { Employee, OvenOrder, MonthlyFinancial, UserSession } from '../../types';
import { formatTomans, toPersianDigits, formatPercent } from '../../utils/formatters';
import { REZVAN_ASSETS } from '../../data/assets';
import {
  Users,
  Banknote,
  Flame,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  ChevronLeft,
  Calendar,
  Layers
} from 'lucide-react';

interface CeoDashboardViewProps {
  employees: Employee[];
  ovenOrders: OvenOrder[];
  financials: MonthlyFinancial[];
  currentSession: UserSession;
  onNavigate: (key: any) => void;
}

export const CeoDashboardView: React.FC<CeoDashboardViewProps> = ({
  employees,
  ovenOrders,
  financials,
  currentSession,
  onNavigate
}) => {
  const currentMonth = financials[financials.length - 1];
  const prevMonth = financials[financials.length - 2];
  const activeEmployees = employees.filter((e) => e.status !== 'تسویه‌شده');
  const activeOrders = ovenOrders.filter((o) => o.masonryStatus !== 'finished');

  // Forge & Masonry active load
  const forge1Orders = ovenOrders.filter((o) => o.forgeTeam === 1 && o.forgeStatus !== 'ready' && o.forgeStatus !== 'accepted');
  const forge2Orders = ovenOrders.filter((o) => o.forgeTeam === 2 && o.forgeStatus !== 'ready' && o.forgeStatus !== 'accepted');
  const readyChassisWaiting = ovenOrders.filter((o) => o.forgeStatus === 'ready' && o.masonryStatus === 'pending');

  return (
    <div className="space-y-6">
      {/* Top Welcome & Executive Summary Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
              مرکز فرماندهی ارشد
            </span>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-slate-600 font-mono">دوره تحلیلی: مهر ۱۴۰۵ (سال کاری جاری)</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            داشبورد تصمیم‌گیری مدیرعامل و پایش عملیات تنورسازی رضوان
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            گزارش یکپارچه منابع انسانی، وضعیت تولید شاسی‌ها و دیگ‌های تنور، شاخص‌های اقتصادی و سودآوری ماهانه
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('scenarios')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>شبیه‌ساز سناریوهای مالی</span>
          </button>
          <button
            onClick={() => onNavigate('oven-tracking')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            <span>رهگیری تنورها ({toPersianDigits(activeOrders.length)})</span>
          </button>
        </div>
      </div>

      {/* 4 Main Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Headcount & FTE */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">کل پرسنل فعال (FTE)</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {toPersianDigits(activeEmployees.length)}
            </span>
            <span className="text-xs text-slate-500">نفر تمام‌وقت</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>آهنگری: ۸ نفر (۲ تیم)</span>
            <span>بنایی: ۱۲ نفر (۳ تیم)</span>
          </div>
        </div>

        {/* Metric 2: Monthly Profit / Loss with verified negative value support */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">سود خالص ماه مهر (ماه جاری)</span>
            <div className={`p-2 rounded-lg ${currentMonth.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold tabular-nums ${currentMonth.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatTomans(currentMonth.netProfit)}
            </span>
          </div>
          <div className="mt-2 text-[11px] flex items-center gap-1 border-t border-slate-100 pt-2">
            {currentMonth.netProfit >= prevMonth.netProfit ? (
              <span className="text-emerald-700 flex items-center font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                رشد نسبت به زیان شهریور ({formatTomans(prevMonth.netProfit)})
              </span>
            ) : (
              <span className="text-rose-700 flex items-center font-medium">
                <ArrowDownRight className="w-3.5 h-3.5" />
                افت نسبت به ماه قبل
              </span>
            )}
          </div>
        </div>

        {/* Metric 3: Total Labor Cost */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">هزینه کامل نیروی انسانی</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {formatTomans(currentMonth.laborCosts)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>نسبت به درآمد: <strong>{formatPercent(currentMonth.laborCostToRevenuePct)}</strong></span>
            <span className="text-emerald-700 font-medium">وضعیت مطلوب (&lt;۳۵٪)</span>
          </div>
        </div>

        {/* Metric 4: Active Oven Manufacturing Orders */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">سفارشات در دست ساخت</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {toPersianDigits(activeOrders.length)}
            </span>
            <span className="text-xs text-slate-500">دستگاه تنور فعال</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-amber-800 font-medium">
              {toPersianDigits(readyChassisWaiting.length)} شاسی در صف تحویل به بنایی
            </span>
            <span>تولید ماه: {toPersianDigits(currentMonth.productionCount)} تنور</span>
          </div>
        </div>
      </div>

      {/* Visual Showcase: Workshop Craftsmanship & Real Factory View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Large Sangak Oven */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs group">
          <div className="relative aspect-16/9 bg-slate-100 overflow-hidden">
            <img
              src={REZVAN_ASSETS.ovenLarge}
              alt="تنور سنگک متحرک بزرگ رضوان"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3.5 text-white">
              <span className="text-[10px] bg-blue-600/90 text-white font-semibold px-2 py-0.5 rounded w-fit mb-1">
                محصول شاخص کاتالوگ
              </span>
              <h4 className="text-sm font-bold">تنور سنگک متحرک بزرگ رضوان</h4>
              <p className="text-[11px] text-slate-200 line-clamp-1">
                اسکلت ناودانی سنگین دوبل، عایق‌کاری پشم سرامیک، نمای آجر قزاقی سنتی
              </p>
            </div>
          </div>
          <div className="p-3 text-xs text-slate-600 flex items-center justify-between">
            <span>تیم سازنده: <strong>تیم ۱ آهنگری + تیم ۱ بنایی</strong></span>
            <span className="text-emerald-700 font-medium">تست حرارتی پاس شده</span>
          </div>
        </div>

        {/* Card 2: Forge Workshop */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs group">
          <div className="relative aspect-16/9 bg-slate-100 overflow-hidden">
            <img
              src={REZVAN_ASSETS.forgeWorkshop}
              alt="کارگاه آهنگری و ساخت شاسی تنور"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3.5 text-white">
              <span className="text-[10px] bg-amber-600/90 text-white font-semibold px-2 py-0.5 rounded w-fit mb-1">
                واحد ساخت شاسی
              </span>
              <h4 className="text-sm font-bold">کارگاه آهنگری (۲ تیم ۴ نفره مستقل)</h4>
              <p className="text-[11px] text-slate-200 line-clamp-1">
                جوشکاری CO2، شاسی‌سازی تراز، نصب محور و سیستم متحرک
              </p>
            </div>
          </div>
          <div className="p-3 text-xs text-slate-600 flex items-center justify-between">
            <span>ظرفیت همزمان: <strong>۴ شاسی در هفته</strong></span>
            <span className="text-blue-700 font-medium">سرپرستان: ناظمی / اکبری</span>
          </div>
        </div>

        {/* Card 3: Masonry & Refractory Brickwork */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs group">
          <div className="relative aspect-16/9 bg-slate-100 overflow-hidden">
            <img
              src={REZVAN_ASSETS.masonryCraft}
              alt="بنایی و طاق نسوز تنور سنگک"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3.5 text-white">
              <span className="text-[10px] bg-emerald-700/90 text-white font-semibold px-2 py-0.5 rounded w-fit mb-1">
                واحد بنایی و نماکاری
              </span>
              <h4 className="text-sm font-bold">طاق ضربی و عایق‌کاری (۳ تیم ۴ نفره)</h4>
              <p className="text-[11px] text-slate-200 line-clamp-1">
                آجر نسوز شاموتی، خاک نسوز، سیمان‌کاری لیسه‌ای و نماکاری سنتی
              </p>
            </div>
          </div>
          <div className="p-3 text-xs text-slate-600 flex items-center justify-between">
            <span>مراحل چهارگانه: <strong>آجر، سیمان، عایق، نما</strong></span>
            <span className="text-emerald-700 font-medium">سرپرست: احمد رستمی</span>
          </div>
        </div>
      </div>

      {/* Workshop Teams Operations Status Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">
              پایش بلادرنگ وضعیت ۲ تیم آهنگری و ۳ تیم بنایی رضوان
            </h3>
          </div>
          <button
            onClick={() => onNavigate('oven-tracking')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
          >
            <span>مشاهده جزئیات سفارشات و تحویل شاسی</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          {/* Forge Team 1 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">آهنگری تیم ۱</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">۴ نفر</span>
            </div>
            <div className="text-[11px] text-slate-500">سرپرست: جواد ناظمی</div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">شاسی در حال ساخت:</span>
              <strong className="text-amber-700 font-bold">{toPersianDigits(forge1Orders.length)}</strong>
            </div>
            <div className="text-[10px] text-emerald-700 bg-emerald-50 p-1.5 rounded">
              کارانه ماه قبل: ۶۴ امتیاز (+۱۴M تومان)
            </div>
          </div>

          {/* Forge Team 2 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">آهنگری تیم ۲</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">۴ نفر</span>
            </div>
            <div className="text-[11px] text-slate-500">سرپرست: حمید اکبری</div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">شاسی در حال ساخت:</span>
              <strong className="text-amber-700 font-bold">{toPersianDigits(forge2Orders.length)}</strong>
            </div>
            <div className="text-[10px] text-slate-600 bg-slate-100 p-1.5 rounded">
              آماده تحویل شاسی به تبریز
            </div>
          </div>

          {/* Masonry Team 1 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">بنایی تیم ۱</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">۴ نفر</span>
            </div>
            <div className="text-[11px] text-slate-500">سرپرست: احمد رستمی</div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">وضعیت فعلی:</span>
              <span className="text-amber-800 font-bold">آجرچینی و عایق</span>
            </div>
            <div className="text-[10px] text-slate-600 bg-slate-100 p-1.5 rounded">
              تنور بزرگ سفارش کرج
            </div>
          </div>

          {/* Masonry Team 2 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">بنایی تیم ۲</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">۴ نفر</span>
            </div>
            <div className="text-[11px] text-slate-500">سرپرست: صادق فراهانی</div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">وضعیت فعلی:</span>
              <span className="text-emerald-700 font-bold">اتمام نماکاری</span>
            </div>
            <div className="text-[10px] text-emerald-700 bg-emerald-50 p-1.5 rounded">
              کارانه تاییدشده: ۵۸ امتیاز (+۸M)
            </div>
          </div>

          {/* Masonry Team 3 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">بنایی تیم ۳</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">۴ نفر</span>
            </div>
            <div className="text-[11px] text-slate-500">سرپرست: مصطفی امینی</div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-600">وضعیت فعلی:</span>
              <span className="text-slate-600 font-bold">در انتظار شاسی</span>
            </div>
            <div className="text-[10px] text-slate-600 bg-slate-100 p-1.5 rounded">
              سفارش هتل استقلال در نوبت
            </div>
          </div>
        </div>
      </div>

      {/* Action Items & Urgent Executive Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Urgent Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>اقدامات نیازمند تصمیم‌گیری مدیرعامل و مدیریت</span>
            </h3>
            <span className="text-[11px] text-slate-400">۳ مورد مهم</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/40 flex items-start justify-between gap-3">
              <div>
                <strong className="text-slate-900 block font-bold">
                  انقضای قراردادهای یک‌ماهه استادکاران (جواد ناظمی و احمد رستمی)
                </strong>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  پایان دوره قرارداد جاری تا ۱۰ روز آینده؛ نیازمند صدور حکم تمدید ماهانه جدید.
                </p>
              </div>
              <button
                onClick={() => onNavigate('contracts')}
                className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 shrink-0 cursor-pointer"
              >
                بررسی قرارداد
              </button>
            </div>

            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/40 flex items-start justify-between gap-3">
              <div>
                <strong className="text-slate-900 block font-bold">
                  ارزیابی دوره آزمایشی ۲ ماهه مرتضی عباسی (آهنگری تیم ۱)
                </strong>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  اتمام ۶۰ روز تقویمی در تاریخ ۱۴۰۵/۰۸/۱۵؛ نظر سرپرست: تایید مهارت جوشکاری و تمدید همکاری.
                </p>
              </div>
              <button
                onClick={() => onNavigate('contracts')}
                className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 shrink-0 cursor-pointer"
              >
                ثبت تصمیم
              </button>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
              <div>
                <strong className="text-slate-900 block font-bold">
                  بررسی پیش‌نویس سناریوی افزایش ۲۰٪ حق فنی استادکاران
                </strong>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  اثر مالی ماهانه ۹.۴ میلیون تومان روی ۸ استادکار؛ بدون تغییر در فیش تا تایید نهایی.
                </p>
              </div>
              <button
                onClick={() => onNavigate('scenarios')}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 shrink-0 cursor-pointer"
              >
                مشاهده سناریو
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links & Safety Protocol */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>پروتکل اطمینان و حفظ اطلاعات نسخه اولیه</span>
            </h3>
            <span className="text-[11px] text-emerald-700 font-mono">وضعیت سیستم: پایدار</span>
          </div>

          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
              <strong>اصل راهبردی مدیرعامل:</strong> هیچ ادعایی درباره عملکرد یا موفقیت قابلیتی نمی‌شود مگر اینکه با آزمون‌های ریاضی و کدهای بک‌اند راستی‌آزمایی شده باشد.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="p-2.5 rounded border border-slate-200 bg-white">
                <span className="font-bold text-slate-800 block">پایگاه داده اصلی:</span>
                <span className="text-slate-500">بدون حذف، تغییر ساختار یا مهاجرت تا تایید صریح.</span>
              </div>
              <div className="p-2.5 rounded border border-slate-200 bg-white">
                <span className="font-bold text-slate-800 block">کارانه اختیاری:</span>
                <span className="text-slate-500">امکان پیش‌نمایش، تایید مستقل و بازگشت کامل.</span>
              </div>
            </div>
            <div className="pt-2 text-center">
              <button
                onClick={() => onNavigate('audit-docs')}
                className="w-full py-2 bg-blue-50 text-blue-700 border border-blue-200 font-semibold rounded-lg hover:bg-blue-100 transition-colors cursor-pointer text-xs"
              >
                مشاهده جدول ممیزی تفصیلی و حل مشکلات (خروجی اول تا پنجم)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
