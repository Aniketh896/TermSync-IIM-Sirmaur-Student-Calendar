// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  TermSync — config.gs                                                       ║
// ║  Created by Aniketh Hotagi · https://www.linkedin.com/in/aniketh-hotagi/    ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  THIS IS THE ONLY FILE YOU EDIT.                                             ║
// ║                                                                              ║
// ║  Everything about YOUR batch and YOUR term lives here. code.gs and           ║
// ║  Index.html never need to change — when a newer version of TermSync comes    ║
// ║  out, you replace those two files and keep this one.                         ║
// ║                                                                              ║
// ║  In the Apps Script editor this file must sit ABOVE code.gs in the file      ║
// ║  list (docs/SETUP.md, Step 4 explains how). If it is below, the app stops    ║
// ║  with a message saying so — nothing breaks.                                  ║
// ║                                                                              ║
// ║  PRIVACY: once you fill in the roster below, this file contains your         ║
// ║  batchmates' names and roll numbers. Keep YOUR filled-in copy in Apps        ║
// ║  Script (and on your own computer). Never upload it to a public GitHub repo. ║
// ║                                                                              ║
// ║  After every change: press Save (💾), then Deploy → Manage deployments →     ║
// ║  ✏️ → New version → Deploy. Then, from the spreadsheet, run                   ║
// ║  📊 Tool Stats → ✓ Check settings. It tells you in plain English if          ║
// ║  anything here is wrong or missing.                                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// How to read this file
// ─────────────────────
// • Lines starting with // are notes for you. The app ignores them.
// • Text in "double quotes" is a value you can change. Keep the quotes.
// • Keep every comma and bracket exactly where it is. If you are unsure, ask the
//   AI helper (see SETUP_WITH_AI.md) to make the change for you.
// • Dates are always written "YYYY-MM-DD", e.g. "2026-12-14".
// • Where it says "leave blank", write two quote marks with nothing between: ""


// ═══════════════════════════════════════════════════════════════════════════════
// 1 · THIS TERM
// ═══════════════════════════════════════════════════════════════════════════════
var THIS_TERM = {

  // What the app calls this term. Shown at the top of the page: "Term 2 · Batch 26-28".
  name: "Term 2",
  batch: "Batch 26-28",

  // The Google Calendar the app creates in every student's account. Use a NEW name
  // every term, so last term's calendar is left alone. Never rename it mid-term:
  // students would end up with two calendars.
  calendarName: "IIM Sirmaur – Term 2",

  // The app only adds, checks and removes events between these two dates (both
  // included). Start a week or two before the first class; end a few weeks after
  // the last end-term exam. Two neighbouring terms may overlap — that is fine.
  firstDay: "2026-09-14",
  lastDay:  "2027-01-10",

  // HOW STUDENTS GET THEIR COURSES — pick one:
  //   "section"   First year. Everyone takes the core courses with their own section
  //               (from the STUDENTS list below). The app ticks them automatically.
  //   "electives" Second year. Read from the institute's published elective
  //               allotment sheet (DATA_SOURCES.electivesSummary below).
  //   "pick"      Students tick their own courses by hand.
  courseSelection: "section",

  // Which rows of the office's timetable sheet belong to YOUR batch. The sheet has a
  // "Year/Batch" column shared by both years. Write words that appear in YOUR rows'
  // cells. Spaces and capital letters don't matter.
  //   ⚠ Matching is "contains", so a short word can catch the other year too —
  //   "IYEAR" is inside "IIYEAR". Put such words in ignoreYearTags; those are checked
  //   first. ✓ Check settings shows which cells were kept and which were ignored.
  yearTags:       ["1STYEAR", "ISTYEAR"],
  ignoreYearTags: ["2NDYEAR", "IIYEAR"],

  // Which rows of the quiz and exam sheets belong to THIS term. Those sheets have a
  // "Batch / Term" column ("MBA 2026-28 T-I", "… 2025-27 Term-IV"). Same rules as
  // above: termTags = words in this term's cells; ignoreTermTags = words that would
  // otherwise also match a NEIGHBOURING term ("T-I" is inside "T-II", "T-III" and
  // "T-IV"!). docs/NEW_TERM.md has a ready-made table for Terms I–VI.
  termTags:       ["TERM-II", "TERMII", "T-II"],
  ignoreTermTags: ["TERM-III", "TERMIII", "T-III"],

  // This term exactly as the published Academic Calendar sheet writes it in its
  // "Term" column (Roman numerals there): "Term I", "Term II", … "Term VI".
  academicCalendarTerm: "Term II",

  // Backup copy of the key dates, used only when the Academic Calendar sheet can't
  // be read. Copy them from the official academic calendar.
  // ⚠ The dates below are EXAMPLES — replace them with your term's real ones.
  examWindows: [
    { label: "Mid-term exams", start: "2026-10-26", end: "2026-10-30" },
    { label: "End-term exams", start: "2026-12-14", end: "2026-12-22" }
  ],
  termBreak:     { label: "Term break", start: "2026-12-23", end: "2027-01-03" },
  nextTermStart: "2027-01-04"
};


