/**
 * Nexora Slide Maker — server
 *
 * The .pptx is built in the browser (pptxgenjs), so the core tool needs no
 * server smarts and no API key. The server adds two optional helpers:
 *   - /api/outline : draft an outline from a topic, via a model provider
 *                    (ollama | openai | anthropic). Optional.
 *   - /api/pdf     : convert an uploaded .pptx to PDF using LibreOffice. Optional.
 * Everything runs locally.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

loadEnvFile(path.join(__dirname, ".env"));
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);
const PROVIDER = env("PROVIDER", "none").toLowerCase();

const CONFIG = {
  host: env("HOST", "127.0.0.1"),
  port: Number(env("PORT", 3200)),
  provider: PROVIDER,
  appUser: env("APP_USER", ""),
  appPassword: env("APP_PASSWORD", ""),
  maxOutputTokens: Number(env("MAX_OUTPUT_TOKENS", 1500)),
  temperature: Number(env("TEMPERATURE", 0.5)),
  maxUploadMB: Number(env("MAX_UPLOAD_MB", 25)),
  convertTimeoutMs: Number(env("CONVERT_TIMEOUT_MS", 120000)),
  softwareOffice: env("SOFFICE_BIN", "soffice"),
  ollama: { url: env("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/+$/, ""), model: env("OLLAMA_MODEL", "qwen2.5:7b"), numCtx: Number(env("OLLAMA_NUM_CTX", 8192)) },
  openai: { baseUrl: env("OPENAI_BASE_URL", "http://127.0.0.1:1234/v1").replace(/\/+$/, ""), apiKey: env("OPENAI_API_KEY", ""), model: env("OPENAI_MODEL", "local-model") },
  anthropic: { apiKey: env("ANTHROPIC_API_KEY", ""), model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5") },
};

const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon", ".json":"application/json; charset=utf-8" };

let OFFICE = null;
const hasOffice = () => OFFICE !== null ? Promise.resolve(OFFICE) :
  new Promise(r => { try { const c = spawn(CONFIG.softwareOffice, ["--version"]); c.on("error", () => r(OFFICE = false)); c.on("close", () => r(OFFICE = true)); setTimeout(() => { try { c.kill("SIGKILL"); } catch {} r(OFFICE = false); }, 8000); } catch { r(OFFICE = false); } });

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    if (!checkAuth(req, res)) return;
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/config") return handleConfig(res);
    if (req.method === "POST" && url.pathname === "/api/outline") return handleOutline(req, res);
    if (req.method === "POST" && url.pathname === "/api/pdf") return handlePdf(req, res, url);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(url.pathname, res);
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (e) { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" }); else res.end(); }
});

server.listen(CONFIG.port, CONFIG.host, async () => {
  const shown = CONFIG.host === "0.0.0.0" ? "localhost" : CONFIG.host;
  const office = await hasOffice();
  console.log(`Nexora Slide Maker running at http://${shown}:${CONFIG.port}`);
  console.log(`AI outline: ${CONFIG.provider === "none" ? "off" : CONFIG.provider} · PDF export (LibreOffice): ${office ? "yes" : "no"}`);
});

// ---------------------------------------------------------------------------
async function handleConfig(res) {
  sendJson(res, 200, {
    aiProvider: CONFIG.provider,
    aiModel: CONFIG.provider === "none" ? null : modelName(),
    pdf: await hasOffice(),
  });
}

async function handleOutline(req, res) {
  if (CONFIG.provider === "none") return sendJson(res, 400, { error: "AI outline drafting is turned off. Set PROVIDER in .env to enable it, or write the outline yourself." });
  let body; try { body = JSON.parse(await readText(req, 64 * 1024)); } catch { return sendJson(res, 400, { error: "Invalid request." }); }
  const topic = String(body.topic || "").slice(0, 2000).trim();
  const n = Math.max(3, Math.min(20, parseInt(body.slides, 10) || 8));
  if (!topic) return sendJson(res, 400, { error: "Describe the topic or paste the notes to turn into an outline." });

  const prompt = `Create a presentation outline about the following. Return it in this exact Markdown format and nothing else:
- First line: "# <deck title>"
- Second line: a short subtitle (plain text)
- Use "## <section>" for section dividers
- Use "### <slide title>" for each content slide, followed by "- bullet" lines (3-5 bullets, concise)
- Optionally one "> quote" line with a "— attribution" line
Aim for about ${n} content slides. Be specific and professional. Do not add commentary.

TOPIC / NOTES:
${topic}`;

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const send = o => res.write(JSON.stringify(o) + "\n");
  try {
    const fn = { ollama: streamOllama, openai: streamOpenAI, anthropic: streamAnthropic }[CONFIG.provider];
    if (!fn) throw new UserError(`Unknown PROVIDER "${CONFIG.provider}".`);
    await fn([{ role: "user", content: prompt }], t => send({ delta: t }), ctl.signal);
    send({ done: true });
  } catch (e) {
    if (ctl.signal.aborted) return res.end();
    send({ error: e instanceof UserError ? e.message : "The model couldn't produce an outline. Try again." });
  }
  res.end();
}

async function handlePdf(req, res, url) {
  if (!(await hasOffice())) return sendJson(res, 503, { error: "PDF export needs LibreOffice, which isn't installed on the server." });
  let buf; try { buf = await readBody(req, CONFIG.maxUploadMB * 1024 * 1024); }
  catch (e) { return sendJson(res, e.code === "TOO_LARGE" ? 413 : 400, { error: e.code === "TOO_LARGE" ? `File exceeds the ${CONFIG.maxUploadMB} MB limit.` : "Couldn't read the upload." }); }
  const base = (url.searchParams.get("name") || "slides").replace(/[^\w\-]+/g, "_").slice(0, 60) || "slides";
  const dir = path.join(os.tmpdir(), "nexora-slides-" + crypto.randomBytes(6).toString("hex"));
  await fsp.mkdir(dir, { recursive: true });
  try {
    const inPath = path.join(dir, "deck.pptx");
    await fsp.writeFile(inPath, buf);
    await run(CONFIG.softwareOffice, ["--headless", "--nologo", "--convert-to", "pdf", "--outdir", dir, inPath], CONFIG.convertTimeoutMs, { HOME: dir });
    const pdfPath = path.join(dir, "deck.pdf");
    if (!fs.existsSync(pdfPath)) throw new UserError("LibreOffice couldn't convert the slides.");
    const data = await fsp.readFile(pdfPath);
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": data.length, "Content-Disposition": `attachment; filename="${base}.pdf"`, "Cache-Control": "no-store" });
    res.end(data);
  } catch (e) {
    if (e instanceof UserError) return sendJson(res, 422, { error: e.message });
    if (e && e.code === "TIMEOUT") return sendJson(res, 504, { error: "PDF export took too long." });
    console.error("[pdf]", e && e.message); return sendJson(res, 500, { error: "PDF export failed." });
  } finally { fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// --- providers (ported from the summarizer) --------------------------------
class UserError extends Error {}
async function streamOllama(messages, onDelta, signal) {
  const r = await upstream(`${CONFIG.ollama.url}/api/chat`, { model: CONFIG.ollama.model, messages, stream: true, options: { num_ctx: CONFIG.ollama.numCtx, temperature: CONFIG.temperature, num_predict: CONFIG.maxOutputTokens } }, {}, signal, "Ollama");
  await readLines(r.body, line => { const j = JSON.parse(line); if (j.error) throw new UserError("Ollama: " + j.error); if (j.message && j.message.content) onDelta(j.message.content); });
}
async function streamOpenAI(messages, onDelta, signal) {
  const headers = CONFIG.openai.apiKey ? { Authorization: `Bearer ${CONFIG.openai.apiKey}` } : {};
  const r = await upstream(`${CONFIG.openai.baseUrl}/chat/completions`, { model: CONFIG.openai.model, messages, stream: true, temperature: CONFIG.temperature, max_tokens: CONFIG.maxOutputTokens }, headers, signal, "model service");
  await readSSE(r.body, data => { if (data === "[DONE]") return; const j = JSON.parse(data); const c = j.choices && j.choices[0]; if (c && c.delta && c.delta.content) onDelta(c.delta.content); });
}
async function streamAnthropic(messages, onDelta, signal) {
  if (!CONFIG.anthropic.apiKey) throw new UserError("ANTHROPIC_API_KEY is not set.");
  const r = await upstream("https://api.anthropic.com/v1/messages", { model: CONFIG.anthropic.model, max_tokens: CONFIG.maxOutputTokens, temperature: CONFIG.temperature, messages, stream: true }, { "x-api-key": CONFIG.anthropic.apiKey, "anthropic-version": "2023-06-01" }, signal, "Claude API");
  await readSSE(r.body, data => { const j = JSON.parse(data); if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") onDelta(j.delta.text); else if (j.type === "error") throw new UserError("Claude API: " + ((j.error && j.error.message) || "error")); });
}
async function upstream(url, payload, headers, signal, label) {
  let r; try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(payload), signal }); }
  catch (e) { if (signal.aborted) throw e; throw new UserError(`Can't reach the ${label}. Is it running?`); }
  if (!r.ok) { if (r.status === 401 || r.status === 403) throw new UserError(`${label} rejected the API key.`); if (r.status === 404 && label === "Ollama") throw new UserError(`Model "${CONFIG.ollama.model}" isn't installed. Run: ollama pull ${CONFIG.ollama.model}`); throw new UserError(`${label} error (HTTP ${r.status}).`); }
  return r;
}
function modelName() { return { ollama: CONFIG.ollama.model, openai: CONFIG.openai.model, anthropic: CONFIG.anthropic.model }[CONFIG.provider] || "unknown"; }

// --- io helpers ------------------------------------------------------------
async function readLines(stream, onLine) { const dec = new TextDecoder(); let buf = ""; for await (const ch of stream) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) onLine(l); } } if (buf.trim()) onLine(buf.trim()); }
async function readSSE(stream, onData) { await readLines(stream, l => { if (l.startsWith("data:")) onData(l.slice(5).trim()); }); }
function run(cmd, args, timeoutMs, extraEnv) { return new Promise((resolve, reject) => { const c = spawn(cmd, args, { env: { ...process.env, ...extraEnv } }); let err = ""; const t = setTimeout(() => { const e = new Error("timeout"); e.code = "TIMEOUT"; c.kill("SIGKILL"); reject(e); }, timeoutMs); c.stderr.on("data", d => err += d); c.on("error", e => { clearTimeout(t); reject(e); }); c.on("close", code => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`${cmd} ${code}: ${err.slice(0,200)}`)); }); }); }
function readBody(req, max) { return new Promise((res, rej) => { let n = 0; const ch = []; req.on("data", c => { n += c.length; if (n > max) { const e = new Error("too large"); e.code = "TOO_LARGE"; rej(e); req.destroy(); return; } ch.push(c); }); req.on("end", () => res(Buffer.concat(ch))); req.on("error", rej); }); }
function readText(req, max) { return readBody(req, max).then(b => b.toString("utf8")); }
function serveStatic(pathname, res) { const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, ""); const file = path.resolve(PUBLIC_DIR, rel); if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) return sendJson(res, 403, { error: "Forbidden" }); fs.stat(file, (err, st) => { if (err || !st.isFile()) return sendJson(res, 404, { error: "Not found" }); res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" }); fs.createReadStream(file).pipe(res); }); }
function sendJson(res, s, o) { res.writeHead(s, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); }
function setSecurityHeaders(res) { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"); }
function checkAuth(req, res) { if (!CONFIG.appPassword) return true; const h = req.headers.authorization || ""; if (h.startsWith("Basic ")) { const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":"); if (safeEqual(u, CONFIG.appUser || "admin") && safeEqual(rest.join(":"), CONFIG.appPassword)) return true; } res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Slide Maker"' }); res.end("Authentication required"); return false; }
function safeEqual(a, b) { const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest(); return crypto.timingSafeEqual(x, y); }
function loadEnvFile(file) { let text; try { text = fs.readFileSync(file, "utf8"); } catch { return; } for (const raw of text.split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const i = line.indexOf("="); if (i < 1) continue; const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim(); if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ""); if (process.env[k] === undefined) process.env[k] = v; } }
