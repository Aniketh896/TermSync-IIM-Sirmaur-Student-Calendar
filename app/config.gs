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
// What you fill in
// ────────────────
//   ★ REQUIRED     The app can't work without it.
//   ◆ RECOMMENDED  Works without it, but students miss out (quizzes, exams, SAC panel).
//   ○ OPTIONAL     Nice to have. Leave it as it is and that feature stays off.
//   ✓ ALREADY FILLED IN  Correct for IIM Sirmaur — leave it as it is.
//
//   The minimum for a working first install: THIS_TERM (number, batch, dates),
//   MAINTAINER, DATA_SOURCES.timetableSheet, COURSES and STUDENTS.
//
//   Every new term: THIS_TERM (new number and dates), COURSES, and any new links.
//
// What you never change
// ─────────────────────
//   • The NAMES on the left of each setting (THIS_TERM, firstDay, …) — only the
//     values after the colon or equals sign.
//   • The other files: code.gs, Index.html, appsscript.json.
//   • THIS_TERM.number in the middle of a term — changing it moves every student
//     to a new calendar. Change it only when you move to a new term.

// How to read this file
// ─────────────────────
// • Lines starting with // are notes for you. The app ignores them.
// • Text in "double quotes" is a value you can change. Keep the quotes.
// • Keep every comma and bracket exactly where it is. If you are unsure, ask the
//   AI helper (see SETUP_WITH_AI.md) to make the change for you.
// • Dates are always written "YYYY-MM-DD", e.g. "2026-12-14".
// • Where it says "leave blank", write two quote marks with nothing between: ""


// ═══════════════════════════════════════════════════════════════════════════════
// 1 · THIS TERM                                         ★ REQUIRED — every term
// ═══════════════════════════════════════════════════════════════════════════════
var THIS_TERM = {

  // WHICH TERM: 1, 2 or 3 in first year · 4, 5 or 6 in second year.
  // From this one number TermSync works out everything that follows from it:
  //   • the name shown on the page ("Term 2") and the calendar's name
  //     ("IIM Sirmaur – Term 2") — a new calendar every term
  //   • which rows of the quiz / exam sheets are this term's ("T-II", "Term-II", …)
  //   • which rows of the office's timetable are your batch's ("Ist year" / "2nd Year")
  //   • how students get their courses:
  //       Terms 1–3  from their SECTION — every student is given the term's courses
  //                  for their own section (from STUDENTS below), already ticked
  //       Terms 4–6  from the institute's ELECTIVE allotment sheet
  //                  (DATA_SOURCES.electivesSummary); without that link, students
  //                  tick their own electives
  //   • last term's calendar, which is crossed out (never deleted) when you move on
  // ✓ Check settings shows everything it worked out.
  number: 2,

  // Shown next to the term at the top of the page: "Term 2 · Batch 26-28".
  batch: "Batch 26-28",

  // The app only adds, checks and removes events between these two dates (both
  // included). Start a week or two before the first class; end about three weeks
  // after the last end-term exam. Two neighbouring terms may overlap — that is fine.
  firstDay: "2026-09-14",
  lastDay:  "2027-01-10",

  // Backup copy of the key dates (from the official academic calendar). Used to
  // label exam weeks in the PDF; the live Academic Calendar link, if you set one in
  // DATA_SOURCES, takes priority. ⚠ These are EXAMPLES — replace them.
  examWindows: [
    { label: "Mid-term exams", start: "2026-10-26", end: "2026-10-30" },
    { label: "End-term exams", start: "2026-12-14", end: "2026-12-22" }
  ],
  termBreak:     { label: "Term break", start: "2026-12-23", end: "2027-01-03" },
  nextTermStart: "2027-01-04"

  // ── Advanced: only if ✓ Check settings shows the standard values don't fit ──
  // To use one instead of the standard value, delete the // in front of that line
  // (keep the comma it starts with).
  //
  // , name: "Term 2"
  // , calendarName: "IIM Sirmaur – Term 2"   (long dash –; never change it mid-term)
  // , courseSelection: "pick"                (or "section" / "electives")
  // , termTags: ["T-II"], ignoreTermTags: ["T-III"]     (quiz/exam "Batch / Term" words)
  // , yearTags: ["ISTYEAR"], ignoreYearTags: ["IIYEAR"] (timetable "Year/Batch" words)
  // , academicCalendarTerm: "Term II"        (as the Academic Calendar sheet writes it)
};


