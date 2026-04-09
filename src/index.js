require("dotenv").config();
require("./firebase");

const express           = require("express");
const { builder }       = require("./addon");
const { helmetMiddleware, corsMiddleware, limiterGeneral } = require("../middleware/seguridad");
const deviceCodesRouter = require("../routes/device-codes");
const webhooksRouter    = require("../routes/webhooks");

const app            = express();
const addonInterface = builder.getInterface();
const addonRouter = require("stremio-addon-sdk/src/getRouter");

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use("/api/", limiterGeneral);

// ─── Rutas API ────────────────────────────────────────────────────────────────
app.use("/api/device-code", deviceCodesRouter);
app.use("/api/webhook",     webhooksRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", proyecto: "TVXLP", timestamp: new Date().toISOString() });
});

// ─── Activar TV ───────────────────────────────────────────────────────────────
app.get("/activar", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>TVXLP - Activar</title></head>
    <body style="background:#000;color:#fff;font-family:Arial;text-align:center;padding:40px">
    <h1 style="color:#e50914">TVXLP</h1><p>Panel de activación - próximamente</p>
    </body></html>`);
});

// ─── Manifest con transportUrl ────────────────────────────────────────────────
app.get("/addon/manifest.json", (req, res) => {
  res.json({
    ...addonInterface.manifest,
    transportUrl: "https://tvxlp-backend.onrender.com/addon/manifest.json",
  });
});

// ─── Addon SDK Router (maneja catalog, stream, meta) ─────────────────────────
app.use("/addon", addonRouter(addonInterface));

// ─── Arrancar ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`
  ✅ TVXLP Backend corriendo
  ─────────────────────────────────
  Puerto:      ${PORT}
  Health:      http://localhost:${PORT}/health
  Addon:       http://localhost:${PORT}/addon/manifest.json
  Catálogo:    http://localhost:${PORT}/addon/catalog/channel/tvxlp-live.json
  `);
});