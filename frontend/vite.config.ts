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
        // Cualquier ruta de la SPA debe abrir sin red: el docente entra en
        // /evaluacion desde el acceso directo del móvil, no por la portada
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // El currículo es público y prácticamente inmutable durante el
            // curso: se cachea a lo grande para poder evaluar sin cobertura
            // en el gimnasio, el patio o una salida.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/curriculum/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'curriculo',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 120 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Sesión y sincronización NO se cachean nunca: una respuesta de
            // auth guardada daría una sesión fantasma, y una de sync haría
            // creer que ya se descargó lo que no se ha descargado.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/sync')),
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'EDUmind MiClase',
        short_name: 'MiClase',
        description: 'Cuaderno del profesorado: evaluación competencial LOMLOE, asistencia y programación. Funciona sin conexión.',
        lang: 'es',
        categories: ['education', 'productivity'],
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
      // VITE_API_TARGET permite apuntar a un backend de pruebas sin tocar
      // el de producción (ver pruebas/README.md)
      '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3270', changeOrigin: true },
    },
  },
})