// ═══════════════════════════════════════════════════════════════════════════════
// 2 · LAST TERM                     ○ AUTOMATIC — normally leave all four blank
// ═══════════════════════════════════════════════════════════════════════════════
// When you move to a new term, TermSync crosses out last term's events (it never
// deletes them) and moves every student to the new calendar by itself. It finds
// last term's calendar from THIS_TERM.number ("… – Term 1" before "… – Term 2").
// Fill these in ONLY if last term's calendar had a name of your own choosing:
// copy last term's name, calendar name and dates here exactly.
var PREVIOUS_TERM = {
  name:         "",
  calendarName: "",
  firstDay:     "",
  lastDay:      ""
};


// ═══════════════════════════════════════════════════════════════════════════════
// 3 · YOUR INSTITUTE                         ✓ ALREADY FILLED IN — leave as it is
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
// 4 · YOU — the person who runs TermSync for this batch          ★ REQUIRED
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
//     ★ REQUIRED: timetableSheet  ·  ◆ RECOMMENDED: quiz / exam links  ·  rest optional
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
// 6 · COURSES THIS TERM                                   ★ REQUIRED — every term
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
// 7 · STUDENTS IN YOUR BATCH                       ★ REQUIRED — once per batch
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
// 8 · THE SAC TEAM                                              ◆ RECOMMENDED
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
// 9 · SUBJECT REPRESENTATIVES                         ○ OPTIONAL — every term
// ═══════════════════════════════════════════════════════════════════════════════
// One per line:   COURSE CODE, SECTION, NAME, ROLL
// SECTION is the letter for a course taught in several sections ("A"), or - when
// one rep covers the whole course. First year: usually one rep per course PER
// SECTION (ECO, A, … / ECO, B, …). Leave empty and the app says "not published yet".
// Empty it at the start of every term.
var SUBJECT_REPS = `
# EXMPL1, A, FIRST STUDENT NAME, MBA26901
# EXMPL2, -, SECOND STUDENT NAME, MBA26902
`;


// ═══════════════════════════════════════════════════════════════════════════════
// 10 · COURSE OUTLINES                                ○ OPTIONAL — every term
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
// 11 · HOW EACH COURSE IS GRADED                      ○ OPTIONAL — every term
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
// 12 · FEATURES                    ○ OPTIONAL — everything is on; switch off with false
// ═══════════════════════════════════════════════════════════════════════════════
// README → "Features you can switch off" explains each one.
var FEATURES = {
  adminDashboard:   true,   // 🎛️ Admin panel at the foot of the page, for you and SAC_TEAM:
                            //    who uses TermSync, every timetable change, the student list,
                            //    wrong-entry reports, and your tools (Force fetch, build check)
  usageStats:       true,   // the "stats" link every student can open: how many use TermSync
  usageLog:         true,   // record who enables, syncs now, stops, downloads the PDF (hidden Usage tab).
                            //    Off = nothing recorded; the stats and Usage view stay empty
  subjectReps:      true,   // the "subject reps" link and the Subject Rep badge
  courseOutlines:   true,   // the "course outlines" link (with the 📊 Evaluation pop-ups)
  pdfDownload:      true,   // "Download PDF" of the whole term
  reportWrongEntry: true    // "🚩 Report a wrong entry" — reports reach the Admin panel
};


// ═══════════════════════════════════════════════════════════════════════════════
// 13 · TEST MODE                 ○ use when testing — must be [] when you go live
// ═══════════════════════════════════════════════════════════════════════════════
// While this list has rolls in it, TermSync runs ONLY for them — everyone else's
// calendar is left completely alone. Put your own roll (and one friend's) here
// before a risky change or a new term, test, then empty it to go live: []
//
// Why: pressing Save in Apps Script changes what every student's background sync
// runs, immediately. This is the only way to try something on yourself first.
var TEST_ONLY_FOR = [];


// ═══════════════════════════════════════════════════════════════════════════════
// 14 · SIT-IN STUDENTS              ○ RARE — leave empty unless arranged with an
//      instructor; empty it every term
// ═══════════════════════════════════════════════════════════════════════════════
// A student attending a course's classes without taking its quizzes or exams.
//   "ROLL": { classesOnly: ["CODE"], autoSelect: true, allowOverlaps: true }
// classesOnly   courses whose classes sync but quizzes/exams don't
// autoSelect    add those courses to the student's selection for them
// allowOverlaps let this student pick two courses that meet at the same time
// Empty it at the start of every term.
var SIT_IN_COURSES = {
};
