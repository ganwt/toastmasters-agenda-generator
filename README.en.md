# toastmasters-agenda-generator

[日本語](README.md)

A Windows tool that **generates a Toastmasters meeting program (Excel / PDF)** from the meeting detail page of the Club Support System (tmcsupport.coresv.com). It is built around the program template of the Shinjuku Bilingual Toastmasters Club.

Today, someone opens the Club Support System, copies the role assignments into an Excel template by hand, and prints it to PDF. The goal is to replace that with a single double-click.

> [!WARNING]
> **Work in progress. It cannot produce a meeting program yet.**
> Only the page reader (`parse.ps1`) works so far. Filling in the Excel template, PDF export, and `run.bat` are still to come. See "Status" below.

## What it will do

- Pick the next meeting automatically and read roles, speeches, guests and attendance from the Club Support System
- Fill in the template and save an Excel file and a PDF to the `output` folder
  - Detects JE (Japanese session first) / EJ (English session first)
  - Adds rows automatically when a session has three prepared speeches
  - Fills the "Project Objectives" page with the Pathways project descriptions
- Can run every other week via Windows Task Scheduler

## Requirements

- Windows 10 or 11
- Microsoft Excel (desktop)
- Google Chrome

Nothing else needs to be installed; it runs on the PowerShell that ships with Windows.

## Setup

### 1. Download

Click the green **Code** button on this page → **Download ZIP**, then extract it anywhere (e.g. `Documents\toastmasters-agenda-generator`).

Or, with git:

```
git clone https://github.com/ganwt/toastmasters-agenda-generator.git
```

### 2. Zoom details

The club's Zoom URL and passcode are not published in this repository.

1. In the `config` folder, copy `zoom.example.txt` and rename the copy to `zoom.txt`
2. Open `zoom.txt` in Notepad, replace the contents with the club's Zoom URL, meeting ID and passcode, and save

The contents go into the "場所" (venue) field of the program as-is. Ask a club officer for the Zoom details.

### 3. Unblock the ZIP

Before extracting the downloaded ZIP, right-click it → Properties → tick "Unblock" near the bottom → OK. Otherwise Windows may show security warnings when the tool runs.

## Usage

### When finished (planned)

Double-click `run.bat`. When it is done, the `output` folder contains:

- `新宿BTMC第386回例会プログラム20261105.pdf` (for printing / sharing)
- `新宿BTMC第386回例会プログラム20261105.xlsx` (for manual touch-ups)

### Available now: read a meeting page

Save a meeting detail page from Chrome ("Save as" → "Webpage, HTML only") and convert it to JSON:

```
powershell -ExecutionPolicy Bypass -File parse.ps1 -HtmlPath saved_page.html -OutPath cache\meeting.json
```

## Status

| Stage | Description | Status |
|---|---|---|
| 0 | Template analysis (cell map, print areas) | ✅ Done |
| 1 | Meeting page reader (`parse.ps1`) and tests | ✅ Done |
| 2 | Fill the Excel template and export PDF (`fill.ps1`) | ⬜ Not started |
| 3 | Extra rows for three-speech sessions | ⬜ Not started |
| 4 | Pathways project descriptions (`config/projects.json`) | ⬜ Not started |
| 5 | Page fetching (`fetch.ps1`), `run.bat`, scheduled runs | ⬜ Not started |

## Layout

```
parse.ps1             reads the meeting page HTML
template.xlsx         program template (do not edit directly)
config/               settings (create zoom.txt yourself)
docs/SPEC.md          detailed specification (Japanese; fill rules, cell map)
tests/                tests (names in tests/fixtures are replaced with fictitious ones)
```

At run time the tool creates `cache/` (fetched pages), `output/` (results) and `logs/`. They contain members' names, so keep them out of the repository (already in `.gitignore`).

## For developers

- The full specification is in [docs/SPEC.md](docs/SPEC.md) (Japanese). Instructions for AI coding assistants are in [CLAUDE.md](CLAUDE.md).
- Run the tests (uses Pester 3.4, which ships with Windows):

  ```
  powershell -ExecutionPolicy Bypass -Command "Invoke-Pester tests"
  ```

- Save `.ps1` files as **UTF-8 with BOM**. Without the BOM, PowerShell 5.1 garbles Japanese text.
- If you add a real meeting page as a test fixture, replace all names with fictitious ones first.

## Disclaimer

- This is an unofficial tool written by a club member. It is not affiliated with Toastmasters International or the provider of the Club Support System.
- Each run opens only two pages on the Club Support System.

## License

[MIT License](LICENSE)
