import React, { useState } from 'react';
import { TeamKpiEvaluation, UserSession } from '../../types';
import { formatTomans, toPersianDigits, formatPercent } from '../../utils/formatters';
import { Award, Calculator, ShieldCheck, CheckCircle2, RotateCcw, AlertTriangle, Eye, ArrowRight, UserCheck } from 'lucide-react';

interface ProductionKpiViewProps {
  evaluations: TeamKpiEvaluation[];
  currentSession: UserSession;
  onUpdateEvaluation: (ev: TeamKpiEvaluation) => void;
  onNavigateToPayroll: () => void;
}

export const ProductionKpiView: React.FC<ProductionKpiViewProps> = ({
  evaluations,
  currentSession,
  onUpdateEvaluation,
  onNavigateToPayroll
}) => {
  const [activeEvId, setActiveEvId] = useState<string>(evaluations[0]?.id || '');
  const [selectedEvaluation, setSelectedEvaluation] = useState<TeamKpiEvaluation>(evaluations[0]);
  
  // Modal for Preview / Payroll transfer
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  // Switch active evaluation
  const handleSelectEval = (ev: TeamKpiEvaluation) => {
    setActiveEvId(ev.id);
    setSelectedEvaluation(ev);
    setTransferModalOpen(false);
    setActionSuccessMsg('');
  };

  // Perform Payroll Transfer (Optional opt-in)
  const handleConfirmTransfer = () => {
    if (!confirmCheckbox) return;
    const updated: TeamKpiEvaluation = {
      ...selectedEvaluation,
      status: 'transferred_to_payroll',
      transferredToPayroll: true,
      transferredMonth: '2026-10',
      transferReason: approvalNote || 'تایید رسمی انتقال کارانه ماه مهر به فیش حقوقی توسط مدیر مالی/مدیرعامل'
    };
    setSelectedEvaluation(updated);
    onUpdateEvaluation(updated);
    setTransferModalOpen(false);
    setActionSuccessMsg('کارانه این ارزیابی با موفقیت به عنوان قلم مجزا (payrollAdjustments) به فیش ماه جاری اضافه شد. حقوق پایه دست‌نخورده باقی ماند.');
  };

  // Revert transfer (Cancel bonus without touching base salary)
  const handleRevertTransfer = () => {
    const updated: TeamKpiEvaluation = {
      ...selectedEvaluation,
      status: 'approved',
      transferredToPayroll: false,
      transferReason: 'لغو و بازگشت انتقال کارانه به درخواست کاربر با حفظ کامل حقوق پایه'
    };
    setSelectedEvaluation(updated);
    onUpdateEvaluation(updated);
    setActionSuccessMsg('انتقال کارانه به فیش لغو شد. اقلام کارانه از فیش حذف و خالص به حالت قبلی بازگشت.');
  };

  return (
    <div className="space-y-6">
      {/* Policy and Principles Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
              <Award className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              سامانه محاسبه و اعمال کارانه تولید رضوان (مدل مصوب ۵۰ امتیاز + ۶۰٪ تیمی و ۴۰٪ فردی)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
            طبق سیاست کارخانه: حدنصاب الزامی <strong>۵۰ امتیاز</strong> است و فقط مازاد بر ۵۰ مشمول پرداخت می‌شود. هر امتیاز مازاد معادل <strong>۱٬۰۰۰٬۰۰۰ تومان</strong> است. تقسیم کارانه بین ۴ عضو تیم شامل <strong>۶۰٪ سهم مشترک</strong> (۱۵٪ هر نفر) و <strong>۴۰٪ بر مبنای ارزیابی عملکرد فردی</strong> سرپرست است. اعمال در فیش <strong>کاملاً اختیاری و با قابلیت بازگشت (Revert)</strong> است.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
            دوره ارزیابی: مهر ۱۴۰۵ (2026-10)
          </span>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => onNavigateToPayroll()}
            className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
          >
            مشاهده در ماژول فیش حقوقی
          </button>
        </div>
      )}

      {/* Select Team Evaluation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {evaluations.map((ev) => (
          <button
            key={ev.id}
            onClick={() => handleSelectEval(ev)}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              activeEvId === ev.id
                ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            تیم {ev.teamNumber} {ev.teamKind} ({toPersianDigits(ev.productionPoints)} امتیاز)
            {ev.transferredToPayroll && ' · اعمال در فیش ✓'}
          </button>
        ))}
      </div>

      {/* Selected Evaluation Breakdown & Live Metrics */}
      {selectedEvaluation && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Summary Metrics */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                خلاصه محاسبات تیم {selectedEvaluation.teamNumber} {selectedEvaluation.teamKind}
              </h3>
              <span className="text-[11px] font-mono text-slate-500">{selectedEvaluation.periodKey}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                <span className="text-slate-600">امتیاز تحقق‌یافته تولید:</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {toPersianDigits(selectedEvaluation.productionPoints)} امتیاز
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                <span className="text-slate-600">امتیاز مشمول کارانه (مازاد بر ۵۰):</span>
                <span className="text-sm font-bold text-amber-700 tabular-nums">
                  {toPersianDigits(selectedEvaluation.surplusPoints)} امتیاز
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50/80 border border-blue-200">
                <span className="text-blue-900 font-semibold">کل حوضچه کارانه تیم:</span>
                <span className="text-base font-bold text-blue-900 tabular-nums">
                  {formatTomans(selectedEvaluation.totalBonusPool)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">سهم مشترک (۶۰٪):</span>
                  <strong className="text-slate-900">{formatTomans(selectedEvaluation.teamShareAmount)}</strong>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">سهم ارزیابی فردی (۴۰٪):</span>
                  <strong className="text-slate-900">{formatTomans(selectedEvaluation.individualShareAmount)}</strong>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                <div>ارزیابی‌شده توسط: <strong>{selectedEvaluation.evaluatedBy}</strong></div>
                <div>تایید نهایی: <strong>{selectedEvaluation.approvedBy}</strong> ({selectedEvaluation.approvalDate})</div>
                <div>یادداشت: {selectedEvaluation.notes}</div>
              </div>
            </div>

            {/* Transfer / Revert Status Controls */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              {selectedEvaluation.transferredToPayroll ? (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>کارانه این ارزیابی به فیش حقوقی منتقل شده است.</span>
                  </div>

                  <button
                    onClick={handleRevertTransfer}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>بازگشت و لغو کارانه از فیش (Revert بدون آسیب به حقوق)</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setConfirmCheckbox(false);
                    setApprovalNote('');
                    setTransferModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>پیش‌نمایش و اعمال اختیاری در فیش حقوقی</span>
                </button>
              )}
            </div>
          </div>

          {/* Right (2 Cols): 4 Members Distribution Table */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  جدول سهم نهایی ۴ عضو تیم (مدل ریاضی رضوان)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  سهم مشترک تیمی برابر (۱۵٪ هر نفر) + سهم فردی متناسب با امتیاز ارزیابی سرپرست
                </p>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md font-semibold border border-emerald-200">
                مجموع: {formatTomans(selectedEvaluation.totalBonusPool)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                    <th className="py-2.5 px-3">نام و سمت عضو تیم</th>
                    <th className="py-2.5 px-3">امتیاز KPI فردی</th>
                    <th className="py-2.5 px-3">سهم تیمی (۶۰٪/۴)</th>
                    <th className="py-2.5 px-3">سهم ارزیابی فردی (۴۰٪)</th>
                    <th className="py-2.5 px-3">کل کارانه قابل پرداخت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedEvaluation.members.map((m, idx) => (
                    <tr key={m.employeeId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 font-medium text-slate-900">
                        <div>{m.employeeName}</div>
                        <span className="text-[11px] text-slate-400 font-mono">RZ-{idx + 101}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span className="tabular-nums">{toPersianDigits(m.individualScore)}</span>
                          <span className="text-[10px] text-slate-400">/ ۱۰۰</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-700">
                        {formatTomans(m.teamShare)}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-blue-700 font-medium">
                        {formatTomans(m.individualShare)}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-emerald-800 font-bold text-sm bg-emerald-50/40">
                        {formatTomans(m.totalShare)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="py-2.5 px-3">مجموع ۴ سهم</td>
                    <td className="py-2.5 px-3">
                      {toPersianDigits(selectedEvaluation.members.reduce((acc, x) => acc + x.individualScore, 0))} امتیاز
                    </td>
                    <td className="py-2.5 px-3">{formatTomans(selectedEvaluation.teamShareAmount)}</td>
                    <td className="py-2.5 px-3">{formatTomans(selectedEvaluation.individualShareAmount)}</td>
                    <td className="py-2.5 px-3 text-emerald-900 font-bold text-sm">
                      {formatTomans(selectedEvaluation.totalBonusPool)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Note about rounding and payroll safety */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
              <div><strong>تضمین پایداری ریاضی:</strong> سیستم از کسر یا گردکردن ناقص جلوگیری می‌کند و کسر ریالی نهایی به آخرین سهم اضافه می‌شود تا مجموع چهار سهم بدون حتی ۱ ریال مغایرت با حوضچه کارانه برابر باشد.</div>
              <div><strong>عدم اعمال خودکار:</strong> این کارانه مستقل از حقوق پایه است و تا زمانی که دکمه «تایید انتقال» زده نشود، فیش حقوقی پرسنل هیچ تغییری نمی‌کند.</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Optional Payroll Transfer Confirmation */}
      {transferModalOpen && selectedEvaluation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-700" />
                <span>انتقال اختیاری کارانه به فیش حقوقی ماه مهر ۱۴۰۵</span>
              </h3>
              <button
                onClick={() => setTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              این عملیات مبالغ محاسبه‌شده کارانه را به عنوان قلم اختصاصی <strong>payrollAdjustments</strong> به فیش حقوقی ۴ عضو تیم اضافه می‌کند. حقوق پایه، حق فنی و قراردادهای پرسنل دست‌نخورده باقی می‌مانند.
            </p>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>تیم:</span>
                <strong>تیم {selectedEvaluation.teamNumber} {selectedEvaluation.teamKind}</strong>
              </div>
              <div className="flex justify-between">
                <span>مبلغ کل انتقال:</span>
                <strong className="text-emerald-700 font-bold">{formatTomans(selectedEvaluation.totalBonusPool)}</strong>
              </div>
              <div className="flex justify-between">
                <span>تعداد پرسنل مشمول:</span>
                <strong>۴ نفر</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">دلیل انتقال / مصوبه مالی:</label>
              <textarea
                rows={2}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="تایید کارانه ماه مهر به دلیل تحویل به موقع سفارشات..."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmCheckbox}
                  onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  className="rounded text-blue-600 mt-0.5"
                />
                <span className="leading-snug">
                  صریحاً انتخاب می‌کنم که کارانه این ارزیابی به مبلغ <strong>{formatTomans(selectedEvaluation.totalBonusPool)}</strong> به فیش حقوقی ماه جاری منتقل شود و مسئولیت مالی آن را تایید می‌نمایم.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                بازگشت بدون تغییر حقوق (پیش‌فرض)
              </button>
              <button
                type="button"
                disabled={!confirmCheckbox}
                onClick={handleConfirmTransfer}
                className={`px-5 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  confirmCheckbox
                    ? 'bg-blue-700 hover:bg-blue-800 text-white shadow-xs'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                تایید قطعی انتقال به فیش
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
