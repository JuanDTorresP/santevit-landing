# Santévit IPS: landing ECG + panel comercial

Landing de alta conversión para pacientes en Bogotá y panel privado para ver quién consulta y cómo crece el tráfico.
Mismo esquema que el pipeline: **VS Code → GitHub Pages**, datos en **Firebase**.

👉 **Cómo publicar: [GUIA_DESPLIEGUE.md](GUIA_DESPLIEGUE.md)**

```
├── index.html            Landing pública
├── privacidad.html       Política de Tratamiento de Datos (Ley 1581): revisar con jurídico
├── admin/index.html      Panel comercial (login Firebase, no indexado)
├── assets/
│   ├── js/config.js      ⭐ ÚNICO archivo a editar (Firebase, WhatsApp, datos institucionales)
│   ├── js/main.js        Landing: formulario, WhatsApp, métricas
│   ├── js/admin.js       Panel: KPIs, gráficas, gestión de leads, CSV
│   ├── css/styles.css    Estilos ya compilados
│   └── vendor/           Firebase y Chart.js (servidos desde la misma página)
├── firestore.rules       🔒 Reglas: copiar y pegar en Firebase → Firestore → Reglas
└── _desarrollo/          Opcional (recompilar estilos, probar reglas). No se publica.
```

**Probar sin configurar nada:** abre `index.html` con *Live Server* de VS Code. Sin Firebase configurado, todo funciona en **modo demo** con datos de ejemplo.

## Datos en Firestore

| Colección | Contenido | Quién puede |
|---|---|---|
| `leads` | Nombre, celular, correo, servicio, prioridad 48 h, canal, estado, notas | Público: solo **crear** (validado). Admin: leer, cambiar estado/notas, borrar |
| `throttle` | Control anti-spam por celular (10 min) | Nadie lo lee |
| `stats_daily` | Visitas (`v_canal`) y clics WhatsApp (`w_canal`) por día | Público: solo **+1**. Admin: leer |
| `admins` | UID de quienes entran al panel | Se crean a mano en la consola |
| `audit` | Bitácora de cambios y borrados | Solo se agrega, nadie edita ni borra |

## Seguridad

- **Reglas Firestore:** cerrado por defecto. El público no lee nada y solo crea leads válidos (celular +57, correo, sin HTML, fecha del servidor, sin campos extra), con un máximo de 1 lead por celular cada 10 minutos.
- **Panel:** solo usuarios en `admins`, con el registro público desactivado. Solo se pueden editar estado y notas, cada cambio queda en la bitácora y la sesión se cierra al cerrar la pestaña o tras 30 minutos sin uso.
- **Página:** CSP estricta, sin scripts de terceros, protección anti-iframe en el panel, pintado sin `innerHTML` y CSV protegido contra fórmulas.
- **Antibots:** honeypot, trampa de tiempo, límite por navegador y **App Check** (reCAPTCHA v3) opcional.
- **Habeas data:** autorización obligatoria (Ley 1581/2012), versión del consentimiento guardada con cada lead y botón de supresión en el panel.

## Pendientes de contenido

- [ ] Logo oficial en SVG · foto del Comen H12 · fotos de la sede
- [ ] Código REPS, NIT, dirección y correo en `config.js` y `privacidad.html`
- [ ] Revisión jurídica de `privacidad.html` y de los exámenes del plan Cardiometabólico
- [ ] Número de WhatsApp Concierge
