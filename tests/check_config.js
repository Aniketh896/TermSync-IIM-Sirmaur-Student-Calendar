// Checks a filled-in config.gs on your computer, BEFORE it goes anywhere near Apps
// Script:
//
//   npm run check -- my-config.gs                  settings only
//   npm run check -- my-config.gs timetable.csv    settings + a dry run on the timetable
//
// timetable.csv is the office's timetable sheet downloaded as CSV (open it → File →
// Download → Comma-separated values). With it, this runs the real fetch and works
// out every student's calendar — the same pre-flight the app runs — all in memory.
// Nothing is sent anywhere. The published quiz / exam links can't be read from
// here; ✓ Check settings in Apps Script covers those.
//
// Ends with "RESULT: READY" (exit code 0) or "RESULT: NOT READY" (exit code 1).
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createWorld } = require('./harness');

const cfgPath = process.argv[2] || path.join(__dirname, '..', 'app', 'config.gs');
const csvPath = process.argv[3] || '';
let blockers = 0;
const say = s => console.log(s);

say('Checking ' + cfgPath + (csvPath ? ' with the timetable ' + csvPath : '') + '\n');
if (!fs.existsSync(cfgPath)) { say('✖ No such file: ' + cfgPath + '\n\nRESULT: NOT READY'); process.exit(1); }
const config = fs.readFileSync(cfgPath, 'utf8');

// 1 · Is it valid at all? A missing quote or comma stops the whole app.
try {
  new vm.Script(config, { filename: path.basename(cfgPath) });
  say('✓ The file is valid (no missing quotes, commas or brackets).');
} catch (e) {
  const m = /:(\d+)/.exec((e.stack || '').split('\n')[0]);
  const line = m ? Number(m[1]) : null;
  say('✖ The file has a typing mistake' + (line ? ' on or just before line ' + line : '') + ': ' + e.message);
  if (line) {
    const lines = config.split('\n');
    for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 1); i++) say('    ' + (i + 1) + ' | ' + lines[i]);
  }
  say('\nRESULT: NOT READY');
  process.exit(1);
}

// 2 · What the app makes of it.
let csv = null;
if (csvPath) {
  if (!fs.existsSync(csvPath)) { say('✖ No such file: ' + csvPath + '\n\nRESULT: NOT READY'); process.exit(1); }
  csv = fs.readFileSync(csvPath, 'utf8');
}
const header = 'Date,Day,StartTime,EndTime,Timings (24 hrs format),Year/Batch,Code,Grp,Faculty,Session#,Classroom,FT/VF,Course-Section-Faculty,CR Block\n';
let W;
try {
  W = createWorld({ config, mirror: csv || header, quiz: null, midterm: null });
} catch (e) {
  say('✖ ' + e.message + '\n\nRESULT: NOT READY'); process.exit(1);
}
let who;
try { who = W.exec('nobody@example.invalid', c => (c.CREATOR_ROLL_ || 'maintainer').toLowerCase() + '@' + (c.EMAIL_DOMAIN_ || 'example.invalid')); }
catch (e) { say('✖ The app could not load these settings: ' + e.message + '\n\nRESULT: NOT READY'); process.exit(1); }
W.owner = who;

const rep = W.exec(who, c => c.settingsReport_({ offline: true, skipTimetable: !csv }));
if (rep && rep.threw) { say('✖ The settings check itself failed: ' + rep.threw + '\n\nRESULT: NOT READY'); process.exit(1); }
say('\n── Settings ──────────────────────────────────────────────');
rep.forEach(l => say(l));
if (rep.some(l => /^✖/.test(l))) blockers++;

// 3 · A dry run on the real timetable.
if (csv) {
  say('\n── Dry run on the timetable ──────────────────────────────');
  const fetched = W.exec(who, c => c.fetchAndCleanAdminData({ triggerUid: 'dry-run' }));
  const rows = W.masterRows();
  if (!rows.length) {
    blockers++;
    say('✖ The fetch kept no classes: ' + JSON.stringify(fetched).slice(0, 300));
  } else {
    say('✓ The fetch kept ' + rows.length + ' class(es) for your batch.');
    const k1 = W.SS.getSheetByName('MasterData').getRange('K2').getValue() ||
               W.SS.getSheetByName('MasterData').getRange('K1').getValue();
    if (k1 && !/^None/.test(String(k1))) say('  Notes from the fetch: ' + String(k1).slice(0, 600));
    const per = {};
    rows.forEach(r => { const k = r[3] + (r[4] ? ' ' + r[4] : ''); per[k] = (per[k] || 0) + 1; });
    say('  Classes per course and section: ' + Object.keys(per).sort().map(k => k + '=' + per[k]).join(', '));
    const mode = W.exec(who, c => c.enrolmentMode_());
    if (mode === 'electives') {
      say('  (Electives mode: the allotment sheet can only be read in Apps Script — run ✓ Enrolment pre-flight there.)');
    } else {
      const pre = W.exec(who, c => c.enrolmentPreflightReport_());
      say('');
      pre.forEach(l => say(l));
      if (pre.some(l => /NOT clear/.test(l))) blockers++;
    }
  }
}

say('');
if (blockers) {
  say('RESULT: NOT READY — fix the ✖ lines above, then run this again.');
  process.exit(1);
}
say('RESULT: READY' + (csv ? '' : ' (settings only — add the timetable CSV for a dry run)') +
  '. Next: paste into Apps Script and run ✓ Check settings there too.');
