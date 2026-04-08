const express    = require("express");
const router     = express.Router();
const {
  crearCodigo,
  verificarStatus,
  aprobarCodigo,
} = require("../services/device-codes");
const {
  limiterCodigos,
  limiterPolling,
  limiterActivacion,
  verificarAdmin,
} = require("../middleware/seguridad");

// ─── GET /api/device-code ─────────────────────────────────────────────────────
// La TV llama esto para obtener su código de activación
router.get("/", limiterCodigos, async (req, res) => {
  try {
    const resultado = await crearCodigo(req);
    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error("Error creando código:", err.message);
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

// ─── GET /api/device-code/:codigo/status ─────────────────────────────────────
// La TV hace polling cada 3 segundos para saber si fue activada
router.get("/:codigo/status", limiterPolling, async (req, res) => {
  try {
    const codigo = req.params.codigo;

    if (!codigo || codigo.replace(/\s/g, "").length !== 6) {
      return res.status(400).json({ status: "invalid" });
    }

    const resultado = await verificarStatus(codigo);
    res.json(resultado);
  } catch (err) {
    console.error("Error verificando status:", err.message);
    res.status(500).json({ status: "error" });
  }
});

// ─── POST /api/device-code/activate ──────────────────────────────────────────
// El vendedor activa la TV desde su celular
router.post("/activate", limiterActivacion, verificarAdmin, async (req, res) => {
  try {
    const { code, suscripcion_id } = req.body;

    if (!code || !suscripcion_id) {
      return res.status(400).json({ success: false, error: "Faltan campos" });
    }

    // Sanitizar suscripcion_id
    if (!/^[\w-]{3,50}$/.test(suscripcion_id)) {
      return res.status(400).json({ success: false, error: "ID inválido" });
    }

    const resultado = await aprobarCodigo(code, suscripcion_id);
    res.json({ success: true, ...resultado });

  } catch (err) {
    console.error("Error activando:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
