/* ==========================================================================
   SANTÉVIT IPS — CONFIGURACIÓN CENTRAL
   --------------------------------------------------------------------------
   Este es el ÚNICO archivo que debes editar para poner la página en marcha.

   1. WHATSAPP_NUMBER: número del WhatsApp Concierge, solo dígitos, con
      indicativo de país y sin "+" ni espacios. Ej: "573001234567".
      Mientras esté vacío, todos los botones de WhatsApp llevan al formulario.

   2. FIREBASE: pega aquí el objeto "firebaseConfig" que te da la consola de
      Firebase (Configuración del proyecto → Tus apps → App web).
      Estos valores son PÚBLICOS por diseño: la seguridad la dan las reglas
      de firestore.rules y la restricción de la API key por dominio.
      Mientras apiKey esté vacío, la página funciona en MODO DEMO (los datos
      se guardan solo en el navegador, útil para revisar el diseño).

   3. RECAPTCHA_SITE_KEY (opcional pero recomendado): clave de sitio de
      reCAPTCHA v3 para activar App Check (bloquea bots y scripts).
   ========================================================================== */
window.SANTEVIT_CONFIG = Object.freeze({
  WHATSAPP_NUMBER: "",

  FIREBASE: Object.freeze({
    apiKey: "AIzaSyDmsoIJuBieFdd2x_enFquWTYQbLuFXWlc",
    authDomain: "santevi-landing-page.firebaseapp.com",
    projectId: "santevi-landing-page",
    storageBucket: "santevi-landing-page.firebasestorage.app",
    messagingSenderId: "554026321417",
    appId: "1:554026321417:web:c97a394e64a49273321ad8",
  }),

  RECAPTCHA_SITE_KEY: "",

  // Mensaje que se precarga al abrir WhatsApp desde la página
  WHATSAPP_DEFAULT_MESSAGE:
    "Hola Santévit, quiero agendar un electrocardiograma con lectura especializada.",

  // Datos institucionales que aparecen en el pie de página (completar)
  REPS_CODE: "Por definir",
  ADDRESS: "Bogotá D.C., Colombia",
  CONTACT_EMAIL: "contacto@santevit.com",

  // Versión del texto de autorización de datos que acepta el paciente.
  // Cámbiala si modificas privacidad.html (queda registrada con cada lead).
  CONSENT_VERSION: "v1-2026-10",

  // Cierre automático de sesión del panel admin por inactividad (minutos)
  ADMIN_IDLE_MINUTES: 30,
});
