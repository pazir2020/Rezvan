/**
 * HRMS REZVAN - Core Type Definitions
 * Enterprise Human Resource Management & Workshop Operations
 */

export type UserRole = 'admin' | 'hr_manager' | 'hr_specialist' | 'ceo' | 'viewer';

export interface UserSession {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  units: string[]; // e.g. ["تولید", "مالی", "همه"]
  avatar?: string;
}

export type Department = 
  | 'آهنگری و ساخت شاسی'
  | 'بنایی و نماکاری'
  | 'مونتاژ، برق و تاسیسات'
  | 'کنترل کیفیت و تست'
  | 'مالی و حسابداری'
  | 'منابع انسانی و اداری'
  | 'مدیریت و مهندسی';

export interface Employee {
  id: string;
  code: string; // e.g. "RZ-104"
  fullName: string;
  department: Department;
  position: string;
  level: 'مقدماتی' | 'متوسط' | 'ماهر' | 'استادکار / سرپرست' | 'مدیر';
  phone: string;
  hireDate: string; // Jalali e.g. "1402/04/15"
  exitDate?: string;
  status: 'فعال' | 'مرخصی' | 'آزمایشی' | 'تسویه‌شده';
  managerId?: string;
  managerName?: string;
  // Sensitive Tier A (restricted by view_salary, view_national_id, view_bank)
  salary: number; // حقوق پایه (تومان)
  technicalAllowance: number; // حق فنی قراردادی (تومان)
  housingAllowance: number; // حق مسکن
  groceryAllowance: number; // بن کارگری
  childrenAllowance: number; // حق اولاد
  nationalId: string;
  insuranceNo: string;
  bankName: string;
  bankAccount: string;
  sheba: string;
  // Tier B
  gender: 'مرد' | 'زن';
  birthDate: string;
  married: boolean;
  childrenCount: number;
  militaryStatus: 'پایان خدمت' | 'معافیت دائم' | 'معافیت تحصیلی' | 'مشمول' | 'غیرمشمول';
  education: string;
  fieldOfStudy?: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  fte: number; // Full-Time Equivalent (0.1 to 1.0)
  hasProbation: boolean;
  probationStartDate?: string;
  probationEndDate?: string;
  probationDays?: number;
  probationResult?: 'تایید همکاری قطعی' | 'تمدید دوره' | 'عدم احراز' | 'در جریان';
  skills: string[];
}

export interface Contract {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  contractNo: string;
  type: 'یک‌ماهه تمدیدی' | 'سه‌ماهه' | 'شش‌ماهه' | 'یکساله' | 'آزمایشی';
  startDate: string;
  endDate: string;
  position: string;
  baseSalarySnapshot: number;
  technicalAllowanceSnapshot: number;
  status: 'جاری' | 'در شرف انقضا' | 'منقضی' | 'فسخ‌شده';
  signed: boolean;
  signedDate?: string;
  notes?: string;
}

export type OvenModel = 
  | 'تنور سنگک متحرک بزرگ'
  | 'تنور سنگک متحرک متوسط'
  | 'تنور سنگک متحرک کوچک'
  | 'تنور سنگک متحرک مینی'
  | 'تنور سنگک ثابت آپشنال'
  | 'لارج';

export type ForgeStatus = 'pending' | 'working' | 'ready' | 'accepted' | 'correction';
export type MasonryStatus = 'pending' | 'working' | 'finished' | 'correction';

export interface OvenOrder {
  id: number;
  orderNumber: string; // e.g. "RZ-OV-1405-042"
  customerName: string;
  customerCity: string;
  ovenModel: OvenModel;
  facadeName: string; // Free text model of brick/stone facade
  forgeTeam: 1 | 2; // 2 independent forge teams of 4
  masonryTeam?: 1 | 2 | 3; // 3 masonry teams of 4
  forgeStatus: ForgeStatus;
  masonryStatus: MasonryStatus;
  // 4 construction stages
  brickwork: boolean;   // آجرچینی
  cementwork: boolean;  // سیمان‌کاری
  insulation: boolean;  // عایق‌کاری
  facadeDone: boolean;  // نماکاری
  // Dates
  forgeStart?: string;
  forgeFinish?: string;
  handedOverDate?: string; // تحویل شاسی به بنایی
  masonryStart?: string;
  masonryFinish?: string;
  qualityNote: string;
  notes: string;
  createdAt: string;
  version: number;
}

