// Runs frontend/hr-api-shim.js in a Node vm with minimal stubs and a fake fetch. Input (stdin JSON): {bootstrap, me, steps:[js strings]}
// Output (stdout JSON): list of POST /api/sync/push bodies produced by each step. Used by test_shim_contract.py.
const vm = require('vm'), fs = require('fs'), path = require('path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const calls = [];
const el = () => new Proxy(function(){}, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? {add(){}, remove(){}} : el(), set: () => true, apply: () => el() });
const ctx = { console, JSON, Date, Promise, setTimeout, clearTimeout, setInterval: () => 0, FormData: class { append(){} }, location: { reload(){} },
  alert: m => calls.push({ alert: String(m) }), confirm: () => true, prompt: () => '',
  document: { getElementById: () => el(), querySelector: () => null, addEventListener(){}, body: { insertAdjacentHTML(){} }, visibilityState: 'visible' },
  addEventListener(){}, fetch: async (url, opt) => {
    const method = (opt && opt.method) || 'GET';
    const body = opt && opt.body ? JSON.parse(opt.body) : undefined;
    if (url === '/api/auth/me') return resp(200, Object.assign({ csrf_token: 'tok' }, input.me));
    if (url === '/api/bootstrap') return resp(200, input.bootstrap);
    if (url === '/api/sync/push') {
      calls.push({ push: body });
      if (input.failPush) return resp(input.failPush.status, { error: input.failPush.error });
      return resp(200, { results: body.ops.map(o => ({ c: o.c, id: o.id, version: o.op === 'create' ? 1 : (o.v || 0) + 1 })) });
    }
    return resp(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  } };
function resp(status, json) { return { ok: status < 400, status, json: async () => json }; }
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(`
let DATA = {}, WRITES_BLOCKED = true, dirHandle = null, currentPage = 'dash', FILE_SCAN = null, profileEmpId = null, editingUserId = null, CURRENT_USER = null;
function normalizeData(d){ return d; } function migrateData(){} function migrateLegacyContracts(){}
function hideStorageWarning(){} function noteSaved(){} function showStorageWarning(){} function setCurrentUser(u){ CURRENT_USER = u; }
function applyPermsToDOM(){} function renderUserChip(){} function bootData(){} function goPage(){} function startApp(){} function toFaDigits(x){ return String(x); }
var employees = [];
`, ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'hr-api-shim.js'), 'utf8'), ctx);
(async () => {
  await ctx.window.checkAccessLock();
  const out = [];
  for (const step of input.steps) {
    const before = calls.length;
    await vm.runInContext('(async()=>{' + step + '})()', ctx);
    await new Promise(r => setTimeout(r, 120));
    out.push(calls.slice(before));
  }
  process.stdout.write(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
