// END TO END for a first-year batch ("section" mode), against the real config.gs
// layout and the real code.gs: the office's timetable and the quiz / mid-term tabs →
// the maintainer's scheduled fetch → each student's courses from their section →
// Enable → background syncs → an office edit → the move to the next term.
// Everything runs in memory (see harness.js); nothing touches a real account.
const { createWorld, tally } = require('./harness');
const fs = require('fs'), path = require('path');
const t = tally();
const CAL2 = 'IIM Sirmaur – Term 2', CAL3 = 'IIM Sirmaur – Term 3';
const B = 'mba26903@iimsirmaur.ac.in';     // section B
const A = 'mba26902@iimsirmaur.ac.in';     // section A
const TM = 'mbatm26901@iimsirmaur.ac.in';  // section B, MBA-TM
const NOSEC = 'mba26906@iimsirmaur.ac.in'; // on the roster without a section
const keysOf = res => res.electives.map(e => e.section ? e.code + '-' + e.section : e.code);
const classesFor = (W, keys) => W.masterRows().filter(r => keys.indexOf(r[4] ? r[3] + '-' + r[4] : r[3]) !== -1).length;

let W = createWorld();

t.section('1 · the maintainer\'s fetch keeps only this batch and this term');
const f1 = W.ownerFetch();
t.ok(/Updated/.test(String(f1)), 'first fetch updates the data (' + String(f1).slice(0, 60) + '…)');
const rows = W.masterRows();
t.ok(rows.length === 129, 'MasterData holds the 129 first-year class rows (got ' + rows.length + ')');
t.ok(!rows.some(r => /^ELEC/.test(r[3])), 'no second-year class got in');
t.ok(!rows.some(r => /quiz|phd/i.test(r[3])), 'no "Quiz Slot" placeholder or "PhD Class" row got in');
const quiz = W.SS.getSheetByName('QuizData')._grid.slice(1).filter(r => r[3]);
t.ok(quiz.length === 2 && quiz.every(r => r[3] === 'ECO' || r[3] === 'MKT'),
  'QuizData has the two Term II quizzes only — not the Term-V or the T-III row (got ' + quiz.map(r => r[3]).join(',') + ')');
t.ok(W.SS.getSheetByName('ExamData')._grid.slice(1).filter(r => r[3]).length === 2, 'ExamData has the two Term II mid-terms');
t.ok(W.SCRIPT_PROPS.master_data_revision === '1', 'revision 0 → 1');
t.ok(/No changes detected/.test(String(W.ownerFetch())), 'an unchanged timetable → "No changes detected"');

t.section('2 · every student\'s courses come from their section');
const resB = W.exec(B, c => c.getMyElectives());
t.ok(resB.ok && resB.source === 'section' && resB.section === 'B', 'section-B student: ok, from the roster section');
t.ok(keysOf(resB).join(' ') === 'ECO-B FIN-B MKT-B OPS-B STAT-B LEAD',
  'gets the five section-B courses plus the whole-batch lecture (' + keysOf(resB).join(' ') + ')');
t.ok(resB.totalCredits === 16, 'credits add up (' + resB.totalCredits + ')');
const resTM = W.exec(TM, c => c.getMyElectives());
t.ok(keysOf(resTM).indexOf('TOUR') !== -1, 'the MBA-TM student also gets TOUR (onlyFor: ["MBATM"])');
t.ok(keysOf(resB).indexOf('TOUR') === -1, 'an MBA student does not');
t.ok(W.exec(NOSEC, c => c.getMyElectives()).reason === 'no_section', 'a student with no section is told nothing (falls back to picking)');
t.ok(W.exec('mba26999@iimsirmaur.ac.in', c => c.getMyElectives()).reason === 'not_on_roster', 'a roll not on the roster: "not_on_roster"');

t.section('3 · Enable builds exactly that calendar');
const selB = keysOf(resB);
const en = W.exec(B, c => c.enableAutoSync(selB, { popupReminder: '10' }, 'op-1'));
t.ok(en && /Calendar updated/.test(en.message || ''), 'enable succeeded: ' + JSON.stringify(en).slice(0, 80));
const evB = W.eventsOf(B, CAL2);
const want = classesFor(W, selB) + 1 + 2;   // classes + the ECO quiz + the two mid-terms
t.ok(evB.length === want, 'calendar holds ' + evB.length + ' events = classes + 1 quiz + 2 mid-terms (' + want + ')');
t.ok(evB.filter(e => /^📝/.test(e.summary)).length === 1, 'one quiz: ECO\'s (the MKT quiz is section A only)');
t.ok(evB.filter(e => /^📕/.test(e.summary)).length === 2, 'two mid-term exams');
t.ok(evB.some(e => /^📝 ECO Quiz 1 .*part of 20%/.test(e.summary)), 'the quiz carries its weight from COURSE_EVALUATION');
t.ok(evB.filter(e => /^🎤/.test(e.summary)).length === 1 &&
     evB.filter(e => /^LEAD/.test(e.summary)).length === 4, 'the guest lecture replaces its LEAD class instead of stacking on it');
