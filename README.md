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

### Clasificación de señales (flash / mediano ciclo / estructural)

Con 3 o más cortes históricos, un título se clasifica por cuántos cortes previos sostuvo presencia en el consenso: 2+ apariciones previas → movimiento estructural, 1 → mediano ciclo, 0 → flash. Con menos histórico (los primeros cortes del proyecto), se usa un umbral provisional por presencia en el corte actual, marcado como tal en la interfaz (`clasificación provisional, sin histórico suficiente aún`) hasta que haya serie suficiente.

### Reglas que no hay que romper sin querer

- Las canciones se comparan **solo por título normalizado** (`norm()` en `fetch.js`), nunca por artista: el mismo tema se acredita distinto según la tienda.
- `pr` (Puerto Rico) responde 500 porque no tiene tienda propia. No está en la lista de 18 a propósito, no reintentar.
- Cuba no tiene tienda de Apple Music.
- Disidente = sincronía ≤ 3 de 10 (`OUTLIER_MAX` en `fetch.js`).
- La escala de color/tamaño del mapa se normaliza contra `maxSyncObserved`, el máximo real del corte, no contra 10.

## Uso local

```bash
node fetch.js      # baja los 18 feeds y escribe data/latest.json
npm run serve       # sirve el sitio en http://localhost:4173
```

Requiere Node 20+ (usa `fetch` global, sin dependencias).

## Automatización

`.github/workflows/fetch.yml` corre `node fetch.js` cada lunes y hace commit de `data/` si hubo cambios. Para activarlo:

1. Crear el repo en GitHub y hacer push de esta carpeta.
2. En **Settings → Actions → General**, dar permiso de escritura al `GITHUB_TOKEN` (Read and write permissions) para que el workflow pueda commitear.
3. El primer corte real ya está en `data/2026-09-11.json` / `data/latest.json` (18 mercados leídos con datos en vivo el 11 de septiembre de 2026).

## Deploy

**GitHub Pages** (recomendado, cero configuración adicional):
Settings → Pages → Deploy from a branch → `main` / `/ (root)`. El sitio queda en `https://<usuario>.github.io/radar-sonoro/`.

**Vercel**: importar el repo, sin build command (es HTML/CSS/JS estático), output directory `.`.

Cualquiera de las dos sirve `data/latest.json` como archivo estático normal, así que el `fetch()` en tiempo de carga funciona sin backend.

## Siguiente iteración: serie temporal

Cuando haya 3+ cortes en `data/`, vale la pena agregar una vista de "qué subió, qué cayó" entre cortes y si la sincronía de un país se mueve con el tiempo. Es la parte que hace que valga la pena volver cada semana; con un solo corte todavía no hay nada que mostrar ahí.
