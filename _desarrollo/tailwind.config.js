/** Tailwind — paleta y tipografías del Manual de Marca Santévit IPS (v1.0, 2021) */
module.exports = {
  content: ["../index.html", "../privacidad.html", "../admin/*.html", "../assets/js/*.js"],
  theme: {
    extend: {
      colors: {
        brand: {
          sky: "#5EB3E4",    // Pantone 2915 C — color principal
          navy: "#00263A",   // Pantone 539 C  — textos y fondos oscuros
          orange: "#E04403", // Pantone 1665 C — acento / CTA
          mint: "#3BD4AE",   // Pantone 3385 C — complementario
        },
        wa: { DEFAULT: "#25D366", dark: "#128C7E" },
      },
      fontFamily: {
        display: ['"Montserrat Alternates"', "system-ui", "sans-serif"],
        body: ['"Josefin Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0, 38, 58, 0.25)",
      },
    },
  },
  plugins: [],
};
