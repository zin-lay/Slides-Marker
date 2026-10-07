/* Nexora Slide Maker — outline parsing, themes, and .pptx building.
   Pure logic, shared by the browser and the Node test harness.
   Build is done with pptxgenjs, which is passed in so this file stays
   independent of how it's loaded. */
"use strict";
(function (root) {

  // ---------------------------------------------------------------- THEMES
  // A theme is just design data. Add a new one by copying a block and
  // changing the values — no other code needs to change.
  const THEMES = {
    nexora: {
      label: "Nexora (brand)",
      bg: "FFFFFF", title: "0B2A5B", text: "1C2430", muted: "5B6675",
      accent: "12A9E0", accentText: "FFFFFF", band: "0B2A5B", bandText: "FFFFFF",
      head: "Segoe UI", body: "Calibri", logo: true,
    },
    midnight: {
      label: "Midnight (dark)",
      bg: "0E1621", title: "FFFFFF", text: "CBD6E2", muted: "8495A8",
      accent: "35C6F4", accentText: "06131D", band: "0A1118", bandText: "FFFFFF",
      head: "Segoe UI", body: "Calibri", logo: true,
    },
    pine: {
      label: "Pine (green)",
      bg: "FCFBF7", title: "14523A", text: "1B241F", muted: "5F6A62",
      accent: "1C6B4C", accentText: "FFFFFF", band: "14523A", bandText: "FCFBF7",
      head: "Segoe UI", body: "Calibri", logo: true,
    },
    mono: {
      label: "Mono (minimal)",
      bg: "FFFFFF", title: "141414", text: "333333", muted: "8A8A8A",
      accent: "C0392B", accentText: "FFFFFF", band: "141414", bandText: "FFFFFF",
      head: "Georgia", body: "Georgia", logo: false,
    },
  };

  // ---------------------------------------------------------------- SAMPLE
  const SAMPLE = `# Launching Nexora Analytics
A professional deck, generated from this outline

## Why this matters

### The problem today
- Teams drown in documents and data
- Insights arrive too late to act on
- Tools are expensive and send data to the cloud

### What we built
- Fast, private, self-hosted analytics
- Works offline — your data never leaves your machine
  - No API keys required
  - Runs on commodity hardware

### Before and after
- Manual review
- Hours per report
- Inconsistent results
||
- Automated insight
- Minutes per report
- Consistent, repeatable

> Privacy isn't a feature. It's the foundation.
— Nexora Tech

## Thank you
Questions? hello@nexora.tech`;

  // ---------------------------------------------------------------- PARSER
  // Supports Markdown (#/##/###, -, *, >) and a simple indent style at once.
  // Returns { title, subtitle, slides:[...] }.
  // Natural outlines (no #/-/indent) — e.g. "Slide 1 — Title" followed by plain
  // lines — are converted to the Markdown the parser understands. Triggered when
  // the text has "Slide N"/"Section"/"Part N" headers but no Markdown markers.
  function looksLikeProse(text) {
    const hasHeaders = /^\s*(slide|section|part)\s+\d+\b/im.test(text);
    const hasMarkers = /^\s*(#{1,6}\s|[-*•]\s|>\s)/m.test(text);
    return hasHeaders && !hasMarkers;
  }
  function proseToMarkdown(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const out = []; let first = true, subMode = false, m;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { out.push(""); subMode = false; continue; }
      if (first) { out.push("# " + t); first = false; subMode = false; continue; }
      if ((m = t.match(/^slide\s+\d+\s*[—\-:.)\]]*\s*(.*)$/i))) { out.push("### " + (m[1] || "Slide").trim()); subMode = false; continue; }
      if ((m = t.match(/^(?:section|part)\s*\d*\s*[:\-—.)\]]*\s*(.*)$/i)) && m[1]) { out.push("## " + m[1].trim()); subMode = false; continue; }
      if (/:$/.test(t) && t.length <= 40) { out.push("- " + t); subMode = true; continue; } // "Used in:" lead-in
      out.push((subMode ? "  - " : "- ") + t);
    }
    return out.join("\n");
  }

  function parseOutline(src) {
    let input = String(src || "");
    if (looksLikeProse(input)) input = proseToMarkdown(input);
    const lines = input.replace(/\r\n?/g, "\n").split("\n");
    const slides = [];
    let cur = null, deckTitle = "", deckSubtitle = "", col = 0;

    const push = s => { if (s) slides.push(s); };
    const newContent = title => ({ type: "content", title: title || "", bullets: [], right: [] });

    for (let raw of lines) {
      const line = raw.replace(/\s+$/,"");
      const trimmed = line.trim();

      if (!trimmed) { continue; }                     // blank line = soft separator

      // column separator
      if (/^\|\|$/.test(trimmed) || /^::+$/.test(trimmed)) { col = 1; continue; }

      // headings (markdown)
      let m;
      if ((m = trimmed.match(/^(#{1,6})\s+(.*)$/))) {
        const depth = m[1].length, txt = m[2].trim();
        if (depth === 1 && !deckTitle && !slides.length && !cur) { deckTitle = txt; cur = "await-sub"; continue; }
        if (depth === 1) { push(cur && cur !== "await-sub" ? cur : null); cur = null;
          // treat a later # as a section too
          push({ type: "section", title: txt }); continue; }
        if (depth === 2) { push(cur && cur !== "await-sub" ? cur : null); push({ type: "section", title: txt }); cur = null; continue; }
        // depth >=3 → content slide
        push(cur && cur !== "await-sub" ? cur : null); cur = newContent(txt); col = 0; continue;
      }

      // section via == Name ==
      if ((m = trimmed.match(/^==+\s*(.+?)\s*==+$/))) {
        push(cur && cur !== "await-sub" ? cur : null); push({ type: "section", title: m[1] }); cur = null; continue;
      }

      // quote
      if ((m = trimmed.match(/^>\s?(.*)$/))) {
        if (!cur || cur === "await-sub" || cur.type !== "quote") { push(cur && cur !== "await-sub" ? cur : null); cur = { type: "quote", quote: "", attribution: "" }; col = 0; }
        cur.quote += (cur.quote ? " " : "") + m[1].trim(); continue;
      }
      // attribution line
      if ((m = trimmed.match(/^(?:—|--|–)\s*(.+)$/)) && cur && cur.type === "quote") { cur.attribution = m[1].trim(); continue; }

      // bullets (-, *, •) with indent-based level
      if ((m = line.match(/^(\s*)[-*•]\s+(.*)$/))) {
        const indent = m[1].replace(/\t/g, "  ").length;
        const level = Math.min(1, Math.floor(indent / 2));
        if (cur === "await-sub") { deckSubtitle = deckSubtitle || m[2].trim(); continue; }
        if (!cur || cur.type !== "content") { push(cur && cur !== "await-sub" ? cur : null); cur = newContent(""); col = 0; }
        (col ? cur.right : cur.bullets).push({ text: m[2].trim(), level });
        continue;
      }

      // plain line
      const indent = (line.match(/^(\s*)/)[1] || "").replace(/\t/g, "  ").length;
      if (cur === "await-sub") { deckSubtitle = deckSubtitle || trimmed; continue; }
      if (indent >= 2 && cur && cur.type === "content") {    // indented plain = bullet
        (col ? cur.right : cur.bullets).push({ text: trimmed, level: Math.min(1, Math.floor(indent / 2) - 1) >= 0 ? Math.min(1, Math.floor(indent/2)-0) : 0 });
        continue;
      }
      // non-indented plain line = new slide title (or deck title if first)
      if (!deckTitle && !slides.length && (!cur || cur === "await-sub")) { deckTitle = trimmed; cur = "await-sub"; continue; }
      push(cur && cur !== "await-sub" ? cur : null); cur = newContent(trimmed); col = 0;
    }
    push(cur && cur !== "await-sub" ? cur : null);

    return { title: deckTitle || "Untitled deck", subtitle: deckSubtitle, slides };
  }

  // ---------------------------------------------------------------- BUILD
  // W=13.333 x 7.5 in (16:9). Returns a pptxgenjs instance.
  function buildPptx(PptxGenJS, outline, themeKey, opts = {}) {
    const t = THEMES[themeKey] || THEMES.nexora;
    const logo = opts.logoDataUrl && t.logo ? opts.logoDataUrl : null;
    const p = new PptxGenJS();
    p.defineLayout({ name: "N169", width: 13.333, height: 7.5 });
    p.layout = "N169";
    p.author = "Nexora Slide Maker";
    const W = 13.333, H = 7.5, MX = 0.9;
    const dark = isDark(t.bg);

    // ----- title slide
    const title = p.addSlide(); title.background = { color: t.band };
    title.addShape(p.ShapeType.rect, { x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: t.accent } });
    title.addShape(p.ShapeType.rect, { x: MX, y: 3.05, w: 1.5, h: 0.09, fill: { color: t.accent } });
    title.addText(outline.title, { x: MX, y: 3.25, w: W - MX * 2, h: 1.7, fontFace: t.head, fontSize: 44, bold: true, color: t.bandText, align: "left", valign: "top", lineSpacing: 46 });
    if (outline.subtitle) title.addText(outline.subtitle, { x: MX, y: 4.95, w: W - MX * 2, h: 0.8, fontFace: t.body, fontSize: 20, color: t.bandText, align: "left", transparency: 10 });
    if (logo) title.addImage({ data: logo, x: MX, y: 0.7, h: 0.72, w: 0.72 * opts.logoRatio });

    // ----- content/section/quote slides
    const total = outline.slides.length;
    outline.slides.forEach((s, i) => {
      if (s.type === "section") return addSection(p, t, s, opts);
      if (s.type === "quote") return addQuote(p, t, s, opts);
      addContent(p, t, s, opts, i + 2, total + 1);
    });

    // ----- closing (only if last slide wasn't already a "thank you" section)
    return p;
  }

  function addSection(p, t, s, opts) {
    const sl = p.addSlide(); sl.background = { color: t.band };
    sl.addShape(p.ShapeType.rect, { x: 0, y: 3.5, w: 1.5 + 0.9, h: 0.09, fill: { color: t.accent } });
    sl.addText(s.title, { x: 0.9, y: 3.0, w: 11.5, h: 1.5, fontFace: t.head, fontSize: 34, bold: true, color: t.bandText, align: "left", valign: "middle" });
  }

  function addQuote(p, t, s, opts) {
    const sl = p.addSlide(); sl.background = { color: t.bg };
    sl.addText("\u201C", { x: 0.7, y: 0.6, w: 3, h: 2.2, fontFace: "Georgia", fontSize: 160, bold: true, color: t.accent, align: "left", valign: "top" });
    sl.addText(s.quote || "", { x: 1.4, y: 2.2, w: 10.5, h: 3, fontFace: "Georgia", fontSize: 30, italic: true, color: t.title, align: "left", valign: "middle", lineSpacing: 40 });
    if (s.attribution) sl.addText("— " + s.attribution, { x: 1.4, y: 5.4, w: 10.5, h: 0.6, fontFace: t.body, fontSize: 18, color: t.muted, align: "left" });
  }

  function addContent(p, t, s, opts, pageNo, pageTot) {
    const W = 13.333, MX = 0.9;
    const sl = p.addSlide(); sl.background = { color: t.bg };
    if (s.title) {
      sl.addText(s.title, { x: MX, y: 0.62, w: W - MX * 2, h: 0.9, fontFace: t.head, fontSize: 28, bold: true, color: t.title, align: "left", valign: "top" });
      sl.addShape(p.ShapeType.rect, { x: MX, y: 1.5, w: 1.1, h: 0.07, fill: { color: t.accent } });
    }
    const top = s.title ? 1.85 : 0.8;
    const twoCol = s.right && s.right.length;
    if (twoCol) {
      addBullets(p, sl, t, s.bullets, MX, top, 5.6, 5.0);
      addBullets(p, sl, t, s.right, MX + 6.1, top, 5.6, 5.0);
    } else {
      addBullets(p, sl, t, s.bullets, MX, top, W - MX * 2, 5.0);
    }
    // footer: page number + subtle rule
    sl.addText(String(pageNo - 1), { x: W - 1.2, y: 7.0, w: 0.7, h: 0.3, fontFace: t.body, fontSize: 10, color: t.muted, align: "right" });
    if (opts.logoDataUrl && t.logo) sl.addImage({ data: opts.logoDataUrl, x: MX, y: 6.92, h: 0.34, w: 0.34 * opts.logoRatio, transparency: 15 });
  }

  function addBullets(p, sl, t, items, x, y, w, h) {
    if (!items || !items.length) return;
    const runs = items.map(b => ({
      text: b.text,
      options: { bullet: { indent: 14 }, indentLevel: b.level || 0, fontFace: t.body, fontSize: b.level ? 16 : 18,
        color: b.level ? t.muted : t.text, paraSpaceAfter: 8, breakLine: true },
    }));
    sl.addText(runs, { x, y, w, h, valign: "top", lineSpacing: 26 });
  }

  // ---------------------------------------------------------------- utils
  function isDark(hex) {
    const n = parseInt(hex, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  }

  const API = { THEMES, SAMPLE, parseOutline, buildPptx };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.NexoraSlides = API;
})(typeof window !== "undefined" ? window : null);