// ═══════════════════════════════════════════════════════════════════════════════
// 2 · LAST TERM  (only used when you move the batch from one term to the next)
// ═══════════════════════════════════════════════════════════════════════════════
// When a new term starts, copy the OLD values of THIS_TERM.name, calendarName,
// firstDay and lastDay here BEFORE you change THIS_TERM. The app then crosses out
// last term's events (it never deletes them) and carries every student over to the
// new calendar automatically — nobody has to set anything up again.
// The very first time you set TermSync up, leave all four blank.
var PREVIOUS_TERM = {
  name:         "",
  calendarName: "",
  firstDay:     "",
  lastDay:      ""
};


// ═══════════════════════════════════════════════════════════════════════════════
// 3 · YOUR INSTITUTE
// ═══════════════════════════════════════════════════════════════════════════════
var INSTITUTE = {
  name: "IIM Sirmaur",
  // Only accounts ending in @<this> can open the app.
  emailDomain: "iimsirmaur.ac.in",
  // Links put on the class where course feedback is collected. Leave blank to skip.
  feedbackFormUrl: "https://olt.iimsirmaur.ac.in/",
  oltPortalUrl:    "https://olt.iimsirmaur.ac.in/",
  // The SAC's LinkedIn page, linked from the footer and the PDF.
  sacLinkedIn: "https://www.linkedin.com/company/saciimsirmaur",
  // The little icon on the browser tab. Must be a direct link to an image file.
  faviconUrl: "https://ik.imagekit.io/syustaging/SYU_PREPROD/Logo_t9Fb5PmaO.webp?tr=w-128,f-png"
};


// ═══════════════════════════════════════════════════════════════════════════════
// 4 · YOU — the person who runs TermSync for this batch
// ═══════════════════════════════════════════════════════════════════════════════
// Your name and LinkedIn appear in the footer ("SAC × <your name>"). Your roll gets
// the ✦ Maintainer badge, the "Force fetch now" button and the build warnings.
// Your roll must also be in the STUDENTS list below.
var MAINTAINER = {
  name:     "YOUR NAME",
  roll:     "MBA26XXX",
  linkedin: "https://www.linkedin.com/in/your-profile/"
};


// ═══════════════════════════════════════════════════════════════════════════════
// 5 · WHERE THE INSTITUTE'S DATA COMES FROM
// ═══════════════════════════════════════════════════════════════════════════════
// Paste links exactly as you get them. Anything left blank simply switches that
// feature off — only the timetable is required.
//
// TWO KINDS OF LINK:
//   • A normal spreadsheet link (…/spreadsheets/d/<long id>/edit…). Used for the
//     timetable. Your account only needs VIEW access to it.
//   • A "Publish to web" link to ONE TAB (…/spreadsheets/d/e/2PACX-…/pub?gid=…).
//     Used for everything else. Whoever owns the sheet makes it with
//     File → Share → Publish to web → choose the tab → Publish.
//     Either the "Web page" or the "CSV" version of the link works.
var DATA_SOURCES = {

  // REQUIRED. The PGP office's timetable spreadsheet (one row per class, with
  // columns Date, Day, StartTime, EndTime, Year/Batch, Code, Grp, Faculty,
  // Session#, Classroom …). Ask the office to share it with you as Viewer.
  timetableSheet: "",
  timetableTab:   "Timetable",      // the tab's name inside that spreadsheet

  // Published tabs (optional). Each one adds a feature when set.
  quizSchedule:     "",   // "Quiz Schedule" tab → 📝 quizzes in the calendar
  midTermSchedule:  "",   // mid-term exam tab (e.g. "T-II_MTES") → 📕 mid-terms
  endTermSchedule:  "",   // end-term exam tab (e.g. "T-II_ETES") → 📕 end-terms
  academicCalendar: "",   // Academic Calendar tab → exam weeks & term break dates
  courseCatalogue:  "",   // "Course Catalogue" tab → cross-checks the COURSES list
  marksStatus:      "",   // "Result Receipt Record" → ✅ when marks reach OLT
  electivesSummary: "",   // elective allotment "Summary" tab (second year only)
  subjectRepsSheet: "",   // a published Subject Reps tab, if one ever exists

  // Usually leave these blank: the timetable sheet already marks guest lectures and
  // feedback sessions. Set them only if the institute publishes separate tabs.
  guestLectures:    "",
  feedbackSchedule: "",

  // Advanced, usually blank: a published CSV of the timetable instead of the sheet.
  timetablePublishedCsv: ""
};


