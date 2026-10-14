/** Tailwind — paleta del Portafolio Corporativo 2026 (línea del PPT) + Manual de Marca */
module.exports = {
  content: ["../index.html", "../privacidad.html", "../admin/*.html", "../assets/js/*.js"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#00263A",   // Pantone 539 C — títulos, botones principales, fondos oscuros
          sky: "#5EB3E4",    // Pantone 2915 C — acentos y líneas
          blue: "#2E8FCB",   // azul de acción (paso validado de contraste)
          ice: "#EEF7FC",    // fondo de tarjetas del portafolio
          line: "#BFDDF0",   // bordes suaves
          slate: "#4A6A7E",  // texto secundario
          mint: "#3BD4AE",   // Pantone 3385 C — complementario
          orange: "#E04403", // Pantone 1665 C — uso puntual
        },
        wa: { DEFAULT: "#25D366", dark: "#128C7E" },
      },
      fontFamily: {
        display: ['"Montserrat Alternates"', "system-ui", "sans-serif"],
        body: ['"Josefin Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,38,58,.04), 0 12px 32px -16px rgba(0,38,58,.18)",
        lift: "0 24px 48px -20px rgba(0,38,58,.35)",
      },
    },
  },
  plugins: [],
};
