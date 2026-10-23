/* Rezvan person-hours: authenticated LAN PostgreSQL only, zero client persistence */
(function(){'use strict';
const key='team-hours',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=v=>Number(v||0).toLocaleString('fa-IR',{maximumFractionDigits:2});
let csrf='',orders=[],entries=[],isWriter=false,canApprove=false;
const teams={forge:['آهنگری ۱','آهنگری ۲'],masonry:['بنایی ۱','بنایی ۲','بنایی ۳']};
async function api(path,method='GET',body){
 if(!csrf){let me=await fetch('/api/auth/me',{credentials:'same-origin'});if(!me.ok)throw Error('نشست منقضی شده است');csrf=(await me.json()).csrf_token;}
 const r=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error?.message||j.detail||'خطای ارتباط');return j;
}
function root(){return document.getElementById('th-root')}
function notice(s){const x=document.getElementById('th-notice');if(x)x.textContent=s}
function orderOpts(){return orders.map(o=>`<option value="${o.id}">${esc(o.id+' — '+o.customer_name+' — '+o.oven_model)}</option>`).join('')}
function chooseTeams(){const order=orders.find(o=>String(o.id)===document.getElementById('th-order')?.value);
 const t=document.getElementById('th-team');if(!t)return;
 let a=[];if(order?.forge_team)a.push(['forge',order.forge_team]);if(order?.masonry_team)a.push(['masonry',order.masonry_team]);
 t.innerHTML=a.map(([k,n])=>`<option value="${k}:${n}">${teams[k][n-1]}</option>`).join('')||'<option value="">ابتدا تیم را در شناسنامه تنور مشخص کنید</option>';
}
function form(){const n=document.getElementById('th-form');if(!n)return;
 n.innerHTML=`<div class="th-card"><h3>ثبت نفرساعت سفارش و تیم</h3><p class="th-note">مقادیر بر حسب مجموع نفرساعت اعضای تیم هستند؛ نه ساعت تقویمی. در هر سفارش/تیم/روز فقط یک ردیف ثبت می‌شود.</p>
 <div class="th-fields"><label>تنور / مشتری<select id="th-order">${orderOpts()}</select></label><label>تیم مرتبط<select id="th-team"></select></label>
 <label>تاریخ کار (تقویم شمسی)<span id="th-day"></span></label>
 <label>نفرساعت موظفی<input id="th-normal" type="number" step="0.25" min="0" max="96" value="0"></label>
 <label>نفرساعت اضافه‌کاری<input id="th-ot" type="number" step="0.25" min="0" max="96" value="0"></label>
 <label>نفرساعت توقف خارج از اختیار<input id="th-ex" type="number" step="0.25" min="0" max="96" value="0"></label>
 <label>علت اضافه‌کاری<input id="th-why-ot" maxlength="500" placeholder="در صورت ثبت اضافه‌کاری الزامی"></label>
 <label>علت توقف<input id="th-why-ex" maxlength="500" placeholder="در صورت ثبت توقف الزامی"></label>
 <label class="th-wide">توضیحات<input id="th-note" maxlength="1000" placeholder="سفارش فوری، کمبود مصالح، رفع ایراد و ..."></label></div>
 <button id="th-submit" class="th-button" type="button">ثبت برای بررسی و تأیید</button><div id="th-form-msg" role="status"></div></div>`;
 document.getElementById('th-order').addEventListener('change',chooseTeams);chooseTeams();
 if(typeof buildJalaliPicker==='function')buildJalaliPicker('th-day');
 document.getElementById('th-submit').onclick=submit;
}
async function submit(){const msg=document.getElementById('th-form-msg'),btn=document.getElementById('th-submit');
 const pair=(document.getElementById('th-team').value||'').split(':');if(pair.length!==2){msg.textContent='برای سفارش انتخابی تیمی ثبت نشده است';return;}
 const date=typeof readJalaliPicker==='function'?readJalaliPicker('th-day'):'';
 const number=id=>Number(document.getElementById(id).value);
 const v={oven_id:Number(document.getElementById('th-order').value),team_kind:pair[0],team_number:Number(pair[1]),work_date:date,ordinary_person_hours:number('th-normal'),overtime_person_hours:number('th-ot'),excluded_person_hours:number('th-ex'),overtime_reason:document.getElementById('th-why-ot').value.trim(),exclusion_reason:document.getElementById('th-why-ex').value.trim(),note:document.getElementById('th-note').value.trim()};
 if(!date||!v.oven_id){msg.textContent='سفارش و تاریخ معتبر الزامی است';return;}
 if(v.overtime_person_hours>0&&!v.overtime_reason){msg.textContent='دلیل اضافه‌کاری الزامی است';return;}
 btn.disabled=true;try{await api('team-hours','POST',v);msg.textContent='نفرساعت ثبت شد؛ منتظر تأیید مسئول مجاز است';await load();}catch(e){msg.textContent=e.message;}finally{btn.disabled=false;}
}
function renderSummary(data){const area=document.getElementById('th-summary');
 area.innerHTML=`<h3>گزارش نفرساعت تأییدشده به تفکیک تیم</h3><div class="th-scroller"><table><thead><tr><th>تیم</th><th>موظفی</th><th>اضافه‌کاری</th><th>توقف مستند</th><th>نفرساعت قابل ارزیابی</th><th>سهم اضافه‌کاری</th><th>منتظر تأیید</th></tr></thead><tbody>${data.teams.map(t=>`<tr><td>${esc(t.name)}</td><td>${t.approved_entries?fmt(t.ordinary_person_hours):'—'}</td><td>${t.approved_entries?fmt(t.overtime_person_hours):'—'}</td><td>${t.approved_entries?fmt(t.excluded_person_hours):'—'}</td><td>${t.approved_entries?fmt(t.effective_person_hours):'اطلاعات ناکافی'}</td><td>${t.overtime_fraction==null?'—':fmt(100*t.overtime_fraction)+'٪'}</td><td>${fmt(t.pending_entries)}</td></tr>`).join('')}</tbody></table></div><p class="th-note">${esc(data.scope)}</p><p class="th-note">${esc(data.assumptions)}</p>${data.warnings?.length?`<p class="th-warning">${fmt(data.warnings.length)} تیم-روز با نفرساعت غیرعادی: نیازمند بررسی ثبت تکراری یا شیفت متفاوت</p>`:''}`;
}
function renderEntries(){const area=document.getElementById('th-entries');
 area.innerHTML=`<h3>سوابق ثبت و تأیید</h3><div class="th-scroller"><table><thead><tr><th>تاریخ</th><th>سفارش</th><th>تیم</th><th>موظفی</th><th>اضافه‌کاری</th><th>علت</th><th>وضعیت</th><th>بررسی</th></tr></thead><tbody>${entries.map(x=>`<tr><td>${esc(x.work_date)}</td><td>${fmt(x.oven_id)}</td><td>${esc(teams[x.team_kind]?.[x.team_number-1]||'—')}</td><td>${fmt(x.ordinary_person_hours)}</td><td>${fmt(x.overtime_person_hours)}</td><td>${esc(x.overtime_reason||'—')}</td><td>${esc(({pending:'منتظر تأیید',approved:'تأییدشده',rejected:'ردشده'})[x.approval]||x.approval)}</td><td>${x.approval==='pending'?`<button type="button" class="th-review" data-id="${x.id}" data-version="${x.version}" data-decision="approved">تأیید</button> <button type="button" class="th-review" data-id="${x.id}" data-version="${x.version}" data-decision="rejected">رد</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`;
 area.querySelectorAll('.th-review').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('آیا نتیجه بررسی این ردیف ثبت شود؟'))return;b.disabled=true;try{await api(`team-hours/${b.dataset.id}/review`,'POST',{expected_version:Number(b.dataset.version),decision:b.dataset.decision});notice('نتیجه تأیید ثبت شد');await load();}catch(e){notice(e.message);b.disabled=false;}}));
}
async function load(){try{const [a,b,c]=await Promise.all([api('oven-orders'),api('team-hours'),api('team-hours/summary')]);
 orders=a.items||[];entries=b.items||[];renderSummary(c);renderEntries();if(document.getElementById('th-form'))form();notice('آخرین اطلاعات ثبت‌شده از سرور دریافت شد.');}catch(e){notice(e.message);}}
function ensure(){if(document.querySelector('[data-page="team-hours"]'))return;
 const el=document.createElement('section');el.className='page';el.dataset.page=key;
 el.innerHTML=`<div id="th-root" class="th-module"><header><h2>نفرساعت موظفی و اضافه‌کاری تیم‌ها</h2><p>اتصال زمان واقعی به سفارش‌های تنور و تیم‌های مستقل آهنگری و بنایی</p></header><p id="th-notice" role="status"></p><div id="th-form"></div><div class="th-card" id="th-summary"></div><div class="th-card" id="th-entries"></div><p class="th-note">مقادیر این صفحه هیچ تغییر مستقیمی در حقوق، اضافه‌کاری قانونی یا مبلغ کارانه ایجاد نمی‌کنند.</p></div>`;
 document.querySelector('#app-root .main').appendChild(el);
 NAV.push({key,label:'نفرساعت و اضافه‌کاری تیم',icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>'});PAGE_PERMS[key]='view_reports';
 const group=NAV_GROUPS.find(g=>g.label==='عملکرد تولید');if(group)group.keys.push(key);
}
ensure();const original=renderPage;renderPage=function(k){if(k===key){load();return;}return original(k);};
})();
