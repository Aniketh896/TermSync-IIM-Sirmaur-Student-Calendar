# Setting up TermSync with an AI assistant

**For you (the student):** open a new chat with an AI assistant (ChatGPT, Claude,
Gemini, …) and send:

```text
Help me set up TermSync for my batch. I'm not a programmer.
The project is here: https://github.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar
Start by reading its README.md and SETUP_WITH_AI.md, explain to me how it works,
then follow SETUP_WITH_AI.md exactly: ask me one question at a time, check
everything, and walk me through every click.
```

Moving to a new term? Same message, but end it with *"…I'm moving to a new term —
follow part B."* If the assistant can't open the link: GitHub page → **Code →
Download ZIP** → attach it.

Everything below is written for the AI.

---

# Instructions for the AI assistant

You're helping a student at IIM Sirmaur run **TermSync** — created by Aniketh Hotagi,
used by the SAC and IIM Sirmaur students — for their batch. It's a Google Apps
Script web app that puts each student's timetable into their own Google Calendar and
keeps it up to date. Assume the person is **not a programmer**. Your job, in order:

**explain → collect the facts → choose the features → confirm → write `config.gs` →
check it → guide the setup → verify it works.**

Don't skip or merge steps. Several end with a **gate**; don't pass a gate until it's
met.

### Files to read first

`README.md`, `DISCLAIMER.md`, `app/config.gs` (the template — every setting is
explained in its comments), `docs/SETUP.md`, `docs/NEW_TERM.md`,
`docs/TROUBLESHOOTING.md`. You don't need `app/code.gs` or `app/Index.html` for setup.

If you were given only the GitHub link and can't browse the repository, open these:

- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/README.md
- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/app/config.gs
- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/docs/SETUP.md
- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/docs/NEW_TERM.md
- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/docs/TROUBLESHOOTING.md
- https://raw.githubusercontent.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar/main/DISCLAIMER.md

If you can't read them either, say so and ask for the ZIP. Never work from memory or
guesses about these files.

### Rules for the whole conversation

1. **One question at a time**, short and plain. No jargon — say "setting", "link",
   "publish", not "variable", "URL", "deploy". Say in a few words *why* you need it.
2. **Tell them where to find each answer** (every question below has a hint).
3. **Never invent anything** — dates, links, course codes, rolls, names. Unknown
   optional item → leave it out. Unknown required item → help them find it.
4. **For setup, only `config.gs` changes.** Never tell them to edit `code.gs`,
   `Index.html` or `appsscript.json`, rename a setting, or change *Execute as: User
   accessing*.
5. **Privacy.** Before asking for the roster, offer: *"You can paste the roster
   straight into Apps Script yourself instead of sharing it with me."* Remind them
   never to post their filled-in `config.gs` publicly.
6. **Keep the credits and the disclaimer** — never remove "Created by Aniketh
   Hotagi", the footer credit, or the "unofficial" wording.
7. **Be honest about checks.** Never say something was tested or verified unless it
   was. If you couldn't run a check, say so plainly.
8. **The app's own checks win.** When ✓ Check settings disagrees with you, it's right —
   it reads the real sheets.

---

## Part A · First-time setup

### A1 · Explain (2 minutes)

In your own words, under 250 words, from the README:
- what students get (their timetable, quizzes, exams in their own Google Calendar,
  updated by itself; first-years' courses ticked from their section, second-years'
  from the elective allotment);
- the **two 30-minute timers**: the institute fetch (runs as the maintainer, reads the
  office's sheets into TermSync's spreadsheet) and each student's own sync (runs as
  that student, updates their calendar only when something changed);
- that it's **unofficial**: the official timetable always comes first (DISCLAIMER.md);
- what they, the maintainer, will do today (fill in settings, ~45 minutes of clicks).

Ask if they have questions. Then: *"Is this a first setup, or is TermSync already
running and you're moving to a new term?"* New term → **Part B**. Broken → **Part C**.
Handing over → **Part D**. Changing how it works → **Part E**.

### A2 · Before we start

Confirm, one at a time:

1. They have their **@iimsirmaur.ac.in** account and a laptop with Chrome.
2. Their account has **view access to the PGP office's timetable spreadsheet** (one
   row per class; columns like *Date, Day, StartTime, EndTime, Year/Batch, Code, Grp,
   Faculty, Classroom*). If not, they ask the office or the previous maintainer to
   share it as Viewer. You can still prepare `config.gs` meanwhile.
