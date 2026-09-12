#!/usr/bin/env node
// Enriquece data/latest.json (y el histórico del día) con el link exacto de
// Spotify de cada canción, vía el Client Credentials Flow (sin login de
// usuario, solo credenciales de una app). Si SPOTIFY_CLIENT_ID /
// SPOTIFY_CLIENT_SECRET no están configuradas, no falla: simplemente no
// agrega links, para que el resto del pipeline siga funcionando sin ellas.
//
// Uso: SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node fetch-spotify.js

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// primer artista acreditado, para que la búsqueda no falle por "A, B & C"
function firstArtist(artistName) {
  return (artistName || "").split(/,| x | X |&|\bfeat\.?\b|\bft\.?\b/i)[0].trim();
}

async function getToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

async function searchTrack(token, title, artist) {
  const q = `track:${title} artist:${artist}`;
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const json = await res.json();
  const track = json.tracks?.items?.[0];
  return track ? track.external_urls.spotify : null;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set. Skipping Spotify enrichment.");
    return;
  }

  const file = path.join(DATA_DIR, "latest.json");
  if (!existsSync(file)) {
    console.error("data/latest.json not found. Run fetch.js first.");
    process.exit(1);
  }
  const data = JSON.parse(await readFile(file, "utf8"));
  const token = await getToken();

  const cache = new Map(); // norm(title)|norm(artist) -> url, avoids repeat lookups
  let found = 0;

  async function resolve(title, artistName) {
    const artist = firstArtist(artistName);
    const key = norm(title) + "|" + norm(artist);
    if (cache.has(key)) return cache.get(key);
    let url = null;
    try {
      await sleep(120);
      url = await searchTrack(token, title, artist);
    } catch (err) {
      console.warn(`spotify: failed on "${title}" — ${artist}: ${err.message}`);
    }
    cache.set(key, url);
    if (url) found++;
    return url;
  }

  for (const entry of data.consensus) {
    entry.spotifyUrl = await resolve(entry.title, entry.artistName);
  }
  for (const signal of data.signals) {
    const key = norm(signal.title);
    const match = data.consensus.find(c => norm(c.title) === key);
    signal.spotifyUrl = match ? match.spotifyUrl : await resolve(signal.title, signal.artistName);
  }
  for (const code of Object.keys(data.countries)) {
    for (const track of data.countries[code].tracks) {
      track.spotifyUrl = await resolve(track.name, track.artistName);
    }
  }

  await writeFile(file, JSON.stringify(data, null, 2));
  const dailyFile = path.join(DATA_DIR, `${data.snapshotDate}.json`);
  if (existsSync(dailyFile)) {
    await writeFile(dailyFile, JSON.stringify(data, null, 2));
  }

  console.log(`Spotify: ${cache.size} unique lookups, ${found} matched.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
