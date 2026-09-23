const COUNTRY_NAMES = {
  mx:"Mexico", br:"Brazil", ar:"Argentina", cl:"Chile", co:"Colombia", pe:"Peru",
  uy:"Uruguay", py:"Paraguay", bo:"Bolivia", ec:"Ecuador", ve:"Venezuela", cr:"Costa Rica",
  pa:"Panama", gt:"Guatemala", sv:"El Salvador", hn:"Honduras", ni:"Nicaragua", do:"Dominican Republic"
};

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let DATA = null;
let CONSENSUS_KEYS = new Set();

function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" });
}

const SPOTIFY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.719-.66 13.379 1.621.361.181.54.78.362 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.72-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.019.599-1.559.3z"/></svg>`;

async function main(){
  let data;
  try {
    const res = await fetch("https://weareguid.github.io/radar-sonoro/data/latest.json", { cache:"no-store" });
    if (!res.ok) throw new Error("no data");
    data = await res.json();
  } catch (err) {
    renderMissingData();
    return;
  }
  render(data);
  loadSidebar();
}

// the sidebar is an independent source (Pitchfork + NME): if it fails,
// it shouldn't take down the rest of the page.
async function loadSidebar(){
  loadInbox();
  try {
    const res = await fetch("https://weareguid.github.io/radar-sonoro/data/critics.json", { cache:"no-store" });
    if (!res.ok) throw new Error("no critics data");
    const critics = await res.json();
    renderPitchfork(critics.pitchfork || []);
    renderNme(critics.nme || []);
  } catch (err) {
    document.getElementById("pitchforkList").innerHTML = `<p class="sidebar-empty">No critic data this week.</p>`;
    document.getElementById("nmeList").innerHTML = "";
  }
}

// Songs texted to the Telegram bot. Written straight into the repo by the
// bot, so this file may not exist yet on a fresh checkout.
async function loadInbox(){
  const list = document.getElementById("inboxList");
  try {
    const res = await fetch("https://weareguid.github.io/radar-sonoro/data/inbox.json", { cache:"no-store" });
    if (!res.ok) throw new Error("no inbox yet");
    const entries = await res.json();
    renderInbox(Array.isArray(entries) ? entries : []);
  } catch (err) {
    list.innerHTML = `<p class="sidebar-empty">Nothing yet — text a song to the bot and it lands here.</p>`;
  }
}

