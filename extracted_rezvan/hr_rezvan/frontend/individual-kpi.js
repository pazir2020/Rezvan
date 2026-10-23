/* Independent KPI for Rezvan's electrical, technical, finance and HR departments.
 * All evaluations remain outside payroll and team-bonus calculations.
 */
(function(){'use strict';
const KEY='individual-kpi', PROFILE_NAMES={electrical:'واحد برق',technical:'واحد فنی',finance:'واحد مالی',hr:'منابع انسانی'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf='',employees=[],profiles={},rows=[];
async function api(url,method='GET',body){
 if(!csrf){const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)throw Error('ابتدا وارد سامانه شوید');csrf=(await r.json()).csrf_token;}
 const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||(typeof d.detail==='string'?d.detail:JSON.stringify(d.detail||'خطای سرور')));return d;
}
function drawShell(){if(document.querySelector('[data-page="'+KEY+'"]'))return;
 const area=document.createElement('section');area.className='page';area.dataset.page=KEY;
 area.innerHTML=`<div class="rk-wrap"><h2>ارزیابی تخصصی کارکنان پشتیبانی</h2>
 <p class="rk-note">فرم‌های مستقل واحد برق، فنی، مالی و منابع انسانی؛ امتیاز صفر تا چهار و وزن‌های قابل تنظیم. این فرم هیچ کارانه‌ای ایجاد نمی‌کند و به حقوق یا فیش متصل نمی‌شود.</p>
 <div class="rk-panel"><h3>اطلاعات ارزیابی</h3><div class="rk-grid"><label>واحد تخصصی<select id="ik-kind">${Object.entries(PROFILE_NAMES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
 <label>ماه شمسی<input id="ik-month" placeholder="1405-08" maxlength="7"></label><label>کارمند<select id="ik-emp"></select></label></div>
 <div id="ik-criteria"></div><label>مستندات و توضیح<textarea id="ik-evidence" maxlength="1500" rows="3" placeholder="نمونه واقعی از عملکرد فرد"></textarea></label>
 <div class="rk-summary">امتیاز ارزیابی: <strong id="ik-score">—</strong> از ۱۰۰</div>
 <button id="ik-save">ثبت پیش‌نویس ارزیابی</button><span id="ik-msg" role="status"></span></div>
 <div class="rk-panel" id="ik-settings" style="display:none"><h3>ویرایش شاخص‌ها و وزن‌ها برای ماه‌های آینده</h3><div id="ik-profile-editor"></div>
 <label>دلیل تغییر<input id="ik-change-note" placeholder="دلیل مصوب تغییر شاخص"></label><button id="ik-profile-save">ذخیره معیارهای جدید</button>
 <p class="rk-note">ارزیابی‌های ثبت‌شده، وزن‌ها و عنوان‌های قبلی خود را حفظ می‌کنند.</p></div>
 <div class="rk-panel"><h3>ارزیابی‌های ثبت‌شده</h3><button class="secondary" id="ik-refresh">بازخوانی</button><div class="rk-table" id="ik-results"></div></div></div>`;
 document.querySelector('#app-root .main').appendChild(area);
 NAV.push({key:KEY,label:'KPI برق، فنی، مالی و HR',icon:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7 12l3 3 7-7"/>'});PAGE_PERMS[KEY]='view_personnel';
 const group=NAV_GROUPS.find(g=>g.label==='عملکرد تولید')||NAV_GROUPS.find(g=>g.label==='توسعه منابع انسانی');
 if(group)group.keys.push(KEY);else NAV_GROUPS.push({label:'ارزیابی عملکرد',keys:[KEY]});
 area.querySelector('#ik-kind').onchange=drawForm;
 area.querySelector('#ik-save').onclick=save;
 area.querySelector('#ik-refresh').onclick=reload;
 area.querySelector('#ik-profile-save').onclick=saveProfile;
}
function formKind(){return document.getElementById('ik-kind').value;}
function draftScore(){
 const cfg=profiles[formKind()];if(!cfg)return 0;
 return cfg.weights.reduce((sum,w,i)=>sum+w*Number(document.getElementById('ik-score-'+i)?.value||0)/4,0);
}
function drawForm(){
 const cfg=profiles[formKind()];if(!cfg)return;
 const html=cfg.labels.map((label,i)=>`<label>${esc(label)} (${cfg.weights[i]} امتیاز)<select id="ik-score-${i}">${[0,1,2,3,4].map(v=>`<option value="${v}" ${v===3?'selected':''}>${v} از ۴</option>`).join('')}</select></label>`).join('');
 document.getElementById('ik-criteria').innerHTML='<div class="rk-five">'+html+'</div>';
 document.getElementById('ik-criteria').querySelectorAll('select').forEach(x=>x.onchange=()=>document.getElementById('ik-score').textContent=Number(draftScore().toFixed(2)).toLocaleString('fa-IR'));
 document.getElementById('ik-score').textContent=Number(draftScore().toFixed(2)).toLocaleString('fa-IR');
 const setting=document.getElementById('ik-settings');setting.style.display=(typeof can==='function'&&can('edit_settings'))?'block':'none';
 document.getElementById('ik-profile-editor').innerHTML=`<div class="rk-grid">${cfg.labels.map((label,i)=>`<label>شاخص ${i+1}<input class="ik-label" value="${esc(label)}"></label><label>وزن ${i+1}<input class="ik-weight" type="number" min="0" max="100" step="1" value="${cfg.weights[i]}"></label>`).join('')}</div>`;
}
async function load(){
 const [p,e]=await Promise.all([api('/api/individual-kpi/profiles'),api('/api/hr-development/employees')]);
 profiles=p.profiles||{};employees=e.items||[];
 document.getElementById('ik-emp').innerHTML=employees.map(x=>`<option value="${esc(x.id)}">${esc(x.full_name)}</option>`).join('');
 try{const t=todayJalali();document.getElementById('ik-month').value=`${t.jy}-${String(t.jm).padStart(2,'0')}`;}catch(_){document.getElementById('ik-month').value='1405-08';}
 drawForm();await reload();
}
async function save(){const m=document.getElementById('ik-msg');try{
 const ratings=[0,1,2,3,4].map(i=>Number(document.getElementById('ik-score-'+i).value));
 const evidence=document.getElementById('ik-evidence').value.trim();
 const out=await api('/api/individual-kpi/evaluations','POST',{employee_id:document.getElementById('ik-emp').value,period_key:document.getElementById('ik-month').value.trim(),profile_kind:formKind(),ratings,evidence});
 m.textContent='ارزیابی پیش‌نویس ثبت شد؛ تأیید مستقل نیاز دارد و هیچ اثری بر حقوق ندارد.';await reload();
 }catch(e){m.textContent=e.message;}}
async function saveProfile(){const m=document.getElementById('ik-msg');try{
 const labels=[...document.querySelectorAll('.ik-label')].map(e=>e.value.trim()),weights=[...document.querySelectorAll('.ik-weight')].map(e=>Number(e.value)),k=formKind(),note=document.getElementById('ik-change-note').value.trim();
 if(!weights.every(Number.isInteger)||weights.reduce((a,b)=>a+b,0)!==100)throw Error('جمع پنج وزن باید ۱۰۰ و عدد صحیح باشند');
 if(labels.some(x=>!x))throw Error('نام هر پنج شاخص الزامی است');
 if(note.length<8)throw Error('دلیل تغییر حداقل ۸ نویسه باشد');
 if(!confirm('وزن‌ها فقط برای ارزیابی‌های آینده تغییر کنند؟'))return;
 await api('/api/individual-kpi/profiles','PUT',{profile_kind:k,labels,weights,expected_version:profiles[k].version,note});
 m.textContent='معیارهای آینده ذخیره شدند.';const p=await api('/api/individual-kpi/profiles');profiles=p.profiles;drawForm();
 }catch(e){m.textContent=e.message;}}
async function decision(id,v,what){
 const note=prompt('دلیل تصمیم درباره ارزیابی (حداقل ۸ نویسه)');if(note===null)return;
 try{await api('/api/individual-kpi/evaluations/'+id+'/review','POST',{decision:what,expected_version:v,note:note.trim()});await reload();}
 catch(e){alert(e.message);}
}
async function reload(){
 const b=document.getElementById('ik-results');b.textContent='در حال دریافت...';
 try{rows=(await api('/api/individual-kpi/evaluations')).items||[];
 b.innerHTML=`<table><thead><tr><th>کارمند</th><th>واحد</th><th>ماه</th><th>امتیاز</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(PROFILE_NAMES[r.profile_kind])}</td><td>${esc(r.period_key)}</td><td>${Number(r.score).toLocaleString('fa-IR',{maximumFractionDigits:2})}</td><td>${esc(r.status)}</td><td>${r.status==='draft'&&typeof can==='function'&&can('approve_records')?`<button data-id="${r.id}" data-ver="${r.version}" data-decision="approved">تأیید</button><button class="secondary" data-id="${r.id}" data-ver="${r.version}" data-decision="rejected">رد</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">هنوز ارزیابی ثبت نشده است.</td></tr>'}</tbody></table>`;
 b.querySelectorAll('[data-decision]').forEach(button=>button.onclick=()=>decision(Number(button.dataset.id),Number(button.dataset.ver),button.dataset.decision));
 }catch(e){b.textContent=e.message;}
}
drawShell();const old=renderPage;renderPage=function(key){if(key===KEY){load().catch(e=>document.getElementById('ik-msg').textContent=e.message);return;}return old(key);};
})();
