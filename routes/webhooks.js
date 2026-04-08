const express  = require("express");
const router   = express.Router();
const crypto   = require("crypto");
const { confirmarPago } = require("../services/pagos");
const { limiterWebhook } = require("../middleware/seguridad");

// ─── POST /api/webhook/conekta ────────────────────────────────────────────────
// Conekta llama esto cuando un pago se confirma (OXXO o SPEI)
router.post("/conekta", limiterWebhook, async (req, res) => {
  try {
    // Verifica que el webhook viene de Conekta
    // Conekta manda una firma en el header
    const firma          = req.headers["x-conekta-webhook-signature"] || "";
    const webhookSecret  = process.env.CONEKTA_WEBHOOK_SECRET || "";

    if (webhookSecret) {
      const firmaEsperada = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (firma !== firmaEsperada) {
        console.warn("Webhook con firma inválida");
        return res.status(401).json({ error: "Firma inválida" });
      }
    }

    const { type, data } = req.body;

    // Solo procesamos pagos confirmados
    // Conekta manda "charge.paid" cuando el pago se confirma
    if (type !== "charge.paid") {
      return res.sendStatus(200); // OK pero no hacemos nada
    }

    const charge     = data?.object;
    const conektaId  = charge?.id || "";
    const referencia = charge?.payment_method?.reference || "";

    if (!conektaId) {
      return res.status(400).json({ error: "ID de cargo no encontrado" });
    }

    await confirmarPago(conektaId, referencia);

    res.json({ success: true });

  } catch (err) {
    console.error("Error procesando webhook Conekta:", err.message);
    // Importante: siempre responder 200 a Conekta
    // Si respondes error, Conekta reintenta y puede duplicar el pago
    res.sendStatus(200);
  }
});

module.exports = router;
