const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");

// ─── Helmet ───────────────────────────────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy:    false,
  crossOriginEmbedderPolicy: false,
});

// ─── CORS para Smart TVs ──────────────────────────────────────────────────────
const corsMiddleware = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
};

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Espera 15 minutos." },
});

const limiterCodigos = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Límite de códigos alcanzado. Espera 15 minutos." },
});

const limiterActivacion = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos. Espera 1 hora." },
});

const limiterPolling = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Polling muy frecuente." },
});

const limiterWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Demasiados webhooks." },
});

// ─── Middleware de Admin ──────────────────────────────────────────────────────
// Verifica la clave de admin para rutas protegidas
const verificarAdmin = (req, res, next) => {
  const { admin_key } = req.body;

  if (!admin_key || admin_key !== process.env.ADMIN_SECRET_KEY) {
    console.warn(`Intento no autorizado desde IP: ${req.ip}`);
    return res.status(401).json({ success: false, error: "No autorizado" });
  }
  next();
};

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  limiterGeneral,
  limiterCodigos,
  limiterActivacion,
  limiterPolling,
  limiterWebhook,
  verificarAdmin,
};
