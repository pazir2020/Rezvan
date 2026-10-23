/* Read-only view: never turns counts, working time, defects or bonus into fabricated values. */
(function(){'use strict';
const key='team-performance';
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fa=v=>Number(v).toLocaleString('fa-IR');
let csrf='';
async function api(path){
  if(!csrf){let me=await fetch('/api/auth/me',{credentials:'same-origin'});if(!me.ok)throw new Error('نشست کاربری منقضی شده است');csrf=(await me.json()).csrf_token;}
  const r=await fetch('/api/team-performance'+path,{credentials:'same-origin',headers:{'X-CSRF-Token':csrf}});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error?.message||body.detail||'خواندن اطلاعات سرور ناموفق بود');return body;
}
function makePage(){if(document.querySelector('[data-page="team-performance"]'))return;
 const n=document.createElement('section');n.className='page';n.dataset.page=key;
 n.innerHTML=`<div class="tp-wrap"><div class="tp-head"><h2>تحلیل عملکرد پنج تیم تولیدی</h2><p>دو تیم آهنگری، سه تیم بنایی — بر اساس سفارش‌ها و تاریخ‌های ثبت‌شده در LAN</p></div>
 <div class="tp-toolbar"><div class="tp-field"><span>از تاریخ (شمسی)</span><div id="tp-start"></div></div><div class="tp-field"><span>تا تاریخ (شمسی)</span><div id="tp-end"></div></div><button type="button" class="tp-btn" id="tp-apply">نمایش گزارش</button><button type="button" class="tp-btn" id="tp-all" style="background:#56718e">همه دوره‌ها</button></div>
 <p class="tp-hint" id="tp-scope">آمار تکمیل‌شده به تاریخ پایان معتبر وابسته است. وضعیت سفارش‌های باز، مربوط به زمان فعلی است.</p><div id="tp-content" role="status"><p class="tp-spinner">در حال بارگذاری گزارش...</p></div>
 <div class="tp-block"><h3>شاخص‌هایی که هنوز داده قابل اتکا ندارند</h3><p class="tp-hint">تا ثبت نفرساعت موظفی، اضافه‌کاری، زمان استاندارد و نتیجه کنترل کیفیت ساخت‌یافته، نرخ بهره‌وری، درصد دوباره‌کاری و اثر اضافه‌کاری قابل محاسبه نیستند. این صفحه هیچ مبلغ کارانه‌ای را تغییر نمی‌دهد.</p><div class="tp-chips" id="tp-gaps"></div></div></div>`;
 document.querySelector('#app-root .main').appendChild(n);
 NAV.push({key,label:'تحلیل عملکرد تیم‌ها',icon:'<rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/>'});
 PAGE_PERMS[key]='view_reports';
 const group=NAV_GROUPS.find(g=>g.label==='عملکرد تولید')||NAV_GROUPS.find(g=>g.keys.includes('oven-tracking'));
 if(group)group.keys.push(key);else NAV_GROUPS.splice(NAV_GROUPS.findIndex(g=>g.label==='سیستم'),0,{label:'عملکرد تولید',keys:[key]});
 for(let id of ['tp-start','tp-end']){if(typeof buildJalaliPicker==='function'){buildJalaliPicker(id);document.getElementById(id).dataset.empty='1';document.getElementById(id).addEventListener('click',e=>{if(e.target.closest('button'))document.getElementById(id).dataset.empty='0';});}}
 n.querySelector('#tp-apply').onclick=()=>load(true);
 n.querySelector('#tp-all').onclick=()=>{for(let id of ['tp-start','tp-end'])document.getElementById(id).dataset.empty='1';load(false);};
}
function dateParam(id){const el=document.getElementById(id);if(!el||el.dataset.empty==='1')return '';return typeof readJalaliPicker==='function'?readJalaliPicker(id):'';}
async function load(filtered){
 const el=document.getElementById('tp-content');if(!el)return;el.innerHTML='<p class="tp-spinner">در حال دریافت گزارش از سرور...</p>';
 let query='';if(filtered){let a=dateParam('tp-start'),b=dateParam('tp-end');if(a&&b&&a>b){el.textContent='تاریخ پایان قبل از شروع است.';return;}query='?'+new URLSearchParams({...a?{start:a}:{},...b?{end:b}:{}}).toString();}
 try{const d=await api(query);render(d);}catch(e){el.innerHTML='<div class="tp-error">'+escapeHtml(e.message)+'</div>';}
}
function render(d){
 const el=document.getElementById('tp-content'),team=d.teams||[];
 if(!team.length){el.innerHTML='<div class="tp-empty">اطلاعات تیم‌ها دریافت نشد.</div>';return;}
 const present=team.some(x=>x.assigned_total_all_time>0);
 const max=Math.max(1,...team.map(x=>x.completed_with_date));
 const info=x=>`<div class="tp-card"><h3>${escapeHtml(x.name)}</h3><div class="tp-label">تکمیل ثبت‌شده با تاریخ</div><div class="tp-kpi">${fa(x.completed_with_date)}</div><div class="tp-bar"><span style="width:${100*x.completed_with_date/max}%"></span></div><div class="tp-sub">در حال اجرا: ${fa(x.active_now)}<br>نیازمند اصلاح در وضعیت فعلی: ${fa(x.correction_now)}<br>سفارش‌های منتسب: ${fa(x.assigned_total_all_time)}</div>${x.completed_missing_date_all_time?`<div class="tp-warn">${fa(x.completed_missing_date_all_time)} تکمیل بدون تاریخ؛ در آمار دوره لحاظ نشده</div>`:''}</div>`;
 const tr=x=>`<tr><td>${escapeHtml(x.name)}</td><td>${fa(x.completed_with_date)}</td><td>${fa(x.active_now)}</td><td>${fa(x.correction_now)}</td><td>${fa(x.completed_missing_date_all_time)}</td><td>${x.elapsed_calendar_days_avg==null?'اطلاعات ناکافی':fa(x.elapsed_calendar_days_avg)+' روز ('+fa(x.elapsed_sample_count)+' سفارش)'}</td><td>${Object.keys(x.model_counts||{}).length?Object.entries(x.model_counts).map(([m,c])=>escapeHtml(m)+': '+fa(c)).join('، '):'—'}</td></tr>`;
 el.innerHTML=`${!present?'<div class="tp-empty">هنوز سفارشی به هیچ تیمی انتساب داده نشده است؛ امکان مقایسه عملکرد واقعی وجود ندارد.</div>':''}
 <div class="tp-grid">${team.map(info).join('')}</div>
 <div class="tp-block"><h3>جزئیات تیم‌ها (بدون رتبه‌بندی بهره‌وری)</h3><div class="tp-table-wrap"><table class="tp-table"><thead><tr><th>تیم</th><th>تکمیل دارای تاریخ در دوره</th><th>در حال اجرا اکنون</th><th>نیازمند اصلاح اکنون</th><th>تکمیل بدون تاریخ</th><th>میانگین روز تقویمی کار</th><th>مدل‌های تکمیل‌شده</th></tr></thead><tbody>${team.map(tr).join('')}</tbody></table></div><p class="tp-hint">میانگین روزهای تقویمی برابر ساعت کار نیست. شمار «نیازمند اصلاح» نرخ خرابی یا دوباره‌کاری نیست. تفاوت تعداد سفارش‌ها، به‌تنهایی نشان‌دهنده تفاوت بهره‌وری تیم‌ها نیست.</p></div>`;
 document.getElementById('tp-gaps').innerHTML=(d.missing||[]).map(s=>'<span class="tp-chip">'+escapeHtml(s)+'</span>').join('');
 document.getElementById('tp-scope').textContent=d.scope||'';
}
makePage();
const oldRender=renderPage;
renderPage=function(page){if(page===key){load(false);return;}return oldRender(page);};
})();
