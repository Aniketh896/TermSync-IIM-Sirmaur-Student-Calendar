# Changelog

All notable changes to TermSync. Versions match `BUILD_ID_` in `app/code.gs`.

## Unreleased — the pre-deploy gate

- `npm run verify`: one command to run after any change and before deploying —
  syntax of all four app files, unchanged permissions and web-app settings, every
  page → server call, menu item and timer still resolving, `BUILD_ID_` bumped, every
  test, and a dry run of `my-config.gs` + `timetable.csv` if present.
- Runs before every `git push` (installed by `npm install`) and on GitHub for every
  push and pull request. AI assistants are told not to call a change ready until it
  says VERIFIED.
- `timetable.csv` / `my-timetable.csv` are git-ignored.

## 2026-10-27a — reading the sheets, whatever the term or batch

- One set of reading rules for every sheet: sections ("Sec A", joint sessions
  "A & B" / "A, B" / "A and B" for any section letter on the roster), course codes
  matched ignoring case and punctuation, times ("2:00:00 PM", "14.00"), dates
  (weekday or month first), academic-calendar terms by number.
- Joint sessions in the timetable and in guest-lecture / feedback tabs become one
  class per section.
- Exams can be per section: an exam tab with a Section column gives each student only
  their own sitting (calendar, PDF and the picker's preview).
- Batch guard: a row naming another batch's years is never kept.
- More spellings of the year ("1st Year", "First Year", "Year 1", "II Year", …).
- Roll numbers of any programme are read from the elective tabs; `onlyFor` matches a
  whole programme prefix ("MBA" no longer also matches MBA-TM rolls).

## 2026-10-26a — first public release

TermSync, created by Aniketh Hotagi for Batch 2025–27, released for any IIM Sirmaur
batch to run for itself.

- Every batch- and term-specific value moved into `app/config.gs`; `code.gs` and
  `Index.html` hold no personal data.
- `THIS_TERM.number` (1–6) sets the term's name, calendar, quiz/exam tags, year tags
  and how courses are chosen; moving on a term is a new number, dates and courses.
- First-year **section mode**: each student's courses come from their roster section.
- `FEATURES`: switch off the admin dashboard, usage stats, usage log, subject reps,
  course outlines, PDF or wrong-entry reports.
- **✓ Check settings** and `npm run check`: plain-English checks of `config.gs` and
  the institute's sheets.
- A new term's first fetch clears last term's quizzes and exams.
- Guides for setup, new terms, handing over, troubleshooting and code changes, and
  `SETUP_WITH_AI.md` for setting up with an AI assistant.
