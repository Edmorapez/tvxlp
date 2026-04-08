const { db, admin } = require("../firebase");

// ─── Valida si un usuario puede ver contenido ────────────────────────────────
async function validarSuscripcion(suscripcionId) {
  if (!suscripcionId) return { valido: false, razon: "Sin ID" };

  try {
    const doc = await db.collection("suscripciones").doc(suscripcionId).get();

    if (!doc.exists) return { valido: false, razon: "Usuario no encontrado" };

    const data = doc.data();

    if (!data.active) return { valido: false, razon: "Suscripción inactiva" };

    const ahora  = new Date();
    const expira = data.expires_at.toDate();

    if (ahora > expira) {
      // Desactiva automáticamente si ya venció
      await doc.ref.update({ active: false });
      return { valido: false, razon: "Suscripción vencida" };
    }

    // Obtiene el plan para saber cuántos dispositivos permite
    const planRef  = data.plan_id;
    const planDoc  = await planRef.get();
    const planData = planDoc.exists ? planDoc.data() : { dispositivos: 1 };

    return {
      valido: true,
      suscripcion: data,
      plan: planData,
      suscripcionId,
    };

  } catch (err) {
    console.error("Error validando suscripción:", err.message);
    return { valido: false, razon: "Error interno" };
  }
}

// ─── Activa o renueva una suscripción después de un pago ─────────────────────
async function activarSuscripcion(suscripcionId, pagoId, diasExtra = 30) {
  const docRef = db.collection("suscripciones").doc(suscripcionId);
  const doc    = await docRef.get();

  if (!doc.exists) throw new Error("Suscripción no encontrada");

  const data      = doc.data();
  const ahora     = new Date();
  const baseDate  = data.active && data.expires_at.toDate() > ahora
    ? data.expires_at.toDate()  // Si está activa, extiende desde la fecha actual
    : ahora;                     // Si venció, empieza desde hoy

  const nuevaFecha = new Date(baseDate);
  nuevaFecha.setDate(nuevaFecha.getDate() + diasExtra);

  await docRef.update({
    active:         true,
    expires_at:     admin.firestore.Timestamp.fromDate(nuevaFecha),
    ultimo_pago_id: pagoId,
  });

  return { nuevaFecha, suscripcionId };
}

// ─── Obtiene suscripción completa con plan y vendedor ────────────────────────
async function obtenerSuscripcion(suscripcionId) {
  const doc = await db.collection("suscripciones").doc(suscripcionId).get();
  if (!doc.exists) return null;

  const data = doc.data();

  // Resuelve referencias
  const planDoc      = await data.plan_id.get();
  const vendedorDoc  = await data.vendedor_id.get();

  return {
    id:       doc.id,
    ...data,
    plan:     planDoc.exists ? planDoc.data() : null,
    vendedor: vendedorDoc.exists ? vendedorDoc.data() : null,
  };
}

module.exports = {
  validarSuscripcion,
  activarSuscripcion,
  obtenerSuscripcion,
};
