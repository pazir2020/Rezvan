import React, { useState } from 'react';
import { Employee, Payslip, UserRole } from '../../types';
import { formatTomans, toPersianDigits } from '../../utils/formatters';
import { Banknote, Printer, Search, Shield, Eye, Lock, CheckCircle2, ChevronDown, Download, FileSpreadsheet } from 'lucide-react';

interface PayrollManagementViewProps {
  employees: Employee[];
  userRole: UserRole;
}

export const PayrollManagementView: React.FC<PayrollManagementViewProps> = ({ employees, userRole }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<Employee | null>(null);

  // Generate payslip data from employees + realistic overtime/bonuses
  const payslips: Payslip[] = employees.map((emp, idx) => {
    const isForgeT1 = emp.id === 'emp-101' || emp.id === 'emp-102' || emp.id === 'emp-103' || emp.id === 'emp-104';
    // KPI bonus for Forge Team 1 member from approved evaluation
    const kpiBonus = isForgeT1 ? (emp.id === 'emp-101' ? 3776471 : emp.id === 'emp-102' ? 3653060 : emp.id === 'emp-103' ? 3476656 : 3093813) : 0;
    
    const overtimeHours = idx % 3 === 0 ? 30 : idx % 2 === 0 ? 18 : 8;
    const hourlyRate = (emp.salary + emp.technicalAllowance) / 220;
    const overtimePay = Math.round(hourlyRate * 1.4 * overtimeHours);
    
    const grossPay = emp.salary + emp.technicalAllowance + emp.housingAllowance + emp.groceryAllowance + emp.childrenAllowance + overtimePay + kpiBonus;
    
    // Taxable and Insurable calculations
    const insurable = emp.salary + emp.technicalAllowance + emp.housingAllowance + emp.groceryAllowance + overtimePay;
    const insuranceEmployeeShare = Math.round(insurable * 0.07);
    const insuranceEmployerShare = Math.round(insurable * 0.23);
    
    // Tax calculation (Exempt up to 12M, 10% on surplus)
    const taxable = Math.max(0, grossPay - insuranceEmployeeShare - 12000000);
    const incomeTax = Math.round(taxable * 0.10);
    
    const loanDeduction = idx % 5 === 0 ? 1500000 : 0;
    const totalDeductions = insuranceEmployeeShare + incomeTax + loanDeduction;
    const netPay = grossPay - totalDeductions;

    return {
      id: `ps-${emp.id}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      position: emp.position,
      month: 'مهر ۱۴۰۵ (2026-10)',
      workingDays: 30,
      standardHours: 220,
      overtimeHours,
      absenceDays: 0,
      sickLeaveDays: 0,
      baseSalary: emp.salary,
      technicalAllowance: emp.technicalAllowance,
      housingAllowance: emp.housingAllowance,
      groceryAllowance: emp.groceryAllowance,
      childrenAllowance: emp.childrenAllowance,
      overtimePay,
      kpiBonus,
      otherBonuses: 0,
      grossPay,
      insuranceEmployeeShare,
      insuranceEmployerShare,
      incomeTax,
      loanDeduction,
      advanceDeduction: 0,
      absenceDeduction: 0,
      totalDeductions,
      netPay,
      status: 'تأیید مالی'
    };
  });

  const canViewSalary = userRole === 'admin' || userRole === 'hr_manager' || userRole === 'ceo';

  const filtered = payslips.filter((ps) => {
    const matchSearch = ps.employeeName.includes(searchTerm) || ps.department.includes(searchTerm);
    const matchDept = deptFilter === 'all' || ps.department === deptFilter;
    return matchSearch && matchDept;
  });

  const selectedSlip = selectedPayslipEmp ? payslips.find((p) => p.employeeId === selectedPayslipEmp.id) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Banknote className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              محاسبه و برآورد حقوق و دستمزد و صدور فیش (مهر ۱۴۰۵)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
            محاسبه دقیق اقلام مستمر و غیرمستمر، تفکیک حق فنی، کسر حق بیمه کارگر (۷٪) و محاسبه بار مالی کارفرما (۲۳٪)، مالیات حقوق، و درج کارانه تاییدشده بدون دستکاری در حقوق پایه.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            وضعیت حقوق: بررسی مالی (قفل‌نشده)
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="جستجو در لیست فیش‌های حقوقی پرسنل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">همه واحدها</option>
            <option value="آهنگری و ساخت شاسی">آهنگری و ساخت شاسی</option>
            <option value="بنایی و نماکاری">بنایی و نماکاری</option>
            <option value="مونتاژ، برق و تاسیسات">مونتاژ و برق</option>
            <option value="کنترل کیفیت و تست">کنترل کیفیت</option>
            <option value="مالی و حسابداری">مالی</option>
            <option value="منابع انسانی و اداری">منابع انسانی</option>
            <option value="مدیریت و مهندسی">مدیریت</option>
          </select>
        </div>
      </div>

      {/* Payroll Sheet Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-3 px-3">نام پرسنل و سمت</th>
                <th className="py-3 px-3">پایه حقوق</th>
                <th className="py-3 px-3">حق فنی قراردادی</th>
                <th className="py-3 px-3">اضافه کاری</th>
                <th className="py-3 px-3">کارانه تولید (KPI)</th>
                <th className="py-3 px-3">جمع ناخالص</th>
                <th className="py-3 px-3">بیمه کارگر (۷٪)</th>
                <th className="py-3 px-3">مالیات حقوق</th>
                <th className="py-3 px-3">خالص پرداختی</th>
                <th className="py-3 px-3">فیش رسمی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((ps) => {
                const emp = employees.find((e) => e.id === ps.employeeId)!;
                return (
                  <tr key={ps.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div>{ps.employeeName}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{ps.position}</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-800">
                      {canViewSalary ? formatTomans(ps.baseSalary) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-blue-700 font-semibold">
                      {canViewSalary ? formatTomans(ps.technicalAllowance) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-700">
                      {canViewSalary ? formatTomans(ps.overtimePay) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {ps.kpiBonus > 0 ? (
                        canViewSalary ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                            {formatTomans(ps.kpiBonus)}
                          </span>
                        ) : '••••••••'
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-slate-900">
                      {canViewSalary ? formatTomans(ps.grossPay) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-rose-700">
                      {canViewSalary ? formatTomans(ps.insuranceEmployeeShare) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-rose-700">
                      {canViewSalary ? formatTomans(ps.incomeTax) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-emerald-800 bg-emerald-50/30">
                      {canViewSalary ? formatTomans(ps.netPay) : '••••••••'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedPayslipEmp(emp)}
                        className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors cursor-pointer"
                      >
                        مشاهده فیش
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Official Payslip Print View */}
      {selectedSlip && selectedPayslipEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 print:p-0 print:border-none print:shadow-none">
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-bold text-slate-900">
                  پیش‌نمایش فیش حقوق و دستمزد رسمی — شرکت تنورسازی رضوان
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ فیش</span>
                </button>
                <button
                  onClick={() => setSelectedPayslipEmp(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Payslip Box */}
            <div className="border border-slate-300 rounded-lg p-5 text-xs space-y-4 bg-white print:border-slate-800">
              {/* Slip Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
                <div className="text-right">
                  <h4 className="text-base font-bold text-slate-900">شرکت صنعتی تنورسازی رضوان</h4>
                  <div className="text-slate-600 text-[11px] mt-0.5">فیش حقوق و دستمزد ماهانه کارگری و تخصصی</div>
                </div>
                <div className="text-left font-mono text-[11px] text-slate-700 space-y-0.5">
                  <div>دوره پرداخت: <strong>{selectedSlip.month}</strong></div>
                  <div>شماره فیش: <strong>PS-RZ-1405-0{selectedSlip.employeeId.replace('emp-', '')}</strong></div>
                </div>
              </div>

              {/* Employee ID strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px]">
                <div>نام پرسنل: <strong>{selectedSlip.employeeName}</strong></div>
                <div>کد پرسنلی: <strong className="font-mono">{selectedPayslipEmp.code}</strong></div>
                <div>واحد: <strong>{selectedSlip.department}</strong></div>
                <div>سمت: <strong>{selectedSlip.position}</strong></div>
                <div>کد ملی: <strong className="font-mono">{canViewSalary ? selectedPayslipEmp.nationalId : '••••••••'}</strong></div>
                <div>شماره بیمه: <strong className="font-mono">{canViewSalary ? selectedPayslipEmp.insuranceNo : '••••••••'}</strong></div>
                <div>ساعت کارکرد: <strong>۲۲۰ ساعت</strong></div>
                <div>اضافه‌کاری: <strong>{toPersianDigits(selectedSlip.overtimeHours)} ساعت</strong></div>
              </div>

              {/* Two Column Earnings vs Deductions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Earnings */}
                <div className="border border-slate-200 rounded p-3 space-y-1.5">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 text-[11px]">
                    شرح کارکرد و مزایا (Earnings)
                  </div>
                  <div className="flex justify-between">
                    <span>حقوق پایه قانون کار:</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between text-blue-900 font-bold">
                    <span>حق فنی قراردادی (مستقل):</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.technicalAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>حق مسکن:</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.housingAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>بن خواروبار کارگری:</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.groceryAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>حق اولاد:</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.childrenAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>اضافه کاری ({toPersianDigits(selectedSlip.overtimeHours)} ساعت):</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.overtimePay)}</span>
                  </div>
                  {selectedSlip.kpiBonus > 0 && (
                    <div className="flex justify-between text-emerald-900 font-bold bg-emerald-50 p-1 rounded">
                      <span>کارانه تولید رضوان (KPI):</span>
                      <span className="tabular-nums font-mono">{formatTomans(selectedSlip.kpiBonus)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                    <span>مجموع ناخالص پرداختی:</span>
                    <span className="tabular-nums font-mono">{formatTomans(selectedSlip.grossPay)}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div className="border border-slate-200 rounded p-3 space-y-1.5">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 text-[11px]">
                    کسورات قانونی و مالی (Deductions)
                  </div>
                  <div className="flex justify-between">
                    <span>بیمه سهم کارگر (۷٪ تامین اجتماعی):</span>
                    <span className="tabular-nums font-mono text-rose-700">{formatTomans(selectedSlip.insuranceEmployeeShare)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>مالیات بر درآمد حقوق:</span>
                    <span className="tabular-nums font-mono text-rose-700">{formatTomans(selectedSlip.incomeTax)}</span>
                  </div>
                  {selectedSlip.loanDeduction > 0 && (
                    <div className="flex justify-between">
                      <span>کسر قسط وام صندوق:</span>
                      <span className="tabular-nums font-mono text-rose-700">{formatTomans(selectedSlip.loanDeduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                    <span>مجموع کسورات:</span>
                    <span className="tabular-nums font-mono text-rose-700">{formatTomans(selectedSlip.totalDeductions)}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 mt-3 text-[10px] text-slate-500">
                    بیمه سهم کارفرما (۲۳٪ معادل {formatTomans(selectedSlip.insuranceEmployerShare)}) به عهده شرکت است و از حقوق کسر نمی‌شود.
                  </div>
                </div>
              </div>

              {/* Net Pay Strip */}
              <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-600 block text-[11px]">خالص پرداختی به حساب پرسنل:</span>
                  <span className="text-sm font-bold text-emerald-950 font-sans">
                    واریز به {selectedPayslipEmp.bankName} (حساب: {canViewSalary ? selectedPayslipEmp.bankAccount : '••••••••'})
                  </span>
                </div>
                <div className="text-left font-bold text-base text-emerald-900 tabular-nums font-mono">
                  {formatTomans(selectedSlip.netPay)}
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200 text-center text-[11px] text-slate-600">
                <div>
                  <div className="mb-8 font-semibold">مهر و امضای حسابدار ارشد / مدیر مالی</div>
                  <div className="text-slate-400">سمیرا نوری</div>
                </div>
                <div>
                  <div className="mb-8 font-semibold">امضا و تایید دریافت‌کننده وجه</div>
                  <div className="text-slate-400">{selectedSlip.employeeName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
