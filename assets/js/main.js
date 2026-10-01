/* ==========================================================================
   SANTÉVIT IPS — LANDING (front de pacientes)
   - Enlaces de WhatsApp Concierge (con mensaje precargado por servicio)
   - Captura de origen de campaña (UTM, Google Ads gclid, Meta fbclid)
   - Formulario con validación, anti-spam y envío seguro a Firestore
     (API REST: no carga el SDK completo → la página abre más rápido)
   - Contadores anónimos de visitas y clics en WhatsApp (sin datos personales)
   ========================================================================== */
(function () {
  "use strict";

  const CFG = window.SANTEVIT_CONFIG || {};
  const FB = CFG.FIREBASE || {};
  const HAS_BACKEND = Boolean(FB.apiKey && FB.projectId);
  const HAS_WA = /^\d{10,15}$/.test(CFG.WHATSAPP_NUMBER || "");
  const DEMO_KEY = "santevit_demo_leads";
  const TZ = "America/Bogota";

  /* ---------- Almacenamiento seguro (puede fallar en modo privado) ---------- */
  const store = {
    get(k, s = sessionStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = sessionStorage) { try { s.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };

  /* ---------- Utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clean = (v, max) =>
    String(v || "").replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  const randomId = (n = 20) => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join("");
  };
  const todayCO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

  /* ---------- App Check (opcional): bloquea bots y scripts ---------- */
  let getAppCheckToken = null;
  const appCheckReady = new Promise((resolve) => {
    if (!HAS_BACKEND || !CFG.RECAPTCHA_SITE_KEY) return resolve();
    const sc = document.createElement("script");
    sc.src = new URL("assets/vendor/firebase-appcheck.bundle.js", document.baseURI).href;
    sc.onload = () => {
      try { getAppCheckToken = window.SantevitAppCheck.init(FB, CFG.RECAPTCHA_SITE_KEY); } catch { /* sin App Check */ }
      resolve();
    };
    sc.onerror = () => resolve();
    document.head.append(sc);
  });

  /* ---------- Escritura en Firestore por REST (operación atómica) ---------- */
  const DB_PATH = `projects/${FB.projectId}/databases/(default)/documents`;
  const REST_BASE = CFG.FIRESTORE_REST_BASE || "https://firestore.googleapis.com";
  const toValue = (v) =>
    typeof v === "boolean" ? { booleanValue: v } : v == null ? { nullValue: null } : { stringValue: String(v) };

  async function commit(writes, { keepalive = false, timeout = 10000 } = {}) {
    await appCheckReady;
    const headers = { "Content-Type": "application/json" };
    if (getAppCheckToken) {
      try { headers["X-Firebase-AppCheck"] = await getAppCheckToken(); } catch { /* el servidor decidirá */ }
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${REST_BASE}/v1/${DB_PATH}:commit?key=${encodeURIComponent(FB.apiKey)}`, {
        method: "POST", headers, body: JSON.stringify({ writes }),
        signal: ctrl.signal, keepalive, credentials: "omit",
      });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return true;
    } finally {
      clearTimeout(t);
    }
  }

  /* ---------- Datos institucionales desde config ---------- */
  $$("[data-config]").forEach((el) => {
    const v = CFG[el.dataset.config];
    if (v) el.textContent = v;
  });
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());
  if (!HAS_BACKEND) $("#demo-banner")?.removeAttribute("hidden");

  /* ---------- Origen de la visita (atribución de campañas) ---------- */
  function getAttribution() {
    const saved = store.get("sv_attr");
    if (saved) { try { return JSON.parse(saved); } catch { /* recalcular */ } }
    const p = new URLSearchParams(location.search);
    let source = clean(p.get("utm_source"), 100);
    if (!source && p.get("gclid")) source = "google_ads";
    if (!source && p.get("fbclid")) source = "meta_ads";
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* nada */ }
    if (ref === location.hostname) ref = "";
    if (!source) {
      if (/google\./.test(ref)) source = "google_organico";
      else if (/(facebook|instagram|fb)\./.test(ref)) source = "meta_organico";
      else source = ref ? "referido" : "directo";
    }
    const attr = {
      utm_source: source,
      utm_medium: clean(p.get("utm_medium"), 100) || null,
      utm_campaign: clean(p.get("utm_campaign"), 150) || null,
      referrer: clean(ref, 200) || null,
      landing_path: clean(location.pathname, 200),
    };
    store.set("sv_attr", JSON.stringify(attr));
    return attr;
  }
  const ATTR = getAttribution();

  // Canal normalizado para los contadores (lista cerrada, validada en firestore.rules)
  const CHANNELS = ["google_ads", "meta_ads", "google_organico", "meta_organico", "referido", "directo"];
  const src = String(ATTR.utm_source || "").toLowerCase();
  const CHANNEL = CHANNELS.includes(src) ? src
    : /google|adwords|gads/.test(src) ? "google_ads"
    : /meta|facebook|instagram|fb|ig/.test(src) ? "meta_ads"
    : "otro";

  /* ---------- Métricas anónimas: +1 al contador del día ---------- */
  function track(type) {
    if (!HAS_BACKEND) return;
    const field = `${type === "visit" ? "v" : "w"}_${CHANNEL}`;
    commit([{
      transform: {
        document: `${DB_PATH}/stats_daily/${todayCO()}`,
        fieldTransforms: [{ fieldPath: field, increment: { integerValue: "1" } }],
      },
    }], { keepalive: true }).catch(() => {});
  }
  if (!store.get("sv_visit")) { store.set("sv_visit", "1"); track("visit"); }

  /* ---------- Enlaces de WhatsApp ---------- */
  function waUrl(text) {
    return `https://wa.me/${CFG.WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
  function setupWhatsApp() {
    $$("[data-wa]").forEach((a) => {
      const service = a.dataset.waService;
      const msg = service
        ? `Hola Santévit, quiero información sobre el servicio ${service}.`
        : CFG.WHATSAPP_DEFAULT_MESSAGE || "Hola Santévit, quiero agendar un electrocardiograma.";
      if (HAS_WA) {
        a.href = waUrl(msg);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else {
        a.href = "#contacto"; // sin número: el CTA lleva al formulario
      }
      a.addEventListener("click", () => {
        if (HAS_WA) track("wa_click");
        if (!HAS_WA && service) preselect(service);
      });
    });
  }
  setupWhatsApp();

  /* ---------- Preselección del servicio en el formulario ---------- */
  const SERVICE_MAP = {
    "ECG Express": "express",
    "Chequeo Cardiometabólico": "cardiometabolico",
    "Segunda Opinión": "segunda_opinion",
  };
  function preselect(v) {
    const sel = $("#f-servicio");
    if (sel) sel.value = SERVICE_MAP[v] || v;
  }
  $$("[data-preselect]").forEach((a) => a.addEventListener("click", () => preselect(a.dataset.preselect)));

  /* ======================= FORMULARIO ======================= */
  const form = $("#lead-form");
  if (!form) return;
  const loadedAt = Date.now();
  const submitBtn = $("#lead-submit");
  const statusEl = $("#form-status");

  const phoneInput = $("#f-telefono");
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/[^\d ]/g, "").slice(0, 15);
  });

  function setError(name, msg) {
    const err = $(`[data-error-for="${name}"]`, form);
    const input = form.elements[name];
    if (err) { err.textContent = msg || ""; err.hidden = !msg; }
    if (input && input.setAttribute) {
      if (msg) {
        input.setAttribute("aria-invalid", "true");
        if (err) { err.id = `err-${name}`; input.setAttribute("aria-describedby", err.id); }
      } else {
        input.removeAttribute("aria-invalid");
      }
    }
    return !msg;
  }

  function normalizePhone(raw) {
    let d = String(raw).replace(/\D/g, "");
    if (d.startsWith("57") && d.length === 12) d = d.slice(2);
    return d;
  }

  function validate() {
    const f = form.elements;
    const nombre = clean(f.nombre.value, 100);
    const tel = normalizePhone(f.telefono.value);
    const correo = clean(f.correo.value, 254).toLowerCase();
    const servicio = f.servicio.value;
    let ok = true;

    ok = setError("nombre", /^[\p{L}][\p{L} .'-]{1,99}$/u.test(nombre) ? "" : "Escribe tu nombre (solo letras).") && ok;
    // Celular colombiano (3xx) o fijo nacional (60x), 10 dígitos
    ok = setError("telefono", /^(3\d{9}|60\d{8})$/.test(tel) ? "" : "Escribe un número de 10 dígitos, ej. 300 123 4567.") && ok;
    ok = setError("correo", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) ? "" : "Escribe un correo válido.") && ok;
    ok = setError("servicio", servicio ? "" : "Selecciona un servicio.") && ok;
    ok = setError("consent", f.consent.checked ? "" : "Debes autorizar el tratamiento de datos para continuar.") && ok;

    return ok ? { nombre, telefono: `+57${tel}`, correo, servicio, urgente_48h: f.urgente_48h.value === "si" } : null;
  }

  // Validación al salir del campo, para no molestar mientras escribe
  ["nombre", "telefono", "correo", "servicio"].forEach((n) =>
    form.elements[n].addEventListener("blur", () => { if (form.dataset.tried) validate(); })
  );

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-busy", String(on));
    $("[data-spinner]", submitBtn).hidden = !on;
    $("[data-label]", submitBtn).textContent = on ? "Enviando…" : "Quiero que me contacten";
  }

  function showSuccess(data) {
    form.hidden = true;
    const box = $("#lead-success");
    box.hidden = false;
    if (HAS_WA && data) {
      const label = $(`#f-servicio option[value="${data.servicio}"]`)?.textContent || "";
      $("#success-wa").href = waUrl(`Hola Santévit, soy ${data.nombre}. Acabo de dejar mis datos para: ${label}.`);
    } else if (!HAS_WA) {
      $("#success-wa").hidden = true;
    }
    box.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.dataset.tried = "1";
    statusEl.textContent = "";

    const data = validate();
    if (!data) { $("[aria-invalid='true']", form)?.focus(); return; }

    // Anti-bots: campo trampa lleno o formulario válido enviado en < 3 s → éxito falso
    if (form.elements.website.value || Date.now() - loadedAt < 3000) { showSuccess(null); return; }

    // Límite local: un envío por minuto desde este navegador
    const last = Number(store.get("sv_last_submit", localStorage) || 0);
    if (Date.now() - last < 60000) {
      statusEl.textContent = "Ya recibimos una solicitud hace un momento. Espera un minuto para enviar otra.";
      return;
    }

    setLoading(true);
    try {
      if (HAS_BACKEND) {
        // Lead + marca anti-spam del celular en una sola operación atómica.
        // Las reglas rechazan la operación si ese celular envió hace < 10 min.
        const fields = {
          nombre: data.nombre, telefono: data.telefono, correo: data.correo,
          servicio: data.servicio, urgente_48h: data.urgente_48h, acepta_tratamiento: true,
          consentimiento_version: CFG.CONSENT_VERSION, estado: "nuevo",
        };
        ["utm_source", "utm_medium", "utm_campaign", "referrer", "landing_path"].forEach((k) => { if (ATTR[k]) fields[k] = ATTR[k]; });
        const encoded = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)]));
        try {
          await commit([
            {
              update: { name: `${DB_PATH}/leads/${randomId()}`, fields: encoded },
              currentDocument: { exists: false },
              updateTransforms: [{ fieldPath: "created_at", setToServerValue: "REQUEST_TIME" }],
            },
            {
              update: { name: `${DB_PATH}/throttle/${data.telefono.replace("+", "")}`, fields: {} },
              updateTransforms: [{ fieldPath: "ts", setToServerValue: "REQUEST_TIME" }],
            },
          ]);
        } catch (err) {
          // 403 tras validar en el navegador = ese celular ya envió hace poco: ya lo tenemos
          if (err.status !== 403) throw err;
        }
      } else {
        // MODO DEMO: guarda en este navegador para probar el panel admin
        let list = [];
        try { list = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { list = []; }
        list.push({ id: randomId(), created_at: new Date().toISOString(), estado: "nuevo", ...data, ...ATTR });
        store.set(DEMO_KEY, JSON.stringify(list), localStorage);
      }
      store.set("sv_last_submit", String(Date.now()), localStorage);
      showSuccess(data);
    } catch (err) {
      statusEl.textContent = HAS_WA
        ? "No pudimos enviar tus datos. Intenta de nuevo o escríbenos por WhatsApp."
        : "No pudimos enviar tus datos. Revisa tu conexión e intenta de nuevo.";
    } finally {
      setLoading(false);
    }
  });
})();
