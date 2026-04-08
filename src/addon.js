const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { validarSuscripcion } = require("../services/suscripciones");


// ─── Manifest del Addon ───────────────────────────────────────────────────────
const builder = new addonBuilder({
  id:          "com.tvxlp.addon",
  version:     "1.0.0",
  name:        "TVXLP Stream",
  description: "Tu cine sin límites",
  resources:   ["stream", "catalog"],
  types:       ["movie", "series", "channel"],
  catalogs: [
    {
      type: "channel",
      id:   "tvxlp-live",
      name: "TV en Vivo",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  idPrefixes: ["tt", "tvxlp-"],
  behaviorHints: { configurable: true },
});
// ─── Stream Handler ───────────────────────────────────────────────────────────
// El ID llega como: "contenidoId:suscripcionId"
// Ejemplo: "1001:user_test_xalapa"
builder.defineStreamHandler(async ({ type, id }) => {
  const partes        = id.split(":");
  const contenidoId   = partes[0];
  const suscripcionId = partes[1];

  // 1. Valida en Firestore
  const { valido, razon, plan } = await validarSuscripcion(suscripcionId);

  if (!valido) {
    console.log(`Acceso denegado [${suscripcionId}]: ${razon}`);
    return Promise.resolve({ streams: [] });
  }

  const streams = [];

  // 2. Canales en vivo (IPTV panel - formato HLS para Smart TVs)
  if (type === "channel") {
    const baseUrl  = process.env.IPTV_BASE_URL;
    const user     = process.env.IPTV_USERNAME;
    const pass     = process.env.IPTV_PASSWORD;

    if (baseUrl && user && pass) {
      // HLS (.m3u8) funciona en Samsung, LG, Android TV, iOS
      streams.push({
        url:   `${baseUrl}/live/${user}/${pass}/${contenidoId}.m3u8`,
        title: "HD - Servidor Principal",
        behaviorHints: { notWebReady: false },
      });

      // .ts como fallback para Firestick
      streams.push({
        url:   `${baseUrl}/live/${user}/${pass}/${contenidoId}.ts`,
        title: "HD - Servidor Alternativo",
        behaviorHints: { notWebReady: true },
      });
    }
  }

  // 3. Películas y series (VOD del panel IPTV)
  if (type === "movie" || type === "series") {
    const baseUrl = process.env.IPTV_BASE_URL;
    const user    = process.env.IPTV_USERNAME;
    const pass    = process.env.IPTV_PASSWORD;

    if (baseUrl && user && pass) {
      streams.push({
        url:   `${baseUrl}/movie/${user}/${pass}/${contenidoId}.mp4`,
        title: "HD - VOD Panel",
      });
    }

    // Torrentio como fallback (gratis)
    try {
      const torrentioUrl = `https://torrentio.strem.fun/providers=yts,eztv|sort=quality/stream/${type}/${contenidoId}.json`;
      const resp         = await fetch(torrentioUrl, { signal: AbortSignal.timeout(3000) });
      const data         = await resp.json();
      const mejores      = (data.streams || []).slice(0, 3);
      streams.push(...mejores);
    } catch {
      // Torrentio falló, no importa
    }
  }

  return Promise.resolve({ streams });
});

// ─── Catalog Handler ──────────────────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "channel" || id !== "tvxlp-live") {
    return Promise.resolve({ metas: [] });
  }

  // Canales hardcodeados de prueba
  // Después los jalarás dinámicamente del panel IPTV
  const canales = [
    { id: "tvxlp-1001", name: "ESPN HD",    genre: "Deportes" },
    { id: "tvxlp-1002", name: "HBO HD",     genre: "Películas" },
    { id: "tvxlp-1003", name: "NBA TV",     genre: "Deportes" },
    { id: "tvxlp-1004", name: "Fox Sports", genre: "Deportes" },
    { id: "tvxlp-1005", name: "Star+",      genre: "Entretenimiento" },
  ];

  const metas = canales.map((c) => ({
    id:     c.id,
    type:   "channel",
    name:   c.name,
    genres: [c.genre],
    poster: `https://via.placeholder.com/150/000000/FFFFFF?text=${encodeURIComponent(c.name)}`,
  }));

  return Promise.resolve({ metas });
});

// ─── Arrancar el Addon ────────────────────────────────────────────────────────
function iniciarAddon(app) {
  const addonInterface = builder.getInterface();

  // Monta el addon en la app Express existente
  app.use("/addon", (req, res, next) => {
    // Inyecta el suscripcionId en la URL si viene en el header
    next();
  });

  return addonInterface;
}

module.exports = { iniciarAddon, builder };
