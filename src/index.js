require("dotenv").config();
require("./firebase"); // Inicializa Firebase al arrancar

const express         = require("express");
const { serveHTTP }   = require("stremio-addon-sdk");
const { builder } = require("./addon");
const { helmetMiddleware, corsMiddleware, limiterGeneral } = require("../middleware/seguridad");
const deviceCodesRouter = require("../routes/device-codes");
const webhooksRouter    = require("../routes/webhooks");

const app = express();

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use("/api/", limiterGeneral);

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use("/api/device-code", deviceCodesRouter);
app.use("/api/webhook",     webhooksRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:    "ok",
    proyecto:  "TVXLP",
    timestamp: new Date().toISOString(),
  });
});

// ─── Pantalla TV (activación por código) ─────────────────────────────────────
app.get("/activar", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TVXLP - Activar</title>
    </head>
    <body style="background:#000;color:#fff;font-family:Arial;text-align:center;padding:40px">
      <h1 style="color:#e50914">TVXLP</h1>
      <p>Panel de activación - próximamente</p>
    </body>
    </html>
  `);
});

// ─── Stremio Addon ────────────────────────────────────────────────────────────
// El addon corre en el mismo servidor en /addon
const addonInterface = builder.getInterface();

app.get("/addon/manifest.json", (req, res) => {
  res.json(addonInterface.manifest);
});

app.get("/addon/:resource/:type/:id.json", async (req, res) => {
  const { resource, type, id } = req.params;
  try {
    const result = await addonInterface.get({ resource, type, id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  console.log(`
  ✅ TVXLP Backend corriendo
  ─────────────────────────────────
  Puerto:      ${PORT}
  Health:      http://localhost:${PORT}/health
  Addon:       http://localhost:${PORT}/addon/manifest.json
  Activación:  http://localhost:${PORT}/api/device-code
  Webhook:     http://localhost:${PORT}/api/webhook/conekta
  `);
});
