import { existsSync, realpathSync } from 'node:fs'
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * `dist` es un enlace simbólico: desplegar.sh publica cada versión en
 * `releases/<sello>` y mueve el enlace. Capacitor copia el enlace en lugar de
 * seguirlo, y deja `android/app/src/main/assets/public` apuntando a una ruta
 * relativa que ahí no existe; el siguiente `copy` falla con ENOENT al intentar
 * crear un directorio sobre un enlace roto. Resolviéndolo aquí, Capacitor ve
 * un directorio de verdad. Si todavía no se ha compilado, se deja el nombre
 * tal cual para que el error que salga sea el de siempre: «falta dist».
 */
const webDir = existsSync('dist') ? realpathSync('dist') : 'dist'

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
  webDir,

  // El contenedor sirve la app desde su propio origen, no desde el servidor:
  // `capacitor://localhost` en iOS y `https://localhost` en Android. Las
  // llamadas al API se resuelven con `src/api.ts`, que en nativo apunta al
  // servidor absoluto configurable por el docente.
  //
  // En iOS NO se puede fijar `iosScheme: 'https'`: WKWebView ya gestiona
  // http/https y Capacitor lo ignora, con lo que el origen real era
  // `capacitor://localhost` aunque aquí dijera otra cosa (y es el que
  // espera el CORS del backend). Cambiar el esquema una vez publicada la app
  // cambiaría el origen de IndexedDB y el docente vería su cuaderno vacío.
  server: {
    androidScheme: 'https',
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
