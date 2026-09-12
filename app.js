const COUNTRY_NAMES = {
  mx:"México", br:"Brasil", ar:"Argentina", cl:"Chile", co:"Colombia", pe:"Perú",
  uy:"Uruguay", py:"Paraguay", bo:"Bolivia", ec:"Ecuador", ve:"Venezuela", cr:"Costa Rica",
  pa:"Panamá", gt:"Guatemala", sv:"El Salvador", hn:"Honduras", ni:"Nicaragua", do:"República Dominicana"
};

function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day:"numeric", month:"short", year:"numeric" });
}

async function main(){
  let data;
  try {
    const res = await fetch("https://weareguid.github.io/radar-sonoro/data/latest.json", { cache:"no-store" });
    if (!res.ok) throw new Error("sin datos");
    data = await res.json();
  } catch (err) {
    renderMissingData();
    return;
  }
  render(data);
}

function renderMissingData(){
  document.getElementById("stamp").innerHTML = `<span class="flag">Sin corte disponible</span>`;
  document.getElementById("thesisHead").textContent = "Todavía no hay un corte que leer.";
  document.getElementById("thesisBody").textContent = "Corre node fetch.js una vez para generar data/latest.json, o espera a la lectura automática del lunes.";
}

function render(data){
  const codes = Object.keys(data.countries);
  const total = data.storefronts.length;
  const respondedCount = codes.length;
  const dissidentCount = data.dissidents.length;
  const syncedCount = respondedCount - dissidentCount;

  // --- masthead ---
  document.getElementById("stamp").innerHTML = `
    Corte <b>${fmtDate(data.snapshot)}</b><br>
    ${respondedCount}/${total} mercados leídos
    ${data.failed.length ? `· <span class="flag">${data.failed.length} sin respuesta</span>` : ""}
  `;

  // --- thesis (generada del dato, nada escrito a mano con cifras) ---
  const top = data.stats.topSongRank1;
  const topArtist = data.stats.topArtist;
  const highest = data.stats.highestSync;
  document.getElementById("thesisHead").innerHTML =
    dissidentCount > 0
      ? `La región se comporta como <em>un solo mercado</em>, salvo donde una industria local lo desplaza.`
      : `Esta semana no hay disidentes: los ${respondedCount} mercados leídos comparten el mismo consenso.`;
  document.getElementById("thesisBody").textContent =
    dissidentCount > 0
      ? `${syncedCount} de ${respondedCount} países escuchan casi lo mismo esta semana${top ? `, con "${top.title}" como el título más repetido` : ""}. ` +
        `Los otros ${dissidentCount} no están desconectados: tienen una escena propia lo bastante fuerte para no necesitar el consenso regional. ` +
        (highest ? `${highest.name} es hoy el mercado más sincronizado, con ${highest.sync}/10.` : "")
      : `${topArtist ? `${topArtist.name} domina el consenso, presente en ${topArtist.presence} de ${respondedCount} mercados. ` : ""}` +
        `Sin disidentes esta semana, la pregunta es cuánto dura.`;

  // --- señales ---
  const reel = document.getElementById("signalReel");
  reel.innerHTML = "";
  data.signals.forEach(s=>{
    const card = el("div","signal-card");
    card.innerHTML = `
      <div class="signal-tag">
        <span class="signal-bars">
          <i class="${s.tier>=1?'on':''}"></i><i class="${s.tier>=2?'on':''}"></i><i class="${s.tier>=3?'on':''}"></i>
        </span>
        ${s.tierLabel}
      </div>
      <div class="signal-title">${s.title}</div>
      <div class="signal-meta">
        <span>presencia</span><b>${s.presence}/${s.of}</b>
      </div>
      ${s.provisional ? '<div class="signal-provisional">clasificación provisional, sin histórico suficiente aún</div>' : ""}
    `;
    reel.appendChild(card);
  });

  // --- casebook de disidentes ---
  const caseGrid = document.getElementById("caseGrid");
  caseGrid.innerHTML = "";
  if (!data.dissidents.length) {
    caseGrid.appendChild(el("p","section-sub","Sin disidentes en este corte. Todos los mercados leídos están dentro del consenso regional."));
  }
  data.dissidents.forEach(c=>{
    const card = el("div","case-card");
    card.id = "case-"+c.code;
    if (c.why) {
      card.innerHTML = `
        <div class="case-flag"><span>${c.name}</span><span class="case-score">${c.sync}/10</span></div>
        <h4>${c.why.industry}</h4>
        <p>${c.why.story}</p>
        <div class="case-industry">desplaza al consenso regional</div>
      `;
    } else {
      card.innerHTML = `
        <div class="case-flag"><span>${c.name}</span><span class="case-score">${c.sync}/10</span></div>
        <h4>Disidente sin revisar</h4>
        <p class="case-pending">Entró a la lista este corte. Falta escribir en content/curatorial.json qué industria local explica la caída de sincronía.</p>
      `;
    }
    caseGrid.appendChild(card);
  });

  // --- perfiles de mito ---
  const mythList = document.getElementById("mythList");
  mythList.innerHTML = "";
  const candidateArtists = [];
  if (data.stats.topArtist) candidateArtists.push(data.stats.topArtist.name);
  // agrega el/los artistas detrás del segundo título más fuerte del consenso, si distinto
  const secondTitle = data.consensus[1];
  if (secondTitle) {
    for (const code of codes) {
      const hit = data.countries[code].tracks.find(t => t.name === secondTitle.title);
      if (hit) { candidateArtists.push(hit.artistName.split(/,|&/)[0].trim()); break; }
    }
  }
  const uniqueArtists = [...new Set(candidateArtists)];
  if (!uniqueArtists.length) {
    mythList.appendChild(el("p","section-sub","Sin artista dominante identificable este corte."));
  }
  uniqueArtists.forEach(name=>{
    const myth = (data.curatorialMyths || {})[name];
    const card = el("details","myth-card");
    if (myth) {
      card.innerHTML = `
        <summary><span><div class="myth-name">${name}</div><div class="myth-tag">artista dominante del consenso</div></span><span class="myth-toggle">+</span></summary>
        <div class="myth-body">
          <div><h5>Cómo construye mundo</h5><p>${myth.world}</p></div>
          <div><h5>Qué calla</h5><p>${myth.withheld}</p></div>
          <div><h5>Dónde está el riesgo</h5><p>${myth.risk}</p></div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <summary><span><div class="myth-name">${name}</div><div class="myth-tag">perfil por escribir</div></span><span class="myth-toggle">+</span></summary>
        <div class="myth-body"><p style="grid-column:1/-1">Domina el consenso este corte pero no tiene perfil en content/curatorial.json todavía.</p></div>
      `;
    }
    mythList.appendChild(card);
  });

  renderNetwork(data);
  renderLog(data);
  renderFooter(data);
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

  synced.forEach((code,i)=>{
    const angle = (-90 + i * (300/Math.max(synced.length,1))) * Math.PI/180;
    const r = 195;
    positions[code] = { x: CENTER.x + r*Math.cos(angle), y: CENTER.y + r*Math.sin(angle) };
  });
  dissidents.forEach((code,i)=>{
    const angle = (150 + i * (60/Math.max(dissidents.length,1))) * Math.PI/180;
    const r = 250;
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
  hubText.textContent = "CONSENSO";
  edgeGroup.appendChild(hubText);

  codes.forEach(code=>{
    const c = data.countries[code];
    const p = positions[code];
    const g = svgEl("g",{ class:"node-country"+(c.dissident?" dissident":""), "data-code":code, tabindex:"0", role:"button",
      "aria-label": `${c.name}, sincronía ${c.sync} de 10` });
    const rad = c.dissident ? 15 : 12 + (c.sync/maxSync)*7;
    g.appendChild(svgEl("circle",{cx:p.x,cy:p.y,r:rad}));
    const t = svgEl("text",{x:p.x,y:p.y+rad+13,"text-anchor":"middle","font-size":10});
    t.textContent = code.toUpperCase();
    g.appendChild(t);
    nodeGroup.appendChild(g);
  });

  svg.appendChild(edgeGroup);
  svg.appendChild(nodeGroup);

  const panel = document.getElementById("panel");
  function showCountry(code){
    const c = data.countries[code];
    if (!c) return;
    svg.querySelectorAll(".node-country").forEach(n => n.classList.toggle("active", n.dataset.code === code));
    svg.querySelectorAll(".edge").forEach(e => e.classList.toggle("active", e.dataset.code === code));
    const dissidentRecord = data.dissidents.find(d => d.code === code);
    panel.innerHTML = `
      <span class="panel-eyebrow">${c.dissident ? "país disidente" : "sincronizado con el consenso"}</span>
      <h4>${c.name}</h4>
      <div class="panel-sync"><span class="n">${c.sync}</span><span class="d">/ 10 sincronía</span></div>
      <div class="sync-bar"><span style="width:${(c.sync/maxSync)*100}%"></span></div>
      ${c.dissident && dissidentRecord?.why
        ? `<p>${dissidentRecord.why.story}</p><p><a href="#case-${code}" style="color:var(--accent);text-decoration:none">Ver expediente completo →</a></p>`
        : c.dissident
          ? `<p class="review-flag">Disidente nuevo. Falta escribir la razón editorial en content/curatorial.json.</p>`
          : `<p>Comparte ${c.sync} de las ${data.consensus.length} canciones del consenso regional esta semana.</p>`
      }
    `;
  }

  nodeGroup.querySelectorAll(".node-country").forEach(n=>{
    n.addEventListener("click", ()=>showCountry(n.dataset.code));
    n.addEventListener("keydown", e=>{ if (e.key==="Enter"||e.key===" ") { e.preventDefault(); showCountry(n.dataset.code); } });
  });

  document.getElementById("surpriseBtn").onclick = ()=>{
    const pick = codes[Math.floor(Math.random()*codes.length)];
    showCountry(pick);
    document.getElementById("red").scrollIntoView({ behavior:"smooth", block:"center" });
  };
}

function renderLog(data){
  const top = data.stats.topSongRank1;
  const second = data.consensus[1];
  const log = document.getElementById("logBlock");
  log.innerHTML = `
    <span class="log-title">BITÁCORA · ${fmtDate(data.snapshot).toUpperCase()}</span>
    <span class="rule">──────────────────────────────────────────</span>
    <dl>
      <dt>Tesis activa</dt><dd>${data.dissidents.length ? "mercado único, salvo industria local dominante" : "mercado único sin disidentes esta semana"}</dd>
      ${top ? `<dt>Señal dominante</dt><dd><b>${top.title}</b> · presente en ${top.presence}/${top.of}</dd>` : ""}
      ${second ? `<dt>Por confirmar</dt><dd><b>${second.title}</b> · ${second.presence}/${second.of}, ver si sostiene el próximo corte</dd>` : ""}
      <dt>Disidentes activos</dt><dd>${data.dissidents.length} ${data.dissidents.length ? "· " + data.dissidents.map(d=>d.name).join(", ") : ""}</dd>
      ${data.stats.highestSync ? `<dt>Sincronía más alta</dt><dd>${data.stats.highestSync.name} · ${data.stats.highestSync.sync}/10</dd>` : ""}
      ${data.failed.length ? `<dt>Sin respuesta</dt><dd>${data.failed.map(f=>f.code).join(", ")}, se reintenta el próximo corte</dd>` : ""}
      <dt>Próximo corte</dt><dd>lunes · lectura automática de ${data.storefronts.length} storefronts</dd>
    </dl>
    <span class="rule">──────────────────────────────────────────</span>
  `;
}

function renderFooter(data){
  document.getElementById("footer").innerHTML = `
    <span>Fuente: feeds públicos de Apple Music por tienda nacional. Sin scraping, sin llave. Puerto Rico no tiene tienda propia (usa la de EE.UU. y el feed responde 500, por eso no está en la lista); Cuba no tiene tienda de Apple Music.</span>
    <span>Tipografía Archivo, fundición Omnibus&#8209;Type (Argentina).</span>
  `;
}

main();
