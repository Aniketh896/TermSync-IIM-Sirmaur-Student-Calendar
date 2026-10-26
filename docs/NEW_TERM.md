# Moving your batch to the next term

Once per term: Term 1 → 2 → 3, then (second year) 4 → 5 → 6. About **30 minutes**.
**Nobody in your batch has to do anything** — their calendars move over by
themselves.

Use the **same** spreadsheet and Apps Script project as last term. Keeping the same
project keeps the same link, the same permissions and every student's automatic sync.

> **With an AI assistant:** send it *"Help me move TermSync to the next term. The
> project is at https://github.com/Aniketh896/TermSync-IIM-Sirmaur-Student-Calendar —
> read README.md and SETUP_WITH_AI.md, then follow part B."* It asks for exactly
> what's listed below, checks it, and walks you through the steps.

**When:** once the PGP office has put the new term's classes in its timetable sheet —
usually a few days before classes start.

---

## What changes, and what TermSync works out by itself

| You change in `config.gs` | TermSync works out from the new term number |
|---|---|
| `THIS_TERM.number` (+1) | The term's name ("Term 3") and its **new calendar** ("IIM Sirmaur – Term 3") |
| `THIS_TERM.firstDay`, `lastDay`, exam weeks, term break | Which quiz / exam rows are this term's ("T-III", "Term-III", …) |
| `COURSES` — the new term's courses | Which timetable rows are your batch's ("Ist year" in Terms 1–3, "2nd Year" in 4–6) |
| New links in `DATA_SOURCES`, if any | How courses are chosen: by **section** (Terms 1–3) or from the **elective allotment** (4–6) |
| `SUBJECT_REPS` — the new reps | **Last term's calendar**, so its events can be crossed out |

## What happens for each student

On their next automatic run after you go live (within about 30 minutes):

1. Every TermSync event in last term's calendar is ~~crossed out~~. That calendar is
   **kept** — nothing is deleted. Students can hide or delete it themselves.
2. Their new term's courses are filled in for them — from their **section** (Terms
   1–3) or their **elective allotment** (Terms 4–6).
3. The new term's calendar is built.

Last term's quizzes and exams never carry over: on the first fetch of the new term
they're cleared, and the new term's appear as soon as the institute publishes them.

---

## Step 1 · Collect the new term's details

- [ ] **Dates** from the academic calendar: first class, exam weeks, term break, next
      term's start.
