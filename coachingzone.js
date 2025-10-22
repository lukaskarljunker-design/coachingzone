import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Coaching Zone – full layout (BVRP Style)
 * -------------------------------------------------
 * Includes side panels: history, glossary, data notice.
 * Buttons under textarea.
 */

const WEBHOOK_URL_DEFAULT =
  "https://n8n.srv785393.hstgr.cloud/webhook/cc723c5f-c860-48ed-b816-12b2a5c0b29c/chat";

const KNOWLEDGE_BUCKETS = [
  { key: "trainingsprozess", label: "Trainingsprozess" },
  { key: "lauftechnik", label: "Lauftechnik" },
  { key: "schlagtechnik", label: "Schlagtechnik" },
  { key: "taktik", label: "Taktik" },
  { key: "athletik", label: "Athletik" },
];

const MINI_GLOSSARY: Record<string, string> = {
  clear: "Hoher, weiter Schlag in die hintere Feldhälfte (Clear).",
  lift: "Defensiver hoher Schlag aus der vorderen/hinteren Feldhälfte (Lift).",
  longline: "Ball-/Shuttle-Platzierung entlang der Seitenlinie (Longline).",
  drop: "Kurzer, präziser Schlag aus dem Hinterfeld ins Vorderfeld.",
  "split-step": "Kleiner beidbeiniger Absprung zur Vorbereitung eines Richtungswechsels.",
};

const cls = (...s: (string | false | null | undefined)[]) => s.filter(Boolean).join(" ");

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState] as const;
}

function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value, ref]);
}

