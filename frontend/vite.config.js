import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// The dev server is pinned to port 5174 to match the backend CORS origin
// (FRONTEND_URL=http://localhost:5174 in backend/.env) and the QR trace URL
// base (PUBLIC_TRACE_BASE_URL).
//
// Tailwind is loaded through the official Vite plugin (Tailwind v4). It scans
// source files for utility classes automatically, so there is no
// tailwind.config.js and no postcss.config.js to maintain.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
  },
})
