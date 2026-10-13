/**
 * Dónde se escribe la copia automática.
 *
 * Dos destinos, y ninguno obligatorio:
 *  - Una carpeta que el docente elige en el Mac o el PC (Chrome y Edge, con la
 *    API de acceso al sistema de ficheros). Si esa carpeta está dentro de
 *    iCloud Drive, Dropbox o OneDrive, la copia sale del ordenador sola.
 *    Safari no tiene esta API: de ahí el segundo destino.
 *  - La carpeta de documentos de la app instalada (iPad, Android), que aparece
 *    en Archivos y entra en la copia de iCloud del aparato.
 *
 * El contenido es el mismo en los dos: ver `copiaFormato.ts`.
 */
import { db } from './localDb'

export interface DestinoCopia {
  readonly tipo: 'carpeta' | 'app'
  /** Cómo se le llama al docente: el nombre de la carpeta. */
  readonly nombre: string
  escribir(nombre: string, texto: string): Promise<void>
  /** `null` si el fichero no existe. */
  leer(nombre: string): Promise<string | null>
  listar(): Promise<string[]>
}

const K_DESTINO = 'copia_destino'
const SUBCARPETA = 'MiClase copia'

/** Lo que se guarda para recordar el destino: el handle (carpeta) o la marca de la app. */
type DestinoGuardado = { tipo: 'carpeta'; handle: FileSystemDirectoryHandle } | { tipo: 'app' }

// ─── Carpeta elegida (File System Access API) ────────────────────────────

type HandleConPermisos = FileSystemDirectoryHandle & {
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export function soportaCarpeta(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function'
}

/** Pide la carpeta al docente. Solo funciona desde un gesto suyo (un clic). */
export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as any).showDirectoryPicker as (o: any) => Promise<FileSystemDirectoryHandle>
  return picker({ id: 'miclase-copia', mode: 'readwrite', startIn: 'documents' })
}

/** `granted` sin preguntar; `prompt` si hay que volver a pedirlo con un clic. */
export async function permisoDeCarpeta(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const h = handle as HandleConPermisos
  if (!h.queryPermission) return 'granted'
  try { return await h.queryPermission({ mode: 'readwrite' }) } catch { return 'denied' }
}

export async function pedirPermisoDeCarpeta(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const h = handle as HandleConPermisos
  if (!h.requestPermission) return 'granted'
  try { return await h.requestPermission({ mode: 'readwrite' }) } catch { return 'denied' }
}

export function destinoCarpeta(handle: FileSystemDirectoryHandle): DestinoCopia {
  return {
    tipo: 'carpeta',
    nombre: handle.name || 'carpeta elegida',
    async escribir(nombre, texto) {
      const fh = await handle.getFileHandle(nombre, { create: true })
      const w = await fh.createWritable()
      await w.write(texto)
      await w.close()
    },
    async leer(nombre) {
      try {
        const fh = await handle.getFileHandle(nombre)
        return await (await fh.getFile()).text()
      } catch (e: any) {
        if (e?.name === 'NotFoundError') return null
        throw e
      }
    },
    async listar() {
      const nombres: string[] = []
      for await (const [n, h] of (handle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind === 'file') nombres.push(n)
      }
      return nombres
    },
  }
}

// ─── Carpeta de la app instalada (Capacitor Filesystem) ──────────────────

export function soportaCarpetaDeApp(): boolean {
  const cap = (window as any).Capacitor
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
}

export function destinoApp(): DestinoCopia {
  const fs = async () => {
    const m = await import('@capacitor/filesystem')
    return { Filesystem: m.Filesystem, Directory: m.Directory, Encoding: m.Encoding }
  }
  const ruta = (n: string) => `${SUBCARPETA}/${n}`
  const asegurar = async () => {
    const { Filesystem, Directory } = await fs()
    try { await Filesystem.mkdir({ path: SUBCARPETA, directory: Directory.Documents, recursive: true }) } catch { /* ya existe */ }
  }
  return {
    tipo: 'app',
    nombre: SUBCARPETA,
    async escribir(nombre, texto) {
      await asegurar()
      const { Filesystem, Directory, Encoding } = await fs()
      await Filesystem.writeFile({ path: ruta(nombre), data: texto, directory: Directory.Documents, encoding: Encoding.UTF8 })
    },
    async leer(nombre) {
      const { Filesystem, Directory, Encoding } = await fs()
      try {
        const r = await Filesystem.readFile({ path: ruta(nombre), directory: Directory.Documents, encoding: Encoding.UTF8 })
        return typeof r.data === 'string' ? r.data : await (r.data as Blob).text()
      } catch { return null }
    },
    async listar() {
      await asegurar()
      const { Filesystem, Directory } = await fs()
      const r = await Filesystem.readdir({ path: SUBCARPETA, directory: Directory.Documents })
      return r.files.filter(f => f.type === 'file').map(f => f.name)
    },
  }
}

// ─── Recordar la elección ────────────────────────────────────────────────

export async function guardarDestino(d: DestinoGuardado): Promise<void> {
  await db.meta.put({ clave: K_DESTINO, valor: d })
}

export async function olvidarDestino(): Promise<void> {
  await db.meta.delete(K_DESTINO)
}

/**
 * El destino recordado, con lo que hace falta saber antes de usarlo. Una
 * carpeta cuyo permiso ha caducado se devuelve igualmente (`permiso: 'prompt'`):
 * la pantalla pide el clic; el temporizador, no.
 */
export async function destinoGuardado(): Promise<
  | { destino: DestinoCopia; permiso: PermissionState; handle?: FileSystemDirectoryHandle }
  | null
> {
  const m = await db.meta.get(K_DESTINO)
  const d = m?.valor as DestinoGuardado | undefined
  if (!d) return null
  if (d.tipo === 'app') return { destino: destinoApp(), permiso: 'granted' }
  if (!d.handle) return null
  return { destino: destinoCarpeta(d.handle), permiso: await permisoDeCarpeta(d.handle), handle: d.handle }
}