- [ ] **Courses** — code (exactly as in the timetable's *Code* column), full name,
      area, credits. Not sure of the codes? ✓ Check settings in Step 3 lists every code
      the timetable uses for your batch that isn't in your list yet.
- [ ] **Links** — only if the institute published new tabs for this term: quiz
      schedule, mid-term and end-term tabs, and (Terms 4–6) the elective allotment
      sheet. Old links whose tabs now hold the new term's rows can stay.
- [ ] **Subject / course representatives** — one per course, or one per course **per
      section** when a course is taught in several sections. Fine to add later.
- [ ] Optional: course outline links, grading schemes.

Then read the section for your jump: [Term 1 → 2 or 2 → 3](#term-1--2-and-term-2--3),
[Term 3 → 4](#term-3--4-first-year--second-year), or
[Term 4 → 5 or 5 → 6](#term-4--5-and-term-5--6).

---

## Step 2 · Edit `config.gs`

Spreadsheet → **Extensions → Apps Script** → click **`config.gs`**.

1. **`THIS_TERM`**: `number` up by one; new `firstDay`, `lastDay`, `examWindows`,
   `termBreak`, `nextTermStart`.
2. **`COURSES`**: replace the list with the new term's courses.
3. **`DATA_SOURCES`**: any new links.
4. **`SUBJECT_REPS`**: **empty it**, then add the new reps when you have them (until
   then the app says "not published yet" — better than showing last term's).
5. **`COURSE_OUTLINES`**, **`COURSE_EVALUATION`**: new ones, or empty them.
6. **`SIT_IN_COURSES`**: **empty it**: `{ }`.
7. **`STUDENTS`**: only if the roster or sections changed.
8. **Turn on test mode** with your own roll and one friend's from another section:

   ```js
   var TEST_ONLY_FOR = ["MBA26901", "MBA26917"];
   ```

9. **💾 Save**, then **Deploy → Manage deployments → ✏️ → Version: New version →
   Deploy**.

> **Why test mode?** The moment you press Save, every student's next automatic run
> uses the new settings. With `TEST_ONLY_FOR` filled in, everyone else's run stops
> before touching anything — their calendars stay exactly as they were.

> 💻 **Have Node.js?** Before pasting, run `npm run check -- my-config.gs
> timetable.csv` (the office's sheet downloaded as CSV). It must end with
> `RESULT: READY`.

---

## Step 3 · Check the settings

Spreadsheet (reload it) → **📊 Tool Stats → ✓ Check settings**.

- Fix every **✖** line, Save, and run it again.
- The line **"From THIS_TERM.number = …"** shows what TermSync worked out: first or
  second year, the quiz/exam tags, the calendar term.
- The **KEPT / ignored** lines: your batch's *Year/Batch* rows and this term's quiz and
  exam rows must say **KEPT**; the other batch's and other terms' must say **ignored**.
- **"Timetable codes … NOT in COURSES"** lists codes to add to `COURSES`.
- **"Moving students over from …"** must name last term's calendar.

Then **📊 Tool Stats → Test timetable source**: `Format: MIRROR`, a non-zero number of
classes, and *"All classes fall inside this term's sync window."*

---

## Step 4 · Start the handover

**📊 Tool Stats → ▶ Start Term N handover** → **Yes**. The dialog says how courses
will be filled in. It loads the new timetable straight away and makes sure the
30-minute refresh is running. While test mode is on, only `TEST_ONLY_FOR` moves.

---

## Step 5 · Check it on yourself

1. Open your TermSync link → press **Sync now** (or wait up to 30 minutes).
2. Google Calendar: last term's calendar is crossed out; the new term's calendar has
   your new courses (and quizzes / exams once they're published).
3. Your friend in `TEST_ONLY_FOR` checks theirs.
4. **📊 Tool Stats → ✓ Enrolment pre-flight (every student)** must end with
   **"Clear for go-live"**. It checks the whole batch without touching any calendar.

Something wrong? Fix `config.gs`, Save, Deploy a new version, check again. Nobody
outside `TEST_ONLY_FOR` has been touched.

---

## Step 6 · Go live

```js
var TEST_ONLY_FOR = [];
```

**Save**, then **Deploy → Manage deployments → ✏️ → New version → Deploy**. Over the
next ~30 minutes everyone who uses TermSync moves across on their own. (Students who
never switched it on aren't signed up by this.)

Optional message to the batch:

```text
📅 TermSync has moved to Term 3. Your new calendar "IIM Sirmaur – Term 3" fills in
by itself within the hour — nothing to do. Last term's calendar is kept, crossed
out; hide or delete it whenever you like. Unofficial tool — the official timetable
always comes first.
```

---

## Term 1 → 2 and Term 2 → 3

Still first year: **courses come from each student's section.**

- **`COURSES`** = every core course of the new term. A student gets every course the
  timetable runs for **their section**, plus any course run for the whole batch at
  once (a row with no section).
- **Programme-only courses:** a course only MBA-TM students take gets
  `onlyFor: ["MBATM"]` (only rolls starting MBATM get it). Don't add `required: true`.
- **Sections reshuffled?** If the institute changed anyone's section, update
  `STUDENTS` — the section there is what decides their courses.
- **Subject reps:** first-year courses usually have one rep per section, so add one
  line per course per section: `ECO, A, NAME, ROLL` — `ECO, B, …`, and so on.

## Term 3 → 4 (first year → second year)

The big one: **courses become electives.** Setting `number: 4` switches TermSync to
second-year timetable rows ("2nd Year") and to electives by itself. You add:

- **`DATA_SOURCES.electivesSummary`** — the "Publish to web" link to the **Summary**
  tab of the institute's elective allotment sheet (a sheet with a *Summary* tab
  listing the courses, and one tab per course listing its students). With it, each
  student's electives — and their section in a split elective — are filled in for
  them. **Without it, students tick their own electives** — that works too.
- **`COURSES`** = every elective offered this term (codes as in the timetable).
- **Subject reps**: one per elective, or per section for an elective taught in
  several sections.
- **Roster:** same students; sections matter less now (they only matter for split
  electives, and the allotment sheet says which section). Keep `STUDENTS` up to date
  for names and the admin views.

Then the same Steps 2 – 6. In Step 5, the pre-flight reads every course tab of the
allotment sheet and lists anyone the sheet doesn't mention — they'll pick by hand.

> The elective sheet's layout has changed between years before. If the pre-flight
> says it can't read the course tabs, the sheet's shape has probably changed — see
> [CHANGING_THE_CODE.md](CHANGING_THE_CODE.md#if-the-institute-changes-a-sheets-layout).
> Meanwhile students can pick by hand: add `courseSelection: "pick"` (see the
> advanced lines in `THIS_TERM`).

## Term 4 → 5 and Term 5 → 6

Still second year, still electives. Usually a **new elective allotment sheet** is
published each term — put its Summary tab's link in `electivesSummary`. New
`COURSES`, new subject reps, same Steps 2 – 6.

---

## Reference: the standard tags

TermSync uses these automatically from `THIS_TERM.number`. You only need this table
if ✓ Check settings shows the institute writing a term in a way they don't catch —
then use the advanced lines in `THIS_TERM` to override.

| Term | Quiz/exam rows kept when they contain | …and none of |
|---|---|---|
| 1 | `TERM-I`, `TERMI`, `T-I`, `T-1` | `TERM-II`, `TERMII`, `T-II`, `TERM-III`, `TERMIII`, `T-III`, `TERM-IV`, `TERMIV`, `T-IV` |
| 2 | `TERM-II`, `TERMII`, `T-II`, `T-2` | `TERM-III`, `TERMIII`, `T-III` |
| 3 | `TERM-III`, `TERMIII`, `T-III`, `T-3` | — |
| 4 | `TERM-IV`, `TERMIV`, `T-IV`, `T-4` | — |
| 5 | `TERM-V`, `TERMV`, `T-V`, `T-5`, `T5` | `TERM-VI`, `TERMVI`, `T-VI`, `T-6`, `T6` |
| 6 | `TERM-VI`, `TERMVI`, `T-VI`, `T-6`, `T6` | — |

Timetable rows: Terms 1–3 keep `1STYEAR` / `ISTYEAR` and ignore `2NDYEAR` / `IIYEAR`;
Terms 4–6 keep `2NDYEAR` / `IIYEAR` / `2NDYR`. (Spaces and capitals never matter.)

## Notes

- **Ran "End term" last term?** Nothing special: ▶ Start handover lifts the
  end-of-term lock. Students whose automatic sync was switched off by End term resume
  when they next open TermSync.
- **Gave a calendar a name of your own** (`THIS_TERM.calendarName`)? Then TermSync
  can't guess last term's: fill in `PREVIOUS_TERM` with last term's name, calendar
  name and dates, exactly.
- **Never change `THIS_TERM.number` mid-term** — it moves everyone to a new calendar.
