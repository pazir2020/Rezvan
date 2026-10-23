/* Additive KPI module; no automatic payroll mutations. Uses existing app shell. */
(function(){'use strict';
const KEY='kpi-team', weights=[30,25,20,15,10], names=['کیفیت تخصصی','مشارکت مؤثر','بهره‌وری در ساعات موظفی','نظم و مسئولیت‌پذیری','همکاری و ایمنی'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token='',people=[],periods=[],weightProfiles={forge:{weights:[30,25,20,15,10],version:0},masonry:{weights:[30,25,20,15,10],version:0}},registered=[],userAccounts=[];
async function req(path='',method='GET',body){if(!token){const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('ورود به سامانه الزامی است');token=(await r.json()).csrf_token;}
 const r=await fetch('/api/kpi'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||d.detail||'خطا در درخواست');return d;}
async function registry(path='',method='GET',body){
 if(!token){const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('نشست کاربر فعال نیست');token=(await r.json()).csrf_token;}
 const r=await fetch('/api/team-registry'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?.message||JSON.stringify(data.detail||'ثبت انجام نشد'));return data;
}
function syncWeightInputs(){
 const kind=document.getElementById('rk-kind').value;
 weights.splice(0,weights.length,...(weightProfiles[kind]?.weights||[30,25,20,15,10]));
 document.getElementById('rk-members').innerHTML=[0,1,2,3].map(memberHtml).join('');
 const panel=document.getElementById('rk-config');if(panel&&panel.style.display!=='none'){
  document.querySelectorAll('.rk-weight').forEach((el,i)=>el.value=weights[i]);
  document.getElementById('rk-weight-version').textContent=String(weightProfiles[kind]?.version||0);
 }
}
async function getPeople(){if(!token){const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('ابتدا وارد شوید');token=(await r.json()).csrf_token;}
 const r=await fetch('/api/hr-development/employees',{credentials:'same-origin',headers:{'X-CSRF-Token':token}});if(!r.ok)throw Error('دسترسی مشاهده کارکنان موجود نیست');return (await r.json()).items||[];}
function section(){if(document.querySelector('[data-page="'+KEY+'"]'))return;
 const e=document.createElement('section');e.className='page';e.dataset.page=KEY;
 e.innerHTML=`<div class="rk-wrap"><h2>ارزیابی KPI و تقسیم کارانه تیم‌های رضوان</h2><p class="rk-note">فرم تخصصی ۴ نفره آهنگری/بنایی، وزن‌های قابل تنظیم و ثبت‌شده برای همان دوره، ثبت مستندات و گردش تأیید مستقل. ثبت ارزیابی و محاسبه کارانه به‌صورت پیش‌فرض مستقل از فیش است. انتقال تنها با انتخاب اختیاری، پیش‌نمایش و تأیید مالی مجاز انجام می‌شود.</p>
 <div class="rk-panel"><h3>دوره و تیم</h3><div class="rk-grid"><label>ماه شمسی (۱۴۰۵-۰۸)<input id="rk-month" placeholder="1405-08" maxlength="7" value="1405-08"></label><label>واحد<select id="rk-kind"><option value="forge">آهنگری</option><option value="masonry">بنایی</option></select></label><label>شماره تیم<select id="rk-team"><option value="1">تیم ۱</option><option value="2">تیم ۲</option></select></label><label>امتیاز تولید واحد (در صورت تصویب و ثبت)<input id="rk-points" type="number" min="0" step="0.5" placeholder="ثبت نشود = مبلغ نامشخص"></label></div><p class="rk-note">حدنصاب ۵۰ امتیاز؛ هر امتیاز مازاد یک میلیون تومان. این فرم امتیاز تولید را از سفارش‌ها استنتاج نمی‌کند؛ از ثبت دوباره و احتساب اضافه‌کاری به‌عنوان کارانه خودکار جلوگیری شود.</p></div>
 <div class="rk-panel" id="rk-config" style="display:none"></div>
 <div class="rk-panel"><h3>ارزیابی چهار عضو تیم</h3><div id="rk-members"></div><button id="rk-submit">ثبت ارزیابی به‌عنوان پیش‌نویس</button><p id="rk-msg" role="status"></p></div>
 <div class="rk-panel"><h3>ارزیابی‌های ثبت‌شده و تأییدها</h3><button class="secondary" id="rk-refresh">بروزرسانی</button><div id="rk-results" class="rk-table"></div></div><div class="rk-panel" id="rk-payroll-preview" style="display:none"></div></div>`;
 document.querySelector('#app-root .main').appendChild(e);
 NAV.push({key:KEY,label:'ارزیابی KPI و کارانه',icon:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 12l3 3 7-7"/>'});PAGE_PERMS[KEY]='view_personnel';
 const group=NAV_GROUPS.find(g=>g.label==='عملکرد تولید');if(group)group.keys.push(KEY);else NAV_GROUPS.push({label:'عملکرد تولید',keys:[KEY]});
 document.getElementById('rk-kind').onchange=()=>{const t=document.getElementById('rk-team');t.innerHTML=Array.from({length:document.getElementById('rk-kind').value==='forge'?2:3},(_,i)=>`<option value="${i+1}">تیم ${i+1}</option>`).join('');syncWeightInputs();};
 document.getElementById('rk-team').onchange=showRoster;document.getElementById('rk-submit').onclick=save;document.getElementById('rk-refresh').onclick=reload;
}
function memberHtml(i){return `<div class="rk-member"><b>عضو ${i+1}</b><div class="rk-grid"><label>نام کارمند<select id="rk-person-${i}"><option value="">انتخاب کارمند</option>${people.map(x=>`<option value="${esc(x.id)}">${esc(x.full_name)} (${esc(x.unit_id)})</option>`).join('')}</select></label><label>شواهد ارزیابی<textarea id="rk-evidence-${i}" rows="2" maxlength="1200" placeholder="نمونه واقعی از کیفیت، مشارکت یا انضباط"></textarea></label></div><div class="rk-five">${names.map((n,j)=>`<label>${n} (${weights[j]} امتیاز)<select id="rk-rating-${i}-${j}">${[0,1,2,3,4].map(v=>`<option value="${v}" ${v===3?'selected':''}>${v} از ۴</option>`).join('')}</select></label>`).join('')}</div></div>`;}
async function save(){const m=document.getElementById('rk-msg');m.textContent='در حال ثبت...';try{
 const members=[0,1,2,3].map(i=>({employee_id:document.getElementById('rk-person-'+i).value,ratings:weights.map((_,j)=>Number(document.getElementById(`rk-rating-${i}-${j}`).value)),evidence:document.getElementById('rk-evidence-'+i).value.trim()}));
 if(members.some(x=>!x.employee_id))throw Error('هر چهار عضو تیم را انتخاب کنید');
 const points=document.getElementById('rk-points').value;
 const body={period_key:document.getElementById('rk-month').value.trim(),team_kind:document.getElementById('rk-kind').value,team_number:Number(document.getElementById('rk-team').value),production_points:points===''?null:Number(points),members};
 await req('/periods','POST',body);m.className='rk-good';m.textContent='پیش‌نویس در سرور ثبت شد. تأیید مستقل برای نهایی شدن ارزیابی لازم است.';await reload();
 }catch(e){m.className='rk-error';m.textContent=e.message;}}
async function review(id,version,decision){if(!confirm('آیا تصمیم ثبت شود؟'))return;try{await req(`/periods/${id}/review`,'POST',{expected_version:version,decision});await reload();}catch(e){alert(e.message);}}
function resultHtml(x){const kind=x.team_kind==='forge'?'آهنگری':'بنایی',pool=x.pool_toman;
 return `<div class="rk-panel"><b>${kind} ${x.team_number} — ${esc(x.period_key)} — ${esc(x.status)}</b><p class="rk-note">وزن‌های محفوظ برای این ارزیابی: ${(x.weights||[]).join("/")} — ${x.membership_verified?"ترکیب تاریخی تیم تأیید شده است":"ترکیب تاریخی تیم نیازمند تأیید است؛ سهم ریالی فردی قابل تصویب نیست."}</p><p class="rk-note">${pool==null?'مبلغ: ثبت نشده یا خارج از سطح دسترسی':'کارانه شبیه‌سازی‌شده: '+Number(pool).toLocaleString('fa-IR')+' تومان'}</p><div class="rk-table"><table><thead><tr><th>کارمند</th><th>نمره</th><th>سهم نمونه</th></tr></thead><tbody>${x.people.map(p=>`<tr><td>${esc(p.full_name)}</td><td>${p.score}</td><td>${p.illustrative_share_toman==null?'محدود / نامشخص':Number(p.illustrative_share_toman).toLocaleString('fa-IR')+' تومان'}</td></tr>`).join('')}</tbody></table></div>${x.status==='approved'&&x.membership_verified&&pool!=null&&typeof can==='function'&&can('view_salary')?`<button class="secondary" data-preview="${x.id}">مشاهده اثر احتمالی در فیش (بدون اعمال خودکار)</button>`:''}${x.status==='draft'&&typeof can==='function'&&can('approve_records')?`<button data-id="${x.id}" data-ver="${x.version}" data-decision="approved" ${x.membership_verified?'':'disabled'}>تأیید ارزیابی</button><button class="secondary" data-id="${x.id}" data-ver="${x.version}" data-decision="rejected">رد ارزیابی</button>`:''}</div>`;}
async function reload(){const el=document.getElementById('rk-results');if(!el)return;el.textContent='در حال دریافت...';try{periods=(await req('/periods')).items||[];el.innerHTML=periods.length?periods.map(resultHtml).join(''):'هنوز ارزیابی ثبت نشده است';el.querySelectorAll('button[data-decision]').forEach(b=>b.onclick=()=>review(Number(b.dataset.id),Number(b.dataset.ver),b.dataset.decision));el.querySelectorAll('button[data-preview]').forEach(b=>b.onclick=()=>showPayrollPreview(Number(b.dataset.preview)));}catch(e){el.textContent=e.message;}}

// Read-only before/after view; server owns approval and reversal, never client-side mutation.
let currentPayrollPreview=null;
const money=v=>Number(v||0).toLocaleString('fa-IR')+' تومان';
// Recalculate the legacy payslip with a TEMPORARY in-memory KPI adjustment.
// This does not save anything or change any server record. It models the existing
// payroll engine; the effect of taxing/insuring this bonus requires independent review.
function simulatePayrollNet(employeeId,month,delta){
 let initial=null,simulated=null;
 if(typeof monthKey!=='function'||month!==monthKey(0))return {initial,simulated};
 if(typeof computeEmployeePayroll!=='function'||typeof DATA==='undefined')return {initial,simulated};
 const emp=(DATA.employees||[]).find(e=>e.id===employeeId);if(!emp)return {initial,simulated};
 const old=DATA.payrollAdjustments;
 try{
  const before=computeEmployeePayroll(emp);
  if(!Number.isFinite(Number(before.net)))return {initial,simulated};
  initial=Math.round(Number(before.net));
  if(delta===0)return {initial,simulated:initial};
  // Simulate exactly the change, not a duplicate of previously approved bonuses.
  DATA.payrollAdjustments=[...(old||[]),{
    id:'PREVIEW-ONLY-KPI',employee_id:employeeId,kind:delta>=0?'bonus':'penalty',
    type:'kpi_preview',amount:Math.abs(delta),payroll_month:month,apply_to_payroll:true,
    status:'preview_only'
  }];
  const after=computeEmployeePayroll(emp);
  if(Number.isFinite(Number(after.net)))simulated=Math.round(Number(after.net));
 }catch(e){return {initial:null,simulated:null};}
 finally{DATA.payrollAdjustments=old;}
 return {initial,simulated};
}
async function showPayrollPreview(pid){
 const box=document.getElementById('rk-payroll-preview');if(!box)return;
 box.style.display='block';box.textContent='در حال دریافت پیش‌نمایش از سرور...';
 try{
  const d=await req('/payroll/'+pid+'/preview');currentPayrollPreview=d;
  const applied=d.status==='applied',reverted=d.status==='reverted';
  const canDecide=typeof can==='function'&&can('approve_payroll')&&d.period_matches_current_payslip;
  const operation=applied?'revert':'approve';
  const columns=d.people.map(p=>{
   const delta=applied?Number(p.delta_if_revert_toman):reverted?0:Number(p.delta_if_apply_toman);
   const {initial:before,simulated:after}=simulatePayrollNet(p.employee_id,d.payroll_month,delta);
   return `<tr><td>${esc(p.full_name)}</td><td>${money(p.previous_kpi_toman)}</td><td>${money(p.proposed_kpi_toman)}</td><td>${delta===0?'بدون تغییر':(delta>0?'+':'−')+money(Math.abs(delta))}</td><td>${before==null?'نامشخص':money(before)}</td><td>${after==null?'نیازمند محاسبه فیش':money(after)}</td></tr>`;
  }).join('');
  const control=applied
   ? `<button class="secondary" id="rk-pay-revert" ${canDecide?'':'disabled'}>بازگشت و حذف اثر همین کارانه از فیش</button>`
   : reverted
     ? '<p class="rk-note">اثر این انتقال قبلاً لغو شده و کارانه دوباره به فیش اضافه نمی‌شود. ارزیابی و امتیازات آن حفظ شده‌اند.</p>'
     : `<label class="rk-pay-choice"><input type="checkbox" id="rk-pay-optin" ${canDecide?'':'disabled'}> انتخاب می‌کنم کارانه این ارزیابی فقط برای ماه فیش مشخص‌شده اعمال شود.</label>
        <button id="rk-pay-approve" disabled>تأیید نهایی و اعمال اختیاری کارانه در فیش</button>`;
  const warn=(d.warnings||[]).map(w=>`<p class="rk-error">${esc(w)}</p>`).join('');
  box.innerHTML=`<h3>پیش‌نمایش اختیاری اتصال KPI به فیش</h3>
   <p class="rk-note">دوره ارزیابی شمسی: <b>${esc(d.jalali_month)}</b> — ماه فیش: <b>${esc(d.payroll_month)}</b> — وضعیت: <b>${applied?'اعمال‌شده':reverted?'بازگردانی‌شده':'مستقل از حقوق / اعمال‌نشده'}</b></p>
   <p class="rk-note">کارانه تیم: <b>${money(d.pool_toman)}</b> — حالت پیش‌فرض: <b>عدم اعمال کارانه به فیش</b></p>
   <div class="rk-table"><table><thead><tr><th>کارمند</th><th>کارانه قبلاً اعمال‌شده</th><th>سهم کارانه ارزیابی</th><th>تغییر در صورت انتخاب</th><th>خالص فعلی فیش*</th><th>خالص بعد از انتخاب*</th></tr></thead><tbody>${columns}</tbody></table></div>
   <p class="rk-note">* خالص قبل/بعد با اجرای مجدد موتور فعلی فیش روی داده موقت محاسبه می‌شود (بدون ذخیره). در موتور فعلی پاداش به جمع خالص افزوده می‌شود و لزوماً مالیات/بیمه کارانه را پوشش نمی‌دهد؛ تأیید مالی الزامی است. این گزینه پرداخت بانکی انجام نمی‌دهد.</p>
   <p class="rk-note">در ماه قفل‌شده، دارای پرداخت ثبت‌شده یا خارج از ماه جاری، اعمال/بازگشت مستقیم مجاز نیست. در صورت جابه‌جایی کارکنان، تقسیم سهم باید جداگانه بررسی شود.</p>
   ${warn}${control}
   <button class="secondary" id="rk-pay-close">بازگشت بدون تغییر حقوق</button><p id="rk-pay-msg" role="status"></p>`;
  box.querySelector('#rk-pay-close').onclick=()=>{box.style.display='none';currentPayrollPreview=null;};
  const optin=box.querySelector('#rk-pay-optin'),approve=box.querySelector('#rk-pay-approve');
  if(optin&&approve){optin.onchange=()=>{approve.disabled=!optin.checked;};approve.onclick=()=>payrollDecision(pid,'approve');}
  const reverse=box.querySelector('#rk-pay-revert');if(reverse)reverse.onclick=()=>payrollDecision(pid,'revert');
  box.scrollIntoView({block:'nearest',behavior:'smooth'});
 }catch(e){box.textContent=e.message;}
}
async function payrollDecision(pid,operation){
 const d=currentPayrollPreview;if(!d||d.period_id!==pid)return;
 const msg=document.getElementById('rk-pay-msg');
 if(!d.period_matches_current_payslip){msg.textContent='ماه قابل تغییر نیست؛ پیش‌نمایش را بررسی کنید';return;}
 if(operation==='approve'&&!document.getElementById('rk-pay-optin')?.checked){msg.textContent='ابتدا گزینه اعمال اختیاری را انتخاب کنید';return;}
 const verb=operation==='approve'?'اعمال کارانه در فیش':'لغو فقط همین کارانه و بازگشت به فیش اولیه';
 const note=prompt('علت '+verb+' را وارد کنید (حداقل ۸ نویسه):');
 if(note===null)return;if(note.trim().length<8){alert('دلیل باید حداقل ۸ نویسه باشد');return;}
 if(!confirm('آیا از '+verb+' برای هر چهار کارمند اطمینان دارید؟'))return;
 try{
  msg.textContent='در حال اعمال کنترل ماه، قفل، دسترسی و عدم پرداخت تکراری...';
  const payload=operation==='approve'?{kpi_version:d.kpi_version,payroll_month:d.payroll_month,note:note.trim()}:{note:note.trim()};
  const r=await req('/payroll/'+pid+'/'+operation,'POST',payload);
  msg.textContent=r.notice||'عملیات ثبت شد';
  window.location.reload(); // Reads payroll and adjustments afresh from the server.
 }catch(e){msg.textContent=e.message;}
}

async function registrySetup(){
 const cfg=await registry('/settings');weightProfiles=cfg.profiles||weightProfiles;
 const roster=await registry('/memberships');registered=roster.items||[];
 const panel=document.getElementById('rk-config');
 if(!cfg.editable){panel.style.display='none';return;}
 panel.style.display='block';
 panel.innerHTML=`<h3>مدیریت شاخص‌ها و عضویت واقعی تیم‌ها (منابع انسانی)</h3>
 <p class="rk-note">وزن‌های جدید فقط برای ارزیابی‌های تازه اعمال می‌شوند؛ پرونده‌های قبلی تغییر نمی‌کنند. ثبت عضویت تاریخی پیش‌شرط تأیید کارانه است. جابه‌جایی وسط ماه تا تصویب آیین‌نامه تقسیم، قابل پرداخت خودکار نیست.</p>
 <h4>وزن‌های پنج شاخص تیم انتخابی</h4>
 <div class="rk-five">${names.map((n,i)=>`<label>${n}<input class="rk-weight" type="number" min="0" max="100" step="1" value="${weights[i]}"></label>`).join('')}</div>
 <p class="rk-note">نسخه تنظیمات: <span id="rk-weight-version">۰</span> | جمع وزن‌ها باید ۱۰۰ باشد.</p><label>دلیل تغییر وزن<input id="rk-weight-note" placeholder="علت مصوب تغییر معیارها"></label><button id="rk-weight-save">ذخیره وزن‌های آتی</button>
 <h4>ثبت و رهگیری عضویت تاریخی اعضای تیم</h4>
 <div class="rk-grid"><label>کارمند<select id="rk-assign-person">${people.map(x=>`<option value="${esc(x.id)}">${esc(x.full_name)}</option>`).join('')}</select></label>
 <label>شروع عضویت (شمسی)<div id="rk-assign-start"></div></label>
 <label>پایان عضویت (اختیاری)<div id="rk-assign-end"></div><label><input type="checkbox" id="rk-assign-open" checked> بدون تاریخ پایان</label></label>
 <label>دلیل ثبت یا انتقال<input id="rk-assign-note" placeholder="مثلاً شروع همکاری با تیم"></label></div>
 <button id="rk-assign-save">ثبت عضویت در تیم انتخابی</button>
 <div class="rk-table" id="rk-membership-list"></div>
 ${typeof can==='function'&&can('manage_users')?`<h4>تخصیص سرپرست به تیم (فقط مدیر سیستم)</h4>
 <div class="rk-grid"><label>حساب کاربری سرپرست<select id="rk-supervisor-user"></select></label>
 <label>تاریخ شروع سرپرستی (شمسی)<div id="rk-supervisor-date"></div></label>
 <label>دلیل تخصیص<input id="rk-supervisor-note" placeholder="نام یا سمت سرپرست"></label></div>
 <button id="rk-supervisor-save">تخصیص این حساب به تیم انتخابی</button>`:''}
 <div id="rk-registry-msg" role="status"></div>`;
 buildJalaliPicker('rk-assign-start');buildJalaliPicker('rk-assign-end');
 if(document.getElementById('rk-supervisor-date'))buildJalaliPicker('rk-supervisor-date');
 const today=document.getElementById('rk-assign-end');today.style.display='none';
 panel.querySelector('#rk-assign-open').onchange=()=>today.style.display=panel.querySelector('#rk-assign-open').checked?'none':'block';
 document.getElementById('rk-weight-save').onclick=async()=>{
  const msg=document.getElementById('rk-registry-msg');try{
   const kind=document.getElementById('rk-kind').value, values=[...document.querySelectorAll('.rk-weight')].map(x=>Number(x.value));
   if(values.some(x=>!Number.isInteger(x)||x<0||x>100)||values.reduce((a,b)=>a+b,0)!==100)throw Error('پنج وزن باید عدد صحیح و مجموعاً ۱۰۰ باشند');
   const note=document.getElementById('rk-weight-note').value.trim();if(note.length<8)throw Error('علت تغییر حداقل ۸ نویسه باشد');
   if(!confirm('وزن‌های دوره‌های قبلی ثابت می‌مانند. وزن جدید برای ارزیابی‌های آینده ثبت شود؟'))return;
   await registry('/settings','PUT',{team_kind:kind,weights:values,expected_version:weightProfiles[kind]?.version||0,note});
   msg.textContent='وزن‌های جدید برای ارزیابی‌های آینده ثبت شدند.';await registrySetup();syncWeightInputs();
  }catch(e){msg.textContent=e.message;}
 };
 document.getElementById('rk-assign-save').onclick=async()=>{
  const msg=document.getElementById('rk-registry-msg');try{
   const start=readJalaliPicker('rk-assign-start'),isOpen=document.getElementById('rk-assign-open').checked,
    end=isOpen?null:readJalaliPicker('rk-assign-end'),note=document.getElementById('rk-assign-note').value.trim();
   if(!start||(!isOpen&&!end))throw Error('تاریخ صحیح از تقویم انتخاب کنید');
   if(note.length<5)throw Error('دلیل عضویت را ثبت کنید');
   if(!confirm('عضویت این شخص در تیم و بازه انتخابی ثبت شود؟'))return;
   await registry('/memberships','POST',{employee_id:document.getElementById('rk-assign-person').value,team_kind:document.getElementById('rk-kind').value,
    team_number:Number(document.getElementById('rk-team').value),valid_from:start,valid_to:end,note});
   msg.textContent='عضویت تاریخی ثبت شد.';await registrySetup();await reload();
  }catch(e){msg.textContent=e.message;}
 };
 const spSave=document.getElementById('rk-supervisor-save');
 if(spSave){
  try{
   const res=await fetch('/api/users',{credentials:'same-origin',headers:{'X-CSRF-Token':token}});
   if(!res.ok)throw Error('فهرست کاربران مدیر سیستم در دسترس نیست');
   userAccounts=(await res.json()).filter(u=>u.active&&!u.is_system);
   document.getElementById('rk-supervisor-user').innerHTML=userAccounts.map(u=>`<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.username)})</option>`).join('');
  }catch(e){spSave.disabled=true;document.getElementById('rk-registry-msg').textContent=e.message;}
  spSave.onclick=async()=>{
   const msg=document.getElementById('rk-registry-msg');try{
    const note=document.getElementById('rk-supervisor-note').value.trim();if(note.length<5)throw Error('توضیح لازم است');
    if(!confirm('این حساب بتواند فقط ارزیابی‌های تیم تعیین‌شده را ایجاد کند؟'))return;
    await registry('/supervisors','POST',{user_id:document.getElementById('rk-supervisor-user').value,
      team_kind:document.getElementById('rk-kind').value,team_number:Number(document.getElementById('rk-team').value),
      valid_from:readJalaliPicker('rk-supervisor-date'),valid_to:null,note});
    msg.textContent='تخصیص سرپرست ثبت شد. سطح دسترسی اصلی کاربر نیز باید مجوز نوشتن پرونده داشته باشد.';
   }catch(e){msg.textContent=e.message;}
  };
 }
 showRoster();syncWeightInputs();
}
function showRoster(){
 const box=document.getElementById('rk-membership-list');if(!box)return;
 const data=registered.filter(r=>r.team_kind===document.getElementById('rk-kind').value&&r.team_number===Number(document.getElementById('rk-team').value));
 box.innerHTML=`<table><thead><tr><th>کارمند</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${data.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(r.valid_from)}</td><td>${esc(r.valid_to||'نامحدود')}</td><td>${r.valid_to?'بسته':'فعال'}</td><td>${!r.valid_to?`<button class=\"secondary\" data-close=\"${r.id}\">پایان عضویت</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5">برای این تیم عضوی ثبت نشده است.</td></tr>'}</tbody></table>`;
 box.querySelectorAll('[data-close]').forEach(button=>button.onclick=async()=>{
  const msg=document.getElementById('rk-registry-msg');try{
   const day=readJalaliPicker('rk-assign-end');if(!day)throw Error('تاریخ پایان را از تقویم انتخاب کنید');
   const note=prompt('علت پایان عضویت یا جابه‌جایی (حداقل ۸ حرف)');
   if(note===null)return;if(note.trim().length<8)throw Error('دلیل کافی وارد کنید');
   if(!confirm('عضویت تاریخی در تاریخ انتخاب‌شده پایان یابد؟'))return;
   await registry('/memberships/'+button.dataset.close+'/close','POST',{end_date:day,note:note.trim()});
   msg.textContent='دوره عضویت بسته شد';await registrySetup();await reload();
  }catch(e){msg.textContent=e.message;}
 });
}
async function activate(){try{people=await getPeople();await registrySetup();syncWeightInputs();await reload();}catch(e){document.getElementById('rk-msg').textContent=e.message;}}
section();const old=renderPage;renderPage=function(page){if(page===KEY){activate();return;}return old(page);};
})();
