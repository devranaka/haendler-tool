// Vercel Serverless Function: liest Inserate aus Screenshots / Video-Frames mit Claude (Vision).
// Benötigte Umgebungsvariablen in Vercel:
//   ANTHROPIC_API_KEY  (Pflicht)
//   APP_CODE           (empfohlen: Zugangscode, schützt vor fremder Nutzung deines Guthabens)
//   ANTHROPIC_MODEL    (optional, Standard: claude-sonnet-5-5)

const PROMPT = `Du siehst Screenshots von Gebrauchtwagen-Suchergebnissen oder von einem einzelnen Inserat (deutsche Portale).
Extrahiere jedes vollständig lesbare Inserat. Antworte NUR mit einem JSON-Array, ohne Text davor oder danach.
Felder je Inserat:
- "marke": string (nur die Marke, z. B. "Citroën", "VW", "Mercedes-Benz") oder null
- "baureihe": string (nur die Modellreihe ohne Motor und Ausstattung, z. B. "C1", "Polo", "A-Klasse") oder null
- "modell": string (vollständige Bezeichnung wie im Inserat, z. B. "Citroën C1 1.0 VTi Feel")
- "baujahr": Zahl (Jahr der Erstzulassung, z. B. 03/2011 -> 2011) oder null
- "km": Zahl (Kilometerstand als ganze Zahl, ohne Punkt) oder null
- "preis": Zahl (Kaufpreis in Euro, ohne Punkt) oder null
- "anbieter": "Händler" oder "Privat" oder null
- "tage": Zahl (Tage online, nur wenn sichtbar) oder null
Regeln: Nichts erfinden. Abgeschnittene, verwischte oder unleserliche Inserate weglassen. Dasselbe Inserat nur einmal nennen, auch wenn es auf mehreren Bildern zu sehen ist. Wenn kein Inserat erkennbar ist, antworte mit [].`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });
  const code = process.env.APP_CODE;
  if (code && req.headers["x-app-code"] !== code) return res.status(401).json({ error: "Zugangscode falsch oder fehlt" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY ist in Vercel nicht gesetzt" });

  const images = (req.body && req.body.images) || [];
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: "Keine Bilder übergeben" });
  if (images.length > 6) return res.status(400).json({ error: "Maximal 6 Bilder pro Anfrage" });
  if (JSON.stringify(images).length > 4200000) return res.status(413).json({ error: "Bilder zu groß für eine Anfrage" });

  const content = images.map((d) => {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(d);
    return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : null;
  }).filter(Boolean);
  content.push({ type: "text", text: PROMPT });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || "Fehler bei der KI-Analyse" });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    let listings = [];
    if (start !== -1 && end > start) {
      try { listings = JSON.parse(text.slice(start, end + 1)); } catch { listings = []; }
    }
    const clean = listings
      .map((l) => ({
        marke: typeof l.marke === "string" ? l.marke.trim().slice(0, 40) : "",
        baureihe: typeof l.baureihe === "string" ? l.baureihe.trim().slice(0, 40) : "",
        modell: typeof l.modell === "string" ? l.modell.slice(0, 120) : "",
        baujahr: Number.isFinite(+l.baujahr) && l.baujahr ? Math.round(+l.baujahr) : null,
        km: Number.isFinite(+l.km) && l.km != null ? Math.round(+l.km) : null,
        preis: Number.isFinite(+l.preis) && l.preis != null ? Math.round(+l.preis) : null,
        anbieter: l.anbieter === "Händler" || l.anbieter === "Privat" ? l.anbieter : "",
        tage: Number.isFinite(+l.tage) && l.tage != null ? Math.round(+l.tage) : null,
      }))
      .filter((l) => l.preis && l.preis > 100 && (!l.baujahr || (l.baujahr > 1980 && l.baujahr < 2100)));
    return res.status(200).json({ listings: clean });
  } catch (e) {
    return res.status(500).json({ error: "Analyse fehlgeschlagen: " + e.message });
  }
}