t.ok(evB.every(e => e.location && /^IIM Sirmaur/.test(e.location)), 'locations start with INSTITUTE.name');
t.ok(evB.every(e => e.reminders && e.reminders.overrides[0] && e.reminders.overrides[0].minutes === 10), '10-minute reminders');
t.ok(W.trigs(B).length === 1, 'one background-sync trigger');
t.ok(new Set(evB.map(e => e.start.dateTime + e.summary)).size === evB.length, 'no duplicates');

t.section('4 · section A: its own quiz and the feedback note');
const resA = W.exec(A, c => c.getMyElectives());
W.exec(A, c => c.enableAutoSync(keysOf(resA), { popupReminder: '' }, 'op-2'));
const evA = W.eventsOf(A, CAL2);
t.ok(evA.filter(e => /^📝/.test(e.summary)).length === 2, 'section A gets both the ECO quiz and its own MKT quiz');
t.ok(evA.filter(e => /olt\.iimsirmaur\.ac\.in/.test(e.description || '')).length === 1,
  'exactly one class (FIN-A session 3) carries the feedback links');

t.section('5 · steady state, then an office edit');
const quiet = W.exec(B, c => c.backgroundSync({ triggerUid: W.trigs(B)[0].getUniqueId() }));
t.ok(/up to date/i.test(String(quiet)), 'background run with nothing new: "' + String(quiet).slice(0, 40) + '"');
// The office moves ECO-B session 1 to another room.
const row = W.mirror.findIndex(r => r[6] === 'ECO' && r[7] === 'B' && r[9] === '1');
W.mirror[row][10] = 'LH-9';
t.ok(/Updated/.test(String(W.ownerFetch())), 'the fetch notices the room change');
W.exec(B, c => c.backgroundSync({ triggerUid: W.trigs(B)[0].getUniqueId() }));
const moved = W.eventsOf(B, CAL2).filter(e => /^ECO \(B\)/.test(e.summary) && /LH-9/.test(e.location));
t.ok(moved.length === 1, 'the student\'s next background run moves that one class to LH-9');
t.ok(W.eventsOf(B, CAL2).length === want, 'and nothing else changes (' + W.eventsOf(B, CAL2).length + ' events)');

t.section('6 · the maintainer\'s reports');
const pre = W.exec(W.owner, c => c.enrolmentPreflightReport_().join('\n'));
t.ok(/Clear for go-live/.test(pre), 'enrolment pre-flight: clear for go-live');
t.ok(/MBA26906 \(no section\)/.test(pre), 'and names the student with no section');
const rep = W.exec(W.owner, c => c.settingsReport_().join('\n'));
t.ok(/have no section.*MBA26906/.test(rep), '✓ Check settings flags the missing section');
t.ok(/"Ist year".*KEPT/.test(rep) && /"2nd Year".*ignored/.test(rep), 'and shows which Year/Batch values are kept / ignored');
t.ok(/"MBA 2026-28, PhD26 T-II".*KEPT/.test(rep) && /T-III".*ignored/.test(rep) && /Term-V".*ignored/.test(rep),
  'and which quiz Batch/Term values are kept / ignored');

t.section('7 · test mode holds everyone else back');
const testCfg = W.config.replace('var TEST_ONLY_FOR = [];', 'var TEST_ONLY_FOR = ["MBA26902"];');
const Wt = createWorld({ config: testCfg });
Wt.ownerFetch();
const held = Wt.exec(B, c => c.enableAutoSync(selB, {}, 'op-3'));
t.ok(/being tested/.test(JSON.stringify(held)), 'a student outside TEST_ONLY_FOR is told it is being tested');
t.ok(Wt.calendarsOf(B).length === 0, 'and no calendar is created for them');
t.ok(/Calendar updated/.test(JSON.stringify(Wt.exec(A, c => c.enableAutoSync(keysOf(resA), {}, 'op-4')))),
  'the listed tester runs normally');

