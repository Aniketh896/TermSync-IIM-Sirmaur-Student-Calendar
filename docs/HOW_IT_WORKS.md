# How TermSync works

The first half of this page is for every maintainer. The second half, **Under the
hood**, is for anyone (or any AI assistant) changing the code.

---

## The big picture

Two clocks, each ticking every 30 minutes.

```
   PGP office's timetable sheet            ← the institute edits these
   + the published quiz / exam tabs
              │
              │  1. THE FETCH — runs as the maintainer, every 30 minutes
              ▼
   TermSync's spreadsheet: MasterData, QuizData, ExamData, …
   + a "revision" number that goes up ONLY when something actually changed
              │
              │  2. EACH STUDENT'S SYNC — runs as that student, every 30 minutes
              ▼
   "IIM Sirmaur – Term 2" in that student's Google Calendar
```

1. **The fetch** reads the office's timetable sheet and the quiz / exam tabs, keeps
   only your batch's rows for this term, and stores them in TermSync's own
   spreadsheet. If anything changed, it bumps the revision.
2. **Each student's sync** compares the revision with the one it last applied. Same →
   it stops straight away (costs nothing). Different → it works out exactly which
   events changed and updates only those in that student's calendar.

So an office edit reaches calendars within about an hour at worst (30 + 30 minutes),
usually about 30 minutes.

**Why there's no server.** The web app runs as **the student using it**
("Execute as: User accessing"), so it writes to their calendar with their own
permission. Nobody's password or calendar is stored or shared. The catch: TermSync can
only act for a student when *their own* automatic sync runs — you can't change or
pause another student's sync from your account. That's why test mode
(`TEST_ONLY_FOR`) is built into the code.

---

## What a student sees

- **First visit:** their courses are already ticked — from their section (first year)
  or the institute's elective allotment (second year). They press **Enable
  Auto-Sync**.
- **Their calendar** gets a new calendar named after the term ("IIM Sirmaur – Term 2"):
  - classes, each course in its own colour
  - 📝 quizzes in red · 📕 mid-terms and end-terms in blue · 🎤 guest lectures in grey
  - the class where course feedback is collected carries the feedback / OLT links
- **The page** shows whether they're up to date, the last few timetable changes, their
  subject reps, course outlines, evaluation schemes and a **Download PDF** of their
  whole term.
- **Report a wrong entry** sends you a note (🎛️ Admin → 🚩 Reports).
- **Stop Auto-Sync…** offers *Keep calendar, stop updates* (nothing is deleted) or
  *Delete & stop* (removes the TermSync calendar).

---

## Your tools as maintainer

### In the spreadsheet: the 📊 Tool Stats menu

