#!/usr/bin/env node
// Barra lateral de crítica: Best New Music de Pitchfork + reseñas recientes de NME.
// Ninguno de los dos tiene API pública. Pitchfork no tiene RSS de "Best New Music"
// específicamente, pero sí un RSS general de reseñas de discos, y cada página de
// reseña trae su propio estado embebido (window.__PRELOADED_STATE__) con el campo
// musicRating.isBestNewMusic. NME sí tiene RSS normal, sin bandera de calidad: es
// solo el flujo de reseñas recientes. Complex no tiene RSS ni un sistema de
// calificación por lanzamiento, así que no está incluido.
//
// Uso: node fetch-critics.js

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

const UA = "RadarSonoroBot/1.0 (+https://weareguid.github.io/radar-sonoro/; lector de RSS publico, un corte semanal, no redistribuye el cuerpo de las reseñas)";

async function fetchText(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Pitchfork: RSS de reseñas -> por cada una, su página trae musicRating embebido ---
async function fetchPitchforkBestNew({ scanLimit = 30, maxPicks = 8, delayMs = 350 } = {}) {
  const xml = await fetchText("https://pitchfork.com/feed/feed-album-reviews/rss");
  const items = parseRssItems(xml).slice(0, scanLimit);
  const picks = [];
  const failed = [];

  for (const item of items) {
    if (picks.length >= maxPicks) break;
    const url = tag(item, "link").split("?")[0];
    if (!url) continue;
    try {
      await sleep(delayMs);
      const html = await fetchText(url);
      const marker = "window.__PRELOADED_STATE__ = ";
      const start = html.indexOf(marker);
      if (start === -1) throw new Error("sin __PRELOADED_STATE__");
      const jsonStart = start + marker.length;
      const end = html.indexOf("</script>", jsonStart);
      let blob = html.slice(jsonStart, end).trim();
      if (blob.endsWith(";")) blob = blob.slice(0, -1);
      const state = JSON.parse(blob);
      const hp = state?.transformed?.review?.headerProps;
      if (!hp?.musicRating?.isBestNewMusic) continue;

      picks.push({
        artist: (hp.artists || []).map(a => a.name).join(", "),
        title: (hp.dangerousHed || "").replace(/<[^>]+>/g, ""),
        dek: hp.dangerousDek || "",
        score: hp.musicRating.score,
        genre: hp.infoSliceFields?.genre || "",
        label: hp.infoSliceFields?.label || "",
        reviewDate: hp.infoSliceFields?.reviewDate || "",
        url,
        artworkUrl: hp.lede?.sources?.md?.url || hp.lede?.sources?.sm?.url || ""
      });
    } catch (err) {
      failed.push({ url, error: String(err.message || err) });
    }
  }
  return { picks, failed, scanned: items.length };
}

// --- NME: RSS normal, sin bandera de calidad, solo lo más reciente ---
async function fetchNmeRecent({ limit = 8 } = {}) {
  const xml = await fetchText("https://www.nme.com/reviews/album/feed");
  const items = parseRssItems(xml).slice(0, limit);
  return items.map(item => {
    const rawTitle = tag(item, "title");
    const url = tag(item, "link").split("?")[0];
    const desc = tag(item, "description");
    const imgMatch = desc.match(/src="([^"]+)"/);
    const paragraphs = [...desc.matchAll(/<p>([^<]+)<\/p>/g)].map(m => m[1]);
    const dek = paragraphs.find(p => !/^The post /.test(p)) || "";
    const categories = [...item.matchAll(/<category>(?:<!\[CDATA\[)?([^\]<]+)/g)].map(m => m[1]);
    const genre = categories.find(c => !["Reviews", "Album Reviews"].includes(c)) || "";

    // título típico: "Artista – 'Álbum' review: bajada"
    const m = rawTitle.match(/^(.*?)\s[–—-]\s[‘'"“](.+?)[’'"”]\s*review:?\s*(.*)$/);
    return {
      artist: m ? m[1].trim() : "",
      album: m ? m[2].trim() : "",
      dek: m ? m[3].trim() : dek,
      genre,
      url,
      artworkUrl: imgMatch ? imgMatch[1] : ""
    };
  });
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const [pfResult, nmeResult] = await Promise.allSettled([
    fetchPitchforkBestNew(),
    fetchNmeRecent()
  ]);

  const pitchfork = pfResult.status === "fulfilled" ? pfResult.value.picks : [];
  const nme = nmeResult.status === "fulfilled" ? nmeResult.value : [];
  const errors = [];
  if (pfResult.status === "rejected") errors.push({ source: "pitchfork", error: String(pfResult.reason) });
  if (nmeResult.status === "rejected") errors.push({ source: "nme", error: String(nmeResult.reason) });
  if (pfResult.status === "fulfilled") {
    for (const f of pfResult.value.failed) errors.push({ source: "pitchfork:" + f.url, error: f.error });
  }

  const out = {
    updated: new Date().toISOString(),
    pitchfork,
    nme,
    errors
  };

  await writeFile(path.join(DATA_DIR, "critics.json"), JSON.stringify(out, null, 2));
  console.log(`critics.json escrito: ${pitchfork.length} Best New Music (Pitchfork), ${nme.length} reseñas recientes (NME), ${errors.length} errores.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
