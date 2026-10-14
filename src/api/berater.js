// Vercel Serverless Function: KI-Berater.
// Bekommt fertig berechnete Marktdaten (keine Rohdaten) und formuliert daraus
//  - mode "text":  Markt erklären (art = "markt") oder Deal beraten (art = "deal")
//  - mode "top5":  wählt aus einer Kandidatenliste die 5 besten Fahrzeuge, mit Stichwörtern
//                  und fertigen Nachrichten an den Verkäufer (Erstnachricht und Nachfass)
// Umgebungsvariablen: ANTHROPIC_API_KEY (Pflicht), APP_CODE (empfohlen),
//   ANTHROPIC_MODEL_BERATER (optional, sonst ANTHROPIC_MODEL, sonst claude-sonnet-5-5)

const RULES = `Du bist ein erfahrener, ehrlicher Gebrauchtwagen-Berater für Einsteiger im Autohandel in Deutschland. Du sprichst den Nutzer mit "du" an, in einfacher, klarer Sprache. Fachbegriffe erklärst du in einem Halbsatz.

Du bekommst als JSON fertig berechnete Marktdaten aus dem Tool des Nutzers. Dafür gilt:
- Nutze ausschließlich die gelieferten Zahlen. Erfinde keine Preise, Marktdaten oder Statistiken.
- Widersprich den berechneten Werten des Tools nicht. Du erklärst und bewertest sie.
- Die Preise stammen aus Inseraten. Das sind Angebotspreise und keine tatsächlichen Verkaufspreise.
- Ist die Datenbasis dünn ("zu dünn" oder wenige Inserate), sage das klar und schwäche deine Empfehlung entsprechend ab.
- Du siehst den technischen Zustand der Autos nicht. Weise bei Kaufempfehlungen auf Besichtigung bzw. Prüfung hin.
- Du gibst keine Rechts- oder Steuerberatung. Bei Gewährleistung, Differenzbesteuerung und Gewerbeanmeldung verweise auf einen Steuerberater.
- Sei konkret: nenne Gruppen, Euro-Beträge und eine klare Reihenfolge. Sage auch, was der Nutzer lassen sollte.
- Beantworte zusätzlich die Frage des Nutzers, falls eine gestellt wurde.`;

const TEXT_FORMAT = `

Format: Überschriften mit "## ", Aufzählungen mit "- ". Kein anderes Markdown.

Bei art = "markt" erklärst du den Markt dieses Modells professionell, aber so, dass ein Anfänger ihn versteht. Maximal etwa 450 Wörter. Gliederung:
## So sieht der Markt aus
## Was das für dich bedeutet
## Die besten Bereiche
## Worauf du achten musst
## Dein Fahrplan

Bei art = "deal" beurteilst du ein einzelnes Angebot. Maximal etwa 350 Wörter. Gliederung:
## Urteil zum Deal
## Verhandlungsplan
## Das musst du vor dem Kauf prüfen
## Risiken`;