(Reload the spreadsheet if you don't see it.)

| Menu item | What it does |
|---|---|
| Show usage stats | How many students use TermSync |
| Open Usage tab / Open Reports tab | Shows the hidden logs. Use **Re-hide** afterwards |
| Institute fetch status | Is the 30-minute fetch running, and when did it last succeed? |
| Install institute fetch trigger | Re-creates the 30-minute fetch (it normally installs itself) |
| **✓ Check settings** | **Plain-English check of config.gs and the institute's sheets. Run it after every change.** |
| Test timetable source | What TermSync reads from the office's timetable, without changing anything |
| ✓ Enrolment pre-flight | Works out every student's calendar without touching any — must say "Clear for go-live" |
| Set up paste-in tabs | A fallback if the office can't share its sheet: paste the timetable into a tab |
| Refresh from institute now | Runs the fetch immediately instead of waiting up to 30 minutes |
| ▶ Start handover / Handover status | Moving to a new term — see [NEW_TERM.md](NEW_TERM.md) |
| End term / Reopen term | Locks the tool at the end of a term and crosses everyone's events out as a record |

### On the page: 🎛️ Admin (SAC team and you only)

At the bottom of the page: who's using TermSync (🗒️ Usage), every change the office
made (🛠️ Changes), the 👥 Students directory, 🚩 Reports, and for you ⚙️ Tools
(*Force fetch now*, and a warning if you saved code but didn't deploy it).

### In the editor: functions you can Run

Useful before the spreadsheet menu exists: choose one in the toolbar drop-down and
press ▶ Run, then read the **Execution log**.

- `checkSettingsLog` — same as ✓ Check settings
- `testTimetableSourceLog` — same as Test timetable source
- `fetchAndCleanAdminData` — runs the fetch once (and installs the 30-minute timer)
- `enrolmentPreflightLog` — the pre-flight

---

## The spreadsheet's tabs

You never edit these by hand; TermSync rewrites them on every fetch.

| Tab | Holds |
|---|---|
| `MasterData` | This term's classes for your batch. Cells **K1/K2** list anything the last fetch couldn't read or wants you to know |
| `QuizData`, `ExamData`, `EndTermData` | This term's quizzes, mid-terms and end-terms |
| `GuestData`, `FeedbackData` | Guest lectures and feedback sessions (marked in the office's sheet) |
| `MarksStatus` | Which marks have reached OLT (only if `marksStatus` is set) |
| `Usage`, `Reports`, `ChangeLog` | Hidden logs: who did what, students' reports, every office change |

---

## How courses are chosen

Set by `THIS_TERM.number`: Terms 1–3 use `"section"`, Terms 4–6 `"electives"`
(which becomes `"pick"` if no allotment link is set). An advanced
`courseSelection` line in `THIS_TERM` can override it.

| Mode | Used in | How a student's courses are found |
|---|---|---|
| `"section"` | First year | Every course in `COURSES` that the timetable runs for the student's **own section** (from `STUDENTS`), plus every course the timetable runs for the whole batch at once (no section). A course with `onlyFor: ["MBATM"]` goes only to rolls starting with MBATM. |
| `"electives"` | Second year | Read from the institute's published elective allotment sheet: one tab per course, listing every enrolled roll (and section, if the course has several). |
| `"pick"` | Anything else | Students tick their own courses. |

In every mode the student can still change their selection on the page.

After the start of term, TermSync re-checks every 6 hours whether a student's courses
still match their section / the allotment (add-drop). If not, it **tells** them, with
one button to take the new list — it never changes anyone's courses behind their back.

---

## Optional features

The `FEATURES` block in `config.gs` switches off the admin dashboard, the public usage
stats, the usage log, subject reps, course outlines, the PDF and wrong-entry reports
— see the [README's features table](../README.md#features-and-which-ones-you-can-switch-off).
A switched-off feature is hidden on the page **and** refused by the server
(`FEATURES_` in `code.gs`: `canViewLogs_`, `getUsageStats`, `logUsage_`,
`getSubjectReps_`, `siteSettings_`, `getPrintableTimetable`, `submitReport`).

---

## How TermSync reads the institute's sheets

The sheets are typed by different people, term after term, for both years, so the
same thing turns up written different ways. Every sheet goes through the same
rules, so what works in one works in all of them:

| What | How it's decided | Written any of these ways |
|---|---|---|
| **Your batch's rows** in the timetable (and guest-lecture / feedback tabs) | The *Year/Batch* column contains a year tag for your term (Terms 1–3: first year, 4–6: second year) | "Ist year", "1st Year", "First Year", "Year 1", "I Year" · "2nd Year", "II Year", "Second Year", "Year 2" |
| **This term's rows** in the quiz / exam tabs | The *Batch / Term* column contains this term's tag and none of its neighbours' | "T-II", "Term-II", "TERM II", "T-2" … ([table](NEW_TERM.md#reference-the-standard-tags)) |
| **Not another batch's** | A row that names a batch ("MBA 2025-27") other than yours is never kept, whatever its tags say. An academic year ("AY 2026-27") isn't a batch | "2026-28", "2026-2028", "26-28" |
| **Which course** | Matched to `COURSES` ignoring case, spaces, hyphens and dots | "QAM-II", "QAM II", "qam-ii" |
| **Which section** | A section cell is one section, several, or everyone | "A", "Sec A", "Section-A" · "A & B", "A, B", "A/B", "A+B", "A and B" (any letters your roster has) · "-", "All", "Both", "Common" |
| **Who takes it** (Terms 1–3) | Every course the timetable runs for the student's section, plus every course run for the whole batch at once; `onlyFor` limits a course to programmes ("MBATM" matches MBATM rolls only, "MBA" MBA rolls only) | — |
| **Exams per section** | If an exam tab has a *Section* column, each student gets only their section's sitting; otherwise the one sitting is everyone's | — |
| **Times** | 12- or 24-hour | "2:00 PM", "2:00:00 PM", "14:00", "14.00", "1400 hrs", "2 p.m." |
| **Dates** | Day first, month first or ISO; impossible dates (31 September) are refused, never rolled over | "28-Sep-2026", "28/09/26", "Mon, 28 Sep 2026", "Sep 28, 2026", "2026-09-28" |
| **Academic calendar term** | Matched by number | "Term II", "Term-2", "TERM 2" |
| **Roll numbers** in the elective tabs | Letters, then at least four digits, then an optional letter (repeat students) | "MBA26917", "MBATM26904", "PHD26902", "MBA25999R" |
| **Room, instructor, session** | Their own columns in the office's sheet | — |

Placeholders in the timetable ("Quiz Slot", "PhD Class") are never classes.
✓ Check settings shows, for every sheet, which values it found and which it kept, so
a new spelling shows up before it reaches anyone's calendar. If the institute writes
something none of these rules catch, `THIS_TERM` can override the tags (see the
advanced lines in `config.gs`); anything else is a code change
([CHANGING_THE_CODE.md](CHANGING_THE_CODE.md)).

---

## When things go wrong, TermSync keeps what it had

- If a sheet can't be read, the previous data is kept and students' calendars don't
  change.
- If the timetable suddenly loses lots of classes (the office mid-edit), the change
  waits one fetch to be sure.
- If dates look wrong (most rows' dates disagree with their "Day" column — the
  signature of a changed date format), the whole read is refused.
- If Google slows a student's sync down, it finishes what it can and completes the
  rest on the next run. Students see "still finishing", never an error.

---

# Under the hood

For anyone changing `code.gs` or `Index.html`. Read
[CHANGING_THE_CODE.md](CHANGING_THE_CODE.md) first for the safe routine.

## Files and load order

- **`config.gs`** holds every batch- and term-specific value, in friendly shapes
  (dates as `"YYYY-MM-DD"`, rosters as pasted text). It has no logic.
- **`code.gs`** starts with a **settings section** that turns those into the
  internal names the rest of the file uses (`TERM_CONFIG_`, `PREVIOUS_TERM_`,
  `STUDENT_ROSTER_`, `COURSE_INFO_`, `SAC_ROLES_`, the `*_CSV_URL`s, …). Bad values
  never throw — a throw at load time would fail every student's background sync and
  Google would email each of them. They are collected in `SETTINGS_PROBLEMS_` and
  reported by `settingsReport_` (✓ Check settings) and in MasterData K2.
- Apps Script runs files top to bottom **in the order the editor lists them**, so
  `config.gs` must be above `code.gs`. `code.gs` throws one clear error if the settings
  are missing.
- **`Index.html`** holds no batch data. Everything it shows from `config.gs` arrives
  in the health payload: `health.site` (built by `siteSettings_`: institute, maintainer,
  credits, course names, outlines, selection mode), `health.specialRoles` (the SAC
  team), `health.subjectReps`. `doGet` embeds the first payload in the page
  (`#bootData`) so it renders without a second round trip.

## The fetch (`fetchAndCleanAdminData`)

Runs under a script lock as the spreadsheet owner (its trigger is installed and healed
only by the owner's runs, because triggers belong to one account). It reads every
published CSV in one parallel `fetchAll` (`CSV_SOURCES_`; unset ones are skipped),
reads the office's timetable with `SpreadsheetApp.openById` (view access is enough),
and parses:

- **The mirror timetable** (`parseMirrorTimetable_`): one row per class, detected by a
  header row with `Date`, `Code`, `Year/Batch`, `Grp` and `Classroom`. Rows are kept
  when `Year/Batch` matches `yearTags` (and none of `ignoreYearTags`). `Quiz Slot`
  and `PhD Class` rows are skipped. `(Guest Lecture)` and `(Feedback)` markers on a
  class become guest-lecture and feedback rows. The same sitting listed twice keeps
  only the first.
- **Quizzes and exams** (`parseQuizCsv_`, `parseExamCsv_`): a row is kept when its
  `Batch / Term` cell contains a `termTags` value and no `ignoreTermTags` value
  (`isTermRow_`; ignore is checked first, because matching is by substring).

Each source keeps its own signature; the revision is bumped only when one of them
actually changed, and each change is written to the ChangeLog.

Safety nets, every one of which **keeps the previous MasterData**: exact date parsing
(`parseQuizDate_` / `exactDate_` — never `new Date(y, m, d)` on raw cells, which rolls
31 Sep over to 1 Oct); the Day-column cross-check; a floor of 50 class rows inside the
sync window; and a big-drop hold (below 75% of the last count waits one fetch).

## Each student's sync (`backgroundSync` → `backgroundSyncLocked_`)

In order: the term-ended gate → the test-mode gate (`isPilotUser_`) → the term
handover (`handleTermHandover_`) → read the saved selection → `CODE_VERSION`
migration if needed → compare revisions → build the wanted events → diff against the
calendar by signature → create / delete / patch → record the revision.

- Every event's description ends with `[TT_SYNC]` and a `[TT_SIG:…]` fingerprint of its
  content (`computeEventSig_`). The diff matches on the fingerprint plus start / end.
  Reminders are outside the fingerprint, so a reminder change is patched in place.
- Writes go through the Calendar v3 REST API in batches of 12 (`CALENDAR_API_BATCH_SIZE_`),
  retrying rate-limited requests, then fall back to `CalendarApp` for whatever is still
  missing. Runs stop cleanly at 4.5 minutes (`EXECUTION_DEADLINE_MS_`); an unfinished
  sync leaves the revision unapplied so the next run completes it.
- **The handover** runs once per student per term, latched in their `tt_handover`
  property against `HANDOVER_VERSION_` (derived from the term's name and batch, so a
  new term re-arms it by itself). It crosses out last term's events in
  `PREVIOUS_TERM_.calendarName` — worked out from `THIS_TERM.number` unless config.gs
  names it (titles struck through, never deleted), clears last
  term's per-user state, and seeds the new selection: `sectionSelections_` in section
  mode, `handoverSelectionsFromElectives_` reading the allotment tabs in electives mode.
  It only seeds students who were already using TermSync.
- **Section mode** is one function, `sectionCoursesFor_`: courses the timetable runs
  for the student's section, plus whole-batch (section-less) courses, filtered by
  `onlyFor`. Courses with no timetable rows yet are left out; the 6-hourly drift check
  (`checkElectiveDrift_`) offers them once they appear.

## Things that are easy to get wrong

- **Save is a release; Deploy is only the page.** Triggers (every student's sync, the
  fetch) run the **saved** code at once; the web page runs the last **deployed**
  version. Bump `BUILD_ID_` on every paste — admin → ⚙️ Tools warns when the saved
  build is newer than the deployed one.
- **`CODE_VERSION` vs `RESYNC_VERSION`.** Bump `CODE_VERSION` only for changes to how
  events are matched or wiped (`APP_TAG`, the `[TT_SIG]` format, title prefixes) — it
  makes every student wipe and rebuild. Bump `RESYNC_VERSION` for changes to event
  content (titles, descriptions, colours) — a cheap diff re-sync. A new term needs
  neither: the handover resets both per student.
- **Public functions are callable by every student.** Any function without a trailing
  `_` can be called from the page with `google.script.run`, as the student. Admin-only
  ones must call `assertAdmin_()` first.
- **An absence is never evidence.** An unreadable enrolment tab and an empty one must
  not look the same — everything on the electives path distinguishes "couldn't read"
  (`ok: false`, retry) from "not enrolled".
- **The calendar name is matched by exact string**, including the long dash (–). A
  renamed calendar mid-term leaves students with two calendars.
- **Events outside the sync window are orphans** — the cleanup never finds them again.
  `isWithinSyncWindow_` refuses to create them.
- **Create a trigger before deleting the old one.** Deleting first and failing to
  create leaves a student with no automatic sync and nothing that can repair it from
  your side.
- **The feedback note is part of the fingerprint**, so it must depend only on the
  class (course, section, start, end) — never on today's date, or every class would
  be rewritten on every sync.

## The reading rules in the code

All in one place near the top of `code.gs`, used by every parser:
`normalizeSection_` / `splitSectionCell_` (sections, joint sessions),
`courseCodeKey_` / `canonicalCourseCode_` (course codes), `cleanTimeText_` (times),
`termNumberOf_` (term labels), `namesAnotherBatch_` (batch guard, used by
`isTermRow_` and `isOurYearRow_`). `parseQuizDate_` / `exactDate_` read every date,
and `rowSectionApplies_` decides whether a quiz or exam row's section is the
student's. Change a rule there and every sheet follows; add a check for it to
`tests/settings_test.js` (unit) and `tests/first_year_test.js` (section 12 runs the
whole pipeline on sheets written differently).

## Term numbers and switches

- `TERM_PRESETS_` / `YEAR_PRESETS_` at the top of `code.gs` hold the standard values for
  Terms 1–6: quiz/exam tags and their ignore lists, year tags, the course-selection
  mode. `termValue_` lets any explicit `THIS_TERM` field override them.
- On the first fetch of a new term (`termSwitchPending`: the stored term label differs
  from `TERM_CONFIG_.label`), quiz / exam / end-term rows that aren't this term's are
  **cleared** rather than kept — kept, they would reach the new calendars for any
  course code that carries over. The term's first published schedule is logged as
  new quizzes / exams, so students see it in their "Quiz updates".
