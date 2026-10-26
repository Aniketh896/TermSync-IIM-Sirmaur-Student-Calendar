// config.gs → what the code sees. The people editing config.gs are mostly not
// programmers, so this checks the forgiving parts: links pasted in any form, rosters
// pasted from a spreadsheet, typos that must be REPORTED rather than crash every
// student's background sync, and the template itself loading cleanly.
const { createWorld, tally, APP, FIX } = require('./harness');
const fs = require('fs'), path = require('path');
const t = tally();
const BASE = fs.readFileSync(path.join(FIX, 'test.config.gs'), 'utf8');
const run = (cfg, fn) => createWorld({ config: cfg }).exec('mba26901@iimsirmaur.ac.in', fn);

t.section('the template config.gs, exactly as shipped');
const tpl = fs.readFileSync(path.join(APP, 'config.gs'), 'utf8');
const loaded = run(tpl, c => ({ term: c.TERM_CONFIG_.label, problems: c.SETTINGS_PROBLEMS_.slice(), report: c.settingsReport_().join('\n') }));
t.ok(!loaded.threw, 'loads with code.gs without throwing' + (loaded.threw ? ': ' + loaded.threw : ''));
t.ok(loaded.term === 'Term 2', 'its example term is read (' + loaded.term + ')');
t.ok(/EXMPL example courses/.test(loaded.report), '✓ Check settings says the example courses must be replaced');
t.ok(/MAINTAINER\.roll is not set/.test(loaded.report), '…that MAINTAINER.roll is still a placeholder');
t.ok(/STUDENTS is empty/.test(loaded.report), '…that the roster is empty');
t.ok(/No timetable source is configured|timetableSheet/.test(loaded.report), '…and that there is no timetable yet');

t.section('a missing or misplaced config.gs');
// Apps Script runs files top to bottom; with config.gs absent (or below code.gs)
// the settings are undefined when code.gs loads.
let ran = false, msg = '';
try { createWorld({ config: '// nothing here' }).exec('mba26901@iimsirmaur.ac.in', () => { ran = true; }); }
catch (e) { msg = e.message; }
t.ok(!ran, 'nothing runs without it');
t.ok(/config\.gs/.test(msg) && /ABOVE code\.gs/.test(msg), 'and the error says exactly what to do: "' + msg.slice(0, 70) + '…"');

t.section('the test batch\'s config.gs');
const c1 = run(BASE, c => ({
  problems: c.SETTINGS_PROBLEMS_.slice(), roster: c.STUDENT_ROSTER_, sac: c.SAC_ROLES_, creator: c.CREATOR_ROLL_,
  start: c.TERM_CONFIG_.syncWindowStart, end: c.TERM_CONFIG_.syncWindowEnd, quiz: c.QUIZ_CSV_URL, mid: c.EXAM_CSV_URL,
  sheet: c.TIMETABLE_SHEET_ID_, endterm: c.ENDTERM_CSV_URL, pending: c.PENDING_URL_, reps: c.configuredSubjectReps_(),
  site: c.siteSettings_(), info: c.COURSE_INFO_, prev: c.PREVIOUS_TERM_, credit: c.creditLineHtml_(),
  year: [c.isOurYearRow_('Ist year'), c.isOurYearRow_('1st Year'), c.isOurYearRow_('2nd Year'), c.isOurYearRow_('II Year')],
  term: [c.isTermRow_('MBA 2026-28, PhD26 T-II'), c.isTermRow_('MBA 2026-28 T-III'), c.isTermRow_('MBA 2025-27 Term-V')]
}));
t.ok(c1.problems.length === 0, 'no problems reported' + (c1.problems.length ? ': ' + c1.problems.join(' | ') : ''));
t.ok(Object.keys(c1.roster).length === 7, 'STUDENTS: 7 students (the pasted header row is skipped)');
t.ok(c1.roster.MBA26903[0] === 'BIMAL EXAMPLE', 'tab-separated lines read, double spaces collapsed');
t.ok(c1.roster.MBA26906[1] === '', 'a line with no section keeps the student, with no section');
t.ok(c1.creator === 'MBA26901' && c1.sac.MBA26901.label === '✦ Maintainer', 'the maintainer is added to the SAC team automatically');
t.ok(c1.sac.MBA26902.label === 'SAC · POC' && c1.sac.MBA26904.label === 'SAC', 'poc / member roles map to their badges');
t.ok(c1.start.getTime() === new Date(2026, 8, 14).getTime() && c1.end.getTime() === new Date(2027, 0, 11).getTime(),
  'firstDay..lastDay become the window, lastDay included (end is the day after)');
t.ok(c1.quiz === 'https://docs.google.com/spreadsheets/d/e/2PACX-TESTSCHEDULEDOC/pub?gid=111&single=true&output=csv',
  'a "Web page" (pubhtml) publish link is turned into its CSV form');
t.ok(c1.mid === 'https://docs.google.com/spreadsheets/d/e/2PACX-TESTSCHEDULEDOC/pub?gid=222&single=true&output=csv',
  'a CSV publish link is kept as is');
t.ok(c1.sheet === 'TESTMIRRORSHEETID0123456789abcdef', 'the timetable spreadsheet id is taken from its normal link');
t.ok(c1.endterm === c1.pending, 'a blank source is "not set"');
t.ok(c1.reps.length === 3 && c1.reps[1].name === 'Bimal Example' && c1.reps[2].sec === '',
  'SUBJECT_REPS: names title-cased, "-" means the whole course');
