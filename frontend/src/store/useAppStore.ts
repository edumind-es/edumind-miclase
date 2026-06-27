import { create } from 'zustand'

const API = '/api'

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
}

interface AppState {
  grupos: Grupo[]
  grupoActivo: Grupo | null
  alumnos: Alumno[]
  cargando: boolean
  error: string | null

  cargarGrupos: () => Promise<void>
  seleccionarGrupo: (grupo: Grupo | null) => void
  cargarAlumnos: (grupo_id: number) => Promise<void>
  crearGrupo: (datos: Partial<Grupo>) => Promise<number>
  crearAlumno: (datos: Partial<Alumno>) => Promise<number>
}

export const useAppStore = create<AppState>((set, get) => ({
  grupos: [],
  grupoActivo: null,
  alumnos: [],
  cargando: false,
  error: null,

  cargarGrupos: async () => {
    set({ cargando: true, error: null })
    try {
      const res = await fetch(`${API}/grupos`)
      const data = await res.json()
      set({ grupos: data, cargando: false })
    } catch (e) {
      set({ error: 'Error cargando grupos', cargando: false })
    }
  },

  seleccionarGrupo: (grupo) => set({ grupoActivo: grupo }),

  cargarAlumnos: async (grupo_id) => {
    set({ cargando: true })
    try {
      const res = await fetch(`${API}/alumnos?grupo_id=${grupo_id}`)
      const data = await res.json()
      set({ alumnos: data, cargando: false })
    } catch {
      set({ cargando: false })
    }
  },

  crearGrupo: async (datos) => {
    const res = await fetch(`${API}/grupos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    const { id } = await res.json()
    await get().cargarGrupos()
    return id
  },

  crearAlumno: async (datos) => {
    const res = await fetch(`${API}/alumnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    const { id } = await res.json()
    return id
  },
}))
