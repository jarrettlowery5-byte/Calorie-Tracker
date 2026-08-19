import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend never talks to Anthropic directly — /api/* is proxied to the
// Express backend, which holds the API key.
export default defineConfig({
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
