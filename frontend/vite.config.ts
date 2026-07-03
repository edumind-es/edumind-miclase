import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 7_000_000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/127\.0\.0\.1:3270\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 3600 } },
          },
        ],
      },
      manifest: {
        name: 'EDUmind MiClase',
        short_name: 'MiClase',
        description: 'Gestión de aula, evaluación y seguimiento docente',
        theme_color: '#1a4a7a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@mlc-ai/web-llm')) return 'web-llm'
        },
      },
    },
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3270', changeOrigin: true },
    },
  },
})
