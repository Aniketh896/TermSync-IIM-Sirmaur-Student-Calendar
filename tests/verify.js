// The pre-deploy gate:   npm run verify
//
// Run it after ANY change, before pasting anything into Apps Script — by hand or by
// an AI assistant. It ends with "VERIFIED" (exit code 0) or "NOT READY" (exit 1), and
// it is what the git hook (.githooks/pre-push) and the GitHub tests run too.
//
//   1. The four app files exist and are valid code / JSON.
//   2. The permissions and web-app settings in appsscript.json are the ones every
//      student already approved — a change there forces the whole batch to re-consent.
//   3. Everything the page asks the server for, every spreadsheet-menu item and
//      every timer still points at a function that exists and can be called.
//   4. BUILD_ID_ was bumped if code.gs or Index.html changed since the last commit.
//   5. The template config.gs holds no real roster, if this is a git checkout.
//   6. Every test passes (npm test).
//   7. A filled-in config.gs (app/config.gs if filled in, or my-config.gs) passes
//      `npm run check` — with timetable.csv next to it, a full dry run.
//
//   node tests/verify.js [project folder]     (defaults to this repository)
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const APP = path.join(ROOT, 'app');
const problems = [], notes = [];
const fail = m => problems.push(m);
const pass = m => console.log('  ✓ ' + m);
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

// What every student approved. Changing any of it means re-consent for the batch
// (scopes) or a broken tool (executeAs / access) — see docs/CHANGING_THE_CODE.md.
const SCOPES = [
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/userinfo.email'
];

console.log('Verifying ' + ROOT + '\n');

