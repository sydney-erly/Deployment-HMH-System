// tailwind.config.js
import flowbite from "flowbite/plugin";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "node_modules/flowbite-react/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amethyst: "#9956DE",
        slateBlue: "#7274ED",
        summerSky: "#1FA7E1",
        downy: "#6ED1CF",
        pastelGreen: "#75D06A",
        texasRose: "#FFB356",
        monaLisa: "#FF8B8B",
        illusion: "#FB96BB",
        hmhBeige: "#EAE4D0",
        hmhText: "#1C4211",
        hmhRed: "#9F2C0C",
      },
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
      },
      animation: {
        "pulse-slow": "pulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [flowbite], 
};
