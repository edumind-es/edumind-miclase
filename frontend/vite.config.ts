import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { realpathSync } from 'fs'
import type { Plugin } from 'vite'
import { escribirPaquetes } from '../scripts/empaquetar_curriculo.mjs'

/**
 * El currículo viaja dentro de la app: en cada build y en cada arranque del
 * servidor de desarrollo se regenera `public/curriculo/` desde `curriculum/`
 * (scripts/empaquetar_curriculo.mjs). Va aquí y no en un «prebuild» de npm
 * porque desplegar.sh y las pruebas llaman a `vite` directamente.
 */
function curriculoEmpaquetado(): Plugin {
  return {
    name: 'miclase-curriculo',
    buildStart() {
      const r = escribirPaquetes()
      this.info(`currículo empaquetado: ${r.comunidades} comunidades, ${r.paquetes} paquetes, ${(r.bytes / 1024 / 1024).toFixed(1)} MB`)
      for (const a of r.avisos) this.warn(`currículo: ${a}`)
    },
  }
}

export default defineConfig({
  plugins: [
    curriculoEmpaquetado(),
    react(),
    VitePWA({
      // El registro del service worker lo hace ActualizacionApp.tsx, no la
      // línea que inyectaba el plugin: esa solo registraba y nunca volvía a
      // preguntar, así que una PWA abierta días no se enteraba de los
      // despliegues y la recién abierta veía la versión nueva a la segunda.
      // En modo «prompt» la versión nueva se descarga sola y entra cuando el
      // docente pulsa «Actualizar» o en la siguiente apertura, nunca a mitad
      // de una calificación.
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 7_000_000,
        // El currículo empaquetado (`curriculo/`) entra entero en el precaché:
        // índice, descriptores y los paquetes de criterios de TODAS las
        // comunidades (6 MB en el aparato, 0,75 MB por la red una vez; workbox
        // solo vuelve a bajar lo que cambia). Así, sin red, se puede crear una
        // clase de cualquier comunidad y calificar. Decisión de Luis (nov 2026).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'curriculo/**/*.json'],
        // El motor de IA local pesa 6 MB y solo se puede usar en Chrome o Edge
        // de escritorio. Precachearlo obligaba a TODA instalación de la PWA
        // —el iPad incluido, donde no hay WebGPU— a descargarlo para nada.
        // Se sigue sirviendo desde el mismo origen cuando se pide.
        // Los saberes (otros 8 MB) tampoco: ninguna pantalla los pide hoy.
        globIgnores: ['**/web-llm-*.js', 'curriculo/saberes/**'],
        // Cualquier ruta de la SPA debe abrir sin red: el docente entra en
        // /evaluacion desde el acceso directo del móvil, no por la portada
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Lo del currículo que no va en el precaché (los saberes) y el
            // servidor de reserva: se guardan al pedirlos, por si vuelven a
            // hacer falta sin cobertura. Primero la red (y a los 4 s, la
            // caché): con la caché delante, lo sembrado de nuevo en el
            // servidor no llegaba hasta la segunda apertura.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.startsWith('/curriculo/saberes/') || url.pathname.startsWith('/api/curriculum/')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'curriculo',
              networkTimeoutSeconds: 4,
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
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // El enmascarable va aparte: el sistema recorta los bordes, así que
          // su marca es más pequeña. Declarar el mismo fichero como «any
          // maskable» hacía que Android lo recortara y se comiera el icono.
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
        // El worker de pdf.js llega como `.mjs`. nginx no conoce esa extensión
        // (lo serviría como binario y el navegador rechaza el worker) y la PWA
        // no la precachea, así que importar PROENS sin red fallaría. Con `.js`
        // vale en los dos sitios, y en el contenedor nativo también.
        assetFileNames: (info) =>
          info.names?.some(n => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    fs: {
      // En las worktrees de `.claude/worktrees/` `node_modules` es un enlace al
      // del checkout principal, fuera de la raíz. Vite no sirve nada de ahí con
      // `?url` (devuelve el fichero en crudo) y el worker de pdf.js llegaba sin
      // URL: «Invalid workerSrc type». Se permite la ruta real; en el checkout
      // principal ya está dentro de la raíz y no cambia nada.
      allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(resolve(__dirname, 'node_modules'))],
    },
    proxy: {
      // VITE_API_TARGET permite apuntar a un backend de pruebas sin tocar
      // el de producción (ver pruebas/README.md)
      '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3270', changeOrigin: true },
    },
  },
})
