import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/assets/',
  publicDir: false,
  plugins: [react({ compiler: true })],
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../wwwroot/assets',
    // Old snapshots may still reference a previous release's hashed assets.
    emptyOutDir: false,
    manifest: 'manifest.json',
    rolldownOptions: {
      input: {
        islands: fileURLToPath(
          new URL('./src/islands/runtime.tsx', import.meta.url),
        ),
        admin: fileURLToPath(new URL('./src/admin/main.tsx', import.meta.url)),
      },
    },
  },
  css: {
    preprocessorOptions: { scss: { quietDeps: true } },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.API_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/images': {
        target: process.env.API_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/favicon.svg': {
        target: process.env.API_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
