# toastmasters-agenda-generator

[日本語](README.md)

A tool that **generates a Toastmasters meeting program (PDF)** from the meeting detail page of the Club Support System (tmcsupport.coresv.com). It is built around the program template of the Shinjuku Bilingual Toastmasters Club.

Today, someone opens the Club Support System, copies the role assignments into an Excel template by hand, and prints it to PDF. This tool replaces that with a single click. It runs on Google Sheets, so it works on **both Mac and Windows** with nothing to install.

## What it does

- Choose "① Create next program" from the menu of the club's Google Sheet to get the next meeting's program
  - Reads roles, speeches, guests and attendance from the Club Support System
  - Detects JE (Japanese session first) / EJ (English session first)
  - Adds rows automatically when a session has three prepared speeches
  - Fills the "Project Objectives" page with the Pathways project descriptions
- First creates an editable spreadsheet; after checking and fixing it, "② Export PDF" turns it into a PDF (handy when someone cancels)
- Can optionally create the program automatically on meeting days (off by default)

## Requirements

- A Google account
- A web browser (Chrome, Safari, Edge, …; any OS)

## Usage (for the member in charge of the program)

### Create a program

1. Open the club's spreadsheet and choose **例会プログラム** → **① 次回のプログラムを作成** (Create next program)
2. Confirm the meeting shown and click OK
3. In the "作成しました" (created) dialog, click "開く" (open) to open the new spreadsheet
4. Check it and edit anything directly if needed
5. In that spreadsheet, choose **② PDF 出力** (Export PDF). The PDF is saved to the output folder

- If something changes (e.g. a cancellation), edit the spreadsheet and run ② again, or start over from ① (this creates another file with the same name; delete the old one).
- If a warning says a project description was not found, only the heading is filled in. Paste the description into the spreadsheet if needed.
- To create a program for a meeting other than the next one, use "① 回を指定して作成（mtgid）" and enter the number after `mtgid=` in the meeting detail page URL.

### First use (once)

The first time you use the menu, Google asks for authorization:

1. "Continue" → choose your Google account
2. If you see "Google hasn't verified this app", click "Advanced" → "Go to … (unsafe)"
3. "Allow"

The warning appears because this is a club-made script that has not gone through Google's review. It asks for access to create/edit spreadsheets and Drive files, and to connect to an external service (the Club Support System).

### Scheduled run (optional, off by default)

"定期実行をオンにする" (turn on scheduled run) makes the script run **every Thursday between 13:00 and 14:00 (JST)** and create the program if that day is a meeting day.

- On Thursdays without a meeting it does nothing. It also does nothing if the program already exists.
- It does not export the PDF; check the spreadsheet and run ② yourself.
- It runs under the account of the person who turned it on, and only that person can turn it off.

## Initial setup (once, with a club Google account)

Use a club Google account (e.g. the PR or venue account).

1. **Output folder**: create a folder such as "例会プログラム" on Google Drive and copy its URL
2. **Template**: download `template.xlsx` from this repository, upload it to Google Drive, right-click → "Open with" → "Google Sheets", then "File" → "Save as Google Sheets"
3. **Settings**: in the `設定` sheet of that spreadsheet, enter
   - B1: the Zoom URL, ID and passcode (double-click the cell before pasting so the lines stay in one cell)
   - B2: the folder URL from step 1
4. **(Optional) English project descriptions**: the Japanese descriptions are already in the template. To add English ones too, replace the `プロジェクト説明` sheet as described in "Project description data" below
5. **Script**: open "Extensions" → "Apps Script", paste the entire contents of [`dist/Code.gs`](dist/Code.gs), and save. Reload the spreadsheet and the "例会プログラム" menu appears
6. **Share**: share the spreadsheet and the output folder with the members in charge as "Editor" (not outside the club)

To update the script, paste the new `dist/Code.gs` the same way as step 5 (programs already created are not affected).

### Project description data

The descriptions on the "Project Objectives" page come from the `プロジェクト説明` sheet. Projects without a description get only the heading.

- **Japanese**: purpose/overview taken from the Japanese materials published in Base Camp Resources. **Included in the template.**
- **English**: the Purpose from each project's Evaluation Resource. Evaluation Resources are for members logged in to Base Camp, so **they are not in this repository.** Keep them within the club.

To get data that includes English, use one of these:

- **A. Copy from an existing club spreadsheet** (easiest): in a spreadsheet that has the English data, right-click the `プロジェクト説明` sheet tab → "Copy to" → "Existing spreadsheet" → choose the new one. In the new spreadsheet, delete the original `プロジェクト説明` sheet and rename the copied sheet to `プロジェクト説明`
- **B. Import the CSV kept by the club**: get `project_descriptions.csv` from the club officer who keeps it, open the `プロジェクト説明` sheet, then "File" → "Import" → "Upload" → "Replace current sheet" → "Import data"
- **C. Rebuild it** (for developers): build the CSV with `tools/build_projects.py`. For English, a member downloads the Evaluation Resource PDFs from Base Camp into `cache/pathways/eval/{code}.pdf` first

## Status

| Stage | Description | Status |
|---|---|---|
| 0 | Template analysis (cell map, print areas) | ✅ Done |
| 1 | Meeting page reader (`src/parse.js`) and tests | ✅ Done |
| 2 | Build the list of cells to fill (`src/fill.js`) | ✅ Done |
| 3 | Fill the Google Sheet and export PDF | ✅ Done |
| 4 | Extra rows for three-speech sessions | ✅ Done |
| 5 | Pathways project description data | ✅ Done (English descriptions partly missing) |
| 6 | Menu, scheduled runs (off by default), sharing and setup guide | ✅ Done |

## Layout

```
src/                  Google Apps Script code
dist/Code.gs          src/ bundled into one file (paste into Apps Script)
template.xlsx         program template (converted to a Google Sheet)
tools/                developer tools (build Code.gs, build project description data)
docs/SPEC.md          detailed specification (Japanese; fill rules, cell map)
tests/                tests (names in tests/fixtures are replaced with fictitious ones)
```

## For developers

- The full specification is in [docs/SPEC.md](docs/SPEC.md) (Japanese). Instructions for AI coding assistants are in [CLAUDE.md](CLAUDE.md).
- Tests and building `dist/Code.gs` need Node.js 18 or later (no extra packages):

  ```
  npm test
  npm run build
  ```

- Files in `src/` are written so they can be pasted into Apps Script as-is (no `require`, global functions only). `src/dev.js` holds developer-only functions that are not in the menu.
- The project description CSV is built with `tools/build_projects.py` (Python + pymupdf) into `cache/pathways/` (not in the repository). The template's `プロジェクト説明` sheet (Japanese only) is updated from that CSV with `tools/fill_template_projects.ps1` (Windows + Excel).
- If you add a real meeting page as a test fixture, replace all names with fictitious ones first.

## Disclaimer

- This is an unofficial tool written by a club member. It is not affiliated with Toastmasters International or the provider of the Club Support System.
- Each run sends three requests to the Club Support System (about the same as opening the meeting page once in a browser). We have asked the system's operator for permission for this automated access.

## License

[MIT License](LICENSE)
