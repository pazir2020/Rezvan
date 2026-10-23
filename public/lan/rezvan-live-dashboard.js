/* HRMS رضوان | data-bound shell for the approved EasyTeam + HRUnify + Payroll design.
 * No fake metrics, no new records, no modification of original salary/payroll calculations.
 * Reads only post-login data filtered by the server and by the existing page permissions.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v).toLocaleString('fa-IR');
function allow(page){ try {return typeof canPage==='function' && canPage(page);}catch(_){return false;} }
function canRead(permission){try{return typeof can==='function'&&can(permission);}catch(_){return false;}}
function go(key){if(allow(key) && typeof goPage==='function') goPage(key);}
function actions(){
 const mark=document.querySelector('.rz-intro-mark');
 const original=document.querySelector('.sidebar .brand img');
 if(mark && original && !mark.querySelector('img')){
   // Original company logo from the original approved dashboard; no substitute emblem.
   const cloned=original.cloneNode(true);cloned.alt='';mark.replaceChildren(cloned);
 }
 document.querySelectorAll('.rz-theme-intro [data-go]').forEach(b=>{
    if(!allow(b.dataset.go)){b.style.display='none';return;}
    b.onclick=()=>go(b.dataset.go);
 });
}
function tile(t){
 const click=t.target&&allow(t.target)?`data-go="${t.target}" tabindex="0" role="button" aria-label="رفتن به ${safe(t.label)}"`:'';
 return `<section class="rz-live-tile" data-tone="${t.tone||'blue'}" ${click}>
  <div class="rz-live-top"><span class="rz-live-label">${safe(t.label)}</span><span class="rz-live-ico" aria-hidden="true">${t.icon}</span></div>
  <strong>${safe(t.value)}</strong><small>${safe(t.caption)}</small></section>`;
}
function refresh(){
 const root=$('rz-live-operations');if(!root)return;
 actions();
 if(!canRead('view_dashboard')){root.innerHTML='';return;}
 // Prefer the canonical post-auth normalized data; NEVER use invented placeholders as numbers.
 if(typeof DATA==='undefined'||!DATA||!Array.isArray(DATA.employees)){
  root.innerHTML='<div class="rz-live-alert">برای مشاهده شاخص‌های واقعی، ابتدا وارد سرور رضوان شوید.</div>';return;
 }
 const es=DATA.employees||[], active=es.filter(e=>e.status!=='terminated');
 const contracts=Array.isArray(DATA.contracts)?DATA.contracts:[];
 const today=new Date();today.setHours(12,0,0,0);
 const near=contracts.filter(c=>{
   const raw=String(c.end_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
   const end=new Date(raw+'T12:00:00');if(Number.isNaN(end.valueOf()))return false;
   const d=Math.ceil((end-today)/86400000);
   return d>=0&&d<=30;
 }).length;
 const availableContracts=canRead('view_personnel');
 // The date of the latest imported monthly Excel is source-backed, not current-month guessed.
 const excelMonths=(DATA.payrollLocks||[]).filter(l=>l&&l.excelReport&&Array.isArray(l.excelReport.staff));
 const ordered=excelMonths.slice().sort((a,b)=>String(b.month||'').localeCompare(String(a.month||'')));
 const latest=ordered[0];
 const payrollAllowed=canRead('view_salary');
 const payrollValue=payrollAllowed ? (latest?n((latest.excelReport||{}).staff.length):'—'):'محرمانه';
 const salaryPeriod=latest?(String(latest.month||'دوره نامشخص')):'گزارشی وارد نشده';
 const staffValue=canRead('view_personnel')?n(active.length):'—';
 let leaveValue='—',leaveNote='داده یا مجوز کافی وجود ندارد';
 if(canRead('view_leave') && Array.isArray(DATA.leaves)){
   // This is the number of requests, not the number of leave days/hours or an entitlement balance.
   const j=typeof todayJalali==='function'?todayJalali():null;
   const start=j?(j.jy+'-'+String(j.jm).padStart(2,'0')):null;
   if(start){
     const rows=DATA.leaves.filter(l=>{
       const d=String(l.start_date||'');
       try {return typeof jalaliMonthOf==='function'&&jalaliMonthOf(d)===j.jy+'-'+j.jm;}
       catch(_){return false;}
     });
     leaveValue=n(rows.length);leaveNote='تعداد درخواست‌های مرخصی ثبت‌شده در ماه جاری؛ نه موجودی ساعت';
   }
 }
 const tiles=[
   {label:'پرسنل غیرخاتمه‌یافته',value:staffValue,caption:'براساس پرونده‌های مجاز سرور',icon:'♟',tone:'blue',target:'personnel'},
   {label:'قراردادهای تا ۳۰ روز آینده',value:availableContracts?n(near):'—',caption:'بر اساس تاریخ پایان ثبت‌شده؛ وضعیت امضا جداگانه بررسی شود',icon:'▤',tone:'red',target:'contracts-hub'},
   {label:'درخواست‌های مرخصی ماه',value:leaveValue,caption:leaveNote,icon:'◷',tone:'orange',target:'leave'},
   {label:'رکوردهای آخرین اکسل حقوق',value:payrollValue,caption:payrollAllowed?salaryPeriod:'فقط کاربران دارای مجوز مالی',icon:'▥',tone:'green',target:'payroll'}
 ];
 root.innerHTML=tiles.map(tile).join('');
 root.querySelectorAll('[data-go]').forEach(el=>{
   el.onclick=()=>go(el.dataset.go);
   el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(el.dataset.go);}};
 });
}
// Legacy direct-file controls were carried over from the original offline edition.
// In LAN mode they must not claim to back up/restore the authoritative PostgreSQL database.
function clarifyServerOnlyControls(){
  try{
    window.gateConnect=function(){
      if(location.protocol==='file:') alert('این نسخه برای اتصال به سرور شبکه داخلی طراحی شده است. ابتدا scripts/run.bat را اجرا و سپس آدرس http://localhost:8000 را روی کامپیوتر سرور در مرورگر باز کنید.');
      else location.reload();
    };
    window.exportBackup=function(){alert('خروجی JSON مرورگر پشتیبان کامل سرور نیست. برای پشتیبان‌گیری واقعی از scripts/backup.bat و برای بررسی صحت آن از scripts/verify-backup.bat استفاده کنید.');};
    window.pickFolder=function(){alert('ذخیره اطلاعات در حالت LAN روی PostgreSQL و مخزن اسناد سرور انجام می‌شود؛ انتخاب پوشه مرورگر کاربرد ندارد.');};
    for(const selector of ['button[onclick="removeAccessPassword()"]','button[onclick="enableAccessLock()"]','button[onclick="resetAll()"]']){
       for(const b of document.querySelectorAll(selector)){
          b.disabled=true;b.title='این عملیات در حالت سرور LAN از داخل مرورگر مجاز نیست';
       }
    }
  }catch(e){console.warn('Rezvan LAN control clarification:',e);}
}
// Do not replace any calculation or bootstrap function; decorate only after original renderer.
try{
  if(typeof renderPage==='function'){
    const previousRender=renderPage;
    renderPage=function(key){const result=previousRender(key);if(key==='dashboard')refresh();return result;};
  }
}catch(e){console.warn('Rezvan unified shell: renderer hook not installed',e);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{clarifyServerOnlyControls();refresh();},{once:true});else {clarifyServerOnlyControls();refresh();}
window.rezvanRefreshLiveTiles=refresh;
})();
