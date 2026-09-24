#!/usr/bin/env node
// Baja los 18 feeds públicos de Apple Music, calcula consenso regional,
// sincronía por país y disidentes, y escribe data/latest.json + data/YYYY-MM-DD.json.
//
// Uso: node fetch.js

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const CONTENT_DIR = path.join(__dirname, "content");

// pr devuelve 500 (usa la tienda de EE.UU., no tiene storefront propio). No reintentar.
// Cuba no tiene tienda de Apple Music. Ninguna está en esta lista a propósito.
const STOREFRONTS = ["mx","br","ar","cl","co","pe","uy","py","bo","ec","ve","cr","pa","gt","sv","hn","ni","do"];

const COUNTRY_NAMES = {
  mx:"Mexico", br:"Brazil", ar:"Argentina", cl:"Chile", co:"Colombia", pe:"Peru",
  uy:"Uruguay", py:"Paraguay", bo:"Bolivia", ec:"Ecuador", ve:"Venezuela", cr:"Costa Rica",
  pa:"Panama", gt:"Guatemala", sv:"El Salvador", hn:"Honduras", ni:"Nicaragua", do:"Dominican Republic"
};

// Mercados de referencia. NO entran al consenso, ni a la sincronía, ni al mapa:
// se leen sólo para medir cuánto se cruza la región con ellos. Meterlos al
// consenso convertiría el modelo en "LATAM y los grandes", que es justo la
// jerarquía que los datos no sostienen.
const REFERENCE = ["us","gb"];
const REFERENCE_NAMES = { us:"United States", gb:"United Kingdom" };

const OUTLIER_MAX = 3; // sincronía <= 3 = disidente

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function feedUrl(storefront) {
  return `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/10/songs.json`;
}

async function fetchStorefront(code, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(feedUrl(code), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const results = json?.feed?.results ?? [];
    if (!results.length) throw new Error("feed vacío");
    return results.slice(0, 10).map(r => ({
      name: r.name,
      artistName: r.artistName,
      artworkUrl: (r.artworkUrl100 || "").replace("100x100", "300x300"),
      url: r.url || null
    }));
  } finally {
    clearTimeout(timer);
  }
}

// pequeño retraso entre lotes: 18 llamadas simultáneas al mismo host gatillan
// aborts intermitentes en el feed de Apple, así que se corre en lotes de 6.
async function fetchAll(codes, { batchSize = 6, retries = 1 } = {}) {
  const countries = {};
  const failed = [];

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    await Promise.all(batch.map(async code => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          countries[code] = await fetchStorefront(code);
          console.log(`ok   ${code}`);
          return;
        } catch (err) {
          if (attempt === retries) {
            failed.push({ code, error: String(err.message || err) });
            console.warn(`fail ${code}: ${err.message || err}`);
          }
        }
      }
    }));
  }
  return { countries, failed };
}

// Divide "KAROL G, Judeline & rusowsky" en artistas individuales.
function splitArtists(artistName) {
  return artistName
    .split(/,| x | X |&|\bfeat\.?\b|\bft\.?\b/i)
    .map(a => a.trim())
    .filter(Boolean);
}

