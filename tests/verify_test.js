// tests/verify.js — the gate every change goes through before deployment. Each
// case breaks a copy of the app the way a hurried edit (by hand or by an AI
// assistant) could, and checks the gate says NOT READY and names the problem.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { tally } = require('./harness');
const t = tally();
const REPO = path.join(__dirname, '..');

// A throwaway copy of app/ and tests/, so nothing here touches the real files.
const made = [];
function copyProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'termsync-verify-'));
  made.push(dir);
  fs.cpSync(path.join(REPO, 'app'), path.join(dir, 'app'), { recursive: true });
  fs.cpSync(path.join(REPO, 'tests'), path.join(dir, 'tests'), { recursive: true });
  return dir;
}
const edit = (dir, file, from, to) => {
  const p = path.join(dir, 'app', file);
  const s = fs.readFileSync(p, 'utf8');
  if (s.indexOf(from) === -1) throw new Error('test setup: "' + from.slice(0, 40) + '" not in ' + file);
  fs.writeFileSync(p, s.replace(from, to));
};
const verify = dir => {
  const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'verify.js'), dir], {
    encoding: 'utf8', env: Object.assign({}, process.env, { TERMSYNC_VERIFY_NO_TESTS: '1' }) });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });

t.section('an untouched copy');
let d = copyProject();
let r = verify(d);
t.ok(r.code === 0 && /VERIFIED/.test(r.out), 'VERIFIED');

t.section('the mistakes it must catch');
const cases = [
  ['a missing bracket in code.gs', 'code.gs', 'function doGet() {', 'function doGet() {{', /code\.gs has a syntax error/],
  ['a missing quote in config.gs', 'config.gs', 'batch: "Batch 26-28",', 'batch: "Batch 26-28,', /config\.gs has a syntax error/],
  ['a typo in the page\'s script', 'Index.html', 'function applySite(site) {', 'function applySite(site) {(', /Index\.html: a <script> block has a syntax error/],
  ['a server function renamed', 'code.gs', 'function getMyElectives() {', 'function getMyCourses() {', /no longer exist in code\.gs: .*getMyElectives/],
  ['a page-called function made private', 'code.gs', 'function getUsageStats() {', 'function getUsageStats_() {', /getUsageStats/],
  ['the timer\'s handler renamed', 'code.gs', 'function backgroundSync(', 'function runSync(', /backgroundSync/],
  ['a new permission added', 'appsscript.json', '"https://www.googleapis.com/auth/calendar",', '"https://www.googleapis.com/auth/calendar",\n        "https://www.googleapis.com/auth/drive",', /permissions \(oauthScopes\) changed/],
  ['the web app set to run as the maintainer', 'appsscript.json', '"USER_ACCESSING"', '"USER_DEPLOYING"', /USER_ACCESSING/],
  ['the page cut short', 'Index.html', '</html>', '', /cut short/]
];
cases.forEach(([what, file, from, to, expect]) => {
  const dir = copyProject();
  edit(dir, file, from, to);
  const res = verify(dir);
  t.ok(res.code === 1 && /NOT READY/.test(res.out) && expect.test(res.out), what + ' → NOT READY, and says why');
});

t.section('BUILD_ID_ must change with the code');
d = copyProject();
git(d, ['init', '-q']); git(d, ['add', '-A']);
git(d, ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'base']);
edit(d, 'code.gs', '// How often each user\'s backgroundSync trigger fires', '// (an edit)\n// How often each user\'s backgroundSync trigger fires');
r = verify(d);
t.ok(r.code === 1 && /BUILD_ID_ is still/.test(r.out), 'code changed, BUILD_ID_ not bumped → NOT READY');
edit(d, 'code.gs', /var BUILD_ID_ = "[^"]+";/.exec(fs.readFileSync(path.join(d, 'app', 'code.gs'), 'utf8'))[0], 'var BUILD_ID_ = "2099-01-01a";');
r = verify(d);
t.ok(r.code === 0 && /BUILD_ID_ bumped/.test(r.out), 'bumped → VERIFIED');

t.section('your own settings');
d = copyProject();
fs.writeFileSync(path.join(d, 'my-config.gs'), fs.readFileSync(path.join(__dirname, 'fixtures', 'test.config.gs'), 'utf8'));
fs.copyFileSync(path.join(__dirname, 'fixtures', 'mirror.csv'), path.join(d, 'timetable.csv'));
r = verify(d);
t.ok(r.code === 0 && /my-config\.gs with timetable\.csv/.test(r.out) && /RESULT: READY/.test(r.out),
  'my-config.gs + timetable.csv are checked with a full dry run');
fs.writeFileSync(path.join(d, 'my-config.gs'), fs.readFileSync(path.join(__dirname, 'fixtures', 'test.config.gs'), 'utf8')
  .replace('number: 2,', 'number: 2,\n  courseSelection: "maybe",'));
r = verify(d);
t.ok(r.code === 1 && /settings are NOT READY/.test(r.out), 'and a broken one stops the deploy');
d = copyProject();
edit(d, 'config.gs', '# MBA26901, FIRST STUDENT NAME, A', 'MBA26901, FIRST STUDENT NAME, A');
r = verify(d);
t.ok(/app\/config\.gs is filled in/.test(r.out), 'a filled-in template is pointed out, so it isn\'t pushed by mistake');

made.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
t.done('Verify gate verified');
