/* ==========================================================================
   SANTÉVIT IPS — ETIQUETA DE GOOGLE ADS (gtag.js)
   Equivale al fragmento que entrega Google Ads ("Instala una etiqueta de
   Google"), pero en un archivo propio para respetar la política de seguridad
   (CSP) de la página, que no permite scripts escritos dentro del HTML.

   El ID y las etiquetas de conversión se configuran en config.js:
     GOOGLE_ADS_ID              → "AW-11320683982"
     GOOGLE_ADS_LABEL_LEAD      → etiqueta de la conversión "Formulario enviado"
     GOOGLE_ADS_LABEL_WHATSAPP  → etiqueta de la conversión "Clic en WhatsApp"
   ========================================================================== */
(function () {
  "use strict";
  const CFG = window.SANTEVIT_CONFIG || {};
  const ID = String(CFG.GOOGLE_ADS_ID || "");
  if (!/^AW-\d{6,15}$/.test(ID)) return; // sin ID válido no se carga nada

  // Carga la librería oficial de Google (equivale a <script async src=".../gtag/js?id=...">)
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.append(s);

  // Equivale al bloque: window.dataLayer = ...; function gtag(){...}; gtag('js', new Date()); gtag('config', 'AW-...');
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", ID);

  // Conversiones: main.js llama a esta función cuando alguien envía el
  // formulario ("lead") o hace clic en un botón de WhatsApp ("whatsapp").
  const LABELS = {
    lead: CFG.GOOGLE_ADS_LABEL_LEAD,
    whatsapp: CFG.GOOGLE_ADS_LABEL_WHATSAPP,
  };
  window.santevitConversion = function (type, detail) {
    try {
      const label = LABELS[type];
      if (label && /^[A-Za-z0-9_-]{4,64}$/.test(label)) {
        gtag("event", "conversion", { send_to: `${ID}/${label}` });
      }
      // Evento estándar adicional (sirve para Google Analytics / informes)
      gtag("event", type === "lead" ? "generate_lead" : "contact", {
        method: type === "lead" ? "formulario" : "whatsapp",
        servicio: detail || undefined,
      });
    } catch { /* nunca debe romper la página */ }
  };
})();
