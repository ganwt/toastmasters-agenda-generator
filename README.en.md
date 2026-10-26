# toastmasters-agenda-generator

[日本語](README.md)

A tool that **generates a Toastmasters meeting program (PDF)** from the meeting detail page of the Club Support System (tmcsupport.coresv.com). It is built around the program template of the Shinjuku Bilingual Toastmasters Club.

Today, someone opens the Club Support System, copies the role assignments into an Excel template by hand, and prints it to PDF. The goal is to replace that with a single click. It runs on Google Sheets, so it works on **both Mac and Windows** with nothing to install.

> [!WARNING]
> **Work in progress. It cannot produce a meeting program yet.**
> Only the page reader works so far. See "Status" below.

## What it will do

- Choose "Create program" from the menu of the club's Google Sheet to get the next meeting's program as a PDF
  - Reads roles, speeches, guests and attendance from the Club Support System
  - Detects JE (Japanese session first) / EJ (English session first)
  - Adds rows automatically when a session has three prepared speeches
  - Fills the "Project Objectives" page with the Pathways project descriptions
- Can also run on a schedule (e.g. every other Thursday at 12:00) without anyone's computer being on
- The PDF and an editable copy of the sheet are saved to a Google Drive folder

## Requirements

- A Google account
- A web browser (Chrome, Safari, Edge, …; any OS)

## Usage (planned)

1. Open the club's spreadsheet
2. Choose "Create program" from the menu
3. The PDF appears in the output folder on Google Drive

How to set up the club's spreadsheet (one time) will be added here when the tool is finished.

## Status

| Stage | Description | Status |
|---|---|---|
| 0 | Template analysis (cell map, print areas) | ✅ Done |
| 1 | Meeting page reader (`src/parse.js`) and tests | ✅ Done |
| 2 | Build the list of cells to fill (`src/fill.js`) | ⬜ Not started |
| 3 | Fill the Google Sheet and export PDF | ⬜ Not started |
| 4 | Extra rows for three-speech sessions | ⬜ Not started |
| 5 | Pathways project description data | ⬜ Not started |
| 6 | Page fetching, menu, scheduled runs, setup guide | ⬜ Not started |

## Layout

```
src/                  Google Apps Script code (pasted into the spreadsheet's script project)
template.xlsx         program template (converted to a Google Sheet)
docs/SPEC.md          detailed specification (Japanese; fill rules, cell map)
tests/                tests (names in tests/fixtures are replaced with fictitious ones)
```

## For developers

- The full specification is in [docs/SPEC.md](docs/SPEC.md) (Japanese). Instructions for AI coding assistants are in [CLAUDE.md](CLAUDE.md).
- Running the tests needs Node.js 18 or later (no extra packages):

  ```
  npm test
  ```

- Files in `src/` are written so they can be pasted into Apps Script as-is (no `require`, global functions only).
- If you add a real meeting page as a test fixture, replace all names with fictitious ones first.

## Disclaimer

- This is an unofficial tool written by a club member. It is not affiliated with Toastmasters International or the provider of the Club Support System.
- Each run sends three requests to the Club Support System (about the same as opening the meeting page once in a browser). We have asked the system's operator for permission for this automated access.

## License

[MIT License](LICENSE)