function analyze(countries) {
  const codes = Object.keys(countries);

  // consenso: en cuántas listas nacionales aparece cada título normalizado
  const titleCount = new Map();       // norm(title) -> count de países
  const titleLabel = new Map();       // norm(title) -> título original (primera vez visto)
  const titleArtist = new Map();      // norm(title) -> artistName (primera vez visto)
  const titleArt = new Map();         // norm(title) -> artworkUrl (primera vez visto)
  const titleCountries = new Map();   // norm(title) -> [códigos de país donde aparece]
  const titleRank1Count = new Map();  // norm(title) -> en cuántos países es el #1

  for (const code of codes) {
    const seenInCountry = new Set();
    countries[code].forEach((track, i) => {
      const key = norm(track.name);
      if (!seenInCountry.has(key)) {
        seenInCountry.add(key);
        titleCount.set(key, (titleCount.get(key) || 0) + 1);
        if (!titleLabel.has(key)) {
          titleLabel.set(key, track.name);
          titleArtist.set(key, track.artistName);
          titleArt.set(key, track.artworkUrl);
        }
        if (!titleCountries.has(key)) titleCountries.set(key, []);
        titleCountries.get(key).push(code);
      }
      if (i === 0) titleRank1Count.set(key, (titleRank1Count.get(key) || 0) + 1);
    });
  }

  const consensusEntries = [...titleCount.entries()]
    .sort((a, b) => b[1] - a[1] || titleLabel.get(a[0]).localeCompare(titleLabel.get(b[0])))
    .slice(0, 10);
  const consensusSet = new Set(consensusEntries.map(([key]) => key));
  const consensus = consensusEntries.map(([key, count]) => ({
    title: titleLabel.get(key),
    artistName: titleArtist.get(key),
    artworkUrl: titleArt.get(key),
    presence: count,
    of: codes.length,
    countries: titleCountries.get(key)
  }));

  // sincronía por país: cuántas de sus 10 canciones están en el consenso
  const perCountry = {};
  for (const code of codes) {
    const titles = countries[code].map(t => norm(t.name));
    const uniqueTitles = [...new Set(titles)];
    const sync = uniqueTitles.filter(k => consensusSet.has(k)).length;
    perCountry[code] = {
      code, name: COUNTRY_NAMES[code] || code.toUpperCase(),
      sync, dissident: sync <= OUTLIER_MAX,
      tracks: countries[code]
    };
  }

  const maxSyncObserved = Math.max(...Object.values(perCountry).map(c => c.sync));

  // artista presente en más mercados: por país, dedup de artistas individuales en su top 10
  const artistCountryCount = new Map();
  for (const code of codes) {
    const artistsInCountry = new Set();
    countries[code].forEach(t => splitArtists(t.artistName).forEach(a => artistsInCountry.add(a)));
    artistsInCountry.forEach(a => artistCountryCount.set(a, (artistCountryCount.get(a) || 0) + 1));
  }
  const topArtist = [...artistCountryCount.entries()].sort((a, b) => b[1] - a[1])[0];

  // canción #1 en más mercados
  const topRank1 = [...titleRank1Count.entries()].sort((a, b) => b[1] - a[1])[0];

  const dissidents = Object.values(perCountry).filter(c => c.dissident).sort((a, b) => a.sync - b.sync);
  const highestSync = Object.values(perCountry).sort((a, b) => b.sync - a.sync)[0];

  return {
    consensus,
    perCountry,
    maxSyncObserved,
    stats: {
      topSongRank1: topRank1 ? { title: titleLabel.get(topRank1[0]), presence: topRank1[1], of: codes.length } : null,
      topConsensusPresence: consensus.length ? consensus.filter(c => c.presence === consensus[0].presence) : [],
      topArtist: topArtist ? { name: topArtist[0], presence: topArtist[1], of: codes.length } : null,
      highestSync: highestSync ? { code: highestSync.code, name: highestSync.name, sync: highestSync.sync } : null,
      dissidentCount: dissidents.length
    },
    dissidents
  };
}