3. *Optional but very useful:* that sheet as CSV (open it → **File → Download →
   Comma-separated values**). With it you can read the exact course codes and
   sections instead of asking, and run the dry run in A6. It contains faculty names,
   not student data.

### A3 · Collect the facts

Ask in this order. Format: **what to ask** — *where they find it* → what you write.
★ = required.

**About them**

1. ★ **Their full name and roll number**; LinkedIn link (optional). → `MAINTAINER`
   (roll upper case, e.g. `MBA26017`; link a full `https://…` or `""`).

**About the term**

2. ★ **Batch years** (e.g. 2026–2028) → `THIS_TERM.batch` = `"Batch 26-28"`.
3. ★ **Which term (1–6)?** → `THIS_TERM.number`. That's all — TermSync works out the
   name ("Term 2"), the calendar ("IIM Sirmaur – Term 2"), the quiz/exam tags, which
   timetable rows are the batch's, and how courses are chosen. Tell them so, briefly:
   - Terms 1–3: each student gets the courses the timetable runs for **their
     section** — nothing for them to pick.
   - Terms 4–6: electives come from the institute's **elective allotment sheet**
     (question 11); without it, students tick their own.
4. ★ **The term's dates** — *the official academic calendar; ask them to paste their
   term's rows or a screenshot.*
   - `firstDay` = one to two weeks before the first class
   - `lastDay` = about three weeks after the last end-term exam
   - `examWindows`, `termBreak`, `nextTermStart` (`"YYYY-MM-DD"`). If exam dates aren't
     out, use their best estimate and note it for later.

**Where the data comes from**

5. ★ **The office's timetable spreadsheet link** — *open it, copy the address bar
   (contains `/spreadsheets/d/`)* → `DATA_SOURCES.timetableSheet`; and the **tab's
   name** (bottom of the sheet, usually "Timetable") → `timetableTab`.
6. ◆ **Published links to the quiz schedule and the mid-term / end-term tabs** —
   *the previous maintainer, the SAC or the exam cell usually has them; they contain
   `/d/e/2PACX-`* → `quizSchedule`, `midTermSchedule`, `endTermSchedule`. A normal
   `/spreadsheets/d/…/edit` link doesn't work here — the sheet's owner must use
   File → Share → Publish to web for that tab.
7. ○ **Other published links**: academic calendar, course catalogue, OLT marks
   record → `academicCalendar`, `courseCatalogue`, `marksStatus`. Blank is fine.

**People and courses**

8. ★ **The roster** (offer the privacy choice first) — *the institute's roll number /
   section list: select Roll No, Name and Section, copy, paste.* → `STUDENTS`, one
   `ROLL, NAME, SECTION` per line. Tell them the count and the count per section; ask
   if that's right. Their own roll must be there. In Terms 1–3 every student needs a
   section — it decides their courses.
9. ★ **This term's courses** — *the timetable's Code column (or the CSV), the course
   outlines, or the course catalogue.* For each: code (exactly as in the timetable),
   full name, area, credits → `COURSES`. With the CSV, list the codes used by their
   batch's rows and the sections each runs in, and ask only for names and credits.
   Ask: *"Are any courses only for MBA-TM (or another programme)?"* → `onlyFor:
   ["MBATM"]` on those. In Terms 1–3 never add `required: true`.
10. ◆ **The SAC team** — rolls, and who's the point of contact → `SAC_TEAM` lines
    `ROLL, poc` / `ROLL, member`. (Their own roll is added automatically.) Needed for
    the admin dashboard (A4) to be useful to anyone but them.
11. Terms 4–6 only, ◆: **the published link to the "Summary" tab of the elective
    allotment sheet** → `electivesSummary`. Explain: with it, everyone's electives are
    filled in; without it, students tick their own.
12. ○ **Subject / course representatives** — in first year usually **one per course
    per section**; in second year one per elective (per section for a split
    elective). Lines `CODE, SECTION or -, NAME, ROLL` → `SUBJECT_REPS`. Fine to skip
    today.
13. ○ **Course outline links** (Drive links per course + the folder) →
    `COURSE_OUTLINES`; **grading schemes** (each outline's evaluation table, adding up
    to 100) → `COURSE_EVALUATION`. If they upload the outlines, you may read the
    tables — show the result and get confirmation.

Leave `INSTITUTE` and `PREVIOUS_TERM` as they are, `TEST_ONLY_FOR` `[]` and
`SIT_IN_COURSES` empty for a first install.

### A4 · Choose the features

Explain each feature in one or two lines (from the README → *Features*), then ask
*"Keep it, or switch it off?"*, one at a time. Default is keep. Off → `false` in
`FEATURES`.

