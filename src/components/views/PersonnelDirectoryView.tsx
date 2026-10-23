import React, { useState } from 'react';
import { Employee, UserRole } from '../../types';
import { formatTomans, toPersianDigits, maskNationalId, maskBankAccount, maskSheba } from '../../utils/formatters';
import { Users, Search, Filter, Shield, Eye, EyeOff, FileText, CheckCircle2, Clock, Phone, Award, Briefcase } from 'lucide-react';

interface PersonnelDirectoryViewProps {
  employees: Employee[];
  userRole: UserRole;
  onSelectEmployee?: (emp: Employee) => void;
}

export const PersonnelDirectoryView: React.FC<PersonnelDirectoryViewProps> = ({
  employees,
  userRole,
  onSelectEmployee
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'info' | 'salary' | 'probation' | 'skills'>('info');

  // Permission checks
  const canViewSalary = userRole === 'admin' || userRole === 'hr_manager' || userRole === 'ceo';
  const canViewNationalId = userRole === 'admin' || userRole === 'hr_manager' || userRole === 'hr_specialist';
  const canViewBank = userRole === 'admin' || userRole === 'hr_manager';

  const filteredEmployees = employees.filter((emp) => {
    const matchSearch =
      emp.fullName.includes(searchTerm) ||
      emp.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.position.includes(searchTerm) ||
      emp.phone.includes(searchTerm);
    const matchDept = deptFilter === 'all' || emp.department === deptFilter;
    return matchSearch && matchDept;
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              پرونده ۳۶۰ درجه پرسنل تنورسازی رضوان ({toPersianDigits(employees.length)} پرسنل)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            مشاهده اطلاعات جامع هویتی، تفکیک حقوق پایه از حق فنی قراردادی، دوره‌های آزمایشی، مهارت‌ها و مدیریت دسترسی
          </p>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
          <Shield className="w-4 h-4 text-blue-700" />
          <span className="text-slate-600">
            سطح دسترسی شما: <strong>{userRole === 'ceo' ? 'مدیرعامل' : userRole === 'hr_manager' ? 'مدیر منابع انسانی' : userRole === 'hr_specialist' ? 'کارشناس اداری' : userRole === 'admin' ? 'مدیر ارشد' : 'ناظر عمومی'}</strong>
          </span>
          {!canViewSalary && (
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
              مبالغ حقوق ماسک‌شده
            </span>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="جستجو با نام پرسنل، کد (RZ-101)، سمت یا شماره تماس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500">واحد سازمانی:</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">همه واحدها ({toPersianDigits(employees.length)})</option>
            <option value="آهنگری و ساخت شاسی">آهنگری و ساخت شاسی (۸ نفر)</option>
            <option value="بنایی و نماکاری">بنایی و نماکاری (۱۲ نفر)</option>
            <option value="مونتاژ، برق و تاسیسات">مونتاژ و برق (۲ نفر)</option>
            <option value="کنترل کیفیت و تست">کنترل کیفیت (۱ نفر)</option>
            <option value="مالی و حسابداری">مالی و حسابداری (۱ نفر)</option>
            <option value="منابع انسانی و اداری">منابع انسانی و اداری (۲ نفر)</option>
            <option value="مدیریت و مهندسی">مدیریت و مهندسی (۱ نفر)</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-3 px-3.5">کد و نام پرسنل</th>
                <th className="py-3 px-3.5">واحد و سمت</th>
                <th className="py-3 px-3.5">سطح مهارت</th>
                <th className="py-3 px-3.5">حقوق پایه</th>
                <th className="py-3 px-3.5">حق فنی قراردادی</th>
                <th className="py-3 px-3.5">وضعیت و آزمایشی</th>
                <th className="py-3 px-3.5">تاریخ استخدام</th>
                <th className="py-3 px-3.5">پرونده ۳۶۰</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3.5 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs shrink-0">
                        {emp.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-bold">{emp.fullName}</div>
                        <span className="font-mono text-[11px] text-slate-400">{emp.code}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="font-medium text-slate-800">{emp.position}</div>
                    <div className="text-[11px] text-slate-500">{emp.department}</div>
                  </td>
                  <td className="py-3 px-3.5">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium inline-block ${
                        emp.level === 'استادکار / سرپرست'
                          ? 'bg-amber-100 text-amber-900'
                          : emp.level === 'ماهر'
                          ? 'bg-blue-100 text-blue-900'
                          : emp.level === 'مدیر'
                          ? 'bg-purple-100 text-purple-900'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {emp.level}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 tabular-nums text-slate-800">
                    {canViewSalary ? (
                      formatTomans(emp.salary)
                    ) : (
                      <span className="font-mono text-slate-400">•••••••• تومان</span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 tabular-nums text-blue-800 font-medium">
                    {canViewSalary ? (
                      formatTomans(emp.technicalAllowance)
                    ) : (
                      <span className="font-mono text-slate-400">•••••••• تومان</span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    {emp.hasProbation ? (
                      <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <Clock className="w-3 h-3 text-amber-600" />
                        دوره آزمایشی ({toPersianDigits(emp.probationDays || 60)} روز)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        نیروی ثابت کارگاه
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600">
                    {emp.hireDate}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setSelectedEmp(emp);
                        setActiveProfileTab('info');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors cursor-pointer"
                    >
                      مشاهده پرونده
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 360-Degree Profile Modal */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-900 text-white font-bold text-base flex items-center justify-center">
                  {selectedEmp.fullName.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{selectedEmp.fullName}</h3>
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {selectedEmp.code}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                      {selectedEmp.level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedEmp.position} · {selectedEmp.department}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedEmp(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
              <button
                onClick={() => setActiveProfileTab('info')}
                className={`pb-2 px-3 font-semibold transition-all border-b-2 cursor-pointer ${
                  activeProfileTab === 'info'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ۱. اطلاعات فردی و هویتی
              </button>
              <button
                onClick={() => setActiveProfileTab('salary')}
                className={`pb-2 px-3 font-semibold transition-all border-b-2 cursor-pointer ${
                  activeProfileTab === 'salary'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ۲. احکام، حقوق و تفکیک حق فنی
              </button>
              <button
                onClick={() => setActiveProfileTab('probation')}
                className={`pb-2 px-3 font-semibold transition-all border-b-2 cursor-pointer ${
                  activeProfileTab === 'probation'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ۳. وضعیت دوره آزمایشی و قرارداد
              </button>
              <button
                onClick={() => setActiveProfileTab('skills')}
                className={`pb-2 px-3 font-semibold transition-all border-b-2 cursor-pointer ${
                  activeProfileTab === 'skills'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ۴. مهارت‌ها و تجهیزات کارگاه
              </button>
            </div>

            {/* Tab 1: Info */}
            {activeProfileTab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2 p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-slate-500">شماره ملی:</span>
                    <strong className="font-mono">
                      {canViewNationalId ? selectedEmp.nationalId : maskNationalId(selectedEmp.nationalId)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">شماره بیمه تامین اجتماعی:</span>
                    <strong className="font-mono">
                      {canViewNationalId ? selectedEmp.insuranceNo : maskNationalId(selectedEmp.insuranceNo)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">تاریخ تولد:</span>
                    <strong className="font-mono">{selectedEmp.birthDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">وضعیت تاهل و اولاد:</span>
                    <span>{selectedEmp.married ? `متاهل (${toPersianDigits(selectedEmp.childrenCount)} فرزند)` : 'مجرد'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">نظام وظیفه:</span>
                    <span>{selectedEmp.militaryStatus}</span>
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-slate-500">مدرک تحصیلی:</span>
                    <span>{selectedEmp.education}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">شماره تماس:</span>
                    <strong className="font-mono">{selectedEmp.phone}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">مخاطب اضطراری:</span>
                    <span>{selectedEmp.emergencyName} ({selectedEmp.emergencyPhone})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">نشانی سکونت:</span>
                    <span className="text-[11px]">{selectedEmp.address}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Salary & Technical Allowance */}
            {activeProfileTab === 'salary' && (
              <div className="space-y-4 text-xs">
                {!canViewSalary ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-2">
                    <Shield className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>
                      دسترسی مشاهده مبالغ حقوق و اطلاعات بانکی این پرسنل برای نقش جاری شما محدود است (نیازمند مجوز view_salary).
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                          اقلام مستمر حکم کارگزینی:
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">حقوق پایه قانون کار:</span>
                          <strong className="text-slate-900">{formatTomans(selectedEmp.salary)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-800 font-semibold">حق فنی قراردادی (جداگانه):</span>
                          <strong className="text-blue-800 font-bold">{formatTomans(selectedEmp.technicalAllowance)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">حق مسکن:</span>
                          <span>{formatTomans(selectedEmp.housingAllowance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">بن خواروبار کارگری:</span>
                          <span>{formatTomans(selectedEmp.groceryAllowance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">حق اولاد:</span>
                          <span>{formatTomans(selectedEmp.childrenAllowance)}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                          اطلاعات حساب و واریز بانکی:
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">بانک عامل:</span>
                          <strong>{selectedEmp.bankName}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">شماره حساب:</span>
                          <strong className="font-mono">
                            {canViewBank ? selectedEmp.bankAccount : maskBankAccount(selectedEmp.bankAccount)}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">شماره شبا (IBAN):</span>
                          <strong className="font-mono text-[11px]">
                            {canViewBank ? selectedEmp.sheba : maskSheba(selectedEmp.sheba)}
                          </strong>
                        </div>
                        <div className="p-2 bg-blue-50 text-blue-900 rounded border border-blue-100 text-[11px] mt-2">
                          <strong>مبنای قانونی:</strong> حق فنی به عنوان فیلد مستقل قراردادی ثبت گردیده و در محاسبات بهای تمام‌شده و اضافه کاری طبق قانون کار بدون دوباره‌شماری محاسبه می‌گردد.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Probation & Jalali Dates */}
            {activeProfileTab === 'probation' && (
              <div className="space-y-4 text-xs">
                {selectedEmp.hasProbation ? (
                  <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 text-sm">پرونده دوره آزمایشی فعال</span>
                      <span className="text-xs bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded font-mono">
                        {toPersianDigits(selectedEmp.probationDays || 60)} روز تقویمی
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded border border-amber-200">
                      <div>
                        <span className="text-slate-500 block">تاریخ شروع آزمایشی (شمسی):</span>
                        <strong className="font-mono text-slate-900">{selectedEmp.probationStartDate}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">تاریخ پایان آزمایشی (شمسی):</span>
                        <strong className="font-mono text-slate-900">{selectedEmp.probationEndDate}</strong>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="text-slate-700">وضعیت تصمیم‌گیری دوره:</span>
                      <span className="font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        {selectedEmp.probationResult || 'در جریان ارزیابی سرپرست'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                    <div className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>این پرسنل دوره آزمایشی را با موفقیت سپری کرده است.</span>
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed">
                      وضعیت در پرونده به صورت <strong>نیروی ثابت داخلی</strong> ثبت شده و قراردادهای کاری وی به صورت ماهانه یا دوره‌ای تمدید می‌گردد.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Skills */}
            {activeProfileTab === 'skills' && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-slate-900">مهارت‌های تخصصی و گواهینامه‌های کارگاهی:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmp.skills.map((skill, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-md font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 mt-4 text-[11px] leading-relaxed">
                  <strong>چک‌لیست تجهیزات ایمنی فردی (PPE):</strong> کفش ایمنی سرپنجه فولادی، لباس کار نسوز کتان، ماسک تنفسی فیلتردار ذرات سرامیک، عینک محافظ سنگ‌زنی تحویل گردیده است.
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedEmp(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                بستن پنجره پرونده
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
