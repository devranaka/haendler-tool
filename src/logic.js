// Rechenlogik 1:1 nach der Excel "Auto_Marktpreis_Rechner"
// (Einstellungen -> Inserate -> Auswertung -> Deal-Check)

export const DEFAULT_SETTINGS = {
  abschlag: 0.07,          // Verhandlungsabschlag auf Angebotspreise
  anteil: 0.4,             // Anteil günstigster Inserate für den Marktpreis
  minInserate: 5,          // Mindestanzahl Inserate pro Gruppe
  kosten: {
    aufbereitung: 150,
    tuev: 300,
    inserat: 30,
    gewaehrleistung: 200,
    sonstiges: 100,
  },
  wunschgewinn: 500,
  tempoSchnell: 21,        // Tage online
  tempoMittel: 45,
  stabil: 0.3,             // Streuung
  stabilMittel: 0.6,
  punkteAttraktiv: 5,
  punktePruefen: 3,
  spielraum: 0.1,          // Verhandeln bis x % über Max-EK
  startabschlag: 0.08,     // Erstes Angebot = Max-EK minus x %
  groups: [],              // alt: globale Gruppen, wird nicht mehr verwendet
  modelGroups: {},         // Gruppen je Modell-Ordner: { "citroen c1": [ {id,bjVon,bjBis,kmVon,kmBis} ] }
  absender: "",            // Name/Firma für die Nachrichten an Verkäufer
  massnahmen: [
    { id: "m1", name: "TÜV/HU neu machen", kosten: 120, effekt: 400 },
    { id: "m2", name: "Inspektion und Ölwechsel", kosten: 150, effekt: 200 },
    { id: "m3", name: "Neue Reifen (Satz)", kosten: 280, effekt: 300 },
    { id: "m4", name: "Aufbereitung innen und außen", kosten: 120, effekt: 250 },
    { id: "m5", name: "Dellen/Kratzer ausbessern (Smart Repair)", kosten: 150, effekt: 250 },
    { id: "m6", name: "Bremsen erneuern", kosten: 250, effekt: 250 },
    { id: "m7", name: "Klimaservice", kosten: 80, effekt: 100 },
    { id: "m8", name: "Scheinwerfer polieren", kosten: 30, effekt: 60 },
  ],
  zustand: [
    { id: "z1", name: "Scheckheft gepflegt", effekt: 200 },
    { id: "z2", name: "Nur 1 Hand", effekt: 150 },
    { id: "z3", name: "Klimaanlage vorhanden", effekt: 200 },
    { id: "z4", name: "Automatik", effekt: 300 },
    { id: "z5", name: "TÜV schon neu (mind. 1 Jahr)", effekt: 300 },
    { id: "z6", name: "Alufelgen / Navi / Zubehör", effekt: 150 },
    { id: "z7", name: "Unfallschaden", effekt: -600 },
    { id: "z8", name: "Rost / Lackschäden", effekt: -400 },
    { id: "z9", name: "Motor- oder Elektrikdefekt", effekt: -500 },
    { id: "z10", name: "Reifen abgefahren", effekt: -250 },
    { id: "z11", name: "Scheckheft fehlt / lückenhaft", effekt: -200 },
  ],
};

export function mergeSettings(saved) {
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  const d = structuredClone(DEFAULT_SETTINGS);
  return { ...d, ...saved, kosten: { ...d.kosten, ...(saved.kosten || {}) }, modelGroups: saved.modelGroups || {}, absender: saved.absender || "" };
}

export const sumKosten = (s) => Object.values(s.kosten).reduce((a, b) => a + (Number(b) || 0), 0);

const num = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function groupLabel(g) {
  return `Bj ${g.bjVon}-${g.bjBis} | ${Math.round(g.kmVon / 1000)}-${Math.round(g.kmBis / 1000)}k km`;
}

export function findGroup(bj, km, groups) {
  bj = num(bj); km = num(km);
  if (bj === null || km === null) return null;
  return groups.find((g) => g.bjVon <= bj && g.bjBis >= bj && g.kmVon <= km && g.kmBis >= km) || null;
}

