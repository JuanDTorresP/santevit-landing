/* App Check para la LANDING (solo se carga si config.js tiene RECAPTCHA_SITE_KEY).
   La landing escribe en Firestore por REST, sin el SDK completo, para cargar rápido. */
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";

window.SantevitAppCheck = {
  init(firebaseConfig, siteKey) {
    const app = initializeApp(firebaseConfig);
    const ac = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    return async () => (await getToken(ac, false)).token;
  },
};
