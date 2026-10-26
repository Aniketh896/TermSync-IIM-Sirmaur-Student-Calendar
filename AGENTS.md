# Notes for AI coding assistants

TermSync, created by Aniketh Hotagi: a Google Apps Script web app that syncs IIM
Sirmaur students' timetables into their own Google Calendars. No build step, no
server; the four files in `app/` are pasted by hand into an Apps Script project bound
to a Google Sheet.

**If the user wants to set TermSync up, move to a new term, or fix their settings,
follow [SETUP_WITH_AI.md](SETUP_WITH_AI.md).** The person is most likely not a
programmer. Everything below is for changing the code.

## Layout

| Path | Role |
|---|---|
| `app/config.gs` | Every batch/term setting, as plain values. The template ships with placeholders and must stay free of real people's data. |
| `app/code.gs` | All server logic (~11k lines). Its top section maps `config.gs` onto internal names (`TERM_CONFIG_`, `PREVIOUS_TERM_`, `STUDENT_ROSTER_`, `COURSE_INFO_`, `SAC_ROLES_`, `*_CSV_URL`, …). |
| `app/Index.html` | The whole client (markup, CSS, JS). Holds no batch data — it gets `health.site`, `health.specialRoles`, `health.subjectReps` from the server. |
| `app/appsscript.json` | Manifest. **Do not change its scopes**: changing them forces every student to re-authorise. |
| `tests/` | `npm test` — node harnesses running the real `config.gs` + `code.gs` in a vm against an in-memory Google (`harness.js`), plus one Puppeteer page test. Fixtures in `tests/fixtures/` are invented. |
| `docs/` | Guides for maintainers. `HOW_IT_WORKS.md` → "Under the hood" is the architecture. |

## Commands

- `npm test` — every test; must pass before a change is done.
- `npm run check -- <config.gs> [timetable.csv]` — validates a filled-in `config.gs`
  (syntax, settings, and with a CSV of the office timetable a full offline fetch +
  every-student pre-flight). Ends with `RESULT: READY` or `RESULT: NOT READY`.

## Rules

- **`npm test` must pass** before any change is called done. Add a check for every
  behaviour you change or fix, usually in `tests/first_year_test.js`.
- **Batch-specific values belong in `config.gs`**, never hardcoded in `code.gs` or
  `Index.html`. A new setting: add it to `config.gs` with a plain-English comment
  (what it is, where to find it, an example), read it in the settings section at the
  top of `code.gs` through `CFG_` / `settingText_` etc. so an older `config.gs` without
  it still loads, and report bad values with `settingsProblem_` and in
  `settingsReport_` — **never throw** at load time over a value (a load-time throw
  fails every student's background sync).
- **Never put real people's data** (names, roll numbers, emails, sheet or Drive ids)
  in this repository — not in `config.gs`, tests, fixtures or comments.
- **Keep the credits**: "Created by Aniketh Hotagi" in the file headers,
  `CREATOR_CREDIT_` in `code.gs`, the footer and PDF credit in `Index.html`.
- **Saving in Apps Script is a release** — every student's trigger runs the saved
  code immediately. Remind the user to bump `BUILD_ID_`, use `TEST_ONLY_FOR`, then
  paste, Save, and Deploy a new version (`docs/CHANGING_THE_CODE.md`).
- `RESYNC_VERSION`: bump for changes to event content. `CODE_VERSION`: bump only for
  changes to how events are matched/wiped (forces a full rebuild for everyone).
- Functions without a trailing `_` are callable by any student via
  `google.script.run`; admin-only ones must call `assertAdmin_()`.
- Match the surrounding code's style: ES5-style `var`/`function` in `code.gs` (Apps
  Script V8, no modules), comments that explain *why*.
