const URL_ = import.meta.env.VITE_SUPABASE_URL || "https://jymsxauqoxlsueyvxdxn.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_lAsHe2C7eJyTNCCkeo87VQ_rNIEx9Pe";

async function sb(path, { method = "GET", body, prefer = "return=representation" } = {}) {
  const res = await fetch(`${URL_}/rest/v1${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

const toLocal = (r) => ({
  id: r.id, erfasst: r.erfasst, quelle: r.quelle || "", modell: r.modell || "",
  baujahr: r.baujahr, km: r.km, preis: r.preis, anbieter: r.anbieter || "",
  tage: r.tage, notiz: r.notiz || "", ausschliessen: !!r.ausschliessen,
});
const toRow = (i) => ({
  quelle: i.quelle || null, modell: i.modell || null,
  baujahr: i.baujahr === "" || i.baujahr == null ? null : Number(i.baujahr),
  km: i.km === "" || i.km == null ? null : Number(i.km),
  preis: i.preis === "" || i.preis == null ? null : Number(i.preis),
  anbieter: i.anbieter || null,
  tage: i.tage === "" || i.tage == null ? null : Number(i.tage),
  notiz: i.notiz || null,
  ausschliessen: !!i.ausschliessen,
});

export const loadInserate = async () => (await sb("/haendler_inserate?select=*&order=id.asc&limit=2000")).map(toLocal);
export const insertInserate = async (list) =>
  list.length ? (await sb("/haendler_inserate", { method: "POST", body: list.map(toRow) })).map(toLocal) : [];
export const patchInserat = (id, patch) =>
  sb(`/haendler_inserate?id=eq.${id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
export const deleteInserat = (id) => sb(`/haendler_inserate?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
export const deleteAllInserate = () => sb("/haendler_inserate?id=gt.0", { method: "DELETE", prefer: "return=minimal" });

export async function loadSettings() {
  const r = await sb("/haendler_settings?id=eq.1&select=data");
  return r[0]?.data || null;
}
export const saveSettings = (data) =>
  sb("/haendler_settings", {
    method: "POST",
    body: { id: 1, data, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });

// ---- KI-Analyse (Screenshots / Video-Frames) über /api/analyze ----
export async function analyzeImages(images, code) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-code": code || "" },
    body: JSON.stringify({ images }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Analyse fehlgeschlagen (${res.status})`);
  return data.listings || [];
}

export function fileToDataUrl(file, maxW = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    img.src = url;
  });
}

export function extractFrames(file, { everySec = 1, maxFrames = 90, maxW = 900, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(file);
    video.src = url;
    const frames = [];
    video.onerror = () => reject(new Error("Video konnte nicht gelesen werden"));
    video.onloadedmetadata = async () => {
      const dur = video.duration;
      const step = Math.max(everySec, dur / maxFrames);
      const c = document.createElement("canvas");
      const scale = Math.min(1, maxW / video.videoWidth);
      c.width = Math.round(video.videoWidth * scale);
      c.height = Math.round(video.videoHeight * scale);
      const ctx = c.getContext("2d");
      for (let t = 0; t < dur; t += step) {
        await new Promise((r) => {
          video.onseeked = r;
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0, c.width, c.height);
        frames.push(c.toDataURL("image/jpeg", 0.7));
        onProgress && onProgress(Math.min(1, t / dur));
      }
      URL.revokeObjectURL(url);
      resolve(frames);
    };
  });
}

export function dedupe(list, existing = []) {
  const key = (i) => `${i.baujahr}|${i.km}|${i.preis}`;
  const seen = new Set(existing.map(key));
  const out = [];
  list.forEach((i) => {
    if (i.preis == null || i.km == null || i.baujahr == null) return;
    const k = key(i);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(i);
  });
  return out;
}
