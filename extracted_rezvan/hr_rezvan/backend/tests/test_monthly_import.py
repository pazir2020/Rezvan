"""Regression tests for historical XLSX import into the real LAN sync store."""
import unittest
from app.errors import ApiError
from app.services.store import MemoryStore, Rec
from app.services.sync import Actor, SyncService
from app.core.policy import Principal


def service(store, role='hr_manager', all_units=True):
    p = Principal(user_id='u1', role_id=role, all_units=all_units, unit_ids=frozenset())
    return SyncService(store, Actor(p, 'u1', 'manager', 'manager'))


def sample():
    return {'c':'payrollLocks','op':'create','id':'excel_lock_1405_06','data':{
        'month':'2026-09','status':'imported','snapshotVersion':2,
        'source':'Excel شهریور ۱۴۰۵',
        'excelReport':{'year':1405,'month':6,'staff':[{'name':'test','net':100,'leave_credit':0.5}]},
        'snapshot':[{'employee_id':'emp1','gross':115,'net':100}]}}


class MonthlyExcelLanTests(unittest.TestCase):
    def setUp(self):
        self.store=MemoryStore()
        unit=self.store.unit_create('مالی')
        self.store.insert(Rec('employees','emp1',{'id':'emp1','full_name':'test','department':'مالی'},unit_id=unit))

    def test_import_persists_and_appears_only_to_salary_readers(self):
        service(self.store).push([sample()])
        rows=service(self.store).bootstrap()['data']['payrollLocks']
        self.assertEqual(rows[0]['excelReport']['staff'][0]['net'],100)
        self.assertEqual(service(self.store,'viewer').bootstrap()['data']['payrollLocks'],[])
        self.assertEqual(service(self.store,'ceo').bootstrap()['data']['payrollLocks'],[])

    def test_denies_unprivileged_and_duplicate_import(self):
        for role, all_units in [('hr_specialist',True),('viewer',True),('hr_manager',False)]:
            with self.assertRaises(ApiError): service(self.store,role,all_units).push([sample()])
        service(self.store).push([sample()])
        copy=sample();copy['id']='excel_lock_second'
        with self.assertRaises(ApiError): service(self.store).push([copy])

    def test_import_immutable_and_checks_refs(self):
        sample_invalid=sample(); sample_invalid['data']['snapshot'][0]['employee_id']='missing'
        with self.assertRaises(ApiError): service(self.store).push([sample_invalid])
        service(self.store).push([sample()])
        with self.assertRaises(ApiError): service(self.store).push([{'c':'payrollLocks','op':'update','id':'excel_lock_1405_06','v':1,'set':{'source':'changed'}}])

    def test_regular_lock_creation_remains_open_only(self):
        d=sample();d['data'].pop('excelReport');d['data']['status']='locked'
        with self.assertRaises(ApiError): service(self.store).push([d])


if __name__=='__main__': unittest.main()
