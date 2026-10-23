import React, { useState } from 'react';
import { Employee } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { Clock, Calendar, CheckCircle2, AlertCircle, Plus, FileText } from 'lucide-react';

interface AttendanceLeaveViewProps {
  employees: Employee[];
}

export const AttendanceLeaveView: React.FC<AttendanceLeaveViewProps> = ({ employees }) => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves'>('attendance');

  const sampleLeaves = [
    {
      id: 'lv-1',
      empName: 'رضا کمالی',
      dept: 'آهنگری و ساخت شاسی',
      type: 'استحقاقی',
      startDate: '1405/07/18',
      endDate: '1405/07/20',
      days: 2,
      status: 'تایید سرپرست و HR'
    },
    {
      id: 'lv-2',
      empName: 'یوسف داوودی',
      dept: 'بنایی و نماکاری',
      type: 'استعلاجی (گواهی پزشک)',
      startDate: '1405/07/12',
      endDate: '1405/07/14',
      days: 3,
      status: 'تایید تامین اجتماعی'
    },
    {
      id: 'lv-3',
      empName: 'مرتضی عباسی',
      dept: 'آهنگری و ساخت شاسی',
      type: 'استحقاقی ساعتی',
      startDate: '1405/07/24',
      endDate: '1405/07/24',
      days: 0.5,
      status: 'در انتظار تایید'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              حضور و غیاب، اضافه کاری و مرخصی‌ها (مهر ۱۴۰۵)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            پایش ساعات کارکرد استاندارد (۲۲۰ ساعت ماهانه)، اضافه‌کاری تاییدشده کارگاهی و مرخصی‌های پرسنل
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${
              activeTab === 'attendance' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            کارکرد و اضافه کاری
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${
              activeTab === 'leaves' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            درخواست‌های مرخصی
          </button>
        </div>
      </div>

      {activeTab === 'attendance' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
            <h3 className="font-bold text-slate-900">کارکرد پرسنل و اضافه‌کاری تاییدشده کارگاه</h3>
            <span className="text-slate-500">قفل ماهانه: در انتظار تایید نهایی</span>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">نام پرسنل</th>
                  <th className="py-2.5 px-3">واحد کارگاهی</th>
                  <th className="py-2.5 px-3">روزهای کارکرد</th>
                  <th className="py-2.5 px-3">ساعت کار موظف</th>
                  <th className="py-2.5 px-3">اضافه‌کاری مصوب</th>
                  <th className="py-2.5 px-3">غیبت / تاخیر</th>
                  <th className="py-2.5 px-3">وضعیت تایید سرپرست</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {employees.slice(0, 15).map((emp, idx) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{emp.fullName}</td>
                    <td className="py-2.5 px-3 text-slate-500">{emp.department}</td>
                    <td className="py-2.5 px-3">۳۰ روز</td>
                    <td className="py-2.5 px-3 font-mono">۲۲۰ ساعت</td>
                    <td className="py-2.5 px-3 font-bold text-blue-800 font-mono">
                      {toPersianDigits(idx % 3 === 0 ? 30 : idx % 2 === 0 ? 18 : 8)} ساعت
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">۰ ساعت</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        تایید شده
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
            <h3 className="font-bold text-slate-900">سوابق و درخواست‌های مرخصی ماه جاری</h3>
            <span className="text-slate-500">{toPersianDigits(sampleLeaves.length)} درخواست ثبت‌شده</span>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">نام پرسنل</th>
                  <th className="py-2.5 px-3">واحد</th>
                  <th className="py-2.5 px-3">نوع مرخصی</th>
                  <th className="py-2.5 px-3">بازه زمانی (شمسی)</th>
                  <th className="py-2.5 px-3">مدت</th>
                  <th className="py-2.5 px-3">وضعیت اداری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sampleLeaves.map((lv) => (
                  <tr key={lv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-medium text-slate-900">{lv.empName}</td>
                    <td className="py-3 px-3 text-slate-500">{lv.dept}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{lv.type}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {lv.startDate} تا {lv.endDate}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">{toPersianDigits(lv.days)} روز</td>
                    <td className="py-3 px-3">
                      <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        {lv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
