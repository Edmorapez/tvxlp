const crypto  = require("crypto");
const { db, admin } = require("../src/firebase");


// ─── Genera un código HMAC de 6 caracteres ───────────────────────────────────
function generarCodigoHMAC(deviceId) {
  const secret    = process.env.HMAC_SECRET;
  if (!secret) throw new Error("HMAC_SECRET no configurado");

  const timestamp = Date.now().toString();
  const salt      = crypto.randomBytes(8).toString("hex");
  const payload   = `${deviceId}:${timestamp}:${salt}`;

  const firma = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();

  return { codigo: firma, payload };
}

// ─── Verifica un código HMAC ─────────────────────────────────────────────────
function verificarCodigoHMAC(codigoIngresado, payloadOriginal) {
  const secret = process.env.HMAC_SECRET;
  if (!secret) throw new Error("HMAC_SECRET no configurado");

  const firmaEsperada = crypto
    .createHmac("sha256", secret)
    .update(payloadOriginal)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(codigoIngresado.toUpperCase()),
      Buffer.from(firmaEsperada)
    );
  } catch {
    return false;
  }
}

// ─── Genera ID del dispositivo ───────────────────────────────────────────────
function generarDeviceId(req) {
  const ip        = req.ip || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  return crypto
    .createHash("sha256")
    .update(`${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 16);
}

// ─── Crea un nuevo código en Firestore ───────────────────────────────────────
async function crearCodigo(req) {
  const deviceId             = generarDeviceId(req);
  const { codigo, payload }  = generarCodigoHMAC(deviceId);
  const expiresAt            = new Date(Date.now() + 5 * 60 * 1000);

  // Verifica que no exista ya
  const snap = await db.collection("device_codes")
    .where("codigo", "==", codigo)
    .where("status", "==", "pending")
    .get();

  if (!snap.empty) return crearCodigo(req); // Recursivo si hay colisión (rarísimo)

  await db.collection("device_codes").add({
    codigo,
    payload,
    suscripcion_id: null,
    status:         "pending",
    device_info:    req.headers["user-agent"] || "Smart TV",
    device_ip:      req.ip,
    expires_at:     admin.firestore.Timestamp.fromDate(expiresAt),
    creado_en:      admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    codigo,
    formatted: codigo.slice(0, 3) + " " + codigo.slice(3),
    expires_in: 300,
  };
}

// ─── Verifica el status de un código ────────────────────────────────────────
async function verificarStatus(codigo) {
  const cleanCode = codigo.replace(/\s/g, "").toUpperCase();

  const snap = await db.collection("device_codes")
    .where("codigo", "==", cleanCode)
    .orderBy("creado_en", "desc")
    .limit(1)
    .get();

  if (snap.empty) return { status: "not_found" };

  const doc  = snap.docs[0];
  const data = doc.data();

  if (new Date() > data.expires_at.toDate()) {
    await doc.ref.update({ status: "expired" });
    return { status: "expired" };
  }

  if (data.status === "approved") {
    const subId = data.suscripcion_id?.id || "";
    return { status: "approved", suscripcion_id: subId };
  }

  return { status: data.status };
}

// ─── Aprueba un código y lo vincula a una suscripción ───────────────────────
async function aprobarCodigo(codigo, suscripcionId) {
  const cleanCode = codigo.replace(/\s/g, "").toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
    throw new Error("Formato de código inválido");
  }

  const snap = await db.collection("device_codes")
    .where("codigo", "==", cleanCode)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (snap.empty) throw new Error("Código no encontrado o ya usado");

  const doc  = snap.docs[0];
  const data = doc.data();

  if (new Date() > data.expires_at.toDate()) {
    await doc.ref.update({ status: "expired" });
    throw new Error("Código expirado");
  }

  // Verifica HMAC
  if (!verificarCodigoHMAC(cleanCode, data.payload)) {
    throw new Error("Código inválido");
  }

  // Verifica que la suscripción existe y está activa
  const subDoc = await db.collection("suscripciones").doc(suscripcionId).get();
  if (!subDoc.exists || !subDoc.data().active) {
    throw new Error("Suscripción inactiva o no existe");
  }

  // Verifica que no venció
  if (new Date() > subDoc.data().expires_at.toDate()) {
    throw new Error("Suscripción vencida");
  }

  // Aprueba con transacción atómica
  await db.runTransaction(async (transaction) => {
    transaction.update(doc.ref, {
      status:         "approved",
      suscripcion_id: subDoc.ref,
      approved_at:    admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { aprobado: true, suscripcion_id: suscripcionId };
}

module.exports = {
  crearCodigo,
  verificarStatus,
  aprobarCodigo,
  generarDeviceId,
};
