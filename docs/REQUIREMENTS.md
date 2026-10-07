# Requirements

## Software

| Software | Version | Needed for | Install |
|---|---|---|---|
| Node.js | 20 LTS+ (18.17 min) | Running the app | https://nodejs.org |
| LibreOffice | 7.x+ | **PDF export** (optional) | `sudo apt install libreoffice` |
| An AI model | — | **AI outline drafting** (optional) | Ollama, a Groq key, or Claude key |

The core — writing an outline and downloading an editable `.pptx` — needs **only Node.js**. LibreOffice and AI are optional add-ons.

## Operating systems

- Linux (Debian/Kali/Ubuntu, etc.)
- macOS 12+ (`brew install --cask libreoffice` for PDF export)
- Windows 10/11 (install LibreOffice; set `SOFFICE_BIN` in `.env` if `soffice` isn't on PATH). Docker/WSL also works.

## Hardware

- The app is lightweight. PDF export uses LibreOffice briefly.
- AI drafting with a local Ollama model follows that model's RAM needs (see the Summarizer's requirements); a hosted model (Groq/Claude) needs almost nothing locally.

## Inputs & outputs

| Inputs | Outputs |
|---|---|
| Outline text (Markdown or indented), `.docx` / `.txt` / `.md` notes | `.pptx` (editable PowerPoint), `.pdf` (optional) |

## Bundled npm packages

| Package | Version | License | Purpose |
|---|---|---|---|
| pptxgenjs | 3.12.0 | MIT | Builds the PowerPoint file (in the browser) |
| mammoth | (bundled) | BSD-2-Clause | Reads `.docx` notes in the browser |

The server itself uses only built-in Node.js modules.