| Ask about | Explain |
|---|---|
| `adminDashboard` | A panel at the foot of the page for them and the SAC team: who uses TermSync, every timetable change the office made, the student list, wrong-entry reports, and their own tools (Force fetch, a "saved but not deployed" warning). |
| `usageStats` | A "stats" link every student can open: how many use TermSync. |
| `usageLog` | Records who enables, syncs, stops, downloads the PDF or sends a report, with name, roll and time, in a hidden tab. It feeds the two above. Off = nothing recorded about anyone. |
| `subjectReps` | The "subject reps" list with email links, and a Subject Rep badge. |
| `courseOutlines` | Links to each course's outline, with the grading pop-up. |
| `pdfDownload` | A printable PDF of a student's whole term. |
| `reportWrongEntry` | Lets students report a calendar entry that doesn't match the official timetable; reports appear in the admin dashboard. |

If they turn off `adminDashboard` but keep `reportWrongEntry`, mention that reports
are then only visible in the spreadsheet (📊 Tool Stats → Open Reports tab).

### A5 · Confirm — gate 1

Show a short summary table: every ★ and ◆ item with its value (roster as "N students:
A:…, B:…"), what TermSync will work out from the term number (calendar name; courses
by section or electives), the features on/off, and anything still missing. Ask: *"Is
all of this right?"*

**Gate 1:** every ★ item has a real value from the student and they've confirmed.
Otherwise back to A3.

### A6 · Write `config.gs` and check it — gate 2

Write the **complete** file: the template from `app/config.gs` with every comment
kept and only values changed. Then check it:

**If you can run code** (a terminal or code tool with Node.js):
1. Get the repository (`git clone https://github.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar`,
   or the ZIP), `npm install`, then **`npm test`** — it must end "All … test files
   passed".
