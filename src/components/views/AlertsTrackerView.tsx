import React from 'react';
import { toPersianDigits } from '../../utils/formatters';
import { BellRing, AlertTriangle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';

export const AlertsTrackerView: React.FC = () => {
  const alerts = [
    {
      id: 'alt-1',
      type: 'قرارداد',
      title: 'انقضای قرارداد ماهانه جواد ناظمی (سرپرست آهنگری ۱)',
      dueDate: '1405/07/30 (تا ۸ روز دیگر)',
      severity: 'ضروری',
      action: 'صدور قرارداد تمدیدی مهر به آبان در کارتابل اداری'
    },
    {
      id: 'alt-2',
      type: 'قرارداد',
      title: 'انقضای قرارداد ماهانه احمد رستمی (سرپرست بنایی ۱)',
      dueDate: '1405/07/30 (تا ۸ روز دیگر)',
      severity: 'ضروری',
      action: 'تمدید ماهانه پیرو تکمیل سفارش البرز'
    },
    {
      id: 'alt-3',
      type: 'دوره آزمایشی',
      title: 'پایان دوره آزمایشی ۲ ماهه مرتضی عباسی (آهنگری)',
      dueDate: '1405/08/15 (تا ۲۳ روز دیگر)',
      severity: 'مهم',
      action: 'تکمیل فرم ارزیابی ۶۰ روزه توسط سرپرست تیم'
    },
    {
      id: 'alt-4',
      type: 'کنترل کیفیت',
      title: 'تست تراز شاسی تنور سنگک هتل استقلال',
      dueDate: '1405/07/26',
      severity: 'عادی',
      action: 'انجام تست ابعادی قبل از تحویل به بنایی تیم ۳'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
            <BellRing className="w-5 h-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            مرکز هشدارها و پیگیری اقدامات فوری منابع انسانی و کارگاه
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          پایش زمان‌بندی قراردادها، تصمیم‌گیری دوره‌های آزمایشی، ایمنی کارگاهی و تعهدات تحویل تنور
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {alerts.map((alt) => (
          <div
            key={alt.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    alt.severity === 'ضروری'
                      ? 'bg-rose-100 text-rose-800'
                      : alt.severity === 'مهم'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {alt.type} · {alt.severity}
                </span>
                <span className="font-bold text-slate-900 text-sm">{alt.title}</span>
              </div>
              <div className="text-slate-600">
                <strong>مهلت اقدام:</strong> {alt.dueDate} | <strong>دستور کار:</strong> {alt.action}
              </div>
            </div>

            <button className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold shrink-0 cursor-pointer transition-colors shadow-xs">
              پیگیری اقدام
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
