/* HRMS Rezvan — unified modules, read-only overview surfaces; preserve underlying records and API. */
(function(){
'use strict';
const text=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('fa-IR');
const isoNow=()=>new Date().toISOString().slice(0,10);
const diffDays=(iso)=>{const dt=Date.parse(iso+'T12:00:00Z');return Number.isFinite(dt)?Math.ceil((dt-Date.parse(isoNow()+'T12:00:00Z'))/86400000):null;};
const faDateSafe=v=>{try{return v?faDate(v):'نامشخص';}catch(_){return text(v||'نامشخص');}};
const employeeName=id=>{let e=(DATA.employees||[]).find(x=>x.id===id);return e?(e.full_name||e.name||'بدون نام'):'پرونده یافت نشد';};
const validEnd=c=>/^\d{4}-\d\d-\d\d$/.test(String(c.end_date||''));
let contractView='all', contractQuery='';
function contractStatus(c){if(!validEnd(c))return ['unknown','فاقد تاریخ پایان',null];const days=diffDays(c.end_date);if(days===null)return ['unknown','نامشخص',null];if(days<0)return ['expired','خاتمه‌یافته',days];if(days<=30)return ['urgent','تا ۳۰ روز',days];if(days<=90)return ['soon','تا ۹۰ روز',days];return ['active','دارای اعتبار',days];}
function ensureContracts(){if(document.querySelector('[data-page="contracts-hub"]'))return;
const node=document.createElement('section');node.className='page';node.dataset.page='contracts-hub';node.innerHTML='<div id="rz-contracts-root"></div>';
document.querySelector('#app-root .main').appendChild(node);
NAV.splice(NAV.findIndex(x=>x.key==='personnel')+1,0,{key:'contracts-hub',label:'قراردادها و مدارک',icon:'<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>'});
PAGE_PERMS['contracts-hub']='view_personnel';
const group=NAV_GROUPS.find(x=>x.label==='کارکنان و پرونده')||NAV_GROUPS.find(x=>x.keys.includes('personnel'));if(group)group.keys.push('contracts-hub');
}
function renderContracts(){if(!can('view_personnel'))return;ensureContracts();const target=document.getElementById('rz-contracts-root');if(!target)return;
const contracts=(DATA.contracts||[]).slice();const docs=(DATA.documents||[]).filter(d=>!d.confidential||can('view_confidential_docs'));
const stats={all:contracts.length,urgent:0,soon:0,expired:0,unknown:0};for(const c of contracts){let [k]=contractStatus(c);if(k==='urgent')stats.urgent++;if(k==='soon')stats.soon++;if(k==='expired')stats.expired++;if(k==='unknown')stats.unknown++;}
const rows=contracts.filter(c=>{let [k]=contractStatus(c);const ok=contractView==='all'||(contractView==='soon'&&(k==='soon'||k==='urgent'))||contractView===k;return ok&&(`${employeeName(c.employee_id)} ${c.type||''} ${c.contract_no||''}`.toLowerCase().includes(contractQuery.toLowerCase()));}).sort((a,b)=>String(a.end_date||'9999').localeCompare(String(b.end_date||'9999')));
const statusBadge={urgent:'warn',soon:'amber',expired:'danger',unknown:'neutral',active:'success'};
target.innerHTML=`<div class="rz-module-hero"><div><div class="rz-eyebrow">قراردادها و اسناد سازمانی</div><h2>مرکز قراردادها و مدارک</h2><p>گزارش قراردادهای ثبت‌شده در سرور؛ اطلاعات فاقد تاریخ معتبر به‌صورت نامشخص نشان داده می‌شود.</p></div><span class="rz-hero-icon">▤</span></div>
<div class="rz-summary-grid">${[['قراردادهای ثبت‌شده',stats.all],['پایان تا ۳۰ روز',stats.urgent],['پایان ۳۱ تا ۹۰ روز',stats.soon],['قرارداد خاتمه‌یافته',stats.expired],['بدون تاریخ پایان',stats.unknown],['اسناد قابل مشاهده',docs.length]].map(([l,v])=>`<div class="rz-summary-card"><span>${l}</span><b>${number(v)}</b></div>`).join('')}</div>
<section class="rz-work-card"><h3>فهرست و پیگیری قراردادها</h3><div class="rz-formbar"><label>وضعیت <select id="rz-ct-filter">${[['all','همه قراردادها'],['urgent','۳۰ روز آینده'],['soon','۹۰ روز آینده'],['expired','خاتمه‌یافته'],['unknown','بدون تاریخ پایان'],['active','دارای اعتبار']].map(([v,l])=>`<option value="${v}" ${contractView===v?'selected':''}>${l}</option>`).join('')}</select></label><label>جست‌وجو <input id="rz-ct-query" value="${text(contractQuery)}" placeholder="نام، شماره یا نوع قرارداد"></label></div><div class="rz-table-scroll"><table><thead><tr><th>کارمند</th><th>نوع قرارداد</th><th>شماره قرارداد</th><th>تاریخ پایان</th><th>وضعیت</th><th>مشاهده پرونده</th></tr></thead><tbody>${rows.map(c=>{const [status,label,days]=contractStatus(c);return `<tr><td>${text(employeeName(c.employee_id))}</td><td>${text(c.type||'—')}</td><td>${text(c.contract_no||'—')}</td><td>${faDateSafe(c.end_date)}</td><td><span class="rz-label rz-${statusBadge[status]}">${label}${days!==null&&days>=0?' ('+number(days)+' روز)':''}</span></td><td><button class="rz-link" data-profile="${text(c.employee_id)}">پرونده ←</button></td></tr>`;}).join('')||'<tr><td colspan="6" class="rz-empty">رکوردی با این فیلتر وجود ندارد.</td></tr>'}</tbody></table></div></section>
<section class="rz-work-card"><h3>مدارک پرسنلی ثبت‌شده</h3><p class="rz-help">تعداد اسناد مجاز در سرور: <b>${number(docs.length)}</b>. فایلی که در اکسل آمده ولی سند آن روی سرور بارگذاری نشده، «مدرک تأییدشده» محسوب نمی‌شود. برای مشاهده جزئیات و افزودن سند وارد پرونده همان کارمند شوید.</p></section>`;
target.querySelector('#rz-ct-filter').addEventListener('change',e=>{contractView=e.target.value;renderContracts();});
target.querySelector('#rz-ct-query').addEventListener('change',e=>{contractQuery=e.target.value;renderContracts();});
target.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>openProfile(b.getAttribute('data-profile'),'contract')));
}
function decorateCEO(){
 const box=document.getElementById('rz-executive');if(!box)return;
 let extra=box.querySelector('#rz-executive-extra');if(!extra){extra=document.createElement('div');extra.id='rz-executive-extra';box.appendChild(extra);}
 const locks=(DATA.payrollLocks||[]).filter(x=>x.excelReport&&Array.isArray(x.excelReport.staff));
 const latest=locks.map(x=>x.excelReport).sort((a,b)=>(Number(b.year)*12+Number(b.month))-(Number(a.year)*12+Number(a.month)))[0];
 const contracts=(DATA.contracts||[]),urgent=contracts.filter(c=>contractStatus(c)[0]==='urgent').length;
 const overdue=contracts.filter(c=>contractStatus(c)[0]==='expired').length;
 let issueCount=null;if(can('view_salary')&&latest){issueCount=latest.staff.filter(r=>r.net!=null&&r.payment_report_net!=null&&Math.abs(Number(r.net)-Number(r.payment_report_net))>0.5).length;}
 const summary=latest?`${number(latest.month)}/${number(latest.year)} — ${number(latest.staff.length)} رکورد`:'هیچ گزارش اکسل ماهانه روی سرور ثبت نشده است';
 extra.innerHTML=`<div class="rz-egrid"><section class="rz-ecard"><h3>اقدامات مدیریتی بر اساس داده‌های سرور</h3><p>فقط موارد قابل استناد نمایش داده می‌شوند؛ موارد فاقد اطلاعات به‌عنوان صفر در نظر گرفته نشده‌اند.</p><div class="rz-statuslist"><div class="rz-statusitem"><span>قراردادهای نزدیک به پایان (۳۰ روز)</span><strong>${number(urgent)} مورد</strong></div><div class="rz-statusitem"><span>قراردادهای دارای تاریخ پایان گذشته</span><strong>${number(overdue)} مورد</strong></div><div class="rz-statusitem"><span>اختلاف مبلغ خالص میان دو شیت آخرین ماه</span><strong>${issueCount===null?'فاقد داده یا دسترسی':number(issueCount)+' مورد'}</strong></div></div><div class="rz-actions" style="margin-top:12px"><button class="rz-action" data-go="contracts-hub">بررسی قراردادها</button><button class="rz-action" data-go="alerts">مرکز هشدارها</button></div></section><section class="rz-ecard"><h3>وضعیت ورود اکسل ماهانه</h3><p>اطلاعات واقعی ثبت‌شده پس از احراز هویت</p><div class="rz-statuslist"><div class="rz-statusitem"><span>آخرین دوره دارای داده</span><strong>${summary}</strong></div><div class="rz-statusitem"><span>ماه‌های دارای گزارش</span><strong>${number(locks.length)} دوره</strong></div><div class="rz-statusitem"><span>مبنای پرداخت بانکی</span><strong>بدون تأیید بانک</strong></div></div>${canPage('monthly-archive')?'<button class="rz-action" style="width:100%;margin-top:12px" data-go="monthly-archive">ورود و آرشیو اکسل ←</button>':''}</section></div>`;
 extra.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>goPage(el.dataset.go)));
}
function decoratePage(key){
const page=document.querySelector(`section[data-page="${key}"]`);if(!page)return;
const heading={strategy:['تحلیل حقوق و هزینه','مقایسه هزینه واقعی کارکنان و واحدها با تاریخچه قابل ردیابی'], 'monthly-archive':['ورود هوشمند اکسل','پیش‌نمایش، اعتبارسنجی، آرشیو ماهانه و جلوگیری از داده تکراری'],leave:['کارکرد، مرخصی و اضافه‌کاری','مرخصی ثبت‌شده در اکسل با حفظ مبنای ساعت و دقیقه'],personnel:['پرونده کارکنان','اطلاعات منابع انسانی، سوابق شغلی و پرونده ۳۶۰ درجه'],payroll:['محاسبات حقوق و دستمزد','جزئیات تخصصی مطابق مجوز مالی کاربر'],alerts:['هشدارها و پیگیری','موارد مهم نیازمند اقدام و ردیابی وضعیت']};
if(!heading[key])return;let banner=page.querySelector('.rz-module-hero');if(!banner){banner=document.createElement('div');banner.className='rz-module-hero';page.insertBefore(banner,page.firstChild);}const [title,sub]=heading[key];banner.innerHTML=`<div><div class="rz-eyebrow">سامانه منابع انسانی رضوان</div><h2>${title}</h2><p>${sub}</p></div><span class="rz-hero-icon">◈</span>`;
}
function normalizeNav(){ensureContracts();
const groups=[{label:'مدیریت و تحلیل',keys:['ceo','strategy','dashboard','alerts']},{label:'پرونده و اسناد',keys:['personnel','contracts-hub','candidates','recruitment']},{label:'حقوق و حسابداری',keys:['payroll','acct-ins','economics','monthly','unit-report','labor-report']},{label:'کارکرد و مرخصی',keys:['leave']},{label:'اطلاعات ماهانه',keys:['monthly-archive']},{label:'توسعه منابع انسانی',keys:['training']},{label:'سیستم',keys:['settings']}];
NAV_GROUPS.splice(0,NAV_GROUPS.length,...groups);
for(const [key,label] of Object.entries({ceo:'مرکز فرمان مدیرعامل',strategy:'تحلیل حقوق و هزینه',personnel:'پرونده کارکنان',leave:'کارکرد و مرخصی', 'monthly-archive':'ورود هوشمند اکسل'})){const n=NAV.find(x=>x.key===key);if(n)n.label=label;}
}
normalizeNav();
const previous=renderPage;
renderPage=function(key){if(key==='contracts-hub'){renderContracts();return;}previous(key);decoratePage(key);if(key==='ceo')decorateCEO();};
window.rzContractsRefresh=renderContracts;
})();