const TOP5_FORMAT = `

Aufgabe: Du bekommst eine Liste von Kandidaten (Inserate eines Modells, bei denen laut Tool ein Gewinn möglich ist). Wähle daraus die 5 besten Fahrzeuge für einen Einsteiger aus (weniger, wenn es weniger Kandidaten gibt).

So wählst du aus:
- Das Feld "einstufung" sagt, wie der Angebotspreis zur Obergrenze steht: "im Budget" (Angebot liegt unter der Obergrenze), "verhandelbar" (bis knapp darüber) oder "nur mit deutlichem Nachlass" (nötiger Preisnachlass steht in "noetigerNachlassProzent"). Bevorzuge "im Budget", dann "verhandelbar". Wählst du "nur mit deutlichem Nachlass", sage das in den Stichwörtern offen.
- Bevorzuge hohen erwarteten Gewinn bei solider Datenbasis ("ok"), schnellem Tempo und stabilen Preisen.
- Lange Standzeit (tageOnline) und Händler-Inserate sprechen oft für mehr Verhandlungsspielraum. Benutze das nur, wenn die Zahl in den Daten steht.
- Meide Gruppen mit Bewertung "Meiden" oder dünner Datenbasis, außer die Zahlen sind eindeutig überlegen. Erwähne das dann in den Stichwörtern.

Zu jedem gewählten Fahrzeug lieferst du:
- "stichwoerter": 3 bis 5 kurze Stichwörter (jeweils höchstens 6 Wörter), warum es gewählt wurde. Nur Begründungen, die aus den Daten folgen.
- "nachricht": die Erstnachricht an den Verkäufer.
- "nachfass": eine kurze Nachfass-Nachricht für den Fall, dass nach 2 bis 3 Tagen keine Antwort kommt.

Regeln für die Nachrichten (ehrlich und kaufpsychologisch klug, nicht aufdringlich):
- Schreibe in der Sie-Form, freundlich, wertschätzend und konkret. Erstnachricht etwa 60 bis 90 Wörter, Nachfass etwa 30 bis 45 Wörter.
- Beginne mit echtem, konkretem Interesse am Fahrzeug (Modell, Baujahr, Kilometerstand aus den Daten). Erfinde keine Details zur Ausstattung oder zum Zustand.
- Nenne genau einmal den Betrag aus "ersteresAngebot" als Angebot, mit einer kurzen sachlichen Begründung. Zulässig: Ich habe mehrere vergleichbare Fahrzeuge angesehen, Preis passt zu Kilometerstand und Baujahr. Nenne niemals die Obergrenze und nenne keine Zahlen, die nicht in den Daten stehen.
- Mach es dem Verkäufer leicht, Ja zu sagen: schnelle, unkomplizierte Abwicklung, Besichtigung zeitnah, Zahlung bei Übergabe. Biete nur an, was ein Händler realistisch leisten kann.
- Lass dem Verkäufer sein Gesicht und eine offene Tür: Respekt vor seinem Wunsch, kein Vorwurf und keine Abwertung des Autos.
- Beende mit einer leichten, konkreten Frage, zum Beispiel ob eine Besichtigung diese Woche möglich wäre.
- Bei Privatverkäufern etwas persönlicher, bei Händlern sachlicher und kürzer.
- Keine Drängelei, keine künstliche Verknappung, keine erfundenen Konkurrenzangebote, keine Drohungen, keine Lügen. Der Verkäufer soll sich gut behandelt fühlen und nicht an jemand anderen verkaufen wollen.
- Unterschrift: Nutze den Wert aus "absender". Ist er leer, schreibe "[Dein Name]".

Antworte NUR mit einem JSON-Array, ohne Text davor oder danach, in dieser Form:
[{"id": <Zahl aus den Daten>, "stichwoerter": ["..."], "nachricht": "...", "nachfass": "..."}]
Die "id" muss genau einer id aus der Kandidatenliste entsprechen. Zeilenumbrüche in Nachrichten als \\n schreiben.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });
  const code = process.env.APP_CODE;
  if (code && req.headers["x-app-code"] !== code) return res.status(401).json({ error: "Zugangscode falsch oder fehlt" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY ist in Vercel nicht gesetzt" });

  const { context, question, mode } = req.body || {};
  if (!context || typeof context !== "object") return res.status(400).json({ error: "Keine Daten übergeben" });
  const payload = JSON.stringify(context);
  if (payload.length > 30000) return res.status(400).json({ error: "Zu viele Daten für eine Anfrage" });
  const q = typeof question === "string" ? question.trim().slice(0, 500) : "";
  const top5 = mode === "top5";

  const userText = top5
    ? `Daten aus dem Tool (JSON):\n${payload}`
    : `Marktdaten aus dem Tool (JSON):\n${payload}\n\n${q ? `Frage des Nutzers: ${q}` : "Der Nutzer hat keine eigene Frage gestellt. Gib deine Einschätzung nach der Gliederung."}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_BERATER || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: top5 ? 4000 : 1800,
        system: RULES + (top5 ? TOP5_FORMAT : TEXT_FORMAT),
        messages: [{ role: "user", content: userText }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || "Fehler beim Berater" });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!top5) return res.status(200).json({ text });

    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    let raw = [];
    if (start !== -1 && end > start) {
      try { raw = JSON.parse(text.slice(start, end + 1)); } catch { raw = []; }
    }
    const picks = (Array.isArray(raw) ? raw : [])
      .map((p) => ({
        id: Number(p?.id),
        stichwoerter: Array.isArray(p?.stichwoerter) ? p.stichwoerter.filter((s) => typeof s === "string").map((s) => s.slice(0, 80)).slice(0, 6) : [],
        nachricht: typeof p?.nachricht === "string" ? p.nachricht.slice(0, 1500) : "",
        nachfass: typeof p?.nachfass === "string" ? p.nachfass.slice(0, 800) : "",
      }))
      .filter((p) => Number.isFinite(p.id))
      .slice(0, 5);
    if (!picks.length) return res.status(502).json({ error: "Der Berater hat keine auswertbare Antwort geliefert. Bitte nochmal versuchen." });
    return res.status(200).json({ picks });
  } catch (e) {
    return res.status(500).json({ error: "Berater fehlgeschlagen: " + e.message });
  }
}