// Cortes anteriores, del más viejo al más reciente.
async function loadHistory(snapshotDate, limit = 4) {
  if (!existsSync(DATA_DIR)) return [];
  const files = (await readdir(DATA_DIR))
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${snapshotDate}.json`)
    .sort()
    .slice(-limit);
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8"))); }
    catch { /* corte corrupto o parcial, se ignora */ }
  }
  return out;
}

// Cruce entre la región y los mercados de referencia. Dos pruebas distintas,
// a propósito:
//   exporta  = títulos DEL CONSENSO regional que están en el top 10 del mercado.
//   importa  = títulos del top 10 del mercado que aparecen en CUALQUIERA de las
//              18 listas nacionales. Es la prueba generosa: si con 18 listas no
//              aparece, de verdad no está sonando en la región.
// Ambas sobre 10, así que las cifras se leen juntas sin trampa.
function crossover(consensus, countries, reference, history) {
  const consensusKeys = new Set(consensus.map(c => norm(c.title)));
  const latamKeys = new Set();
  for (const code of Object.keys(countries)) {
    countries[code].forEach(t => latamKeys.add(norm(t.name)));
  }

  const flow = (fromLabel, toLabel, titles) => ({
    from: fromLabel, to: toLabel, count: titles.length, of: 10, titles
  });

  const flows = [];
  for (const code of Object.keys(reference)) {
    const feed = reference[code];
    const name = REFERENCE_NAMES[code] || code.toUpperCase();
    const exported = consensus
      .filter(c => feed.some(t => norm(t.name) === norm(c.title)))
      .map(c => ({ title: c.title, artistName: c.artistName }));
    const imported = feed
      .filter(t => latamKeys.has(norm(t.name)))
      .map(t => ({ title: t.name, artistName: t.artistName }));
    flows.push({ ...flow("LATAM", name, exported), key: `latam-${code}`, direction: "out", market: code });
    flows.push({ ...flow(name, "LATAM", imported), key: `${code}-latam`, direction: "in", market: code });
  }

  // US ↔ UK entre ellos: el control del experimento. Si los dos mercados anglo
  // tampoco coinciden, "LATAM está aislado" deja de ser la lectura correcta.
  let anglo = null;
  if (reference.us && reference.gb) {
    const gbKeys = new Set(reference.gb.map(t => norm(t.name)));
    const shared = reference.us
      .filter(t => gbKeys.has(norm(t.name)))
      .map(t => ({ title: t.name, artistName: t.artistName }));
    anglo = { ...flow("United States", "United Kingdom", shared), key: "us-gb", direction: "mutual" };
  }

  // Racha: cortes consecutivos —este incluido— sin un solo título del consenso
  // regional en ningún mercado de referencia.
  const exportedNow = flows.filter(f => f.direction === "out").reduce((n, f) => n + f.count, 0);
  let streak = exportedNow === 0 ? 1 : 0;
  if (exportedNow === 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const past = history[i]?.crossover?.flows;
      if (!past) break;
      const n = past.filter(f => f.direction === "out").reduce((s, f) => s + f.count, 0);
      if (n !== 0) break;
      streak++;
    }
  }

  const prevCut = history[history.length - 1]?.crossover || null;
  const prev = prevCut
    ? Object.fromEntries((prevCut.flows || []).map(f => [f.key, f.count]))
    : null;

  return { flows, anglo, exportedNow, streak, prev, snapshotOf: 10 };
}

// Clasifica cada título del consenso como flash / mid-cycle / structural
// comparando contra los cortes históricos disponibles. Con menos de 3 cortes
// previos no hay serie suficiente: se usa un umbral de presencia como marcador
// provisional y se etiqueta como tal.
function classifySignals(consensus, history) {
  return consensus.map(entry => {
    const key = norm(entry.title);
    const appearances = history.filter(snap =>
      (snap.consensus || []).some(c => norm(c.title) === key)
    ).length;

    if (history.length >= 2) {
      if (appearances >= 2) return { ...entry, tier: 3, tierLabel: "structural movement", provisional: false };
      if (appearances === 1) return { ...entry, tier: 2, tierLabel: "mid-cycle wave", provisional: false };
      return { ...entry, tier: 1, tierLabel: "flash trend", provisional: false };
    }

    // bootstrap: sin histórico suficiente, heurística por presencia en el corte actual
    const pct = entry.presence / entry.of;
    const tier = pct >= 0.78 ? 3 : pct >= 0.45 ? 2 : 1;
    const tierLabel = tier === 3 ? "structural movement" : tier === 2 ? "mid-cycle wave" : "flash trend";
    return { ...entry, tier, tierLabel, provisional: true };
  });
}

async function loadCuratorial() {
  const file = path.join(CONTENT_DIR, "curatorial.json");
  if (!existsSync(file)) return { why: {}, myths: {} };
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const { countries, failed } = await fetchAll(STOREFRONTS);
  if (Object.keys(countries).length === 0) {
    console.error("Ningún storefront respondió. Aborta sin escribir.");
    process.exit(1);
  }

  // Los de referencia van aparte y no son críticos: si fallan, el corte sale
  // igual y la sección de cruce simplemente no se dibuja.
  const { countries: reference, failed: referenceFailed } = await fetchAll(REFERENCE);

  const snapshot = new Date().toISOString();
  const snapshotDate = snapshot.slice(0, 10);

  const history = await loadHistory(snapshotDate);
  const { consensus, perCountry, maxSyncObserved, stats, dissidents } = analyze(countries);
  const signals = classifySignals(consensus, history);
  const cross = Object.keys(reference).length
    ? crossover(consensus, countries, reference, history)
    : null;
  const curatorial = await loadCuratorial();

  const dissidentsWithNotes = dissidents.map(d => ({
    ...d,
    why: curatorial.why[d.code] || null,
    needsReview: !curatorial.why[d.code]
  }));

  const out = {
    snapshot,
    snapshotDate,
    storefronts: STOREFRONTS,
    failed,
    maxSyncObserved,
    consensus,
    signals,
    crossover: cross,
    reference: Object.fromEntries(Object.entries(reference).map(([code, tracks]) => [
      code, { code, name: REFERENCE_NAMES[code] || code.toUpperCase(), tracks }
    ])),
    referenceFailed,
    countries: perCountry,
    dissidents: dissidentsWithNotes,
    stats,
    curatorialMyths: curatorial.myths
  };

  await writeFile(path.join(DATA_DIR, "latest.json"), JSON.stringify(out, null, 2));
  await writeFile(path.join(DATA_DIR, `${snapshotDate}.json`), JSON.stringify(out, null, 2));

  const reviewNeeded = dissidentsWithNotes.filter(d => d.needsReview).map(d => d.name);
  if (reviewNeeded.length) {
    console.warn(`\nRevisión editorial pendiente en content/curatorial.json para: ${reviewNeeded.join(", ")}`);
  }
  const failedList = failed.map(f => f.code);
  if (failedList.length) {
    console.warn(`Storefronts sin respuesta este corte: ${failedList.join(", ")}`);
  }

  console.log(`\nCorte ${snapshotDate} escrito. ${Object.keys(countries).length}/${STOREFRONTS.length} mercados, ${dissidents.length} disidentes.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
