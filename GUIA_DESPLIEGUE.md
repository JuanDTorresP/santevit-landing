# Guía de publicación: igual que el pipeline

**El proceso:** editas en **VS Code**, subes a **GitHub** con *Commit* y *Sync*, y **GitHub Pages** publica la página. Los datos van a **Firebase**, con las reglas pegadas en la consola.
No necesitas terminal, npm ni la herramienta de Firebase (CLI).

```
 VS Code ──Commit + Sync──▶ GitHub ──GitHub Pages──▶ https://juandtorresp.github.io/santevit-landing/
                                                          │
                          Formulario de pacientes ────────┤
                                                          ▼
                              Firebase Firestore ◀──── Panel /admin (login Firebase)
```

La primera vez toma unos **30 minutos**. Costo: **$0**.

---

## PARTE 1: Firebase (una sola vez, todo desde el navegador)

### 1. Crear el proyecto
1. <https://console.firebase.google.com> → **Agregar proyecto** → nombre `santevit-ips`.
   Usa un proyecto **nuevo y separado** del pipeline: aquí van datos de pacientes.
2. Google Analytics: puedes desactivarlo → **Crear proyecto**.

### 2. Registrar la app web
1. En el inicio del proyecto, clic en **`</>`** (Web) → apodo `landing` → **Registrar app**.
2. Copia el bloque `firebaseConfig` que aparece.
3. En VS Code, abre `assets/js/config.js` y pega los valores:
   ```js
   FIREBASE: Object.freeze({
     apiKey: "AIza...",
     authDomain: "santevit-ips.firebaseapp.com",
     projectId: "santevit-ips",
     storageBucket: "santevit-ips.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123",
   }),
   ```
   Estos datos son públicos por diseño, igual que en el pipeline. La seguridad la dan las reglas.

### 3. Crear la base de datos
1. **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **`southamerica-east1 (São Paulo)`**. No se puede cambiar después.
3. Modo **Producción** → **Crear**.

### 4. Pegar las reglas de seguridad
1. Firestore → pestaña **Reglas**.
2. Borra lo que hay, copia **todo** el archivo `firestore.rules` (desde VS Code) y pégalo.
3. **Publicar**.

### 5. Login del panel y usuario administrador
1. **Compilación → Authentication → Comenzar** → **Correo electrónico/contraseña** → Habilitar → Guardar.
2. Pestaña **Configuración**:
   - **Acciones del usuario** → **desmarca "Habilitar creación (registro)"**, para que nadie pueda crearse una cuenta.
   - **Dominios autorizados** → **Agregar dominio** → `juandtorresp.github.io`
3. Pestaña **Usuarios → Agregar usuario** → correo y contraseña fuerte (12 caracteres o más) → copia el **UID**.
4. **Firestore → Datos → + Iniciar colección**:
   - ID de colección: `admins`
   - ID del documento: **el UID copiado**
   - Campo `email` (string) = el correo → **Guardar**.

Repite 3–4 por cada persona del equipo que deba entrar al panel.

---

## PARTE 2: GitHub + VS Code (igual que el pipeline)

### 6. Subir el proyecto
1. Descomprime el zip y abre la carpeta `santevit` en **VS Code** (*Archivo → Abrir carpeta*).
2. Panel **Control de código fuente** (ícono de ramas, `Ctrl+Shift+G`) → **Publish to GitHub**.
3. Elige **Publish to GitHub public repository** y nómbralo `santevit-landing`.
   > Con cuenta gratuita de GitHub, Pages solo funciona en repositorios **públicos**. No hay riesgo: el código no tiene contraseñas y la seguridad está en las reglas de Firebase.

### 7. Activar GitHub Pages
1. En github.com, abre el repositorio → **Settings → Pages**.
2. *Source*: **Deploy from a branch** → rama **`main`**, carpeta **`/ (root)`** → **Save**.
3. Espera 1–2 minutos. La página queda en:
   - Landing: `https://juandtorresp.github.io/santevit-landing/`
   - Panel: `https://juandtorresp.github.io/santevit-landing/admin/`

**Listo.** Desde aquí, cada cambio es: editar en VS Code → **Commit** → **Sync Changes**, y en 1 minuto está publicado.

---

## PARTE 3: Ajustes recomendados (15 min, antes de pautar)

### 8. Restringir la API key a tu página
1. <https://console.cloud.google.com> → proyecto `santevit-ips` → **APIs y servicios → Credenciales**.
2. Abre **"Browser key (auto created by Firebase)"** → **Restricciones de aplicaciones: Sitios web** → agrega:
   `https://juandtorresp.github.io/*` (y tu dominio propio si lo usas) → **Guardar**.

### 9. Antibots: App Check (opcional, muy recomendado con Ads)
1. <https://www.google.com/recaptcha/admin/create> → **reCAPTCHA v3** → dominio `juandtorresp.github.io` → copia la **clave de sitio** y la **clave secreta**.
2. Firebase → **App Check → Apps** → tu app web → **reCAPTCHA** → pega la **clave secreta**.
3. En `config.js` → `RECAPTCHA_SITE_KEY: "6Lc..."` → Commit + Sync.
4. A los 1–2 días, en App Check → **APIs → Cloud Firestore → Aplicar (Enforce)**.

### 10. Número de WhatsApp (cuando lo tengan)
En `config.js` → `WHATSAPP_NUMBER: "573001234567"` (solo dígitos, con el 57) → Commit + Sync.

### 11. Dominio propio (opcional)
GitHub → **Settings → Pages → Custom domain** (ej. `ecg.santevit.com`) → crea el registro CNAME que indica GitHub en tu proveedor de dominio → marca **Enforce HTTPS**.
Agrega el dominio también en Firebase (Dominios autorizados, paso 5) y en la API key (paso 8).

---

## Comprobación final

| Prueba | Resultado esperado |
|---|---|
| Abrir la landing en el celular | Sin la franja amarilla de "Modo demo" |
| Enviar el formulario | "¡Recibimos tus datos!" y aparece en Firestore → `leads` |
| Reenviar con el mismo celular antes de 10 min | No se crea un duplicado |
| Entrar a `/admin/` con el usuario admin | Ves el lead, la visita y el canal |
| Entrar con un usuario que no esté en `admins` | "Tu usuario no tiene permisos de administrador" |

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Sigue saliendo "Modo demo" | Falta `apiKey` o `projectId` en `config.js`, o no hiciste Sync. |
| "No pudimos enviar tus datos" | Las reglas no se publicaron (paso 4) o la API key está restringida a otro dominio (paso 8). |
| El panel no deja entrar | Falta `juandtorresp.github.io` en Dominios autorizados (paso 5.2) o el usuario no existe. |
| "No tiene permisos de administrador" | El ID del documento en `admins` debe ser exactamente el UID. |
| Cambié algo y no se ve | Espera 1–2 min y recarga con `Ctrl+F5`. En GitHub → pestaña **Actions** ves si terminó de publicar. |

> La carpeta `_desarrollo/` es opcional: solo se usa si cambias estilos de Tailwind o actualizas el SDK. GitHub Pages no la publica.
