// An in-memory stand-in for everything Apps Script gives TermSync, so the REAL
// config.gs + code.gs can be run on a laptop with `npm test` — no Google account,
// no network, no deployment.
//
//   • Google Calendar — answers BOTH write paths the code uses: the Calendar v3
//     REST API (via UrlFetchApp) and CalendarApp (the slow fallback).
//   • The tool's own spreadsheet, the office's timetable sheet (openById), and the
//     published quiz / mid-term tabs (UrlFetchApp).
//   • One Apps Script EXECUTION per exec() call: config.gs + code.gs are loaded into
//     a fresh context every time, exactly as Apps Script reloads the script per run,
//     so nothing memoised in one run leaks into the next. Script properties, sheets,
//     calendars, caches and triggers persist between runs, per user where Google
//     keeps them per user.
process.env.TZ = 'Asia/Kolkata';   // Apps Script runs in the script time zone
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');

const APP = path.join(__dirname, '..', 'app');
const FIX = path.join(__dirname, 'fixtures');

function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => (n < 10 ? '0' : '') + n;
function formatDate(d, _tz, f) {
  const H = d.getHours(), h12 = (H % 12) || 12;
  return f.replace(/yyyy|MMM|MM|dd|EEE|HH|hh|mm|ss|d|h|a/g, t => ({
    yyyy: d.getFullYear(), MMM: MON[d.getMonth()], MM: pad(d.getMonth() + 1), dd: pad(d.getDate()),
    EEE: DOW[d.getDay()], HH: pad(H), hh: pad(h12), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
    d: d.getDate(), h: h12, a: H < 12 ? 'AM' : 'PM' })[t]);
}
const sha256 = s => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => b > 127 ? b - 256 : b);

function makeSheet(name) {
  const g = []; let hidden = false; const protections = [];
  const fit = (r, c) => { while (g.length < r) g.push([]); for (const row of g) while (row.length < c) row.push(''); };
  const api = {
    getName: () => name,
    getLastRow: () => { let last = 0; g.forEach((row, i) => { if (row.some(v => v !== '' && v != null)) last = i + 1; }); return last; },
    getLastColumn: () => g.reduce((m, row) => Math.max(m, row.length), 0),
    getMaxRows: () => Math.max(g.length, 1000),
    getRange(a, b, nr, nc) {
      let r0, c0, rows, cols;
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)$/);
        c0 = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0); r0 = +m[2]; rows = 1; cols = 1;
      } else { r0 = a; c0 = b; rows = nr === undefined ? 1 : nr; cols = nc === undefined ? 1 : nc; }
      return {
        setValues(v) { fit(r0 + rows - 1, c0 + cols - 1);
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) g[r0 - 1 + i][c0 - 1 + j] = (v[i] && v[i][j] !== undefined) ? v[i][j] : '';
          return this; },
        getValues() { fit(r0 + rows - 1, c0 + cols - 1); const o = [];
          for (let i = 0; i < rows; i++) { const rr = []; for (let j = 0; j < cols; j++) rr.push(g[r0 - 1 + i][c0 - 1 + j]); o.push(rr); }
          return o; },
        getValue() { fit(r0, c0); return g[r0 - 1][c0 - 1]; },
        getDisplayValues() {
          return this.getValues().map(r => r.map(v => v instanceof Date ? `${v.getDate()}-${MON[v.getMonth()]}-${v.getFullYear()}` : String(v == null ? '' : v)));
        },
        setValue(v) { fit(r0, c0); g[r0 - 1][c0 - 1] = v; return this; },
        clearContent() { for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (g[r0 - 1 + i]) g[r0 - 1 + i][c0 - 1 + j] = ''; return this; },
        setNumberFormat() { return this; }, setFontWeight() { return this; }, setNote() { return this; },
        clearNote() { return this; }, setBackground() { return this; }
      };
    },
    getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); },
    setFrozenRows() { return api; }, hideSheet() { hidden = true; return api; }, showSheet() { hidden = false; return api; },
    isSheetHidden: () => hidden, activate() { return api; },
    appendRow(r) { g.push(r.slice()); return api; },
    setConditionalFormatRules() {}, autoResizeColumns() {}, setColumnWidth() {},
    getProtections: () => protections,
    protect() { const p = { setDescription() {}, setWarningOnly() {}, getEditors: () => [], removeEditors() {},
      addEditors() {}, canDomainEdit: () => false, setDomainEdit() {} }; protections.push(p); return p; },
    _grid: g
  };
  return api;
}

