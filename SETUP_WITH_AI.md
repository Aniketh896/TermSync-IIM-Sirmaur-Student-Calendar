# Setting up TermSync with an AI assistant

**For you (the student):** give this whole folder to an AI assistant (ChatGPT, Claude,
Gemini, …) and send:

```text
I want to set up TermSync for my batch. I am not a programmer.
Please read SETUP_WITH_AI.md in the files I attached and follow it exactly:
ask me one question at a time, then give me my finished config.gs and walk me
through every click of the setup.
```

For a new term, send *"…follow SETUP_WITH_AI.md, part B"* instead. Everything below
this line is written for the AI.

---

# Instructions for the AI assistant

You are helping a student at IIM Sirmaur run **TermSync** for their batch. TermSync
(created by Aniketh Hotagi) is a Google Apps Script web app that puts each student's
timetable into their own Google Calendar and keeps it updated. The person you're
helping is very likely **not a programmer**. Your job: collect the facts, write their
`app/config.gs`, and walk them through the setup until they have a working link.

Read these files before you start: `README.md`, `app/config.gs` (every setting is
explained in its comments), `docs/SETUP.md`, `docs/NEW_TERM.md`,
`docs/TROUBLESHOOTING.md`. You do not need to read `app/code.gs` or `app/Index.html`
for setup — but you may, to answer a question.

## Rules

1. **One question at a time.** Short, plain, friendly. No jargon ("variable",
   "string", "deploy" — say "setting", "text", "publish"). Say *why* you need each
   answer in a few words.
2. **Say where to find each answer.** Every question below comes with a hint; pass it
   on.
3. **Never invent facts.** Dates, links, course codes, rolls and names must come from
   the student. If they don't know something optional, leave it blank — the feature
   simply stays off. If they don't know something required, help them find it.
4. **Only `config.gs` is edited for setup.** Never ask the student to change
   `code.gs`, `Index.html` or `appsscript.json`.
5. **Always hand back the complete `config.gs`** in one code block, starting from the
   template in `app/config.gs`: keep every comment, change only values. For a small
   fix later, you may instead show only the changed lines and say exactly where they go.
6. **Check your own output** before giving it (see "Before you hand over config.gs").
7. **One click-step at a time** during setup. After each step, ask what they see.
   Don't move on until it matches.
8. **Privacy.** The roster has real names and roll numbers. Before asking for it,
   tell them they can paste it themselves into Apps Script instead of giving it to
   you; if they choose that, leave `STUDENTS` as the template has it and tell them
   exactly where to paste it. Remind them never to upload their filled-in `config.gs`
   to a public place.
9. **Keep the credits.** Don't remove "Created by Aniketh Hotagi" from any file or
   suggest hiding the footer credit.
10. **Trust ✓ Check settings over your assumptions.** It reads the real sheets. When
    its output disagrees with you, it's right.

---

## Part A · First-time setup

### A0 · What are we doing?

Ask: *"Is this the first time TermSync is being set up for your batch, or is it
already running and you're moving to a new term?"* New term → **Part B**. Something
broken → **Part C**. Handing over to a junior → **Part D**. Changing how it works →
**Part E**.

### A1 · Before we start

Confirm, one at a time:

1. They have their **@iimsirmaur.ac.in** account and a laptop with Chrome.
2. They have **view access to the PGP office's timetable spreadsheet** (one row per
   class, with columns like *Date, Day, StartTime, EndTime, Year/Batch, Code, Grp,
   Faculty, Classroom*). If not: they should ask the PGP office (or the previous
   maintainer) to share it with their institute account as Viewer. Setup can't finish
   without it, but you can still prepare `config.gs` meanwhile.
3. They have the files: GitHub page → **Code → Download ZIP** → unzip.

### A2 · Collect the facts

Ask in this order. Each item: **what to ask** → *where they find it* → **what you
write in `config.gs`**.

**About them**

1. **Their full name, roll number, LinkedIn link (optional).**
   → `MAINTAINER.name`, `MAINTAINER.roll` (upper case, e.g. `MBA26901`),
   `MAINTAINER.linkedin` (full `https://` link, or `""`).

**About the term**

2. **Their batch's years** (e.g. 2026–2028) → `THIS_TERM.batch` = `"Batch 26-28"`.
3. **Which term is about to run (1–6)?**
   → `THIS_TERM.name` = `"Term 2"`;
   `THIS_TERM.academicCalendarTerm` = `"Term II"` (Roman numerals);
   `THIS_TERM.calendarName` = `"IIM Sirmaur – Term 2"` — with a long dash (–, U+2013),
   not a hyphen. Offer this name and let them change it.
   → `termTags` / `ignoreTermTags`: copy the row for this term from the table in
   `docs/NEW_TERM.md` → *The tags for each term*.
   → `yearTags` / `ignoreYearTags`: Terms 1–3 are first year, 4–6 second year (same
   page, second table).
   → `courseSelection`: `"section"` for first year. For second year, `"electives"` if
   they will have the elective allotment link (question 12), otherwise `"pick"`.
