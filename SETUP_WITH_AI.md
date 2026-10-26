# Setting up TermSync with an AI assistant

**For you (the student):** open a new chat with an AI assistant (ChatGPT, Claude,
Gemini, …) and send:

```text
Help me set up TermSync for my batch. I'm not a programmer.
The project is here: https://github.com/Aniketh896/TermSync
Start by reading its README.md and SETUP_WITH_AI.md, explain to me how it works,
then follow SETUP_WITH_AI.md exactly: ask me one question at a time, check
everything, and walk me through every click.
```

Moving to a new term? Same message, but end it with *"…follow part B."*
If the assistant can't open the link: GitHub page → **Code → Download ZIP** → attach it.

Everything below is written for the AI.

---

# Instructions for the AI assistant

You're helping a student at IIM Sirmaur run **TermSync** — created by Aniketh Hotagi —
for their batch: a Google Apps Script web app that puts each student's timetable into
their own Google Calendar and keeps it up to date. Assume the person is **not a
programmer**. Your job, in order:

**explain → collect the facts → confirm them → write `config.gs` → check it →
guide the setup → verify it works.**

Don't skip or merge steps. Each one ends with a **gate**; don't pass a gate until it's
met.

### Files to read first

Read `README.md`, `app/config.gs` (the template — every setting is explained in its
comments), `docs/SETUP.md`, `docs/NEW_TERM.md` and `docs/TROUBLESHOOTING.md`. You don't
need `app/code.gs` or `app/Index.html` for setup.

If you were given only the GitHub link and can't browse the repository, open these
directly:

- https://raw.githubusercontent.com/Aniketh896/TermSync/main/README.md
- https://raw.githubusercontent.com/Aniketh896/TermSync/main/app/config.gs
- https://raw.githubusercontent.com/Aniketh896/TermSync/main/docs/SETUP.md
- https://raw.githubusercontent.com/Aniketh896/TermSync/main/docs/NEW_TERM.md
- https://raw.githubusercontent.com/Aniketh896/TermSync/main/docs/TROUBLESHOOTING.md

If you can't read them either, say so and ask the student to download the ZIP and
attach it. Never work from memory or guesses about these files.

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
6. **Keep the credits** — never remove "Created by Aniketh Hotagi" or the footer
   credit.
7. **Be honest about checks.** Never say something was tested or verified unless it
   actually was. If you couldn't run a check, say so plainly.
8. **The app's own checks win.** When ✓ Check settings disagrees with you, it's right —
   it reads the real sheets.

---

## Part A · First-time setup

### A1 · Explain (2 minutes)

Start by explaining TermSync in your own words, in under 200 words, from the README:
what students get, the two 30-minute timers (the institute fetch running as the
maintainer; each student's own sync), where the data comes from, and what they — the
maintainer — will do today. Then ask if they have questions.

Then ask: *"Is this a first setup, or is TermSync already running and you're moving to
a new term?"* New term → **Part B**. Something broken → **Part C**. Handing over →
**Part D**. Changing how it works → **Part E**.

### A2 · Before we start

Confirm, one at a time:

1. They have their **@iimsirmaur.ac.in** account and a laptop with Chrome.
2. Their account has **view access to the PGP office's timetable spreadsheet** (one
   row per class; columns like *Date, Day, StartTime, EndTime, Year/Batch, Code, Grp,
   Faculty, Classroom*). If not, they ask the office or the previous maintainer to
   share it as Viewer. You can still prepare `config.gs` meanwhile.
3. *Optional but very useful:* a copy of that sheet as CSV (open it → **File →
   Download → Comma-separated values**). With it you can read the exact course codes
   and Year/Batch values instead of asking, and run the dry run in A5. It contains
   faculty names, not student data.

### A3 · Collect the facts

Ask in this order. Format: **what to ask** — *where they find it* → what you write.
Items marked ★ are required.

**About them**

1. ★ **Their full name and roll number**; their LinkedIn link (optional).
   → `MAINTAINER.name`, `MAINTAINER.roll` (upper case, e.g. `MBA26017`),
   `MAINTAINER.linkedin` (full `https://…` link or `""`).

**About the term**

2. ★ **Batch years** (e.g. 2026–2028) → `THIS_TERM.batch` = `"Batch 26-28"`.
3. ★ **Which term (1–6)?** → then set, without asking:
   - `name` = `"Term 2"`; `academicCalendarTerm` = `"Term II"`
   - `calendarName` = `"IIM Sirmaur – Term 2"` (long dash –, not a hyphen) — offer it,
     let them change it
   - `termTags` / `ignoreTermTags` — that term's row of the table in
     `docs/NEW_TERM.md` → *The tags for each term*
   - `yearTags` / `ignoreYearTags` — Terms 1–3 first year, 4–6 second year (same page)
   - `courseSelection` — `"section"` for Terms 1–3; for 4–6, `"electives"` if they'll
     have the allotment link (question 11), else `"pick"`
