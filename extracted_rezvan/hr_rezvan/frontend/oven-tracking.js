/* Rezvan oven order tracking (LAN-only, authenticated API). No salary or invented samples. */
(function(){
'use strict';
const pageKey='oven-tracking';
const models=['تنور سنگک متحرک بزرگ','تنور سنگک متحرک متوسط','تنور سنگک متحرک کوچک','تنور سنگک متحرک مینی','تنور سنگک ثابت آپشنال','لارج'];
const statuses={pending:'شروع نشده',working:'در حال اجرا',ready:'آماده تحویل',accepted:'تحویل تأییدشده',correction:'نیازمند اصلاح',finished:'تکمیل‌شده'};
const names={brickwork:'آجرچینی',cementwork:'سیمان‌کاری',insulation:'عایق‌کاری',facade_done:'نماکاری'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],item:null,editable:false};
const field=['customer_name','oven_model','facade_name','forge_team','masonry_team','forge_status','masonry_status','quality_note','notes'];
const dates=['forge_start','forge_finish','handed_over','masonry_start','masonry_finish'];
let csrf='';
const root=()=>document.getElementById('rz-oven-root');
const opt=(values,selected)=>values.map(([v,n])=>`<option value="${esc(v)}" ${String(selected??'')===String(v)?'selected':''}>${esc(n)}</option>`).join('');
const uiStatus=s=>statuses[s]||s||'—';
function input(label,key,x,kind='text'){
 return `<label class="ov-field">${label}<input data-oven-field="${key}" type="${kind}" value="${esc(x?.[key]??'')}" ${key==='customer_name'?'required':''} maxlength="150"></label>`;
}
function select(label,key,x,choices){return `<label class="ov-field">${label}<select data-oven-field="${key}">${opt(choices,x?.[key])}</select></label>`;}
function base(){return {customer_name:'',oven_model:'تنور سنگک متحرک بزرگ',facade_name:'',forge_team:null,masonry_team:null,forge_status:'pending',masonry_status:'pending',brickwork:false,cementwork:false,insulation:false,facade_done:false,forge_start:null,forge_finish:null,handed_over:null,masonry_start:null,masonry_finish:null,quality_note:'',notes:''};}
function showForm(item){state.item=item||null;const x=item||base();const el=document.getElementById('ov-form');
 const t=(team,max,title)=>select(title,team,x,[["","ثبت نشده"],...Array.from({length:max},(_,i)=>[String(i+1),(team==='forge_team'?'آهنگری ':'بنایی ')+(i+1)])]);
 el.innerHTML=`<div class="ov-panel"><h3>${item?'ویرایش سفارش '+item.id:'ثبت شناسنامه تنور جدید'}</h3><p class="ov-help">پنج مدل با نام کاتالوگ درج شده‌اند؛ «لارج» فقط مطابق فایل کارانه برای سازگاری اضافه شده است. عنوان نماکاری را دقیقاً با نام رایج شرکت وارد کنید. کاتالوگ ارسالی فهرست متنی جداگانه‌ای از نام نماها ندارد.</p>
 <div class="ov-fields">${input('نام مشتری مطابق تابلو','customer_name',x)}${select('اندازه / نوع تنور','oven_model',x,models.map(m=>[m,m]))}${input('مدل نماکاری مطابق کاتالوگ','facade_name',x)}${t('forge_team',2,'تیم سازنده شاسی')}${t('masonry_team',3,'تیم بنایی تحویل‌گیرنده')}${select('وضعیت آهنگری','forge_status',x,Object.entries(statuses).filter(([a])=>a!=='finished'))}${select('وضعیت بنایی','masonry_status',x,Object.entries(statuses).filter(([a])=>a!=='ready'&&a!=='accepted'))}</div>
 <h4>تاریخ‌ها — انتخاب با تقویم شمسی</h4><div class="ov-fields">${dates.map((k,i)=>`<div class="ov-field"><span>${['شروع آهنگری','پایان آهنگری','تحویل شاسی','شروع بنایی','پایان بنایی'][i]}</span><div id="oven-cal-${k}" class="ov-cal"></div><button type="button" class="ov-clear" data-clear-date="${k}">پاک کردن تاریخ</button></div>`).join('')}</div>
 <h4>مراحل بنایی</h4><div class="ov-checks">${Object.entries(names).map(([k,n])=>`<label><input type="checkbox" data-oven-check="${k}" ${x[k]?'checked':''}> ${n}</label>`).join('')}</div>
 <div class="ov-fields">${input('گزارش کنترل کیفیت و علت ایراد','quality_note',x)}${input('توضیحات تکمیلی','notes',x)}</div>
 <div class="ov-actions"><button type="button" class="ov-primary" id="ov-save">${item?'ذخیره تغییرات':'ثبت سفارش'}</button><button type="button" id="ov-cancel">بستن فرم</button></div><div id="ov-form-status" role="status"></div></div>`;
 for(const k of dates){buildJalaliPicker('oven-cal-'+k,x[k]||undefined);if(!x[k])document.getElementById('oven-cal-'+k).dataset.empty='1';}
 el.querySelectorAll('[data-clear-date]').forEach(b=>b.addEventListener('click',()=>{let target=document.getElementById('oven-cal-'+b.dataset.clearDate);target.dataset.empty='1';target.querySelector('.rz-date-label').textContent='انتخاب تاریخ';}));
 el.querySelectorAll('.rz-date-button').forEach(b=>b.addEventListener('click',()=>b.closest('.ov-cal').dataset.empty='0'));
 el.querySelector('#ov-save').onclick=save;
 el.querySelector('#ov-cancel').onclick=()=>{el.innerHTML='';state.item=null};
 el.scrollIntoView({block:'start',behavior:'smooth'});
}
async function apiO(method,url,data){
 if(!csrf){const me=await fetch('/api/auth/me',{credentials:'same-origin'});if(!me.ok)throw new Error('نشست کاربری منقضی شده است.');csrf=(await me.json()).csrf_token;}
 const rsp=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data?JSON.stringify(data):undefined});
 const json=await rsp.json().catch(()=>({}));if(!rsp.ok)throw new Error(json.error?.message||'خطا در ارتباط با سرور ('+rsp.status+')');return json;
}
async function save(){
 const el=document.getElementById('ov-form');const body=base();
 for(const key of field){const input=el.querySelector(`[data-oven-field="${key}"]`);body[key]=input.value.trim();}
 for(const k of ['forge_team','masonry_team'])body[k]=body[k]?Number(body[k]):null;
 for(const key of Object.keys(names))body[key]=el.querySelector(`[data-oven-check="${key}"]`).checked;
 for(const k of dates){const target=document.getElementById('oven-cal-'+k);body[k]=target.dataset.empty==='1'?null:readJalaliPicker('oven-cal-'+k);}
 if(!body.customer_name||!body.facade_name){status('نام مشتری و مدل نماکاری الزامی است.');return;}
 const previous=state.item; if(previous)body.expected_version=previous.version;
 el.querySelector('#ov-save').disabled=true;
 try{await apiO(previous?'PUT':'POST','/api/oven-orders'+(previous?'/'+previous.id:''),body);status('سفارش ذخیره شد.');el.innerHTML='';state.item=null;await load();}
 catch(e){status(e.message);}finally{const b=el.querySelector('#ov-save');if(b)b.disabled=false;}
}
function status(msg){const el=document.getElementById('ov-form-status');if(el)el.textContent=msg;else{const msgEl=document.getElementById('ov-summary');if(msgEl)msgEl.textContent=msg;}}
function renderTable(){
 const el=document.getElementById('ov-results');if(!el)return;
 const search=document.getElementById('ov-search')?.value.trim()||'';
 const arr=state.items.filter(x=>[x.customer_name,x.facade_name,x.oven_model,String(x.id)].some(v=>String(v||'').includes(search)));
 el.innerHTML=arr.length?`<div class="ov-scroll"><table><thead><tr><th>شناسه داخلی</th><th>نام مشتری</th><th>مدل تنور</th><th>نماکاری</th><th>آهنگری</th><th>بنایی</th><th>وضعیت مراحل</th><th>عملیات</th></tr></thead><tbody>${arr.map(x=>`<tr><td>${x.id}</td><td>${esc(x.customer_name)}</td><td>${esc(x.oven_model)}</td><td>${esc(x.facade_name)}</td><td>${x.forge_team?'آهنگری '+x.forge_team:'—'}</td><td>${x.masonry_team?'بنایی '+x.masonry_team:'—'}</td><td>${esc(uiStatus(x.forge_status))} / ${esc(uiStatus(x.masonry_status))}</td><td><button type="button" data-edit-oven="${x.id}" class="ov-action">مشاهده / ویرایش</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="ov-empty">سفارشی برای نمایش وجود ندارد.</div>';
 el.querySelectorAll('[data-edit-oven]').forEach(b=>b.onclick=()=>showForm(state.items.find(x=>x.id===Number(b.dataset.editOven))));
}
async function load(){const el=root();if(!el)return;
 try{const data=await apiO('GET','/api/oven-orders');state.items=data.items||[];
 document.getElementById('ov-summary').textContent=`${state.items.length.toLocaleString('fa-IR')} سفارش ثبت‌شده — بدون محاسبه خودکار امتیاز کارانه`;
 renderTable();}catch(e){document.getElementById('ov-summary').textContent=e.message;}
}
function ensurePage(){if(document.querySelector('[data-page="oven-tracking"]'))return;
 const node=document.createElement('section');node.className='page';node.dataset.page=pageKey;node.innerHTML=`<div id="rz-oven-root" class="ov-module"><div class="ov-hero"><div><small>مدیریت تولید کارگاهی تنور رضوان</small><h2>رهگیری شاسی و عملیات بنایی</h2><p>ثبت مشتری، اندازه تنور، نماکاری و تیم‌های مستقل سازنده و تحویل‌گیرنده</p></div><button type="button" class="ov-primary" id="ov-new">+ شناسنامه جدید</button></div><div id="ov-summary" class="ov-summary">در حال دریافت داده‌های سرور...</div><div id="ov-form"></div><div class="ov-toolbar"><h3>سفارش‌های ثبت‌شده</h3><input id="ov-search" placeholder="جست‌وجوی نام مشتری، شناسه یا مدل"></div><div id="ov-results"></div><div class="ov-foot">شماره داخلی توسط پایگاه داده تولید می‌شود و لازم نیست روی تابلوی کارگاه نوشته شود. این ماژول مستقل از محاسبه و پرداخت کارانه است.</div></div>`;
 document.querySelector('#app-root .main').appendChild(node);
 NAV.push({key:pageKey,label:'رهگیری ساخت تنور',icon:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M7 6V3h10v3M4 14h16"/>'});
 PAGE_PERMS[pageKey]='view_reports';
 NAV_GROUPS.splice(NAV_GROUPS.findIndex(g=>g.label==='سیستم'),0,{label:'عملکرد تولید',keys:[pageKey]});
 node.querySelector('#ov-new').onclick=()=>showForm(null);
 node.querySelector('#ov-search').oninput=renderTable;
}
ensurePage();
const oldRender=renderPage;
renderPage=function(key){if(key===pageKey){load();return;}oldRender(key);};
})();
