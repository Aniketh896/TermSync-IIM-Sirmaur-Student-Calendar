# TermSync

**Your class timetable in your own Google Calendar — kept up to date by itself.**

Created by **[Aniketh Hotagi](https://www.linkedin.com/in/aniketh-hotagi/)** with the
**[SAC, IIM Sirmaur](https://www.linkedin.com/company/saciimsirmaur)**. Each batch
runs its own copy, looked after by one student from that batch — its **maintainer**.
This repository is everything a maintainer needs.

> 🤖 **AI assistants:** if someone asked you to help them set up or run TermSync,
> read this README, then follow **[SETUP_WITH_AI.md](SETUP_WITH_AI.md)** step by step.

<p align="center">
  <img src="docs/images/student-view.png" alt="TermSync on a phone: the term, the student's name, and their courses already selected from their section" width="340">
</p>

**On this page:** [What it does](#what-it-does) · [Set it up](#set-it-up) ·
[How it works](#how-it-works) · [What you change — and what you don't](#what-you-change--and-what-you-dont) ·
[Changing a setting later](#changing-a-setting-later) · [Your two years](#your-two-years-with-termsync) ·
[Files](#whats-in-this-folder)

---

## What it does

A student opens one link, signs in with their institute account, and presses
**Enable Auto-Sync**. That's all they ever do. From then on:

- A calendar named, say, **"IIM Sirmaur – Term 2"** appears in their Google Calendar,
  with every class of every course they take — the right section, room, instructor
  and session number.
- 📝 **Quizzes** (red), 📕 **mid-terms and end-terms** (blue) and 🎤 **guest lectures**
  (grey) are added too, each with its weight in the final grade when known.
- When the PGP office changes a room, a time or a date, their calendar changes too —
  usually within 30 minutes, at most about an hour. Nobody has to do anything.
- On the page: their subject reps, course outlines, grading schemes, the latest
  timetable changes, and a **PDF** of their whole term.

First-year students don't even pick their courses: TermSync fills them in from
their section. Second-years' electives come from the institute's allotment list.

---

## Set it up

**You don't need to know how to code.** You fill in one file of settings and click
through some Google screens. About 45 minutes, on a laptop.

You'll need:

- [ ] Your **@iimsirmaur.ac.in** Google account.
- [ ] **View access to the PGP office's timetable spreadsheet** (the one with one row
      per class). Ask the office to share it with your account as *Viewer*.
- [ ] Your batch's **roll number and section list**.
- [ ] Your term's **dates** (from the academic calendar).
- [ ] Recommended: the published links to the **quiz** and **exam schedule** tabs
      (ask the previous maintainer or the SAC).

### ⭐ Way 1 — with an AI assistant (recommended)

Works with ChatGPT, Claude, Gemini and similar. Open a new chat and send:

```text
Help me set up TermSync for my batch. I'm not a programmer.
The project is here: https://github.com/Aniketh896/TermSync
Start by reading its README.md and SETUP_WITH_AI.md, explain to me how it works,
then follow SETUP_WITH_AI.md exactly: ask me one question at a time, check
everything, and walk me through every click.
```

If your assistant can't open GitHub links, click **Code → Download ZIP** on this page,
unzip it, and attach the folder (or the ZIP) to the chat instead.

> **Privacy:** your settings include your batchmates' names and roll numbers. If you'd
> rather not give those to an AI service, tell it *"I'll paste the roster myself"*.

### Way 2 — by yourself

Follow **[docs/SETUP.md](docs/SETUP.md)** — every click in order, with what you should
see after each one.

---

## How it works

TermSync is a Google Apps Script — a small program that lives inside a Google Sheet
you own. There's no server, nothing to install and nothing to pay for.

### Two automatic timers

Everything happens on two timers. Both run every **30 minutes**, all day, by
themselves.

| | ① The institute fetch | ② Each student's sync |
|---|---|---|
| **Runs as** | You, the maintainer (the spreadsheet's owner) | Each student, in their own account |
| **Started by** | Itself, the first time you run the fetch during setup | The student pressing **Enable Auto-Sync** |
| **Reads** | The office's timetable sheet and the published quiz / exam tabs | TermSync's spreadsheet |
| **Writes** | TermSync's spreadsheet | That student's TermSync calendar — nothing else |
| **When nothing changed** | Writes nothing | Stops at once, without touching the calendar |

**An example.** At 10:05 the office moves Finance section B to another room.
- By about **10:30**, the next fetch reads the office's sheet, spots the change,
  updates the spreadsheet and logs it under 🛠️ Changes.
- By about **11:00**, each Finance-B student's own sync sees the timetable changed
  and moves that one event in their calendar. Nothing else in it is touched.

### What happens on each run

**① The institute fetch** (`fetchAndCleanAdminData`):
1. Reads the **office's timetable sheet** and keeps only your batch's rows (the
   *Year/Batch* column) for this term's dates.
2. Reads the **quiz and exam tabs** and keeps only this term's rows (the
   *Batch / Term* column).
3. Compares everything with what it stored last time. If anything changed, it saves
   the new data and bumps a "revision" number. If nothing changed, it stops there.
4. Records every change (room, time, date, instructor, a class added or removed) in
   the change log.

**② Each student's sync** (`backgroundSync`):
1. Checks the revision number. Same as last time → done (most runs end here).
2. Otherwise works out exactly which of that student's events should exist — their
   classes, quizzes, exams and guest lectures — compares them with their calendar,
   and adds, removes or updates only the differences.
3. Notes the revision it reached, and the changes, which the student sees on the page.

**Sync now** on the page runs ② immediately and also puts back any TermSync event the
student deleted by mistake. **Refresh from institute now** (spreadsheet menu) runs ①
immediately.

### Where the data comes from

| Source | Setting in `config.gs` | Needed? | Gives students |
|---|---|---|---|
| The PGP office's timetable spreadsheet (view access) | `DATA_SOURCES.timetableSheet` | **Required** | Classes; guest lectures and feedback sessions marked on them |
| Quiz schedule tab (published to the web) | `quizSchedule` | Recommended | 📝 Quizzes |
| Mid-term / end-term schedule tabs (published) | `midTermSchedule`, `endTermSchedule` | Recommended | 📕 Exams |
| Elective allotment "Summary" tab (published) | `electivesSummary` | Second year | Electives filled in for each student |
| Academic calendar tab (published) | `academicCalendar` | Optional | Exam weeks and term break in the PDF |
| Course catalogue, OLT marks record (published) | `courseCatalogue`, `marksStatus` | Optional | A course-list cross-check; ✅ when marks are on OLT |
| Your batch's roster | `STUDENTS` | **Required** | Names, and sections for first-year courses |
| Courses, subject reps, outlines, grading | `COURSES`, `SUBJECT_REPS`, `COURSE_OUTLINES`, `COURSE_EVALUATION` | Courses required; rest optional | Course names; the reps, outlines and evaluation pop-ups |

"Published to the web" means whoever owns that sheet chose *File → Share → Publish
to web* for that tab — the link then contains `/d/e/2PACX-…`.

### What gets filled in

**TermSync's spreadsheet** (you never edit these tabs — the fetch rewrites them):

| Tab | Holds |
|---|---|
| `MasterData` | This term's classes for your batch. Cells K1/K2 note anything the last fetch couldn't read |
| `QuizData`, `ExamData`, `EndTermData` | This term's quizzes, mid-terms, end-terms |
| `GuestData`, `FeedbackData` | Guest lectures, and the sessions where feedback is collected |
| `ChangeLog` | Every change the office made, with the time it was noticed |
| `Usage`, `Reports` *(hidden)* | Who uses TermSync, and "wrong entry" reports from students |

**Each student's calendar:**

| Event | Title looks like | Colour |
|---|---|---|
| Class | `FIN (A): Finance Basics` | One colour per course |
| Quiz | `📝 ECO Quiz 1 — Economics for Managers (part of 20%)` | Red |
| Exam | `📕 STAT Mid-Term Exam — Statistics (40%)` | Blue |
| Guest lecture | `🎤 LEAD Guest Lecture — Leadership Lecture Series` | Grey |

Each event's location is the room (`IIM Sirmaur | LH-1`); its description has the
instructor, session, section, exam instructions, and — on the class where it happens —
the course-feedback link. Students can add a reminder before every event (5 min to
1 hour).

### When something goes wrong

- A sheet can't be read → **nothing is deleted**; everyone keeps what they had until
  it can be read again.
- The timetable suddenly loses lots of classes (the office mid-edit) → the change
  waits one fetch to be sure.
- The dates look wrong (most rows' dates disagree with their *Day* column) → the
  whole read is refused.
- Google slows a student's sync down → it finishes on the next run. Students see
  "still finishing", never an error.

### Privacy and permissions

- The web app runs **as the student using it**, so it writes to their calendar with
  their own permission. Nobody's password is stored; nobody else's calendar is touched.
- Students need **view** access to TermSync's spreadsheet (their sync reads it as
  them). Hidden tabs are hidden, not secret — keep nothing else sensitive there.

More: everything in the admin menu, and the code's design, in
**[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**.

---

## What you change — and what you don't

| | What | When |
|---|---|---|
| ★ **You must fill in** | In `app/config.gs`: `THIS_TERM`, `MAINTAINER`, `DATA_SOURCES.timetableSheet`, `COURSES`, `STUDENTS` | First setup, and the term-specific ones every term |
| ★ **You must fill in, every new term** | `PREVIOUS_TERM` (last term's details), a new `THIS_TERM`, the new `COURSES` | See [docs/NEW_TERM.md](docs/NEW_TERM.md) |
| ◆ **You should fill in** | The quiz / exam links, `SAC_TEAM` | When you have them |
| ○ **You may fill in** | Subject reps, course outlines, grading schemes, other links, test mode, sit-ins | Any time |
| ✓ **Already filled in** | `INSTITUTE` (domain, OLT and SAC links) | Leave it |
| ✋ **Never change** | `app/code.gs`, `app/Index.html`, `app/appsscript.json`; the *names* of settings in `config.gs` (only their values); the web-app setting *Execute as: User accessing*; the tabs of TermSync's spreadsheet | — |

Every setting in `config.gs` is labelled ★ / ◆ / ○ and has a note saying what it is
and where to find it. To change *how TermSync works* (not just your settings), see
[docs/CHANGING_THE_CODE.md](docs/CHANGING_THE_CODE.md).

---

## Changing a setting later

1. Spreadsheet → **Extensions → Apps Script** → click **`config.gs`** → make the change.
2. **💾 Save**, then **Deploy → Manage deployments → ✏️ → Version: *New version* →
   Deploy**. (Save updates the timers at once; Deploy updates the page.)
3. Spreadsheet → **📊 Tool Stats → ✓ Check settings**. Fix anything marked ✖.

---

## Your two years with TermSync

| When | What you do | Guide |
|---|---|---|
| First time | Set it up once | [docs/SETUP.md](docs/SETUP.md) |
| Each new term (1 → 2 → 3, then 4 → 5 → 6) | Update `config.gs`, test on yourself, move everyone over. Your batch does nothing. | [docs/NEW_TERM.md](docs/NEW_TERM.md) |
| First year → second year | Same as a new term, plus switching to electives | [docs/NEW_TERM.md](docs/NEW_TERM.md#first-year--second-year) |
| Before you graduate | Help a junior set up their own copy | [docs/PASSING_IT_ON.md](docs/PASSING_IT_ON.md) |
| Something looks wrong | Run **✓ Check settings** first | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |

---

## What's in this folder

| File | What it is | Edit it? |
|---|---|---|
| `app/config.gs` | **Your settings** | **Yes — only this one** |
| `app/code.gs` | The app (runs on Google's side) | No |
| `app/Index.html` | The page students see | No |
| `app/appsscript.json` | The permissions it asks for | No |
| `SETUP_WITH_AI.md` | The script an AI assistant follows to help you | No |
| `docs/` | The guides | — |
| `tests/` | Automatic checks (`npm test`), and `npm run check` for a filled-in `config.gs` | Only if you change the code |

When a newer version comes out, replace `code.gs` and `Index.html`, and keep your
`config.gs`.

**For anyone on a computer with [Node.js](https://nodejs.org):** `npm install`, then
`npm test` checks the app, and `npm run check -- my-config.gs timetable.csv` checks
a filled-in `config.gs` against a downloaded copy of the office's timetable before
you paste it anywhere.

---

## Credits and licence

Created by **[Aniketh Hotagi](https://www.linkedin.com/in/aniketh-hotagi/)** with the
**[SAC, IIM Sirmaur](https://www.linkedin.com/company/saciimsirmaur)**. The app's
footer and PDFs credit the SAC, your batch's maintainer and its creator — please keep
those credits.

[MIT licence](LICENSE). TermSync is an unofficial, student-built tool: the
institute's official timetable is always the final word.