// Gruppen aus den Daten bilden. Probiert drei Rastergrößen (3 J./30.000 km, 4 J./40.000 km,
// 5 J./50.000 km) und nimmt die feinste, bei der die 10 größten Gruppen mindestens 70 % der
// Inserate abdecken. Sonst die Raster-Größe mit der besten Abdeckung.
export function suggestGroups(inserate, maxGroups = 10) {
  const valid = inserate.filter((i) => !i.ausschliessen && num(i.baujahr) !== null && num(i.km) !== null && num(i.preis) !== null);
  if (!valid.length) return [];
  let best = null;
  for (const [by, kb] of [[3, 30000], [4, 40000], [5, 50000]]) {
    const map = new Map();
    valid.forEach((i) => {
      const bj0 = Math.floor((i.baujahr - 2000) / by) * by + 2000;
      const km0 = Math.floor(i.km / kb) * kb;
      const k = `${bj0}|${km0}`;
      map.set(k, (map.get(k) || 0) + 1);
    });
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxGroups);
    const covered = top.reduce((a, [, c]) => a + c, 0) / valid.length;
    if (!best || covered > best.covered) best = { by, kb, top, covered };
    if (covered >= 0.7) { best = { by, kb, top, covered }; break; }
  }
  return best.top
    .map(([k]) => k.split("|").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([bj0, km0], idx) => ({ id: idx + 1, bjVon: bj0, bjBis: bj0 + best.by - 1, kmVon: km0, kmBis: km0 + best.kb - 1 }));
}

export function evaluateGroups(inserate, s) {
  const kostenSumme = sumKosten(s);
  const valid = inserate.filter(
    (i) => !i.ausschliessen && num(i.baujahr) !== null && num(i.km) !== null && num(i.preis) !== null
  );
  return s.groups.map((g) => {
    const items = valid.filter((i) => findGroup(i.baujahr, i.km, [g]));
    const n = items.length;
    const base = { group: g, label: groupLabel(g), n };
    if (n === 0) return { ...base, empty: true, datenbasis: "keine", bewertung: "–" };
    const prices = items.map((i) => Number(i.preis));
    const rank = (p) => prices.filter((x) => x < p).length + 1;
    const maxRank = Math.max(1, Math.ceil(n * s.anteil));
    const counted = items.filter((i) => rank(Number(i.preis)) <= maxRank).map((i) => Number(i.preis));
    const mean = avg(prices);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const markt = avg(counted);
    const vk = markt * (1 - s.abschlag);
    const maxEK = vk - kostenSumme - s.wunschgewinn;
    const datenbasis = n < s.minInserate ? "zu dünn" : "ok";
    const tage = items.map((i) => num(i.tage)).filter((t) => t !== null);
    const tageAvg = tage.length ? avg(tage) : null;
    const streuung = mean ? (max - min) / mean : null;
    const tempo = tageAvg === null ? "unbekannt" : tageAvg <= s.tempoSchnell ? "schnell" : tageAvg <= s.tempoMittel ? "mittel" : "langsam";
    const stabilitaet =
      n < 2 || streuung === null ? "unbekannt" : streuung <= s.stabil ? "stabil" : streuung <= s.stabilMittel ? "mittel" : "streut stark";
    const punkte =
      (tempo === "schnell" ? 2 : tempo === "langsam" ? 0 : 1) +
      (stabilitaet === "stabil" ? 2 : stabilitaet === "streut stark" ? 0 : 1) +
      (datenbasis === "ok" ? 2 : 0);
    const bewertung = maxEK < 0 ? "Meiden" : punkte >= s.punkteAttraktiv ? "Attraktiv" : punkte >= s.punktePruefen ? "Prüfen" : "Meiden";
    return {
      ...base, mean, min, max, markt, vk, kosten: kostenSumme, wunschgewinn: s.wunschgewinn, maxEK,
      datenbasis, tageAvg, streuung, tempo, stabilitaet, punkte, bewertung,
    };
  });
}

const floor50 = (v) => Math.floor(v / 50) * 50;
const ceil50 = (v) => Math.ceil(v / 50) * 50;

