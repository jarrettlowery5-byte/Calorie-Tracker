/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF7F0",
        ink: "#22201B",
        herb: "#2F5D3A",
        honey: "#E0A43B",
        tomato: "#C4472F",
        muted: "#7A756B",
        hairline: "#EAE2D5",
        "herb-soft": "#EAF1E9",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