function renderInbox(entries){
  const list = document.getElementById("inboxList");
  list.innerHTML = "";
  if (!entries.length) {
    list.appendChild(el("p","sidebar-empty","Nothing yet — text a song to the bot and it lands here."));
    return;
  }
  entries.slice(0, 12).forEach(e=>{
    const item = el("div","inbox-item");
    item.innerHTML = `
      <button type="button" class="inbox-row">
        ${e.artworkUrl ? `<img src="${e.artworkUrl}" alt="">` : `<span class="inbox-noart"></span>`}
        <span class="inbox-info">
          <span class="inbox-artist">${e.artist}</span>
          <span class="inbox-title">${e.title}</span>
        </span>
        <span class="inbox-play">▶</span>
      </button>
      <div class="inbox-player"></div>
    `;
    const row = item.querySelector(".inbox-row");
    const player = item.querySelector(".inbox-player");
    row.addEventListener("click", ()=>{
      const open = player.classList.toggle("open");
      if (open && !player.dataset.loaded && e.trackId) {
        player.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${e.trackId}" width="100%" height="152" frameborder="0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>`;
        player.dataset.loaded = "1";
      }
      row.querySelector(".inbox-play").textContent = open ? "×" : "▶";
    });
    list.appendChild(item);
  });
  const link = el("a","sidebar-footer-link","Open the bot in Telegram →");
  link.href = "https://t.me/Radar_sonoro_inbox_bot";
  link.target = "_blank";
  link.rel = "noopener";
  list.appendChild(link);
}

function renderPitchfork(picks){
  const list = document.getElementById("pitchforkList");
  list.innerHTML = "";
  if (!picks.length) {
    list.appendChild(el("p","sidebar-empty","No album tagged Best New Music in the most recent reviews."));
    return;
  }
  picks.forEach(p=>{
    const item = el("div","sidebar-item");
    item.innerHTML = `
      <a href="${p.url}" target="_blank" rel="noopener">
        ${p.artworkUrl ? `<img src="${p.artworkUrl}" alt="">` : ""}
      </a>
      <a href="${p.url}" target="_blank" rel="noopener">
        <div class="si-top"><span class="si-artist">${p.artist}</span><span class="si-score">${p.score}</span></div>
        <div class="si-album">${p.title}</div>
        <div class="si-dek">${p.dek}</div>
      </a>
    `;
    list.appendChild(item);
  });
  const link = el("a","sidebar-footer-link","See Best New Music on Pitchfork →");
  link.href = "https://pitchfork.com/best/";
  link.target = "_blank";
  link.rel = "noopener";
  list.appendChild(link);
}

function renderNme(reviews){
  const list = document.getElementById("nmeList");
  list.innerHTML = "";
  if (!reviews.length) {
    list.appendChild(el("p","sidebar-empty","No recent NME reviews."));
    return;
  }
  reviews.slice(0, 6).forEach(r=>{
    const item = el("div","sidebar-item");
    item.innerHTML = `
      <a href="${r.url}" target="_blank" rel="noopener">
        ${r.artworkUrl ? `<img src="${r.artworkUrl}" alt="">` : ""}
      </a>
      <a href="${r.url}" target="_blank" rel="noopener">
        <div class="si-top"><span class="si-artist">${r.artist}</span></div>
        <div class="si-album">${r.album}</div>
        <div class="si-dek">${r.dek}</div>
      </a>
    `;
    list.appendChild(item);
  });
  const link = el("a","sidebar-footer-link","See reviews on NME →");
  link.href = "https://www.nme.com/reviews/album";
  link.target = "_blank";
  link.rel = "noopener";
  list.appendChild(link);
}

function renderMissingData(){
  document.getElementById("stamp").innerHTML = `<span class="flag">No cut available</span>`;
  document.getElementById("thesisHead").textContent = "There's no cut to read yet.";
  document.getElementById("thesisBody").textContent = "Run node fetch.js once to generate data/latest.json, or wait for Monday's automated read.";
}

// --- find a song across all 18 markets, not just the consensus ---
function getSongDetail(title){
  const key = norm(title);
  const countries = [];
  let rep = null;
  for (const code of Object.keys(DATA.countries)) {
    const c = DATA.countries[code];
    const hit = c.tracks.find(t => norm(t.name) === key);
    if (hit) {
      if (!rep) rep = hit;
      countries.push({ code, name: c.name, sync: c.sync, dissident: c.dissident });
    }
  }
  const signal = DATA.signals.find(s => norm(s.title) === key);
  return {
    title: rep ? rep.name : title,
    artistName: rep ? rep.artistName : "",
    artworkUrl: rep ? rep.artworkUrl : "",
    spotifyUrl: rep ? rep.spotifyUrl : (signal ? signal.spotifyUrl : null),
    presence: countries.length,
    of: Object.keys(DATA.countries).length,
    countries,
    tier: signal ? signal.tier : null,
    tierLabel: signal ? signal.tierLabel : null,
    provisional: signal ? signal.provisional : null
  };
}

function openSongModal(title){
  const s = getSongDetail(title);
  const modal = document.getElementById("songModal");
  document.getElementById("songModalBody").innerHTML = `
    <div class="song-hero">
      ${s.artworkUrl ? `<img src="${s.artworkUrl}" alt="">` : ""}
      <div>
        <h4 id="songModalTitle">${s.title}</h4>
        <div class="song-artist">${s.artistName}</div>
        ${s.tierLabel ? `<div class="song-tier">${s.tierLabel}</div>` : ""}
        ${s.spotifyUrl ? `<a class="song-spotify" href="${s.spotifyUrl}" target="_blank" rel="noopener">${SPOTIFY_ICON} Play on Spotify</a>` : ""}
      </div>
    </div>
    <p>Present in ${s.presence} of ${s.of} markets read this week${s.provisional ? " · provisional classification, not enough history yet" : ""}.</p>
    <div class="song-countries">
      ${s.countries.map(c => `<button type="button" class="song-chip${c.dissident ? " dissident" : ""}" data-code="${c.code}">${c.name} · ${c.sync}/10</button>`).join("")}
    </div>
  `;
  modal.querySelectorAll(".song-chip").forEach(chip=>{
    chip.addEventListener("click", ()=>{
      closeSongModal();
      showCountry(chip.dataset.code);
      document.getElementById("red").scrollIntoView({ behavior:"smooth", block:"center" });
    });
  });
  modal.hidden = false;
}

function closeSongModal(){
  document.getElementById("songModal").hidden = true;
}

function setupModal(){
  document.getElementById("songModalClose").addEventListener("click", closeSongModal);
  document.getElementById("songModalBackdrop").addEventListener("click", closeSongModal);
  document.addEventListener("keydown", e=>{
    if (e.key === "Escape") closeSongModal();
  });
}

function render(data){
  DATA = data;
  CONSENSUS_KEYS = new Set(data.consensus.map(c => norm(c.title)));

  const codes = Object.keys(data.countries);
  const total = data.storefronts.length;
  const respondedCount = codes.length;
  const dissidentCount = data.dissidents.length;
  const syncedCount = respondedCount - dissidentCount;

  // --- masthead ---
  document.getElementById("stamp").innerHTML = `
    Cut of <b>${fmtDate(data.snapshot)}</b><br>
    ${respondedCount}/${total} markets read
    ${data.failed.length ? `· <span class="flag">${data.failed.length} unresponsive</span>` : ""}
  `;

  // --- thesis (generated from the data, nothing hand-written with numbers) ---
  const top = data.stats.topSongRank1;
  const topArtist = data.stats.topArtist;
  const highest = data.stats.highestSync;
  document.getElementById("thesisHead").innerHTML =
    dissidentCount > 0
      ? `The region behaves like <em>a single market</em>, except where a local industry displaces it.`
      : `No dissidents this week: all ${respondedCount} markets read share the same consensus.`;
  document.getElementById("thesisBody").textContent =
    dissidentCount > 0
      ? `${syncedCount} of ${respondedCount} countries are listening to almost the same thing this week${top ? `, with "${top.title}" as the most repeated title` : ""}. ` +
        `The other ${dissidentCount} aren't disconnected — they have a local scene strong enough that they don't need the regional consensus. ` +
        (highest ? `${highest.name} is today's most in-sync market, at ${highest.sync}/10.` : "")
      : `${topArtist ? `${topArtist.name} dominates the consensus, present in ${topArtist.presence} of ${respondedCount} markets. ` : ""}` +
        `No dissidents this week — the question is how long that lasts.`;

  // --- signals ---
  const reel = document.getElementById("signalReel");
  reel.innerHTML = "";
  data.signals.forEach(s=>{
    const card = el("button","signal-card");
    card.type = "button";
    card.innerHTML = `
      ${s.artworkUrl ? `<img class="signal-art" src="${s.artworkUrl}" alt="" loading="lazy">` : ""}
      <div class="signal-tag">
        <span class="signal-bars">
          <i class="${s.tier>=1?'on':''}"></i><i class="${s.tier>=2?'on':''}"></i><i class="${s.tier>=3?'on':''}"></i>
        </span>
        ${s.tierLabel}
      </div>
      <div class="signal-title">${s.title}</div>
      <div class="signal-artist">${s.artistName || ""}</div>
      <div class="signal-meta">
        <span>presence</span><b>${s.presence}/${s.of}</b>
      </div>
      ${s.provisional ? '<div class="signal-provisional">provisional classification, not enough history yet</div>' : ""}
    `;
    card.addEventListener("click", ()=> openSongModal(s.title));
    reel.appendChild(card);
  });

  // --- dissident casebook ---
  const caseGrid = document.getElementById("caseGrid");
  caseGrid.innerHTML = "";
  if (!data.dissidents.length) {
    caseGrid.appendChild(el("p","section-sub","No dissidents this cut. Every market read is inside the regional consensus."));
  }
  data.dissidents.forEach(c=>{
    const card = el("div","case-card");
    card.id = "case-"+c.code;
    if (c.why) {
      card.innerHTML = `
        <div class="case-flag"><span>${c.name}</span><span class="case-score">${c.sync}/10</span></div>
        <h4>${c.why.industry}</h4>
        <p>${c.why.story}</p>
        <div class="case-industry">displaces the regional consensus</div>
      `;
    } else {
      // No written case yet. Rather than announce that, let the data speak:
      // the titles this market plays *instead of* the consensus are the whole
      // argument for why it reads as a dissident.
      const local = (data.countries[c.code]?.tracks || [])
        .filter(t => !CONSENSUS_KEYS.has(norm(t.name)))
        .slice(0, 3);
      card.innerHTML = `
        <div class="case-flag"><span>${c.name}</span><span class="case-score">${c.sync}/10</span></div>
        <h4>Playing something else</h4>
        <p>Keeps ${c.sync} of the ${data.consensus.length} consensus titles. The rest of its top 10 is its own.</p>
        ${local.length ? `<ul class="case-local">${local.map(t=>`<li><span>${t.name}</span><em>${t.artistName}</em></li>`).join("")}</ul>` : ""}
        <div class="case-industry">displaces the regional consensus</div>
      `;
    }
    caseGrid.appendChild(card);
  });

  // --- myth profiles ---
  const mythList = document.getElementById("mythList");
  mythList.innerHTML = "";
  const candidateArtists = [];
  if (data.stats.topArtist) candidateArtists.push(data.stats.topArtist.name);
  // add the artist(s) behind the second-strongest consensus title, if different
  const secondTitle = data.consensus[1];
  if (secondTitle) {
    for (const code of codes) {
      const hit = data.countries[code].tracks.find(t => t.name === secondTitle.title);
      if (hit) { candidateArtists.push(hit.artistName.split(/,|&/)[0].trim()); break; }
    }
  }
  // A myth profile is qualitative judgment — there is no data fallback for it.
  // An artist without one is simply left out, and the section hides itself
  // rather than showing a card that admits it has nothing to say.
  const myths = data.curatorialMyths || {};
  const uniqueArtists = [...new Set(candidateArtists)].filter(name => myths[name]);
  document.getElementById("mitos").hidden = !uniqueArtists.length;
  uniqueArtists.forEach(name=>{
    const myth = myths[name];
    const card = el("details","myth-card");
    card.innerHTML = `
      <summary><span><div class="myth-name">${name}</div><div class="myth-tag">dominant artist of the consensus</div></span><span class="myth-toggle">+</span></summary>
      <div class="myth-body">
        <div><h5>How they build a world</h5><p>${myth.world}</p></div>
        <div><h5>What they withhold</h5><p>${myth.withheld}</p></div>
        <div><h5>Where the risk is</h5><p>${myth.risk}</p></div>
      </div>
    `;
    mythList.appendChild(card);
  });

  renderNetwork(data);
  renderLog(data);
  renderFooter(data);
  setupModal();
  setupSurprise(data);
}

function trackRow(track, { onClick } = {}){
  const inConsensus = CONSENSUS_KEYS.has(norm(track.name));
  const row = el("button", "panel-track" + (inConsensus ? " in-consensus" : ""));
  row.type = "button";
  row.innerHTML = `
    ${track.artworkUrl ? `<img src="${track.artworkUrl}" alt="">` : ""}
    <span class="t-info">
      <span class="t-title">${track.name}</span>
      <span class="t-artist">${track.artistName}</span>
    </span>
    <span class="t-flag">${inConsensus ? "consensus" : "local"}</span>
  `;
  row.addEventListener("click", () => (onClick || openSongModal)(track.name));
  return row;
}

function showCountry(code){
  const c = DATA.countries[code];
  if (!c) return;
  const svg = document.getElementById("netsvg");
  svg.querySelectorAll(".node-country").forEach(n => n.classList.toggle("active", n.dataset.code === code));
  svg.querySelectorAll(".edge").forEach(e => e.classList.toggle("active", e.dataset.code === code));

  const maxSync = Math.max(1, DATA.maxSyncObserved);
  const dissidentRecord = DATA.dissidents.find(d => d.code === code);
  const panel = document.getElementById("panel");
  panel.innerHTML = `
    <span class="panel-eyebrow">${c.dissident ? "dissident country" : "in sync with the consensus"}</span>
    <h4>${c.name}</h4>
    <div class="panel-sync"><span class="n">${c.sync}</span><span class="d">/ 10 sync</span></div>
    <div class="sync-bar"><span style="width:${(c.sync/maxSync)*100}%"></span></div>
    ${c.dissident && dissidentRecord?.why
      ? `<p>${dissidentRecord.why.story}</p><p><a href="#case-${code}" style="color:var(--accent);text-decoration:none">See full case file →</a></p>`
      : c.dissident
        ? `<p>Keeps only ${c.sync} of the ${DATA.consensus.length} regional consensus songs. The rest of its top 10 is local.</p><p><a href="#case-${code}" style="color:var(--accent);text-decoration:none">See what it plays instead →</a></p>`
        : `<p>Shares ${c.sync} of the ${DATA.consensus.length} regional consensus songs this week.</p>`
    }
    <ul class="panel-tracks" id="panelTracks"></ul>
  `;
  const list = document.getElementById("panelTracks");
  c.tracks.forEach(t => list.appendChild(trackRow(t)));
}

function renderNetwork(data){
  const svg = document.getElementById("netsvg");
  const svgns = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  function svgEl(tag, attrs){
    const e = document.createElementNS(svgns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  const codes = Object.keys(data.countries);
  const CENTER = { x:340, y:290 };
  const synced = codes.filter(c => !data.countries[c].dissident);
  const dissidents = codes.filter(c => data.countries[c].dissident);
  const positions = {};

  // all 18 countries are spread across a single 360° circle, synced ones
  // first and dissidents last: that keeps dissidents clustered together
  // without ever sharing an angle with a synced country (they used to be
  // computed as two separate arcs that overlapped, so a dissident could
  // end up visually aligned with a synced country with no real relation
  // between the two).
  const ordered = [...synced, ...dissidents];
  const n = Math.max(ordered.length, 1);
  ordered.forEach((code, i) => {
    const angle = (-90 + i * (360 / n)) * Math.PI / 180;
    const r = data.countries[code].dissident ? 250 : 195;
    positions[code] = { x: CENTER.x + r*Math.cos(angle), y: CENTER.y + r*Math.sin(angle) };
  });

  const edgeGroup = svgEl("g",{});
  const nodeGroup = svgEl("g",{});
  const maxSync = Math.max(1, data.maxSyncObserved);

  codes.forEach(code=>{
    const c = data.countries[code];
    const p = positions[code];
    const w = c.dissident ? 1 : 0.8 + (c.sync/maxSync)*2.6;
    edgeGroup.appendChild(svgEl("line",{
      x1:CENTER.x, y1:CENTER.y, x2:p.x, y2:p.y,
      class:"edge"+(c.dissident?" dissident":""), "stroke-width":w, "data-code":code
    }));
  });

  edgeGroup.appendChild(svgEl("circle",{cx:CENTER.x,cy:CENTER.y,r:26,fill:"var(--ink)"}));
  const hubText = svgEl("text",{x:CENTER.x,y:CENTER.y+4,"text-anchor":"middle","font-family":"IBM Plex Mono, monospace","font-size":9.5,fill:"var(--ground)"});
  hubText.textContent = "CONSENSUS";
  edgeGroup.appendChild(hubText);

  codes.forEach(code=>{
    const c = data.countries[code];
    const p = positions[code];
    // node size carries the full consensus/dissent signal on its own, not
    // just the dashed outline: the bigger the circle, the higher the sync.
    const rad = 8 + (c.sync/maxSync) * 13;
    const g = svgEl("g",{ class:"node-country"+(c.dissident?" dissident":""), "data-code":code, tabindex:"0", role:"button",
      "aria-label": `${c.name}, sync ${c.sync} of 10` });
    g.appendChild(svgEl("circle",{cx:p.x,cy:p.y,r:rad}));
    const t = svgEl("text",{x:p.x,y:p.y+rad+13,"text-anchor":"middle","font-size":10});
    t.textContent = code.toUpperCase();
    g.appendChild(t);
    nodeGroup.appendChild(g);
  });

  svg.appendChild(edgeGroup);
  svg.appendChild(nodeGroup);

  nodeGroup.querySelectorAll(".node-country").forEach(n=>{
    n.addEventListener("click", ()=>showCountry(n.dataset.code));
    n.addEventListener("keydown", e=>{ if (e.key==="Enter"||e.key===" ") { e.preventDefault(); showCountry(n.dataset.code); } });
  });
}

function setupSurprise(data){
  const codes = Object.keys(data.countries);
  document.getElementById("surpriseBtn").onclick = ()=>{
    if (Math.random() < 0.5) {
      const pick = codes[Math.floor(Math.random()*codes.length)];
      showCountry(pick);
      document.getElementById("red").scrollIntoView({ behavior:"smooth", block:"center" });
    } else {
      const pool = data.signals.length ? data.signals : data.consensus;
      const pick = pool[Math.floor(Math.random()*pool.length)];
      openSongModal(pick.title);
    }
  };
}

function renderLog(data){
  const top = data.stats.topSongRank1;
  const second = data.consensus[1];
  const log = document.getElementById("logBlock");
  log.innerHTML = `
    <span class="log-title">CUT LOG · ${fmtDate(data.snapshot).toUpperCase()}</span>
    <span class="rule">──────────────────────────────────────────</span>
    <dl>
      <dt>Active thesis</dt><dd>${data.dissidents.length ? "single market, except where a local industry dominates" : "single market with no dissidents this week"}</dd>
      ${top ? `<dt>Dominant signal</dt><dd><b>${top.title}</b> · present in ${top.presence}/${top.of}</dd>` : ""}
      ${second ? `<dt>To confirm</dt><dd><b>${second.title}</b> · ${second.presence}/${second.of}, watch if it holds next cut</dd>` : ""}
      <dt>Active dissidents</dt><dd>${data.dissidents.length} ${data.dissidents.length ? "· " + data.dissidents.map(d=>d.name).join(", ") : ""}</dd>
      ${data.stats.highestSync ? `<dt>Highest sync</dt><dd>${data.stats.highestSync.name} · ${data.stats.highestSync.sync}/10</dd>` : ""}
      ${data.failed.length ? `<dt>No response</dt><dd>${data.failed.map(f=>f.code).join(", ")}, retried next cut</dd>` : ""}
      <dt>Next cut</dt><dd>Monday · automated read of ${data.storefronts.length} storefronts</dd>
    </dl>
    <span class="rule">──────────────────────────────────────────</span>
  `;
}

function renderFooter(data){
  document.getElementById("footer").innerHTML = `
    <span>Source: Apple Music's public feeds, one per national storefront. No scraping, no API key. Puerto Rico has no storefront of its own (it uses the US one and the feed returns 500, which is why it's not in the list); Cuba has no Apple Music storefront.</span>
    <span>Typeface: Archivo, from Omnibus&#8209;Type (Argentina).</span>
  `;
}

main();
