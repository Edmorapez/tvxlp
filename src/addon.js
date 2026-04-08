const { addonBuilder } = require("stremio-addon-sdk");
const { validarSuscripcion } = require("../services/suscripciones");

const IPTV = () => ({
  base: process.env.IPTV_BASE_URL,
  user: process.env.IPTV_USERNAME,
  pass: process.env.IPTV_PASSWORD,
});

// ─── Helper fetch con timeout ─────────────────────────────────────────────────
async function fetchIPTV(action, extra = "") {
  const { base, user, pass } = IPTV();
  const url = `${base}/player_api.php?username=${user}&password=${pass}&action=${action}${extra}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`IPTV error ${resp.status}`);
  return resp.json();
}

// ─── Manifest ─────────────────────────────────────────────────────────────────
const builder = new addonBuilder({
  id:          "com.tvxlp.addon",
  version:     "1.0.0",
  name:        "TVXLP Stream",
  description: "Tu cine sin límites",
  resources:   ["stream", "catalog", "meta"],
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
    {
      type:  "movie",
      id:    "tvxlp-movies",
      name:  "Películas",
      extra: [
        { name: "genre",  isRequired: false },
        { name: "search", isRequired: false },
        { name: "skip",   isRequired: false },
      ],
    },
    {
      type:  "series",
      id:    "tvxlp-series",
      name:  "Series",
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

// ─── Catalog Handler ──────────────────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const skip   = parseInt(extra?.skip || "0", 10);
    const limit  = 100;
    const search = extra?.search?.toLowerCase() || "";
    const genre  = extra?.genre || "";

    // ── Canales en vivo ──────────────────────────────────────────────────────
    if (type === "channel" && id === "tvxlp-live") {
      const [canales, cats] = await Promise.all([
        fetchIPTV("get_live_streams"),
        fetchIPTV("get_live_categories").then((c) =>
          Object.fromEntries(c.map((x) => [x.category_id, x.category_name]))
        ),
      ]);

      let filtrados = canales;
      if (genre)  filtrados = filtrados.filter((c) => cats[c.category_id] === genre);
      if (search) filtrados = filtrados.filter((c) => c.name.toLowerCase().includes(search));

      const metas = filtrados.slice(skip, skip + limit).map((c) => ({
        id:     `tvxlp-live-${c.stream_id}`,
        type:   "channel",
        name:   c.name,
        poster: c.stream_icon || "",
        genres: [cats[c.category_id] || "General"],
      }));

      return { metas };
    }

    // ── Películas ────────────────────────────────────────────────────────────
    if (type === "movie" && id === "tvxlp-movies") {
      const [peliculas, cats] = await Promise.all([
        fetchIPTV("get_vod_streams"),
        fetchIPTV("get_vod_categories").then((c) =>
          Object.fromEntries(c.map((x) => [x.category_id, x.category_name]))
        ),
      ]);

      let filtrados = peliculas;
      if (genre)  filtrados = filtrados.filter((p) => cats[p.category_id] === genre);
      if (search) filtrados = filtrados.filter((p) => p.name.toLowerCase().includes(search));

      const metas = filtrados.slice(skip, skip + limit).map((p) => ({
        id:          `tvxlp-movie-${p.stream_id}`,
        type:        "movie",
        name:        p.name,
        poster:      p.stream_icon || "",
        genres:      p.genre ? p.genre.split(",").map((g) => g.trim()) : [cats[p.category_id] || "General"],
        description: p.plot || "",
        releaseInfo: p.year || "",
        imdbRating:  p.rating ? String(p.rating) : "",
        director:    p.director || "",
        cast:        p.cast ? p.cast.split(",").map((a) => a.trim()) : [],
      }));

      return { metas };
    }

    // ── Series ───────────────────────────────────────────────────────────────
    if (type === "series" && id === "tvxlp-series") {
      const [series, cats] = await Promise.all([
        fetchIPTV("get_series"),
        fetchIPTV("get_series_categories").then((c) =>
          Object.fromEntries(c.map((x) => [x.category_id, x.category_name]))
        ),
      ]);

      let filtrados = series;
      if (genre)  filtrados = filtrados.filter((s) => cats[s.category_id] === genre);
      if (search) filtrados = filtrados.filter((s) => s.name.toLowerCase().includes(search));

      const metas = filtrados.slice(skip, skip + limit).map((s) => ({
        id:          `tvxlp-series-${s.series_id}`,
        type:        "series",
        name:        s.name,
        poster:      s.cover || "",
        genres:      [cats[s.category_id] || "General"],
        description: s.plot || "",
        releaseInfo: s.year || "",
        imdbRating:  s.rating ? String(s.rating) : "",
        director:    s.director || "",
        cast:        s.cast ? s.cast.split(",").map((a) => a.trim()) : [],
      }));

      return { metas };
    }

  } catch (err) {
    console.error("Error en catalog:", err.message);
  }

  return { metas: [] };
});

// ─── Meta Handler ─────────────────────────────────────────────────────────────
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const { base, user, pass } = IPTV();

    if (type === "movie" && id.startsWith("tvxlp-movie-")) {
      const streamId = id.replace("tvxlp-movie-", "");
      const info = await fetchIPTV("get_vod_info", `&vod_id=${streamId}`);
      const m = info?.info || {};
      return {
        meta: {
          id,
          type:        "movie",
          name:        m.name || id,
          poster:      m.movie_image || "",
          description: m.plot || "",
          releaseInfo: m.releasedate || "",
          imdbRating:  m.rating || "",
          director:    m.director || "",
          cast:        m.cast ? m.cast.split(",").map((a) => a.trim()) : [],
          genres:      m.genre ? m.genre.split(",").map((g) => g.trim()) : [],
        }
      };
    }

    if (type === "series" && id.startsWith("tvxlp-series-")) {
      const seriesId = id.replace("tvxlp-series-", "");
      const info = await fetchIPTV("get_series_info", `&series_id=${seriesId}`);
      const m = info?.info || {};

      // Construye episodios
      const videos = [];
      const episodes = info?.episodes || {};
      Object.entries(episodes).forEach(([season, eps]) => {
        (eps || []).forEach((ep) => {
          videos.push({
            id:       `${id}:${ep.id}`,
            title:    ep.title || `Episodio ${ep.episode_num}`,
            season:   parseInt(season, 10),
            episode:  ep.episode_num,
            overview: ep.info?.plot || "",
          });
        });
      });

      return {
        meta: {
          id,
          type:        "series",
          name:        m.name || id,
          poster:      m.cover || "",
          description: m.plot || "",
          releaseInfo: m.releaseDate || "",
          imdbRating:  m.rating || "",
          videos,
        }
      };
    }

  } catch (err) {
    console.error("Error en meta:", err.message);
  }

  return { meta: {} };
});

// ─── Stream Handler ───────────────────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const partes        = id.split(":");
    const contenidoId   = partes[0];
    const suscripcionId = partes[1];
    const episodioId    = partes[2]; // Para series

    // Valida suscripción
    const { valido, razon } = await validarSuscripcion(suscripcionId);
    if (!valido) {
      console.log(`Acceso denegado [${suscripcionId}]: ${razon}`);
      return { streams: [] };
    }

    const { base, user, pass } = IPTV();
    const streams = [];

    // ── Canal en vivo ────────────────────────────────────────────────────────
    if (type === "channel" && contenidoId.startsWith("tvxlp-live-")) {
      const streamId = contenidoId.replace("tvxlp-live-", "");
      streams.push({
        url:   `${base}/live/${user}/${pass}/${streamId}.m3u8`,
        title: "HD - Principal",
      });
      streams.push({
        url:   `${base}/live/${user}/${pass}/${streamId}.ts`,
        title: "HD - Alternativo",
        behaviorHints: { notWebReady: true },
      });
    }

    // ── Película ─────────────────────────────────────────────────────────────
    if (type === "movie" && contenidoId.startsWith("tvxlp-movie-")) {
      const streamId = contenidoId.replace("tvxlp-movie-", "");
      streams.push({
        url:   `${base}/movie/${user}/${pass}/${streamId}.mp4`,
        title: "HD - Panel VOD",
      });
      streams.push({
        url:   `${base}/movie/${user}/${pass}/${streamId}.mkv`,
        title: "HD - Panel MKV",
      });
    }

    // ── Serie / Episodio ──────────────────────────────────────────────────────
    if (type === "series" && episodioId) {
      streams.push({
        url:   `${base}/series/${user}/${pass}/${episodioId}.mp4`,
        title: "HD - Panel VOD",
      });
      streams.push({
        url:   `${base}/series/${user}/${pass}/${episodioId}.mkv`,
        title: "HD - Panel MKV",
      });
    }

    return { streams };

  } catch (err) {
    console.error("Error en stream:", err.message);
    return { streams: [] };
  }
});

module.exports = { builder };