// One command for the whole check:   npm test
//
// Runs every test and prints one pass/fail line each. The exit code is non-zero if
// anything failed — so "all passed" is the signal that a change is safe to paste
// into Apps Script. See docs/CHANGING_THE_CODE.md.
const { spawnSync } = require('child_process');
const path = require('path');

const TESTS = ['settings_test', 'first_year_test', 'check_config_test', 'page_test'];
let failed = 0;
for (const name of TESTS) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, name + '.js')], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && !/^\s*FAIL\b/m.test(out);
  if (!ok) failed++;
  const last = out.split('\n').filter(l => l.trim()).pop() || '';
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(18) + String(((Date.now() - t0) / 1000).toFixed(1) + 's').padStart(7) + '  ' + last.trim().slice(0, 70));
  if (!ok) out.split('\n').filter(l => /^\s*FAIL\b|Error/.test(l)).slice(0, 10).forEach(l => console.log('          ' + l.trim().slice(0, 140)));
}
console.log('\n' + (failed ? failed + ' test file(s) FAILED — do not paste this build.' : 'All ' + TESTS.length + ' test files passed.'));
process.exit(failed ? 1 : 0);
