import React, { useState } from 'react';
import { HiringScenario, WageScenario, Department } from '../../types';
import { formatTomans, toPersianDigits, formatPercent } from '../../utils/formatters';
import { SlidersHorizontal, Calculator, TrendingUp, Plus, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface FinancialScenariosViewProps {
  hiringScenarios: HiringScenario[];
  wageScenarios: WageScenario[];
  onSaveHiringScenario: (scen: HiringScenario) => void;
  onSaveWageScenario: (scen: WageScenario) => void;
}

export const FinancialScenariosView: React.FC<FinancialScenariosViewProps> = ({
  hiringScenarios,
  wageScenarios,
  onSaveHiringScenario,
  onSaveWageScenario
}) => {
  const [activeTab, setActiveTab] = useState<'hiring' | 'wage'>('hiring');

  // Hiring simulator inputs
  const [hireTitle, setHireTitle] = useState('افزودن تیم ۳ آهنگری جهت ساخت شاسی‌های صادراتی');
  const [hirePosition, setHirePosition] = useState('استادکار جوشکار و مونتاژکار شاسی');
  const [hireDept, setHireDept] = useState<Department>('آهنگری و ساخت شاسی');
  const [headcount, setHeadcount] = useState<number>(4);
  const [monthlySalary, setMonthlySalary] = useState<number>(14000000); // 14M Tomans
  const [monthlyBenefits, setMonthlyBenefits] = useState<number>(3000000); // 3M
  const [monthlyOvertime, setMonthlyOvertime] = useState<number>(2500000); // 2.5M
  const [rampUpMonths, setRampUpMonths] = useState<number>(2); // 2 months
  const [oneTimeRecruitCost, setOneTimeRecruitCost] = useState<number>(18000000); // 18M total
  const [additionalRevenue, setAdditionalRevenue] = useState<number>(480000000); // 480M monthly revenue after ramp-up
  const [contributionMarginPct, setContributionMarginPct] = useState<number>(35); // 35% margin

  // Wage simulator inputs
  const [wageTitle, setWageTitle] = useState('طرح تعدیل ترمیمی حق فنی استادکاران');
  const [wageDept, setWageDept] = useState<Department>('آهنگری و ساخت شاسی');
  const [baseIncreasePct, setBaseIncreasePct] = useState<number>(0);
  const [technicalIncreasePct, setTechnicalIncreasePct] = useState<number>(20); // 20% increase on technical allowance

  // Live calculation of 12-Month Hiring ROI (econ-linear-ramp-v2)
  const employerInsurancePerPerson = Math.round((monthlySalary + monthlyBenefits + monthlyOvertime) * 0.23);
  const fullMonthlyCostPerPerson = monthlySalary + monthlyBenefits + monthlyOvertime + employerInsurancePerPerson;
  const totalMonthlyLaborCost = fullMonthlyCostPerPerson * headcount;

  // Monthly contribution after ramp-up
  const fullMonthlyContribution = (additionalRevenue * contributionMarginPct) / 100;

  // 12 months linear ramp-up simulation
  let firstYearContribution = 0;
  for (let m = 1; m <= 12; m++) {
    const factor = rampUpMonths > 0 ? Math.min(1.0, m / (rampUpMonths + 1)) : 1.0;
    firstYearContribution += fullMonthlyContribution * factor;
  }

  const firstYearTotalCost = (totalMonthlyLaborCost * 12) + oneTimeRecruitCost;
  const firstYearNetImpact = firstYearContribution - firstYearTotalCost;
  const annualRoi = firstYearTotalCost > 0 ? (firstYearNetImpact / firstYearTotalCost) * 100 : 0;
  const breakEvenMonths = firstYearNetImpact > 0 ? (firstYearTotalCost / (firstYearContribution / 12)) : 0;

  // Live calculation for wage increase
  // For 8 blacksmiths in forge department (average technical allowance ~7M)
  const affectedBlacksmiths = 8;
  const avgTechAllowance = 7000000;
  const monthlyTechDelta = (avgTechAllowance * (technicalIncreasePct / 100)) * affectedBlacksmiths;
  const monthlyInsuranceDelta = Math.round(monthlyTechDelta * 0.23);
  const totalMonthlyWageDelta = monthlyTechDelta + monthlyInsuranceDelta;
  const totalAnnualWageDelta = totalMonthlyWageDelta * 12;

  const handleSaveHiring = () => {
    const newScen: HiringScenario = {
      id: `scen-hire-${Date.now()}`,
      title: hireTitle,
      position: hirePosition,
      department: hireDept,
      headcount,
      salary: monthlySalary,
      employerInsurance: employerInsurancePerPerson,
      benefits: monthlyBenefits,
      overtime: monthlyOvertime,
      recruitmentCost: oneTimeRecruitCost,
      trainingCost: 0,
      onboardingCost: 0,
      hiringAdvertisingCost: 0,
      averageInterviewCost: 0,
      recruitmentCostIncludesAdsInterview: true,
      rampUpMonths,
      additionalRevenue,
      contributionMarginRatio: contributionMarginPct / 100,
      calculationVersion: 'econ-linear-ramp-v2',
      createdAt: '1405/07/22',
      annualRoi: Math.round(annualRoi * 10) / 10,
      annualNetImpact: Math.round(firstYearNetImpact),
      firstYearTotalCost: Math.round(firstYearTotalCost),
      firstYearContribution: Math.round(firstYearContribution),
      breakEvenMonths: Math.round(breakEvenMonths * 10) / 10,
      status: 'تحلیلی'
    };
    onSaveHiringScenario(newScen);
    alert('سناریوی استخدامی جدید با موفقیت ذخیره شد (صرفاً تحلیلی و بدون تغییر دیتابیس حقوق).');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              مرکز یکپارچه شبیه‌ساز سناریوهای مالی و استخدام (نسخه econ-linear-ramp-v2)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
            محاسبه بازگشت سرمایه استخدام (ROI)، تحلیل شیب رسیدن به بهره‌وری کامل (Ramp-up)، و برآورد تغییرات اقتصادی احکام. <strong>تمام نتایج صرفاً تحلیلی بوده و هرگز حقوق واقعی، قراردادها یا فیش پرسنل را تغییر نمی‌دهند.</strong>
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('hiring')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'hiring' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            شبیه‌ساز استخدام جدید
          </button>
          <button
            onClick={() => setActiveTab('wage')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === 'wage' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            شبیه‌ساز افزایش حقوق و حق فنی
          </button>
        </div>
      </div>

      {/* HIRING SIMULATOR */}
      {activeTab === 'hiring' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left 2 Cols: Form Inputs */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-700" />
              <span>پارامترهای ورودی سناریوی استخدام (مدل شیب خطی Ramp-up)</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">عنوان سناریو:</label>
                <input
                  type="text"
                  value={hireTitle}
                  onChange={(e) => setHireTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">عنوان سمت شغلی:</label>
                  <input
                    type="text"
                    value={hirePosition}
                    onChange={(e) => setHirePosition(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">واحد کارگاهی:</label>
                  <select
                    value={hireDept}
                    onChange={(e) => setHireDept(e.target.value as Department)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="آهنگری و ساخت شاسی">آهنگری و ساخت شاسی</option>
                    <option value="بنایی و نماکاری">بنایی و نماکاری</option>
                    <option value="مونتاژ، برق و تاسیسات">مونتاژ و برق</option>
                    <option value="کنترل کیفیت و تست">کنترل کیفیت</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تعداد نیرو (Headcount):</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={headcount}
                    onChange={(e) => setHeadcount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-blue-900"
                  />
                </div>
              </div>

              {/* Monthly Costs */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="font-bold text-slate-900 block">هزینه‌های جاری ماهانه هر نفر (تومان):</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">حقوق ناخالص ماهانه:</label>
                    <input
                      type="number"
                      step={500000}
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">مزایا و بن و مسکن:</label>
                    <input
                      type="number"
                      step={500000}
                      value={monthlyBenefits}
                      onChange={(e) => setMonthlyBenefits(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">اضافه کاری پیش‌بینی‌شده:</label>
                    <input
                      type="number"
                      step={500000}
                      value={monthlyOvertime}
                      onChange={(e) => setMonthlyOvertime(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 pt-1">
                  بیمه سهم کارفرما (۲۳٪ معادل {formatTomans(employerInsurancePerPerson)}) خودکار محاسبه شده است.
                </div>
              </div>

              {/* Ramp-up & Revenue */}
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2">
                <span className="font-bold text-blue-950 block">پیش‌بینی درآمد اضافی و دوره یادگیری (Ramp-up):</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">ماه‌های دوره یادگیری (N):</label>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={rampUpMonths}
                      onChange={(e) => setRampUpMonths(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-bold"
                    />
                    <span className="text-[10px] text-slate-500 block mt-0.5">صفر = بهره‌وری کامل از ماه اول</span>
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1">درآمد اضافه ماهانه (تومان):</label>
                    <input
                      type="number"
                      step={10000000}
                      value={additionalRevenue}
                      onChange={(e) => setAdditionalRevenue(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1">نسبت حاشیه مشارکت (٪):</label>
                    <input
                      type="number"
                      min={5}
                      max={95}
                      value={contributionMarginPct}
                      onChange={(e) => setContributionMarginPct(parseInt(e.target.value) || 35)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-bold"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-slate-700 mb-1">کل هزینه‌های یک‌باره جذب، آموزش و تجهیز کارگاه (تومان):</label>
                  <input
                    type="number"
                    step={1000000}
                    value={oneTimeRecruitCost}
                    onChange={(e) => setOneTimeRecruitCost(parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500">
                  فرمول: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">Factor(m) = min(1, m/(N+1))</code>
                </span>
                <button
                  type="button"
                  onClick={handleSaveHiring}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg cursor-pointer transition-colors shadow-xs"
                >
                  ذخیره این سناریوی تحلیلی
                </button>
              </div>
            </div>
          </div>

          {/* Right 1 Col: Live ROI Output Cockpit */}
          <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-xl p-5 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span>برآورد اقتصادی سال اول (۱۲ ماه)</span>
              </h4>
              <span className="text-[10px] bg-blue-800 text-blue-200 px-2 py-0.5 rounded font-mono">
                v2-linear
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-slate-300 block text-[11px]">مشارکت ناخالص سال اول:</span>
                <span className="text-base font-bold text-emerald-400 tabular-nums">
                  {formatTomans(firstYearContribution)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  با احتساب شیب {toPersianDigits(rampUpMonths)} ماهه یادگیری
                </span>
              </div>

              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-slate-300 block text-[11px]">هزینه کل سال اول ({toPersianDigits(headcount)} نفر):</span>
                <span className="text-base font-bold text-slate-100 tabular-nums">
                  {formatTomans(firstYearTotalCost)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  شامل حقوق، بیمه کارفرما و جذب یک‌باره
                </span>
              </div>

              <div className="p-3 bg-white/10 rounded-lg border border-white/20">
                <span className="text-slate-300 block text-[11px]">اثر خالص نقدینگی سال اول:</span>
                <span className={`text-lg font-bold tabular-nums ${firstYearNetImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatTomans(firstYearNetImpact)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-2.5 rounded bg-black/30 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">نرخ بازگشت سالانه (ROI):</span>
                  <span className={`text-base font-bold tabular-nums ${annualRoi >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {formatPercent(annualRoi)}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-black/30 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">نقطه سر به سر:</span>
                  <span className="text-base font-bold text-white tabular-nums">
                    {firstYearNetImpact > 0 ? `${toPersianDigits(breakEvenMonths.toFixed(1))} ماه` : 'غیرسودده'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 leading-relaxed">
              <strong>تاییدیه سیستم:</strong> این تحلیل صرفاً جهت تصمیم‌گیری در هیئت مدیره تولید تنورسازی رضوان است و تا تصویب نهایی در صورت‌جلسه، هیچ اثری بر سامانه حقوق نخواهد داشت.
            </div>
          </div>
        </div>
      )}

      {/* WAGE INCREASE SIMULATOR */}
      {activeTab === 'wage' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              شبیه‌ساز افزایش حقوق گروهی و تعدیل حق فنی استادکاران
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">عنوان سناریو:</label>
                <input
                  type="text"
                  value={wageTitle}
                  onChange={(e) => setWageTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">واحد مشمول افزایش:</label>
                  <select
                    value={wageDept}
                    onChange={(e) => setWageDept(e.target.value as Department)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="آهنگری و ساخت شاسی">آهنگری و ساخت شاسی (۸ نفر استادکار و جوشکار)</option>
                    <option value="بنایی و نماکاری">بنایی و نماکاری (۱۲ نفر استادکار و بنا)</option>
                    <option value="مونتاژ، برق و تاسیسات">مونتاژ و برق</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تعداد پرسنل تحت پوشش:</label>
                  <div className="px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 font-bold text-slate-800">
                    {toPersianDigits(affectedBlacksmiths)} نفر
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">درصد افزایش حق فنی قراردادی (٪):</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={technicalIncreasePct}
                    onChange={(e) => setTechnicalIncreasePct(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-bold text-blue-900"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">افزایش روی حق فنی استادکاری</span>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">درصد افزایش حقوق پایه (٪):</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={baseIncreasePct}
                    onChange={(e) => setBaseIncreasePct(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-bold"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">پایه قانون کار (معمولاً سالانه)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Cost Impact */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              برآورد بار مالی افزایش
            </h4>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">افزایش ماهانه حق فنی ({toPersianDigits(affectedBlacksmiths)} نفر):</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  +{formatTomans(monthlyTechDelta)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">افزایش بیمه سهم کارفرما (۲۳٪):</span>
                <span className="text-sm font-bold text-slate-700 tabular-nums">
                  +{formatTomans(monthlyInsuranceDelta)}
                </span>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-blue-900 font-semibold block text-[11px]">کل افزایش نقدینگی ماهانه شرکت:</span>
                <span className="text-base font-bold text-blue-900 tabular-nums">
                  +{formatTomans(totalMonthlyWageDelta)}
                </span>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="text-indigo-900 font-semibold block text-[11px]">بار مالی کل سال (۱۲ ماه):</span>
                <span className="text-base font-bold text-indigo-950 tabular-nums">
                  +{formatTomans(totalAnnualWageDelta)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
