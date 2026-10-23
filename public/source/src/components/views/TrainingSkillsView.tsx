import React from 'react';
import { Employee } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { GraduationCap, Award, CheckCircle2, Star, BookOpen } from 'lucide-react';

interface TrainingSkillsViewProps {
  employees: Employee[];
}

export const TrainingSkillsView: React.FC<TrainingSkillsViewProps> = ({ employees }) => {
  const courses = [
    {
      id: 'cr-1',
      title: 'استانداردهای نوین جوشکاری اسکلت‌های سنگین تحت بار حرارتی',
      instructor: 'مهندس جاوید پذیر',
      hours: 16,
      date: '1405/06/10',
      participants: 8,
      status: 'برگزار شده (تست موفق)'
    },
    {
      id: 'cr-2',
      title: 'ایمنی کار با پشم سرامیک نسوز و پیشگیری از خطرات تنفسی',
      instructor: 'دکتر علوی (مشاور HSE)',
      hours: 8,
      date: '1405/07/04',
      participants: 12,
      status: 'تکمیل گواهینامه فنی'
    },
    {
      id: 'cr-3',
      title: 'تنظیم مشعل گازسوز صنعتی و بهینه‌سازی مصرف انرژی تنور سنگک',
      instructor: 'مهندس صفوی',
      hours: 12,
      date: '1405/07/26',
      participants: 5,
      status: 'در حال برگزاری'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
            <GraduationCap className="w-5 h-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            آموزش، ماتریس مهارتی و ارتقای فنی استادکاران
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          پایش دوره‌های مهارتی کارگاهی، ارتقای رتبه شغلی (مقدماتی به ماهر و استادکار)، و ایمنی بهداشت حرفه‌ای (HSE)
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900">
          <span>دوره‌های آموزشی تخصصی کارخانه ({toPersianDigits(courses.length)} دوره)</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">عنوان دوره آموزشی</th>
                <th className="py-2.5 px-3">مدرس دوره</th>
                <th className="py-2.5 px-3">مدت ساعت</th>
                <th className="py-2.5 px-3">تاریخ برگزاری</th>
                <th className="py-2.5 px-3">تعداد شرکت‌کنندگان</th>
                <th className="py-2.5 px-3">وضعیت گواهی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-bold text-slate-900">{c.title}</td>
                  <td className="py-3 px-3 text-slate-700">{c.instructor}</td>
                  <td className="py-3 px-3 font-mono">{toPersianDigits(c.hours)} ساعت</td>
                  <td className="py-3 px-3 font-mono text-slate-600">{c.date}</td>
                  <td className="py-3 px-3">{toPersianDigits(c.participants)} نفر از کارگاه</td>
                  <td className="py-3 px-3">
                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                      {c.status}
                    </span>
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
