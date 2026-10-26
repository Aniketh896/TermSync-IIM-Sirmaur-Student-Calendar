# Changing how TermSync works

For changes to `code.gs` or `Index.html` — a new feature, a fix, or adapting to a
sheet whose layout changed. (For your batch's settings, you only ever need
`config.gs`; see [NEW_TERM.md](NEW_TERM.md).)

You don't have to be a programmer: AI coding assistants (Claude Code, Cursor,
ChatGPT, Gemini…) can make these changes. This page is the routine that keeps a change
from breaking anyone's calendar. AI assistants read it too (via
[AGENTS.md](../AGENTS.md)).

---

## Why care

**Pressing Save in Apps Script changes what every student's background sync runs —
immediately.** There's no "deploy to just me". A mistake in `code.gs` reaches the
whole batch within 30 minutes. Hence:

1. Test on your computer first (`npm test`).
2. Then test on yourself in Apps Script with `TEST_ONLY_FOR`.
3. Only then let the batch have it.

---

## One-time setup on your computer

1. Install **Node.js** (the "LTS" version) from https://nodejs.org.
2. Install **Google Chrome** if you don't have it (one of the tests opens the page in
   it; without Chrome that test is skipped).
3. Download this repository (Code → Download ZIP, or `git clone`).
4. Open a terminal in the folder and run:

   ```sh
   npm install
   ```

---

## The routine, every change

1. **Make the change** in `app/code.gs` and/or `app/Index.html`. If you use an AI
   assistant, give it the whole folder and describe what you want.
2. **Run the tests:**

   ```sh
   npm test
   ```

   It must end with **"All … test files passed."** Any FAIL means don't paste.
   (Tests run against `tests/fixtures/test.config.gs` — an invented batch — never
   your real settings.)
3. **Bump `BUILD_ID_`** near the top of `code.gs` — today's date plus a letter, e.g.
   `"2026-11-02a"`, then `"2026-11-02b"` for the next one that day.
4. **Turn on test mode:** in Apps Script → `config.gs` → `TEST_ONLY_FOR = ["<your roll>"]`.
5. **Paste** the changed files into Apps Script (select all, delete, paste) → **Save**.
6. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
7. **Check on yourself**: open TermSync, press Sync now, look at your calendar.
8. **Go live:** `TEST_ONLY_FOR = []` → Save → Deploy a new version again.

> admin → ⚙️ Tools → *Deployed build* warns you if you saved but forgot step 6.

### Two version numbers you may need

Also near the top of `code.gs`:

- **`RESYNC_VERSION`** — bump it (to today's date) if your change alters what events
  *look like* — titles, descriptions, colours. Every student's next sync updates just
  the changed events.
- **`CODE_VERSION`** — bump it only if you change how TermSync *recognises its own
  events* (`APP_TAG`, the `[TT_SIG:…]` line, title prefixes). Every student's calendar
  is wiped and rebuilt — heavy, so avoid it unless needed.

Neither is needed for a new term.

---

## Adding a test

If you fix a bug, add a check for it so it can't come back:

- `tests/first_year_test.js` — the whole flow, start to finish, on an invented first-year
  batch. Most new checks belong here.
- `tests/settings_test.js` — reading `config.gs`.
- `tests/page_test.js` — the page in a real browser.
- `tests/harness.js` — the pretend Google (calendar, sheets, triggers). Rarely needs
  changing.
- `tests/fixtures/` — the invented batch's settings and sheets. Regenerate the sheets
  with `node tests/fixtures/make_fixtures.js` after editing that script.

Never put real students' data in `tests/`.

---

## Keeping your copy, and sharing improvements

- Your **filled-in `config.gs` stays out of any public repository** — it holds real
  names and roll numbers. If you keep the project in git, save it as `my-config.gs`
  (already in `.gitignore`).
- Improvements to `code.gs` / `Index.html` that would help other batches are welcome:
  fork the repository on GitHub, make the change, run `npm test`, and open a pull
  request. Please keep the credits (the creator's name in the code headers, footer and
  PDF).

---

## If the institute changes a sheet's layout

The parts most likely to need code changes, and where they are in `code.gs`:

| Sheet | Function | It expects |
|---|---|---|
| Office timetable | `parseMirrorTimetable_` | a header row with `Date`, `Code`, `Year/Batch`, `Grp`, `Classroom` (plus `StartTime`, `EndTime`, `Faculty`, `Session#`) |
| Quiz schedule | `parseQuizCsv_` | a header row with `Course Code` and `Date`; `Batch / Term`, `Section`, `StartTime`, `End Time` |
| Mid / end-term schedule | `parseExamCsv_` | `Batch / Term`, `CourseCode`, `Date`, `Start Time`, `End Time` |
| Elective allotment | `getElectiveCatalogue_`, `getElectiveSectionMaps_` | a `Summary` tab (`Course Title, abbreviation, No of Students, # Section`) and one tab per course (`Roll No, Name, Email Id, [Section]`) |
| Academic calendar | `getAcademic_` | a header row `Term, Event, From_Date, …, To_date` |

The rules for reading a cell — sections, course codes, times, dates, term and year
tags, the batch guard — are shared by all of these and live together near the top
of `code.gs` ([HOW_IT_WORKS.md → The reading rules in the code](HOW_IT_WORKS.md#the-reading-rules-in-the-code)).
A new spelling usually needs a change there, not in a parser.

Give your AI assistant the new sheet's first few rows (with any personal data
removed) and the function name, and ask it to update the parser **and** add a check
with the new layout to `tests/`.
