# TermSync

**Your class timetable, in your own Google Calendar — and kept up to date by itself.**

TermSync is a small web app for IIM Sirmaur students. A student opens one link,
signs in with their institute account, and presses one button. From then on their
classes, quizzes, mid-terms, end-terms and guest lectures sit in their Google
Calendar, and whenever the PGP office changes a room, a time or a date, their
calendar changes too — usually within half an hour, with nobody doing anything.

**Created by [Aniketh Hotagi](https://www.linkedin.com/in/aniketh-hotagi/)**
(Batch 2025–27) with the SAC, IIM Sirmaur. Each batch has its own **maintainer** —
one student who sets it up for their batch and looks after it. This repository is
everything a maintainer needs.

<p align="center">
  <img src="docs/images/student-view.png" alt="TermSync on a phone: the student's term, their courses, already selected from their section" width="360">
</p>

---

## Is this for you?

You're in the right place if you are a student at IIM Sirmaur and you want to run
TermSync for **your** batch — for example a first-year batch setting it up for
Term 1, 2 or 3, and then carrying on through the second year.

**You do not need to know how to code.** Setting it up means filling in one file of
settings (your term's dates, your batch's roster, a few links) and clicking through
Google's screens. An AI assistant can do the filling-in for you by asking you
questions — see below.

What you need:

- [ ] Your **@iimsirmaur.ac.in** Google account.
- [ ] **View access to the PGP office's timetable spreadsheet** (the one with a row
      per class). Ask the office to share it with your account as *Viewer*.
- [ ] Your batch's **roll-number and section list** (a spreadsheet the institute
      circulates).
- [ ] Your term's **start and end dates** (from the academic calendar).
- [ ] About **45 minutes**, on a laptop.
- [ ] Optional: the published links to the **quiz schedule** and **mid-term / end-term
      schedule** tabs (these add quizzes and exams to calendars).

---

## Set it up — pick one way

### ⭐ Way 1: let an AI assistant walk you through it (recommended)

Works with ChatGPT, Claude, Gemini or any similar assistant.

1. On this page, click the green **Code** button → **Download ZIP**. Unzip it.
2. Open your AI assistant and **attach the whole unzipped folder** (or the ZIP file,
   or paste this repository's link if your assistant can read GitHub links).
3. Copy this message and send it:

   ```text
   I want to set up TermSync for my batch. I am not a programmer.
   Please read SETUP_WITH_AI.md in the files I attached and follow it exactly:
   ask me one question at a time, then give me my finished config.gs and walk me
   through every click of the setup.
   ```

4. Answer its questions. At the end you'll have your own working TermSync link.

> **About privacy.** Your roster (names and roll numbers) ends up in `config.gs`. If
> you'd rather not give your batchmates' names to an AI service, tell the assistant
> "I will paste the roster myself" — it will leave that part for you to paste
> straight into Apps Script.

### Way 2: do it yourself, step by step

Follow **[docs/SETUP.md](docs/SETUP.md)** — every click, in order, with what you
should see after each step.

---

## How it works, in one picture

```
  PGP office's timetable sheet  ─┐
  + quiz & exam schedule tabs   ─┤   every 30 minutes, TermSync (running as YOU,
                                 ├─► the maintainer) copies them into its own
                                 │   spreadsheet — and notices what changed
                                 ▼
               TermSync's spreadsheet
                                 │   every 30 minutes, EACH student's own copy of
                                 ├─► TermSync updates THEIR calendar — but only if
                                 ▼   something actually changed
        "IIM Sirmaur – Term 2" calendar in every student's Google account
```

- There is **no server** and nothing to pay for. TermSync is a Google Apps Script
  attached to a Google Sheet you own.
- Each student's calendar is changed **by their own account**, with their own
  permission. Nobody's password or calendar is shared with anyone.
- If the office's sheet ever can't be read, nothing is deleted: everyone keeps what
  they had until it can be read again.

More detail, including everything in the admin menu: **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**.

---

## Your two years with TermSync

| When | What you do | Guide |
|---|---|---|
| First time (any term) | Set it up once | [SETUP.md](docs/SETUP.md) |
| Every new term — Term 1 → 2 → 3, and then 4 → 5 → 6 | Change `config.gs`, test it on yourself, move everyone over. Nobody in your batch has to do anything. | [NEW_TERM.md](docs/NEW_TERM.md) |
| First year → second year (Term 3 → 4) | Same as a new term, plus switching from "section" courses to electives | [NEW_TERM.md](docs/NEW_TERM.md#first-year--second-year) |
| Before you graduate | Help your junior set up their own copy for their batch | [PASSING_IT_ON.md](docs/PASSING_IT_ON.md) |
| Something looks wrong | Run **📊 Tool Stats → ✓ Check settings** first | [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| You want to change how it works | Use an AI coding assistant; run the tests | [CHANGING_THE_CODE.md](docs/CHANGING_THE_CODE.md) |

---

## What's in this folder

| File | What it is | Do you edit it? |
|---|---|---|
| `app/config.gs` | **Your settings** — term, dates, roster, links. Every setting is explained inside. | **Yes — only this one** |
| `app/code.gs` | The app itself (the server side) | No |
| `app/Index.html` | The page students see | No |
| `app/appsscript.json` | The permissions the app asks for | No |
| `SETUP_WITH_AI.md` | Instructions for an AI assistant helping you | No |
| `docs/` | The guides linked above | — |
| `tests/` | Automatic checks, for anyone changing the code (`npm test`) | Only if you change the code |

When a newer version of TermSync comes out, you replace `code.gs` and `Index.html`
and **keep your `config.gs`**.

---

## Credits and licence

TermSync was created by **[Aniketh Hotagi](https://www.linkedin.com/in/aniketh-hotagi/)**
and built with the **[SAC, IIM Sirmaur](https://www.linkedin.com/company/saciimsirmaur)**.
The app credits the SAC, your batch's maintainer and its creator in its footer
and PDFs — please keep those credits when you run or share it.

Released under the [MIT licence](LICENSE). TermSync is an unofficial, student-built
tool: the official timetable from the institute is always the source of truth.