t.section('8 · moving the batch on to Term 3 — only the number changes');
// Moving on a term needs a new number (and, in real life, new dates and courses).
// The calendar name, the tags and last term's calendar all follow from it.
W.config = W.config.replace('number: 2,', 'number: 3,');
t.ok(W.exec(W.owner, c => c.PREVIOUS_TERM_.calendarName) === CAL2 && W.exec(W.owner, c => c.TERM_CONFIG_.calendarName) === CAL3,
  'last term\'s calendar ("… – Term 2") and the new one ("… – Term 3") are worked out from the number');
const start = W.exec(W.owner, c => { c.startTermHandover(); return c.__alerts.map(a => a.join(' ')).join('\n'); });
t.ok(/Give them every Term 3 course for their own section/.test(start), 'the handover dialog describes section mode');
t.ok(/handover started/.test(start), 'and the handover starts');
const quiz3 = W.SS.getSheetByName('QuizData')._grid.slice(1).filter(r => r[3]).map(r => r[3]);
t.ok(quiz3.join() === 'FIN', 'QuizData now holds only the Term III quiz (FIN) — the Term II ones are gone (' + quiz3.join() + ')');
const hb = W.exec(B, c => c.backgroundSync({ triggerUid: W.trigs(B)[0].getUniqueId() }));
t.ok(/Calendar updated/.test(String(hb)), 'the student\'s own next background run moves them: ' + String(hb).slice(0, 60));
const old = W.eventsOf(B, CAL2);
t.ok(old.length === want && old.every(e => e.summary.indexOf('̶') !== -1),
  'every Term 2 event is crossed out and kept (' + old.length + ')');
t.ok(JSON.parse(W.USER_PROPS[B].tt_selections).join(' ') === selB.join(' '), 'their Term 3 courses were filled in from their section');
const classes3 = classesFor(W, selB);
const q3 = W.eventsOf(B, CAL3).filter(e => /^📝/.test(e.summary)).map(e => e.summary.split(' ')[1]);
t.ok(W.eventsOf(B, CAL3).length === classes3 + 1 && q3.join() === 'FIN',
  'and the Term 3 calendar is built: its classes plus the Term III FIN quiz, no Term II quiz (' + W.eventsOf(B, CAL3).length + ' events)');
const nobody = 'mba26904@iimsirmaur.ac.in';   // never switched the tool on
W.exec(nobody, c => c.backgroundSync({}));
t.ok(W.calendarsOf(nobody).length === 0, 'a student who never used TermSync gets nothing they did not ask for');

t.section('9 · first year → second year (Term 3 → Term 4): electives');
// The same batch is now second-year: the office's sheet labels its rows "2nd Year",
// and courses come from the institute's elective allotment instead of sections.
W.mirror = W.mirror.filter(r => r[5] !== '2nd Year').map(r => r.map(v => v === 'Ist year' ? '2nd Year' : v));
W.electives = {
  summary: [['Finance Basics', 'FIN', '2', '2'], ['Marketing Basics', 'MKT', '1', '2'],
            ['Leadership Lecture Series', 'LEAD', '1', '-'], ['Economics for Managers', 'ECO', '1', '2']],
  tabs: { FIN: [['MBA26903', 'BIMAL EXAMPLE', 'x', 'B'], ['MBA26902', 'ASHA EXAMPLE', 'x', 'A']],
          MKT: [['MBA26903', 'BIMAL EXAMPLE', 'x', 'B']],
          LEAD: [['MBA26903', 'BIMAL EXAMPLE', 'x', '']],
          ECO: [['MBA26902', 'ASHA EXAMPLE', 'x', 'A']] }
};
W.config = W.config.replace('number: 3,', 'number: 4,')
  .replace('electivesSummary: "",', 'electivesSummary: "https://docs.google.com/spreadsheets/d/e/2PACX-TESTELECTIVES/pubhtml?gid=400",');
const y2 = W.exec(W.owner, c => ({ mode: c.enrolmentMode_(), years: c.GUEST_YEAR_TAGS_, prev: c.PREVIOUS_TERM_.calendarName }));
t.ok(y2.mode === 'electives' && y2.years.indexOf('2NDYEAR') !== -1 && y2.prev === CAL3,
  'number 4 means: second-year rows, electives, and Term 3\'s calendar to cross out');
