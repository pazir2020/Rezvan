import React from 'react';
import { UserRole } from '../../types';
import { formatTomans, toPersianDigits } from '../../utils/formatters';
import { UserPlus, Calendar, Phone, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface RecruitmentPipelineViewProps {
  userRole: UserRole;
}

export const RecruitmentPipelineView: React.FC<RecruitmentPipelineViewProps> = ({ userRole }) => {
  const canViewSalary = userRole === 'admin' || userRole === 'hr_manager' || userRole === 'ceo';

  const candidates = [
    {
      id: 'c-1',
      name: 'ابراهیم شکوری',
      position: 'جوشکار ماهر CO2 شاسی تنور',
      dept: 'آهنگری و ساخت شاسی',
      stage: 'مصاحبه فنی عملی (تست جوشکاری کارگاه)',
      phone: '09127770001',
      date: '1405/07/20',
      proposedSalary: 14500000,
      interviewer: 'جواد ناظمی (سرپرست آهنگری)'
    },
    {
      id: 'c-2',
      name: 'سیروس باقری',
      position: 'استادکار نماکاری آجر نسوز و سنتی',
      dept: 'بنایی و نماکاری',
      stage: 'بررسی مدارک و استعلام سابقه',
      phone: '09127770002',
      date: '1405/07/22',
      proposedSalary: 15000000,
      interviewer: 'فرزانه سلیمانی (مدیر HR)'
    },
    {
      id: 'c-3',
      name: 'محسن فدایی',
      position: 'کمک‌بنا دوره آزمایشی',
      dept: 'بنایی و نماکاری',
      stage: 'تایید نهایی جهت انعقاد قرارداد آزمایشی',
      phone: '09127770003',
      date: '1405/07/15',
      proposedSalary: 9500000,
      interviewer: 'احمد رستمی (سرپرست بنایی)'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <UserPlus className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              جذب و استخدام استادکاران و کارآموزان کارگاهی
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            خط لوله جذب (Pipeline)، ارزیابی مصاحبه فنی و آزمون عملی جوشکاری و آجرچینی، حقوق پیشنهادی و فرآیند خروج
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900">
          <span>کاندیداهای در حال مصاحبه و ارزیابی عملی ({toPersianDigits(candidates.length)} نفر)</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">نام متقاضی</th>
                <th className="py-2.5 px-3">سمت و واحد درخواستی</th>
                <th className="py-2.5 px-3">مرحله جذب</th>
                <th className="py-2.5 px-3">تاریخ مصاحبه</th>
                <th className="py-2.5 px-3">مصاحبه‌کننده</th>
                <th className="py-2.5 px-3">حقوق پیشنهادی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-bold text-slate-900">
                    <div>{c.name}</div>
                    <span className="text-[11px] text-slate-400 font-mono font-normal">{c.phone}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-800">{c.position}</div>
                    <span className="text-[11px] text-slate-500">{c.dept}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                      {c.stage}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600">{c.date}</td>
                  <td className="py-3 px-3 text-slate-700">{c.interviewer}</td>
                  <td className="py-3 px-3 font-bold text-slate-900 tabular-nums">
                    {canViewSalary ? formatTomans(c.proposedSalary) : '••••••••'}
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
