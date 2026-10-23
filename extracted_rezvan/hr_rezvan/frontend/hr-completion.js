/* Optional final HR controls. All authoritative writes go to restricted server APIs. */
(function(){'use strict';
const KEY='hr-completion', $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token='',tab='payroll',staff=[],kpiPeriods=[];
const statuses={signed:'امضاشده',draft:'پیش‌نویس',missing:'صادرنشده',cross_month_review:'نیازمند بررسی تاریخ',needs_hr_classification:'وضعیت داخلی نامشخص',pending:'در انتظار',upheld:'اعتراض وارد',dismissed:'اعتراض رد شد',reviewed:'بررسی‌شده',closed:'بسته‌شده'};
const keys={payroll_source:'منبع و اکسل حقوق ماه',employee_roster:'فهرست کارکنان و تغییرات ماه',attendance_leave:'حضور، غیبت موجه و مرخصی',overtime:'اضافه‌کاری تأییدشده',kpi_and_adjustments:'کارانه اختیاری، وام و اصلاحیه‌ها',insurance:'تطبیق لیست بیمه',tax:'تطبیق مالیات حقوق',payslip_vs_excel:'تطبیق فیش با اکسل و پرداخت‌ها'};
async function api(path,method='GET',body){if(!token){let r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('وارد سامانه شوید');token=(await r.json()).csrf_token;}
 const r=await fetch('/api/hr-completion/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||(typeof d.detail==='string'?d.detail:JSON.stringify(d.detail))||'دسترسی ندارید یا عملیات انجام نشد');return d;}
function msg(id,v,err=false){const el=$(id);if(el){el.textContent=v;el.className=err?'hc-error':'hc-status';}}
function options(items,field='full_name'){return '<option value="">انتخاب کنید</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x[field]||x.id)}</option>`).join('');}
function table(columns,rows){return `<div class="hc-scroll"><table><thead><tr>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}">موردی یافت نشد.</td></tr>`}</tbody></table></div>`;}
async function listPeople(){if(staff.length)return staff;let r=await fetch('/api/hr-development/employees',{credentials:'same-origin'});if(!r.ok)throw Error('فهرست کارکنان برای این سطح دسترسی مجاز نیست');staff=(await r.json()).items||[];return staff;}
function day(id){return typeof readJalaliPicker==='function'?readJalaliPicker(id):$(id)?.value;}
function switchTab(k){tab=k;document.querySelectorAll('#hc-root [data-hctab]').forEach(n=>n.classList.toggle('active',n.dataset.hctab===k));document.querySelectorAll('#hc-root [data-hcview]').forEach(n=>n.classList.toggle('active',n.dataset.hcview===k));
 ({payroll:loadPayroll,slips:loadSlips,hiring:loadHiring,contracts:loadContracts,transfers:loadTransfers,kpi:loadKpi})[k]().catch(x=>msg('hc-'+k+'-msg',x.message,true));}
// Payroll: every check needs a human-entered documentary reference.
async function loadPayroll(){const month=$('hc-month').value.trim(),d=await api('payroll/review?month='+encodeURIComponent(month));const packet=d.item;
 $('hc-checklist').innerHTML=Object.entries(keys).map(([key,name])=>`<div class="hc-card"><label class="hc-check"><input type="checkbox" id="hc-c-${key}" ${packet?.checklist?.[key]?'checked':''}><span>${esc(name)}</span></label><label>شماره سند یا مرجع بررسی<input id="hc-r-${key}" maxlength="300" value="${esc(packet?.evidence_refs?.[key]||'')}" placeholder="شماره فایل، تاریخ گزارش یا شماره کنترل"></label></div>`).join('');
 $('hc-packet-version').value=packet?.version||0;$('hc-packet-note').value=packet?.note||'';
 $('hc-payroll-detail').innerHTML=`<p>وضعیت: <b>${esc(packet?.status||'ثبت‌نشده')}</b> — اقلام منبع قابل مشاهده: ${d.source_items_count} — تغییر پس از بررسی: ${d.source_changed?'بله؛ بازبینی لازم است':'خیر'}</p><p class="hc-warning">تیک‌زدن بندها ادعای صحت بیمه، مالیات یا بانک نیست؛ مرجع بررسی واقعی هر بند الزامی است. تأیید این صفحه فیش چاپ نمی‌کند؛ اما از این پس پیش‌نیاز اجباری قفل رسمی حقوق است.</p>`;
 $('hc-approve-packet').disabled=!packet||packet.status!=='draft';
 $('hc-reopen-packet').disabled=!packet||packet.status!=='approved'||!d.source_changed;}
async function savePayroll(){const packet={month:$('hc-month').value.trim(),checklist:{},evidence_refs:{},note:$('hc-packet-note').value.trim(),expected_version:Number($('hc-packet-version').value)};
 for(const key of Object.keys(keys)){packet.checklist[key]=$('hc-c-'+key).checked;packet.evidence_refs[key]=$('hc-r-'+key).value.trim();}
 const d=await api('payroll/review','POST',packet);msg('hc-payroll-msg','پیش‌نویس کنترل ذخیره شد؛ فیش و حقوق تغییر نکرد.');await loadPayroll();}
async function decidePayroll(){const note=prompt('توضیح تأیید مستقل (حداقل ۱۰ نویسه)');if(note===null)return;if(!confirm('آیا همه مستندات را واقعاً کنترل کرده‌اید؟ این تأیید به معنی پرداخت یا قفل حقوق نیست.'))return;
 await api('payroll/review/'+encodeURIComponent($('hc-month').value.trim())+'/decision','POST',{decision:'approved',expected_version:Number($('hc-packet-version').value),note});msg('hc-payroll-msg','بسته کنترل به تأیید مسئول مجاز رسید.');await loadPayroll();}
async function reopenPayroll(){
 const reason=prompt('علت بازبینی اجباری کنترل حقوق (حداقل ۱۲ نویسه):');if(reason===null)return;
 if(!confirm('تأیید قبلی لغو می‌شود و تمام بندهای کنترل باید دوباره مستند و توسط فرد دیگری تأیید شوند. ادامه می‌دهید؟'))return;
 await api('payroll/review/'+encodeURIComponent($('hc-month').value.trim())+'/reopen','POST',
           {expected_version:Number($('hc-packet-version').value),reason:reason.trim()});
 msg('hc-payroll-msg','کنترل قبلی بازگشایی شد؛ مستندات ماه را دوباره بررسی کنید.');await loadPayroll();
}
// Payslip register: record a PDF/reference once original payroll UI issued it.
async function loadSlips(){
 const people=await listPeople(),prev=$('hc-slip-person').value;
 $('hc-slip-person').innerHTML=options(people);
 if(people.some(x=>String(x.id)===prev))$('hc-slip-person').value=prev;
 const month=encodeURIComponent($('hc-slip-month').value.trim());
 const [d,archive]=await Promise.all([api('payslips?month='+month),api('payslips/archive?month='+month)]);
 $('hc-slip-table').innerHTML=table(['کارمند','مرجع فیش','زمان ثبت'],d.items.map(x=>[esc(x.full_name),esc(x.source_reference),esc(x.issued_at)]));
 $('hc-slip-archive-table').innerHTML=table(['کارمند','نام PDF','بایگانی و دریافت'],archive.items.map(x=>[
   esc(x.full_name),esc(x.original_filename),`<a href="/api/hr-completion/payslips/archive/${encodeURIComponent(x.id)}/download" target="_blank" rel="noopener">دریافت نسخه بایگانی‌شده</a>`]));
 msg('hc-slips-msg','شماره صدور و فایل PDF واقعی، دو ثبت مجزا هستند. فایل‌ها فقط برای کاربران مجاز قابل دریافت‌اند.');
}
async function saveSlip(){
 const body={month:$('hc-slip-month').value.trim(),employee_id:$('hc-slip-person').value,source_reference:$('hc-slip-ref').value.trim(),note:$('hc-slip-note').value.trim()};
 if(!confirm('آیا واقعاً فیش این ماه صادر شده است؟ ابتدا شماره مرجع را ثبت می‌کنیم؛ فایل PDF را در گام بعد بارگذاری کنید.'))return;
 await api('payslips','POST',body);
 msg('hc-slips-msg','شماره مرجع صدور ثبت شد؛ اکنون PDF واقعی را بارگذاری کنید.');
 await loadSlips();
}
async function archiveSlip(){
 const chosen=$('hc-slip-pdf').files?.[0];
 if(!chosen||!chosen.name.toLowerCase().endsWith('.pdf'))throw Error('فایل PDF صادرشده را انتخاب کنید');
 if(!$('hc-slip-confirm-pdf').checked)throw Error('انتساب صحیح PDF به شخص و ماه را تأیید کنید');
 if(!confirm('آیا از بایگانی نسخه نهایی PDF برای کارمند و ماه انتخاب‌شده مطمئن هستید؟ فایل قبلی قابل بازنویسی مستقیم نیست.'))return;
 const form=new FormData();form.append('month',$('hc-slip-month').value.trim());form.append('employee_id',$('hc-slip-person').value);form.append('confirmed_payslip','true');form.append('file',chosen);
 if(!token){const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('وارد سامانه شوید');token=(await r.json()).csrf_token;}
 const r=await fetch('/api/hr-completion/payslips/archive',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':token},body:form});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||d.detail||'خطا در بایگانی PDF');
 $('hc-slip-pdf').value='';$('hc-slip-confirm-pdf').checked=false;
 await loadSlips();msg('hc-slips-msg','فایل PDF واقعی با کنترل سلامت و دسترسی در سرور بایگانی شد.');
}
// Candidate onboarding: confirmation never imports proposed salary.
async function loadHiring(){const [r,u]=await Promise.all([fetch('/api/hr-operations/hiring/candidates',{credentials:'same-origin'}),api('hiring/units')]);if(!r.ok)throw Error('فهرست داوطلبان مجاز نیست');
 const c=(await r.json()).items||[];$('hc-new-candidate').innerHTML=options(c,'name');$('hc-new-unit').innerHTML=options(u.items,'name');
 $('hc-hiring-list').innerHTML=table(['داوطلب','مرحله فعلی'],c.map(x=>[esc(x.name||x.id),esc(x.stage||'نامشخص')]));}
async function onboard(){const body={candidate_id:$('hc-new-candidate').value,employee_code:$('hc-new-code').value.trim(),unit_id:Number($('hc-new-unit').value),hire_date:day('hc-hire-date'),note:$('hc-new-note').value.trim(),confirmed_by_hr:$('hc-new-confirm').checked};
 if(!confirm('برای داوطلب تأییدشده، پرونده پایه جدید ایجاد شود؟ قرارداد، حقوق، حق فنی و اطلاعات حساس خودکار ساخته نمی‌شوند.'))return;
 const d=await api('hiring/create-employee','POST',body);msg('hc-hiring-msg','پرونده کارمند ساخته شد؛ شناسه '+d.employee_id+' — اکنون قرارداد اولیه را جداگانه ثبت کنید.');staff=[];await loadHiring();}
// Contracts: only standalone monthly contracts are counted as signed.
async function loadContracts(){const year=Number($('hc-year').value),start=Number($('hc-from-month').value),d=await api(`contracts/calendar?year=${year}&from_month=${start}`);
 $('hc-contract-output').innerHTML=table(['کارمند','وضعیت بررسی',...d.months],d.items.map(x=>[esc(x.full_name),esc(statuses[x.status]||x.status),...d.months.map(m=>esc(statuses[x.months[m]]||'—'))]));msg('hc-contracts-msg','گزارش فقط خواندنی است؛ هیچ قرارداد یا سندی خودکار صادر نشده است.');}
// Transfer: display historic split memberships. Never estimate bonus shares.
async function loadTransfers(){const d=await api('teams/transfers?period_key='+encodeURIComponent($('hc-transfer-month').value.trim()));
 $('hc-transfer-table').innerHTML=table(['کارمند','عضویت‌های ثبت‌شده','عملیات'],d.affected.map(x=>[esc(x.full_name),esc(x.assignments.map(y=>(y.team_kind==='forge'?'آهنگری ':'بنایی ')+y.team_number+' / '+y.valid_from+' تا '+(y.valid_to||'باز')).join('، ')),
 d.cases.some(z=>z.employee_id===x.employee_id)?'پرونده بررسی موجود':`<button class="hc-action" data-tr="${esc(x.employee_id)}">ثبت پرونده بررسی</button>`]));
 $('hc-transfer-table').querySelectorAll('[data-tr]').forEach(b=>b.onclick=()=>fileTransfer(b.dataset.tr).catch(err=>msg('hc-transfers-msg',err.message,true)));
 msg('hc-transfers-msg','برای جابه‌جایی در میانه ماه، سهم کارانه مسدود و نیازمند تصمیم رسمی است؛ از روی این صفحه مبلغ تولید نمی‌شود.');}
async function fileTransfer(eid){const reason=prompt('توضیح جابه‌جایی مستند (حداقل ۱۲ نویسه):');if(reason===null)return;await api('teams/transfers','POST',{employee_id:eid,period_key:$('hc-transfer-month').value.trim(),reason});await loadTransfers();}
// KPI complaint; score changes and payments are deliberately not performed here.
async function loadKpi(){const people=await listPeople();$('hc-grievance-employee').innerHTML=options(people);
 const r=await fetch('/api/kpi/periods',{credentials:'same-origin',headers:{'X-CSRF-Token':token}});if(r.ok){kpiPeriods=(await r.json()).items||[];$('hc-grievance-period').innerHTML='<option value="">انتخاب ارزیابی تأییدشده</option>'+kpiPeriods.filter(p=>p.status==='approved').map(p=>`<option value="${p.id}">${esc((p.team_kind==='forge'?'آهنگری':'بنایی')+' '+p.team_number+' — '+p.period_key)}</option>`).join('');}
 const d=await api('kpi/grievances');$('hc-grievance-table').innerHTML=table(['نام کارمند','امتیاز اولیه','وضعیت','عملیات'],d.items.map(x=>[esc(x.full_name),esc(x.original_score),esc(statuses[x.status]||x.status),x.status==='pending'?`<button class="hc-action" data-gid="${x.id}" data-v="${x.version}">بررسی اعتراض</button>`:'—']));
 $('hc-grievance-table').querySelectorAll('[data-gid]').forEach(b=>b.onclick=()=>decideGrievance(b).catch(err=>msg('hc-kpi-msg',err.message,true)));}
async function lodge(){const body={period_id:Number($('hc-grievance-period').value),employee_id:$('hc-grievance-employee').value,statement:$('hc-grievance-note').value.trim()};
 await api('kpi/grievances','POST',body);msg('hc-kpi-msg','اعتراض ثبت شد؛ امتیاز و مبلغ کارانه همچنان ثابت هستند.');await loadKpi();}
async function decideGrievance(b){const note=prompt('شرح تصمیم مستند (حداقل ۱۲ نویسه):');if(note===null)return;const answer=prompt('نتیجه رسیدگی را فقط با واژه «قبول» یا «رد» وارد کنید؛ انصراف هیچ تصمیمی ثبت نمی‌کند.');if(answer===null)return;const decision=answer.trim()==='قبول'?'upheld':answer.trim()==='رد'?'dismissed':null;if(!decision)throw Error('نتیجه فقط باید قبول یا رد باشد');
 await api('kpi/grievances/'+b.dataset.gid+'/decision','POST',{expected_version:Number(b.dataset.v),decision,note});msg('hc-kpi-msg','تصمیم ثبت شد؛ تغییر نمره یا فیش همچنان نیازمند فرایند مستقل است.');await loadKpi();}
function ensure(){if(document.querySelector(`[data-page="${KEY}"]`))return;
 const sec=document.createElement('section');sec.className='page';sec.dataset.page=KEY;
 sec.innerHTML=`<div id="hc-root"><h2>تکمیل و کنترل فرایندهای HRMS رضوان</h2><p class="hc-help">کنترل حقوق و صدور فیش، استخدام از داوطلب، قرارداد ماهانه، جابه‌جایی تیم‌ها و اعتراض KPI. هیچ فرم این صفحه خودکار حقوق، قرارداد یا سهم کارانه را تغییر نمی‌دهد.</p>
 <div class="hc-tabs" id="hc-tabs"><button data-hctab="payroll">تطبیق ماه حقوق</button><button data-hctab="slips">صدور و آرشیو PDF فیش</button><button data-hctab="hiring">تکمیل استخدام</button><button data-hctab="contracts">تقویم قراردادها</button><button data-hctab="transfers">جابه‌جایی تیم‌ها</button><button data-hctab="kpi">اعتراض KPI</button></div>
 <div data-hcview="payroll" class="hc-panel"><div class="hc-card"><h3>چک‌لیست مستند کنترل حقوق</h3><p class="hc-warning">تأیید به معنای صحت خودکار محاسبات بیمه/مالیات یا پرداخت بانکی نیست و ماه را قفل نمی‌کند.</p><div class="hc-grid"><label>ماه شمسی<input id="hc-month" value="1405-07" maxlength="7"></label><label>توضیح تهیه‌کننده<textarea id="hc-packet-note" maxlength="1200"></textarea></label></div><input type="hidden" id="hc-packet-version" value="0"><button class="hc-action hc-muted" id="hc-payroll-load">بازخوانی ماه</button><div id="hc-payroll-detail"></div><div class="hc-checks" id="hc-checklist"></div><button class="hc-action" id="hc-save-packet">ثبت کنترل بدون اعمال روی فیش</button><button class="hc-action hc-muted" id="hc-approve-packet">تأیید مستقل کنترل</button><button class="hc-action hc-muted" id="hc-reopen-packet" disabled>بازبینی تأیید قبلی پس از تغییر داده‌ها</button><p id="hc-payroll-msg" role="status"></p></div></div>
 <div data-hcview="slips" class="hc-panel"><div class="hc-card"><h3>مرجع صدور فیش</h3><p class="hc-help">صدور PDF اصلی همچنان در صفحه «حقوق و دستمزد» است. پس از صدور از صفحه اصلی و ذخیره PDF، ابتدا مرجع صدور را ثبت و سپس همان PDF را با تأیید خودتان روی سرور بایگانی کنید. فایل به‌طور خودکار از پنجره چاپ دریافت نمی‌شود.</p><div class="hc-grid"><label>ماه شمسی<input id="hc-slip-month" value="1405-07"></label><label>کارمند<select id="hc-slip-person"></select></label><label>شماره سند یا فایل واقعی<input id="hc-slip-ref" maxlength="300"></label><label>توضیح ثبت صدور<textarea id="hc-slip-note" maxlength="900"></textarea></label></div><button class="hc-action" id="hc-save-slip">ثبت مرجع صدور</button><div class="hc-grid"><label>انتخاب PDF صادرشده<input type="file" accept=".pdf,application/pdf" id="hc-slip-pdf"></label><label class="hc-check"><input type="checkbox" id="hc-slip-confirm-pdf"><span>تأیید می‌کنم PDF متعلق به کارمند و ماه انتخاب‌شده است.</span></label></div><button class="hc-action" id="hc-archive-slip">بایگانی فایل PDF روی سرور</button><button class="hc-action hc-muted" id="hc-load-slip">بازخوانی</button><button class="hc-action hc-muted" id="hc-open-payroll">رفتن به صفحه فیش حقوقی</button><p id="hc-slips-msg" role="status"></p><div id="hc-slip-table"></div><h4>فایل‌های PDF بایگانی‌شده</h4><div id="hc-slip-archive-table"></div></div></div>
 <div data-hcview="hiring" class="hc-panel"><div class="hc-card"><h3>ایجاد پرونده پایه از داوطلب تأییدشده</h3><p class="hc-help">کارمند جدید فقط با تأیید صریح HR و کد یکتا ایجاد می‌شود؛ اطلاعات حقوقی و قرارداد جدا ثبت خواهند شد.</p><div class="hc-grid"><label>داوطلب تأییدشده<select id="hc-new-candidate"></select></label><label>کد پرسنلی جدید<input id="hc-new-code" maxlength="32"></label><label>واحد سازمانی<select id="hc-new-unit"></select></label><label>تاریخ استخدام (شمسی)<span id="hc-hire-date"></span></label><label>شرح تصمیم<textarea id="hc-new-note" maxlength="1000"></textarea></label></div><label class="hc-check"><input type="checkbox" id="hc-new-confirm"><span>تأیید می‌کنم داوطلب در مرحله جذب تأیید شده و پرونده جدید لازم است.</span></label><button class="hc-action" id="hc-create-employee">ایجاد پرونده با تأیید</button><p id="hc-hiring-msg" role="status"></p><div id="hc-hiring-list"></div></div></div>
 <div data-hcview="contracts" class="hc-panel"><div class="hc-card"><h3>تقویم قراردادهای مستقل ماهانه تا اسفند</h3><p class="hc-help">قرارداد چندماهه جایگزین قرارداد ماهانه نمی‌شود. برای کارکنان بدون طبقه‌بندی وضعیت همکاری، نیاز به بررسی HR نمایش داده می‌شود.</p><div class="hc-grid"><label>سال شمسی<input type="number" min="1400" max="1498" id="hc-year" value="1405"></label><label>شروع از ماه<input type="number" min="1" max="12" id="hc-from-month" value="7"></label></div><button class="hc-action" id="hc-contract-load">مشاهده وضعیت قراردادها</button><p id="hc-contracts-msg" role="status"></p><div id="hc-contract-output"></div></div></div>
 <div data-hcview="transfers" class="hc-panel"><div class="hc-card"><h3>کنترل جابه‌جایی داخل ماه</h3><p class="hc-warning">تا زمان تصویب فرمول تقسیم سهم در جابه‌جایی، مبلغ کارانه خودکار محاسبه یا اعمال نمی‌شود.</p><label>ماه بررسی شمسی<input id="hc-transfer-month" value="1405-07"></label><button class="hc-action" id="hc-transfer-load">بررسی عضویت تاریخی</button><p id="hc-transfers-msg" role="status"></p><div id="hc-transfer-table"></div></div></div>
 <div data-hcview="kpi" class="hc-panel"><div class="hc-card"><h3>ثبت اعتراض به ارزیابی عملکرد</h3><p class="hc-help">ثبت توسط کاربر مجاز منابع انسانی از طرف کارمند؛ امتیاز تأییدشده، کارانه و فیش خودکار اصلاح نمی‌شوند.</p><div class="hc-grid"><label>ارزیابی تأییدشده<select id="hc-grievance-period"></select></label><label>کارمند منتخب<select id="hc-grievance-employee"></select></label><label>شرح اعتراض و شواهد<textarea id="hc-grievance-note" maxlength="1600"></textarea></label></div><button class="hc-action" id="hc-submit-grievance">ثبت اعتراض</button><p id="hc-kpi-msg" role="status"></p><div id="hc-grievance-table"></div></div></div>
 </div>`;
 const main=document.querySelector('#app-root .main');if(!main)return;main.appendChild(sec);
 NAV.push({key:KEY,label:'کنترل نهایی و تکمیل HRMS',icon:'<path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h8M8 16h6"/>'});PAGE_PERMS[KEY]='view_personnel';
 const group=NAV_GROUPS.find(x=>x.label==='توسعه منابع انسانی');if(group)group.keys.push(KEY);else NAV_GROUPS.push({label:'توسعه منابع انسانی',keys:[KEY]});
 if(typeof buildJalaliPicker==='function')buildJalaliPicker('hc-hire-date');
 $('hc-tabs').onclick=ev=>{const b=ev.target.closest('[data-hctab]');if(b)switchTab(b.dataset.hctab);};
 const events={'hc-payroll-load':loadPayroll,'hc-save-packet':savePayroll,'hc-approve-packet':decidePayroll,'hc-reopen-packet':reopenPayroll,'hc-save-slip':saveSlip,'hc-archive-slip':archiveSlip,'hc-load-slip':loadSlips,'hc-create-employee':onboard,'hc-contract-load':loadContracts,'hc-transfer-load':loadTransfers,'hc-submit-grievance':lodge};
 for(const [id,cb] of Object.entries(events))$(id).onclick=()=>cb().catch(ex=>msg('hc-'+(id.includes('slip')?'slips':id.includes('packet')||id.includes('payroll')?'payroll':id.includes('employee')?'hiring':id.includes('contract')?'contracts':id.includes('transfer')?'transfers':'kpi')+'-msg',ex.message,true));
 $('hc-open-payroll').onclick=()=>{if(typeof goPage==='function')goPage('payroll');};
}
ensure();const old=renderPage;renderPage=function(page){if(page===KEY){switchTab(tab);return;}return old(page);};
})();
