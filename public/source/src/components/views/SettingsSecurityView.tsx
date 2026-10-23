import React, { useState } from 'react';
import { UserRole } from '../../types';
import { CURRENT_USER_SESSIONS } from '../../data/mockData';
import { Settings, Shield, Lock, Database, Key, Server, CheckCircle2, History } from 'lucide-react';

export const SettingsSecurityView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'rbac' | 'audit' | 'backup'>('users');

  const auditLogs = [
    {
      id: 'log-1',
      time: '1405/07/22 10:15',
      user: 'فرزانه سلیمانی (مدیر HR)',
      action: 'انتقال اختیاری کارانه تیم ۱ آهنگری به فیش مهرماه',
      target: 'kpi-pay-forge-t1-1405-07',
      status: 'موفق'
    },
    {
      id: 'log-2',
      time: '1405/07/22 09:30',
      user: 'جواد ناظمی (سرپرست آهنگری)',
      action: 'تغییر وضعیت شاسی سفارش البرز به «آماده تحویل به بنایی»',
      target: 'RZ-OV-1405-038',
      status: 'موفق'
    },
    {
      id: 'log-3',
      time: '1405/07/21 16:45',
      user: 'مهندس جاوید پذیر (مدیرعامل)',
      action: 'اجرای شبیه‌ساز سناریوی استخدام ۴ نیروی آهنگری جدید',
      target: 'scen-hire-1',
      status: 'تحلیلی (بدون تغییر دیتابیس)'
    },
    {
      id: 'log-4',
      time: '1405/07/21 14:00',
      user: 'هومن ابراهیمی (کارشناس اداری)',
      action: 'ثبت دوره آزمایشی ۶۰ روزه با تقویم شمسی برای میلاد کریمی',
      target: 'emp-212',
      status: 'موفق'
    }
  ];

  const rbacMatrix = [
    { perm: 'view_dashboard', label: 'مشاهده داشبورد عمومی', admin: true, ceo: true, hr_manager: true, hr_specialist: true, viewer: true },
    { perm: 'view_ceo', label: 'مشاهده داشبورد اختصاصی مدیرعامل', admin: true, ceo: true, hr_manager: true, hr_specialist: false, viewer: false },
    { perm: 'view_salary', label: 'مشاهده مبالغ حقوق پایه و کارانه فردی', admin: true, ceo: true, hr_manager: true, hr_specialist: false, viewer: false },
    { perm: 'view_bank', label: 'مشاهده شماره حساب و شبای بانکی', admin: true, ceo: false, hr_manager: true, hr_specialist: false, viewer: false },
    { perm: 'approve_payroll', label: 'تایید انتقال کارانه و تصویب نهایی حقوق', admin: true, ceo: true, hr_manager: true, hr_specialist: false, viewer: false },
    { perm: 'write_records', label: 'ثبت و ویرایش سفارش تنور و کارکرد', admin: true, ceo: false, hr_manager: true, hr_specialist: true, viewer: false },
    { perm: 'manage_scenarios', label: 'مدیریت و شبیه‌سازی سناریوهای اقتصادی', admin: true, ceo: true, hr_manager: true, hr_specialist: false, viewer: false },
    { perm: 'backup', label: 'تهیه نسخه پشتیبان سرور', admin: true, ceo: false, hr_manager: true, hr_specialist: false, viewer: false }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Settings className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              تنظیمات سیستم، ماتریس امنیت و سوابق حسابرسی (Audit Log)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            مدیریت دسترسی کاربران بر مبنای نقش (RBAC)، کنترل محرمانگی حقوق و سوابق وقایع سامانه
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-md cursor-pointer ${
              activeTab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            کاربران
          </button>
          <button
            onClick={() => setActiveTab('rbac')}
            className={`px-3 py-1.5 rounded-md cursor-pointer ${
              activeTab === 'rbac' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            ماتریس دسترسی (RBAC)
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md cursor-pointer ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            لاگ تغییرات (Audit)
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-md cursor-pointer ${
              activeTab === 'backup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            استقرار شبکه LAN
          </button>
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900">
            فهرست حساب‌های کاربری فعال در سرور شبکه داخلی
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">نام کاربر</th>
                  <th className="py-2.5 px-3">نام کاربری</th>
                  <th className="py-2.5 px-3">نقش سازمانی</th>
                  <th className="py-2.5 px-3">واحدهای مجاز</th>
                  <th className="py-2.5 px-3">نوع رمزنگاری</th>
                  <th className="py-2.5 px-3">وضعیت نشست</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {Object.values(CURRENT_USER_SESSIONS).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">{u.fullName}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{u.username}</td>
                    <td className="py-3 px-3">
                      <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{u.units.join('، ')}</td>
                    <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">Argon2id (امن)</td>
                    <td className="py-3 px-3 text-emerald-700 font-medium">فعال</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'rbac' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900">
            ماتریس اعطای مجوزهای سیستمی (Role-Based Access Control)
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">عنوان مجوز و شرح کارکرد</th>
                  <th className="py-2.5 px-3 font-mono text-[11px]">شناسه API</th>
                  <th className="py-2.5 px-3 text-center">مدیر ارشد (admin)</th>
                  <th className="py-2.5 px-3 text-center">مدیرعامل (ceo)</th>
                  <th className="py-2.5 px-3 text-center">مدیر HR</th>
                  <th className="py-2.5 px-3 text-center">کارشناس اداری</th>
                  <th className="py-2.5 px-3 text-center">ناظر (viewer)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rbacMatrix.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{r.label}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{r.perm}</td>
                    <td className="py-2.5 px-3 text-center text-emerald-600 font-bold">{r.admin ? '✓' : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-emerald-600 font-bold">{r.ceo ? '✓' : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-emerald-600 font-bold">{r.hr_manager ? '✓' : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{r.hr_specialist ? '✓' : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{r.viewer ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 flex items-center justify-between">
            <span>سوابق حسابرسی تغییرات داده و رویدادها (فقط‌افزودنی / بدون امکان ویرایش و حذف)</span>
            <span className="text-[11px] text-slate-500 font-mono">جدول: audit_log</span>
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">زمان رویداد</th>
                  <th className="py-2.5 px-3">کاربر عامل</th>
                  <th className="py-2.5 px-3">شرح اقدام انجام‌شده</th>
                  <th className="py-2.5 px-3">شناسه رکورد</th>
                  <th className="py-2.5 px-3">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">{log.time}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{log.user}</td>
                    <td className="py-2.5 px-3 text-slate-800">{log.action}</td>
                    <td className="py-2.5 px-3 font-mono text-blue-900 text-[11px]">{log.target}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            راهنمای استقرار و پشتیبان‌گیری در شبکه محلی (LAN) تنورسازی رضوان
          </h3>
          <p className="text-slate-600 leading-relaxed">
            کلاینت‌ها و کامپیوترهای کارگاه و دفتر بدون نیاز به نصب هیچ نرم‌افزاری، مستقیماً از طریق مرورگر به سرور وصل می‌شوند:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block">دستورات پشتیبان‌گیری سرور:</span>
              <ul className="space-y-1 font-mono text-[11px] text-slate-700 list-disc list-inside">
                <li><code className="bg-slate-200 px-1 py-0.5 rounded">scripts\backup.bat</code> — نسخه پشتیبان دیتابیس + مدارک با Checksum</li>
                <li><code className="bg-slate-200 px-1 py-0.5 rounded">scripts\verify-backup.bat</code> — تست سلامت و آزمون بازیابی</li>
                <li><code className="bg-slate-200 px-1 py-0.5 rounded">scripts\restore.bat</code> — بازیابی کنترل‌شده</li>
              </ul>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block">آدرس اتصال در شبکه داخلی:</span>
              <div className="p-2 bg-white rounded border border-slate-200 font-mono text-blue-900 font-bold">
                http://192.168.1.100:8000
              </div>
              <p className="text-[11px] text-slate-500">
                پورت 8000 روی فایروال سرور از طریق اسکریپت <code className="font-mono">open-network.bat</code> باز می‌شود.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
