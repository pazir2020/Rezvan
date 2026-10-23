import React from 'react';
import { UserSession, UserRole } from '../../types';
import { CURRENT_USER_SESSIONS } from '../../data/mockData';
import { Shield, User, ChevronDown, Bell, HelpCircle, Download, Code2, ExternalLink } from 'lucide-react';

interface TopBarProps {
  currentSession: UserSession;
  onRoleChange: (role: UserRole) => void;
  activePeriod: string;
  onOpenAuditDocs: () => void;
  onOpenOnlineSource: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentSession,
  onRoleChange,
  activePeriod,
  onOpenAuditDocs,
  onOpenOnlineSource
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      {/* Top Banner indicating prototype sandbox environment */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-blue-900 text-white text-xs px-4 py-1.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-300">محیط آزمایشی ·</span>
          <span className="font-medium tracking-wide">
            پیش‌نمایش تعاملی و ممیزی سامانه HRMS رضوان (داده‌های نمونه مهندسی)
          </span>
          <span className="text-slate-400 text-[11px] hidden md:inline">
            | پایگاه داده و فایل‌های اصلی تا تایید نهایی کارفرما دست‌نخورده محفوظ است
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-slate-300">
          <button
            onClick={onOpenOnlineSource}
            className="flex items-center gap-1.5 text-amber-200 hover:text-white transition-colors cursor-pointer font-bold text-xs bg-amber-900/60 hover:bg-amber-800/80 px-2.5 py-1 rounded shadow-xs border border-amber-600/40"
          >
            <Code2 className="w-3.5 h-3.5 text-amber-300" />
            <span>دریافت سورس آنلاین داشبورد</span>
          </button>
          <a
            href="/assets/HR-Rezvan-LAN-Enterprise-Release-1405.zip"
            download="HR-Rezvan-LAN-Enterprise-Release-1405.zip"
            className="flex items-center gap-1.5 text-emerald-300 hover:text-white transition-colors cursor-pointer font-bold text-xs bg-emerald-800/80 hover:bg-emerald-700 px-2.5 py-1 rounded shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود بسته کامل (ZIP)</span>
          </a>
          <button
            onClick={onOpenAuditDocs}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors cursor-pointer font-medium text-xs bg-blue-800/60 px-2 py-0.5 rounded"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>مستندات ممیزی (فاز ۱-۶)</span>
          </button>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="font-mono text-slate-300 text-[11px] hidden sm:inline">دوره کاری: مهر ۱۴۰۵</span>
        </div>
      </div>

      {/* Main TopBar navigation */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-3">
        {/* Brand & Context */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            رض
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 leading-tight">تنورسازی صنعتی رضوان</h1>
              <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded">
                HRMS REZVAN LAN
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              مدیریت منابع انسانی، حقوق و دستمزد، کارانه و رهگیری ساخت تنور
            </p>
          </div>
        </div>

        {/* User Role Switcher & Profile */}
        <div className="flex items-center gap-3">
          {/* RBAC Role Selector Switcher */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
            <Shield className="w-3.5 h-3.5 text-blue-700" />
            <span className="text-slate-500 font-medium">نقش آزمایشی:</span>
            <select
              value={currentSession.role}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ceo">مدیرعامل (مهندس جاوید پذیر)</option>
              <option value="hr_manager">مدیر منابع انسانی (فرزانه سلیمانی)</option>
              <option value="hr_specialist">کارشناس اداری (هومن ابراهیمی)</option>
              <option value="admin">مدیر سیستم (دسترسی کامل)</option>
              <option value="viewer">مشاهده‌گر عمومی / سرپرست</option>
            </select>
          </div>

          {/* User info badge */}
          <div className="flex items-center gap-2.5 pl-2 border-r border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
              <img
                src={currentSession.avatar}
                alt={currentSession.fullName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-slate-800 leading-tight">{currentSession.fullName}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {currentSession.role === 'ceo' ? 'مدیرعامل' : currentSession.role === 'hr_manager' ? 'مدیر HR' : currentSession.role === 'hr_specialist' ? 'کارشناس اداری' : currentSession.role === 'admin' ? 'مدیرکل سیستم' : 'ناظر'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
