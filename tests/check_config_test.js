// tests/check_config.js — the check people (and AI assistants) run on a filled-in
// config.gs before pasting it. It must say READY only when it is, and point at the
// line when the file has a typing mistake.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { tally, FIX, APP } = require('./harness');
const t = tally();
const CHECK = path.join(__dirname, 'check_config.js');
const run = (...args) => {
  const r = spawnSync(process.execPath, [CHECK].concat(args), { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'termsync-check-'));
const cfg = fs.readFileSync(path.join(FIX, 'test.config.gs'), 'utf8');

t.section('a complete config.gs, with the timetable');
let r = run(path.join(FIX, 'test.config.gs'), path.join(FIX, 'mirror.csv'));
t.ok(r.code === 0 && /RESULT: READY/.test(r.out), 'says READY (exit 0)');
t.ok(/kept 129 class\(es\)/.test(r.out), 'runs the fetch on the timetable copy');
t.ok(/Clear for go-live/.test(r.out), 'and the every-student pre-flight');
t.ok(/no section.*MBA26906/.test(r.out), 'still mentions the student with no section, as a warning');

t.section('settings only');
r = run(path.join(FIX, 'test.config.gs'));
t.ok(r.code === 0 && /RESULT: READY \(settings only/.test(r.out), 'READY, and says the timetable was not checked');

t.section('the template as shipped');
r = run(path.join(APP, 'config.gs'));
t.ok(r.code === 1 && /NOT READY/.test(r.out) && /EXMPL/.test(r.out), 'NOT READY: the example courses are still there');

t.section('a typing mistake');
const broken = path.join(tmp, 'broken.gs');
fs.writeFileSync(broken, cfg.replace('batch: "Batch 26-28",', 'batch: "Batch 26-28,'));
r = run(broken);
t.ok(r.code === 1 && /typing mistake on or just before line \d+/.test(r.out), 'NOT READY, naming the line');
t.ok(/Batch 26-28,/.test(r.out), 'and showing it');

t.section('a timetable where nothing matches the batch');
const other = path.join(tmp, 'other-year.csv');
fs.writeFileSync(other, fs.readFileSync(path.join(FIX, 'mirror.csv'), 'utf8').replace(/Ist year/g, 'Some other year'));
r = run(path.join(FIX, 'test.config.gs'), other);
t.ok(r.code === 1 && /no row matches THIS_TERM\.yearTags/.test(r.out), 'NOT READY: no row matches the year tags');

t.done('Config check verified');
