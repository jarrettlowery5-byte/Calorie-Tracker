import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site from /<repo>/, so the build needs a base
// path there. Everywhere else -- local dev, `npm run preview`, any other host --
// the app is served from the root. Set BASE_PATH to override.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, open: false },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.js'],
  },
});
