# Troubleshooting

**Start here, every time:** spreadsheet → **📊 Tool Stats → ✓ Check settings**
(or, in the Apps Script editor, run `checkSettingsLog`). It catches most problems
and says which line of `config.gs` to fix.

Whatever breaks, **students keep the calendar they already have.** TermSync never
deletes anything because a sheet couldn't be read.

---

## Setting up

**"TermSync can't find its settings…"**
`config.gs` is missing, or it's below `code.gs` in the Apps Script file list. On the
left, click **⋮** next to `config.gs` → **Move file up** until it's above `code.gs`.
Save.

**The page is blank.**
The HTML file must be named exactly `Index` (capital I). Rename it, Save, and deploy a
new version.

**"Script function not found: doGet"**
`code.gs` didn't paste completely. Open it, select all, delete, paste again, Save.

**"You do not have permission to call…" / "Authorization is required"**
Run the function again and accept the permission screen (Advanced → Go to TermSync
(unsafe) → Allow).

**A red error mentioning `config.gs` and a line number when you press Save**
A comma, quote or bracket got deleted. Look at that line and the one above it. Text
must be inside `"…"`, and lines inside `{ … }` end with a comma (except the last).
Not sure? Paste the whole `config.gs` into your AI assistant and ask it to find the
mistake.

---

## The timetable

**"No timetable source is configured"**
Set `DATA_SOURCES.timetableSheet` in `config.gs` to the office's timetable spreadsheet
link (the one in your browser's address bar when you open it).

**"Timetable: … Exception: You do not have permission" / "not found"**
Your account can't open the office's sheet. Ask the PGP office to share it with your
@iimsirmaur.ac.in account (Viewer). The fetch runs as you, so it must be *your*
account.

**"no row matches THIS_TERM.yearTags"**
✓ Check settings lists every value in the sheet's `Year/Batch` column. Put a word from
your batch's value in `yearTags` (spaces and capitals don't matter): e.g. `Ist year`
→ `"ISTYEAR"`.

**"Timetable codes for your batch that are NOT in COURSES: …"**
Add those codes to `COURSES`, spelled exactly as listed.

**"⚠ … class(es) fall OUTSIDE this term's sync window"** (Test timetable source)
Widen `THIS_TERM.firstDay` / `lastDay` to cover every class, plus a few weeks after the
last exam.

**The fetch fails with "Parser sanity check failed"**
Fewer than 50 of your batch's classes fell inside this term's dates — usually the
dates in `THIS_TERM` are wrong, or the year tags pick up nothing. Nothing was
overwritten. Run **Test timetable source** to see what it read.

**MasterData K2 says "Class rows fell from X to Y — held back for one fetch"**
The office may be mid-edit. If the next fetch (30 minutes later) sees the same, it's
applied automatically. Nothing to do unless the drop is a mistake.

**The office can't share its sheet at all**
**📊 Tool Stats → Set up paste-in tabs**, then paste the timetable (with its header row)
over cell A1 of the `ManualTimetable` tab. Re-paste whenever it changes.

---

## Quizzes and exams

**A quiz or exam is missing from calendars**
1. Is it in the `QuizData` / `ExamData` tab? If not: ✓ Check settings shows every
   `Batch / Term` value in that tab and whether it was KEPT. Add a word from this
   term's value to `termTags`. If a neighbouring term's rows are being kept too, add a
   word from theirs to `ignoreTermTags`. ([Table of tags per term](NEW_TERM.md#the-tags-for-each-term))
2. If it *is* there, check the student's courses: quizzes match on course **and**
   section; exams on course only.

**"the link answered HTTP 401 / 404"**
That tab isn't published to the web. Whoever owns the sheet: **File → Share →
Publish to web** → choose that tab → **Publish**. Then copy the link it gives.

**"… is an ordinary spreadsheet link. It needs a 'Publish to web' link"**
Everything except the timetable needs the *published* link (it contains
`/d/e/2PACX-`). See the previous item.

---

## Students

**A student sees "Institute Account Required"**
They're signed in with a personal Google account. They need their
@iimsirmaur.ac.in one (or an Incognito window signed in with only that).

**A student's courses aren't filled in**
- Section mode: is their roll in `STUDENTS`, with a section? (✓ Check settings and the
  pre-flight list anyone without one.) Their section must match the timetable's `Grp`
  values (A, B, C, …).
- Electives mode: the pre-flight lists students the allotment sheet doesn't mention.
- Either way they can tick their courses by hand.

**A student's calendar shows nothing**
They must press **Enable Auto-Sync**, and the TermSync calendar must be ticked in
Google Calendar's left sidebar.

**One student stopped updating while everyone else is fine**
Their own automatic sync is gone (Google sometimes drops it). When they open TermSync
they'll see **"Automatic updates need repair"** — the button fixes it.

**Nobody has updated for hours**
**📊 Tool Stats → Institute fetch status**. If the trigger is missing, **Install
institute fetch trigger**. If the last run failed, the status says why.

**A student wants to stop but keep their timetable**
**Stop Auto-Sync… → Keep calendar, stop updates.** Only *Delete & stop* removes the
calendar.

**"Report a wrong entry" — where do reports go?**
🎛️ Admin → 🚩 Reports on the page (and the hidden `Reports` tab).

---

## Changes not showing up

**You changed `config.gs` but the page still shows the old values**
Saving reaches the background syncs; the page needs **Deploy → Manage deployments →
✏️ → Version: New version → Deploy**.

**Everyone says "being tested"**
`TEST_ONLY_FOR` still has rolls in it. Empty it (`[]`), Save, Deploy a new version.

**Students still see last term's calendar after a new term**
Did you run **▶ Start handover**, and is `PREVIOUS_TERM.calendarName` *exactly* last
term's calendar name (including the long dash –)? See [NEW_TERM.md](NEW_TERM.md).