// ═══════════════════════════════════════════════════════════════════════════════
// 6 · COURSES THIS TERM
// ═══════════════════════════════════════════════════════════════════════════════
// One line per course. The CODE (left) must be written exactly as it appears in the
// "Code" column of the timetable sheet — a course missing here is left out of
// everyone's calendar.
//   name     full course name
//   area     the area it belongs to (shown in the app; any text)
//   credits  number of credits
// Optional, add only when needed:
//   required: true          the picker insists every student selects it. Leave it
//                           out in "section" mode — the app ticks courses itself.
//   onlyFor: ["MBATM"]      only students whose roll starts with one of these get it
//                           (e.g. MBA-TM-only courses). Used by "section" mode.
var COURSES = {
  // "CODE":  { name: "Full course name",            area: "Area",       credits: 3 },
  "EXMPL1":   { name: "Example Course One",           area: "Example",    credits: 3 },
  "EXMPL2":   { name: "Example Course Two",           area: "Example",    credits: 3 }
};


// ═══════════════════════════════════════════════════════════════════════════════
// 7 · STUDENTS IN YOUR BATCH
// ═══════════════════════════════════════════════════════════════════════════════
// One student per line:   ROLL NUMBER, FULL NAME, SECTION
// Paste straight from the institute's roll-number / section allotment sheet:
// select the three columns in Google Sheets or Excel, copy, and paste between the
// two ` marks below (tabs or commas between the columns both work).
// Lines starting with # are ignored.
var STUDENTS = `
# MBA26901, FIRST STUDENT NAME, A
# MBA26902, SECOND STUDENT NAME, B
`;


// ═══════════════════════════════════════════════════════════════════════════════
// 8 · THE SAC TEAM
// ═══════════════════════════════════════════════════════════════════════════════
// These people get a badge in the app and can open the 🎛️ Admin panel (usage, the
// change log, wrong-entry reports, the student directory). One per line:
//     ROLL, ROLE
// ROLE is one of:  maintainer   (you — "✦ Maintainer" badge)
//                  poc          ("SAC · POC" badge)
//                  member       ("SAC" badge)
// Your own roll is added as maintainer automatically.
var SAC_TEAM = `
# MBA26910, poc
# MBA26920, member
`;


// ═══════════════════════════════════════════════════════════════════════════════
// 9 · SUBJECT REPRESENTATIVES  (optional)
// ═══════════════════════════════════════════════════════════════════════════════
// One per line:   COURSE CODE, SECTION, NAME, ROLL
// SECTION is the letter for a course taught in several sections ("A"), or - when
// one rep covers the whole course. Leave empty and the app says "not published yet".
var SUBJECT_REPS = `
# EXMPL1, A, FIRST STUDENT NAME, MBA26901
# EXMPL2, -, SECOND STUDENT NAME, MBA26902
`;


// ═══════════════════════════════════════════════════════════════════════════════
// 10 · COURSE OUTLINES  (optional)
// ═══════════════════════════════════════════════════════════════════════════════
// The "📄 Course outlines" button. folder = link to the shared Drive folder; files =
// one entry per course with the link to its outline (fac = instructor, or "").
var COURSE_OUTLINES = {
  folder: "",
  files: {
    // "EXMPL1": [{ link: "https://drive.google.com/file/d/<id>/view", fac: "Prof. Name" }]
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// 11 · HOW EACH COURSE IS GRADED  (optional)
// ═══════════════════════════════════════════════════════════════════════════════
// Copied from each course outline's evaluation table. Shown in the "📊 Evaluation"
// popup, and used to tag quizzes and exams with their weight. Each course must add
// up to 100. kind: quiz, midterm, endterm, project, assignment, presentation,
// participation, case, simulation, reflection or activity (only quiz / midterm /
// endterm change calendar events — the rest are just shown).
var COURSE_EVALUATION = {
  // "EXMPL1": { total: 100, components: [
  //   { label: "Quizzes",             weight: 20, kind: "quiz" },
  //   { label: "Mid-term exam",       weight: 30, kind: "midterm" },
  //   { label: "Group project",       weight: 20, kind: "project" },
  //   { label: "End-term exam",       weight: 30, kind: "endterm" } ] }
};


// ═══════════════════════════════════════════════════════════════════════════════
// 12 · TEST MODE
// ═══════════════════════════════════════════════════════════════════════════════
// While this list has rolls in it, TermSync runs ONLY for them — everyone else's
// calendar is left completely alone. Put your own roll (and one friend's) here
// before a risky change or a new term, test, then empty it to go live: []
//
// Why: pressing Save in Apps Script changes what every student's background sync
// runs, immediately. This is the only way to try something on yourself first.
var TEST_ONLY_FOR = [];


// ═══════════════════════════════════════════════════════════════════════════════
// 13 · SIT-IN STUDENTS  (rare — leave empty unless arranged with an instructor)
// ═══════════════════════════════════════════════════════════════════════════════
// A student attending a course's classes without taking its quizzes or exams.
//   "ROLL": { classesOnly: ["CODE"], autoSelect: true, allowOverlaps: true }
// classesOnly   courses whose classes sync but quizzes/exams don't
// autoSelect    add those courses to the student's selection for them
// allowOverlaps let this student pick two courses that meet at the same time
// Empty it at the start of every term.
var SIT_IN_COURSES = {
};
