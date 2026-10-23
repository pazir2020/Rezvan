/* HR Rezvan — server mode adapter for dashboard-41.html.
   Replaces ONLY the storage / login / users / files layer. Screens, forms, tables and all HR/payroll calculations are the original code.
   How it works: the original code keeps mutating the global DATA and calls saveToStorage(). This adapter loads DATA from the server
   (already filtered by the user's permissions/unit/sensitivity), remembers a baseline, and on every save sends only the CHANGED records
   (create / update with changed fields / delete + record version). The server re-checks everything (permission, unit, locks, versions).
   STATUS: UNTESTED in a browser against a running server (none was available while building). */
(function(){
'use strict';
var COLLS = ['employees','contracts','payTerms','attendance','overtime','disciplinary','sickLeaves','incidents','laborActions','eidiRecords','settlements',
  'probations','insuranceMonths','payrollPayments','loans','benefits','trainings','evaluations','candidates','jobHistory','empExtra','monthlyFinancials',
  'hiringScenarios','turnoverCosts','leaves','payrollAdjustments','documents','payrollLocks'];
var SETTING_PERMS = {economicAssumptions:'edit_economic_assumptions', lockDisabled:'manage_users', legacyLockMigrated:'manage_users'};
var lastErr = {sig:'', at:0};
var CSRF = null, ME = null, VER = {}, BASE = {}, dirty = false, pushing = false, retryTimer = null, lastEdit = 0, ready = false;
var $ = function(id){ return document.getElementById(id); };
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function same(a,b){ return JSON.stringify(a) === JSON.stringify(b); }
function msgFor(e){ return (e && e.message) ? e.message : 'خطای ارتباط با سرور'; }

/* ---------------- HTTP ---------------- */
function ApiErr(status, body){ var er = (body && body.error) || {}; var x = new Error(er.message || ('HTTP '+status)); x.status = status; x.code = er.code; x.reason = er.reason; x.details = er.details; return x; }
async function api(method, path, body, form){
  var h = {}; if(CSRF && method !== 'GET') h['X-CSRF-Token'] = CSRF;
  var opt = {method: method, credentials: 'same-origin', headers: h};
  if(form){ opt.body = form; } else if(body !== undefined){ h['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  var r; try{ r = await fetch(path, opt); }catch(e){ var n = new Error('ارتباط با سرور برقرار نیست'); n.network = true; throw n; }
  var j = null; try{ j = await r.json(); }catch(e){}
  if(!r.ok) throw ApiErr(r.status, j);
  return j;
}

/* ---------------- load / baseline ---------------- */
function takeBaseline(){
  BASE = {};
  COLLS.forEach(function(c){ var m = {}; (DATA[c]||[]).forEach(function(r){ if(r && r.id) m[r.id] = clone(r); }); BASE[c] = m; });
  BASE.settings = clone(DATA.settings || {}); BASE.alertStates = clone(DATA.alertStates || {});
  var t = {}; (DATA.deletedRecords||[]).forEach(function(r){ t[r.id] = true; }); BASE.deletedRecords = t;
}
async function loadFromServer(){
  var b = await api('GET', '/api/bootstrap');
  ME = b.me; VER = b.versions || {};
  var d = b.data; d.users = d.users || []; d.auditLog = d.auditLog || [];
  DATA = normalizeData(d);
  try{ migrateData(DATA); }catch(e){ console.warn('migrateData', e); }
  try{ migrateLegacyContracts(); }catch(e){}
  if(typeof window.hrLanRestoreReports==='function') window.hrLanRestoreReports();
  takeBaseline();                                   // client-side defaults applied above are NOT pushed
  WRITES_BLOCKED = false;
}

/* ---------------- diff ---------------- */
function buildOps(){
  var ops = [], snap = {};
  COLLS.forEach(function(c){
    var base = BASE[c] || {}, cur = {};
    (DATA[c]||[]).forEach(function(r){ if(r && r.id) cur[r.id] = r; });
    Object.keys(cur).forEach(function(id){
      var r = cur[id];
      if(!(id in base)){ if(c === 'documents') return; ops.push({c:c, op:'create', id:id, data:clone(r)}); (snap[c] = snap[c] || {})[id] = clone(r); return; }
      if(same(r, base[id])) return;
      var set = {}, unset = [], b = base[id];
      Object.keys(r).forEach(function(k){ if(k !== 'id' && !same(r[k], b[k])) set[k] = r[k]; });
      Object.keys(b).forEach(function(k){ if(k !== 'id' && !(k in r)) unset.push(k); });
      if(!Object.keys(set).length && !unset.length) return;
      ops.push({c:c, op:'update', id:id, v:(VER[c]||{})[id], set:clone(set), unset:unset}); (snap[c] = snap[c] || {})[id] = clone(r);
    });
    Object.keys(base).forEach(function(id){ if(!(id in cur)) ops.push({c:c, op:'delete', id:id, v:(VER[c]||{})[id]}); });
  });
  ['settings','alertStates'].forEach(function(ns){
    var base = BASE[ns] || {}, cur = DATA[ns] || {};
    Object.keys(cur).forEach(function(k){
      if(same(cur[k], base[k])) return;
      var empty = cur[k] === null || cur[k] === '' || (typeof cur[k] === 'object' && Object.keys(cur[k]).length === 0);
      if(!(k in base) && empty){ base[k] = clone(cur[k]); return; }                       // render-time default created by the original code
      if(ns === 'settings' && !window.can(SETTING_PERMS[k] || 'edit_settings')){ base[k] = clone(cur[k]); console.warn('setting not pushed (no permission):', k); return; }
      if(ns === 'alertStates' && !window.can('manage_alerts')){ base[k] = clone(cur[k]); return; }
      ops.push({c:ns, op:'put', id:k, v:(VER[ns]||{})[k], value:clone(cur[k])});
    });
    Object.keys(base).forEach(function(k){ if(!(k in cur)) ops.push({c:ns, op:'delete', id:k}); });
  });
  var trash = BASE.deletedRecords || {}, seen = {};
  (DATA.deletedRecords||[]).forEach(function(t){ seen[t.id] = true; if(!trash[t.id]) ops.push({c:'deletedRecords', op:'create', id:t.id, data:clone(t)}); });
  Object.keys(trash).forEach(function(id){ if(!seen[id]) ops.push({c:'deletedRecords', op:'delete', id:id}); });
  return {ops: ops, snap: snap};
}

/* ---------------- push ---------------- */
function setStatus(kind, text){
  var el = $('hdr-folder-status'); if(el) el.innerHTML = '<span class="status-dot '+kind+'"></span>'+text;
}
async function pushNow(){
  if(pushing){ dirty = true; return; }
  pushing = true; dirty = false;
  try{
    var b = buildOps();
    if(!b.ops.length){ return true; }
    setStatus('warn', 'در حال ذخیره روی سرور…');
    var res = await api('POST', '/api/sync/push', {ops: b.ops});
    b.ops.forEach(function(op, i){
      var r = (res.results||[])[i] || {};
      if(op.c === 'settings' || op.c === 'alertStates'){
        if(op.op === 'put'){ BASE[op.c][op.id] = clone(op.value); (VER[op.c] = VER[op.c] || {})[op.id] = r.version; } else { delete BASE[op.c][op.id]; }
      } else if(op.c === 'deletedRecords'){
        if(op.op === 'create'){ var item = (DATA.deletedRecords||[]).find(function(t){ return t.id === op.id; });
          var sid = 'del_' + op.data.coll + '_' + ((op.data.rec||{}).id); if(item) item.id = sid; BASE.deletedRecords[sid] = true; }
        else delete BASE.deletedRecords[op.id];
      } else if(op.op === 'delete'){ delete BASE[op.c][op.id]; if(VER[op.c]) delete VER[op.c][op.id]; }
      else { BASE[op.c][op.id] = b.snap[op.c][op.id]; (VER[op.c] = VER[op.c] || {})[op.id] = r.version; }
    });
    hideStorageWarning(); noteSaved(); setStatus('ok', 'سرور: متصل');
    return true;
  }catch(e){
    if(e.network){ showStorageWarning('ارتباط با سرور قطع است — تغییرات هنوز ذخیره نشده و دوباره تلاش می‌شود.'); setStatus('bad', 'سرور: قطع'); dirty = true;
      clearTimeout(retryTimer); retryTimer = setTimeout(function(){ if(dirty) pushNow(); }, 5000); }
    else if(e.status === 401){ alert('نشست شما منقضی شده است. دوباره وارد شوید.'); location.reload(); }
    else {
      var where = e.details && e.details.collection ? ' (' + e.details.collection + ')' : '';
      var sig = (e.code || '') + '|' + (e.reason || '') + '|' + where + '|' + ((e.details && e.details.id) || '');
      if(!(sig === lastErr.sig && Date.now() - lastErr.at < 300000)) alert('تغییر ذخیره نشد' + where + ':\n' + msgFor(e) + '\n\nداده‌ها از سرور دوباره بارگذاری می‌شوند.');
      lastErr = {sig: sig, at: Date.now()};
      dirty = false; await refreshView();
    }
    return false;
  }finally{ pushing = false; if(dirty && !retryTimer){ setTimeout(pushNow, 50); } }
}
var chain = Promise.resolve();
window.writeToFolder = function(){ lastEdit = Date.now(); chain = chain.then(pushNow, pushNow); return chain; };
window.saveToStorage = function(){ return window.writeToFolder(); };

async function refreshView(){
  await loadFromServer();
  try{ bootData(); applyPermsToDOM(); renderUserChip(); goPage(currentPage); }catch(e){ console.warn('refresh view', e); }
}

/* ---------------- permissions, login, logout ---------------- */
window.can = function(perm){ if(!perm) return true; if(!ME) return false; var p = ME.permissions || []; return p.indexOf('*') >= 0 || p.indexOf(perm) >= 0; };
window.lockRequired = function(){ return true; };
function applyMe(){ if(ME){ setCurrentUser({id:ME.id, username:ME.username, name:ME.name, role:ME.role, perms_add:[], perms_remove:[]}); } }
window.showLockGate = function(){
  return new Promise(function(resolve){
    var gate = $('lock-gate'); gate.style.display = 'flex';
    var uEl = $('lock-username'), pEl = $('lock-password'), err = $('lock-error'), hint = $('lock-hint'), btn = $('lock-submit');
    err.style.display = 'none'; pEl.value = ''; btn.disabled = false;
    if(hint) hint.textContent = '';
    var go = async function(){
      btn.disabled = true; err.style.display = 'none';
      try{
        var r = await api('POST', '/api/auth/login', {username: uEl.value.trim(), password: pEl.value});
        CSRF = r.csrf_token; await loadFromServer(); applyMe(); gate.style.display = 'none'; resolve(CURRENT_USER);
      }catch(e){
        err.textContent = e.status === 429 ? 'تلاش‌های ناموفق زیاد بود؛ کمی بعد دوباره تلاش کنید.' : msgFor(e);
        err.style.display = 'block'; btn.disabled = false;
      }
    };
    btn.onclick = go; pEl.onkeydown = function(ev){ if(ev.key === 'Enter') go(); }; uEl.onkeydown = function(ev){ if(ev.key === 'Enter') pEl.focus(); };
  });
};
window.checkAccessLock = async function(){
  try{ var me = await api('GET', '/api/auth/me'); CSRF = me.csrf_token; await loadFromServer(); applyMe(); }
  catch(e){ if(e.status === 401) await window.showLockGate(); else throw e; }
};
window.logout = async function(){
  try{ await window.writeToFolder(); await api('POST', '/api/auth/logout', {}); }catch(e){}
  location.reload();
};

/* ---------------- storage layer replaced ---------------- */
window.readFolderData = async function(){};
window.dailySnapshot = async function(){};
window.saveSafetyCopy = async function(){ return false; };
window.refreshFolderStatusUI = function(){ var el = $('folder-status'); if(el) el.textContent = '🟢 داده‌ها روی سرور شرکت ذخیره می‌شوند'; var b = $('folder-btn'); if(b) b.style.display = 'none'; window.updateHeaderFolderStatus(); };
window.updateHeaderFolderStatus = function(){ setStatus(ready ? 'ok' : 'warn', ready ? 'سرور: متصل' : 'در حال اتصال…'); };
window.importBackup = function(evt){ if(evt && evt.target) evt.target.value = ''; alert('بازیابی پشتیبان از داخل برنامه غیرفعال است.\nبازیابی فقط توسط مدیر سرور با اسکریپت restore انجام می‌شود (README).'); };
window.resetAll = function(){ alert('پاک‌کردن کل داده‌ها از داخل برنامه غیرفعال است. این کار فقط توسط مدیر سرور انجام می‌شود.'); };
window.removeAccessPassword = window.enableAccessLock = function(){ alert('قفل ورود در حالت سرور همیشه فعال است و از داخل برنامه قابل غیرفعال‌سازی نیست.'); };
window.updateLockStatus = function(){ var el = $('lock-status'); if(el) el.textContent = '🔒 ورود با نام کاربری و رمز عبور سمت سرور الزامی است — ' + toFaDigits((DATA.users||[]).length) + ' کاربر'; };

/* ---------------- users (server-side hashing, validation, last-admin rule) ---------------- */
window.setAccessPassword = async function(){
  var cur = ($('cur-password')||{}).value || '', pw = $('new-password').value, pw2 = $('new-password-confirm').value;
  if(!pw || pw.length < 6){ alert('رمز باید حداقل ۶ کاراکتر باشد'); return; }
  if(pw !== pw2){ alert('تکرار رمز مطابقت ندارد'); return; }
  try{ await api('POST', '/api/auth/change-password', {current_password: cur, new_password: pw}); alert('رمز شما تغییر کرد. در سایر دستگاه‌ها باید دوباره وارد شوید.'); ['cur-password','new-password','new-password-confirm'].forEach(function(i){ if($(i)) $(i).value=''; }); }
  catch(e){ alert(msgFor(e)); }
};
window.saveUserModal = async function(){
  var name = $('user-name').value.trim(), username = $('user-username').value.trim(), role = $('user-role').value, active = $('user-active').checked;
  var pw = $('user-pass').value, pw2 = $('user-pass2').value;
  if(!name){ alert('نام کاربر الزامی است'); return; }
  if(pw !== pw2){ alert('تکرار رمز مطابقت ندارد'); return; }
  try{
    if(editingUserId){ await api('PATCH', '/api/users/' + editingUserId, {name: name, role: role, active: active, password: pw || undefined}); }
    else { if(!/^[A-Za-z0-9_.-]{3,30}$/.test(username)){ alert('نام کاربری باید ۳ تا ۳۰ کاراکتر انگلیسی/عدد (بدون فاصله) باشد'); return; }
      await api('POST', '/api/users', {username: username, name: name, role: role, password: pw}); }
    closeUserModal(); await refreshView(); renderUsersTable(); updateLockStatus();
  }catch(e){ alert(msgFor(e)); }
};
window.deleteUser = async function(id){
  var u = (DATA.users||[]).find(function(x){ return x.id === id; }); if(!u) return;
  if(CURRENT_USER && CURRENT_USER.id === id){ alert('نمی‌توانید کاربر واردشده را حذف کنید.'); return; }
  if(!confirm('کاربر «' + u.name + '» حذف شود؟')) return;
  try{ await api('DELETE', '/api/users/' + id); await refreshView(); renderUsersTable(); updateLockStatus(); }catch(e){ alert(msgFor(e)); }
};

/* ---------------- documents and photos (files live on the server disk) ---------------- */
async function upload(emp, category, file, extra){
  var f = new FormData(); f.append('employee_id', emp.id); f.append('category', category); f.append('file', file);
  Object.keys(extra||{}).forEach(function(k){ f.append(k, extra[k] === null ? '' : extra[k]); });
  var r = await api('POST', '/api/documents/upload', undefined, f);
  var rec = r.record; (DATA.documents = DATA.documents || []).push(rec);
  BASE.documents[rec.id] = clone(rec); (VER.documents = VER.documents || {})[rec.id] = r.version;     // already on the server: not re-sent
  return rec;
}
window.hrAttach = async function(emp, category, file){
  var rec = await upload(emp, category, file, {title: file.name, confidential: ['قرارداد','استعلاجی'].indexOf(category) >= 0, source: 'روابط کار'});
  return rec.relativePath;
};
window.addDocumentFile = async function(){
  var e = employees.find(function(x){ return x.id === profileEmpId; }); if(!e) return;
  var title = $('doc-title').value.trim(), category = $('doc-category').value, file = $('doc-file').files[0];
  var expiry = $('doc-expiry-none').checked ? null : readJalaliPicker('doc-expiry-jalali'), conf = $('doc-confidential').checked;
  if(!title || !file){ alert('عنوان و فایل الزامی است'); return; }
  try{ await upload(e, category, file, {title: title, expiry_date: expiry, confidential: conf, source: 'upload'}); closeDocModal(); renderProfile(); FILE_SCAN = null; scanMissingFiles().then(refreshAlertViews); }
  catch(err){ alert('خطا در ذخیره فایل: ' + msgFor(err)); }
};
window.openDocumentById = function(id){ window.open('/api/documents/' + encodeURIComponent(id) + '/download', '_blank'); };
window.deleteDocumentFileOnDisk = async function(doc){ try{ await api('DELETE', '/api/documents/' + encodeURIComponent(doc.id) + '/file'); return true; }catch(e){ return false; } };
window.uploadPhoto = async function(evt){
  var e = employees.find(function(x){ return x.id === profileEmpId; }); if(!e) return;
  var file = evt.target.files[0]; if(!file) return;
  try{ var f = new FormData(); f.append('file', file); await api('POST', '/api/employees/' + encodeURIComponent(e.id) + '/photo', undefined, f);
    await refreshView(); FILE_SCAN = null; scanMissingFiles().then(refreshAlertViews); renderProfile(); }
  catch(err){ alert('خطا در ذخیره عکس: ' + msgFor(err)); }
  evt.target.value = '';
};
window.loadProfilePhoto = async function(e){
  var box = $('profile-avatar'); if(!box || !e.photo_path) return;
  box.innerHTML = '<img src="/api/employees/' + encodeURIComponent(e.id) + '/photo?t=' + Date.now() + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()">';
};
window.scanMissingFiles = async function(){
  try{
    var r = await api('GET', '/api/documents/scan'), docs = {}; (DATA.documents||[]).forEach(function(d){ docs[d.id] = d; });
    var missing = (r.missing||[]).map(function(m){ var d = docs[m.id];
      return m.kind === 'photo' ? {key:'photo:'+m.id, empId:m.employee_id, title:'عکس پرسنلی', path:m.relativePath, kind:'photo', category:'عکس'}
        : {key:'doc:'+m.id, empId:m.employee_id, title:d ? (d.title||d.fileName) : m.relativePath, path:m.relativePath, kind:'doc', category:d ? d.category : ''}; });
    FILE_SCAN = {at: Date.now(), missing: missing}; return missing;
  }catch(e){ FILE_SCAN = null; }
};
window.renderFileScanStatus = (function(orig){ return function(){ var el = $('alert-file-scan'); if(!el) return; if(!FILE_SCAN){ el.textContent = 'در حال بررسی فایل‌های واقعی...'; return; }
  el.innerHTML = 'بررسی فایل‌های واقعی: ' + toFaDigits(FILE_SCAN.missing.length) + ' مورد پیدا نشد. <a href="javascript:void(0)" onclick="rescanFiles()" style="color:var(--accent);font-weight:700;text-decoration:none;">بررسی مجدد</a>'; }; })();
window.checkDocumentsExistence = async function(e){
  if(!FILE_SCAN) await window.scanMissingFiles(); var miss = {}; ((FILE_SCAN||{}).missing||[]).forEach(function(m){ miss[m.key] = true; });
  (DATA.documents||[]).filter(function(d){ return d.employee_id === e.id; }).forEach(function(d){ var cell = $('doc-status-' + d.id); if(!cell) return;
    cell.innerHTML = miss['doc:' + d.id] ? '<span style="color:var(--rose);font-weight:700;">⚠️ پیدا نشد</span>' : '<span style="color:var(--teal);font-weight:700;">✓ موجود</span>'; });
};

/* ---------------- multi-user freshness ---------------- */
function modalOpen(){ return !!document.querySelector('.modal-overlay.open'); }
setInterval(function(){
  if(!ready || pushing || dirty || modalOpen() || document.visibilityState !== 'visible' || Date.now() - lastEdit < 45000) return;
  api('GET', '/api/bootstrap').then(function(b){ if(!same(b.versions, VER)){ return refreshView(); } }).catch(function(){});
}, 60000);
window.addEventListener('beforeunload', function(ev){ if(dirty || pushing){ ev.preventDefault(); ev.returnValue = ''; } });

/* ---------------- boot ---------------- */
window.__hrServerBoot = async function(){
  try{
    var g = $('connect-gate'); if(g) g.style.display = 'none';
    dirHandle = {server: true};
    await startApp();
    ready = true; window.updateHeaderFolderStatus();
  }catch(e){ document.body.insertAdjacentHTML('afterbegin', '<div style="padding:20px;color:#b00;font:16px sans-serif;direction:rtl">خطا در راه‌اندازی: ' + msgFor(e) + '</div>'); }
};
})();