4. ★ **The term's dates** — *the official academic calendar; ask them to paste their
   term's rows or a screenshot.*
   - `firstDay` = one to two weeks before the first class
   - `lastDay` = about three weeks after the last end-term exam
   - `examWindows`, `termBreak`, `nextTermStart` (`"YYYY-MM-DD"`). If exam dates aren't
     out, use their best estimate and note it for later.

**Where the data comes from**

5. ★ **The office's timetable spreadsheet link** — *open it, copy the link from the
   address bar (contains `/spreadsheets/d/`)* → `DATA_SOURCES.timetableSheet`.
   **And the tab's name** (bottom of the sheet, usually "Timetable") → `timetableTab`.
6. ◆ **Published links to the quiz schedule and the mid-term / end-term tabs** —
   *the previous maintainer, the SAC or the exam cell usually has them; they contain
   `/d/e/2PACX-`* → `quizSchedule`, `midTermSchedule`, `endTermSchedule`. A normal
   `/spreadsheets/d/…/edit` link doesn't work for these — the sheet's owner must use
   File → Share → Publish to web for that tab.
7. ○ **Other published links**: academic calendar, course catalogue, OLT marks
   record → `academicCalendar`, `courseCatalogue`, `marksStatus`. Blank is fine.

**People and courses**

8. ★ **The roster** (offer the privacy choice first) — *the institute's roll number /
   section list: select the Roll No, Name and Section columns, copy, paste.*
   → `STUDENTS`, one `ROLL, NAME, SECTION` per line (tabs fine). Tell them the count
   and the count per section; ask if that's right. Their own roll must be there.
9. ★ **This term's courses** — *the timetable's Code column (or the CSV), the course
   outlines, or the course catalogue.* For each: code (exactly as in the timetable),
   full name, area, credits → `COURSES`. If you have the CSV, list the codes used by
   their batch's rows and ask only for names and credits.
   Ask: *"Are any courses only for MBA-TM (or another programme)?"* → `onlyFor:
   ["MBATM"]` on those. In `"section"` mode never add `required: true`.
10. ◆ **The SAC team** — rolls, and who's the point of contact → `SAC_TEAM` lines
    `ROLL, poc` / `ROLL, member`. (Their own roll is added automatically.)
11. Second year only, ★ if `courseSelection` is `"electives"`: **the published link
    to the "Summary" tab of the elective allotment sheet** → `electivesSummary`.
12. ○ **Subject reps** (code, section or `-`, name, roll) → `SUBJECT_REPS`; ○ **course
    outline links** → `COURSE_OUTLINES`; ○ **grading schemes** (from each outline's
    evaluation table, adding up to 100) → `COURSE_EVALUATION`. Fine to skip today.

Leave `INSTITUTE` as it is, `PREVIOUS_TERM` blank, `TEST_ONLY_FOR` `[]` and
`SIT_IN_COURSES` empty for a first install.

### A4 · Confirm — gate 1

Show a short summary table: every ★ and ◆ item with its value (for the roster, just
"N students: A:…, B:…"), and anything still missing. Ask: *"Is all of this right?"*

**Gate 1:** every ★ item has a real value from the student, and they've confirmed
the summary. Otherwise go back to A3 for what's missing.

### A5 · Write `config.gs` and check it — gate 2

Write the **complete** file: the template from `app/config.gs` with every comment
kept and only the values changed. Then check it:

**If you can run code** (a terminal or code tool with Node.js):
1. Get the repository (`git clone https://github.com/Aniketh896/TermSync`, or the
   ZIP), then `npm install` and **`npm test`** — it must end with "All … test files
   passed".
2. Save the new file (e.g. `my-config.gs`) and run
   **`npm run check -- my-config.gs`**, or, with their timetable CSV,
   **`npm run check -- my-config.gs timetable.csv`** — which also runs the fetch and
   works out every student's calendar.
3. It must end with **`RESULT: READY`**. Fix every ✖ line and run it again. Read the
   ⚠ lines and the KEPT / ignored lines; fix what's wrong.

**If you can't run code**, check by hand and tell the student that's what you did:
- [ ] Only values changed; all comments kept; the `EXMPL1` / `EXMPL2` courses gone.
- [ ] Every `"` closed; brackets balanced; text blocks (`STUDENTS`, `SAC_TEAM`,
      `SUBJECT_REPS`) open and close with one backtick each and contain no other.
- [ ] Dates are real `"YYYY-MM-DD"`; `firstDay` < `lastDay`; every class date you know
      of lies between them.
- [ ] `calendarName` has the long dash (–).
- [ ] `MAINTAINER.roll` is in `STUDENTS`; every `SAC_TEAM` and `SUBJECT_REPS` roll is too.
- [ ] Every course code you saw in the timetable is in `COURSES`.
- [ ] No value you made up.

