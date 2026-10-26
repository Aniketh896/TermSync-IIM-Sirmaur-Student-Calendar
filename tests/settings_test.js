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
t.ok(c1.prev.calendarName === 'IIM Sirmaur – Term 1' && c1.prev.auto === true,
  'last term\'s calendar is worked out from the number (harmless on a first install)');
t.ok(c1.year.join() === 'true,true,false,false', 'yearTags keep "Ist year" / "1st Year", ignoreYearTags drop "2nd Year" / "II Year"');
t.ok(c1.term.join() === 'true,false,false', 'termTags keep T-II; ignoreTermTags stop T-III; Term-V never matches');
t.ok(/Test Maintainer/.test(c1.credit) && /created by <a href="https:\/\/www\.linkedin\.com\/in\/aniketh-hotagi\/"/.test(c1.credit),
  'the sign-in card credits the SAC, the maintainer and the creator');
t.ok(c1.site.creator.name === 'Aniketh Hotagi', 'the page is told who created TermSync');

t.section('THIS_TERM.number sets everything that follows from it');
const expect = {
  1: { tags: 'TERM-I,TERMI,T-I,T-1', year: '1STYEAR', mode: 'section', ac: 'Term I', prev: '' },
  2: { tags: 'TERM-II,TERMII,T-II,T-2', year: '1STYEAR', mode: 'section', ac: 'Term II', prev: 'IIM Sirmaur – Term 1' },
  3: { tags: 'TERM-III,TERMIII,T-III,T-3', year: '1STYEAR', mode: 'section', ac: 'Term III', prev: 'IIM Sirmaur – Term 2' },
  4: { tags: 'TERM-IV,TERMIV,T-IV,T-4', year: '2NDYEAR', mode: 'electives', ac: 'Term IV', prev: 'IIM Sirmaur – Term 3' },
  5: { tags: 'TERM-V,TERMV,T-V,T-5,T5', year: '2NDYEAR', mode: 'electives', ac: 'Term V', prev: 'IIM Sirmaur – Term 4' },
  6: { tags: 'TERM-VI,TERMVI,T-VI,T-6,T6', year: '2NDYEAR', mode: 'electives', ac: 'Term VI', prev: 'IIM Sirmaur – Term 5' }
};
// "Batch / Term" cells written the ways the institute's sheets write them, all
// for this batch (2026-28), and which term each belongs to.
const CELLS = { 'MBA 2026-28, PhD26 T-I': 1, 'MBA 2026-28 Term-II': 2, 'MBA 2026-28 T-III': 3,
  'MBA, MBA-TM 2026-28 T-4': 4, 'MBA & MBA-TM 2026-28  Term-V': 5, 'MBA 2026-28 Term-VI': 6 };
Object.keys(expect).forEach(n => {
  const e = expect[n];
  const r = run(BASE.replace('number: 2,', 'number: ' + n + ','), c => ({
    label: c.TERM_CONFIG_.label, cal: c.TERM_CONFIG_.calendarName, tags: c.TERM_CONFIG_.quizTermTags.join(),
    year: c.GUEST_YEAR_TAGS_[0], mode: c.COURSE_SELECTION_, ac: c.TERM_CONFIG_.academicTerm, prev: c.PREVIOUS_TERM_.calendarName,
    kept: Object.keys(CELLS).filter(cell => c.isTermRow_(cell)).map(cell => CELLS[cell]).join() }));
  t.ok(r.label === 'Term ' + n && r.cal === 'IIM Sirmaur – Term ' + n && r.tags === e.tags && r.year === e.year &&
       r.mode === e.mode && r.ac === e.ac && r.prev === e.prev,
    'Term ' + n + ': "' + r.cal + '", ' + r.mode + ', ' + r.year + ', "' + r.ac + '", previous "' + r.prev + '"');
  t.ok(r.kept === String(n), '  and of six real Batch/Term cells it keeps only Term ' + n + '\'s (kept: ' + r.kept + ')');
});
const guard = run(BASE.replace('number: 2,', 'number: 5,'), c => ({
  other: c.isTermRow_('MBA & MBA-TM 2025-27  Term-V'), ours: c.isTermRow_('MBA 2026-28 Term-V'),
  noBatch: c.isTermRow_('Term-V'), ay: c.isTermRow_('AY 2026-27 Term-V') }));
t.ok(guard.other === false && guard.ours === true && guard.noBatch === true && guard.ay === true,
  'a row naming another batch (2025-27) is never kept; no batch or an academic year ("AY 2026-27") is fine');
const years = run(BASE, c => ['Ist year', '1st Year', 'First Year', 'Year 1', 'I Year', '2nd Year', 'II Year',
  'Second Year', 'Year 2', 'Ist year (2025-27)'].map(v => v + '=' + c.isOurYearRow_(v)).join(', '));
t.ok(years === 'Ist year=true, 1st Year=true, First Year=true, Year 1=true, I Year=true, 2nd Year=false, ' +
  'II Year=false, Second Year=false, Year 2=false, Ist year (2025-27)=false',
  'first year: every common spelling of the year is kept, every second-year one ignored (' + years + ')');
const years2 = run(BASE.replace('number: 2,', 'number: 4,'), c => ['2nd Year', 'II Year', 'Second Year', 'IInd year',
  'Ist year', 'First Year'].map(v => c.isOurYearRow_(v)).join());
t.ok(years2 === 'true,true,true,true,false,false', 'second year: the mirror image (' + years2 + ')');

