import { useState, useMemo, useEffect, useRef } from "react";
import {
  DEFAULT_SETTINGS, mergeSettings, dealCheck, suggestGroups, sumKosten, groupLabel, eur,
  buildFolders, folderInfo, findGroup, topCandidates,
} from "./logic.js";
import {
  loadInserate, insertInserate, patchInserat, patchMany, deleteInserat, deleteAllInserate, loadSettings, saveSettings,
  analyzeImages, askBerater, askTop5, fileToDataUrl, extractFrames, dedupe,
} from "./db.js";

/* ---------- kleine UI-Bausteine ---------- */
const C = { bg: "#eef2f9", card: "#fff", line: "#e2e8f0", text: "#0f172a", mute: "#64748b", soft: "#94a3b8", main: "#2563eb", mainBg: "#dbeafe", navy: "#0f172a" };
const PAGE_BG = "radial-gradient(1100px 420px at 85% -80px, rgba(99,102,241,0.18), transparent 60%), radial-gradient(900px 380px at -10% 140px, rgba(14,165,233,0.14), transparent 60%), #eef2f9";
const SHADOW = "0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.07)";
const card = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: SHADOW };
const inputStyle = { width: "100%", background: "#fff", border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 12px", color: C.text, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const labelStyle = { fontSize: 12.5, fontWeight: 700, color: "#334155", display: "block", marginBottom: 5 };
const h = { fontSize: 11, fontWeight: 800, color: C.mute, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 };
const PURPLE = "linear-gradient(135deg,#7c3aed,#a855f7)";
const btn = (primary = true, disabled = false) => ({
  padding: "12px 14px", borderRadius: 12, cursor: disabled ? "default" : "pointer", fontWeight: 700, fontSize: 14,
  border: primary ? "none" : `1.5px solid ${C.line}`, background: primary ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "#fff",
  color: primary ? "#fff" : "#334155", opacity: disabled ? 0.5 : 1, boxShadow: primary && !disabled ? "0 4px 14px rgba(37,99,235,0.30)" : "none",
});
const STATUS = {
  KAUFEN: { bg: "#dcfce7", border: "#86efac", color: "#15803d", icon: "✅", title: "KAUFEN" },
  VERHANDELN: { bg: "#fef3c7", border: "#fcd34d", color: "#b45309", icon: "🤝", title: "VERHANDELN" },
  FINGER_WEG: { bg: "#fee2e2", border: "#fca5a5", color: "#b91c1c", icon: "🛑", title: "FINGER WEG" },
};
const GRAY = { bg: "#f3f4f6", border: "#d1d5db", color: "#4b5563", icon: "ℹ️" };
const BEW = { Attraktiv: ["#dcfce7", "#15803d"], Prüfen: ["#fef3c7", "#b45309"], Meiden: ["#fee2e2", "#b91c1c"], "–": ["#f1f5f9", "#64748b"] };
const BEW_ACCENT = { Attraktiv: "#22c55e", Prüfen: "#f59e0b", Meiden: "#ef4444", "–": "#cbd5e1" };
const r0 = (n) => (n === null || n === undefined || isNaN(n) ? null : Math.round(n));

function Info({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="Erklärung" onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        style={{ width: 18, height: 18, borderRadius: 9, border: "none", background: open ? C.main : "#dbeafe", color: open ? "#fff" : C.main, fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0, lineHeight: "18px", fontStyle: "italic", fontFamily: "Georgia,serif" }}>i</button>
      {open && (
        <span style={{ position: "absolute", zIndex: 20, left: -8, top: 24, width: 262, maxWidth: "72vw", background: "#0f172a", color: "#f1f5f9", borderRadius: 12, padding: "11px 13px", fontSize: 12.5, lineHeight: 1.5, fontWeight: 400, fontStyle: "normal", boxShadow: "0 10px 30px rgba(15,23,42,0.35)", whiteSpace: "pre-line", textAlign: "left", letterSpacing: 0, textTransform: "none" }}>{text}</span>
      )}
    </span>
  );
}
function Field({ label, children, hint, info }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}{info && <Info text={info} />}</label>
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid #f1f5f9`, fontSize: 14 }}>
      <span style={{ color: C.mute }}>{k}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function RichText({ text }) {
  const lines = text.replace(/\*\*/g, "").split("\n").filter((l) => l.trim());
  return (
    <div style={{ fontSize: 14, lineHeight: 1.55, color: "#1f2937" }}>
      {lines.map((l, i) =>
        l.startsWith("## ") ? (
          <div key={i} style={{ fontWeight: 800, fontSize: 15, marginTop: i ? 14 : 0, marginBottom: 4, color: "#6d28d9" }}>{l.slice(3)}</div>
        ) : /^[-•] /.test(l) ? (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><span>•</span><span>{l.slice(2)}</span></div>
        ) : (
          <div key={i} style={{ marginBottom: 6 }}>{l}</div>
        )
      )}
    </div>
  );
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
    } catch { return false; }
  }
}
const DISCLAIMER = "Einschätzung der KI auf Basis deiner Daten. Keine Rechts- oder Steuerberatung. Prüfe das Auto immer vor dem Kauf.";

/* ---------- Daten für den Berater ---------- */
function folderContext(folder, settings) {
  const act = folder.active;
  const prices = act.map((i) => Number(i.preis)).filter(Number.isFinite).sort((a, b) => a - b);
  const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : null;
  const years = act.map((i) => Number(i.baujahr)).filter(Number.isFinite);
  const kms = act.map((i) => Number(i.km)).filter(Number.isFinite);
  const cnt = (f) => act.filter(f).length;
  return {
    art: "markt",
    modell: folder.label,
    anzahlInserate: act.length,
    preise: { minimum: prices[0] ?? null, median: r0(median), durchschnitt: prices.length ? r0(prices.reduce((a, b) => a + b, 0) / prices.length) : null, maximum: prices[prices.length - 1] ?? null },
    anbieter: { haendler: cnt((i) => i.anbieter === "Händler"), privat: cnt((i) => i.anbieter === "Privat"), unbekannt: cnt((i) => !i.anbieter) },
    baujahre: years.length ? [Math.min(...years), Math.max(...years)] : null,
    kilometer: kms.length ? [Math.min(...kms), Math.max(...kms)] : null,
    einstellungen: {
      verhandlungsabschlagProzent: Math.round(settings.abschlag * 100),
      anteilGuenstigsterInserateProzent: Math.round(settings.anteil * 100),
      kostenProAuto: sumKosten(settings), wunschgewinn: settings.wunschgewinn, mindestInserateProGruppe: settings.minInserate,
    },
    gruppenAutomatischGebildet: folder.auto,
    nichtZugeordneteInserate: act.filter((i) => !findGroup(i.baujahr, i.km, folder.groups)).length,
    gruppen: folder.evals.filter((e) => !e.empty).map((e) => ({
      gruppe: e.label, inserate: e.n, datenbasis: e.datenbasis, bewertung: e.bewertung, punkte: e.punkte,
      marktpreis: r0(e.markt), realistischerVerkaufspreis: r0(e.vk), maxEinkaufspreis: r0(e.maxEK),
      tempo: e.tempo, tageOnlineImSchnitt: r0(e.tageAvg), preisstabilitaet: e.stabilitaet, preisspanne: [r0(e.min), r0(e.max)],
    })),
  };
}

