# Moving your batch to the next term

Do this once per term: Term 1 → 2 → 3, then (second year) 4 → 5 → 6. It takes about
**30 minutes**, and **nobody in your batch has to do anything** — their calendars
move over by themselves.

Use the **same** spreadsheet and Apps Script project as last term. Don't start a new
one: keeping the same project keeps the same link, the same permissions and every
student's automatic sync.

> **With an AI assistant:** send it *"Help me move TermSync to the next term. The
> project is at https://github.com/Aniketh896/TermSync — read README.md and
> SETUP_WITH_AI.md, then follow part B."*

**When:** once the PGP office has put the new term's classes into its timetable
sheet — usually a few days before classes start.

---

## What happens for each student

On their next automatic run (within about 30 minutes of you going live):

1. Every TermSync event in last term's calendar is ~~crossed out~~. That calendar is
   **kept** — nothing is deleted. Students can hide or remove it themselves.
2. Their new term's courses are filled in for them — from their section (first
   year) or from the institute's elective allotment (second year).
3. A **new calendar** for the new term is built.

---

## Step 1 · Collect the new term's details

- [ ] The new term's **dates** (academic calendar): first class, exam weeks, term break.
- [ ] The new **course list**. (Not sure of the codes? Step 3 lists every code the
      timetable uses that isn't in your list yet.)
- [ ] New **links**, if the institute published new tabs: quiz schedule, mid-term and
      end-term schedules, elective allotment (second year). Old links to tabs that
      now hold the new term's rows can stay.
- [ ] Optional: subject reps, course outline links, evaluation schemes.

---

## Step 2 · Edit `config.gs`

Open Apps Script (spreadsheet → **Extensions → Apps Script**) → click **`config.gs`**.

**2.1 · Copy this term into `PREVIOUS_TERM` first.** Before changing anything else,
copy four values from `THIS_TERM` into `PREVIOUS_TERM`:

```js
var PREVIOUS_TERM = {
  name:         "Term 2",                  // ← THIS_TERM.name, as it is now
  calendarName: "IIM Sirmaur – Term 2",    // ← THIS_TERM.calendarName, exactly
  firstDay:     "2026-09-14",              // ← THIS_TERM.firstDay
  lastDay:      "2027-01-10"               // ← THIS_TERM.lastDay
};
```

Copy `calendarName` exactly — the dash in "IIM Sirmaur – Term 2" is a long dash (–),
and it must match character for character, or last term's events won't be crossed
out.

**2.2 · Update `THIS_TERM`:**

- `name`, and a **new** `calendarName` (e.g. `"IIM Sirmaur – Term 3"`)
- `firstDay`, `lastDay`
- `termTags`, `ignoreTermTags` — copy from [the table below](#the-tags-for-each-term)
- `academicCalendarTerm` (e.g. `"Term III"`)
- `examWindows`, `termBreak`, `nextTermStart`
- First year → second year? See [below](#first-year--second-year).

**2.3 · Update the per-term lists:**

- `COURSES` — the new term's courses (replace the old list)
- `DATA_SOURCES` — any new links
- `SUBJECT_REPS` — **empty it** until the new list is out (otherwise students see last
  term's reps)
- `COURSE_OUTLINES`, `COURSE_EVALUATION` — new ones, or empty them
- `SIT_IN_COURSES` — **empty it**: `{ }`
- `STUDENTS` — only if the roster or sections changed

**2.4 · Turn on test mode** with your own roll (and, ideally, one friend's from
another section):

```js
var TEST_ONLY_FOR = ["MBA26901", "MBA26917"];
```

**2.5 · Save** (💾), then **Deploy → Manage deployments → ✏️ → Version: New version
→ Deploy**.

> Why test mode? The moment you press Save, every student's next automatic run uses
> the new settings. With `TEST_ONLY_FOR` filled in, everyone else's run stops before
> touching anything — their calendars stay exactly as they were.

---

## Step 3 · Check the settings

In the spreadsheet (reload it first): **📊 Tool Stats → ✓ Check settings**.

- Fix every **✖** line, Save, and run it again.
- Look at the **KEPT / ignored** lines: this term's quiz and exam rows must say
  **KEPT**, last term's and the other batch's must say **ignored**.
- **"Timetable codes … NOT in COURSES"** lists course codes to add to `COURSES`.

Then **📊 Tool Stats → Test timetable source**: it should say `Format: MIRROR`, show a
non-zero number of classes, and say *"All classes fall inside this term's sync
window."*

---

## Step 4 · Start the handover

**📊 Tool Stats → ▶ Start Term 3 handover** → **Yes**.

This loads the new timetable straight away and makes sure the 30-minute refresh is
running. While test mode is on, only the rolls in `TEST_ONLY_FOR` move.

---

## Step 5 · Check it on yourself

1. Open your TermSync link → press **Sync now** (or wait up to 30 minutes).
2. In Google Calendar: last term's calendar is crossed out; the new term's calendar is
   there with your new courses, quizzes and exams.
3. Ask your friend in `TEST_ONLY_FOR` to check theirs.
4. **📊 Tool Stats → ✓ Enrolment pre-flight (every student)** must end with
   **"Clear for go-live"**. It checks the whole roster without touching anyone's
   calendar.

Something wrong? Fix `config.gs`, Save, Deploy a new version, and check again. Nobody
outside `TEST_ONLY_FOR` has been touched.

---

## Step 6 · Go live

```js
var TEST_ONLY_FOR = [];
```

**Save**, then **Deploy → Manage deployments → ✏️ → New version → Deploy**.

That's it. Over the next ~30 minutes everyone who uses TermSync is moved across on
their own. A student who never used it isn't signed up by this — they still choose
to.

Optional message to the batch:

```text
📅 TermSync has moved to Term 3. Your new calendar "IIM Sirmaur – Term 3" fills in
by itself within the hour — nothing to do. Last term's calendar is kept, crossed
out; hide or delete it whenever you like.
```

---

## First year → second year

Moving from Term 3 to Term 4 is the same as any other term, plus three changes in
`THIS_TERM`, because second-year courses are electives:

```js
courseSelection: "electives",
yearTags:       ["2NDYEAR", "IIYEAR", "2NDYR"],
ignoreYearTags: [],
```

and in `DATA_SOURCES`:

- `electivesSummary` — the published link to the **"Summary"** tab of the
  institute's elective allotment sheet (one tab per course, listing who's enrolled).
  Without it, students tick their electives by hand (that works too).

Then run **✓ Check settings** and **✓ Enrolment pre-flight** as usual. The pre-flight
lists anyone the allotment sheet doesn't mention.

> The elective sheet's layout has changed between years before. If the pre-flight
> says it can't read the course tabs, the sheet's shape has probably changed —
> see [CHANGING_THE_CODE.md](CHANGING_THE_CODE.md). Students can still pick by hand
> in the meantime (`courseSelection: "pick"`).

---

## The tags for each term

The quiz and exam sheets say which term a row belongs to in a **"Batch / Term"**
column, written in different ways ("MBA 2026-28, PhD26 T-II", "MBA & MBA-TM 2025-27
Term-V", "MBA, 2025-27 T-4"). TermSync keeps a row if it contains one of `termTags`
and none of `ignoreTermTags` (spaces and capital letters don't matter).

Short tags can hide inside longer ones — "T-I" is inside "T-II", "T-III" and "T-IV" —
which is what `ignoreTermTags` is for. These are a safe starting point:

| Term | `termTags` | `ignoreTermTags` |
|---|---|---|
| Term 1 | `["TERM-I", "TERMI", "T-I", "T-1"]` | `["TERM-II", "TERMII", "T-II", "TERM-III", "TERMIII", "T-III", "TERM-IV", "TERMIV", "T-IV"]` |
| Term 2 | `["TERM-II", "TERMII", "T-II", "T-2"]` | `["TERM-III", "TERMIII", "T-III"]` |
| Term 3 | `["TERM-III", "TERMIII", "T-III", "T-3"]` | `[]` |
| Term 4 | `["TERM-IV", "TERMIV", "T-IV", "T-4"]` | `[]` |
| Term 5 | `["TERM-V", "TERMV", "T-V", "T-5", "T5"]` | `["TERM-VI", "TERMVI", "T-VI", "T-6", "T6"]` |
| Term 6 | `["TERM-VI", "TERMVI", "T-VI", "T-6", "T6"]` | `[]` |

And for the timetable's **"Year/Batch"** column:

| Year | `yearTags` | `ignoreYearTags` |
|---|---|---|
| First year | `["1STYEAR", "ISTYEAR"]` | `["2NDYEAR", "IIYEAR"]` |
| Second year | `["2NDYEAR", "IIYEAR", "2NDYR"]` | `[]` |

**Always confirm with ✓ Check settings** — it lists every value it found in those
columns and whether it was KEPT or ignored. If the institute writes something new,
add a word from it.

---

## If you ran "End term" last term

Nothing special: **▶ Start handover** lifts the end-of-term lock by itself. Students
whose automatic sync was switched off by End term resume when they next open
TermSync.