**Gate 2:** `RESULT: READY` (or every box above ticked, *and* you've told them the
automatic check couldn't be run — in which case gate 3 is the real check). Only then
give the final `config.gs`, in one code block, and tell them to save a private copy.

### A6 · Guide the setup

Walk through `docs/SETUP.md` **from Step 2**, one step at a time. After each, ask what
they see; don't move on until it matches. Watch for:

- **Step 4 — files:** rename the default `Code.gs` to `config` and paste their
  `config.gs`; then add `code`, then `Index` (exact name), then `appsscript.json`.
  `config.gs` must be above `code.gs` in the list.
- **Step 5 — permissions:** Google's "unsafe" warning is normal for a personal script.
- **Step 6 — ✓ Check settings:** ask them to paste the whole log. Fix every ✖ (give the
  exact `config.gs` change); check the KEPT / ignored lines; repeat until there's no ✖.
- **Step 7 — fetch:** on failure, ask for the log and use `docs/TROUBLESHOOTING.md`.
- **Step 8 — sharing:** General access → IIM Sirmaur → **Viewer**; untick
  download/print/copy.
- **Step 9 — publish:** *Execute as:* **User accessing the web app**; *Who has access:*
  **Anyone within IIM Sirmaur**.

### A7 · Verify it works — gate 3

All four must be true. Ask for each result:

1. **✓ Check settings** shows **no ✖** lines.
2. **Test timetable source** says `Format: MIRROR`, a non-zero number of classes, and
   "All classes fall inside this term's sync window".
3. **✓ Enrolment pre-flight** ends with **"Clear for go-live"**.
4. Their own TermSync calendar has the right classes, and quizzes / exams if those
   links are set. Ideally a friend from another section checks theirs too.

**Gate 3:** all four confirmed. Only now is the setup done. If any fails, fix it with
`docs/TROUBLESHOOTING.md` and check again.

### A8 · Go live

Give them the message in `docs/SETUP.md` → Step 11 with their link filled in. Remind
them how to change a setting later (README → *Changing a setting later*: edit
`config.gs` → Save → Deploy a new version → ✓ Check settings), and to come back with
*"part B"* for the next term.

---

## Part B · Moving to a new term

Follow `docs/NEW_TERM.md`. Same shape as Part A: explain what will happen (old
calendar crossed out and kept, new one built, nobody has to act) → collect → confirm →
write → check → guide → verify.

1. Ask them to paste their **current** `config.gs` (Apps Script → `config.gs` → select
   all → copy). They may replace the `STUDENTS` lines with `…` first; then say exactly
   where to put them back.
2. Collect, one at a time: the new term number; its dates; the new courses; any new
   published links (and, Term 3 → 4, the elective allotment link); roster changes;
   subject reps (or "not yet"); outlines / grading (optional).
3. Confirm the summary (gate 1).
4. Write the new file:
   - `PREVIOUS_TERM` ← the current `THIS_TERM`'s `name`, `calendarName` (character for
     character), `firstDay`, `lastDay`.
   - `THIS_TERM`: new name, **new** `calendarName`, dates, tags from the table,
     `academicCalendarTerm`, exam windows / break / next start. Term 3 → 4: second-year
     `yearTags` and `courseSelection: "electives"` (`docs/NEW_TERM.md` → *First year →
     second year*).
   - `COURSES` replaced; `SUBJECT_REPS` emptied or new; outlines / grading new or
     emptied; `SIT_IN_COURSES` emptied.
   - `TEST_ONLY_FOR` = their roll and a friend's from another section.
5. Check it (gate 2, as in A5).
6. Guide them through `docs/NEW_TERM.md` Steps 2.5 → 5.
7. **Gate 3:** ✓ Check settings has no ✖; their own old calendar is crossed out and the
   new one is right; the pre-flight says "Clear for go-live". **Only then** Step 6:
   `TEST_ONLY_FOR = []` → Save → Deploy a new version.

## Part C · Something isn't working

1. Ask for the output of **✓ Check settings** (or `checkSettingsLog` in the editor).
2. Ask what exactly they — or a student — see, and since when.
3. Use `docs/TROUBLESHOOTING.md`. For problems reaching students, also ask for
   **Institute fetch status** and MasterData cells K1/K2.
4. Fix settings in `config.gs`. Code changes only through Part E.

## Part D · Handing over to a junior

Follow `docs/PASSING_IT_ON.md`. The junior sets up their **own** copy with Part A; the
outgoing maintainer's copy keeps running for their own batch.

## Part E · Changing the code

Follow `docs/CHANGING_THE_CODE.md` and `AGENTS.md`: make the change, **`npm test`
must pass**, add a test for it, bump `BUILD_ID_`, test on themselves with
`TEST_ONLY_FOR`, then go live. If you can't run `npm test`, say so — and insist on test
mode before anyone else gets the change.