function dealContext(r, f, ms, zs, settings, folder) {
  return {
    art: "deal",
    modell: folder?.label,
    fahrzeug: { baujahr: Number(f.bj), km: Number(f.km), angebotspreis: Number(f.preis) },
    ergebnis: r.status,
    marktgruppe: r.label,
    gruppeninfo: { inserate: r.ev.n, datenbasis: r.ev.datenbasis, tempo: r.ev.tempo, tageOnlineImSchnitt: r0(r.ev.tageAvg), preisstabilitaet: r.ev.stabilitaet, bewertung: r.ev.bewertung },
    zahlen: {
      marktpreis: r0(r.markt), verkaufspreisAngepasst: r0(r.vk), kostenGesamt: r0(r.kosten), wunschgewinn: r0(r.wunschgewinn),
      maxEinkaufspreis: r0(r.maxEK), erwarteterGewinn: r0(r.gewinn), abstandZumMaximum: r0(r.abstand),
      ersteresAngebot: r0(r.startgebot), inserierenFuer: r0(r.inserierenFuer), nichtVerkaufenUnter: r0(r.breakEven),
    },
    geplanteMassnahmen: settings.massnahmen.filter((m) => ms.includes(m.id)).map((m) => ({ name: m.name, kosten: m.kosten, mehrwert: m.effekt })),
    zustandUndAusstattung: settings.zustand.filter((z) => zs.includes(z.id)).map((z) => ({ name: z.name, preiseffekt: z.effekt })),
    warnungenDesTools: r.warnings,
    einstellungen: { verhandlungsabschlagProzent: Math.round(settings.abschlag * 100), verhandlungsspielraumProzent: Math.round(settings.spielraum * 100) },
  };
}

/* ---------- Berater-Karte für einzelne Deals ---------- */
function Berater({ title, getContext, placeholder, buttonLabel, code, setError }) {
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask() {
    setBusy(true); setText("");
    try { setText(await askBerater(getContext(), q, code)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ ...card, background: "#faf5ff", borderColor: "#e9d5ff" }}>
      <div style={{ ...h, color: "#7c3aed" }}>🧠 {title}</div>
      <textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, resize: "vertical", marginBottom: 10, fontSize: 14 }} />
      <button style={{ ...btn(true, busy), width: "100%", background: PURPLE }} disabled={busy} onClick={ask}>
        {busy ? "Berater denkt nach…" : buttonLabel}
      </button>
      {text && (
        <div style={{ marginTop: 14 }}>
          <RichText text={text} />
          <div style={{ fontSize: 11, color: C.soft, marginTop: 12 }}>{DISCLAIMER}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Zeile für ein gespeichertes Inserat ---------- */
function InseratRow({ i, actions, showFolder }) {
  const small = { ...btn(false), padding: "6px 9px", fontSize: 12 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", borderBottom: "1px solid #f3f4f6", opacity: i.ausschliessen ? 0.4 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.modell || folderInfo(i).label}</div>
        <div style={{ fontSize: 12, color: C.mute }}>
          Bj {i.baujahr} · {i.km?.toLocaleString("de-DE")} km{i.tage != null ? ` · ${i.tage} Tage` : ""}{i.anbieter ? ` · ${i.anbieter}` : ""}{showFolder ? ` · 📁 ${folderInfo(i).label}` : ""}
        </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{eur(i.preis)}</div>
      <button title="Anderem Ordner zuordnen" onClick={() => actions.move(i)} style={small}>📁</button>
      <button title={i.ausschliessen ? "Wieder einbeziehen" : "Ausschließen"} onClick={() => actions.toggle(i)} style={small}>{i.ausschliessen ? "↩︎" : "🚫"}</button>
      <button title="Löschen" onClick={() => actions.remove(i)} style={small}>🗑️</button>
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
      .catch((e) => setError("Verbindung zur Datenbank fehlgeschlagen. Wurde das SQL in Supabase ausgeführt? (" + e.message.slice(0, 140) + ")"))
      .finally(() => { setLoading(false); setTimeout(() => (loaded.current = true), 0); });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => saveSettings(settings).catch((e) => setError("Einstellungen konnten nicht gespeichert werden: " + e.message.slice(0, 100))), 800);
    return () => clearTimeout(t);
  }, [settings]);

  const folders = useMemo(() => buildFolders(inserate, settings), [inserate, settings]);
  const saveCode = (c) => { setCode(c); try { localStorage.setItem("appcode", c); } catch {} };

  const actions = {
    toggle: async (i) => {
      try { await patchInserat(i.id, { ausschliessen: !i.ausschliessen }); setInserate((x) => x.map((y) => (y.id === i.id ? { ...y, ausschliessen: !y.ausschliessen } : y))); }
      catch (e) { setError(e.message.slice(0, 120)); }
    },
    remove: async (i) => {
      try { await deleteInserat(i.id); setInserate((x) => x.filter((y) => y.id !== i.id)); }
      catch (e) { setError(e.message.slice(0, 120)); }
    },
    move: async (i) => {
      const v = prompt("In welchen Ordner gehört dieses Inserat? Marke und Modell, z. B. Citroën C1", folderInfo(i).label);
      if (!v || !v.trim()) return;
      const parts = v.trim().split(/\s+/);
      const patch = { marke: parts[0], baureihe: parts.slice(1).join(" ") };
      try { await patchInserat(i.id, patch); setInserate((x) => x.map((y) => (y.id === i.id ? { ...y, ...patch } : y))); }
      catch (e) { setError(e.message.slice(0, 120)); }
    },
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.mute, fontFamily: "system-ui" }}>Lade Daten…</div>;

  const tabs = [["deal", "Deal-Check"], ["markt", `Markt (${folders.length})`], ["inserate", `Inserate (${inserate.length})`], ["settings", "Einstellungen"]];
  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, color: C.text, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#4338ca 100%)", position: "sticky", top: 0, zIndex: 5, boxShadow: "0 6px 20px rgba(15,23,42,0.25)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 12px 10px" }}>
          <div style={{ padding: "16px 4px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(255,255,255,0.14)", display: "grid", placeItems: "center", fontSize: 20 }}>🚗</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>Auto Deal-Check</div>
              <div style={{ fontSize: 11.5, color: "#c7d2fe" }}>Kaufen, verhandeln, verkaufen – mit Plan</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", background: "rgba(255,255,255,0.10)", borderRadius: 14, padding: 4 }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: "1 0 auto", padding: "9px 12px", border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, fontWeight: tab === k ? 800 : 600, borderRadius: 11, background: tab === k ? "#fff" : "transparent", color: tab === k ? "#1e3a8a" : "#e0e7ff", boxShadow: tab === k ? "0 2px 8px rgba(0,0,0,0.18)" : "none" }}>{l}</button>
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
        {tab === "deal" && <DealTab settings={settings} folders={folders} code={code} setError={setError} goto={setTab} />}
        {tab === "markt" && <MarktTab folders={folders} settings={settings} setSettings={setSettings} setInserate={setInserate} actions={actions} code={code} setError={setError} goto={setTab} />}
        {tab === "inserate" && <InserateTab inserate={inserate} setInserate={setInserate} actions={actions} code={code} saveCode={saveCode} setError={setError} />}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
      </div>
    </div>
  );
}

