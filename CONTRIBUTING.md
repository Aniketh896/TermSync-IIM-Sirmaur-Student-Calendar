# Contributing to TermSync

Thanks for helping. TermSync is used by whole batches at once, so every change is
held to one rule: **it must not be able to break a student's calendar.**

## Ground rules

1. **No real people's data, ever** — no names, roll numbers, emails, or sheet / Drive
   ids of real people or institute documents, in code, tests, fixtures, comments,
   issues or pull requests. Use the invented batch in `tests/fixtures/`.
2. **Batch-specific values belong in `app/config.gs`**, never in `code.gs` or
   `Index.html`. A new setting needs a plain-English comment (what it is, where to
   find it, an example), must be optional (an older `config.gs` without it still
   loads), and must be checked by ✓ Check settings (`settingsReport_`).
3. **Never throw while the script loads** over a bad setting — report it with
   `settingsProblem_`. A load-time error fails every student's background sync.
4. **Don't change `app/appsscript.json`'s scopes.** It forces every student to
   re-authorise.
5. **Keep the credits and the disclaimer** in the code headers, footer, PDF, README
   and `DISCLAIMER.md`.

## Making a change

```sh
npm install
npm test          # must end with "All … test files passed"
```

- Add or update a test for every behaviour you change — usually in
  `tests/first_year_test.js`. `tests/harness.js` is an in-memory Google (calendar,
  sheets, triggers, published tabs) that runs the real `config.gs` + `code.gs`.
- Bump `BUILD_ID_` in `code.gs`. Bump `RESYNC_VERSION` if events change content,
  `CODE_VERSION` only if you change how events are matched or wiped.
- Add a line to `CHANGELOG.md`.
- Match the code around you: Apps Script V8, ES5-style `var` / `function`, internal
  names ending in `_`, comments that explain *why*. Public functions (no trailing
  `_`) can be called by any student from the page — admin-only ones must call
  `assertAdmin_()`.

See [docs/CHANGING_THE_CODE.md](docs/CHANGING_THE_CODE.md) for how a change reaches a
live batch safely, and [AGENTS.md](AGENTS.md) if you use an AI coding assistant.

## Pull requests

Describe what changed and why, how you tested it (on the invented batch, and on
yourself with `TEST_ONLY_FOR` if you run a live copy), and anything a maintainer must
do when updating (for example a new `config.gs` setting).
