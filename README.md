# Radar Sonoro

Qué se escucha en 18 mercados de América Latina, leído como inteligencia cultural en vez de como dashboard: señales clasificadas (flash / mediano ciclo / movimiento estructural), un mapa de relaciones explorable, y un expediente de los países cuya industria local le gana al consenso regional.

Origen: [`mapa-sonoro.html`](../mapa-sonoro.html) más la lente de "The Curator" (clasificación de señales, artistas como arquitectos de mito, puente obligado con Latinoamérica). El prototipo visual se validó como [artifact](https://claude.ai/code/artifact/d808c8b3-b820-4ddb-8c59-d7d028d25cb9) antes de conectarlo a datos reales.

## Cómo funciona

```
fetch.js  →  data/latest.json + data/YYYY-MM-DD.json  →  index.html (lee el JSON en vivo)
```

- **`fetch.js`** — baja los 18 feeds públicos de Apple Music (sin API key), calcula el consenso regional, la sincronía de cada país y quiénes son disidentes. Tolera que algún storefront falle sin abortar el corte. Corre en lotes de 6 con un reintento porque 18 llamadas simultáneas al mismo host generan aborts intermitentes.
- **`data/latest.json`** — el corte más reciente. Es la única fuente de verdad: nada en `index.html` tiene una cifra escrita a mano, todo sale de aquí.
- **`content/curatorial.json`** — el único copy escrito a mano: por qué cada disidente resiste el consenso, y los perfiles de "arquitecto de mito" de los artistas que dominan el corte. Se revisa cuando un país entra o sale de la lista de disidentes, o cuando un artista nuevo domina el consenso. Si falta una entrada, la página lo marca visiblemente en vez de inventar el contenido ("disidente sin revisar" / "perfil por escribir").
- **`index.html` + `app.js` + `style.css`** — la presentación. Sin build step: `app.js` hace `fetch("data/latest.json")` en tiempo de carga, por eso este sitio no puede vivir como Claude Artifact (la CSP bloquea fetch a JSON local) pero sí en GitHub Pages o Vercel.
- **`fetch-critics.js` → `data/critics.json`** — barra lateral independiente: Best New Music de Pitchfork + reseñas recientes de NME. No se cruza con los datos de LATAM a propósito, es otra escala de vara (crítica anglo vs. consumo regional). Ver detalle abajo.

### Clasificación de señales (flash / mediano ciclo / estructural)

Con 3 o más cortes históricos, un título se clasifica por cuántos cortes previos sostuvo presencia en el consenso: 2+ apariciones previas → movimiento estructural, 1 → mediano ciclo, 0 → flash. Con menos histórico (los primeros cortes del proyecto), se usa un umbral provisional por presencia en el corte actual, marcado como tal en la interfaz (`clasificación provisional, sin histórico suficiente aún`) hasta que haya serie suficiente.

### Reglas que no hay que romper sin querer

- Las canciones se comparan **solo por título normalizado** (`norm()` en `fetch.js`), nunca por artista: el mismo tema se acredita distinto según la tienda.
- `pr` (Puerto Rico) responde 500 porque no tiene tienda propia. No está en la lista de 18 a propósito, no reintentar.
- Cuba no tiene tienda de Apple Music.
- Disidente = sincronía ≤ 3 de 10 (`OUTLIER_MAX` en `fetch.js`).
- La escala de color/tamaño del mapa se normaliza contra `maxSyncObserved`, el máximo real del corte, no contra 10.

### Barra lateral: Best New Music (Pitchfork) + NME

Ninguno de los dos medios tiene API pública, y Complex no tiene RSS ni un sistema de calificación por lanzamiento, así que no está incluido.

- **Pitchfork** no tiene RSS de "Best New Music" específicamente, pero sí un RSS general de reseñas (`pitchfork.com/feed/feed-album-reviews/rss`). Cada página de reseña trae su propio estado embebido en `window.__PRELOADED_STATE__` con `headerProps.musicRating.isBestNewMusic` y el score. `fetch-critics.js` lee el RSS, visita cada reseña reciente (con medio segundo de espera entre una y otra) y se queda solo con las marcadas Best New Music. Esto no es una API documentada — es el estado interno de su app — así que puede romperse si Pitchfork cambia su frontend; el script falla en silencio por reseña individual y sigue con las demás.
- **NME** sí tiene RSS normal (`nme.com/reviews/album/feed`) con todo lo necesario en el feed mismo (no hace falta visitar cada página). No tiene un equivalente a "Best New Music": es solo el flujo de reseñas recientes, sin bandera de calidad.

## Uso local

```bash
node fetch.js            # baja los 18 feeds y escribe data/latest.json
node fetch-critics.js    # Best New Music de Pitchfork + reseñas de NME
npm run serve            # sirve el sitio en http://localhost:4173
```

Requiere Node 20+ (usa `fetch` global, sin dependencias).

## Automatización

`.github/workflows/fetch.yml` corre `node fetch.js` y `node fetch-critics.js` cada lunes y hace commit de `data/` si hubo cambios. El paso de crítica tiene `continue-on-error`: si Pitchfork o NME cambian su estructura y el script empieza a fallar completo, no debe tumbar el corte semanal principal. Para activar el workflow:

1. Crear el repo en GitHub y hacer push de esta carpeta.
2. En **Settings → Actions → General**, dar permiso de escritura al `GITHUB_TOKEN` (Read and write permissions) para que el workflow pueda commitear.
3. El primer corte real ya está en `data/2026-09-11.json` / `data/latest.json` (18 mercados leídos con datos en vivo el 11 de septiembre de 2026).

## Deploy

**GitHub Pages** (activo): [`weareguid.github.io/radar-sonoro`](https://weareguid.github.io/radar-sonoro/), Settings → Pages → Deploy from a branch → `main` / `/ (root)`.

**Proxeado en `nostalgictuiter.com/radarsonoro`**: `index.html`, `style.css`, `app.js` y `data/*.json` se cargan con URLs absolutas a GitHub Pages (no rutas relativas), así que el sitio funciona igual sin importar bajo qué dominio o ruta se sirva el HTML. El proyecto Next.js de `nostalgictuiter.com` solo tiene un `rewrite` en su `next.config.mjs` que reenvía `/radarsonoro` y `/radarsonoro/:path*` a GitHub Pages — los dos deploys no están acoplados, radar-sonoro se actualiza solo y nostalgictuiter.com no necesita redeploy para reflejarlo.

**Vercel** (alternativa si se quiere independizar del todo): importar el repo, sin build command (es HTML/CSS/JS estático), output directory `.`.

## Siguiente iteración: serie temporal

Cuando haya 3+ cortes en `data/`, vale la pena agregar una vista de "qué subió, qué cayó" entre cortes y si la sincronía de un país se mueve con el tiempo. Es la parte que hace que valga la pena volver cada semana; con un solo corte todavía no hay nada que mostrar ahí.
