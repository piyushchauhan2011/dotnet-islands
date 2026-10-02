import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/assets/',
  publicDir: false,
  plugins: [
    {
      name: 'public-calendar-preact-compat',
      enforce: 'pre',
      async resolveId(source, importer) {
        const normalized = importer?.split('?')[0].replaceAll('\\', '/')
        if (
          source !== 'react' ||
          !normalized?.includes('/node_modules/react-day-picker/')
        )
          return null
        const resolved = await this.resolve('preact/compat', importer, {
          skipSelf: true,
        })
        if (!resolved)
          throw new Error('Public calendar could not resolve preact/compat')
        return resolved
      },
    },
    react({ compiler: true, include: /[\\/]src[\\/]admin[\\/]/ }),
    {
      name: 'benchmark-module-metadata',
      generateBundle(_options, bundle) {
        if (!process.env.BENCHMARK_OUT) return
        const directory = resolve(process.env.BENCHMARK_OUT)
        mkdirSync(directory, { recursive: true })
        writeFileSync(
          resolve(directory, 'modules.json'),
          JSON.stringify(
            {
              chunks: Object.values(bundle)
                .filter((item) => item.type === 'chunk')
                .map((chunk) => ({
                  fileName: chunk.fileName,
                  imports: chunk.imports,
                  dynamicImports: chunk.dynamicImports,
                  moduleIds: Object.keys(chunk.modules),
                })),
            },
            null,
            2,
          ),
        )
      },
    },
  ],
  optimizeDeps: { exclude: ['react-day-picker'] },
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
        publicStyles: fileURLToPath(
          new URL('./src/styles.scss', import.meta.url),
        ),
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
