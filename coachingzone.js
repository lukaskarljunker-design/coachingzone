/*
  Coaching Zone – Vanilla JS (BVRP Style)
  ---------------------------------------
  Drop this file on a CDN (e.g., GitHub Pages) and include:

  <div id="coaching-zone"></div>
  <script src="/path/to/coachingzone.js" defer></script>

  Optional configuration via global variable before the script tag:
  <script>
    window.CoachingZoneConfig = {
      webhookUrl: "https://n8n.srv785393.hstgr.cloud/webhook/cc723c5f-c860-48ed-b816-12b2a5c0b29c/chat",
      mountId: "coaching-zone"
    };
  </script>

  If omitted, defaults are used.
*/
(function () {
  const CONFIG = Object.assign(
    {
      webhookUrl:
        "https://n8n.srv785393.hstgr.cloud/webhook/cc723c5f-c860-48ed-b816-12b2a5c0b29c/chat",
      mountId: "coaching-zone",
      historyKey: "coaching-zone-history",
      requestTimeoutMs: 60000,
      buckets: [
        { key: "trainingsprozess", label: "Trainingsprozess" },
        { key: "lauftechnik", label: "Lauftechnik" },
        { key: "schlagtechnik", label: "Schlagtechnik" },
        { key: "taktik", label: "Taktik" },
        { key: "athletik", label: "Athletik" }
      ],
      glossary: {
        clear: "Hoher, weiter Schlag in die hintere Feldhälfte (Clear).",
        lift: "Defensiver hoher Schlag aus der vorderen/hinteren Feldhälfte (Lift).",
        longline: "Platzierung entlang der Seitenlinie (Longline).",
        drop: "Kurzer, präziser Schlag aus dem Hinterfeld ins Vorderfeld (Drop).",
        "split-step": "Kleiner beidbeiniger Absprung zur Vorbereitung eines Richtungswechsels."
      },
      examples: [
        {
          label: "Übung: Lift-Longline sicher lernen",
          q: "Welche 3-Phasen-Übung eignet sich, um den Lift Longline technisch sauber zu festigen – inkl. Progressionen für U13?",
          bucket: "schlagtechnik"
        },
        {
          label: "Footwork: Einstieg Split-Step",
          q: "Wie vermittle ich den Split-Step Einsteigern, inkl. 10-Minuten-Aufwärmblock und Fehlerbildern?",
          bucket: "lauftechnik"
        },
        {
          label: "Taktik: Doppel-Return-Varianten",
          q: "Welche Return-Varianten im Doppel gegen hohes Serve sind sinnvoll und wie trainiere ich die Entscheidung?",
          bucket: "taktik"
        },
        {
          label: "Athletik im Jugendtraining",
          q: "Gib mir einen 15-Minuten-Athletikblock ohne Geräte für U11 nach dem RAMP-Schema.",
          bucket: "athletik"
        },
        {
          label: "Trainingsprozess planen",
          q: "Plane eine 60-Minuten-Einheit Schwerpunkt Netzdrop für gemischte Gruppe (U15–U17) mit Differenzierung.",
          bucket: "trainingsprozess"
        }
      ]
    },
    (window.CoachingZoneConfig || {})
  );

  // ---------- Utilities ----------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const cls = (...s) => s.filter(Boolean).join(" ");
  const escapeHtml = (str) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  function loadHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.historyKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveHistory(items) {
    try {
      localStorage.setItem(CONFIG.historyKey, JSON.stringify(items.slice(0, 25)));
    } catch (e) {}
  }

  function detectGlossaryHits(text) {
    const hits = [];
    Object.keys(CONFIG.glossary).forEach((k) => {
      const re = new RegExp(`(^|\\b)${k}(\\b|$)`, "i");
      if (re.test(text)) hits.push(k);
    });
    return hits;
  }

  function markdownToHtml(md) {
    if (!md) return "";
    return md
      .replace(/\r/g, "")
      .split(/\n\n+/)
      .map((chunk) =>
        `<p>${escapeHtml(chunk)
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<em>$1</em>")
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1<\/a>')
          .replace(/\n/g, "<br/>")}</p>`
      )
      .join("");
  }

  function prettifyHost(url) {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch (e) {
      return url;
    }
  }

  function postWithTimeout(url, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = text;
        }
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, data };
      })
      .catch((err) => {
        clearTimeout(timer);
        throw err;
      });
  }

  function autoGrow(textarea) {
    textarea.style.height = "0px";
    textarea.style.height = Math.min(textarea.scrollHeight, 240) + "px";
  }

  // ---------- Styles (BVRP look) ----------
  function injectStyles(root) {
    const style = document.createElement("style");
    style.setAttribute("data-coaching-zone", "");
    style.textContent = `
      :root { --violet-50:#f5f3ff; --violet-100:#ede9fe; --violet-600:#7c3aed; --violet-700:#6d28d9; }
      .cz-wrap { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; color:#111827; }
      .cz-muted { color:#6b7280; }
      .cz-container { max-width: 1120px; margin: 0 auto; padding: 1.25rem; }
      .cz-header { position: sticky; top:0; z-index:10; backdrop-filter:saturate(180%) blur(6px); background: rgba(255,255,255,.8); border-bottom:1px solid #e5e7eb; }
      .cz-header-inner { display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.75rem 1rem; max-width:1120px; margin:0 auto; }
      .cz-badge { height:36px; width:36px; border-radius:12px; background: var(--violet-100); display:flex; align-items:center; justify-content:center; box-shadow: 0 1px 1px rgba(0,0,0,.04); }
      .cz-title { font-size: 1.125rem; font-weight:600; line-height:1.25; }
      .cz-sub { font-size:.75rem; color:#6b7280; }
      .cz-grid { display:grid; grid-template-columns: 1fr; gap:1rem; }
      @media (min-width:1024px){ .cz-grid{ grid-template-columns: 2fr 1fr; gap:1.5rem; } }

      .cz-card { background:#fff; border:1px solid #e5e7eb; border-radius:1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); padding:1rem; }
      .cz-card h2 { font-size: .95rem; font-weight:600; margin-bottom:.25rem; }
      .cz-chip { padding:.5rem .75rem; font-size:.875rem; border:1px solid #e5e7eb; border-radius:.75rem; background:#fff; cursor:pointer; }
      .cz-chip.active { background: var(--violet-600); color:#fff; border-color: var(--violet-600); }
      .cz-chip:hover { background:#f8fafc; }

      .cz-textarea { width:100%; border:1px solid #e5e7eb; border-radius:1rem; padding:1rem; resize:none; box-shadow: 0 1px 2px rgba(0,0,0,.02); }
      .cz-actions { position:relative; display:flex; gap:.5rem; justify-content:flex-end; margin-top:.5rem; }
      .cz-btn { font-size:.875rem; padding:.5rem .75rem; border-radius:.75rem; border:1px solid #e5e7eb; background:#fff; cursor:pointer; }
      .cz-btn.primary { background: var(--violet-600); color:#fff; border-color: var(--violet-600); }
      .cz-btn.primary:hover { background: var(--violet-700); }
      .cz-btn:disabled { background:#e5e7eb; color:#9ca3af; cursor:not-allowed; }

      .cz-skeleton > div { border-radius:.5rem; background:#e5e7eb; height:.75rem; margin-bottom:.5rem; }

      .cz-prose p { margin: .25rem 0 .75rem; line-height:1.6; }
      .cz-prose a { color: var(--violet-700); text-decoration: underline; text-underline-offset: 3px; }
      .cz-prose code { background:#f3f4f6; padding:.1rem .35rem; border-radius:.3rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:.85em; }

      .cz-list { list-style:none; padding:0; margin:0; }
      .cz-list li { border:1px solid #e5e7eb; border-radius:.75rem; padding:.5rem .75rem; }
      .cz-list .cz-meta { display:flex; align-items:center; justify-content:space-between; gap:.5rem; color:#6b7280; font-size:.7rem; text-transform:uppercase; letter-spacing:.03em; }

      .cz-footer { text-align:center; color:#6b7280; font-size:.75rem; padding:2rem 0; }
      .cz-note { background:linear-gradient(135deg, #f5f3ff, #ecfeff); border:1px solid #e5e7eb; border-radius:1rem; padding:1rem; }
    `;
    root.appendChild(style);
  }

  // ---------- Render ----------
  function render(rootEl) {
    injectStyles(document.head);

    const wrap = document.createElement("div");
    wrap.className = "cz-wrap";
    wrap.innerHTML = `
      <header class="cz-header">
        <div class="cz-header-inner">
          <div style="display:flex;align-items:center;gap:.75rem;">
            <div class="cz-badge">🏸</div>
            <div>
              <div class="cz-title">Coaching Zone</div>
              <div class="cz-sub">Fragen stellen • Antworten erhalten • BVRP Style</div>
            </div>
          </div>
          <div class="cz-sub" style="display:none;gap:.5rem;align-items:center;">
            <a href="#glossary" class="cz-sub">Glossar</a>
            <span>·</span>
            <span>Kein Popup – fest auf dieser Seite</span>
          </div>
        </div>
      </header>

      <main class="cz-container">
        <div class="cz-grid">
          <section>
            <div class="cz-card">
              <div style="display:flex;flex-direction:column;gap:.5rem;">
                <label class="cz-sub" style="font-weight:600;color:#374151;">Bereich</label>
                <div class="cz-buckets" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;">
                  ${CONFIG.buckets
                    .map(
                      (b, i) =>
                        `<button class="cz-chip ${i === 0 ? "active" : ""}" data-bucket="${b.key}">${b.label}</button>`
                    )
                    .join("")}
                </div>
              </div>

              <div style="margin-top:1rem;">
                <label class="cz-sub" for="cz-question" style="font-weight:600;color:#374151;display:block;margin-bottom:.25rem;">Deine Frage</label>
                <div style="position:relative;">
                  <textarea id="cz-question" class="cz-textarea" rows="3" maxlength="2000" placeholder="Beschreibe präzise, was du brauchst. Beispiel: Plane eine 60‑Minuten‑Einheit zum Netzdrop für U15–U17 mit Differenzierung."></textarea>
                  <div class="cz-actions">
                    <button type="button" id="cz-clear" class="cz-btn">Leeren</button>
                    <button type="button" id="cz-send" class="cz-btn primary" disabled>Frage senden</button>
                  </div>
                </div>
              </div>

              <div style="margin-top:1rem;">
                <p class="cz-sub" style="margin-bottom:.25rem;">Schnell starten (Beispiele):</p>
                <div class="cz-examples" style="display:flex;flex-wrap:wrap;gap:.5rem;"></div>
              </div>

              <div id="cz-answer-slot" style="margin-top:1rem;"></div>
            </div>
          </section>

          <aside>
            <div class="cz-card">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
                <h3 style="font-size:.9rem;font-weight:600;">Verlauf</h3>
                <button id="cz-history-clear" class="cz-sub" style="text-decoration:underline;">löschen</button>
              </div>
              <div id="cz-history"></div>
            </div>

            <div id="glossary" class="cz-card cz-note">
              <h3 style="font-size:.9rem;font-weight:600;margin-bottom:.25rem;">Mini‑Glossar (Badminton)</h3>
              <ul id="cz-glossary" class="cz-list" style="display:flex;flex-direction:column;gap:.5rem;"></ul>
            </div>

            <div class="cz-card cz-note">
              <h3 style="font-size:.9rem;font-weight:600;margin-bottom:.25rem;">Hinweis zur Datennutzung</h3>
              <p class="cz-sub" style="color:#374151;">Bei der Nutzung werden deine Eingaben an den BVRP‑n8n‑Webhook gesendet und dort verarbeitet. Bitte keine personenbezogenen Daten von Kindern/Jugendlichen eingeben.</p>
            </div>
          </aside>
        </div>
      </main>

      <footer class="cz-footer">© ${new Date().getFullYear()} BVRP · Coaching Zone</footer>
    `;

    rootEl.innerHTML = "";
    rootEl.appendChild(wrap);

    // ---------- DOM refs ----------
    const bucketBtns = $$(".cz-buckets .cz-chip", wrap);
    const questionEl = $("#cz-question", wrap);
    const sendBtn = $("#cz-send", wrap);
    const clearBtn = $("#cz-clear", wrap);
    const answerSlot = $("#cz-answer-slot", wrap);
    const examplesWrap = $(".cz-examples", wrap);
    const historyWrap = $("#cz-history", wrap);
    const historyClearBtn = $("#cz-history-clear", wrap);
    const glossaryList = $("#cz-glossary", wrap);

    // ---------- State ----------
    let currentBucket = CONFIG.buckets[0].key;
    let isLoading = false;
    let history = loadHistory();

    function setBucket(key) {
      currentBucket = key;
      bucketBtns.forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-bucket") === key);
      });
    }

    function setLoading(val) {
      isLoading = val;
      sendBtn.disabled = val || (questionEl.value.trim().length <= 3);
      if (val) {
        answerSlot.innerHTML = `
          <div class="cz-card cz-skeleton">
            <div style="width: 120px; height: 14px;"></div>
            <div style="width: 95%; height: 12px;"></div>
            <div style="width: 88%; height: 12px;"></div>
            <div style="width: 70%; height: 12px;"></div>
          </div>`;
      }
    }

    function renderAnswer(answer, sources) {
      const srcHtml = (sources && sources.length)
        ? `<div style="border-top:1px solid #e5e7eb;margin-top:.75rem;padding-top:.5rem;">
             <p style="font-size:.875rem;font-weight:600;margin-bottom:.25rem;">Quellen & Links</p>
             <div style="display:flex;flex-direction:column;gap:.35rem;">
               ${sources
                 .map((s, i) => {
                   const title = s.title || prettifyHost(s.url);
                   return `<a href="${s.url}" target="_blank" rel="noreferrer" style="font-size:.875rem;text-decoration:underline;text-underline-offset:3px;display:inline-flex;gap:.5rem;align-items:center;">
                     <span style="display:inline-flex;align-items:center;justify-content:center;height:20px;width:20px;border-radius:9999px;border:1px solid #d1d5db;font-size:.7rem;">${i + 1}</span>
                     <span>${escapeHtml(title)}</span>
                   </a>`;
                 })
                 .join("")}
             </div>
           </div>`
        : "";

      answerSlot.innerHTML = `
        <article class="cz-card">
          <h2>Antwort</h2>
          <div class="cz-prose">${markdownToHtml(answer || "(Keine Antwort erhalten)")}</div>
          ${srcHtml}
        </article>`;
    }

    function renderError(message) {
      answerSlot.innerHTML = `
        <div class="cz-card" style="border-color:#fecaca;background:#fef2f2;">
          <div style="color:#991b1b;font-size:.9rem;">${escapeHtml(message)}</div>
        </div>`;
    }

    function renderExamples() {
      examplesWrap.innerHTML = CONFIG.examples
        .map(
          (ex) =>
            `<button type="button" class="cz-btn" data-ex="${escapeHtml(
              JSON.stringify(ex)
            )}">${escapeHtml(ex.label)}</button>`
        )
        .join("");

      $$("[data-ex]", examplesWrap).forEach((btn) => {
        btn.addEventListener("click", () => {
          const ex = JSON.parse(btn.getAttribute("data-ex"));
          setBucket(ex.bucket);
          questionEl.value = ex.q;
          autoGrow(questionEl);
          answerSlot.innerHTML = "";
        });
      });
    }

    function renderHistory() {
      if (!history || history.length === 0) {
        historyWrap.innerHTML = `<p class="cz-sub">Noch keine Anfragen.</p>`;
        return;
      }
      historyWrap.innerHTML = `<ul class="cz-list" style="display:flex;flex-direction:column;gap:.5rem;">
        ${history
          .map((h) => {
            const label = (CONFIG.buckets.find((b) => b.key === h.bucket) || {}).label || h.bucket;
            const time = new Date(h.ts).toLocaleString();
            return `<li>
              <div class="cz-meta"><span>${escapeHtml(label)}</span><span>${escapeHtml(time)}</span></div>
              <p style="font-size:.875rem;margin:.25rem 0;">${escapeHtml(h.q)}</p>
              <button class="cz-sub" data-reopen="1" data-ts="${h.ts}" style="text-decoration:underline;">erneut ansehen</button>
            </li>`;
          })
          .join("")}
      </ul>`;

      $$('[data-reopen] button, button[data-reopen]', historyWrap).forEach((btn) => {
        btn.addEventListener("click", () => {
          const ts = +btn.getAttribute("data-ts");
          const h = history.find((x) => x.ts === ts);
          if (!h) return;
          setBucket(h.bucket);
          questionEl.value = h.q;
          autoGrow(questionEl);
          renderAnswer(h.a, h.s || []);
        });
      });
    }

    function renderGlossary() {
      glossaryList.innerHTML = Object.entries(CONFIG.glossary)
        .map(
          ([k, v]) =>
            `<li style="display:flex;gap:.5rem;align-items:flex-start;">
               <span style="background:var(--violet-100);border-radius:9999px;padding:.25rem;">🏷️</span>
               <div>
                 <div style="font-weight:600;">${escapeHtml(k)}</div>
                 <div class="cz-sub" style="color:#374151;">${escapeHtml(v)}</div>
               </div>
             </li>`
        )
        .join("");
    }

    // ---------- Events ----------
    bucketBtns.forEach((btn) =>
      btn.addEventListener("click", () => setBucket(btn.getAttribute("data-bucket")))
    );

    questionEl.addEventListener("input", () => {
      autoGrow(questionEl);
      sendBtn.disabled = isLoading || questionEl.value.trim().length <= 3;
    });

    clearBtn.addEventListener("click", () => {
      questionEl.value = "";
      autoGrow(questionEl);
      answerSlot.innerHTML = "";
      sendBtn.disabled = true;
      questionEl.focus();
    });

    historyClearBtn.addEventListener("click", () => {
      localStorage.removeItem(CONFIG.historyKey);
      history = [];
      renderHistory();
    });

    function ask() {
      if (isLoading) return;
      const q = questionEl.value.trim();
      if (q.length <= 3) return;

      setLoading(true);

      const payload = {
        bucket: currentBucket,
        question: q,
        glossary_hits: detectGlossaryHits(q)
      };

      postWithTimeout(CONFIG.webhookUrl, payload, CONFIG.requestTimeoutMs)
        .then(({ ok, status, data }) => {
          if (!ok) {
            renderError(`Fehler ${status}: Bitte später erneut versuchen.`);
            return;
          }
          const parsed = typeof data === "string" ? { answer: data } : data;
          const a = parsed && parsed.answer ? parsed.answer : "(Keine Antwort erhalten)";
          const s = (parsed && parsed.sources) || [];
          renderAnswer(a, s);
          history = [{ q, a, s, bucket: currentBucket, ts: Date.now() }, ...history].slice(0, 25);
          saveHistory(history);
          renderHistory();
        })
        .catch((err) => {
          renderError("Netzwerkfehler oder Timeout. Bitte erneut versuchen.");
        })
        .finally(() => setLoading(false));
    }

    sendBtn.addEventListener("click", ask);
    questionEl.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        ask();
      }
    });

    // ---------- Initial render ----------
    renderExamples();
    renderHistory();
    renderGlossary();
  }

  // ---------- Bootstrap ----------
  function boot() {
    const mountId = CONFIG.mountId || "coaching-zone";
    let root = document.getElementById(mountId);
    if (!root) {
      root = document.createElement("div");
      root.id = mountId;
      document.body.appendChild(root);
    }
    render(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
