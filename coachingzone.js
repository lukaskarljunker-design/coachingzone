/*
  Coaching Zone – Vanilla JS (BVRP Style) — Voice + Auto-Bucket
  -----------------------------------------------------------------
  ✅ Keine React/Build-Tools nötig. Eine Datei, direkt im Browser lauffähig.
  ✅ Spracheingabe (Web Speech API, de-DE)
  ✅ Bereich-Tabs sind Anzeige; aktiver Bereich wird aus n8n-Antwort gesetzt
  ✅ Markdown-Rendering (leichtgewichtig)
  ✅ Verlauf (localStorage)

  Einbindung in HTML:
  <script>
    window.CoachingZoneConfig = {
      webhookUrl: "https://n8n.srv785393.hstgr.cloud/webhook/cc723c5f-c860-48ed-b816-12b2a5c0b29c/chat",
      mountId: "coaching-zone"
    };
  </script>
  <div id="coaching-zone"></div>
  <script src="https://CDN-ODER-GITHUB-PFAD/coachingzone-vanilla.js" defer></script>

  Erwartetes n8n-Output (bevorzugt):
  {
    "answer": "Markdown …",
    "bucket": "schlagtechnik", // einer von: trainingsprozess|lauftechnik|schlagtechnik|taktik|athletik
    "sources": [{"title":"…","url":"https://…"}]
  }
  Alternativ (kompatibel):
  [ { "output": "Markdown …", "bucket": "schlagtechnik" } ]
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
      examples: [
        { label: "Übung: Lift-Longline sicher lernen", q: "Welche 3-Phasen-Übung eignet sich, um den Lift Longline technisch sauber zu festigen – inkl. Progressionen für U13?", bucket: "schlagtechnik" },
        { label: "Footwork: Einstieg Split-Step", q: "Wie vermittle ich den Split-Step Einsteigern, inkl. 10-Minuten-Aufwärmblock und Fehlerbildern?", bucket: "lauftechnik" },
        { label: "Taktik: Doppel-Return-Varianten", q: "Welche Return-Varianten im Doppel gegen hohes Serve sind sinnvoll und wie trainiere ich die Entscheidung?", bucket: "taktik" },
        { label: "Athletik im Jugendtraining", q: "Gib mir einen 15-Minuten-Athletikblock ohne Geräte für U11 nach dem RAMP-Schema.", bucket: "athletik" },
        { label: "Trainingsprozess planen", q: "Plane eine 60-Minuten-Einheit Schwerpunkt Netzdrop für gemischte Gruppe (U15–U17) mit Differenzierung.", bucket: "trainingsprozess" }
      ]
    },
    (window.CoachingZoneConfig || {})
  );

  // ---------- Utils ----------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const cls = (...s) => s.filter(Boolean).join(" ");
  const escapeHtml = (str) => String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const prettifyHost = (url) => { try { return new URL(url).hostname.replace("www.", ""); } catch(e){ return url; } };

  function loadHistory() { try { return JSON.parse(localStorage.getItem(CONFIG.historyKey) || "[]"); } catch { return []; } }
  function saveHistory(items) { try { localStorage.setItem(CONFIG.historyKey, JSON.stringify(items.slice(0,25))); } catch {}
  }

  function markdownToHtml(md) {
    if (!md) return "";
    return String(md)
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
        let data; try { data = JSON.parse(text); } catch { data = text; }
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, data };
      })
      .catch((err) => { clearTimeout(timer); throw err; });
  }

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
      .cz-chip { padding:.5rem .75rem; font-size:.875rem; border:1px solid #e5e7eb; border-radius:.75rem; background:#fff; }
      .cz-chip.active { background: var(--violet-600); color:#fff; border-color: var(--violet-600); }
      .cz-chip.disabled { opacity:.6; cursor: not-allowed; }
      .cz-textarea { width:100%; border:1px solid #e5e7eb; border-radius:1rem; padding:1rem; resize:none; box-shadow: 0 1px 2px rgba(0,0,0,.02); }
      .cz-actions { display:flex; flex-wrap:wrap; gap:.5rem; justify-content:space-between; align-items:center; margin-top:.5rem; }
      .cz-btn { font-size:.875rem; padding:.5rem .75rem; border-radius:.75rem; border:1px solid #e5e7eb; background:#fff; cursor:pointer; }
      .cz-btn.primary { background: var(--violet-600); color:#fff; border-color: var(--violet-600); }
      .cz-btn.primary:hover { background: var(--violet-700); }
      .cz-btn:disabled { background:#e5e7eb; color:#9ca3af; cursor:not-allowed; }

      .cz-prose p { margin: .25rem 0 .75rem; line-height:1.6; }
      .cz-prose a { color: var(--violet-700); text-decoration: underline; text-underline-offset: 3px; }
      .cz-prose code { background:#f3f4f6; padding:.1rem .35rem; border-radius:.3rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:.85em; }

      .cz-list { list-style:none; padding:0; margin:0; }
      .cz-list li { border:1px solid #e5e7eb; border-radius:.75rem; padding:.5rem .75rem; }
      .cz-list .cz-meta { display:flex; align-items:center; justify-content:space-between; gap:.5rem; color:#6b7280; font-size:.7rem; text-transform:uppercase; letter-spacing:.03em; }

      .cz-note { background:linear-gradient(135deg, #f5f3ff, #ecfeff); border:1px solid #e5e7eb; border-radius:1rem; padding:1rem; }
      .cz-footer { text-align:center; color:#6b7280; font-size:.75rem; padding:2rem 0; }
    `;
    root.appendChild(style);
  }

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
            <a href="#glossary" class="cz-sub">Glossar</a><span>·</span><span>Kein Popup – fest auf dieser Seite</span>
          </div>
        </div>
      </header>

      <main class="cz-container">
        <div class="cz-grid">
          <section>
            <div class="cz-card">
              <div>
                <label class="cz-sub" style="font-weight:600;color:#374151;">Bereich</label>
                <div class="cz-buckets" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin-top:.25rem;">
                  ${CONFIG.buckets.map((b, i) => `<button class="cz-chip ${i===0?"active":""} disabled" data-bucket="${b.key}" disabled title="Bereich wird automatisch von n8n gesetzt">${b.label}</button>`).join("")}
                </div>
              </div>

              <div style="margin-top:1rem;">
                <label class="cz-sub" for="cz-question" style="font-weight:600;color:#374151;display:block;margin-bottom:.25rem;">Deine Frage</label>
                <textarea id="cz-question" class="cz-textarea" rows="3" maxlength="2000" placeholder="Beschreibe präzise, was du brauchst…"></textarea>
                <div class="cz-actions">
                  <button type="button" id="cz-voice" class="cz-btn">🎙️ Spracheingabe</button>
                  <div style="display:flex;gap:.5rem;">
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

    // Refs
    const bucketBtns = $$(".cz-buckets .cz-chip", wrap);
    const questionEl = $("#cz-question", wrap);
    const sendBtn = $("#cz-send", wrap);
    const clearBtn = $("#cz-clear", wrap);
    const voiceBtn = $("#cz-voice", wrap);
    const answerSlot = $("#cz-answer-slot", wrap);
    const examplesWrap = $(".cz-examples", wrap);
    const historyWrap = $("#cz-history", wrap);
    const historyClearBtn = $("#cz-history-clear", wrap);
    const glossaryList = $("#cz-glossary", wrap);

    // State
    let currentBucket = CONFIG.buckets[0].key;
    let isLoading = false;
    let history = loadHistory();

    // Voice
    let recognition = null;
    let speechSupported = false;
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        recognition = new SR();
        recognition.lang = "de-DE";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (evt) => {
          let interim = "", final = "";
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const res = evt.results[i];
            if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
          }
          const base = questionEl.value.replace(/\s+$/, "");
          const merged = (base ? base + " " : "") + (final || interim);
          questionEl.value = merged.trimStart();
          refreshSendState();
          autoGrow(questionEl);
        };
        recognition.onend = () => voiceBtn.textContent = "🎙️ Spracheingabe";
        speechSupported = true;
      }
    } catch {}

    function toggleVoice(){
      if (!speechSupported || !recognition) return;
      const isStop = voiceBtn.textContent.indexOf("Stop") !== -1;
      if (isStop) { try{ recognition.stop(); }catch{} voiceBtn.textContent = "🎙️ Spracheingabe"; }
      else { try{ recognition.start(); }catch{} voiceBtn.textContent = "■ Stop"; }
    }

    // UI helpers
    function setBucket(key) {
      currentBucket = key;
      bucketBtns.forEach((b) => b.classList.toggle("active", b.getAttribute("data-bucket") === key));
    }
    function autoGrow(textarea){ textarea.style.height = "0px"; textarea.style.height = Math.min(textarea.scrollHeight, 240) + "px"; }
    function refreshSendState(){ sendBtn.disabled = isLoading || (questionEl.value.trim().length <= 3); }

    function renderExamples(){
      examplesWrap.innerHTML = CONFIG.examples.map(ex => `<button type="button" class="cz-btn" data-ex='${escapeHtml(JSON.stringify(ex))}'>${escapeHtml(ex.label)}</button>`).join("");
      $$("[data-ex]", examplesWrap).forEach(btn => btn.addEventListener("click", () => {
        const ex = JSON.parse(btn.getAttribute("data-ex"));
        setBucket(ex.bucket);
        questionEl.value = ex.q; autoGrow(questionEl); refreshSendState(); answerSlot.innerHTML = "";
      }));
    }

    function renderGlossary(){
      glossaryList.innerHTML = [
        ["clear","Hoher, weiter Schlag in die hintere Feldhälfte (Clear)."],
        ["lift","Defensiver hoher Schlag aus der vorderen/hinteren Feldhälfte (Lift)."],
        ["longline","Platzierung entlang der Seitenlinie (Longline)."],
        ["drop","Kurzer, präziser Schlag aus dem Hinterfeld ins Vorderfeld."],
        ["split-step","Kleiner beidbeiniger Absprung zur Vorbereitung eines Richtungswechsels."]
      ].map(([k,v])=>`<li style="display:flex;gap:.5rem;align-items:flex-start;"><span style="background:var(--violet-100);border-radius:9999px;padding:.25rem;">🏷️</span><div><div style="font-weight:600;">${escapeHtml(k)}</div><div class="cz-muted" style="color:#374151;">${escapeHtml(v)}</div></div></li>`).join("");
    }

    function renderHistory(){
      if (!history || history.length === 0) { historyWrap.innerHTML = `<p class="cz-sub">Noch keine Anfragen.</p>`; return; }
      historyWrap.innerHTML = `<ul class="cz-list" style="display:flex;flex-direction:column;gap:.5rem;">${history.map(h=>{
        const label = (CONFIG.buckets.find(b=>b.key===h.bucket)||{}).label || h.bucket;
        const time = new Date(h.ts).toLocaleString();
        return `<li><div class="cz-meta"><span>${escapeHtml(label)}</span><span>${escapeHtml(time)}</span></div><p style="font-size:.875rem;margin:.25rem 0;">${escapeHtml(h.q)}</p><button class="cz-sub" data-reopen="1" data-ts="${h.ts}" style="text-decoration:underline;">erneut ansehen</button></li>`;}).join("")}</ul>`;
      $$('button[data-reopen]', historyWrap).forEach(btn=>btn.addEventListener('click', ()=>{
        const ts = +btn.getAttribute('data-ts');
        const h = history.find(x=>x.ts===ts); if(!h) return;
        setBucket(h.bucket); questionEl.value = h.q; autoGrow(questionEl); refreshSendState();
        renderAnswer(h.a, h.s||[]);
      }));
    }

    function renderAnswer(answer, sources){
      const srcHtml = (sources && sources.length) ? `<div style="border-top:1px solid #e5e7eb;margin-top:.75rem;padding-top:.5rem;"><p style="font-size:.875rem;font-weight:600;margin-bottom:.25rem;">Quellen & Links</p><div style="display:flex;flex-direction:column;gap:.35rem;">${sources.map((s,i)=>`<a href="${s.url}" target="_blank" rel="noreferrer" style="font-size:.875rem;text-decoration:underline;text-underline-offset:3px;display:inline-flex;gap:.5rem;align-items:center;"><span style=\"display:inline-flex;align-items:center;justify-content:center;height:20px;width:20px;border-radius:9999px;border:1px solid #d1d5db;font-size:.7rem;\">${i+1}</span><span>${escapeHtml(s.title||prettifyHost(s.url))}</span></a>`).join("")}</div></div>` : "";
      answerSlot.innerHTML = `<article class="cz-card"><h2>Antwort</h2><div class="cz-prose">${markdownToHtml(answer||"(Keine Antwort erhalten)")}</div>${srcHtml}</article>`;
    }

    function renderError(message){
      answerSlot.innerHTML = `<div class="cz-card" style="border-color:#fecaca;background:#fef2f2;"><div style="color:#991b1b;font-size:.9rem;">${escapeHtml(message)}</div></div>`;
    }

    function setLoading(val){
      isLoading = val; refreshSendState();
      if(val){ answerSlot.innerHTML = `<div class="cz-card"><div class="cz-prose"><p class="cz-muted">Lade Antwort…</p></div></div>`; }
    }

    // Events
    questionEl.addEventListener('input', ()=>{ autoGrow(questionEl); refreshSendState(); });
    clearBtn.addEventListener('click', ()=>{ questionEl.value = ''; autoGrow(questionEl); refreshSendState(); answerSlot.innerHTML = ''; questionEl.focus(); });
    historyClearBtn.addEventListener('click', ()=>{ localStorage.removeItem(CONFIG.historyKey); history = []; renderHistory(); });
    voiceBtn.addEventListener('click', toggleVoice);

    sendBtn.addEventListener('click', ()=>{
      if(isLoading) return; const q = questionEl.value.trim(); if(q.length<=3) return;
      setLoading(true);
      const payload = { bucket: currentBucket, question: q };
      postWithTimeout(CONFIG.webhookUrl, payload, CONFIG.requestTimeoutMs)
        .then(({ok,status,data})=>{
          if(!ok){ renderError(`Fehler ${status}: Bitte später erneut versuchen.`); return; }
          let a = ""; let s = []; let detectedBucket;
          if(Array.isArray(data)){
            if(data.length && typeof data[0]==='object'){
              if('output' in data[0]){ a = data.map(x=> (x && x.output)? String(x.output): "").filter(Boolean).join("\n\n"); }
              detectedBucket = data[0].bucket;
            } else { a = JSON.stringify(data,null,2); }
          } else if (data && typeof data==='object'){
            a = data.answer || data.output || data.text || data.message || "";
            s = data.sources || data.links || [];
            detectedBucket = data.bucket;
          } else if (typeof data==='string'){ a = data; }
          if(!a) a = "(Keine Antwort erhalten)";
          const valid = new Set(CONFIG.buckets.map(b=>b.key));
          const useBucket = (detectedBucket && valid.has(detectedBucket)) ? detectedBucket : currentBucket;
          setBucket(useBucket);
          renderAnswer(a, s);
          history = [{ q, a, s, bucket: useBucket, ts: Date.now() }, ...history].slice(0,25);
          saveHistory(history); renderHistory();
        })
        .catch(()=> renderError('Netzwerkfehler oder Timeout. Bitte erneut versuchen.'))
        .finally(()=> setLoading(false));
    });

    // Init
    renderExamples();
    renderGlossary();
    renderHistory();
    refreshSendState();
  }

  function boot(){
    const mountId = CONFIG.mountId || 'coaching-zone';
    let root = document.getElementById(mountId);
    if(!root){ root = document.createElement('div'); root.id = mountId; document.body.appendChild(root); }
    render(root);
  }

  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();

