import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend never talks to Anthropic directly — /api/* is proxied to the
// Express backend, which holds the API key.
export default defineConfig({
  // GHPAGES_BASE sets the subpath GitHub Pages serves the app from,
  // e.g. /Calorie-Tracker/weekly/ (it lives alongside the calorie tracker).
  base: process.env.GHPAGES_BASE || "/",
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