const start4 = W.exec(W.owner, c => { c.startTermHandover(); return c.__alerts.map(a => a.join(' ')).join('\n'); });
t.ok(/elective tabs/.test(start4), 'the handover dialog says courses come from the elective tabs');
t.ok(W.masterRows().length === 129, 'the timetable\'s "2nd Year" rows are now this batch\'s (' + W.masterRows().length + ')');
const pre4 = W.exec(W.owner, c => c.enrolmentPreflightReport_().join('\n'));
t.ok(/All \d+ course tabs read cleanly/.test(pre4), 'the pre-flight reads every elective tab');
W.exec(B, c => c.backgroundSync({ triggerUid: W.trigs(B)[0].getUniqueId() }));
const sel4 = JSON.parse(W.USER_PROPS[B].tt_selections || '[]');
t.ok(sel4.slice().sort().join(' ') === 'FIN-B LEAD MKT-B', 'their electives come from the allotment, with sections (' + sel4.join(' ') + ')');
t.ok(W.eventsOf(B, CAL3).every(e => e.summary.indexOf('̶') !== -1), 'Term 3 is crossed out');
t.ok(W.eventsOf(B, 'IIM Sirmaur – Term 4').length === classesFor(W, sel4), 'and the Term 4 calendar holds exactly those electives');
const me4 = W.exec(A, c => c.getMyElectives());
t.ok(me4.ok && me4.electives.map(e => e.code + '-' + e.section).sort().join(' ') === 'ECO-A FIN-A',
  'a student opening the page sees their own electives filled in');

t.section('10 · "pick" mode, and "electives" without a link');
const base = fs.readFileSync(path.join(__dirname, 'fixtures', 'test.config.gs'), 'utf8');
const pickCfg = base.replace('number: 2,', 'number: 2,\n  courseSelection: "pick",');
const Wp = createWorld({ config: pickCfg });
Wp.ownerFetch();
t.ok(Wp.exec(B, c => c.getMyElectives()).reason === 'not_configured', 'pick: nothing is looked up');
t.ok(Wp.exec(B, c => c.siteSettings_().selection) === 'pick', 'and the page is told to hide Auto-fill');
const elecNoLink = createWorld({ config: base.replace('number: 2,', 'number: 4,') });
t.ok(elecNoLink.exec(B, c => c.enrolmentMode_()) === 'pick', 'a second-year term with no electivesSummary link: students pick');
t.ok(/electivesSummary is blank/.test(elecNoLink.exec(W.owner, c => c.settingsReport_().join('\n'))),
  'and ✓ Check settings says why');

t.section('11 · features switched off');
const offCfg = base.replace(/var FEATURES = \{[\s\S]*?\n\};|$/, '') + '\nvar FEATURES = { adminDashboard: false, usageStats: false, ' +
  'usageLog: false, subjectReps: false, courseOutlines: false, pdfDownload: false, reportWrongEntry: false };\n';
const Wo = createWorld({ config: offCfg });
Wo.ownerFetch();
const rOff = Wo.exec(B, c => c.getMyElectives());
Wo.exec(B, c => c.enableAutoSync(keysOf(rOff), {}, 'op-off'));
const off = Wo.exec('mba26902@iimsirmaur.ac.in', c => ({   // a SAC member
  viewer: c.getSyncHealth().isLogViewer, log: c.getUsageLog(), stats: c.getUsageStats(), reps: c.getSubjectReps_(),
  outlines: Object.keys(c.siteSettings_().outlines).length, report: c.submitReport({ course: 'ECO', details: 'x' }),
  usageEvents: Object.keys(c.PropertiesService.getScriptProperties().getProperties()).filter(k => /^tt_usage_evt_/.test(k)).length }));
const pdf = Wo.exec(B, c => c.getPrintableTimetable());
t.ok(off.viewer === false && off.log && off.log.ok === false, 'adminDashboard: the SAC team gets no admin panel, and the server refuses');
t.ok(off.stats.off === true, 'usageStats: the public stats answer nothing');
t.ok(off.usageEvents === 0, 'usageLog: enabling recorded nothing');
t.ok(off.reps === null && off.outlines === 0, 'subjectReps / courseOutlines: nothing is sent to the page');
t.ok(off.report.ok === false && pdf.ok === false, 'reportWrongEntry / pdfDownload: refused');
t.ok(Wo.eventsOf(B, CAL2).length === want, 'and the calendar itself is exactly the same as with everything on');
t.ok(/is not a feature TermSync knows/.test(createWorld({ config: base + '\nvar FEATURES = { adminDashbord: false };\n' })
  .exec(W.owner, c => c.SETTINGS_PROBLEMS_.join(' '))), 'a misspelt feature is reported');

t.done('First-year end to end verified');
