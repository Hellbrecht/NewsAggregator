import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is the build tool — like a render farm for your JS/CSS.
// In dev mode it serves files instantly with hot reload.
// In production it bundles everything into optimised static files.
export default defineConfig({
  plugins: [
    // This plugin teaches Vite how to handle React's JSX syntax (.tsx files)
    react(),
  ],

  server: {
    port: 5173,
    // Proxy: in dev, any request to /api/* gets forwarded to the Node server.
    // This means React code can call /api/combined-feed without CORS issues.
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },

  build: {
    // Output goes one level up into apps/web/dist/
    // The Node server will serve these files in production.
    outDir: '../dist',
    emptyOutDir: true,
  },
})