async function postWithTimeout(url: string, body: any, timeoutMs = 60000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { ok: res.ok, status: res.status, data: json ?? text };
  } finally {
    clearTimeout(t);
  }
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1<\/a>')
      .replace(/\n/g, "<br/>");
  }, [text]);
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function CoachingZone({ webhookUrl }: { webhookUrl?: string }) {
  const url = webhookUrl || WEBHOOK_URL_DEFAULT;
  const [bucket, setBucket] = useState<string>(KNOWLEDGE_BUCKETS[0].key);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title?: string; url: string }[] | null>(null);
  const [history, setHistory] = useLocalStorage<Array<{ q: string; a: string; s?: { title?: string; url: string }[]; bucket: string; ts: number }>>(
    "coaching-zone-history",
    []
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(taRef, question);
  const canAsk = question.trim().length > 3 && !isLoading;

  // Quick examples (Schnellstart)
  const examplePrompts = useMemo(() => ([
    {
      label: "Übung: Lift-Longline sicher lernen",
      q: "Welche 3-Phasen-Übung eignet sich, um den Lift Longline technisch sauber zu festigen – inkl. Progressionen für U13?",
      bucket: "schlagtechnik",
    },
    {
      label: "Footwork: Einstieg Split-Step",
      q: "Wie vermittle ich den Split-Step Einsteigern, inkl. 10-Minuten-Aufwärmblock und Fehlerbildern?",
      bucket: "lauftechnik",
    },
    {
      label: "Taktik: Doppel-Return-Varianten",
      q: "Welche Return-Varianten im Doppel gegen hohes Serve sind sinnvoll und wie trainiere ich die Entscheidung?",
      bucket: "taktik",
    },
    {
      label: "Athletik im Jugendtraining",
      q: "Gib mir einen 15-Minuten-Athletikblock ohne Geräte für U11 nach dem RAMP-Schema.",
      bucket: "athletik",
    },
    {
      label: "Trainingsprozess planen",
      q: "Plane eine 60-Minuten-Einheit Schwerpunkt Netzdrop für gemischte Gruppe (U15–U17) mit Differenzierung.",
      bucket: "trainingsprozess",
    },
  ]), []);

  function useExample(ex: { q: string; bucket: string }) {
    setBucket(ex.bucket);
    setQuestion(ex.q);
    setAnswer(null);
    setSources(null);
    setError(null);
    setTimeout(() => { taRef.current?.focus(); }, 0);
  }

  async function handleAsk(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canAsk) return;
    setIsLoading(true);
    setError(null);
    setAnswer(null);
    setSources(null);
    const payload = { bucket, question: question.trim() };
    const { ok, status, data } = await postWithTimeout(url, payload, 60000);
    if (!ok) {
      setIsLoading(false);
      setError(`Fehler ${status}: Bitte später erneut versuchen.`);
      return;
    }
    let a = "";
    let s: { title?: string; url: string }[] | undefined = [];
    if (Array.isArray(data)) {
      if (data.length && typeof data[0] === "object" && ("output" in data[0])) {
        a = data.map((x: any) => (x && x.output) ? String(x.output) : "").filter(Boolean).join("\n\n");
      } else {
        a = JSON.stringify(data, null, 2);
      }
    } else if (typeof data === "object" && data) {
      a = (data as any).answer || (data as any).output || (data as any).text || (data as any).message || "";
      s = (data as any).sources || (data as any).links || [];
    } else if (typeof data === "string") {
      a = data;
    }
    if (!a) a = "(Keine Antwort erhalten)";
    setAnswer(a);
    setSources(s || null);
    setIsLoading(false);
    setHistory([{ q: question.trim(), a, s, bucket, ts: Date.now() }, ...history].slice(0, 25));
  }

  function resetForm() {
    setQuestion("");
    setAnswer(null);
    setSources(null);
    setError(null);
    taRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/60 border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center shadow-sm">🏸</div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">Coaching Zone</h1>
              <p className="text-xs text-gray-500">Fragen stellen • Antworten erhalten • BVRP Style</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
            <a href="#glossary" className="hover:text-gray-700 underline underline-offset-4">Glossar</a>
            <span>·</span>
            <span>Kein Popup – fest auf dieser Seite</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <form onSubmit={handleAsk}>
              {/* Bereichsauswahl */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Bereich</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {KNOWLEDGE_BUCKETS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBucket(b.key)}
                      className={cls(
                        "px-3 py-2 text-sm rounded-xl border shadow-sm",
                        bucket === b.key ? "bg-violet-600 text-white border-violet-600" : "bg-white hover:bg-violet-50"
                      )}
                      aria-pressed={bucket === b.key}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eingabe */}
              <label htmlFor="question" className="block text-sm font-medium mb-2">Deine Frage</label>
              <textarea
                id="question"
                ref={taRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Beschreibe präzise, was du brauchst."
                className="w-full resize-none rounded-2xl border p-4 shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-200"
                rows={3}
              />
              <div className="mt-3 flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="px-3 py-2 text-sm rounded-xl border hover:bg-gray-50">Leeren</button>
                <button type="submit" disabled={!canAsk} className={cls("px-4 py-2 text-sm rounded-xl text-white", canAsk ? "bg-violet-600 hover:bg-violet-700" : "bg-gray-300 cursor-not-allowed")}>{isLoading ? "Sendet…" : "Frage senden"}</button>
              </div>

              {/* Schnell starten (Beispiele) */}
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Schnell starten (Beispiele):</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => useExample(ex)}
                      className="rounded-full border px-3 py-1.5 text-xs hover:bg-violet-50"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            {isLoading && <div className="mt-4 text-sm text-gray-500">Antwort wird geladen…</div>}
            {!isLoading && answer && <div className="mt-4"><Markdown text={answer} />{sources && sources.length > 0 && (<div className="mt-4 border-t pt-3"><p className="text-sm font-medium mb-2">Quellen & Links</p><div className="flex flex-col gap-2">{sources.map((s, idx) => (<a key={s.url + idx} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline underline-offset-4 hover:no-underline"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs">{idx + 1}</span><span>{s.title || (() => { try { return new URL(s.url).hostname.replace("www.", ""); } catch { return s.url; } })()}</span></a>))}</div></div>)}</div>}
          </div>
        </section>

        <aside className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Verlauf</h3>
              {history.length > 0 && (<button className="text-xs underline underline-offset-4 text-gray-600 hover:text-gray-800" onClick={() => localStorage.removeItem("coaching-zone-history") || window.location.reload()}>löschen</button>)}
            </div>
            {history.length === 0 ? <p className="text-sm text-gray-500">Noch keine Anfragen.</p> : (<ul className="space-y-3">{history.map((h, idx) => (<li key={idx} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2 mb-1"><span className="text-[11px] uppercase tracking-wide text-gray-500">{KNOWLEDGE_BUCKETS.find(b => b.key === h.bucket)?.label || h.bucket}</span><span className="text-[11px] text-gray-400">{new Date(h.ts).toLocaleString()}</span></div><p className="text-sm line-clamp-3 mb-1">{h.q}</p><button className="text-xs text-violet-700 underline underline-offset-4" onClick={() => { setQuestion(h.q); setBucket(h.bucket); setAnswer(h.a); setSources(h.s || null); setError(null); }}>erneut ansehen</button></li>))}</ul>)}
          </div>

          <div id="glossary" className="bg-white rounded-2xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold mb-2">Mini‑Glossar (Badminton)</h3>
            <ul className="text-sm text-gray-700 space-y-2">
              {Object.entries(MINI_GLOSSARY).map(([k, v]) => (<li key={k} className="flex items-start gap-2"><span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100">🏷️</span><div><p className="font-medium">{k}</p><p className="text-gray-500">{v}</p></div></li>))}
            </ul>
          </div>

          <div className="bg-gradient-to-br from-violet-50 to-emerald-50 rounded-2xl border p-4">
            <h3 className="text-sm font-semibold mb-2">Hinweis zur Datennutzung</h3>
            <p className="text-sm text-gray-700">Bei der Nutzung werden deine Eingaben an den BVRP‑n8n‑Webhook gesendet und dort verarbeitet. Bitte keine personenbezogenen Daten von Kindern/Jugendlichen eingeben.</p>
          </div>
        </aside>
      </main>

      <footer className="py-10 text-center text-xs text-gray-500">
        <p>© {new Date().getFullYear()} BVRP · Coaching Zone</p>
      </footer>
    </div>
  );
}