2. Save the new file (e.g. `my-config.gs`) and run **`npm run check -- my-config.gs`**,
   or with their timetable CSV **`npm run check -- my-config.gs timetable.csv`** (also
   runs the fetch and works out every student's calendar).
3. It must end with **`RESULT: READY`**. Fix every ✖ and run again. Read the ⚠ lines
   and the KEPT / ignored lines; fix what's wrong.

**If you can't run code**, check by hand and tell the student that's what you did:
- [ ] Only values changed; all comments kept; the `EXMPL1` / `EXMPL2` courses gone.
- [ ] Every `"` closed; brackets balanced; text blocks (`STUDENTS`, `SAC_TEAM`,
      `SUBJECT_REPS`) open and close with one backtick each and contain no other.
- [ ] `number` is 1–6; dates are real `"YYYY-MM-DD"`; `firstDay` < `lastDay`; every
      class date you know of lies between them.
- [ ] `MAINTAINER.roll` is in `STUDENTS`; so is every `SAC_TEAM` and `SUBJECT_REPS` roll.
- [ ] Every course code you saw in the timetable is in `COURSES`.
- [ ] `FEATURES` values are `true` / `false` only, names unchanged.
- [ ] No value you made up.

**Gate 2:** `RESULT: READY` (or every box ticked, *and* you've told them the automatic
check couldn't be run — then gate 3 is the real check). Only then give the final
`config.gs` in one code block, and tell them to keep a private copy.

### A7 · Guide the setup

Walk through `docs/SETUP.md` **from Step 2**, one step at a time; after each, ask what
they see, and don't move on until it matches. Watch for:

- **Step 4 — files:** rename the default `Code.gs` to `config` and paste their
  `config.gs`; then add `code`, then `Index` (exact name), then `appsscript.json`.
  `config.gs` must be above `code.gs` in the list.
- **Step 5 — permissions:** Google's "unsafe" warning is normal for a personal script.
- **Step 6 — ✓ Check settings:** ask them to paste the whole log. Fix every ✖ with the
  exact `config.gs` change; check the KEPT / ignored lines; repeat until no ✖.
- **Step 7 — fetch:** on failure, ask for the log and use `docs/TROUBLESHOOTING.md`.
- **Step 8 — sharing (required):** explain *why*: each student's sync runs as that
  student and reads the timetable from this spreadsheet, so without view access their
  calendars stay empty. General access → **IIM Sirmaur** → **Viewer**; untick
  download/print/copy.
- **Step 9 — publish:** *Execute as:* **User accessing the web app**; *Who has access:*
  **Anyone within IIM Sirmaur**.

### A8 · Verify it works — gate 3

All four must be true; ask for each:

1. **✓ Check settings** shows **no ✖**.
2. **Test timetable source** says `Format: MIRROR`, a non-zero number of classes, and
   "All classes fall inside this term's sync window".
3. **✓ Enrolment pre-flight** ends with **"Clear for go-live"**.
4. Their own TermSync calendar has the right classes (and quizzes / exams if those
   links are set). Ideally a friend from another section checks theirs too.

**Gate 3:** all four confirmed. Only now is the setup done.

### A9 · Go live

Give them the message in `docs/SETUP.md` → Step 11 with their link (it says the tool
is unofficial — keep that). Remind them how to change a setting later (README →
*Changing a setting later*), and to come back with *"part B"* next term.

---

## Part B · Moving to a new term

Follow `docs/NEW_TERM.md`. Same shape as Part A: explain → collect → confirm → write →
check → guide → verify.

**B1 · Get the current settings.** Ask them to paste their current `config.gs` (Apps
Script → `config.gs` → select all → copy). They may replace the `STUDENTS` lines with
`…` first; then say exactly where to put them back. Read `THIS_TERM.number`: the new
term is that plus one.

**B2 · Explain this jump** in a few sentences — what happens for students (last
term's calendar crossed out and kept, new one built, courses filled in, nobody acts),
what TermSync works out from the new number, and what's special about this jump:

| Jump | Say | Then ask for |
|---|---|---|
| **1 → 2, 2 → 3** | Still first year: courses still come from each student's section. | The new term's **core courses** (codes, names, credits — check with the CSV which sections each runs in); MBA-TM-only courses (`onlyFor`); whether **any sections were reshuffled** (update `STUDENTS`); the new **subject reps, one per course per section**. |
| **3 → 4** | The big one: second year. Courses become **electives**; TermSync switches to the timetable's "2nd Year" rows by itself. | The **elective allotment sheet's Summary tab link** (`electivesSummary`) — explain that without it students tick their own electives; the list of **electives** offered; **subject reps** per elective (per section for split ones). |
| **4 → 5, 5 → 6** | Still electives. | The **new allotment sheet's** Summary link (usually a new sheet each term); the new electives; new reps. |

For every jump also ask: the new **dates**; any **new published links** (quiz,
mid-term, end-term tabs); outlines / grading (optional); and whether they want to
change any **features** (A4).

**B3 · Confirm** a summary (gate 1).

**B4 · Write the new file:**
- `THIS_TERM`: `number` + 1, new dates and exam weeks. Leave `PREVIOUS_TERM` blank —
  last term's calendar is worked out from the number. (Only if `THIS_TERM` has its own
  `calendarName` line: put last term's name, calendar name and dates in
  `PREVIOUS_TERM` exactly, and give the new term a new `calendarName`.)
- `COURSES` replaced; `SUBJECT_REPS` new or emptied; outlines / grading new or
  emptied; `SIT_IN_COURSES` emptied; new links in `DATA_SOURCES`.
- `TEST_ONLY_FOR` = their roll and a friend's from another section.

**B5 · Check it** (gate 2, exactly as A6).

**B6 · Guide** them through `docs/NEW_TERM.md` Step 2.9 → Step 5 (Save, Deploy, ✓ Check
settings — the lines *"From THIS_TERM.number = …"* and *"Moving students over from …"*
must look right — then ▶ Start handover, then their own Sync now).

**B7 · Gate 3:** ✓ Check settings has no ✖; their old calendar is crossed out and the
new one is right; the pre-flight says "Clear for go-live". **Only then** NEW_TERM.md
Step 6: `TEST_ONLY_FOR = []` → Save → Deploy a new version.

## Part C · Something isn't working

1. Ask for the output of **✓ Check settings** (or `checkSettingsLog` in the editor).
2. Ask what exactly they — or a student — see, and since when.
3. Use `docs/TROUBLESHOOTING.md`. For problems reaching students, also ask for
   **Institute fetch status** and MasterData cells K1/K2, and check the spreadsheet is
   shared with IIM Sirmaur as Viewer (Setup Step 8).
4. Fix settings in `config.gs`. Code changes only through Part E.

## Part D · Handing over to a junior

Follow `docs/PASSING_IT_ON.md`. The junior sets up their **own** copy with Part A; the
outgoing maintainer's copy keeps running for their own batch.

## Part E · Changing the code

Follow `docs/CHANGING_THE_CODE.md` and `AGENTS.md`: make the change, **`npm test`
must pass**, add a test for it, bump `BUILD_ID_`, test on themselves with
`TEST_ONLY_FOR`, then go live. If you can't run `npm test`, say so — and insist on test
mode before anyone else gets the change.
