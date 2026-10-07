# Installation Guide

See [REQUIREMENTS.md](REQUIREMENTS.md) first.

## Linux (Debian/Kali/Ubuntu)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo apt-get install -y libreoffice     # optional: PDF export

git clone https://github.com/zin-lay/Slide-maker.git
cd Slide-maker
npm install
npm run check
npm start
```

Open **http://localhost:3200**.

## macOS

```bash
brew install node
brew install --cask libreoffice     # optional: PDF export
git clone https://github.com/zin-lay/Slide-maker.git
cd Slide-maker && npm install && npm start
```

## Windows

Install Node.js LTS and (optionally) LibreOffice, then:

```powershell
git clone https://github.com/zin-lay/Slide-maker.git
cd Slide-maker
npm install
npm start
```

If `soffice` isn't on PATH, set it in `.env`:
`SOFFICE_BIN=C:\Program Files\LibreOffice\program\soffice.exe`

## Docker (any OS)

```bash
git clone https://github.com/zin-lay/Slide-maker.git
cd Slide-maker
docker compose up -d --build
```

Open **http://localhost:3200**. The image includes LibreOffice.

## Turning on AI outline drafting (optional)

Edit `.env`, then restart. Reuse your existing setup:

**Groq (fast, free):**
```ini
PROVIDER=openai
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_your-key
OPENAI_MODEL=openai/gpt-oss-20b
```

**Local Ollama:**
```ini
PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:7b
```

**Claude:**
```ini
PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

With AI off (`PROVIDER=none`), the “Draft with AI” box is hidden and you write outlines yourself — everything else works.

## Sharing on your network

In `.env` set `HOST=0.0.0.0` and a strong `APP_PASSWORD`, open the firewall for the port, and ideally put it behind HTTPS (Caddy/Nginx). For a reverse proxy keep `HOST=127.0.0.1`.

## Troubleshooting

| Problem | Fix |
|---|---|
| PDF option downloads .pptx instead | LibreOffice isn't installed/detected. Install it, or set `SOFFICE_BIN`. |
| “AI drafting is off” | Set `PROVIDER` in `.env` and restart, or just write the outline. |
| Draft fails with a model error | Check the provider key/model (same settings as the Summarizer). |
| Bullets overflow a slide | Split into more `###` slides, or shorten bullets. |
| `EADDRINUSE` | Port 3200 busy — set `PORT=3201` in `.env`. |
| Fonts look different on another PC | PowerPoint uses locally-installed fonts; the themes use common ones (Calibri, Segoe UI, Georgia) with fallbacks. |
