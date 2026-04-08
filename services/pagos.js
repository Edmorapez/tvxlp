const { db, admin } = require("../src/firebase");
const { activarSuscripcion } = require("./suscripciones");

// ─── Crea un pago pendiente en Firestore ─────────────────────────────────────
async function crearPago(suscripcionId, metodo) {
  const subDoc = await db.collection("suscripciones").doc(suscripcionId).get();
  if (!subDoc.exists) throw new Error("Suscripción no encontrada");

  const subData    = subDoc.data();
  const planDoc    = await subData.plan_id.get();
  const planData   = planDoc.data();
  const vendedorId = subData.vendedor_id.id;

  // Calcula comisiones según el plan
  const monto              = planData.precio_publico;
  const comisionRevendedor = planData.precio_revendedor;
  const comisionAdmin      = monto - comisionRevendedor;

  const pagoRef = await db.collection("pagos").add({
    suscripcion_id:      subDoc.ref,
    vendedor_id:         subData.vendedor_id,
    plan_id:             subData.plan_id,
    monto,
    metodo,             // "oxxo" | "spei"
    status:             "pendiente",
    conekta_id:         "",
    referencia_oxxo:    "",
    clabe_spei:         "",
    comision_revendedor: comisionRevendedor,
    comision_admin:      comisionAdmin,
    revendedor_pagado:   false,
    creado_en:           admin.firestore.FieldValue.serverTimestamp(),
    pagado_en:           null,
  });

  return {
    pagoId: pagoRef.id,
    monto,
    comisionRevendedor,
    comisionAdmin,
    vendedorId,
  };
}

// ─── Confirma un pago y actualiza todo en cascada ───────────────────────────
// Se llama desde el webhook de Conekta
async function confirmarPago(conektaId, referencia) {
  // Busca el pago por conekta_id o referencia_oxxo
  let snap = await db.collection("pagos")
    .where("conekta_id", "==", conektaId)
    .limit(1)
    .get();

  if (snap.empty) {
    snap = await db.collection("pagos")
      .where("referencia_oxxo", "==", referencia)
      .limit(1)
      .get();
  }

  if (snap.empty) throw new Error(`Pago no encontrado: ${conektaId}`);

  const pagoDoc  = snap.docs[0];
  const pagoData = pagoDoc.data();

  if (pagoData.status === "pagado") {
    console.log(`Pago ${pagoDoc.id} ya fue procesado`);
    return;
  }

  // Usa transacción para que todo pase junto o nada
  await db.runTransaction(async (transaction) => {

    // 1. Marca el pago como pagado
    transaction.update(pagoDoc.ref, {
      status:    "pagado",
      pagado_en: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Activa la suscripción
    const subRef    = pagoData.suscripcion_id;
    const subDoc    = await transaction.get(subRef);
    const subData   = subDoc.data();
    const ahora     = new Date();
    const baseDate  = subData.active && subData.expires_at.toDate() > ahora
      ? subData.expires_at.toDate()
      : ahora;
    const nuevaFecha = new Date(baseDate);
    nuevaFecha.setDate(nuevaFecha.getDate() + 30);

    transaction.update(subRef, {
      active:         true,
      expires_at:     admin.firestore.Timestamp.fromDate(nuevaFecha),
      ultimo_pago_id: pagoDoc.id,
    });

    // 3. Suma la comisión al balance del revendedor
    const vendedorRef = pagoData.vendedor_id;
    transaction.update(vendedorRef, {
      balance_pendiente: admin.firestore.FieldValue.increment(
        pagoData.comision_revendedor
      ),
      total_clientes: admin.firestore.FieldValue.increment(0), // No incrementa aquí
    });
  });

  console.log(`✅ Pago confirmado: ${pagoDoc.id}`);
  return pagoDoc.id;
}

module.exports = { crearPago, confirmarPago };
