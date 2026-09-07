/**
 * Contexto de clase activa.
 *
 * Antes cada pantalla montaba su propio selector de grupo y su propio estado:
 * el docente elegía su clase una vez en Evaluación, otra en Asistencia, otra
 * en Seguimiento, otra en Informes… y al abrir la app desde el icono del iPad
 * aterrizaba sin nada seleccionado, como si empezara de cero cada mañana.
 *
 * Aquí vive una sola vez qué clase y qué área se están mirando, y sobrevive al
 * cierre de la app. Los enlaces con `?grupo_id=` (los QR ya impresos, los
 * atajos internos) siguen funcionando: en vez de abrir un estado aparte, fijan
 * el de aquí — ver `useSincronizarUrl`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getAsignaturas, getGrupos, type GrupoConCount } from '@/db/queries'
import { trimestreActual } from '@/db/calculo'
import type { Asignatura } from '@/db/localDb'

const K_GRUPO = 'miclase_clase_activa'
const kArea = (grupoId: number) => `miclase_area_activa_${grupoId}`

interface ClaseActivaCtx {
  grupos: GrupoConCount[]
  grupo: GrupoConCount | null
  grupoId: number | null

  asignaturas: Asignatura[]
  asignatura: Asignatura | null
  asignaturaId: number | null

  /** Trimestre que se está mirando. No se persiste a propósito (ver abajo). */
  trimestre: number

  /** true solo durante la primera carga: distingue «aún no sé» de «no hay clases». */
  cargando: boolean

  /**
   * Cambia de clase. El área de la clase anterior no vale para la nueva, así
   * que se pasa aquí también: separarlo en dos llamadas hacía que el reinicio
   * del área pisara la que pedía un enlace `?asignatura_id=`.
   */
  elegirGrupo: (id: number | null, asignaturaId?: number | null) => void
  elegirAsignatura: (id: number | null) => void
  elegirTrimestre: (t: number) => void

  recargarGrupos: () => Promise<void>
  recargarAsignaturas: () => Promise<void>
}

const Ctx = createContext<ClaseActivaCtx | null>(null)

function leerGrupoGuardado(): number | null {
  const v = localStorage.getItem(K_GRUPO)
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function ClaseActivaProvider({ children }: { children: React.ReactNode }) {
  const [grupos, setGrupos] = useState<GrupoConCount[]>([])
  const [grupoId, setGrupoId] = useState<number | null>(leerGrupoGuardado)
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  // El trimestre NO se guarda entre sesiones: si en enero se abriera con el
  // primer trimestre heredado de diciembre, las notas nuevas caerían en el
  // trimestre equivocado sin que nadie lo notase. Arranca siempre en el que
  // toca por calendario y se puede cambiar dentro de la sesión.
  const [trimestre, setTrimestre] = useState(trimestreActual)
  const [cargando, setCargando] = useState(true)
  const { pathname } = useLocation()

  const recargarGrupos = useCallback(async () => {
    const data = await getGrupos()
    setGrupos(data)
    setGrupoId(prev => {
      // El grupo guardado puede haberse borrado, o venir de otro dispositivo
      // que aún no ha sincronizado. Si ya no existe, se cae al primero.
      if (prev != null && data.some(g => g.id === prev)) return prev
      return data[0]?.id ?? null
    })
    setCargando(false)
  }, [])

  // Se relee al cambiar de pantalla. Es una lectura local de IndexedDB, y
  // ahorra tener que avisar desde cada sitio donde se crea o borra una clase:
  // al volver de la configuración, la barra ya enseña lo que se acaba de tocar.
  useEffect(() => { recargarGrupos().catch(() => setCargando(false)) }, [recargarGrupos, pathname])

  useEffect(() => { if (grupoId != null) localStorage.setItem(K_GRUPO, String(grupoId)) }, [grupoId])

  const recargarAsignaturas = useCallback(async () => {
    if (grupoId == null) { setAsignaturas([]); setAsignaturaId(null); return }
    const data = await getAsignaturas(grupoId)
    setAsignaturas(data)
    const guardada = Number(localStorage.getItem(kArea(grupoId)))
    setAsignaturaId(prev =>
      prev != null && data.some(a => a.id === prev) ? prev
      : data.some(a => a.id === guardada) ? guardada
      : data[0]?.id ?? null)
  }, [grupoId])

  useEffect(() => { recargarAsignaturas().catch(() => setAsignaturas([])) }, [recargarAsignaturas, pathname])

  const elegirGrupo = useCallback((id: number | null, asigId: number | null = null) => {
    setGrupoId(id)
    setAsignaturaId(asigId)
  }, [])

  useEffect(() => {
    if (grupoId != null && asignaturaId != null) {
      localStorage.setItem(kArea(grupoId), String(asignaturaId))
    }
  }, [grupoId, asignaturaId])

  const valor = useMemo<ClaseActivaCtx>(() => ({
    grupos,
    grupo: grupos.find(g => g.id === grupoId) ?? null,
    grupoId,
    asignaturas,
    asignatura: asignaturas.find(a => a.id === asignaturaId) ?? null,
    asignaturaId,
    trimestre,
    cargando,
    elegirGrupo,
    elegirAsignatura: setAsignaturaId,
    elegirTrimestre: setTrimestre,
    recargarGrupos,
    recargarAsignaturas,
  }), [grupos, grupoId, asignaturas, asignaturaId, trimestre, cargando, elegirGrupo, recargarGrupos, recargarAsignaturas])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useClaseActiva(): ClaseActivaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClaseActiva fuera de <ClaseActivaProvider>')
  return ctx
}
