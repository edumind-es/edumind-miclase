import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Empaquetado nativo de EDUmind MiClase.
 *
 * Motivo: Safari puede purgar IndexedDB tras ~7 días sin uso, y ahí se van las
 * calificaciones del trimestre. Dentro de un contenedor nativo el almacenamiento
 * pertenece a la app y el sistema no lo limpia por inactividad.
 *
 * La app se empaqueta ENTERA (`webDir: dist`): no carga nada de un servidor
 * remoto, así que arranca y funciona sin cobertura. Lo único que sale a la red
 * es el currículo público y, si el docente la activa, la sincronización cifrada.
 */
const config: CapacitorConfig = {
  appId: 'es.edumind.miclase',
  appName: 'EDUmind MiClase',
  webDir: 'dist',

  // El contenedor sirve la app desde https://localhost, no desde el servidor.
  // Las llamadas al API se resuelven con `src/api.ts`, que en nativo apunta
  // al servidor absoluto configurable por el docente.
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },

  ios: {
    // El teclado no debe tapar el calificador al escribir observaciones
    contentInset: 'automatic',
    // La cámara de evidencias necesita permiso: se declara en Info.plist
    // (ver DESPLIEGUE.md, sección de empaquetado)
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    // Permitir mixed content solo en depuración, nunca en release
    allowMixedContent: false,
  },

  plugins: {
    CapacitorHttp: {
      // Usar la pila nativa evita los problemas de CORS del WebView
      enabled: true,
    },
  },
}

export default config
