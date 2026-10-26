// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  TermSync — code.gs                                                         ║
// ║  Created by Aniketh Hotagi · https://www.linkedin.com/in/aniketh-hotagi/    ║
// ║                                                                              ║
// ║  You should not need to edit this file. Every setting for your batch and     ║
// ║  term is in config.gs, which must sit ABOVE this file in the Apps Script     ║
// ║  editor. To change how the app works, see docs/CHANGING_THE_CODE.md.         ║
// ║                                                                              ║
// ║  Comments that mention Term 4 / Term 5 or specific courses describe the     ║
// ║  batch TermSync was first built for (Batch 25-27). They explain why the code ║
// ║  is the way it is; nothing below depends on those terms.                     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ── Settings (config.gs) → the names the rest of this file uses ───────────────
// Apps Script runs its files top to bottom in the order the editor lists them, so
// config.gs has to come first. Without it nothing below can work; say so plainly
// instead of failing on some unrelated line further down.
if (typeof THIS_TERM === "undefined" || typeof DATA_SOURCES === "undefined" ||
    typeof COURSES === "undefined" || typeof STUDENTS === "undefined") {
  throw new Error("TermSync can't find its settings. Make sure the file config.gs exists and is listed " +
    "ABOVE code.gs in the Apps Script editor (docs/SETUP.md, Step 4), then press Save.");
}

// The optional blocks of config.gs, read defensively so a config.gs from an older
// version (missing a block that was added later) still loads.
var CFG_ = {
  institute:     (typeof INSTITUTE !== "undefined" && INSTITUTE) || {},
  previousTerm:  (typeof PREVIOUS_TERM !== "undefined" && PREVIOUS_TERM) || {},
  maintainer:    (typeof MAINTAINER !== "undefined" && MAINTAINER) || {},
  sacTeam:       (typeof SAC_TEAM !== "undefined" && SAC_TEAM) || "",
  subjectReps:   (typeof SUBJECT_REPS !== "undefined" && SUBJECT_REPS) || "",
  outlines:      (typeof COURSE_OUTLINES !== "undefined" && COURSE_OUTLINES) || {},
  evaluation:    (typeof COURSE_EVALUATION !== "undefined" && COURSE_EVALUATION) || {},
  testOnlyFor:   (typeof TEST_ONLY_FOR !== "undefined" && Array.isArray(TEST_ONLY_FOR)) ? TEST_ONLY_FOR : [],
  sitIn:         (typeof SIT_IN_COURSES !== "undefined" && SIT_IN_COURSES) || {},
  features:      (typeof FEATURES !== "undefined" && FEATURES) || {}
};

// Every value read from config.gs that had to be corrected or ignored. Loading
// never throws over a bad value — a typo saved in config.gs must not make every
// student's background sync fail (Google emails each of them a failure report) —
// so problems are collected here and reported by ✓ Check settings and the fetch.
var SETTINGS_PROBLEMS_ = [];

function settingsProblem_(msg) {
  if (SETTINGS_PROBLEMS_.indexOf(msg) === -1) SETTINGS_PROBLEMS_.push(msg);
}

function settingText_(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

// "2026-09-14" → that local midnight, plus `addDays` (lastDay is inclusive in
// config.gs, while every window in this file has an exclusive end). Returns null
// for anything that is not a real calendar date.
function settingDate_(value, addDays) {
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(settingText_(value));
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  var out = new Date(y, mo, d);
  if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
  return addDays ? new Date(y, mo, d + addDays) : out;
}

// Tags are matched against cells upper-cased with every space removed, so the
// list is normalised the same way: "Term-V" and "TERM - V" both become "TERM-V".
function settingTags_(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var t = settingText_(list[i]).toUpperCase().replace(/\s+/g, "");
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  return out;
}

// The lines of a pasted text block (STUDENTS, SAC_TEAM, SUBJECT_REPS), each split
// into trimmed cells. A line copied from a spreadsheet arrives tab-separated, a
// typed one comma-separated; both work. Blank lines and # / // notes are skipped.
function settingRows_(text) {
  var out = [];
  var lines = settingText_(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#" || line.indexOf("//") === 0) continue;
    var cells = (line.indexOf("\t") !== -1 ? line.split("\t") : line.split(","))
      .map(function (c) { return c.trim(); });
    out.push({ cells: cells, line: line });
  }
  return out;
}

function settingWindow_(term) {
  var start = settingDate_(term.firstDay, 0);
  var end = settingDate_(term.lastDay, 1);
  if (!start || !end || end <= start) return null;
  return { start: start, end: end };
}

// ── The standard values for each term (config.gs → THIS_TERM.number) ─────────
// Most of what changes from one term to the next follows from the term's number:
// its name, its calendar's name, how the quiz / exam sheets write it, which year's
// timetable rows are this batch's, and how courses are chosen. So config.gs only
// needs the number; any of these can still be set explicitly in THIS_TERM, and an
// explicit value always wins (a config.gs written before `number` existed, which
// spells everything out, behaves exactly as before).
//
// Tag matching is by substring, so each term's ignore list names the neighbours
// that contain its tags ("T-I" is inside "T-II", "T-III" and "T-IV"). The quiz and
// exam sheets have written terms as "T-II", "Term-V", "T-4", "T5"; ✓ Check
// settings shows every value found and which were kept.
var TERM_ROMAN_ = ["", "I", "II", "III", "IV", "V", "VI"];
var TERM_PRESETS_ = {
  1: { termTags: ["TERM-I", "TERMI", "T-I", "T-1"],
       ignoreTermTags: ["TERM-II", "TERMII", "T-II", "TERM-III", "TERMIII", "T-III", "TERM-IV", "TERMIV", "T-IV"] },
  2: { termTags: ["TERM-II", "TERMII", "T-II", "T-2"], ignoreTermTags: ["TERM-III", "TERMIII", "T-III"] },
  3: { termTags: ["TERM-III", "TERMIII", "T-III", "T-3"], ignoreTermTags: [] },
  4: { termTags: ["TERM-IV", "TERMIV", "T-IV", "T-4"], ignoreTermTags: [] },
  5: { termTags: ["TERM-V", "TERMV", "T-V", "T-5", "T5"], ignoreTermTags: ["TERM-VI", "TERMVI", "T-VI", "T-6", "T6"] },
  6: { termTags: ["TERM-VI", "TERMVI", "T-VI", "T-6", "T6"], ignoreTermTags: [] }
};
// Terms 1–3 are the first year: everyone takes the core courses in their own
// section. Terms 4–6 are the second year: electives.
var YEAR_PRESETS_ = {
  first:  { yearTags: ["1STYEAR", "ISTYEAR"], ignoreYearTags: ["2NDYEAR", "IIYEAR"], courseSelection: "section" },
  second: { yearTags: ["2NDYEAR", "IIYEAR", "2NDYR"], ignoreYearTags: [], courseSelection: "electives" }
};
var TERM_NUMBER_ = (function () {
  var raw = settingText_(THIS_TERM.number);
  if (!raw) return 0;
  var n = parseInt(raw.replace(/^term\s*/i, ""), 10);
  if (n >= 1 && n <= 6) return n;
  settingsProblem_('THIS_TERM.number must be 1, 2, 3, 4, 5 or 6 (it is "' + raw + '").');
  return 0;
})();
var TERM_PRESET_ = TERM_NUMBER_ ? {
  number: TERM_NUMBER_,
  name: "Term " + TERM_NUMBER_,
  academicTerm: "Term " + TERM_ROMAN_[TERM_NUMBER_],
  termTags: TERM_PRESETS_[TERM_NUMBER_].termTags,
  ignoreTermTags: TERM_PRESETS_[TERM_NUMBER_].ignoreTermTags,
  year: TERM_NUMBER_ <= 3 ? YEAR_PRESETS_.first : YEAR_PRESETS_.second
} : null;

// THIS_TERM[field] when config.gs sets it (a list counts even when empty), else the
// term's standard value.
function termValue_(field, standard) {
  var v = THIS_TERM[field];
  if (Array.isArray(v)) return v;
  if (v !== undefined && v !== null && settingText_(v) !== "") return v;
  return standard;
}

// "IIM Sirmaur – Term 3": the calendar name a term gets when config.gs doesn't
// name it (long dash U+2013, as every TermSync calendar has always had).
function standardCalendarName_(n) {
  return (settingText_(CFG_.institute.name) || "TermSync") + " \u2013 Term " + n;
}

var TERM_CONFIG_ = (function () {
  var label = settingText_(termValue_("name", TERM_PRESET_ && TERM_PRESET_.name)) || "This term";
  var win = settingWindow_(THIS_TERM);
  if (!win) {
    // A broken window must not stop the app; fall back to a generous one around
    // today and say so. Events outside the real term are never created anyway —
    // the timetable only holds this term's classes.
    settingsProblem_('THIS_TERM.firstDay / lastDay must be real dates written "YYYY-MM-DD", ' +
      'with firstDay before lastDay. Using a window around today until they are fixed.');
    var now = new Date();
    win = { start: new Date(now.getFullYear(), now.getMonth() - 3, 1),
            end: new Date(now.getFullYear(), now.getMonth() + 6, 1) };
  }
  var calendarName = settingText_(THIS_TERM.calendarName) ||
    (TERM_NUMBER_ ? standardCalendarName_(TERM_NUMBER_) : "");
  if (!calendarName) {
    calendarName = settingText_(CFG_.institute.name) + " \u2013 " + label;
    settingsProblem_('THIS_TERM needs a number (1–6). Using the calendar name "' + calendarName + '" until it has one.');
  }
  return {
    label: label,
    batch: settingText_(THIS_TERM.batch),
    calendarName: calendarName,
    // Events are listed/cleared within this window; end is exclusive. It may overlap
    // the previous term's window: every list/clear is scoped to the calendar found by
    // name (see findOwnedCalendar_), and that name differs from term to term.
    syncWindowStart: win.start,
    syncWindowEnd: win.end,
    // Markers in the quiz and exam sheets' "Batch / Term" column that flag a row as
    // this term's (compared uppercase with all whitespace stripped).
    quizTermTags: settingTags_(termValue_("termTags", TERM_PRESET_ ? TERM_PRESET_.termTags : [])),
    // Checked BEFORE quizTermTags, because tag matching is substring-based and
    // "TERM-V" is a substring of "TERM-VI" (likewise "T-I" of "T-II").
    excludeTermTags: settingTags_(termValue_("ignoreTermTags", TERM_PRESET_ ? TERM_PRESET_.ignoreTermTags : [])),
    // How this term is named in the published Academic Calendar sheet (Roman
    // numerals there — "Term IV", "Term V"). getAcademic_ pulls the live exam/break
    // dates by matching this string, and treats the *next* distinct term in the
    // sheet as the term break's target.
    academicTerm: settingText_(termValue_("academicCalendarTerm", TERM_PRESET_ && TERM_PRESET_.academicTerm)),
    // Key dates from the official academic calendar. A FALLBACK only: getAcademic_
    // overrides each field from the live calendar sheet (see ACADEMIC_CAL_CSV_URL)
    // and drops back here per-field on any miss. The PDF's insights use these so an
    // exam window is never mistaken for free time.
    academic: {
      examWindows: Array.isArray(THIS_TERM.examWindows) ? THIS_TERM.examWindows : [],
      termBreak: THIS_TERM.termBreak || null,
      nextTermStart: settingText_(THIS_TERM.nextTermStart)
    }
  };
})();

var CALENDAR_NAME = TERM_CONFIG_.calendarName;

// How each student's courses are found — see enrolmentMode_.
var COURSE_SELECTION_ = settingText_(termValue_("courseSelection",
  TERM_PRESET_ ? TERM_PRESET_.year.courseSelection : "pick")).toLowerCase();

// ── Term-to-term handover ─────────────────────────────────────────────────────
// A new term is pasted OVER the existing Apps Script project rather than deployed
// as a new one. That is deliberate and it is the whole point:
//
//   • Same project  = same OAuth grant. appsscript.json does not change between
//     terms, so nobody re-authorises and no consent screen appears.
//   • Same project  = same /exec URL. Every link already shared with the batch,
//     every bookmark, keeps working.
//   • Same project  = the students' own 30-minute backgroundSync triggers survive,
//     so the handover propagates with no action from them.
//
// A new project would have cost all three. The price of reusing this one is that
// each student's stored state still describes the previous term, and its calendar
// still exists and is still full of live events. handleTermHandover_ below is the
// one-time, per-user pass that resolves both.
//
// The previous term's calendar, addressed BY NAME because that is the only handle
// a student's own run has on it. findOwnedCalendar_ (never getOrCreate) is used,
// so a student who deleted it is not handed an empty one back.
//
// When config.gs leaves PREVIOUS_TERM blank and this term's calendar has its
// standard name, last term's is worked out the same way ("… – Term 2" before
// "… – Term 3"), so moving on a term needs only a new number. On a first install
// that names a calendar nobody has, which is harmless: the cross-out only runs
// for students who were already syncing, and only touches TermSync's own events.
var PREVIOUS_TERM_ = (function () {
  var prev = CFG_.previousTerm;
  var name = settingText_(prev.calendarName);
  var auto = false;
  if (!name && TERM_NUMBER_ > 1 && !settingText_(THIS_TERM.calendarName)) {
    name = standardCalendarName_(TERM_NUMBER_ - 1);
    auto = true;
  }
  var win = settingWindow_(prev);
  if (name && name === TERM_CONFIG_.calendarName) {
    settingsProblem_('PREVIOUS_TERM.calendarName is the same as THIS_TERM.calendarName. They must differ, ' +
      'or the new term\'s events would be crossed out. The handover cross-out is off until this is fixed.');
    name = "";
  }
  if (name && !win) {
    // The cross-out searches this window for last term's events. Exact dates are
    // only an economy — the pass touches nothing but this tool's own events — so
    // a wide window is a safe stand-in when they are missing.
    if (!auto && (settingText_(prev.firstDay) || settingText_(prev.lastDay))) {
      settingsProblem_('PREVIOUS_TERM.firstDay / lastDay are not "YYYY-MM-DD". Searching the year before ' +
        'this term instead.');
    }
    win = { start: new Date(TERM_CONFIG_.syncWindowStart.getFullYear() - 1,
                            TERM_CONFIG_.syncWindowStart.getMonth(), 1),
            end: TERM_CONFIG_.syncWindowEnd };
  }
  return {
    label: settingText_(prev.name) || (auto ? "Term " + (TERM_NUMBER_ - 1) : "the previous term"),
    calendarName: name,
    auto: auto,
    syncWindowStart: win ? win.start : TERM_CONFIG_.syncWindowStart,
    syncWindowEnd: win ? win.end : TERM_CONFIG_.syncWindowStart
  };
})();

// ── Optional features (config.gs → FEATURES) ──────────────────────────────────
// Everything is on unless config.gs switches it off with `false`. Each switch is
// enforced on the server (the endpoint refuses) as well as hidden on the page, so
// turning one off really turns it off rather than just hiding a button.
var FEATURES_ = (function () {
  var out = { adminDashboard: true, usageStats: true, usageLog: true, subjectReps: true,
              courseOutlines: true, pdfDownload: true, reportWrongEntry: true };
  Object.keys(CFG_.features).forEach(function (k) {
    if (!out.hasOwnProperty(k)) {
      settingsProblem_('FEATURES.' + k + ' is not a feature TermSync knows. Check the spelling.');
      return;
    }
    if (CFG_.features[k] === false) out[k] = false;
    else if (CFG_.features[k] !== true) settingsProblem_('FEATURES.' + k + ' must be true or false.');
  });
  return out;
})();

// The handover is latched per user in tt_handover. Keyed on the term itself, so a
// new term in config.gs re-arms it for everyone and nothing has to be bumped by
// hand — and renaming the term mid-way would re-run it, which is why config.gs
// says never to.
var HANDOVER_VERSION_ = "term:" + TERM_CONFIG_.label + "|" + TERM_CONFIG_.batch;

// ── TEST MODE — try a build on yourself before the batch gets it ─────────────
// While this map is NON-EMPTY, the tool runs for these rolls ONLY (config.gs →
// TEST_ONLY_FOR). Every other student's background run returns immediately —
// before the handover, before the CODE_VERSION migration, before any calendar
// read or write — so their calendar is left exactly as it is.
//
// WHY THIS IS NEEDED AT ALL. Pasting code into this project is not a private act:
// Apps Script time-driven triggers run the SAVED code, not the deployed web-app
// version. The moment you hit Save, every student's next 30-minute tick runs this
// build. There is no "deploy to just me", and you cannot delete or pause another
// user's trigger — so the only place to hold the batch back is here, in a check
// the code itself makes.
//
// Gating ONLY the handover would not be enough. A gated-but-not-stopped run falls
// through to the version migration, which operates on CALENDAR_NAME — the new
// term's — and would create an empty calendar for every student while orphaning
// the old one. Hence the gate sits above all of that.
//
// Rolls are matched the same way everywhere else in this file: the local part of
// the institute address, upper-cased (mba26957@… → MBA26957).
//
// TO GO LIVE: empty TEST_ONLY_FOR and save. Fails safe — if you forget, the batch
// simply stays where it was and nobody is half-migrated; "Handover status" says so.
var PILOT_ROLLS_ = (function () {
  var map = {};
  var list = CFG_.testOnlyFor;
  for (var i = 0; i < list.length; i++) {
    var roll = settingText_(list[i]).toUpperCase();
    if (roll) map[roll] = true;
  }
  return map;
})();

function pilotModeOn_() { return Object.keys(PILOT_ROLLS_).length > 0; }

// True when this user may run the tool. Everyone passes once the pilot list is
// emptied. Fails OPEN on an unreadable address only while the pilot is off; during
// a pilot an unidentifiable user is excluded, because the whole point is that the
// default is "do nothing".
function isPilotUser_() {
  if (!pilotModeOn_()) return true;
  var email = Session.getActiveUser().getEmail() || "";
  if (!email) return false;
  return !!PILOT_ROLLS_[email.split("@")[0].toUpperCase()];
}

// The message a held-back student sees. Deliberately calm and action-free: they
// have done nothing wrong, there is nothing for them to fix, and the state is
// temporary.
function pilotHoldMessage_() {
  return "The " + TERM_CONFIG_.label + " update is still being tested. Your calendar " +
    "hasn't been changed — this will start working on its own shortly.";
}

// A cross-out pass that hits Google's rate limits is retried on the next run
// rather than being marked done — but not forever, or a permanently broken
// calendar would block that student's Term 5 sync indefinitely. Mirrors
// TERM_END_STRIKE_MAX_ATTEMPTS_, which governs the identical pass at term end.
var HANDOVER_STRIKE_MAX_ATTEMPTS_ = 5;

// Separate, much larger budget for reading the institute's enrolment sheet during
// the handover. The cross-out's 5 runs are right for "Google is rate-limiting my
// calendar writes"; they are far too few for "the institute's published sheet is
// unreachable", where the honest answer is to keep waiting. 48 runs at 30 minutes
// is a full day of retries before a student is handed the manual picker instead —
// and every run in between leaves their calendar exactly as it was.
var HANDOVER_SEED_MAX_ATTEMPTS_ = 48;

// ── Institute data sources (config.gs → DATA_SOURCES) ─────────────────────────
// The institute surfaces several of its schedules as Apps Script web apps
// (script.google.com/macros/s/…/exec). Those URLs are NOT usable here: an /exec
// URL returns a ~38KB HtmlService bootstrap whose page body is an empty table —
// the rows arrive afterwards from a client-side google.script.run call, which
// UrlFetchApp cannot make (no JS engine, no iframe, no session).
//
// But every one of those apps is a front-end over a tab of an institute
// spreadsheet, and those tabs can be published to the web. Reading the tab
// directly is both simpler and more robust than anything that goes near the app.
// Only explicitly-published tabs are readable — an unpublished gid answers 401 —
// so a new term's tabs must each be added under File → Share → Publish to web.

// Sentinel for a source that has no link yet. The admin fetch refuses while a
// REQUIRED source still holds it and names them (unconfiguredCsvSources_), so a
// missing tab fails loudly instead of surfacing as an opaque UrlFetch error — or,
// worse, as silently stale data. Optional sources holding it are simply skipped.
var PENDING_URL_ = "TODO_PUBLISHED_CSV_URL";

// The published-to-web link of one tab, in the CSV form UrlFetchApp reads. Takes
// whatever the "Publish to web" dialog gave — the web-page (pubhtml) or the CSV
// version, with or without &single=true — and rebuilds it canonically, so people
// pasting links into config.gs never have to edit them. A blank value is "not set".
function publishedCsvSetting_(value, label) {
  var s = settingText_(value);
  if (!s) return PENDING_URL_;
  var doc = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/.exec(s);
  if (!doc) {
    if (/\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/.test(s)) {
      settingsProblem_('DATA_SOURCES.' + label + ' is an ordinary spreadsheet link. It needs a ' +
        '"Publish to web" link to the tab (File → Share → Publish to web). Ignoring it for now.');
      return PENDING_URL_;
    }
    if (!/^https:\/\//.test(s)) {
      settingsProblem_('DATA_SOURCES.' + label + ' is not a link. Ignoring it for now.');
      return PENDING_URL_;
    }
    return s;   // some other CSV endpoint — taken as given
  }
  var gid = /[?&#]gid=(\d+)/.exec(s);
  var base = "https://docs.google.com/spreadsheets/d/e/" + doc[1] + "/";
  return gid ? base + "pub?gid=" + gid[1] + "&single=true&output=csv" : base + "pub?output=csv";
}

// The "…/spreadsheets/d/e/<token>/" part of a published link — the root that the
// document's other tabs and its pubhtml tab list hang off. "" when not published.
function publishedDocBase_(value) {
  var doc = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/.exec(settingText_(value));
  return doc ? "https://docs.google.com/spreadsheets/d/e/" + doc[1] + "/" : "";
}

// A spreadsheet's file id from its link (…/spreadsheets/d/<THIS>/edit), or the id
// itself if that is what was pasted. "" when blank or unrecognisable.
function spreadsheetIdSetting_(value, label) {
  var s = settingText_(value);
  if (!s) return "";
  if (/\/spreadsheets\/d\/e\//.test(s)) {
    settingsProblem_('DATA_SOURCES.' + label + ' is a "Publish to web" link. It needs the spreadsheet\'s ' +
      'normal link (the one in the address bar when you open it). Ignoring it for now.');
    return "";
  }
  var m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(s);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{25,}$/.test(s)) return s;
  settingsProblem_('DATA_SOURCES.' + label + ' is not a Google Sheets link. Ignoring it for now.');
  return "";
}

// ── The class timetable: three ways in, best first ────────────────────────────
// getTimetableRows_ takes the first that yields data:
//
//   1. ADMIN_CSV_URL       — a published CSV of the timetable tab, if the institute
//      publishes one (DATA_SOURCES.timetablePublishedCsv).
//   2. TIMETABLE_SHEET_ID_ — the source spreadsheet's file id. Needs only VIEW
//      access for the account that runs the fetch, NOT publish-to-web, which is a
//      much smaller thing to ask for (DATA_SOURCES.timetableSheet/timetableTab).
//   3. The ManualTimetable tab of THIS spreadsheet — a paste-in fallback needing
//      no cooperation at all: copy the timetable and paste it into that tab.
//      Re-paste whenever the institute changes something.
//
// All three produce the same 2D array and feed the identical parser, so nothing
// downstream knows or cares which was used.
//
// The PGP office shares a flat mirror of the master timetable (see
// parseMirrorTimetable_). It is not published to the web — an anonymous CSV export
// answers HTTP 401 — but SpreadsheetApp.openById needs only VIEW access, which the
// tool's existing auth/spreadsheets scope already covers. No new permission, no
// publish-to-web request, nobody re-authorises.
var ADMIN_CSV_URL = publishedCsvSetting_(DATA_SOURCES.timetablePublishedCsv, "timetablePublishedCsv");
var TIMETABLE_SHEET_ID_ = spreadsheetIdSetting_(DATA_SOURCES.timetableSheet, "timetableSheet");
// Tab name inside that spreadsheet. If this tab is missing (renamed, say),
// getTimetableRows_ searches every tab for one in mirror format rather than
// silently reading whichever sheet happens to be first.
var TIMETABLE_SHEET_TAB_ = settingText_(DATA_SOURCES.timetableTab);
// The paste-in fallback lives on a tab of the tool's OWN spreadsheet, so it is
// always writable by the owner even when nothing else is available.
var MANUAL_TIMETABLE_SHEET_NAME = "ManualTimetable";
// Guest lectures and feedback have the same problem as the timetable when the
// institute publishes them only through an Apps Script app. Each falls back to a
// pasted range when its published tab yields nothing for this term.
var MANUAL_GUEST_SHEET_NAME = "ManualGuest";
var MANUAL_FEEDBACK_SHEET_NAME = "ManualFeedback";
// "Quiz Schedule" — one tab usually shared by both running terms, with a
// "Batch / Term" column; isTermRow_ keeps only this term's rows, so the other
// year's quizzes never reach this batch.
var QUIZ_CSV_URL = publishedCsvSetting_(DATA_SOURCES.quizSchedule, "quizSchedule");
var QUIZ_SHEET_NAME = "QuizData";
// Mid-term examination schedule (a per-term "T-…_MTES" tab). Exams have no
// per-section split (they're common across a course's sections), so they match
// purely on enrolled course code — see appendExamEvents_.
var EXAM_CSV_URL = publishedCsvSetting_(DATA_SOURCES.midTermSchedule, "midTermSchedule");
var EXAM_SHEET_NAME = "ExamData";
// End-term examination schedule ("T-…_ETES"). IDENTICAL column layout to the
// mid-term tab, so parseExamCsv_ reads both. It keeps its own sheet and signature
// rather than being merged into ExamData so the two fail independently (see the
// fetch block in fetchAndCleanAdminDataLocked_), and every row in it is by
// definition an end-term sitting (see examTermLabel_'s rule 0).
var ENDTERM_CSV_URL = publishedCsvSetting_(DATA_SOURCES.endTermSchedule, "endTermSchedule");
var ENDTERM_SHEET_NAME = "EndTermData";
// The institute's "Result Receipt Record" — one row per course/section with a
// TRUE/FALSE "Whether Marks Updated on OLT" flag and the component name(s)
// ("Quiz-1", "Mid-Term", …). Rows carry full course titles and no codes, so they
// are matched via the same normalized-name lookup the electives loader uses
// (getCourseCodeByNorm_). Feeds the ✅ stamps and the Evaluation popup's badges.
var MARKS_CSV_URL = publishedCsvSetting_(DATA_SOURCES.marksStatus, "marksStatus");
var MARKS_SHEET_NAME = "MarksStatus";
var MARKS_STATUS_CACHE_KEY_ = "tt_marks_status_v2";
var MARKS_STATUS_CACHE_TTL_SECONDS_ = 21600; // keyed by revision + rebuilt by every fetch, like COURSE_DATA_CACHE_KEY_
// "GL" — guest lectures. Columns: Date, Day, Timings (24 hrs format), Year/Batch,
// Code, Section, Faculty, Session#. Shared across both years, filtered to ours by
// the Year/Batch column. Events carry the 🎤 prefix and GUEST_COLOR_ID_.
// Normally supplied by the MIRROR (its "(Guest Lecture)" markers), in which case
// this stays blank and the source is excluded from the parallel fetch. A link set
// here takes priority over the mirror's markers (see the guest block).
var GUEST_CSV_URL = publishedCsvSetting_(DATA_SOURCES.guestLectures, "guestLectures");
var GUEST_SHEET_NAME = "GuestData";
// "FD" — the feedback schedule. IDENTICAL column layout to GL, and deliberately
// produces NO events of its own: each row names one already-timetabled session at
// which course feedback is collected, so the feedback and OLT links are appended
// to THAT class's description instead (see feedbackNoteFor_).
// Normally supplied by the MIRROR (its "(Feedback)" markers). Same rule as
// GUEST_CSV_URL: set a link and it takes priority.
var FEEDBACK_CSV_URL = publishedCsvSetting_(DATA_SOURCES.feedbackSchedule, "feedbackSchedule");
var FEEDBACK_SHEET_NAME = "FeedbackData";
// "Course Catalogue" — the authoritative per-course Area, Credit, faculty and
// section count, with a "Batch / Term" column ("MBA, 2025-27 T-4"). Read by the
// admin fetch to reconcile COURSE_INFO_ (see reportCatalogueDrift_) rather than to
// drive events, so a stale or empty catalogue never blocks a sync.
var COURSE_CATALOGUE_CSV_URL = publishedCsvSetting_(DATA_SOURCES.courseCatalogue, "courseCatalogue");

// The links the FD rows point students at. The FD tab lists WHEN feedback is
// collected but carries no URLs, so these are the institute's standing ones.
// Blank omits that line.
var FEEDBACK_FORM_URL_ = settingText_(CFG_.institute.feedbackFormUrl);
var OLT_PORTAL_URL_ = settingText_(CFG_.institute.oltPortalUrl);

// Only accounts on this domain may open the app (see doGet). Rolls are the local
// part of the address, upper-cased.
var EMAIL_DOMAIN_ = settingText_(CFG_.institute.emailDomain).replace(/^@/, "").toLowerCase();

// Every event's location starts with the institute's name ("IIM Sirmaur | LH-1").
// Part of the event content, so changing INSTITUTE.name re-syncs every event.
var LOCATION_PREFIX_ = settingText_(CFG_.institute.name) || "Campus";

// Every published CSV the admin fetch reads, in one table. The fetch pulls them in a
// single parallel round trip and each block then asks for its own source BY KEY (see
// csvTextFrom_), so the response array's order is never something a caller has to
// know. That ordering used to be an unwritten invariant between the fetchAll array
// and a hardcoded integer at each call site — and getting it wrong is near-silent:
// one source's CSV reaches another's parser, the parse throws, the per-source catch
// preserves the old rows, and the fetch still reports success while that source
// quietly stops updating. Keyed lookup makes that unrepresentable.
// `required` marks a source the tool cannot function without. Only a required
// source that is still unpublished blocks the fetch; everything else degrades to
// "that feature is absent this run" and is reported in the parse-issues cell.
var CSV_SOURCES_ = [
  { key: "timetable", url: ADMIN_CSV_URL,    label: "Timetable CSV", required: true },
  { key: "quiz",      url: QUIZ_CSV_URL,     label: "Quiz CSV" },
  { key: "exam",      url: EXAM_CSV_URL,     label: "Exam CSV" },
  { key: "endterm",   url: ENDTERM_CSV_URL,  label: "End-term CSV" },
  { key: "marks",     url: MARKS_CSV_URL,    label: "Marks CSV" },
  { key: "guest",     url: GUEST_CSV_URL,    label: "Guest lecture CSV" },
  { key: "feedback",  url: FEEDBACK_CSV_URL, label: "Feedback CSV" },
  { key: "catalogue", url: COURSE_CATALOGUE_CSV_URL, label: "Course Catalogue CSV" }
];

// Trailing blank rows and columns are normal in a pasted range — Sheets hands back
// the whole used grid. Trimming them keeps the row/column counts honest so the
// parser's "is this a class row?" checks see the same shape a CSV would give.
function trimGrid_(grid) {
  var last = -1;
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== "" && grid[r][c] !== null && grid[r][c] !== undefined) { last = r; break; }
    }
  }
  return last === -1 ? [] : grid.slice(0, last + 1);
}

// ── The institute's MIRROR timetable ──────────────────────────────────────────
// The PGP office maintains a flat mirror of the master timetable covering BOTH
// running terms, one row per class, with every field already in its own column:
//
//   Date | Day | StartTime | EndTime | Timings (24 hrs format) | Year/Batch |
//   Code | Grp | Faculty | Session# | Classroom | FT/VF | Course-Section-Faculty | CR Block
//
// This is a strictly better source than anything before it. The legacy layout
// packed code, section, session, faculty and room into ONE cell that had to be
// tokenized back apart by guesswork — first token is the code, first all-digits
// token is the session, last token is the room *if* isRoomToken_ agrees, and
// whatever is left over is the faculty name. Every one of those rules is a
// heuristic that a room called "MD-A" or a faculty name containing a digit could
// break. Here they are simply columns, so none of that guessing happens.
//
// The mirror also carries "(Feedback)" and "(Guest Lecture)" markers inline on the
// class they belong to, which is why this returns three row sets rather than one:
// the GL and FD tabs on the institute master doc still hold the PREVIOUS term's
// rows, so those markers are now the only live record of either for this term.
//
// Returns null when `grid` is not in mirror format, so the caller can fall back to
// the legacy parser. Never throws on row-level problems — bad rows are reported
// through `issues` and skipped, matching every other parser here.
function mirrorHeaderRow_(grid) {
  for (var r = 0; r < Math.min(grid.length, 10); r++) {
    var row = grid[r];
    if (!row) continue;
    var norm = [];
    for (var c = 0; c < row.length; c++) {
      norm.push(row[c] == null ? "" : row[c].toString().toLowerCase().trim());
    }
    var has = function (n) { return norm.indexOf(n) !== -1; };
    // Require the columns that DEFINE the format, not merely ones it happens to
    // have: the legacy layout also has Date and Code, so keying on those alone
    // would send a legacy grid down this path and produce nothing.
    if (has("date") && has("code") && has("year/batch") && has("grp") && has("classroom")) return r;
  }
  return -1;
}

function parseMirrorTimetable_(grid, issues) {
  if (!grid || !grid.length) return null;
  var headerIdx = mirrorHeaderRow_(grid);
  if (headerIdx === -1) return null;

  var header = grid[headerIdx];
  var idx = {};
  for (var c = 0; c < header.length; c++) {
    idx[header[c] == null ? "" : header[c].toString().toLowerCase().trim()] = c;
  }
  var col = {
    date: idx["date"], start: idx["starttime"], end: idx["endtime"],
    timings: idx["timings (24 hrs format)"], year: idx["year/batch"],
    code: idx["code"], grp: idx["grp"], faculty: idx["faculty"],
    session: idx["session#"], room: idx["classroom"],
    composite: idx["course-section-faculty"], day: idx["day"]
  };
  var WEEKDAYS_ = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var get = function (row, i) {
    return (i !== undefined && i !== -1 && row[i] != null) ? row[i].toString().trim() : "";
  };

  var classes = [], guest = [], feedback = [];
  var seenClass = {}, seenGuest = {}, seenFeedback = {};
  // Same course, same group, same date, same clock time, listed twice. seenClass
  // only catches rows that are identical byte for byte, so a repeat that differs
  // in room, faculty or session number sails past it and becomes TWO calendar
  // events stacked on one slot — an overlap the student sees and nothing here
  // would ever mention. Keyed on the sitting instead of the row, so the second
  // copy is dropped and named.
  var seenSitting = {};
  var otherYear = 0, skippedQuiz = 0, duplicateSittings = 0;
  var perKey = {};
  // Date vs the sheet's own "Day" column. The two are typed independently, so a
  // disagreement means one of them is wrong — a typo in the office's sheet, or (if
  // it is most rows) a changed date format this parser is misreading. Rows are KEPT
  // (the caller decides whether the whole read is trustworthy); each is named.
  var dayChecked = 0, dayMismatch = 0, dayMismatchReported = 0;

  for (var i = headerIdx + 1; i < grid.length; i++) {
    var row = grid[i];
    if (!row) continue;
    var code = get(row, col.code);
    if (!code) continue;                       // an empty slot, not a class

    // The mirror covers both terms. Everything below this line is ours only.
    if (col.year !== undefined && !isOurYearRow_(get(row, col.year))) { otherYear++; continue; }

    // "QuizSlot" / "Quiz Slot" are reserved placeholders in the timetable, not
    // classes: the real quiz schedule (course, syllabus, duration) comes from the
    // Quiz Schedule tab and is placed by appendQuizEvents_. Same rule the legacy
    // parser applies, kept identical so the two routes agree.
    if (code.toLowerCase().indexOf("quiz") !== -1) { skippedQuiz++; continue; }
    // 1st-year-only placeholder that carries no course; guarded even though the
    // year filter above should already have removed it.
    if (code.toLowerCase().indexOf("phd class") !== -1) continue;

    var rawDate = get(row, col.date);
    var dateObj = parseSheetDate_(rawDate);
    if (!dateObj) {
      issues.push("Mirror timetable row " + (i + 1) + " (" + code + "): unreadable date \"" +
        rawDate + "\" — skipped");
      continue;
    }
    var dayCell = get(row, col.day).toLowerCase();
    if (dayCell) {
      dayChecked++;
      if (dayCell.substring(0, 3) !== WEEKDAYS_[dateObj.getDay()]) {
        dayMismatch++;
        if (dayMismatchReported < 10) {
          dayMismatchReported++;
          issues.push("Mirror timetable row " + (i + 1) + " (" + code + "): date \"" + rawDate +
            "\" is a " + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObj.getDay()] +
            " but the Day column says \"" + get(row, col.day) + "\" — kept as dated; check it with the office.");
        }
      }
    }

    // Prefer the explicit Start/End columns; fall back to splitting the combined
    // "HH:MM - HH:MM" cell. normalizeTimeRange_ validates the pair and returns 24h
    // strings — a reversed or unreadable pair is rejected here rather than by the
    // Calendar API on every student's sync.
    var startRaw = get(row, col.start), endRaw = get(row, col.end);
    if (!startRaw || !endRaw) {
      var parts = get(row, col.timings).split(/\s*[-–—]\s*/);
      startRaw = (parts[0] || "").trim();
      endRaw = (parts[1] || "").trim();
    }
    var range = normalizeTimeRange_(startRaw, endRaw);
    if (!range) {
      issues.push("Mirror timetable row " + (i + 1) + " (" + code + "): unreadable timing \"" +
        get(row, col.timings) + "\" — skipped");
      continue;
    }

    var section = get(row, col.grp).toUpperCase();
    var faculty = get(row, col.faculty) || "Unknown";
    var room = get(row, col.room) || "TBD";
    var session = get(row, col.session);
    var info = COURSE_INFO_[code];
    var courseName = (info && info.name) || code;

    // Exactly the shape the legacy parser produces, so everything downstream —
    // MasterData layout, the change-log diff, computeEventSig_ — is unchanged.
    var cleanRow = [dateObj, range.start, range.end, code, section, courseName, faculty, room, session];
    var classKey = JSON.stringify(cleanRow);
    var sittingKey = code + "|" + section + "|" + dateObj.getTime() + "|" + range.start + "|" + range.end;
    if (seenSitting[sittingKey]) {
      // An exact repeat is a harmless copy-paste in the sheet; one that differs is
      // a contradiction the office needs to resolve. Either way only the first is
      // kept, so no student ever gets two events on one slot.
      duplicateSittings++;
      if (!seenClass[classKey]) {
        issues.push("Mirror timetable row " + (i + 1) + " (" + code +
          (section ? " " + section : "") + " on " + rawDate + " " + range.start + "-" + range.end +
          "): a second, DIFFERENT row for the same sitting (room \"" + room + "\", faculty \"" +
          faculty + "\", session \"" + session + "\") — kept the first, skipped this one.");
      }
      continue;
    }
    seenSitting[sittingKey] = true;
    var perKeyName = section ? code + "-" + section : code;
    perKey[perKeyName] = (perKey[perKeyName] || 0) + 1;
    if (!seenClass[classKey]) {
      seenClass[classKey] = true;
      classes.push(cleanRow);
    }

    // Inline markers → the GL / FD row shape (see parseSessionScheduleCsv_):
    //   [dd/MM/yyyy, start, end, CODE, SECTION, faculty, session]
    var composite = get(row, col.composite);
    if (composite) {
      var sessionRow = [
        Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy"),
        range.start, range.end, code, section, get(row, col.faculty), session
      ];
      var sessionKey = sessionRow.slice(0, 5).join("|");
      if (/\(\s*guest\s+lecture\s*\)/i.test(composite) && !seenGuest[sessionKey]) {
        seenGuest[sessionKey] = true;
        guest.push(sessionRow);
      }
      if (/\(\s*feedback\s*\)/i.test(composite) && !seenFeedback[sessionKey]) {
        seenFeedback[sessionKey] = true;
        feedback.push(sessionRow);
      }
    }
  }

  if (!classes.length) {
    issues.push("Mirror timetable parsed but produced no classes for this year" +
      (otherYear ? " (" + otherYear + " row(s) belonged to another year)" : "") + ".");
  }
  if (dayMismatch > dayMismatchReported) {
    issues.push("Mirror timetable: " + (dayMismatch - dayMismatchReported) +
      " more row(s) whose date disagrees with the Day column (not listed individually).");
  }
  return { classes: classes, guest: guest, feedback: feedback,
           otherYear: otherYear, skippedQuiz: skippedQuiz,
           duplicateSittings: duplicateSittings, perKey: perKey,
           dayChecked: dayChecked, dayMismatch: dayMismatch };
}

// The timetable as a 2D array, from whichever source is configured. Returns
// { rows, source } so the caller can say which one was used; throws only when
// every route is unavailable, which the caller reports as a setup problem rather
// than a transient failure.
function getTimetableRows_(csvResponses) {
  // 1 · published CSV tab
  if (ADMIN_CSV_URL !== PENDING_URL_) {
    var rawText = adminStep_("fetch timetable CSV", function () {
      return csvTextFrom_(csvResponses, "timetable");
    });
    return { rows: Utilities.parseCsv(rawText), source: "published CSV" };
  }

  // 2 · the source spreadsheet, shared view-only with this account. This is the
  //     live route for Term 5: the PGP office's mirror (see TIMETABLE_SHEET_ID_).
  if (TIMETABLE_SHEET_ID_) {
    var viaId = adminStep_("read timetable spreadsheet", function () {
      var ss = SpreadsheetApp.openById(TIMETABLE_SHEET_ID_);
      var sheet = TIMETABLE_SHEET_TAB_ ? ss.getSheetByName(TIMETABLE_SHEET_TAB_) : null;
      if (!sheet) {
        // The named tab is gone (renamed, or never existed). Rather than fall back
        // to getSheets()[0] — which could be a notes tab and would produce a
        // confident, empty, WRONG answer — look for a tab that is actually in
        // mirror format. Only if none is does this give up and use the first.
        var all = ss.getSheets();
        for (var s = 0; s < all.length; s++) {
          var head = all[s].getRange(1, 1, Math.min(all[s].getLastRow(), 10),
                                     Math.max(all[s].getLastColumn(), 1)).getDisplayValues();
          if (mirrorHeaderRow_(head) !== -1) { sheet = all[s]; break; }
        }
        if (!sheet) sheet = all[0];
        if (!sheet) {
          throw new Error("Timetable spreadsheet \"" + TIMETABLE_SHEET_ID_ + "\" has no readable tab.");
        }
      }
      return trimGrid_(sheet.getDataRange().getDisplayValues());
    });
    if (viaId.length) return { rows: viaId, source: "shared spreadsheet" };
  }

  // 3 · pasted into this spreadsheet by hand
  var manual = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANUAL_TIMETABLE_SHEET_NAME);
  if (manual && manual.getLastRow() > 0) {
    // getDisplayValues, not getValues: dates and times must arrive as the strings
    // the institute typed, exactly as a CSV would deliver them. getValues would
    // hand back Date objects whose toString the date parser doesn't expect.
    var rows = trimGrid_(manual.getDataRange().getDisplayValues());
    if (rows.length) return { rows: rows, source: MANUAL_TIMETABLE_SHEET_NAME + " tab" };
  }

  throw new Error(
    "No timetable source is configured. Set DATA_SOURCES.timetableSheet in config.gs to the office's " +
    "timetable spreadsheet (view access is enough), or set DATA_SOURCES.timetablePublishedCsv, " +
    "or paste the timetable into a \"" + MANUAL_TIMETABLE_SHEET_NAME + "\" tab of this spreadsheet " +
    "(see docs/TROUBLESHOOTING.md).");
}

// A pasted range from a tab of this spreadsheet, trimmed, as display strings.
// Display values (not raw values) because dates and times must arrive as the strings
// the institute typed — getValues would hand back Date objects the parsers don't expect.
function readPasteGrid_(sheetName) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return trimGrid_(sheet.getDataRange().getDisplayValues());
  } catch (e) {
    return [];
  }
}

// True when a timetable can be obtained by any route — used so the setup guard
// doesn't refuse just because ADMIN_CSV_URL is unset while a fallback is in place.
function hasTimetableSource_() {
  if (ADMIN_CSV_URL !== PENDING_URL_) return true;
  if (TIMETABLE_SHEET_ID_) return true;
  try {
    var manual = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANUAL_TIMETABLE_SHEET_NAME);
    return !!(manual && manual.getLastRow() > 0);
  } catch (e) {
    return false;
  }
}

// Sources still holding the sentinel, for the parse-issues cell.
//
// `satisfiedKeys` names sources that have no URL but ARE supplied another way, and
// it matters: since the mirror took over, the timetable, guest lectures and
// feedback all arrive from a spreadsheet rather than a published CSV. Reporting
// those three as "not published yet" every run would be false, and it would train
// whoever reads that cell to ignore it — which is exactly when a genuinely missing
// source slips past.
function pendingCsvSources_(satisfiedKeys) {
  var satisfied = {};
  for (var s = 0; satisfiedKeys && s < satisfiedKeys.length; s++) satisfied[satisfiedKeys[s]] = true;
  var pending = [];
  for (var i = 0; i < CSV_SOURCES_.length; i++) {
    if (CSV_SOURCES_[i].url === PENDING_URL_ && !satisfied[CSV_SOURCES_[i].key]) {
      pending.push(CSV_SOURCES_[i].label);
    }
  }
  return pending;
}

// Names every REQUIRED CSV source still holding the PENDING_URL_ sentinel. The admin
// fetch calls this first and refuses outright when the list is non-empty: fetchAll
// would otherwise throw a bare "Invalid argument" naming no source at all, and each
// source's own catch would quietly preserve its previous (empty) rows while the
// fetch still reported success.
//
// Only the sources the tool genuinely cannot run without. An unpublished exam or
// marks tab must NOT stop the timetable from syncing — those blocks already
// preserve their previous rows on any failure — so blocking on them would take the
// whole tool down over an optional feature.
function unconfiguredCsvSources_() {
  var blocking = [];
  for (var i = 0; i < CSV_SOURCES_.length; i++) {
    if (!CSV_SOURCES_[i].required || CSV_SOURCES_[i].url !== PENDING_URL_) continue;
    // The timetable has fallbacks that don't involve a URL at all, so an unset
    // ADMIN_CSV_URL is only a blocker when none of them is in place either.
    if (CSV_SOURCES_[i].key === "timetable" && hasTimetableSource_()) continue;
    blocking.push(CSV_SOURCES_[i].label);
  }
  return blocking;
}

// Short, stable tag for a link, mixed into the shared cache keys below so that
// pointing config.gs at a different sheet retires every entry cached from the old
// one at once — rather than serving stale rows for up to six hours. Plain JS (no
// Utilities call) because it runs while the script loads.
function settingKey_(s) {
  var h = 5381;
  s = String(s || "");
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// The published elective allotment document (second-year terms; config.gs →
// DATA_SOURCES.electivesSummary, a link to its "Summary" tab). The Summary tab is a
// plain course catalogue — header row then one row per course of
//   Course Title, abbreviation, No of Students, # Section, Group Email Id
// — and enrolment lives entirely in the per-course tabs. The SAME published
// document has one tab per course (tab name = course code, e.g. "AMS", "MLBA",
// "B2B") listing every enrolled student as
//   Roll No, Name, Email Id, [Section], …
// where the Section column is present ONLY on courses that actually run more than
// one section. See getElectiveSectionMaps_. This layout has changed between terms
// before — check it against the new sheet each term.
var ELECTIVES_CSV_URL = publishedCsvSetting_(DATA_SOURCES.electivesSummary, "electivesSummary");
var ELECTIVES_PUB_BASE_ = publishedDocBase_(DATA_SOURCES.electivesSummary);
var ELECTIVES_CACHE_KEY_ = "tt_electives_csv_v2_" + settingKey_(ELECTIVES_CSV_URL);
var ELECTIVES_CACHE_TTL_SECONDS_ = 1800; // shared fetch, refreshed at most every 30 min
// v3, bumped deliberately: v2 entries were written by a build whose regex kept
// the RAW escaped tab name ("M\\X26A"). Decoding on the way in fixes nothing while
// a poisoned map is still being served from cache. Changing the key retires every
// stale entry the moment a build lands.
var ELECTIVES_GID_CACHE_KEY_ = "tt_electives_gids_v3_" + settingKey_(ELECTIVES_PUB_BASE_);
var ELECTIVES_GID_CACHE_TTL_SECONDS_ = 21600; // tab list rarely changes; 6h is the cache max
// Per-tab maps are keyed by gid, and two documents can share gid numbers — so the
// document goes into the prefix too.
var ELECTIVES_SECTION_CACHE_PREFIX_ = "tt_elec_sec_v2_" + settingKey_(ELECTIVES_PUB_BASE_) + "_";
var ELECTIVES_OPTOUT_PROP_ = "tt_electives_optout";

// Subject Representatives. Usually typed into config.gs → SUBJECT_REPS (the SAC
// tends to circulate the list by mail, not as a sheet). If a published SR tab ever
// exists, DATA_SOURCES.subjectRepsSheet takes over and getSubjectReps_ reads it.
var SUBJECT_REPS_CSV_URL = publishedCsvSetting_(DATA_SOURCES.subjectRepsSheet, "subjectRepsSheet");
var SUBJECT_REPS_CACHE_KEY_ = "tt_subject_reps_v2_" + settingKey_(SUBJECT_REPS_CSV_URL);
var SUBJECT_REPS_CACHE_TTL_SECONDS_ = 21600; // roster changes rarely; 6h (cache max)

// Failure sentinel for the shared institute-sheet caches (subject reps and the
// academic calendar). Cached briefly on any fetch/parse failure so an
// institute-side outage doesn't make every getSyncHealth call and every sync
// pay a doomed UrlFetch on the hot path — the fallback data is used instead
// and a real retry happens once the sentinel expires.
var SHEET_FETCH_NONE_ = "__none__";
var SHEET_FETCH_NONE_TTL_SECONDS_ = 600;

// Best-effort: remember that a shared-sheet fetch just failed (see sentinel above).
function markSheetFetchFailed_(key) {
  try { CacheService.getScriptCache().put(key, SHEET_FETCH_NONE_, SHEET_FETCH_NONE_TTL_SECONDS_); } catch (e) { }
}

// The official Academic Calendar, published as its own spreadsheet
// (DATA_SOURCES.academicCalendar). getAcademic_ reads the current term's exam
// windows / term break / next-term start from here so the PDF insights and
// exam-day labels never drift from the institute's dates. Falls back to
// TERM_CONFIG_.academic per-field on any miss, or when no link is set.
var ACADEMIC_CAL_CSV_URL = publishedCsvSetting_(DATA_SOURCES.academicCalendar, "academicCalendar");
var ACADEMIC_CAL_CACHE_KEY_ = "tt_acad_cal_v2_" + settingKey_(ACADEMIC_CAL_CSV_URL);
var ACADEMIC_CAL_CACHE_TTL_SECONDS_ = 21600; // calendar changes rarely; 6h (cache max)
var APP_TAG = "[TT_SYNC]";

// Each synced event carries its own content fingerprint as a final description
// line, e.g. "[TT_SIG:0123abcd4567ef89]" — see computeEventSig_. The diff-based
// sync matches calendar events against the freshly built schedule by this
// signature (plus actual start/end times) instead of re-reading and normalizing
// every field across the REST and CalendarApp paths.
var SIG_PREFIX_ = "[TT_SIG:";
var SIG_PATTERN_ = /\[TT_SIG:([a-f0-9]{16})\]/;
var PROGRESS_KEY = "tt_progress";
var PROGRESS_NOTE_KEY_ = "tt_progress_note";
var USAGE_SHEET_NAME = "Usage";
var USAGE_STATS_CACHE_KEY_ = "tt_usage_stats_v1";
var USAGE_STATS_CACHE_TTL_SECONDS_ = 60;
// Students have only VIEW access to the spreadsheet (so they can't open the hidden
// Usage/ChangeLog sheets), which also means they can't append to the Usage sheet.
// Instead each usage event is buffered under its own Script Property key with this
// prefix — writable by any web-app execution regardless of spreadsheet rights, and
// lock-free because every key is unique (see logUsage_). The owner-run admin fetch
// drains the buffer into the Usage sheet (flushUsageBuffer_); the stats modal and
// SAC log fold the still-buffered events in so counts never lag the 30-minute flush.
var USAGE_BUFFER_PREFIX_ = "tt_usage_evt_";

// "Report wrong entry" submissions. Students are VIEW-only on the spreadsheet, so
// — exactly like usage events — each report is buffered under its own Script
// Property key (writable by any web-app execution) and drained into the Reports
// sheet by the owner-run admin fetch (flushReportBuffer_). SAC reviews the sheet
// like the ChangeLog; nothing here needs a mail scope.
var REPORTS_SHEET_NAME = "Reports";
var REPORT_BUFFER_PREFIX_ = "tt_report_";
var REPORT_MAX_DETAILS_ = 600; // clamp free-text so one submission can't bloat a property
// Per-user flood guard: reports share the Script-Properties store with the other
// buffers, so one student spamming the form could otherwise fill the report cap
// single-handedly and drop everyone else's reports until the next flush (every 30 minutes).
// Ten pending reports is far beyond legitimate use between flushes.
var REPORT_MAX_PENDING_PER_USER_ = 10;

// ── Calendar-path telemetry (which write path each sync used, and how often the
// fast REST path had to fall back to CalendarApp). Tells the admin whether
// CALENDAR_API_BATCH_SIZE_ is tuned right across the real user base — a high
// fallback rate means 429 pressure and the batch size should drop. Same
// buffer→drain pattern as usage events: each successful sync that does real work
// buffers one compact event under a unique Script Property key (lock-free,
// writable by view-only students, never throws); the owner-run admin fetch folds
// them into a single aggregate property (flushPathTelemetry_, single-threaded
// under the fetch's script lock). SYNC_PATH_TELEMETRY_ is the per-execution
// accumulator the sync helpers flag while a run is in flight; null at all other
// times so wipes/migrations outside a real sync don't record.
var PATH_BUFFER_PREFIX_ = "tt_path_evt_";
var PATH_STATS_PROP_ = "tt_path_stats";
var SYNC_PATH_TELEMETRY_ = null;
// The person running TermSync for this batch (config.gs → MAINTAINER). Used to
// gate the web-page "Force fetch now" button (the isCreator flag in getSyncHealth)
// and to re-check the caller server-side in forceAdminFetch. The web app runs as
// USER_ACCESSING, so the roll comes from the caller's authenticated institute
// email and can't be spoofed. Uppercase.
var CREATOR_ROLL_ = settingText_(CFG_.maintainer.roll).toUpperCase();
// Rolls whose actions are still logged to the Usage sheet (full audit trail)
// but excluded from every stats counter — the maintainer's constant test/debug
// runs would otherwise inflate "students using the tool" numbers.
var STATS_EXCLUDE_ROLLS_ = (function () {
  var out = {};
  if (CREATOR_ROLL_) out[CREATOR_ROLL_] = true;
  return out;
})();
// ── SINGLE SOURCE OF TRUTH for the SAC roster (maintainer + SAC) ─────────────
// One canonical map drives BOTH the server-side access gate (who can open the
// hidden usage/changes logs) AND the client's hero badge (label/cls/pdf). It is
// served to the client in the health payload as `specialRoles` (see
// getSyncHealth), so the browser keeps no copy of its own to drift out of sync.
// Built from config.gs → SAC_TEAM; the maintainer is always included.
//   label = hero badge text · cls = badge CSS class · pdf = PDF role caption
var SAC_ROLE_PRESETS_ = {
  maintainer: { label: "✦ Maintainer", cls: "badge-creator", pdf: "Maintainer · TermSync" },
  poc:        { label: "SAC · POC",    cls: "badge-sac-poc", pdf: "SAC · Point of Contact" },
  member:     { label: "SAC",          cls: "badge-sac",     pdf: "SAC Member" }
};
var SAC_ROLES_ = (function () {
  var out = {};
  var rows = settingRows_(CFG_.sacTeam);
  for (var i = 0; i < rows.length; i++) {
    var roll = (rows[i].cells[0] || "").toUpperCase();
    var role = (rows[i].cells[1] || "member").toLowerCase().replace(/[^a-z]/g, "");
    if (!roll) continue;
    if (!SAC_ROLE_PRESETS_[role]) {
      settingsProblem_('SAC_TEAM: "' + rows[i].line + '" — the role must be maintainer, poc or member. ' +
        'Treating it as member.');
      role = "member";
    }
    out[roll] = SAC_ROLE_PRESETS_[role];
  }
  // A roll still reading "MBA26XXX" is the template's placeholder, not a person.
  if (CREATOR_ROLL_ && !/X{2,}/.test(CREATOR_ROLL_)) out[CREATOR_ROLL_] = SAC_ROLE_PRESETS_.maintainer;
  return out;
})();

// Rolls allowed to open the in-app admin logs (the 🎛️ Admin panel at the foot of the page,
// see getUsageLog / getChangeLog); everyone else gets an "access restricted"
// response. Derived from SAC_ROLES_ so it can never drift from the badge list.
// The web app runs as USER_ACCESSING, so the caller's roll comes from their
// authenticated @iimsirmaur.ac.in email and can't be spoofed. Compared uppercase.
var USAGE_LOG_VIEWERS_ = (function () {
  var gate = {};
  Object.keys(SAC_ROLES_).forEach(function (roll) { gate[roll] = true; });
  return gate;
})();

// The spreadsheet owner's address (lowercased), or "" when unknown. Cached script-
// wide for 6h: getOwner() is a Drive round trip, and canViewLogs_ asks on every
// health call. A failure is cached briefly as "" so a Drive hiccup is not retried
// on every page load.
var SHEET_OWNER_CACHE_KEY_ = "tt_sheet_owner_email_v1";
function spreadsheetOwnerEmail_() {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var hit = cache.get(SHEET_OWNER_CACHE_KEY_);
    if (hit !== null && hit !== undefined) return hit === SHEET_FETCH_NONE_ ? "" : hit;
  } catch (e) { cache = null; }
  var email = "";
  try {
    var owner = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    email = owner && owner.getEmail() ? owner.getEmail().toLowerCase() : "";
  } catch (e) { email = ""; }
  try {
    if (cache) cache.put(SHEET_OWNER_CACHE_KEY_, email || SHEET_FETCH_NONE_, email ? 21600 : 600);
  } catch (e) { }
  return email;
}

// Who may open the SAC logs (usage, changes, student directory, reports): every
// roll in SAC_ROLES_, plus the spreadsheet OWNER even when that account is not a
// roster student — the person who owns the data must never be locked out of it.
// The web app runs as USER_ACCESSING, so `email` is the caller's authenticated
// address and cannot be spoofed.
function canViewLogs_(email) {
  if (!FEATURES_.adminDashboard) return false;   // config.gs → FEATURES.adminDashboard
  email = String(email || "").toLowerCase();
  if (!email) return false;
  var roll = email.split("@")[0].toUpperCase();
  if (USAGE_LOG_VIEWERS_[roll]) return true;
  var owner = spreadsheetOwnerEmail_();
  return !!(owner && owner === email);
}
// Audit trail of every change the institute makes to the timetable/quiz schedule
// (room/instructor/time/date edits, plus classes added or removed). Written by the
// admin fetch when it detects a change (see fetchAndCleanAdminDataLocked_), read by
// the admin panel's 🛠️ Changes tab (
// see getChangeLog). Same SAC-only audience as the usage log, so it reuses
// USAGE_LOG_VIEWERS_ for the access gate.
var CHANGELOG_SHEET_NAME = "ChangeLog";
var CHANGELOG_HEADER_ = ["Logged At", "Change", "Category", "Course", "Section", "Class Date", "Field", "From", "To", "Details"];
var CHANGELOG_MAX_ROWS_ = 400; // cap returned to the in-app viewer (newest first)

// ── Where this term begins ────────────────────────────────────────────────────
// The Usage and ChangeLog sheets are CUMULATIVE — they carry Term 4's rows and
// Term 5's in one list, because the tool was handed over in place rather than
// redeployed. Without a marker the two terms are indistinguishable, and the
// handover itself is the worst offender: diffing Term 4's 47 courses against
// Term 5's 30 produced several hundred "class removed" / "class added" rows in a
// single second, burying every real institute edit under a wall of noise.
//
// So the first fetch that sees a NEW TERM_CONFIG_.label does two things: it skips
// that run's diff entirely (nothing about it describes an institute edit), and it
// stamps the moment as this term's baseline. Everything before the stamp belongs
// to the previous term; everything after is a real change.
//
// Both viewers read the stamp and draw the line. Nothing is deleted — the older
// rows stay in the sheet and one toggle brings them back — because the audit trail
// is the point of keeping a log at all.
var TERM_BASELINE_AT_PROP_ = 'term_baseline_at';
var TERM_BASELINE_LABEL_PROP_ = 'term_baseline_label';
var TERM_BASELINE_MARKER_ = 'Term start';

function termBaselineAt_(scriptProps) {
  var raw = scriptProps.getProperty(TERM_BASELINE_AT_PROP_);
  var n = raw ? Number(raw) : 0;
  return isNaN(n) ? 0 : n;
}
var CALENDAR_WRITE_MAX_RETRIES_ = 3;
var CALENDAR_WRITE_BACKOFF_MS_ = 2500;

// Hard wall-clock budget for a single execution. Apps Script kills executions at
// ~6 minutes with an UNCATCHABLE error — for a time-driven trigger that means
// Google emails the student a "Summary of failures" report, which must never
// happen. The create/delete loops check this deadline and bail out cleanly
// instead; the existing partial-run machinery retries next hour via the diff.
// Top-level code runs at the start of every execution, so this is per-run.
var EXECUTION_DEADLINE_MS_ = Date.now() + 270 * 1000; // 4.5 min; ~90s safety margin

// Which operation the current execution's progress belongs to ("sync" or
// "disable"). Stamped into every progress payload so the client labels the
// completion correctly ("Calendar updated" vs "Calendar deleted") instead of
// guessing from the last phase it happened to see.
var PROGRESS_OP_ = "sync";

// Client-generated id of the user-initiated operation this execution serves
// (enable / manual sync / disable), stamped into every progress payload. Lets
// the polling client tell ITS run's payloads from another run's — e.g. a
// background sync that was holding the user lock and wrote its own terminal
// "complete" moments before the user's operation started. "" for background
// trigger runs (and for old clients that pass no id), which stamp nothing.
var PROGRESS_OP_ID_ = "";

// Calendar v3 REST: chunk size for parallel UrlFetchApp.fetchAll calls.
//
// The per-user soft limit is 600 req/min (~10 QPS averaged). A burst of 30 hits
// ~30 QPS instantaneously and reliably trips Google's rate limiter. There is no
// sleep between batches — fetchAll issues a batch, waits for all of it, then
// issues the next — so this value IS the concurrency, and the sustained rate is
// roughly batch ÷ round-trip. At ~1s round trips, 15 sits above the averaged
// limit and 12 lands under it with margin.
//
// Ladder, if the fallback rate in Tool Stats stays high: 12 → 10 → 8. Do not
// bother with 13/14; a ~10% trim is inside the noise of round-trip variance, so
// it costs a deploy to learn nothing. Each step is ~1.5s slower per 150 events,
// which is nothing against EXECUTION_DEADLINE_MS_ (270s) — speed is not the
// scarce resource here, so prefer the safer value when in doubt.
//
// The value in force is stamped into the path telemetry (see stats.batch), so a
// fallback rate is always attributable to the batch size that produced it.
//
// NB these are PER-USER quotas. The handover is the heaviest moment — every
// student rebuilds their whole term at once — but that is N independent quotas
// each doing one large build, not N students contending for one. The risk is a
// single student's rebuild being big, not the batch arriving together.
var CALENDAR_API_BATCH_SIZE_ = 12;

// Calendar API colorId values for the per-course class cycle. Red ("11") is
// deliberately excluded here and reserved exclusively for quizzes (see below), so a
// class never shares the quiz colour no matter how many courses a student selects.
var COLOR_IDS_ = ["7", "10", "5", "6", "3", "1", "2", "4"];

// Quizzes always use a fixed standout colour (Tomato red) so they're unmistakable
// next to regular classes. colorId "11" maps to CalendarApp.EventColor.RED, which we
// append as the final entry of getColorEnums_() (index 8) for the slow path.
var QUIZ_COLOR_ID_ = "11";
var QUIZ_COLOR_SLOT_ = 8;

// Exams outrank both classes and quizzes (major weightage), so they get their own
// fixed standout colour: Blueberry (bold dark blue). colorId "9" maps to
// CalendarApp.EventColor.BLUE, appended at index 9 of getColorEnums_() for the slow
// path. Blue is the only strong colour not used by a class or the quiz red, and it's
// high-contrast against red for colour-blind users — see appendExamEvents_.
var EXAM_COLOR_ID_ = "9";
var EXAM_COLOR_SLOT_ = 9;

// Guest lectures are one-off sessions that aren't part of the regular timetable, so
// they get their own colour rather than borrowing a course's. Graphite ("8") is the
// only Calendar colourId left: the class cycle takes 7/10/5/6/3/1/2/4, quizzes 11
// and exams 9. Its muted grey also reads correctly as "not an assessment" beside
// the quiz red and exam blue — see appendGuestEvents_.
var GUEST_COLOR_ID_ = "8";
var GUEST_COLOR_SLOT_ = 10;

// Per-user property holding the stable course→colorId map (see
// resolveCourseColors_). Persisting it means a course keeps its colour for the
// whole term instead of being reshuffled every time the selection set changes.
var COLOR_MAP_KEY_ = 'tt_color_map';

// COLOR_ENUMS_ is built lazily — see getColorEnums_(). We can NOT initialise this at
// the top level: touching CalendarApp service properties during script-load
// evaluation can cause the script to fail to initialise for some users, which
// presents to the UI as endless "Loading…" / "Checking status…" with no error.
var COLOR_ENUMS_ = null;

// Per-user cache flag remembering whether Calendar API v3 is reachable. Avoids re-probing
// every sync. "yes" cached for 1h (rarely changes once enabled); "no" for 30m (so we
// recover automatically within half an hour after an admin enables the API).
var CAL_API_FLAG_KEY_ = "tt_cal_api_available";
var CAL_API_FLAG_TTL_YES_ = 3600;
var CAL_API_FLAG_TTL_NO_ = 1800;
var USER_HASH_LENGTH_ = 12;
// v4: slots/quizzes/exams switched to compact arrays (see getCourseData) — the
// version bump keeps a stale object-shaped payload from ever reaching the new client.
var COURSE_DATA_CACHE_KEY_ = "tt_course_data_v5";
// The entry is keyed by master_data_revision (see courseDataCacheKey_), so it can
// never outlive the data it was built from, and the owner's 30-minute fetch rebuilds
// it on every run (warmPageCaches_). Together those allow the 6-hour maximum: a
// 10-minute TTL meant most page loads found it expired and re-read four sheets.
var COURSE_DATA_CACHE_TTL_SECONDS_ = 21600;


// Bump this string only for deploys that change the matching/wipe semantics
// themselves (APP_TAG, the [TT_SIG] format, title prefixes, the legacy-event
// filter): a mismatch makes each user's next run WIPE all old timetable events
// and rebuild from scratch — the heaviest migration path there is.
// Format: YYYY-MM-DD (append -r2, -r3 for multiple deploys on the same day).

var CODE_VERSION = "2026-08-28";

// Bump this instead when a deploy only changes event CONTENT (titles,
// descriptions, colours — anything computeEventSig_ covers). A mismatch forces
// a DIFF sync on each user's next run: only events whose signature actually
// changed are replaced; unchanged events aren't touched. Far cheaper and
// gentler on rate limits than a CODE_VERSION wipe.
// NOTE: popup reminders are deliberately OUTSIDE the signature since 2026-07-10
// — a reminder-only preference change is patched onto matched events in place
// (see applyReminderToMatched_), so it needs NO version bump at all.
//
// 2026-09-09: a mirror-marked guest lecture now REPLACES the class it sits on
// instead of stacking a second event on it (appendGuestEvents_), and the feedback
// note is matched by session rather than by whole day (feedbackNoteFor_). Both
// change event content only, so a diff sync is enough — no wipe.

var RESYNC_VERSION = "2026-09-09";

// Identifies THIS copy of the code, so a copy-paste deploy can be checked. Bump it on
// every paste into Apps Script (format YYYY-MM-DD plus a letter, e.g. "2026-09-25a";
// it is compared as text, so keep that shape). It changes nothing about any
// student's calendar — unlike CODE_VERSION / RESYNC_VERSION it triggers no re-sync.
//
// Why it exists: Apps Script runs two different copies of this file. Every trigger
// (each student's backgroundSync, the institute fetch) runs the SAVED code; the web
// page and everything it calls run the last DEPLOYED version. Save without "Deploy →
// New version" and the two quietly diverge. The scheduled fetch stamps the saved
// build into Script Properties; getSyncHealth, answering from the deployed version,
// hands both to the creator's admin panel, which warns when saved is newer.
var BUILD_ID_ = "2026-10-26a";

// How often each user's backgroundSync trigger fires, in minutes. SINGLE SOURCE OF
// TRUTH for the per-user cadence — change this one number to retune it. Must be one
// of Apps Script's allowed everyMinutes values (1, 5, 10, 15, 30). Lowering it
// self-propagates: ensureSyncTrigger_ runs on every sync (as the user) and rebuilds
// that user's own trigger when their stored tt_sync_interval no longer matches, so
// no access to anyone's account is needed. (The owner-side admin-fetch trigger is a
// separate, manually-created trigger in the Apps Script Triggers UI — not set here.)
var SYNC_INTERVAL_MINUTES_ = 30;

// User-cache flag each trigger-fired backgroundSync writes (see backgroundSync), read
// by getSyncHealth to skip the trigger lookup. Lives one interval plus slack, so it
// is always present while the trigger keeps firing and lapses soon after it stops.
var TRIGGER_SEEN_KEY_ = "tt_trigger_seen";
var TRIGGER_SEEN_TTL_SECONDS_ = (SYNC_INTERVAL_MINUTES_ + 15) * 60;

// How often the OWNER-side institute fetch runs — the pass that re-reads the
// published sheets into MasterData and friends. Term 4 ran this hourly and the
// trigger had to be created by hand in the Apps Script UI, which ROLLOVER.md
// flagged as the easiest step to forget; installAdminFetchTrigger() below now
// does it from the sheet menu.
//
// 30 minutes is comfortably affordable: one run issues a single fetchAll over the
// published CSVs, so 48 runs/day is a few hundred UrlFetch calls against a daily
// quota in the tens of thousands. It also halves the worst-case lag between the
// institute editing a room and a student's calendar showing it — which, combined
// with the per-user SYNC_INTERVAL_MINUTES_ above, puts the end-to-end worst case
// at about an hour instead of two.
//
// Must be one of Apps Script's allowed everyMinutes values (1, 5, 10, 15, 30).
var ADMIN_FETCH_INTERVAL_MINUTES_ = 30;

var KNOWN_NO_DIGIT_ROOMS_ = { "AUDI": true, "AUDITORIUM": true, "TBD": true, "ONLINE": true };

// The batch roster (config.gs → STUDENTS), one "ROLL, NAME, SECTION" line each.
// Each entry: roll → [Full Name, Section]. Names stay as pasted (usually ALL CAPS);
// the client title-cases them for display.
var STUDENT_ROSTER_ = (function () {
  var out = {};
  var rows = settingRows_(STUDENTS);
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i].cells;
    var roll = (c[0] || "").toUpperCase().replace(/\s+/g, "");
    if (!roll || !/[0-9]/.test(roll) || !c[1]) {
      // A header row copied along with the data ("Roll No, Name, Section") lands
      // here too, which is harmless; anything else is worth a look.
      if (!/^roll/i.test(c[0] || "")) {
        settingsProblem_('STUDENTS: could not read "' + rows[i].line + '" — expected ROLL, NAME, SECTION.');
      }
      continue;
    }
    if (out[roll]) settingsProblem_('STUDENTS: ' + roll + ' is listed twice; the later line wins.');
    out[roll] = [c[1].replace(/\s+/g, " "), (c[2] || "").toUpperCase()];
  }
  return out;
})();
// MD-block rooms appear both as "MDA"/"MDA-B" and hyphenated as "MD-A" —
// without the optional hyphen, an instructor cell ending in "MD-A" keeps the
// room glued to the faculty name and the event falls back to Room: TBD.
var NO_DIGIT_ROOM_PATTERN_ = /^MD-?[A-E](-[A-E])?$/i;

// The term's catalogue (config.gs → COURSES): code → { name, area, credits } plus
// the optional `required` and `onlyFor`. Object.keys(COURSE_INFO_) is also the
// dictionary the timetable parser matches course codes against, so a course
// missing here is missing from every calendar. reportCatalogueDrift_ re-checks
// names, areas and credits against the institute's Course Catalogue on every
// admin fetch, when that tab is configured.
//
// `required: true` makes the picker demand the course of EVERY student. Courses
// core for only part of the batch (e.g. MBA-TM-only courses) must not carry it:
// enrolment reaches the right students through the elective tabs, or in section
// mode through `onlyFor`.
var COURSE_INFO_ = (function () {
  var out = {};
  var src = (COURSES && typeof COURSES === "object") ? COURSES : {};
  var codes = Object.keys(src);
  for (var i = 0; i < codes.length; i++) {
    var code = settingText_(codes[i]);
    var c = src[codes[i]] || {};
    if (!code) continue;
    var credits = Number(c.credits);
    if (!settingText_(c.name)) settingsProblem_('COURSES: ' + code + ' has no name.');
    if (isNaN(credits)) settingsProblem_('COURSES: ' + code + ' — credits must be a number.');
    var entry = { name: settingText_(c.name) || code, area: settingText_(c.area), credits: isNaN(credits) ? 0 : credits };
    if (c.required === true) entry.required = true;
    if (Array.isArray(c.onlyFor) && c.onlyFor.length) {
      entry.onlyFor = c.onlyFor.map(function (p) { return settingText_(p).toUpperCase(); })
        .filter(function (p) { return p; });
    }
    out[code] = entry;
  }
  if (!codes.length) settingsProblem_('COURSES is empty — no class can reach any calendar until it lists this term\'s courses.');
  return out;
})();

// Changes whenever COURSES does. fetchAndCleanAdminData mixes it into the class
// fingerprint, so an edited course name forces a MasterData rewrite + revision bump
// and every user re-syncs with the corrected names — with nothing to bump by hand.
var COURSE_INFO_VERSION_ = settingKey_(JSON.stringify(COURSE_INFO_));

// ---------------------------------------------------------
// AUDITED (SIT-IN) COURSES — per-student exceptions
// ---------------------------------------------------------
// A student may sit in on a course they are not enrolled in: they attend the
// classes and take no part in its assessment. The institute's enrolment sheet
// does not model this — a course is either yours or it is not — so the exception
// is recorded here, keyed by roll, and applied to that ONE student's calendar.
//
// Two independent switches, both optional:
//
//   classesOnly  Course codes whose CLASSES (and guest lectures, which are
//                sessions you attend, not assessments — see appendGuestEvents_)
//                sync normally, while their QUIZZES and EXAMS are left out.
//                The student still picks the course in the app exactly as
//                everyone else does; this only trims what the course emits.
//
//   autoSelect   Adds the classesOnly courses to this student's selection for
//                them, so the arrangement does not depend on them finding and
//                ticking the course — and cannot be lost by a stray un-tick.
//                It only ever ADDS to a selection that already exists: a student
//                who has never enabled the tool is left alone, never auto-enabled.
//
//   allowOverlaps  Lets this student hold two courses that meet at the same
//                hour. The picker normally refuses the second one
//                (findConflictForSelection in Index.html) because a student can
//                only be in one room at a time. Someone auditing a course
//                deliberately double-books: they decide per session which room
//                to walk into, and need BOTH events on the calendar to decide.
//                The server never checked for clashes, so this is purely the
//                client gate being lifted — shipped in health.sync.audit.
//
// Deliberately a code constant, not a sheet or a user preference: it is a
// one-student, one-term arrangement made with the instructor, and it must not be
// something a student can switch on for themselves to hide their own exams.
//
// EVERYTHING here is additive and roll-scoped. An empty map (the normal state)
// makes every code path below behave exactly as it did before this existed, and
// a roll that is not listed gets the untouched behaviour on every surface.
//
// The arrangements themselves live in config.gs → SIT_IN_COURSES (rolls
// upper-cased here so the lookup in auditRuleForUser_ matches the email-derived
// roll). It should be emptied at the start of every term.
var COURSE_AUDIT_ = (function () {
  var out = {};
  var rolls = Object.keys(CFG_.sitIn);
  for (var i = 0; i < rolls.length; i++) {
    var roll = settingText_(rolls[i]).toUpperCase();
    if (roll) out[roll] = CFG_.sitIn[rolls[i]];
  }
  return out;
})();

// The audit rule for the signed-in user, normalised to { classesOnly: {CODE:true},
// allowOverlaps: bool }. Memoised per execution: the background sync, the PDF and
// the health payload can each ask, and the answer cannot change mid-run.
//
// Identity comes from Session.getActiveUser() — the same call isPilotUser_,
// getSyncHealth and handoverSelectionsFromElectives_ use. The web app runs as
// USER_ACCESSING and a student's backgroundSync trigger runs as that student, so
// it is the caller's authenticated @iimsirmaur.ac.in address in both paths and
// cannot be spoofed.
//
// Fails CLOSED in the direction that matters: any doubt about who is calling
// yields the empty rule, i.e. ordinary behaviour with every quiz and exam
// present. A student never silently loses an assessment because the lookup
// stumbled; the worst case is an audited student briefly seeing an exam they can
// then ignore.
var COURSE_AUDIT_MEMO_ = null;
function auditRuleForUser_() {
  if (COURSE_AUDIT_MEMO_) return COURSE_AUDIT_MEMO_;
  var rule = { classesOnly: {}, autoSelect: false, allowOverlaps: false };
  try {
    var email = Session.getActiveUser().getEmail() || "";
    var roll = email ? email.split("@")[0].toUpperCase() : "";
    var entry = roll ? COURSE_AUDIT_[roll] : null;
    if (entry) {
      var codes = entry.classesOnly || [];
      for (var i = 0; i < codes.length; i++) {
        var c = codes[i] ? String(codes[i]).trim().toUpperCase() : "";
        if (c) rule.classesOnly[c] = true;
      }
      rule.autoSelect = !!entry.autoSelect;
      rule.allowOverlaps = !!entry.allowOverlaps;
    }
  } catch (e) {
    // Identity is unreadable — treat the caller as an ordinary student.
    console.warn("auditRuleForUser_ could not identify the caller: " + getErrorMessage_(e));
  }
  COURSE_AUDIT_MEMO_ = rule;
  return rule;
}

// A copy of a { CODE: {SECTION:true} } enrolment map with the audited codes
// removed, for the passes that must not fire on an audited course (quizzes,
// exams). Returns the ORIGINAL object untouched when there is nothing to drop,
// so the overwhelmingly common case allocates nothing and the two maps are
// literally the same reference — no behaviour to diverge.
function withoutAuditedCodes_(selectedCodes, classesOnly) {
  if (!classesOnly) return selectedCodes;
  var drop = Object.keys(classesOnly);
  if (!drop.length) return selectedCodes;
  var out = {};
  var keys = Object.keys(selectedCodes);
  var dropped = false;
  for (var i = 0; i < keys.length; i++) {
    if (classesOnly[keys[i].toUpperCase()]) { dropped = true; continue; }
    out[keys[i]] = selectedCodes[keys[i]];
  }
  return dropped ? out : selectedCodes;
}

// `selections` (the saved tt_selections list) with every auto-selected audited
// course added, or the SAME array when there is nothing to add — which is the case
// for every student but the one or two named in COURSE_AUDIT_, so the ordinary path
// allocates nothing and calls nothing.
//
// Deliberately additive only. It never removes a pick, and the caller must have
// established that the student HAS selections: auto-selecting into an empty list
// would enable the tool for somebody who never asked for it.
//
// The selection key has to match the format enableAutoSync stores and
// resolveSelectionCode_ reads — "CODE" for a single-section course, "CODE-SECTION"
// otherwise — so it is derived from the live catalogue rather than assumed. A course
// running several sections cannot be resolved this way (which group?), so it must be
// written into COURSE_AUDIT_ with its section already attached ("MLBA-B"); an
// unresolvable code is skipped and logged rather than guessed at.
function withAuditedSelections_(selections) {
  var rule = auditRuleForUser_();
  var codes = Object.keys(rule.classesOnly);
  if (!rule.autoSelect || !codes.length) return selections;
  if (!Array.isArray(selections) || !selections.length) return selections;

  // Which courses are already picked (any section of them).
  var have = {};
  for (var s = 0; s < selections.length; s++) {
    var res = resolveSelectionCode_(selections[s]);
    if (res) have[res.code.toUpperCase()] = true;
  }
  var missing = [];
  for (var i = 0; i < codes.length; i++) if (!have[codes[i]]) missing.push(codes[i]);
  if (!missing.length) return selections;

  var courses = null;
  try { courses = getCourseData(); } catch (e) {
    console.warn("Auto-select skipped — the catalogue is unreadable: " + getErrorMessage_(e));
    return selections;
  }
  var out = selections.slice();
  for (var m = 0; m < missing.length; m++) {
    var code = missing[m];
    // A code written with its section already attached resolves directly.
    var direct = resolveSelectionCode_(code);
    if (direct && direct.section) { out.push(code); continue; }
    var course = courses[code];
    if (!course) {
      console.warn("Auto-select skipped " + code + " — it has no rows on the timetable yet.");
      continue;
    }
    var sections = Object.keys(course.sections);
    var hasRealSections = sections.length > 1 || (sections.length === 1 && sections[0] !== "");
    if (!hasRealSections) { out.push(code); continue; }
    if (sections.length === 1) { out.push(code + "-" + sections[0]); continue; }
    console.warn("Auto-select skipped " + code + " — it runs " + sections.length +
      " sections; write the section into COURSE_AUDIT_ (e.g. \"" + code + "-" + sections[0] + "\").");
  }
  return out;
}

// ---------------------------------------------------------
// COURSE EVALUATION SCHEMES
// ---------------------------------------------------------
// Per-course grade breakdown from each course outline's "Evaluation Components"
// table (config.gs → COURSE_EVALUATION). Single source of truth: read server-side
// to tag quiz/exam events with their weight, and shipped to the client via the
// health payload (health.courseEval) to render the "📊 Evaluation" popup. Keyed by
// the same course code as COURSE_INFO_. Each course's weights should sum to 100
// (✓ Check settings says when one doesn't).
//
// `kind` drives event matching — only "quiz", "midterm" and "endterm" are read by
// the matchers below; every other value ("project", "participation", "assignment",
// "case", "simulation", "presentation", "reflection", "activity") is popup-only.
// The component `label` is shown verbatim, so quiz counts/caveats live there (e.g.
// "Quiz (2)") — we never invent a per-quiz split.
//
// A course with no scheme simply shows no evaluation popup and no weight tags:
// every lookup (quizEvalComponent_, examEvalComponent_, examTermLabel_) returns
// null on a miss.
var COURSE_EVAL_ = (function () {
  var out = {};
  var codes = Object.keys(CFG_.evaluation);
  for (var i = 0; i < codes.length; i++) {
    var ev = CFG_.evaluation[codes[i]];
    if (!ev || !Array.isArray(ev.components)) {
      settingsProblem_('COURSE_EVALUATION: ' + codes[i] + ' needs a components list. Skipped.');
      continue;
    }
    out[settingText_(codes[i])] = ev;
  }
  return out;
})();

// The quiz component for a course, or null. Weight 0 (Term 4's AIA listed Quizzes at 0%)
// returns null so a meaningless "part of 0%" tag is never stamped on an event.
function quizEvalComponent_(code) {
  var ev = COURSE_EVAL_[code];
  if (!ev) return null;
  for (var i = 0; i < ev.components.length; i++) {
    if (ev.components[i].kind === "quiz" && ev.components[i].weight > 0) return ev.components[i];
  }
  return null;
}

// The exam component matching an exam event's term label ("Mid-Term" | "End-Term",
// from examTermLabel_). Prefers the exact midterm/endterm match; if the course lists
// exactly one exam it uses that (covers a lone Final that lands in the mid-term
// window). Null when the course has no written-exam component or no scheme.
function examEvalComponent_(code, examLabel) {
  var ev = COURSE_EVAL_[code];
  if (!ev) return null;
  var exams = ev.components.filter(function (c) { return c.kind === "midterm" || c.kind === "endterm"; });
  if (!exams.length) return null;
  var wantMid = /^Mid/i.test(examLabel);
  for (var i = 0; i < exams.length; i++) {
    if (wantMid && exams[i].kind === "midterm") return exams[i];
    if (!wantMid && exams[i].kind === "endterm") return exams[i];
  }
  return exams.length === 1 ? exams[0] : null;
}

// Public, direct-image URL of the institute crest used as the browser-tab favicon
// (config.gs → INSTITUTE.faviconUrl). MUST point straight at the image bytes (open
// it in a browser — it should show ONLY the image), be publicly accessible, and
// allow hotlinking. Apps Script ignores <link rel="icon"> inside Index.html, so the
// tab icon can only be set here via setFaviconUrl(). data: URIs are NOT reliably
// honoured — use a hosted http(s) URL.
//
// This is the ONLY external asset the tool depends on, and only for the browser
// TAB ICON — every in-app logo (SAC crest in the hero badge and footer) is embedded
// as a base64 data URI in Index.html, so if this URL ever rate-limits or 404s the
// app still loads and looks correct; only the tiny tab icon is missing. setFavicon_
// applies it defensively so a bad/empty value can never break page output.
var FAVICON_URL_ = settingText_(CFG_.institute.faviconUrl);

// ── Credits ───────────────────────────────────────────────────────────────────
// TermSync was created by Aniketh Hotagi. The footer, the PDF and the sign-in card
// credit the SAC and this batch's maintainer (config.gs → MAINTAINER), and keep the
// original creator's credit alongside.
var CREATOR_CREDIT_ = { name: "Aniketh Hotagi", url: "https://www.linkedin.com/in/aniketh-hotagi/" };

function htmlEscape_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Links are only ever shown when they are plain https URLs; anything else from
// config.gs is dropped rather than put into an href.
function safeLink_(url) {
  var s = settingText_(url);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
}

// The static, per-deploy facts the page shows that come from config.gs rather
// than from the institute's sheets: who runs the tool, the links in the footer,
// the course outlines, and how courses are chosen. Shipped in the health payload
// (health.site) on every full load, so Index.html holds no copy of its own.
function siteSettings_() {
  var outlines = {};
  var files = FEATURES_.courseOutlines ? ((CFG_.outlines && CFG_.outlines.files) || {}) : {};
  Object.keys(files).forEach(function (code) {
    var list = Array.isArray(files[code]) ? files[code] : [files[code]];
    var clean = [];
    list.forEach(function (o) {
      if (!o) return;
      var raw = settingText_(o.id || o.link || (typeof o === "string" ? o : ""));
      var m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(raw) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(raw);
      var id = m ? m[1] : (/^[A-Za-z0-9_-]{10,}$/.test(raw) ? raw : "");
      if (id) clean.push({ id: id, fac: settingText_(o.fac) });
    });
    if (clean.length) outlines[settingText_(code)] = clean;
  });
  var courseNames = {};
  Object.keys(COURSE_INFO_).forEach(function (code) { courseNames[code] = COURSE_INFO_[code].name; });
  var mode = enrolmentMode_();
  return {
    institute: settingText_(CFG_.institute.name),
    emailDomain: EMAIL_DOMAIN_,
    sacUrl: safeLink_(CFG_.institute.sacLinkedIn),
    maintainer: { name: settingText_(CFG_.maintainer.name), url: safeLink_(CFG_.maintainer.linkedin) },
    creator: CREATOR_CREDIT_,
    courseNames: courseNames,
    outlineFolderUrl: FEATURES_.courseOutlines ? safeLink_(CFG_.outlines && CFG_.outlines.folder) : "",
    // config.gs → FEATURES, so the page hides what is switched off.
    features: FEATURES_,
    outlines: outlines,
    // "section" | "electives" | "pick" — the client hides the auto-fill button in
    // "pick" mode and words the "your courses" card for the mode in use.
    selection: mode
  };
}

// Applies the favicon without ever letting a malformed/empty URL throw out of
// doGet (which would hand the user a raw Apps Script error page instead of the
// tool). The tab icon is cosmetic, so any failure is silently swallowed.
function setFavicon_(htmlOutput) {
  try {
    if (FAVICON_URL_) htmlOutput.setFaviconUrl(FAVICON_URL_);
  } catch (e) {
    console.warn("setFaviconUrl failed (non-fatal): " + getErrorMessage_(e));
  }
  return htmlOutput;
}

function doGet() {
  var email = Session.getActiveUser().getEmail();
  if (!email || (email.split('@')[1] || "").toLowerCase() !== EMAIL_DOMAIN_) {
    var displayEmail = email ? email : "a personal Google account";
    // Dark by default, matching the app. This page renders BEFORE the app — and
    // before its tt_theme localStorage exists — so it can't read the user's stored
    // choice; painting it light would flash a white card at everyone on the way to
    // a dark tool. The prefers-color-scheme block is inverted from the usual shape:
    // dark is the base and an explicitly light OS gets the light palette back.
    var errorHtml =
      '<meta name="color-scheme" content="dark light">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
      '<style>' +
        'body{margin:0;padding:16px;background:#0f141a;}' +
        '.err-card{font-family:\'Figtree\',-apple-system,sans-serif;text-align:center;padding:40px;' +
          'background:#2a1718;color:#fca5a5;border-radius:12px;max-width:500px;margin:40px auto;border:1px solid #5c2b2b;}' +
        '.err-foot{font-size:12px;margin-top:20px;color:#9aa6b4;}' +
        '.err-card a{color:#6aa6f5;text-decoration:none;font-weight:600;}' +
        '@media (prefers-color-scheme:light){' +
          'body{background:#f5f6f8;}' +
          '.err-card{background:#f8d7da;color:#842029;border-color:#f5c2c7;}' +
          '.err-foot{color:#666;}' +
          '.err-card a{color:#1a73e8;}' +
        '}' +
      '</style>' +
      '<div class="err-card">' +
        '<h2>⚠️ Institute Account Required</h2>' +
        '<p>You are logged in as:</p><b>' + htmlEscape_(displayEmail) + '</b>' +
        '<p style="margin-top:20px;">Please switch to your <b>@' + htmlEscape_(EMAIL_DOMAIN_) + '</b> account.</p>' +
        '<p class="err-foot">' + creditLineHtml_() + '</p>' +
      '</div>';
    var errorOut = HtmlService.createHtmlOutput(errorHtml).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return setFavicon_(errorOut);
  }

  var out = pageWithBootstrap_()
    .setTitle('TermSync' + (CFG_.institute.name ? ' - ' + settingText_(CFG_.institute.name) : ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return setFavicon_(out);
}

// "TermSync · SAC × <maintainer> · created by Aniketh Hotagi", as HTML. Each name
// links only when config.gs gives it a proper https link.
function creditLineHtml_() {
  var link = function (text, url) {
    return url ? '<a href="' + htmlEscape_(url) + '" target="_blank" rel="noopener">' + htmlEscape_(text) + '</a>'
               : htmlEscape_(text);
  };
  var who = settingText_(CFG_.maintainer.name);
  var line = 'TermSync · ' + link('SAC', safeLink_(CFG_.institute.sacLinkedIn));
  if (who && who !== "YOUR NAME") line += ' × ' + link(who, safeLink_(CFG_.maintainer.linkedin));
  if (who === CREATOR_CREDIT_.name) return line;
  return line + ' · created by ' + link(CREATOR_CREDIT_.name, CREATOR_CREDIT_.url);
}

// Builds the page with its load-time data already inside it. Without this the page
// arrives empty and then asks for bootstrap() in a SECOND execution — a whole extra
// google.script.run round trip that only starts once the page has finished loading,
// which is most of the wait before a student's ticked courses and status appear.
// doGet runs as the student (USER_ACCESSING), so bootstrap() here returns exactly
// what that call would have.
//
// Every failure falls back to today's page: a bootstrap that throws embeds nothing,
// and a template that fails to evaluate is replaced by the plain file. Either way the
// data island stays non-JSON and the client makes the old bootstrap() call itself.
function pageWithBootstrap_() {
  var json = "";
  try {
    // "<" is escaped so no string in the payload (a course name, a change-log line)
    // can close the <script> element it is embedded in. JSON.parse turns it back.
    json = JSON.stringify(bootstrap()).replace(/</g, "\\u003c");
  } catch (e) {
    console.warn("Embedded bootstrap skipped: " + getErrorMessage_(e));
    json = "";
  }
  try {
    var tmpl = HtmlService.createTemplateFromFile('Index');
    tmpl.bootJson = json;
    return tmpl.evaluate();
  } catch (tmplErr) {
    console.warn("Index template failed; serving the plain page: " + getErrorMessage_(tmplErr));
    return HtmlService.createHtmlOutputFromFile('Index');
  }
}

// ---------------------------------------------------------
// CUSTOM MENU & LOGGING
// ---------------------------------------------------------

// Shows the admin menu to the same set assertAdmin_ accepts (owner + editors), not
// just the owner — previously a co-admin editor could run admin actions but never
// saw the menu. Defensive throughout: getOwner() can return null (e.g. shared
// drives), and onOpen must never throw or the spreadsheet opens without any menu.
function onOpen() {
  try {
    var currentUser = (Session.getActiveUser().getEmail() || "").toLowerCase();
    if (!currentUser) return;
    var allowed = getSpreadsheetAdmins_();
    // Fail open like assertAdmin_: if admins are undeterminable, show the menu —
    // every action behind it still re-checks via assertAdmin_.
    if (Object.keys(allowed).length > 0 && !allowed[currentUser]) return;
    // Opening the sheet runs the SAVED code too — record its build (see BUILD_ID_).
    stampSavedBuild_();
    SpreadsheetApp.getUi()
      .createMenu('📊 Tool Stats')
      .addItem('Show usage stats', 'showUsageStatsDialog')
      .addItem('Open Usage tab', 'openUsageTab')
      .addItem('Open Reports tab (wrong-entry reports)', 'openReportsTab')
      .addItem('Re-hide Usage & Reports tabs', 'hideUsageTab')
      .addSeparator()
      .addItem('Institute fetch status', 'showAdminFetchTriggerStatus')
      .addItem('Install institute fetch trigger', 'installAdminFetchTrigger')
      .addItem('Remove institute fetch trigger', 'removeAdminFetchTrigger')
      .addSeparator()
      .addItem('\u2713 Check settings', 'checkSettings')
      .addItem('Test timetable source', 'testTimetableSource')
      .addItem('\u2713 Enrolment pre-flight (every student)', 'showEnrolmentPreflight')
      .addItem('Set up paste-in tabs', 'setUpManualTimetable')
      .addSeparator()
      .addItem('Refresh from institute now', 'refreshFromInstituteNow')
      .addSeparator()
      .addItem('▶ Start ' + TERM_CONFIG_.label + ' handover', 'startTermHandover')
      .addItem('Handover status', 'showHandoverStatus')
      .addSeparator()
      .addItem('End term', 'endTerm')
      .addItem('Reopen term', 'reopenTerm')
      .addToUi();
  } catch (e) {
    console.warn("onOpen menu setup failed: " + getErrorMessage_(e));
  }
}

function showUsageStatsDialog() {
  assertAdmin_();
  var stats = showUsageStats();
  // Plain ui.alert rather than showModalDialog: showModalDialog requires the
  // script.container.ui OAuth scope, which is deliberately NOT in appsscript.json
  // (adding it would force every web-app user to re-consent — see the pinned
  // scopes). alert/prompt need only the base script authorization. This menu is
  // admin-only and occasional, so a text summary is an acceptable trade.
  var ui = SpreadsheetApp.getUi();
  ui.alert(
    '📊 Usage Stats',
    'Currently active users: ' + stats.currentlyActive + '\n' +
    'Total users: ' + stats.totalUsers + '\n' +
    'Total actions: ' + stats.totalActions + '\n' +
    'Times sync turned on: ' + stats.totalEnables + '\n\n' +
    formatPathStatsLine_(),
    ui.ButtonSet.OK
  );
}

// One-line summary of the calendar-path telemetry aggregate (admin-only). Reads
// the property flushPathTelemetry_ maintains; shows the fast-path fallback rates
// so the admin can judge whether CALENDAR_API_BATCH_SIZE_ needs lowering. Never
// throws — a telemetry read must not break the stats dialog.
function formatPathStatsLine_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PATH_STATS_PROP_);
    if (!raw) return 'Sync paths: no data yet.';
    var s = JSON.parse(raw);
    if (!s || !s.syncs) return 'Sync paths: no data yet.';
    var pct = function (n, d) { return d > 0 ? Math.round((n / d) * 100) + '%' : '0%'; };
    return 'Sync paths (n=' + s.syncs + ', batch=' + (s.batch || CALENDAR_API_BATCH_SIZE_) + '):\n' +
      '  create fast→slow fallback: ' + pct(s.cFall, s.syncs) + ' · slow-only: ' + pct(s.cSlow - s.cFall > 0 ? s.cSlow - s.cFall : 0, s.syncs) + '\n' +
      '  delete fast→slow fallback: ' + pct(s.dFall, s.syncs) + '\n' +
      '  API unavailable: ' + pct(s.apiDown, s.syncs) +
      ' · events created: ' + (s.created || 0) + ', removed: ' + (s.removed || 0);
  } catch (e) {
    return 'Sync paths: unavailable.';
  }
}

function openUsageTab() {
  assertAdmin_();
  var sheet = getUsageSheet_();
  normalizeUsageSheet_(sheet);
  // The sheet is created hidden (see getUsageSheet_) — unhide for the admin.
  // IMPORTANT: this leaves the tab visible. With students on view-only access an
  // un-hidden tab is visible to them too, so re-hide it when done (the "Re-hide
  // Usage tab" menu item, hideUsageTab).
  if (sheet.isSheetHidden()) sheet.showSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

// Shows the "Report a wrong entry" submissions in the sheet itself. Drains the
// report buffer first, so a report sent minutes ago is already in the list. Same
// visibility caveat as openUsageTab: re-hide it afterwards.
function openReportsTab() {
  assertAdmin_();
  flushReportBuffer_();
  var sheet = getReportsSheet_();
  if (sheet.isSheetHidden()) sheet.showSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

// Re-hides the Usage (and Reports) tab after the admin is done viewing it.
// Necessary because, with students downgraded to view-only, an un-hidden tab is
// visible to them — so the audit log must be put back out of sight. A spreadsheet
// must keep at least one visible sheet, so switch away first; showSheet/hideSheet
// only need edit rights, which the admin running this menu has.
function hideUsageTab() {
  assertAdmin_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName("MasterData");
  if (master) ss.setActiveSheet(master); // can't hide the active sheet
  var hidden = [];
  [USAGE_SHEET_NAME, REPORTS_SHEET_NAME].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && !sheet.isSheetHidden()) { sheet.hideSheet(); hidden.push(name); }
  });
  SpreadsheetApp.getUi().alert(hidden.length
    ? hidden.join(' and ') + ' hidden again. (Hidden tabs are still readable by anyone with view ' +
      'access who downloads or copies the file — see docs/SETUP.md, "Who can see the spreadsheet".)'
    : 'Nothing to hide — the Usage and Reports tabs are already hidden.');
}

// Builds the set of emails considered admins: the spreadsheet owner plus any
// explicitly-added editor. Shared by assertAdmin_ and onOpen so the people who can
// run admin actions and the people who see the admin menu are the same set.
// Returns {} when nothing is determinable (e.g. shared drive without a readable
// owner) — callers decide how to fail.
//
// Memoized for the lifetime of one execution: the admin set can't change mid-run,
// yet getOwner()/getEditors() (each a Drive round trip) is hit from onOpen,
// assertAdmin_, and protectDataSheet_ (twice per admin fetch). Apps Script reloads
// the script per execution, so SPREADSHEET_ADMINS_CACHE_ resets every run — there is
// no cross-execution staleness. An empty result is cached too: it only happens when
// owner/editors are unreadable, which won't recover within the same execution.
var SPREADSHEET_ADMINS_CACHE_ = null;
function getSpreadsheetAdmins_() {
  if (SPREADSHEET_ADMINS_CACHE_) return SPREADSHEET_ADMINS_CACHE_;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allowed = {};
  try {
    var owner = ss.getOwner();
    if (owner && owner.getEmail()) allowed[owner.getEmail().toLowerCase()] = true;
  } catch (e) { /* owner not readable (e.g. shared drive) — ignore */ }
  try {
    var editors = ss.getEditors();
    for (var i = 0; i < editors.length; i++) {
      var em = editors[i].getEmail();
      if (em) allowed[em.toLowerCase()] = true;
    }
  } catch (e) { /* editors not readable for this caller — ignore */ }
  SPREADSHEET_ADMINS_CACHE_ = allowed;
  return allowed;
}

// Restricts admin-only actions to people who can edit the spreadsheet (owner or any
// editor). The 30-minute fetch trigger runs as the owner, and the admin menu runs as an editor,
// so both pass; a domain student calling via google.script.run (execute-as-accessing-user)
// is not an editor and is blocked. Fails open if no identities can be determined, so a
// real admin or the background trigger is never accidentally locked out.
function assertAdmin_() {
  var effective = (Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (!effective) return; // Can't identify the caller — fail open.

  var allowed = getSpreadsheetAdmins_();
  if (Object.keys(allowed).length === 0) {
    // Couldn't determine admins. Failing fully open would let any student who
    // hits this state run admin actions — harmless to the sheets (ACLs block
    // the writes) but Script Properties like last_fetch_at are writable from
    // any execution. So: a caller who maps to a roster student OUTSIDE
    // SAC_ROLES_ is blocked; anyone unidentifiable (e.g. the owner's
    // non-roster account running the trigger) keeps the old fail-open so
    // automation is never locked out.
    var student = lookupStudentByEmail_(effective);
    if (student && !SAC_ROLES_[student.rollNo]) {
      throw new Error("This action is restricted to the timetable administrator.");
    }
    return;
  }
  if (!allowed[effective]) {
    throw new Error("This action is restricted to the timetable administrator.");
  }
}

function endTerm() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'End term?',
    'This closes the tool for the term, for everyone:\n\n' +
    '• The website locks behind a full-screen "Term has ended" notice — no one can use it.\n' +
    '• The automatic institute fetch stops (trigger removed) and stays blocked, including Force fetch.\n' +
    '• On each student\'s next background run (within ~30 min) their synced events are crossed out as a final record, then their own auto-sync trigger removes itself.\n\n' +
    'Nothing is deleted — events stay on students\' calendars, struck through. "Reopen term" undoes all of this.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var deleted = removeAdminFetchTriggers_();
  // Clear the cadence marker too: without it, the next fetch after "Reopen term"
  // would see a matching interval, skip the install, and never re-create the
  // trigger that End term just removed.
  try { PropertiesService.getScriptProperties().deleteProperty('admin_fetch_interval'); } catch (e) { }

  // Final drain of the student-written event buffers (usage / reports / path
  // telemetry): the fetch trigger that normally flushes them is gone
  // now, yet students keep generating events after term end (PDF downloads,
  // disables, reports) — without this, buffered keys would pile up in Script
  // Properties until the store's 500 KB limit breaks all property writes.
  // (Later events are guarded by the PROP_BUFFER_SOFT_CAP_ drop instead.)
  // This menu runs as an admin with edit rights, so the sheet writes succeed.
  flushUsageBuffer_();
  flushReportBuffer_();
  flushPathTelemetry_();

  PropertiesService.getScriptProperties().setProperty('term_ended_at', String(Date.now()));

  ui.alert('Term ended. Removed ' + deleted + ' admin trigger(s). The website is now locked for everyone, ' +
    'and each student\'s events are crossed out on their next background run (within ~30 minutes).');
}

function reopenTerm() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Reopen term?',
    'This unlocks the website and lifts every "term ended" block (institute fetch, force fetch, student syncs).\n\n' +
    'Crossed-out calendar events heal automatically: each student\'s next sync strips the strike-through. Their ' +
    'background triggers were removed at term end, so each student resumes when they next open the tool and ' +
    'click Sync now / Update Auto-Sync.\n\n' +
    'Important: the institute fetch trigger was removed at term end. Re-install it with ' +
    '"Install institute fetch trigger" from this menu.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  PropertiesService.getScriptProperties().deleteProperty('term_ended_at');
  ui.alert('Term reopened. Run "Install institute fetch trigger" from this menu to restart the ' +
    'automatic fetch — and students resume (and their calendars un-strike) on their next ' +
    'Sync now / Update Auto-Sync click.');
}

// Opens the Term 4 → Term 5 handover for the whole batch. Run ONCE, from the
// menu, after this build has been pasted in and deployed as a new version.
//
// This is the admin half of the handover; handleTermHandover_ is the per-student
// half. All this does is remove the blocks and make sure Term 5 data exists —
// every calendar write happens later, inside each student's own run, as them.
function startTermHandover() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var scriptProps = PropertiesService.getScriptProperties();
  var wasEnded = !!scriptProps.getProperty('term_ended_at');

  var warning =
    'Hand the whole batch over from ' + PREVIOUS_TERM_.label + ' to ' + TERM_CONFIG_.label + '?\n\n' +
    'On each student\'s next background run (within ~30 minutes) this will:\n' +
    '  1. Cross out every synced event in their "' + PREVIOUS_TERM_.calendarName + '" calendar.\n' +
    '     That calendar is KEPT — nothing is deleted.\n' +
    '  2. ' + ({ section: 'Give them every ' + TERM_CONFIG_.label + ' course for their own section.',
               electives: 'Read their ' + TERM_CONFIG_.label + ' courses from the institute\'s elective tabs.',
               pick: 'Ask them to pick their ' + TERM_CONFIG_.label + ' courses the next time they open the tool.'
             })[enrolmentMode_()] + '\n' +
    '  3. Build those into a new "' + TERM_CONFIG_.calendarName + '" calendar.\n\n' +
    'Nobody re-authorises and the web-app link does not change.\n\n';

  if (pilotModeOn_()) {
    warning +=
      'TEST MODE IS ON — only ' + Object.keys(PILOT_ROLLS_).join(', ') + ' will actually\n' +
      'migrate. Everyone else stays on ' + PREVIOUS_TERM_.label + ', untouched. That is what you\n' +
      'want while testing; empty TEST_ONLY_FOR in config.gs when you are ready for\n' +
      'the batch.\n\n';
  }
  if (wasEnded) {
    warning +=
      'NOTE: this term is currently marked ended. Continuing lifts that block.\n' +
      'Students whose background trigger was removed at term end will resume only ' +
      'when they next open the tool — the handover cannot re-create another user\'s ' +
      'trigger.\n\n';
  }
  warning += 'Continue?';

  if (ui.alert('Start ' + TERM_CONFIG_.label + ' handover?', warning, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // Lift the term-end block first: backgroundSyncLocked_ checks it BEFORE the
  // handover, so while it is set every student's run returns at the term-end gate
  // and the handover never begins.
  scriptProps.deleteProperty('term_ended_at');
  try { scriptProps.deleteProperty('admin_fetch_interval'); } catch (e) { }

  // MasterData must hold Term 5 rows before any student syncs, or their first run
  // finds Term 4 classes (or nothing) and builds the wrong calendar.
  var fetchNote;
  try {
    fetchAndCleanAdminData();
    var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
    var rows = master ? Math.max(master.getLastRow() - 1, 0) : 0;
    fetchNote = 'Institute fetch ran: ' + rows + ' MasterData row(s).';
    if (rows === 0) {
      fetchNote += '\n\n⚠️ MasterData is EMPTY — students would sync an empty calendar. ' +
        'Fix the timetable source (see "Test timetable source") before letting this propagate.';
    }
  } catch (fetchErr) {
    fetchNote = '⚠️ Institute fetch FAILED: ' + getErrorMessage_(fetchErr) +
      '\n\nStudents will not sync anything until this succeeds. Fix it, then use ' +
      '"Refresh from institute now".';
  }

  // Re-install the owner-side fetch trigger inline rather than calling
  // installAdminFetchTrigger(), which carries its own confirm + alert and would
  // stack a second pair of dialogs on top of this one. "End term" removes this
  // trigger, so after a handover from an ended term it is always missing.
  var trigNote;
  try {
    removeAdminFetchTriggers_();
    ScriptApp.newTrigger('fetchAndCleanAdminData')
      .timeBased()
      .everyMinutes(ADMIN_FETCH_INTERVAL_MINUTES_)
      .create();
    scriptProps.setProperty('admin_fetch_interval', String(ADMIN_FETCH_INTERVAL_MINUTES_));
    trigNote = 'Institute fetch trigger installed (every ' + ADMIN_FETCH_INTERVAL_MINUTES_ + ' min).';
  } catch (trigErr) {
    trigNote = '⚠️ Could not install the institute fetch trigger: ' + getErrorMessage_(trigErr) +
      '\nInstall it by hand from this menu.';
  }

  ui.alert(TERM_CONFIG_.label + ' handover started.\n\n' + fetchNote + '\n\n' + trigNote +
    '\n\nStudents move over on their own background runs over the next ~30 minutes. ' +
    'Nothing else to do.');
}

// What the admin can actually verify about the handover.
//
// Deliberately does NOT claim a per-student completion count: the tt_handover
// latch lives in each student's own UserProperties, which no other account can
// read. Anything shown here would be a guess, and a reassuring wrong number is
// worse than none — so this reports only the shared preconditions, which are
// what actually go wrong.
function showHandoverStatus() {
  assertAdmin_();
  var scriptProps = PropertiesService.getScriptProperties();
  var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  var rows = master ? Math.max(master.getLastRow() - 1, 0) : 0;
  var ended = !!scriptProps.getProperty('term_ended_at');

  var lines = [
    'Handover: ' + PREVIOUS_TERM_.label + ' → ' + TERM_CONFIG_.label,
    ''];
  if (pilotModeOn_()) {
    lines.push(
      '*** TEST MODE IS ON — THE BATCH IS NOT MIGRATING ***',
      'Only these rolls run the tool: ' + Object.keys(PILOT_ROLLS_).join(', '),
      'Everyone else\'s sync returns immediately and their ' + PREVIOUS_TERM_.label,
      'calendar is untouched.',
      '',
      'To go live: empty TEST_ONLY_FOR in config.gs, save, and deploy a new version.',
      '');
  }
  lines = lines.concat([
    'From calendar : ' + PREVIOUS_TERM_.calendarName + '  (kept, events crossed out)',
    'To calendar   : ' + TERM_CONFIG_.calendarName + '  (created per student)',
    'Handover build: ' + HANDOVER_VERSION_,
    '',
    'Term-end block  : ' + (ended ? '⚠️ SET — no student can hand over. Run "Start ' +
      TERM_CONFIG_.label + ' handover".' : 'clear'),
    'MasterData rows : ' + rows + (rows === 0 ? '  ⚠️ empty — students would sync nothing' : ''),
    'Fetch trigger   : ' + (adminFetchTriggerCount_() > 0 ? 'installed' : '⚠️ missing'),
    'Timetable source: ' + describeTimetableSource_(),
    '',
    'Per-student progress is not centrally visible — the handover latch is stored',
    'in each student\'s own account. Use the Usage tab to see who has synced.'
  ]);
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

// The owner-side trigger that re-reads the institute's published sheets. Kept in
// code (rather than as a manual Apps Script Triggers UI step, as in Term 4) so it
// can't be forgotten at rollover or after "End term" removes it.
//
// Runs as whoever clicks the menu item, so it must be the account that owns the
// spreadsheet — the fetch writes the shared data sheets. Existing
// fetchAndCleanAdminData triggers are cleared first, so double-clicking the menu
// item can't leave two triggers racing each other on the same data.
function adminFetchTriggerCount_() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'fetchAndCleanAdminData') n++;
  }
  return n;
}

function removeAdminFetchTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'fetchAndCleanAdminData') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}

// Creates the paste-in tabs and explains the routine, so the fallback does not
// depend on remembering three undocumented sheet names.
function setUpManualTimetable() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wanted = [
    { name: MANUAL_TIMETABLE_SHEET_NAME, from: 'the class timetable' },
    { name: MANUAL_GUEST_SHEET_NAME,     from: 'guest lectures (optional)' },
    { name: MANUAL_FEEDBACK_SHEET_NAME,  from: 'feedback sessions (optional)' }
  ];
  var made = [];
  wanted.forEach(function (w) {
    if (!ss.getSheetByName(w.name)) { ss.insertSheet(w.name); made.push(w.name); }
  });
  ss.getSheetByName(MANUAL_TIMETABLE_SHEET_NAME).activate();

  ui.alert(
    made.length ? 'Created: ' + made.join(', ') : 'Paste-in tabs are already set up',
    'Use these when the office cannot share its timetable sheet with you.\n\n' +
    'Copy the whole table (with its header row) from wherever the institute shows it,\n' +
    'and paste it over cell A1 of the matching tab:\n\n' +
    wanted.map(function (w) { return '  ' + w.from + '  →  ' + w.name; }).join('\n') + '\n\n' +
    'Paste OVER the old contents every time; rows left below would be read as real ' +
    'entries. Keep the institute\'s own header and date rows exactly as they appear — ' +
    'the parsers look for them.\n\n' +
    'Each tab is only read when its published source has no rows for this term, so all ' +
    'three stop being used automatically once the institute publishes the real tabs.\n\n' +
    'Then run "Test timetable source" to confirm before deploying.',
    ui.ButtonSet.OK);
}

// ── Enrolment pre-flight ──────────────────────────────────────────────────────
// Answers, before the batch is let in, the only question that matters at rollout:
// will EVERY student get EVERY course they are enrolled in, with no overlaps?
//
// It resolves the institute's enrolment tabs against MasterData exactly the way a
// student's own sync will, for all ~270 rolls at once, and reports every way that
// can come out wrong:
//
//   • a course tab that could not be read at all       (would read as "not enrolled")
//   • a course code with no tab of its own             (the M&A failure, generalised)
//   • an enrolment section the timetable does not run  (matches zero rows)
//   • a course with several groups and no section given (cannot be auto-picked)
//   • a student who would end up with zero events
//   • two of a student's own classes overlapping in time
//   • roster students absent from every tab            (nothing to seed)
//
// Read-only. Touches no calendar, no user property and no student.
function enrolmentPreflightReport_() {
  var lines = [];
  var mode = enrolmentMode_();
  if (mode === "pick") {
    return ['Students pick their own courses this term (config.gs → THIS_TERM.courseSelection is "pick",',
            'or "electives" with no electivesSummary link), so there is no enrolment list to check.'];
  }
  var codes = [];
  var read = { maps: {}, missing: [] };
  if (mode === "section") {
    // Section mode has no enrolment sheet: the roster's section IS the enrolment.
    // Resolved per student below by the same sectionCoursesFor_ the sync uses.
    codes = Object.keys(COURSE_INFO_);
    lines.push('Courses come from each student\'s section in config.gs → STUDENTS.');
  } else {
    var catalogue;
    try {
      catalogue = getElectiveCatalogue_();
    } catch (e) {
      return ['FAILED to read the elective Summary tab: ' + getErrorMessage_(e)];
    }
    if (!catalogue.length) return ['The elective Summary tab parsed to zero courses — check DATA_SOURCES.electivesSummary.'];

    for (var c = 0; c < catalogue.length; c++) codes.push(catalogue[c].code);
    var allInfo = Object.keys(COURSE_INFO_);
    for (var ai = 0; ai < allInfo.length; ai++) {
      if (COURSE_INFO_[allInfo[ai]].required && codes.indexOf(allInfo[ai]) === -1) codes.push(allInfo[ai]);
    }

    // Drop the shared tab-list cache first. A pre-flight that reads a six-hour-old
    // map is answering a question about the past — and a stale map is precisely how
    // this report can say "M&A unreadable" about a build that reads M&A fine.
    // Costs one extra page fetch, on an admin action nobody runs in a loop.
    try { CacheService.getScriptCache().remove(ELECTIVES_GID_CACHE_KEY_); } catch (e) { }

    read = getElectiveSectionMaps_(codes);
    lines.push('Elective document : ' + catalogue.length + ' course(s) on the Summary tab');
    if (read.missing.length) {
      lines.push('⚠ UNREADABLE TABS (' + read.missing.length + '): ' + read.missing.join(', '));
      lines.push('  Every student in these courses would be reported as NOT enrolled.');
      lines.push('  Seeding refuses to run while this is true, so nothing is half-built —');
      lines.push('  but fix it before going live or those students wait.');
    } else {
      lines.push('✓ All ' + codes.length + ' course tabs read cleanly.');
    }
  }

  var sectionIndex = masterDataSectionIndex_();
  var mdKeys = Object.keys(sectionIndex);
  if (!mdKeys.length) {
    lines.push('');
    lines.push('⚠ MasterData is EMPTY — run the institute fetch first, or every');
    lines.push('  seeded selection would resolve to a bare course code and match nothing.');
    return lines;
  }

  // Slot table straight off MasterData, so overlap detection uses the very rows
  // the sync will turn into events.
  var slotsByKey = {};
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  var data = sheet.getDataRange().getValues();
  var badTime = 0;
  for (var r = 1; r < data.length; r++) {
    var rCode = data[r][3] ? data[r][3].toString().trim() : "";
    if (!rCode) continue;
    var rSec = data[r][4] ? data[r][4].toString().trim() : "";
    var key = rSec ? rCode + "-" + rSec : rCode;
    var d = parseSheetDate_(data[r][0]);
    if (!d || !isWithinSyncWindow_(d)) continue;
    var sp, ep;
    try { sp = parseTime_(data[r][1]); ep = parseTime_(data[r][2]); } catch (te) { badTime++; continue; }
    if (!isValidTimeRange_(sp, ep)) { badTime++; continue; }
    (slotsByKey[key] = slotsByKey[key] || []).push({
      day: Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      s: sp.h * 60 + sp.m, e: ep.h * 60 + ep.m, code: rCode
    });
  }

  // Every roll that appears anywhere in the enrolment tabs — or, in section mode,
  // every roster student with a section.
  var rolls = {};
  if (mode === "section") {
    var rosterAll = Object.keys(STUDENT_ROSTER_);
    for (var ra = 0; ra < rosterAll.length; ra++) {
      if (STUDENT_ROSTER_[rosterAll[ra]][1]) rolls[rosterAll[ra].toUpperCase()] = true;
    }
  }
  for (var mc = 0; mc < codes.length; mc++) {
    var map = read.maps[codes[mc]];
    if (!map) continue;
    var mk = Object.keys(map);
    for (var m = 0; m < mk.length; m++) rolls[mk[m]] = true;
  }

  var totalStudents = 0, zeroEvent = [], clashing = [], unresolvedBy = {}, mismatchBy = {},
      classlessBy = {}, minEv = null, maxEv = 0, sumEv = 0, counts = {};
  // electiveRollKeys_ deliberately indexes a repeat student under BOTH the roll the
  // sheet carries ("MBA24999R") and its digits-only form ("MBA24999"), so the
  // lookup matches whichever way the roll was arrived at. Counting both here would
  // report that student twice, once with a full timetable and once identically —
  // so the bare alias is dropped whenever its suffixed original is also present.
  var rollList = [];
  var allRolls = Object.keys(rolls);
  var aliasOf = {};
  for (var ar = 0; ar < allRolls.length; ar++) {
    var bare = allRolls[ar].replace(/[^0-9]+$/, "");
    if (bare !== allRolls[ar]) aliasOf[bare] = true;
  }
  for (var ar2 = 0; ar2 < allRolls.length; ar2++) {
    if (!aliasOf[allRolls[ar2]]) rollList.push(allRolls[ar2]);
  }
  for (var q = 0; q < rollList.length; q++) {
    var roll = rollList[q];
    var picks = [];
    if (mode === "section") {
      var secPicks = sectionCoursesFor_(roll, (getRosterIndex_()[roll] || [])[1] || "", sectionIndex);
      for (var sp0 = 0; sp0 < secPicks.length; sp0++) {
        picks.push({ key: secPicks[sp0].section ? secPicks[sp0].code + "-" + secPicks[sp0].section : secPicks[sp0].code,
                     code: secPicks[sp0].code });
      }
    }
    for (var pc = 0; mode !== "section" && pc < codes.length; pc++) {
      var pMap = read.maps[codes[pc]];
      if (!pMap || pMap[roll] === undefined) continue;
      if (!COURSE_INFO_[codes[pc]]) continue;   // information-only listing
      var sel = resolveSeedSelection_(codes[pc], pMap[roll], sectionIndex);
      if (sel === null) {
        (unresolvedBy[codes[pc]] = unresolvedBy[codes[pc]] || []).push(roll);
        continue;
      }
      picks.push({ key: sel, code: codes[pc] });
    }
    if (!picks.length) continue;
    totalStudents++;

    var events = [];
    for (var pk = 0; pk < picks.length; pk++) {
      var got = slotsByKey[picks[pk].key];
      if (!got || !got.length) {
        if (sectionIndex[picks[pk].code]) (mismatchBy[picks[pk].key] = mismatchBy[picks[pk].key] || []).push(roll);
        else (classlessBy[picks[pk].code] = classlessBy[picks[pk].code] || []).push(roll);
        continue;
      }
      for (var g = 0; g < got.length; g++) events.push(got[g]);
    }
    var n = events.length;
    sumEv += n; counts[n] = (counts[n] || 0) + 1;
    if (minEv === null || n < minEv) minEv = n;
    if (n > maxEv) maxEv = n;
    if (n === 0) zeroEvent.push(roll);

    var byDay = {};
    for (var ev = 0; ev < events.length; ev++) {
      (byDay[events[ev].day] = byDay[events[ev].day] || []).push(events[ev]);
    }
    var days = Object.keys(byDay);
    var clash = null;
    for (var dd = 0; dd < days.length && !clash; dd++) {
      var list = byDay[days[dd]];
      for (var a = 0; a < list.length && !clash; a++) {
        for (var b = a + 1; b < list.length; b++) {
          if (list[a].s < list[b].e && list[b].s < list[a].e) {
            clash = days[dd] + " " + list[a].code + " / " + list[b].code;
            break;
          }
        }
      }
    }
    if (clash) clashing.push(roll + " (" + clash + ")");
  }

  lines.push('');
  lines.push((mode === "section" ? 'Students with courses          : ' : 'Students in the enrolment tabs : ') + totalStudents);
  lines.push('Class events per student       : ' + minEv + ' – ' + maxEv +
    '  (average ' + (totalStudents ? Math.round(sumEv / totalStudents) : 0) + ')');
  var spread = Object.keys(counts).sort(function (x, y) { return Number(x) - Number(y); });
  var spreadTxt = [];
  for (var sp2 = 0; sp2 < spread.length; sp2++) spreadTxt.push(spread[sp2] + ':' + counts[spread[sp2]]);
  lines.push('Spread (events:students)       : ' + spreadTxt.join('  '));
  if (badTime) lines.push('⚠ ' + badTime + ' MasterData row(s) had an unusable date or time and were ignored.');

  lines.push('');
  lines.push(zeroEvent.length
    ? '⚠ ' + zeroEvent.length + ' student(s) would get ZERO events: ' + zeroEvent.slice(0, 15).join(', ')
    : '✓ No student would end up with an empty calendar.');
  lines.push(clashing.length
    ? '⚠ ' + clashing.length + ' student(s) have OVERLAPPING classes: ' + clashing.slice(0, 10).join('; ')
    : '✓ No student has two of their own classes at the same time.');

  var mmKeys = Object.keys(mismatchBy);
  lines.push(mmKeys.length
    ? '⚠ SECTION MISMATCH — these selection keys match no timetable row: ' +
      mmKeys.map(function (k) { return k + ' (' + mismatchBy[k].length + ' student(s))'; }).join(', ')
    : '✓ Every resolved selection matches real timetable rows.');

  var unKeys = Object.keys(unresolvedBy);
  lines.push(unKeys.length
    ? '⚠ NO SECTION GIVEN for a multi-group course: ' +
      unKeys.map(function (k) { return k + ' (' + unresolvedBy[k].length + ')'; }).join(', ') +
      ' — those students must pick that one course by hand.'
    : '✓ Every multi-group course names each student\'s section.');

  var clKeys = Object.keys(classlessBy);
  if (clKeys.length) {
    lines.push('ℹ No timetabled classes (expected for independent study / dissertation): ' +
      clKeys.map(function (k) { return k + ' (' + classlessBy[k].length + ')'; }).join(', '));
  }

  var rosterKeys = Object.keys(STUDENT_ROSTER_);
  var absent = [];
  lines.push('');
  if (mode === "section") {
    // Section mode's equivalent: no section on the roster, or a section the
    // timetable runs no course for (a typo like "a1", or a section not added yet).
    for (var rk2 = 0; rk2 < rosterKeys.length; rk2++) {
      var ent = STUDENT_ROSTER_[rosterKeys[rk2]];
      var gotAny = ent[1] && sectionCoursesFor_(rosterKeys[rk2].toUpperCase(), ent[1], sectionIndex).length;
      if (!gotAny) absent.push(rosterKeys[rk2].toUpperCase() + (ent[1] ? ' (section ' + ent[1] + ')' : ' (no section)'));
    }
    lines.push(absent.length
      ? '⚠ ' + absent.length + ' roster student(s) get NO course from their section: ' + absent.join(', ')
      : '✓ Every roster student gets their section\'s courses.');
  } else {
    // Roster students the institute's tabs never mention: nothing can be seeded for
    // them, so they are the list to chase with the PGP office before go-live.
    for (var rk = 0; rk < rosterKeys.length; rk++) {
      var rr = rosterKeys[rk].toUpperCase();
      if (!rolls[rr] && !rolls[rr.replace(/[^0-9]+$/, "")]) absent.push(rr);
    }
    if (absent.length) {
      lines.push('⚠ ' + absent.length + ' roster student(s) appear in NO elective tab.');
      lines.push('  They cannot be auto-seeded — the institute has not recorded their');
      lines.push('  enrolment. They fall back to picking by hand:');
      lines.push('  ' + absent.join(', '));
    } else {
      lines.push('✓ Every roster student appears in the institute\'s enrolment tabs.');
    }
  }

  lines.push('');
  lines.push(read.missing.length || zeroEvent.length || clashing.length || mmKeys.length
    ? '✖ NOT clear for go-live — resolve the ⚠ lines above first.'
    : '✓ Clear for go-live: every student resolves to a complete, clash-free set.');
  return lines;
}

// Menu version.
function showEnrolmentPreflight() {
  assertAdmin_();
  SpreadsheetApp.getUi().alert('Enrolment pre-flight',
    enrolmentPreflightReport_().join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// Editor version — run from the Apps Script Run button and read the execution log.
// The full list of absent rolls can exceed what an alert box shows comfortably.
function enrolmentPreflightLog() {
  // Public (no trailing underscore) so it appears in the editor's Run menu — which
  // also makes it callable by any student through google.script.run. The report
  // lists roll numbers and clears the shared tab-list cache, so it is admin-only.
  assertAdmin_();
  var report = enrolmentPreflightReport_().join('\n');
  console.log('\n===== ENROLMENT PRE-FLIGHT =====\n' + report + '\n================================');
  return report;
}

// Proves whichever timetable route is configured actually works, WITHOUT touching
// MasterData or anyone's calendar. Worth running before every deploy: the routes are
// interchangeable by design, so the only way to be sure the one in effect is really
// delivering this term's layout is to read it and parse it.
// Builds the timetable-source report as plain lines. Shared so the same check can be
// shown in a dialog (from the sheet menu) or written to the execution log (from the
// Apps Script editor) — the editor path matters because a dialog needs the
// spreadsheet open, which it often isn't while you're setting things up.
function timetableSourceReport_() {
  var lines = ['Route in effect: ' + describeTimetableSource_(), ''];
  var got;
  try {
    got = getTimetableRows_(null);
  } catch (e) {
    lines.push('FAILED: ' + getErrorMessage_(e));
    return lines;
  }

  var rows = got.rows || [];
  lines.push('Read OK from the ' + got.source + '.');
  lines.push('Rows: ' + rows.length + '   Widest row: ' +
    rows.reduce(function (m, r) { return Math.max(m, r ? r.length : 0); }, 0) + ' columns');
  lines.push('');

  // Report the mirror parse explicitly. The generic cell scan below would call a
  // mirror "fine" even if the year filter matched nothing and it yielded zero
  // classes — it only looks for date-shaped and code-shaped cells, which the OTHER
  // year's rows also have. This says what the fetch would actually store.
  var mirrorIssues = [];
  var probe = parseMirrorTimetable_(rows, mirrorIssues);
  if (probe) {
    lines.push('Format: MIRROR (one row per class, columns already split)');
    lines.push('  Classes for this year : ' + probe.classes.length);
    lines.push('  Guest lectures        : ' + probe.guest.length + '   Feedback sessions: ' + probe.feedback.length);
    lines.push('  Ignored               : ' + probe.otherYear + ' other-year row(s), ' +
      probe.skippedQuiz + ' QuizSlot placeholder(s)' +
      (probe.duplicateSittings ? ', ' + probe.duplicateSittings + ' duplicate sitting(s)' : ''));

    // Per course+group counts, so "why is the total 621 and not 620?" is one
    // glance rather than a spreadsheet audit. Every Term 5 course runs 20
    // sessions, so anything else is either a real change by the office or a
    // stray row — and this says which course it is either way.
    var keyNames = Object.keys(probe.perKey || {}).sort();
    if (keyNames.length) {
      var tally = {};
      for (var kn = 0; kn < keyNames.length; kn++) {
        var v = probe.perKey[keyNames[kn]];
        tally[v] = (tally[v] || 0) + 1;
      }
      var modal = null, modalHits = -1;
      var tKeys = Object.keys(tally);
      for (var tk = 0; tk < tKeys.length; tk++) {
        if (tally[tKeys[tk]] > modalHits) { modalHits = tally[tKeys[tk]]; modal = Number(tKeys[tk]); }
      }
      var odd = [];
      for (var on = 0; on < keyNames.length; on++) {
        if (probe.perKey[keyNames[on]] !== modal) {
          odd.push(keyNames[on] + '=' + probe.perKey[keyNames[on]]);
        }
      }
      lines.push('  Course groups         : ' + keyNames.length + ', ' + modal +
        ' session(s) each' + (odd.length ? '' : ' — all equal'));
      if (odd.length) {
        lines.push('  \u26a0 Not ' + modal + ' sessions: ' + odd.join(', ') +
          '  \u2190 this is where a total that is not ' + (keyNames.length * modal) + ' comes from');
      }
    }
    if (probe.duplicateSittings) {
      lines.push('  \u26a0 ' + probe.duplicateSittings + ' row(s) repeat a sitting another row ' +
        'already covers. Only the first was kept — without that, each repeat would ' +
        'have become a second calendar event stacked on the same slot.');
    }
    if (probe.classes.length) {
      var first = probe.classes[0], last = probe.classes[probe.classes.length - 1];
      lines.push('  Span                  : ' + first[0].toDateString() + ' → ' + last[0].toDateString());
      var outside = 0;
      for (var w = 0; w < probe.classes.length; w++) {
        var d0 = probe.classes[w][0];
        if (!isWithinSyncWindow_(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()))) outside++;
      }
      // Anything outside the window would be created and then never found again by
      // the clear phase — a duplicate that accumulates on every re-sync.
      lines.push(outside
        ? '  ⚠ ' + outside + ' class(es) fall OUTSIDE this term\'s sync window — check TERM_CONFIG_.'
        : '  All classes fall inside this term\'s sync window.');
    } else {
      lines.push('  ⚠ No classes for this year. Check the Year/Batch column against THIS_TERM.yearTags in config.gs.');
    }
    if (mirrorIssues.length) {
      lines.push('  Parse notes:');
      mirrorIssues.slice(0, 5).forEach(function (m) { lines.push('    ' + m); });
    }
    lines.push('');
  } else {
    lines.push('Format: legacy (single packed column, tokenized apart)');
    lines.push('');
  }

  // Parse it as the fetch would, then throw the result away. What matters is whether
  // the parser recognises dates and course codes — a layout that reads fine as a grid
  // but yields zero classes is the failure this exists to catch.
  var dates = 0, codes = {}, sample = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];
    var first = row[0] ? row[0].toString().trim() : '';
    if (first && parseSheetDate_(first)) dates++;
    for (var c = 0; c < row.length; c++) {
      var cellText = row[c] ? row[c].toString().trim() : '';
      if (!cellText) continue;
      var token = cellText.split(/[\s(\/]/)[0].toUpperCase();
      if (COURSE_INFO_[token]) {
        codes[token] = (codes[token] || 0) + 1;
        if (sample.length < 4) sample.push(cellText.substring(0, 60));
      }
    }
  }
  var found = Object.keys(codes);
  lines.push('Readable date cells: ' + dates);
  lines.push('Course codes seen: ' + found.length + ' of ' + Object.keys(COURSE_INFO_).length +
    (found.length ? '  (' + found.slice(0, 12).join(', ') + (found.length > 12 ? '\u2026' : '') + ')' : ''));
  if (sample.length) {
    lines.push('');
    lines.push('Sample entries:');
    sample.forEach(function (x) { lines.push('  ' + x); });
  }
  lines.push('');
  if (!dates) {
    lines.push('\u26a0 No date cells recognised. This probably is not the institute');
    lines.push('  timetable, or its dates are formatted unexpectedly.');
  } else if (!found.length) {
    lines.push('\u26a0 Dates parse but no course code from COURSE_INFO_ appears. Either this');
    lines.push('  is a different term\'s timetable, or COURSE_INFO_ lacks the codes this');
    lines.push('  sheet uses \u2014 the parser matches against those codes, so it would');
    lines.push('  build an empty calendar for everyone.');
  } else {
    lines.push('\u2713 Looks like a usable timetable. Run the fetch to load it for real.');
  }
  return lines;
}

// Menu version: shows the report in a dialog on the spreadsheet.
function testTimetableSource() {
  assertAdmin_();
  SpreadsheetApp.getUi().alert('Timetable source test',
    timetableSourceReport_().join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// Editor version: run this straight from the Apps Script editor's Run button and read
// the result in the execution log. Needs no menu and no open spreadsheet, so it works
// during setup before onOpen has ever fired.
function testTimetableSourceLog() {
  assertAdmin_();   // see enrolmentPreflightLog: Run-menu functions are callable by students too
  var report = timetableSourceReport_().join('\n');
  console.log('\n===== TIMETABLE SOURCE TEST =====\n' + report + '\n=================================');
  return report;
}

// ── ✓ Check settings ──────────────────────────────────────────────────────────
// One plain-English report on config.gs, for whoever maintains the tool — most of
// whom will not be programmers. It says what is wrong and which line of config.gs
// to fix, and it reads the institute's sheets the way the fetch will, so a tag
// that matches the wrong year or a course code missing from COURSES shows up here
// rather than as a silently empty calendar.
//
// Read-only: touches no calendar, no sheet and no student.
//
// `opts.offline` (tests/check_config.js, run on a computer): the published links
// can't be fetched from there, so their checks are skipped and said to be;
// `opts.skipTimetable` likewise when no copy of the timetable was supplied.
function settingsReport_(opts) {
  opts = opts || {};
  var ok = [], warn = [], bad = [];
  var roster = getRosterIndex_();
  var rosterRolls = Object.keys(roster);
  var codes = Object.keys(COURSE_INFO_);
  var inRoster = function (roll) { return !!roster[String(roll || "").toUpperCase()]; };
  var isIso = function (s) { return !!settingDate_(s, 0); };

  SETTINGS_PROBLEMS_.forEach(function (p) { bad.push(p); });

  // 1 · This term
  if (!TERM_NUMBER_ && !settingText_(THIS_TERM.name)) bad.push('THIS_TERM.number is missing — set it to the term (1–6).');
  if (!settingText_(THIS_TERM.batch)) warn.push('THIS_TERM.batch is empty — the page header will show only the term.');
  var days = Math.round((TERM_CONFIG_.syncWindowEnd - TERM_CONFIG_.syncWindowStart) / 86400000);
  ok.push('Term: ' + TERM_CONFIG_.label + (TERM_CONFIG_.batch ? ' · ' + TERM_CONFIG_.batch : '') +
    ' — calendar "' + TERM_CONFIG_.calendarName + '", events kept from ' +
    TERM_CONFIG_.syncWindowStart.toDateString() + ' for ' + days + ' days.');
  if (TERM_PRESET_) {
    ok.push('From THIS_TERM.number = ' + TERM_NUMBER_ + ': ' + (TERM_NUMBER_ <= 3 ? 'first' : 'second') +
      ' year; quiz/exam rows tagged ' + TERM_CONFIG_.quizTermTags.join(' / ') +
      (TERM_CONFIG_.excludeTermTags.length ? ' (but not ' + TERM_CONFIG_.excludeTermTags.join(' / ') + ')' : '') +
      '; timetable rows tagged ' + GUEST_YEAR_TAGS_.join(' / ') + '; academic calendar term "' + TERM_CONFIG_.academicTerm + '".');
  }
  if (days > 200) warn.push('THIS_TERM.firstDay → lastDay spans ' + days + ' days. A term is usually 80–140; check the years.');
  if (["section", "electives", "pick"].indexOf(COURSE_SELECTION_) === -1) {
    bad.push('THIS_TERM.courseSelection must be "section", "electives" or "pick" (it is "' + COURSE_SELECTION_ + '"). Using "pick".');
  } else if (COURSE_SELECTION_ === "electives" && enrolmentMode_() !== "electives") {
    warn.push('THIS_TERM.courseSelection is "electives" but DATA_SOURCES.electivesSummary is blank, so students will pick by hand.');
  } else {
    ok.push('Course selection: ' + ({ section: 'each student gets their section\'s courses automatically',
      electives: 'read from the institute\'s elective allotment sheet', pick: 'students pick their own' })[enrolmentMode_()] + '.');
  }
  if (!GUEST_YEAR_TAGS_.length) bad.push('THIS_TERM.yearTags is empty — no timetable row would count as your batch\'s.');
  if (!TERM_CONFIG_.quizTermTags.length) warn.push('THIS_TERM.termTags is empty — no quiz or exam row will match this term.');
  var ew = TERM_CONFIG_.academic.examWindows || [];
  ew.forEach(function (w, i) {
    if (!w || !isIso(w.start) || !isIso(w.end)) bad.push('THIS_TERM.examWindows #' + (i + 1) + ' needs start and end dates written "YYYY-MM-DD".');
  });
  var tb = TERM_CONFIG_.academic.termBreak;
  if (tb && (!isIso(tb.start) || !isIso(tb.end))) bad.push('THIS_TERM.termBreak needs start and end dates written "YYYY-MM-DD".');
  if (TERM_CONFIG_.academic.nextTermStart && !isIso(TERM_CONFIG_.academic.nextTermStart)) {
    bad.push('THIS_TERM.nextTermStart must be a date written "YYYY-MM-DD".');
  }

  // 2 · Last term
  if (PREVIOUS_TERM_.calendarName) {
    ok.push('Moving students over from "' + PREVIOUS_TERM_.calendarName + '" (' + PREVIOUS_TERM_.label + ')' +
      (PREVIOUS_TERM_.auto ? ' — worked out from the term number. On a first install nobody has that calendar, ' +
        'which is fine.' : '.'));
  } else if (TERM_NUMBER_ > 1) {
    warn.push('THIS_TERM has its own calendarName and PREVIOUS_TERM is blank, so last term\'s calendar won\'t ' +
      'be crossed out when students move to this term. Fine on a first install; otherwise fill in PREVIOUS_TERM.');
  } else {
    ok.push('No previous term — right for Term 1.');
  }

  // 3 / 4 · Institute and maintainer
  if (!EMAIL_DOMAIN_) bad.push('INSTITUTE.emailDomain is empty — nobody would be allowed in.');
  var me = settingText_(CFG_.maintainer.name);
  if (!me || me === "YOUR NAME") warn.push('MAINTAINER.name still says "YOUR NAME".');
  if (!CREATOR_ROLL_ || /X{2,}/.test(CREATOR_ROLL_)) bad.push('MAINTAINER.roll is not set to your roll number.');
  else if (!inRoster(CREATOR_ROLL_)) bad.push('MAINTAINER.roll ' + CREATOR_ROLL_ + ' is not in STUDENTS. Add yourself there too.');
  if (settingText_(CFG_.maintainer.linkedin) && !safeLink_(CFG_.maintainer.linkedin)) {
    warn.push('MAINTAINER.linkedin should be a full https:// link. It is hidden until then.');
  }

  // 6 · Courses
  if (codes.some(function (c) { return /^EXMPL/.test(c); })) bad.push('COURSES still holds the EXMPL example courses — replace them with this term\'s.');
  ok.push('Courses: ' + codes.length + ' (' + codes.slice(0, 15).join(', ') + (codes.length > 15 ? '…' : '') + ').');
  if (enrolmentMode_() === "section" && codes.some(function (c) { return COURSE_INFO_[c].required; })) {
    warn.push('Some COURSES carry required: true. In "section" mode that is unnecessary, and it blocks any student who doesn\'t take that course.');
  }

  // 7 · Students
  var sections = {};
  var noSection = [];
  rosterRolls.forEach(function (r) {
    var s = roster[r][1];
    if (s) sections[s] = (sections[s] || 0) + 1; else noSection.push(r);
  });
  if (!rosterRolls.length) bad.push('STUDENTS is empty — paste your batch roster into config.gs.');
  else ok.push('Students: ' + rosterRolls.length + ' — sections ' + Object.keys(sections).sort().map(function (s) {
    return s + ':' + sections[s]; }).join('  ') + '.');
  if (noSection.length && enrolmentMode_() === "section") {
    warn.push(noSection.length + ' student(s) have no section, so they get no courses automatically (they can ' +
      'still pick by hand): ' + noSection.slice(0, 10).join(', '));
  }

  // 8 – 13 · Optional lists
  Object.keys(SAC_ROLES_).forEach(function (r) { if (!inRoster(r)) warn.push('SAC_TEAM: ' + r + ' is not in STUDENTS.'); });
  var reps = configuredSubjectReps_();
  reps.forEach(function (rep) {
    if (!COURSE_INFO_[rep.code]) warn.push('SUBJECT_REPS: course ' + rep.code + ' is not in COURSES.');
    if (!inRoster(rep.roll)) warn.push('SUBJECT_REPS: ' + rep.roll + ' (' + rep.name + ') is not in STUDENTS.');
  });
  if (reps.length) ok.push('Subject reps: ' + reps.length + '.');
  Object.keys(siteSettings_().outlines).forEach(function (c) {
    if (!COURSE_INFO_[c]) warn.push('COURSE_OUTLINES: ' + c + ' is not in COURSES.');
  });
  Object.keys(COURSE_EVAL_).forEach(function (c) {
    if (!COURSE_INFO_[c]) warn.push('COURSE_EVALUATION: ' + c + ' is not in COURSES.');
    var sum = 0;
    (COURSE_EVAL_[c].components || []).forEach(function (k) { sum += Number(k.weight) || 0; });
    if (Math.abs(sum - 100) > 0.01) warn.push('COURSE_EVALUATION: ' + c + ' adds up to ' + sum + ', not 100.');
  });
  if (pilotModeOn_()) {
    warn.push('TEST MODE IS ON — TermSync runs only for ' + Object.keys(PILOT_ROLLS_).join(', ') +
      '. Empty TEST_ONLY_FOR to go live.');
  }
  Object.keys(COURSE_AUDIT_).forEach(function (r) {
    if (!inRoster(r)) warn.push('SIT_IN_COURSES: ' + r + ' is not in STUDENTS.');
    ((COURSE_AUDIT_[r] && COURSE_AUDIT_[r].classesOnly) || []).forEach(function (c) {
      if (!COURSE_INFO_[c]) warn.push('SIT_IN_COURSES: ' + r + ' → ' + c + ' is not in COURSES.');
    });
  });

  // 5 · Live sources, read the way the fetch reads them
  if (opts.skipTimetable) {
    ok.push('Timetable: not checked here — run ✓ Check settings in Apps Script, where the real sheet can be read.');
  } else {
    try {
      var got = getTimetableRows_(null);
      var grid = got.rows || [];
      var h = mirrorHeaderRow_(grid);
      if (h === -1) {
        warn.push('Timetable: read from the ' + got.source + ', but it has no header row with Date, Code, ' +
          'Year/Batch, Grp and Classroom. Run "Test timetable source" for details.');
      } else {
        var head = grid[h].map(function (x) { return String(x == null ? "" : x).toLowerCase().trim(); });
        var yc = head.indexOf("year/batch"), cc = head.indexOf("code"), gc = head.indexOf("grp");
        var years = {}, ours = {}, ourGroups = {};
        for (var i = h + 1; i < grid.length; i++) {
          var code = String(grid[i][cc] || "").trim();
          if (!code) continue;
          var y = String(grid[i][yc] || "").trim();
          years[y] = (years[y] || 0) + 1;
          if (isOurYearRow_(y) && !/quiz|phd class/i.test(code)) {
            ours[code] = (ours[code] || 0) + 1;
            var g = String(grid[i][gc] || "").trim().toUpperCase();
            if (g) ourGroups[g] = true;
          }
        }
        Object.keys(years).forEach(function (y) {
          ok.push('Timetable "Year/Batch" = "' + y + '": ' + years[y] + ' row(s) — ' +
            (isOurYearRow_(y) ? 'KEPT (your batch)' : 'ignored'));
        });
        var ourCodes = Object.keys(ours);
        if (!ourCodes.length) bad.push('Timetable: no row matches THIS_TERM.yearTags. Pick words from the "Year/Batch" values listed above.');
        var unknown = ourCodes.filter(function (c) { return !COURSE_INFO_[c]; });
        if (unknown.length) {
          bad.push('Timetable codes for your batch that are NOT in COURSES (they would show without a name, and ' +
            '"section" mode would skip them): ' + unknown.join(', '));
        }
        var unused = codes.filter(function (c) { return !ours[c]; });
        if (unused.length && ourCodes.length) {
          warn.push('COURSES not on the timetable yet (fine for courses without classes): ' + unused.join(', '));
        }
        if (ourCodes.length) ok.push('Timetable: ' + ourCodes.length + ' course code(s) for your batch, read from the ' + got.source + '.');
        if (enrolmentMode_() === "section") {
          var missingSec = Object.keys(sections).filter(function (s) { return !ourGroups[s]; });
          if (missingSec.length && Object.keys(ourGroups).length) {
            warn.push('Roster sections with no timetable group: ' + missingSec.join(', ') +
              ' (timetable groups: ' + Object.keys(ourGroups).sort().join(', ') + ').');
          }
        }
      }
    } catch (e) {
      bad.push('Timetable: ' + getErrorMessage_(e));
    }
  }

  if (opts.offline) {
    ok.push('Published links (quizzes, exams, academic calendar, electives): not checked here — ' +
      'run ✓ Check settings in Apps Script, where they can be read.');
  } else {
    [{ key: "quizSchedule", url: QUIZ_CSV_URL, what: "Quiz schedule" },
     { key: "midTermSchedule", url: EXAM_CSV_URL, what: "Mid-term schedule" },
     { key: "endTermSchedule", url: ENDTERM_CSV_URL, what: "End-term schedule" }].forEach(function (src) {
      if (src.url === PENDING_URL_) { ok.push(src.what + ': not set (feature off).'); return; }
      try {
        var resp = UrlFetchApp.fetch(src.url, { muteHttpExceptions: true });
        if (resp.getResponseCode() !== 200) {
          bad.push(src.what + ': the link answered HTTP ' + resp.getResponseCode() + '. Is that tab published to the web?');
          return;
        }
        var csv = Utilities.parseCsv(resp.getContentText() || "");
        var hr = -1;
        for (var r = 0; r < Math.min(csv.length, 10); r++) {
          if (findQuizCol_(csv[r], ["date"]) !== -1 && findQuizCol_(csv[r], ["course code", "code"]) !== -1) { hr = r; break; }
        }
        if (hr === -1) { bad.push(src.what + ': no header row with Date and Course Code — is this the right tab?'); return; }
        var tc = findQuizCol_(csv[hr], ["batch / term", "batch/term", "batch", "term"]);
        if (tc === -1) { ok.push(src.what + ': readable (no Batch / Term column — every row counts).'); return; }
        var cells = {};
        for (var q = hr + 1; q < csv.length; q++) {
          var cell = String(csv[q][tc] || "").trim();
          if (cell) cells[cell] = (cells[cell] || 0) + 1;
        }
        var kept = 0;
        Object.keys(cells).forEach(function (c) {
          var keep = isTermRow_(c);
          if (keep) kept += cells[c];
          ok.push(src.what + ' "' + c + '": ' + cells[c] + ' row(s) — ' + (keep ? 'KEPT (this term)' : 'ignored'));
        });
        if (Object.keys(cells).length && !kept) {
          warn.push(src.what + ': no row matches THIS_TERM.termTags yet. Fine if this term has none published; ' +
            'otherwise pick words from the values listed above.');
        }
      } catch (e2) {
        bad.push(src.what + ': ' + getErrorMessage_(e2));
      }
    });
  }

  if (!opts.offline && enrolmentMode_() === "electives") {
    try {
      var cat = getElectiveCatalogue_();
      if (cat.length) ok.push('Elective allotment: ' + cat.length + ' course(s) on the Summary tab.');
      else bad.push('Elective allotment: the Summary tab has no "abbreviation" header — is this the right tab?');
    } catch (e3) {
      bad.push('Elective allotment: ' + getErrorMessage_(e3));
    }
  }
  if (!opts.offline && ACADEMIC_CAL_CSV_URL !== PENDING_URL_) {
    var rowsAc = getAcademicCalRows_(true);
    if (!rowsAc) bad.push('Academic calendar: the link could not be read. Is that tab published to the web?');
    else {
      var want = TERM_CONFIG_.academicTerm.toUpperCase();
      var hits = rowsAc.filter(function (row) { return String(row[0] || "").trim().toUpperCase() === want; }).length;
      if (hits) ok.push('Academic calendar: ' + hits + ' row(s) for "' + TERM_CONFIG_.academicTerm + '".');
      else warn.push('Academic calendar: no row\'s "Term" column says "' + TERM_CONFIG_.academicTerm +
        '" — check THIS_TERM.academicCalendarTerm. Using the backup dates in config.gs.');
    }
  }

  var lines = [];
  if (bad.length) { lines.push('✖ FIX THESE (' + bad.length + ')'); bad.forEach(function (b) { lines.push('  • ' + b); }); lines.push(''); }
  if (warn.length) { lines.push('⚠ CHECK THESE (' + warn.length + ')'); warn.forEach(function (w) { lines.push('  • ' + w); }); lines.push(''); }
  lines.push('✓ LOOKS RIGHT'); ok.forEach(function (o) { lines.push('  • ' + o); });
  lines.push('');
  lines.push(bad.length ? 'Fix the ✖ lines in config.gs, press Save, and run ✓ Check settings again.'
    : (warn.length ? 'Nothing blocking. Read the ⚠ lines — each is either fine or a quick fix.'
                   : 'All good.'));
  return lines;
}

// Menu version.
function checkSettings() {
  assertAdmin_();
  SpreadsheetApp.getUi().alert('✓ Check settings', settingsReport_().join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// Editor version — select checkSettingsLog in the Apps Script toolbar, press Run,
// and read the result in the Execution log. Works before the spreadsheet menu has
// ever appeared, which is exactly when it is needed most.
function checkSettingsLog() {
  assertAdmin_();   // Run-menu functions are callable by students too
  var report = settingsReport_().join('\n');
  console.log('\n===== CHECK SETTINGS =====\n' + report + '\n==========================');
  return report;
}

// Makes the institute-fetch trigger exist and run on the current cadence, creating
// or re-creating it as needed. Called at the top of every fetch, so the schedule
// installs itself the first time anyone runs the fetch and heals if the trigger is
// ever deleted or left on an old interval — deployment no longer depends on
// remembering a menu click.
//
// Mirrors ensureSyncTrigger_'s create-then-prune order: the replacement is made
// BEFORE the old ones are removed, so a failure midway leaves the schedule running
// rather than switched off. Best-effort throughout — a trigger problem must never
// stop a fetch that is otherwise fine, and the caller has already done the work.
function ensureAdminFetchTrigger_() {
  try {
    // Triggers are PER ACCOUNT: getProjectTriggers() only sees the caller's own. So
    // when a co-admin editor (or the creator, if a different account owns the
    // sheet) ran a fetch, this saw "no trigger" and quietly planted a second 30-min
    // schedule under their account — one that "End term" run by the owner would
    // not remove. Only the spreadsheet owner's runs install or heal it now. When
    // the owner cannot be determined (e.g. a shared drive) the old behaviour holds.
    var ownerEmail = "";
    try {
      var owner = SpreadsheetApp.getActiveSpreadsheet().getOwner();
      ownerEmail = owner && owner.getEmail() ? owner.getEmail().toLowerCase() : "";
    } catch (ownerErr) { ownerEmail = ""; }
    var runnerEmail = "";
    try { runnerEmail = (Session.getEffectiveUser().getEmail() || "").toLowerCase(); } catch (runErr) { runnerEmail = ""; }
    if (ownerEmail && runnerEmail && ownerEmail !== runnerEmail) {
      console.log("Institute fetch trigger left alone: this run is " + runnerEmail +
        ", but the schedule belongs to the spreadsheet owner.");
      return;
    }
    var existing = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'fetchAndCleanAdminData';
    });
    var props = PropertiesService.getScriptProperties();
    var desired = String(ADMIN_FETCH_INTERVAL_MINUTES_);
    if (existing.length === 1 && props.getProperty('admin_fetch_interval') === desired) return;

    var keepId = ScriptApp.newTrigger('fetchAndCleanAdminData')
      .timeBased().everyMinutes(ADMIN_FETCH_INTERVAL_MINUTES_).create().getUniqueId();
    var all = ScriptApp.getProjectTriggers();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getHandlerFunction() === 'fetchAndCleanAdminData' &&
          all[i].getUniqueId() !== keepId) {
        ScriptApp.deleteTrigger(all[i]);
      }
    }
    props.setProperty('admin_fetch_interval', desired);
    console.log('Institute fetch trigger ensured at every ' + ADMIN_FETCH_INTERVAL_MINUTES_ + ' min.');
  } catch (e) {
    // Typically "too many triggers" or a permissions edge on a first manual run.
    console.warn('Could not ensure the institute fetch trigger: ' + getErrorMessage_(e));
  }
}

function installAdminFetchTrigger() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var existing = adminFetchTriggerCount_();
  var resp = ui.alert(
    'Install institute fetch trigger?',
    (existing
      ? 'There ' + (existing === 1 ? 'is 1 existing trigger' : 'are ' + existing + ' existing triggers') +
        ' for fetchAndCleanAdminData. They will be replaced with a single one.\n\n'
      : '') +
    'This creates a time-based trigger running fetchAndCleanAdminData every ' +
    ADMIN_FETCH_INTERVAL_MINUTES_ + ' minutes, owned by YOUR account (' +
    (Session.getActiveUser().getEmail() || 'this account') + ').\n\n' +
    'Run this from the account that owns the spreadsheet — the fetch writes the shared data sheets.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  removeAdminFetchTriggers_();
  ScriptApp.newTrigger('fetchAndCleanAdminData')
    .timeBased()
    .everyMinutes(ADMIN_FETCH_INTERVAL_MINUTES_)
    .create();
  PropertiesService.getScriptProperties()
    .setProperty('admin_fetch_interval', String(ADMIN_FETCH_INTERVAL_MINUTES_));
  ui.alert('Installed. The institute fetch now runs every ' + ADMIN_FETCH_INTERVAL_MINUTES_ +
    ' minutes.\n\nStudents pick changes up on their own next sync (every ' + SYNC_INTERVAL_MINUTES_ +
    ' minutes), so the end-to-end worst case is about ' +
    (ADMIN_FETCH_INTERVAL_MINUTES_ + SYNC_INTERVAL_MINUTES_) + ' minutes.');
}

function removeAdminFetchTrigger() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  var n = adminFetchTriggerCount_();
  if (!n) { ui.alert('No institute fetch trigger is installed on this account.'); return; }
  var resp = ui.alert('Remove institute fetch trigger?',
    'This stops the automatic institute fetch entirely. Student calendars keep whatever data was ' +
    'last fetched. Continue?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  var n2 = removeAdminFetchTriggers_();
  try { PropertiesService.getScriptProperties().deleteProperty('admin_fetch_interval'); } catch (e) { }
  ui.alert('Removed ' + n2 + ' trigger(s). The next fetch will re-create it — use "End term" ' +
    'if you mean to stop the fetch for good.');
}

// Reports what's actually scheduled, so "is it running?" doesn't need a trip to the
// Apps Script Triggers UI. Triggers are per-account, so this only ever sees the
// ones belonging to whoever opens the menu.
function describeTimetableSource_() {
  if (ADMIN_CSV_URL !== PENDING_URL_) return 'published CSV tab';
  if (TIMETABLE_SHEET_ID_) return 'shared spreadsheet (' + TIMETABLE_SHEET_ID_.substring(0, 12) + '…)';
  try {
    var manual = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANUAL_TIMETABLE_SHEET_NAME);
    if (manual && manual.getLastRow() > 0) {
      return MANUAL_TIMETABLE_SHEET_NAME + ' tab (' + manual.getLastRow() + ' rows, pasted by hand)';
    }
  } catch (e) { }
  return 'NONE — the fetch will refuse';
}

function showAdminFetchTriggerStatus() {
  assertAdmin_();
  var props = PropertiesService.getScriptProperties();
  var last = props.getProperty('last_fetch_at');
  var lastTxt = last
    ? Utilities.formatDate(new Date(Number(last)), Session.getScriptTimeZone(), "d MMM yyyy, HH:mm")
    : 'never';
  var n = adminFetchTriggerCount_();
  SpreadsheetApp.getUi().alert('Institute fetch',
    'Timetable source: ' + describeTimetableSource_() + '\n' +
    'Trigger on this account: ' + (n ? n + ' × every ' + ADMIN_FETCH_INTERVAL_MINUTES_ + ' min' : 'none') +
    '\nLast successful fetch: ' + lastTxt +
    '\nLast run had changes: ' + (props.getProperty('last_fetch_had_changes') || 'unknown') +
    '\nTerm ended: ' + (props.getProperty('term_ended_at') ? 'YES — fetch is blocked' : 'no'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function bytesToHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function hashString_(str) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str));
}

function getUsageHash_(email) {
  return hashString_(email + "tt_sync_salt_2026").substring(0, USER_HASH_LENGTH_);
}

// Email format is <RollNo>@<INSTITUTE.emailDomain> (e.g. mba26901@iimsirmaur.ac.in).
// Roster keys are expected to be uppercase; we also build a case-insensitive index
// once so a stray mixed-case key (e.g. "PhD26001") can never silently fail to match.
var STUDENT_ROSTER_UC_ = null;
function getRosterIndex_() {
  if (STUDENT_ROSTER_UC_) return STUDENT_ROSTER_UC_;
  STUDENT_ROSTER_UC_ = {};
  // Collision guard: two roster keys that fold to the same uppercase roll (an
  // accidental duplicate, or a case-variant like "PhD26001" vs "PHD26001") would
  // silently shadow each other here, mapping a real student to the wrong name or
  // section. Detect it and warn the admin (Stackdriver) — the build still
  // succeeds (last-write-wins, unchanged behaviour), so a typo never breaks the
  // tool, it just gets surfaced. Cheap: runs at most once per execution.
  var collisions = [];
  var keys = Object.keys(STUDENT_ROSTER_);
  for (var i = 0; i < keys.length; i++) {
    var uc = keys[i].toUpperCase();
    if (Object.prototype.hasOwnProperty.call(STUDENT_ROSTER_UC_, uc)) {
      collisions.push(uc);
    }
    STUDENT_ROSTER_UC_[uc] = STUDENT_ROSTER_[keys[i]];
  }
  if (collisions.length) {
    console.warn("STUDENT_ROSTER_ has duplicate roll key(s) (last entry wins): " +
      collisions.join(", "));
  }
  return STUDENT_ROSTER_UC_;
}
function lookupStudentByEmail_(email) {
  if (!email) return null;
  var roll = email.split('@')[0].toUpperCase();
  var entry = getRosterIndex_()[roll];
  if (!entry) return null;
  return { rollNo: roll, name: entry[0], section: entry[1] };
}

function getUsageSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USAGE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USAGE_SHEET_NAME);
    // Hide the log. With students downgraded to VIEW-only on the spreadsheet, a
    // viewer can't unhide a sheet, so this keeps the log out of their reach in the
    // UI (only the owner + SAC, who retain access, can see it). Hiding can fail if
    // it's the only visible sheet — that must not break logging, hence the catch.
    try { sheet.hideSheet(); } catch (hideErr) { }
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Name", "Roll No.", "Section", "Email", "User Hash", "Action"]);
  }
  return sheet;
}

function normalizeUsageSheet_(sheet) {
  var NCOLS = 7;
  sheet.getRange(1, 1, 1, NCOLS).setValues([["Timestamp", "Name", "Roll No.", "Section", "Email", "User Hash", "Action"]]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, NCOLS).setFontWeight("bold");

  var lastRow = sheet.getLastRow();
  var normalized = [];

  if (lastRow > 1) {
    var readCols = Math.max(sheet.getLastColumn(), NCOLS);
    var raw = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
    var changed = false;

    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var col3 = row[3] ? row[3].toString().trim() : "";
      var col6 = row[6] ? row[6].toString().trim() : "";

      // Old 4-column format: Timestamp|Email|UserHash|Action — detect by col[3] being an
      // action value and col[6] (new Action column) being empty.
      if (!col6 && (col3 === "enable" || col3 === "disable")) {
        var emailOld = row[1] ? row[1].toString().trim() : "";
        var hashOld  = row[2] ? row[2].toString().trim() : "";
        var student  = lookupStudentByEmail_(emailOld);
        normalized.push([
          row[0],
          student ? student.name    : "",
          student ? student.rollNo  : "",
          student ? student.section : "",
          emailOld,
          hashOld.length > USER_HASH_LENGTH_ ? hashOld.substring(0, USER_HASH_LENGTH_) : (hashOld || (emailOld ? getUsageHash_(emailOld) : "")),
          col3
        ]);
        changed = true;
      } else {
        // New 7-column format — just normalize the hash field.
        var newRow   = row.slice(0, NCOLS);
        var emailNew = newRow[4] ? newRow[4].toString().trim() : "";
        var hashNew  = newRow[5] ? newRow[5].toString().trim() : "";
        if (hashNew.length > USER_HASH_LENGTH_) {
          newRow[5] = hashNew.substring(0, USER_HASH_LENGTH_);
          changed = true;
        } else if (!hashNew && emailNew) {
          newRow[5] = getUsageHash_(emailNew);
          changed = true;
        }
        normalized.push(newRow);
      }
    }

    if (changed) {
      sheet.getRange(2, 1, lastRow - 1, readCols).clearContent();
      if (normalized.length > 0) {
        sheet.getRange(2, 1, normalized.length, NCOLS).setValues(normalized);
      }
    }

    if (normalized.length > 0) {
      sheet.getRange(2, 1, normalized.length, 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
    }
  }

  // Conditional formatting: green for "enable", red for "disable" in the Action column.
  // Cover the entire column (not just current data rows) so rows appended by
  // logUsage_ between admin visits stay coloured.
  var actionRange = sheet.getRange(2, NCOLS, sheet.getMaxRows() - 1, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("enable")
      .setBackground("#d4edda").setFontColor("#155724")
      .setRanges([actionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("disable")
      .setBackground("#f8d7da").setFontColor("#721c24")
      .setRanges([actionRange]).build()
  ]);

  sheet.autoResizeColumns(1, NCOLS);
  sheet.setColumnWidth(6, 120); // User Hash
  return normalized;
}

// Soft caps on buffered Script-Property events (usage + reports + telemetry).
// A property store holds at most 500 KB in total (9 KB per value): if the draining admin fetch is
// gone for long (term ended, stalled trigger), unbounded buffering would fill
// the store and make EVERY later setProperty in the project fail — including
// real state like master_data_revision. Past its cap, new events of that kind
// are dropped: logging is best-effort; core state writes must keep working.
// Each PREFIX is counted against its OWN cap (not one combined total) so a
// flood of one kind — e.g. spammed reports — can never starve the others; the
// caps sum to 460 events — at most ~250 KB even with every report at its 600-character
// limit — leaving headroom for the project's real state under the 500 KB store limit.
// The 30-minute admin flush drains all three, so
// these are burst headroom, not steady-state sizes.
var PROP_BUFFER_SOFT_CAP_ = 240;   // usage events
var PROP_BUFFER_REPORT_CAP_ = 140; // "report wrong entry" submissions
var PROP_BUFFER_PATH_CAP_ = 80;    // calendar-path telemetry

// Per-execution memo of buffered-key counts by prefix. getKeys() is a service
// round trip; paying it once per execution (then counting written keys locally)
// instead of once per logged event keeps logging cheap. Executions are short-
// lived and the caps are soft, so cross-execution drift is acceptable — the
// pre-memo snapshot was equally approximate.
var BUFFER_KEY_COUNTS_ = null;

// Writes one buffered event key unless that kind's buffer is already at `cap`
// (the prefix is derived from the key itself). Returns false when the event was
// dropped. If the key count can't be read, the write is attempted anyway — a
// broken guard must not silence healthy logging.
function bufferEventProperty_(key, value, cap) {
  var scriptProps = PropertiesService.getScriptProperties();
  var prefix = key.indexOf(USAGE_BUFFER_PREFIX_) === 0 ? USAGE_BUFFER_PREFIX_
    : key.indexOf(REPORT_BUFFER_PREFIX_) === 0 ? REPORT_BUFFER_PREFIX_
    : PATH_BUFFER_PREFIX_;
  try {
    if (BUFFER_KEY_COUNTS_ === null) {
      var keys = scriptProps.getKeys() || [];
      var counts = {};
      counts[USAGE_BUFFER_PREFIX_] = 0;
      counts[REPORT_BUFFER_PREFIX_] = 0;
      counts[PATH_BUFFER_PREFIX_] = 0;
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(USAGE_BUFFER_PREFIX_) === 0) counts[USAGE_BUFFER_PREFIX_]++;
        else if (keys[i].indexOf(REPORT_BUFFER_PREFIX_) === 0) counts[REPORT_BUFFER_PREFIX_]++;
        else if (keys[i].indexOf(PATH_BUFFER_PREFIX_) === 0) counts[PATH_BUFFER_PREFIX_]++;
      }
      BUFFER_KEY_COUNTS_ = counts;
    }
    if (BUFFER_KEY_COUNTS_[prefix] >= cap) {
      console.warn("Event buffer at capacity (" + BUFFER_KEY_COUNTS_[prefix] +
        " × " + prefix + ") — dropping " + key);
      return false;
    }
  } catch (countErr) { /* count unavailable — attempt the write anyway */ }
  scriptProps.setProperty(key, value);
  if (BUFFER_KEY_COUNTS_) BUFFER_KEY_COUNTS_[prefix]++;
  return true;
}

// Every logged action that means "this user has stopped auto-syncing". Both stop
// paths must clear the user from "currently active" — a student who kept their
// calendar is no less stopped than one who deleted it — while staying distinct in
// the SAC log. "handover_empty" is the automatic term handover finding no courses to
// carry over, after which the student's trigger is removed (handleTermHandover_).
// The legacy-row detection elsewhere deliberately still tests only
// "enable"/"disable": four-column rows predate these actions and can never carry them.
function isDisableAction_(action) {
  return action === "disable" || action === "disable_keep" || action === "handover_empty";
}

// Every logged action after which this user's sync is RUNNING. "handover" is the
// automatic term-to-term move (see handleTermHandover_): the student pressed
// nothing, but the tool carried on for them. It turns the state on without being
// counted as a "time sync was turned on" in the enable totals.
function isEnableAction_(action) {
  return action === "enable" || action === "handover";
}

// Records one usage event. Students are view-only on the spreadsheet, so we can't
// append to the Usage sheet here — instead buffer the event under a unique Script
// Property key (writable by any execution, no spreadsheet rights needed). The
// owner-run admin fetch flushes the buffer into the sheet (flushUsageBuffer_).
// Never throws — logging must never break the action it accompanies.
function logUsage_(action) {
  if (!FEATURES_.usageLog) return;   // config.gs → FEATURES.usageLog: record nothing
  try {
    var email = Session.getActiveUser().getEmail();
    var student = lookupStudentByEmail_(email);
    var evt = {
      ts: Date.now(),
      name: student ? student.name : "",
      roll: student ? student.rollNo : "",
      section: student ? student.section : "",
      email: email || "",
      hash: email ? getUsageHash_(email) : "",
      action: action
    };
    bufferEventProperty_(USAGE_BUFFER_PREFIX_ + Utilities.getUuid(), JSON.stringify(evt), PROP_BUFFER_SOFT_CAP_);
  } catch (e) {
    console.error("Usage log failed: " + getErrorMessage_(e));
  }
}

// Parses the un-flushed usage events still sitting in Script Properties (written
// by view-only students; not yet drained into the Usage sheet by the admin fetch).
// Returned in chronological order as { ts, name, roll, section, email, hash,
// action }. Read-only — never deletes — so the stats modal and SAC log can fold
// these in without disturbing the buffer. Never throws.
function getBufferedUsageEvents_() {
  var out = [];
  try {
    var all = PropertiesService.getScriptProperties().getProperties();
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(USAGE_BUFFER_PREFIX_) !== 0) continue;
      try {
        var evt = JSON.parse(all[keys[i]]);
        if (evt && evt.action) out.push(evt);
      } catch (parseErr) { /* skip an unparseable buffered value */ }
    }
  } catch (e) {
    console.warn("Reading usage buffer failed: " + getErrorMessage_(e));
  }
  out.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
  return out;
}

// Drains the Script-Property usage buffer into the Usage sheet. Owner-only: only
// ever called from the admin fetch, which runs as the spreadsheet owner (the one
// account with edit rights). Snapshots the current buffer keys, appends those rows,
// then deletes exactly the keys it processed — so an event a student writes
// concurrently keeps its key and flushes on the next run (no loss). Appends before
// deleting, so the worst case is a rare duplicate audit row rather than dropped
// data. Never throws — a flush failure must not break the timetable fetch.
function flushUsageBuffer_() {
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var all = scriptProps.getProperties();
    var allKeys = Object.keys(all);
    var keys = [];
    var events = [];
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].indexOf(USAGE_BUFFER_PREFIX_) !== 0) continue;
      keys.push(allKeys[i]); // delete even an unparseable value so it can't wedge the buffer
      var evt = null;
      try { evt = JSON.parse(all[allKeys[i]]); } catch (parseErr) { evt = null; }
      if (evt && evt.action) events.push(evt);
    }
    if (keys.length === 0) return;

    if (events.length > 0) {
      events.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      var sheet = getUsageSheet_();
      var matrix = events.map(function (e) {
        return [
          e.ts ? new Date(e.ts) : new Date(),
          e.name || "",
          e.roll || "",
          e.section || "",
          e.email || "",
          e.hash || "",
          e.action || ""
        ];
      });
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, matrix.length, 7).setValues(matrix);
      sheet.getRange(startRow, 1, matrix.length, 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
    }

    for (var d = 0; d < keys.length; d++) scriptProps.deleteProperty(keys[d]);
  } catch (e) {
    console.warn("Usage buffer flush failed: " + getErrorMessage_(e));
  }
}

// ── "Report wrong entry" ──────────────────────────────────────────────────────
// Called by a student from the in-app form. Buffers the report under a unique
// Script Property key (students are VIEW-only and can't write the sheet); the
// owner-run admin fetch later drains it into the Reports sheet (flushReportBuffer_).
// Returns { ok: true } on success. Validation is lenient — the goal is to capture
// the signal, not reject borderline input — but a course or a description is
// required so empty submissions don't accrue.
function submitReport(report) {
  if (!FEATURES_.reportWrongEntry) {
    return { ok: false, reason: "off", message: "Reports are switched off for this batch — please tell the SAC directly." };
  }
  try {
    report = report || {};
    var course = (report.course == null ? "" : String(report.course)).trim().slice(0, 80);
    var classDate = (report.classDate == null ? "" : String(report.classDate)).trim().slice(0, 40);
    var issueType = (report.issueType == null ? "" : String(report.issueType)).trim().slice(0, 60);
    var details = (report.details == null ? "" : String(report.details)).trim().slice(0, REPORT_MAX_DETAILS_);

    if (!course && !details) {
      return { ok: false, reason: "empty", message: "Please pick the course or describe what's wrong." };
    }

    var email = Session.getActiveUser().getEmail() || "";
    var student = lookupStudentByEmail_(email);

    // Flood guard: cap how many of THIS user's reports can sit in the buffer at
    // once (drained every 30 minutes by the admin fetch). Best-effort — if the buffer can't
    // be read, the report is accepted rather than risk losing a genuine one.
    try {
      var allProps = PropertiesService.getScriptProperties().getProperties();
      var propKeys = Object.keys(allProps);
      var pendingMine = 0;
      for (var pk = 0; pk < propKeys.length; pk++) {
        if (propKeys[pk].indexOf(REPORT_BUFFER_PREFIX_) !== 0) continue;
        try {
          var pendingEntry = JSON.parse(allProps[propKeys[pk]]);
          if (pendingEntry && pendingEntry.email === email) pendingMine++;
        } catch (pendingParseErr) { /* unparseable value — not this user's */ }
      }
      if (pendingMine >= REPORT_MAX_PENDING_PER_USER_) {
        return {
          ok: false, reason: "too_many",
          message: "You've already sent several reports — the SAC team has them. Please wait for those to be reviewed before sending more."
        };
      }
    } catch (floodErr) { /* guard unavailable — accept the report */ }

    var entry = {
      ts: Date.now(),
      name: student ? student.name : "",
      roll: student ? student.rollNo : "",
      section: student ? student.section : "",
      email: email,
      course: course,
      classDate: classDate,
      issueType: issueType,
      details: details
    };
    bufferEventProperty_(REPORT_BUFFER_PREFIX_ + Utilities.getUuid(), JSON.stringify(entry), PROP_BUFFER_REPORT_CAP_);
    logUsage_("report");
    return { ok: true, message: "Thanks — your report was sent to the SAC team." };
  } catch (e) {
    console.error("submitReport failed: " + getErrorMessage_(e));
    return { ok: false, reason: "error", message: "Couldn't send the report just now. Please try again." };
  }
}

function getReportsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REPORTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REPORTS_SHEET_NAME);
    // Keep it out of view-only students' reach, same as the Usage/ChangeLog sheets.
    try { sheet.hideSheet(); } catch (hideErr) { }
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Logged At", "Roll No.", "Name", "Section", "Email", "Course", "Class Date", "Issue", "Details"]);
  }
  return sheet;
}

// Drains the Script-Property report buffer into the Reports sheet. Owner-only:
// called from the admin fetch (which runs as the spreadsheet owner). Mirrors
// flushUsageBuffer_ exactly — snapshot keys, append rows, then delete only the
// keys processed, so a concurrently-written report keeps its key for the next
// run. Appends before deleting, so the worst case is a rare duplicate row rather
// than a lost report. Never throws.
function flushReportBuffer_() {
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var all = scriptProps.getProperties();
    var allKeys = Object.keys(all);
    var keys = [];
    var entries = [];
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].indexOf(REPORT_BUFFER_PREFIX_) !== 0) continue;
      keys.push(allKeys[i]); // delete even an unparseable value so it can't wedge the buffer
      var e = null;
      try { e = JSON.parse(all[allKeys[i]]); } catch (parseErr) { e = null; }
      if (e) entries.push(e);
    }
    if (keys.length === 0) return;

    if (entries.length > 0) {
      entries.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      var sheet = getReportsSheet_();
      var matrix = entries.map(function (e) {
        return [
          e.ts ? new Date(e.ts) : new Date(),
          e.roll || "",
          e.name || "",
          e.section || "",
          e.email || "",
          e.course || "",
          e.classDate || "",
          e.issueType || "",
          e.details || ""
        ];
      });
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, matrix.length, 9).setValues(matrix);
      sheet.getRange(startRow, 1, matrix.length, 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
    }

    for (var d = 0; d < keys.length; d++) scriptProps.deleteProperty(keys[d]);
  } catch (e) {
    console.warn("Report buffer flush failed: " + getErrorMessage_(e));
  }
}

// ── Calendar-path telemetry ───────────────────────────────────────────────────
// Begins a telemetry window for the current sync run. Called once at the top of
// backgroundSyncLocked_; the helpers below flag it as they pick a write path.
function beginPathTelemetry_() {
  SYNC_PATH_TELEMETRY_ = {
    op: PROGRESS_OP_,
    apiUnavailable: false,
    usedFastCreate: false, usedSlowCreate: false, createFallback: false,
    usedFastDelete: false, usedSlowDelete: false, deleteFallback: false
  };
}

// Flag setter used by the sync helpers. No-op when no run is in flight (e.g. the
// first-time-enable wipe runs before beginPathTelemetry_), so only genuine sync
// activity is ever recorded. Never throws.
function notePath_(field) {
  try {
    if (SYNC_PATH_TELEMETRY_ && field in SYNC_PATH_TELEMETRY_) SYNC_PATH_TELEMETRY_[field] = true;
  } catch (e) { /* telemetry must never affect a sync */ }
}

// Buffers one compact telemetry event for the just-completed sync. Mirrors
// logUsage_: a unique Script Property key (lock-free, writable by view-only
// students), drained by the admin fetch. Never throws. `counts` = { created,
// removed } so the aggregate can relate fallback frequency to event volume.
function logSyncPath_(counts) {
  try {
    var t = SYNC_PATH_TELEMETRY_;
    if (!t) return;
    var evt = {
      ts: Date.now(),
      op: t.op || "sync",
      batch: CALENDAR_API_BATCH_SIZE_,
      apiDown: t.apiUnavailable ? 1 : 0,
      cFast: t.usedFastCreate ? 1 : 0,
      cSlow: t.usedSlowCreate ? 1 : 0,
      cFall: t.createFallback ? 1 : 0,
      dFast: t.usedFastDelete ? 1 : 0,
      dSlow: t.usedSlowDelete ? 1 : 0,
      dFall: t.deleteFallback ? 1 : 0,
      created: (counts && counts.created) || 0,
      removed: (counts && counts.removed) || 0
    };
    bufferEventProperty_(PATH_BUFFER_PREFIX_ + Utilities.getUuid(), JSON.stringify(evt), PROP_BUFFER_PATH_CAP_);
  } catch (e) {
    console.warn("Path telemetry buffer failed: " + getErrorMessage_(e));
  }
}

// Drains the path-telemetry buffer into the single aggregate property
// PATH_STATS_PROP_. Owner-only: called from the admin fetch, which holds the
// script lock, so the read-modify-write of the aggregate is single-threaded and
// race-free. Snapshots keys, folds them in, then deletes exactly those keys (a
// concurrently-written event keeps its key for the next run). Never throws.
function flushPathTelemetry_() {
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var all = scriptProps.getProperties();
    var allKeys = Object.keys(all);
    var keys = [];
    var events = [];
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].indexOf(PATH_BUFFER_PREFIX_) !== 0) continue;
      keys.push(allKeys[i]); // delete even an unparseable value so it can't wedge the buffer
      var evt = null;
      try { evt = JSON.parse(all[allKeys[i]]); } catch (parseErr) { evt = null; }
      if (evt) events.push(evt);
    }
    if (keys.length === 0) return;

    var stats = {};
    try { stats = JSON.parse(scriptProps.getProperty(PATH_STATS_PROP_) || "{}") || {}; } catch (e) { stats = {}; }
    var counters = ["syncs", "apiDown", "cFast", "cSlow", "cFall", "dFast", "dSlow", "dFall", "created", "removed"];
    for (var c = 0; c < counters.length; c++) {
      if (typeof stats[counters[c]] !== "number") stats[counters[c]] = 0;
    }
    for (var e2 = 0; e2 < events.length; e2++) {
      var ev = events[e2];
      stats.syncs++;
      stats.apiDown += ev.apiDown || 0;
      stats.cFast += ev.cFast || 0;
      stats.cSlow += ev.cSlow || 0;
      stats.cFall += ev.cFall || 0;
      stats.dFast += ev.dFast || 0;
      stats.dSlow += ev.dSlow || 0;
      stats.dFall += ev.dFall || 0;
      stats.created += ev.created || 0;
      stats.removed += ev.removed || 0;
    }
    stats.batch = CALENDAR_API_BATCH_SIZE_;
    stats.updatedAt = Date.now();
    scriptProps.setProperty(PATH_STATS_PROP_, JSON.stringify(stats));
    for (var d = 0; d < keys.length; d++) scriptProps.deleteProperty(keys[d]);
    console.log("[TT_PATH] folded " + events.length + " sync(s): " + JSON.stringify(stats));
  } catch (e) {
    console.warn("Path telemetry flush failed: " + getErrorMessage_(e));
  }
}

// Read-only stats over the Usage sheet. Handles both the current 7-column format
// and the legacy 4-column format (Timestamp|Email|UserHash|Action) in place,
// WITHOUT rewriting the sheet: this is callable by every student via the stats
// modal, and the old normalizeUsageSheet_ call here rewrote all rows + formatting
// on every view, racing concurrent logUsage_ appends from other users. Sheet
// normalization now only happens from the admin menu (openUsageTab).
function showUsageStats() {
  var stats = { currentlyActive: 0, totalUsers: 0, totalActions: 0, totalEnables: 0 };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USAGE_SHEET_NAME);
  // No early return on an empty sheet: events still buffered in Script Properties
  // (below) must count even before the first flush has created any rows — a fresh
  // deployment used to show 0 users until the first 30-minute fetch ran.
  var rows = (sheet && sheet.getLastRow() >= 2)
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 7)).getValues()
    : [];
  var currentlyActive = {};
  var allUsers = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var col3 = row[3] ? row[3].toString().trim() : "";
    var col6 = row[6] ? row[6].toString().trim() : "";
    // Legacy 4-column rows have the action in col 3 and nothing in the new Action column.
    var isLegacy = !col6 && (col3 === "enable" || col3 === "disable");

    var email = (isLegacy ? row[1] : row[4]);
    email = email ? email.toString().trim() : "";
    var userHash = (isLegacy ? row[2] : row[5]);
    userHash = userHash ? userHash.toString().trim() : "";
    // Legacy rows stored the full SHA hex; truncate so the same user isn't counted
    // twice across formats (normalizeUsageSheet_ does the same when rewriting).
    if (userHash.length > USER_HASH_LENGTH_) userHash = userHash.substring(0, USER_HASH_LENGTH_);
    var action = isLegacy ? col3 : col6;

    // Logged but never counted (creator's test/debug runs).
    var roll = (isLegacy ? "" : (row[2] ? row[2].toString().trim() : "")).toUpperCase();
    if (!roll && email) roll = email.split("@")[0].toUpperCase();
    if (STATS_EXCLUDE_ROLLS_[roll]) continue;

    var userKey = userHash || email;
    if (!userKey || !action) continue;

    allUsers[userKey] = true;
    stats.totalActions++;
    if (isEnableAction_(action)) currentlyActive[userKey] = true;
    if (action === "enable") stats.totalEnables++;
    if (isDisableAction_(action)) delete currentlyActive[userKey];
  }

  // Fold in events still buffered in Script Properties (written by view-only
  // students; not yet flushed to the sheet by the admin fetch). An event lives in
  // exactly one place — buffer or sheet — so this never double-counts, and the
  // buffer is chronological + always newer than the sheet, so the toggle order is
  // correct. Without this the "currently active" count would lag the 30-minute flush.
  var buffered = getBufferedUsageEvents_();
  for (var b = 0; b < buffered.length; b++) {
    var be = buffered[b];
    var bRoll = (be.roll || (be.email ? be.email.split("@")[0] : "")).toUpperCase();
    if (STATS_EXCLUDE_ROLLS_[bRoll]) continue;
    var bKey = be.hash || be.email;
    if (!bKey || !be.action) continue;
    allUsers[bKey] = true;
    stats.totalActions++;
    if (isEnableAction_(be.action)) currentlyActive[bKey] = true;
    if (be.action === "enable") stats.totalEnables++;
    if (isDisableAction_(be.action)) delete currentlyActive[bKey];
  }

  stats.currentlyActive = Object.keys(currentlyActive).length;
  stats.totalUsers = Object.keys(allUsers).length;
  return stats;
}

// ---------------------------------------------------------
// PUBLIC ENDPOINTS (UI)
// ---------------------------------------------------------

function getUsageStats() {
  if (!FEATURES_.usageStats) return { off: true, totalUsers: 0, activeUsers: 0, totalEnables: 0 };
  // Cached briefly: the stats modal is open to every student, and the numbers
  // don't need to be fresher than a minute.
  var cache = CacheService.getScriptCache();
  var cached = cache.get(USAGE_STATS_CACHE_KEY_);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var stats = showUsageStats();
  var out = { totalUsers: stats.totalUsers, activeUsers: stats.currentlyActive, totalEnables: stats.totalEnables };
  try {
    cache.put(USAGE_STATS_CACHE_KEY_, JSON.stringify(out), USAGE_STATS_CACHE_TTL_SECONDS_);
  } catch (e) { /* cache failure is harmless */ }
  return out;
}

// Per-row usage log for the admin panel's 🗒️ Usage tab. Restricted
// to USAGE_LOG_VIEWERS_ — unlike the aggregate getUsageStats (open to everyone),
// this exposes individual students' names/rolls/actions, so non-viewers get
// { ok:false, reason:"forbidden" } and the client shows an access-restricted
// notice instead of a raw error. Rows in STATS_EXCLUDE_ROLLS_ (the creator's
// test/debug runs) are omitted, matching the stats counters. Handles both the
// current 7-column and legacy 4-column sheet formats; newest entries first,
// capped so a full term's log stays a reasonable payload.
function getUsageLog() {
  var viewerEmail = Session.getActiveUser().getEmail() || "";
  if (!canViewLogs_(viewerEmail)) {
    return { ok: false, reason: "forbidden" };
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USAGE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, rows: [], total: 0 };

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 7)).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var col3 = row[3] ? row[3].toString().trim() : "";
    var col6 = row[6] ? row[6].toString().trim() : "";
    // Legacy 4-column rows (Timestamp|Email|UserHash|Action) carry the action in
    // col 3 and nothing in the new Action column — same detection as showUsageStats.
    var isLegacy = !col6 && (col3 === "enable" || col3 === "disable");
    var action = isLegacy ? col3 : col6;
    if (!action) continue;

    var ts = row[0];
    var whenMs = (ts instanceof Date) ? ts.getTime() : (ts ? new Date(ts).getTime() : NaN);

    var rowEmail = (isLegacy ? row[1] : row[4]);
    rowEmail = rowEmail ? rowEmail.toString().trim() : "";
    var roll = isLegacy ? "" : (row[2] ? row[2].toString().trim() : "");
    var name = isLegacy ? "" : (row[1] ? row[1].toString().trim() : "");
    // Legacy rows (and any row missing name/roll) are backfilled from the email.
    if ((!roll || !name) && rowEmail) {
      var student = lookupStudentByEmail_(rowEmail);
      if (student) { roll = roll || student.rollNo; name = name || student.name; }
    }
    roll = (roll || (rowEmail ? rowEmail.split("@")[0].toUpperCase() : "")).toUpperCase();
    if (STATS_EXCLUDE_ROLLS_[roll]) continue; // creator's own test/debug runs

    rows.push({ at: isNaN(whenMs) ? null : whenMs, name: name || "", roll: roll, action: action });
  }
  var usageBaselineAt = termBaselineAt_(PropertiesService.getScriptProperties());

  // Include events still buffered in Script Properties (the admin fetch hasn't
  // flushed them to the sheet yet), so the SAC log is current to the last action
  // rather than lagging up to an hour behind the 30-minute flush.
  var buffered = getBufferedUsageEvents_();
  for (var b = 0; b < buffered.length; b++) {
    var be = buffered[b];
    if (!be.action) continue;
    var bRoll = (be.roll || (be.email ? be.email.split("@")[0] : "")).toUpperCase();
    if (STATS_EXCLUDE_ROLLS_[bRoll]) continue;
    rows.push({ at: be.ts || null, name: be.name || "", roll: bRoll, action: be.action });
  }

  for (var t = 0; t < rows.length; t++) {
    // Same cumulative-sheet problem as the change log: Term 4's enables sit in the
    // same list as Term 5's, and "247 students have used this" means nothing if it
    // counts both terms. See TERM_BASELINE_AT_PROP_.
    rows[t].prior = !!(usageBaselineAt && rows[t].at && rows[t].at < usageBaselineAt);
  }
  rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  var priorTotal = 0;
  for (var pu = 0; pu < rows.length; pu++) if (rows[pu].prior) priorTotal++;
  var total = rows.length - priorTotal;
  var MAX = 300;
  if (rows.length > MAX) rows = rows.slice(0, MAX);
  return { ok: true, rows: rows, total: total, priorTotal: priorTotal,
           baselineAt: usageBaselineAt, termLabel: TERM_CONFIG_.label,
           priorTermLabel: PREVIOUS_TERM_.label };
}

// ---------------------------------------------------------
// CHANGE LOG (timetable/quiz edit audit trail)
// ---------------------------------------------------------
//
// The institute edits its published timetable constantly (a room moves, a faculty
// swaps, a class shifts an hour or a day, a session is added or dropped). The admin
// fetch already overwrites MasterData/QuizData with each new version — so the sheet
// it is about to overwrite IS the previous state. Diffing old-vs-new there yields a
// human-readable changelog with no extra snapshot to keep in sync.
//
// Identity for matching a class across versions is course + section + date. With
// that key:
//   • room / instructor / time edits on the same day  → one "Modified" row each
//   • a class added or dropped                          → "Added" / "Removed"
//   • a class moved to a different day (otherwise identical) → one "Modified · Date"
//     row (paired up in a second pass); a move that ALSO changes room/time/etc. is
//     logged honestly as a Removed + an Added rather than guessed at.

// ── Admin: the whole batch, one row per student ───────────────────────────────
// "Who is actually covered?" is the question the Usage log cannot answer. That log
// is a stream of events, so a student who never opened the tool simply is not in
// it — and an absence is invisible. This inverts it: start from the ROSTER, so
// every student has a row whether or not they have ever appeared, and say for each
// one whether the institute has recorded their enrolment, whether they have ever
// switched the tool on, and whether it is running for them right now.
//
// "Syncing now" is derived from their LAST enable/disable event, not from a count:
// a student who enabled, disabled and enabled again is on. Everything else
// (elective fetches, PDF downloads) leaves that state alone.
//
// Read-only, SAC-gated by the same map as the other two logs, and it touches no
// student's account — per-user sync state lives in their own UserProperties, which
// no other account can read, so the Usage log is the only honest source for this.
function getStudentDirectory() {
  var viewerEmail = Session.getActiveUser().getEmail() || "";
  if (!canViewLogs_(viewerEmail)) {
    return { ok: false, reason: "forbidden" };
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var baselineAt = termBaselineAt_(scriptProps);

  // ── every event we have, oldest first, folded down to a per-roll state ──
  var byRoll = {};
  function note(roll, action, at) {
    if (!roll || !action) return;
    var e = byRoll[roll] || (byRoll[roll] = {
      firstAt: null, lastAt: null, lastAction: "", events: 0,
      everEnabled: false, enabledThisTerm: false, on: false
    });
    e.events++;
    if (at) {
      if (e.firstAt === null || at < e.firstAt) e.firstAt = at;
      if (e.lastAt === null || at > e.lastAt) e.lastAt = at;
    }
    if (isEnableAction_(action)) {
      e.everEnabled = true;
      if (!baselineAt || (at && at >= baselineAt)) e.enabledThisTerm = true;
    }
    // Only enable/disable (and the automatic handover, which is one or the other)
    // move the on/off state; the rows arrive oldest-first, so the last one wins.
    if (isEnableAction_(action)) { e.on = true; e.lastStateAt = at; }
    else if (isDisableAction_(action)) { e.on = false; e.lastStateAt = at; }
    e.lastAction = action;
  }

  var events = [];
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USAGE_SHEET_NAME);
    if (sheet && sheet.getLastRow() > 1) {
      var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 7)).getValues();
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var col3 = row[3] ? row[3].toString().trim() : "";
        var col6 = row[6] ? row[6].toString().trim() : "";
        var isLegacy = !col6 && (col3 === "enable" || col3 === "disable");
        var action = isLegacy ? col3 : col6;
        if (!action) continue;
        var ts = row[0];
        var at = (ts instanceof Date) ? ts.getTime() : (ts ? new Date(ts).getTime() : NaN);
        var rowEmail = (isLegacy ? row[1] : row[4]);
        rowEmail = rowEmail ? rowEmail.toString().trim() : "";
        var roll = isLegacy ? "" : (row[2] ? row[2].toString().trim() : "");
        if (!roll && rowEmail) roll = rowEmail.split("@")[0];
        events.push({ roll: (roll || "").toUpperCase(), action: action, at: isNaN(at) ? null : at });
      }
    }
  } catch (sheetErr) {
    console.warn("Student directory: usage sheet unreadable: " + getErrorMessage_(sheetErr));
  }
  // Events the admin fetch has not flushed to the sheet yet, so a student who
  // enabled five minutes ago already shows as syncing.
  try {
    var buffered = getBufferedUsageEvents_();
    for (var b = 0; b < buffered.length; b++) {
      var be = buffered[b];
      if (!be.action) continue;
      events.push({
        roll: (be.roll || (be.email ? be.email.split("@")[0] : "")).toUpperCase(),
        action: be.action, at: be.ts || null
      });
    }
  } catch (bufErr) { }

  events.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  for (var e = 0; e < events.length; e++) note(events[e].roll, events[e].action, events[e].at);

  // ── does the institute's enrolment list know them? ──
  // Best-effort and cached script-wide, so this costs one shared read per 30 min
  // rather than one per viewer. A failure leaves the column as "unknown" (null)
  // rather than a cross — claiming a student has no enrolment when the sheet
  // merely would not load is exactly the mistake this release exists to stop.
  // In section mode "enrolled" means the roster section gives them courses; in
  // pick mode there is no list to be on, so the column stays unknown.
  var enrolled = null, enrolCount = {};
  var dirMode = enrolmentMode_();
  if (dirMode === "section") {
    var dirIndex = masterDataSectionIndex_();
    if (Object.keys(dirIndex).length) {
      enrolled = {};
      Object.keys(STUDENT_ROSTER_).forEach(function (r) {
        var picks = sectionCoursesFor_(r.toUpperCase(), STUDENT_ROSTER_[r][1], dirIndex);
        if (STUDENT_ROSTER_[r][1] && picks.length) {
          enrolled[r.toUpperCase()] = true;
          enrolCount[r.toUpperCase()] = picks.length;
        }
      });
    }
  } else if (dirMode === "electives") {
    try {
      var catalogue = getElectiveCatalogue_();
      if (catalogue.length) {
        var codes = [];
        for (var c = 0; c < catalogue.length; c++) codes.push(catalogue[c].code);
        var read = getElectiveSectionMaps_(codes);
        if (!read.missing.length) {
          enrolled = {};
          for (var m = 0; m < codes.length; m++) {
            var map = read.maps[codes[m]];
            if (!map) continue;
            var keys = Object.keys(map);
            for (var k = 0; k < keys.length; k++) {
              enrolled[keys[k]] = true;
              enrolCount[keys[k]] = (enrolCount[keys[k]] || 0) + 1;
            }
          }
        }
      }
    } catch (elErr) {
      console.warn("Student directory: enrolment unavailable: " + getErrorMessage_(elErr));
    }
  }

  // ── one row per roster student, plus anyone who used the tool but isn't on it ──
  var out = [];
  var seen = {};
  function push(roll, name, section, onRoster) {
    if (seen[roll]) return;
    seen[roll] = true;
    var e = byRoll[roll] || null;
    var enrolRoll = roll;
    // Repeat students carry a trailing letter in the sheet and the plain form in
    // their email; electiveRollKeys_ indexes both, so either resolves.
    var hasEnrol = enrolled ? !!(enrolled[enrolRoll] || enrolled[enrolRoll.replace(/[^0-9]+$/, "")]) : null;
    out.push({
      roll: roll,
      name: name || "",
      section: section || "",
      onRoster: onRoster,
      // null = could not check, never false-on-a-guess.
      enrolled: hasEnrol,
      courses: enrolled ? (enrolCount[enrolRoll] || enrolCount[enrolRoll.replace(/[^0-9]+$/, "")] || 0) : null,
      everUsed: !!(e && e.everEnabled),
      usedThisTerm: !!(e && e.enabledThisTerm),
      syncing: !!(e && e.on),
      lastAction: e ? e.lastAction : "",
      lastAt: e ? e.lastAt : null,
      events: e ? e.events : 0
    });
  }

  var rosterKeys = Object.keys(STUDENT_ROSTER_);
  for (var r = 0; r < rosterKeys.length; r++) {
    var entry = STUDENT_ROSTER_[rosterKeys[r]];
    push(rosterKeys[r].toUpperCase(), entry[0], entry[1], true);
  }
  // Anyone the log knows who is not on the roster (a repeat student from an
  // earlier batch, say) still deserves a row rather than silently vanishing.
  var logRolls = Object.keys(byRoll);
  for (var lr = 0; lr < logRolls.length; lr++) push(logRolls[lr], "", "", false);

  out.sort(function (a, b) { return a.roll < b.roll ? -1 : (a.roll > b.roll ? 1 : 0); });

  var summary = { total: out.length, syncing: 0, everUsed: 0, usedThisTerm: 0,
                  enrolled: 0, notEnrolled: 0, enrolmentKnown: enrolled !== null };
  for (var o = 0; o < out.length; o++) {
    if (out[o].syncing) summary.syncing++;
    if (out[o].everUsed) summary.everUsed++;
    if (out[o].usedThisTerm) summary.usedThisTerm++;
    if (out[o].enrolled === true) summary.enrolled++;
    else if (out[o].enrolled === false) summary.notEnrolled++;
  }
  return { ok: true, rows: out, summary: summary, baselineAt: baselineAt,
           termLabel: TERM_CONFIG_.label };
}

// ── Students: what changed about MY quizzes ───────────────────────────────────
// A quiz moving is the single change a student most needs to hear about, and it is
// the one most easily missed: the calendar event simply is somewhere else the next
// time they look, with nothing saying it moved.
//
// Scoped to the caller's own courses on purpose. A batch-wide list of every quiz
// edit would be mostly noise, and noise is what makes people stop reading a banner.
// Returns nothing at all when nothing has changed — the client shows no card, which
// is why the empty case has to be genuinely empty rather than "no changes ✓".
var QUIZ_UPDATE_WINDOW_MS_ = 14 * 24 * 60 * 60 * 1000;
var QUIZ_UPDATE_MAX_ = 12;

function getQuizUpdates() {
  try {
    var props = PropertiesService.getUserProperties();
    var scriptProps = PropertiesService.getScriptProperties();
    if (scriptProps.getProperty('term_ended_at')) return { ok: true, rows: [] };

    var saved = props.getProperty('tt_selections');
    if (!saved) return { ok: true, rows: [] };
    var selections;
    try { selections = JSON.parse(saved); } catch (e) { return { ok: true, rows: [] }; }
    if (!Array.isArray(selections) || !selections.length) return { ok: true, rows: [] };

    // An audited (sit-in) course syncs no quiz events, so its quiz-schedule edits
    // are not this student's news either — drop those codes here for the same
    // reason appendQuizEvents_ skips them. No-op for everyone else. See
    // COURSE_AUDIT_.
    var auditedOut = auditRuleForUser_().classesOnly;
    // Course → the student's sections of it ({} for a course taken without one).
    var mine = {};
    for (var s = 0; s < selections.length; s++) {
      var res = resolveSelectionCode_(selections[s]);
      if (!res) continue;
      var resUC = res.code.toUpperCase();
      if (auditedOut[resUC]) continue;
      mine[resUC] = mine[resUC] || {};
      if (res.section) mine[resUC][res.section.toUpperCase()] = true;
    }

    var baselineAt = termBaselineAt_(scriptProps);
    var since = Math.max(baselineAt, Date.now() - QUIZ_UPDATE_WINDOW_MS_);

    // Cheap gate before the sheet read. The fetch already stamps when the quiz
    // schedule last changed, so "has anything happened?" costs one property read
    // instead of pulling 800 change-log rows on every page load for every student,
    // and once the stamp is more than the window old the feature is free again.
    var quizStamp = Number(scriptProps.getProperty('last_quiz_changed_at') || '0');
    if (!quizStamp || quizStamp < since) return { ok: true, rows: [] };

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHANGELOG_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return { ok: true, rows: [] };

    var ncols = CHANGELOG_HEADER_.length;
    // Newest rows are at the bottom; a term's worth of edits is small, but read
    // only the tail so this stays cheap however long the log grows.
    var last = sheet.getLastRow();
    var first = Math.max(2, last - 800);
    var values = sheet.getRange(first, 1, last - first + 1, ncols).getValues();

    var rows = [];
    for (var i = values.length - 1; i >= 0 && rows.length < QUIZ_UPDATE_MAX_; i--) {
      var v = values[i];
      var type = v[1] ? v[1].toString().trim() : "";
      if (!type) continue;
      var category = changeCell_(v[2]);
      if (category.toLowerCase().indexOf("quiz") === -1) continue;
      var ts = v[0];
      var at = (ts instanceof Date) ? ts.getTime() : (ts ? new Date(ts).getTime() : NaN);
      if (isNaN(at) || at < since) continue;
      var course = changeCell_(v[3]).toUpperCase();
      if (!course || !mine[course]) continue;
      var section = changeCell_(v[4]);
      // Another section's copy is not this student's quiz. A quiz set for "A&B" is
      // stored (and logged) once per section, so without this every B2B student saw
      // each change twice, once labelled with the section they are not in. Same rule
      // as appendQuizEvents_: a row with no section covers the whole course.
      if (section && Object.keys(mine[course]).length && !mine[course][section.toUpperCase()]) continue;
      rows.push({
        at: at, type: type, course: course, section: section,
        classDate: changeCell_(v[5]), field: changeCell_(v[6]),
        from: changeCell_(v[7]), to: changeCell_(v[8]), details: changeCell_(v[9]),
        name: (COURSE_INFO_[course] && COURSE_INFO_[course].name) || course
      });
    }
    return { ok: true, rows: rows };
  } catch (e) {
    // Informational only — never let it break a page load.
    console.warn("getQuizUpdates failed: " + getErrorMessage_(e));
    return { ok: true, rows: [] };
  }
}

// Trim a sheet cell to a plain string ("" for blank/null).
function changeCell_(v) {
  return v === null || v === undefined ? "" : v.toString().trim();
}

// Canonicalise a time cell to "HH:mm" so the change-log diff is format-agnostic.
// The old snapshot is read back from the sheet via getValues(), where Sheets has
// auto-coerced "09:00" into a time-of-day Date (the 1899-epoch value), while the
// freshly-parsed CSV side is still the plain string "09:00". Without this, every
// class would read as a "Time modified" change on any fetch. parseTime_ already
// accepts both a Date and a string; an unparseable/blank value falls back to its
// trimmed text so it still compares consistently.
function changeTimeCell_(v) {
  if (v === null || v === undefined || v === "") return "";
  try {
    var t = parseTime_(v);
    return ("0" + t.h).slice(-2) + ":" + ("0" + t.m).slice(-2);
  } catch (e) {
    return changeCell_(v);
  }
}

// The exam-layout change kinds. Both tabs share the exam column layout, so they diff
// identically; only the category label shown to the user differs ("Mid-Term" vs
// "End-Term"), which is what lets the changes log say which schedule moved. The bare
// "Exam" spelling is the pre-end-term category — still accepted so ChangeLog rows
// written before the two tabs were split keep rendering as exam changes.
function isExamKind_(kind) {
  return kind === "Mid-Term" || kind === "End-Term" || kind === "Exam";
}

// Normalize one sheet row (MasterData or QuizData layout — they share columns 0..7;
// MasterData adds 8 = Session, quizzes add 8 = Quiz #, 9 = Duration). Session is
// deliberately NOT read here, so a session number never registers as a change-log
// entry. Returns null for blank/padding rows (no course code) so trailing blanks
// never look like changes.
function changeRecordFromRow_(row, kind) {
  if (!row) return null;
  var code = changeCell_(row[3]);
  if (!code) return null;
  var dateObj = parseSheetDate_(row[0]);
  var tz = Session.getScriptTimeZone();
  return {
    dateKey: dateObj ? Utilities.formatDate(dateObj, tz, "yyyy-MM-dd") : changeCell_(row[0]),
    dateDisp: dateObj ? Utilities.formatDate(dateObj, tz, "dd/MM/yyyy") : changeCell_(row[0]),
    start: changeTimeCell_(row[1]),
    end: changeTimeCell_(row[2]),
    code: code,
    section: changeCell_(row[4]),
    instructor: changeCell_(row[6]),
    room: changeCell_(row[7]),
    qn: kind === "Quiz" ? changeCell_(row[8]) : "",
    dur: kind === "Quiz" ? changeCell_(row[9]) : "",
    // Exam layout: row[9] = Exam Type (row[8] = Session, tracked via room/time already).
    etype: isExamKind_(kind) ? changeCell_(row[9]) : ""
  };
}

function changeTimeStr_(rec) {
  if (!rec.start && !rec.end) return "";
  return rec.start + (rec.end ? "–" + rec.end : ""); // en-dash range
}

// "FIN-B · 12/06/2026 · 09:00–10:15 · LH-5 · Prof Rao [· Quiz 2]" — the one-liner
// used for an Added/Removed row's detail and for matching whole-class moves.
function changeDescribe_(rec) {
  var bits = [rec.code + (rec.section ? "-" + rec.section : "")];
  if (rec.dateDisp) bits.push(rec.dateDisp);
  var t = changeTimeStr_(rec);
  if (t) bits.push(t);
  if (rec.room) bits.push(rec.room);
  if (rec.instructor) bits.push(rec.instructor);
  if (rec.qn) bits.push("Quiz " + rec.qn);
  if (rec.etype) bits.push(rec.etype);
  return bits.join(" · ");
}

// Full-identity fingerprint: two records with the same fingerprint are unchanged.
function changeFingerprint_(rec) {
  return [rec.dateKey, rec.start, rec.end, rec.code, rec.section, rec.instructor, rec.room, rec.qn, rec.dur, rec.etype].join("");
}
// Everything EXCEPT the date — used to recognise a pure day-move.
function changeFingerprintNoDate_(rec) {
  return [rec.start, rec.end, rec.code, rec.section, rec.instructor, rec.room, rec.qn, rec.dur, rec.etype].join("");
}

function changeBaseRow_(rec, type, field, from, to, details, category) {
  return {
    type: type,
    category: category,
    course: rec.code,
    section: rec.section,
    classDate: rec.dateDisp,
    field: field,
    from: from,
    to: to,
    details: details
  };
}

// Compares the previous sheet rows (oldRows) against the freshly parsed rows
// (newRows) and returns an array of change records. kind is "Class", "Quiz",
// "Mid-Term" or "End-Term"; it sets the category shown in the changes log and selects
// which extra fields are tracked (quizzes add Quiz #/Duration, both exam kinds add
// Exam Type). Pure: logs nothing itself, throws nothing on ordinary data.
function diffSheetData_(oldRows, newRows, kind) {
  var oldRecs = [], newRecs = [];
  var r;
  for (var i = 0; i < oldRows.length; i++) { r = changeRecordFromRow_(oldRows[i], kind); if (r) oldRecs.push(r); }
  for (var j = 0; j < newRows.length; j++) { r = changeRecordFromRow_(newRows[j], kind); if (r) newRecs.push(r); }

  // Pass A — drop rows that are byte-for-byte identical across versions. What
  // survives on either side is genuinely added, removed, or modified.
  var oldByFp = {};
  for (var a = 0; a < oldRecs.length; a++) {
    var fp = changeFingerprint_(oldRecs[a]);
    (oldByFp[fp] = oldByFp[fp] || []).push(oldRecs[a]);
  }
  var remainingOld = [], remainingNew = [];
  for (var b = 0; b < newRecs.length; b++) {
    var nfp = changeFingerprint_(newRecs[b]);
    if (oldByFp[nfp] && oldByFp[nfp].length) { oldByFp[nfp].pop(); } // matched: unchanged
    else { remainingNew.push(newRecs[b]); }
  }
  for (var fpKey in oldByFp) {
    if (oldByFp.hasOwnProperty(fpKey)) {
      for (var k = 0; k < oldByFp[fpKey].length; k++) remainingOld.push(oldByFp[fpKey][k]);
    }
  }

  // Pass B — within course+section+date, pair surviving rows (sorted by start time)
  // and report each differing field. Unpaired rows fall through to add/remove.
  function identKey(rec) { return rec.code + "" + rec.section + "" + rec.dateKey; }
  function byStart(x, y) { return x.start < y.start ? -1 : (x.start > y.start ? 1 : 0); }
  var groups = {};
  function bucket(rec, side) {
    var key = identKey(rec);
    if (!groups[key]) groups[key] = { old: [], nw: [] };
    groups[key][side].push(rec);
  }
  for (var o = 0; o < remainingOld.length; o++) bucket(remainingOld[o], "old");
  for (var n = 0; n < remainingNew.length; n++) bucket(remainingNew[n], "nw");

  var changes = [];
  var leftoverOld = [], leftoverNew = [];
  for (var gk in groups) {
    if (!groups.hasOwnProperty(gk)) continue;
    var g = groups[gk];
    g.old.sort(byStart); g.nw.sort(byStart);
    var paired = Math.min(g.old.length, g.nw.length);
    for (var p = 0; p < paired; p++) {
      var oldRec = g.old[p], newRec = g.nw[p];
      var fieldChanges = changeFieldDiffs_(oldRec, newRec, kind);
      for (var fc = 0; fc < fieldChanges.length; fc++) {
        var f = fieldChanges[fc];
        changes.push(changeBaseRow_(newRec, "Modified", f.field, f.from, f.to,
          (newRec.code + (newRec.section ? "-" + newRec.section : "")) + " · " + newRec.dateDisp +
          " — " + f.field + ": " + (f.from || "—") + " → " + (f.to || "—"), kind));
      }
    }
    for (var ro = paired; ro < g.old.length; ro++) leftoverOld.push(g.old[ro]);
    for (var rn = paired; rn < g.nw.length; rn++) leftoverNew.push(g.nw[rn]);
  }

  // Pass C — a leftover removed row and a leftover added row that match on
  // everything but the date is a class moved to another day: one "Date" change.
  var oldByNoDate = {};
  for (var lo = 0; lo < leftoverOld.length; lo++) {
    var ndf = changeFingerprintNoDate_(leftoverOld[lo]);
    (oldByNoDate[ndf] = oldByNoDate[ndf] || []).push(leftoverOld[lo]);
  }
  var trulyAdded = [];
  for (var ln = 0; ln < leftoverNew.length; ln++) {
    var key2 = changeFingerprintNoDate_(leftoverNew[ln]);
    if (oldByNoDate[key2] && oldByNoDate[key2].length) {
      var movedFrom = oldByNoDate[key2].pop();
      var movedTo = leftoverNew[ln];
      changes.push(changeBaseRow_(movedTo, "Modified", "Date", movedFrom.dateDisp, movedTo.dateDisp,
        (movedTo.code + (movedTo.section ? "-" + movedTo.section : "")) +
        " — Date: " + movedFrom.dateDisp + " → " + movedTo.dateDisp +
        (changeTimeStr_(movedTo) ? " (" + changeTimeStr_(movedTo) + ")" : ""), kind));
    } else {
      trulyAdded.push(leftoverNew[ln]);
    }
  }
  for (var ta = 0; ta < trulyAdded.length; ta++) {
    var addRec = trulyAdded[ta];
    changes.push(changeBaseRow_(addRec, "Added", "—", "", changeDescribe_(addRec),
      "Added: " + changeDescribe_(addRec), kind));
  }
  for (var noKey in oldByNoDate) {
    if (!oldByNoDate.hasOwnProperty(noKey)) continue;
    for (var rem = 0; rem < oldByNoDate[noKey].length; rem++) {
      var remRec = oldByNoDate[noKey][rem];
      changes.push(changeBaseRow_(remRec, "Removed", "—", changeDescribe_(remRec), "",
        "Removed: " + changeDescribe_(remRec), kind));
    }
  }
  return changes;
}

// The previous snapshot of QuizData / ExamData / EndTermData, minus rows for courses
// outside this term's list (COURSE_INFO_), before it is diffed for the change log.
// Nothing clears those sheets at a term switch, and assertNotEmptyWipe_ will not
// blank one that still has rows, so each keeps the PREVIOUS term's rows until this
// term's first real schedule replaces them. Diffed as they are, every Term 4 quiz
// and exam would be logged as "Removed" in this term's Changes tab — the term
// turning over, not an institute edit, which is why the class diff is skipped on a
// term switch too. The cost: removing a row for a course missing from COURSE_INFO_
// goes unlogged — and every course of this term is in it (reportCatalogueDrift_
// checks it against the institute catalogue on every fetch).
function currentTermRows_(rows) {
  return rows.filter(function (row) {
    var code = row && row[3] ? row[3].toString().trim().toUpperCase() : "";
    return !!code && Object.prototype.hasOwnProperty.call(COURSE_INFO_, code);
  });
}

// The per-field comparisons for a matched pair. Time collapses start+end into one
// "Time" change so a rescheduled slot reads as a single line.
function changeFieldDiffs_(oldRec, newRec, kind) {
  var out = [];
  var oldTime = changeTimeStr_(oldRec), newTime = changeTimeStr_(newRec);
  if (oldTime !== newTime) out.push({ field: "Time", from: oldTime, to: newTime });
  if (oldRec.room !== newRec.room) out.push({ field: "Room", from: oldRec.room, to: newRec.room });
  if (oldRec.instructor !== newRec.instructor) out.push({ field: kind === "Class" ? "Instructor" : "Faculty", from: oldRec.instructor, to: newRec.instructor });
  if (kind === "Quiz") {
    if (oldRec.qn !== newRec.qn) out.push({ field: "Quiz No.", from: oldRec.qn, to: newRec.qn });
    if (oldRec.dur !== newRec.dur) out.push({ field: "Duration", from: oldRec.dur, to: newRec.dur });
  }
  if (isExamKind_(kind)) {
    if (oldRec.etype !== newRec.etype) out.push({ field: "Exam Type", from: oldRec.etype, to: newRec.etype });
  }
  return out;
}

// Appends change records to the ChangeLog sheet (creating + protecting it on first
// use). Owner-only path: only ever called from the admin fetch. Never throws —
// a logging failure must not break the timetable fetch.
function logTimetableChanges_(records) {
  if (!records || !records.length) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CHANGELOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CHANGELOG_SHEET_NAME);
      sheet.getRange(1, 1, 1, CHANGELOG_HEADER_.length).setValues([CHANGELOG_HEADER_]).setFontWeight("bold");
      sheet.setFrozenRows(1);
      // Hide it from casual view like the Usage sheet — with students downgraded to
      // view-only they can't unhide it. (SAC still read it in-app via getChangeLog,
      // which reads values regardless of the hidden flag.)
      try { sheet.hideSheet(); } catch (hideErr) { }
    }
    protectDataSheet_(sheet);
    var now = new Date();
    var matrix = records.map(function (c) {
      return [now, c.type, c.category, c.course, c.section, c.classDate, c.field, c.from, c.to, c.details];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, CHANGELOG_HEADER_.length).setValues(matrix);
  } catch (e) {
    console.warn("Change-log write failed: " + getErrorMessage_(e));
  }
}

// Per-row change log for the admin panel's 🛠️ Changes tab (the
// stat card). Same SAC-only gate as getUsageLog: non-viewers get { ok:false,
// reason:"forbidden" } and the client shows an access-restricted notice. Read-only
// (never creates the sheet — a student's web-app context may lack rights); newest
// first, capped at CHANGELOG_MAX_ROWS_.
function getChangeLog() {
  var viewerEmail = Session.getActiveUser().getEmail() || "";
  if (!canViewLogs_(viewerEmail)) {
    return { ok: false, reason: "forbidden" };
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var baselineAt = termBaselineAt_(scriptProps);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHANGELOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return { ok: true, rows: [], total: 0, priorTotal: 0, baselineAt: baselineAt,
             termLabel: TERM_CONFIG_.label, priorTermLabel: PREVIOUS_TERM_.label };
  }

  var ncols = CHANGELOG_HEADER_.length;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ncols).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var type = v[1] ? v[1].toString().trim() : "";
    if (!type) continue; // skip any blank/padding row
    var ts = v[0];
    var whenMs = (ts instanceof Date) ? ts.getTime() : (ts ? new Date(ts).getTime() : NaN);
    var at = isNaN(whenMs) ? null : whenMs;
    rows.push({
      at: at,
      // Which term this entry describes. The sheet is cumulative across the
      // handover, so without this every viewer would show Term 4's edits and the
      // several hundred rows the handover diff produced as if they were current.
      prior: !!(baselineAt && at && at < baselineAt),
      type: type,
      category: changeCell_(v[2]),
      course: changeCell_(v[3]),
      section: changeCell_(v[4]),
      classDate: changeCell_(v[5]),
      field: changeCell_(v[6]),
      from: changeCell_(v[7]),
      to: changeCell_(v[8]),
      details: changeCell_(v[9])
    });
  }
  rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  var priorTotal = 0;
  for (var pr = 0; pr < rows.length; pr++) if (rows[pr].prior) priorTotal++;
  var total = rows.length - priorTotal;
  if (rows.length > CHANGELOG_MAX_ROWS_) rows = rows.slice(0, CHANGELOG_MAX_ROWS_);
  return { ok: true, rows: rows, total: total, priorTotal: priorTotal,
           baselineAt: baselineAt, termLabel: TERM_CONFIG_.label,
           priorTermLabel: PREVIOUS_TERM_.label };
}

// "Report a wrong entry" submissions for the admin panel's 🚩 Reports tab. Students
// are told their report "was sent to the SAC team", so SAC (and the spreadsheet
// owner — see canViewLogs_) must be able to read them without unhiding a sheet.
// Reads the Reports sheet AND the still-buffered reports (the admin fetch drains
// them every 30 min), so a report is visible the moment it is sent. Newest first,
// capped; rows from before this term's baseline are flagged `prior`, like the logs.
var REPORTS_VIEW_MAX_ = 300;
function getReports() {
  var viewerEmail = Session.getActiveUser().getEmail() || "";
  if (!canViewLogs_(viewerEmail)) return { ok: false, reason: "forbidden" };

  var scriptProps = PropertiesService.getScriptProperties();
  var baselineAt = termBaselineAt_(scriptProps);
  var rows = [];
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTS_SHEET_NAME);
    if (sheet && sheet.getLastRow() > 1) {
      var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
      for (var i = 0; i < values.length; i++) {
        var v = values[i];
        var ts = v[0];
        var at = (ts instanceof Date) ? ts.getTime() : (ts ? new Date(ts).getTime() : NaN);
        if (!changeCell_(v[5]) && !changeCell_(v[8]) && !changeCell_(v[1])) continue; // blank row
        rows.push({ at: isNaN(at) ? null : at, roll: changeCell_(v[1]), name: changeCell_(v[2]),
          email: changeCell_(v[4]), course: changeCell_(v[5]),
          classDate: v[6] instanceof Date ? Utilities.formatDate(v[6], Session.getScriptTimeZone(), "yyyy-MM-dd") : changeCell_(v[6]),
          issue: changeCell_(v[7]), details: changeCell_(v[8]), pending: false });
      }
    }
  } catch (sheetErr) {
    console.warn("getReports: Reports sheet unreadable: " + getErrorMessage_(sheetErr));
  }
  var pendingCount = 0;
  try {
    var all = scriptProps.getProperties();
    var keys = Object.keys(all);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].indexOf(REPORT_BUFFER_PREFIX_) !== 0) continue;
      var e = null;
      try { e = JSON.parse(all[keys[k]]); } catch (pe) { e = null; }
      if (!e) continue;
      pendingCount++;
      rows.push({ at: e.ts || null, roll: e.roll || "", name: e.name || "", email: e.email || "",
        course: e.course || "", classDate: e.classDate || "", issue: e.issueType || "",
        details: e.details || "", pending: true });
    }
  } catch (bufErr) { }

  var priorTotal = 0;
  for (var r = 0; r < rows.length; r++) {
    rows[r].prior = !!(baselineAt && rows[r].at && rows[r].at < baselineAt);
    if (rows[r].prior) priorTotal++;
  }
  rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  var total = rows.length - priorTotal;
  if (rows.length > REPORTS_VIEW_MAX_) rows = rows.slice(0, REPORTS_VIEW_MAX_);
  return { ok: true, rows: rows, total: total, priorTotal: priorTotal, pending: pendingCount,
           baselineAt: baselineAt, termLabel: TERM_CONFIG_.label, priorTermLabel: PREVIOUS_TERM_.label };
}

// Newest report timestamp (ms), buffered or in the sheet, or 0. Shipped to log
// viewers in the health payload so the admin panel can flag "new report" without
// loading the tab. Cheap: one property scan plus one cell. Never throws.
function latestReportAt_() {
  var latest = 0;
  try {
    var all = PropertiesService.getScriptProperties().getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf(REPORT_BUFFER_PREFIX_) !== 0) return;
      try { var e = JSON.parse(all[k]); if (e && e.ts > latest) latest = e.ts; } catch (pe) { }
    });
  } catch (e) { }
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTS_SHEET_NAME);
    if (sheet && sheet.getLastRow() > 1) {
      var ts = sheet.getRange(sheet.getLastRow(), 1).getValue();
      var at = (ts instanceof Date) ? ts.getTime() : 0;
      if (at > latest) latest = at;
    }
  } catch (e) { }
  return latest;
}

function getSyncProgress() {
  var userCache = CacheService.getUserCache();
  var raw = userCache.get(PROGRESS_KEY);
  if (!raw) return null;
  try {
    var obj = JSON.parse(raw);
    var note = userCache.get(PROGRESS_NOTE_KEY_);
    if (note) obj.note = note;
    return obj;
  } catch (e) {
    return null;
  }
}

function getSyncWindow_() {
  return { start: TERM_CONFIG_.syncWindowStart, end: TERM_CONFIG_.syncWindowEnd };
}

// Events are only ever listed/cleared inside the sync window, so creating one
// outside it would orphan it: every re-sync's clear phase would miss it and then
// re-create another copy — duplicates accumulating forever, which even Disable
// couldn't remove (before it deleted the whole calendar). Rule: never create what
// the clear phase can't later find. `dateObj` is the event's date at local
// midnight; the end bound is exclusive, matching getSyncWindow_.
function isWithinSyncWindow_(dateObj) {
  var w = getSyncWindow_();
  return dateObj >= w.start && dateObj < w.end;
}

// `split` (optional) carries the class/quiz/exam breakdown shown by the progress UI
// so students can verify each kind separately:
// { cd,ct: classes done/total, qd,qt: quizzes done/total, ed,et: exams done/total }.
function putProgress_(cache, current, total, status, split) {
  // `op` lets the client label completions correctly; `t` is a heartbeat —
  // refreshed at least every ~5s while a run is alive, so the client can tell
  // a live payload from one left behind by a dead run; `id` (user-initiated
  // runs only) lets the client ignore another run's terminal payload.
  var obj = { current: current, total: total, status: status, op: PROGRESS_OP_, t: Date.now() };
  if (PROGRESS_OP_ID_) obj.id = PROGRESS_OP_ID_;
  if (split) {
    obj.cd = split.cd; obj.ct = split.ct;
    obj.qd = split.qd; obj.qt = split.qt;
    obj.ed = split.ed; obj.et = split.et;
  }
  cache.put(PROGRESS_KEY, JSON.stringify(obj), 600);
}

function putProgressNote_(cache, note) {
  cache.put(PROGRESS_NOTE_KEY_, note, 600);
}

function clearProgressNote_(cache) {
  cache.remove(PROGRESS_NOTE_KEY_);
}

function getErrorMessage_(e) {
  return e && e.message ? e.message : String(e);
}

// A user who authorized an older version of this tool — before the
// UrlFetchApp-based calendar engine — has a grant missing
// script.external_request, so sync throws a permission error. This hands the
// client a URL the user can open to grant the now-required scopes in place,
// without hunting through the script editor. Returns "" if no URL can be
// produced, in which case the client falls back to a plain "reload & approve"
// prompt (reloading the web app re-triggers consent once the deployed scope
// set has grown). Never throws — a failure here must not block the prompt.
function getReauthUrl() {
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    return info && info.getAuthorizationUrl ? (info.getAuthorizationUrl() || "") : "";
  } catch (e) {
    return "";
  }
}

// Proactive authorization probe for the client's load-time check. When a user's
// grant predates a now-required scope (see getReauthUrl), this returns
// required:true so the UI can show the re-authorize card up front — before they
// click Enable and hit a hard error. `url` is the grant link when available.
// Never throws: on any doubt it reports required:false so a healthy user is
// never nagged.
function getAuthStatus() {
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    var required = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
    return {
      required: required,
      url: (required && info.getAuthorizationUrl) ? (info.getAuthorizationUrl() || "") : ""
    };
  } catch (e) {
    return { required: false, url: "" };
  }
}

function calendarApiBase_(cal) {
  return 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.getId()) + '/events';
}

function escapeRegex_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET with retry for the calendar list endpoints. Retries thrown exceptions,
// 429s, 5xxs, AND 403 rate-limit responses — Calendar reports per-user rate
// limiting as 403 rateLimitExceeded, distinct from the 403 "API disabled"
// errors that isCalendarApiUnavailableError_ matches (those are not retryable
// and are thrown straight through with the same message shape as before, so
// the fast→slow fallback logic upstream keeps working unchanged).
function fetchCalendarListPage_(url, token) {
  var lastDetail = "";
  for (var attempt = 1; attempt <= CALENDAR_WRITE_MAX_RETRIES_; attempt++) {
    var response = null;
    try {
      response = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
    } catch (fetchErr) {
      lastDetail = getErrorMessage_(fetchErr);
    }
    if (response) {
      var code = response.getResponseCode();
      if (code === 200) return response;
      var body = response.getContentText();
      lastDetail = 'HTTP ' + code + ': ' + body.substring(0, 300);
      var retryable = code === 429 || code >= 500 ||
        (code === 403 && body.toLowerCase().indexOf('ratelimitexceeded') !== -1);
      if (!retryable) break;
    }
    if (attempt < CALENDAR_WRITE_MAX_RETRIES_) Utilities.sleep(CALENDAR_WRITE_BACKOFF_MS_ * attempt);
  }
  throw new Error('Failed to list calendar events (' + lastDetail + ')');
}

// Heuristic: does this event look like a timetable entry from this tool, either
// current or from an older version? We need to be confident enough to delete it
// during the first-time-enable wipe without touching personal events the user may
// have placed on this calendar.
function looksLikeTimetableEvent_(item, codePattern) {
  if (item.description && item.description.indexOf(APP_TAG) !== -1) return true;
  if (item.location && new RegExp("^" + escapeRegex_(LOCATION_PREFIX_) + "\\s*\\|", "i").test(item.location)) return true;
  if (item.summary && codePattern.test(item.summary)) return true;
  return false;
}

// Quiz events created by this tool always carry the 📝 prefix in their title
// (see appendQuizEvents_), which lets the delete pipeline split classes from
// quizzes without fetching any extra fields.
function isQuizEventTitle_(title) {
  return !!title && title.indexOf("📝") === 0;
}

// Exam events created by this tool always carry the 📕 prefix (see appendExamEvents_),
// the same way quizzes carry 📝 — so the delete pipeline can split all three kinds
// apart from the title alone, without fetching any extra fields.
function isExamEventTitle_(title) {
  return !!title && title.indexOf("📕") === 0;
}

// Orders delete candidates classes → quizzes → exams and counts each kind, so
// progress can report "x classes + y quizzes + z exams" separately and the kinds are
// always processed in that fixed order — making mid-run accuracy easy to verify. The
// order matches how backgroundSyncLocked_ builds the prepared list (classes, then
// appendQuizEvents_, then appendExamEvents_), so index boundaries line up on both
// the delete and create sides.
function buildDeletePlan_(entries, titleOf) {
  var classes = [];
  var quizzes = [];
  var exams = [];
  for (var i = 0; i < entries.length; i++) {
    var t = titleOf(entries[i]);
    if (isExamEventTitle_(t)) exams.push(entries[i]);
    else if (isQuizEventTitle_(t)) quizzes.push(entries[i]);
    else classes.push(entries[i]);
  }
  return {
    items: classes.concat(quizzes, exams),
    classTotal: classes.length,
    quizTotal: quizzes.length,
    examTotal: exams.length
  };
}

// "12 classes + 3 quizzes + 2 exams" for result messages. Classes are always shown;
// quizzes/exams are omitted when zero so the common (no-exam) case stays uncluttered.
function eventBreakdown_(classTotal, quizTotal, examTotal) {
  var parts = [classTotal + (classTotal === 1 ? " class" : " classes")];
  if (quizTotal > 0) parts.push(quizTotal + (quizTotal === 1 ? " quiz" : " quizzes"));
  if (examTotal > 0) parts.push(examTotal + (examTotal === 1 ? " exam" : " exams"));
  return parts.join(" + ");
}

// Content fingerprint of a prepared event covering every field the tool controls
// EXCEPT the popup reminder: reminders are patched onto matched events in place
// (see applyReminderToMatched_), so including them here would turn a settings
// tweak into a full delete-and-recreate of the entire calendar — the heaviest,
// most 429-prone operation there is. Must be computed BEFORE the [TT_SIG:…]
// line is appended to the description.
function computeEventSig_(p) {
  return hashString_(JSON.stringify([
    p.title,
    p.startTime.getTime(),
    p.endTime.getTime(),
    p.location,
    p.colorId,
    p.description
  ])).substring(0, 16);
}

// Uniform entry shape for both detailed listers. `sig` is null for events created
// before signatures existed (or with tampered descriptions) — they never match in
// the diff and get removed, which is exactly the self-migration we want.
function makeDetailedEntry_(id, event, summary, description, startMs, endMs) {
  var sig = null;
  if (description) {
    var m = description.replace(/\r\n/g, "\n").match(SIG_PATTERN_);
    if (m) sig = m[1];
  }
  // description is kept so the recent-changes log can report what the OLD
  // event's venue/instructor were when a replacement is created.
  return { id: id, event: event, summary: summary || "", description: description || "", sig: sig, startMs: startMs, endMs: endMs };
}

// Lists this tool's APP_TAG events with enough detail to diff: id, title, stored
// signature, and actual start/end epochs. Fast (REST) variant.
// `window` overrides the current term's sync window. Only the term handover
// passes one: it searches the PREVIOUS term's calendar, whose events sit almost
// entirely outside this term's window (Term 4 ran Jun–Sep, Term 5's window opens
// on Sep 1), so the default would silently find only the last few weeks of them.
function listSyncedEventsDetailed_(cal, window) {
  var syncWindow = window || getSyncWindow_();
  var baseUrl = calendarApiBase_(cal);
  var token = ScriptApp.getOAuthToken();
  var entries = [];
  var pageToken = null;
  var safetyPages = 50;

  do {
    var params = [
      'timeMin=' + encodeURIComponent(syncWindow.start.toISOString()),
      'timeMax=' + encodeURIComponent(syncWindow.end.toISOString()),
      'singleEvents=true',
      'maxResults=2500',
      'q=' + encodeURIComponent(APP_TAG),
      'fields=' + encodeURIComponent('nextPageToken,items(id,summary,description,start,end)')
    ];
    if (pageToken) params.push('pageToken=' + encodeURIComponent(pageToken));

    var response = fetchCalendarListPage_(baseUrl + '?' + params.join('&'), token);

    var data = JSON.parse(response.getContentText());
    if (data.items) {
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        if (!item.id) continue;
        entries.push(makeDetailedEntry_(
          item.id, null, item.summary, item.description,
          item.start && item.start.dateTime ? new Date(item.start.dateTime).getTime() : null,
          item.end && item.end.dateTime ? new Date(item.end.dateTime).getTime() : null
        ));
      }
    }
    pageToken = data.nextPageToken;
    safetyPages--;
  } while (pageToken && safetyPages > 0);

  return entries;
}

// Slow (CalendarApp) variant of listSyncedEventsDetailed_.
function slowListSyncedEventsDetailed_(cal, window) {
  var syncWindow = window || getSyncWindow_();
  var events = cal.getEvents(syncWindow.start, syncWindow.end, { search: APP_TAG });
  var entries = [];
  for (var i = 0; i < events.length; i++) {
    entries.push(makeDetailedEntry_(
      null, events[i], events[i].getTitle(), events[i].getDescription(),
      events[i].getStartTime().getTime(), events[i].getEndTime().getTime()
    ));
  }
  return entries;
}

// Multiset diff between what's on the calendar and what should be there.
// Match = same stored signature AND same actual start/end epochs (the time check
// corrects events a user manually dragged, matching the old wipe behaviour).
// Multiset semantics: each existing event satisfies at most one prepared event,
// so duplicate copies — and all sig-less legacy events — end up obsolete and get
// removed, self-healing any historical duplicates.
// prepared is ordered classes[0..classTotal) → quizzes[classTotal..classTotal+quizTotal)
// → exams[…]. The class/quiz boundaries let each kind be attributed by index (and
// createClassTotal/createQuizTotal preserve those boundaries within the toCreate
// subset, which keeps prepared's ordering).
function diffSyncedEvents_(existingEntries, prepared, classTotal, quizTotal) {
  var index = {};
  for (var e = 0; e < existingEntries.length; e++) {
    var en = existingEntries[e];
    if (!en.sig) continue;
    var key = en.sig + "|" + en.startMs + "|" + en.endMs;
    if (!index[key]) index[key] = [];
    index[key].push(en);
  }

  var classEnd = classTotal;
  var quizEnd = classTotal + quizTotal;
  var toCreate = [];
  var createClassTotal = 0;
  var createQuizTotal = 0;
  var unchanged = 0;
  var unchangedClasses = 0;
  var unchangedQuizzes = 0;
  var unchangedExams = 0;

  for (var p = 0; p < prepared.length; p++) {
    var pr = prepared[p];
    var k = pr.sig + "|" + pr.startTime.getTime() + "|" + pr.endTime.getTime();
    var bucket = index[k];
    if (bucket && bucket.length > 0) {
      bucket.pop().matched = true;
      unchanged++;
      if (p < classEnd) unchangedClasses++;
      else if (p < quizEnd) unchangedQuizzes++;
      else unchangedExams++;
    } else {
      toCreate.push(pr);
      if (p < classEnd) createClassTotal++;
      else if (p < quizEnd) createQuizTotal++;
    }
  }

  var obsoleteEntries = [];
  for (var o = 0; o < existingEntries.length; o++) {
    if (!existingEntries[o].matched) obsoleteEntries.push(existingEntries[o]);
  }

  return {
    toCreate: toCreate,
    createClassTotal: createClassTotal,
    createQuizTotal: createQuizTotal,
    obsoleteEntries: obsoleteEntries,
    unchanged: unchanged,
    unchangedClasses: unchangedClasses,
    unchangedQuizzes: unchangedQuizzes,
    unchangedExams: unchangedExams
  };
}

// First-time wipe: list events whose title/location/description match one of our
// timetable signals. Personal events (e.g. "Birthday", "Meeting with Prof") are
// left alone because they don't satisfy any of the three matchers.
// Returns a delete plan { ids, classTotal, quizTotal } with ids ordered classes-first.
function listLegacyTimetableEventIds_(cal) {
  var syncWindow = getSyncWindow_();
  var baseUrl = calendarApiBase_(cal);
  var token = ScriptApp.getOAuthToken();
  var ids = [];
  var pageToken = null;
  var safetyPages = 50;

  // Longest-first so "PM-F" matches before "PM" in JS regex alternation.
  var codes = Object.keys(COURSE_INFO_).sort(function (a, b) { return b.length - a.length; });
  // Title must be exactly "<CODE>: " or "<CODE> (" — both formats this tool emits.
  // This rejects unrelated titles that merely start with a code substring like
  // "BFA Office Hours" or "Meeting about BFA".
  var codePattern = new RegExp('^(' + codes.map(escapeRegex_).join('|') + ')(?::\\s|\\s\\()');

  do {
    var params = [
      'timeMin=' + encodeURIComponent(syncWindow.start.toISOString()),
      'timeMax=' + encodeURIComponent(syncWindow.end.toISOString()),
      'singleEvents=true',
      'maxResults=2500',
      'fields=' + encodeURIComponent('nextPageToken,items(id,summary,location,description)')
    ];
    if (pageToken) params.push('pageToken=' + encodeURIComponent(pageToken));

    var response = fetchCalendarListPage_(baseUrl + '?' + params.join('&'), token);

    var data = JSON.parse(response.getContentText());
    if (data.items) {
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        if (item.id && looksLikeTimetableEvent_(item, codePattern)) {
          ids.push(item);
        }
      }
    }
    pageToken = data.nextPageToken;
    safetyPages--;
  } while (pageToken && safetyPages > 0);

  var plan = buildDeletePlan_(ids, function (it) { return it.summary; });
  return {
    ids: plan.items.map(function (it) { return it.id; }),
    classTotal: plan.classTotal,
    quizTotal: plan.quizTotal,
    examTotal: plan.examTotal
  };
}

// Executes requests in parallel via fetchAll. On a thrown exception the entire
// batch is retried (network blip). On HTTP 429, 5xx, or a 403 whose body says
// rateLimitExceeded / userRateLimitExceeded (Calendar reports per-user rate limiting
// that way as often as with 429), individual failed sub-requests are re-issued with
// a linear backoff (CALENDAR_WRITE_BACKOFF_MS_ × attempt). Any OTHER 403 — "API not
// enabled", "calendar usage limits exceeded" — is not retryable and is returned as
// is, for the caller's fast→slow fallback to handle. The returned array preserves
// the original requests[j] → results[j] index mapping.
// True for a 403 that is a rate limit ("rateLimitExceeded", "userRateLimitExceeded")
// rather than a permission or quota refusal. Same test fetchCalendarListPage_ uses.
function isRateLimit403_(response) {
  try {
    return (response.getContentText() || "").toLowerCase().indexOf("ratelimitexceeded") !== -1;
  } catch (e) {
    return false;
  }
}

function fetchAllWithRetry_(requests, failureMessage) {
  var results = new Array(requests.length);
  var pendingRequests = requests.slice();
  var pendingIndices = [];
  for (var idx = 0; idx < requests.length; idx++) pendingIndices.push(idx);

  for (var attempt = 1; attempt <= CALENDAR_WRITE_MAX_RETRIES_; attempt++) {
    var responses;
    try {
      responses = UrlFetchApp.fetchAll(pendingRequests);
    } catch (e) {
      if (attempt >= CALENDAR_WRITE_MAX_RETRIES_) {
        throw new Error(failureMessage + " after " + CALENDAR_WRITE_MAX_RETRIES_ + " attempts: " + getErrorMessage_(e));
      }
      Utilities.sleep(CALENDAR_WRITE_BACKOFF_MS_ * attempt);
      continue;
    }

    var retryRequests = [];
    var retryIndices = [];
    for (var j = 0; j < responses.length; j++) {
      var code = responses[j].getResponseCode();
      var origIdx = pendingIndices[j];
      if ((code === 429 || code >= 500 || (code === 403 && isRateLimit403_(responses[j]))) &&
          attempt < CALENDAR_WRITE_MAX_RETRIES_) {
        retryRequests.push(pendingRequests[j]);
        retryIndices.push(origIdx);
      } else {
        results[origIdx] = responses[j];
      }
    }

    if (retryRequests.length === 0) break;
    pendingRequests = retryRequests;
    pendingIndices = retryIndices;
    Utilities.sleep(CALENDAR_WRITE_BACKOFF_MS_ * attempt);
  }

  return results;
}

// Deletes events in parallel batches via Calendar v3 REST. `plan` is
// { ids, classTotal, quizTotal } with ids ordered classes-first (built via
// buildDeletePlan_), so classes are always cleared before quizzes and both counts
// are tracked separately (attribution by index against plan.classTotal).
// 404/410 are treated as success (event already gone) so partial state self-heals.
// Returns { deleted, failed, lastError, classDeleted, quizDeleted } so callers can
// surface partial failures (e.g. 429 rate-limit storms) instead of silently
// reporting success.
function batchDeleteEventIds_(cal, plan, cache) {
  var eventIds = plan.ids;
  var total = eventIds.length;
  var split = { cd: 0, ct: plan.classTotal, qd: 0, qt: plan.quizTotal, ed: 0, et: plan.examTotal };
  putProgress_(cache, 0, total, "clearing", split);
  if (total === 0) return { deleted: 0, failed: 0, lastError: null, classDeleted: 0, quizDeleted: 0, examDeleted: 0 };

  var url = calendarApiBase_(cal) + '/';
  var token = ScriptApp.getOAuthToken();
  var classEnd = plan.classTotal;
  var quizEnd = plan.classTotal + plan.quizTotal;
  var deleted = 0;
  var failed = 0;
  var classDeleted = 0;
  var quizDeleted = 0;
  var examDeleted = 0;
  var lastError = null;
  var lastCacheWrite = Date.now();

  for (var i = 0; i < eventIds.length; i += CALENDAR_API_BATCH_SIZE_) {
    // Bail out cleanly before the uncatchable 6-minute kill. Remaining ids are
    // counted as failed so callers abort/retry exactly like a partial delete.
    if (Date.now() > EXECUTION_DEADLINE_MS_) {
      failed += eventIds.length - i;
      lastError = new Error("Ran out of execution time; remaining deletions retry on the next run.");
      break;
    }
    var batchIds = eventIds.slice(i, i + CALENDAR_API_BATCH_SIZE_);
    var requests = batchIds.map(function (id) {
      return {
        url: url + encodeURIComponent(id),
        method: 'delete',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      };
    });

    var responses = fetchAllWithRetry_(requests, "Failed to clear calendar events");
    for (var j = 0; j < responses.length; j++) {
      var code = responses[j].getResponseCode();
      if ((code >= 200 && code < 300) || code === 404 || code === 410) {
        deleted++;
        if (i + j < classEnd) classDeleted++;
        else if (i + j < quizEnd) quizDeleted++;
        else examDeleted++;
      } else {
        failed++;
        var body = responses[j].getContentText().substring(0, 200);
        lastError = new Error('HTTP ' + code + ': ' + body);
        console.error('Delete failed (HTTP ' + code + '): ' + body);
      }
    }

    if (Date.now() - lastCacheWrite >= 5000 || i + CALENDAR_API_BATCH_SIZE_ >= eventIds.length) {
      split.cd = classDeleted;
      split.qd = quizDeleted;
      split.ed = examDeleted;
      putProgress_(cache, deleted, total, "clearing", split);
      lastCacheWrite = Date.now();
    }
  }

  return { deleted: deleted, failed: failed, lastError: lastError, classDeleted: classDeleted, quizDeleted: quizDeleted, examDeleted: examDeleted };
}

// Creates events in parallel batches. Each request bundles title/desc/location/
// color/reminders into a single insert — no follow-up setColor/addPopupReminder
// calls needed, which is where most of the old per-event cost came from.
// resources are ordered classes[0..classTotal) → quizzes[classTotal..classTotal+
// quizTotal) → exams[…] (see backgroundSyncLocked_) — each kind is created in that
// order and counted separately so the progress UI and result messages can be
// verified per kind.
function batchCreateEvents_(cal, resources, cache, classTotal, quizTotal) {
  var total = resources.length;
  var classEnd = classTotal;
  var quizEnd = classTotal + quizTotal;
  var split = { cd: 0, ct: classTotal, qd: 0, qt: quizTotal, ed: 0, et: total - quizEnd };
  putProgress_(cache, 0, total, "syncing", split);
  if (total === 0) return { created: 0, lastError: null, classCreated: 0, quizCreated: 0, examCreated: 0 };

  var url = calendarApiBase_(cal);
  var token = ScriptApp.getOAuthToken();
  var created = 0;
  var classCreated = 0;
  var quizCreated = 0;
  var examCreated = 0;
  var lastError = null;
  var lastCacheWrite = Date.now();

  for (var i = 0; i < resources.length; i += CALENDAR_API_BATCH_SIZE_) {
    // Bail out cleanly before the uncatchable 6-minute kill; created < total
    // triggers the existing partial-create machinery (retry on the next automatic run).
    if (Date.now() > EXECUTION_DEADLINE_MS_) {
      lastError = lastError || new Error("Ran out of execution time; remaining events are added on the next run.");
      break;
    }
    var batchResources = resources.slice(i, i + CALENDAR_API_BATCH_SIZE_);
    var requests = batchResources.map(function (resource) {
      return {
        url: url,
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(resource),
        muteHttpExceptions: true
      };
    });

    var responses = fetchAllWithRetry_(requests, "Failed to create calendar events");
    for (var j = 0; j < responses.length; j++) {
      var code = responses[j].getResponseCode();
      if (code >= 200 && code < 300) {
        created++;
        if (i + j < classEnd) classCreated++;
        else if (i + j < quizEnd) quizCreated++;
        else examCreated++;
      } else {
        lastError = new Error('HTTP ' + code + ': ' + responses[j].getContentText().substring(0, 200));
        console.error('Create failed (HTTP ' + code + '): ' + responses[j].getContentText().substring(0, 200));
      }
    }

    if (Date.now() - lastCacheWrite >= 5000 || i + CALENDAR_API_BATCH_SIZE_ >= resources.length) {
      split.cd = classCreated;
      split.qd = quizCreated;
      split.ed = examCreated;
      putProgress_(cache, created, total, "syncing", split);
      lastCacheWrite = Date.now();
    }
  }

  return { created: created, lastError: lastError, classCreated: classCreated, quizCreated: quizCreated, examCreated: examCreated };
}

// ---------------------------------------------------------
// FALLBACK PATH — used when Calendar API v3 isn't reachable
// (admin hasn't enabled it on the GCP project, UrlFetchApp quota
// exhausted, etc). Slower but uses only built-in CalendarApp,
// which goes through Apps Script's internal pathway and works
// without any GCP-side configuration.
// ---------------------------------------------------------

function getColorEnums_() {
  if (COLOR_ENUMS_ === null) {
    // Indices 0-7 align with COLOR_IDS_ (class cycle). RED is appended at index 8 and
    // is used only by quizzes (QUIZ_COLOR_SLOT_), matching QUIZ_COLOR_ID_ "11". BLUE
    // (Blueberry) at index 9 is used only by exams (EXAM_COLOR_SLOT_), matching
    // EXAM_COLOR_ID_ "9". GRAY (Graphite) at index 10 is used only by guest lectures
    // (GUEST_COLOR_SLOT_), matching GUEST_COLOR_ID_ "8".
    COLOR_ENUMS_ = [
      CalendarApp.EventColor.CYAN, CalendarApp.EventColor.GREEN, CalendarApp.EventColor.YELLOW,
      CalendarApp.EventColor.ORANGE, CalendarApp.EventColor.MAUVE, CalendarApp.EventColor.PALE_BLUE,
      CalendarApp.EventColor.PALE_GREEN, CalendarApp.EventColor.PALE_RED, CalendarApp.EventColor.RED,
      CalendarApp.EventColor.BLUE, CalendarApp.EventColor.GRAY
    ];
  }
  return COLOR_ENUMS_;
}

// Stable per-user course→colorId mapping. Colours used to be assigned by
// alphabetical index on every sync, so adding or dropping a single course
// reshuffled the colour of every alphabetically-later course — and because
// colorId is part of each event's diff signature, that recreated all their
// events. This keeps each course's colour fixed for the term: still-selected
// courses retain their stored colour, a newly-added course takes the colour
// currently used by the fewest courses (so the palette stays as distinct as
// possible past 8 courses), and dropped courses free their colour for reuse.
//
// On the very first run after deploy the stored map is empty, and because the
// "least-used" pick walks COLOR_IDS_ in order, the assignment for ≤8 courses is
// byte-identical to the old `index % length` scheme — so existing calendars see
// NO colour churn on rollout; divergence only begins once the user later edits
// their selection, which is exactly when we want stability.
//
//   persist=true  (sync path): the returned map is exactly the still-selected
//                              codes (dropped ones pruned), and it is saved.
//   persist=false (PDF path):  resolves colours for the given codes WITHOUT
//                              writing, so a read-only render never races a sync.
function resolveCourseColors_(sortedCodes, persist) {
  var props = PropertiesService.getUserProperties();
  var stored = {};
  try {
    var raw = JSON.parse(props.getProperty(COLOR_MAP_KEY_) || "{}");
    if (raw && typeof raw === "object") stored = raw;
  } catch (e) { stored = {}; }

  var result = {};
  // Keep the stored colour for any still-selected course (ignoring stale values
  // that are no longer valid class colours, e.g. an old quiz red).
  for (var i = 0; i < sortedCodes.length; i++) {
    var code = sortedCodes[i];
    if (stored[code] && COLOR_IDS_.indexOf(stored[code]) !== -1) {
      result[code] = stored[code];
    }
  }

  // Assign the least-used colour to each new course, in sorted order so both the
  // sync and PDF paths compute identical colours for the same code set.
  for (var j = 0; j < sortedCodes.length; j++) {
    var c = sortedCodes[j];
    if (result[c]) continue;
    var counts = {};
    for (var a = 0; a < COLOR_IDS_.length; a++) counts[COLOR_IDS_[a]] = 0;
    var assigned = Object.keys(result);
    for (var b = 0; b < assigned.length; b++) counts[result[assigned[b]]]++;
    var best = COLOR_IDS_[0], bestN = Infinity;
    for (var d = 0; d < COLOR_IDS_.length; d++) {
      if (counts[COLOR_IDS_[d]] < bestN) { bestN = counts[COLOR_IDS_[d]]; best = COLOR_IDS_[d]; }
    }
    result[c] = best;
  }

  if (persist) {
    try { props.setProperty(COLOR_MAP_KEY_, JSON.stringify(result)); } catch (e) { /* non-fatal */ }
  }
  return result;
}

function shouldTryCalendarApi_() {
  return CacheService.getUserCache().get(CAL_API_FLAG_KEY_) !== "no";
}

function markCalendarApiAvailable_() {
  CacheService.getUserCache().put(CAL_API_FLAG_KEY_, "yes", CAL_API_FLAG_TTL_YES_);
}

function markCalendarApiUnavailable_() {
  notePath_("apiUnavailable");
  CacheService.getUserCache().put(CAL_API_FLAG_KEY_, "no", CAL_API_FLAG_TTL_NO_);
}

// Recognises the specific failure modes that warrant falling back to CalendarApp.
// Transient errors (rate limits, network blips) should NOT match here — they're
// already handled by fetchAllWithRetry_ and the partial-sync mechanism.
function isCalendarApiUnavailableError_(error) {
  var msg = getErrorMessage_(error).toLowerCase();

  // GCP project hasn't enabled the Calendar API (persists until admin action).
  if (msg.indexOf("http 403") !== -1 && (
    msg.indexOf("not been used") !== -1 ||
    msg.indexOf("not been enabled") !== -1 ||
    msg.indexOf("is disabled") !== -1 ||
    msg.indexOf("access not configured") !== -1
  )) return true;
  if (msg.indexOf("service_disabled") !== -1) return true;

  // UrlFetchApp daily quota exhausted (persists until next day).
  if (msg.indexOf("service invoked too many times") !== -1) return true;

  return false;
}

function slowCalendarRetry_(fn, label) {
  for (var attempt = 1; attempt <= CALENDAR_WRITE_MAX_RETRIES_; attempt++) {
    try {
      return fn();
    } catch (e) {
      if (attempt >= CALENDAR_WRITE_MAX_RETRIES_) {
        throw new Error(label + " failed after " + CALENDAR_WRITE_MAX_RETRIES_ + " attempts: " + getErrorMessage_(e));
      }
      Utilities.sleep(CALENDAR_WRITE_BACKOFF_MS_ * attempt);
    }
  }
}

function slowListLegacyTimetableEvents_(cal) {
  var syncWindow = getSyncWindow_();
  var events = cal.getEvents(syncWindow.start, syncWindow.end);
  var codes = Object.keys(COURSE_INFO_).sort(function (a, b) { return b.length - a.length; });
  var codePattern = new RegExp("^(" + codes.map(escapeRegex_).join("|") + ")(?::\\s|\\s\\()");

  var filtered = [];
  for (var i = 0; i < events.length; i++) {
    var item = {
      summary: events[i].getTitle(),
      location: events[i].getLocation(),
      description: events[i].getDescription()
    };
    if (looksLikeTimetableEvent_(item, codePattern)) filtered.push(events[i]);
  }
  var plan = buildDeletePlan_(filtered, function (ev) { return ev.getTitle(); });
  return { events: plan.items, classTotal: plan.classTotal, quizTotal: plan.quizTotal, examTotal: plan.examTotal };
}

// `baseOffset` / `displayTotal` / `baseSplit` keep progress continuous when this
// runs as a fallback after a partial fast-path delete — without them the bar would
// reset from N/total back to 0/leftoversCount mid-operation. `plan` comes from the
// slow list functions: events ordered classes-first plus class/quiz totals.
function slowDeleteEvents_(plan, cache, baseOffset, displayTotal, baseSplit) {
  var events = plan.events;
  var count = events.length;
  var offset = baseOffset || 0;
  var totalForProgress = (displayTotal != null) ? displayTotal : count;
  var baseCd = baseSplit ? baseSplit.cd : 0;
  var baseQd = baseSplit ? baseSplit.qd : 0;
  var baseEd = baseSplit ? baseSplit.ed : 0;
  var split = {
    cd: baseCd,
    ct: baseSplit ? baseSplit.ct : plan.classTotal,
    qd: baseQd,
    qt: baseSplit ? baseSplit.qt : plan.quizTotal,
    ed: baseEd,
    et: baseSplit ? baseSplit.et : plan.examTotal
  };

  putProgress_(cache, offset, totalForProgress, "clearing", split);
  if (count === 0) return { deleted: 0, failed: 0, lastError: null, classDeleted: 0, quizDeleted: 0, examDeleted: 0 };

  var classEnd = plan.classTotal;
  var quizEnd = plan.classTotal + plan.quizTotal;
  var deleted = 0;
  var failed = 0;
  var classDeleted = 0;
  var quizDeleted = 0;
  var examDeleted = 0;
  var lastError = null;
  var lastCacheWrite = Date.now();

  for (var i = 0; i < events.length; i++) {
    // The slow path is the one that can realistically hit Apps Script's
    // uncatchable 6-minute kill (per-event API calls + retry sleeps). Bail out
    // cleanly instead; remaining events count as failed so callers abort/retry.
    if (Date.now() > EXECUTION_DEADLINE_MS_) {
      failed += events.length - i;
      lastError = new Error("Ran out of execution time; remaining deletions retry on the next run.");
      break;
    }
    var ev = events[i];
    try {
      slowCalendarRetry_(function () { ev.deleteEvent(); }, "delete event");
      deleted++;
      if (i < classEnd) classDeleted++;
      else if (i < quizEnd) quizDeleted++;
      else examDeleted++;
    } catch (e) {
      failed++;
      lastError = e;
      console.error("Delete failed (slow path): " + getErrorMessage_(e));
    }

    if (i % 5 === 0 || Date.now() - lastCacheWrite >= 5000 || i === events.length - 1) {
      split.cd = baseCd + classDeleted;
      split.qd = baseQd + quizDeleted;
      split.ed = baseEd + examDeleted;
      putProgress_(cache, offset + deleted, totalForProgress, "clearing", split);
      lastCacheWrite = Date.now();
    }
  }

  return { deleted: deleted, failed: failed, lastError: lastError, classDeleted: classDeleted, quizDeleted: quizDeleted, examDeleted: examDeleted };
}

// Tries the fast (parallel REST) delete path first, then falls back to the slow
// (CalendarApp) path on either (a) API-unavailable errors — same trigger as the
// existing fast→slow fallback elsewhere — or (b) partial failures from the fast
// path, which usually means we got 429-throttled. CalendarApp uses a different
// rate-limit pool, so the slow path typically clears what REST couldn't.
//
// fastListFn / slowListFn must use the same filter so the slow path finds exactly
// the leftover events the fast path failed to delete. Both lookups are re-done
// from the calendar; we never feed the slow path the failed-ID list directly
// because slowDeleteEvents_ operates on CalendarEvent objects, not IDs.
function deleteEventsWithFallback_(cal, cache, fastListFn, slowListFn) {
  var fastResult = null;
  if (shouldTryCalendarApi_()) {
    try {
      var fastPlan = fastListFn();
      markCalendarApiAvailable_();
      fastResult = batchDeleteEventIds_(cal, fastPlan, cache);
      notePath_("usedFastDelete");
    } catch (apiErr) {
      if (!isCalendarApiUnavailableError_(apiErr)) throw apiErr;
      markCalendarApiUnavailable_();
    }
  }

  if (fastResult === null) {
    notePath_("usedSlowDelete");
    return slowDeleteEvents_(slowListFn(), cache);
  }
  if (fastResult.failed === 0) return fastResult;

  // Fast path had partial failures (likely 429); fall back to slow path for leftovers.
  notePath_("usedSlowDelete");
  notePath_("deleteFallback");
  putProgressNote_(cache, "Retrying with alternate method…");
  var leftoverPlan = slowListFn();
  var slowResult = slowDeleteEvents_(
    leftoverPlan, cache,
    fastResult.deleted,
    fastResult.deleted + leftoverPlan.events.length,
    {
      cd: fastResult.classDeleted,
      ct: fastResult.classDeleted + leftoverPlan.classTotal,
      qd: fastResult.quizDeleted,
      qt: fastResult.quizDeleted + leftoverPlan.quizTotal,
      ed: fastResult.examDeleted,
      et: fastResult.examDeleted + leftoverPlan.examTotal
    }
  );
  // If slow caught everything, suppress the fast-path error — end state is clean.
  var combinedFailed = slowResult.failed;
  return {
    deleted: fastResult.deleted + slowResult.deleted,
    failed: combinedFailed,
    lastError: combinedFailed > 0 ? (slowResult.lastError || fastResult.lastError) : null,
    classDeleted: fastResult.classDeleted + slowResult.classDeleted,
    quizDeleted: fastResult.quizDeleted + slowResult.quizDeleted,
    examDeleted: fastResult.examDeleted + slowResult.examDeleted
  };
}

// Post-create verification: re-list the calendar and remove any surplus copies.
// A retried create (network throw, or a 429/5xx that was re-issued) can succeed
// server-side on BOTH attempts — calendar inserts aren't idempotent — and once
// the sync marks its revision as synced, every later automatic run short-circuits
// at "Already up to date" and would never diff the surplus away. One extra list
// request per creating run buys a guaranteed end state.
// Listing is best-effort (a transient list failure must not fail an otherwise
// complete sync). diff.toCreate from this pass is deliberately IGNORED: it can
// only mean listing lag, and creating from it could itself duplicate. A found-
// but-unremovable surplus throws, so the revision stays unsynced and the next
// automatic run retries the cleanup.
function verifySyncedCalendar_(cal, cache, prepared, classTotal, quizTotal) {
  putProgressNote_(cache, "Verifying your calendar…");
  var entries = null;
  if (shouldTryCalendarApi_()) {
    try {
      entries = listSyncedEventsDetailed_(cal);
      markCalendarApiAvailable_();
    } catch (listErr) {
      if (isCalendarApiUnavailableError_(listErr)) {
        markCalendarApiUnavailable_();
      } else {
        console.warn("Verification list failed; skipping verification: " + getErrorMessage_(listErr));
        clearProgressNote_(cache);
        return;
      }
    }
  }
  if (entries === null) {
    try {
      entries = slowListSyncedEventsDetailed_(cal);
    } catch (slowListErr) {
      console.warn("Verification list failed; skipping verification: " + getErrorMessage_(slowListErr));
      clearProgressNote_(cache);
      return;
    }
  }

  var diff = diffSyncedEvents_(entries, prepared, classTotal, quizTotal);
  if (diff.toCreate.length > 0) {
    console.warn("Verification: " + diff.toCreate.length + " event(s) not visible in the list yet (likely listing lag) — not re-creating.");
  }
  if (diff.obsoleteEntries.length === 0) {
    clearProgressNote_(cache);
    return;
  }

  console.warn("Verification: removing " + diff.obsoleteEntries.length + " surplus event(s) (duplicates from retried creates).");
  var delResult = deleteEventsWithFallback_(
    cal, cache,
    function () {
      var plan = buildDeletePlan_(diff.obsoleteEntries, function (en) { return en.summary; });
      return {
        ids: plan.items.map(function (en) { return en.id; }),
        classTotal: plan.classTotal,
        quizTotal: plan.quizTotal,
        examTotal: plan.examTotal
      };
    },
    function () {
      var freshDiff = diffSyncedEvents_(slowListSyncedEventsDetailed_(cal), prepared, classTotal, quizTotal);
      var plan = buildDeletePlan_(freshDiff.obsoleteEntries, function (en) { return en.summary; });
      return {
        events: plan.items.map(function (en) { return en.event; }),
        classTotal: plan.classTotal,
        quizTotal: plan.quizTotal,
        examTotal: plan.examTotal
      };
    }
  );
  clearProgressNote_(cache);
  if (delResult.failed > 0) {
    // Self-healing state (the revision stays unsynced, so the next automatic run
    // retries the cleanup) — phrase it with the "still finishing" marker the
    // client recognises, so it renders as a calm amber note, not a red error.
    throw new Error("Your calendar is still finishing — " + delResult.failed +
      " duplicate event(s) from a retried request couldn't be removed yet; they're " +
      "cleaned up automatically on the next run. There's nothing you need to do.");
  }
}

// Applies the user's popup-reminder preference to events the diff matched as
// unchanged. Reminders live OUTSIDE the content signature (see computeEventSig_),
// so a reminder-only preference change becomes N cheap in-place patches instead of
// deleting and recreating the whole calendar. Entries from the fast lister carry
// an id (patched via REST in fetchAll batches); entries from the slow lister carry
// a CalendarApp event (patched via removeAllReminders/addPopupReminder). 404/410
// mean the event vanished (user deleted it) — the next diff recreates it with the
// right reminder, so those aren't failures. Returns { failed } — the caller leaves
// tt_reminder_applied stale when failed > 0 so the next automatic run retries.
function applyReminderToMatched_(cal, cache, matchedEntries, reminderMinutes) {
  if (!matchedEntries || matchedEntries.length === 0) return { failed: 0 };
  putProgressNote_(cache, "Updating reminders…");
  var failed = 0;
  var restIds = [];
  var slowEvents = [];
  for (var i = 0; i < matchedEntries.length; i++) {
    if (matchedEntries[i].id) restIds.push(matchedEntries[i].id);
    else if (matchedEntries[i].event) slowEvents.push(matchedEntries[i].event);
  }

  if (restIds.length > 0) {
    if (shouldTryCalendarApi_()) {
      var url = calendarApiBase_(cal) + '/';
      var token = ScriptApp.getOAuthToken();
      var payload = JSON.stringify({
        reminders: reminderMinutes != null
          ? { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] }
          : { useDefault: false, overrides: [] }
      });
      for (var b = 0; b < restIds.length; b += CALENDAR_API_BATCH_SIZE_) {
        // Bail out cleanly before the uncatchable 6-minute kill; the stale
        // tt_reminder_applied makes the next automatic run finish the rest.
        if (Date.now() > EXECUTION_DEADLINE_MS_) { failed += restIds.length - b; break; }
        var batchIds = restIds.slice(b, b + CALENDAR_API_BATCH_SIZE_);
        var requests = batchIds.map(function (id) {
          return {
            url: url + encodeURIComponent(id),
            method: 'patch',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + token },
            payload: payload,
            muteHttpExceptions: true
          };
        });
        var responses;
        try {
          responses = fetchAllWithRetry_(requests, "Failed to update reminders");
        } catch (patchErr) {
          if (isCalendarApiUnavailableError_(patchErr)) markCalendarApiUnavailable_();
          console.warn("Reminder patch batch failed: " + getErrorMessage_(patchErr));
          failed += restIds.length - b; // remaining ids retry on the next run
          break;
        }
        for (var j = 0; j < responses.length; j++) {
          var code = responses[j].getResponseCode();
          if (!((code >= 200 && code < 300) || code === 404 || code === 410)) {
            failed++;
            console.error("Reminder patch failed (HTTP " + code + "): " +
              responses[j].getContentText().substring(0, 200));
          }
        }
      }
    } else {
      // REST is flagged unavailable and these entries have no CalendarApp object
      // to fall back to — count them pending; the next run re-lists and retries.
      failed += restIds.length;
    }
  }

  for (var s = 0; s < slowEvents.length; s++) {
    if (Date.now() > EXECUTION_DEADLINE_MS_) { failed += slowEvents.length - s; break; }
    var ev = slowEvents[s];
    try {
      slowCalendarRetry_(function () {
        ev.removeAllReminders();
        if (reminderMinutes != null) ev.addPopupReminder(reminderMinutes);
      }, "update reminder");
    } catch (slowErr) {
      failed++;
      console.error("Reminder update failed (slow path): " + getErrorMessage_(slowErr));
    }
  }

  clearProgressNote_(cache);
  return { failed: failed };
}

// ---------------------------------------------------------
// TERM-END CROSS-OUT
// ---------------------------------------------------------
// When the admin runs "End term", each user's next background run crosses out
// every synced event title (a U+0336 combining long-stroke after each character —
// Google Calendar has no native strikethrough) so their calendar reads as a closed
// historical record. Titles ONLY: the stored [TT_SIG] lives in the description, so
// a later "Reopen term" heals titles back by stripping the strokes without ever
// confusing the diff. Reuses the fast REST list/patch machinery with the
// CalendarApp fallback, mirroring applyReminderToMatched_.

var STRIKE_MARK_ = '\u0336'; // combining long stroke overlay
// Give up on a persistently failing cross-out after this many trigger runs, so a
// broken calendar can never keep a dead-term trigger firing forever.
var TERM_END_STRIKE_MAX_ATTEMPTS_ = 5;

// "PM-F: Lecture" → "P̶M̶-̶F̶:̶ ̶L̶e̶c̶t̶u̶r̶e̶". Idempotent: a title that already
// carries a stroke is returned unchanged. Surrogate halves (emoji like 📕/📝) and
// existing combining marks are left unstroked — a stroke inside a surrogate pair
// corrupts the glyph on some renderers, and the struck letters around it already
// produce the continuous line.
function strikeTitle_(title) {
  if (!title || title.indexOf(STRIKE_MARK_) !== -1) return title;
  var out = '';
  for (var i = 0; i < title.length; i++) {
    var code = title.charCodeAt(i);
    out += title.charAt(i);
    if (code >= 0xD800 && code <= 0xDFFF) continue; // surrogate half (emoji)
    if (code >= 0x0300 && code <= 0x036F) continue; // combining mark
    out += STRIKE_MARK_;
  }
  return out;
}

// Exact inverse of strikeTitle_ (only the stroke chars are removed, so the
// original title — emoji, ✅ stamps and all — is restored byte-for-byte).
function unstrikeTitle_(title) {
  if (!title || title.indexOf(STRIKE_MARK_) === -1) return title;
  return title.split(STRIKE_MARK_).join('');
}

// Rewrites the title of every synced (APP_TAG) event that `transform` changes —
// strikeTitle_ on End term, unstrikeTitle_ on Reopen. Both transforms are
// idempotent, so a partially-failed pass is safely re-run from scratch on the next
// trigger run. 404/410 mean the event vanished (user deleted it) — not a failure.
// Returns { failed, patched }; callers only advance their state when failed === 0.
// `window` is forwarded to the listers; omit it for the current term. The term
// handover passes the PREVIOUS term's window, because that calendar's events lie
// outside this one's (see listSyncedEventsDetailed_).
function patchSyncedEventTitles_(cal, transform, window) {
  var entries = null;
  if (shouldTryCalendarApi_()) {
    try {
      entries = listSyncedEventsDetailed_(cal, window);
    } catch (listErr) {
      if (isCalendarApiUnavailableError_(listErr)) markCalendarApiUnavailable_();
      console.warn("Title-patch fast list failed; falling back to CalendarApp: " + getErrorMessage_(listErr));
    }
  }
  if (!entries) {
    try {
      entries = slowListSyncedEventsDetailed_(cal, window);
    } catch (slowListErr) {
      console.error("Title-patch slow list failed: " + getErrorMessage_(slowListErr));
      return { failed: 1, patched: 0 };
    }
  }

  var restWork = [];
  var slowWork = [];
  for (var i = 0; i < entries.length; i++) {
    var oldTitle = entries[i].summary || "";
    var newTitle = transform(oldTitle);
    if (newTitle === oldTitle) continue;
    if (entries[i].id) restWork.push({ id: entries[i].id, title: newTitle });
    else if (entries[i].event) slowWork.push({ event: entries[i].event, title: newTitle });
  }

  var failed = 0;
  var patched = 0;

  if (restWork.length > 0) {
    if (shouldTryCalendarApi_()) {
      var url = calendarApiBase_(cal) + '/';
      var token = ScriptApp.getOAuthToken();
      for (var b = 0; b < restWork.length; b += CALENDAR_API_BATCH_SIZE_) {
        // Bail out cleanly before the uncatchable 6-minute kill; the leftover
        // count reports as failed so the caller's next run finishes the rest.
        if (Date.now() > EXECUTION_DEADLINE_MS_) { failed += restWork.length - b; break; }
        var batch = restWork.slice(b, b + CALENDAR_API_BATCH_SIZE_);
        var requests = batch.map(function (w) {
          return {
            url: url + encodeURIComponent(w.id),
            method: 'patch',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + token },
            payload: JSON.stringify({ summary: w.title }),
            muteHttpExceptions: true
          };
        });
        var responses;
        try {
          responses = fetchAllWithRetry_(requests, "Failed to update event titles");
        } catch (patchErr) {
          if (isCalendarApiUnavailableError_(patchErr)) markCalendarApiUnavailable_();
          console.warn("Title patch batch failed: " + getErrorMessage_(patchErr));
          failed += restWork.length - b; // remaining ids retry on the next run
          break;
        }
        for (var j = 0; j < responses.length; j++) {
          var code = responses[j].getResponseCode();
          if ((code >= 200 && code < 300) || code === 404 || code === 410) {
            patched++;
          } else {
            failed++;
            console.error("Title patch failed (HTTP " + code + "): " +
              responses[j].getContentText().substring(0, 200));
          }
        }
      }
    } else {
      // REST is flagged unavailable and these entries carry no CalendarApp
      // object to fall back to — count them pending; the next run re-lists.
      failed += restWork.length;
    }
  }

  for (var s = 0; s < slowWork.length; s++) {
    if (Date.now() > EXECUTION_DEADLINE_MS_) { failed += slowWork.length - s; break; }
    var w = slowWork[s];
    try {
      slowCalendarRetry_(function () { w.event.setTitle(w.title); }, "update event title");
      patched++;
    } catch (slowErr) {
      failed++;
      console.error("Title update failed (slow path): " + getErrorMessage_(slowErr));
    }
  }

  return { failed: failed, patched: patched };
}

// prepared[0..classTotal) classes → [..+quizTotal) quizzes → exams — same
// split-tracking contract as batchCreateEvents_.
function slowCreateEvents_(cal, prepared, cache, classTotal, quizTotal) {
  var total = prepared.length;
  var classEnd = classTotal;
  var quizEnd = classTotal + quizTotal;
  var split = { cd: 0, ct: classTotal, qd: 0, qt: quizTotal, ed: 0, et: total - quizEnd };
  putProgress_(cache, 0, total, "syncing", split);
  if (total === 0) return { created: 0, lastError: null, classCreated: 0, quizCreated: 0, examCreated: 0 };

  var created = 0;
  var classCreated = 0;
  var quizCreated = 0;
  var examCreated = 0;
  var lastError = null;
  var lastCacheWrite = Date.now();

  for (var i = 0; i < prepared.length; i++) {
    // See slowDeleteEvents_: bail out cleanly before the uncatchable 6-minute
    // kill; created < total triggers the existing partial-create retry.
    if (Date.now() > EXECUTION_DEADLINE_MS_) {
      lastError = lastError || new Error("Ran out of execution time; remaining events are added on the next run.");
      break;
    }
    var p = prepared[i];
    var event;
    try {
      event = slowCalendarRetry_(function () {
        return cal.createEvent(p.title, p.startTime, p.endTime, {
          description: p.description,
          location: p.location
        });
      }, "create event");
    } catch (e) {
      lastError = e;
      continue;
    }
    created++;
    if (i < classEnd) classCreated++;
    else if (i < quizEnd) quizCreated++;
    else examCreated++;

    try {
      event.setColor(getColorEnums_()[p.colorSlot]);
      // Clear any default reminders the new event inherited from the calendar so the
      // slow path matches the fast path (useDefault:false): at most one popup, no dupes.
      event.removeAllReminders();
      if (p.reminderMinutes != null) {
        event.addPopupReminder(p.reminderMinutes);
      }
    } catch (metaError) {
      console.error("Event metadata update failed: " + getErrorMessage_(metaError));
    }

    if (Date.now() - lastCacheWrite >= 5000 || i === prepared.length - 1) {
      split.cd = classCreated;
      split.qd = quizCreated;
      split.ed = examCreated;
      putProgress_(cache, created, total, "syncing", split);
      lastCacheWrite = Date.now();
    }
  }

  return { created: created, lastError: lastError, classCreated: classCreated, quizCreated: quizCreated, examCreated: examCreated };
}

// Converts a prepared-event record into a Calendar v3 Event resource for the fast path.
function buildEventResource_(prepared) {
  var resource = {
    summary: prepared.title,
    location: prepared.location,
    description: prepared.description,
    start: { dateTime: prepared.startTime.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: prepared.endTime.toISOString(), timeZone: "Asia/Kolkata" },
    colorId: prepared.colorId
  };
  if (prepared.reminderMinutes != null) {
    resource.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: prepared.reminderMinutes }] };
  } else {
    resource.reminders = { useDefault: false, overrides: [] };
  }
  return resource;
}

// Read a user property that holds a JSON array, tolerating anything unparseable.
// Used for the health payload's diagnostic lists, where a corrupt value must
// degrade to "nothing to report" rather than sinking the whole dashboard.
function jsonArrayProp_(store, key) {
  try {
    var raw = store.getProperty(key);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// `light` (optional) trims the payload for the client's periodic 5-minute poll:
// the static-per-deploy blocks (courseEval, specialRoles) and the shared-sheet
// lookups (subjectReps, marksStatus, reportsLatestAt) are skipped — the client already holds them
// from the initial load and its applyHealth keeps prior values when a field is
// absent. Full-load paths (bootstrap, pull-to-refresh, post-sync refresh) omit
// the flag and get everything, as do old cached clients.
function getSyncHealth(light) {
  light = light === true;
  var script = PropertiesService.getScriptProperties();
  var user = PropertiesService.getUserProperties();

  var masterRev = Number(script.getProperty('master_data_revision') || '0');
  var lastRev = Number(user.getProperty('tt_last_synced_revision') || '0');
  var savedSelections = user.getProperty('tt_selections');

  var selections = [];
  if (savedSelections) {
    try {
      selections = JSON.parse(savedSelections);
      if (!Array.isArray(selections)) selections = [];
    } catch (e) {
      selections = [];
    }
  }

  var isActive = selections.length > 0;

  // Sit-in courses are reported as selected, so the picker ticks the course and the
  // subject-reps modal lists its rep — the same list the sync is about to act on.
  // Read AFTER isActive: auto-select extends an existing selection, it never creates
  // one, so a student who has not enabled still reads as off. No-op for everyone else.
  if (isActive) selections = withAuditedSelections_(selections);

  var status = "off";
  if (isActive) {
    if (lastRev < masterRev || masterRev === 0) {
      status = "pending";
    } else if (lastRev === masterRev && masterRev > 0) {
      status = "ok";
    } else {
      status = "pending";
    }
  }

  // Does this user still have a live backgroundSync trigger? `isActive` above is
  // derived purely from saved selections, so an account whose trigger went missing
  // — a createSyncTrigger_ that threw, or Google dropping triggers when an
  // authorization lapses — would otherwise be shown a healthy "up to date"
  // dashboard while nothing updated, permanently: ensureSyncTrigger_ is the only
  // thing that rebuilds one and it runs solely from inside a background run.
  // null (never false) whenever the question can't be answered — light poll, term
  // ended, pilot hold, or the lookup threw — so the client only ever offers the
  // repair card on an explicit false, never on a guess or a missing field.
  //
  // Costs no new consent: script.scriptapp is already in appsscript.json (the
  // trigger calls need it), and the probe is gated on isActive, so it only ever
  // runs for accounts that have been through enableAutoSync already. Skipped on
  // light polls because it is a real round trip, not a property read.
  var triggerOk = null;
  if (!light && isActive && !script.getProperty('term_ended_at') && isPilotUser_()) {
    // A background run in the last interval (+15 min slack) proves the trigger is
    // there, so the lookup below is only paid when it hasn't fired recently. Every
    // path that deletes this user's trigger also clears their selections or ends the
    // term, both of which skip this block, so the proof can't outlive the trigger;
    // a trigger Google drops simply stops refreshing it and is caught one probe later.
    var seen = null;
    try { seen = CacheService.getUserCache().get(TRIGGER_SEEN_KEY_); } catch (seenErr) { seen = null; }
    if (seen) {
      triggerOk = true;
    } else {
      try {
        var myTriggers = ScriptApp.getProjectTriggers();
        triggerOk = false;
        for (var ti = 0; ti < myTriggers.length; ti++) {
          if (myTriggers[ti].getHandlerFunction() === 'backgroundSync') { triggerOk = true; break; }
        }
      } catch (trgErr) {
        triggerOk = null;
      }
    }
  }

  var email = Session.getActiveUser().getEmail() || "Unknown";
  var student = lookupStudentByEmail_(email);
  var logViewer = canViewLogs_(email);

  // Live Subject Representatives roster (institute sheet) for the hero badge,
  // the "subject reps" modal and the PDF. null on any failure (or a light poll)
  // → the client keeps its current list. Double-guarded so a slow sheet never
  // fails health.
  var subjectReps = null;
  if (!light) {
    try { subjectReps = getSubjectReps_(); } catch (srErr) { subjectReps = null; }
  }

  // OLT marks-upload status (Result Receipt Record) for the Evaluation popup's
  // ✅/⏳ badges. null on any failure (or a light poll) → the client keeps its
  // current copy / hides the badges.
  var marksStatus = null;
  if (!light) {
    try { marksStatus = getMarksStatusMap_(); } catch (msErr) { marksStatus = null; }
  }

  // Institute-driven changes recorded by background syncs (see recordTimetableChanges_).
  // Only meaningful for active users; first-timers have no log by design.
  var recentChanges = [];
  if (isActive) {
    try {
      recentChanges = JSON.parse(user.getProperty(CHANGE_LOG_KEY_) || "[]");
      if (!Array.isArray(recentChanges)) recentChanges = [];
    } catch (clParseErr) {
      recentChanges = [];
    }
  }

  return {
    email: email,
    name: student ? student.name : "",
    // Drives the creator-only "Force fetch now" button on the web page (see
    // forceFetchNow / forceAdminFetch). Computed server-side from the
    // authenticated roll so the button can't be revealed by anyone else.
    isCreator: !!(student && student.rollNo === CREATOR_ROLL_),
    // Whether this viewer may open the admin dashboard (usage log, change log).
    // Derived from the same USAGE_LOG_VIEWERS_ gate the server enforces on
    // getUsageLog/getChangeLog, so the UI can never offer something the server will
    // then refuse — and, just as important, the flag being true is NOT what grants
    // access: both endpoints re-check the caller independently.
    isLogViewer: logViewer,
    // Newest "wrong entry" report, for the admin panel's unseen-report flag. Log
    // viewers only, and full loads only: it reads a sheet cell.
    reportsLatestAt: (logViewer && !light) ? latestReportAt_() : null,
    // Save-vs-deploy check for the creator (see BUILD_ID_). `deployed` is the build
    // answering THIS call — the deployed web-app version; `saved` is the build the
    // last scheduled fetch ran — the saved code every trigger runs.
    build: (student && student.rollNo === CREATOR_ROLL_) ? {
      deployed: BUILD_ID_,
      saved: script.getProperty('saved_build_id') || "",
      savedSeenAt: script.getProperty('saved_build_seen_at') || ""
    } : null,
    recentChanges: recentChanges,
    // Live roster (or null → client falls back to its built-in SUBJECT_REPS_).
    subjectReps: subjectReps,
    // Canonical SAC roster (badge label/cls/pdf), so the client renders hero
    // badges from the single server-side source instead of a duplicated copy.
    // Static per deploy — omitted from light polls (client keeps its copy).
    specialRoles: light ? null : SAC_ROLES_,
    // Per-course evaluation schemes (component/weight), single source of truth in
    // COURSE_EVAL_. The client renders the "📊 Evaluation" popup from this; events
    // are tagged server-side from the same map. Static per deploy — omitted from
    // light polls (client keeps its copy).
    courseEval: light ? null : COURSE_EVAL_,
    // Who runs the tool, footer links, course outlines and the course-selection
    // mode — all from config.gs (see siteSettings_). Static per deploy — omitted
    // from light polls (client keeps its copy).
    site: light ? null : siteSettings_(),
    // { CODE: [{label, kind, num, secs, date}] } — which components' marks have
    // reached the OLT portal, per the institute's Result Receipt Record. The
    // Evaluation popup pairs these with courseEval's components for ✅/⏳ badges.
    marksStatus: marksStatus,
    term: {
      label: TERM_CONFIG_.label,
      batch: TERM_CONFIG_.batch,
      calendarName: TERM_CONFIG_.calendarName
    },
    institute: {
      lastCheckedAt: script.getProperty('last_fetch_at'),
      lastChangedAt: script.getProperty('last_fetch_changed_at'),
      hadChangesOnLastCheck: script.getProperty('last_fetch_had_changes') === 'true',
      // Per-table change tracking so the UI can show class-timetable, quiz-schedule,
      // mid-term and end-term updates separately (verification of sync accuracy).
      // Only the "last changed" stamps exist: the per-table last_fetch_*_changed
      // booleans this used to ship had no reader left once the client stopped
      // rendering them (the admin result message builds its own text from local
      // variables), so the fetch no longer writes them either.
      classLastChangedAt: script.getProperty('last_class_changed_at'),
      quizLastChangedAt: script.getProperty('last_quiz_changed_at'),
      examLastChangedAt: script.getProperty('last_exam_changed_at'),
      endTermLastChangedAt: script.getProperty('last_endterm_changed_at')
    },
    calendar: {
      autoSyncOn: isActive,
      // Whether a background trigger actually exists to act on autoSyncOn.
      // true / false / null — see the triggerOk probe above. Only false means
      // "broken"; null means "not checked on this poll, keep what you had".
      triggerOk: triggerOk,
      lastSyncedAt: user.getProperty('tt_last_synced_at'),
      status: status,
      // Stored by backgroundSyncLocked_ — lets the UI deep-link straight to
      // the synced calendar instead of the generic calendar.google.com.
      id: user.getProperty('tt_calendar_id') || ""
    },
    sync: {
      selections: selections,
      popupReminder: user.getProperty('tt_popup') || "",
      electivesOptOut: user.getProperty(ELECTIVES_OPTOUT_PROP_) === '1',
      // Courses this student is enrolled in that produced no class events, and
      // courses the auto-seed could not pin to a section. Surfaced so a short
      // calendar is always accompanied by a sentence saying which subject is
      // short and why — the thing whose absence made M&A's disappearance
      // invisible for a whole pilot run. Arrays, always present, usually empty.
      selectionMismatch: jsonArrayProp_(user, 'tt_selection_mismatch'),
      selectionClassless: jsonArrayProp_(user, 'tt_selection_classless'),
      seedUnresolved: jsonArrayProp_(user, 'tt_seed_unresolved'),
      // Per-student sit-in arrangement, or null for the ~270 students who have
      // none. { classesOnly: [CODE], allowOverlaps: bool } — the client uses
      // classesOnly to keep an audited course's quizzes/exams out of the picker's
      // "+N quizzes / +N exams" preview (the sync already leaves them out), and
      // allowOverlaps to let this student hold two courses that meet at the same
      // hour. null is the shape every other student gets, and every reader below
      // treats it as "behave exactly as before". See COURSE_AUDIT_.
      audit: (function () {
        var rule = auditRuleForUser_();
        var codes = Object.keys(rule.classesOnly);
        if (!codes.length && !rule.allowOverlaps) return null;
        return { classesOnly: codes, allowOverlaps: rule.allowOverlaps };
      })(),
      // { added, removed } when the institute's enrolment list has moved away from
      // what this student is syncing — add/drop, most likely. Reported only; the
      // student decides whether to take it (see checkElectiveDrift_).
      electivesDrift: (function () {
        try {
          var raw = user.getProperty(ELECTIVES_DRIFT_PROP_);
          if (!raw) return null;
          var d = JSON.parse(raw);
          return (d && (d.added || d.removed)) ? d : null;
        } catch (e) { return null; }
      })()
    },
    termEndedAt: script.getProperty('term_ended_at'),
    // Pilot state, so a held-back student is told plainly instead of meeting the
    // hold message only after clicking Enable. `held` is what the UI keys on:
    // during a pilot the testers themselves must see the normal tool, or the
    // pilot would not be testing the thing that ships.
    pilot: { on: pilotModeOn_(), held: !isPilotUser_() }
  };
}

// Single load-time round trip. google.script.run calls are serialized per client,
// so the four independent on-load calls (health, course data, auth probe, in-flight
// progress) used to queue back-to-back — four latencies stacked. This bundles them
// into one execution. Each piece is isolated in its own try/catch so a failure in
// one never sinks the others: on a thrown sub-call the field is left null and an
// *Error flag is set, and the client falls back to that piece's own standalone RPC
// (which keeps its existing retry behaviour). getAuthStatus/getSyncProgress already
// never throw, but are wrapped here too for symmetry. Returns plain data only — the
// callers (refreshSyncHealth / loadCourseData / checkAuthorization /
// resumeActiveSyncProgress) are unchanged and still usable on their own.
function bootstrap() {
  var out = {
    health: null, courseData: null, auth: null, progress: null,
    healthError: false, courseDataError: false
  };
  try { out.health = getSyncHealth(); } catch (e) { out.healthError = true; console.warn("bootstrap getSyncHealth failed: " + getErrorMessage_(e)); }
  try { out.courseData = getCourseData(); } catch (e) { out.courseDataError = true; console.warn("bootstrap getCourseData failed: " + getErrorMessage_(e)); }
  try { out.auth = getAuthStatus(); } catch (e) { out.auth = null; }
  try { out.progress = getSyncProgress(); } catch (e) { out.progress = null; }
  return out;
}

// Data for the client-side "Download PDF" feature. Returns everything the calendar
// gets — classes from MasterData, plus quizzes, exams and guest lectures from their
// own sheets — so the offline PDF and the synced calendar can never disagree about
// what a student's week looks like. Course colours come from the same persisted
// per-user map the sync writes (resolveCourseColors_, read here without writing), so
// the PDF colours always match what the user sees in Google Calendar.
function getPrintableTimetable() {
  if (!FEATURES_.pdfDownload) return { ok: false, reason: "off" };
  var props = PropertiesService.getUserProperties();
  var saved = props.getProperty('tt_selections');
  var selections = [];
  if (saved) {
    try {
      selections = JSON.parse(saved);
      if (!Array.isArray(selections)) selections = [];
    } catch (e) {
      selections = [];
    }
  }
  if (selections.length === 0) return { ok: false, reason: "not_enabled" };

  // Same sit-in courses the sync adds, so the printout carries the same courses as
  // the calendar. See COURSE_AUDIT_.
  selections = withAuditedSelections_(selections);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  if (!sheet) return { ok: false, reason: "no_data" };
  var data = sheet.getDataRange().getValues();

  var selectionSet = {};
  for (var s = 0; s < selections.length; s++) selectionSet[selections[s]] = true;

  var tz = Session.getScriptTimeZone();
  var events = [];
  var distinctCodes = {};
  // selectedCodes mirrors the sync builder's shape ({ CODE: { SECTION: true } })
  // so the quiz block below can reuse appendQuizEvents_'s exact matching rules.
  var selectedCodes = {};
  for (var i = 1; i < data.length; i++) {
    var code = data[i][3] ? data[i][3].toString().trim() : "";
    var section = data[i][4] ? data[i][4].toString().trim() : "";
    var sheetKey = section ? (code + "-" + section) : code;
    if (!selectionSet[sheetKey]) continue;
    var codeUC = code.toUpperCase();
    if (!selectedCodes[codeUC]) selectedCodes[codeUC] = {};
    if (section) selectedCodes[codeUC][section.toUpperCase()] = true;
    var dateObj = parseSheetDate_(data[i][0]);
    if (!dateObj || !isWithinSyncWindow_(dateObj)) continue;
    var sParse, eParse;
    try {
      sParse = parseTime_(data[i][1]);
      eParse = parseTime_(data[i][2]);
    } catch (timeErr) {
      continue; // same skip rule as the sync builder
    }
    if (!isValidTimeRange_(sParse, eParse)) continue; // same skip rule as the sync builder
    var info = COURSE_INFO_[code];
    distinctCodes[code] = true;
    events.push({
      d: Utilities.formatDate(dateObj, tz, "yyyy-MM-dd"),
      s: (sParse.h * 60) + sParse.m,
      e: (eParse.h * 60) + eParse.m,
      code: code,
      name: (info && info.name) || (data[i][5] ? data[i][5].toString().trim() : code),
      sec: section,
      instructor: data[i][6] ? data[i][6].toString().trim() : "",
      room: data[i][7] ? data[i][7].toString().trim() : ""
    });
  }
  // (Don't bail on zero classes yet — late in the term a student may have only
  // quizzes or exams left to attend; the emptiness check runs after both are added.)

  // Same enrollment guarantee as the sync (see backgroundSyncLocked_): resolve the
  // saved selections against the catalogue directly, so a course whose class rows
  // vanished from MasterData still contributes its quizzes/exams to the PDF.
  for (var sv = 0; sv < selections.length; sv++) {
    var resolvedSel = resolveSelectionCode_(selections[sv]);
    if (!resolvedSel) continue;
    var resolvedUC = resolvedSel.code.toUpperCase();
    if (!selectedCodes[resolvedUC]) selectedCodes[resolvedUC] = {};
    if (resolvedSel.section) selectedCodes[resolvedUC][resolvedSel.section.toUpperCase()] = true;
  }

  // Audited (sit-in) courses contribute their classes and guest lectures to the
  // PDF and none of their assessment — the same trim backgroundSyncLocked_ makes,
  // applied here so the printout and the calendar can never disagree about what
  // this student sits. Identical object for everyone else. See COURSE_AUDIT_.
  var pdfAssessmentCodes = withoutAuditedCodes_(selectedCodes, auditRuleForUser_().classesOnly);

  // Quiz events for the enrolled courses — same matching/skip rules as
  // appendQuizEvents_ (including the section-less dedupe of per-section copies),
  // marked isQuiz so the PDF can style them distinctly.
  var quizRows = getQuizData_();
  var pdfQuizSeen = {};
  for (var q = 0; q < quizRows.length; q++) {
    var qRow = quizRows[q];
    var qCode = qRow[3] ? qRow[3].toString().trim().toUpperCase() : "";
    var enrolledSections = pdfAssessmentCodes[qCode];
    if (!qCode || !enrolledSections) continue;
    var quizSection = qRow[4] ? qRow[4].toString().trim().toUpperCase() : "";
    if (quizSection && Object.keys(enrolledSections).length > 0 && !enrolledSections[quizSection]) continue;
    var qDate = parseSheetDate_(qRow[0]);
    if (!qDate || !isWithinSyncWindow_(qDate)) continue;
    var qs, qe;
    try {
      qs = parseTime_(qRow[1]);
      qe = parseTime_(qRow[2]);
    } catch (qTimeErr) {
      continue;
    }
    if (!isValidTimeRange_(qs, qe)) continue;
    if (Object.keys(enrolledSections).length === 0) {
      var qSlotKey = qCode + "|" + Utilities.formatDate(qDate, tz, "yyyy-MM-dd") +
        "|" + ((qs.h * 60) + qs.m) + "|" + ((qe.h * 60) + qe.m);
      if (pdfQuizSeen[qSlotKey]) continue;
      pdfQuizSeen[qSlotKey] = true;
    }
    var qInfo = COURSE_INFO_[qCode];
    // A quiz/exam-only course (no class rows left) still belongs in the legend
    // and the course-breakdown page.
    distinctCodes[qCode] = true;
    events.push({
      d: Utilities.formatDate(qDate, tz, "yyyy-MM-dd"),
      s: (qs.h * 60) + qs.m,
      e: (qe.h * 60) + qe.m,
      code: qCode,
      name: (qInfo && qInfo.name) || (qRow[5] ? qRow[5].toString().trim() : qCode),
      sec: quizSection,
      instructor: qRow[6] ? qRow[6].toString().trim() : "",
      room: qRow[7] ? qRow[7].toString().trim() : "",
      isQuiz: true,
      qn: qRow[8] ? qRow[8].toString().trim() : "",
      dur: qRow[9] ? qRow[9].toString().trim() : "",
      colorId: QUIZ_COLOR_ID_
    });
  }

  // Exam events for the enrolled courses — matched by course code (exams have no
  // section), marked isExam so the PDF styles them as the standout blue exam cards.
  // Mirrors appendExamEvents_'s skip rules (and its combined mid-term + end-term
  // source) so the PDF matches the calendar.
  var examRowsPdf = getAllExamRows_();
  for (var x = 0; x < examRowsPdf.length; x++) {
    var xRow = examRowsPdf[x];
    var xCode = xRow[3] ? xRow[3].toString().trim().toUpperCase() : "";
    if (!xCode || !pdfAssessmentCodes[xCode]) continue;
    var xDate = parseSheetDate_(xRow[0]);
    if (!xDate || !isWithinSyncWindow_(xDate)) continue;
    var xs, xe;
    try {
      xs = parseTime_(xRow[1]);
      xe = parseTime_(xRow[2]);
    } catch (xTimeErr) {
      continue;
    }
    if (!isValidTimeRange_(xs, xe)) continue;
    var xInfo = COURSE_INFO_[xCode];
    distinctCodes[xCode] = true; // exam-only course — keep it in the legend/breakdown
    events.push({
      d: Utilities.formatDate(xDate, tz, "yyyy-MM-dd"),
      s: (xs.h * 60) + xs.m,
      e: (xe.h * 60) + xe.m,
      code: xCode,
      name: (xInfo && xInfo.name) || (xRow[5] ? xRow[5].toString().trim() : xCode),
      sec: "",
      instructor: xRow[6] ? xRow[6].toString().trim() : "",
      room: xRow[7] ? xRow[7].toString().trim() : "",
      isExam: true,
      etype: xRow[9] ? xRow[9].toString().trim() : "",
      examLabel: examTermLabel_(xCode, (xInfo && xInfo.credits) || 0, xRow[9] ? xRow[9].toString().trim() : "", xDate, xRow[EXAM_KIND_COL_]),
      colorId: EXAM_COLOR_ID_
    });
  }

  // Guest lectures for the enrolled courses — same matching as appendGuestEvents_,
  // including the section rule, so the PDF shows exactly the sessions the calendar
  // does. Without this the PDF would quietly omit them and a student planning from
  // the printout would miss a session that IS on their calendar.
  var guestRowsPdf = getGuestRows_();
  for (var g = 0; g < guestRowsPdf.length; g++) {
    var gRow = guestRowsPdf[g];
    var gCode = gRow[3] ? gRow[3].toString().trim().toUpperCase() : "";
    var gSections = selectedCodes[gCode];
    if (!gCode || !gSections) continue;
    var gSection = gRow[4] ? gRow[4].toString().trim().toUpperCase() : "";
    if (gSection && Object.keys(gSections).length > 0 && !gSections[gSection]) continue;
    var gDate = parseSheetDate_(gRow[0]);
    if (!gDate || !isWithinSyncWindow_(gDate)) continue;
    var gs, ge;
    try {
      gs = parseTime_(gRow[1]);
      ge = parseTime_(gRow[2]);
    } catch (gTimeErr) {
      continue;
    }
    if (!isValidTimeRange_(gs, ge)) continue;
    var gInfo = COURSE_INFO_[gCode];
    distinctCodes[gCode] = true;
    var gDay = Utilities.formatDate(gDate, tz, "yyyy-MM-dd");
    var gStartMin = (gs.h * 60) + gs.m;
    var gEndMin = (ge.h * 60) + ge.m;
    // Replace the timetabled class this guest lecture IS, exactly as
    // appendGuestEvents_ does for the calendar — the mirror marks the lecture on
    // the class row it replaces, so without this the PDF drew two cards stacked on
    // the same slot while the calendar showed one.
    var gReplace = -1;
    for (var ge2 = 0; ge2 < events.length; ge2++) {
      var cand = events[ge2];
      if (!cand.isQuiz && !cand.isExam && !cand.isGuest &&
          cand.code.toUpperCase() === gCode && cand.d === gDay &&
          cand.s === gStartMin && cand.e === gEndMin) { gReplace = ge2; break; }
    }
    var guestEvt = {
      d: gDay,
      s: gStartMin,
      e: gEndMin,
      code: gCode,
      name: (gInfo && gInfo.name) || gCode,
      sec: gSection,
      instructor: gRow[5] ? gRow[5].toString().trim() : "",
      // The GL layout carries no Classroom column, so the room is only knowable
      // from the class this replaces.
      room: gReplace !== -1 ? events[gReplace].room : "",
      isGuest: true,
      colorId: GUEST_COLOR_ID_
    };
    if (gReplace !== -1) events[gReplace] = guestEvt;
    else events.push(guestEvt);
  }

  if (events.length === 0) return { ok: false, reason: "no_classes" };

  // Use the SAME persisted colour map the calendar sync uses, so the PDF's
  // course colours match the events in Google Calendar. persist=false: a PDF
  // render must never write the map (it could race a concurrent sync).
  var sortedCodes = Object.keys(distinctCodes).sort();
  var colorByCode = resolveCourseColors_(sortedCodes, false);
  for (var ev = 0; ev < events.length; ev++) {
    // Quizzes, exams and guest lectures keep the fixed standout colours set above
    // (matching the calendar); only class events take the per-course palette colour.
    if (!events[ev].isQuiz && !events[ev].isExam && !events[ev].isGuest) {
      events[ev].colorId = colorByCode[events[ev].code];
    }
  }

  var email = Session.getActiveUser().getEmail() || "";
  var student = lookupStudentByEmail_(email);
  var courses = [];
  for (var k = 0; k < sortedCodes.length; k++) {
    var cInfo = COURSE_INFO_[sortedCodes[k]];
    courses.push({
      code: sortedCodes[k],
      name: (cInfo && cInfo.name) || sortedCodes[k],
      colorId: colorByCode[sortedCodes[k]]
    });
  }

  try { logUsage_("pdf"); } catch (logErr) {}

  return {
    ok: true,
    // No roster section here: second-year sections are per-course, not
    // permanent, so the PDF identifies the student by roll + email instead.
    student: {
      name: student ? student.name : "",
      roll: student ? student.rollNo : (email ? email.split("@")[0].toUpperCase() : ""),
      email: email
    },
    // academic = live exam/break dates from the institute calendar (getAcademic_
    // falls back to TERM_CONFIG_.academic per-field), so the PDF's exam-day
    // labels and "free time" insights never drift from the official calendar.
    term: { label: TERM_CONFIG_.label, batch: TERM_CONFIG_.batch, academic: getAcademic_() },
    events: events,
    courses: courses,
    // Live web-app URL so the PDF footer's "TermSync" link never goes stale
    // across redeployments.
    appUrl: (function () {
      try { return ScriptApp.getService().getUrl() || ""; } catch (urlErr) { return ""; }
    })()
  };
}

// ── Elective auto-fetch ───────────────────────────────────────────────────────

// Course names in the elective sheet don't match COURSE_INFO_ verbatim
// ("STORYTELLING WITH TABLEAU & POWER BI" vs "Storytelling with Tableau and
// PowerBI"), so both sides are reduced to a bare keyword string before
// matching: uppercase, "&" → AND, strip punctuation, drop AND/THE, join.
function normalizeCourseName_(name) {
  var tokens = String(name || "").toUpperCase().replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
  var kept = [];
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] && tokens[i] !== "AND" && tokens[i] !== "THE") kept.push(tokens[i]);
  }
  return kept.join("");
}

var COURSE_CODE_BY_NORM_ = null;
function getCourseCodeByNorm_() {
  if (COURSE_CODE_BY_NORM_) return COURSE_CODE_BY_NORM_;
  COURSE_CODE_BY_NORM_ = {};
  var codes = Object.keys(COURSE_INFO_);
  for (var i = 0; i < codes.length; i++) {
    COURSE_CODE_BY_NORM_[normalizeCourseName_(COURSE_INFO_[codes[i]].name)] = codes[i];
  }
  return COURSE_CODE_BY_NORM_;
}

function fetchElectivesCsv_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ELECTIVES_CACHE_KEY_);
  if (cached) return cached;
  var resp = UrlFetchApp.fetch(ELECTIVES_CSV_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error("Electives sheet returned HTTP " + resp.getResponseCode());
  }
  var text = resp.getContentText();
  if (!text || text.length < 100) throw new Error("Electives sheet came back empty");
  try { cache.put(ELECTIVES_CACHE_KEY_, text, ELECTIVES_CACHE_TTL_SECONDS_); } catch (cacheErr) {}
  return text;
}

// Undo the escaping Google applies when it writes a tab name into the JavaScript
// on the pubhtml page. "M\\x26A" is the real one that mattered here (& → \\x26);
// \\uNNNN covers non-ASCII names and the trailing rule covers \\/ \\\\ \\" \\'.
// Ordered so the numeric forms are resolved before the generic backslash rule
// could eat their leading backslash.
function decodeJsStringEscapes_(s) {
  return String(s == null ? "" : s)
    // [xX] / [uU], not just lowercase: the escape survives an .toUpperCase() on the
    // way into a cache, and "M\\X26A" has to decode as readily as "M\\x26A" or the
    // normalised fallback below can never rescue it.
    .replace(/\\[xX]([0-9a-fA-F]{2})/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/\\[uU]([0-9a-fA-F]{4})/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/\\(.)/g, "$1")
    // Google serves the JS-escaped form today, but the same name would arrive
    // HTML-escaped if that block were ever emitted as markup instead. Both spell
    // the identical tab, and only one of them has to be wrong for a whole course
    // to vanish — so decode both rather than bet on which.
    .replace(/&#(\d+);/g, function (_m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// A tab name reduced to bare alphanumerics, for the last-resort lookup in
// getElectiveSectionMaps_. "M&A" and any mangling of it ("M\\X26A", "M&amp;A",
// "M & A") all collapse to "MA", so a course can still be found when an escaping
// this decoder has never seen slips through.
function normalizeTabKey_(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// The published document exposes its tab-name → gid mapping only on the
// pubhtml page (the publish token is not a spreadsheet ID we could open with
// SpreadsheetApp), so it's scraped from there once and cached for everyone.
function getElectivesTabGids_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ELECTIVES_GID_CACHE_KEY_);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      // Bumping the key retires today's poisoned entries; this stops the trap
      // being re-set tomorrow. A decoded tab name can never contain a backslash
      // or an HTML entity, so an entry that does was written by a build that did
      // not decode — re-read rather than trust it for the next six hours.
      var clean = true;
      for (var ck in parsed) {
        if (!parsed.hasOwnProperty(ck)) continue;
        if (ck.indexOf("\\") !== -1 || ck.indexOf("&") !== -1 && /&[A-Z]+;|&#/.test(ck)) { clean = false; break; }
      }
      if (clean) return parsed;
      console.warn("Elective tab cache held undecoded names — re-reading the tab list.");
    } catch (e) {}
  }
  var resp = UrlFetchApp.fetch(ELECTIVES_PUB_BASE_ + "pubhtml", { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error("Electives pubhtml returned HTTP " + resp.getResponseCode());
  }
  var html = resp.getContentText() || "";
  // Each tab appears as: items.push({name: "PM", pageUrl: "...&gid=944386673"
  //
  // The name arrives as JAVASCRIPT SOURCE, not as text. Google escapes anything
  // that would be unsafe inside that string literal, so the M&A tab is emitted as
  //     items.push({name: "M\x26A", ...})
  // Taken raw, that keyed the tab under "M\X26A" — a string no course code can
  // ever equal — so getElectiveSectionMaps_ never asked for the tab, every student
  // enrolled in M&A was reported as not enrolled in it, and the failure was
  // silent and permanent. Any tab name containing & < > \' " or a non-ASCII
  // character would have gone exactly the same way. Decode before indexing.
  var gids = {};
  var re = /items\.push\(\{name: "([^"]*)"[\s\S]*?gid=(\d+)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var decoded = decodeJsStringEscapes_(m[1]).trim().toUpperCase();
    if (decoded) gids[decoded] = m[2];
    // The raw, still-escaped name is deliberately NOT indexed alongside it. It was,
    // briefly — as a "resolves by whatever text the page carried" fallback — and it
    // wrote a backslash key into the very map the staleness check reads, so every
    // clean cache looked poisoned and the tab list was re-fetched on every single
    // call. getElectiveSectionMaps_'s normalised lookup covers the same ground
    // without putting a mangled key in the cache to trip over.
  }
  if (Object.keys(gids).length === 0) throw new Error("No tabs found in electives pubhtml");
  try { cache.put(ELECTIVES_GID_CACHE_KEY_, JSON.stringify(gids), ELECTIVES_GID_CACHE_TTL_SECONDS_); } catch (e) {}
  return gids;
}

// Roll No (col A) as it appears in the per-course tabs. Used to tell a real
// enrolment row from the header and from the side table's stray text: the tabs
// carry a second copy of the roll in col I and a header whose col A is sometimes
// blank (e.g. the CIS-T5 tab), so "not the literal string ROLL NO" is too weak a
// test to decide which rows count as enrolments.
//
// The optional trailing letter matches repeat students, who carry a suffix and an
// earlier batch year ("MBA24999R" sitting in the 25-27 batch's Term 5 courses).
// Requiring digits to the end silently dropped one such student from five courses.
var ELECTIVE_ROLL_PATTERN_ = /^(MBA|MBATM|MBATTHM|PHD)[0-9]{2}[0-9]+[A-Z]?$/;

// Every key a student might be looked up by. A repeat student's roll carries a
// trailing letter in the sheet ("MBA24999R") while their institute email is the
// plain form (mba24999@…) — and getMyElectives falls back to the email-derived
// roll for anyone absent from STUDENT_ROSTER_, which every repeat student is,
// since the roster is this batch only. Indexing both forms makes the lookup match
// whichever way the roll was arrived at.
function electiveRollKeys_(roll) {
  var keys = [roll];
  var digitsOnly = roll.replace(/[^0-9]+$/, "");
  if (digitsOnly && digitsOnly !== roll) keys.push(digitsOnly);
  return keys;
}

// Roll → section maps from the per-course tabs, for the requested course codes.
// Tab layout: a header row, then Roll No (col A), Name (B), Email (C) and, on
// courses that actually run more than one section, Section (D); a small side
// table lives in columns E+ and is ignored.
//
// Every enrolled roll is recorded, with "" for the section when the course runs a
// single section (Term 5 splits only MLBA, AMS and B2B). That matters because
// these tabs are now the ONLY record of who is enrolled — Term 4's student×course
// allotment matrix has no Term 5 equivalent — so dropping sectionless rows, as
// this did when a separate matrix carried enrolment, would empty most courses.
// Presence in the map means enrolled; the value is the section, if any.
//
// Parsed maps are cached per tab so one student's lookup serves everyone for
// 30 min.
//
// Returns { maps, missing, reason }. `missing` is the whole point: a tab that
// could not be read is NOT a course with no students, and the two used to be
// indistinguishable here — an unread tab simply left maps[code] undefined, which
// every caller then read as "this student is not enrolled". At batch scale that
// is the difference between a student's calendar being right and it quietly
// missing a subject, so callers must check `missing` before believing an absence.
// Never throws.
function getElectiveSectionMaps_(codes) {
  var result = { maps: {}, missing: [], reason: "" };
  var maps = result.maps;
  var gids;
  try {
    gids = getElectivesTabGids_();
  } catch (e) {
    // The tab list is the index for everything below it. Without it NO course can
    // be looked up, so every requested code is missing — never "not enrolled".
    console.error("Elective tab list unavailable: " + getErrorMessage_(e));
    result.missing = codes.slice();
    result.reason = "tab list unavailable: " + getErrorMessage_(e);
    return result;
  }
  var cache = CacheService.getScriptCache();

  // Enrolment now lives entirely in the per-course tabs, so this is asked for the
  // WHOLE catalogue (~30 tabs) rather than the handful a student picked. Read the
  // cache with one getAll instead of one get per tab: on the warm path — which is
  // almost every student, since the entries are shared and live 30 minutes — that
  // turns 30 sequential cache round trips into one.
  // Last-resort index: bare-alphanumeric tab name → gid. Built only if needed, so
  // the ordinary exact lookup pays nothing for it.
  var normIndex = null;
  function gidFor(code) {
    var direct = gids[code.toUpperCase()];
    if (direct) return direct;
    if (normIndex === null) {
      normIndex = {};
      for (var g in gids) {
        if (!gids.hasOwnProperty(g)) continue;
        var nk = normalizeTabKey_(decodeJsStringEscapes_(g));
        if (nk && normIndex[nk] === undefined) normIndex[nk] = gids[g];
      }
    }
    var viaNorm = normIndex[normalizeTabKey_(code)];
    if (viaNorm) {
      console.warn("Elective tab \"" + code + "\" resolved only after normalising its name.");
      return viaNorm;
    }
    return null;
  }

  var wanted = [];
  var noGid = [];
  for (var i = 0; i < codes.length; i++) {
    var gid0 = gidFor(codes[i]);
    if (gid0) wanted.push({ code: codes[i], gid: gid0, key: ELECTIVES_SECTION_CACHE_PREFIX_ + gid0 });
    // A catalogue code with no tab of its own is NOT an empty course — it is a
    // course this run cannot see. Before the pubhtml names were unescaped, M&A
    // landed here on every single run. Treat it as missing so callers refuse to
    // build a selection out of an incomplete picture.
    else noGid.push(codes[i]);
  }
  var cachedAll = {};
  try {
    cachedAll = cache.getAll(wanted.map(function (w) { return w.key; })) || {};
  } catch (e) {
    cachedAll = {};   // treat a cache hiccup as a cold read, never as an error
  }

  var pending = [];
  var seenGid = {};
  var gidToCodes = {};
  for (var w = 0; w < wanted.length; w++) {
    var item = wanted[w];
    (gidToCodes[item.gid] = gidToCodes[item.gid] || []).push(item.code);
    if (maps[item.code] !== undefined) continue;
    var hit = cachedAll[item.key];
    if (hit) {
      try { maps[item.code] = JSON.parse(hit); continue; } catch (e) { }
    }
    // Two codes can share a gid only if the sheet is odd; guard anyway so the
    // fetchAll never asks for the same tab twice.
    if (seenGid[item.gid]) continue;
    seenGid[item.gid] = true;
    pending.push({ code: item.code, gid: item.gid });
  }

  // One fetch pass, then ONE retry of whatever it could not get. Thirty parallel
  // requests to the same published document is exactly the shape Google answers
  // with an occasional 429/5xx, and at batch scale "occasional" happens to
  // somebody every window. The retry is cheap (only the stragglers) and it is what
  // keeps a transient blip from reading as "this student dropped that course".
  var toCache = {};
  var failed = [];
  function fetchRound(batch) {
    var out = [];
    if (!batch.length) return out;
    var responses;
    try {
      responses = UrlFetchApp.fetchAll(batch.map(function (p) {
        return {
          url: ELECTIVES_PUB_BASE_ + "pub?gid=" + p.gid + "&single=true&output=csv",
          muteHttpExceptions: true
        };
      }));
    } catch (e) {
      console.error("Elective section fetch failed: " + getErrorMessage_(e));
      return batch.slice();   // whole round lost — every tab in it is still missing
    }
    for (var r = 0; r < responses.length; r++) {
      if (responses[r].getResponseCode() !== 200) { out.push(batch[r]); continue; }
      var text = responses[r].getContentText() || "";
      // A published tab that answers 200 with nothing is a Google-side hiccup, not
      // a course with no students: every real tab carries at least its header.
      if (!text.trim()) { out.push(batch[r]); continue; }
      var rows = Utilities.parseCsv(text);
      var map = {};
      for (var j = 0; j < rows.length; j++) {
        var roll = (rows[j][0] || "").toString().trim().toUpperCase();
        if (!ELECTIVE_ROLL_PATTERN_.test(roll)) continue;
        var sec = ((rows[j].length > 3 && rows[j][3]) || "").toString().trim().toUpperCase();
        // Guard against the side table bleeding in: a real section label is one
        // or two characters ("A", "B"). Anything longer is not a section, and the
        // student is recorded as enrolled with no section rather than skipped.
        if (sec === "SECTION" || sec.length > 2) sec = "";
        var keys = electiveRollKeys_(roll);
        for (var kk = 0; kk < keys.length; kk++) map[keys[kk]] = sec;
      }
      // Every code that shares this gid gets the map, not just the one that
      // happened to be first into `pending`.
      var share = gidToCodes[batch[r].gid] || [batch[r].code];
      for (var sc = 0; sc < share.length; sc++) maps[share[sc]] = map;
      // Collected and written in one putAll below — same reasoning as the getAll
      // above, and it keeps the cold path to a single cache round trip too.
      toCache[ELECTIVES_SECTION_CACHE_PREFIX_ + batch[r].gid] = JSON.stringify(map);
    }
    return out;
  }

  failed = fetchRound(pending);
  if (failed.length) failed = fetchRound(failed);

  try {
    if (Object.keys(toCache).length) cache.putAll(toCache, ELECTIVES_CACHE_TTL_SECONDS_);
  } catch (e) {
    // A cache write failing only costs the next reader a re-fetch.
  }

  // Anything still unread after the retry, plus anything that had no tab at all.
  var missing = noGid.slice();
  for (var f = 0; f < failed.length; f++) {
    var share2 = gidToCodes[failed[f].gid] || [failed[f].code];
    for (var s2 = 0; s2 < share2.length; s2++) {
      if (maps[share2[s2]] === undefined) missing.push(share2[s2]);
    }
  }
  // Belt and braces: any requested code that ended without a map is missing,
  // whatever route it took to get there.
  for (var c2 = 0; c2 < codes.length; c2++) {
    if (maps[codes[c2]] === undefined && missing.indexOf(codes[c2]) === -1) missing.push(codes[c2]);
  }
  result.missing = missing;
  if (missing.length) {
    result.reason = "could not read " + missing.length + " course tab(s): " + missing.join(", ");
    console.warn("Elective enrolment incomplete — " + result.reason);
  }
  return result;
}

// The "Summary" tab, parsed into the term's course catalogue. One row per
// course after a single header row:
//   Course Title, abbreviation, No of Students, # Section, Group Email Id
// Returns [{ code, name, students, sections }]. The abbreviation is the tab name
// of that course's own enrolment tab, which is what ties the two together.
// Rows whose abbreviation is blank are skipped, so a trailing note or blank row
// in the sheet can't invent a course.
function getElectiveCatalogue_() {
  var rows = Utilities.parseCsv(fetchElectivesCsv_());
  var headerIdx = -1;
  for (var r = 0; r < Math.min(rows.length, 6); r++) {
    if ((rows[r][1] || "").trim().toUpperCase().indexOf("ABBREVIATION") === 0) { headerIdx = r; break; }
  }
  if (headerIdx === -1) return [];
  var out = [];
  for (var i = headerIdx + 1; i < rows.length; i++) {
    var code = (rows[i][1] || "").toString().trim().toUpperCase();
    var name = (rows[i][0] || "").toString().trim();
    if (!code || !name) continue;
    // "-" marks a course with no cohort split (independent study, dissertation).
    var secCount = parseInt((rows[i][3] || "").toString().trim(), 10);
    out.push({
      code: code,
      name: name,
      students: parseInt((rows[i][2] || "").toString().trim(), 10) || 0,
      sections: secCount > 0 ? secCount : 1
    });
  }
  return out;
}

// Looks the signed-in student up in the institute's published elective sheet and
// returns their picks (name, area, credits per course), plus the section the
// institute allotted them in each course's own tab.
//
// Term 5's sheet has no student×course allotment matrix — the "Summary" tab lists
// the courses and each course's own tab lists its enrolled students. So enrolment
// is derived by asking "does my roll appear in this course's tab?" across the
// whole catalogue, rather than by reading one row of ticks.
//
// Never throws: every failure path returns { ok:false, reason } so the client can
// quietly fall back to manual selection — no visible errors.
function getMyElectives() {
  try {
    var email = Session.getActiveUser().getEmail() || "";
    var student = lookupStudentByEmail_(email);
    var roll = student ? student.rollNo : (email ? email.split("@")[0].toUpperCase() : "");
    if (!roll) return { ok: false, reason: "no_roll" };

    var mode = enrolmentMode_();
    if (mode === "pick") return { ok: false, reason: "not_configured" };
    if (mode === "section") return mySectionCourses_(student);

    var catalogue = getElectiveCatalogue_();
    if (!catalogue.length) return { ok: false, reason: "bad_sheet" };

    // Compulsory courses are reported separately in the payload's `required`
    // list, so they're skipped below — otherwise a student enrolled in one would
    // see it twice on the confirmation.
    var requiredSet = {};
    var allCourseCodes = Object.keys(COURSE_INFO_);
    for (var rs = 0; rs < allCourseCodes.length; rs++) {
      if (COURSE_INFO_[allCourseCodes[rs]].required) requiredSet[allCourseCodes[rs]] = true;
    }
    var requiredCodes = Object.keys(requiredSet);

    // One fetchAll over every course tab (cached per tab), then enrolment is a
    // map lookup per course.
    var lookupCodes = requiredCodes.slice();
    for (var c = 0; c < catalogue.length; c++) lookupCodes.push(catalogue[c].code);
    var secRead = getElectiveSectionMaps_(lookupCodes);
    var secMaps = secRead.maps;
    // A partial read must never be shown as "your courses". A student whose M&A
    // tab failed would be handed a confident five-subject list with no hint that
    // a sixth exists — and would then tick exactly those five. Say "not now"
    // instead; the client falls back to the manual picker and the next attempt
    // (or the next background run) sees the whole sheet.
    if (secRead.missing.length) {
      console.warn("getMyElectives refusing a partial read — " + secRead.reason);
      return { ok: false, reason: "incomplete", missingCourses: secRead.missing.length };
    }

    var electives = [];
    var totalCredits = 0;
    for (var k = 0; k < catalogue.length; k++) {
      var entry = catalogue[k];
      var map = secMaps[entry.code];
      if (!map || map[roll] === undefined) continue; // not enrolled
      if (requiredSet[entry.code]) continue;
      // info is null when the catalogue lists something with no timetable course
      // (e.g. dissertation); the client shows those rows as info-only and never
      // tries to sync them.
      var info = COURSE_INFO_[entry.code] || null;
      var credits = info ? info.credits : 0;
      electives.push({
        code: info ? entry.code : "",
        name: info ? info.name : entry.name,
        area: info ? info.area : "",
        credits: credits,
        section: map[roll] || ""
      });
      totalCredits += credits;
    }
    if (electives.length === 0) return { ok: false, reason: "no_picks" };

    var required = [];
    for (var rq = 0; rq < requiredCodes.length; rq++) {
      var rCode = requiredCodes[rq];
      required.push({
        code: rCode,
        name: COURSE_INFO_[rCode].name,
        area: COURSE_INFO_[rCode].area,
        credits: COURSE_INFO_[rCode].credits,
        section: (secMaps[rCode] && secMaps[rCode][roll]) || ""
      });
    }

    try { logUsage_("electives_fetch"); } catch (logErr) {}
    return {
      ok: true,
      roll: roll,
      name: student ? student.name : "",
      electives: electives,
      required: required,
      totalSubjects: electives.length,
      totalCredits: Math.round(totalCredits * 10) / 10
    };
  } catch (e) {
    console.error("getMyElectives failed: " + getErrorMessage_(e));
    return { ok: false, reason: "fetch_failed" };
  }
}

// "Doesn't look right" preference. Stored per user so the suggestion card
// stops appearing automatically on later visits; the manual auto-fetch button
// in the course picker keeps working either way.
function setElectivesFetchOptOut(optOut) {
  var props = PropertiesService.getUserProperties();
  if (optOut) props.setProperty(ELECTIVES_OPTOUT_PROP_, "1");
  else props.deleteProperty(ELECTIVES_OPTOUT_PROP_);
  return true;
}

// The course-data cache entry for the CURRENT revision. Keying on the revision is
// what makes the long TTL safe: the fetch bumps the revision only after the sheets
// are written, so an entry built from the old sheets sits under the old key and is
// never read again — however the timing of a page load and a fetch interleave.
function courseDataCacheKey_() {
  var rev = PropertiesService.getScriptProperties().getProperty('master_data_revision') || "0";
  return COURSE_DATA_CACHE_KEY_ + "_r" + rev;
}

function getCourseData() {
  var cache = CacheService.getScriptCache();
  var key = courseDataCacheKey_();
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  return buildCourseData_(cache, key);
}

// Reads the sheets into the course-data payload and caches it under `key`. Called on
// a cache miss, and by the owner's fetch to keep the entry warm (warmPageCaches_).
function buildCourseData_(cache, key) {
  // Read-only: students may not have edit rights, so never create the sheet here.
  // If MasterData isn't set up yet, surface no courses rather than throwing.
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var courses = {};

  for (var i = 1; i < data.length; i++) {
    var code = data[i][3] ? data[i][3].toString().trim() : "";
    var section = data[i][4] ? data[i][4].toString().trim() : "";
    var name = data[i][5] ? data[i][5].toString().trim() : "";
    var instructor = data[i][6] ? data[i][6].toString().trim() : "Unknown";

    if (!code) continue;

    if (!courses[code]) {
      var info = COURSE_INFO_[code];
      courses[code] = {
        name: (info && info.name) || name,
        area: (info && info.area) || "",
        credits: (info && info.credits) || 0,
        required: !!(info && info.required),
        sections: {},
        quizzes: [],
        exams: []
      };
    }
    if (!courses[code].sections[section]) {
      courses[code].sections[section] = { instructor: instructor, slots: [] };
    }

    // Same window filter as the sync itself, so the client's preview/conflict data
    // only counts slots that will actually become events. Slots use the compact
    // wire shape [date, startMin, endMin] — the payload is close to CacheService's
    // 100KB value cap, and the array form roughly halves the JSON overhead.
    var dateObj = parseSheetDate_(data[i][0]);
    if (dateObj && isWithinSyncWindow_(dateObj)) {
      var dStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
      try {
        var sParse = parseTime_(data[i][1]);
        var eParse = parseTime_(data[i][2]);
        // Same end>start rule as the sync builder, so previews match reality.
        if (isValidTimeRange_(sParse, eParse)) {
          courses[code].sections[section].slots.push([
            dStr,
            (sParse.h * 60) + sParse.m,
            (eParse.h * 60) + eParse.m
          ]);
        }
      } catch (timeErr) {
        console.error("Skipping slot with bad time in MasterData: " + getErrorMessage_(timeErr));
      }
    }
  }

  // Attach per-course quiz markers as [section, date, startMin, endMin] ("" section
  // = applies to all sections) so the client can preview how many quiz events a
  // selection will add AND warn when an institute-scheduled quiz overlaps another
  // selected course's class. Mirrors the matching rules in appendQuizEvents_.
  var upperIndex = {};
  var courseKeys = Object.keys(courses);
  for (var u = 0; u < courseKeys.length; u++) upperIndex[courseKeys[u].toUpperCase()] = courseKeys[u];
  var tzPrev = Session.getScriptTimeZone();
  var quizRows = getQuizData_();
  for (var q = 0; q < quizRows.length; q++) {
    var qCode = quizRows[q][3] ? quizRows[q][3].toString().trim().toUpperCase() : "";
    var realKey = upperIndex[qCode];
    if (!realKey) continue;
    // Only count rows the sync will actually create (same skip rules as
    // appendQuizEvents_), so the client-side preview matches the real event count.
    var qDate = parseSheetDate_(quizRows[q][0]);
    if (!qDate || !isWithinSyncWindow_(qDate)) continue;
    var qsPrev, qePrev;
    try {
      qsPrev = parseTime_(quizRows[q][1]);
      qePrev = parseTime_(quizRows[q][2]);
    } catch (timeErr) {
      continue;
    }
    if (!isValidTimeRange_(qsPrev, qePrev)) continue;
    var qSec = quizRows[q][4] ? quizRows[q][4].toString().trim().toUpperCase() : "";
    courses[realKey].quizzes.push([
      qSec,
      Utilities.formatDate(qDate, tzPrev, "yyyy-MM-dd"),
      (qsPrev.h * 60) + qsPrev.m,
      (qePrev.h * 60) + qePrev.m
    ]);
  }

  // Attach per-course exam markers as [date, startMin, endMin] so the client can
  // preview how many exam events a selection will add (exams.length — exams have
  // no section) and run the same overlap warning. Same skip rules AND same combined
  // mid-term + end-term source as appendExamEvents_, so the preview count matches
  // what the sync actually creates.
  var examRowsPrev = getAllExamRows_();
  for (var x = 0; x < examRowsPrev.length; x++) {
    var xCode = examRowsPrev[x][3] ? examRowsPrev[x][3].toString().trim().toUpperCase() : "";
    var xKey = upperIndex[xCode];
    if (!xKey) continue;
    var xDate = parseSheetDate_(examRowsPrev[x][0]);
    if (!xDate || !isWithinSyncWindow_(xDate)) continue;
    var xsPrev, xePrev;
    try {
      xsPrev = parseTime_(examRowsPrev[x][1]);
      xePrev = parseTime_(examRowsPrev[x][2]);
    } catch (xTimeErr2) {
      continue;
    }
    if (!isValidTimeRange_(xsPrev, xePrev)) continue;
    courses[xKey].exams.push([
      Utilities.formatDate(xDate, tzPrev, "yyyy-MM-dd"),
      (xsPrev.h * 60) + xsPrev.m,
      (xePrev.h * 60) + xePrev.m
    ]);
  }

  try {
    cache.put(key, JSON.stringify(courses), COURSE_DATA_CACHE_TTL_SECONDS_);
  } catch (e) {
    // Cache payload may exceed 100KB; fail open.
  }
  return courses;
}

// Rebuilds the shared caches a page load reads (course data, OLT marks status) for
// the current revision, restarting their 6-hour TTL. Run by the owner's fetch every
// 30 minutes, so a student opening the page finds them warm instead of paying for
// the sheet reads. Best-effort: a failure only means the next page load rebuilds.
function warmPageCaches_() {
  // The exam rows are memoised per execution; read the sheets as they are now.
  resetExamRowsMemo_();
  try {
    buildCourseData_(CacheService.getScriptCache(), courseDataCacheKey_());
  } catch (e) {
    console.warn("Course-data cache warm failed: " + getErrorMessage_(e));
  }
  try {
    getMarksStatusMap_(true);
  } catch (e) {
    console.warn("Marks-status cache warm failed: " + getErrorMessage_(e));
  }
}

// ── Dynamic roster & academic calendar ────────────────────────────────────────
// Subject Representatives and the term's exam/break dates used to be hardcoded
// (in Index.html and TERM_CONFIG_ respectively). They're now read live from the
// institute's own published sheets so they can never silently drift. Both paths
// cache for 6h and fall back to the hardcoded copy on any failure — a slow or
// broken sheet must never make getSyncHealth/the PDF fail (zero visible errors).

var MONTHS_3_ = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
};

// "20-Jul-2026" / "9-Sep-2026" (single-digit days occur) → "2026-07-20". Returns
// "" on anything it can't confidently parse, so callers can fall back per-field.
function parseDmyToIso_(s) {
  var str = String(s == null ? "" : s).trim();
  if (!str) return "";
  var parts = str.split("-");
  if (parts.length !== 3) return "";
  var d = parts[0].trim();
  var mon = parts[1].trim().substring(0, 3).toUpperCase();
  var y = parts[2].trim();
  var mm = MONTHS_3_[mon];
  if (!mm || !/^\d{1,2}$/.test(d) || !/^\d{4}$/.test(y)) return "";
  return y + "-" + mm + "-" + (d.length === 1 ? "0" + d : d);
}

// The roster sheet stores names in ALL CAPS; the UI/PDF expect proper case to
// match the old hardcoded list ("RAVI KUMAR SHARMA" → "Ravi Kumar Sharma"). Capitalises the
// first letter after each space or hyphen, so initials ("V R") stay upper.
// Institute sheets are typed by hand, so names arrive with stray runs of spaces
// and leading/trailing whitespace ("AARAV  SHARMA"). Collapse before casing:
// these names are rendered inline in the SR modal, the role line and the PDF's
// course breakdown, where a double space is visible.
function titleCaseName_(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
}

// The Subject Representatives typed into config.gs → SUBJECT_REPS, one
// "CODE, SECTION, NAME, ROLL" line each, shaped like the client's SUBJECT_REPS_
// ({code, sec, name, roll}). "-" or a blank section means the whole course.
function configuredSubjectReps_() {
  var reps = [];
  var rows = settingRows_(CFG_.subjectReps);
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i].cells;
    var code = (c[0] || "").trim();
    var secRaw = (c[1] || "").trim();
    var name = (c[2] || "").trim();
    var roll = (c[3] || "").toUpperCase().replace(/\s+/g, "");
    if (!code || !name || !roll) {
      if (!/^(course|code)/i.test(code)) {
        settingsProblem_('SUBJECT_REPS: could not read "' + rows[i].line + '" — expected CODE, SECTION, NAME, ROLL.');
      }
      continue;
    }
    reps.push({ code: code, sec: (secRaw === "-" ? "" : secRaw.toUpperCase()), name: titleCaseName_(name), roll: roll });
  }
  return reps;
}

// Live Subject Representatives, shaped exactly like the client's SUBJECT_REPS_
// ({code, sec, name, roll}). From the published SR tab when one is configured,
// otherwise from config.gs. Returns null when there is nothing to show (or on any
// failure) so the client keeps whatever list it has. Email isn't carried — it's
// roll-derived on the client.
// `force` (admin-fetch pre-warm only) skips the cache read so the 6h TTL restarts
// every hour and never expires on a student's health call.
function getSubjectReps_(force) {
  if (!FEATURES_.subjectReps) return null;
  // No published SR sheet: the list typed into config.gs is the roster, and no
  // health call pays a spurious UrlFetch.
  if (SUBJECT_REPS_CSV_URL === PENDING_URL_) {
    var typed = configuredSubjectReps_();
    return typed.length ? typed : null;
  }
  try {
    var cache = CacheService.getScriptCache();
    var cached = force ? null : cache.get(SUBJECT_REPS_CACHE_KEY_);
    if (cached === SHEET_FETCH_NONE_) return null; // recent failure — don't re-fetch yet
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    var resp = UrlFetchApp.fetch(SUBJECT_REPS_CSV_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) { markSheetFetchFailed_(SUBJECT_REPS_CACHE_KEY_); return null; }
    var rows = Utilities.parseCsv(resp.getContentText() || "");

    // A title banner sits above the header, so find the header row by its
    // "Abbreviation" column rather than assuming a fixed index.
    var headerIdx = -1;
    for (var h = 0; h < Math.min(rows.length, 5); h++) {
      if ((rows[h][1] || "").trim().toUpperCase() === "ABBREVIATION") { headerIdx = h; break; }
    }
    if (headerIdx === -1) { markSheetFetchFailed_(SUBJECT_REPS_CACHE_KEY_); return null; }

    var reps = [];
    for (var i = headerIdx + 1; i < rows.length; i++) {
      var code = (rows[i][1] || "").trim().toUpperCase();
      var name = (rows[i][3] || "").trim();
      var roll = (rows[i][4] || "").trim().toUpperCase();
      if (!code || !roll || !name) continue;
      var secRaw = (rows[i][2] || "").trim();
      // "-" and "" both mean a section-less course; A/B/C/D are real sections.
      var sec = (secRaw === "-" || secRaw === "") ? "" : secRaw.toUpperCase();
      reps.push({ code: code, sec: sec, name: titleCaseName_(name), roll: roll });
    }
    if (!reps.length) { markSheetFetchFailed_(SUBJECT_REPS_CACHE_KEY_); return null; }
    try { cache.put(SUBJECT_REPS_CACHE_KEY_, JSON.stringify(reps), SUBJECT_REPS_CACHE_TTL_SECONDS_); } catch (e) {}
    return reps;
  } catch (err) {
    console.warn("getSubjectReps_ failed: " + getErrorMessage_(err));
    markSheetFetchFailed_(SUBJECT_REPS_CACHE_KEY_);
    return null;
  }
}

// Raw parsed rows of the Academic Calendar sheet, cached 6h. Returns null on
// failure so getAcademic_ falls back to the hardcoded block. Failures are
// negative-cached (SHEET_FETCH_NONE_) — examTermLabel_ consults this on every
// sync that has exam rows, so an outage must not add a doomed fetch per run.
// `force` (admin-fetch pre-warm only) skips the cache read so the 6h TTL
// restarts every hour — see getSubjectReps_.
function getAcademicCalRows_(force) {
  if (ACADEMIC_CAL_CSV_URL === PENDING_URL_) return null;   // no link set — use the fallback dates
  var cache = CacheService.getScriptCache();
  var cached = force ? null : cache.get(ACADEMIC_CAL_CACHE_KEY_);
  if (cached === SHEET_FETCH_NONE_) return null; // recent failure — don't re-fetch yet
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var resp;
  try {
    resp = UrlFetchApp.fetch(ACADEMIC_CAL_CSV_URL, { muteHttpExceptions: true });
  } catch (fetchErr) {
    markSheetFetchFailed_(ACADEMIC_CAL_CACHE_KEY_);
    return null;
  }
  if (resp.getResponseCode() !== 200) { markSheetFetchFailed_(ACADEMIC_CAL_CACHE_KEY_); return null; }
  var rows = Utilities.parseCsv(resp.getContentText() || "");
  if (!rows.length) { markSheetFetchFailed_(ACADEMIC_CAL_CACHE_KEY_); return null; }
  try { cache.put(ACADEMIC_CAL_CACHE_KEY_, JSON.stringify(rows), ACADEMIC_CAL_CACHE_TTL_SECONDS_); } catch (e) {}
  return rows;
}

// Live academic block for the current term (TERM_CONFIG_.academicTerm), shaped
// like TERM_CONFIG_.academic so the PDF builder is unchanged. Each field falls
// back to the hardcoded default independently, so a partial calendar never wipes
// a good value. nextTermStart = the first dated event of the next term listed.
function getAcademic_() {
  var fallback = TERM_CONFIG_.academic;
  try {
    var rows = getAcademicCalRows_();
    if (!rows || !rows.length) return fallback;
    var termName = (TERM_CONFIG_.academicTerm || "").trim().toUpperCase();
    if (!termName) return fallback;

    var headerIdx = -1;
    for (var h = 0; h < Math.min(rows.length, 6); h++) {
      if ((rows[h][0] || "").trim().toUpperCase() === "TERM" &&
          (rows[h][1] || "").trim().toUpperCase() === "EVENT") { headerIdx = h; break; }
    }
    if (headerIdx === -1) return fallback;

    var examWindows = [];
    var termBreak = null;
    var nextTermStart = "";
    var sawCurrent = false;

    for (var i = headerIdx + 1; i < rows.length; i++) {
      var tu = (rows[i][0] || "").trim().toUpperCase();
      var event = (rows[i][1] || "").trim();
      var startIso = parseDmyToIso_(rows[i][2]);
      var endIso = parseDmyToIso_(rows[i][4]) || startIso;

      if (tu === termName) {
        sawCurrent = true;
        if (!startIso) continue;
        if (/mid[\s-]*term\s+exam/i.test(event)) {
          examWindows.push({ label: "Mid-term exams", start: startIso, end: endIso });
        } else if (/end[\s-]*term\s+exam/i.test(event)) {
          examWindows.push({ label: "End-term exams", start: startIso, end: endIso });
        } else if (/term\s+break/i.test(event)) {
          termBreak = { label: "Term break", start: startIso, end: endIso };
        }
      } else if (sawCurrent && tu && !nextTermStart && startIso) {
        // First dated row of the term after ours = the next term's start.
        nextTermStart = startIso;
      }
    }

    examWindows.sort(function (a, b) { return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0); });

    return {
      examWindows: examWindows.length ? examWindows : fallback.examWindows,
      termBreak: termBreak || fallback.termBreak,
      nextTermStart: nextTermStart || fallback.nextTermStart
    };
  } catch (err) {
    console.warn("getAcademic_ failed: " + getErrorMessage_(err));
    return TERM_CONFIG_.academic;
  }
}

// ---------------------------------------------------------
// AUTO-SYNC TRIGGER MANAGEMENT
// ---------------------------------------------------------

function validateEnableInputs_(selections, preferences) {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error("Please select at least one course.");
  }
  var reminderWhitelist = ["", "5", "10", "15", "30", "60"];
  var reminder = (preferences && preferences.popupReminder != null) ? String(preferences.popupReminder) : "";
  if (reminderWhitelist.indexOf(reminder) === -1) {
    throw new Error("Invalid reminder value.");
  }
  // Use getCourseData() (not COURSE_INFO_) so the valid-key set and required-course
  // check match exactly what the client UI shows — courses not yet in MasterData are
  // invisible to both sides and won't cause a false "not selected" error.
  var courses = getCourseData();
  var validKeys = {};
  var requiredCodes = [];
  var codes = Object.keys(courses);
  for (var k = 0; k < codes.length; k++) {
    var code = codes[k];
    var sections = Object.keys(courses[code].sections);
    var hasRealSections = sections.length > 1 || (sections.length === 1 && sections[0] !== "");
    if (!hasRealSections) {
      validKeys[code] = true;
    } else {
      for (var j = 0; j < sections.length; j++) {
        validKeys[code + "-" + sections[j]] = true;
      }
    }
    if (courses[code].required) requiredCodes.push(code);
  }
  for (var i = 0; i < selections.length; i++) {
    if (validKeys[selections[i]]) continue;
    // A real catalogue course with NO timetable rows (CIS-T5, DIS-2 — independent
    // study and dissertation — or a course whose class rows have been withdrawn).
    // The handover seeds these into a student's selection on purpose: they carry no
    // classes, but the student IS enrolled, and a withdrawn course's quizzes/exams
    // still sync (see backgroundSyncLocked_). The picker has no checkbox for them, so
    // the page re-sends them untouched on every Update; rejecting them here used to
    // make that impossible and quietly drop the course. Only codes with no rows at
    // all qualify — a timetabled course must still name a section that exists.
    var classless = resolveSelectionCode_(selections[i]);
    if (classless && !courses[classless.code] && !courses[classless.code.toUpperCase()]) continue;
    throw new Error("Invalid course selection: " + selections[i] + ". Please refresh and try again.");
  }
  // One section per course. The client's picker already enforces this; re-check
  // here so a hand-crafted RPC can't sync two sections' classes (and their
  // quizzes) side by side. Codes can contain hyphens (PM-F, TG-II), so a value
  // is resolved to its course by the same known-code check the client uses.
  var seenSelCodes = {};
  for (var d = 0; d < selections.length; d++) {
    var selCode = selections[d];
    if (!courses[selCode]) {
      var dashAt = selCode.lastIndexOf("-");
      if (dashAt > 0 && courses[selCode.substring(0, dashAt)]) selCode = selCode.substring(0, dashAt);
      else {
        // Row-less catalogue course (see above): key it by its catalogue code.
        var resolvedSel = resolveSelectionCode_(selCode);
        if (resolvedSel) selCode = resolvedSel.code.toUpperCase();
      }
    }
    if (seenSelCodes[selCode]) {
      throw new Error("You've picked more than one section of " + selCode + " — please keep just one.");
    }
    seenSelCodes[selCode] = true;
  }
  for (var r = 0; r < requiredCodes.length; r++) {
    var rCode = requiredCodes[r];
    var found = false;
    for (var s = 0; s < selections.length; s++) {
      if (selections[s] === rCode || selections[s].indexOf(rCode + "-") === 0) { found = true; break; }
    }
    if (!found) throw new Error("Please pick a section for required course: " + rCode);
  }
}

// `opId` (optional, client-generated) stamps this run's progress payloads so the
// polling client can tell them from another run's — see PROGRESS_OP_ID_. Old
// clients that omit it keep the previous behaviour.
function enableAutoSync(selections, preferences, opId) {
  PROGRESS_OP_ID_ = opId ? String(opId).slice(0, 40) : "";
  // Hard stop after "End term", BEFORE anything is saved: the web UI is locked
  // behind the term-ended overlay, so this only guards console callers — but the
  // guard is the real boundary. Nothing may modify selections or calendars once
  // the admin has closed the term.
  if (PropertiesService.getScriptProperties().getProperty('term_ended_at')) {
    throw new Error("The term has ended — the timetable tool is closed and calendar changes are disabled.");
  }
  var lock = LockService.getUserLock();
  if (!lock.tryLock(60000)) {
    throw new Error("Another calendar update is still running for your account (usually the automatic background sync) — your change was NOT applied. Please try again in a minute.");
  }

  try {
    // Clear leftover progress from any previous run FIRST. The client starts polling
    // getSyncProgress almost immediately after the click; a stale terminal status
    // ("complete"/"error", cached up to 10 min) from an earlier sync would otherwise
    // be read before this run writes its own progress, making the UI show a false
    // "Calendar updated" while the real sync is still running.
    var cache = CacheService.getUserCache();
    cache.remove(PROGRESS_KEY);
    clearProgressNote_(cache);

    // Gated here too, not just in the background sync: this path does its own
    // first-time legacy wipe on getOrCreateCalendar_(CALENDAR_NAME) before it ever
    // reaches backgroundSyncLocked_, so a held-back student clicking Enable would
    // otherwise have a Term 5 calendar created for them.
    //
    // BEFORE validateEnableInputs_ on purpose: during a pilot the shared course
    // data is mid-migration, so a held-back student's perfectly reasonable
    // selection can fail validation and hand them "Invalid course selection" —
    // an error about nothing they did, when the truthful answer is "not yet".
    if (!isPilotUser_()) throw new Error(pilotHoldMessage_());

    validateEnableInputs_(selections, preferences);

    var props = PropertiesService.getUserProperties();
    // The one-time term handover must happen BEFORE this student's picks are saved:
    // otherwise the sync below reaches it with the new picks already in
    // tt_selections, mistakes them for last term's, and replaces them. In this mode
    // it only crosses out last term's calendar and clears last term's state; it
    // never seeds and never blocks. See handleTermHandover_.
    if (props.getProperty('tt_handover') !== HANDOVER_VERSION_) {
      handleTermHandover_(props, { explicitSelection: true });
    }
    // First-time enable: backgroundSyncLocked_ only clears APP_TAG'd events, so leftovers
    // from earlier tool versions (which may not carry the tag) would survive forever.
    // Sweep them with a conservative filter that only catches events looking like
    // timetable entries — personal events on this calendar are left alone.
    // Run the sweep BEFORE saving tt_selections: if it throws, the user must be able
    // to retry as a first-time enable, otherwise they're stuck with legacy events
    // forever.
    if (!props.getProperty('tt_selections')) {
      var cal = getOrCreateCalendar_(CALENDAR_NAME);
      var wipeResult = deleteEventsWithFallback_(
        cal, cache,
        function () { return listLegacyTimetableEventIds_(cal); },
        function () { return slowListLegacyTimetableEvents_(cal); }
      );
      if (wipeResult.failed > 0) {
        var attemptedTotal = wipeResult.deleted + wipeResult.failed;
        var wipeMsg = "Could not clear all old timetable events before enabling: removed " +
          wipeResult.deleted + " of " + attemptedTotal + ", " + wipeResult.failed +
          " failed (likely rate-limited by Google). Please click Enable again to retry.";
        if (wipeResult.lastError) wipeMsg += " Last error: " + getErrorMessage_(wipeResult.lastError);
        throw new Error(wipeMsg);
      }
      // Mark this user as already on the current code + content versions so the
      // migration block in backgroundSyncLocked_ doesn't wipe or force-resync
      // the calendar a second time.
      props.setProperty('tt_code_version', CODE_VERSION);
      props.setProperty('tt_resync_version', RESYNC_VERSION);
    }

    props.setProperty('tt_selections', JSON.stringify(selections));
    props.setProperty('tt_popup', preferences.popupReminder || "");
    // Whatever the institute's list said a moment ago, this IS the student's answer
    // now. Clearing both the record and the throttle means the next background run
    // re-compares from scratch rather than showing a card about a choice they have
    // just made.
    props.deleteProperty(ELECTIVES_DRIFT_PROP_);
    props.deleteProperty(ELECTIVES_DRIFT_CHECKED_PROP_);
    // Same for the handover's "this course runs several groups — tick yours" note:
    // it is written once, by the seed, and nothing else ever cleared it, so it stayed
    // on screen after the student had done exactly what it asked.
    props.deleteProperty('tt_seed_unresolved');

    // Create the replacement BEFORE pruning the old one(s), matching
    // ensureSyncTrigger_. Deleting first and then failing to create would leave the
    // account with no trigger and no way back: ensureSyncTrigger_ — the only thing
    // that rebuilds a missing trigger — runs solely from inside a background run,
    // which is exactly what stops happening. getSyncHealth's triggerOk covers the
    // states this ordering can't (a trigger Google drops later); this covers the
    // one it can.
    if (PropertiesService.getScriptProperties().getProperty('term_ended_at')) {
      deleteUserTriggers_();
    } else {
      deleteUserTriggers_(createSyncTrigger_().getUniqueId());
    }

    // The enable/update run (re)creates whatever the user just picked — logging
    // it as "timetable changes" would flood first-timers with hundreds of
    // entries. Marker is consumed by the very next sync run (this one).
    props.setProperty('tt_changelog_skip_once', '1');

    // Log the enable BEFORE the sync runs: a partial first sync throws (the calm
    // "still finishing" state) yet the user IS enabled — selections saved,
    // trigger created — so logging after the call would skip them and
    // permanently undercount "currently active".
    logUsage_("enable");

    var result = backgroundSyncLocked_(true);
    // Object result: the client uses calendarId to deep-link "Open Google
    // Calendar" straight to the synced calendar on the success panel.
    return {
      message: "Auto-Sync Enabled. " + result,
      calendarId: props.getProperty('tt_calendar_id') || ""
    };
  } finally {
    lock.releaseLock();
  }
}

// Every per-user property that describes an ACTIVE sync, cleared by the two stop
// paths (disableAutoSync, stopAutoSyncKeepCalendar). One list, so the two doors can
// never disagree about what "stopped" means — they used to carry three copy-pasted
// sixteen-line blocks, and none of them cleared the diagnostic lists below, which is
// how a student who had just deleted their calendar could still be shown "your
// calendar has not been changed" by a stale drift card.
//
// Deliberately NOT cleared: tt_handover (the per-term latch — clearing it would
// re-run the handover) and tt_electives_optout (a preference, not sync state).
var SYNC_STATE_PROPS_ = [
  'tt_selections', 'tt_popup', 'tt_reminder_applied',
  'tt_last_synced_revision', 'tt_last_synced_at',
  'tt_partial_sync_revision', 'tt_partial_sync_attempts',
  'tt_code_version', 'tt_resync_version', 'tt_sync_interval',
  'tt_change_log', 'tt_changelog_skip_once', 'tt_calendar_id',
  'tt_term_end_struck', 'tt_term_end_strike_attempts',
  'tt_color_map',
  // Diagnostics about the selection being synced. Meaningless once nothing is.
  'tt_selection_mismatch', 'tt_selection_classless', 'tt_seed_unresolved',
  'tt_electives_drift', 'tt_electives_drift_at'
];

function clearSyncState_(props) {
  for (var i = 0; i < SYNC_STATE_PROPS_.length; i++) {
    try { props.deleteProperty(SYNC_STATE_PROPS_[i]); } catch (e) { /* best-effort per key */ }
  }
}

// `opId` — see enableAutoSync.
function disableAutoSync(opId) {
  PROGRESS_OP_ID_ = opId ? String(opId).slice(0, 40) : "";
  var lock = LockService.getUserLock();
  if (!lock.tryLock(60000)) {
    throw new Error("Another calendar update is still running for your account (usually the automatic background sync) — nothing was deleted. Please try again in a minute.");
  }

  try {
    PROGRESS_OP_ = "disable"; // label this run's progress as a deletion
    var props = PropertiesService.getUserProperties();
    var cache = CacheService.getUserCache();
    cache.remove(PROGRESS_KEY);
    clearProgressNote_(cache);

    // Don't use getOrCreateCalendar_ here: a fresh user (or one who manually deleted
    // the calendar) clicking Disable would get an empty calendar created just so
    // zero events could be removed from it. Clean up any lingering state and exit.
    var cal = findOwnedCalendar_(CALENDAR_NAME);
    if (!cal) {
      var hadSelections = !!props.getProperty('tt_selections');
      clearSyncState_(props);
      deleteUserTriggers_();
      putProgress_(cache, 0, 0, "complete");
      if (hadSelections) logUsage_("disable");
      return "Auto-Sync Disabled. No synced calendar was found.";
    }

    // Delete the whole calendar rather than clearing events one-by-one: a single
    // atomic CalendarApp call, instant, and immune to the 429 storms the
    // event-by-event path needed fallbacks for. The confirm dialog in the UI warns
    // that events the user added to this calendar themselves are removed too.
    putProgress_(cache, 0, 1, "clearing");
    slowCalendarRetry_(function () { cal.deleteCalendar(); }, "delete calendar");

    // Rare: duplicate same-name owned calendars (e.g. left behind by an older
    // version racing itself). Sweep the rest so Disable leaves nothing behind.
    // Guarded and best-effort — a hiccup here must never fail the disable, and
    // the loop is bounded in case the just-deleted calendar is still returned
    // by the (eventually consistent) name lookup.
    try {
      for (var extraGuard = 0; extraGuard < 5; extraGuard++) {
        var extraCal = findOwnedCalendar_(CALENDAR_NAME);
        if (!extraCal) break;
        slowCalendarRetry_(function () { extraCal.deleteCalendar(); }, "delete duplicate calendar");
      }
    } catch (dupErr) {
      console.warn("Duplicate-calendar sweep stopped: " + getErrorMessage_(dupErr));
    }

    clearSyncState_(props);

    deleteUserTriggers_();
    putProgress_(cache, 1, 1, "complete");
    clearProgressNote_(cache);
    logUsage_("disable");
    return "Auto-Sync Disabled. The synced calendar was deleted from your Google Calendar.";
  } finally {
    lock.releaseLock();
  }
}

// The gentler half of the stop control: stop all automatic updates but LEAVE the
// calendar and every event already in it exactly where they are. For students who
// want the term frozen on record rather than erased — deleting a whole calendar is
// the only irreversible thing this tool can do, and it should not be the only way
// to make it stop.
//
// Touches no calendar at all, so unlike disableAutoSync it is instant, cannot fail
// half-way through a 429 storm, and needs no progress polling on the client.
//
// Re-enabling later is a clean first-time enable: tt_selections is gone, so
// enableAutoSync's legacy sweep clears the frozen events before rebuilding them —
// the kept copy can't survive as duplicates alongside a fresh sync.
function stopAutoSyncKeepCalendar() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(60000)) {
    throw new Error("Another calendar update is still running for your account (usually the automatic background sync) — nothing was changed. Please try again in a minute.");
  }

  try {
    var props = PropertiesService.getUserProperties();
    var hadSelections = !!props.getProperty('tt_selections');

    // Triggers first: whatever else happens below, the thing the student asked to
    // stop must actually be stopped.
    deleteUserTriggers_();

    clearSyncState_(props);

    // Logged distinctly from "disable" so the SAC log can tell "kept their
    // timetable" apart from "deleted it", but counted as a disable everywhere the
    // stats ask whether a user is still active (see isDisableAction_).
    if (hadSelections) logUsage_("disable_keep");

    return findOwnedCalendar_(CALENDAR_NAME)
      ? "Automatic updates stopped. Your \u201C" + CALENDAR_NAME + "\u201D calendar and everything in it have been left untouched."
      : "Automatic updates stopped. No synced calendar was found to keep.";
  } finally {
    lock.releaseLock();
  }
}

// Removes this user's backgroundSync triggers. `keepId` (optional) spares the one
// trigger with that unique id, so a caller that has just created the replacement
// can prune the old ones without the account ever passing through a state with no
// trigger at all. Called with no argument it removes every one, as before.
function deleteUserTriggers_(keepId) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backgroundSync' &&
      triggers[i].getUniqueId() !== keepId) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// Creates this user's backgroundSync trigger at the deployed cadence
// (SYNC_INTERVAL_MINUTES_) and records which interval they're now on, so
// ensureSyncTrigger_ can later detect a cadence change and migrate them. Returns the
// created trigger so callers can tell it apart from any leftovers.
function createSyncTrigger_() {
  var t = ScriptApp.newTrigger('backgroundSync').timeBased()
    .everyMinutes(SYNC_INTERVAL_MINUTES_).create();
  PropertiesService.getUserProperties().setProperty('tt_sync_interval', String(SYNC_INTERVAL_MINUTES_));
  return t;
}

// Guarantees this user has exactly one backgroundSync trigger AT THE CURRENT
// cadence. Called on every background sync (which runs as the user), so lowering
// SYNC_INTERVAL_MINUTES_ in code self-propagates: each user's next run finds their
// stored tt_sync_interval no longer matches and rebuilds their own trigger — no
// access to their account needed. Creates the new trigger BEFORE deleting the old
// one(s) so a mid-run failure can never leave the user with no trigger at all.
function ensureSyncTrigger_() {
  var props = PropertiesService.getUserProperties();
  var desired = String(SYNC_INTERVAL_MINUTES_);
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'backgroundSync';
  });
  // Already exactly one trigger on the current cadence — nothing to do.
  if (existing.length === 1 && props.getProperty('tt_sync_interval') === desired) return;
  // Create the replacement first, then remove every OTHER backgroundSync trigger by
  // id (the old-interval one plus any stray duplicates), leaving exactly one.
  var keepId = createSyncTrigger_().getUniqueId();
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'backgroundSync' && all[i].getUniqueId() !== keepId) {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
}

// Rebuilds this user's background sync trigger after getSyncHealth reported it
// missing (calendar.triggerOk === false). Deliberately the narrowest repair that
// can work: it touches triggers only — never the calendar, the events or the saved
// selection — so a student can click Repair without risking anything they already
// have. Idempotent, since ensureSyncTrigger_ converges on exactly one trigger from
// any starting state.
function repairSyncTrigger() {
  if (PropertiesService.getScriptProperties().getProperty('term_ended_at')) {
    throw new Error("The term has ended — automatic updates are switched off for everyone, so there is nothing to repair.");
  }
  if (!isPilotUser_()) throw new Error(pilotHoldMessage_());

  var props = PropertiesService.getUserProperties();
  if (!props.getProperty('tt_selections')) {
    throw new Error("Auto-Sync isn't set up on this account yet — choose your courses and click Enable Auto-Sync.");
  }

  ensureSyncTrigger_();
  logUsage_("repair_trigger");
  return "Automatic updates are back on. Your calendar will be checked again within about " +
    SYNC_INTERVAL_MINUTES_ + " minutes.";
}

// ---------------------------------------------------------
// THE BACKGROUND ENGINE
// ---------------------------------------------------------

// Apps Script time-driven triggers pass an event object as the first argument.
// That object is truthy, so we must never forward it to backgroundSyncLocked_.
// Only enableAutoSync calls backgroundSyncLocked_(true) directly.
//
// Never let an error escape to the trigger runtime: a throw inside a time-driven
// trigger makes Google email the student a "Summary of failures" report. The retry
// already happens without the throw — a failed run leaves tt_last_synced_revision
// unchanged, so the next automatic run picks it up from scratch.
function backgroundSync(e) {
  // Proof for getSyncHealth that this user's trigger exists: it just fired. Lets a
  // page load skip the ScriptApp.getProjectTriggers() round trip. Only a real trigger
  // run (which carries triggerUid) may write it; best-effort, never throws.
  if (e && e.triggerUid) {
    try { CacheService.getUserCache().put(TRIGGER_SEEN_KEY_, "1", TRIGGER_SEEN_TTL_SECONDS_); } catch (seenErr) { }
  }
  var lock = LockService.getUserLock();
  if (!lock.tryLock(60000)) return "Sync already in progress, please wait.";

  try {
    return backgroundSyncLocked_(false);
  } catch (err) {
    console.error("Background sync failed (will retry on the next automatic run): " + getErrorMessage_(err));
    return "Sync failed; will retry on the next automatic run.";
  } finally {
    lock.releaseLock();
  }
}

// On-demand "Sync now": applies the latest timetable the tool has fetched (the
// institute itself is re-read by the owner's 30-minute fetch, not here) and checks
// the calendar against it. Uses the SAME user lock as enableAutoSync /
// backgroundSync, so it can never run concurrently with them. Unlike the background
// run it never answers "Already up to date" from the revision alone: with an
// unchanged timetable it still lists and diffs the calendar (verifyCalendar), which
// is what puts back an event the student deleted by mistake. Returns
// { message, calendarId } like enableAutoSync so the UI can deep-link the calendar.
function manualSync(opId) {
  PROGRESS_OP_ID_ = opId ? String(opId).slice(0, 40) : "";
  var props = PropertiesService.getUserProperties();
  if (!props.getProperty('tt_selections')) {
    return { message: "Auto-Sync isn't on yet — choose your courses and enable it first.", calendarId: "" };
  }

  var lock = LockService.getUserLock();
  if (!lock.tryLock(60000)) {
    throw new Error("Another calendar update is still running for your account (usually the automatic background sync) — your calendar was NOT changed. Please try again in a minute.");
  }

  try {
    // Clear any stale terminal progress before the client starts polling, so a
    // cached "complete"/"error" from an earlier run can't be read as this one's
    // (mirrors enableAutoSync).
    var cache = CacheService.getUserCache();
    cache.remove(PROGRESS_KEY);
    clearProgressNote_(cache);

    // Log BEFORE the sync runs, mirroring enableAutoSync: a partial run throws
    // the calm "still finishing" state, yet the user genuinely triggered a
    // manual sync — logging after the call would skip them and undercount.
    logUsage_("manual_sync");

    var result = backgroundSyncLocked_(false, { verifyCalendar: true });
    return {
      message: result,
      calendarId: props.getProperty('tt_calendar_id') || ""
    };
  } finally {
    lock.releaseLock();
  }
}

// ── Recent-changes log ────────────────────────────────────────────────────────
// Human-readable record of institute-driven timetable changes, shown in the UI
// under "Recent timetable changes". Written ONLY by periodic background syncs for
// users who already had a successful sync — never on first enable, selection
// updates, or code-version migrations, where everything would count as "new"
// and flood the list with hundreds of entries.
var CHANGE_LOG_KEY_ = 'tt_change_log';
var CHANGE_LOG_MAX_ = 30;

function changeRecFrom_(summary, description, startMs, endMs) {
  var desc = (description || "").replace(/\r\n/g, "\n");
  var isExam = isExamEventTitle_(summary);
  var isQuiz = isQuizEventTitle_(summary);
  // "🎤 MLBA Guest Lecture — …". Without its own branch the class regex below read
  // the whole title (or just "🎤") as the course code, so a class turning into a
  // guest lecture was reported as "New: 🎤 class" plus "Removed: MLBA (B) class".
  var isGuest = !!summary && summary.indexOf("🎤") === 0;
  var code = "", sec = "", m;
  if (isGuest) {
    m = summary.match(/^🎤\s+(\S+)\s+Guest Lecture/);
    code = m ? m[1] : summary.replace(/^🎤\s+/, "").split(" ")[0];
    // The title carries no section; appendGuestEvents_ writes it as its own line.
    var gSecM = desc.match(/^Section:\s*(.+)$/m);
    sec = gSecM ? gSecM[1].trim() : "";
  } else if (isExam) {
    // "📕 FRM End-Term Exam — Financial Risk Management", or "📕✅ FRM End-Term…"
    // once its marks are on the OLT. The tick stays OPTIONAL — it is still written
    // conditionally by the exam/quiz title builders — but it is always glued to the
    // emoji with the single space after it, so no whitespace tolerance is needed.
    m = summary.match(/^📕✅?\s+(\S+)\s+/);
    code = m ? m[1] : summary.replace(/^📕✅?\s+/, "").split(" ")[0];
  } else if (isQuiz) {
    m = summary.match(/^📝✅?\s+(\S+)\s+Quiz/);
    code = m ? m[1] : summary.replace(/^📝✅?\s+/, "").split(" ")[0];
  } else {
    m = summary.match(/^([^:(]+?)(?:\s*\(([^)]+)\))?\s*:/);
    if (m) {
      code = m[1].trim();
      sec = (m[2] || "").trim();
    } else {
      code = (summary || "").split(" ")[0];
    }
  }
  var instrM = desc.match(/^Instructor:\s*(.+)$/m);
  var placeM = desc.match(/^(?:Place|Exam Hall):\s*(.+)$/m);
  return {
    isQuiz: isQuiz,
    isExam: isExam,
    isGuest: isGuest,
    code: code,
    sec: sec,
    startMs: startMs,
    endMs: endMs,
    instructor: instrM ? instrM[1].trim() : "",
    place: placeM ? placeM[1].trim() : "",
    // Whether this event carried the OLT marks stamp. Read from the DESCRIPTION line
    // (marksUploadedLine_), never the title, so moving the ✅ from suffix to prefix
    // can't read as a marks change on the deploy that moved it.
    marksOnOlt: /^✅\s*Marks uploaded on OLT/m.test(desc)
  };
}

function fmtChangeDay_(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "EEE, d MMM");
}

function fmtChangeRange_(rec) {
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(rec.startMs), tz, "h:mm a") + " – " +
    Utilities.formatDate(new Date(rec.endMs), tz, "h:mm a");
}

// Pairs each created event with a deleted event of the same course/kind/day to
// describe WHAT changed (time / venue / instructor); unpaired ones are reported
// as plain additions or removals.
function describeChanges_(obsoleteEntries, createdPrepared) {
  var tz = Session.getScriptTimeZone();
  var dayKey = function (r) {
    return (r.isExam ? "E" : (r.isQuiz ? "Q" : "C")) + "|" + r.code.toUpperCase() + "|" + r.sec.toUpperCase() + "|" +
      Utilities.formatDate(new Date(r.startMs), tz, "yyyy-MM-dd");
  };
  // A guest lecture shares the class bucket ("C") on purpose: the mirror marks a
  // guest lecture ON the class it replaces, so the two must pair up as one change.
  var label = function (r) {
    return r.code + (r.sec ? " (" + r.sec + ")" : "") +
      (r.isExam ? " exam" : (r.isQuiz ? " quiz" : (r.isGuest ? " guest lecture" : " class")));
  };

  var oldByKey = {};
  for (var o = 0; o < obsoleteEntries.length; o++) {
    var en = obsoleteEntries[o];
    if (en.startMs == null || en.endMs == null) continue;
    var oRec = changeRecFrom_(en.summary, en.description, en.startMs, en.endMs);
    var ok = dayKey(oRec);
    if (!oldByKey[ok]) oldByKey[ok] = [];
    oldByKey[ok].push(oRec);
  }
  var okeys = Object.keys(oldByKey);
  for (var s = 0; s < okeys.length; s++) {
    oldByKey[okeys[s]].sort(function (a, b) { return a.startMs - b.startMs; });
  }

  var newRecs = [];
  for (var c = 0; c < createdPrepared.length; c++) {
    var pr = createdPrepared[c];
    newRecs.push(changeRecFrom_(pr.title, pr.description, pr.startTime.getTime(), pr.endTime.getTime()));
  }
  newRecs.sort(function (a, b) { return a.startMs - b.startMs; });

  var msgs = [];
  for (var n = 0; n < newRecs.length; n++) {
    var nr = newRecs[n];
    var bucket = oldByKey[dayKey(nr)];
    if (bucket && bucket.length > 0) {
      var or = bucket.shift();
      var parts = [];
      if (or.startMs !== nr.startMs || or.endMs !== nr.endMs) {
        parts.push("time " + fmtChangeRange_(or) + " → " + fmtChangeRange_(nr));
      }
      if (or.place && nr.place && or.place !== nr.place) {
        parts.push("venue " + or.place + " → " + nr.place);
      } else if (!or.place && nr.place) {
        parts.push("venue now " + nr.place);
      }
      if (or.instructor && nr.instructor && or.instructor !== nr.instructor) {
        parts.push("instructor " + or.instructor + " → " + nr.instructor);
      }
      if (!or.isGuest && nr.isGuest) parts.push("now a guest lecture instead of the regular class");
      else if (or.isGuest && !nr.isGuest) parts.push("no longer a guest lecture — back to the regular class");
      // Marks reaching the OLT portal is real news for the student, and it arrives
      // as a stamp-only recreate (title/description gain the ✅) that would otherwise
      // be dropped by the no-news rule below. Only ever reported one way: a stamp
      // that disappears (institute un-flags a row) stays silent, matching the rule
      // that this tool never shows a "marks NOT uploaded" indicator.
      if ((nr.isQuiz || nr.isExam) && !or.marksOnOlt && nr.marksOnOlt) {
        parts.push("marks now uploaded on OLT");
      }
      // A recreate whose time/venue/instructor are all unchanged carries no news
      // for the student (e.g. an internal description or colour tweak) — log
      // nothing rather than a vague "details updated". The paired old event was
      // already consumed from the bucket above, so it won't surface as a "Removed".
      if (parts.length > 0) {
        msgs.push(label(nr) + " · " + fmtChangeDay_(nr.startMs) + ": " + parts.join("; "));
      }
    } else {
      msgs.push("New: " + label(nr) + " · " + fmtChangeDay_(nr.startMs) + " · " + fmtChangeRange_(nr) +
        (nr.place ? " · " + nr.place : ""));
    }
  }
  var leftKeys = Object.keys(oldByKey);
  for (var l = 0; l < leftKeys.length; l++) {
    var leftovers = oldByKey[leftKeys[l]];
    for (var li = 0; li < leftovers.length; li++) {
      var lr = leftovers[li];
      msgs.push("Removed: " + label(lr) + " · " + fmtChangeDay_(lr.startMs) + " · " + fmtChangeRange_(lr));
    }
  }
  return msgs;
}

function recordTimetableChanges_(props, obsoleteEntries, createdPrepared) {
  var msgs = describeChanges_(obsoleteEntries, createdPrepared);
  if (msgs.length === 0) return;
  if (msgs.length > CHANGE_LOG_MAX_) {
    var extra = msgs.length - (CHANGE_LOG_MAX_ - 1);
    msgs = msgs.slice(0, CHANGE_LOG_MAX_ - 1);
    msgs.push("…and " + extra + " more changes in this update");
  }
  var log = [];
  try {
    log = JSON.parse(props.getProperty(CHANGE_LOG_KEY_) || "[]");
    if (!Array.isArray(log)) log = [];
  } catch (e) {
    log = [];
  }
  var now = Date.now();
  var entries = msgs.map(function (msg) { return { at: now, m: msg }; });
  log = entries.concat(log).slice(0, CHANGE_LOG_MAX_);
  props.setProperty(CHANGE_LOG_KEY_, JSON.stringify(log));
}

// Resolves a saved selection value ("CODE" or "CODE-SECTION") against the course
// catalogue, mirroring the client's extractCode: codes can contain hyphens (PM-F,
// TG-II), so the full value is tried as a code first and only then split at the
// last hyphen. Returns { code, section } (section "" when none) or null for a
// value that matches no catalogue course. Used to derive enrollment directly from
// the selections so quizzes/exams never depend on MasterData class rows existing.
function resolveSelectionCode_(sel) {
  var s = String(sel == null ? "" : sel).trim();
  if (!s) return null;
  if (COURSE_INFO_[s.toUpperCase()]) return { code: s, section: "" };
  var at = s.lastIndexOf("-");
  if (at > 0 && COURSE_INFO_[s.substring(0, at).toUpperCase()]) {
    return { code: s.substring(0, at), section: s.substring(at + 1) };
  }
  return null;
}

// Everything a per-user run does once term_ended_at is set: cross out the user's
// synced events (once), then remove their own periodic trigger. Runs in the
// trigger path, so it never throws.
//
// Retry contract: the trigger is KEPT while a cross-out pass reports failures, so
// the next automatic run (30 min later) finishes the leftovers — but only up to
// TERM_END_STRIKE_MAX_ATTEMPTS_ runs, after which the pass is marked done anyway
// so a permanently broken calendar can't keep a dead-term trigger alive forever.
// tt_term_end_struck is the idempotence latch; it also drives the un-strike heal
// on "Reopen term" (see backgroundSyncLocked_). Users with no selections (never
// enabled, or disabled — their calendar was deleted) have nothing to cross out.
function handleTermEndOnSync_(props) {
  if (props.getProperty('tt_term_end_struck') !== '1' && props.getProperty('tt_selections')) {
    var attempts = parseInt(props.getProperty('tt_term_end_strike_attempts') || '0', 10) + 1;
    try { props.setProperty('tt_term_end_strike_attempts', String(attempts)); } catch (attErr) { }
    var res;
    try {
      // findOwnedCalendar_, never getOrCreate: a user who manually deleted the
      // calendar must not get an empty one created just to cross out nothing.
      var cal = findOwnedCalendar_(CALENDAR_NAME);
      res = cal ? patchSyncedEventTitles_(cal, strikeTitle_) : { failed: 0, patched: 0 };
    } catch (strikeErr) {
      console.warn("Term-end cross-out failed: " + getErrorMessage_(strikeErr));
      res = { failed: 1, patched: 0 };
    }
    if (res.failed > 0 && attempts < TERM_END_STRIKE_MAX_ATTEMPTS_) {
      // Keep the trigger — the next automatic run retries the leftovers
      // (strikeTitle_ is idempotent, so already-struck events are skipped).
      return "Term has ended; finishing the final calendar markup on the next run.";
    }
    try {
      props.setProperty('tt_term_end_struck', '1');
      props.deleteProperty('tt_term_end_strike_attempts');
    } catch (latchErr) { }
  }
  try { deleteUserTriggers_(); } catch (trigErr) { /* best-effort cleanup */ }
  return "Term has ended; no further automatic updates.";
}

// MasterData's own section keys, per course code: { CODE: { sections: {SEC:true},
// count: n } }. Read straight off the sheet the sync itself matches against, so
// there is exactly one definition of "what does a selection string have to say".
//
// Selections are matched by EXACT string ("M&A", "MLBA-B") against
// code + "-" + section built from the row, so a selection whose section half
// disagrees with the timetable matches nothing at all and that course silently
// contributes zero events. The institute's enrolment tab and the institute's
// timetable are two different sheets maintained by two different people — today
// they agree (only AMS, B2B and MLBA carry a Grp, and only those three tabs have
// a Section column), but nothing enforces it. This is what lets the seeder
// reconcile the two instead of trusting that they match.
function masterDataSectionIndex_() {
  var out = {};
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  if (!sheet) return out;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var code = data[i][3] ? data[i][3].toString().trim() : "";
    if (!code) continue;
    var section = data[i][4] ? data[i][4].toString().trim() : "";
    if (!out[code]) out[code] = { sections: {}, count: 0 };
    out[code].sections[section] = true;
    out[code].count++;
  }
  return out;
}

// Turn (course code, the section the institute's enrolment tab gave) into the
// selection string that will actually match MasterData rows — the same
// reconciliation the client's findSectionKey does, so the automatic seed and a
// hand-pick can never disagree.
//
// Returns null when the course runs several sections and the enrolment tab does
// not say which one this student is in: guessing would put them in a stranger's
// classes, so the caller reports it and the student picks that one course by hand.
function resolveSeedSelection_(code, section, sectionIndex) {
  var entry = sectionIndex[code];
  // No class rows for this course (independent study, dissertation, or a course
  // whose timetable rows have not been published yet). Keep the plain code: it
  // carries no false section claim, and quizzes/exams still attach to it.
  if (!entry) return code;
  var keys = Object.keys(entry.sections);
  var want = String(section || "").trim().toUpperCase();
  if (want) {
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toUpperCase() === want) return keys[i] ? (code + "-" + keys[i]) : code;
    }
    // The tab named a section the timetable does not run. If the timetable has
    // just one group, that group IS this student's class — take it rather than
    // seeding a key that matches nothing.
    if (keys.length === 1) return keys[0] ? (code + "-" + keys[0]) : code;
    return null;
  }
  if (keys.length === 1) return keys[0] ? (code + "-" + keys[0]) : code;
  return null;   // several sections, and nothing says which
}

// ── How each student's courses are found (config.gs → THIS_TERM.courseSelection) ──
//   "section"   first-year terms: everyone takes the term's courses with their own
//               section from the roster, so the selection can be derived outright;
//   "electives" second-year terms: read from the institute's published elective
//               allotment tabs (getMyElectives / handoverSelectionsFromElectives_);
//   "pick"      nothing to derive from — students tick their own courses.
// "electives" without an allotment link configured falls back to "pick" rather
// than failing on every read.
function enrolmentMode_() {
  if (COURSE_SELECTION_ === "section") return "section";
  if (COURSE_SELECTION_ === "electives" && ELECTIVES_CSV_URL !== PENDING_URL_) return "electives";
  return "pick";
}

// A roll may take a course unless the course is limited (COURSES → onlyFor) to
// roll prefixes the roll does not start with — e.g. an MBA-TM-only core course.
function rollMayTakeCourse_(roll, code) {
  var info = COURSE_INFO_[code];
  if (!info) return false;
  if (!info.onlyFor || !info.onlyFor.length) return true;
  var r = String(roll || "").toUpperCase();
  for (var i = 0; i < info.onlyFor.length; i++) {
    if (r.indexOf(info.onlyFor[i]) === 0) return true;
  }
  return false;
}

// Section mode's whole rule, in one place: a student takes every course the
// timetable runs for THEIR section, plus every course it runs for the whole batch
// at once (a single group with no section). A course taught only to other
// sections is not theirs; a course with no timetable rows yet cannot be placed and
// is left for checkElectiveDrift_ to offer once its rows appear.
// Returns [{ code, section }] in COURSE_INFO_ order.
function sectionCoursesFor_(roll, section, sectionIndex) {
  var out = [];
  var want = String(section || "").trim().toUpperCase();
  var codes = Object.keys(COURSE_INFO_);
  for (var i = 0; i < codes.length; i++) {
    var code = codes[i];
    if (!rollMayTakeCourse_(roll, code)) continue;
    var entry = sectionIndex[code];
    if (!entry) continue;
    var keys = Object.keys(entry.sections);
    var match = null;
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] && want && keys[k].toUpperCase() === want) { match = keys[k]; break; }
    }
    if (match !== null) out.push({ code: code, section: match });
    else if (keys.length === 1 && keys[0] === "") out.push({ code: code, section: "" });
  }
  return out;
}

// getMyElectives' answer in section mode — the same payload shape, so the page's
// "your courses are already selected" card works unchanged.
function mySectionCourses_(student) {
  if (!student) return { ok: false, reason: "not_on_roster" };
  if (!student.section) return { ok: false, reason: "no_section" };
  var sectionIndex = masterDataSectionIndex_();
  if (!Object.keys(sectionIndex).length) return { ok: false, reason: "not_ready" };
  var picks = sectionCoursesFor_(student.rollNo, student.section, sectionIndex);
  if (!picks.length) return { ok: false, reason: "no_picks" };
  var electives = [], totalCredits = 0;
  for (var i = 0; i < picks.length; i++) {
    var info = COURSE_INFO_[picks[i].code];
    electives.push({ code: picks[i].code, name: info.name, area: info.area,
                     credits: info.credits, section: picks[i].section });
    totalCredits += info.credits;
  }
  try { logUsage_("electives_fetch"); } catch (logErr) {}
  return {
    ok: true,
    source: "section",
    section: student.section,
    roll: student.rollNo,
    name: student.name,
    electives: electives,
    required: [],
    totalSubjects: electives.length,
    totalCredits: Math.round(totalCredits * 10) / 10
  };
}

// handoverSelectionsFromElectives_'s answer in section mode. Same contract: ok:false
// means "cannot tell yet, retry" (no roll, not on the roster, MasterData empty),
// never "enrolled in nothing".
function sectionSelections_(roll, student) {
  if (!student) return { ok: false, selections: [], unresolved: [], reason: "not on the roster: " + roll };
  var sectionIndex = masterDataSectionIndex_();
  if (!Object.keys(sectionIndex).length) {
    return { ok: false, selections: [], unresolved: [], reason: "MasterData not populated yet" };
  }
  var picks = sectionCoursesFor_(student.rollNo, student.section, sectionIndex);
  return {
    ok: true,
    selections: picks.map(function (p) { return p.section ? p.code + "-" + p.section : p.code; }),
    unresolved: [],
    classless: []
  };
}

// This student's Term 5 course selections, derived from the institute's own
// elective enrolment tabs instead of asked for again.
//
// WHY DERIVE RATHER THAN ASK
// --------------------------
// The Term 4 and Term 5 course codes are fully disjoint (47 vs 30, zero overlap),
// so every stored tt_selections value is meaningless the moment this build lands.
// Clearing it and waiting would leave the whole batch with an empty calendar until
// each person happened to open the tool. The per-course elective tabs already are
// the institute's authoritative record of who is enrolled in what — the same
// source getMyElectives shows a student on the confirmation screen — so the
// selections can simply be read rather than re-collected.
//
// Returns [] on ANY doubt (no roll, sheet unavailable, nothing enrolled). The
// caller treats [] as "leave selections empty and let them pick by hand", which is
// the safe direction to fail: an empty calendar and a visible prompt, never a
// calendar full of somebody else's classes.
//
// Selection strings match the format enableAutoSync stores and
// resolveSelectionCode_ reads: "CODE" for a single-section course,
// "CODE-SECTION" where the student's tab names a section. Note codes may
// themselves contain a hyphen ("AA-I"), which resolveSelectionCode_ handles by
// testing the prefix against COURSE_INFO_.
function handoverSelectionsFromElectives_() {
  try {
    var email = Session.getActiveUser().getEmail() || "";
    var student = lookupStudentByEmail_(email);
    var roll = student ? student.rollNo : (email ? email.split("@")[0].toUpperCase() : "");
    // No roll and no catalogue are both "cannot tell", never "enrolled in
    // nothing" — ok:false so the caller retries instead of latching an empty seed.
    if (!roll) return { ok: false, selections: [], unresolved: [], reason: "no roll" };

    var mode = enrolmentMode_();
    if (mode === "pick") return { ok: true, selections: [], unresolved: [] };   // nothing to derive from
    if (mode === "section") return sectionSelections_(roll, student);

    var catalogue = getElectiveCatalogue_();
    if (!catalogue.length) return { ok: false, selections: [], unresolved: [], reason: "catalogue unreadable" };

    // Compulsory courses are enrolled-by-definition and live outside the
    // catalogue's elective rows, so they are looked up alongside them — exactly
    // as getMyElectives does — and seeded too.
    var requiredCodes = [];
    var allCodes = Object.keys(COURSE_INFO_);
    for (var r = 0; r < allCodes.length; r++) {
      if (COURSE_INFO_[allCodes[r]].required) requiredCodes.push(allCodes[r]);
    }

    var lookupCodes = requiredCodes.slice();
    for (var c = 0; c < catalogue.length; c++) lookupCodes.push(catalogue[c].code);
    var secRead = getElectiveSectionMaps_(lookupCodes);
    var secMaps = secRead.maps;
    // Refuse to seed from an incomplete read. Returning the courses that DID load
    // would look like success — a non-empty list latches the handover — and this
    // student would then carry a permanently short calendar with nothing to
    // notice it. [] means "try again in half an hour", which is the only safe
    // reading of a partial enrolment sheet.
    if (secRead.missing.length) {
      console.warn("Handover seeding deferred — " + secRead.reason);
      return { ok: false, selections: [], unresolved: [], reason: secRead.reason };
    }

    // MasterData is what a selection string has to match, so seeding before it is
    // populated would resolve every sectioned course to its bare code — "MLBA"
    // instead of "MLBA-B" — which matches no row at all. An empty index is
    // "not ready", never "no sections": defer and let the next run seed properly.
    var sectionIndex = masterDataSectionIndex_();
    if (!Object.keys(sectionIndex).length) {
      return { ok: false, selections: [], unresolved: [],
               reason: "MasterData not populated yet" };
    }

    var selections = [];
    var unresolved = [];
    var classless = [];
    var seen = {};
    function add(code, section) {
      // A catalogue row with no COURSE_INFO_ entry is an information-only listing
      // (independent study, dissertation) with no timetabled classes — syncing it
      // would select a course the parser can never match.
      if (!code || !COURSE_INFO_[code]) return;
      var value = resolveSeedSelection_(code, section, sectionIndex);
      if (value === null) { unresolved.push(code); return; }
      if (seen[value]) return;
      seen[value] = true;
      selections.push(value);
      // No timetable rows at all (independent study, dissertation): enrolled, but it
      // can never produce a class. checkElectiveDrift_ needs to know which these are.
      if (!sectionIndex[code]) classless.push(code);
    }

    for (var k = 0; k < catalogue.length; k++) {
      var entry = catalogue[k];
      var map = secMaps[entry.code];
      if (!map || map[roll] === undefined) continue;   // presence == enrolled
      add(entry.code, map[roll] || "");
    }
    for (var q = 0; q < requiredCodes.length; q++) {
      var rCode = requiredCodes[q];
      var rMap = secMaps[rCode];
      // A compulsory course the student is absent from still applies to them —
      // that is what compulsory means — so it is seeded with whatever section the
      // tab gives, or none.
      add(rCode, (rMap && rMap[roll]) || "");
    }
    return { ok: true, selections: selections, unresolved: unresolved, classless: classless };
  } catch (e) {
    console.warn("Handover selection seeding failed: " + getErrorMessage_(e));
    return { ok: false, selections: [], unresolved: [], reason: getErrorMessage_(e) };
  }
}

// Does what the institute's enrolment sheet says today still match what this
// student is syncing?
//
// The seed runs ONCE, at handover. Add/drop happens after it — a student swaps a
// course in week one, the institute updates its tab, and nothing here would ever
// notice: they would sync a dropped course all term and never see the one they
// moved to. The seed cannot simply be re-run, because a student is also allowed to
// edit their own picks and re-seeding would silently overwrite that.
//
// So this only ever REPORTS. The difference is written to tt_electives_drift, the
// health payload carries it, and the student gets one button that re-applies the
// institute's list if they want it. Nothing is changed for them.
//
// Throttled: the read is script-cached and shared, but the comparison still costs a
// cache round trip, and enrolment changes on a scale of days, not minutes.
var ELECTIVES_DRIFT_PROP_ = "tt_electives_drift";
var ELECTIVES_DRIFT_CHECKED_PROP_ = "tt_electives_drift_at";
var ELECTIVES_DRIFT_INTERVAL_MS_ = 6 * 60 * 60 * 1000;   // 6 h

function checkElectiveDrift_(props, selections) {
  if (enrolmentMode_() === "pick") return;   // students choose for themselves; nothing to drift from
  try {
    var lastAt = Number(props.getProperty(ELECTIVES_DRIFT_CHECKED_PROP_) || '0');
    if (lastAt && (Date.now() - lastAt) < ELECTIVES_DRIFT_INTERVAL_MS_) return;

    var seed = handoverSelectionsFromElectives_();
    // An incomplete read tells us nothing about drift — and a "removed" list built
    // from tabs that failed to load would accuse the student of dropping courses
    // Google merely failed to serve. Say nothing and look again later.
    if (!seed.ok) return;
    try { props.setProperty(ELECTIVES_DRIFT_CHECKED_PROP_, String(Date.now())); } catch (e) { }

    // An audited (sit-in) course is deliberately absent from the institute's
    // enrolment list — that is what auditing IS — so comparing it would report
    // "no longer listed" every half hour for the whole term and train this
    // student to ignore a card that exists to catch real add/drops. Excluded
    // from BOTH sides. No-op for everyone else. See COURSE_AUDIT_.
    var auditedDrift = auditRuleForUser_().classesOnly;
    // A course with no timetable rows (CIS-T5, DIS-2) is left out for a related
    // reason: it produces no events, so having it or not changes nothing on the
    // calendar — and the picker has no checkbox for it, so a student who lost it
    // could never "take the institute's list" back. Reporting it only produced a
    // card that reappeared on every run and could not be acted on.
    var classlessDrift = {};
    for (var cl = 0; cl < (seed.classless || []).length; cl++) {
      classlessDrift[String(seed.classless[cl]).toUpperCase()] = true;
    }
    var auditedSel = function (sel) {
      var r = resolveSelectionCode_(sel);
      return !!(r && (auditedDrift[r.code.toUpperCase()] || classlessDrift[r.code.toUpperCase()]));
    };

    var have = {}, want = {};
    for (var i = 0; i < selections.length; i++) {
      if (auditedSel(selections[i])) continue;
      have[selections[i]] = true;
    }
    for (var j = 0; j < seed.selections.length; j++) {
      if (auditedSel(seed.selections[j])) continue;
      want[seed.selections[j]] = true;
    }

    var added = [], removed = [];
    for (var w in want) if (want.hasOwnProperty(w) && !have[w]) added.push(w);
    for (var h in have) if (have.hasOwnProperty(h) && !want[h]) removed.push(h);

    if (!added.length && !removed.length) {
      try { props.deleteProperty(ELECTIVES_DRIFT_PROP_); } catch (e) { }
      return;
    }
    try {
      props.setProperty(ELECTIVES_DRIFT_PROP_, JSON.stringify({ added: added, removed: removed }));
    } catch (e) { }
  } catch (e) {
    // Purely informational. A drift check that throws must never affect a sync.
    console.warn("Elective drift check skipped: " + getErrorMessage_(e));
  }
}

// The one-time Term 4 → Term 5 handover for THIS student. Returns null when there
// is nothing to do (already handed over), a string to short-circuit the caller
// when the pass needs another run, or undefined once it has completed and the
// caller should carry on into the normal sync.
//
// ORDER MATTERS, and it is the reason this cannot reuse "End term":
//   1. Cross out Term 4 in the Term 4 calendar — while PREVIOUS_TERM_ is still the
//      only name that reaches those events. The CODE_VERSION migration further
//      down backgroundSyncLocked_ operates on CALENDAR_NAME, which is now Term 5;
//      it would create an empty Term 5 calendar, delete nothing, and strand every
//      Term 4 event live in a calendar no code path references again.
//   2. Only then clear the Term 4 per-user state and seed Term 5's.
//
// Term 4's own events are NOT deleted. They are struck through and left in the
// "IIM Sirmaur – Term 4" calendar, which the student keeps and can hide or delete
// themselves — their record of the term survives, and the pass is reversible.
//
// `opts.explicitSelection` — set ONLY by enableAutoSync, which calls this BEFORE it
// saves the courses the student has just chosen. Two things differ in that mode:
//   • nothing is seeded — the student is choosing their courses right now, and the
//     institute's list must not overwrite what they picked;
//   • it always completes (never returns a "needs another run" string) — a Term 4
//     cross-out that hits a rate limit must not block someone switching the tool on.
// Without this, a student whose first-ever Term 5 action was Enable reached the
// handover from INSIDE the enable, AFTER their picks had been saved: it mistook
// those picks for Term 4 residue, deleted them and replaced them with the seed — or,
// for a student in no elective tab (MBA-TTHM, PhD), left them with nothing, deleted
// the trigger just created and answered "choose your courses" to the Enable press.
function handleTermHandover_(props, opts) {
  if (props.getProperty('tt_handover') === HANDOVER_VERSION_) return null;
  var explicitSelection = !!(opts && opts.explicitSelection);

  // A student who never enabled the tool in Term 4 has no calendar and no stale
  // state. Latch and fall straight through to the ordinary first-time flow.
  var hadTerm4 = !!props.getProperty('tt_selections');

  // Counted for every pass, not just the cross-out, because the seeding step
  // below shares the same retry budget.
  var attempts = parseInt(props.getProperty('tt_handover_attempts') || '0', 10) + 1;
  try { props.setProperty('tt_handover_attempts', String(attempts)); } catch (attErr) { }

  if (hadTerm4) {
    var res;
    try {
      // No previous term configured (a first install): nothing to cross out.
      var prevCal = PREVIOUS_TERM_.calendarName ? findOwnedCalendar_(PREVIOUS_TERM_.calendarName) : null;
      // strikeTitle_ is idempotent (it no-ops on an already-struck title), so a
      // partially-failed pass is safely re-run from scratch on the next tick.
      // The explicit window is essential — without it the listers default to
      // Term 5's dates and miss most of Term 4. See PREVIOUS_TERM_.
      res = prevCal
        ? patchSyncedEventTitles_(prevCal, strikeTitle_,
            { start: PREVIOUS_TERM_.syncWindowStart, end: PREVIOUS_TERM_.syncWindowEnd })
        : { failed: 0, patched: 0 };
    } catch (strikeErr) {
      console.warn("Handover cross-out failed: " + getErrorMessage_(strikeErr));
      res = { failed: 1, patched: 0 };
    }

    if (res.failed > 0 && attempts < HANDOVER_STRIKE_MAX_ATTEMPTS_ && !explicitSelection) {
      // Do NOT latch and do NOT clear state: the next automatic run finishes the
      // leftovers. Returning here also leaves Term 5 unsynced for now, which is
      // the right trade — a half-struck Term 4 alongside a live Term 5 is more
      // confusing than a short delay.
      return "Moving you to " + TERM_CONFIG_.label + "; finishing the last of the " +
        PREVIOUS_TERM_.label + " calendar markup on the next run.";
    }
    // Past the attempt cap we proceed anyway rather than trapping this student in
    // Term 4 forever; whatever could not be struck stays struck-free but inert,
    // since nothing syncs to that calendar any more.
  }

  // Seeding is for students the tool is ALREADY RUNNING FOR — either they carried
  // Term 4 selections, or they still hold a live backgroundSync trigger (Google
  // can drop selections without dropping the trigger). It is not an enrolment
  // mechanism: someone who never switched the tool on must not have a calendar
  // built for them off the back of a deploy they never asked for. They keep the
  // ordinary opt-in flow — which, post-fix, pre-selects everything for them the
  // moment they open the page, so they still never pick a subject by hand.
  var eligibleToSeed = hadTerm4 && !explicitSelection;
  if (!eligibleToSeed && !explicitSelection) {
    try {
      var trigs = ScriptApp.getProjectTriggers();
      for (var t = 0; t < trigs.length; t++) {
        if (trigs[t].getHandlerFunction() === 'backgroundSync') { eligibleToSeed = true; break; }
      }
    } catch (probeErr) { /* unreadable trigger list — fall back to hadTerm4 */ }
  }

  // Seeded BEFORE anything is cleared, so a transient failure costs nothing. The
  // elective tabs are fetched over the network: an outage, a rate limit or a
  // half-published sheet all surface as ok:false, and latching on that would strip
  // an active student's selections, delete their trigger and leave them silently
  // unsynced until they noticed. Retry instead.
  //
  // ok:false ("could not read the sheet") and ok:true with an empty list ("read it
  // fine; this student is in none of its tabs") are deliberately different states.
  // Only the first is worth retrying, and it gets its OWN budget — far larger than
  // the cross-out's, and counted only on the runs that actually failed to read.
  // Sharing one counter meant a slow morning at Google's end could exhaust the
  // budget in 2½ hours and latch an enrolled student with no courses at all.
  var seedResult = eligibleToSeed
    ? handoverSelectionsFromElectives_()
    : { ok: true, selections: [], unresolved: [] };
  if (!seedResult.ok) {
    var seedTries = parseInt(props.getProperty('tt_seed_attempts') || '0', 10) + 1;
    try { props.setProperty('tt_seed_attempts', String(seedTries)); } catch (e) { }
    if (seedTries < HANDOVER_SEED_MAX_ATTEMPTS_) {
      // Give back the cross-out attempt this run consumed: it succeeded, and only
      // the sheet read failed. Otherwise a long outage would also burn the budget
      // that governs the Term 4 markup.
      try { props.setProperty('tt_handover_attempts', String(attempts - 1)); } catch (e) { }
      return "Moving you to " + TERM_CONFIG_.label + "; waiting on the institute's enrolment sheet.";
    }
    console.warn("Handover seeding gave up after " + seedTries + " attempts: " +
      (seedResult.reason || "unknown"));
  }
  var seeded = seedResult.selections || [];
  // A course the enrolment tab could not be pinned to a timetable section (several
  // sections run, the tab names none). Recorded so the student is shown exactly
  // which one still needs a hand-pick instead of just finding a gap.
  try {
    if (seedResult.unresolved && seedResult.unresolved.length) {
      props.setProperty('tt_seed_unresolved', JSON.stringify(seedResult.unresolved));
    } else {
      props.deleteProperty('tt_seed_unresolved');
    }
  } catch (e) { }

  // Term 4 residue. Every one of these describes the old term and would otherwise
  // be read as current: tt_selections holds codes that no longer exist,
  // tt_calendar_id deep-links the UI's "Open Google Calendar" button at the wrong
  // calendar, and the revision/partial markers would make a Term 5 sync think it
  // had already run.
  var stale = ['tt_selections', 'tt_last_synced_revision', 'tt_last_synced_at',
    'tt_calendar_id', 'tt_partial_sync_revision', 'tt_partial_sync_attempts',
    'tt_code_version', 'tt_resync_version'];
  for (var i = 0; i < stale.length; i++) {
    try { props.deleteProperty(stale[i]); } catch (delErr) { }
  }
  // Term 4 may have ended, which would have left this latch set and armed the
  // un-strike heal in backgroundSyncLocked_. Left in place it would walk the
  // Term 5 calendar trying to repair titles that were never struck.
  try { props.deleteProperty('tt_term_end_struck'); } catch (e) { }
  try { props.deleteProperty('tt_term_end_strike_attempts'); } catch (e) { }

  if (seeded.length) {
    try {
      props.setProperty('tt_selections', JSON.stringify(seeded));
      // The seeded rebuild recreates this student's whole term at once. Logging
      // that as "recent timetable changes" would bury the real institute changes
      // under a few hundred "new class" rows on their first look.
      props.setProperty('tt_changelog_skip_once', '1');
    } catch (seedErr) {
      console.warn("Could not store seeded selections: " + getErrorMessage_(seedErr));
    }
  }

  try {
    props.setProperty('tt_handover', HANDOVER_VERSION_);
    props.deleteProperty('tt_handover_attempts');
    props.deleteProperty('tt_seed_attempts');
  } catch (latchErr) { }
  // The handover runs in each student's own account, where no admin can see it —
  // so say what happened in the Usage log. "handover" means the tool carried on for
  // them with seeded courses; "handover_empty" means it found nothing to seed and
  // the sync is about to stop (backgroundSyncLocked_ removes the trigger), which is
  // why isDisableAction_ counts it as a stop. Only logged when the tool was actually
  // running for them — a student who never used it had nothing handed over, and an
  // explicit Enable logs its own "enable".
  if (eligibleToSeed) logUsage_(seeded.length ? "handover" : "handover_empty");
  return undefined;   // handover complete — fall through into the normal sync
}

// `opts.verifyCalendar` (manualSync only): when the timetable has NOT changed since
// this student's last sync, still list and diff the calendar instead of answering
// "Already up to date" from the revision alone — so a student's own press of Sync now
// puts back an event they deleted or dragged by mistake. Such a repair is not an
// institute change, so it is kept out of their "Recent timetable changes".
function backgroundSyncLocked_(forceSync, opts) {
  // Open a telemetry window for this run so the calendar-path helpers can flag
  // which write path they took (see logSyncPath_). Set before any path work; the
  // cheap early-returns below leave it set but never buffer an event (only a
  // successful sync that did real work does), which is harmless.
  beginPathTelemetry_();
  var props = PropertiesService.getUserProperties();
  var scriptProps = PropertiesService.getScriptProperties();
  var termEnded = !!scriptProps.getProperty('term_ended_at');

  if (termEnded) {
    // Term end is absolute — forceSync included, so not even a console-driven
    // enable/manual sync can modify a calendar once the admin has closed the
    // term. The one job left is the final cross-out of this user's synced
    // events; their own periodic trigger is removed once that completes (see
    // handleTermEndOnSync_) instead of firing a no-op every half hour forever.
    return handleTermEndOnSync_(props);
  }

  // Pilot gate — above EVERYTHING that touches a calendar (handover, version
  // migration, diff, create/delete). A held-back student's trigger fires, reaches
  // this line, and returns; their Term 4 calendar is untouched and no Term 5
  // calendar is created. See PILOT_ROLLS_.
  if (!isPilotUser_()) return pilotHoldMessage_();

  // One-time Term 4 → Term 5 handover, deliberately placed here: AFTER the term-end
  // gate (a term the admin has closed stays closed — the handover is started from
  // the menu, which lifts that flag first) and BEFORE tt_selections is read, since
  // the handover is what clears the Term 4 value and seeds the Term 5 one.
  var handover = handleTermHandover_(props);
  if (typeof handover === 'string') return handover;   // needs another run

  var savedSelections = props.getProperty('tt_selections');
  if (!savedSelections) {
    // Post-handover this means the elective tabs had no enrolment for them (or
    // were unreachable). Their Term 4 events are already struck, so say what is
    // actually true rather than the bare "No courses saved."
    if (props.getProperty('tt_handover') === HANDOVER_VERSION_) {
      deleteUserTriggers_();
      return TERM_CONFIG_.label + " has started. Open the tool and choose your courses to sync them.";
    }
    return "No courses saved.";
  }

  var selections;
  try {
    selections = JSON.parse(savedSelections);
    if (!Array.isArray(selections)) selections = [];
  } catch (e) {
    selections = [];
  }

  if (selections.length === 0) {
    deleteUserTriggers_();
    props.deleteProperty('tt_last_synced_revision');
    props.deleteProperty('tt_last_synced_at');
    props.deleteProperty('tt_partial_sync_revision');
    props.deleteProperty('tt_partial_sync_attempts');
    return "No courses selected. Sync disabled and triggers cleaned.";
  }

  // A sit-in course is added for the student rather than left to them to find and
  // tick — see COURSE_AUDIT_. Deliberately AFTER the two guards above, so this can
  // only ever extend a selection that already exists and never enables the tool for
  // somebody who has not asked for it. Returns the same array for everyone else.
  selections = withAuditedSelections_(selections);

  ensureSyncTrigger_();

  // Heal pass after a "Reopen term": if this user's events were crossed out by
  // an earlier End term, strip the strike marks back off before diffing. Titles
  // sit outside [TT_SIG], so the diff alone would never repair them. Best-effort:
  // the flag is only cleared on a fully clean pass, so a partial failure retries
  // on the next run while the normal sync below proceeds regardless. Skipped
  // while a CODE_VERSION migration is pending — the wipe below deletes every
  // struck event anyway, and the latch then clears itself on the following
  // run's (no-op) pass.
  if (props.getProperty('tt_term_end_struck') === '1' &&
    (props.getProperty('tt_code_version') || "") === CODE_VERSION) {
    try {
      var healCal = findOwnedCalendar_(CALENDAR_NAME);
      var healRes = healCal ? patchSyncedEventTitles_(healCal, unstrikeTitle_) : { failed: 0, patched: 0 };
      if (healRes.failed === 0) {
        props.deleteProperty('tt_term_end_struck');
        props.deleteProperty('tt_term_end_strike_attempts');
      }
    } catch (healErr) {
      console.warn("Term-reopen title heal failed (will retry next run): " + getErrorMessage_(healErr));
    }
  }

  // Enrolment can change after the one-time seed (add/drop). This only compares and
  // records; it never edits selections, and it runs at most every 6 hours.
  checkElectiveDrift_(props, selections);

  var masterRev = scriptProps.getProperty('master_data_revision') || "0";
  var lastRev = props.getProperty('tt_last_synced_revision') || "0";

  // Popup-reminder preference, read up front because it participates in the
  // "anything to do?" decision below. tt_reminder_applied tracks which value is
  // confirmed applied on the calendar: reminders live outside the event signature
  // (see computeEventSig_), so a changed preference is patched onto matched events
  // (applyReminderToMatched_) rather than rebuilding the calendar.
  // Migration: the property is missing on the first run after the 2026-07-10
  // deploy — events created by older code were built with the current tt_popup
  // baked in, so that value is recorded as already applied (no patch pass needed).
  var popupReminder = props.getProperty('tt_popup') || "";
  var appliedReminder = props.getProperty('tt_reminder_applied');
  if (appliedReminder === null) {
    try { props.setProperty('tt_reminder_applied', popupReminder); } catch (remInitErr) { }
    appliedReminder = popupReminder;
  }
  var reminderPending = appliedReminder !== popupReminder;

  // Change-log eligibility — decided BEFORE the migration block below can force
  // a full wipe. The skip-once marker is set by enableAutoSync (user-driven
  // selection changes are not institute changes). It is consumed only by a
  // SUCCESSFUL sync (see the completion block): if this run fails partway, the
  // automatic retry that finishes the user's own selection change must not log
  // the remainder as "institute changes".
  var changelogSkipOnce = props.getProperty('tt_changelog_skip_once') === '1';
  var changelogEligible = !changelogSkipOnce && !!props.getProperty('tt_last_synced_at');

  // Auto-migration: if the deployed code version is newer than what this user
  // last ran, wipe all old timetable events and force a full re-sync so no
  // stale events from the previous version survive.
  var storedCodeVersion = props.getProperty('tt_code_version') || "";
  if (storedCodeVersion !== CODE_VERSION) {
    changelogEligible = false; // full wipe+recreate: everything would log as "new"
    var migCache = CacheService.getUserCache();
    var migCal = getOrCreateCalendar_(CALENDAR_NAME);
    putProgressNote_(migCache, "Applying update…");
    var migResult = deleteEventsWithFallback_(
      migCal, migCache,
      function () { return listLegacyTimetableEventIds_(migCal); },
      function () { return slowListLegacyTimetableEvents_(migCal); }
    );
    clearProgressNote_(migCache);
    if (migResult.failed > 0) {
      // Don't mark as migrated — the next automatic run will retry from here.
      var migErrMsg = "Update migration: could not clear " + migResult.failed +
        " of " + (migResult.deleted + migResult.failed) + " old event(s). Will retry on the next automatic sync.";
      if (migResult.lastError) migErrMsg += " " + getErrorMessage_(migResult.lastError);
      throw new Error(migErrMsg);
    }
    forceSync = true;
  } else if ((props.getProperty('tt_resync_version') || "") !== RESYNC_VERSION) {
    // Content-only deploy (see RESYNC_VERSION): force a diff sync WITHOUT the
    // wipe. Events whose signature changed get replaced; everything else is
    // verified in place. Deploy-driven recreations aren't institute changes,
    // so they must not land in the user's "Recent timetable changes".
    changelogEligible = false;
    forceSync = true;
  }

  if (opts && opts.verifyCalendar && !forceSync && Number(masterRev) > 0 &&
      Number(masterRev) === Number(lastRev)) {
    forceSync = true;
    changelogEligible = false;
  }

  // A pending reminder change must not short-circuit here: the calendar content
  // is current, but the matched events still need their reminders patched.
  if (!forceSync && !reminderPending && Number(masterRev) > 0 && Number(masterRev) === Number(lastRev)) {
    return "Already up to date.";
  }

  var cache = CacheService.getUserCache();
  cache.remove(PROGRESS_KEY);
  clearProgressNote_(cache);

  // Read-only: don't create the sheet from a student's sync. If MasterData isn't
  // available yet, stop gracefully before touching the calendar; the automatic retry
  // will pick it up once the admin has populated it.
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  if (!sheet) return "Timetable data is not available yet. Please try again shortly.";
  var data = sheet.getDataRange().getValues();
  var cal = getOrCreateCalendar_(CALENDAR_NAME);

  // Remember the calendar's id so the UI's "Open Google Calendar" link can
  // deep-link straight to this calendar (see getSyncHealth / enableAutoSync).
  var ownCalId = cal.getId();
  if (props.getProperty('tt_calendar_id') !== ownCalId) {
    props.setProperty('tt_calendar_id', ownCalId);
  }

  var selectionSet = {};
  for (var s = 0; s < selections.length; s++) selectionSet[selections[s]] = true;

  // selectedCodes maps each enrolled course code to the set of sections the user
  // picked for it ({} when the course has no sections). Derived from the actual
  // MasterData rows they selected — reading the code/section straight from the
  // matched row avoids any ambiguity from codes/sections that contain hyphens.
  // appendQuizEvents_ uses the sections so a section-specific quiz row is only
  // added for students enrolled in that section.
  var selectedCodes = {};
  var eventsToCreate = [];
  for (var k = 1; k < data.length; k++) {
    var code = data[k][3] ? data[k][3].toString().trim() : "";
    var section = data[k][4] ? data[k][4].toString().trim() : "";
    var sheetKey = section ? (code + "-" + section) : code;

    if (selectionSet[sheetKey]) {
      var codeUC = code.toUpperCase();
      if (!selectedCodes[codeUC]) selectedCodes[codeUC] = {};
      if (section) selectedCodes[codeUC][section.toUpperCase()] = true;
      var dateObj = parseSheetDate_(data[k][0]);
      if (!dateObj) continue;
      if (!isWithinSyncWindow_(dateObj)) {
        console.warn("Skipping class outside the sync window (" + code + " on " +
          dateObj.toDateString() + ") — it could never be cleared on re-sync.");
        continue;
      }
      eventsToCreate.push({ rowData: data[k], code: code, section: section, dateObj: dateObj });
    }
  }

  // A selection that matched NO row is the failure mode this whole file is built
  // to avoid: the calendar comes out short and looks complete, because nothing
  // anywhere says a course produced nothing. Separate the two reasons —
  //   • the course has rows, but under a different section key (a real mismatch
  //     between the enrolment sheet and the timetable, and a bug to chase); and
  //   • the course has no rows at all (CIS-T5, DIS-2, or a course the institute
  //     has not timetabled yet), which is expected and not an error.
  // Both are recorded; only the first is worth alarming anyone about.
  var sectionIndexNow = null;
  var mismatchedSelections = [], classlessSelections = [];
  for (var ms = 0; ms < selections.length; ms++) {
    var selKey = selections[ms];
    var hit = false;
    for (var mk = 1; mk < data.length; mk++) {
      var mCode = data[mk][3] ? data[mk][3].toString().trim() : "";
      if (!mCode) continue;
      var mSec = data[mk][4] ? data[mk][4].toString().trim() : "";
      if ((mSec ? mCode + "-" + mSec : mCode) === selKey) { hit = true; break; }
    }
    if (hit) continue;
    if (sectionIndexNow === null) {
      sectionIndexNow = {};
      for (var mi = 1; mi < data.length; mi++) {
        var iCode = data[mi][3] ? data[mi][3].toString().trim() : "";
        if (iCode) sectionIndexNow[iCode] = true;
      }
    }
    var selResolved = resolveSelectionCode_(selKey);
    var selCode = selResolved ? selResolved.code : selKey;
    if (sectionIndexNow[selCode]) mismatchedSelections.push(selKey);
    else classlessSelections.push(selKey);
  }
  try {
    if (mismatchedSelections.length) {
      // Loud on purpose: this means a student is enrolled in a course that IS on
      // the timetable and they are still getting none of its classes.
      console.error("SELECTION MISMATCH — " + mismatchedSelections.join(", ") +
        " matched no MasterData row despite the course being timetabled. " +
        "The enrolment sheet's section and the timetable's Grp disagree.");
      props.setProperty('tt_selection_mismatch', JSON.stringify(mismatchedSelections));
    } else {
      props.deleteProperty('tt_selection_mismatch');
    }
    if (classlessSelections.length) {
      props.setProperty('tt_selection_classless', JSON.stringify(classlessSelections));
    } else {
      props.deleteProperty('tt_selection_classless');
    }
  } catch (mmErr) { }

  // Enrollment must never depend on class rows existing: if the institute trims a
  // course's class rows from the published timetable (classes finished, sheet
  // restructured) while its exam is still scheduled, the row-scan above would miss
  // the course and the diff would DELETE the student's quiz/exam events. Resolve
  // each saved selection against the catalogue directly so those events survive
  // for as long as the quiz/exam sheets still list the course.
  for (var sv = 0; sv < selections.length; sv++) {
    var resolvedSel = resolveSelectionCode_(selections[sv]);
    if (!resolvedSel) continue; // not in the catalogue — the row-scan already covers it
    var resolvedUC = resolvedSel.code.toUpperCase();
    if (!selectedCodes[resolvedUC]) selectedCodes[resolvedUC] = {};
    if (resolvedSel.section) selectedCodes[resolvedUC][resolvedSel.section.toUpperCase()] = true;
  }

  // Audited (sit-in) courses: the student attends the classes and sits none of the
  // assessment, so the quiz and exam passes below run against a copy of
  // selectedCodes with those codes removed. Classes and guest lectures are built
  // from selectedCodes itself and are untouched — an audited course still syncs
  // every session. For everyone else (the empty rule) withoutAuditedCodes_ hands
  // back the very same object, so this line changes nothing at all. See
  // COURSE_AUDIT_.
  var auditRule = auditRuleForUser_();
  var assessmentCodes = withoutAuditedCodes_(selectedCodes, auditRule.classesOnly);

  // Build a path-agnostic intermediate representation. Both the fast (REST/fetchAll)
  // and slow (CalendarApp) paths consume this same shape so we don't duplicate the
  // title/description/color/reminder logic.
  // total is set after this loop so rows that fail time-parsing are excluded from
  // the expected count (parseTime_ throws on unparseable input).
  // Colours come from the persisted per-user map (resolveCourseColors_): each
  // course keeps its colour for the whole term, so adding/removing one course no
  // longer reshuffles (and recreates) the events of every other course. persist
  // is true here so dropped courses are pruned and the map is saved.
  var distinctCodes = {};
  for (var dc = 0; dc < eventsToCreate.length; dc++) distinctCodes[eventsToCreate[dc].code] = true;
  // Enrolled courses whose class rows are gone (see the selection-resolution pass
  // above) keep their colour reserved, so a course that reappears later doesn't
  // get pruned from the persisted map and reshuffle other courses' colours.
  for (var ds = 0; ds < selections.length; ds++) {
    var colorSel = resolveSelectionCode_(selections[ds]);
    if (colorSel && !distinctCodes[colorSel.code]) distinctCodes[colorSel.code] = true;
  }
  var sortedCodes = Object.keys(distinctCodes).sort();
  var courseColors = resolveCourseColors_(sortedCodes, true);

  var prepared = [];
  var reminderMin = parseInt(popupReminder, 10);
  var wantsReminder = popupReminder && !isNaN(reminderMin);

  for (var i = 0; i < eventsToCreate.length; i++) {
    var ev = eventsToCreate[i];
    var info = COURSE_INFO_[ev.code];
    var displayName = (info && info.name) || ev.rowData[5];
    var area = (info && info.area) || "";
    var credits = (info && info.credits) || 0;

    var startParse, endParse;
    try {
      startParse = parseTime_(ev.rowData[1]);
      endParse = parseTime_(ev.rowData[2]);
    } catch (timeErr) {
      console.error("Skipping row with unparseable time: " + getErrorMessage_(timeErr));
      continue;
    }
    // An end ≤ start pair is rejected by the Calendar API — one such row would
    // make every sync fail every hour. Skip it (the admin fetch also validates
    // and reports these; this is the belt-and-suspenders backstop).
    if (!isValidTimeRange_(startParse, endParse)) {
      console.error("Skipping " + ev.code + " row whose end time isn't after its start.");
      continue;
    }
    var startTime = new Date(ev.dateObj.getFullYear(), ev.dateObj.getMonth(), ev.dateObj.getDate(), startParse.h, startParse.m, 0);
    var endTime = new Date(ev.dateObj.getFullYear(), ev.dateObj.getMonth(), ev.dateObj.getDate(), endParse.h, endParse.m, 0);
    var eventTitle = ev.code + (ev.section ? " (" + ev.section + ")" : "") + ": " + displayName;

    var descLines = [];
    if (area && credits) descLines.push(area + " · " + credits + (Number(credits) === 1 ? " credit" : " credits"));
    else if (area) descLines.push(area);
    else if (credits) descLines.push(credits + (Number(credits) === 1 ? " credit" : " credits"));
    if (descLines.length > 0) descLines.push("");
    // Session number (institute column E / MasterData column I). Shown above the
    // instructor when present; rows that omit one simply skip the line.
    var sessionNo = ev.rowData[8] ? ev.rowData[8].toString().trim() : "";
    if (sessionNo) descLines.push("Session: " + sessionNo);
    descLines.push("Instructor: " + ev.rowData[6]);
    if (ev.section) descLines.push("Section: " + ev.section);
    descLines.push("Place: " + ev.rowData[7]);
    // Course feedback gets NO event of its own: when the FD tab names THIS session
    // as one where feedback is collected, the feedback and OLT links ride along
    // here. Keyed on the class's own date, section and TIME SPAN, never on "now",
    // so the signature stays stable — and so a course that meets twice in one day
    // only gets the note on the sitting that actually collects feedback.
    var fbLines = feedbackNoteFor_(ev.code, ev.section, startTime, endTime);
    for (var fb = 0; fb < fbLines.length; fb++) descLines.push(fbLines[fb]);
    descLines.push("");
    descLines.push(APP_TAG);
    var eventDescription = descLines.join("\n");

    // colorSlot mirrors colorId's position in COLOR_IDS_ so the CalendarApp
    // fallback path (getColorEnums_[colorSlot]) picks the matching enum.
    var courseColorId = courseColors[ev.code];
    var slot = COLOR_IDS_.indexOf(courseColorId);

    prepared.push({
      // Carried for matching only — appendGuestEvents_ uses it to recognise the
      // class a mirror-marked guest lecture replaces. Deliberately NOT part of
      // computeEventSig_ (which lists its fields explicitly), so adding it changes
      // no signature and forces no re-sync.
      code: ev.code,
      title: eventTitle,
      description: eventDescription,
      location: LOCATION_PREFIX_ + " | " + ev.rowData[7],
      startTime: startTime,
      endTime: endTime,
      colorId: courseColorId,
      colorSlot: slot,
      reminderMinutes: wantsReminder ? reminderMin : null
    });
  }

  // Guest lectures are appended BEFORE the class boundary is captured, so they fall
  // inside the class bucket on both sides of the sync. That is deliberate, not
  // incidental: the create/progress path attributes events to a kind by INDEX
  // (classes[0..classTotal) → quizzes → exams), while the delete path attributes by
  // TITLE PREFIX (📕 exam, 📝 quiz, else class). A 🎤 title has neither assessment
  // prefix, so it always lands in the delete side's class bucket — appending it
  // anywhere after classTotal would have the two sides disagree about what it is,
  // and the per-kind progress counters would drift apart mid-sync.
  //
  // Counting them as classes is also the honest reading: a guest lecture is a
  // session you attend, not an assessment. They stay unmistakable in the calendar
  // itself via the 🎤 prefix and their own Graphite colour.
  appendGuestEvents_(prepared, selectedCodes, wantsReminder ? reminderMin : null);

  // prepared is built in a fixed order — classes (incl. guest lectures), then
  // quizzes, then exams — so the create pipeline writes each kind in that order and
  // reports them separately. The boundaries are captured as each block is appended.
  var classTotal = prepared.length;

  // Quiz events for the user's enrolled courses, appended to the same prepared list
  // so they flow through the identical clear/create pipeline as classes (and carry
  // APP_TAG, so they're wiped and rebuilt on every sync). Filtering to this term's
  // rows (isTermRow_) and parsing already happened admin-side in parseQuizCsv_.
  appendQuizEvents_(prepared, assessmentCodes, wantsReminder ? reminderMin : null);
  var quizTotal = prepared.length - classTotal;

  // Exam (Mid-Term/End-Term) events for the enrolled courses, appended after quizzes
  // so they share the same clear/create pipeline (APP_TAG + the 📕 prefix that the
  // delete plan splits on). Parsed/filtered admin-side in parseExamCsv_.
  appendExamEvents_(prepared, assessmentCodes, wantsReminder ? reminderMin : null);

  // Stamp every prepared event with its content signature — the diff matching key.
  // Computed BEFORE the sig line is appended, then carried in the description so
  // the next sync can read it back without normalizing any fields.
  for (var sg = 0; sg < prepared.length; sg++) {
    prepared[sg].sig = computeEventSig_(prepared[sg]);
    prepared[sg].description += "\n" + SIG_PREFIX_ + prepared[sg].sig + "]";
  }

  // Expected count excludes rows skipped for bad times above.
  var total = prepared.length;
  var examTotal = total - classTotal - quizTotal;

  // ── Diff-based sync ─────────────────────────────────────────────────────────
  // Compare what's already on the calendar against what should be there, then
  // only delete the obsolete events and create the missing ones. A typical
  // one-room timetable change becomes 1 delete + 1 create instead of a full
  // wipe-and-recreate — drastically fewer API calls and far less 429 pressure.
  // A forced re-sync with no changes becomes a pure verification pass.
  putProgress_(cache, 0, 0, "comparing");
  var existingEntries = null;
  if (shouldTryCalendarApi_()) {
    try {
      existingEntries = listSyncedEventsDetailed_(cal);
      markCalendarApiAvailable_();
    } catch (listErr) {
      if (!isCalendarApiUnavailableError_(listErr)) throw listErr;
      markCalendarApiUnavailable_();
    }
  }
  if (existingEntries === null) existingEntries = slowListSyncedEventsDetailed_(cal);

  var diff = diffSyncedEvents_(existingEntries, prepared, classTotal, quizTotal);
  var obsoleteCount = diff.obsoleteEntries.length;

  // Delete obsolete events first (classes-first inside the plan). If any delete
  // fails we abort before creating, exactly like the old full-wipe path, so a
  // stale event and its replacement can never coexist as visible duplicates.
  if (obsoleteCount > 0) {
    var deleteResult = deleteEventsWithFallback_(
      cal, cache,
      function () {
        var plan = buildDeletePlan_(diff.obsoleteEntries, function (en) { return en.summary; });
        return {
          ids: plan.items.map(function (en) { return en.id; }),
          classTotal: plan.classTotal,
          quizTotal: plan.quizTotal,
          examTotal: plan.examTotal
        };
      },
      function () {
        // Recompute obsolete events from LIVE calendar state via CalendarApp, so
        // the partial-failure fallback only touches what the fast path missed.
        var freshDiff = diffSyncedEvents_(slowListSyncedEventsDetailed_(cal), prepared, classTotal, quizTotal);
        var plan = buildDeletePlan_(freshDiff.obsoleteEntries, function (en) { return en.summary; });
        return {
          events: plan.items.map(function (en) { return en.event; }),
          classTotal: plan.classTotal,
          quizTotal: plan.quizTotal,
          examTotal: plan.examTotal
        };
      }
    );
    if (deleteResult.failed > 0) {
      var attempted = deleteResult.deleted + deleteResult.failed;
      var abortMsg = "Could not clear " + deleteResult.failed + " of " + attempted +
        " outdated events; aborting sync to avoid duplicates. Will retry on the next automatic sync.";
      if (deleteResult.lastError) abortMsg += " Last error: " + getErrorMessage_(deleteResult.lastError);
      throw new Error(abortMsg);
    }
  }

  // Create only the missing events; toCreate preserves the classes → quizzes → exams order.
  var createResult = { created: 0, lastError: null, classCreated: 0, quizCreated: 0, examCreated: 0 };
  var createTotal = diff.toCreate.length;
  if (createTotal > 0) {
    var usedFastCreate = false;
    if (shouldTryCalendarApi_()) {
      try {
        var resources = diff.toCreate.map(buildEventResource_);
        createResult = batchCreateEvents_(cal, resources, cache, diff.createClassTotal, diff.createQuizTotal);
        usedFastCreate = true;
        notePath_("usedFastCreate");
      } catch (apiErr) {
        if (!isCalendarApiUnavailableError_(apiErr)) throw apiErr;
        markCalendarApiUnavailable_();
        putProgressNote_(cache, "Switching to slower sync…");
        notePath_("usedSlowCreate");
        createResult = slowCreateEvents_(cal, diff.toCreate, cache, diff.createClassTotal, diff.createQuizTotal);
      }
    } else {
      notePath_("usedSlowCreate");
      createResult = slowCreateEvents_(cal, diff.toCreate, cache, diff.createClassTotal, diff.createQuizTotal);
    }

    // Fast path ran but didn't create everything (likely 429 exhaustion). The diff
    // makes the retry cheap: re-list, recompute what's still missing, and create
    // just that via the slow path (which uses a separate rate-limit pool).
    if (usedFastCreate && createResult.created < createTotal) {
      notePath_("usedSlowCreate");
      notePath_("createFallback");
      putProgressNote_(cache, "Retrying with alternate method…");
      var retryDiff = diffSyncedEvents_(slowListSyncedEventsDetailed_(cal), prepared, classTotal, quizTotal);
      var retryResult = slowCreateEvents_(cal, retryDiff.toCreate, cache, retryDiff.createClassTotal, retryDiff.createQuizTotal);
      createResult = {
        created: createResult.created + retryResult.created,
        lastError: retryResult.lastError || createResult.lastError,
        classCreated: createResult.classCreated + retryResult.classCreated,
        quizCreated: createResult.quizCreated + retryResult.quizCreated,
        examCreated: createResult.examCreated + retryResult.examCreated
      };
    }
  }

  var createdCount = createResult.created;
  var lastCreateError = createResult.lastError;
  // The completion split reports calendar TOTALS (created + verified-unchanged),
  // matching what the student can actually count on their calendar.
  var finalSplit = {
    cd: createResult.classCreated + diff.unchangedClasses, ct: classTotal,
    qd: createResult.quizCreated + diff.unchangedQuizzes, qt: quizTotal,
    ed: createResult.examCreated + diff.unchangedExams, et: examTotal
  };

  // End-state guarantee: a retried create can land twice server-side (see
  // verifySyncedCalendar_). Run it BEFORE marking the revision synced — once
  // marked, automatic runs short-circuit and would never diff the surplus away.
  if (createdCount === createTotal && createTotal > 0) {
    verifySyncedCalendar_(cal, cache, prepared, classTotal, quizTotal);
  }

  // Reminder preference changed: patch the diff-matched (unchanged) events in
  // place — newly created events already carry the new reminder. On a partial
  // patch, tt_reminder_applied stays stale (set only in the success block below)
  // and the run ends in the calm self-healing "still finishing" state, so the
  // next automatic run re-diffs cheaply and retries just the patches.
  var reminderPatched = 0;
  if (reminderPending && createdCount === createTotal) {
    var matchedEntries = [];
    for (var me = 0; me < existingEntries.length; me++) {
      if (existingEntries[me].matched) matchedEntries.push(existingEntries[me]);
    }
    var remResult = applyReminderToMatched_(cal, cache, matchedEntries,
      wantsReminder ? reminderMin : null);
    reminderPatched = matchedEntries.length - remResult.failed;
    if (remResult.failed > 0) {
      putProgress_(cache, diff.unchanged + createdCount, total, "error", finalSplit);
      clearProgressNote_(cache);
      console.warn("Reminder patch incomplete: " + remResult.failed + " of " +
        matchedEntries.length + " matched events not yet updated; retrying on the next run.");
      throw new Error("Your calendar is still finishing — the new reminder is on " +
        reminderPatched + " of " + matchedEntries.length + " existing events, and the " +
        "rest update automatically within about half an hour. There's nothing you " +
        "need to do — you can close this.");
    }
  }

  if (createdCount === createTotal) {
    if (changelogEligible && (createTotal > 0 || obsoleteCount > 0)) {
      try {
        recordTimetableChanges_(props, diff.obsoleteEntries, diff.toCreate);
      } catch (clErr) {
        console.error("Change log failed: " + getErrorMessage_(clErr));
      }
    }
    putProgress_(cache, total, total, "complete", finalSplit);
    clearProgressNote_(cache);
    props.setProperty('tt_last_synced_revision', masterRev);
    props.setProperty('tt_last_synced_at', String(Date.now()));
    props.setProperty('tt_code_version', CODE_VERSION);
    props.setProperty('tt_resync_version', RESYNC_VERSION);
    // All matched events carry the current reminder now (patched above, and new
    // events were created with it) — record the preference as applied.
    if (reminderPending) props.setProperty('tt_reminder_applied', popupReminder);
    // Consumed only here, on success — see the changelog-eligibility comment.
    props.deleteProperty('tt_changelog_skip_once');
    // Remove legacy partial-sync tracking properties if present.
    props.deleteProperty('tt_partial_sync_revision');
    props.deleteProperty('tt_partial_sync_attempts');
    if (createTotal === 0 && obsoleteCount === 0) {
      if (reminderPatched > 0) {
        return "Calendar updated: your new reminder is on all " + total + " events (" +
          eventBreakdown_(classTotal, quizTotal, examTotal) + "), nothing else changed.";
      }
      return "Already up to date — verified " + total + " events (" +
        eventBreakdown_(classTotal, quizTotal, examTotal) + "), nothing to change.";
    }
    // Record which write path this real-work sync used (fast REST vs CalendarApp
    // fallback) for batch-size tuning. Buffered now, aggregated by the admin
    // fetch. Best-effort — logSyncPath_ never throws.
    logSyncPath_({ created: createdCount, removed: obsoleteCount });
    return "Calendar updated: " + createdCount + " added, " + obsoleteCount +
      " removed, " + diff.unchanged + " unchanged. Now " + total + " events (" +
      eventBreakdown_(classTotal, quizTotal, examTotal) + ").";
  }

  // Partial create: leave tt_last_synced_revision unchanged so the next automatic
  // run retries from scratch. Never accept incomplete calendars as final.
  putProgress_(cache, diff.unchanged + createdCount, total, "error", finalSplit);
  clearProgressNote_(cache);
  // Keep the technical cause (e.g. an HTTP 429 storm) in the admin logs, but hand
  // the student a calm, action-free message: a partial sync self-heals on the next
  // automatic run, so framing it as a hard failure with raw HTTP codes needlessly
  // alarms them. The client recognises the "still finishing" phrase and renders it
  // as a calm amber state rather than a red error (see setStatusError / #19).
  console.warn("Partial sync: created " + createdCount + " of " + createTotal +
    " new events (calendar now has " + finalSplit.cd + "/" + classTotal + " classes, " +
    finalSplit.qd + "/" + quizTotal + " quizzes, " + finalSplit.ed + "/" + examTotal + " exams)." +
    (lastCreateError ? " Last error: " + getErrorMessage_(lastCreateError) : ""));
  throw new Error("Your calendar is still finishing — " + (diff.unchanged + createdCount) +
    " of " + total + " events are in, and the rest are added automatically within " +
    "about half an hour. There's nothing you need to do — you can close this.");
}

// ---------------------------------------------------------
// DATABASE ADMIN FETCH (Runs on Developer's Account)
// ---------------------------------------------------------

// `e` is the time-driven trigger's event object (absent for menu / web / editor
// calls). Only a trigger run is guaranteed to be the SAVED code, so only it stamps
// saved_build_id — the web "Force fetch now" runs the deployed version and must not.
function fetchAndCleanAdminData(e) {
  assertAdmin_();
  if (e && e.triggerUid) stampSavedBuild_();
  // Term ended: the shared institute data is frozen. endTerm already deletes the
  // 30-minute trigger, but this guard also blocks a manual editor run, a stray
  // re-created trigger, and the creator's web "Force fetch now" button — no path
  // may resurrect data updates until the admin runs "Reopen term".
  if (PropertiesService.getScriptProperties().getProperty('term_ended_at')) {
    return "Term has ended — the institute data fetch is disabled. Run 'Reopen term' from the sheet menu to resume.";
  }
  // Refuse before the network round trip while any source still holds PENDING_URL_.
  // fetchAll would otherwise throw a bare "Invalid argument" that names no source,
  // and the per-source catch would keep each one's previous (empty) rows while the
  // fetch still reported success — the exact silent-staleness failure the keyed
  // CSV_SOURCES_ table exists to prevent.
  var blockingSources = unconfiguredCsvSources_();
  if (blockingSources.length) {
    return TERM_CONFIG_.label + " setup incomplete — no source yet for: " + blockingSources.join(", ") +
      ". For the timetable, do ONE of: set DATA_SOURCES.timetableSheet in config.gs to the " +
      "office's timetable spreadsheet (view access is enough); set DATA_SOURCES.timetablePublishedCsv; " +
      "or paste the timetable into a \"" + MANUAL_TIMETABLE_SHEET_NAME + "\" tab of this spreadsheet. " +
      "See docs/TROUBLESHOOTING.md.";
  }
  // Self-install / self-heal the schedule. Placed after the guards above so a
  // term-ended or unconfigured project doesn't quietly plant a trigger that would
  // only refuse on every run.
  ensureAdminFetchTrigger_();

  // The whole pass is idempotent — it recomputes everything and fully overwrites the
  // MasterData/QuizData sheets — so a transient Google-side glitch (a flaky published-CSV
  // endpoint, or a bare "unknown error" from the Sheets backend during a write/flush) is
  // safe to recover from by simply re-running. Retry a few times with backoff so a hiccup
  // self-heals silently instead of surfacing as an error.
  var maxAttempts = 3;
  var lastErr = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fetchAndCleanAdminDataLocked_();
    } catch (e) {
      lastErr = e;
      console.warn("Admin fetch attempt " + attempt + "/" + maxAttempts + " failed: " + getErrorMessage_(e));
      if (attempt < maxAttempts) Utilities.sleep(3000 * attempt);
    }
  }
  throw new Error("Admin fetch failed after " + maxAttempts + " attempt(s). Last error: " + getErrorMessage_(lastErr));
}

// ---------------------------------------------------------
// GITHUB ACTIONS — RETIRED
// ---------------------------------------------------------
// A GitHub Actions workflow used to render the institute's Apps Script web apps in
// headless Chrome and write them into a "bridge" spreadsheet. Reading the PGP
// office's mirror sheet directly (TIMETABLE_SHEET_ID_) replaced all of it. The old
// dispatch code (setGitHubToken / triggerGitHubSync) is not part of this repository;
// if the office ever stops sharing the mirror, the ManualTimetable paste-in tab is
// the fallback (📊 Tool Stats → Set up paste-in tabs).

// Re-runs the institute fetch — the mirror timetable plus the quiz and mid-term
// tabs — into this tool's sheets, now. The 30-minute trigger does this on its own;
// this is for when the institute has just changed something and you would rather
// not wait for the next tick.
//
// It used to ask GitHub to re-scrape the institute's web apps into a bridge sheet
// and then return immediately, leaving you to run a second, separate fetch once
// that finished ~3 minutes later. Reading the mirror directly collapses both steps
// into this one call, so the result below is the real outcome, not "started".
function refreshFromInstituteNow() {
  assertAdmin_();
  var ui = SpreadsheetApp.getUi();
  try {
    var result = fetchAndCleanAdminData();
    var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
    var rows = master ? Math.max(master.getLastRow() - 1, 0) : 0;
    ui.alert('Institute fetch done',
      (typeof result === 'string' && result ? result : 'Fetch complete.') +
      '\n\nMasterData now holds ' + rows + ' row(s).' +
      (rows === 0 ? '\n\n⚠️ That is empty — check "Test timetable source".' : '') +
      '\n\nStudents pick this up on their own next sync (within ~' +
      SYNC_INTERVAL_MINUTES_ + ' minutes).', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Institute fetch failed', getErrorMessage_(e), ui.ButtonSet.OK);
  }
}

// Web-page "Force fetch now" button (creator-only). The 30-minute trigger refreshes
// the shared MasterData/QuizData on its own; this lets the creator pull a
// just-published institute change immediately instead of waiting up to half an hour.
//
// The web app runs as USER_ACCESSING, so this executes as the *clicking* account.
// Two things must hold for it to do real work, and both are already true for the
// creator: (1) the roll must be CREATOR_ROLL_ — re-checked HERE because the client
// only HIDES the button and anyone could call this from the console (this is the
// real security boundary); (2) the account must be a spreadsheet Editor, which
// fetchAndCleanAdminData enforces via assertAdmin_ and which the writes require.
//
// Returns fetchAndCleanAdminData's human-readable result string ("No changes
// detected." / "Updated … New Revision: N") so the page can show it inline.
// NOTE: this refreshes the SHARED data only — it does not touch any student's
// calendar. Each student picks the change up on their own next sync.
function forceAdminFetch() {
  var email = Session.getActiveUser().getEmail() || "";
  var student = lookupStudentByEmail_(email);
  if (!student || student.rollNo !== CREATOR_ROLL_) {
    throw new Error("This action is restricted to the tool's creator.");
  }
  logUsage_("force_admin_fetch");
  return fetchAndCleanAdminData();
}

// Labels which step a failure came from. The platform's bare "unknown error" carries no
// line reference, so wrapping each major external call turns it into e.g.
// "[write MasterData sheet] …" — making a recurrence diagnosable instead of a guess.
// Records which build the SAVED code is (see BUILD_ID_). Best-effort.
function stampSavedBuild_() {
  try {
    PropertiesService.getScriptProperties().setProperties({
      'saved_build_id': BUILD_ID_,
      'saved_build_seen_at': String(Date.now())
    });
  } catch (e) { }
}

function adminStep_(label, fn) {
  try {
    return fn();
  } catch (e) {
    throw new Error("[" + label + "] " + getErrorMessage_(e));
  }
}

// The published-Sheet CSV endpoints intermittently return transient 5xx / "unknown error".
// muteHttpExceptions lets the retry loop treat those as retryable instead of letting a raw
// throw escape; a non-2xx becomes a clear, labelled error.
function fetchCsvText_(url, label) {
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = resp.getResponseCode();
  if (code >= 200 && code < 300) return resp.getContentText();
  throw new Error(label + " returned HTTP " + code + ": " + resp.getContentText().substring(0, 200));
}

// Position of a source in CSV_SOURCES_ (and therefore in the fetchAll response
// array). Throws loudly on an unknown key — a typo must fail immediately and
// visibly, never degrade into reading some other source's response.
function csvSourceIndex_(key) {
  for (var i = 0; i < CSV_SOURCES_.length; i++) {
    if (CSV_SOURCES_[i].key === key) return i;
  }
  throw new Error("Unknown CSV source key: " + key);
}

// Extracts one source's CSV text from the admin fetch's parallel fetchAll pass
// (see fetchAndCleanAdminDataLocked_), with the same error semantics as
// fetchCsvText_ — a non-2xx becomes a labelled throw that the per-source
// isolation blocks catch. When the parallel pass itself failed (responses is
// null), falls back to a fresh single fetch so one bad connection attempt can't
// sink sources that would succeed on their own.
function csvTextFrom_(responses, key) {
  var idx = csvSourceIndex_(key);
  var source = CSV_SOURCES_[idx];
  // Not published yet: fail this ONE source with a message that says why, so the
  // caller's catch preserves its previous rows instead of the error surfacing as a
  // baffling invalid-URL exception.
  if (source.url === PENDING_URL_) {
    throw new Error(source.label + " has no published URL yet (set its link in config.gs → DATA_SOURCES).");
  }
  if (responses && responses[idx]) {
    var code = responses[idx].getResponseCode();
    if (code >= 200 && code < 300) return responses[idx].getContentText();
    throw new Error(source.label + " returned HTTP " + code + ": " +
      responses[idx].getContentText().substring(0, 200));
  }
  return fetchCsvText_(source.url, source.label);
}

// Admin-only visibility for skipped rows: each entry means a class/quiz is
// missing from every calendar, which is otherwise invisible until someone
// misses a class. Writes a summary to K1/K2 on MasterData with the full list in
// K2's hover note — but only when the issue set actually CHANGES, so a
// persistent problem doesn't rewrite the sheet every run. The signature property
// is stored only after a successful write, so a transient failure (or a
// missing MasterData sheet on the very first run) retries on the next fetch.
// Never throws — reporting must not break the timetable fetch itself.
function reportParseIssuesIfChanged_(scriptProps, issues) {
  try {
    var sig = hashString_(JSON.stringify(issues));
    if (scriptProps.getProperty('parse_issues_sig') === sig) return;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
    if (!sheet) return; // first-ever fetch: sheet is created later this pass; reported next run
    sheet.getRange("K1").setValue("Parse Issues").setFontWeight("bold");
    var cell = sheet.getRange("K2");
    if (issues.length === 0) {
      cell.setValue("None ✓");
      cell.clearNote();
    } else {
      // "7 skipped row(s)" was alarming and wrong. Most entries here are not
      // skipped rows at all — they are "this source isn't published yet" and
      // catalogue-reconciliation notes, and reading them as lost classes sends the
      // admin hunting for a data loss that never happened. A dropped row IS worth
      // panicking about (that class is missing from every calendar), so count the
      // two separately and lead with the one that matters.
      var skipped = 0;
      for (var i = 0; i < issues.length; i++) {
        if (/ row \d+/.test(String(issues[i]))) skipped++;
      }
      var notices = issues.length - skipped;
      var label;
      if (skipped && notices) {
        label = "⚠ " + skipped + " row(s) SKIPPED, " + notices + " notice(s)";
      } else if (skipped) {
        label = "⚠ " + skipped + " row(s) SKIPPED — these classes reach nobody";
      } else {
        label = notices + " notice(s), 0 rows skipped ✓";
      }
      cell.setValue(label + " — hover for details");
      cell.setNote(issues.slice(0, 60).join("\n"));
    }
    scriptProps.setProperty('parse_issues_sig', sig);
  } catch (reportErr) {
    console.warn("Parse-issue report failed: " + getErrorMessage_(reportErr));
  }
}

function fetchAndCleanAdminDataLocked_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    // Drain buffered usage events (logged by view-only students who can't write the
    // sheet) into the Usage sheet. Runs first, unconditionally — usage accrues even
    // when the timetable hasn't changed — and is idempotent across the fetch's
    // own retries, since it deletes each key as it processes it.
    flushUsageBuffer_();
    // Same pattern for "report wrong entry" submissions → Reports sheet.
    flushReportBuffer_();
    // And fold buffered calendar-path telemetry into its aggregate property.
    flushPathTelemetry_();

    // Pre-warm the shared 6h caches (Subject Reps + Academic Calendar) with a
    // forced refresh, so their TTL effectively never expires between 30-minute
    // fetches and no student's health call ever pays the UrlFetch inline.
    // Best-effort — both fall back to cached/hardcoded data on failure.
    try { getSubjectReps_(true); } catch (warmSrErr) { }
    try { getAcademicCalRows_(true); } catch (warmAcErr) { }

    // Every CSV_SOURCES_ entry in ONE parallel round trip instead of one fetch
    // each — a smaller lock window and a fraction of the wall-clock fetch time.
    // Each source's response is still consumed (and fails) on its own via
    // csvTextFrom_, preserving the per-source isolation below; a thrown fetchAll
    // (network blip) just falls back to per-source single fetches.
    // Pending sources are left OUT of the parallel pass: one unresolvable URL makes
    // fetchAll throw for the whole batch, which would drop every good source onto
    // the slow per-source path. Their slots stay empty and csvTextFrom_ fails them
    // individually.
    var csvResponses = null;
    try {
      var liveIdx = [], liveReqs = [];
      for (var ci = 0; ci < CSV_SOURCES_.length; ci++) {
        if (CSV_SOURCES_[ci].url === PENDING_URL_) continue;
        liveIdx.push(ci);
        liveReqs.push({ url: CSV_SOURCES_[ci].url, muteHttpExceptions: true });
      }
      var liveResponses = UrlFetchApp.fetchAll(liveReqs);
      csvResponses = new Array(CSV_SOURCES_.length);
      for (var li = 0; li < liveIdx.length; li++) csvResponses[liveIdx[li]] = liveResponses[li];
    } catch (fetchAllErr) {
      console.warn("Parallel CSV fetch failed; falling back to per-source fetches: " +
        getErrorMessage_(fetchAllErr));
      csvResponses = null;
    }

    var timetable = getTimetableRows_(csvResponses);
    var csvData = timetable.rows;
    var cleanData = [];
    var parseIssues = [];
    if (timetable.source !== "published CSV") {
      // Say so on every run: a hand-pasted timetable goes stale silently, and this
      // line in the parse-issues cell is the only place that would ever show it.
      parseIssues.push("Timetable read from the " + timetable.source +
        " (no published CSV tab yet) — re-check it after any institute change.");
    }

    // ── Mirror format? ─────────────────────────────────────────────────────────
    // Decided from the header row, NOT from which route the grid arrived by, so
    // the mirror parses identically whether it came from openById, a published
    // CSV, or a paste into ManualTimetable — and a legacy grid arriving by any of
    // those same routes still falls through to the tokenizer below. Returns null
    // when the header is not the mirror's, which is the whole fallback mechanism.
    var mirror = parseMirrorTimetable_(csvData, parseIssues);
    if (mirror) {
      cleanData = mirror.classes;
      parseIssues.push("Timetable read in mirror format: " + mirror.classes.length +
        " class row(s), " + mirror.guest.length + " guest lecture(s), " +
        mirror.feedback.length + " feedback session(s)" +
        (mirror.otherYear ? "; " + mirror.otherYear + " row(s) for the other year ignored" : "") +
        (mirror.skippedQuiz ? "; " + mirror.skippedQuiz + " QuizSlot placeholder(s) ignored" : "") + ".");
    }

    var seenRows = {};
    var currentDate = null; // a real Date, or null while the current date cell is unreadable
    var pendingBadDate = null; // { rawDate, csvRow, reported } for an unreadable date cell, until a real date clears it or a class row forces the warning
    var currentStart = "";
    var currentEnd = "";

    // `!mirror` skips the whole legacy tokenizer: the mirror already supplied
    // cleanData in final form, from explicit columns, with none of the token
    // guesswork below. Kept rather than deleted because the ManualTimetable paste
    // fallback and any future legacy CSV still need it.
    for (var i = 1; !mirror && i < csvData.length; i++) {
      var row = csvData[i];
      if (!row || row.length < 5) continue;

      // Skip the column-header row ("Date | Day | Timings | Grp | Course-…"):
      // column A "Date" and column C "Timings" are already ignored below, but
      // its column-E label ("Course-Section-Session#-…") would otherwise look
      // like a class with no date and trip the unreadable-date warning. No real
      // date cell contains "Date" and no real timing cell contains "Timings".
      if ((row[0] && row[0].toString().indexOf("Date") !== -1) ||
          (row[2] && row[2].toString().indexOf("Timings") !== -1)) continue;

      if (row[0] && row[0].toString().trim() !== "" && row[0].toString().indexOf("Date") === -1) {
        // Parse to a real Date HERE and store the Date object in the sheet.
        // Writing the raw string would let setValues locale-coerce it — under
        // a US-locale spreadsheet "01/07/2026" silently becomes January 7th on
        // every student's calendar. parseSheetDate_ prefers the D/M/Y reading,
        // the same reader the user side relies on.
        var rawDate = row[0].toString().trim();
        currentDate = parseSheetDate_(rawDate);
        // Don't flag the failure here: title/banner rows ("MBA, MBA-TM BATCH
        // (2025-27)", "TIMETABLE: TERM-V") also land in column A and aren't
        // dates. Remember the unreadable cell and only warn below if a real
        // class row actually depends on it — so banners never produce a notice.
        pendingBadDate = currentDate ? null : { rawDate: rawDate, csvRow: i + 1, reported: false };
      }
      if (row[2] && row[2].toString().trim() !== "" && row[2].toString().indexOf("Timings") === -1) {
        // Accept hyphen, en-dash, or em-dash as the time separator. The pair is
        // validated and normalized to 24h "HH:mm" right away (normalizeTimeRange_):
        // a swapped or unreadable pair left in the sheet would be rejected by
        // the Calendar API and fail every enrolled student's sync, every hour.
        var times = row[2].toString().split(/[-–—]/);
        var range = times.length === 2 ? normalizeTimeRange_(times[0].trim(), times[1].trim()) : null;
        if (!range) {
          parseIssues.push("Timetable CSV row " + (i + 1) + ": unusable timing \"" + row[2] + "\" — its classes were skipped");
          currentStart = "";
          currentEnd = "";
          continue;
        }
        currentStart = range.start;
        currentEnd = range.end;
      }

      var section = row[3] ? row[3].toString().trim() : "";
      var details = row[4] ? row[4].toString().trim() : "";

      if (details === "") continue; // no class on this row (date/time-only or blank)

      var cleanDetails = details.replace(/\s+/g, ' ').trim();
      var tokens = cleanDetails.split(' ');
      var code = tokens[0];

      // Quizzes are scheduled by the separate quiz parser, never here — skip
      // before the date check so a quiz under a bad date isn't mis-reported.
      if (code === "QUIZ" || code.toLowerCase().indexOf("quiz") !== -1) continue;

      if (!currentDate) {
        // A genuine class we can't place because the date cell above it was
        // unreadable. Name that date now — and only now, once — since a real
        // class actually depended on it. Banner rows carry no class details
        // and never reach this point, so they stay silent.
        if (pendingBadDate && !pendingBadDate.reported) {
          parseIssues.push("Timetable CSV row " + pendingBadDate.csvRow + ": unreadable date \"" + pendingBadDate.rawDate + "\" — its classes were skipped");
          pendingBadDate.reported = true;
        }
        continue;
      }
      if (currentStart === "") continue; // unusable timing was already reported above

      var sessionIndex = -1;
      for (var j = 1; j < tokens.length; j++) {
        if (/^\d+$/.test(tokens[j])) {
          sessionIndex = j;
          break;
        }
      }
      // The institute packs the meeting's session number into column E ("Course-
      // Section-Session#-Faculty-Room") as the first all-digits token; "" when a
      // row omits one. Carried through MasterData (column I) so the calendar event
      // can show it — the change-log diff ignores it (see changeRecordFromRow_).
      var session = sessionIndex !== -1 ? tokens[sessionIndex] : "";

      var faculty = "Unknown";
      var room = "TBD";

      var facultyStart = sessionIndex !== -1 ? sessionIndex + 1 : 1;
      var rawRoom = tokens[tokens.length - 1];
      if (tokens.length > facultyStart && isRoomToken_(rawRoom)) {
        room = rawRoom;
        faculty = tokens.slice(facultyStart, tokens.length - 1).join(" ");
      } else {
        faculty = tokens.slice(facultyStart).join(" ");
      }

      var courseInfo = COURSE_INFO_[code];
      var courseName = (courseInfo && courseInfo.name) || code;
      var cleanRow = [currentDate, currentStart, currentEnd, code, section, courseName, faculty, room, session];
      // Exact duplicate rows in the institute sheet would otherwise become
      // duplicate calendar events — the diff faithfully mirrors its input.
      var rowKey = JSON.stringify(cleanRow);
      if (!seenRows[rowKey]) {
        seenRows[rowKey] = true;
        cleanData.push(cleanRow);
      }
    }

    // Sanity check runs before fingerprint compare so a broken CSV never silently passes.
    if (cleanData.length < 50) {
      throw new Error("Parser sanity check failed. Only " + cleanData.length + " rows parsed. Admin format likely changed.");
    }

    // The same floor, applied to what students can actually receive. A class dated
    // outside TERM_CONFIG_'s sync window is never created (isWithinSyncWindow_), so
    // a read whose dates were misparsed passes the count above and then, on every
    // student's next sync, deletes their classes. Refusing here keeps the previous
    // MasterData — and the fetch's own failure email tells the owner why.
    var inWindow = 0;
    for (var iw = 0; iw < cleanData.length; iw++) {
      var cd = cleanData[iw][0];
      if (cd instanceof Date && isWithinSyncWindow_(new Date(cd.getFullYear(), cd.getMonth(), cd.getDate()))) inWindow++;
    }
    if (inWindow < 50) {
      throw new Error("Parser sanity check failed. Only " + inWindow + " of " + cleanData.length +
        " class rows fall inside this term's sync window — the dates were probably misread " +
        "(a changed date format?) or TERM_CONFIG_'s window is wrong. Previous data kept.");
    }
    if (inWindow < cleanData.length) {
      parseIssues.push((cleanData.length - inWindow) + " class row(s) fall outside this term's sync " +
        "window and reach nobody — check their dates (and TERM_CONFIG_).");
    }
    // The mirror's Day column disagreeing with most dates is the signature of a
    // date-format change: refuse the whole read rather than move everyone's classes.
    if (mirror && mirror.dayChecked >= 20 && mirror.dayMismatch > mirror.dayChecked * 0.1) {
      throw new Error("Mirror timetable: " + mirror.dayMismatch + " of " + mirror.dayChecked +
        " class rows have a date that disagrees with their Day column — the date format " +
        "has probably changed. Previous data kept; see MasterData K2 for examples.");
    }

    var scriptProps = PropertiesService.getScriptProperties();

    // Big-drop guard. The office edits the mirror by hand, and a fetch that lands
    // half-way through an edit (a block of rows cut, not yet pasted back) would
    // otherwise delete those classes from every calendar and re-add them 30 minutes
    // later. A sharp fall in the class count is therefore held for ONE fetch: if the
    // next fetch sees the same count it is applied, so a genuine large change is
    // delayed by one cycle and nothing more. Skipped on a term switch (the course set
    // changes wholesale then) and when there is no previous count to compare with.
    var classDataHeld = false;
    var prevClassCount = Number(scriptProps.getProperty('master_data_row_count') || '0');
    var termSwitchPending = (scriptProps.getProperty(TERM_BASELINE_LABEL_PROP_) || "") !== TERM_CONFIG_.label;
    if (!termSwitchPending && prevClassCount >= 100 && cleanData.length < prevClassCount * 0.75) {
      var pendingDrop = scriptProps.getProperty('pending_drop_count');
      if (pendingDrop !== String(cleanData.length)) {
        classDataHeld = true;
        scriptProps.setProperty('pending_drop_count', String(cleanData.length));
        parseIssues.push("⚠ Class rows fell from " + prevClassCount + " to " + cleanData.length +
          " — held back for one fetch in case the office was mid-edit. Applied automatically " +
          "if the next fetch (~" + ADMIN_FETCH_INTERVAL_MINUTES_ + " min) sees the same count.");
      } else {
        parseIssues.push("Class rows fell from " + prevClassCount + " to " + cleanData.length +
          " on two fetches in a row — applied.");
      }
    }
    if (!classDataHeld) {
      try { scriptProps.deleteProperty('pending_drop_count'); } catch (e) { }
    }

    // Fetch this term's quiz schedule (rows filtered by isTermRow_). A quiz-side failure must never break the
    // timetable sync, so on error we keep the previously stored quiz data and reuse
    // its signature — that way a transient quiz hiccup doesn't wipe quizzes from
    // everyone's calendar or churn the revision.
    var quizRows = null;
    var quizSignature;
    try {
      var quizRaw = adminStep_("fetch quiz CSV", function () { return csvTextFrom_(csvResponses, "quiz"); });
      quizRows = parseQuizCsv_(quizRaw, parseIssues);
      assertNotEmptyWipe_(QUIZ_SHEET_NAME, quizRows, parseIssues, "Quiz CSV", termSwitchPending);
      quizSignature = dataSignature_(quizRows);
    } catch (quizErr) {
      console.error("Quiz fetch/parse failed; preserving previous quiz data: " + getErrorMessage_(quizErr));
      // On the first fetch of a new term whatever is stored is LAST term's — clear
      // it rather than keep it (see assertNotEmptyWipe_).
      quizRows = termSwitchPending ? [] : null;
      quizSignature = termSwitchPending ? dataSignature_([]) : storedSignature_(scriptProps, 'quiz_data_signature');
    }

    // Fetch this term's MID-TERM exam schedule — same isolation as quizzes: an
    // exam-side failure preserves the previously stored exam data and its signature,
    // so a transient hiccup never wipes exams from everyone's calendar or churns the
    // revision. A mid-term tab CAN carry end-term sittings — Term IV's carried the
    // 1.5-credit courses' — so examTermLabel_ infers each row's kind, and
    // getAllExamRows_ reconciles any overlap with the end-term tab. Term V's
    // T-V_MTES lists mid-terms only (checked 2026-09-29).
    var examRows = null;
    var examSignature;
    try {
      var examRaw = adminStep_("fetch exam CSV", function () { return csvTextFrom_(csvResponses, "exam"); });
      examRows = parseExamCsv_(examRaw, parseIssues, "Mid-term exam");
      assertNotEmptyWipe_(EXAM_SHEET_NAME, examRows, parseIssues, "Mid-term exam CSV", termSwitchPending);
      examSignature = dataSignature_(examRows);
    } catch (examErr) {
      console.error("Exam fetch/parse failed; preserving previous exam data: " + getErrorMessage_(examErr));
      // On the first fetch of a new term whatever is stored is LAST term's — clear
      // it rather than keep it (see assertNotEmptyWipe_).
      examRows = termSwitchPending ? [] : null;
      examSignature = termSwitchPending ? dataSignature_([]) : storedSignature_(scriptProps, 'exam_data_signature');
    }

    // Fetch the Term-5 END-TERM exam schedule from its own published tab — same
    // isolation again, and deliberately independent of the mid-term block above:
    // whichever tab fails keeps its own previously stored rows, so a broken
    // end-term sheet can never wipe the mid-term exams (or vice versa).
    var endTermRows = null;
    var endTermSignature;
    try {
      var endTermRaw = adminStep_("fetch end-term CSV", function () { return csvTextFrom_(csvResponses, "endterm"); });
      endTermRows = parseExamCsv_(endTermRaw, parseIssues, "End-term exam");
      assertNotEmptyWipe_(ENDTERM_SHEET_NAME, endTermRows, parseIssues, "End-term exam CSV", termSwitchPending);
      endTermSignature = dataSignature_(endTermRows);
    } catch (endTermErr) {
      console.error("End-term fetch/parse failed; preserving previous end-term data: " + getErrorMessage_(endTermErr));
      // On the first fetch of a new term whatever is stored is LAST term's — clear
      // it rather than keep it (see assertNotEmptyWipe_).
      endTermRows = termSwitchPending ? [] : null;
      endTermSignature = termSwitchPending ? dataSignature_([]) : storedSignature_(scriptProps, 'endterm_data_signature');
    }

    // Guest lectures — same per-source isolation as every block above, plus a
    // fallback to a pasted range. The published GL tab still holds the previous
    // term's rows, so it parses cleanly and yields NOTHING for this term; that is
    // indistinguishable from "no guest lectures scheduled yet" unless we also look
    // at the paste tab.
    // While the big-drop guard is holding the class rows, the guest lectures and
    // feedback sessions that come from the SAME half-edited mirror (its inline
    // markers) are held with them — applying those alone would bump the revision and
    // rebuild everyone's calendar from a sheet this run has already judged
    // untrustworthy. A real published GL/FD tab is a separate source and still counts.
    var mirrorHeld = classDataHeld && !!mirror;
    var guestRows = null;
    var guestSignature;
    try {
      var guestRaw = adminStep_("fetch guest lecture CSV", function () { return csvTextFrom_(csvResponses, "guest"); });
      guestRows = parseGuestCsv_(guestRaw, parseIssues);
    } catch (guestErr) {
      console.warn("Guest lecture fetch/parse failed: " + getErrorMessage_(guestErr));
      guestRows = null;
    }
    try {
      // The mirror's inline "(Guest Lecture)" markers, used when no published GL
      // tab yielded rows. Second in priority, not first: if the institute ever
      // publishes a real Term V GL tab it carries speakers and topics the mirror's
      // one-word marker cannot, so a live URL must still win.
      if ((!guestRows || !guestRows.length) && mirrorHeld) {
        guestRows = null;   // keep the previous GuestData and signature (see mirrorHeld)
      } else if ((!guestRows || !guestRows.length) && mirror && mirror.guest.length) {
        guestRows = mirror.guest;
        parseIssues.push("Guest lectures taken from the mirror timetable's " +
          "(Guest Lecture) markers — " + guestRows.length + " session(s).");
      }
      if (!mirrorHeld && (!guestRows || !guestRows.length)) {
        var guestPaste = readPasteGrid_(MANUAL_GUEST_SHEET_NAME);
        if (guestPaste.length) {
          guestRows = parseGuestCsv_(guestPaste, parseIssues);
          parseIssues.push("Guest lectures read from the " + MANUAL_GUEST_SHEET_NAME +
            " tab (the published tab has no rows for this term).");
        }
      }
      if (guestRows) {
        assertNotEmptyWipe_(GUEST_SHEET_NAME, guestRows, parseIssues, "Guest lecture CSV");
        guestSignature = dataSignature_(guestRows);
      } else {
        guestSignature = storedSignature_(scriptProps, 'guest_data_signature');
      }
    } catch (guestErr2) {
      console.error("Guest lecture data preserved after error: " + getErrorMessage_(guestErr2));
      guestRows = null;
      guestSignature = storedSignature_(scriptProps, 'guest_data_signature');
    }

    // Feedback windows and links. Produces no events — the rows are read during each
    // user's sync and folded into the descriptions of that course's classes (see
    // feedbackNoteFor_), so a failure here only means the links stop appearing.
    var feedbackRows = null;
    var feedbackSignature;
    try {
      var feedbackRaw = adminStep_("fetch feedback CSV", function () { return csvTextFrom_(csvResponses, "feedback"); });
      feedbackRows = parseFeedbackCsv_(feedbackRaw, parseIssues);
    } catch (feedbackErr) {
      console.warn("Feedback fetch/parse failed: " + getErrorMessage_(feedbackErr));
      feedbackRows = null;
    }
    try {
      // Same priority rule as guest lectures above.
      if ((!feedbackRows || !feedbackRows.length) && mirrorHeld) {
        feedbackRows = null;   // keep the previous FeedbackData and signature (see mirrorHeld)
      } else if ((!feedbackRows || !feedbackRows.length) && mirror && mirror.feedback.length) {
        feedbackRows = mirror.feedback;
        parseIssues.push("Feedback sessions taken from the mirror timetable's " +
          "(Feedback) markers — " + feedbackRows.length + " session(s).");
      }
      if (!mirrorHeld && (!feedbackRows || !feedbackRows.length)) {
        var fbPaste = readPasteGrid_(MANUAL_FEEDBACK_SHEET_NAME);
        if (fbPaste.length) {
          feedbackRows = parseFeedbackCsv_(fbPaste, parseIssues);
          parseIssues.push("Feedback read from the " + MANUAL_FEEDBACK_SHEET_NAME +
            " tab (the published tab has no rows for this term).");
        }
      }
      if (feedbackRows) {
        assertNotEmptyWipe_(FEEDBACK_SHEET_NAME, feedbackRows, parseIssues, "Feedback CSV");
        feedbackSignature = dataSignature_(feedbackRows);
      } else {
        feedbackSignature = storedSignature_(scriptProps, 'feedback_data_signature');
      }
    } catch (feedbackErr2) {
      console.error("Feedback data preserved after error: " + getErrorMessage_(feedbackErr2));
      feedbackRows = null;
      feedbackSignature = storedSignature_(scriptProps, 'feedback_data_signature');
    }

    // Course catalogue: reconciliation only, never a data source for events. It
    // writes no sheet and gates no change detection, so a failure here must not
    // affect the fetch at all — hence the bare catch.
    // Only count a source as missing if nothing actually supplied it this run —
    // the mirror covers all three of these without any published CSV.
    var satisfiedKeys = [];
    if (hasTimetableSource_()) satisfiedKeys.push("timetable");
    if ((guestRows && guestRows.length) || mirrorHeld) satisfiedKeys.push("guest");
    if ((feedbackRows && feedbackRows.length) || mirrorHeld) satisfiedKeys.push("feedback");
    var stillPending = pendingCsvSources_(satisfiedKeys);
    if (stillPending.length) {
      parseIssues.push("No link in config.gs, so absent from this run: " + stillPending.join(", "));
    }
    if (SETTINGS_PROBLEMS_.length) {
      parseIssues.push("config.gs needs attention (run ✓ Check settings): " + SETTINGS_PROBLEMS_.join(" | "));
    }

    try {
      reportCatalogueDrift_(csvTextFrom_(csvResponses, "catalogue"), parseIssues);
    } catch (catErr) {
      console.warn("Course catalogue check skipped: " + getErrorMessage_(catErr));
    }

    // Fetch the OLT marks status (Result Receipt Record) — same isolation as
    // quizzes/exams: a marks-side failure preserves the previously stored data and
    // its signature, so a transient hiccup never strips ✅ stamps from everyone's
    // events. The previous MarksStatus rows are read here (before any write) both
    // to carry each entry's first-seen date forward and to diff for the changelog.
    var marksRows = null;
    var marksSignature;
    var oldMarksRows = [];
    try {
      var marksRaw = adminStep_("fetch marks CSV", function () { return csvTextFrom_(csvResponses, "marks"); });
      var parsedMarks = parseMarksCsv_(marksRaw, parseIssues);
      oldMarksRows = getMarksData_();
      marksRows = mergeMarksFirstSeen_(parsedMarks, oldMarksRows);
      assertNotEmptyWipe_(MARKS_SHEET_NAME, marksRows, parseIssues, "Marks CSV");
      marksSignature = dataSignature_(marksRows);
    } catch (marksErr) {
      console.error("Marks fetch/parse failed; preserving previous marks data: " + getErrorMessage_(marksErr));
      marksRows = null;
      marksSignature = storedSignature_(scriptProps, 'marks_data_signature');
    }

    // Surface skipped-row problems to the ADMIN (students never see these): a
    // skipped row means a class/quiz is missing from every calendar, which is
    // otherwise invisible until someone misses a class. Re-reported only when
    // the issue set changes, never per-run.
    reportParseIssuesIfChanged_(scriptProps, parseIssues);

    // Class-timetable and quiz-schedule changes are fingerprinted SEPARATELY so the
    // UI can show when each master table last changed (per-table verification), and
    // only the sheet that actually changed gets rewritten. The revision still bumps
    // when either changes, so users re-sync on any change. Class fingerprint covers
    // the parsed timetable plus the course metadata version; every other source
    // compares its dataSignature_ against the stored one (only updated on a
    // successful fetch, so a transient hiccup never registers as a change).
    var classFingerprint = hashString_(JSON.stringify(cleanData) + "|" + COURSE_INFO_VERSION_);
    var oldClassFingerprint = scriptProps.getProperty('master_data_fingerprint');
    var classChanged = !(oldClassFingerprint && classFingerprint === oldClassFingerprint);
    // Held by the big-drop guard: leave MasterData and its fingerprint exactly as
    // they are, so the next fetch compares against the data students still have.
    if (classDataHeld) {
      classChanged = false;
      classFingerprint = oldClassFingerprint;
    }
    var oldQuizSignature = storedSignature_(scriptProps, 'quiz_data_signature');
    var quizChanged = quizRows !== null && quizSignature !== oldQuizSignature;
    var oldExamSignature = storedSignature_(scriptProps, 'exam_data_signature');
    var examChanged = examRows !== null && examSignature !== oldExamSignature;
    var oldEndTermSignature = storedSignature_(scriptProps, 'endterm_data_signature');
    var endTermChanged = endTermRows !== null && endTermSignature !== oldEndTermSignature;
    var oldGuestSignature = storedSignature_(scriptProps, 'guest_data_signature');
    var guestChanged = guestRows !== null && guestSignature !== oldGuestSignature;
    var oldFeedbackSignature = storedSignature_(scriptProps, 'feedback_data_signature');
    var feedbackChanged = feedbackRows !== null && feedbackSignature !== oldFeedbackSignature;
    var oldMarksSignature = storedSignature_(scriptProps, 'marks_data_signature');
    var marksChanged = marksRows !== null && marksSignature !== oldMarksSignature;

    // A missing sheet must force a rewrite regardless of fingerprints: they compare
    // CSV-to-CSV, so a deleted MasterData/QuizData/ExamData/EndTermData sheet would
    // otherwise never be rebuilt ("No changes detected") until the institute CSV
    // next changed.
    var ssCheck = SpreadsheetApp.getActiveSpreadsheet();
    if (!ssCheck.getSheetByName("MasterData")) { classChanged = true; classFingerprint = hashString_(JSON.stringify(cleanData) + "|" + COURSE_INFO_VERSION_); classDataHeld = false; }
    if (quizRows !== null && !ssCheck.getSheetByName(QUIZ_SHEET_NAME)) quizChanged = true;
    if (examRows !== null && !ssCheck.getSheetByName(EXAM_SHEET_NAME)) examChanged = true;
    if (endTermRows !== null && !ssCheck.getSheetByName(ENDTERM_SHEET_NAME)) endTermChanged = true;
    if (guestRows !== null && !ssCheck.getSheetByName(GUEST_SHEET_NAME)) guestChanged = true;
    if (feedbackRows !== null && !ssCheck.getSheetByName(FEEDBACK_SHEET_NAME)) feedbackChanged = true;
    if (marksRows !== null && !ssCheck.getSheetByName(MARKS_SHEET_NAME)) marksChanged = true;

    var nowStr = String(Date.now());

    if (!classChanged && !quizChanged && !examChanged && !endTermChanged && !marksChanged &&
        !guestChanged && !feedbackChanged) {
      var unchangedProps = {
        'last_fetch_at': nowStr,
        'last_fetch_had_changes': 'false'
      };
      // Seeds the big-drop guard's baseline on the first run after it shipped (the
      // count is otherwise only written when MasterData is rewritten). Never while
      // a drop is being held: then cleanData is NOT what MasterData holds.
      if (!classDataHeld) unchangedProps['master_data_row_count'] = String(cleanData.length);
      scriptProps.setProperties(unchangedProps);
      // Restart the page-load caches' TTL every run, so they never expire between
      // fetches (see COURSE_DATA_CACHE_TTL_SECONDS_).
      warmPageCaches_();
      return "No changes detected.";
    }

    // Snapshot the sheets BEFORE overwriting so the changelog can diff old-vs-new.
    // Captured here, logged only after the writes commit (below) — so a write that
    // fails and retries re-reads the already-overwritten sheet, diffs new-vs-new,
    // and logs nothing the second time around (no duplicate entries).
    var oldClassRows = [];
    var oldQuizRows = [];
    var oldExamRows = [];
    var oldEndTermRows = [];

    if (classChanged) {
      var sheet = getOrCreateSheet_("MasterData");
      protectDataSheet_(sheet);
      var prevLastRow = sheet.getLastRow();
      if (prevLastRow > 1) {
        try { oldClassRows = sheet.getRange(2, 1, prevLastRow - 1, 8).getValues(); } catch (snapErr) { oldClassRows = []; }
      }
      var totalRows = Math.max(cleanData.length + 1, prevLastRow, 1);
      var matrix = new Array(totalRows);
      matrix[0] = ["Date", "Start Time", "End Time", "Course Code", "Section", "Course Name", "Instructor", "Room", "Session"];
      for (var ci = 0; ci < cleanData.length; ci++) matrix[ci + 1] = cleanData[ci];
      for (var pi = cleanData.length + 1; pi < totalRows; pi++) matrix[pi] = ["", "", "", "", "", "", "", "", ""];
      adminStep_("write MasterData sheet", function () {
        sheet.getRange(1, 1, totalRows, 9).setValues(matrix);
        // Column A now holds real Date objects — pin the display format so the
        // sheet stays readable regardless of the spreadsheet locale.
        sheet.getRange(2, 1, Math.max(cleanData.length, 1), 1).setNumberFormat("dd/mm/yyyy");
        // Metadata labels sit one column right of the data (now A–I): Last Updated
        // in J, Parse Issues in K (see reportParseIssuesIfChanged_).
        sheet.getRange("J1").setValue("Last Updated");
        sheet.getRange("J2").setValue(new Date()).setNumberFormat("dd/mm/yyyy hh:mm AM/PM");
      });
    }

    // Only rewrite each sheet when its fetch succeeded AND its content changed;
    // otherwise the previous sheet and stored signature are left intact. The
    // snapshot must be taken before the write, so the change log can diff old
    // against new. The end-term tab shares the exam column layout, hence the
    // shared EXAM_SHEET_HEADER_.
    if (quizChanged) {
      oldQuizRows = snapshotSheetRows_(QUIZ_SHEET_NAME, QUIZ_SHEET_HEADER_.length);
      adminStep_("write QuizData sheet", function () { writeDataSheet_(QUIZ_SHEET_NAME, QUIZ_SHEET_HEADER_, quizRows, "Date", "dd/mm/yyyy"); });
      scriptProps.setProperty('quiz_data_signature', quizSignature);
    }

    if (examChanged) {
      oldExamRows = snapshotSheetRows_(EXAM_SHEET_NAME, EXAM_SHEET_HEADER_.length);
      adminStep_("write ExamData sheet", function () { writeDataSheet_(EXAM_SHEET_NAME, EXAM_SHEET_HEADER_, examRows, "Date", "dd/mm/yyyy"); });
      scriptProps.setProperty('exam_data_signature', examSignature);
    }

    if (endTermChanged) {
      oldEndTermRows = snapshotSheetRows_(ENDTERM_SHEET_NAME, EXAM_SHEET_HEADER_.length);
      adminStep_("write EndTermData sheet", function () { writeDataSheet_(ENDTERM_SHEET_NAME, EXAM_SHEET_HEADER_, endTermRows, "Date", "dd/mm/yyyy"); });
      scriptProps.setProperty('endterm_data_signature', endTermSignature);
    }

    if (guestChanged) {
      adminStep_("write GuestData sheet", function () { writeDataSheet_(GUEST_SHEET_NAME, GUEST_SHEET_HEADER_, guestRows, "Date", "dd/mm/yyyy"); });
      scriptProps.setProperty('guest_data_signature', guestSignature);
    }

    if (feedbackChanged) {
      // "Date", not "Window Start": FEEDBACK_SHEET_HEADER_ has no such column, so
      // writeDataSheet_'s header.indexOf lookup returned -1 and it threw on EVERY
      // run that had feedback rows to write — taking the whole fetch down with it,
      // MasterData included. A leftover from an earlier FD schema that carried a
      // collection window. The layout is identical to GuestData's, so the date
      // column and format must match it too.
      adminStep_("write FeedbackData sheet", function () { writeDataSheet_(FEEDBACK_SHEET_NAME, FEEDBACK_SHEET_HEADER_, feedbackRows, "Date", "dd/mm/yyyy"); });
      scriptProps.setProperty('feedback_data_signature', feedbackSignature);
    }

    // Only rewrite MarksStatus when the fetch succeeded AND its content changed;
    // otherwise the previous sheet and stored signature are left intact. The old
    // rows were already snapshotted in the fetch block (needed for the first-seen
    // merge), so no re-read here.
    if (marksChanged) {
      adminStep_("write MarksStatus sheet", function () { writeDataSheet_(MARKS_SHEET_NAME, MARKS_SHEET_HEADER_, marksRows, "First Seen", "yyyy-mm-dd"); });
      scriptProps.setProperty('marks_data_signature', marksSignature);
    }

    adminStep_("flush sheets", function () { SpreadsheetApp.flush(); });
    // Both exam sheets may have just been rewritten, and this pass can run more than
    // once per execution (fetchAndCleanAdminData retries). Drop the per-execution
    // exam-row memo alongside the script-cache entries cleared further down, so no
    // later read in this execution serves pre-write rows.
    resetExamRowsMemo_();

    // Record what changed (room/instructor/time/date edits, classes added/removed)
    // for the in-app changes log. Skipped on the first-ever population (no previous
    // rows) so the initial seed of the whole term isn't logged as hundreds of adds.
    //
    // Skipped for the same reason on the first fetch of a NEW TERM. The old-vs-new
    // comparison there is Term 4's timetable against Term 5's — two disjoint course
    // sets — so every single row reads as "removed" and every new one as "added".
    // That is not an institute edit; it is the handover. Stamp the baseline instead,
    // and leave one marker row so both the sheet and the viewer show where the term
    // begins. See TERM_BASELINE_AT_PROP_.
    // Never throws — logging must not break the fetch.
    try {
      var baselineLabel = scriptProps.getProperty(TERM_BASELINE_LABEL_PROP_) || "";
      var isTermSwitch = baselineLabel !== TERM_CONFIG_.label;
      if (isTermSwitch) {
        var switchAt = Date.now();
        try {
          scriptProps.setProperty(TERM_BASELINE_LABEL_PROP_, TERM_CONFIG_.label);
          scriptProps.setProperty(TERM_BASELINE_AT_PROP_, String(switchAt));
        } catch (stampErr) { }
        logTimetableChanges_([{
          type: TERM_BASELINE_MARKER_,
          category: TERM_CONFIG_.label,
          course: "", section: "", classDate: "", field: "", from: "", to: "",
          details: TERM_CONFIG_.label + " timetable loaded — " + cleanData.length +
            " class row(s). Everything below this line is " +
            (baselineLabel || PREVIOUS_TERM_.label) + "; everything above it is a real " +
            TERM_CONFIG_.label + " change."
        }]);
      }
      var allChanges = [];
      // Quizzes and exams are diffed even against an empty sheet: a term's first
      // published schedule is news ("new quiz"), and since a term switch now clears
      // last term's rows (assertNotEmptyWipe_), empty is how every term's schedule
      // starts. The very first fetch of a term is a term switch and logs nothing.
      if (!isTermSwitch && classChanged && oldClassRows.length) {
        allChanges = allChanges.concat(diffSheetData_(oldClassRows, cleanData, "Class"));
      }
      if (!isTermSwitch && quizChanged && quizRows !== null) {
        allChanges = allChanges.concat(diffSheetData_(currentTermRows_(oldQuizRows), quizRows, "Quiz"));
      }
      if (!isTermSwitch && examChanged && examRows !== null) {
        allChanges = allChanges.concat(diffSheetData_(currentTermRows_(oldExamRows), examRows, "Mid-Term"));
      }
      if (!isTermSwitch && endTermChanged && endTermRows !== null) {
        allChanges = allChanges.concat(diffSheetData_(currentTermRows_(oldEndTermRows), endTermRows, "End-Term"));
      }
      if (!isTermSwitch && marksChanged && marksRows !== null && oldMarksRows.length) {
        allChanges = allChanges.concat(diffMarksData_(oldMarksRows, marksRows));
      }
      if (allChanges.length) logTimetableChanges_(allChanges);
    } catch (changeLogErr) {
      console.warn("Change-log step failed: " + getErrorMessage_(changeLogErr));
    }

    var currentRev = parseInt(scriptProps.getProperty('master_data_revision') || "0", 10);
    var newProps = {
      'master_data_fingerprint': classFingerprint,
      'master_data_revision': String(currentRev + 1),
      'last_fetch_at': nowStr,
      'last_fetch_changed_at': nowStr,
      'last_fetch_had_changes': 'true'
    };
    if (classChanged) {
      newProps['last_class_changed_at'] = nowStr;
      newProps['master_data_row_count'] = String(cleanData.length);
    }
    if (quizChanged) newProps['last_quiz_changed_at'] = nowStr;
    if (examChanged) newProps['last_exam_changed_at'] = nowStr;
    if (endTermChanged) newProps['last_endterm_changed_at'] = nowStr;
    if (guestChanged) newProps['last_guest_changed_at'] = nowStr;
    if (feedbackChanged) newProps['last_feedback_changed_at'] = nowStr;
    if (marksChanged) newProps['last_marks_changed_at'] = nowStr;
    scriptProps.setProperties(newProps);
    // Legacy properties with no reader left: course_info_version is now baked into
    // the fingerprint, and the per-table last_fetch_*_changed booleans were only ever
    // read by a health payload the client no longer renders.
    scriptProps.deleteProperty('course_info_version');
    scriptProps.deleteProperty('last_fetch_class_changed');
    scriptProps.deleteProperty('last_fetch_quiz_changed');
    scriptProps.deleteProperty('last_fetch_exam_changed');
    scriptProps.deleteProperty('last_fetch_endterm_changed');
    scriptProps.deleteProperty('last_fetch_marks_changed');
    // The bump above retires the previous revision's cache entries (they are keyed by
    // it); build this revision's now, so no student's page load has to.
    warmPageCaches_();

    var changedBits = [];
    if (classChanged) changedBits.push("class timetable");
    if (quizChanged) changedBits.push("quiz schedule");
    if (examChanged) changedBits.push("mid-term exam schedule");
    if (endTermChanged) changedBits.push("end-term schedule");
    if (guestChanged) changedBits.push("guest lectures");
    if (feedbackChanged) changedBits.push("feedback schedule");
    if (marksChanged) changedBits.push("OLT marks status");
    return "Updated " + changedBits.join(" + ") + ". New Revision: " + (currentRev + 1);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------
// QUIZ SCHEDULE
// ---------------------------------------------------------

var QUIZ_MONTHS_ = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// Parses the institute sheets' dates — "19/Oct/26" (the mid-term tab), "14-Oct-2026"
// (the quiz tab), "8/Jul/26" — into a Date (local midnight).
// Returns null on anything it can't read, so callers skip the row instead of throwing.
//
// Every date the tool reads goes through here (parseSheetDate_ tries it first), so it
// must never turn a real date into a DIFFERENT real date. It used to: a year-first
// "2026-09-14" came out as 18 Mar 2020 (2026 read as the day, 14 as the year) and
// "31/09/2026" rolled over to 1 Oct. A misread that still yields a valid date is the
// dangerous kind — it sails past every "unreadable date" check, lands outside the
// sync window, and each student's next sync deletes those classes. So a year-first
// date is read as Y-M-D, and anything that does not survive a round trip through
// Date (day 31 of a 30-day month, month 14, day 0) is rejected.
function parseQuizDate_(val) {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  var s = val ? val.toString().trim() : "";
  if (!s) return null;
  var ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?![\d])/);
  if (ymd) return exactDate_(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  var parts = s.split(/[\/\-\s]+/);
  if (parts.length < 3) return null;
  var day = parseInt(parts[0], 10);
  // Accept both month names ("Jul") and numeric months ("07"), so a format tweak in
  // the master sheet doesn't silently drop quizzes.
  var mon = QUIZ_MONTHS_[parts[1].toString().toLowerCase().substring(0, 3)];
  if (mon == null) {
    var monNum = parseInt(parts[1], 10);
    if (!isNaN(monNum) && monNum >= 1 && monNum <= 12) mon = monNum - 1;
  }
  var yr = parseInt(parts[2], 10);
  if (isNaN(day) || mon == null || isNaN(yr)) return null;
  if (yr < 100) yr += 2000;
  return exactDate_(yr, mon, day);
}

// new Date(y, m, d) at local midnight, or null when (y, m, d) is not a real calendar
// date. JavaScript silently rolls an impossible date over ("31 Sep" → 1 Oct); this
// refuses instead, so the row is reported as unreadable rather than misplaced.
function exactDate_(yr, mon, day) {
  if (isNaN(yr) || isNaN(mon) || isNaN(day) || yr < 1900 || yr > 2200) return null;
  var d = new Date(yr, mon, day);
  if (d.getFullYear() !== yr || d.getMonth() !== mon || d.getDate() !== day) return null;
  return d;
}

// The quiz AND exam sheets are shared across terms (this term's quiz tab also carries
// the first-years' Term II rows). We only want this term's rows, flagged in the
// "Batch / Term" column as "T-5" / "Term-V". Anything
// not clearly this term (including other terms' rows) is rejected. Used by
// parseQuizCsv_, parseExamCsv_ and the marks parser
// (TERM_CONFIG_.quizTermTags is the shared tag list).
//
// Exclusions are tested FIRST because matching is substring-based, and this term's
// tags are prefixes of the next term's: "TERM-V" ⊂ "TERM-VI", "TERMV" ⊂ "TERMVI".
// Without that ordering a Term VI row would read as a Term V row.
function isTermRow_(termCell) {
  if (!termCell) return false;
  var t = termCell.toString().toUpperCase().replace(/\s+/g, "");
  var exclude = TERM_CONFIG_.excludeTermTags || [];
  for (var e = 0; e < exclude.length; e++) {
    if (t.indexOf(exclude[e]) !== -1) return false;
  }
  for (var i = 0; i < TERM_CONFIG_.quizTermTags.length; i++) {
    if (t.indexOf(TERM_CONFIG_.quizTermTags[i]) !== -1) return true;
  }
  return false;
}

// Locates a column index by trying each keyword against the (lowercased) header row.
// Exact header matches win first, in keyword-priority order, before any substring
// match — so e.g. an "Attendance" column appearing before "End Time" can never
// hijack the "end" keyword, and "start time" is preferred over a bare "start".
function findQuizCol_(header, keywords) {
  var norm = [];
  for (var c = 0; c < header.length; c++) {
    norm.push(header[c] ? header[c].toString().toLowerCase().trim() : "");
  }
  for (var k = 0; k < keywords.length; k++) {
    for (var e = 0; e < norm.length; e++) {
      if (norm[e] === keywords[k]) return e;
    }
  }
  for (var k2 = 0; k2 < keywords.length; k2++) {
    for (var s = 0; s < norm.length; s++) {
      if (norm[s] && norm[s].indexOf(keywords[k2]) !== -1) return s;
    }
  }
  return -1;
}

// Parses the published quiz CSV into normalized rows ready for the QuizData sheet.
// Columns are resolved by header name (not position) so a reordered sheet still works.
// Rows it has to skip (unreadable date/time) are described in `issues` (optional
// array) so the admin fetch can surface them — see reportParseIssuesIfChanged_.
// Output row shape:
//   [Date, Start Time, End Time, Course Code, Section, Course Name, Faculty, Exam Hall, Quiz #, Duration, Instructions]
function parseQuizCsv_(rawText, issues) {
  issues = issues || [];
  var csv = Utilities.parseCsv(rawText);
  var headerRow = -1;
  for (var r = 0; r < csv.length; r++) {
    if (findQuizCol_(csv[r], ["course code"]) !== -1 && findQuizCol_(csv[r], ["date"]) !== -1) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) throw new Error("Quiz sheet header row not found.");

  var header = csv[headerRow];
  var col = {
    code: findQuizCol_(header, ["course code"]),
    date: findQuizCol_(header, ["date"]),
    start: findQuizCol_(header, ["starttime", "start time", "start"]),
    end: findQuizCol_(header, ["end time", "endtime", "end"]),
    term: findQuizCol_(header, ["batch", "term"]),
    section: findQuizCol_(header, ["section", "group"]),
    faculty: findQuizCol_(header, ["faculty"]),
    quizNum: findQuizCol_(header, ["quiz#", "quiz #", "quiz"]),
    hall: findQuizCol_(header, ["exam hall", "hall", "room", "venue"]),
    instructions: findQuizCol_(header, ["instruction"]),
    duration: findQuizCol_(header, ["duration"])
  };
  if (col.code === -1 || col.date === -1 || col.start === -1 || col.end === -1) {
    throw new Error("Quiz sheet missing required columns.");
  }

  var get = function (row, idx) {
    return (idx !== -1 && row[idx] != null) ? row[idx].toString().trim() : "";
  };

  var rows = [];
  var seenQuizRows = {};
  for (var i = headerRow + 1; i < csv.length; i++) {
    var row = csv[i];
    if (!row) continue;
    var code = get(row, col.code).toUpperCase();
    if (!code) continue;
    if (!isTermRow_(get(row, col.term))) continue;

    var dateObj = parseQuizDate_(get(row, col.date));
    if (!dateObj) {
      issues.push("Quiz row " + (i + 1) + " (" + code + "): unreadable date \"" + get(row, col.date) + "\" — skipped");
      console.error("Skipping quiz row " + (i + 1) + " with unreadable date: \"" + get(row, col.date) + "\"");
      continue;
    }

    // Validate + normalize the time pair to 24h "HH:mm" here, while the ADMIN
    // can still see the problem — left as-is, a swapped/unreadable pair would
    // make every enrolled student's sync fail on a Calendar API reject.
    var range = normalizeTimeRange_(get(row, col.start), get(row, col.end));
    if (!range) {
      issues.push("Quiz row " + (i + 1) + " (" + code + "): unusable time \"" +
        get(row, col.start) + " – " + get(row, col.end) + "\" — skipped");
      continue;
    }

    var section = get(row, col.section);
    // "-", "All", "All sections", "Both", "NA", "Common" all mean "applies to
    // every section" — normalize to "" so the section matcher doesn't silently
    // drop the quiz for every sectioned student. ("AND" is stripped after
    // flattening so "A and B" reads as the combined-section value "AB".)
    var secFlat = section.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/AND/g, "");
    var sectionList;
    if (secFlat === "" || secFlat === "ALL" || secFlat === "ALLSECTIONS" ||
        secFlat === "BOTH" || secFlat === "NA" || secFlat === "COMMON") {
      sectionList = [""];
    } else if (/^[A-E]{2,5}$/.test(secFlat) && !/([A-E]).*\1/.test(secFlat)) {
      // A combined-section cell ("A & B", "A,B", "A/B") — emit one row PER
      // section. Left as-is, the flattened value ("AB") matches no student's
      // section and the quiz silently vanishes for everyone enrolled.
      sectionList = secFlat.split("");
    } else {
      sectionList = [section];
    }
    var info = COURSE_INFO_[code];
    var courseName = (info && info.name) || code;

    for (var sl = 0; sl < sectionList.length; sl++) {
      var quizRow = [
        dateObj,
        range.start,
        range.end,
        code,
        sectionList[sl],
        courseName,
        get(row, col.faculty) || "Unknown",
        get(row, col.hall),
        get(row, col.quizNum),
        get(row, col.duration),
        get(row, col.instructions)
      ];
      // Exact duplicate rows would otherwise become duplicate calendar events.
      var dupKey = JSON.stringify(quizRow);
      if (seenQuizRows[dupKey]) continue;
      seenQuizRows[dupKey] = true;
      rows.push(quizRow);
    }
  }
  return rows;
}

var QUIZ_SHEET_HEADER_ = ["Date", "Start Time", "End Time", "Course Code", "Section", "Course Name", "Faculty", "Exam Hall", "Quiz #", "Duration (Min)", "Instructions"];

// Reads QuizData for the per-user sync. Read-only (never inserts the sheet) because
// regular users may not have edit rights — only the admin fetch creates it. The
// writer is the shared writeDataSheet_.
function getQuizData_() {
  return readSheetDataRows_(QUIZ_SHEET_NAME);
}

// Builds prepared-event records for every quiz whose course the user is enrolled in
// and appends them to `prepared`. Same record shape as class events, but with the
// fixed standout quiz colour and a quiz-specific title/description (instructions
// included). Rows with unreadable dates/times are skipped, never thrown.
// selectedCodes: { CODE: { SECTION: true, ... } } — see backgroundSyncLocked_.
//   row: [Date, Start, End, Code, Section, CourseName, Faculty, Hall, Quiz#, Duration, Instructions]
function appendQuizEvents_(prepared, selectedCodes, reminderMinutes) {
  var quizRows = getQuizData_();
  // A course that is section-less on the timetable can still meet per-section
  // quiz rows ("A" and "B" copies of one sitting) when the institute's sheets
  // disagree — every copy passes the section filter below with near-identical
  // content and would become duplicate calendar events. For such courses only,
  // keep the first sitting per (course, start, end) slot.
  var sectionlessQuizSeen = {};
  for (var i = 0; i < quizRows.length; i++) {
    var row = quizRows[i];
    var code = row[3] ? row[3].toString().trim().toUpperCase() : "";
    var enrolledSections = selectedCodes[code];
    if (!code || !enrolledSections) continue;

    // Section-specific quiz rows only apply to students enrolled in that section.
    // Rows with no section ("-" is normalized to "" in parseQuizCsv_) apply to the
    // whole course. If the user's course itself has no sections, the user's section
    // set is empty — include the row rather than guess at a mismatch.
    var quizSection = row[4] ? row[4].toString().trim().toUpperCase() : "";
    if (quizSection && Object.keys(enrolledSections).length > 0 && !enrolledSections[quizSection]) continue;

    var dateObj = parseSheetDate_(row[0]);
    if (!dateObj) continue;
    if (!isWithinSyncWindow_(dateObj)) {
      console.warn("Skipping quiz outside the sync window (" + code + " on " +
        dateObj.toDateString() + ") — it could never be cleared on re-sync.");
      continue;
    }

    var startParse, endParse;
    try {
      startParse = parseTime_(row[1]);
      endParse = parseTime_(row[2]);
    } catch (timeErr) {
      console.error("Skipping quiz with unparseable time: " + getErrorMessage_(timeErr));
      continue;
    }
    // Backstop for the admin-side validation: an end ≤ start pair would be
    // rejected by the Calendar API and fail every sync, every hour.
    if (!isValidTimeRange_(startParse, endParse)) {
      console.error("Skipping " + code + " quiz whose end time isn't after its start.");
      continue;
    }
    var startTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), startParse.h, startParse.m, 0);
    var endTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), endParse.h, endParse.m, 0);

    // Section-less enrollment: collapse per-section copies of one sitting (see
    // sectionlessQuizSeen above). Sectioned enrollment needs no guard — the
    // section filter already admits at most one copy.
    if (Object.keys(enrolledSections).length === 0) {
      var slotKey = code + "|" + startTime.getTime() + "|" + endTime.getTime();
      if (sectionlessQuizSeen[slotKey]) continue;
      sectionlessQuizSeen[slotKey] = true;
    }

    var info = COURSE_INFO_[code];
    var displayName = (info && info.name) || (row[5] ? row[5].toString().trim() : code);
    var area = (info && info.area) || "";
    var credits = (info && info.credits) || 0;

    var faculty = row[6] ? row[6].toString().trim() : "";
    var hall = row[7] ? row[7].toString().trim() : "";
    var quizNum = row[8] ? row[8].toString().trim() : "";
    var duration = row[9] ? row[9].toString().trim() : "";
    var instructions = row[10] ? row[10].toString().trim() : "";

    // Evaluation weight (Decision B): show the BUCKET the quiz belongs to, never an
    // invented per-quiz split — "(part of 30%)" in the title, the component label +
    // weight in the description. null when the course has no graded quiz component.
    var quizEval = quizEvalComponent_(code);
    // OLT marks stamp: matched by course + quiz number against the user's enrolled
    // sections. The ✅ rides the title's PREFIX (second glyph, right after 📝) because
    // Google Calendar's month view truncates a chip after a few characters — a
    // trailing tick was never visible there. 📝 stays at index 0, which
    // isQuizEventTitle_ / buildDeletePlan_ depend on. The signature diff propagates
    // the change to already-synced (past) events.
    var quizMarks = findMarksEntry_(code, "quiz", quizNum, enrolledSections);
    var title = "📝" + (quizMarks ? "✅" : "") + " " + code + " Quiz" + (quizNum ? " " + quizNum : "") + " — " + displayName +
      (quizEval ? " (part of " + quizEval.weight + "%)" : "");

    var descLines = [];
    if (area && credits) descLines.push(area + " · " + credits + (Number(credits) === 1 ? " credit" : " credits"));
    else if (area) descLines.push(area);
    else if (credits) descLines.push(credits + (Number(credits) === 1 ? " credit" : " credits"));
    descLines.push("");
    descLines.push("📝 QUIZ" + (quizNum ? " #" + quizNum : ""));
    if (quizMarks) descLines.push(marksUploadedLine_(quizMarks));
    if (quizEval) descLines.push("Weight: " + quizEval.weight + "% of final grade — " + quizEval.label);
    if (faculty) descLines.push("Instructor: " + faculty);
    if (duration) descLines.push("Duration: " + duration + " min");
    if (hall) descLines.push("Exam Hall: " + hall);
    if (instructions) {
      descLines.push("");
      descLines.push("Instructions:");
      descLines.push(instructions);
    }
    descLines.push("");
    descLines.push(APP_TAG);

    prepared.push({
      title: title,
      description: descLines.join("\n"),
      location: hall ? (LOCATION_PREFIX_ + " | " + hall) : LOCATION_PREFIX_,
      startTime: startTime,
      endTime: endTime,
      colorId: QUIZ_COLOR_ID_,
      colorSlot: QUIZ_COLOR_SLOT_,
      reminderMinutes: reminderMinutes
    });
  }
}

// ---------------------------------------------------------
// EXAM SCHEDULE (Mid-Term / End-Term)
// ---------------------------------------------------------
// Mirrors the quiz plumbing exactly (parse → ExamData sheet → per-user sync), but
// exams are matched on course code alone (no per-section split), use the standout
// Blueberry colour + 📕 prefix, and carry exam-only fields. See appendExamEvents_.

var EXAM_SHEET_HEADER_ = ["Date", "Start Time", "End Time", "Course Code", "Section", "Course Name", "Faculty", "Exam Hall", "Session", "Exam Type", "Instructions"];

// Index of the synthetic "which tab did this row come from" cell that getAllExamRows_
// appends to every row it hands out. It sits one past the sheet's last real column, so
// it is never written to a sheet and never seen by the 0..10 indexed accessors — but,
// unlike a property hung off the array, it survives slice/map/sort/JSON. A consumer
// that copies a row therefore cannot silently lose the kind and fall back to inferring
// it (which would relabel a genuine end-term "Mid-Term" — see examTermLabel_ rule 3).
var EXAM_KIND_COL_ = EXAM_SHEET_HEADER_.length;   // 11

// End-term exam windows from the live academic calendar (falls back to
// TERM_CONFIG_.academic inside getAcademic_), as inclusive "yyyy-MM-dd" string
// pairs. Memoized per execution: examTermLabel_ runs once per exam row per sync,
// and getAcademic_'s shared cache read shouldn't be paid each time.
var END_TERM_WINDOWS_ = null;
function getEndTermWindows_() {
  if (END_TERM_WINDOWS_ !== null) return END_TERM_WINDOWS_;
  var wins = [];
  try {
    var ac = getAcademic_();
    var list = (ac && ac.examWindows) || [];
    for (var i = 0; i < list.length; i++) {
      if (/end[\s-]*term/i.test(list[i].label || "") && list[i].start) {
        wins.push({ start: list[i].start, end: list[i].end || list[i].start });
      }
    }
  } catch (e) {
    wins = [];
  }
  END_TERM_WINDOWS_ = wins;
  return wins;
}

// "Mid-Term" vs "End-Term" for an exam sitting, most-authoritative source first so
// the label never contradicts the course's actual scheme:
//   1. The sheet's own "Exam Type" cell, when it explicitly names mid/end/final.
//   2. The exam DATE: anything sat inside an official end-term window IS an
//      end-term, whatever the course's scheme says. (The mid-term window is NOT
//      decisive the other way round — 1.5-credit courses sit their end-term
//      there.) Without this, a course with BOTH exams would get its end-term
//      sitting labelled "Mid-Term" whenever the sheet's Exam Type cell is blank.
//   3. The course's evaluation scheme (COURSE_EVAL_): a course with a mid-term
//      component is sitting its mid-term here; one whose only written exam is a
//      final/end-term (e.g. 1.5-credit courses that finish now, OR any 3-credit
//      course with a single Final) is sitting its END-term — this is the case the
//      old credits-only rule got wrong (it called a 3-credit final a "Mid-Term").
//      A course with BOTH exams defaults to Mid-Term, since the published sheet is
//      the mid-term window. Term V's T-V_MTES leaves Exam Type blank and lists
//      exactly the five courses with a mid-term component (FAMDM, IMPA, PROJ, SDM,
//      TPP), so every row lands here as Mid-Term. A course listed there WITHOUT a
//      mid-term component would read "End-Term" — check its COURSE_EVAL_ entry.
//   4. Fallback for courses with no known scheme: the original credits rule — the
//      mid-term tab is the mid-term, but a ≤1.5-credit course finishes at mid-term so
//      its exam IS its end-term (Term IV's tab was titled "Midterm [Endterm for 1.50
//      credit course]"; every Term V course is 3 credits).
function examTermLabel_(code, credits, examType, dateObj, knownKind) {
  // 0. The row came from a tab that IS one kind of exam (the dedicated end-term
  //    sheet), so nothing needs inferring. Notably this skips rule 2: a published
  //    academic calendar whose window didn't quite cover a sitting would otherwise
  //    fall through to rule 3 and label a genuine end-term "Mid-Term" for every
  //    course that also has a mid-term component.
  if (knownKind) return knownKind;

  var t = (examType || "").toString().toLowerCase();
  if (/mid[\s-]*term/.test(t)) return "Mid-Term";
  if (/end[\s-]*term|final/.test(t)) return "End-Term";

  if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
    var iso = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var wins = getEndTermWindows_();
    for (var w = 0; w < wins.length; w++) {
      if (iso >= wins[w].start && iso <= wins[w].end) return "End-Term";
    }
  }

  var ev = COURSE_EVAL_[code];
  if (ev) {
    var hasMid = ev.components.some(function (c) { return c.kind === "midterm"; });
    var hasEnd = ev.components.some(function (c) { return c.kind === "endterm"; });
    if (hasMid) return "Mid-Term";
    if (hasEnd) return "End-Term";
  }

  var cr = Number(credits) || 0;
  return (cr > 0 && cr <= 1.5) ? "End-Term" : "Mid-Term";
}

// Human duration from a minute count: "3 hr", "1 hr 30 min", "45 min". "" if non-positive.
function formatExamDuration_(mins) {
  mins = Math.round(mins);
  if (!(mins > 0)) return "";
  var h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return h + " hr " + m + " min";
  if (h) return h + " hr";
  return m + " min";
}

// Parses the published exam CSV into normalized rows for the ExamData sheet. Columns
// are resolved by header name (not position). Exams have no section column, so col 4
// (Section) is written blank to keep the 0..7 layout shared with QuizData/MasterData
// (so changeRecordFromRow_ can diff all three the same way). Skipped rows are
// described in `issues` (optional) so the admin fetch can surface them.
// `label` names the source in those issue lines ("Mid-term exam" / "End-term exam") — the
// mid-term and end-term tabs share this parser, so without it the admin couldn't
// tell which sheet a skipped row came from.
//   [Date, Start, End, Code, Section, CourseName, Faculty, Hall, Session, ExamType, Instructions]
function parseExamCsv_(rawText, issues, label) {
  issues = issues || [];
  label = label || "Exam";
  var csv = Utilities.parseCsv(rawText);
  var headerRow = -1;
  for (var r = 0; r < csv.length; r++) {
    if (findQuizCol_(csv[r], ["coursecode", "course code", "code"]) !== -1 &&
        findQuizCol_(csv[r], ["date"]) !== -1) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) throw new Error(label + " sheet header row not found.");

  var header = csv[headerRow];
  var col = {
    code: findQuizCol_(header, ["coursecode", "course code", "code"]),
    name: findQuizCol_(header, ["course title", "course name", "title"]),
    date: findQuizCol_(header, ["date"]),
    start: findQuizCol_(header, ["start time", "starttime", "start"]),
    end: findQuizCol_(header, ["end time", "endtime", "end"]),
    term: findQuizCol_(header, ["batch", "term"]),
    session: findQuizCol_(header, ["session"]),
    faculty: findQuizCol_(header, ["faculty"]),
    hall: findQuizCol_(header, ["exam hall", "hall", "room", "venue"]),
    examType: findQuizCol_(header, ["exam type", "type"]),
    instructions: findQuizCol_(header, ["instruction"])
  };
  if (col.code === -1 || col.date === -1 || col.start === -1 || col.end === -1) {
    throw new Error(label + " sheet missing required columns.");
  }

  var get = function (row, idx) {
    return (idx !== -1 && row[idx] != null) ? row[idx].toString().trim() : "";
  };

  var rows = [];
  var seenExamRows = {};
  var termFiltered = 0;
  for (var i = headerRow + 1; i < csv.length; i++) {
    var row = csv[i];
    if (!row) continue;
    var code = get(row, col.code).toUpperCase();
    if (!code) continue;
    // The Batch/Term column is what separates this term's rows from another term's
    // on a tab the institute shares between terms. When the tab HAS no such column
    // there is nothing to separate — filtering on it would mean isTermRow_("") and
    // silently drop every row, which is how a whole schedule disappears without a
    // single error. Keep them all instead, and say so once in `issues`.
    if (col.term !== -1 && !isTermRow_(get(row, col.term))) {
      termFiltered++;
      continue;
    }

    var dateObj = parseQuizDate_(get(row, col.date));
    if (!dateObj) {
      issues.push(label + " row " + (i + 1) + " (" + code + "): unreadable date \"" + get(row, col.date) + "\" — skipped");
      console.error("Skipping " + label.toLowerCase() + " row " + (i + 1) + " with unreadable date: \"" + get(row, col.date) + "\"");
      continue;
    }

    // Validate + normalize to 24h "HH:mm" while the ADMIN can still see a problem —
    // a swapped/unreadable pair left as-is would make every enrolled student's sync
    // fail on a Calendar API reject.
    var range = normalizeTimeRange_(get(row, col.start), get(row, col.end));
    if (!range) {
      issues.push(label + " row " + (i + 1) + " (" + code + "): unusable time \"" +
        get(row, col.start) + " – " + get(row, col.end) + "\" — skipped");
      continue;
    }

    var info = COURSE_INFO_[code];
    var courseName = (info && info.name) || get(row, col.name) || code;

    var examRow = [
      dateObj,
      range.start,
      range.end,
      code,
      "",                       // Section — exams are common across a course's sections
      courseName,
      get(row, col.faculty) || "Unknown",
      get(row, col.hall),
      get(row, col.session),
      get(row, col.examType),
      get(row, col.instructions)
    ];
    // Exact duplicate rows would otherwise become duplicate calendar events.
    var dupKey = JSON.stringify(examRow);
    if (seenExamRows[dupKey]) continue;
    seenExamRows[dupKey] = true;
    rows.push(examRow);
  }

  if (col.term === -1) {
    issues.push(label + " sheet has no Batch/Term column — no term filter applied, all " +
      rows.length + " row(s) kept.");
  }
  // Nothing survived, but rows were thrown away by the term filter: the institute
  // renamed a tag or reused the tab for another term. Say so — an empty parse is
  // otherwise indistinguishable from "no exams scheduled yet", and on a first run
  // (no sheet to protect) nothing else would ever surface it.
  if (rows.length === 0 && termFiltered > 0) {
    issues.push(label + " sheet: all " + termFiltered + " row(s) dropped by the Batch/Term " +
      "filter — none matched " + TERM_CONFIG_.quizTermTags.join(" / ") + ".");
  }
  return rows;
}

// Identity of one exam SITTING — course + day + start + end — used to spot the same
// sitting appearing on both tabs. Values are normalized through the same parsers the
// consumers use, because a sheet round-trip can hand back a Date for one tab's cell
// and a string for the other's.
function examSittingKey_(row) {
  var code = row[3] ? row[3].toString().trim().toUpperCase() : "";
  var d = parseSheetDate_(row[0]);
  var day = d ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[0]);
  return code + "|" + day + "|" + examTimeKey_(row[1]) + "|" + examTimeKey_(row[2]);
}

function examTimeKey_(v) {
  try {
    var t = parseTime_(v);
    return t.h + ":" + t.m;
  } catch (e) {
    return String(v);
  }
}

// Every exam sitting for the term — mid-term tab first, then end-term — as one list
// in the shared exam row layout, each row tagged at EXAM_KIND_COL_ with the tab it
// came from ("" = mid-term tab, kind must be inferred; "End-Term" = the dedicated
// tab, kind is known). The single source for all three exam consumers (the calendar
// sync, the PDF, and the client-side preview), so none of them can drift out of step
// with another. Memoized per execution: enabling auto-sync builds the course-data
// preview and then runs a sync, which would otherwise re-read both sheets.
//
// The two tabs can OVERLAP. A mid-term tab can carry end-term sittings — Term IV's
// did, which is exactly why examTermLabel_ needs its academic-calendar rule — so a
// sitting can be published on both. Two identical rows would become two identical
// prepared events, and diffSyncedEvents_'s multiset matching pairs each of them with
// its own calendar event on every subsequent sync, so the duplicate never heals. The
// dedicated end-term tab wins each collision: it STATES the kind instead of leaving it
// to be inferred.
var ALL_EXAM_ROWS_MEMO_ = null;
function getAllExamRows_() {
  if (ALL_EXAM_ROWS_MEMO_) return ALL_EXAM_ROWS_MEMO_;
  var endRows = readSheetDataRows_(ENDTERM_SHEET_NAME);
  var endKeys = {};
  for (var i = 0; i < endRows.length; i++) {
    endRows[i][EXAM_KIND_COL_] = "End-Term";
    endKeys[examSittingKey_(endRows[i])] = true;
  }
  var midRows = readSheetDataRows_(EXAM_SHEET_NAME);
  var merged = [];
  for (var m = 0; m < midRows.length; m++) {
    if (endKeys[examSittingKey_(midRows[m])]) continue;   // also on the end-term tab
    midRows[m][EXAM_KIND_COL_] = "";
    merged.push(midRows[m]);
  }
  ALL_EXAM_ROWS_MEMO_ = merged.concat(endRows);
  return ALL_EXAM_ROWS_MEMO_;
}

// Drops the memo so a later read in the SAME execution sees freshly written sheets.
// The admin fetch rewrites ExamData/EndTermData (and retries itself up to three times
// in one execution), so it must clear this the way it already clears the script-cache
// entries built from the same data.
function resetExamRowsMemo_() {
  ALL_EXAM_ROWS_MEMO_ = null;
}

// Builds prepared-event records for every exam whose course the user is enrolled in
// and appends them to `prepared`. Exams have no per-section split, so matching is by
// course code alone. Same standout treatment as quizzes but with the fixed exam
// colour (Blueberry) and the 📕 prefix, plus exam-only fields (Session, Exam Type,
// computed Duration) shown only when present. #Students is deliberately never shown.
// Covers BOTH exam tabs (mid-term and end-term) via getAllExamRows_; each row's
// Mid-Term/End-Term label comes from examTermLabel_. Rows with unreadable dates or
// times are skipped.
//   row: [Date, Start, End, Code, Section, CourseName, Faculty, Hall, Session, ExamType, Instructions]
function appendExamEvents_(prepared, selectedCodes, reminderMinutes) {
  var examRows = getAllExamRows_();
  for (var i = 0; i < examRows.length; i++) {
    var row = examRows[i];
    var code = row[3] ? row[3].toString().trim().toUpperCase() : "";
    if (!code || !selectedCodes[code]) continue;

    var dateObj = parseSheetDate_(row[0]);
    if (!dateObj) continue;
    if (!isWithinSyncWindow_(dateObj)) {
      console.warn("Skipping exam outside the sync window (" + code + " on " +
        dateObj.toDateString() + ") — it could never be cleared on re-sync.");
      continue;
    }

    var startParse, endParse;
    try {
      startParse = parseTime_(row[1]);
      endParse = parseTime_(row[2]);
    } catch (timeErr) {
      console.error("Skipping exam with unparseable time: " + getErrorMessage_(timeErr));
      continue;
    }
    // Backstop for the admin-side validation: an end ≤ start pair would be rejected
    // by the Calendar API and fail every sync, every hour.
    if (!isValidTimeRange_(startParse, endParse)) {
      console.error("Skipping " + code + " exam whose end time isn't after its start.");
      continue;
    }
    var startTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), startParse.h, startParse.m, 0);
    var endTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), endParse.h, endParse.m, 0);

    var info = COURSE_INFO_[code];
    var displayName = (info && info.name) || (row[5] ? row[5].toString().trim() : code);
    var area = (info && info.area) || "";
    var credits = (info && info.credits) || 0;

    var faculty = row[6] ? row[6].toString().trim() : "";
    var hall = row[7] ? row[7].toString().trim() : "";
    var examType = row[9] ? row[9].toString().trim() : "";
    var instructions = row[10] ? row[10].toString().trim() : "";

    var examLabel = examTermLabel_(code, credits, examType, dateObj, row[EXAM_KIND_COL_]);   // "Mid-Term" | "End-Term"
    var durationText = formatExamDuration_((endTime.getTime() - startTime.getTime()) / 60000);

    // Evaluation weight for this exam — matched to the course's midterm/endterm
    // component (with a single-exam fallback). A written exam is one graded item,
    // so its exact weight is shown; null when the course has no scheme/exam weight.
    var examEval = examEvalComponent_(code, examLabel);
    // OLT marks stamp — same treatment as quizzes (prefix tick, right after 📕, so
    // it survives month-view truncation); matched on the exam's mid/end-term kind
    // against the user's enrolled sections.
    var examMarks = findMarksEntry_(code, examLabel === "End-Term" ? "endterm" : "midterm", "", selectedCodes[code]);
    var title = "📕" + (examMarks ? "✅" : "") + " " + code + " " + examLabel + " Exam — " + displayName +
      (examEval ? " (" + examEval.weight + "%)" : "");

    var descLines = [];
    if (area && credits) descLines.push(area + " · " + credits + (Number(credits) === 1 ? " credit" : " credits"));
    else if (area) descLines.push(area);
    else if (credits) descLines.push(credits + (Number(credits) === 1 ? " credit" : " credits"));
    descLines.push("");
    descLines.push("📕 " + examLabel.toUpperCase() + " EXAM");
    if (examMarks) descLines.push(marksUploadedLine_(examMarks));
    if (examEval) descLines.push("Weight: " + examEval.weight + "% of final grade");
    if (faculty) descLines.push("Instructor: " + faculty);
    if (durationText) descLines.push("Duration: " + durationText);
    if (examType) descLines.push("Exam Type: " + examType);
    if (hall) descLines.push("Exam Hall: " + hall);
    if (instructions) {
      descLines.push("");
      descLines.push("Instructions:");
      descLines.push(instructions);
    }
    descLines.push("");
    descLines.push(APP_TAG);

    prepared.push({
      title: title,
      description: descLines.join("\n"),
      location: hall ? (LOCATION_PREFIX_ + " | " + hall) : LOCATION_PREFIX_,
      startTime: startTime,
      endTime: endTime,
      colorId: EXAM_COLOR_ID_,
      colorSlot: EXAM_COLOR_SLOT_,
      reminderMinutes: reminderMinutes
    });
  }
}

// ---------------------------------------------------------
// GUEST LECTURES
// ---------------------------------------------------------
// One-off industry/alumni sessions, published on their own schedule rather than in
// the timetable. Same plumbing as quizzes and exams: the admin fetch parses the
// published CSV into the GuestData sheet, and each user's sync appends the sessions
// for courses they're enrolled in.
//
// Matched on course code, with a section-specific row applying only to that
// section (a blank section covers the whole course). A row with NO course code is
// skipped — by parseSessionScheduleCsv_ on the way in and by appendGuestEvents_ on
// the way out — because there is no course to attach it to and no way to tell whose
// calendar it belongs on.
var GUEST_SHEET_HEADER_ = ["Date", "Start Time", "End Time", "Course Code", "Section", "Faculty", "Session"];

// This batch's label in the mirror's "Year/Batch" column and the GL/FD "Year"
// column (config.gs → THIS_TERM.yearTags). Both sheets carry both years' rows, and
// the other year's must not reach our students. Compared with whitespace stripped
// and case folded, so "2nd Year" / "2ndyear" both match — and note the sheet has
// spelt the first year "Ist year", with an I, not a 1.
//
// Matching is by substring, so a short tag can sit inside the other year's label
// ("IYEAR" is inside "IIYEAR"). The ignore list is checked first, exactly as
// excludeTermTags is in isTermRow_.
var GUEST_YEAR_TAGS_ = settingTags_(termValue_("yearTags", TERM_PRESET_ ? TERM_PRESET_.year.yearTags : []));
var GUEST_YEAR_IGNORE_TAGS_ = settingTags_(termValue_("ignoreYearTags", TERM_PRESET_ ? TERM_PRESET_.year.ignoreYearTags : []));

function isOurYearRow_(cell) {
  if (!cell) return false;
  var v = cell.toString().toUpperCase().replace(/\s+/g, "");
  for (var e = 0; e < GUEST_YEAR_IGNORE_TAGS_.length; e++) {
    if (v.indexOf(GUEST_YEAR_IGNORE_TAGS_[e]) !== -1) return false;
  }
  for (var i = 0; i < GUEST_YEAR_TAGS_.length; i++) {
    if (v.indexOf(GUEST_YEAR_TAGS_[i]) !== -1) return true;
  }
  return false;
}

// Shared reader for the GL and FD tabs, which have an identical layout:
//   Date | Day | Timings (24 hrs format) | Year | Code | Section | Faculty | Session#
// The times are a single "HH:MM - HH:MM" cell rather than two columns, and the
// Section cell is blank when the session covers every section of the course.
// Returns [Date dd/MM/yyyy, Start, End, Code, Section, Faculty, Session].
function parseSessionScheduleCsv_(rawText, issues, label) {
  // Accepts CSV text or an already-parsed 2D grid, so the same parser serves both a
  // published tab and a pasted-in range without a text round-trip.
  var csv = (typeof rawText === "string") ? Utilities.parseCsv(rawText) : rawText;
  var headerRow = -1;
  for (var r = 0; r < csv.length; r++) {
    if (findQuizCol_(csv[r], ["date"]) !== -1 && findQuizCol_(csv[r], ["code", "course code"]) !== -1) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) throw new Error(label + " sheet header row not found.");

  var header = csv[headerRow];
  var col = {
    date: findQuizCol_(header, ["date"]),
    timings: findQuizCol_(header, ["timings (24 hrs format)", "timings", "timing", "time"]),
    start: findQuizCol_(header, ["start time", "starttime", "start"]),
    end: findQuizCol_(header, ["end time", "endtime", "end"]),
    year: findQuizCol_(header, ["year/batch", "year", "batch"]),
    code: findQuizCol_(header, ["course code", "coursecode", "code"]),
    section: findQuizCol_(header, ["section"]),
    faculty: findQuizCol_(header, ["name of the faculty", "faculty", "speaker", "guest"]),
    session: findQuizCol_(header, ["session#", "session #", "session"])
  };
  if (col.date === -1 || col.code === -1 || (col.timings === -1 && col.start === -1)) {
    throw new Error(label + " sheet missing required columns (Date, Code, Timings).");
  }

  var get = function (row, idx) {
    return (idx !== -1 && row[idx] != null) ? row[idx].toString().trim() : "";
  };

  var rows = [];
  var seen = {};
  var otherYear = 0;
  for (var i = headerRow + 1; i < csv.length; i++) {
    var row = csv[i];
    if (!row) continue;
    var code = get(row, col.code).toUpperCase();
    var date = get(row, col.date);
    if (!code || !date) continue;   // blank or spacer row

    // The tab carries both years' rows. Filter only when the column exists, for the
    // same reason parseExamCsv_ does: filtering on a missing column would compare
    // against "" and silently drop the entire schedule.
    if (col.year !== -1 && !isOurYearRow_(get(row, col.year))) { otherYear++; continue; }

    var dateObj = parseQuizDate_(date);
    if (!dateObj) {
      issues.push(label + " row " + (i + 1) + " (" + code + "): unreadable date \"" + date + "\" — skipped");
      continue;
    }

    // Prefer explicit Start/End columns if a future revision of the sheet adds
    // them; otherwise split the single "HH:MM - HH:MM" cell. The dash may be a
    // hyphen, en dash or em dash.
    var startRaw = get(row, col.start), endRaw = get(row, col.end);
    if (!startRaw && !endRaw) {
      var parts = get(row, col.timings).split(/\s*[-–—]\s*/);
      startRaw = (parts[0] || "").trim();
      endRaw = (parts[1] || "").trim();
    }
    var range = normalizeTimeRange_(startRaw, endRaw);
    if (!range) {
      issues.push(label + " row " + (i + 1) + " (" + code + "): unreadable timings \"" +
        get(row, col.timings) + "\" — skipped");
      continue;
    }

    var out = [
      Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy"),
      range.start, range.end, code,
      get(row, col.section).toUpperCase(),
      get(row, col.faculty),
      get(row, col.session)
    ];
    // Identical rows would each become their own prepared event, and the diff's
    // multiset matching would pair both forever — the duplicate never heals.
    var key = out.slice(0, 5).join("|");
    if (seen[key]) continue;
    seen[key] = true;
    rows.push(out);
  }
  if (otherYear && !rows.length) {
    issues.push(label + ": every row belonged to another year — none matched " + GUEST_YEAR_TAGS_.join(" / "));
  }
  return rows;
}

function parseGuestCsv_(rawText, issues) {
  return parseSessionScheduleCsv_(rawText, issues, "Guest lecture");
}

// ---------------------------------------------------------
// COURSE CATALOGUE RECONCILIATION
// ---------------------------------------------------------
// The institute's "Course Catalogue" tab is the authority on each course's Area and
// Credit. COURSE_INFO_ is maintained by hand (the catalogue had no Term V rows when
// this term was set up), so this compares the two on every admin fetch and appends
// any disagreement to the parse-issues cell.
//
// It deliberately only REPORTS. Silently overwriting COURSE_INFO_ from the sheet
// would change course credits — and therefore PDF credit totals — without anyone
// reviewing it, and an empty or half-filled catalogue would wipe good values. The
// whole call is wrapped by its caller so a catalogue failure can never fail a fetch.
function reportCatalogueDrift_(rawText, issues) {
  var csv = Utilities.parseCsv(rawText);
  var headerRow = -1;
  for (var r = 0; r < csv.length; r++) {
    if (findQuizCol_(csv[r], ["course code", "coursecode"]) !== -1) { headerRow = r; break; }
  }
  if (headerRow === -1) return;

  var header = csv[headerRow];
  var col = {
    term: findQuizCol_(header, ["batch / term", "batch/term", "batch", "term"]),
    area: findQuizCol_(header, ["area"]),
    code: findQuizCol_(header, ["course code", "coursecode", "code"]),
    title: findQuizCol_(header, ["course title", "course name", "title"]),
    credit: findQuizCol_(header, ["credit", "credits"])
  };
  if (col.code === -1) return;
  var get = function (row, i) { return (i !== -1 && row[i] != null) ? row[i].toString().trim() : ""; };

  var seen = {}, drift = [], missing = [];
  for (var i = headerRow + 1; i < csv.length; i++) {
    var row = csv[i];
    if (!row) continue;
    var code = get(row, col.code).toUpperCase();
    if (!code) continue;
    if (col.term !== -1 && !isTermRow_(get(row, col.term))) continue;
    if (seen[code]) continue;           // one row per instructor; the course repeats
    seen[code] = true;

    var info = COURSE_INFO_[code];
    if (!info) { missing.push(code + " (" + get(row, col.title) + ")"); continue; }
    var credit = parseFloat(get(row, col.credit));
    if (credit > 0 && Math.abs(credit - info.credits) > 0.001) {
      drift.push(code + " credits: catalogue " + credit + " vs COURSE_INFO_ " + info.credits);
    }
    var area = get(row, col.area);
    if (area && normalizeCourseName_(area) !== normalizeCourseName_(info.area)) {
      drift.push(code + " area: catalogue \"" + area + "\" vs COURSE_INFO_ \"" + info.area + "\"");
    }
  }

  var found = Object.keys(seen).length;
  if (!found) {
    issues.push("Course Catalogue: no rows for this term yet — COURSE_INFO_ areas/credits are unverified.");
    return;
  }
  for (var d = 0; d < drift.length; d++) issues.push("Course Catalogue drift — " + drift[d]);
  if (missing.length) {
    issues.push("Course Catalogue lists " + missing.length + " course(s) absent from COURSE_INFO_: " + missing.join(", "));
  }
  var known = Object.keys(COURSE_INFO_).filter(function (c) { return !seen[c]; });
  if (known.length) {
    issues.push("COURSE_INFO_ has " + known.length + " course(s) the catalogue doesn't list for this term: " + known.join(", "));
  }
}

function getGuestRows_() {
  return readSheetDataRows_(GUEST_SHEET_NAME);
}

function appendGuestEvents_(prepared, selectedCodes, reminderMinutes) {
  var rows = getGuestRows_();
  // Index of the class events already built for this student, by course + exact
  // slot. The mirror marks a guest lecture ON the timetabled class it replaces
  // (see parseMirrorTimetable_), so that one session arrives here twice: once as
  // an ordinary class row in MasterData and once as a GuestData row. Appending
  // blindly stacked two events on the same hour — the plain class AND the 🎤 one —
  // and because their signatures differ, the diff considered both correct and the
  // pair never healed. Replacing the class in place keeps exactly one event per
  // session while preserving the 🎤 title and Graphite colour.
  //
  // A guest lecture that is NOT in the timetable (a real published GL tab lists
  // extra sessions) matches nothing here and is appended, exactly as before.
  var classAt = {};
  for (var ci = 0; ci < prepared.length; ci++) {
    var pc = prepared[ci];
    if (!pc.code) continue;   // quizzes/exams/guests carry no code — classes do
    classAt[pc.code.toUpperCase() + "|" + pc.startTime.getTime() + "|" + pc.endTime.getTime()] = ci;
  }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var code = row[3] ? row[3].toString().trim().toUpperCase() : "";
    var enrolledSections = selectedCodes[code];
    if (!code || !enrolledSections) continue;
    // Same rule as appendQuizEvents_: a section-specific row applies only to
    // students in that section; a blank section covers the whole course. When the
    // student's own section set is empty (a course that isn't split), include the
    // row rather than guess at a mismatch.
    //
    // NB selectedCodes is { CODE: { SECTION: true } } — a SET of sections, not a
    // section string. Comparing it as a string yields "[object Object]" and silently
    // drops every sectioned row.
    var section = row[4] ? row[4].toString().trim().toUpperCase() : "";
    if (section && Object.keys(enrolledSections).length > 0 && !enrolledSections[section]) continue;

    var dateObj = parseSheetDate_(row[0]);
    if (!dateObj) continue;
    if (!isWithinSyncWindow_(dateObj)) {
      console.warn("Skipping guest lecture outside the sync window (" + code + " on " +
        dateObj.toDateString() + ").");
      continue;
    }

    var startParse, endParse;
    try {
      startParse = parseTime_(row[1]);
      endParse = parseTime_(row[2]);
    } catch (timeErr) {
      console.error("Skipping guest lecture with unparseable time: " + getErrorMessage_(timeErr));
      continue;
    }
    if (!isValidTimeRange_(startParse, endParse)) {
      console.error("Skipping guest lecture whose end time isn't after its start.");
      continue;
    }
    var startTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), startParse.h, startParse.m, 0);
    var endTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), endParse.h, endParse.m, 0);

    var info = COURSE_INFO_[code];
    var displayName = (info && info.name) || code;
    var faculty = row[5] ? row[5].toString().trim() : "";
    var sessionNo = row[6] ? row[6].toString().trim() : "";

    // 🎤 reads as "someone is speaking" at a glance and collides with nothing else
    // on the calendar (📝 quiz, 📕 exam, plain classes).
    var title = "🎤 " + code + " Guest Lecture — " + displayName;

    // The timetabled class this lecture replaces, if it is one (see classAt).
    // Its room is the only place the room is recorded — GUEST_SHEET_HEADER_ has no
    // Classroom column — so it is carried across rather than lost to "TBD".
    var replaceAt = classAt[code + "|" + startTime.getTime() + "|" + endTime.getTime()];
    var replaced = (replaceAt !== undefined) ? prepared[replaceAt] : null;
    var room = "";
    if (replaced && replaced.location) {
      room = replaced.location.replace(new RegExp("^" + escapeRegex_(LOCATION_PREFIX_) + "\\s*\\|\\s*", "i"), "").trim();
    }

    var descLines = [];
    if (info && info.area && info.credits) descLines.push(info.area + " · " + info.credits + " credits");
    descLines.push("");
    descLines.push("🎤 GUEST LECTURE");
    if (faculty) descLines.push("Speaker: " + faculty);
    if (section) descLines.push("Section: " + section);
    if (sessionNo) descLines.push("Session: " + sessionNo);
    if (room) descLines.push("Place: " + room);
    // A session can be marked BOTH "(Guest Lecture)" and "(Feedback)" in the
    // mirror — one is on 3 Oct — so the note has to ride the guest event too, or
    // replacing the class would silently drop that student's feedback prompt.
    var gfbLines = feedbackNoteFor_(code, section, startTime, endTime);
    for (var gf = 0; gf < gfbLines.length; gf++) descLines.push(gfbLines[gf]);
    descLines.push("");
    descLines.push(APP_TAG);

    var guestEvent = {
      title: title,
      description: descLines.join("\n"),
      location: room ? (LOCATION_PREFIX_ + " | " + room) : LOCATION_PREFIX_,
      startTime: startTime,
      endTime: endTime,
      colorId: GUEST_COLOR_ID_,
      colorSlot: GUEST_COLOR_SLOT_,
      reminderMinutes: reminderMinutes
    };
    if (replaced) prepared[replaceAt] = guestEvent;
    else prepared.push(guestEvent);
  }
}

// ---------------------------------------------------------
// COURSE FEEDBACK (no events of its own)
// ---------------------------------------------------------
// The feedback schedule deliberately creates NO calendar events. Instead each
// course's feedback and OLT links are appended to the description of that course's
// CLASSES that fall inside its feedback window, so the prompt reaches the student
// exactly where they already look, on the days it is actionable.
//
// IMPORTANT — this must stay a pure function of (course, class date). The
// description feeds computeEventSig_, so deciding inclusion from the CURRENT time
// (e.g. "is the window open right now?") would change every class event's signature
// as the window opened and closed, and each sync would rewrite the whole term's
// classes. Comparing the class's own date against the window keeps the signature
// stable for a given schedule.
var FEEDBACK_SHEET_HEADER_ = ["Date", "Start Time", "End Time", "Course Code", "Section", "Faculty", "Session"];

function parseFeedbackCsv_(rawText, issues) {
  return parseSessionScheduleCsv_(rawText, issues, "Feedback");
}

// Feedback sessions grouped by "YYYY-MM-DD|CODE", each entry carrying the SESSION
// it belongs to as a minutes-of-day span. Built once per run.
//
// Keyed by day+course but MATCHED on the time span, because a course can meet
// twice on one day while only one of those sittings collects feedback (Term 5 has
// six such days). A day-only key put the "feedback is collected in this session"
// banner on both sittings, telling students to fill a form in a class where nobody
// was collecting one.
//
// The span is stored rather than an exact start time so a future published FD tab
// that gives a collection WINDOW ("09:00–17:00") still matches the classes inside
// it. Rows whose times are unreadable fall back to spanning the whole day, which
// is the old behaviour and the safe direction to fail — a note too many beats
// silently losing the prompt.
var FEEDBACK_MAP_MEMO_ = null;
function feedbackMinutes_(v) {
  try {
    var t = parseTime_(v);
    return t.h * 60 + t.m;
  } catch (e) {
    return null;
  }
}
function getFeedbackMap_() {
  if (FEEDBACK_MAP_MEMO_) return FEEDBACK_MAP_MEMO_;
  var map = {};
  var rows = readSheetDataRows_(FEEDBACK_SHEET_NAME);
  for (var i = 0; i < rows.length; i++) {
    var code = rows[i][3] ? rows[i][3].toString().trim().toUpperCase() : "";
    var dateObj = parseSheetDate_(rows[i][0]);
    if (!code || !dateObj) continue;
    var iso = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var section = rows[i][4] ? rows[i][4].toString().trim().toUpperCase() : "";
    var startMin = feedbackMinutes_(rows[i][1]);
    var endMin = feedbackMinutes_(rows[i][2]);
    // Unreadable or inverted times → span the whole day (the pre-2026-09-09
    // behaviour), so a malformed row still surfaces its prompt somewhere.
    if (startMin === null || endMin === null || endMin <= startMin) {
      startMin = 0;
      endMin = 24 * 60;
    }
    var key = iso + "|" + code;
    if (!map[key]) map[key] = [];
    map[key].push({
      section: section,
      startMin: startMin,
      endMin: endMin,
      faculty: rows[i][5] ? rows[i][5].toString().trim() : "",
      session: rows[i][6] ? rows[i][6].toString().trim() : ""
    });
  }
  FEEDBACK_MAP_MEMO_ = map;
  return map;
}

// The feedback lines for one class, or [] when no feedback is collected at it.
//
// Feedback deliberately creates NO events of its own. The FD tab names an
// ALREADY-TIMETABLED session at which feedback is taken, so the prompt belongs in
// that class's own description, where the student is already looking.
//
// Must stay a pure function of (code, section, class start, class end). The
// description feeds computeEventSig_, so deciding this from the CURRENT time —
// "is feedback open now?" — would change every class's signature as the day
// passed, and each sync would rewrite the whole term's classes. Matching the
// class's own date and time keeps the signature stable for a given schedule.
function feedbackNoteFor_(code, section, startTime, endTime) {
  if (!code || !(startTime instanceof Date) || isNaN(startTime.getTime())) return [];
  if (!FEEDBACK_FORM_URL_ && !OLT_PORTAL_URL_) return [];
  var entries = getFeedbackMap_()[
    Utilities.formatDate(startTime, Session.getScriptTimeZone(), "yyyy-MM-dd") + "|" + code];
  if (!entries || !entries.length) return [];

  var sec = (section || "").toString().trim().toUpperCase();
  var classStart = startTime.getHours() * 60 + startTime.getMinutes();
  // A missing/invalid end is treated as a one-minute class, so the overlap test
  // still reduces to "does this class start inside the feedback span?".
  var classEnd = (endTime instanceof Date && !isNaN(endTime.getTime()))
    ? endTime.getHours() * 60 + endTime.getMinutes() : classStart + 1;
  if (classEnd <= classStart) classEnd = classStart + 1;

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    // A blank section on the row covers every section of the course.
    if (e.section && e.section !== sec) continue;
    // Half-open overlap: the row's span must actually cover part of this class.
    if (classStart >= e.endMin || classEnd <= e.startMin) continue;
    var lines = ["", "🗳️ COURSE FEEDBACK IS COLLECTED IN THIS SESSION"];
    if (FEEDBACK_FORM_URL_) lines.push("Feedback form: " + FEEDBACK_FORM_URL_);
    if (OLT_PORTAL_URL_ && OLT_PORTAL_URL_ !== FEEDBACK_FORM_URL_) {
      lines.push("OLT: " + OLT_PORTAL_URL_);
    }
    return lines;
  }
  return [];
}

// ---------------------------------------------------------
// OLT MARKS STATUS (Result Receipt Record)
// ---------------------------------------------------------
// The institute's "Result Receipt Record" sheet flags, per course/section, whether
// a component's marks have been updated on the OLT portal ("Quiz-1", "Mid-Term"…).
// Same plumbing as quizzes/exams: admin fetch parses the published CSV into the
// MarksStatus sheet; the per-user sync stamps matching quiz/exam events with a
// ✅ title prefix (right after 📝/📕, so month view shows it) + description line,
// health ships the map to the client for the Evaluation popup's OLT badges, and
// the stamp appearing is reported in the user's recent-changes card (see
// describeChanges_). Only kinds "quiz"/"midterm"/"endterm" stamp events; anything
// else ("other") is popup-only, mirroring COURSE_EVAL_'s rule.

var MARKS_SHEET_HEADER_ = ["Course Code", "Course Title", "Sections", "Component", "Kind", "Quiz #", "First Seen", "Remarks"];

// "A", "A&B", "A & C" → "A,B" / "A,C"; "-" / blank / anything non-section-like
// ("All") → "" (applies to the whole course). Tokens beyond 2 chars mean the cell
// isn't a section list, so the whole cell is treated as course-wide rather than
// silently hiding the stamp from everyone.
function marksSectionsStr_(cell) {
  var s = String(cell == null ? "" : cell).trim();
  if (!s || s === "-") return "";
  var toks = s.toUpperCase().split(/[^A-Z0-9]+/);
  var kept = [];
  for (var i = 0; i < toks.length; i++) {
    if (!toks[i]) continue;
    if (toks[i].length > 2) return "";
    kept.push(toks[i]);
  }
  return kept.join(",");
}

// Splits a component cell into typed entries: "Quiz-1" → quiz #1, "Mid-Term" →
// midterm, "End-Term"/"Final" → endterm, anything else → "other" (popup-only).
// Tolerates comma/semicolon lists, "Quiz 1 & 2" (one entry per number) and a bare
// trailing number continuing the previous quiz ("Quiz-1, 2").
function marksComponents_(cell) {
  var out = [];
  var frags = String(cell == null ? "" : cell).split(/[,;\n]+/);
  for (var i = 0; i < frags.length; i++) {
    var f = frags[i].trim();
    if (!f) continue;
    if (/^\d+$/.test(f) && out.length && out[out.length - 1].kind === "quiz") {
      out.push({ label: "Quiz-" + f, kind: "quiz", num: f });
      continue;
    }
    if (/quiz/i.test(f)) {
      var nums = f.match(/\d+/g) || [];
      if (nums.length > 1) {
        for (var n = 0; n < nums.length; n++) out.push({ label: "Quiz-" + nums[n], kind: "quiz", num: nums[n] });
      } else {
        out.push({ label: f, kind: "quiz", num: nums.length ? nums[0] : "" });
      }
    } else if (/mid/i.test(f)) {
      out.push({ label: f, kind: "midterm", num: "" });
    } else if (/end|final/i.test(f)) {
      out.push({ label: f, kind: "endterm", num: "" });
    } else {
      out.push({ label: f, kind: "other", num: "" });
    }
  }
  return out;
}

// Parses the published Result Receipt CSV into MarksStatus rows. Columns resolved
// by header name (reordered sheet still works). Only rows whose "Whether Marks
// Updated on OLT" flag is TRUE/Yes produce entries — one row per component. Course
// titles (the sheet has no codes) go through the same normalized-name lookup as
// the electives sheet; a TRUE row whose title can't be matched is surfaced in
// `issues` (admin-only), because it means a stamp is silently missing.
//   Output row: [Course Code, Course Title, Sections, Component, Kind, Quiz #, First Seen(""), Remarks]
function parseMarksCsv_(rawText, issues) {
  issues = issues || [];
  var csv = Utilities.parseCsv(rawText);
  var headerRow = -1;
  for (var r = 0; r < csv.length; r++) {
    if (findQuizCol_(csv[r], ["course title", "course name"]) !== -1 &&
        findQuizCol_(csv[r], ["marks updated"]) !== -1) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) throw new Error("Marks sheet header row not found.");

  var header = csv[headerRow];
  var col = {
    title: findQuizCol_(header, ["course title", "course name"]),
    term: findQuizCol_(header, ["batch/term", "batch", "term"]),
    sections: findQuizCol_(header, ["section/group", "section", "group"]),
    updated: findQuizCol_(header, ["whether marks updated on olt", "marks updated"]),
    component: findQuizCol_(header, ["component name", "component"]),
    remarks: findQuizCol_(header, ["remarks"])
  };
  if (col.title === -1 || col.updated === -1) {
    throw new Error("Marks sheet missing required columns.");
  }

  var get = function (row, idx) {
    return (idx !== -1 && row[idx] != null) ? row[idx].toString().trim() : "";
  };

  var byNorm = getCourseCodeByNorm_();
  var rows = [];
  var seen = {};
  for (var i = headerRow + 1; i < csv.length; i++) {
    var row = csv[i];
    if (!row) continue;
    var title = get(row, col.title);
    if (!title) continue;
    // The record covers several batches; keep only this term's rows. An empty
    // Batch/Term cell is kept (be permissive — the flag column still gates).
    var termCell = get(row, col.term);
    if (termCell && !isTermRow_(termCell)) continue;
    if (!/^(true|yes)$/i.test(get(row, col.updated))) continue;

    var code = byNorm[normalizeCourseName_(title)];
    if (!code) {
      issues.push("Marks row " + (i + 1) + ": course \"" + title + "\" not recognised — OLT stamp skipped");
      continue;
    }

    var sections = marksSectionsStr_(get(row, col.sections));
    var remarks = get(row, col.remarks);
    var comps = marksComponents_(get(row, col.component));
    // TRUE with a blank component still means "something is on OLT" — keep it
    // visible in the popup, even though it can't stamp a specific event.
    if (!comps.length) comps = [{ label: "Marks (component unspecified)", kind: "other", num: "" }];

    for (var c = 0; c < comps.length; c++) {
      var out = [code, title, sections, comps[c].label, comps[c].kind, comps[c].num, "", remarks];
      var dupKey = out.join("|");
      if (seen[dupKey]) continue;
      seen[dupKey] = true;
      rows.push(out);
    }
  }
  return rows;
}

// Identity key for a marks entry — first-seen carryover and the changelog diff
// both match on it. The label goes through normalizeCourseName_ (a generic
// keyword normalizer) so "Quiz-1" vs "Quiz 1" never registers as a change.
function marksRowKey_(code, kind, num, label, sections) {
  return [String(code).toUpperCase(), String(kind), String(num), normalizeCourseName_(label), String(sections)].join("|");
}

// First-Seen column reader: the source sheet only has a TRUE/FALSE flag, so the
// upload date is OUR first sighting, persisted in the MarksStatus sheet. Cells
// may come back as Date objects (Sheets coerces "yyyy-MM-dd" strings) or strings;
// parseQuizDate_ would misread ISO as D/M/Y, so ISO is matched explicitly.
function marksDateStr_(val) {
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var m = String(val == null ? "" : val).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// Stamps each freshly parsed row with its first-seen date: carried over from the
// previous MarksStatus sheet when the entry already existed, today otherwise.
// Runs BEFORE the signature is computed, so an unchanged institute sheet hashes
// identically run after run (the carried dates are stable).
function mergeMarksFirstSeen_(newRows, oldRows) {
  var seenDates = {};
  for (var i = 0; i < oldRows.length; i++) {
    var o = oldRows[i];
    if (!o || !o[0]) continue;
    var k = marksRowKey_(o[0], o[4] == null ? "" : o[4], o[5] == null ? "" : o[5], o[3] == null ? "" : o[3], o[2] == null ? "" : o[2]);
    var d = marksDateStr_(o[6]);
    if (d && !seenDates[k]) seenDates[k] = d;
  }
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  for (var j = 0; j < newRows.length; j++) {
    var key = marksRowKey_(newRows[j][0], newRows[j][4], newRows[j][5], newRows[j][3], newRows[j][2]);
    newRows[j][6] = seenDates[key] || today;
  }
  return newRows;
}

// Reads MarksStatus for the per-user sync / health.
function getMarksData_() {
  return readSheetDataRows_(MARKS_SHEET_NAME);
}

// ChangeLog records for marks flips — much simpler than diffSheetData_ because a
// marks entry has no time/room/instructor to track: an entry either appeared
// (marks reached OLT) or disappeared (flag reverted / row withdrawn).
function diffMarksData_(oldRows, newRows) {
  function rec(r) {
    var code = r[0] ? r[0].toString().trim().toUpperCase() : "";
    if (!code) return null;
    var secs = r[2] == null ? "" : r[2].toString().trim();
    var label = r[3] == null ? "" : r[3].toString().trim();
    return {
      code: code, secs: secs, label: label,
      key: marksRowKey_(code, r[4] == null ? "" : r[4], r[5] == null ? "" : r[5], label, secs)
    };
  }
  var oldByKey = {}, newByKey = {};
  var i, r;
  for (i = 0; i < oldRows.length; i++) { r = rec(oldRows[i]); if (r) oldByKey[r.key] = r; }
  for (i = 0; i < newRows.length; i++) { r = rec(newRows[i]); if (r) newByKey[r.key] = r; }

  var changes = [];
  var k;
  for (k in newByKey) {
    if (!newByKey.hasOwnProperty(k) || oldByKey[k]) continue;
    r = newByKey[k];
    changes.push({
      type: "Added", category: "Marks", course: r.code, section: r.secs, classDate: "",
      field: "OLT Marks", from: "", to: r.label,
      details: r.code + (r.secs ? "-" + r.secs : "") + " — " + r.label + " marks uploaded on OLT"
    });
  }
  for (k in oldByKey) {
    if (!oldByKey.hasOwnProperty(k) || newByKey[k]) continue;
    r = oldByKey[k];
    changes.push({
      type: "Removed", category: "Marks", course: r.code, section: r.secs, classDate: "",
      field: "OLT Marks", from: r.label, to: "",
      details: r.code + (r.secs ? "-" + r.secs : "") + " — " + r.label + " no longer flagged on OLT"
    });
  }
  return changes;
}

// { CODE: [{ label, kind, num, secs: ["A"…], date: "yyyy-MM-dd" }] } from the
// MarksStatus sheet. Memoized per execution AND cached in CacheService under the
// current revision (health reads it on every page load; a marks change bumps the
// revision, so stamps/badges never lag a fetch). `force` (warmPageCaches_ only)
// skips the memo and the cache read and rebuilds from the sheet. Never throws — an
// unreadable sheet just means no stamps this pass.
var MARKS_STATUS_MEMO_ = null;
function getMarksStatusMap_(force) {
  if (!force && MARKS_STATUS_MEMO_ !== null) return MARKS_STATUS_MEMO_;
  var map = null;
  var cacheKey = null;   // stays null if the revision is unreadable: then no cache at all
  try {
    cacheKey = MARKS_STATUS_CACHE_KEY_ + "_r" +
      (PropertiesService.getScriptProperties().getProperty('master_data_revision') || "0");
    var cached = force ? null : CacheService.getScriptCache().get(cacheKey);
    if (cached) map = JSON.parse(cached);
  } catch (cacheErr) { map = null; }
  if (!map) {
    map = {};
    try {
      var rows = getMarksData_();
      for (var i = 0; i < rows.length; i++) {
        var code = rows[i][0] ? rows[i][0].toString().trim().toUpperCase() : "";
        if (!code) continue;
        var secsStr = rows[i][2] == null ? "" : rows[i][2].toString().trim();
        (map[code] = map[code] || []).push({
          label: rows[i][3] == null ? "" : rows[i][3].toString().trim(),
          kind: rows[i][4] == null ? "" : rows[i][4].toString().trim(),
          num: rows[i][5] == null ? "" : rows[i][5].toString().trim(),
          secs: secsStr ? secsStr.split(",") : [],
          date: marksDateStr_(rows[i][6])
        });
      }
      if (cacheKey) {
        try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(map), MARKS_STATUS_CACHE_TTL_SECONDS_); } catch (putErr) { }
      }
    } catch (readErr) {
      map = {};
    }
  }
  MARKS_STATUS_MEMO_ = map;
  return map;
}

// True when a (possibly section-specific) marks entry covers this user: entry has
// no section split, or the user's course has none, or the sections intersect.
function marksEntryApplies_(entry, enrolledSections) {
  if (!entry.secs || !entry.secs.length) return true;
  var secs = enrolledSections ? Object.keys(enrolledSections) : [];
  if (!secs.length) return true;
  for (var i = 0; i < secs.length; i++) {
    if (entry.secs.indexOf(secs[i].toUpperCase()) !== -1) return true;
  }
  return false;
}

// The marks entry matching one quiz/exam event, or null. kind is "quiz"/"midterm"/
// "endterm"; for quizzes an entry with a number must match the event's number,
// while an unnumbered entry (or unnumbered event) matches any.
function findMarksEntry_(code, kind, quizNum, enrolledSections) {
  var list = getMarksStatusMap_()[code];
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.kind !== kind) continue;
    if (kind === "quiz" && e.num && quizNum && e.num !== String(quizNum)) continue;
    if (!marksEntryApplies_(e, enrolledSections)) continue;
    return e;
  }
  return null;
}

// "✅ Marks uploaded on OLT (5 Jul)" — the description line for a stamped event.
function marksUploadedLine_(entry) {
  var when = "";
  var m = entry.date ? entry.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (m) {
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    when = " (" + Utilities.formatDate(d, Session.getScriptTimeZone(), "d MMM") + ")";
  }
  return "✅ Marks uploaded on OLT" + when;
}

// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------

function isRoomToken_(token) {
  if (!token || !/^[A-Za-z0-9\-]{1,10}$/.test(token)) return false;
  if (/\d/.test(token)) return true;
  if (KNOWN_NO_DIGIT_ROOMS_[token.toUpperCase()] === true) return true;
  return NO_DIGIT_ROOM_PATTERN_.test(token);
}

// Defensive date reader for sheet cells. Normally Sheets hands back real Date
// objects, but if a value ever survives as a string (locale quirk, re-pasted
// data), JS `new Date("01/06/2026")` would silently read it as MM/DD (Jan 6).
// Prefer the D/M/Y interpretation via parseQuizDate_, then fall back to native
// parsing for formats it can't read (e.g. "Mon, 01 Jul 2026"). Returns null on
// anything unreadable so callers skip the row instead of mis-scheduling it.
function parseSheetDate_(val) {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  var parsed = parseQuizDate_(val);
  if (parsed) return parsed;
  var s = val ? val.toString().trim() : "";
  if (!s) return null;
  var native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

function parseTime_(val) {
  if (val instanceof Date) return { h: val.getHours(), m: val.getMinutes() };
  var s = val.toString().trim();
  if (!s) throw new Error("Empty time value");
  // Accept only "H", "H:MM", optionally followed by am/pm (any case, optional space).
  // Rejects malformed inputs like "9.00" or "3pm extra" so dirty source data fails
  // loudly (callers catch and skip the row) instead of being mis-scheduled.
  var match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) throw new Error("Unparseable time: \"" + val + "\"");
  var h = parseInt(match[1], 10);
  var m = match[2] != null ? parseInt(match[2], 10) : 0;
  var suffix = match[3] ? match[3].toLowerCase() : "";
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error("Unparseable time: \"" + val + "\"");
  }
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  return { h: h, m: m };
}

// True when the end time is strictly after the start. Skip-guard used by every
// event builder and preview: an end ≤ start pair is rejected by the Calendar
// API, and one such row would otherwise make the whole sync fail every hour.
function isValidTimeRange_(startParse, endParse) {
  return (endParse.h * 60 + endParse.m) > (startParse.h * 60 + startParse.m);
}

// Admin-side time-pair normalizer: returns { start: "HH:mm", end: "HH:mm" }
// (24-hour strings) or null when the pair is unreadable or unfixable — callers
// skip the row and report it to the admin. Two heuristics cover the common
// 12-hour shorthand timetables use without an am/pm suffix:
//   • a suffix-less start before 7:00 can only be an afternoon slot
//     ("1:15" = 13:15 — no class starts between midnight and 7 AM);
//   • a suffix-less end ≤ start before noon gets bumped 12 hours
//     ("12:15 - 1:30" = 12:15–13:30).
// Explicit am/pm values are always trusted as written; 24-hour values
// ("13:30") are untouched. Whatever survives is stored normalized, so the
// strict user-side parseTime_ reads it back unambiguously.
function normalizeTimeRange_(startRaw, endRaw) {
  var s, e;
  try {
    s = parseTime_(startRaw);
    e = parseTime_(endRaw);
  } catch (parseErr) {
    return null;
  }
  var sExplicit = /(am|pm)\s*$/i.test(String(startRaw).trim());
  var eExplicit = /(am|pm)\s*$/i.test(String(endRaw).trim());
  if (!sExplicit && s.h > 0 && s.h < 7) s.h += 12;
  if (!eExplicit && !isValidTimeRange_(s, e) && e.h < 12) e.h += 12;
  if (!isValidTimeRange_(s, e)) return null;
  var fmt = function (t) { return (t.h < 10 ? "0" : "") + t.h + ":" + (t.m < 10 ? "0" : "") + t.m; };
  return { start: fmt(s), end: fmt(e) };
}

// Returns the user's owned calendar with this name, or null. Unlike
// getOrCreateCalendar_, never creates one — used by paths that only remove
// events, where creating an empty calendar as a side effect would be wrong.
function findOwnedCalendar_(name) {
  var calendars = CalendarApp.getCalendarsByName(name);
  for (var i = 0; i < calendars.length; i++) {
    if (calendars[i].isOwnedByMe()) return calendars[i];
  }
  return null;
}

function getOrCreateCalendar_(name) {
  var calendars = CalendarApp.getCalendarsByName(name);
  var owned = calendars.filter(function (c) { return c.isOwnedByMe(); });
  if (owned.length > 0) {
    if (owned.length > 1) {
      console.warn("Multiple owned calendars named '" + name + "' (" + owned.length + "). Using the first one.");
    }
    return owned[0];
  }
  if (calendars.length > 0) {
    console.warn("Found " + calendars.length + " calendar(s) named '" + name + "' but none owned by current user. Creating a new owned calendar.");
  }
  return CalendarApp.createCalendar(name, { timeZone: "Asia/Kolkata" });
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

// Reads a managed data sheet's rows, header stripped. Read-only (never inserts the
// sheet) because regular users may not have edit rights — only the admin fetch
// creates these. Shared by every per-user read path (MasterData's siblings:
// QuizData, ExamData, EndTermData, MarksStatus).
function readSheetDataRows_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1);
}

// Overwrites a managed data sheet with freshly parsed rows, padding trailing blanks
// so a now-shorter schedule doesn't leave stale rows behind. One writer for every
// CSV-backed sheet (QuizData, ExamData, EndTermData, MarksStatus) so their layouts
// can't drift apart. fmtPattern pins the display format of the sheet's one date
// column, which otherwise renders per the spreadsheet's locale; the column is looked
// up BY NAME in `header` rather than passed as a literal index, so inserting a column
// can't leave the format silently pinned to the wrong one.
function writeDataSheet_(sheetName, header, rows, dateHeader, fmtPattern) {
  var fmtCol = header.indexOf(dateHeader) + 1;
  if (!fmtCol) throw new Error("writeDataSheet_: " + sheetName + " header has no \"" + dateHeader + "\" column.");
  var sheet = getOrCreateSheet_(sheetName);
  protectDataSheet_(sheet);
  var ncols = header.length;
  var prevLastRow = sheet.getLastRow();
  var totalRows = Math.max(rows.length + 1, prevLastRow, 1);
  var matrix = new Array(totalRows);
  matrix[0] = header.slice();
  for (var ci = 0; ci < rows.length; ci++) matrix[ci + 1] = rows[ci];
  for (var pi = rows.length + 1; pi < totalRows; pi++) {
    matrix[pi] = new Array(ncols);
    for (var z = 0; z < ncols; z++) matrix[pi][z] = "";
  }
  sheet.getRange(1, 1, totalRows, ncols).setValues(matrix);
  sheet.getRange(2, fmtCol, Math.max(rows.length, 1), 1).setNumberFormat(fmtPattern);
}

// Snapshots a data sheet's current rows BEFORE it's overwritten, so the change log
// can diff old-vs-new. Returns [] when the sheet is missing/empty or unreadable —
// the changelog is best-effort and must never break the fetch.
function snapshotSheetRows_(sheetName, ncols) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  try {
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, ncols).getValues();
  } catch (snapErr) {
    return [];
  }
}

// Change-detection fingerprint for one CSV-backed source's parsed rows. ALWAYS a
// hash, never the raw JSON: a Script Property caps at 9KB, and every one of these row
// sets carries free-text Instructions and hall lists that grow as the institute fills
// them in. Stored raw, setProperty eventually throws mid-fetch — after the sheet has
// been rewritten but before the revision bumps — so the fetch fails on all three
// retries, every hour, and no student ever re-syncs again. Only equality is ever
// tested against these values, so hashing loses nothing.
function dataSignature_(rows) {
  return hashString_(JSON.stringify(rows));
}

// Reads a stored source signature, upgrading the pre-hash format on the fly. These
// properties used to hold the raw JSON.stringify(rows) — so a stored value starting
// with "[" is a legacy one, and hashing it yields EXACTLY what dataSignature_ now
// produces for the same rows. Without this, the format switch alone would read as
// "everything changed" on the first fetch after the deploy: three sheets rewritten,
// the revision churned, and every user re-syncing for no actual change. Removable
// once a fetch has rewritten every signature property (i.e. after the first run on
// this build).
function storedSignature_(scriptProps, key) {
  var v = scriptProps.getProperty(key) || "";
  return (v.charAt(0) === "[") ? hashString_(v) : v;
}

// The destructive half of a sheet write, guarded. The per-source isolation in the
// admin fetch protects against a source that THROWS — but a source that parses
// cleanly to ZERO rows is just as destructive and sails straight through: the sheet
// is blanked, and on everyone's next sync every event built from it is diffed as
// obsolete and deleted from their calendar. Zero rows out of a sheet that still has
// rows is almost always a header rename or a changed Batch tag on the institute's
// side, not a genuinely emptied schedule, so throw and let the caller's existing
// catch preserve the previous rows AND their stored signature (which keeps it
// retrying every hour until the sheet is really fixed).
//
// An empty parse into an empty or not-yet-created sheet is normal early in a term —
// there is nothing to lose, so it is allowed through.
//
// `newTerm` (the first fetch after THIS_TERM changes): the rows still in the sheet
// are LAST term's, so an empty parse is the truth — this term has none published
// yet — and the old rows must go. Kept, they would reach the new calendars for any
// course whose code carries over from one term to the next.
function assertNotEmptyWipe_(sheetName, rows, issues, label, newTerm) {
  if (!rows || rows.length > 0) return;
  if (newTerm) {
    issues.push(label + ": none for " + TERM_CONFIG_.label + " yet — last term's rows cleared.");
    return;
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return;
  var msg = label + " parsed to 0 rows while " + sheetName + " still holds " +
    (sheet.getLastRow() - 1) + " — keeping the previous data. Check the published " +
    "sheet's header row and Batch/Term column.";
  issues.push(msg);
  throw new Error(msg);
}

// Locks a data sheet down to the owner and explicit editors. Students need only VIEW
// access to the spreadsheet (usage events and reports are buffered in Script
// Properties, not written by them — see logUsage_), so this is defence in depth: if
// the sheet is ever shared more widely by mistake, nobody else can edit MasterData /
// QuizData — and because the change fingerprint compares CSV-to-CSV, a manual sheet
// edit would otherwise persist until the institute CSV next changes. Only called from the admin fetch, which runs as the owner. Idempotent:
// re-applying to an already-protected sheet is a no-op apart from cheap setter calls.
// Never throws — a protection failure must not break the timetable fetch itself.
function protectDataSheet_(sheet) {
  try {
    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var protection = protections.length > 0 ? protections[0] : sheet.protect();
    protection.setDescription("Managed by Timetable Sync Tool — do not edit manually");
    protection.setWarningOnly(false);
    // Allow the owner plus explicitly-added editors (co-admins) so any admin can
    // run the fetch; domain-wide editors (students, who need spreadsheet edit
    // access for usage logging) stay blocked.
    var editors = protection.getEditors();
    if (editors.length > 0) protection.removeEditors(editors);
    var admins = Object.keys(getSpreadsheetAdmins_());
    if (admins.length > 0) protection.addEditors(admins);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (e) {
    console.warn("Could not protect sheet '" + sheet.getName() + "': " + getErrorMessage_(e));
  }
}
