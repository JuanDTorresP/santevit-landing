/* Rellena los datos institucionales de config.js en páginas legales */
(function () {
  "use strict";
  const CFG = window.SANTEVIT_CONFIG || {};
  document.querySelectorAll("[data-config]").forEach((el) => {
    const v = CFG[el.dataset.config];
    if (v) el.textContent = v;
  });
})();
