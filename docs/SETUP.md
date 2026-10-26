# Setting up TermSync for your batch — step by step

Every click, in order. About **45 minutes** the first time. Do it on a laptop, in
Google Chrome.

> **Using an AI assistant?** Follow [SETUP_WITH_AI.md](../SETUP_WITH_AI.md) instead —
> it walks you through these same steps and fills in the settings for you.

**Before you start**, have these ready (the [README](../README.md#is-this-for-you)
explains each):

- [ ] Your **@iimsirmaur.ac.in** account, and the PGP office's **timetable
      spreadsheet shared with it** (Viewer is enough).
- [ ] Your batch's **roll number / section list**.
- [ ] Your term's **dates** from the academic calendar.
- [ ] The files: on the GitHub page click **Code → Download ZIP**, then unzip it.
      You'll copy from the four files in the `app` folder.

> 💡 **Use a Chrome window signed in to only your institute account.** Google's
> screens get confused when you're signed in to a personal Gmail too. The easiest
> way is a separate Chrome profile, or an Incognito window where you sign in only
> with your @iimsirmaur.ac.in account.

---

## Step 1 · Fill in your settings (`config.gs`) — 15 min

Open `app/config.gs` in a text editor (Notepad on Windows, TextEdit on Mac — in
TextEdit choose **Format → Make Plain Text** first). Every setting has a note above
it saying what it is and where to find it. Fill in, in this order:

1. **`THIS_TERM`** — the term **number** (1–6), your batch, the first and last day,
   and the exam weeks. From the number, TermSync works out the term's name, its
   calendar's name, which quiz / exam rows are this term's, and how students get
   their courses (by section in Terms 1–3, from the elective allotment in 4–6).
   Step 6 shows you what it worked out.
2. **`MAINTAINER`** — your name, your roll number, your LinkedIn link.
3. **`DATA_SOURCES` → `timetableSheet`** — open the office's timetable spreadsheet and
   copy the link from the address bar. Add the quiz and exam links if you have them.
4. **`STUDENTS`** — open the roster spreadsheet, select the three columns
   *Roll No, Name, Section*, copy, and paste between the two ` marks. Delete the two
   example lines starting with `#`.
5. **`COURSES`** — the term's course codes and names. **Not sure of the codes?** Put
   in what you know; Step 6 lists every code the timetable uses that's missing.
6. **`SAC_TEAM`** — the SAC members' rolls (optional, but they get the admin panel).
7. **`FEATURES`** — everything is switched on. Read
   [the features table](../README.md#features-and-which-ones-you-can-switch-off) and
   set any you don't want to `false`.
8. Terms 4–6 only: **`DATA_SOURCES` → `electivesSummary`**, the published link to the
   elective allotment sheet's Summary tab.

Everything else is optional and can be added later. Save the file.

Each block in `config.gs` is labelled **★ REQUIRED**, **◆ RECOMMENDED** or
**○ OPTIONAL**. Change only the values — never the names on the left — and don't
edit the other three files.

> 💻 **Have Node.js on your computer?** In the downloaded folder run `npm install`,
> then `npm run check -- app/config.gs` (add a CSV download of the office's timetable
> after it for a full dry run). It must end with `RESULT: READY`. Optional — Step 6
> checks the same things inside Google.

> ⚠️ **Privacy:** this file now has your batchmates' names and roll numbers. Don't
> post it anywhere public (including GitHub).

---

## Step 2 · Create the spreadsheet — 1 min

1. Go to **https://sheets.new** (signed in with your institute account).
2. Click **"Untitled spreadsheet"** (top left) and name it, for example:

   ```
   TermSync — Batch 26-28
   ```

This sheet is TermSync's storage. It fills up with tabs by itself (`MasterData`,
`QuizData`, `Usage`, …). You never type into them.

---

## Step 3 · Open Apps Script — 1 min

1. In the spreadsheet's menu: **Extensions → Apps Script**. A new tab opens.
2. Click **"Untitled project"** (top left) and name it `TermSync`.

You'll see one file on the left, **`Code.gs`**, with a few lines in it.

---

## Step 4 · Add the four files, in this order — 5 min

The order matters: **`config` must be first in the list on the left**, above `code`.
Doing it exactly as below gets the order right automatically.

### 4.1 · `config` (your settings)

1. On the left, hover over **`Code.gs`** → click the **⋮** next to it → **Rename** →
   type `config` → Enter. It now shows as `config.gs`.
2. Click it. Click inside the editor, press **Ctrl + A** (Mac: **Cmd + A**), then
   **Delete**.
3. Copy **everything** from your filled-in `app/config.gs` and paste it in.

### 4.2 · `code` (the app)

1. Click the **+** next to **Files** → **Script**. Name it `code` → Enter.
2. Select all, delete the placeholder, and paste **everything** from `app/code.gs`.
   It's long (about 11,000 lines) — that's normal.

The left list should now read **`config.gs`** first, then **`code.gs`**. If it's the
other way round: **⋮** next to `config.gs` → **Move file up**.

### 4.3 · `Index` (the page)

1. **+** next to **Files** → **HTML**. Name it exactly `Index` (capital I, no
   `.html` — Apps Script adds that).
2. Select all, delete, paste **everything** from `app/Index.html`.

### 4.4 · `appsscript.json` (permissions)

1. Click **⚙️ Project Settings** (gear icon, far left).
2. Tick **"Show 'appsscript.json' manifest file in the editor"**.
3. Click **< > Editor** (far left) → click **`appsscript.json`** in the list.
4. Select all, delete, paste **everything** from `app/appsscript.json`.

### 4.5 · Save

Click **💾 Save** (or Ctrl/Cmd + S). If a red error appears, a paste was cut short —
paste that file again.

---

## Step 5 · Give permission (first run) — 2 min

1. In the toolbar at the top there's a drop-down showing a function name. Click it
   and choose **`checkSettingsLog`**.
2. Click **▶ Run**.
3. Google asks for permission: **Review permissions** → pick your
   **@iimsirmaur.ac.in** account → if you see *"Google hasn't verified this app"*,
   click **Advanced** → **Go to TermSync (unsafe)** → **Allow**.

> "Unsafe" is Google's standard wording for any script that hasn't been through its
> paid review. It's your own script; the permissions are the ones listed in
> `appsscript.json` (your calendar, spreadsheets, fetching the institute's sheets,
> running on a timer, and your email address).

---

## Step 6 · Check your settings — 5 min

After Step 5, the **Execution log** opens at the bottom with a report like this:

```
✖ FIX THESE (1)
  • Timetable codes for your batch that are NOT in COURSES (…): QAM-II, WEC

⚠ CHECK THESE (1)
  • MAINTAINER.name still says "YOUR NAME".

✓ LOOKS RIGHT
  • Term: Term 2 · Batch 26-28 — calendar "IIM Sirmaur – Term 2", …
  • Students: 241 — sections A:60  B:61  C:60  D:60.
  • Timetable "Year/Batch" = "Ist year": 1160 row(s) — KEPT (your batch)
  • Timetable "Year/Batch" = "2nd Year": 1482 row(s) — ignored
  • Quiz schedule "… 2026-28, PhD26 T-II": 34 row(s) — KEPT (this term)
  • Quiz schedule "MBA & MBA-TM 2025-27  Term-V": 51 row(s) — ignored
```

- Fix every **✖** line in `config.gs` (in the Apps Script editor — click `config.gs`),
  press **Save**, and run `checkSettingsLog` again. Repeat until there are none.
- Read the **⚠** lines; each is either fine or a quick fix.
- **Check the KEPT / ignored lines.** Your batch's rows must say KEPT and the other
  year's must say ignored; this term's quiz / exam rows KEPT, others ignored. They
  almost always are. If not, see [NEW_TERM.md → the standard tags](NEW_TERM.md#reference-the-standard-tags)
  for how to override them.

---

## Step 7 · Load the timetable — 2 min

1. Function drop-down → **`fetchAndCleanAdminData`** → **▶ Run**. Takes up to a
   minute.
2. Go back to the spreadsheet tab and **reload it**. You should now see tabs like
   `MasterData`, `QuizData` and `ExamData`, and a new menu **📊 Tool Stats** at the
   top.

This also switches on the automatic 30-minute refresh. You don't need to set a timer.

> If it failed, the log says why. The most common reason is that your account can't
> open the office's timetable sheet — ask the office to share it with you.

---

## Step 8 · Share the spreadsheet with your batch (view only) — 2 min — required

**This step is required.** Each student's automatic sync runs *as that student*, and
reads this term's timetable from this spreadsheet. Without view access their syncs
can't read it, and their calendars stay empty. Viewers can look but never change
anything.

1. In the spreadsheet: **Share** (top right).
2. Under **General access**, change *Restricted* to **IIM Sirmaur** and leave the role
   as **Viewer**.
3. Click the **⚙️** at the top of the Share box and **untick** *"Viewers and commenters
   can see the option to download, print, and copy"*.
4. **Done**.

### Who can see the spreadsheet

The `Usage` and `Reports` tabs hold names, roll numbers and messages students send.
TermSync keeps them **hidden**, and step 8.3 removes the easy way to copy the file.
Hidden is not the same as private, though — a determined viewer could still read
them. Don't add anything else sensitive to this spreadsheet.

---

## Step 9 · Publish the app — 2 min

1. Back in Apps Script: **Deploy** (top right) → **New deployment**.
2. Click the **⚙️** next to *Select type* → **Web app**.
3. Fill in:

   | Field | Set it to |
   |---|---|
   | Description | `Term 2 v1` |
   | Execute as | **User accessing the web app** ← important |
   | Who has access | **Anyone within IIM Sirmaur** |

4. **Deploy** → if asked, **Authorize access** again → copy the **Web app URL**
   (it ends in `/exec`). **This is the link you'll share.**

> "Execute as: User accessing" is what makes each student's calendar change under
> their own account. Don't change it.

---

## Step 10 · Try it on yourself — 5 min

1. Open the Web app URL. You should see your term, your name and the
   **✦ Maintainer** badge.
2. Your courses should already be ticked ("Your courses are already selected").
   Press **Enable Auto-Sync**.
3. Open [Google Calendar](https://calendar.google.com). A calendar named after the
   term (e.g. "IIM Sirmaur – Term 2") appears with your classes — 📝 quizzes in red,
   📕 exams in blue, 🎤 guest lectures in grey.
4. Back in TermSync, try **Download PDF** (unless you switched it off in `FEATURES`).
5. At the bottom of the page, open **🎛️ Admin** — only the SAC team and you see it
   (unless switched off).
6. In the spreadsheet: **📊 Tool Stats → ✓ Enrolment pre-flight (every student)**. It
   checks every student on the roster and should end with **"Clear for go-live"**.

Ask one friend from a different section to try it too before you tell everyone.

---

## Step 11 · Share it with your batch

Send the Web app URL. Something like:

```text
📅 TermSync is live for Term 2!
Your timetable — classes, quizzes, mid-terms — in your own Google Calendar,
updated automatically whenever the office changes something.

1. Open <your link> on a laptop or phone, signed in with your @iimsirmaur.ac.in account
2. Allow the permissions (it only touches the one calendar it creates)
3. Your courses are already filled in from your section — press "Enable Auto-Sync"

That's it. Unofficial, student-built tool — the official timetable is always the
final word.
```

---

## After that

There is nothing to do day to day. TermSync checks the office's sheets every 30
minutes, and each student's calendar catches up within about an hour of a change.

- **Something wrong?** Students can press **Report a wrong entry** on the page; you'll
  see it in 🎛️ Admin → 🚩 Reports. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- **You changed `config.gs`** (a new subject rep, a new published link)? Do both,
  every time:
  1. **💾 Save** — background syncs use the saved version straight away.
  2. **Deploy → Manage deployments → ✏️ (pencil) → Version: New version → Deploy** —
     the web page only uses the new settings after this.

  Then run **📊 Tool Stats → ✓ Check settings**.
- **New term?** → [NEW_TERM.md](NEW_TERM.md)
- **End of the term?** → spreadsheet **📊 Tool Stats → End term** (optional — it locks
  the tool and crosses out the events as a record). Or simply move on to the next term.
