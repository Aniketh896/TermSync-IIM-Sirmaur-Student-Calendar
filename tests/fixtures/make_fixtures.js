// Writes the made-up institute sheets the tests read: an office timetable in the
// real "mirror" layout, a quiz tab and a mid-term tab. Every course, person and
// room here is invented. Run it again (node tests/fixtures/make_fixtures.js) only
// if you change the shapes below; the CSVs it writes are committed.
//
// The batch: first-years, Term 2, sections A–D.
//   • five courses taught to every section separately (ECO, FIN, MKT, OPS, STAT)
//   • one lecture for the whole batch at once (LEAD — no section)
//   • one course only MBA-TM students take (TOUR — onlyFor: ["MBATM"] in the config)
// plus rows that must be IGNORED: the second-year batch's classes, "Quiz Slot"
// placeholders, a "PhD Class" row and empty slots.
const fs = require('fs');
const path = require('path');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = [['9:00 AM', '10:30 AM', '09:00 - 10:30'], ['10:45 AM', '12:15 PM', '10:45 - 12:15'],
               ['2:00 PM', '3:30 PM', '14:00 - 15:30'], ['3:45 PM', '5:15 PM', '15:45 - 17:15'],
               ['5:30 PM', '7:00 PM', '17:30 - 19:00']];
const dmy = d => d.getDate() + '-' + MON[d.getMonth()] + '-' + d.getFullYear();
const csvCell = v => /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const line = cells => cells.map(csvCell).join(',');

// Weekdays from Monday 28 Sep 2026.
const days = [];
for (let d = new Date(2026, 8, 28); days.length < 30; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
  if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d);
}

const SECTIONED = ['ECO', 'FIN', 'MKT', 'OPS', 'STAT'];
const SECTIONS = ['A', 'B', 'C', 'D'];
const HEADER = ['Date', 'Day', 'StartTime', 'EndTime', 'Timings (24 hrs format)', 'Year/Batch', 'Code', 'Grp',
                'Faculty', 'Session#', 'Classroom', 'FT/VF', 'Course-Section-Faculty', 'CR Block'];
const rows = [HEADER];
const add = (d, slot, year, code, grp, fac, session, room, note) => rows.push([
  dmy(d), DAY[d.getDay()], SLOTS[slot][0], SLOTS[slot][1], SLOTS[slot][2], year, code, grp, fac, session, room, 'FT',
  code ? [code, grp, session, fac, room].filter(Boolean).join(' ') + (note ? ' ' + note : '') : '', 'CR-1 Block']);

// Six sessions per course per section. Course c meets section s on day (c + 5k)
// in slot s, so no two of one section's classes ever share a slot.
SECTIONED.forEach((code, c) => {
  SECTIONS.forEach((sec, s) => {
    for (let k = 0; k < 6; k++) {
      const note = (code === 'FIN' && sec === 'A' && k === 2) ? '(Feedback)' : '';
      add(days[c + 5 * k], s, 'Ist year', code, sec, 'Prof. Example ' + code, k + 1, 'LH-' + (s + 1), note);
    }
  });
});
// LEAD: whole batch, slot 4 (17:30), on five days; its 3rd session is a guest lecture.
for (let k = 0; k < 5; k++) {
  add(days[2 + 5 * k], 4, 'Ist year', 'LEAD', '', 'Prof. Example Lead', k + 1, 'AUDI', k === 2 ? '(Guest Lecture)' : '');
}
// TOUR: MBA-TM only, whole group, slot 4 on four other days.
for (let k = 0; k < 4; k++) add(days[4 + 5 * k], 4, 'Ist year', 'TOUR', '', 'Prof. Example Tour', k + 1, 'LH-5', '');
// Rows that must not reach a first-year calendar.
for (let k = 0; k < 12; k++) add(days[k], k % 4, '2nd Year', 'ELEC' + (k % 3), k % 2 ? 'A' : '', 'Prof. Senior', k + 1, 'CR-' + (k % 3 + 1), '');
for (let k = 0; k < 4; k++) add(days[20 + k], 0, 'Ist year', 'Quiz Slot', SECTIONS[k], '', '', '', '');
add(days[25], 1, 'Ist year', 'PhD Class', 'A', 'Prof. Example PhD', 1, 'LH-1', '');
add(days[26], 2, 'Ist year', '', '', '', '', '', '');
fs.writeFileSync(path.join(__dirname, 'mirror.csv'), rows.map(line).join('\n') + '\n');

// Quiz tab: shared by both years, told apart by the "Batch / Term" column.
const quiz = [
  ['Quiz Schedule: MBA, MBA-TM, Term-V & II [AY 2026-27]', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Course Code', 'Course Title', 'Date', 'Day', 'StartTime', 'End Time', 'Batch / Term', 'Section/\nGroup',
   'Name of the Faculty ', 'Quiz#', '#Students', 'Exam Hall', 'Instructions', 'Duration (Min.)'],
  ['ECO', 'Economics for Managers', '9-Oct-2026', 'Fri', '1:00 PM', '1:30 PM', 'MBA 2026-28, PhD26 T-II', '-', 'Prof. Example ECO', '1', '240', 'LH-1', '', '30'],
  ['MKT', 'Marketing Basics', '13-Oct-2026', 'Tue', '1:00 PM', '1:20 PM', 'MBA 2026-28, PhD26 T-II', 'A', 'Prof. Example MKT', '1', '60', 'LH-1', 'Closed book', '20'],
  ['ELEC1', 'A Second-Year Elective', '14-Oct-2026', 'Wed', '3:00 PM', '3:30 PM', 'MBA & MBA-TM 2025-27  Term-V', '-', 'Prof. Senior', '1', '80', '', '', '30'],
  ['FIN', 'Finance Basics', '15-Oct-2026', 'Thu', '1:00 PM', '1:30 PM', 'MBA 2026-28 T-III', '-', 'Prof. Example FIN', '1', '240', '', '', '30']
];
fs.writeFileSync(path.join(__dirname, 'quiz.csv'), quiz.map(line).join('\n') + '\n');

// Mid-term tab (the per-term "T-II_MTES" layout).
const mid = [
  ['Midterm Examination Schedule: MBA (2026-28), Term-II', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Batch / Term', 'CourseCode', 'Course Title', 'Date', 'Day', 'Session', 'Start Time', 'End Time',
   'Name of the Faculty ', '#Students', 'Exam Hall', 'Exam Type', 'Instructions'],
  ['MBA 2026-28 T-II', 'STAT', 'STATISTICS', '26/Oct/26', 'Mon', 'Morning', '10:00 AM', '12:00 PM', 'Prof. Example STAT', '240', 'AUDI', 'Closed Book', 'Calculator allowed.'],
  ['MBA 2026-28 T-II', 'OPS', 'OPERATIONS', '27/Oct/26', 'Tue', 'Morning', '10:00 AM', '12:00 PM', 'Prof. Example OPS', '240', 'AUDI', 'Closed Book', '']
];
fs.writeFileSync(path.join(__dirname, 'midterm.csv'), mid.map(line).join('\n') + '\n');
console.log('mirror rows: ' + (rows.length - 1) + ', quiz rows: ' + (quiz.length - 2) + ', mid-term rows: ' + (mid.length - 2));