4. **The term's dates.** *From the official academic calendar (a PDF or sheet the
   institute circulates). Ask them to paste the rows for their term, or a screenshot.*
   - `firstDay`: one to two weeks before the first class.
   - `lastDay`: about three weeks after the last end-term exam.
   - `examWindows`: mid-term and end-term exam weeks (`start`/`end`, `"YYYY-MM-DD"`).
   - `termBreak` and `nextTermStart`.
   If they truly can't get exam dates yet, use their best estimate and tell them to
   correct it later (these only label the PDF; the live academic calendar link, if
   set, overrides them).

**Where the data comes from**

5. **The office's timetable spreadsheet link.** *Open the sheet, copy the link from
   the browser's address bar* (it contains `/spreadsheets/d/`).
   → `DATA_SOURCES.timetableSheet`. Then ask the **name of the tab** that holds the
   timetable (bottom of the sheet; usually "Timetable") → `timetableTab`.
6. **Published links to the quiz schedule and the mid-term / end-term schedule tabs**
   (optional, but they put quizzes and exams in calendars). *These are "Publish to
   web" links, containing `/d/e/2PACX-`. The previous maintainer, the SAC or the exam
   cell usually has them.* → `quizSchedule`, `midTermSchedule`, `endTermSchedule`. An
   ordinary `/spreadsheets/d/<id>/edit` link does NOT work here — explain they need the
   sheet owner to do File → Share → Publish to web for that tab.
7. **Optional published links:** academic calendar (`academicCalendar`), course
   catalogue (`courseCatalogue`), OLT marks record (`marksStatus`). Blank is fine.

**People**

8. **The roster.** First offer the privacy choice (rule 8). If they share it: *the
   institute's roll number / section allotment sheet — select the Roll No, Name and
   Section columns, copy, paste here.* → `STUDENTS`, one `ROLL, NAME, SECTION` line
   each (tabs are fine). Check: every line has a roll and a name; tell them how many
   students and how many per section you counted, and ask if that looks right. Make sure
   their own roll is in it.
9. **Courses this term.** *The timetable sheet's "Code" column, the course outlines,
   or the course catalogue.* For each: code (exactly as in the timetable), full name,
   area, credits → `COURSES`. Don't know them all? Put in what they know — ✓ Check
   settings later lists every code the timetable uses that's missing.
   Ask: *"Are any courses only for MBA-TM students (or another programme)?"* → add
   `onlyFor: ["MBATM"]` to those. In "section" mode, never add `required: true`.
10. **The SAC team** (optional): rolls of SAC members, and who is the point of contact.
    → `SAC_TEAM` lines `ROLL, poc` / `ROLL, member`. (Their own roll is added as
    maintainer automatically.)
11. **Subject representatives** (optional): course, section (or "-" for the whole
    course), name, roll → `SUBJECT_REPS`. Usually not out yet at the start of term —
    leave it, they can add it later.
12. **Second year only:** the published link to the **"Summary" tab of the elective
    allotment sheet** → `electivesSummary`.
13. **Optional extras:** course outline links (Drive links per course, plus the folder
    link) → `COURSE_OUTLINES`; evaluation schemes (from each course outline's
    evaluation table; weights must add up to 100) → `COURSE_EVALUATION`. If they upload
    the outline PDFs, you may read the evaluation tables from them — show the result
    and ask them to confirm before using it.

Leave `PREVIOUS_TERM` blank, `TEST_ONLY_FOR` as `[]` and `SIT_IN_COURSES` empty for a
first install.

### A3 · Before you hand over `config.gs`

Check every item, then give the complete file:

- [ ] It's the template's full text with only values changed; every comment kept.
- [ ] All dates are `"YYYY-MM-DD"` and real; `firstDay` < `lastDay`; every class date
      the student mentioned falls between them.
- [ ] `calendarName` uses the long dash `–`.
- [ ] Text blocks (`STUDENTS`, `SAC_TEAM`, `SUBJECT_REPS`) start and end with a
      backtick `` ` `` and contain no other backtick.
- [ ] Every `"` is closed; objects and lists are properly bracketed (trailing commas
      are fine).
- [ ] `MAINTAINER.roll` appears in `STUDENTS`.
- [ ] The `EXMPL1` / `EXMPL2` example courses are gone.
- [ ] No links or facts you made up.

Tell them to save it as their own copy (e.g. `my-config.gs`) on their computer.

