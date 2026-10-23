"""Regression tests for approved HR economics fixes; no production database needed."""
from pathlib import Path
import unittest
from app.core.validation import check_value, validate_keys, validate_economic_scenario, split_employee

HTML = Path(__file__).resolve().parents[2] / 'frontend' / 'dashboard-41.html'


class FinancialInputs(unittest.TestCase):
    def test_actual_losses_are_allowed_but_negative_costs_are_not(self):
        self.assertIsNone(check_value('netProfit', -10_000_000))
        self.assertIsNone(check_value('operatingProfit', -2_000_000))
        for key in ('revenue', 'fixedCosts', 'variableCosts', 'headcount', 'production', 'laborHours'):
            self.assertIsNotNone(check_value(key, -1), key)
        self.assertIsNotNone(check_value('netProfit', float('nan')))

    def test_fte_is_persistable_and_checked_without_silent_clamping(self):
        self.assertIsNone(check_value('fte', 0.75))
        for bad in (0, -0.2, 1.2, float('inf'), '0.8'):
            self.assertIsNotNone(check_value('fte', bad))
        _, _, extra, issues = split_employee({'id':'emp002','fte':0.75})
        self.assertEqual(extra['fte'], 0.75)
        self.assertFalse(issues)

    def test_monthly_and_exit_records_allow_actual_client_timestamps(self):
        for name in ('monthlyFinancials', 'turnoverCosts'):
            self.assertEqual(validate_keys(name,['createdAt','updatedAt'], creating=True), [], name)
        self.assertTrue(validate_keys('monthlyFinancials',['unsafe'],creating=True))

    def test_scenario_result_whitelist_and_ramp_bounds(self):
        valid={'type':'hiring','title':'آزمایش','headcount':2,'rampUpMonths':2,
               'results':{'annualRoi':12.5,'annualNetEffect':-2000,'annualContribution':1200,
                          'rampUpMonthsApplied':2}}
        self.assertEqual(validate_economic_scenario(valid), [])
        for bad in (-1,1.5,37):
            self.assertTrue(validate_economic_scenario({**valid,'rampUpMonths':bad}))
        self.assertTrue(validate_economic_scenario({**valid,'headcount':0}))
        self.assertTrue(validate_economic_scenario({**valid,'employerInsurance':'not-number'}))
        self.assertTrue(validate_economic_scenario({**valid,'contributionMarginRatio':'not-number'}))
        self.assertTrue(validate_economic_scenario({**valid,'results':{'annualRoi':float('nan')}}))

    def test_frontend_surfaces_non_authoritative_estimates(self):
        html=HTML.read_text(encoding='utf-8')
        self.assertIn('scenarioRampFraction', html)
        self.assertIn('annualNetEffect=annualContribution-annualCosts', html)
        self.assertIn('renderUnifiedFinancialScenarioRegistry', html)
        self.assertIn('ماه‌های Ramp-up تعیین نشده', html)

if __name__=='__main__':unittest.main()

class ServerEconomicPersistence(unittest.TestCase):
    def setUp(self):
        from app.core.policy import Principal
        from app.services.store import MemoryStore
        from app.services.sync import Actor, SyncService
        self.s=MemoryStore()
        self.api=SyncService(self.s,Actor(Principal(user_id='adm',role_id='admin',all_units=True),'adm','admin','Administrator'))

    def test_financial_loss_commit_and_readback(self):
        op={'c':'monthlyFinancials','op':'create','id':'finmonth001','data':{
            'month':'2026-10','revenue':100000,'netProfit':-100000,'operatingProfit':-50000,
            'fixedCosts':30000,'variableCosts':10000,'createdAt':'2026-10-22T13:00:00Z',
            'updatedAt':'2026-10-22T13:00:00Z'}}
        self.assertEqual(self.api.push([op])['results'][0]['id'],'finmonth001')
        self.assertEqual(self.s.get('monthlyFinancials','finmonth001').data['netProfit'],-100000)
        self.assertEqual(self.api.bootstrap()['data']['monthlyFinancials'][0]['netProfit'],-100000)

    def test_scenario_snapshot_commit_and_readback(self):
        op={'c':'hiringScenarios','op':'create','id':'hscsample001','data':{
            'type':'hiring','title':'آزمایشی','position':'فنی','headcount':1,'salary':15000000,
            'employerInsurance':23,'benefits':0,'overtime':0,'rampUpMonths':2,
            'recruitmentCost':4000000,'trainingCost':0,'onboardingCost':0,'rampUpCost':0,
            'additionalRevenue':10000000,'contributionMarginRatio':40,
            'hiringAdvertisingCost':0,'averageInterviewCost':0,
            'recruitmentCostIncludesAdsInterview':False,'calculationVersion':'econ-linear-ramp-v2',
            'createdAt':'2026-10-22T13:00:00Z',
            'results':{'monthlyLaborCost':18450000,'annualRoi':-98,'annualNetEffect':-220000000,
                       'rampUpMonthsApplied':2}}}
        self.api.push([op])
        saved=self.s.get('hiringScenarios','hscsample001').data
        self.assertEqual(saved['calculationVersion'],'econ-linear-ramp-v2')
        self.assertEqual(saved['rampUpMonths'],2)
        self.assertEqual(saved['results']['annualRoi'],-98)
