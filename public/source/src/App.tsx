import React, { useState } from 'react';
import { UserRole, UserSession, Employee, OvenOrder, TeamKpiEvaluation, Contract, HiringScenario, WageScenario } from './types';
import {
  CURRENT_USER_SESSIONS,
  INITIAL_EMPLOYEES,
  INITIAL_OVEN_ORDERS,
  INITIAL_KPI_EVALUATIONS,
  INITIAL_CONTRACTS,
  INITIAL_MONTHLY_FINANCIALS,
  INITIAL_HIRING_SCENARIOS,
  INITIAL_WAGE_SCENARIOS
} from './data/mockData';
import { TopBar } from './components/common/TopBar';
import { Sidebar, NavItemKey } from './components/common/Sidebar';
import { AuditDeliverablesView } from './components/views/AuditDeliverablesView';
import { CeoDashboardView } from './components/views/CeoDashboardView';
import { OvenTrackingView } from './components/views/OvenTrackingView';
import { ProductionKpiView } from './components/views/ProductionKpiView';
import { PersonnelDirectoryView } from './components/views/PersonnelDirectoryView';
import { ContractsProbationView } from './components/views/ContractsProbationView';
import { PayrollManagementView } from './components/views/PayrollManagementView';
import { FinancialScenariosView } from './components/views/FinancialScenariosView';
import { HrEconomicsView } from './components/views/HrEconomicsView';
import { AttendanceLeaveView } from './components/views/AttendanceLeaveView';
import { RecruitmentPipelineView } from './components/views/RecruitmentPipelineView';
import { TrainingSkillsView } from './components/views/TrainingSkillsView';
import { AlertsTrackerView } from './components/views/AlertsTrackerView';
import { SettingsSecurityView } from './components/views/SettingsSecurityView';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('ceo');
  const [currentSession, setCurrentSession] = useState<UserSession>(CURRENT_USER_SESSIONS.ceo);
  const [currentNav, setCurrentNav] = useState<NavItemKey>('audit-docs');

  // Application Data States
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [ovenOrders, setOvenOrders] = useState<OvenOrder[]>(INITIAL_OVEN_ORDERS);
  const [kpiEvaluations, setKpiEvaluations] = useState<TeamKpiEvaluation[]>(INITIAL_KPI_EVALUATIONS);
  const [contracts, setContracts] = useState<Contract[]>(INITIAL_CONTRACTS);
  const [financials, setFinancials] = useState(INITIAL_MONTHLY_FINANCIALS);
  const [hiringScenarios, setHiringScenarios] = useState<HiringScenario[]>(INITIAL_HIRING_SCENARIOS);
  const [wageScenarios, setWageScenarios] = useState<WageScenario[]>(INITIAL_WAGE_SCENARIOS);

  // Role change handler
  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    setCurrentSession(CURRENT_USER_SESSIONS[role] || CURRENT_USER_SESSIONS.ceo);
  };

  // State update handlers
  const handleSaveOvenOrder = (saved: OvenOrder) => {
    setOvenOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleUpdateKpiEvaluation = (saved: TeamKpiEvaluation) => {
    setKpiEvaluations((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleSaveContract = (saved: Contract) => {
    setContracts((prev) => [saved, ...prev]);
  };

  const handleSaveHiringScenario = (saved: HiringScenario) => {
    setHiringScenarios((prev) => [saved, ...prev]);
  };

  const handleSaveWageScenario = (saved: WageScenario) => {
    setWageScenarios((prev) => [saved, ...prev]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans" dir="rtl">
      {/* Top Bar with brand, period, and role switcher */}
      <TopBar
        currentSession={currentSession}
        onRoleChange={handleRoleChange}
        activePeriod="مهر ۱۴۰۵"
        onOpenAuditDocs={() => setCurrentNav('audit-docs')}
      />

      {/* Main Container: Sidebar + Content Viewport */}
      <div className="flex grow">
        <Sidebar
          currentKey={currentNav}
          onSelect={setCurrentNav}
          userRole={currentRole}
        />

        <main className="grow p-4 lg:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {currentNav === 'audit-docs' && <AuditDeliverablesView />}
          {currentNav === 'ceo-dashboard' && (
            <CeoDashboardView
              employees={employees}
              ovenOrders={ovenOrders}
              financials={financials}
              currentSession={currentSession}
              onNavigate={setCurrentNav}
            />
          )}
          {currentNav === 'oven-tracking' && (
            <OvenTrackingView
              orders={ovenOrders}
              onSaveOrder={handleSaveOvenOrder}
            />
          )}
          {currentNav === 'production-kpi' && (
            <ProductionKpiView
              evaluations={kpiEvaluations}
              currentSession={currentSession}
              onUpdateEvaluation={handleUpdateKpiEvaluation}
              onNavigateToPayroll={() => setCurrentNav('payroll')}
            />
          )}
          {currentNav === 'personnel' && (
            <PersonnelDirectoryView
              employees={employees}
              userRole={currentRole}
            />
          )}
          {currentNav === 'contracts' && (
            <ContractsProbationView
              contracts={contracts}
              employees={employees}
              onSaveContract={handleSaveContract}
            />
          )}
          {currentNav === 'payroll' && (
            <PayrollManagementView
              employees={employees}
              userRole={currentRole}
            />
          )}
          {currentNav === 'economics' && (
            <HrEconomicsView
              financials={financials}
              employees={employees}
            />
          )}
          {currentNav === 'scenarios' && (
            <FinancialScenariosView
              hiringScenarios={hiringScenarios}
              wageScenarios={wageScenarios}
              onSaveHiringScenario={handleSaveHiringScenario}
              onSaveWageScenario={handleSaveWageScenario}
            />
          )}
          {currentNav === 'attendance' && (
            <AttendanceLeaveView employees={employees} />
          )}
          {currentNav === 'recruitment' && (
            <RecruitmentPipelineView userRole={currentRole} />
          )}
          {currentNav === 'training' && (
            <TrainingSkillsView employees={employees} />
          )}
          {currentNav === 'alerts' && (
            <AlertsTrackerView />
          )}
          {currentNav === 'settings' && (
            <SettingsSecurityView />
          )}
        </main>
      </div>
    </div>
  );
}
