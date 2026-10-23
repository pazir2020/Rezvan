import React from 'react';
import { MonthlyFinancial, Employee } from '../../types';
import { formatTomans, toPersianDigits, formatPercent } from '../../utils/formatters';
import { TrendingUp, Users, DollarSign, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

interface HrEconomicsViewProps {
  financials: MonthlyFinancial[];
  employees: Employee[];
}

export const HrEconomicsView: React.FC<HrEconomicsViewProps> = ({ financials, employees }) => {
  const currentMonth = financials[financials.length - 1];
  const activeCount = employees.filter((e) => e.status !== 'تسویه‌شده').length;
  const totalFte = employees.reduce((acc, e) => acc + (e.fte || 1.0), 0);

  // Average labor cost per employee
  const avgCostPerEmployee = currentMonth.laborCosts / (activeCount || 1);
  const avgCostPerHour = currentMonth.laborCosts / (currentMonth.laborHours || 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
            <TrendingUp className="w-5 h-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            اقتصاد منابع انسانی، FTE و تحلیل سود و زیان ماهانه
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
          تحلیل بهره‌وری معادل تمام‌وقت (FTE)، هزینه تمام‌شده واقعی هر ساعت کارکرد، سهم نیروی انسانی از درآمد و پایش سود یا زیان واقعی سازمان.
        </p>
      </div>

      {/* Main KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-slate-500 block text-[11px]">مجموع معادل تمام‌وقت (FTE):</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {toPersianDigits(totalFte.toFixed(1))}
            </span>
            <span className="text-slate-500 text-xs">FTE</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-2">بر مبنای ۳۴ پرسنل کارگاه و اداری</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-slate-500 block text-[11px]">هزینه تمام‌شده هر ساعت کارکرد:</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-blue-900 tabular-nums">
              {formatTomans(avgCostPerHour)}
            </span>
            <span className="text-slate-500 text-xs">/ ساعت</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-2">
            مجموع کارکرد ماه: {toPersianDigits(currentMonth.laborHours)} ساعت
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-slate-500 block text-[11px]">متوسط هزینه ماهانه هر پرسنل:</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {formatTomans(avgCostPerEmployee)}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-2">شامل حقوق، حق فنی، مزایا و بیمه کارفرما</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-slate-500 block text-[11px]">نسبت هزینه نیروی انسانی به درآمد:</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-emerald-800 tabular-nums">
              {formatPercent(currentMonth.laborCostToRevenuePct)}
            </span>
          </div>
          <span className="text-[10px] text-emerald-700 block mt-2">محدوده ایمن (پایین‌تر از ۴۰٪)</span>
        </div>
      </div>

      {/* Monthly Financials History Table with negative profit verification */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">
            صورت سود و زیان و عملکرد اقتصادی ماه‌های اخیر (با ثبت ارقام منفی زیان)
          </h3>
          <span className="text-xs text-slate-500">منبع: monthlyFinancials</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-2.5 px-3">دوره ماهانه</th>
                <th className="py-2.5 px-3">کل درآمد فروش تنور</th>
                <th className="py-2.5 px-3">هزینه کامل پرسنلی</th>
                <th className="py-2.5 px-3">هزینه‌های ثابت و متغیر</th>
                <th className="py-2.5 px-3">سود / زیان عملیاتی</th>
                <th className="py-2.5 px-3">سود / زیان خالص</th>
                <th className="py-2.5 px-3">تعداد تنور ساخته‌شده</th>
                <th className="py-2.5 px-3">یادداشت رویداد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {financials.map((fin) => (
                <tr key={fin.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-3 font-bold text-slate-900">{fin.month}</td>
                  <td className="py-3 px-3 tabular-nums text-slate-800">{formatTomans(fin.revenue)}</td>
                  <td className="py-3 px-3 tabular-nums text-indigo-900 font-semibold">{formatTomans(fin.laborCosts)}</td>
                  <td className="py-3 px-3 tabular-nums text-slate-600">{formatTomans(fin.fixedCosts + fin.variableCosts)}</td>
                  <td className={`py-3 px-3 tabular-nums font-bold ${fin.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatTomans(fin.operatingProfit)}
                  </td>
                  <td className={`py-3 px-3 tabular-nums font-bold text-sm ${fin.netProfit >= 0 ? 'text-emerald-800 bg-emerald-50/50' : 'text-rose-700 bg-rose-50/80'}`}>
                    {formatTomans(fin.netProfit)}
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-800">
                    {toPersianDigits(fin.productionCount)} دستگاه
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px] max-w-[200px] truncate" title={fin.notes}>
                    {fin.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
