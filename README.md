# Slide Maker

Turn a simple **outline** or your **notes** into a polished, full-resolution **PowerPoint** — with a live preview, professional themes, and your branding. Optionally export to **PDF**, and optionally let an AI draft the outline for you.

Built to be reliable: the slide engine is deterministic and needs **no API key** and **no internet**. AI is an optional helper for drafting the outline — never required, so you're never blocked by AI limits. A companion to the Nexora Tech Summarizer and Converter, with the same self-hosted setup and look.

<!-- Add a screenshot at docs/screenshot.png and uncomment: -->
<!-- ![Screenshot](docs/screenshot.png) -->

## Features

- **Outline in, PowerPoint out.** Write an outline (Markdown `#`/`##`/`###`/`-`, or simple indented text — both work), or upload `.docx`/`.txt`/`.md` notes.
- **Live preview** of every slide in the chosen theme before you download.
- **Four professional themes** — Nexora (brand), Midnight (dark), Pine (green), Mono (minimal) — each with title, section, bullet, two-column, quote and closing layouts, your logo and page numbers.
- **Editable, full-resolution `.pptx`** that opens in PowerPoint, Google Slides or Keynote. **PDF export** too (needs LibreOffice).
- **Optional AI drafting.** Type a topic and let your own model (Ollama / Groq / Claude) write a starting outline you can edit. Off by default.
- **Private & local.** Slides are built in your browser; nothing is uploaded unless you use AI drafting or PDF export (both local/your own key).

## Outline format (both styles work)

```
# Deck Title
A subtitle line

## Section divider

### A content slide
- A bullet
- Another bullet
  - An indented sub-bullet

### Two columns
- Left item
- Left item
||
- Right item
- Right item

> A quote slide goes here.
— Attribution

## Thank you
Any closing text
```

The app opens with this sample so you can edit and see how it maps to slides.

## Quick start

```bash
git clone https://github.com/zin-lay/Slide-maker.git
cd Slide-maker
npm install
npm run check
npm start
```

Open **http://localhost:3200**. Writing an outline and downloading `.pptx` needs nothing else.

- For **PDF export**: `sudo apt install libreoffice`
- For **AI drafting** (optional): set `PROVIDER` in `.env` (see [.env.example](.env.example)) — reuse your Groq key or local Ollama.

Docker (includes LibreOffice): `docker compose up -d --build`.

## Project structure

```
Slide-maker/
├── server.js            Static serving + optional AI outline + optional PDF export
├── public/
│   ├── index.html, app.js, styles.css
│   ├── slides.js        Themes + outline parser + .pptx builder
│   ├── pptxgen.bundle.js, mammoth.browser.min.js  (local, offline)
│   └── logo.png, favicon.svg
├── scripts/check.js
├── docs/REQUIREMENTS.md, INSTALLATION.md
├── .env.example, Dockerfile, docker-compose.yml
```

## Adding your own theme

Open `public/slides.js`, copy one block in `THEMES`, and change the colours and fonts. No other code changes are needed — it appears in the dropdown automatically.

## Limitations

- Fonts in the `.pptx` use fonts installed on the viewer's computer (Calibri, Segoe UI, Georgia) with safe fallbacks.
- Very long bullet lists can overflow a slide — split them across slides.
- AI-drafted outlines are a starting point; review before presenting.

## License

[MIT](LICENSE). Bundled libraries keep their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Nexora Tech name and logo are trademarks of their owner.
