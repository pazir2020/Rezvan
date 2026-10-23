import React, { useState } from 'react';
import { Contract, Employee } from '../../types';
import { formatTomans, toPersianDigits } from '../../utils/formatters';
import { calculateJalaliDaysDiff, isExpiringSoon } from '../../utils/jalali';
import { FileText, Plus, Calendar, AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';

interface ContractsProbationViewProps {
  contracts: Contract[];
  employees: Employee[];
  onSaveContract: (ct: Contract) => void;
}

export const ContractsProbationView: React.FC<ContractsProbationViewProps> = ({
  contracts,
  employees,
  onSaveContract
}) => {
  const [contractList, setContractList] = useState<Contract[]>(contracts);
  const [modalOpen, setModalOpen] = useState(false);

  // New contract form
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [contractType, setContractType] = useState<any>('یک‌ماهه تمدیدی');
  const [startDate, setStartDate] = useState('1405/08/01');
  const [endDate, setEndDate] = useState('1405/08/30');
  const [notes, setNotes] = useState('');
  const [formMsg, setFormMsg] = useState('');

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);
  const calculatedDays = calculateJalaliDaysDiff(startDate, endDate);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    if (calculatedDays <= 0) {
      setFormMsg('خطا: تاریخ پایان قرارداد باید بعد از تاریخ شروع باشد.');
      return;
    }

    const newCt: Contract = {
      id: `ct-${Date.now()}`,
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.fullName,
      department: selectedEmployee.department,
      contractNo: `CT-RZ-1405-0${contractList.length + 10}`,
      type: contractType,
      startDate,
      endDate,
      position: selectedEmployee.position,
      baseSalarySnapshot: selectedEmployee.salary,
      technicalAllowanceSnapshot: selectedEmployee.technicalAllowance,
      status: 'جاری',
      signed: true,
      signedDate: startDate,
      notes
    };

    setContractList([newCt, ...contractList]);
    onSaveContract(newCt);
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <FileText className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              مدیریت قراردادها، تقویم تمدید شمسی و دوره‌های آزمایشی
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
            قراردادهای ماهانه رضوان به‌صورت اسناد مستقل یک‌ماهه ثبت می‌شوند. تاریخ شروع و پایان دوره آزمایشی به‌صورت تقویم شمسی دستی تعیین می‌شود و سیستم طول دوره را بر حسب روز تقویمی محاسبه می‌کند.
          </p>
        </div>

        <button
          onClick={() => {
            setFormMsg('');
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت قرارداد / تمدید ماهانه جدید</span>
        </button>
      </div>

      {/* Contracts Expiring Soon Warning Alert */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">قراردادهای نزدیک به انقضا (در بازه ۳۰ روز آینده):</span>
          <p className="text-[11px] leading-relaxed text-amber-800">
            تعداد <strong>{toPersianDigits(contractList.filter((c) => isExpiringSoon(c.endDate)).length)}</strong> فقره قرارداد ماهانه تا پایان ماه مهر به اتمام می‌رسد. جهت تداوم همکاری استادکاران و کارگران، احکام تمدید ماهانه جدید را در کارتابل اداری صادر فرمایید.
          </p>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-3 px-3.5">شماره و نوع قرارداد</th>
                <th className="py-3 px-3.5">نام کارمند و واحد</th>
                <th className="py-3 px-3.5">تاریخ شروع و پایان (شمسی)</th>
                <th className="py-3 px-3.5">مدت تقویمی</th>
                <th className="py-3 px-3.5">پایه حقوق قراردادی</th>
                <th className="py-3 px-3.5">حق فنی قراردادی</th>
                <th className="py-3 px-3.5">وضعیت</th>
                <th className="py-3 px-3.5">امضا و بایگانی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {contractList.map((ct) => {
                const expiring = isExpiringSoon(ct.endDate);
                const days = calculateJalaliDaysDiff(ct.startDate, ct.endDate);
                return (
                  <tr key={ct.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3.5">
                      <div className="font-mono font-bold text-blue-900">{ct.contractNo}</div>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                        {ct.type}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 font-medium text-slate-900">
                      <div>{ct.employeeName}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{ct.department}</div>
                    </td>
                    <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700">
                      <div>شروع: {ct.startDate}</div>
                      <div>پایان: {ct.endDate}</div>
                    </td>
                    <td className="py-3 px-3.5 font-bold text-slate-800">
                      {toPersianDigits(days || 30)} روز تقویمی
                    </td>
                    <td className="py-3 px-3.5 tabular-nums text-slate-800">
                      {formatTomans(ct.baseSalarySnapshot)}
                    </td>
                    <td className="py-3 px-3.5 tabular-nums text-blue-700 font-semibold">
                      {formatTomans(ct.technicalAllowanceSnapshot)}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {expiring ? (
                        <span className="text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          در شرف انقضا (&lt;۳۰ روز)
                        </span>
                      ) : (
                        <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">
                          جاری و معتبر
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-slate-600 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        امضا شده ({ct.signedDate || ct.startDate})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add New Contract */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-700" />
                <span>ثبت سند قرارداد / تمدید ماهانه با تقویم شمسی</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {formMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
                {formMsg}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">انتخاب پرسنل:</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.code} - {emp.position})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">نوع قرارداد:</label>
                  <select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="یک‌ماهه تمدیدی">یک‌ماهه تمدیدی (رویه معمول)</option>
                    <option value="آزمایشی">دوره آزمایشی معین</option>
                    <option value="سه‌ماهه">سه‌ماهه موقت</option>
                    <option value="شش‌ماهه">شش‌ماهه</option>
                    <option value="یکساله">یکساله</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">طول دوره محاسبه‌شده:</label>
                  <div className="px-3 py-2 bg-slate-100 rounded-lg border border-slate-200 font-bold text-blue-900">
                    {toPersianDigits(calculatedDays)} روز تقویمی
                  </div>
                </div>
              </div>

              {/* Jalali Date Pickers */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تاریخ شروع (شمسی YYYY/MM/DD):</label>
                  <input
                    type="text"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="1405/08/01"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تاریخ پایان (شمسی YYYY/MM/DD):</label>
                  <input
                    type="text"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="1405/08/30"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
              </div>

              {selectedEmployee && (
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1 text-slate-800">
                  <div className="font-bold text-blue-950">تثبیت اقلام قراردادی در لحظه صدور:</div>
                  <div className="flex justify-between">
                    <span>حقوق پایه ثبت‌شده:</span>
                    <strong>{formatTomans(selectedEmployee.salary)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-900 font-semibold">حق فنی قراردادی ثبت‌شده:</span>
                    <strong className="text-blue-900 font-bold">{formatTomans(selectedEmployee.technicalAllowance)}</strong>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">توضیحات یا شروط الحاقی:</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تمدید پیرو رضایت سرپرست کارگاه از کیفیت جوشکاری..."
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold cursor-pointer transition-colors shadow-xs"
                >
                  ثبت قرارداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
