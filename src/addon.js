const { addonBuilder } = require("stremio-addon-sdk");
const { validarSuscripcion } = require("../services/suscripciones");

// ─── Manifest ─────────────────────────────────────────────────────────────────
const builder = new addonBuilder({
  id:          "com.tvxlp.addon",
  version:     "1.0.0",
  name:        "TVXLP Stream",
  description: "Tu cine sin límites",
  resources:   ["stream", "catalog"],
  types:       ["movie", "series", "channel"],
  catalogs: [
    {
      type:  "channel",
      id:    "tvxlp-live",
      name:  "TV en Vivo",
      extra: [
        { name: "genre",  isRequired: false },
        { name: "search", isRequired: false },
        { name: "skip",   isRequired: false },
      ],
    },
  ],
  idPrefixes: ["tt", "tvxlp-"],
  behaviorHints: { configurable: false },
});

// ─── Helper: fetch canales del panel IPTV ────────────────────────────────────
async function fetchCanales() {
  const base = process.env.IPTV_BASE_URL;
  const user = process.env.IPTV_USERNAME;
  const pass = process.env.IPTV_PASSWORD;

  const url = `${base}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`Panel IPTV error: ${resp.status}`);
  return resp.json();
}

// ─── Helper: fetch categorías del panel IPTV ─────────────────────────────────
async function fetchCategorias() {
  const base = process.env.IPTV_BASE_URL;
  const user = process.env.IPTV_USERNAME;
  const pass = process.env.IPTV_PASSWORD;

  const url = `${base}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return [];
  const cats = await resp.json();
  return Object.fromEntries(cats.map((c) => [c.category_id, c.category_name]));
}

// ─── Catalog Handler ──────────────────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "channel" || id !== "tvxlp-live") {
    return Promise.resolve({ metas: [] });
  }

  try {
    const [canales, categorias] = await Promise.all([
      fetchCanales(),
      fetchCategorias(),
    ]);

    let filtrados = canales;

    // Filtro por género/categoría
    if (extra?.genre) {
      filtrados = canales.filter(
        (c) => categorias[c.category_id] === extra.genre
      );
    }

    // Filtro por búsqueda
    if (extra?.search) {
      const q = extra.search.toLowerCase();
      filtrados = canales.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Paginación
    const skip  = parseInt(extra?.skip || "0", 10);
    const limit = 100;
    const pagina = filtrados.slice(skip, skip + limit);

    const metas = pagina.map((c) => ({
      id:     `tvxlp-${c.stream_id}`,
      type:   "channel",
      name:   c.name,
      poster: c.stream_icon || "",
      genres: [categorias[c.category_id] || "General"],
    }));

    return Promise.resolve({ metas });

  } catch (err) {
    console.error("Error fetchando canales:", err.message);
    return Promise.resolve({ metas: [] });
  }
});

// ─── Stream Handler ───────────────────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  const partes        = id.split(":");
  const contenidoId   = partes[0];
  const suscripcionId = partes[1];

  // 1. Valida suscripción en Firestore
  const { valido, razon } = await validarSuscripcion(suscripcionId);
  if (!valido) {
    console.log(`Acceso denegado [${suscripcionId}]: ${razon}`);
    return Promise.resolve({ streams: [] });
  }

  const base = process.env.IPTV_BASE_URL;
  const user = process.env.IPTV_USERNAME;
  const pass = process.env.IPTV_PASSWORD;
  const streams = [];

  // 2. Canales en vivo
  if (type === "channel") {
    // Extrae el stream_id del ID (formato: tvxlp-328159:suscripcionId)
    const streamId = contenidoId.replace("tvxlp-", "");

    streams.push({
      url:   `${base}/live/${user}/${pass}/${streamId}.m3u8`,
      title: "HD - Principal",
      behaviorHints: { notWebReady: false },
    });

    streams.push({
      url:   `${base}/live/${user}/${pass}/${streamId}.ts`,
      title: "HD - Alternativo",
      behaviorHints: { notWebReady: true },
    });
  }

  // 3. Películas y series VOD
  if (type === "movie" || type === "series") {
    streams.push({
      url:   `${base}/movie/${user}/${pass}/${contenidoId}.mp4`,
      title: "HD - VOD Panel",
    });

    // Torrentio como fallback
    try {
      const torrentioUrl = `https://torrentio.strem.fun/providers=yts,eztv|sort=quality/stream/${type}/${contenidoId}.json`;
      const resp = await fetch(torrentioUrl, { signal: AbortSignal.timeout(3000) });
      const data = await resp.json();
      streams.push(...(data.streams || []).slice(0, 3));
    } catch {
      // Torrentio no disponible, continúa
    }
  }

  return Promise.resolve({ streams });
});

module.exports = { builder };