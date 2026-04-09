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
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TVXLP - Activar</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#111; color:#fff; font-family:Arial,sans-serif; padding:24px; }
    h1 { color:#e50914; font-size:28px; margin-bottom:8px; }
    p { color:#aaa; margin-bottom:24px; font-size:14px; }
    label { display:block; font-size:14px; color:#aaa; margin-bottom:6px; }
    input { width:100%; padding:14px; background:#222; border:2px solid #333;
            border-radius:8px; color:#fff; font-size:18px; margin-bottom:16px;
            text-align:center; letter-spacing:4px; }
    input:focus { outline:none; border-color:#e50914; }
    button { width:100%; padding:16px; background:#e50914; color:#fff;
             border:none; border-radius:8px; font-size:18px;
             font-weight:bold; cursor:pointer; }
    button:disabled { background:#555; cursor:not-allowed; }
    .result { margin-top:16px; padding:16px; border-radius:8px;
              text-align:center; display:none; }
    .success { background:#1a3a1a; color:#4caf50; border:1px solid #4caf50; }
    .error   { background:#3a1a1a; color:#e50914; border:1px solid #e50914; }
  </style>
</head>
<body>
  <h1>TVXLP</h1>
  <p>Activa la TV de tu cliente</p>

  <label>Código que aparece en la TV</label>
  <input type="text" id="code" placeholder="A3F 9K2" maxlength="7">

  <label>ID del cliente (de Firebase)</label>
  <input type="text" id="uid" placeholder="user_test_xalapa" style="letter-spacing:1px; font-size:14px;">

  <label>Tu clave de admin</label>
  <input type="password" id="key" placeholder="••••••••" style="letter-spacing:4px;">

  <button id="btn" onclick="activar()">✅ Activar TV</button>

  <div class="result" id="result"></div>

  <script>
    const saved = localStorage.getItem('admin_key');
    if (saved) document.getElementById('key').value = saved;

    async function activar() {
      const code = document.getElementById('code').value.trim();
      const uid  = document.getElementById('uid').value.trim();
      const key  = document.getElementById('key').value.trim();
      const btn  = document.getElementById('btn');
      const res  = document.getElementById('result');

      if (!code || !uid || !key) {
        mostrar('error', 'Llena todos los campos');
        return;
      }

      localStorage.setItem('admin_key', key);
      btn.disabled = true;
      btn.textContent = 'Activando...';

      try {
        const resp = await fetch('/api/device-code/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, suscripcion_id: uid, admin_key: key })
        });
        const data = await resp.json();

        if (data.success) {
          mostrar('success', '✅ TV activada. El cliente ya puede ver su contenido.');
          document.getElementById('code').value = '';
          document.getElementById('uid').value  = '';
        } else {
          mostrar('error', '❌ ' + data.error);
        }
      } catch(e) {
        mostrar('error', 'Error de conexión');
      } finally {
        btn.disabled = false;
        btn.textContent = '✅ Activar TV';
      }
    }

    function mostrar(tipo, msg) {
      const el = document.getElementById('result');
      el.className = 'result ' + tipo;
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => el.style.display = 'none', 4000);
    }
  </script>
</body>
</html>`);
});

// ─── Manifest con transportUrl ────────────────────────────────────────────────
app.get("/addon/manifest.json", (req, res) => {
  res.json({
    ...addonInterface.manifest,
    transportUrl: "https://app.tvxlp.com/addon/manifest.json",
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