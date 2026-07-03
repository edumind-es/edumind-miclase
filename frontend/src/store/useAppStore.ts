import { create } from 'zustand'
import {
  getGrupos, crearGrupo as dbCrearGrupo, eliminarGrupo as dbEliminarGrupo,
  getAlumnosByGrupo, crearAlumno as dbCrearAlumno,
  actualizarAlumno as dbActualizarAlumno, eliminarAlumno as dbEliminarAlumno,
  type GrupoConCount,
} from '@/db/queries'
import type { Alumno as DBAlumno } from '@/db/localDb'

interface Grupo {
  id: number
  nombre: string
  etapa: string
  curso: string
  comunidad: string
  curso_escolar: string
  color: string
  docente_id?: number
  num_alumnos?: number
}

interface Alumno {
  id: number
  nombre: string
  apellidos: string
  neae: number
  etiquetas: string
  observaciones?: string
  codigo_cifrado?: string
}

interface AppState {
  grupos: Grupo[]
  grupoActivo: Grupo | null
  alumnos: Alumno[]
  cargando: boolean
  error: string | null

  // Token de sesión (lo actualiza AuthProvider) — sigue siendo necesario para el currículo del servidor
  _token: string | null
  _setToken: (token: string | null) => void
  _headers: () => Record<string, string>

  cargarGrupos: () => Promise<void>
  seleccionarGrupo: (grupo: Grupo | null) => void
  cargarAlumnos: (grupo_id: number) => Promise<void>
  crearGrupo: (datos: Partial<Grupo>) => Promise<number>
  crearAlumno: (datos: Partial<Alumno> & { grupo_id: number }) => Promise<number>
  actualizarAlumno: (id: number, datos: Partial<Alumno>) => Promise<void>
  eliminarAlumno: (id: number, grupo_id: number) => Promise<void>
  eliminarGrupo: (id: number) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  grupos: [],
  grupoActivo: null,
  alumnos: [],
  cargando: false,
  error: null,

  _token: null,
  _setToken: (token) => set({ _token: token }),
  _headers: (): Record<string, string> => {
    const t = get()._token
    return t ? { Authorization: `Bearer ${t}` } : {}
  },

  cargarGrupos: async () => {
    set({ cargando: true, error: null })
    try {
      const data = await getGrupos()
      set({ grupos: data as unknown as Grupo[], cargando: false })
    } catch {
      set({ error: 'Error cargando grupos', cargando: false })
    }
  },

  seleccionarGrupo: (grupo) => set({ grupoActivo: grupo }),

  cargarAlumnos: async (grupo_id) => {
    set({ cargando: true })
    try {
      const data = await getAlumnosByGrupo(grupo_id)
      set({ alumnos: data as unknown as Alumno[], cargando: false })
    } catch {
      set({ cargando: false })
    }
  },

  crearGrupo: async (datos) => {
    const id = await dbCrearGrupo({
      nombre: datos.nombre || '',
      etapa: datos.etapa || 'primaria',
      curso: datos.curso || '1',
      comunidad: datos.comunidad || 'Galicia',
      curso_escolar: datos.curso_escolar || '2025-2026',
      docente_id: datos.docente_id || 1,
      color: datos.color || '#1a4a7a',
    })
    await get().cargarGrupos()
    return id
  },

  crearAlumno: async (datos) => {
    const { grupo_id, ...rest } = datos
    const id = await dbCrearAlumno({
      nombre: rest.nombre || '',
      apellidos: rest.apellidos || '',
      neae: rest.neae ?? 0,
      etiquetas: rest.etiquetas || '[]',
      observaciones: rest.observaciones,
      codigo_cifrado: rest.codigo_cifrado,
    }, grupo_id!)
    return id
  },

  actualizarAlumno: async (id, datos) => {
    await dbActualizarAlumno(id, datos as Partial<DBAlumno>)
  },

  eliminarAlumno: async (id, grupo_id) => {
    await dbEliminarAlumno(id, grupo_id)
    await get().cargarAlumnos(grupo_id)
  },

  eliminarGrupo: async (id) => {
    await dbEliminarGrupo(id)
    await get().cargarGrupos()
  },
}))