export function dealCheck({ bj, km, preis, massnahmen = [], zustand = [] }, evals, s) {
  bj = num(bj); km = num(km); preis = num(preis);
  if (bj === null || km === null || preis === null) return { status: "EINGABE", headline: "Bitte Baujahr, Kilometer und Angebotspreis eingeben." };
  const g = findGroup(bj, km, s.groups);
  if (!g) return { status: "KEINE_GRUPPE", headline: "Für dieses Auto gibt es noch keine Marktgruppe.", hint: "Lege unter Einstellungen eine passende Gruppe an oder lass sie dir aus den Inseraten vorschlagen." };
  const ev = evals.find((e) => e.group.id === g.id);
  if (!ev || ev.empty) return { status: "ZU_WENIG_DATEN", group: g, label: groupLabel(g), headline: "Für diese Gruppe gibt es noch keine Inserate.", hint: "Lies zuerst Inserate ein (Screenshot oder Video), dann kann der Markt bewertet werden." };

  const mSel = s.massnahmen.filter((m) => massnahmen.includes(m.id));
  const zSel = s.zustand.filter((z) => zustand.includes(z.id));
  const effekt = mSel.reduce((a, m) => a + m.effekt, 0) + zSel.reduce((a, z) => a + z.effekt, 0);
  const zusatzKosten = mSel.reduce((a, m) => a + m.kosten, 0);
  const vk = ev.vk + effekt;
  const kosten = ev.kosten + zusatzKosten;
  const maxEK = vk - kosten - s.wunschgewinn;
  const gewinn = vk - kosten - preis;
  const abstand = preis - maxEK;
  let status = "FINGER_WEG";
  if (preis <= maxEK) status = "KAUFEN";
  else if (preis <= maxEK * (1 + s.spielraum) && maxEK > 0) status = "VERHANDELN";

  const warnings = [];
  if (ev.datenbasis === "zu dünn") warnings.push(`Nur ${ev.n} Inserate in dieser Gruppe (empfohlen: mindestens ${s.minInserate}). Die Einschätzung ist unsicher.`);
  if (ev.bewertung === "Meiden") warnings.push("Diese Marktgruppe wird insgesamt als 'Meiden' bewertet (langsamer Verkauf, unstabile Preise oder zu wenig Daten).");
  if (ev.tempo === "langsam") warnings.push(`Autos dieser Gruppe stehen im Schnitt ${Math.round(ev.tageAvg)} Tage online. Du musst mit langer Standzeit rechnen.`);
  if (ev.stabilitaet === "streut stark") warnings.push("Die Preise in dieser Gruppe streuen stark. Der Marktpreis ist weniger verlässlich.");
  if (zSel.some((z) => z.effekt < 0)) warnings.push("Du hast Mängel angekreuzt. Prüfe vor dem Kauf, ob die Kosten realistisch angesetzt sind.");

  const startgebot = Math.max(0, floor50(maxEK * (1 - s.startabschlag)));
  const inserierenFuer = ceil50(vk / (1 - s.abschlag));
  const breakEven = Math.round(kosten + preis);
  const rendite = preis > 0 ? gewinn / preis : null;

  let headline;
  if (status === "KAUFEN") headline = `Kaufen. Der Preis liegt ${eur(maxEK - preis)} unter deinem Maximum. Erwarteter Gewinn: ${eur(gewinn)}.`;
  else if (status === "VERHANDELN") headline = `Noch ${eur(abstand)} zu teuer. Handle runter auf höchstens ${eur(maxEK)}.`;
  else headline = maxEK <= 0 ? "Finger weg. Bei diesem Markt und diesen Kosten ist kein Gewinn möglich." : `Finger weg. Das Angebot liegt ${eur(abstand)} über deinem Maximum von ${eur(maxEK)}.`;

  return {
    status, group: g, label: groupLabel(g), ev, headline, warnings,
    markt: ev.markt, vkBasis: ev.vk, effekt, zusatzKosten, vk, kosten, wunschgewinn: s.wunschgewinn,
    maxEK, gewinn, abstand, rendite, startgebot, inserierenFuer, breakEven, preis,
  };
}

