import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
