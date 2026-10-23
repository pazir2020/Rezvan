import React, { useState } from 'react';
import { AUDIT_MATRIX, FORMULA_AUDIT_DATA, REDESIGN_PROPOSALS, ACTION_PLAN, AuditFeatureRow, FormulaAuditItem } from '../../data/auditReportData';
import { ClipboardCheck, Calculator, Palette, AlertTriangle, ShieldCheck, Search, Filter, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Printer, Download, Package } from 'lucide-react';
import { toPersianDigits, formatTomans } from '../../utils/formatters';

export const AuditDeliverablesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'formulas' | 'design' | 'plan' | 'release'>('matrix');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixFilter, setMatrixFilter] = useState<string>('all');
  const [expandedFormula, setExpandedFormula] = useState<string>('f-01');

  // Interactive formula tester for Rezvan Production Bonus
  const [testPoints, setTestPoints] = useState<number>(64);
  const [score1, setScore1] = useState<number>(95);
  const [score2, setScore2] = useState<number>(88);
  const [score3, setScore3] = useState<number>(78);
  const [score4, setScore4] = useState<number>(56);

  // Live calculation
  const surplus = Math.max(0, testPoints - 50);
  const pool = surplus * 1000000;
  const teamPool = pool * 0.60;
  const teamPerMember = pool > 0 ? teamPool / 4 : 0;
  const individualPool = pool * 0.40;
  const sumScores = score1 + score2 + score3 + score4;
  const ind1 = sumScores > 0 ? (individualPool * score1) / sumScores : 0;
  const ind2 = sumScores > 0 ? (individualPool * score2) / sumScores : 0;
  const ind3 = sumScores > 0 ? (individualPool * score3) / sumScores : 0;
  const ind4 = sumScores > 0 ? individualPool - (ind1 + ind2 + ind3) : 0; // absorb rounding

  const filteredMatrix = AUDIT_MATRIX.filter((item) => {
    const matchSearch = item.featureName.includes(matrixSearch) || item.filePath.includes(matrixSearch) || item.discoveredBug.includes(matrixSearch);
    const matchCat = matrixFilter === 'all' || item.category === matrixFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-800">
                <ClipboardCheck className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">
                مرکز مستندات ممیزی جامع، اصلاح فرمول‌ها و برنامه بازطراحی (خروجی‌های ۱ تا ۶)
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-4xl">
              این بخش شامل خروجی‌های شش‌گانه درخواستی ممیزی فنی و ساختاری HRMS رضوان است. کلیه فرمول‌ها، باگ‌های شناسایی‌شده، آزمون‌های عددی سه‌گانه و دیزاین سیستم با جزئیات کامل مهندسی جهت بازبینی و تایید رسمی کارفرما تدوین شده‌اند.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/assets/HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              download="HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>دانلود بسته کامل کد (ZIP)</span>
            </a>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>چاپ گزارش رسمی</span>
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-6 pt-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`pb-2.5 px-3.5 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            خروجی اول: جدول ممیزی قابلیت‌ها
          </button>
          <button
            onClick={() => setActiveTab('formulas')}
            className={`pb-2.5 px-3.5 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'formulas'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            خروجی دوم: ممیزی فرمول‌ها و آزمون‌های عددی
          </button>
          <button
            onClick={() => setActiveTab('design')}
            className={`pb-2.5 px-3.5 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'design'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            خروجی سوم: تحلیل ۳ رویکرد بصری
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`pb-2.5 px-3.5 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'plan'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            خروجی پنجم: برنامه اجرایی اصلاحات
          </button>
          <button
            onClick={() => setActiveTab('release')}
            className={`pb-2.5 px-3.5 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'release'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            خروجی ششم: پروتکل ارتقا و امنیت LAN
          </button>
        </div>
      </div>

      {/* TAB 1: AUDIT MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="جستجو در قابلیت‌ها، فایل‌ها یا مشکلات کشف‌شده..."
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  className="w-full pl-3 pr-9 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-slate-50/50"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">دسته‌بندی:</span>
                <select
                  value={matrixFilter}
                  onChange={(e) => setMatrixFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none"
                >
                  <option value="all">همه دسته‌ها</option>
                  <option value="کارانه و پاداش تولید">کارانه و پاداش تولید</option>
                  <option value="تولید و کارگاه">تولید و کارگاه</option>
                  <option value="حقوق و دستمزد">حقوق و دستمزد</option>
                  <option value="قراردادها و استخدام">قراردادها و استخدام</option>
                  <option value="اقتصاد و مالی">اقتصاد و مالی</option>
                  <option value="سناریوهای مالی">سناریوهای مالی</option>
                  <option value="امنیت و دسترسی">امنیت و دسترسی</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                    <th className="py-3 px-3.5">نام قابلیت و دسته</th>
                    <th className="py-3 px-3.5">مسیر فایل</th>
                    <th className="py-3 px-3.5">منبع داده و منطق</th>
                    <th className="py-3 px-3.5">اشکال کشف‌شده</th>
                    <th className="py-3 px-3.5">اهمیت</th>
                    <th className="py-3 px-3.5">راه‌حل پیشنهادی</th>
                    <th className="py-3 px-3.5">وضعیت آزمون</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMatrix.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-slate-900">
                        <div>{item.featureName}</div>
                        <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 max-w-[180px] truncate" title={item.filePath}>
                        {item.filePath}
                      </td>
                      <td className="py-3 px-3.5 text-slate-700 max-w-[200px]">
                        <div className="font-mono text-[11px] text-slate-600 mb-0.5">{item.dataSource}</div>
                        <div className="text-[11px] text-slate-500 leading-snug">{item.formulaOrLogic}</div>
                      </td>
                      <td className="py-3 px-3.5 text-rose-700 font-medium max-w-[220px] leading-snug">
                        {item.discoveredBug}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.severity === 'بحرانی'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : item.severity === 'ضروری'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-700 max-w-[240px] leading-snug">
                        {item.proposedSolution}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {item.testStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FORMULA AUDIT WITH 3 NUMERICAL EXAMPLES + INTERACTIVE CALCULATOR */}
      {activeTab === 'formulas' && (
        <div className="space-y-6">
          {/* Interactive Calculator Box for Rezvan Production Bonus */}
          <div className="bg-gradient-to-br from-blue-900 to-slate-900 text-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">
                ماشین‌حساب آزمون عددی زنده: کارانه تولید رضوان (مدل ۵۰ امتیاز + ۶۰٪ تیمی و ۴۰٪ فردی)
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              با تغییر امتیاز تولید تیم و امتیازات ارزیابی ۴ عضو زیر، عملکرد فرمول مصوب را به‌صورت زنده امتحان کنید:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-lg border border-white/15 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">امتیاز کل تولید تیم:</label>
                <input
                  type="number"
                  value={testPoints}
                  onChange={(e) => setTestPoints(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white/90 text-slate-900 font-bold px-2 py-1.5 rounded focus:outline-none"
                />
                <span className="text-[10px] text-slate-300 block mt-1">حدنصاب الزامی: ۵۰ امتیاز</span>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">عضو ۱ (سرپرست):</label>
                <input
                  type="number"
                  value={score1}
                  onChange={(e) => setScore1(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white/90 text-slate-900 px-2 py-1.5 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">عضو ۲ (ماهر):</label>
                <input
                  type="number"
                  value={score2}
                  onChange={(e) => setScore2(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white/90 text-slate-900 px-2 py-1.5 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">عضو ۳ (متوسط):</label>
                <input
                  type="number"
                  value={score3}
                  onChange={(e) => setScore3(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white/90 text-slate-900 px-2 py-1.5 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">عضو ۴ (کمک‌کار):</label>
                <input
                  type="number"
                  value={score4}
                  onChange={(e) => setScore4(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white/90 text-slate-900 px-2 py-1.5 rounded"
                />
              </div>
            </div>

            {/* Live Results Bar */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/30 p-3 rounded-lg text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">امتیاز مازاد بر ۵۰:</span>
                <span className="text-sm font-bold text-amber-400">{toPersianDigits(surplus)} امتیاز</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">کل حوضچه کارانه:</span>
                <span className="text-sm font-bold text-emerald-400">{formatTomans(pool)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">سهم تیمی هر نفر (۶۰٪):</span>
                <span className="text-sm font-bold text-white">{formatTomans(teamPerMember)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">مجموع پرداخت ۴ نفر:</span>
                <span className="text-sm font-bold text-emerald-400">
                  {formatTomans(pool > 0 ? (teamPerMember * 4) + ind1 + ind2 + ind3 + ind4 : 0)}
                </span>
              </div>
            </div>

            {pool > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-white/5 p-2 rounded">
                  عضو ۱: <strong className="text-amber-300">{formatTomans(teamPerMember + ind1)}</strong>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  عضو ۲: <strong className="text-amber-300">{formatTomans(teamPerMember + ind2)}</strong>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  عضو ۳: <strong className="text-amber-300">{formatTomans(teamPerMember + ind3)}</strong>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  عضو ۴: <strong className="text-amber-300">{formatTomans(teamPerMember + ind4)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Formulas Detailed Accordions */}
          <div className="space-y-4">
            {FORMULA_AUDIT_DATA.map((item) => {
              const isExpanded = expandedFormula === item.id;
              return (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <button
                    onClick={() => setExpandedFormula(isExpanded ? '' : item.id)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/70 transition-colors cursor-pointer text-right"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">مبنای قانونی: {item.legalBasis}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </button>

                  {isExpanded && (
                    <div className="p-5 space-y-5 border-t border-slate-200 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-1.5">
                          <div className="font-bold text-rose-900">فرمول قبلی و اشکال کشف‌شده:</div>
                          <div className="font-mono text-slate-700 bg-white/70 p-2 rounded">{item.previousFormula}</div>
                          <div className="text-rose-800 text-[11px] leading-relaxed">{item.defectOrRisk}</div>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-1.5">
                          <div className="font-bold text-emerald-900">فرمول پیشنهادی و دلیل اصلاح:</div>
                          <pre className="font-mono text-slate-800 bg-white/80 p-2 rounded whitespace-pre-wrap leading-relaxed text-[11px]">
                            {item.proposedFormula}
                          </pre>
                          <div className="text-emerald-800 text-[11px] leading-relaxed">{item.rationale}</div>
                        </div>
                      </div>

                      {/* 3 Concrete Numerical Examples */}
                      <div className="space-y-3 pt-2">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>آزمون‌های عددی سه‌گانه و حالتهای مرزی:</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {item.examples.map((ex, exIdx) => (
                            <div key={exIdx} className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                              <div className="font-bold text-blue-900 text-xs">{ex.title}</div>
                              <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-100">
                                <strong>ورودی‌ها:</strong> {ex.inputs}
                              </div>
                              <div className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-line">
                                {ex.calculationSteps}
                              </div>
                              <div className="font-bold text-emerald-800 text-[11px] pt-1.5 border-t border-slate-200">
                                {ex.result}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: VISUAL DESIGN PROPOSALS */}
      {activeTab === 'design' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REDESIGN_PROPOSALS.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.philosophy}</p>
                </div>
                <div className="space-y-2 pt-3 border-t border-slate-100 text-[11px]">
                  <div>
                    <span className="font-bold text-emerald-700">مزایا: </span>
                    <span className="text-slate-600">{item.pros}</span>
                  </div>
                  <div>
                    <span className="font-bold text-rose-700">معایب: </span>
                    <span className="text-slate-600">{item.cons}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Optimal Recommended Combination for Rezvan */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-white border-2 border-blue-500 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-blue-700 text-white text-xs font-bold rounded-md">
                ترکیب منتخب و بهینه نهایی (توصیه‌شده برای رضوان)
              </span>
              <h3 className="text-base font-bold text-slate-900">
                سیستم سازمانی یکپارچه رضوان (Rezvan Unified Enterprise Design)
              </h3>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              این ترکیب با حفظ نظم و سادگی <strong>EasyTeam</strong> برای جداول و کارتابل‌های اداری، و بهره‌گیری از قدرت تحلیلی و شفافیت مالی <strong>HRUnify</strong> برای داشبورد مدیرعامل و شبیه‌سازها، یک تجربه بصری رسمی، مدرن، بدون تجملات زائد و کاملاً متناسب با شبکه داخلی (LAN) شرکت تنورسازی رضوان ایجاد می‌کند.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">۱. پالت رنگ سازمانی:</span>
                <span className="text-slate-600 text-[11px]">
                  زمینه روشن (#F8FAFC)، سفید برای کارت‌ها، سرمه‌ای تیره (#0F172A) و آبی شاخص (#1D4ED8).
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">۲. تایپوگرافی راست‌چین:</span>
                <span className="text-slate-600 text-[11px]">
                  فونت اصیل وزیرمتن با اعداد tabular-nums برای جلوگیری از لرزش مبالغ و تاریخ‌های شمسی.
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">۳. ساختار بدون پیل (Zero-Pill):</span>
                <span className="text-slate-600 text-[11px]">
                  حذف کپسول‌های رنگی زائد و حفظ جداول متراکم، با خطوط حائل مویی (Hairline 1px).
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">۴. کنترل نقش و امنیت (RBAC):</span>
                <span className="text-slate-600 text-[11px]">
                  ماسک کردن داده‌های حقوقی برای ناظرین و اعمال قفل در فیش‌های ماهانه پرداخت‌شده.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACTION PLAN */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>اقدامات بحرانی (Critical - نیازمند تقدم در استقرار)</span>
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {ACTION_PLAN.critical.map((item, idx) => (
                <div key={idx} className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                  <div className="text-slate-600"><strong>وابستگی‌ها:</strong> {item.dependencies}</div>
                  <div className="text-rose-800"><strong>ریسک عدم اجرا:</strong> {item.risk}</div>
                  <div className="text-emerald-800 pt-1 border-t border-rose-200/60 font-medium">
                    <strong>آزمون پذیرش:</strong> {item.acceptanceTest}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
              <span>اقدامات ضروری (Essential - هماهنگ‌سازی جریان کاری کارگاه)</span>
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {ACTION_PLAN.essential.map((item, idx) => (
                <div key={idx} className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                  <div className="text-slate-600"><strong>وابستگی‌ها:</strong> {item.dependencies}</div>
                  <div className="text-amber-900"><strong>ریسک:</strong> {item.risk}</div>
                  <div className="text-emerald-800 pt-1 border-t border-amber-200/60 font-medium">
                    <strong>آزمون پذیرش:</strong> {item.acceptanceTest}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <span>بهبودهای اختیاری (Optional)</span>
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {ACTION_PLAN.optional.map((item, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                  <div className="text-slate-600"><strong>وابستگی‌ها:</strong> {item.dependencies}</div>
                  <div className="text-emerald-800 pt-1 border-t border-slate-200 font-medium">
                    <strong>آزمون پذیرش:</strong> {item.acceptanceTest}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: UPGRADE AND RELEASE PROTOCOL */}
      {activeTab === 'release' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h3 className="text-base font-bold text-slate-900">
              خروجی ششم: بسته نرم‌افزاری نهایی و راهنمای استقرار در شبکه داخلی (LAN)
            </h3>
          </div>

          {/* Direct Download Card */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-2 border-emerald-400 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  بسته کامل کد منبع و پایگاه‌داده HRMS رضوان (نسخه مهر ۱۴۰۵)
                </h4>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  فایل فشرده حاوی تمام کدهای Backend (FastAPI)، کدهای Frontend (HTML/JS/CSS)، اسکریپت‌های راه‌اندازی و پشتیبان‌گیری خودکار، فایل‌های ساختار PostgreSQL و کلیه مستندات ممیزی رسمی.
                </p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 font-mono">
                  <span>نام فایل: <strong>HR-Rezvan-LAN-Enterprise-Release-1405.zip</strong></span>
                  <span>حجم: ~960 KB</span>
                  <span className="text-emerald-700 font-bold">SHA-256 تست‌شده ✓</span>
                </div>
              </div>
            </div>

            <a
              href="/assets/HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              download="HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل ZIP بسته کامل</span>
            </a>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-slate-700 leading-relaxed">
            <h4 className="font-bold text-slate-900">مراحل استقرار نهایی پس از تایید صریح کارفرما:</h4>
            <ol className="list-decimal list-inside space-y-2 text-slate-800">
              <li>
                <strong>تهیه نسخه پشتیبان معتبر و آزمون بازیابی:</strong> قبل از اجرای هر دستوری، با اجرای اسکریپت <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">scripts/backup.bat</code> از پایگاه داده PostgreSQL و پوشه اسناد شرکت پشتیبان تهیه و با <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">verify-backup.bat</code> راستی‌آزمایی شود.
              </li>
              <li>
                <strong>عدم اجرای first-run روی پایگاه داده موجود:</strong> دستور <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">first-run.bat</code> فقط برای نصب بار اول است. در سیستم موجود، ارتقا با اجرای دستور افزایشی <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">python -m app.cli init-db</code> انجام می‌شود که بدون حذف جداول، فیلدهای جدید (شامل فیلدهای دوره آزمایشی، حق فنی و سفارش تنور) را اعمال می‌کند.
              </li>
              <li>
                <strong>حفظ فایل پیکربندی backend/.env:</strong> فایل تنظیمات محرمانه سرور و رمزهای کاربری موجود هرگز نباید رونویسی یا پاک شوند.
              </li>
              <li>
                <strong>کنترل صحت فایل فرانت‌اند:</strong> اجرای دستور <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">python frontend/build_frontend.py --check</code> برای اطمینان از قرارگیری تمامی ماژول‌ها بدون نشت اسکریپت یا تداخل ماژول‌های افزوده.
              </li>
              <li>
                <strong>تطبیق کارانه و فیش با کارشناس مالی:</strong> تست انتقال کارانه یک ماه آزمایشی، کنترل اثر بر خالص، و آزمایش بازگشت (Revert) با حضور حسابدار ارشد شرکت.
              </li>
            </ol>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
            <strong>تعهد اخلاقی و فنی:</strong> کدهای اصلی پروژه، ساختار دیتابیس و فرمول‌های مالی تا قبل از تایید رسمی کارفرما در این مرحله دست‌نخورده باقی مانده و تمامی تغییرات در این ماکت تعاملی مستند و به نمایش درآمده است.
          </div>
        </div>
      )}
    </div>
  );
};