const over = run(BASE.replace('number: 2,', 'number: 2,\n  courseSelection: "pick",\n  calendarName: "My Calendar",'),
  c => ({ mode: c.COURSE_SELECTION_, cal: c.TERM_CONFIG_.calendarName, prev: c.PREVIOUS_TERM_.calendarName,
          report: c.settingsReport_({ offline: true, skipTimetable: true }).join('\n') }));
t.ok(over.mode === 'pick' && over.cal === 'My Calendar', 'a value written in THIS_TERM overrides the standard one');
t.ok(over.prev === '' && /won't be crossed out/.test(over.report),
  'with a calendar name of your own, last term\'s is not guessed — and ✓ Check settings says so');
t.ok(run(BASE.replace('number: 2,', 'number: 7,'), c => c.SETTINGS_PROBLEMS_.join(' ')).indexOf('must be 1, 2, 3, 4, 5 or 6') !== -1,
  'number 7 is reported');

t.section('how cells are read — the same rules for every sheet');
const R = run(BASE, c => {
  const sp = v => c.splitSectionCell_(v).join('|');
  return {
    sections: ['A', 'Sec A', 'Section-B', ' c ', 'A & B', 'A,B', 'A/B', 'A+B', 'A and B', 'Sec A & B', 'AB',
               '-', '', 'All', 'Both', 'All sections', 'Common', 'A & TM', 'TM', 'A1'].map(v => JSON.stringify(v) + '=' + sp(v)).join(' '),
    codes: ['ECO', 'eco', ' Eco ', 'E.C.O', 'STAT', 'stat ', 'NOPE'].map(v => c.canonicalCourseCode_(v, true)).join(','),
    times: ['2:00 PM', '2:00:00 PM', '14:00', '14.00', '1400', '1400 hrs', '9:30 a.m.', '9.00 AM', '9:30am', '12:00 noon']
      .map(v => { try { const t = c.parseTime_(v); return t.h + ':' + t.m; } catch (e) { return 'x'; } }).join(','),
    dates: ['28-Sep-2026', '28/09/2026', '28/Sep/26', '2026-09-28', 'Mon, 28 Sep 2026', 'Monday 28 September 2026',
            'Sep 28, 2026', 'September 28 2026', '28th Sep 2026', '31-Sep-2026', 'sometime']
      .map(v => { const d = c.parseQuizDate_(v); return d ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : 'x'; }).join(','),
    terms: ['Term I', 'Term II', 'Term-II', 'TERM 2', 'T-II', 'Term III', 'Term IV', 'Term V', 'Term VI', 'Term 6', 'Terminal', 'Batch']
      .map(v => c.termNumberOf_(v)).join(','),
    rolls: ['MBA26901', 'MBATM26901', 'MBATTHM26901', 'PHD26904', 'MBA24999R', 'EMBA26910', 'ROLL NO', '12345', 'Total']
      .map(v => c.ELECTIVE_ROLL_PATTERN_.test(v) ? 'y' : 'n').join('')
  };
});
t.ok(R.sections === '"A"=A "Sec A"=A "Section-B"=B " c "=C "A & B"=A|B "A,B"=A|B "A/B"=A|B "A+B"=A|B "A and B"=A|B ' +
  '"Sec A & B"=A|B "AB"=A|B "-"= ""= "All"= "Both"= "All sections"= "Common"= "A & TM"=A&TM "TM"=TM "A1"=A1',
  'sections: "Sec A" is A; "A & B" (any separator) is A and B; "-"/"All"/"Both" is everyone; anything else is kept whole\n      ' + R.sections);
t.ok(R.codes === 'ECO,ECO,ECO,ECO,STAT,STAT,NOPE', 'course codes: case, spaces and dots don\'t matter (' + R.codes + ')');
t.ok(R.times === '14:0,14:0,14:0,14:0,14:0,14:0,9:30,9:0,9:30,x',
  'times: "2:00:00 PM", "14.00", "1400 hrs", "9:30 a.m." all read; nonsense still refused (' + R.times + ')');
t.ok(R.dates === '2026-9-28,2026-9-28,2026-9-28,2026-9-28,2026-9-28,2026-9-28,2026-9-28,2026-9-28,2026-9-28,x,x',
  'dates: day-first, month-first, ISO and with a weekday all read; 31 September is refused, not rolled over (' + R.dates + ')');
t.ok(R.terms === '1,2,2,2,2,3,4,5,6,6,0,0', 'term labels: "Term II", "Term-2", "T-II" are all Term 2 (' + R.terms + ')');
t.ok(R.rolls === 'yyyyyynnn', 'roll numbers: any programme prefix, repeat-student suffix; headers and totals are not rolls (' + R.rolls + ')');
const six = run(BASE.replace('MBA26905\tDEV EXAMPLE\tD', 'MBA26905\tDEV EXAMPLE\tF'),
  c => c.splitSectionCell_('A & F').join('|') + ' ' + c.splitSectionCell_('AF').join('|'));
t.ok(six === 'A|F A|F', 'a batch with a section F splits "A & F" too — sections come from the roster, not a fixed A–E');
const only = run(BASE.replace('"TOUR": { name: "Tourism Foundations",      area: "Tourism",         credits: 3, onlyFor: ["MBATM"] }',
  '"TOUR": { name: "Tourism Foundations", area: "Tourism", credits: 3, onlyFor: ["MBA"] }'),
  c => [c.rollMayTakeCourse_('MBA26901', 'TOUR'), c.rollMayTakeCourse_('MBATM26901', 'TOUR')].join());
t.ok(only === 'true,false', 'onlyFor: ["MBA"] means MBA students only — not MBA-TM, whose roll merely starts with MBA');

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
