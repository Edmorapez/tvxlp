require("dotenv").config();
const { db, admin } = require("./firebase");

async function testConexion() {
  console.log("🔥 Probando conexión a Firestore...\n");

  try {
    // 1. Lee los planes
    const planesSnap = await db.collection("planes").get();
    console.log(`✅ Planes encontrados: ${planesSnap.size}`);
    planesSnap.forEach(doc => {
      const d = doc.data();
      console.log(`   - ${doc.id}: $${d.precio_publico} MXN / ${d.dispositivos} dispositivo(s)`);
    });

    // 2. Lee el vendedor admin
    const adminDoc = await db.collection("vendedores").doc("admin").get();
    if (adminDoc.exists) {
      const d = adminDoc.data();
      console.log(`\n✅ Vendedor admin: ${d.nombre} | Créditos: ${d.creditos}`);
    } else {
      console.log("\n⚠️  Vendedor admin no encontrado");
    }

    // 3. Lee la suscripción de prueba
    const subDoc = await db.collection("suscripciones").doc("user_test_xalapa").get();
    if (subDoc.exists) {
      const d = subDoc.data();
      console.log(`\n✅ Suscripción prueba: ${d.nombre}`);
      console.log(`   Active: ${d.active}`);
      console.log(`   Expira: ${d.expires_at.toDate().toLocaleDateString("es-MX")}`);

      // Resuelve la referencia del plan
      const planDoc = await d.plan_id.get();
      console.log(`   Plan: ${planDoc.data().nombre}`);
    } else {
      console.log("\n⚠️  Suscripción de prueba no encontrada");
    }

    // 4. Prueba el Kill Switch
    await db.collection("suscripciones").doc("user_test_xalapa").update({
      active: false,
    });
    console.log("\n✅ Kill Switch: active = false");

    await db.collection("suscripciones").doc("user_test_xalapa").update({
      active: true,
    });
    console.log("✅ Reactivación: active = true");

    console.log("\n🎉 Firebase listo. Puedes subir a Render.");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error("\nVerifica que las variables de entorno estén correctas en .env");
    process.exit(1);
  }
}

testConexion();
