# toastmasters-agenda-generator

[日本語](README.md)

A tool that **generates a Toastmasters meeting program (PDF)** from the meeting detail page of the Club Support System (tmcsupport.coresv.com). It is built around the program template of the Shinjuku Bilingual Toastmasters Club.

Today, someone opens the Club Support System, copies the role assignments into an Excel template by hand, and prints it to PDF. The goal is to replace that with a single click. It runs on Google Sheets, so it works on **both Mac and Windows** with nothing to install.

> [!WARNING]
> **Work in progress. It cannot produce a meeting program yet.**
> Only the page reader works so far. See "Status" below.

## What it will do

- Choose "Create program" from the menu of the club's Google Sheet to get the next meeting's program
  - Reads roles, speeches, guests and attendance from the Club Support System
  - Detects JE (Japanese session first) / EJ (English session first)
  - Adds rows automatically when a session has three prepared speeches
  - Fills the "Project Objectives" page with the Pathways project descriptions
- First creates an editable spreadsheet; after checking and fixing it, "Export PDF" turns it into a PDF (handy when someone cancels)
- Can optionally run on a schedule (off by default)

## Requirements

- A Google account
- A web browser (Chrome, Safari, Edge, …; any OS)

## Usage (planned)

1. Open the club's spreadsheet and choose "① Create program" from the menu
2. Check the new spreadsheet and fix anything if needed
3. Choose "② Export PDF" from that spreadsheet's menu. The PDF appears in the output folder

How to set up the club's spreadsheet (one time) will be added here when the tool is finished.

## Status

| Stage | Description | Status |
|---|---|---|
| 0 | Template analysis (cell map, print areas) | ✅ Done |
| 1 | Meeting page reader (`src/parse.js`) and tests | ✅ Done |
| 2 | Build the list of cells to fill (`src/fill.js`) | ✅ Done |
| 3 | Fill the Google Sheet and export PDF | ✅ Done |
| 4 | Extra rows for three-speech sessions | ✅ Done |
| 5 | Pathways project description data | ⬜ Not started |
| 6 | Menu, scheduled runs (off by default), sharing and setup guide | ⬜ Not started |

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