export function eur(n) {
  if (n === null || n === undefined || isNaN(n)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
}

/* ---------- Ordner je Fahrzeugmodell ---------- */

export const norm = (s) =>
  (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Ordner eines Inserats: Marke + Baureihe, bei älteren Inseraten aus den ersten zwei Wörtern der Bezeichnung
export function folderInfo(i) {
  let marke = (i.marke || "").trim();
  let reihe = (i.baureihe || "").trim();
  if (!marke && !reihe) {
    const t = (i.modell || "").trim().split(/\s+/).filter(Boolean);
    if (t.length) { marke = t[0]; reihe = t[1] || ""; }
  }
  const label = [marke, reihe].filter(Boolean).join(" ") || "Ohne Modell";
  return { key: norm(label) || "ohne-modell", label };
}

export function buildFolders(inserate, settings) {
  const map = new Map();
  inserate.forEach((i) => {
    const { key, label } = folderInfo(i);
    if (!map.has(key)) map.set(key, { key, labels: {}, items: [] });
    const f = map.get(key);
    f.labels[label] = (f.labels[label] || 0) + 1;
    f.items.push(i);
  });
  return [...map.values()]
    .map((f) => {
      const label = Object.entries(f.labels).sort((a, b) => b[1] - a[1])[0][0];
      const saved = settings.modelGroups?.[f.key];
      const auto = !(saved && saved.length);
      const groups = auto ? suggestGroups(f.items) : saved;
      const evals = evaluateGroups(f.items, { ...settings, groups });
      const active = f.items.filter((i) => !i.ausschliessen);
      const best = [...evals].filter((e) => !e.empty).sort((a, b) => b.punkte - a.punkte || b.maxEK - a.maxEK)[0] || null;
      return { key: f.key, label, items: f.items, active, groups, auto, evals, best, n: f.items.length };
    })
    .sort((a, b) => b.n - a.n);
}

const rnd = (n) => (n === null || n === undefined || isNaN(n) ? null : Math.round(n));

// Vorauswahl für den Berater: Inserate, bei denen mit realistischem Verhandeln (erstes Angebot
// höchstens ca. 28 % unter dem Angebotspreis) ein Gewinn möglich ist.
// Sortiert nach Einstufung (im Budget, verhandelbar, nur mit deutlichem Nachlass),
// dann nach Bewertung der Gruppe, dann nach erwartetem Gewinn.
export function topCandidates(folder, s, max = 12) {
  const rankB = { Attraktiv: 0, Prüfen: 1, Meiden: 2 };
  const out = [];
  folder.items.forEach((i) => {
    if (i.ausschliessen) return;
    const g = findGroup(i.baujahr, i.km, folder.groups);
    if (!g) return;
    const ev = folder.evals.find((e) => e.group.id === g.id);
    if (!ev || ev.empty || ev.maxEK === undefined || !(ev.maxEK > 0)) return;
    const preis = Number(i.preis);
    if (!(preis > 0)) return;
    const erst = Math.max(0, floor50(Math.min(ev.maxEK * (1 - s.startabschlag), preis * 0.93)));
    if (erst < preis * 0.72) return; // wäre ein unrealistisch niedriges Angebot
    const gewinn = ev.vk - ev.kosten - preis;
    const einstufung = preis <= ev.maxEK ? "im Budget" : preis <= ev.maxEK * (1 + s.spielraum) ? "verhandelbar" : "nur mit deutlichem Nachlass";
    out.push({
      id: i.id, modell: i.modell || folder.label, baujahr: i.baujahr, km: i.km, preis,
      anbieter: i.anbieter || null, tageOnline: i.tage ?? null,
      gruppe: ev.label, gruppenBewertung: ev.bewertung, datenbasis: ev.datenbasis, tempo: ev.tempo, preisstabilitaet: ev.stabilitaet,
      einstufung, maxEinkaufGruppe: rnd(ev.maxEK), erwarteterGewinnBeiAngebotspreis: rnd(gewinn), abstandZumMax: rnd(preis - ev.maxEK),
      noetigerNachlassProzent: Math.max(0, Math.round((1 - ev.maxEK / preis) * 100)),
      ersteresAngebot: erst,
      _s: einstufung === "im Budget" ? 0 : einstufung === "verhandelbar" ? 1 : 2,
      _rank: rankB[ev.bewertung] ?? 2, _gewinn: gewinn,
    });
  });
  out.sort((a, b) => a._s - b._s || a._rank - b._rank || b._gewinn - a._gewinn);
  return out.slice(0, max).map(({ _s, _rank, _gewinn, ...rest }) => rest);
}