export interface TeamKpiEvaluation {
  id: string;
  periodKey: string; // Jalali "1405-07"
  gregorianMonth: string; // "2026-10"
  teamKind: 'آهنگری' | 'بنایی';
  teamNumber: number; // 1, 2 for forge; 1, 2, 3 for masonry
  productionPoints: number; // Real production output points
  surplusPoints: number; // max(0, points - 50)
  totalBonusPool: number; // surplusPoints * 1,000,000 Tomans
  teamShareAmount: number; // 60% of pool
  individualShareAmount: number; // 40% of pool
  status: 'draft' | 'submitted' | 'approved' | 'transferred_to_payroll' | 'reverted';
  evaluatedBy: string;
  approvedBy?: string;
  approvalDate?: string;
  notes?: string;
  members: {
    employeeId: string;
    employeeName: string;
    individualScore: number; // 0 to 100
    teamShare: number; // 60% / 4
    individualShare: number; // 40% * (score / sum_scores)
    totalShare: number;
  }[];
  transferredToPayroll?: boolean;
  transferredMonth?: string;
  transferReason?: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  position: string;
  month: string; // "1405-07" / "2026-10"
  workingDays: number;
  standardHours: number;
  overtimeHours: number;
  absenceDays: number;
  sickLeaveDays: number;
  // Earnings
  baseSalary: number;
  technicalAllowance: number;
  housingAllowance: number;
  groceryAllowance: number;
  childrenAllowance: number;
  overtimePay: number;
  kpiBonus: number; // Carried from production bonus (isolated)
  otherBonuses: number;
  grossPay: number;
  // Deductions
  insuranceEmployeeShare: number; // 7% سهم بیمه کارگر
  insuranceEmployerShare: number; // 23% سهم کارفرما (۲۰٪ + ۳٪ بیکاری)
  incomeTax: number; // مالیات بر درآمد حقوق
  loanDeduction: number; // کسورات وام
  advanceDeduction: number; // مساعده
  absenceDeduction: number; // کسر کار
  totalDeductions: number;
  netPay: number; // خالص پرداختی
  status: 'پیش‌نویس' | 'تأیید مالی' | 'پرداخت‌شده' | 'قفل‌شده';
}

export interface HiringScenario {
  id: string;
  title: string;
  position: string;
  department: Department;
  headcount: number;
  salary: number;
  employerInsurance: number;
  benefits: number;
  overtime: number;
  recruitmentCost: number;
  trainingCost: number;
  onboardingCost: number;
  hiringAdvertisingCost: number;
  averageInterviewCost: number;
  recruitmentCostIncludesAdsInterview: boolean;
  rampUpMonths: number;
  additionalRevenue: number;
  contributionMarginRatio: number; // e.g. 0.35 (35%)
  calculationVersion: string;
  createdAt: string;
  annualRoi?: number;
  annualNetImpact?: number;
  firstYearTotalCost?: number;
  firstYearContribution?: number;
  breakEvenMonths?: number;
  status: 'تحلیلی' | 'تصویب‌شده' | 'رد‌شده';
}

export interface WageScenario {
  id: string;
  title: string;
  scope: 'all' | 'department' | 'selected';
  department?: Department;
  selectedIds?: string[];
  increasePct: number;
  increaseAmount: number;
  technicalAllowanceIncreasePct: number;
  calculationVersion: string;
  createdAt: string;
  totalMonthlyCostDelta: number;
  totalAnnualCostDelta: number;
  employerInsuranceDelta: number;
  affectedEmployeesCount: number;
  status: 'تحلیلی' | 'پیش‌نویس مصوبه' | 'بایگانی';
}

export interface MonthlyFinancial {
  id: string;
  month: string; // e.g. "1405-07"
  revenue: number; // درآمد ریالی
  operatingProfit: number; // سود عملیاتی (می‌تواند منفی باشد)
  netProfit: number; // سود خالص (می‌تواند منفی باشد)
  fixedCosts: number;
  variableCosts: number;
  laborCosts: number; // هزینه کامل نیروی انسانی
  headcount: number;
  laborHours: number;
  productionCount: number; // تعداد تنور ساخته شده
  laborCostToRevenuePct: number;
  notes?: string;
}

export interface AuditItem {
  id: string;
  featureName: string;
  filePath: string;
  dataSource: string;
  formulaOrLogic: string;
  discoveredBug: string;
  severity: 'بحرانی (Critical)' | 'ضروری (High)' | 'بهبود (Medium)' | 'اطلاعاتی (Low)';
  solution: string;
  testStatus: 'سالم و کاربردی' | 'نیازمند اتصال به داده' | 'نیازمند اصلاح فرمول' | 'نیازمند اصلاح رابط' | 'نیازمند آزمون عملی';
}