// ── 1 · files and syntax ─────────────────────────────────────────────────────────
const FILES = ['config.gs', 'code.gs', 'Index.html', 'appsscript.json'];
const missing = FILES.filter(f => !fs.existsSync(path.join(APP, f)));
if (missing.length) {
  fail('Missing in app/: ' + missing.join(', '));
} else {
  pass('The four app files are there');
  ['config.gs', 'code.gs'].forEach(f => {
    try { new vm.Script(read(f), { filename: f }); pass(f + ' is valid code'); }
    catch (e) {
      const line = (/:(\d+)/.exec((e.stack || '').split('\n')[0]) || [])[1];
      fail(f + ' has a syntax error' + (line ? ' on or near line ' + line : '') + ': ' + e.message);
    }
  });
  // Every inline script of the page must parse; a single typo blanks the page.
  const html = read('Index.html');
  let scripts = 0, bad = 0;
  html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, attrs, body) => {
    attrs = attrs || '';
    if (/\bsrc=/.test(attrs) || /application\/json|text\/template/.test(attrs) || !body.trim()) return all;
    scripts++;
    try { new vm.Script(body, { filename: 'Index.html <script #' + scripts + '>' }); }
    catch (e) { bad++; fail('Index.html: a <script> block has a syntax error: ' + e.message); }
    return all;
  });
  if (!bad) pass('Index.html: all ' + scripts + ' script blocks are valid code');
  if (html.indexOf('<?!= bootJson ?>') === -1) fail('Index.html no longer has the <?!= bootJson ?> placeholder doGet fills in');
  if (!/<\/html>\s*$/i.test(html)) fail('Index.html does not end with </html> — was it cut short?');

  // ── 2 · manifest ───────────────────────────────────────────────────────────────
  try {
    const m = JSON.parse(read('appsscript.json'));
    const scopes = (m.oauthScopes || []).slice().sort();
    if (JSON.stringify(scopes) !== JSON.stringify(SCOPES.slice().sort())) {
      fail('appsscript.json: the permissions (oauthScopes) changed. Every student would have to approve ' +
        'TermSync again. If that is really intended, update SCOPES in tests/verify.js and say so in CHANGELOG.md.');
    } else pass('appsscript.json: permissions unchanged');
    if (!m.webapp || m.webapp.executeAs !== 'USER_ACCESSING' || m.webapp.access !== 'DOMAIN') {
      fail('appsscript.json: the web app must run as "USER_ACCESSING" with access "DOMAIN".');
    } else pass('appsscript.json: runs as each student, institute accounts only');
    if (m.runtimeVersion !== 'V8') fail('appsscript.json: runtimeVersion must stay "V8".');
  } catch (e) {
    fail('appsscript.json is not valid JSON: ' + e.message);
  }

  // ── 3 · every entry point still exists ────────────────────────────────────────
  const code = read('code.gs');
  const fns = {};
  code.replace(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm, (a, n) => { fns[n] = true; return a; });
  const called = {};
  for (let at = html.indexOf('google.script.run'); at !== -1; at = html.indexOf('google.script.run', at + 1)) {
    const seg = html.slice(at + 'google.script.run'.length, at + 6000);
    let i = 0;
    for (;;) {
      const mm = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(seg.slice(i));
      if (!mm) break;
      let j = i + mm[0].length, depth = 1;
      while (depth && j < seg.length) { if (seg[j] === '(') depth++; else if (seg[j] === ')') depth--; j++; }
      if (/^with(SuccessHandler|FailureHandler|UserObject)$/.test(mm[1])) { i = j; continue; }
      called[mm[1]] = true;
      break;
    }
  }
  const calls = Object.keys(called);
  const lostCalls = calls.filter(n => !fns[n]);
  const privateCalls = calls.filter(n => /_$/.test(n));
  if (lostCalls.length) fail('The page calls server functions that no longer exist in code.gs: ' + lostCalls.join(', '));
  if (privateCalls.length) fail('The page calls functions ending in "_", which Apps Script hides from the page: ' + privateCalls.join(', '));
  if (!lostCalls.length && !privateCalls.length) pass('All ' + calls.length + ' server functions the page calls exist');
  const menu = [];
  code.replace(/\.addItem\(\s*(['"])(?:(?!\1).)*\1\s*,\s*'([A-Za-z_$][\w$]*)'\s*\)/g, (a, q, n) => { menu.push(n); return a; });
  const lostMenu = menu.filter(n => !fns[n]);
  if (lostMenu.length) fail('Spreadsheet menu items point at missing functions: ' + lostMenu.join(', '));
  else pass('All ' + menu.length + ' spreadsheet menu items point at real functions');
  const handlers = ['doGet', 'onOpen', 'backgroundSync', 'fetchAndCleanAdminData', 'checkSettingsLog',
                    'testTimetableSourceLog', 'enrolmentPreflightLog'];
  const lostHandlers = handlers.filter(n => !fns[n]);
  if (lostHandlers.length) {
    fail('Entry points students\' timers, the page or the setup guide rely on are missing: ' + lostHandlers.join(', ') +
      '. Renaming backgroundSync or fetchAndCleanAdminData breaks every existing timer.');
  } else pass('Web app, menu and timer entry points are all there');

  // ── 4 · BUILD_ID_ bumped when the code changed ────────────────────────────────
  const git = args => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const inGit = git(['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true' &&
                git(['rev-parse', '--verify', 'HEAD']).status === 0;
  if (inGit) {
    // Compared with what's already published (the upstream branch) when there is
    // one — so committed-but-unpushed changes count too, as they do in the pre-push
    // hook — otherwise with the last commit.
    // TERMSYNC_VERIFY_BASE: set by the GitHub workflow on a pull request (the branch
    // it would merge into).
    const up = git(['rev-parse', '--verify', '--quiet', process.env.TERMSYNC_VERIFY_BASE || '@{u}']);
    const base = up.status === 0 ? up.stdout.trim() : 'HEAD';
    const changed = git(['diff', '--name-only', base, '--', 'app/code.gs', 'app/Index.html']).stdout.trim();
    const buildOf = src => (/var BUILD_ID_ = "([^"]+)"/.exec(src) || [])[1] || '';
    const before = buildOf(git(['show', base + ':app/code.gs']).stdout || '');
    const now = buildOf(code);
    if (changed && before && now === before) {
      fail('code.gs / Index.html changed but BUILD_ID_ is still "' + now + '". Bump it (today\'s date + a letter, ' +
        'e.g. "' + new Date().toISOString().slice(0, 10) + 'a") so the admin panel can tell which version is live.');
    } else if (changed) pass('BUILD_ID_ bumped (' + before + ' → ' + now + ')');
    else pass('code.gs and Index.html unchanged since ' + (base === 'HEAD' ? 'the last commit' : 'the last push'));
  } else notes.push('Not a git checkout — skipped the BUILD_ID_ check.');

  // ── 5 · the template carries no real people ──────────────────────────────────
  const cfg = read('config.gs');
  const block = name => (new RegExp('var ' + name + ' = `([\\s\\S]*?)`;').exec(cfg) || [])[1] || '';
  const realLines = ['STUDENTS', 'SAC_TEAM', 'SUBJECT_REPS'].map(b => block(b).split('\n')
    .filter(l => l.trim() && !/^\s*(#|\/\/)/.test(l)).length).reduce((a, b) => a + b, 0);
  const filled = realLines > 0;
  if (filled) {
    const tracked = inGit && git(['ls-files', '--error-unmatch', 'app/config.gs']).status === 0;
    notes.push('app/config.gs is filled in (' + realLines + ' roster / team / rep line(s)). ' +
      (tracked ? 'Don\'t commit or push it — it\'s the public template. Keep yours as my-config.gs (git ignores it).'
               : 'Keep it private.'));
  } else pass('The template config.gs holds no real roster');
}

// ── 6 · every test ──────────────────────────────────────────────────────────────
// TERMSYNC_VERIFY_NO_TESTS is set only by tests/verify_test.js, which runs this
// gate on broken copies of the app and must not start the whole suite each time.
if (!problems.length && process.env.TERMSYNC_VERIFY_NO_TESTS) {
  notes.push('Tests skipped (TERMSYNC_VERIFY_NO_TESTS).');
} else if (!problems.length) {
  console.log('\nRunning every test (npm test)…');
  const t = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run_all.js')], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write((t.stdout || '').split('\n').map(l => l ? '  ' + l : l).join('\n'));
  if (t.status !== 0) fail('Some tests failed (above).');
  if (/Page test skipped/.test(t.stdout || '')) {
    notes.push('The in-browser page test was skipped (no Google Chrome found) — install Chrome to check the page too.');
  }
}
if (!problems.length) {
  // ── 7 · your own settings, if they're here ───────────────────────────────────
  const mine = ['my-config.gs', path.join('app', 'config.gs')].map(f => path.join(ROOT, f))
    .find(f => fs.existsSync(f) && (/my-config\.gs$/.test(f) ||
      /var STUDENTS = `[\s\S]*?^\s*[A-Za-z]{2,}\d{4,}/m.test(fs.readFileSync(f, 'utf8'))));
  if (mine) {
    const csv = ['timetable.csv', 'my-timetable.csv'].map(f => path.join(ROOT, f)).find(f => fs.existsSync(f));
    console.log('\nChecking your settings (' + path.relative(ROOT, mine) + (csv ? ' with ' + path.relative(ROOT, csv) : '') + ')…');
    const c = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'check_config.js'), mine].concat(csv ? [csv] : []),
      { cwd: ROOT, encoding: 'utf8' });
    const out = (c.stdout || '') + (c.stderr || '');
    out.split('\n').filter(l => /^(✖|⚠|RESULT)|^\s+•/.test(l)).slice(0, 40).forEach(l => console.log('  ' + l));
    if (c.status !== 0) fail('Your settings are NOT READY (see above, or run: npm run check -- ' + path.relative(ROOT, mine) + ').');
  } else {
    notes.push('No filled-in settings found (my-config.gs). To check yours too, save them as my-config.gs ' +
      '(and the office\'s timetable as timetable.csv) in this folder.');
  }
}

console.log('');
notes.forEach(n => console.log('  ℹ ' + n));
if (problems.length) {
  console.log('\n✖ NOT READY — do not paste this into Apps Script:');
  problems.forEach(p => console.log('  • ' + p));
  process.exit(1);
}
console.log('\n✅ VERIFIED — safe to deploy. Next (docs/CHANGING_THE_CODE.md):');
console.log('  1. Commit.  2. In config.gs (Apps Script), TEST_ONLY_FOR = your roll.');
console.log('  3. Paste the changed files → Save → Deploy → Manage deployments → ✏️ → New version.');
console.log('  4. Check on yourself, then TEST_ONLY_FOR = [] → Save → Deploy again.');
