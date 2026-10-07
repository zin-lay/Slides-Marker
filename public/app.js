(() => {
  const $ = id => document.getElementById(id);
  const S = window.NexoraSlides;
  let caps = null, logoDataUrl = null, logoRatio = 228 / 120, aiCtl = null, lastParsed = null;

  // ---- theme dropdown
  for (const [k, v] of Object.entries(S.THEMES)) {
    const o = document.createElement("option"); o.value = k; o.textContent = v.label; $("theme").append(o);
  }
  $("outline").value = S.SAMPLE;

  // ---- load logo as data URL for embedding in the .pptx
  (async () => {
    try {
      const blob = await (await fetch("logo.png")).blob();
      logoDataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      const img = new Image(); img.onload = () => { logoRatio = img.width / img.height; }; img.src = logoDataUrl;
    } catch {}
  })();

  // ---- sample / reset + file upload
  $("reset").onclick = () => { $("outline").value = S.SAMPLE; preview(); };
  $("loadFile").onclick = () => $("file").click();
  $("file").onchange = () => { const f = $("file").files[0]; if (f) readNotes(f); $("file").value = ""; };
  async function readNotes(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    try {
      let text = "";
      if (ext === "docx" || ext === "doc") {
        if (typeof mammoth === "undefined") { setNotice("The .docx reader didn't load. Reload the page and try again."); return; }
        text = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      } else { text = await f.text(); }
      if (!text.trim()) { setNotice("That file looks empty."); return; }
      $("outline").value = text.trim(); setNotice(""); preview();
    } catch { setNotice("Couldn't read that file. Use .txt, .md or .docx."); }
  }
  // drag a notes file straight onto the outline box
  const ota = $("outline");
  ota.addEventListener("dragover", e => { e.preventDefault(); ota.classList.add("drag"); });
  ota.addEventListener("dragleave", () => ota.classList.remove("drag"));
  ota.addEventListener("drop", e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); ota.classList.remove("drag"); readNotes(e.dataTransfer.files[0]);
  });

  // ---- AI drafting (optional)
  (function initAI() {
    if (!caps) return; // set later in startup
  })();
  $("draft").onclick = async () => {
    const topic = $("topic").value.trim();
    if (!topic) { aiNote("Enter a topic or paste notes first.", true); return; }
    if (!caps || caps.aiProvider === "none") { aiNote("AI drafting is off. Set PROVIDER in .env to enable it, or write the outline yourself.", true); return; }
    aiCtl = new AbortController(); $("draft").hidden = true; $("draftStop").hidden = false; aiNote("Drafting…");
    $("outline").value = "";
    try {
      const res = await fetch("/api/outline", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, slides: +$("nslides").value || 8 }), signal: aiCtl.signal });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Request failed."); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "", text = "";
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
          const m = JSON.parse(line); if (m.error) throw new Error(m.error); if (m.delta) { text += m.delta; $("outline").value = text; } } }
      aiNote("Draft ready — edit it, then Preview."); preview();
    } catch (e) { if (e.name !== "AbortError") aiNote(e.message || "Couldn't draft.", true); }
    finally { aiCtl = null; $("draft").hidden = false; $("draftStop").hidden = true; }
  };
  $("draftStop").onclick = () => aiCtl && aiCtl.abort();

  // ---- preview (HTML mirror of the theme)
  $("make").onclick = preview;
  function preview() {
    const outline = S.parseOutline($("outline").value);
    lastParsed = outline;
    const t = S.THEMES[$("theme").value];
    const deck = $("deck"); deck.innerHTML = "";
    const slides = [titleSlide(outline, t), ...outline.slides.map((s, i) => renderSlide(s, t, i))];
    slides.forEach(el => deck.append(el));
    $("count").textContent = slides.length + " slide" + (slides.length === 1 ? "" : "s");
    setStatus("");
  }

  const hx = h => "#" + h;
  function titleSlide(o, t) {
    const d = el("div", "slide center"); d.style.background = hx(t.band);
    const big = (o.title || "").length > 48 ? 5.6 : 7;
    d.innerHTML = `<div class="s-pad" style="justify-content:flex-end;display:flex;flex-direction:column;padding-bottom:9cqw">
      ${t.logo && logoDataUrl ? `<img class="s-logo" style="top:7cqw;left:7cqw;bottom:auto" src="${logoDataUrl}">` : ""}
      <div class="s-accent" style="position:relative;left:0;background:${hx(t.accent)};margin-bottom:3cqw"></div>
      <div class="s-title" style="color:${hx(t.bandText)};font-size:${big}cqw;font-family:${ff(t.head)}">${esc(o.title)}</div>
      ${o.subtitle ? `<div class="s-sub" style="color:${hx(t.bandText)};font-size:3.2cqw;font-family:${ff(t.body)}">${esc(o.subtitle)}</div>` : ""}
    </div>`;
    return d;
  }
  function renderSlide(s, t, i) {
    if (s.type === "section") {
      const d = el("div", "slide center"); d.style.background = hx(t.band);
      d.innerHTML = `<div class="s-pad" style="justify-content:center;display:flex;flex-direction:column">
        <div class="s-accent" style="position:relative;left:0;background:${hx(t.accent)};margin-bottom:3cqw"></div>
        <div class="s-title" style="color:${hx(t.bandText)};font-size:6cqw;font-family:${ff(t.head)}">${esc(s.title)}</div></div>`;
      return d;
    }
    if (s.type === "quote") {
      const d = el("div", "slide center"); d.style.background = hx(t.bg);
      d.innerHTML = `<div class="s-mark" style="color:${hx(t.accent)};font-size:22cqw;top:1cqw;left:5cqw">&ldquo;</div>
        <div class="s-pad" style="justify-content:center;display:flex;flex-direction:column">
        <div class="s-quote" style="color:${hx(t.title)};font-size:5cqw">${esc(s.quote || "")}</div>
        ${s.attribution ? `<div style="color:${hx(t.muted)};font-size:3cqw;margin-top:3cqw;font-family:${ff(t.body)}">— ${esc(s.attribution)}</div>` : ""}</div>`;
      return d;
    }
    const d = el("div", "slide"); d.style.background = hx(t.bg);
    const bullets = list => `<ul>${(list || []).map(b => `<li class="${b.level ? "sub" : ""}" style="color:${b.level ? hx(t.muted) : hx(t.text)};font-size:${b.level ? 2.9 : 3.3}cqw;font-family:${ff(t.body)}">${esc(b.text)}</li>`).join("")}</ul>`;
    const two = s.right && s.right.length;
    const longTitle = (s.title || "").length > 46;
    d.innerHTML = `<div class="s-pad">
      ${s.title ? `<div class="s-title" style="color:${hx(t.title)};font-size:${longTitle ? 3.8 : 4.4}cqw;font-family:${ff(t.head)}">${esc(s.title)}</div>
      <div class="s-accent" style="background:${hx(t.accent)};position:relative;left:0;top:0;margin-top:2cqw"></div>` : ""}
      <div style="margin-top:${s.title ? 4 : 2}cqw">
        ${two ? `<div class="cols">${bullets(s.bullets)}${bullets(s.right)}</div>` : bullets(s.bullets)}
      </div>
      ${t.logo && logoDataUrl ? `<img class="s-logo" style="left:5cqw;bottom:4cqw;top:auto;height:4cqw" src="${logoDataUrl}">` : ""}
      <div class="s-pageno" style="color:${hx(t.muted)}">${i + 1}</div>
    </div>`;
    return d;
  }

  // ---- download
  $("download").onclick = async () => {
    const outline = S.parseOutline($("outline").value);
    if (!outline.slides.length && !outline.title) { setNotice("Write an outline first."); return; }
    const theme = $("theme").value, fmt = $("fmt").value;
    const base = (outline.title || "slides").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "slides";
    setStatus("Building deck…");
    try {
      const pptx = S.buildPptx(window.PptxGenJS, outline, theme, { logoDataUrl, logoRatio });
      if (fmt === "pdf") {
        if (!caps || !caps.pdf) { setStatus("PDF export needs LibreOffice on the server. Downloading PowerPoint instead.", true); }
        const blob = await pptx.write({ outputType: "blob" });
        if (caps && caps.pdf) {
          setStatus("Converting to PDF on the server…");
          const res = await fetch("/api/pdf?name=" + encodeURIComponent(base), { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob });
          if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "PDF export failed."); }
          saveBlob(await res.blob(), base + ".pdf"); setStatus("Done — PDF downloaded.");
        } else { saveBlob(blob, base + ".pptx"); }
      } else {
        await pptx.writeFile({ fileName: base + ".pptx" }); setStatus("Done — PowerPoint downloaded.");
      }
    } catch (e) { setStatus(e.message || "Couldn't build the deck.", true); }
  };

  // ---- helpers
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function ff(f) { return `'${f}', system-ui, sans-serif`; }
  function setStatus(m, err) { $("status").textContent = m || ""; $("status").classList.toggle("err", !!err); }
  function setNotice(m) { $("notice").textContent = m || ""; $("notice").hidden = !m; }
  function aiNote(m, err) { $("aiNote").textContent = m || ""; $("aiNote").classList.toggle("err", !!err); }
  function saveBlob(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

  // ---- startup
  (async () => {
    try { caps = await (await fetch("/api/config")).json(); }
    catch { caps = { aiProvider: "none", pdf: false }; }
    const badge = $("engine");
    badge.textContent = (caps.aiProvider !== "none" ? "AI: " + (caps.aiModel || caps.aiProvider) : "AI off") + (caps.pdf ? " · PDF" : "");
    if (caps.aiProvider === "none") { $("aiBox").removeAttribute("open"); aiNote("Turn on a model in .env to draft outlines automatically. You can always write the outline yourself."); }
    preview();
  })();
})();
