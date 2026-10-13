import { useState, useMemo, useEffect, useRef } from "react";
import {
  DEFAULT_SETTINGS, mergeSettings, evaluateGroups, dealCheck, suggestGroups, sumKosten, groupLabel, eur,
} from "./logic.js";
import {
  loadInserate, insertInserate, patchInserat, deleteInserat, deleteAllInserate, loadSettings, saveSettings,
  analyzeImages, fileToDataUrl, extractFrames, dedupe,
} from "./db.js";

/* ---------- kleine UI-Bausteine ---------- */
const C = { bg: "#f3f4f6", card: "#fff", line: "#e5e7eb", text: "#111827", mute: "#6b7280", soft: "#9ca3af", main: "#2563eb", mainBg: "#dbeafe" };
const card = { background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 };
const inputStyle = { width: "100%", background: "#fff", border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "11px 12px", color: C.text, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 };
const h = { fontSize: 11, fontWeight: 700, color: C.soft, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 };
const btn = (primary = true, disabled = false) => ({
  padding: "12px 14px", borderRadius: 11, cursor: disabled ? "default" : "pointer", fontWeight: 700, fontSize: 14,
  border: primary ? "none" : `1.5px solid ${C.line}`, background: primary ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#fff",
  color: primary ? "#fff" : C.mute, opacity: disabled ? 0.5 : 1,
});
const STATUS = {
  KAUFEN: { bg: "#dcfce7", border: "#86efac", color: "#15803d", icon: "✅", title: "KAUFEN" },
  VERHANDELN: { bg: "#fef3c7", border: "#fcd34d", color: "#b45309", icon: "🤝", title: "VERHANDELN" },
  FINGER_WEG: { bg: "#fee2e2", border: "#fca5a5", color: "#b91c1c", icon: "🛑", title: "FINGER WEG" },
};
const GRAY = { bg: "#f3f4f6", border: "#d1d5db", color: "#4b5563", icon: "ℹ️" };
const BEW = { Attraktiv: ["#dcfce7", "#15803d"], Prüfen: ["#fef3c7", "#b45309"], Meiden: ["#fee2e2", "#b91c1c"], "–": ["#f3f4f6", "#6b7280"] };

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.soft, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function Num({ value, onChange, pct, step, placeholder, style }) {
  const shown = value === null || value === undefined || value === "" ? "" : pct ? Math.round(value * 1000) / 10 : value;
  return (
    <input
      type="number" inputMode="decimal" step={step} placeholder={placeholder} value={shown} style={{ ...inputStyle, ...style }}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange("");
        onChange(pct ? Number(v) / 100 : Number(v));
      }}
    />
  );
}
function Row({ k, v, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid #f3f4f6`, fontSize: 14 }}>
      <span style={{ color: C.mute }}>{k}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

/* ---------- Haupt-App ---------- */
export default function App() {
  const [tab, setTab] = useState("deal");
  const [inserate, setInserate] = useState([]);
  const [settings, setSettings] = useState(mergeSettings(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(() => { try { return localStorage.getItem("appcode") || ""; } catch { return ""; } });
  const loaded = useRef(false);

  useEffect(() => {
    Promise.all([loadInserate(), loadSettings()])
      .then(([ins, s]) => { setInserate(ins); setSettings(mergeSettings(s)); })
      .catch((e) => setError("Verbindung zur Datenbank fehlgeschlagen. Wurde das SQL in Supabase ausgeführt? (" + e.message.slice(0, 120) + ")"))
      .finally(() => { setLoading(false); setTimeout(() => (loaded.current = true), 0); });
  }, []);

  // Einstellungen automatisch speichern
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => saveSettings(settings).catch((e) => setError("Einstellungen konnten nicht gespeichert werden: " + e.message.slice(0, 100))), 800);
    return () => clearTimeout(t);
  }, [settings]);

  const evals = useMemo(() => evaluateGroups(inserate, settings), [inserate, settings]);
  const saveCode = (c) => { setCode(c); try { localStorage.setItem("appcode", c); } catch {} };

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.mute, fontFamily: "system-ui" }}>Lade Daten…</div>;

  const tabs = [["deal", "Deal-Check"], ["markt", "Markt"], ["inserate", `Inserate (${inserate.length})`], ["settings", "Einstellungen"]];
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: `1.5px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 12px" }}>
          <div style={{ padding: "14px 4px 8px", fontSize: 20, fontWeight: 800 }}>🚗 Auto Deal-Check</div>
          <div style={{ display: "flex", overflowX: "auto" }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: "1 0 auto", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, fontWeight: tab === k ? 800 : 500, color: tab === k ? C.main : C.mute, borderBottom: `2.5px solid ${tab === k ? C.main : "transparent"}` }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 12px 80px" }}>
        {error && (
          <div style={{ ...card, background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c", fontSize: 13, display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>⚠️ {error}</div>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.soft }}>✕</button>
          </div>
        )}
        {tab === "deal" && <DealTab settings={settings} evals={evals} code={code} setError={setError} goto={setTab} />}
        {tab === "markt" && <MarktTab evals={evals} goto={setTab} />}
        {tab === "inserate" && <InserateTab inserate={inserate} setInserate={setInserate} code={code} saveCode={saveCode} setError={setError} />}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} inserate={inserate} />}
      </div>
    </div>
  );
}

/* ---------- Deal-Check ---------- */
function DealTab({ settings, evals, code, setError, goto }) {
  const [f, setF] = useState({ bj: "", km: "", preis: "" });
  const [ms, setMs] = useState([]);
  const [zs, setZs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const r = useMemo(() => dealCheck({ ...f, massnahmen: ms, zustand: zs }, evals, settings), [f, ms, zs, evals, settings]);
  const st = STATUS[r.status] || GRAY;

  async function fromScreenshot(file) {
    if (!file) return;
    setBusy(true); setNote("");
    try {
      const img = await fileToDataUrl(file);
      const list = await analyzeImages([img], code);
      if (!list.length) { setNote("Kein Inserat erkannt. Bitte ein klareres Bild versuchen oder von Hand eintragen."); return; }
      const l = list[0];
      setF({ bj: l.baujahr ?? "", km: l.km ?? "", preis: l.preis ?? "" });
      setNote(`Erkannt: ${l.modell || "Fahrzeug"}. Bitte die Werte kurz prüfen.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div style={card}>
        <div style={h}>1 · Angebot eingeben</div>
        <label style={{ ...btn(false), display: "block", textAlign: "center", marginBottom: 12 }}>
          {busy ? "KI liest das Bild…" : "📷 Aus Screenshot ausfüllen"}
          <input type="file" accept="image/*" disabled={busy} style={{ display: "none" }} onChange={(e) => { fromScreenshot(e.target.files[0]); e.target.value = ""; }} />
        </label>
        {note && <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>{note}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Baujahr"><Num value={f.bj} onChange={(v) => setF({ ...f, bj: v })} placeholder="2012" /></Field>
          <Field label="Kilometer"><Num value={f.km} onChange={(v) => setF({ ...f, km: v })} placeholder="85000" /></Field>
        </div>
        <Field label="Angebotspreis des Verkäufers (€)"><Num value={f.preis} onChange={(v) => setF({ ...f, preis: v })} placeholder="3900" /></Field>
      </div>

      <div style={{ ...card, background: st.bg, borderColor: st.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 30 }}>{st.icon}</span>
          <div style={{ fontSize: STATUS[r.status] ? 28 : 16, fontWeight: 900, color: st.color }}>{STATUS[r.status] ? st.title : "Noch kein Ergebnis"}</div>
        </div>
        <div style={{ fontSize: 15, color: st.color, fontWeight: 600, lineHeight: 1.45 }}>{r.headline}</div>
        {r.hint && <div style={{ fontSize: 13, color: C.mute, marginTop: 8 }}>{r.hint}</div>}
        {(r.status === "ZU_WENIG_DATEN" || r.status === "KEINE_GRUPPE") && (
          <button style={{ ...btn(true), marginTop: 12 }} onClick={() => goto(r.status === "KEINE_GRUPPE" ? "settings" : "inserate")}>
            {r.status === "KEINE_GRUPPE" ? "Zu den Einstellungen" : "Inserate einlesen"}
          </button>
        )}
        {r.label && <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>Markt-Gruppe: {r.label} · {r.ev?.n} Inserate</div>}
      </div>

      {r.warnings?.length > 0 && (
        <div style={{ ...card, background: "#fffbeb", borderColor: "#fde68a" }}>
          <div style={{ ...h, color: "#b45309" }}>Beachte</div>
          {r.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: "#78350f", marginBottom: 6, lineHeight: 1.45 }}>• {w}</div>)}
        </div>
      )}

      {STATUS[r.status] && (
        <div style={card}>
          <div style={h}>Dein Plan</div>
          <Row k="1. Erstes Angebot an den Verkäufer" v={eur(r.startgebot)} bold color={C.main} />
          <Row k="2. Obergrenze: nie mehr zahlen als" v={eur(r.maxEK)} bold color="#b91c1c" />
          <Row k="3. Danach inserieren für" v={eur(r.inserierenFuer)} bold />
          <Row k="4. Realistisch erzielst du" v={eur(r.vk)} />
          <Row k="5. Nicht verkaufen unter (Gewinn 0 €)" v={eur(r.breakEven)} />
          <Row k="Erwarteter Gewinn beim Angebotspreis" v={`${eur(r.gewinn)}${r.rendite !== null ? ` (${(r.rendite * 100).toFixed(0)} %)` : ""}`} bold color={r.gewinn >= settings.wunschgewinn ? "#15803d" : r.gewinn >= 0 ? "#b45309" : "#b91c1c"} />
          <div style={{ fontSize: 11, color: C.soft, marginTop: 8, lineHeight: 1.5 }}>
            Das erste Angebot liegt {Math.round(settings.startabschlag * 100)} % unter deiner Obergrenze, damit du Verhandlungsraum hast. Beim Inserieren ist der Verhandlungsabschlag von {Math.round(settings.abschlag * 100)} % schon eingerechnet.
          </div>
        </div>
      )}

      <div style={card}>
        <div style={h}>2 · Was machst du selbst am Auto?</div>
        {settings.massnahmen.map((m) => {
          const netto = m.effekt - m.kosten;
          return (
            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
              <input type="checkbox" checked={ms.includes(m.id)} onChange={() => toggle(ms, setMs, m.id)} style={{ width: 20, height: 20 }} />
              <span style={{ flex: 1, fontSize: 14 }}>{m.name}<span style={{ display: "block", fontSize: 11, color: C.soft }}>Kosten {eur(m.kosten)} · Mehrwert {eur(m.effekt)}</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: netto >= 0 ? "#15803d" : "#b91c1c" }}>{netto >= 0 ? "lohnt sich" : "lohnt nicht"}</span>
            </label>
          );
        })}
      </div>

      <div style={card}>
        <div style={h}>3 · Zustand und Ausstattung</div>
        {settings.zustand.map((z) => (
          <label key={z.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
            <input type="checkbox" checked={zs.includes(z.id)} onChange={() => toggle(zs, setZs, z.id)} style={{ width: 20, height: 20 }} />
            <span style={{ flex: 1, fontSize: 14 }}>{z.name}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: z.effekt >= 0 ? "#15803d" : "#b91c1c" }}>{z.effekt >= 0 ? "+" : ""}{eur(z.effekt)}</span>
          </label>
        ))}
      </div>

      {STATUS[r.status] && (
        <details style={card}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Die Zahlen dahinter</summary>
          <div style={{ marginTop: 10 }}>
            <Row k="Marktpreis (günstigste Inserate der Gruppe)" v={eur(r.markt)} />
            <Row k={`Verkaufspreis nach ${Math.round(settings.abschlag * 100)} % Verhandlungsabschlag`} v={eur(r.vkBasis)} />
            <Row k="Preiseffekt aus deinen Haken" v={`${r.effekt >= 0 ? "+" : ""}${eur(r.effekt)}`} />
            <Row k="Angepasster Verkaufspreis" v={eur(r.vk)} bold />
            <Row k="Standardkosten pro Auto" v={eur(r.ev.kosten)} />
            <Row k="Zusatzkosten der Maßnahmen" v={eur(r.zusatzKosten)} />
            <Row k="Wunschgewinn" v={eur(r.wunschgewinn)} />
            <Row k="Max. Einkaufspreis" v={eur(r.maxEK)} bold />
            <Row k="Abstand Angebot zum Maximum (+ = zu teuer)" v={eur(r.abstand)} />
            <Row k="Verkaufstempo der Gruppe" v={`${r.ev.tempo}${r.ev.tageAvg ? ` (Ø ${Math.round(r.ev.tageAvg)} Tage)` : ""}`} />
            <Row k="Preisstabilität" v={r.ev.stabilitaet} />
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------- Markt ---------- */
function MarktTab({ evals, goto }) {
  const active = evals.filter((e) => !e.empty);
  const sorted = [...active].sort((a, b) => b.punkte - a.punkte || b.maxEK - a.maxEK);
  const best = sorted.find((e) => e.bewertung === "Attraktiv") || null;
  if (!active.length) {
    return (
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Noch keine Marktdaten</div>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 12 }}>Lies Inserate per Screenshot oder Video ein. Danach siehst du hier, welche Autos sich zum Ankauf lohnen.</div>
        <button style={btn()} onClick={() => goto("inserate")}>Inserate einlesen</button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ ...card, background: best ? "#dcfce7" : "#fef3c7", borderColor: best ? "#86efac" : "#fcd34d" }}>
        <div style={h}>Beste Gruppe aktuell</div>
        {best ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{best.label}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Hier darfst du bis <b>{eur(best.maxEK)}</b> einkaufen und verkaufst für etwa <b>{eur(best.vk)}</b>.</div>
          </>
        ) : <div style={{ fontSize: 14 }}>Keine Gruppe ist aktuell "Attraktiv". Mehr Inserate oder angepasste Einstellungen können das ändern.</div>}
      </div>
      {sorted.map((e) => {
        const [bg, fg] = BEW[e.bewertung] || BEW["–"];
        return (
          <div key={e.group.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{e.label}</div>
              <span style={{ background: bg, color: fg, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{e.bewertung}</span>
            </div>
            <Row k="Inserate" v={`${e.n}${e.datenbasis === "zu dünn" ? " (zu dünn)" : ""}`} color={e.datenbasis === "zu dünn" ? "#b45309" : undefined} />
            <Row k="Marktpreis" v={eur(e.markt)} />
            <Row k="Realistischer Verkaufspreis" v={eur(e.vk)} />
            <Row k="MAX. EINKAUFSPREIS" v={eur(e.maxEK)} bold color={e.maxEK > 0 ? "#15803d" : "#b91c1c"} />
            <Row k="Tempo" v={e.tempo + (e.tageAvg ? ` (Ø ${Math.round(e.tageAvg)} Tage)` : "")} />
            <Row k="Preisstabilität" v={e.stabilitaet} />
            <Row k="Preisspanne" v={`${eur(e.min)} – ${eur(e.max)}`} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Inserate ---------- */
function InserateTab({ inserate, setInserate, code, saveCode, setError }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [review, setReview] = useState(null);
  const [manual, setManual] = useState({ modell: "", baujahr: "", km: "", preis: "", tage: "" });

  async function run() {
    if (!files.length) return;
    setBusy(true); setReview(null);
    try {
      let images = [];
      for (const f of files) {
        if (f.type.startsWith("video/")) {
          setStatus("Video wird in Einzelbilder zerlegt…");
          images.push(...(await extractFrames(f, { onProgress: (p) => setStatus(`Video wird zerlegt… ${Math.round(p * 100)} %`) })));
        } else images.push(await fileToDataUrl(f));
      }
      const all = [];
      const size = 4;
      for (let i = 0; i < images.length; i += size) {
        setStatus(`KI liest Bilder ${Math.min(i + size, images.length)} von ${images.length}…`);
        all.push(...(await analyzeImages(images.slice(i, i + size), code)));
      }
      const unique = dedupe(all, inserate);
      setReview(unique.map((l) => ({ ...l, use: true })));
      setStatus(unique.length ? `${unique.length} neue Inserate erkannt. Bitte kurz prüfen und speichern.` : "Keine neuen Inserate erkannt (oder alle schon vorhanden).");
    } catch (e) { setError(e.message); setStatus(""); }
    finally { setBusy(false); }
  }

  async function saveReview() {
    const rows = review.filter((r) => r.use).map((r) => ({ ...r, quelle: files.some((f) => f.type.startsWith("video/")) ? "Video" : "Screenshot" }));
    try {
      const saved = await insertInserate(rows);
      setInserate((x) => [...x, ...saved]);
      setReview(null); setFiles([]); setStatus(`${saved.length} Inserate gespeichert.`);
    } catch (e) { setError("Speichern fehlgeschlagen: " + e.message.slice(0, 120)); }
  }

  async function addManual() {
    try {
      const saved = await insertInserate([{ ...manual, quelle: "manuell" }]);
      setInserate((x) => [...x, ...saved]);
      setManual({ modell: "", baujahr: "", km: "", preis: "", tage: "" });
    } catch (e) { setError(e.message.slice(0, 120)); }
  }

  const setR = (i, k, v) => setReview(review.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const cell = { ...inputStyle, padding: "7px 8px", fontSize: 13 };

  return (
    <div>
      <div style={card}>
        <div style={h}>Inserate per KI einlesen</div>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 10 }}>
          Mach Screenshots der Suchergebnisse oder nimm ein Video auf, während du langsam durch die Liste scrollst. Die KI liest Baujahr, km und Preis aus.
        </div>
        <Field label="Zugangscode (falls in Vercel gesetzt)"><input style={inputStyle} type="password" value={code} onChange={(e) => saveCode(e.target.value)} placeholder="optional" /></Field>
        <label style={{ ...btn(false), display: "block", textAlign: "center", marginBottom: 10 }}>
          {files.length ? `${files.length} Datei(en) gewählt` : "📷 Screenshots oder 🎥 Video wählen"}
          <input type="file" multiple accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => { setFiles([...e.target.files]); setReview(null); }} />
        </label>
        <button style={{ ...btn(true, busy || !files.length), width: "100%" }} disabled={busy || !files.length} onClick={run}>{busy ? "Bitte warten…" : "Inserate auslesen"}</button>
        {status && <div style={{ fontSize: 13, color: C.mute, marginTop: 10 }}>{status}</div>}
      </div>

      {review && review.length > 0 && (
        <div style={card}>
          <div style={h}>Prüfen und speichern</div>
          {review.map((r, i) => (
            <div key={i} style={{ borderBottom: "1px solid #f3f4f6", padding: "8px 0", opacity: r.use ? 1 : 0.4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input type="checkbox" checked={r.use} onChange={(e) => setR(i, "use", e.target.checked)} style={{ width: 18, height: 18 }} />
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{r.modell || "Fahrzeug"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr", gap: 6 }}>
                <input style={cell} type="number" value={r.baujahr ?? ""} onChange={(e) => setR(i, "baujahr", e.target.value === "" ? null : +e.target.value)} placeholder="Bj" />
                <input style={cell} type="number" value={r.km ?? ""} onChange={(e) => setR(i, "km", e.target.value === "" ? null : +e.target.value)} placeholder="km" />
                <input style={cell} type="number" value={r.preis ?? ""} onChange={(e) => setR(i, "preis", e.target.value === "" ? null : +e.target.value)} placeholder="Preis" />
                <input style={cell} type="number" value={r.tage ?? ""} onChange={(e) => setR(i, "tage", e.target.value === "" ? null : +e.target.value)} placeholder="Tage" />
              </div>
            </div>
          ))}
          <button style={{ ...btn(), width: "100%", marginTop: 12 }} onClick={saveReview}>{review.filter((r) => r.use).length} Inserate speichern</button>
        </div>
      )}

      <div style={card}>
        <div style={h}>Einzelnes Inserat von Hand</div>
        <Field label="Modell"><input style={inputStyle} value={manual.modell} onChange={(e) => setManual({ ...manual, modell: e.target.value })} placeholder="Citroën C1 1.0" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Baujahr"><Num value={manual.baujahr} onChange={(v) => setManual({ ...manual, baujahr: v })} /></Field>
          <Field label="Kilometer"><Num value={manual.km} onChange={(v) => setManual({ ...manual, km: v })} /></Field>
          <Field label="Preis (€)"><Num value={manual.preis} onChange={(v) => setManual({ ...manual, preis: v })} /></Field>
          <Field label="Tage online (optional)"><Num value={manual.tage} onChange={(v) => setManual({ ...manual, tage: v })} /></Field>
        </div>
        <button style={{ ...btn(true, !manual.baujahr || !manual.km || !manual.preis), width: "100%" }} disabled={!manual.baujahr || !manual.km || !manual.preis} onClick={addManual}>Hinzufügen</button>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ ...h, marginBottom: 0 }}>Gespeicherte Inserate ({inserate.length})</div>
          {inserate.length > 0 && (
            <button style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              onClick={async () => { if (confirm("Wirklich ALLE Inserate löschen?")) { try { await deleteAllInserate(); setInserate([]); } catch (e) { setError(e.message.slice(0, 100)); } } }}>Alle löschen</button>
          )}
        </div>
        {inserate.length === 0 && <div style={{ fontSize: 13, color: C.soft }}>Noch keine Inserate.</div>}
        {[...inserate].reverse().map((i) => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f3f4f6", opacity: i.ausschliessen ? 0.4 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.modell || "Fahrzeug"}</div>
              <div style={{ fontSize: 12, color: C.mute }}>Bj {i.baujahr} · {i.km?.toLocaleString("de-DE")} km{i.tage != null ? ` · ${i.tage} Tage` : ""} · {i.quelle}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{eur(i.preis)}</div>
            <button title="Ausschließen" onClick={async () => { try { await patchInserat(i.id, { ausschliessen: !i.ausschliessen }); setInserate((x) => x.map((y) => (y.id === i.id ? { ...y, ausschliessen: !y.ausschliessen } : y))); } catch (e) { setError(e.message.slice(0, 100)); } }} style={{ ...btn(false), padding: "6px 9px", fontSize: 12 }}>{i.ausschliessen ? "↩︎" : "🚫"}</button>
            <button title="Löschen" onClick={async () => { try { await deleteInserat(i.id); setInserate((x) => x.filter((y) => y.id !== i.id)); } catch (e) { setError(e.message.slice(0, 100)); } }} style={{ ...btn(false), padding: "6px 9px", fontSize: 12 }}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Einstellungen ---------- */
function SettingsTab({ settings: s, setSettings, inserate }) {
  const set = (k, v) => setSettings({ ...s, [k]: v });
  const setK = (k, v) => setSettings({ ...s, kosten: { ...s.kosten, [k]: v === "" ? 0 : v } });
  const upd = (key, id, patch) => setSettings({ ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const del = (key, id) => setSettings({ ...s, [key]: s[key].filter((x) => x.id !== id) });
  const nextId = (key, prefix) => prefix + (Date.now() % 1e9);
  const mini = { ...inputStyle, padding: "8px 8px", fontSize: 13 };

  return (
    <div>
      <div style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe", fontSize: 13, color: "#1e3a8a", lineHeight: 1.5 }}>
        Alle Werte sind Platzhalter. Ersetze sie durch deine Erfahrungswerte, denn die Ampel ist nur so gut wie diese Annahmen. Änderungen werden automatisch gespeichert.
      </div>

      <div style={card}>
        <div style={h}>Marktpreis-Berechnung</div>
        <Field label="Verhandlungsabschlag auf Angebotspreise (%)" hint="Angebotspreise liegen meist über dem echten Verkaufspreis."><Num pct value={s.abschlag} onChange={(v) => set("abschlag", v)} /></Field>
        <Field label="Anteil günstigster Inserate für den Marktpreis (%)" hint="Nur die günstigsten x % einer Gruppe bestimmen den Marktpreis. Mondpreise ziehen den Schnitt sonst hoch."><Num pct value={s.anteil} onChange={(v) => set("anteil", v)} /></Field>
        <Field label="Mindestanzahl Inserate pro Gruppe"><Num value={s.minInserate} onChange={(v) => set("minInserate", v)} /></Field>
      </div>

      <div style={card}>
        <div style={h}>Kosten pro Fahrzeug</div>
        {[["aufbereitung", "Aufbereitung"], ["tuev", "TÜV/HU und Kleinreparaturen"], ["inserat", "Inseratskosten"], ["gewaehrleistung", "Gewährleistungsrücklage"], ["sonstiges", "Sonstiges (Transport, Zulassung)"]].map(([k, l]) => (
          <Field key={k} label={`${l} (€)`}><Num value={s.kosten[k]} onChange={(v) => setK(k, v)} /></Field>
        ))}
        <Row k="Summe Kosten pro Auto" v={eur(sumKosten(s))} bold />
        <div style={{ height: 12 }} />
        <Field label="Wunschgewinn pro Auto (€)"><Num value={s.wunschgewinn} onChange={(v) => set("wunschgewinn", v)} /></Field>
      </div>

      <div style={card}>
        <div style={h}>Ampel und Bewertung</div>
        <Field label="Deal-Check: Verhandlungsspielraum (%)" hint="Angebote bis x % über dem Max-Einkaufspreis = VERHANDELN, darüber = FINGER WEG."><Num pct value={s.spielraum} onChange={(v) => set("spielraum", v)} /></Field>
        <Field label="Erstes Angebot: Abschlag auf die Obergrenze (%)"><Num pct value={s.startabschlag} onChange={(v) => set("startabschlag", v)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tempo schnell bis (Tage)"><Num value={s.tempoSchnell} onChange={(v) => set("tempoSchnell", v)} /></Field>
          <Field label="Tempo mittel bis (Tage)"><Num value={s.tempoMittel} onChange={(v) => set("tempoMittel", v)} /></Field>
          <Field label="Preis stabil bis (Streuung %)"><Num pct value={s.stabil} onChange={(v) => set("stabil", v)} /></Field>
          <Field label="Preis mittel bis (Streuung %)"><Num pct value={s.stabilMittel} onChange={(v) => set("stabilMittel", v)} /></Field>
          <Field label="'Attraktiv' ab Punkten (von 6)"><Num value={s.punkteAttraktiv} onChange={(v) => set("punkteAttraktiv", v)} /></Field>
          <Field label="'Prüfen' ab Punkten"><Num value={s.punktePruefen} onChange={(v) => set("punktePruefen", v)} /></Field>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Marktgruppen (Baujahr und Kilometer)</div>
        {s.groups.map((g) => (
          <div key={g.id} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr) auto", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <input style={mini} type="number" value={g.bjVon} onChange={(e) => upd("groups", g.id, { bjVon: +e.target.value })} title="Baujahr von" />
            <input style={mini} type="number" value={g.bjBis} onChange={(e) => upd("groups", g.id, { bjBis: +e.target.value })} title="Baujahr bis" />
            <input style={mini} type="number" value={g.kmVon} onChange={(e) => upd("groups", g.id, { kmVon: +e.target.value })} title="km von" />
            <input style={mini} type="number" value={g.kmBis} onChange={(e) => upd("groups", g.id, { kmBis: +e.target.value })} title="km bis" />
            <button style={{ ...btn(false), padding: "7px 9px" }} onClick={() => del("groups", g.id)}>🗑️</button>
          </div>
        ))}
        <div style={{ fontSize: 11, color: C.soft, marginBottom: 10 }}>Spalten: Baujahr von · bis · km von · bis</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(false)} onClick={() => setSettings({ ...s, groups: [...s.groups, { id: Date.now() % 1e9, bjVon: 2012, bjBis: 2014, kmVon: 60000, kmBis: 90000 }] })}>+ Gruppe</button>
          <button style={btn(true, inserate.length < 3)} disabled={inserate.length < 3} onClick={() => { const g = suggestGroups(inserate, 3); if (g.length) setSettings({ ...s, groups: g }); else alert("Zu wenige Daten für einen Vorschlag."); }}>✨ Aus Inseraten vorschlagen</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Maßnahmen (Kosten und Mehrwert)</div>
        {s.massnahmen.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 6 }}>
              <input style={mini} value={m.name} onChange={(e) => upd("massnahmen", m.id, { name: e.target.value })} />
              <button style={{ ...btn(false), padding: "7px 9px" }} onClick={() => del("massnahmen", m.id)}>🗑️</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input style={mini} type="number" value={m.kosten} onChange={(e) => upd("massnahmen", m.id, { kosten: +e.target.value })} title="Kosten" placeholder="Kosten €" />
              <input style={mini} type="number" value={m.effekt} onChange={(e) => upd("massnahmen", m.id, { effekt: +e.target.value })} title="Mehrwert" placeholder="Mehrwert €" />
            </div>
          </div>
        ))}
        <button style={btn(false)} onClick={() => setSettings({ ...s, massnahmen: [...s.massnahmen, { id: nextId("massnahmen", "m"), name: "Neue Maßnahme", kosten: 0, effekt: 0 }] })}>+ Maßnahme</button>
      </div>

      <div style={card}>
        <div style={h}>Zustand und Ausstattung (Preiseffekt ±)</div>
        {s.zustand.map((z) => (
          <div key={z.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 6, marginBottom: 8 }}>
            <input style={mini} value={z.name} onChange={(e) => upd("zustand", z.id, { name: e.target.value })} />
            <input style={mini} type="number" value={z.effekt} onChange={(e) => upd("zustand", z.id, { effekt: +e.target.value })} />
            <button style={{ ...btn(false), padding: "7px 9px" }} onClick={() => del("zustand", z.id)}>🗑️</button>
          </div>
        ))}
        <button style={btn(false)} onClick={() => setSettings({ ...s, zustand: [...s.zustand, { id: nextId("zustand", "z"), name: "Neuer Punkt", effekt: 0 }] })}>+ Punkt</button>
      </div>

      <button style={{ ...btn(false), width: "100%" }} onClick={() => { if (confirm("Alle Einstellungen auf die Platzhalter zurücksetzen?")) setSettings(structuredClone(DEFAULT_SETTINGS)); }}>Auf Platzhalter zurücksetzen</button>
    </div>
  );
}
