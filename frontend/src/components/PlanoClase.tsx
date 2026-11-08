/**
 * Plano de clase del grupo, dibujado con AulaMap
 * (https://aulamap.github.io), de Juan José de Haro (jjdeharo), AGPL v3.
 *
 * AulaMap vive copiado en `public/aulamap/` y se abre en un iframe del MISMO
 * origen: no se carga nada de fuera ni sale nada del aparato. La ventana deja
 * en `window.MiClaseAulaMap` el plano del grupo y cómo guardarlo, y el puente
 * de AulaMap (`public/aulamap/miclase-puente.js`) lo usa en vez de
 * localStorage. La traducción entre los dos vive en `db/planoAulaMap.ts`.
 *
 * - Vista: solo el plano; tocar a un alumno abre su evaluación rápida.
 * - Editar el aula: AulaMap entero (mesas, mobiliario, alumnado, equipos).
 * Complementa los QR de mesa: mismo destino (/escanear), dos caminos.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlano, guardarPlanoAulaMap, type PlanoDetalle } from '@/db/queries'
import type { Alumno } from '@/db/localDb'
import {
  claseParaAulaMap, claseParaGuardar, alumnoDeIdAulaMap, resumenPlano,
  type ClaseAulaMap,
} from '@/db/planoAulaMap'

interface Props {
  grupoId: number
  nombreGrupo?: string
  alumnos: Alumno[]
  modoAnon: boolean
}

type Modo = 'vista' | 'editar'

// Lo que el puente de AulaMap busca en la ventana de MiClase.
interface AnfitrionAulaMap {
  modo: Modo
  cargar: () => ClaseAulaMap
  guardar: (clase: ClaseAulaMap) => void
  abrirAlumno: (idAulaMap: string) => void
}
declare global {
  interface Window { MiClaseAulaMap?: AnfitrionAulaMap }
}

export const URL_AULAMAP = 'https://aulamap.github.io'
export const URL_AUTOR_AULAMAP = 'https://github.com/jjdeharo'
const URL_FUENTE = 'https://github.com/edumind-es/edumind-miclase/tree/main/frontend/public/aulamap'
const ESPERA_GUARDADO = 400

export default function PlanoClase({ grupoId, nombreGrupo = '', alumnos, modoAnon }: Props) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [modo, setModo] = useState<Modo>('vista')
  const [detalle, setDetalle] = useState<PlanoDetalle | null>(null)
  const [estado, setEstado] = useState('')
  const pendiente = useRef<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const alumnosPlano = useMemo(() => alumnos
    .filter(a => a.id != null && !a.deleted_at)
    .map(a => ({
      id: a.id!,
      nombre: modoAnon ? (a.codigo_cifrado || '—') : `${a.apellidos || ''}, ${a.nombre || ''}`.replace(/^, /, ''),
    })), [alumnos, modoAnon])

  const cargar = useCallback(async () => {
    setDetalle(await getPlano(grupoId))
  }, [grupoId])

  useEffect(() => { if (visible) cargar() }, [visible, cargar])

  // Guardar lo pendiente ya (al cambiar de modo, de grupo o al salir).
  const volcar = useCallback(async () => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null }
    const json = pendiente.current
    pendiente.current = null
    if (json == null) return
    try {
      await guardarPlanoAulaMap(grupoId, json)
      setEstado('Plano guardado en este aparato.')
    } catch (e) {
      setEstado(`No se pudo guardar el plano: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [grupoId])

  // La clase que AulaMap va a enseñar: la guardada o, si no hay, la que
  // sale de la cuadrícula de siempre. Con el alumnado vivo del grupo.
  const clase = useMemo(() => detalle && claseParaAulaMap({
    grupoId, nombreGrupo,
    guardado: detalle.plano.aulamap,
    alumnos: alumnosPlano,
    filas: detalle.plano.filas, cols: detalle.plano.cols,
    asientos: detalle.asientos,
  }), [detalle, grupoId, nombreGrupo, alumnosPlano])

  // El anfitrión tiene que estar puesto ANTES de que el iframe cargue.
  useLayoutEffect(() => {
    if (!visible || !clase) return
    window.MiClaseAulaMap = {
      modo,
      cargar: () => clase,
      guardar: (c) => {
        pendiente.current = claseParaGuardar(c)
        if (temporizador.current) clearTimeout(temporizador.current)
        temporizador.current = setTimeout(() => { void volcar() }, ESPERA_GUARDADO)
      },
      abrirAlumno: (idAulaMap) => {
        const id = alumnoDeIdAulaMap(idAulaMap)
        if (id != null) navigate(`/escanear?alumno=${id}`)
      },
    }
    return () => {
      void volcar()
      delete window.MiClaseAulaMap
    }
  }, [visible, clase, modo, navigate, volcar])

  const cambiarModo = async (nuevo: Modo) => {
    await volcar()
    await cargar() // la vista enseña lo recién guardado
    setModo(nuevo)
  }

  const { puestos, sentados } = resumenPlano(clase)
  const nSentados = new Set(sentados).size
  const sinSitio = alumnosPlano.length - nSentados

  return (
    <div className="card" style={{ marginBottom: 20 }} data-plano-clase>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>🪑 Plano de clase</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {visible && detalle && (
            <button className={modo === 'editar' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 13 }}
              data-plano-modo={modo === 'editar' ? 'vista' : 'editar'}
              onClick={() => cambiarModo(modo === 'editar' ? 'vista' : 'editar')}>
              {modo === 'editar' ? '✓ Terminar' : '✏️ Editar el aula'}
            </button>
          )}
          <button className="btn-secondary" style={{ fontSize: 13 }} data-plano-mostrar
            onClick={async () => { if (visible) { await volcar(); setModo('vista') } setVisible(v => !v) }}>
            {visible ? 'Ocultar' : 'Mostrar plano'}
          </button>
        </div>
      </div>

      {/* Cita del autor: AulaMap es de Juan José de Haro (licencia AGPL v3). */}
      <p data-credito-aulamap style={{ fontSize: 12, color: 'var(--gris-600)', margin: '6px 0 0', lineHeight: 1.5 }}>
        Plano basado en <a href={URL_AULAMAP} target="_blank" rel="noopener noreferrer">AulaMap</a>,
        {' '}de Juan José de Haro (<a href={URL_AUTOR_AULAMAP} target="_blank" rel="noopener noreferrer">jjdeharo</a>).
        {' '}Licencia <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL v3</a>
        {' '}· <a href={URL_FUENTE} target="_blank" rel="noopener noreferrer">código fuente</a>.
      </p>

      {visible && detalle && (
        <>
          <div style={{ fontSize: 12, color: 'var(--gris-600)', margin: '10px 0' }} data-plano-ayuda>
            {modo === 'editar'
              ? 'Coloca mesas y mobiliario en la pestaña «Aula» y arrastra a cada alumno a su mesa desde «Alumnado». Se guarda solo, en este aparato.'
              : `${puestos} puestos · ${nSentados} sentados${sinSitio > 0 ? ` · ${sinSitio} sin sitio` : ''}. ${nSentados
                ? 'Toca a un alumno para abrir su evaluación rápida.'
                : 'Pulsa «Editar el aula» para colocar las mesas y sentar al alumnado.'}`}
          </div>

          <iframe
            key={`${grupoId}-${modo}`}
            title="Plano de clase (AulaMap)"
            src={`${import.meta.env.BASE_URL}aulamap/index.html`}
            data-aulamap={modo}
            style={{
              width: '100%', height: modo === 'editar' ? 760 : 520,
              border: '1px solid var(--gris-300)', borderRadius: 10, background: 'white',
            }}
          />

          {estado && (
            <div style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 6 }} data-plano-estado>{estado}</div>
          )}
        </>
      )}
    </div>
  )
}
