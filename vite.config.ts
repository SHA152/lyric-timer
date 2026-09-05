import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Baked in at build time so the footer shows a version in the browser too —
  // Tauri's own getVersion() only exists inside the desktop shell. CI rewrites
  // package.json from the release tag, see scripts/set-version.mjs.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative asset paths so the same build works from GitHub Pages, a plain
  // folder, and the Tauri desktop bundle.
  base: './',
  // Tauri drives the dev server and wants a predictable port + its own output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
})
