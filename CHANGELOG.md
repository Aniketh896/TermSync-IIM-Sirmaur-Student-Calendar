# Changelog

All notable changes to TermSync. Versions match `BUILD_ID_` in `app/code.gs`.

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