t.ok(c1.site.outlines.ECO[0].id === 'TESTFILEIDECO0123456789' && c1.site.outlines.FIN[0].id === 'TESTFILEIDFIN0123456789',
  'course outlines accept a Drive link or a bare id');
t.ok(c1.info.TOUR.onlyFor.join() === 'MBATM', 'onlyFor is kept, upper-cased');
t.ok(c1.prev.calendarName === '' && c1.prev.label === 'the previous term', 'no previous term on a first install');
t.ok(c1.year.join() === 'true,true,false,false', 'yearTags keep "Ist year" / "1st Year", ignoreYearTags drop "2nd Year" / "II Year"');
t.ok(c1.term.join() === 'true,false,false', 'termTags keep T-II; ignoreTermTags stop T-III; Term-V never matches');
t.ok(/Test Maintainer/.test(c1.credit) && /created by <a href="https:\/\/www\.linkedin\.com\/in\/aniketh-hotagi\/"/.test(c1.credit),
  'the sign-in card credits the SAC, the maintainer and the creator');
t.ok(c1.site.creator.name === 'Aniketh Hotagi', 'the page is told who created TermSync');

t.section('typos are reported, never thrown');
const typo = BASE
  .replace('lastDay:  "2027-01-10"', 'lastDay:  "10-01-2027"')
  .replace('quizSchedule:     "https://docs.google.com/spreadsheets/d/e/2PACX-TESTSCHEDULEDOC/pubhtml?gid=111&single=true"',
           'quizSchedule:     "https://docs.google.com/spreadsheets/d/ANORDINARYSHEETLINK0123456789/edit"')
  .replace('MBA26904, member', 'MBA26904, captain')
  .replace('"ECO":  { name: "Economics for Managers",   area: "Economics",       credits: 3 }',
           '"ECO":  { name: "Economics for Managers",   area: "Economics",       credits: "three" }')
  .replace('MBA26905\tDEV EXAMPLE\tD', 'MBA26905')
  .replace('<script>', '');
const c2 = run(typo, c => ({ problems: c.SETTINGS_PROBLEMS_.slice(), win: [c.TERM_CONFIG_.syncWindowStart, c.TERM_CONFIG_.syncWindowEnd],
  quiz: c.QUIZ_CSV_URL, pending: c.PENDING_URL_, role: c.SAC_ROLES_.MBA26904.label, report: c.settingsReport_().join('\n'),
  fetch: c.fetchAndCleanAdminData({ triggerUid: 'x' }) }));
t.ok(!c2.threw, 'loading and fetching still work' + (c2.threw ? ': ' + c2.threw : ''));
t.ok(c2.problems.some(p => /firstDay \/ lastDay/.test(p)) && c2.win[1] > c2.win[0], 'a bad date: reported, and a usable window is used meanwhile');
t.ok(c2.quiz === c2.pending && c2.problems.some(p => /quizSchedule is an ordinary spreadsheet link/.test(p)),
  'an ordinary sheet link where a published one belongs: reported and ignored');
t.ok(c2.role === 'SAC' && c2.problems.some(p => /maintainer, poc or member/.test(p)), 'an unknown role: reported, treated as member');
t.ok(c2.problems.some(p => /credits must be a number/.test(p)), 'credits that are not a number: reported');
t.ok(c2.problems.some(p => /could not read "MBA26905"/.test(p)), 'a roster line with no name: reported');
t.ok(/✖ FIX THESE/.test(c2.report), '✓ Check settings lists them under "FIX THESE"');

t.section('a previous term pointing at this term\'s own calendar');
const same = BASE.replace('var PREVIOUS_TERM = { name: "", calendarName: "", firstDay: "", lastDay: "" };',
  'var PREVIOUS_TERM = { name: "Oops", calendarName: "IIM Sirmaur – Term 2", firstDay: "2026-06-01", lastDay: "2026-09-13" };');
const c3 = run(same, c => ({ name: c.PREVIOUS_TERM_.calendarName, problems: c.SETTINGS_PROBLEMS_.slice() }));
t.ok(c3.name === '' && c3.problems.some(p => /must differ/.test(p)),
  'is refused — otherwise the new term\'s own events would be crossed out');

t.section('an older config.gs missing the optional blocks');
const minimal = BASE.replace(/var SAC_TEAM = `[\s\S]*?`;/, '').replace(/var SUBJECT_REPS = `[\s\S]*?`;/, '')
  .replace(/var COURSE_OUTLINES = \{[\s\S]*?\n\};/, '').replace(/var COURSE_EVALUATION = \{[\s\S]*?\n\};/, '')
  .replace('var TEST_ONLY_FOR = [];', '').replace(/var SIT_IN_COURSES = \{\s*\};/, '');
const c4 = run(minimal, c => ({ sac: Object.keys(c.SAC_ROLES_), evals: Object.keys(c.COURSE_EVAL_).length, site: c.siteSettings_() }));
t.ok(!c4.threw && c4.sac.join() === 'MBA26901' && c4.evals === 0, 'still loads; only the maintainer has a role');

t.done('Settings verified');