/* ---------- Deal-Check ---------- */
function DealTab({ settings, folders, code, setError, goto }) {
  const [folderKey, setFolderKey] = useState("");
  const [f, setF] = useState({ bj: "", km: "", preis: "" });
  const [ms, setMs] = useState([]);
  const [zs, setZs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const folder = folders.find((x) => x.key === folderKey) || folders[0] || null;

  const r = useMemo(() => {
    if (!folder) return { status: "ZU_WENIG_DATEN", headline: "Noch keine Marktdaten vorhanden.", hint: "Lies zuerst Inserate ein (Screenshot oder von Hand), dann kann der Markt bewertet werden." };
    return dealCheck({ ...f, massnahmen: ms, zustand: zs }, folder.evals, { ...settings, groups: folder.groups });
  }, [f, ms, zs, folder, settings]);
  const st = STATUS[r.status] || GRAY;

  async function fromScreenshots(fileList) {
    const files = [...fileList].slice(0, 4);
    if (!files.length) return;
    setBusy(true); setNote("");
    try {
      const imgs = [];
      for (const file of files) imgs.push(await fileToDataUrl(file));
      const list = await analyzeImages(imgs, code);
      if (!list.length) { setNote("Kein Inserat erkannt. Bitte ein klareres Bild versuchen oder von Hand eintragen."); return; }
      const l = list.find((x) => x.baujahr && x.km && x.preis) || list[0];
      setF({ bj: l.baujahr ?? "", km: l.km ?? "", preis: l.preis ?? "" });
      const info = folderInfo(l);
      const hit = folders.find((x) => x.key === info.key);
      if (hit) { setFolderKey(hit.key); setNote(`Erkannt: ${l.modell || info.label}. Ordner „${hit.label}“ gewählt. Bitte die Werte kurz prüfen.`); }
      else setNote(`Erkannt: ${l.modell || info.label}. Für dieses Modell gibt es noch keinen Ordner. Wähle unten ein anderes Modell oder lies zuerst Inserate dieses Modells ein.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div style={card}>
        <div style={h}>1 · Angebot eingeben</div>
        <label style={{ ...btn(false), display: "block", textAlign: "center", marginBottom: 12 }}>
          {busy ? "KI liest das Bild…" : "📷 Aus Screenshot(s) ausfüllen"}
          <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={(e) => { fromScreenshots(e.target.files); e.target.value = ""; }} />
        </label>
        {note && <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>{note}</div>}
        {folders.length > 0 && (
          <Field label="Modell">
            <select value={folder?.key || ""} onChange={(e) => setFolderKey(e.target.value)} style={inputStyle}>
              {folders.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.active.length} Inserate)</option>)}
            </select>
          </Field>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Baujahr"><Num value={f.bj} onChange={(v) => setF({ ...f, bj: v })} placeholder="2012" /></Field>
          <Field label="Kilometer"><Num value={f.km} onChange={(v) => setF({ ...f, km: v })} placeholder="85000" /></Field>
        </div>
        <Field label="Angebotspreis des Verkäufers (€)"><Num value={f.preis} onChange={(v) => setF({ ...f, preis: v })} placeholder="3900" /></Field>
      </div>

      <div style={{ ...card, background: `linear-gradient(135deg,${st.bg},#fff 140%)`, borderColor: st.border, borderWidth: 2, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 34 }}>{st.icon}</span>
          <div style={{ fontSize: STATUS[r.status] ? 28 : 16, fontWeight: 900, color: st.color }}>{STATUS[r.status] ? st.title : "Noch kein Ergebnis"}</div>
        </div>
        <div style={{ fontSize: 15, color: st.color, fontWeight: 600, lineHeight: 1.45 }}>{r.headline}</div>
        {r.hint && <div style={{ fontSize: 13, color: C.mute, marginTop: 8 }}>{r.hint}</div>}
        {(r.status === "ZU_WENIG_DATEN" || r.status === "KEINE_GRUPPE") && (
          <button style={{ ...btn(true), marginTop: 12 }} onClick={() => goto(r.status === "KEINE_GRUPPE" ? "markt" : "inserate")}>
            {r.status === "KEINE_GRUPPE" ? "Zum Markt-Ordner" : "Inserate einlesen"}
          </button>
        )}
        {r.label && <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>{folder?.label} · Gruppe {r.label} · {r.ev?.n} Inserate</div>}
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

      {STATUS[r.status] && (
        <Berater
          title="KI-Berater zu diesem Deal"
          getContext={() => dealContext(r, f, ms, zs, settings, folder)}
          placeholder="Optional: Deine Frage, z. B. „Wie verhandle ich am besten?“"
          buttonLabel="Diesen Deal beraten lassen"
          code={code}
          setError={setError}
        />
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

/* ---------- Markt: Ordnerübersicht ---------- */
function MarktTab({ folders, settings, setSettings, setInserate, actions, code, setError, goto }) {
  const [open, setOpen] = useState(null);
  const folder = folders.find((f) => f.key === open);

  if (!folders.length) {
    return (
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Noch keine Marktdaten</div>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 12 }}>Lies Inserate per Screenshot oder Video ein. Für jedes Fahrzeugmodell entsteht dann automatisch ein Ordner mit allen Marktzahlen.</div>
        <button style={btn()} onClick={() => goto("inserate")}>Inserate einlesen</button>
      </div>
    );
  }
  if (folder) return <FolderView key={folder.key} folder={folder} settings={settings} setSettings={setSettings} setInserate={setInserate} actions={actions} code={code} setError={setError} back={() => setOpen(null)} />;

  return (
    <div>
      <div style={h}>Deine Modelle</div>
      {folders.map((f) => {
        const [bg, fg] = BEW[f.best?.bewertung] || BEW["–"];
        return (
          <button key={f.key} onClick={() => setOpen(f.key)} style={{ ...card, display: "block", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>📁 {f.label}</div>
              {f.best && <span style={{ background: bg, color: fg, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{f.best.bewertung}</span>}
            </div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 6 }}>{f.active.length} Inserate{f.n !== f.active.length ? ` (${f.n - f.active.length} ausgeschlossen)` : ""}</div>
            {f.best && <div style={{ fontSize: 13, marginTop: 4 }}>Beste Gruppe: <b>{f.best.label}</b> · Max. Einkauf <b>{eur(f.best.maxEK)}</b></div>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Markt: ein Modell-Ordner ---------- */
function FolderView({ folder, settings, setSettings, setInserate, actions, code, setError, back }) {
  const [erkl, setErkl] = useState("");
  const [busy1, setBusy1] = useState(false);
  const [picks, setPicks] = useState(null);
  const [busy2, setBusy2] = useState(false);
  const [pickNote, setPickNote] = useState("");
  const [cands, setCands] = useState([]);
  const [openGroup, setOpenGroup] = useState(null);

  const act = folder.active;
  const prices = act.map((i) => Number(i.preis)).filter(Number.isFinite);
  const avgP = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const active = folder.evals.filter((e) => !e.empty).sort((a, b) => b.punkte - a.punkte || b.maxEK - a.maxEK);
  const unassigned = act.filter((i) => !findGroup(i.baujahr, i.km, folder.groups)).length;

  async function explain() {
    setBusy1(true); setErkl("");
    try { setErkl(await askBerater(folderContext(folder, settings), "", code)); }
    catch (e) { setError(e.message); }
    finally { setBusy1(false); }
  }
  async function findTop5() {
    setBusy2(true); setPicks(null); setPickNote("");
    try {
      const c = topCandidates(folder, settings, 12);
      if (!c.length) { setPickNote("Aktuell passt kein Inserat: Selbst mit realistischem Verhandeln (bis etwa 28 % unter dem Angebotspreis) erreichst du bei keinem deinen Wunschgewinn. Das liegt an den Marktzahlen oder an den Kosten und dem Wunschgewinn in den Einstellungen. Lies mehr Inserate ein oder prüfe die Einstellungen."); return; }
      setCands(c);
      const res = await askTop5({
        art: "top5", modell: folder.label, absender: settings.absender || "",
        einstellungen: { verhandlungsabschlagProzent: Math.round(settings.abschlag * 100), kostenProAuto: sumKosten(settings), wunschgewinn: settings.wunschgewinn },
        kandidaten: c,
      }, code);
      const valid = res.filter((p) => c.some((x) => x.id === p.id));
      if (!valid.length) setPickNote("Der Berater hat keine passenden Fahrzeuge zurückgegeben. Bitte nochmal versuchen.");
      setPicks(valid);
    } catch (e) { setError(e.message); }
    finally { setBusy2(false); }
  }

  async function rename() {
    const v = prompt("Neuer Name für diesen Ordner (Marke und Modell). Gibt es den Namen schon, werden beide Ordner zusammengeführt.", folder.label);
    if (!v || !v.trim()) return;
    const parts = v.trim().split(/\s+/);
    const patch = { marke: parts[0], baureihe: parts.slice(1).join(" ") };
    try {
      await patchMany(folder.items.map((i) => i.id), patch);
      const ids = new Set(folder.items.map((i) => i.id));
      setInserate((x) => x.map((y) => (ids.has(y.id) ? { ...y, ...patch } : y)));
      back();
    } catch (e) { setError(e.message.slice(0, 120)); }
  }

  const setGroups = (list) => setSettings({ ...settings, modelGroups: { ...settings.modelGroups, [folder.key]: list } });
  const resetAuto = () => { const m = { ...settings.modelGroups }; delete m[folder.key]; setSettings({ ...settings, modelGroups: m }); };
  const mini = { ...inputStyle, padding: "8px 8px", fontSize: 13 };

  return (
    <div>
      <button onClick={back} style={{ ...btn(false), marginBottom: 12, padding: "8px 12px" }}>← Alle Modelle</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>📁 {folder.label}</div>
        <button onClick={rename} style={{ background: "none", border: "none", color: C.main, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Ordner umbenennen</button>
      </div>

      {/* Berater */}
      <div style={{ ...card, background: "linear-gradient(135deg,#f5f3ff,#fdf4ff)", borderColor: "#d8b4fe", padding: 18 }}>
        <button
          onClick={explain} disabled={busy1}
          style={{ width: "100%", padding: "18px 14px", borderRadius: 14, border: "none", cursor: busy1 ? "default" : "pointer", background: PURPLE, color: "#fff", fontWeight: 900, fontSize: 17, boxShadow: "0 6px 18px rgba(124,58,237,0.35)", opacity: busy1 ? 0.7 : 1 }}
        >
          {busy1 ? "Berater analysiert den Markt…" : "🧠 Berater: Markt erklären"}
        </button>
        {erkl && (
          <div style={{ marginTop: 16 }}>
            <RichText text={erkl} />
            <div style={{ fontSize: 11, color: C.soft, marginTop: 12 }}>{DISCLAIMER}</div>
          </div>
        )}
        <button
          onClick={findTop5} disabled={busy2}
          style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "2px solid #7c3aed", background: "#fff", color: "#6d28d9", fontWeight: 800, fontSize: 15, cursor: busy2 ? "default" : "pointer", opacity: busy2 ? 0.7 : 1 }}
        >
          {busy2 ? "Berater sucht die besten Fahrzeuge…" : "🏆 Die 5 besten Fahrzeuge finden"}
        </button>
        {pickNote && <div style={{ fontSize: 13, color: "#78350f", marginTop: 12, lineHeight: 1.5 }}>{pickNote}</div>}
      </div>

      {picks && picks.map((p, idx) => <PickCard key={p.id} idx={idx} pick={p} cand={cands.find((x) => x.id === p.id)} />)}

      {/* Kennzahlen */}
      <div style={card}>
        <div style={h}>Kennzahlen</div>
        <Row k="Inserate (aktiv)" v={act.length} />
        <Row k="Durchschnittspreis" v={eur(avgP)} />
        <Row k="Preisspanne" v={prices.length ? `${eur(Math.min(...prices))} – ${eur(Math.max(...prices))}` : "–"} />
        <Row k="Händler / Privat" v={`${act.filter((i) => i.anbieter === "Händler").length} / ${act.filter((i) => i.anbieter === "Privat").length}`} />
        {unassigned > 0 && <div style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>{unassigned} Inserate gehören zu keiner Gruppe und zählen nicht in die Bewertung. Passe die Gruppen unten an.</div>}
      </div>

      {active.length === 0 && <div style={card}><div style={{ fontSize: 13, color: C.mute }}>Noch keine Gruppe mit Inseraten. Passe die Gruppen unten an oder lies mehr Inserate ein.</div></div>}
      {active.length > 0 && <div style={{ fontSize: 12, color: C.mute, margin: "2px 4px 10px" }}>Tippe auf eine Gruppe, um die zugehörigen Inserate zu sehen.</div>}
      {active.map((e) => {
        const [bg, fg] = BEW[e.bewertung] || BEW["–"];
        const isOpen = openGroup === e.group.id;
        const items = act.filter((i) => findGroup(i.baujahr, i.km, [e.group])).sort((x, y) => Number(x.preis) - Number(y.preis));
        const counted = Math.max(1, Math.ceil(items.length * settings.anteil));
        return (
          <div key={e.group.id} style={{ ...card, padding: 0, overflow: "hidden", borderColor: isOpen ? BEW_ACCENT[e.bewertung] || C.line : C.line }}>
            <button onClick={() => setOpenGroup(isOpen ? null : e.group.id)} style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", background: "none", border: "none", borderLeft: `6px solid ${BEW_ACCENT[e.bewertung] || "#cbd5e1"}`, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{e.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: bg, color: fg, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 800 }}>{e.bewertung}</span>
                  <span style={{ color: C.soft, fontSize: 13, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: e.maxEK > 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: C.mute }}>MAX. EINKAUF</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: e.maxEK > 0 ? "#15803d" : "#b91c1c" }}>{eur(e.maxEK)}</div>
                </div>
                <div style={{ background: "#eff6ff", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: C.mute }}>VERKAUF</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#1d4ed8" }}>{eur(e.vk)}</div>
                </div>
              </div>
              <Row k="Inserate" v={`${e.n}${e.datenbasis === "zu dünn" ? " (zu dünn)" : ""}`} color={e.datenbasis === "zu dünn" ? "#b45309" : undefined} />
              <Row k="Marktpreis" v={eur(e.markt)} />
              <Row k="Tempo" v={e.tempo + (e.tageAvg ? ` (Ø ${Math.round(e.tageAvg)} Tage)` : "")} />
              <Row k="Preisstabilität" v={e.stabilitaet} />
              <Row k="Preisspanne" v={`${eur(e.min)} – ${eur(e.max)}`} />
            </button>
            {isOpen && (
              <div style={{ background: "#f8fafc", borderTop: `1px solid ${C.line}`, padding: "12px 16px 8px" }}>
                <div style={{ fontSize: 12, color: C.mute, marginBottom: 6, lineHeight: 1.45 }}>
                  {items.length} Inserate in dieser Gruppe, nach Preis sortiert. Die {counted} günstigsten (⭐) bestimmen den Marktpreis.
                </div>
                {items.map((i, idx) => (
                  <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 18, fontSize: 13, textAlign: "center" }}>{idx < counted ? "⭐" : ""}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><InseratRow i={i} actions={actions} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {unassigned > 0 && (
        <button onClick={() => setOpenGroup(openGroup === "none" ? null : "none")} style={{ ...card, display: "block", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer", background: "#fffbeb", borderColor: "#fde68a" }}>
          <b style={{ fontSize: 14, color: "#92400e" }}>{unassigned} Inserate ohne Gruppe</b> <span style={{ fontSize: 12, color: "#92400e" }}>{openGroup === "none" ? "▼" : "▶ antippen"}</span>
        </button>
      )}
      {openGroup === "none" && (
        <div style={card}>
          {act.filter((i) => !findGroup(i.baujahr, i.km, folder.groups)).map((i) => <InseratRow key={i.id} i={i} actions={actions} />)}
        </div>
      )}

      {/* Gruppen */}
      <details style={card}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Gruppen (Baujahr und Kilometer) {folder.auto ? "· automatisch" : "· angepasst"}</summary>
        <div style={{ marginTop: 12 }}>
          {folder.auto && <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, marginBottom: 10 }}>Die Gruppen werden automatisch aus deinen Inseraten gebildet und passen sich an, wenn du neue einliest. Tippe auf „Gruppen anpassen“, um sie selbst festzulegen.</div>}
          {!folder.auto && folder.groups.map((g) => (
            <div key={g.id} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr) auto", gap: 6, marginBottom: 8, alignItems: "center" }}>
              {["bjVon", "bjBis", "kmVon", "kmBis"].map((k) => (
                <input key={k} style={mini} type="number" value={g[k]} onChange={(e) => setGroups(folder.groups.map((x) => (x.id === g.id ? { ...x, [k]: +e.target.value } : x)))} />
              ))}
              <button style={{ ...btn(false), padding: "7px 9px" }} onClick={() => setGroups(folder.groups.filter((x) => x.id !== g.id))}>🗑️</button>
            </div>
          ))}
          {!folder.auto && <div style={{ fontSize: 11, color: C.soft, marginBottom: 10 }}>Spalten: Baujahr von · bis · km von · bis</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {folder.auto ? (
              <button style={btn(true)} onClick={() => setGroups(folder.groups.map((g, i) => ({ ...g, id: i + 1 })))}>Gruppen anpassen</button>
            ) : (
              <>
                <button style={btn(false)} onClick={() => setGroups([...folder.groups, { id: Date.now() % 1e9, bjVon: 2012, bjBis: 2014, kmVon: 60000, kmBis: 90000 }])}>+ Gruppe</button>
                <button style={btn(false)} onClick={() => { const g = suggestGroups(folder.items); if (g.length) setGroups(g); }}>✨ Neu vorschlagen</button>
                <button style={btn(false)} onClick={resetAuto}>Zurück zu automatisch</button>
              </>
            )}
          </div>
        </div>
      </details>

      {/* Inserate */}
      <div style={card}>
        <div style={h}>Inserate dieses Modells ({folder.items.length})</div>
        {[...folder.items].reverse().map((i) => <InseratRow key={i.id} i={i} actions={actions} />)}
      </div>
    </div>
  );
}

/* ---------- Karte für ein empfohlenes Fahrzeug mit Nachrichten ---------- */
function PickCard({ idx, pick, cand }) {
  const [msg, setMsg] = useState(pick.nachricht || "");
  const [fu, setFu] = useState(pick.nachfass || "");
  const [copied, setCopied] = useState("");
  const doCopy = async (k, t) => { if (await copyText(t)) { setCopied(k); setTimeout(() => setCopied(""), 2000); } };
  const chip = { background: "#f3f4f6", borderRadius: 8, padding: "5px 9px", fontSize: 12, fontWeight: 700 };
  return (
    <div style={{ ...card, borderColor: "#d8b4fe" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ background: PURPLE, color: "#fff", borderRadius: 10, width: 30, height: 30, display: "grid", placeItems: "center", fontWeight: 900, flexShrink: 0 }}>{idx + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{cand?.modell || "Fahrzeug"}</div>
          {cand && <div style={{ fontSize: 12, color: C.mute }}>Bj {cand.baujahr} · {cand.km?.toLocaleString("de-DE")} km{cand.anbieter ? ` · ${cand.anbieter}` : ""}{cand.tageOnline != null ? ` · ${cand.tageOnline} Tage online` : ""}</div>}
        </div>
      </div>
      {cand && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span style={chip}>Angebot {eur(cand.preis)}</span>
          <span style={{ ...chip, background: C.mainBg, color: C.main }}>Erstes Angebot {eur(cand.ersteresAngebot)}</span>
          <span style={{ ...chip, background: "#fee2e2", color: "#b91c1c" }}>Obergrenze {eur(cand.maxEinkaufGruppe)}</span>
          <span style={{ ...chip, background: "#dcfce7", color: "#15803d" }}>Gewinn ca. {eur(cand.erwarteterGewinnBeiAngebotspreis)}</span>
        </div>
      )}
      {pick.stichwoerter?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {pick.stichwoerter.map((s, i) => <div key={i} style={{ fontSize: 13, marginBottom: 3 }}>✔︎ {s}</div>)}
        </div>
      )}
      <label style={labelStyle}>Nachricht an den Verkäufer (du kannst sie bearbeiten)</label>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={8} style={{ ...inputStyle, fontSize: 14, lineHeight: 1.45, resize: "vertical" }} />
      <button style={{ ...btn(true), width: "100%", marginTop: 8 }} onClick={() => doCopy("m", msg)}>{copied === "m" ? "✅ Kopiert" : "📋 Nachricht kopieren"}</button>
      {fu && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.mute }}>Nachfass-Nachricht (nach 2 bis 3 Tagen ohne Antwort)</summary>
          <textarea value={fu} onChange={(e) => setFu(e.target.value)} rows={5} style={{ ...inputStyle, fontSize: 14, lineHeight: 1.45, resize: "vertical", marginTop: 8 }} />
          <button style={{ ...btn(false), width: "100%", marginTop: 8 }} onClick={() => doCopy("f", fu)}>{copied === "f" ? "✅ Kopiert" : "📋 Nachfass kopieren"}</button>
        </details>
      )}
      <div style={{ fontSize: 11, color: C.soft, marginTop: 10 }}>{DISCLAIMER} Ersetze „[Dein Name]“, falls es in der Nachricht steht.</div>
    </div>
  );
}

/* ---------- Inserate ---------- */
function InserateTab({ inserate, setInserate, actions, code, saveCode, setError }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [review, setReview] = useState(null);
  const empty = { marke: "", baureihe: "", modell: "", baujahr: "", km: "", preis: "", tage: "" };
  const [manual, setManual] = useState(empty);

  const addFiles = (list) => {
    setFiles((prev) => {
      const key = (f) => `${f.name}|${f.size}|${f.lastModified}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...[...list].filter((f) => !seen.has(key(f)))];
    });
    setReview(null);
  };
  const nImg = files.filter((f) => f.type.startsWith("image/")).length;
  const nVid = files.filter((f) => f.type.startsWith("video/")).length;

  async function run() {
    if (!files.length) return;
    setBusy(true); setReview(null);
    try {
      const images = [];
      let k = 0;
      for (const f of files) {
        if (f.type.startsWith("video/")) {
          setStatus("Video wird in Einzelbilder zerlegt…");
          images.push(...(await extractFrames(f, { onProgress: (p) => setStatus(`Video wird zerlegt… ${Math.round(p * 100)} %`) })));
        } else {
          k++; setStatus(`Bild ${k} von ${nImg} wird vorbereitet…`);
          images.push(await fileToDataUrl(f));
        }
      }
      const batches = [];
      for (let i = 0; i < images.length; i += 4) batches.push(images.slice(i, i + 4));
      const all = [];
      let failed = 0, lastErr = "", done = 0;
      for (let i = 0; i < batches.length; i += 2) {
        const slice = batches.slice(i, i + 2);
        const res = await Promise.allSettled(slice.map((b) => analyzeImages(b, code)));
        res.forEach((r) => { if (r.status === "fulfilled") all.push(...r.value); else { failed++; lastErr = r.reason?.message || "Fehler"; } });
        done += slice.length;
        setStatus(`KI liest die Bilder… Paket ${done} von ${batches.length}`);
      }
      if (failed && !all.length) throw new Error(lastErr);
      const unique = dedupe(all, inserate);
      setReview(unique.map((l) => ({ ...l, use: true })));
      setStatus(
        (unique.length ? `${unique.length} neue Inserate erkannt (${all.length - unique.length} doppelte oder schon vorhandene aussortiert). Bitte kurz prüfen und speichern.` : "Keine neuen Inserate erkannt (oder alle schon vorhanden).") +
        (failed ? ` ${failed} Paket(e) konnten nicht gelesen werden, versuche diese Bilder nochmal.` : "")
      );
    } catch (e) { setError(e.message); setStatus(""); }
    finally { setBusy(false); }
  }

  async function saveReview() {
    const rows = review.filter((r) => r.use).map((r) => ({ ...r, quelle: nVid ? "Video" : "Screenshot" }));
    try {
      const saved = await insertInserate(rows);
      setInserate((x) => [...x, ...saved]);
      setReview(null); setFiles([]); setStatus(`${saved.length} Inserate gespeichert. Die Ordner findest du unter „Markt“.`);
    } catch (e) { setError("Speichern fehlgeschlagen. Wurde das SQL-Update in Supabase ausgeführt? (" + e.message.slice(0, 120) + ")"); }
  }

  async function addManual() {
    try {
      const saved = await insertInserate([{ ...manual, quelle: "manuell" }]);
      setInserate((x) => [...x, ...saved]);
      setManual(empty);
    } catch (e) { setError(e.message.slice(0, 140)); }
  }

  const setR = (i, k, v) => setReview(review.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const cell = { ...inputStyle, padding: "7px 8px", fontSize: 13 };
  const numCell = (i, r, k, ph) => <input style={cell} type="number" value={r[k] ?? ""} onChange={(e) => setR(i, k, e.target.value === "" ? null : +e.target.value)} placeholder={ph} />;

  return (
    <div>
      <div style={card}>
        <div style={h}>Inserate per KI einlesen</div>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 10 }}>
          Wähle mehrere Screenshots auf einmal oder tippe mehrfach auf den Knopf, dann werden alle gesammelt. Alternativ ein Video vom langsamen Scrollen. Die KI erkennt Marke, Modell, Baujahr, km und Preis, und es entsteht automatisch ein Ordner je Modell.
        </div>
        <Field label="Zugangscode (falls in Vercel gesetzt)"><input style={inputStyle} type="password" value={code} onChange={(e) => saveCode(e.target.value)} placeholder="optional" /></Field>
        <label style={{ ...btn(false), display: "block", textAlign: "center", marginBottom: 10 }}>
          {files.length ? `➕ Weitere hinzufügen (${nImg} Bilder${nVid ? `, ${nVid} Video` : ""} gewählt)` : "📷 Screenshots oder 🎥 Video wählen"}
          <input type="file" multiple accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {files.length > 0 && !busy && <button style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 10 }} onClick={() => { setFiles([]); setReview(null); }}>Auswahl leeren</button>}
        <button style={{ ...btn(true, busy || !files.length), width: "100%" }} disabled={busy || !files.length} onClick={run}>{busy ? "Bitte warten…" : `Inserate auslesen${files.length ? ` (${files.length})` : ""}`}</button>
        {status && <div style={{ fontSize: 13, color: C.mute, marginTop: 10, lineHeight: 1.5 }}>{status}</div>}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                <input style={cell} value={r.marke || ""} onChange={(e) => setR(i, "marke", e.target.value)} placeholder="Marke" />
                <input style={cell} value={r.baureihe || ""} onChange={(e) => setR(i, "baureihe", e.target.value)} placeholder="Modell (z. B. C1)" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr", gap: 6 }}>
                {numCell(i, r, "baujahr", "Bj")}{numCell(i, r, "km", "km")}{numCell(i, r, "preis", "Preis")}{numCell(i, r, "tage", "Tage")}
              </div>
            </div>
          ))}
          <button style={{ ...btn(), width: "100%", marginTop: 12 }} onClick={saveReview}>{review.filter((r) => r.use).length} Inserate speichern</button>
        </div>
      )}

      <div style={card}>
        <div style={h}>Einzelnes Inserat von Hand</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Marke"><input style={inputStyle} value={manual.marke} onChange={(e) => setManual({ ...manual, marke: e.target.value })} placeholder="Citroën" /></Field>
          <Field label="Modell"><input style={inputStyle} value={manual.baureihe} onChange={(e) => setManual({ ...manual, baureihe: e.target.value })} placeholder="C1" /></Field>
        </div>
        <Field label="Bezeichnung (optional)"><input style={inputStyle} value={manual.modell} onChange={(e) => setManual({ ...manual, modell: e.target.value })} placeholder="Citroën C1 1.0 VTi Feel" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Baujahr"><Num value={manual.baujahr} onChange={(v) => setManual({ ...manual, baujahr: v })} /></Field>
          <Field label="Kilometer"><Num value={manual.km} onChange={(v) => setManual({ ...manual, km: v })} /></Field>
          <Field label="Preis (€)"><Num value={manual.preis} onChange={(v) => setManual({ ...manual, preis: v })} /></Field>
          <Field label="Tage online (optional)"><Num value={manual.tage} onChange={(v) => setManual({ ...manual, tage: v })} /></Field>
        </div>
        <button style={{ ...btn(true, !manual.baujahr || !manual.km || !manual.preis || !manual.marke), width: "100%" }} disabled={!manual.baujahr || !manual.km || !manual.preis || !manual.marke} onClick={addManual}>Hinzufügen</button>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ ...h, marginBottom: 0 }}>Alle gespeicherten Inserate ({inserate.length})</div>
          {inserate.length > 0 && (
            <button style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              onClick={async () => { if (confirm("Wirklich ALLE Inserate löschen?")) { try { await deleteAllInserate(); setInserate([]); } catch (e) { setError(e.message.slice(0, 100)); } } }}>Alle löschen</button>
          )}
        </div>
        {inserate.length === 0 && <div style={{ fontSize: 13, color: C.soft }}>Noch keine Inserate.</div>}
        {[...inserate].reverse().map((i) => <InseratRow key={i.id} i={i} actions={actions} showFolder />)}
      </div>
    </div>
  );
}

/* ---------- Einstellungen ---------- */
const KOSTEN_INFO = {
  aufbereitung: "Innen- und Außenreinigung, Politur, Fotos – alles, was das Auto verkaufsfertig macht.\nBeispiel: 150 € → werden von jedem Verkaufspreis als Kosten abgezogen.",
  tuev: "Kosten für TÜV/HU und kleine Reparaturen, die fast immer anfallen.\nBeispiel: 300 € → die Obergrenze für den Einkauf sinkt um 300 €.",
  inserat: "Gebühren für die Anzeige auf der Verkaufsplattform.\nBeispiel: 30 €.",
  gewaehrleistung: "Rücklage für Nachbesserungen, falls der Käufer später einen Mangel meldet.\nBeispiel: 200 € pro Auto – lieber zu hoch als zu niedrig ansetzen.",
  sonstiges: "Alles Übrige: Transport, Zulassung, Überführungskennzeichen, Sprit für Besichtigungen.\nBeispiel: 100 €.",
};
function SettingsTab({ settings: s, setSettings }) {
  const set = (k, v) => setSettings({ ...s, [k]: v });
  const setK = (k, v) => setSettings({ ...s, kosten: { ...s.kosten, [k]: v === "" ? 0 : v } });
  const upd = (key, id, patch) => setSettings({ ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const del = (key, id) => setSettings({ ...s, [key]: s[key].filter((x) => x.id !== id) });
  const nextId = (prefix) => prefix + (Date.now() % 1e9);
  const mini = { ...inputStyle, padding: "8px 8px", fontSize: 13 };

  return (
    <div>
      <div style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe", fontSize: 13, color: "#1e3a8a", lineHeight: 1.5 }}>
        Alle Werte sind Platzhalter. Ersetze sie durch deine Erfahrungswerte, denn die Ampel ist nur so gut wie diese Annahmen. Änderungen werden automatisch gespeichert. Die Marktgruppen (Baujahr und km) stellst du im Ordner des jeweiligen Modells unter „Markt“ ein.
      </div>

      <div style={card}>
        <div style={h}>Nachrichten an Verkäufer</div>
        <Field info={"Wird als Unterschrift unter die Nachrichten an Verkäufer gesetzt.\nBeispiel: „Max Mustermann“ → die Nachricht endet mit „Viele Grüße, Max Mustermann“."} label="Dein Name oder deine Firma (als Unterschrift)"><input style={inputStyle} value={s.absender} onChange={(e) => set("absender", e.target.value)} placeholder="z. B. Max Mustermann" /></Field>
      </div>

      <div style={card}>
        <div style={h}>Marktpreis-Berechnung</div>
        <Field info={"Inserate stehen meist teurer drin, als das Auto am Ende wirklich verkauft wird. Dieser Abschlag zieht das vom Marktpreis ab.\nBeispiel: Marktpreis 4.000 €, Abschlag 7 % → du rechnest mit einem Verkaufspreis von 3.720 €.\nHöher = vorsichtiger, du zahlst beim Einkauf weniger. Niedriger = optimistischer."} label="Verhandlungsabschlag auf Angebotspreise (%)" hint="Angebotspreise liegen meist über dem echten Verkaufspreis."><Num pct value={s.abschlag} onChange={(v) => set("abschlag", v)} /></Field>
        <Field info={"Nur die günstigsten Inserate einer Gruppe bestimmen den Marktpreis. Teure Mondpreise sollen den Schnitt nicht hochziehen.\nBeispiel: 10 Inserate, 40 % → die 4 günstigsten werden gemittelt.\nKleinerer Wert = vorsichtiger (niedrigerer Marktpreis)."} label="Anteil günstigster Inserate für den Marktpreis (%)" hint="Nur die günstigsten x % einer Gruppe bestimmen den Marktpreis. Mondpreise ziehen den Schnitt sonst hoch."><Num pct value={s.anteil} onChange={(v) => set("anteil", v)} /></Field>
        <Field info={"So viele Inserate braucht eine Gruppe mindestens, damit die Zahlen als verlässlich gelten.\nBeispiel: 5 → eine Gruppe mit nur 3 Inseraten wird als „zu dünn“ markiert und nicht als Attraktiv bewertet."} label="Mindestanzahl Inserate pro Gruppe"><Num value={s.minInserate} onChange={(v) => set("minInserate", v)} /></Field>
      </div>

      <div style={card}>
        <div style={h}>Kosten pro Fahrzeug</div>
        {[["aufbereitung", "Aufbereitung"], ["tuev", "TÜV/HU und Kleinreparaturen"], ["inserat", "Inseratskosten"], ["gewaehrleistung", "Gewährleistungsrücklage"], ["sonstiges", "Sonstiges (Transport, Zulassung)"]].map(([k, l]) => (
          <Field key={k} info={KOSTEN_INFO[k]} label={`${l} (€)`}><Num value={s.kosten[k]} onChange={(v) => setK(k, v)} /></Field>
        ))}
        <Row k="Summe Kosten pro Auto" v={eur(sumKosten(s))} bold />
        <div style={{ height: 12 }} />
        <Field info={"Der Gewinn, den du mit jedem Auto mindestens machen willst. Er wird beim höchsten Einkaufspreis schon abgezogen.\nBeispiel: Verkauf 3.720 €, Kosten 780 €, Wunschgewinn 500 € → du darfst höchstens 2.440 € zahlen.\nJe höher der Wunsch, desto niedriger die Obergrenze."} label="Wunschgewinn pro Auto (€)"><Num value={s.wunschgewinn} onChange={(v) => set("wunschgewinn", v)} /></Field>
      </div>

      <div style={card}>
        <div style={h}>Ampel und Bewertung</div>
        <Field info={"Wie weit ein Angebot über deiner Obergrenze liegen darf, bis es nicht mehr zu retten ist.\nBeispiel: Obergrenze 2.440 €, Spielraum 10 % → bis 2.684 € zeigt die Ampel „VERHANDELN“, darüber „FINGER WEG“."} label="Deal-Check: Verhandlungsspielraum (%)" hint="Angebote bis x % über dem Max-Einkaufspreis = VERHANDELN, darüber = FINGER WEG."><Num pct value={s.spielraum} onChange={(v) => set("spielraum", v)} /></Field>
        <Field info={"Dein erstes Angebot liegt so viel unter deiner Obergrenze, damit du im Gespräch noch nachgeben kannst.\nBeispiel: Obergrenze 2.440 €, Abschlag 8 % → erstes Angebot ca. 2.250 €.\nGrößer = mutigeres Angebot, aber der Verkäufer springt eher ab."} label="Erstes Angebot: Abschlag auf die Obergrenze (%)"><Num pct value={s.startabschlag} onChange={(v) => set("startabschlag", v)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field info={"Steht ein Inserat im Schnitt höchstens so viele Tage online, gilt die Gruppe als schnell verkäuflich (mehr Punkte).\nBeispiel: 21 → Ø 15 Tage online = schnell."} label="Tempo schnell bis (Tage)"><Num value={s.tempoSchnell} onChange={(v) => set("tempoSchnell", v)} /></Field>
          <Field info={"Bis zu dieser Tageszahl gilt das Tempo als „mittel“. Darüber ist es „langsam“.\nBeispiel: 45 → Ø 30 Tage = mittel, Ø 60 Tage = langsam."} label="Tempo mittel bis (Tage)"><Num value={s.tempoMittel} onChange={(v) => set("tempoMittel", v)} /></Field>
          <Field info={"Misst, wie weit die Preise einer Gruppe auseinanderliegen ((teuerstes − günstigstes) ÷ Durchschnitt). Bis zu diesem Wert gilt der Preis als stabil.\nBeispiel: 30 % → bei Ø 4.000 € darf die Spanne bis ca. 1.200 € gehen."} label="Preis stabil bis (Streuung %)"><Num pct value={s.stabil} onChange={(v) => set("stabil", v)} /></Field>
          <Field info={"Bis zu diesem Wert gilt die Streuung als „mittel“, darüber als „unsicher“.\nBeispiel: 60 % → Spanne bis ca. 2.400 € bei Ø 4.000 €."} label="Preis mittel bis (Streuung %)"><Num pct value={s.stabilMittel} onChange={(v) => set("stabilMittel", v)} /></Field>
          <Field info={"Jede Gruppe bekommt 0 bis 6 Punkte (Tempo, Preisstabilität, Datenbasis). Ab dieser Punktzahl heißt die Bewertung „Attraktiv“.\nBeispiel: 5 → Gruppe mit 5 oder 6 Punkten ist Attraktiv."} label="'Attraktiv' ab Punkten (von 6)"><Num value={s.punkteAttraktiv} onChange={(v) => set("punkteAttraktiv", v)} /></Field>
          <Field info={"Ab dieser Punktzahl heißt die Bewertung „Prüfen“, darunter „Meiden“.\nBeispiel: 3 → 3 oder 4 Punkte = Prüfen, 0 bis 2 Punkte = Meiden."} label="'Prüfen' ab Punkten"><Num value={s.punktePruefen} onChange={(v) => set("punktePruefen", v)} /></Field>
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
              <input style={mini} type="number" value={m.kosten} onChange={(e) => upd("massnahmen", m.id, { kosten: +e.target.value })} placeholder="Kosten €" />
              <input style={mini} type="number" value={m.effekt} onChange={(e) => upd("massnahmen", m.id, { effekt: +e.target.value })} placeholder="Mehrwert €" />
            </div>
          </div>
        ))}
        <button style={btn(false)} onClick={() => setSettings({ ...s, massnahmen: [...s.massnahmen, { id: nextId("m"), name: "Neue Maßnahme", kosten: 0, effekt: 0 }] })}>+ Maßnahme</button>
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
        <button style={btn(false)} onClick={() => setSettings({ ...s, zustand: [...s.zustand, { id: nextId("z"), name: "Neuer Punkt", effekt: 0 }] })}>+ Punkt</button>
      </div>

      <button style={{ ...btn(false), width: "100%" }} onClick={() => { if (confirm("Alle Einstellungen auf die Platzhalter zurücksetzen? Gespeicherte Gruppen gehen dabei verloren.")) setSettings(structuredClone(DEFAULT_SETTINGS)); }}>Auf Platzhalter zurücksetzen</button>
    </div>
  );
}
