/* Pruebas de las reglas de seguridad contra el emulador de Firestore.
   Ejecutar:  npm run test:rules   (requiere Java y firebase-tools) */
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, collection, writeBatch, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, increment, Timestamp,
} from "firebase/firestore";

const PROJECT = "demo-santevit";
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
await env.clearFirestore();

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log("  ✔", name); }
  catch (e) { fail++; console.log("  ✘", name, "→", e.message); }
}
const lead = (over = {}) => ({
  nombre: "Ana María Gómez", telefono: "+573001234567", correo: "ana@correo.com", servicio: "express",
  urgente_48h: true, acepta_tratamiento: true, consentimiento_version: "v1-2026-10", estado: "nuevo",
  utm_source: "google_ads", created_at: serverTimestamp(), ...over,
});
function submit(db, data) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "leads")), data);
  b.set(doc(db, "throttle", data.telefono.replace("+", "")), { ts: serverTimestamp() });
  return b.commit();
}

const anon = env.unauthenticatedContext().firestore();
const intruso = env.authenticatedContext("intruso", { email: "x@x.com" }).firestore();
const admin = env.authenticatedContext("admin1", { email: "admin@santevit.com" }).firestore();
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), "admins", "admin1"), { email: "admin@santevit.com" });
});

console.log("\nPúblico (sin sesión)");
await t("puede enviar un lead válido", () => assertSucceeds(submit(anon, lead())));
await t("NO puede repetir el mismo celular antes de 10 min", () => assertFails(submit(anon, lead({ correo: "otro@correo.com" }))));
await t("NO puede crear lead sin marca anti-spam", () => assertFails(setDoc(doc(collection(anon, "leads")), lead({ telefono: "+573110000000" }))));
await t("NO acepta celular inválido", () => assertFails(submit(anon, lead({ telefono: "+571234" }))));
await t("NO acepta campos extra", () => assertFails(submit(anon, lead({ telefono: "+573110000001", admin: true }))));
await t("NO puede crear con estado distinto a 'nuevo'", () => assertFails(submit(anon, lead({ telefono: "+573110000002", estado: "atendido" }))));
await t("NO puede falsificar la fecha", () => assertFails(submit(anon, lead({ telefono: "+573110000003", created_at: Timestamp.fromDate(new Date("2020-01-01")) }))));
await t("NO acepta HTML en el nombre", () => assertFails(submit(anon, lead({ telefono: "+573110000004", nombre: "<script>x" }))));
await t("NO acepta lead sin autorización de datos", () => assertFails(submit(anon, lead({ telefono: "+573110000005", acepta_tratamiento: false }))));
await t("NO puede leer leads", () => assertFails(getDocs(collection(anon, "leads"))));
await t("NO puede leer la marca anti-spam", () => assertFails(getDoc(doc(anon, "throttle", "573001234567"))));
await t("puede sumar +1 visita (crear contador)", () => assertSucceeds(setDoc(doc(anon, "stats_daily", "2026-10-01"), { v_google_ads: increment(1) }, { merge: true })));
await t("puede sumar +1 visita (contador existente)", () => assertSucceeds(setDoc(doc(anon, "stats_daily", "2026-10-01"), { v_google_ads: increment(1) }, { merge: true })));
await t("puede sumar +1 clic WhatsApp", () => assertSucceeds(setDoc(doc(anon, "stats_daily", "2026-10-01"), { w_meta_ads: increment(1) }, { merge: true })));
await t("NO puede inflar contador (+50)", () => assertFails(setDoc(doc(anon, "stats_daily", "2026-10-01"), { v_google_ads: increment(50) }, { merge: true })));
await t("NO puede usar canal inventado", () => assertFails(setDoc(doc(anon, "stats_daily", "2026-10-01"), { v_hacker: increment(1) }, { merge: true })));
await t("NO puede tocar dos contadores a la vez", () => assertFails(setDoc(doc(anon, "stats_daily", "2026-10-01"), { v_directo: increment(1), w_directo: increment(1) }, { merge: true })));
await t("NO puede leer métricas", () => assertFails(getDoc(doc(anon, "stats_daily", "2026-10-01"))));
await t("NO puede hacerse admin", () => assertFails(setDoc(doc(anon, "admins", "yo"), { email: "a@a.co" })));
await t("NO puede escribir en colecciones desconocidas", () => assertFails(setDoc(doc(anon, "otra", "x"), { a: 1 })));

console.log("\nUsuario con sesión pero SIN rol admin");
await t("NO puede leer leads", () => assertFails(getDocs(collection(intruso, "leads"))));
await t("NO puede leer métricas", () => assertFails(getDocs(collection(intruso, "stats_daily"))));
await t("NO puede auto-asignarse admin", () => assertFails(setDoc(doc(intruso, "admins", "intruso"), { email: "x@x.com" })));

console.log("\nAdministrador");
const snap = await getDocs(collection(admin, "leads"));
const id = snap.docs[0]?.id;
await t("puede leer leads", () => { if (!id) throw new Error("sin datos"); });
await t("puede leer métricas", () => assertSucceeds(getDoc(doc(admin, "stats_daily", "2026-10-01"))));
await t("puede cambiar estado + bitácora", async () => {
  const b = writeBatch(admin);
  b.update(doc(admin, "leads", id), { estado: "contactado", updated_at: serverTimestamp(), updated_by: "admin1" });
  b.set(doc(collection(admin, "audit")), { lead_id: id, actor: "admin1", action: "update", old_estado: "nuevo", new_estado: "contactado", at: serverTimestamp() });
  await assertSucceeds(b.commit());
});
await t("puede guardar notas", () => assertSucceeds(updateDoc(doc(admin, "leads", id), { notas: "Llamar en la tarde", updated_at: serverTimestamp(), updated_by: "admin1" })));
await t("NO puede alterar nombre/teléfono", () => assertFails(updateDoc(doc(admin, "leads", id), { nombre: "Otro", updated_at: serverTimestamp(), updated_by: "admin1" })));
await t("NO puede poner estado inválido", () => assertFails(updateDoc(doc(admin, "leads", id), { estado: "pagado", updated_at: serverTimestamp(), updated_by: "admin1" })));
await t("NO puede firmar como otro usuario", () => assertFails(updateDoc(doc(admin, "leads", id), { estado: "agendado", updated_at: serverTimestamp(), updated_by: "otro" })));
const audits = await getDocs(collection(admin, "audit"));
await t("NO puede editar la bitácora", () => assertFails(updateDoc(doc(admin, "audit", audits.docs[0].id), { action: "delete" })));
await t("NO puede borrar la bitácora", () => assertFails(deleteDoc(doc(admin, "audit", audits.docs[0].id))));
await t("NO puede modificar contadores a mano (+100)", () => assertFails(updateDoc(doc(admin, "stats_daily", "2026-10-01"), { v_google_ads: 999 })));
await t("puede eliminar un lead (supresión Ley 1581)", () => assertSucceeds(deleteDoc(doc(admin, "leads", id))));

console.log(`\n${pass} pruebas OK · ${fail} fallidas\n`);
await env.cleanup();
process.exit(fail ? 1 : 0);
