'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../frontend/dashboard-41.html'),'utf8');
const start=html.indexOf('function calculateFullyLoadedCostForScenario(s){');
const stop=html.indexOf('function calculateMaxAdditionalHeadcountByCapacity(s){',start);
assert(start>=0&&stop>start);
const code=html.slice(start,stop);
const assumptions={employerInsuranceRate:0,recruitmentCostIncludesAdsInterview:true,
  averageRecruitmentCost:0,averageTrainingCost:0,averageOnboardingCost:0,averageRampUpMonths:null};
const c={getEconomicAssumptions:()=>assumptions,getCoeffs:()=>({insuranceEmployerPct:0}),
  calculateContributionMarginRatio:()=>({ok:true,value:50}),
  econOk:(value,unit)=>({ok:true,value,unit}),
  econEmpty:reason=>({ok:false,value:null,reason}),Number,Object,Math};
vm.createContext(c);vm.runInContext(code,c);
const input={salary:100,employerInsurance:0,benefits:0,overtime:0,
  recruitmentCost:30,trainingCost:0,onboardingCost:0,rampUpCost:0,
  additionalRevenue:400,contributionMarginRatio:50,rampUpMonths:0};
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} expected ${b}`);
const flat=c.calculateHiringROIFull(input);
assert(flat.ok);close(flat.annualNetEffect,1170);close(flat.value,1170/1230*100);
assert.equal(flat.rampUpMonthsApplied,0);
const ramped=c.calculateHiringROIFull({...input,rampUpMonths:2});
assert(ramped.ok);close(ramped.annualContribution,2200);close(ramped.annualNetEffect,970);close(ramped.value,970/1230*100);
assert(ramped.value < flat.value);
assert.equal(c.calculateFullyLoadedCostForScenario({...input,benefits:null}).ok,false);
assert.equal(c.calculateFullyLoadedCostForScenario({...input,overtime:null}).ok,false);
assert.equal(c.calculateHiringROIFull({...input,rampUpMonths:null}).ok,false);
assert.equal(c.calculateHiringROIFull({...input,rampUpMonths:37}).ok,false);
assert(c.calculateHiringPayback({...input,rampUpMonths:2}).ok);
console.log('Economic math harness: annual investment, linear ramp, missing inputs, ROI and payback OK');