// opts: { config: <config.gs text>, owner: <email>, mirror, quiz, midterm }
function createWorld(opts) {
  opts = opts || {};
  const W = {};
  W.config = opts.config !== undefined ? opts.config : fs.readFileSync(path.join(FIX, 'test.config.gs'), 'utf8');
  W.code = fs.readFileSync(path.join(APP, 'code.gs'), 'utf8');
  W.owner = opts.owner || 'mba26901@iimsirmaur.ac.in';
  W.mirror = parseCsv(opts.mirror || fs.readFileSync(path.join(FIX, 'mirror.csv'), 'utf8')).filter(r => r.length > 1);
  // What each published tab answers right now: CSV text, an HTTP status, or null (404).
  W.tabs = {
    quiz: opts.quiz !== undefined ? opts.quiz : fs.readFileSync(path.join(FIX, 'quiz.csv'), 'utf8'),
    midterm: opts.midterm !== undefined ? opts.midterm : fs.readFileSync(path.join(FIX, 'midterm.csv'), 'utf8')
  };
  W.fetched = [];   // every URL the code asked for, for "did it call out?" checks
  // A published elective-allotment document, if a test sets one:
  // { summary: [[title, code, students, sections]], tabs: { CODE: [[roll, name, email, section]] } }.
  // Served the way Google serves a published spreadsheet: a pubhtml page listing
  // each tab's gid, and one CSV per tab.
  W.electives = opts.electives || null;

  const SS = { _s: {}, getSheetByName(n) { return this._s[n] || null; }, insertSheet(n) { return (this._s[n] = makeSheet(n)); },
    getSheets() { return Object.values(this._s); }, setActiveSheet() {},
    getOwner: () => ({ getEmail: () => W.owner }), getEditors: () => [{ getEmail: () => W.owner }] };
  W.SS = SS;
  const MIRROR_SS = {
    getSheetByName(n) { if (n !== 'Timetable') return null;
      const s = makeSheet('Timetable'); s.getRange(1, 1, W.mirror.length, W.mirror[0].length).setValues(W.mirror); return s; },
    getSheets() { return [this.getSheetByName('Timetable')]; }
  };

  const CAL = { cals: {}, seq: 0 };
  W.CAL = CAL;
  const calendarsOf = email => Object.values(CAL.cals).filter(c => c.owner === email && !c.deleted);
  W.newCal = (email, name) => { const id = 'cal' + (++CAL.seq) + '@group.calendar.google.com';
    CAL.cals[id] = { id, name, owner: email, events: {}, deleted: false }; return CAL.cals[id]; };
  const evMatches = (ev, q) => { if (!q) return true; q = q.toLowerCase();
    return [ev.summary, ev.description, ev.location].some(x => String(x || '').toLowerCase().indexOf(q) !== -1); };
  const inWindow = (ev, tMin, tMax) => Date.parse(ev.start.dateTime) < tMax && Date.parse(ev.end.dateTime) > tMin;
  function calAppFor(email) {
    const wrapEvent = (cal, ev) => ({
      getTitle: () => ev.summary, getDescription: () => ev.description || '', getLocation: () => ev.location || '',
      getStartTime: () => new Date(ev.start.dateTime), getEndTime: () => new Date(ev.end.dateTime),
      deleteEvent() { delete cal.events[ev.id]; },
      setTitle(t) { ev.summary = t; }, setColor(c) { ev.colorId = 'enum:' + c; },
      removeAllReminders() { ev.reminders = { useDefault: false, overrides: [] }; },
      addPopupReminder(m) { ev.reminders.overrides.push({ method: 'popup', minutes: m }); }
    });
    const wrapCal = cal => ({
      getId: () => cal.id, getName: () => cal.name, isOwnedByMe: () => true,
      deleteCalendar() { cal.deleted = true; },
      getEvents(a, b, o) { const q = o && o.search;
        return Object.values(cal.events).filter(ev => inWindow(ev, a.getTime(), b.getTime()) && evMatches(ev, q)).map(ev => wrapEvent(cal, ev)); },
      createEvent(title, s, e, o) { const id = 'ev' + (++CAL.seq);
        const ev = cal.events[id] = { id, summary: title, description: o.description, location: o.location,
          start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() }, reminders: { useDefault: true, overrides: [] } };
        return wrapEvent(cal, ev); }
    });
    const EventColor = {};
    ['CYAN', 'GREEN', 'YELLOW', 'ORANGE', 'MAUVE', 'PALE_BLUE', 'PALE_GREEN', 'PALE_RED', 'RED', 'BLUE', 'GRAY'].forEach(k => EventColor[k] = k);
    return { EventColor,
      getCalendarsByName: n => calendarsOf(email).filter(c => c.name === n).map(wrapCal),
      createCalendar: n => wrapCal(W.newCal(email, n)) };
  }
  const R = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body || {})) });
  function calendarRest(req) {
    const m = req.url.match(/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^?]+))?(?:\?(.*))?$/);
    const cal = CAL.cals[decodeURIComponent(m[1])];
    if (!cal || cal.deleted) return R(404, { error: { message: 'Not Found' } });
    const method = (req.method || 'get').toLowerCase();
    const evId = m[2] ? decodeURIComponent(m[2]) : null;
    if (method === 'get') {
      const p = new URLSearchParams(m[3] || '');
      const tMin = Date.parse(p.get('timeMin')), tMax = Date.parse(p.get('timeMax'));
      const items = Object.values(cal.events).filter(ev => inWindow(ev, tMin, tMax) && evMatches(ev, p.get('q')))
        .map(ev => ({ id: ev.id, summary: ev.summary, description: ev.description, location: ev.location, start: ev.start, end: ev.end }));
      return R(200, { items });
    }
    if (method === 'post') { const r = JSON.parse(req.payload); const id = 'ev' + (++CAL.seq);
      cal.events[id] = Object.assign({ id }, r); return R(200, { id }); }
    if (method === 'delete') { if (!cal.events[evId]) return R(404, {}); delete cal.events[evId]; return R(204, ''); }
    if (method === 'patch') { if (!cal.events[evId]) return R(404, {});
      Object.assign(cal.events[evId], JSON.parse(req.payload)); return R(200, { id: evId }); }
    return R(400, {});
  }
  const serve = v => v === null ? R(404, 'not published') : typeof v === 'number' ? R(v, 'error') : R(200, v);
  function fetchOne(req) {
    if (typeof req === 'string') req = { url: req };
    if (/googleapis\.com\/calendar/.test(req.url)) return calendarRest(req);
    W.fetched.push(req.url);
    if (/2PACX-TESTSCHEDULEDOC/.test(req.url) && /gid=111\b/.test(req.url)) return serve(W.tabs.quiz);
    if (/2PACX-TESTSCHEDULEDOC/.test(req.url) && /gid=222\b/.test(req.url)) return serve(W.tabs.midterm);
    if (/2PACX-TESTELECTIVES/.test(req.url) && W.electives) {
      const codes = Object.keys(W.electives.tabs);
      if (/pubhtml/.test(req.url)) {
        return R(200, codes.map((c, i) => 'items.push({name: "' + c.replace(/&/g, '\\x26') +
          '", pageUrl: "https://docs.google.com/x?gid=' + (500 + i) + '"').join('\n'));
      }
      const gid = Number((/gid=(\d+)/.exec(req.url) || [])[1]);
      const csvOf = rows => rows.map(r => r.join(',')).join('\n');
      if (gid === 400) return R(200, csvOf([['Course Title', 'abbreviation', 'No of Students', '# Section', 'Group Email Id']]
        .concat(W.electives.summary)) + '\n'.repeat(5));
      if (gid >= 500 && gid < 500 + codes.length) {
        return R(200, csvOf([['Roll No', 'Name', 'Email Id', 'Section']].concat(W.electives.tabs[codes[gid - 500]])));
      }
    }
    return R(404, 'not published');
  }

  const SCRIPT_PROPS = {}, USER_PROPS = {}, SCRIPT_CACHE = {}, USER_CACHE = {}, TRIGGERS = {};
  Object.assign(W, { SCRIPT_PROPS, USER_PROPS, TRIGGERS });
  let trigSeq = 0;
  const mkProps = st => ({ getProperty: k => (k in st ? st[k] : null), setProperty: (k, v) => { st[k] = String(v); },
    setProperties: o => { Object.keys(o).forEach(k => st[k] = String(o[k])); }, deleteProperty: k => { delete st[k]; },
    getProperties: () => Object.assign({}, st), getKeys: () => Object.keys(st) });
  const mkCache = st => ({ get: k => (k in st ? st[k] : null), put: (k, v) => { st[k] = String(v); },
    remove: k => { delete st[k]; }, getAll: ks => { const o = {}; ks.forEach(k => { if (k in st) o[k] = st[k]; }); return o; },
    putAll: o => { Object.assign(st, o); }, removeAll: ks => ks.forEach(k => delete st[k]) });

  // One execution, as `email`. Returns fn(ctx), or { threw: message }.
  W.exec = function (email, fn) {
    USER_PROPS[email] = USER_PROPS[email] || {}; USER_CACHE[email] = USER_CACHE[email] || {}; TRIGGERS[email] = TRIGGERS[email] || [];
    const alerts = [];
    const ctx = {
      console: { log() {}, warn() {}, error() {} },
      Date, JSON, Math, parseInt, parseFloat, isNaN, RegExp, Object, Array, String, Number, Error, Infinity,
      encodeURIComponent, decodeURIComponent,
      Utilities: { parseCsv, formatDate, computeDigest: (_a, s) => sha256(s), DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
        getUuid: () => crypto.randomUUID(), sleep() {}, Charset: { UTF_8: 'UTF_8' },
        base64Encode: x => Buffer.from(String(x)).toString('base64') },
      Session: { getScriptTimeZone: () => 'Asia/Kolkata', getActiveUser: () => ({ getEmail: () => email }),
        getEffectiveUser: () => ({ getEmail: () => email }) },
      CacheService: { getScriptCache: () => mkCache(SCRIPT_CACHE), getUserCache: () => mkCache(USER_CACHE[email]) },
      PropertiesService: { getScriptProperties: () => mkProps(SCRIPT_PROPS), getUserProperties: () => mkProps(USER_PROPS[email]) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }),
        getUserLock: () => ({ tryLock: () => true, releaseLock() {}, waitLock() {} }) },
      SpreadsheetApp: { getActiveSpreadsheet: () => SS, openById: () => MIRROR_SS, flush() {},
        ProtectionType: { SHEET: 'SHEET' },
        getUi: () => ({ alert() { alerts.push([].slice.call(arguments)); return 1; },
          ButtonSet: { YES_NO: 1, OK: 2 }, Button: { YES: 1, OK: 2 } }) },
      UrlFetchApp: { fetch: (u, o) => fetchOne(Object.assign({ url: u }, o || {})), fetchAll: reqs => reqs.map(fetchOne) },
      CalendarApp: calAppFor(email),
      ScriptApp: { getProjectTriggers: () => TRIGGERS[email].slice(),
        newTrigger: fn => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => { const id = 'T' + (++trigSeq);
          const t = { getHandlerFunction: () => fn, getUniqueId: () => id, _min: m }; TRIGGERS[email].push(t); return t; } }) }) }),
        deleteTrigger: t => { TRIGGERS[email] = TRIGGERS[email].filter(x => x.getUniqueId() !== t.getUniqueId()); },
        getOAuthToken: () => 'token', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
      HtmlService: {}
    };
    ctx.__alerts = alerts;
    ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(W.config, ctx, { filename: 'config.gs' });
    vm.runInContext(W.code, ctx, { filename: 'code.gs' });
    try { return fn(ctx); } catch (e) { return { threw: e.message, stack: e.stack }; }
  };

  W.calendarsOf = calendarsOf;
  W.calOf = (email, name) => calendarsOf(email).find(c => c.name === name) || null;
  W.eventsOf = (email, name) => { const c = W.calOf(email, name); return c ? Object.values(c.events) : []; };
  W.trigs = (email, fn) => (TRIGGERS[email] || []).filter(t => t.getHandlerFunction() === (fn || 'backgroundSync'));
  W.ownerFetch = () => W.exec(W.owner, c => c.fetchAndCleanAdminData({ triggerUid: 'trigger-1' }));
  W.masterRows = () => { const s = SS.getSheetByName('MasterData'); return s ? s._grid.slice(1).filter(r => r[3]) : []; };
  return W;
}

// A tiny assertion helper shared by every test file.
function tally() {
  const t = { fail: 0, pass: 0 };
  t.ok = (c, m) => { if (c) t.pass++; else t.fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
  t.section = s => console.log('\n--- ' + s + ' ---');
  t.done = label => {
    console.log('\n' + (t.fail ? t.fail + ' FAILED' : label + ' (' + t.pass + ' checks)'));
    process.exit(t.fail ? 1 : 0);
  };
  return t;
}

module.exports = { createWorld, tally, parseCsv, APP, FIX };
