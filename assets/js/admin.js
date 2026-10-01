/* ==========================================================================
   SANTÉVIT IPS — PANEL ADMIN (back comercial)
   - Login con Firebase Auth (sesión en sessionStorage: se cierra con la pestaña)
   - Verificación de rol admin + cierre por inactividad
   - KPIs, gráfica de crecimiento, leads por servicio, rendimiento por canal
   - Gestión de leads: estado, notas, borrado (supresión Ley 1581), CSV
   Todo el contenido se pinta con textContent (nunca innerHTML) → sin XSS.
   ========================================================================== */
(function () {
  "use strict";

  // Anti-clickjacking: GitHub Pages no permite la cabecera X-Frame-Options,
  // así que el panel se niega a funcionar si alguien lo mete dentro de un iframe.
  if (window.top !== window.self) {
    document.documentElement.replaceChildren();
    try { window.top.location = window.self.location.href; } catch { /* bloqueado */ }
    return;
  }

  const CFG = window.SANTEVIT_CONFIG || {};
  const FBCFG = CFG.FIREBASE || {};
  const DEMO = !(FBCFG.apiKey && FBCFG.projectId);
  const TZ = "America/Bogota";
  const PAGE_SIZE = 25;

  const SERVICES = {
    express: "ECG Express",
    cardiometabolico: "Cardiometabólico",
    segunda_opinion: "Segunda Opinión",
    equipos_comen: "Equipos Comen (B2B)",
    no_seguro: "Necesita orientación",
  };
  const ESTADOS = ["nuevo", "contactado", "agendado", "atendido", "descartado"];
  const COLOR_LEADS = "#2E8FCB"; // azul marca (paso validado para gráficas)
  const COLOR_WA = "#E04403";    // naranja marca

  /* ---------- Utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, props = {}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.flat().forEach((c) => c != null && n.append(c));
    return n;
  };
  const fmt = new Intl.NumberFormat("es-CO");
  const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD en Bogotá
  const addDays = (s, n) => { const d = new Date(`${s}T12:00:00-05:00`); d.setDate(d.getDate() + n); return ymd(d); };
  const dateTimeCO = (iso) => new Date(iso).toLocaleString("es-CO", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("opacity-0");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("opacity-0"), 2600);
  }

  /* ======================= CAPA DE DATOS ======================= */
  const CHANNELS = ["google_ads", "meta_ads", "google_organico", "meta_organico", "referido", "directo", "otro"];
  const channelOf = (src) => {
    const s = String(src || "directo").toLowerCase();
    return CHANNELS.includes(s) ? s : /google|adwords|gads/.test(s) ? "google_ads" : /meta|facebook|instagram|fb|ig/.test(s) ? "meta_ads" : "otro";
  };

  // Convierte contadores diarios (v_canal / w_canal) + leads → series diarias y por canal
  function buildDaily(from, to, stats, leads) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, visits: 0, wa_clicks: 0, leads: 0 });
    const idx = Object.fromEntries(out.map((r, i) => [r.day, i]));
    stats.forEach((st) => {
      if (!(st.day in idx)) return;
      Object.entries(st).forEach(([k, v]) => {
        if (k.startsWith("v_")) out[idx[st.day]].visits += Number(v) || 0;
        if (k.startsWith("w_")) out[idx[st.day]].wa_clicks += Number(v) || 0;
      });
    });
    leads.forEach((l) => { const d = ymd(new Date(l.created_at)); if (d in idx) out[idx[d]].leads++; });
    return out;
  }
  function buildSources(stats, leads) {
    const m = {};
    const row = (c) => (m[c] ||= { source: c, visits: 0, wa_clicks: 0, leads: 0 });
    stats.forEach((st) => Object.entries(st).forEach(([k, v]) => {
      if (k.startsWith("v_")) row(k.slice(2)).visits += Number(v) || 0;
      if (k.startsWith("w_")) row(k.slice(2)).wa_clicks += Number(v) || 0;
    }));
    leads.forEach((l) => row(channelOf(l.utm_source)).leads++);
    return Object.values(m).sort((a, b) => b.leads - a.leads || b.visits - a.visits);
  }

  let api;
  if (DEMO) {
    api = demoApi();
  } else {
    const F = window.SantevitFirebase;
    const app = F.initializeApp(FBCFG);
    if (CFG.RECAPTCHA_SITE_KEY) {
      try { F.initializeAppCheck(app, { provider: new F.ReCaptchaV3Provider(CFG.RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch { /* sin App Check */ }
    }
    const auth = F.getAuth(app);
    const db = F.initializeFirestore(app, {});
    const authReady = F.setPersistence(auth, F.browserSessionPersistence).then(() =>
      new Promise((res) => { const off = F.onAuthStateChanged(auth, (u) => { off(); res(u); }); }));
    const startOf = (d) => F.Timestamp.fromDate(new Date(`${d}T00:00:00-05:00`));
    const cache = new Map(); // evita leer dos veces el mismo rango en una carga

    async function fetchLeads(from, to) {
      const q = F.query(F.collection(db, "leads"),
        F.where("created_at", ">=", startOf(from)), F.where("created_at", "<", startOf(addDays(to, 1))),
        F.orderBy("created_at", "desc"), F.limit(10000));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => {
        const x = d.data();
        return { id: d.id, ...x, created_at: x.created_at?.toDate().toISOString() || new Date().toISOString() };
      });
    }
    async function fetchStats(from, to) {
      const q = F.query(F.collection(db, "stats_daily"), F.where(F.documentId(), ">=", from), F.where(F.documentId(), "<=", to));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => ({ day: d.id, ...d.data() }));
    }
    const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

    api = {
      async login(email, password) { await authReady; await F.signInWithEmailAndPassword(auth, email, password); },
      async session() { await authReady; return auth.currentUser ? { user: auth.currentUser } : null; },
      async isAdmin() {
        const u = auth.currentUser;
        if (!u) return false;
        return (await F.getDoc(F.doc(db, "admins", u.uid))).exists();
      },
      logout: () => F.signOut(auth),
      resetCache: () => cache.clear(),
      leads: (from, to) => memo(`l|${from}|${to}`, () => fetchLeads(from, to)),
      async daily(from, to) {
        const [st, ld] = await Promise.all([memo(`s|${from}|${to}`, () => fetchStats(from, to)), api.leads(from, to)]);
        return buildDaily(from, to, st, ld);
      },
      async sources(from, to) {
        const [st, ld] = await Promise.all([memo(`s|${from}|${to}`, () => fetchStats(from, to)), api.leads(from, to)]);
        return buildSources(st, ld);
      },
      // Cambio + registro en bitácora en una sola operación atómica
      async update(id, patch, prev) {
        const b = F.writeBatch(db);
        b.update(F.doc(db, "leads", id), { ...patch, updated_at: F.serverTimestamp(), updated_by: auth.currentUser.uid });
        b.set(F.doc(F.collection(db, "audit")), {
          lead_id: id, actor: auth.currentUser.uid, action: "update",
          old_estado: prev?.estado || null, new_estado: patch.estado || prev?.estado || null, at: F.serverTimestamp(),
        });
        await b.commit();
      },
      async remove(id, prev) {
        const b = F.writeBatch(db);
        b.delete(F.doc(db, "leads", id));
        b.set(F.doc(F.collection(db, "audit")), {
          lead_id: id, actor: auth.currentUser.uid, action: "delete",
          old_estado: prev?.estado || null, new_estado: null, at: F.serverTimestamp(),
        });
        await b.commit();
      },
    };
  }

  /* ---------- Modo demo: datos de ejemplo + leads de este navegador ---------- */
  function demoApi() {
    const NAMES = ["Laura Gómez", "Carlos Rodríguez", "Andrea Martínez", "Jorge Ramírez", "Paola Castro", "Luis Hernández", "Diana Torres", "Felipe Rojas", "Camila Vargas", "Andrés Moreno", "Natalia Díaz", "Sergio Pardo"];
    const SRC = ["google_ads", "google_ads", "meta_ads", "meta_ads", "google_organico", "directo", "referido"];
    const SERV = ["express", "express", "express", "cardiometabolico", "cardiometabolico", "segunda_opinion", "equipos_comen", "no_seguro"];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const today = ymd(new Date());
    const leads = [], stats = [];
    for (let i = 365; i >= 0; i--) {
      const day = addDays(today, -i);
      const growth = 1 + (365 - i) / 120; // tendencia creciente
      const visits = Math.round((20 + rnd() * 25) * growth);
      const st = { day };
      for (let v = 0; v < visits; v++) { const k = `v_${SRC[Math.floor(rnd() * SRC.length)]}`; st[k] = (st[k] || 0) + 1; }
      const wa = Math.round(visits * (0.08 + rnd() * 0.05));
      for (let w = 0; w < wa; w++) { const k = `w_${SRC[Math.floor(rnd() * SRC.length)]}`; st[k] = (st[k] || 0) + 1; }
      stats.push(st);
      const n = Math.round(visits * (0.03 + rnd() * 0.03));
      for (let k = 0; k < n; k++) {
        const name = NAMES[Math.floor(rnd() * NAMES.length)];
        const ts = Math.min(Date.now() - 60000, new Date(`${day}T${String(8 + Math.floor(rnd() * 11)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00-05:00`).getTime());
        leads.push({
          id: `demo-${i}-${k}`, created_at: new Date(ts).toISOString(),
          nombre: name, telefono: `+573${String(Math.floor(rnd() * 1e9)).padStart(9, "0")}`,
          correo: `${name.split(" ")[0].toLowerCase()}${k}@ejemplo.com`,
          servicio: SERV[Math.floor(rnd() * SERV.length)], urgente_48h: rnd() < 0.3,
          utm_source: SRC[Math.floor(rnd() * SRC.length)],
          estado: i > 7 ? ESTADOS[1 + Math.floor(rnd() * 4)] : (rnd() < 0.6 ? "nuevo" : "contactado"), notas: null,
        });
      }
    }
    try { JSON.parse(localStorage.getItem("santevit_demo_leads") || "[]").forEach((l) => leads.push(l)); } catch { /* nada */ }
    const inRange = (d, f, t) => d >= f && d <= t;
    return {
      async login() {}, async session() { return { user: { email: "demo@santevit.com" } }; },
      async isAdmin() { return true; }, async logout() {},
      async leads(f, t) { return leads.filter((l) => inRange(ymd(new Date(l.created_at)), f, t)).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async daily(f, t) { return buildDaily(f, t, stats.filter((x) => inRange(x.day, f, t)), await this.leads(f, t)); },
      async sources(f, t) { return buildSources(stats.filter((x) => inRange(x.day, f, t)), await this.leads(f, t)); },
      async update(id, patch) { Object.assign(leads.find((l) => l.id === id) || {}, patch); },
      async remove(id) { const i = leads.findIndex((l) => l.id === id); if (i >= 0) leads.splice(i, 1); },
    };
  }

  /* ======================= AUTENTICACIÓN ======================= */
  const loginForm = $("#login-form");
  const loginErr = $("#login-error");
  let failed = 0, lockedUntil = 0;

  if (DEMO) {
    $("#login-fields").hidden = true;
    $("#demo-login-note").hidden = false;
    $("#login-btn").textContent = "Entrar al demo";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.textContent = "";
    if (Date.now() < lockedUntil) {
      loginErr.textContent = `Demasiados intentos. Espera ${Math.ceil((lockedUntil - Date.now()) / 1000)} s.`;
      return;
    }
    const email = $("#l-email").value.trim().toLowerCase();
    const pass = $("#l-pass").value;
    if (!DEMO && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pass.length < 8)) {
      loginErr.textContent = "Correo o contraseña incorrectos.";
      return;
    }
    const btn = $("#login-btn");
    btn.disabled = true;
    try {
      await api.login(email, pass);
      $("#l-pass").value = "";
      failed = 0;
      await enter();
    } catch {
      failed++;
      if (failed >= 5) { lockedUntil = Date.now() + 60000 * Math.min(failed - 4, 10); }
      loginErr.textContent = "Correo o contraseña incorrectos."; // mensaje genérico
    } finally {
      btn.disabled = false;
    }
  });

  async function enter() {
    const s = await api.session();
    if (!s) return showLogin();
    let ok = false;
    try { ok = await api.isAdmin(); } catch { ok = false; }
    if (!ok) {
      await api.logout();
      showLogin("Tu usuario no tiene permisos de administrador.");
      return;
    }
    $("#user-email").textContent = s.user?.email || "";
    $("#view-login").hidden = true;
    $("#view-app").hidden = false;
    $("#demo-pill").hidden = !DEMO;
    startIdleTimer();
    load();
  }

  function showLogin(msg) {
    $("#view-app").hidden = true;
    $("#view-login").hidden = false;
    loginErr.textContent = msg || "";
  }

  async function logout(msg) {
    try { await api.logout(); } catch { /* nada */ }
    state.leads = [];
    $("#leads-body").replaceChildren();
    showLogin(msg);
  }
  $("#logout-btn").addEventListener("click", () => logout());

  // Cierre automático por inactividad
  let idleT;
  function startIdleTimer() {
    const mins = Number(CFG.ADMIN_IDLE_MINUTES) || 30;
    const reset = () => { clearTimeout(idleT); idleT = setTimeout(() => logout("Sesión cerrada por inactividad."), mins * 60000); };
    ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  /* ======================= ESTADO Y CARGA ======================= */
  const state = { range: 30, bucket: "day", cumulative: false, leads: [], daily: [], page: 0 };
  let charts = {};

  function setActive(groupSel, attr, value) {
    $$(`${groupSel} button`).forEach((b) => {
      const on = b.dataset[attr] === String(value);
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("bg-brand-navy", on);
      b.classList.toggle("text-white", on);
    });
  }

  $$("#range-group button").forEach((b) => b.addEventListener("click", () => {
    state.range = Number(b.dataset.range);
    if (state.range >= 90 && state.bucket === "day") state.bucket = "week";
    if (state.range <= 30 && state.bucket === "month") state.bucket = "day";
    load();
  }));
  $$("#bucket-group button").forEach((b) => b.addEventListener("click", () => { state.bucket = b.dataset.bucket; renderGrowth(); }));
  $("#cumulative").addEventListener("change", (e) => { state.cumulative = e.target.checked; renderGrowth(); });
  $("#refresh-btn").addEventListener("click", () => load());

  async function load() {
    setActive("#range-group", "range", state.range);
    setActive("#bucket-group", "bucket", state.bucket);
    const to = ymd(new Date());
    const from = addDays(to, -(state.range - 1));
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(state.range - 1));
    api.resetCache?.();
    try {
      const [leads, daily, prevDaily, sources] = await Promise.all([
        api.leads(from, to), api.daily(from, to), api.daily(prevFrom, prevTo), api.sources(from, to),
      ]);
      state.leads = leads;
      state.daily = daily;
      state.page = 0;
      renderKpis(daily, prevDaily, leads);
      renderGrowth();
      renderServices(leads);
      renderSources(sources);
      renderTable();
      $("#last-update").textContent = `Actualizado ${new Date().toLocaleTimeString("es-CO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
    } catch (err) {
      if (String(err?.code || err?.message || "").match(/permission|unauthenticated/i)) return logout("Tu sesión expiró. Ingresa de nuevo.");
      toast("No se pudieron cargar los datos.");
    }
  }

  /* ======================= KPIs ======================= */
  function sum(rows, k) { return rows.reduce((a, r) => a + Number(r[k] || 0), 0); }
  function delta(elId, now, prev) {
    const node = $(elId);
    if (!prev) { node.textContent = now ? "Nuevo periodo con datos" : "Sin datos previos"; node.className = "mt-1 text-xs font-semibold text-brand-navy/50"; return; }
    const pct = Math.round(((now - prev) / prev) * 100);
    node.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)} % vs periodo anterior`;
    node.className = `mt-1 text-xs font-semibold ${pct >= 0 ? "text-emerald-700" : "text-red-700"}`;
  }
  function renderKpis(daily, prev, leads) {
    const L = sum(daily, "leads"), V = sum(daily, "visits"), W = sum(daily, "wa_clicks");
    $("#kpi-leads").textContent = fmt.format(L);
    $("#kpi-visits").textContent = fmt.format(V);
    $("#kpi-wa").textContent = fmt.format(W);
    $("#kpi-conv").textContent = V ? `${((L + W) / V * 100).toFixed(1)} %` : "–";
    delta("#kpi-leads-delta", L, sum(prev, "leads"));
    delta("#kpi-visits-delta", V, sum(prev, "visits"));
    delta("#kpi-wa-delta", W, sum(prev, "wa_clicks"));
    $("#kpi-urgent").textContent = fmt.format(leads.filter((l) => l.urgente_48h && l.estado === "nuevo").length);
  }

  /* ======================= GRÁFICAS ======================= */
  if (window.Chart) {
    Chart.defaults.font.family = '"Josefin Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = "#4b5d69";
  }
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function bucketKey(day, b) {
    if (b === "day") return day;
    if (b === "month") return day.slice(0, 7);
    const d = new Date(`${day}T12:00:00-05:00`);
    const dow = (d.getDay() + 6) % 7; // lunes = 0
    return addDays(day, -dow);
  }
  function bucketLabel(key, b) {
    if (b === "month") { const [y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; }
    const [, m, d] = key.split("-");
    return `${b === "week" ? "Sem " : ""}${Number(d)} ${MONTHS[Number(m) - 1]}`;
  }

  function renderGrowth() {
    setActive("#bucket-group", "bucket", state.bucket);
    if (!window.Chart) return;
    const groups = new Map();
    state.daily.forEach((r) => {
      const k = bucketKey(typeof r.day === "string" ? r.day.slice(0, 10) : ymd(new Date(r.day)), state.bucket);
      const g = groups.get(k) || { leads: 0, wa: 0 };
      g.leads += Number(r.leads); g.wa += Number(r.wa_clicks);
      groups.set(k, g);
    });
    const keys = [...groups.keys()].sort();
    let leads = keys.map((k) => groups.get(k).leads);
    let wa = keys.map((k) => groups.get(k).wa);
    if (state.cumulative) {
      const acc = (arr) => arr.reduce((o, v, i) => (o.push(v + (o[i - 1] || 0)), o), []);
      leads = acc(leads); wa = acc(wa);
    }
    const type = state.cumulative ? "line" : "bar";
    const ds = (label, data, color) => ({
      label, data, backgroundColor: color, borderColor: color,
      borderWidth: type === "line" ? 2 : 0, borderRadius: 4, borderSkipped: "start",
      pointRadius: 0, pointHoverRadius: 5, tension: 0.25, maxBarThickness: 28,
    });
    charts.growth?.destroy();
    charts.growth = new Chart($("#chart-growth"), {
      type,
      data: { labels: keys.map((k) => bucketLabel(k, state.bucket)), datasets: [ds("Leads (formulario)", leads, COLOR_LEADS), ds("Clics a WhatsApp", wa, COLOR_WA)] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } },
          tooltip: { backgroundColor: "#00263A", padding: 10, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.format(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { beginAtZero: true, grid: { color: "rgba(0,38,58,.06)" }, border: { display: false }, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderServices(leads) {
    if (!window.Chart) return;
    const counts = Object.keys(SERVICES).map((k) => leads.filter((l) => l.servicio === k).length);
    charts.services?.destroy();
    charts.services = new Chart($("#chart-services"), {
      type: "bar",
      data: { labels: Object.values(SERVICES), datasets: [{ label: "Leads", data: counts, backgroundColor: COLOR_LEADS, borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#00263A", callbacks: { label: (c) => ` ${fmt.format(c.parsed.x)} leads` } } },
        scales: { x: { beginAtZero: true, grid: { color: "rgba(0,38,58,.06)" }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false } } },
      },
    });
  }

  /* ======================= TABLA DE CANALES ======================= */
  const SOURCE_LABELS = { google_ads: "Google Ads", meta_ads: "Meta Ads", google_organico: "Google orgánico", meta_organico: "Meta orgánico", directo: "Directo", referido: "Otros sitios", otro: "Otras campañas" };
  function renderSources(rows) {
    const body = $("#sources-body");
    body.replaceChildren();
    if (!rows.length) { body.append(el("tr", {}, el("td", { class: "py-3 text-brand-navy/50", colspan: "5", text: "Sin datos en este periodo." }))); return; }
    rows.forEach((r) => {
      const v = Number(r.visits), conv = v ? `${((Number(r.leads) + Number(r.wa_clicks)) / v * 100).toFixed(1)} %` : "–";
      body.append(el("tr", {},
        el("td", { class: "py-2 pr-4 font-semibold", text: SOURCE_LABELS[r.source] || r.source }),
        el("td", { class: "py-2 pr-4 text-right tabular-nums", text: fmt.format(v) }),
        el("td", { class: "py-2 pr-4 text-right tabular-nums", text: fmt.format(r.wa_clicks) }),
        el("td", { class: "py-2 pr-4 text-right tabular-nums", text: fmt.format(r.leads) }),
        el("td", { class: "py-2 text-right tabular-nums", text: conv }),
      ));
    });
  }

  /* ======================= TABLA DE LEADS ======================= */
  const servSel = $("#f-serv");
  Object.entries(SERVICES).forEach(([k, v]) => servSel.append(el("option", { value: k, text: v })));
  ["#q", "#f-estado", "#f-serv"].forEach((s) => $(s).addEventListener("input", () => { state.page = 0; renderTable(); }));
  $("#prev-page").addEventListener("click", () => { state.page--; renderTable(); });
  $("#next-page").addEventListener("click", () => { state.page++; renderTable(); });

  function filtered() {
    const q = $("#q").value.trim().toLowerCase();
    const est = $("#f-estado").value, serv = $("#f-serv").value;
    return state.leads.filter((l) =>
      (!est || l.estado === est) && (!serv || l.servicio === serv) &&
      (!q || `${l.nombre} ${l.telefono} ${l.correo}`.toLowerCase().includes(q)));
  }

  function renderTable() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(Math.max(0, state.page), pages - 1);
    const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
    $("#leads-count").textContent = `${fmt.format(rows.length)} personas en el periodo`;
    $("#page-info").textContent = `Página ${state.page + 1} de ${pages}`;
    $("#prev-page").disabled = state.page === 0;
    $("#next-page").disabled = state.page >= pages - 1;

    const body = $("#leads-body");
    body.replaceChildren();
    if (!slice.length) { body.append(el("tr", {}, el("td", { class: "py-4 text-brand-navy/50", colspan: "8", text: "No hay registros con estos filtros." }))); return; }

    slice.forEach((l) => {
      const phoneDigits = String(l.telefono || "").replace(/\D/g, "");
      const estado = el("select", { class: "rounded-lg border border-brand-navy/20 px-2 py-1 text-sm", "aria-label": `Estado de ${l.nombre}` },
        ESTADOS.map((s) => { const o = el("option", { value: s, text: s[0].toUpperCase() + s.slice(1) }); if (s === l.estado) o.selected = true; return o; }));
      estado.addEventListener("change", async () => {
        const prev = l.estado;
        try { await api.update(l.id, { estado: estado.value }, { estado: prev }); l.estado = estado.value; toast("Estado actualizado");
          $("#kpi-urgent").textContent = fmt.format(state.leads.filter((x) => x.urgente_48h && x.estado === "nuevo").length);
          renderTable(); }
        catch { estado.value = prev; toast("No se pudo actualizar."); }
      });

      body.append(el("tr", { class: l.urgente_48h && l.estado === "nuevo" ? "bg-orange-50" : "" },
        el("td", { class: "whitespace-nowrap py-2 pr-3 text-brand-navy/70", text: dateTimeCO(l.created_at) }),
        el("td", { class: "py-2 pr-3 font-semibold", text: l.nombre }),
        el("td", { class: "py-2 pr-3" },
          el("a", { href: `https://wa.me/${phoneDigits}`, target: "_blank", rel: "noopener noreferrer", class: "block font-semibold text-wa-dark hover:underline", text: l.telefono }),
          el("a", { href: `mailto:${encodeURIComponent(l.correo).replace(/%40/g, "@")}`, class: "block text-xs text-brand-navy/60 hover:underline", text: l.correo })),
        el("td", { class: "py-2 pr-3", text: SERVICES[l.servicio] || l.servicio }),
        el("td", { class: "py-2 pr-3" }, l.urgente_48h ? el("span", { class: "rounded-full bg-brand-orange/15 px-2 py-0.5 text-xs font-bold text-[#a33102]", text: "Sí" }) : el("span", { class: "text-brand-navy/40", text: "No" })),
        el("td", { class: "py-2 pr-3 text-brand-navy/70", text: SOURCE_LABELS[l.utm_source] || l.utm_source || "Directo" }),
        el("td", { class: "py-2 pr-3" }, estado),
        el("td", { class: "whitespace-nowrap py-2" },
          el("button", { type: "button", class: "mr-2 text-sm font-semibold text-brand-sky hover:underline", text: l.notas ? "Notas ●" : "Notas", onclick: () => openNotes(l) }),
          el("button", { type: "button", class: "text-sm font-semibold text-red-700 hover:underline", text: "Eliminar", onclick: () => removeLead(l) })),
      ));
    });
  }

  // Notas de seguimiento
  const dlg = $("#notes-dialog");
  let editing = null;
  function openNotes(l) {
    editing = l;
    $("#notes-who").textContent = `${l.nombre} · ${l.telefono}`;
    $("#notes-text").value = l.notas || "";
    dlg.showModal();
  }
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "save" || !editing) return;
    const notas = $("#notes-text").value.slice(0, 2000);
    try { await api.update(editing.id, { notas }, editing); editing.notas = notas; renderTable(); toast("Notas guardadas"); }
    catch { toast("No se pudieron guardar las notas."); }
  });

  // Supresión de datos (derecho del titular, Ley 1581) — doble confirmación con el nombre
  const confirmDialog = el("dialog", { class: "w-[min(92vw,420px)] rounded-3xl p-0 backdrop:bg-brand-navy/50" });
  document.body.append(confirmDialog);
  function removeLead(l) {
    const input = el("input", { class: "field mt-3", "aria-label": "Escribe ELIMINAR para confirmar", autocomplete: "off" });
    const ok = el("button", { value: "ok", class: "rounded-full bg-red-700 px-5 py-2 font-semibold text-white" , text: "Eliminar" });
    confirmDialog.replaceChildren(el("form", { method: "dialog", class: "p-6" },
      el("h3", { class: "text-lg font-bold", text: "Eliminar registro" }),
      el("p", { class: "mt-1 text-sm text-brand-navy/70", text: `Se borrarán los datos de ${l.nombre} de forma permanente. Escribe ELIMINAR para confirmar.` }),
      input,
      el("div", { class: "mt-4 flex justify-end gap-2" },
        el("button", { value: "cancel", class: "rounded-full px-4 py-2 font-semibold ring-1 ring-brand-navy/15", text: "Cancelar" }), ok)));
    confirmDialog.onclose = async () => {
      if (confirmDialog.returnValue !== "ok" || input.value.trim().toUpperCase() !== "ELIMINAR") return;
      try { await api.remove(l.id, l); state.leads = state.leads.filter((x) => x.id !== l.id); renderTable(); toast("Registro eliminado"); }
      catch { toast("No se pudo eliminar."); }
    };
    confirmDialog.showModal();
  }

  /* ---------- Exportar CSV (protegido contra inyección de fórmulas) ---------- */
  $("#export-btn").addEventListener("click", () => {
    const safe = (v) => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const head = ["Fecha", "Nombre", "Celular", "Correo", "Servicio", "Prioritario 48h", "Canal", "Campaña", "Estado", "Notas"];
    const lines = filtered().map((l) => [dateTimeCO(l.created_at), l.nombre, l.telefono, l.correo, SERVICES[l.servicio] || l.servicio,
      l.urgente_48h ? "Sí" : "No", SOURCE_LABELS[l.utm_source] || l.utm_source || "", l.utm_campaign || "", l.estado, l.notas || ""].map(safe).join(";"));
    const blob = new Blob(["﻿" + [head.map(safe).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `leads-santevit-${ymd(new Date())}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------- Arranque ---------- */
  if (!DEMO) enter();
})();