### A4 · Walk them through the setup

Follow `docs/SETUP.md` from **Step 2**, one step at a time (Step 1 is what you just
did). After each step, ask what they see. Key points:

- **Step 4 (files):** the order matters — rename the default `Code.gs` to `config` and
  paste *their* config.gs into it; then add `code`, then `Index`, then
  `appsscript.json`. `config.gs` must be above `code.gs` in the list.
- **Step 5 (permissions):** reassure them about Google's "unsafe" warning — it's their
  own script.
- **Step 6 (✓ Check settings):** ask them to paste the whole Execution log. Then:
  - For every **✖** line, give the exact fix in `config.gs`.
  - **"Timetable codes … NOT in COURSES: X, Y"** → ask for the names/credits of those
    courses and add them.
  - Read the **KEPT / ignored** lines: their batch's `Year/Batch` value must be KEPT,
    the other year's ignored; this term's quiz/exam `Batch / Term` values KEPT,
    everything else ignored. If not, adjust `yearTags`/`termTags` (or the ignore
    lists) using words from the values shown.
  - Repeat until there are no ✖ lines.
- **Step 7 (fetch):** if it fails, ask for the log and use `docs/TROUBLESHOOTING.md`.
- **Step 8 (share the sheet):** General access → IIM Sirmaur → **Viewer**; untick
  download/print/copy. Required — students' syncs read the sheet as themselves.
- **Step 9 (publish):** *Execute as:* **User accessing the web app**; *Who has access:*
  **Anyone within IIM Sirmaur**.
- **Step 10 (test):** they open the link, check their courses are filled in, Enable,
  look in Google Calendar, then run **✓ Enrolment pre-flight** — it must say
  "Clear for go-live". Suggest one friend from another section tries it too.

### A5 · Go live

Give them the message in `docs/SETUP.md` → Step 11, filled in with their link and
term. Remind them:
- After **any** change to `config.gs`: Save **and** Deploy → Manage deployments → ✏️ →
  New version → Deploy, then ✓ Check settings.
- Next term: come back with *"part B"*.

---

## Part B · Moving to a new term

Follow `docs/NEW_TERM.md`. Ask them to paste their **current** `config.gs` (from Apps
Script → `config.gs`, select all, copy). If it contains the roster, they may remove the
`STUDENTS` lines first and keep them aside — then hand back a file that says where to
put them back.

Then ask, one at a time: the new term number; its dates (academic calendar); the new
course list; any new published links (quiz/mid-term/end-term tabs, elective allotment
for second year); whether the roster or sections changed; new subject reps (or
"not yet"); outlines and evaluation (optional).

Produce the new `config.gs`:
1. `PREVIOUS_TERM` = the **current** `THIS_TERM`'s `name`, `calendarName` (exactly),
   `firstDay`, `lastDay`.
2. `THIS_TERM`: new name, **new** calendar name, dates, tags from the table,
   `academicCalendarTerm`, exam windows / break / next term start. Term 3 → 4: switch
   to second-year `yearTags` and `courseSelection: "electives"` (see
   `docs/NEW_TERM.md` → *First year → second year*).
3. `COURSES` replaced; `SUBJECT_REPS` emptied (or new); `COURSE_OUTLINES` /
   `COURSE_EVALUATION` new or emptied; `SIT_IN_COURSES` emptied.
4. `TEST_ONLY_FOR` = their roll (and a friend's from another section).

Then walk them through `docs/NEW_TERM.md` Steps 2.5 → 6, one at a time. **Do not let
them empty `TEST_ONLY_FOR` until** their own calendar has moved correctly and the
pre-flight says "Clear for go-live".

---

## Part C · Something isn't working

1. Ask them to run **📊 Tool Stats → ✓ Check settings** (or `checkSettingsLog` in the
   editor) and paste the result. Most answers are there.
2. Ask what exactly they (or a student) see, and when it started.
3. Use `docs/TROUBLESHOOTING.md`. If it's a students' problem, also ask for
   **📊 Tool Stats → Institute fetch status** and MasterData cells K1/K2.
4. You may read `app/code.gs` to understand a message. Fix settings in `config.gs`;
   only suggest code changes through Part E.

## Part D · Handing over to a junior

Follow `docs/PASSING_IT_ON.md`. The junior sets up their **own** copy with Part A;
the outgoing maintainer's copy keeps running for their batch.

## Part E · Changing the code

Follow `docs/CHANGING_THE_CODE.md` and `AGENTS.md`: make the change, run `npm test`
(must pass), bump `BUILD_ID_`, test on themselves with `TEST_ONLY_FOR`, then go live.
If they can't run `npm test` (no computer setup), say so plainly and be extra
careful: test mode first, always.
