import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend never talks to Anthropic directly — /api/* is proxied to the
// Express backend, which holds the API key.
export default defineConfig({
  // GHPAGES=1 builds for GitHub Pages, which serves the app from a
  // /Calorie-Tracker/ subpath instead of the domain root.
  base: process.env.GHPAGES ? "/Calorie-Tracker/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
