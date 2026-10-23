import React from 'react';
import {
  LayoutDashboard,
  Crown,
  Users,
  FileText,
  Clock,
  Banknote,
  Flame,
  Award,
  TrendingUp,
  SlidersHorizontal,
  GraduationCap,
  BellRing,
  Settings,
  ClipboardCheck,
  ChevronLeft
} from 'lucide-react';
import { UserRole } from '../../types';

export type NavItemKey =
  | 'audit-docs'       // خروجی اول تا پنجم: گزارش ممیزی جامع، اصلاح فرمول‌ها و پلن
  | 'ceo-dashboard'    // مرکز فرمان مدیرعامل
  | 'oven-tracking'    // رهگیری ساخت تنور (۲ تیم آهنگری + ۳ تیم بنایی)
  | 'production-kpi'   // کارانه تولید (حدنصاب ۵۰، ۱M هر امتیاز، ۶۰٪ تیمی و ۴۰٪ فردی)
  | 'personnel'        // پرونده ۳۶۰ درجه پرسنل
  | 'contracts'        // قراردادها و تقویم تمدید شمسی و دوره آزمایشی
  | 'payroll'          // حقوق و دستمزد و صدور فیش رسمی
  | 'economics'        // اقتصاد نیروی انسانی، FTE، بهای تمام‌شده و سود/زیان
  | 'scenarios'        // شبیه‌ساز استخدام با Ramp-up و افزایش حقوق
  | 'attendance'       // تردد، اضافه کاری و مرخصی
  | 'recruitment'      // جذب، مصاحبه و خروج پرسنل
  | 'training'         // آموزش، ماتریس مهارتی و ارتقای فنی
  | 'alerts'           // هشدارها و پیگیری اقدامات
  | 'settings';        // تنظیمات، امنیت، RBAC و لاگ حسابرسی

interface SidebarProps {
  currentKey: NavItemKey;
  onSelect: (key: NavItemKey) => void;
  userRole: UserRole;
}

interface NavGroup {
  title: string;
  items: {
    key: NavItemKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    roles?: UserRole[];
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({ currentKey, onSelect, userRole }) => {
  const groups: NavGroup[] = [
    {
      title: 'ممیزی و اسناد مهندسی',
      items: [
        {
          key: 'audit-docs',
          label: 'مستندات ممیزی و محاسبات',
          icon: ClipboardCheck,
          badge: 'فاز ۱-۶'
        }
      ]
    },
    {
      title: 'مدیریت و فرماندهی',
      items: [
        { key: 'ceo-dashboard', label: 'داشبورد ارشد مدیرعامل', icon: Crown },
        { key: 'economics', label: 'اقتصاد نیروی انسانی و FTE', icon: TrendingUp },
        { key: 'scenarios', label: 'مرکز سناریوهای مالی و ROI', icon: SlidersHorizontal }
      ]
    },
    {
      title: 'عملیات کارگاهی رضوان',
      items: [
        {
          key: 'oven-tracking',
          label: 'رهگیری ساخت تنور (۲+۳ تیم)',
          icon: Flame,
          badge: 'کارگاه'
        },
        {
          key: 'production-kpi',
          label: 'کارانه و KPI تولید (۵۰ امتیاز)',
          icon: Award,
          badge: 'مدل ۶۰/۴۰'
        }
      ]
    },
    {
      title: 'منابع انسانی و پرونده‌ها',
      items: [
        { key: 'personnel', label: 'پرونده ۳۶۰ پرسنل', icon: Users },
        { key: 'contracts', label: 'قراردادها و دوره آزمایشی', icon: FileText },
        { key: 'payroll', label: 'حقوق و دستمزد و فیش', icon: Banknote },
        { key: 'attendance', label: 'تردد، مرخصی و کارکرد', icon: Clock },
        { key: 'recruitment', label: 'جذب، مصاحبه و خروج', icon: Users },
        { key: 'training', label: 'آموزش و ماتریس مهارتی', icon: GraduationCap }
      ]
    },
    {
      title: 'پایش و سیستم',
      items: [
        { key: 'alerts', label: 'هشدارها و پرونده‌های کار', icon: BellRing },
        { key: 'settings', label: 'تنظیمات، امنیت و لاگ‌ها', icon: Settings }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-73px)] border-l border-slate-800">
      <div className="p-3.5 space-y-5 overflow-y-auto grow">
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentKey === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-sans shrink-0 ${
                        isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400 space-y-1 text-center">
        <div>نسخه آزمایشی ممیزی ۱۴۰۵</div>
        <div className="text-[10px] text-slate-400">شبکه داخلی (LAN) · بدون اینترنت</div>
      </div>
    </aside>
  );
};
