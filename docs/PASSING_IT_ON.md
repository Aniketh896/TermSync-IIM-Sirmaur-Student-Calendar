# Passing TermSync on to the next batch

TermSync works batch by batch: **each batch runs its own copy**, set up and owned by
one of its own students — the maintainer. When your juniors arrive, one of them sets
up their copy for their batch, while yours keeps running for yours until you
graduate.

This is how TermSync has been passed down since it was created by
[Aniketh Hotagi](https://www.linkedin.com/in/aniketh-hotagi/) for Batch 2025–27.

---

## Why a new copy, not yours

- **The copy belongs to an account.** The 30-minute refresh runs as the account that
  owns the spreadsheet. When you graduate, your institute account goes, and so does
  your copy.
- **Your batch needs yours until the end.** Your copy is set to your batch's term,
  roster and calendar names; the juniors need theirs set to their own.
- **Ownership transfer is fragile.** Moving a live copy to another account means
  re-creating its timer and re-deploying, and every student's link changes anyway. A
  fresh copy is simpler and cleaner.

---

## Checklist for the outgoing maintainer

**When your juniors arrive (their Term 1 or 2):**

- [ ] Pick a junior who's happy to look after it — ideally with the SAC.
- [ ] Send them the link to this repository and the [README](../README.md).
- [ ] Introduce them to whoever at the PGP office shares the timetable sheet, so they
      get **view access** for their own account.
- [ ] Share with them the **published links** you already use for the quiz, exam and
      academic calendar tabs — those sheets usually cover both years, so the same
      links work for them with their own year's tags.
- [ ] Do **not** send them your filled-in `config.gs` as is — it holds your batch's
      roster. If it helps, send a copy with `STUDENTS`, `SAC_TEAM`, `SUBJECT_REPS`
      and `SIT_IN_COURSES` emptied.
- [ ] Be around for their first setup (it's about 45 minutes; see
      [SETUP.md](SETUP.md)).

**If you improved the code** during your time, put your improved `code.gs` and
`Index.html` into the repository (or your fork of it) before you hand over, so your
junior starts from the best version. Never put a filled-in `config.gs` there.

**When your batch's last term ends:**

- [ ] Spreadsheet → **📊 Tool Stats → End term**. Your batch's calendars are crossed
      out as a final record, and the refresh stops.
- [ ] Optional: after a few weeks, delete the web-app deployment and the spreadsheet.

---

## Checklist for the new maintainer

- [ ] Read the [README](../README.md).
- [ ] Get **view access** to the office's timetable sheet for your institute account.
- [ ] Set up your own copy: [SETUP.md](SETUP.md), or with an AI assistant using
      [SETUP_WITH_AI.md](../SETUP_WITH_AI.md).
- [ ] Put your own name, roll and LinkedIn in `MAINTAINER` — the footer reads
      "TermSync by SAC × *your name*". Please keep the "created by" credit.
- [ ] Each new term: [NEW_TERM.md](NEW_TERM.md).
- [ ] Before you graduate: this page, from the top.

---

## Keeping a copy of your settings

Your filled-in `config.gs` lives in Apps Script, which is enough to run. It's still
worth keeping a copy on your own computer (named, say, `my-config.gs`), so a
broken paste can be undone. Keep that copy private — it has your batchmates' names
and roll numbers.
