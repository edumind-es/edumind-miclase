/**
 * Informes y datos.
 *
 * Los documentos se componen en Sistema Lámina EDUmind (papel, barra de
 * Cinco Mundos, Outfit e IBM Plex Mono) y se imprimen desde el propio
 * navegador: «Guardar como PDF» produce el documento con la tipografía y
 * el reglado del canon. Nada sale del dispositivo.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getGrupos, getCalificacionesPorGrupo, exportarDatos, importarDatos,
} from '@/db/queries'
import { useAuth } from '@/auth/AuthProvider'
import { imprimir, descargarHTML } from '@/informes/lamina'
import { reunirDatosGrupo, evidenciasDeAlumno, type DatosGrupo, type EvidenciaInforme } from '@/informes/datos'
import { informeIndividual, informesDelGrupo, boletinGrupo, actaArea } from '@/informes/documentos'

type Grupo = { id: number; nombre: string; etapa: string; curso: string; curso_escolar: string }

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
}

export default function InformesPage() {
  const { headers } = useAuth()

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoId, setGrupoId] = useState('')
  const [datos, setDatos] = useState<DatosGrupo | null>(null)
  const [alumnoSelId, setAlumnoSelId] = useState('')
  const [areaSelId, setAreaSelId] = useState('')
  const [trimestre, setTrimestre] = useState<string>('')      // '' = curso completo
  const [conCriterios, setConCriterios] = useState(true)
  const [conEvidencias, setConEvidencias] = useState(true)
  const [generando, setGenerando] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const trim = trimestre ? Number(trimestre) : null
  const alumnos = datos?.alumnos ?? []
  const areas = datos?.areas ?? []
  const grupo = grupos.find(g => String(g.id) === grupoId)

  useEffect(() => {
    getGrupos().then(d => {
      setGrupos(d as unknown as Grupo[])
      if (d[0]) setGrupoId(String(d[0].id))
    })
  }, [])

  useEffect(() => {
    if (!grupoId) { setDatos(null); return }
    setMsg(null)
    // El trimestre entra en la recogida de datos, no solo en el filtrado de
    // notas: la asistencia hay que recontarla del periodo del informe.
    reunirDatosGrupo(Number(grupoId), headers, trim)
      .then(d => {
        setDatos(d)
        setAlumnoSelId(prev => prev || (d.alumnos[0]?.id ? String(d.alumnos[0].id) : ''))
        setAreaSelId(prev => prev || (d.areas[0]?.asig.id ? String(d.areas[0].asig.id) : ''))
      })
      .catch(e => setMsg({ tipo: 'error', texto: e.message }))
  }, [grupoId, trim])

  const opciones = { trimestre: trim, incluirCriterios: conCriterios }

  const conEvidenciasDe = async (alumnoId: number): Promise<EvidenciaInforme[]> =>
    conEvidencias ? evidenciasDeAlumno(alumnoId) : []

  // ── Generadores ──────────────────────────────────────────────────────

  const generar = async (
    clave: string,
    construir: () => Promise<{ html: string; nombre: string }>,
    accion: 'imprimir' | 'descargar'
  ) => {
    setGenerando(clave); setMsg(null)
    try {
      const { html, nombre } = await construir()
      if (accion === 'imprimir') await imprimir(html)
      else await descargarHTML(html, nombre)
      setMsg({
        tipo: 'ok',
        texto: accion === 'imprimir'
          ? 'Documento listo. En el diálogo de impresión elige «Guardar como PDF».'
          : `Descargado ${nombre}`,
      })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'No se pudo generar el documento.' })
    } finally { setGenerando('') }
  }

  const docIndividual = async () => {
    if (!datos) throw new Error('Sin datos')
    const al = alumnos.find(a => String(a.id) === alumnoSelId)
    if (!al) throw new Error('Selecciona un alumno.')
    const evs = await conEvidenciasDe(al.id!)
    return {
      html: informeIndividual(datos, al, evs, opciones),
      nombre: `informe-${normalizar(al.apellidos)}-${normalizar(al.nombre)}-${datos.grupo.curso_escolar}.html`,
    }
  }

  const docGrupo = async () => {
    if (!datos) throw new Error('Sin datos')
    if (!alumnos.length) throw new Error('La clase no tiene alumnado.')
    const mapa = new Map<number, EvidenciaInforme[]>()
    if (conEvidencias) {
      for (const al of alumnos) mapa.set(al.id!, await evidenciasDeAlumno(al.id!, 6))
    }
    return {
      html: informesDelGrupo(datos, mapa, opciones),
      nombre: `informes-${normalizar(datos.grupo.nombre)}-${datos.grupo.curso_escolar}.html`,
    }
  }

  const docBoletines = async () => {
    if (!datos) throw new Error('Sin datos')
    if (!alumnos.length) throw new Error('La clase no tiene alumnado.')
    return {
      html: boletinGrupo(datos, trim),
      nombre: `boletines-${normalizar(datos.grupo.nombre)}-${datos.grupo.curso_escolar}.html`,
    }
  }

  const docActa = async () => {
    if (!datos) throw new Error('Sin datos')
    if (!areaSelId) throw new Error('Selecciona un área.')
    const area = areas.find(a => String(a.asig.id) === areaSelId)
    return {
      html: actaArea(datos, Number(areaSelId), trim),
      nombre: `acta-${normalizar(area?.asig.nombre_display || 'area')}-${normalizar(datos.grupo.nombre)}.html`,
    }
  }

  // ── CSV ──────────────────────────────────────────────────────────────

  const exportarCSV = async () => {
    if (!grupoId || !grupo) return
    setGenerando('csv'); setMsg(null)
    try {
      const { asignaturas, alumnos: als, calificaciones } = await getCalificacionesPorGrupo(Number(grupoId))
      const instrById = new Map<number, { nombre: string; tipo: string; peso: number; asignatura_id: number }>()
      for (const a of asignaturas) {
        for (const i of a.instrumentos) {
          if (i.id != null) instrById.set(i.id, { nombre: i.nombre, tipo: i.tipo, peso: i.peso, asignatura_id: a.id! })
        }
      }

      const filas: string[][] = [[
        'Alumno', 'Área', 'Criterio', 'Instrumento', 'Tipo', 'Peso instrumento', 'Trimestre', 'Nota', 'Observación', 'Fecha',
      ]]
      for (const cal of calificaciones) {
        if (cal.valor == null) continue
        const alumno = als.find(a => a.id === cal.alumno_id)
        const instr = instrById.get(cal.instrumento_id)
        const asig = asignaturas.find(a => a.id === instr?.asignatura_id)
        if (!alumno || !asig) continue
        filas.push([
          `${alumno.apellidos}, ${alumno.nombre}`,
          asig.nombre_display,
          cal.criterio_id,
          instr?.nombre || '',
          instr?.tipo || '',
          String(instr?.peso ?? ''),
          String(cal.trimestre),
          String(cal.valor),
          cal.observacion || '',
          cal.fecha ? new Date(cal.fecha).toLocaleDateString('es-ES') : '',
        ])
      }

      const csv = filas.map(f => f.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `calificaciones-${normalizar(grupo.nombre)}-${grupo.curso_escolar}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setMsg({ tipo: 'ok', texto: `CSV exportado: ${filas.length - 1} registros.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al exportar.' })
    } finally { setGenerando('') }
  }

  // ── Backup ───────────────────────────────────────────────────────────

  const handleExportarBackup = async () => {
    setGenerando('backup'); setMsg(null)
    try {
      const json = await exportarDatos()
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `miclase-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setMsg({ tipo: 'ok', texto: 'Copia de seguridad descargada. Guárdala en un lugar seguro.' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al exportar.' })
    } finally { setGenerando('') }
  }

  const handleImportarBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('¿Restaurar datos desde este backup?\n\nSe borrarán TODOS los datos actuales de este dispositivo y se reemplazarán por los del fichero.')) {
      e.target.value = ''
      return
    }
    setGenerando('restaurar'); setMsg(null)
    try {
      await importarDatos(await file.text())
      setMsg({ tipo: 'ok', texto: 'Datos restaurados. Recarga la página para verlos.' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al importar.' })
    } finally {
      setGenerando('')
      e.target.value = ''
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>
          No hay clases todavía, así que no hay nada de lo que informar.
        </p>
        <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear mi primera clase →</Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="page-title">Informes y datos</h1>

      {/* Barra de contexto */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600 }}>
            Clase
            <select value={grupoId} onChange={e => setGrupoId(e.target.value)} style={{ minWidth: 170 }}>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} · {g.curso}º · {g.curso_escolar}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600 }}>
            Periodo
            <select value={trimestre} onChange={e => setTrimestre(e.target.value)}>
              <option value="">Curso completo</option>
              <option value="1">1er trimestre</option>
              <option value="2">2º trimestre</option>
              <option value="3">3er trimestre</option>
            </select>
          </label>
          <span style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            {alumnos.length} alumnos · {areas.length} áreas
          </span>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gris-600)', cursor: 'pointer' }}>
            <input type="checkbox" checked={conCriterios} onChange={e => setConCriterios(e.target.checked)} />
            Detalle por criterio
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gris-600)', cursor: 'pointer' }}>
            <input type="checkbox" checked={conEvidencias} onChange={e => setConEvidencias(e.target.checked)} />
            Incluir evidencias
          </label>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 16, padding: '11px 16px', borderRadius: 8, fontSize: 13.5,
          background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)',
          color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)',
        }}>
          {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
        </div>
      )}

      {/* Documentos lámina */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 18 }}>

        <Documento
          icono="👤" titulo="Informe individual"
          texto="Lámina completa de un alumno: resultados por área, detalle por criterio con el instrumento que lo evaluó, observaciones y evidencias."
          extra={
            <select value={alumnoSelId} onChange={e => setAlumnoSelId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              {alumnos.length === 0 && <option value="">Sin alumnado</option>}
              {alumnos.map(a => <option key={a.id} value={a.id}>{a.apellidos}, {a.nombre}</option>)}
            </select>
          }
          ocupado={generando === 'ind'}
          deshabilitado={!alumnoSelId}
          onImprimir={() => generar('ind', docIndividual, 'imprimir')}
          onDescargar={() => generar('ind', docIndividual, 'descargar')}
        />

        <Documento
          icono="👥" titulo="Informes de toda la clase"
          texto={`Un documento con la lámina de cada alumno, lista para imprimir de una tirada${alumnos.length ? ` (${alumnos.length} láminas)` : ''}.`}
          ocupado={generando === 'grp'}
          deshabilitado={alumnos.length === 0}
          onImprimir={() => generar('grp', docGrupo, 'imprimir')}
          onDescargar={() => generar('grp', docGrupo, 'descargar')}
        />

        <Documento
          icono="📄" titulo="Boletín de calificaciones"
          texto="La versión breve para las familias: nota por área y media, con la escala LOMLOE y espacio para firmas."
          ocupado={generando === 'bol'}
          deshabilitado={alumnos.length === 0}
          onImprimir={() => generar('bol', docBoletines, 'imprimir')}
          onDescargar={() => generar('bol', docBoletines, 'descargar')}
        />

        <Documento
          icono="🗂️" titulo="Acta de área"
          texto="Todo el grupo en una tabla, con los instrumentos de evaluación del área y su ponderación. Para sesiones de evaluación."
          extra={
            <select value={areaSelId} onChange={e => setAreaSelId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              {areas.length === 0 && <option value="">Sin áreas</option>}
              {areas.map(a => <option key={a.asig.id} value={a.asig.id}>{a.asig.nombre_display}</option>)}
            </select>
          }
          ocupado={generando === 'acta'}
          deshabilitado={!areaSelId || alumnos.length === 0}
          onImprimir={() => generar('acta', docActa, 'imprimir')}
          onDescargar={() => generar('acta', docActa, 'descargar')}
        />
      </div>

      {/* Datos en bruto */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--azul-700)' }}>📊 Exportar calificaciones (CSV)</h2>
        <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.6 }}>
          Todas las notas del grupo con su área, criterio, instrumento, peso, trimestre y observación.
          Compatible con Excel, LibreOffice y Sheets.
        </p>
        <button className="btn-primary" onClick={exportarCSV} disabled={!!generando || areas.length === 0}>
          {generando === 'csv' ? 'Generando…' : '⬇️ Descargar CSV'}
        </button>
      </div>

      {/* Copia de seguridad */}
      <div className="card" style={{ border: '1px solid var(--azul-300)', background: 'linear-gradient(135deg, var(--azul-100), #f0fdf4)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--azul-700)' }}>
          🔒 Copia de seguridad local
        </h2>
        <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.6 }}>
          Tus datos (clases, alumnado, notas, programación, asistencia y evidencias) viven
          <strong> solo en este dispositivo</strong>. Descarga una copia cada cierto tiempo, aunque uses la{' '}
          <Link to="/sincronizar" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>sincronización</Link>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleExportarBackup} disabled={!!generando}>
            {generando === 'backup' ? 'Generando…' : '⬇️ Descargar copia de seguridad'}
          </button>
          <button className="btn-secondary" onClick={() => importRef.current?.click()} disabled={!!generando}>
            {generando === 'restaurar' ? 'Restaurando…' : '⬆️ Restaurar desde fichero'}
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportarBackup} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 10 }}>
          El fichero no sube a ningún servidor: es un JSON local que puedes guardar donde quieras.
        </p>
      </div>
    </>
  )
}

function Documento({ icono, titulo, texto, extra, ocupado, deshabilitado, onImprimir, onDescargar }: {
  icono: string; titulo: string; texto: string; extra?: React.ReactNode
  ocupado: boolean; deshabilitado: boolean
  onImprimir: () => void; onDescargar: () => void
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icono}</div>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 6, color: 'var(--azul-700)' }}>{titulo}</h2>
      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.6, flex: 1 }}>{texto}</p>
      {extra}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={onImprimir} disabled={ocupado || deshabilitado} style={{ fontSize: 13 }}>
          {ocupado ? 'Preparando…' : '🖨 Imprimir / PDF'}
        </button>
        <button className="btn-secondary" onClick={onDescargar} disabled={ocupado || deshabilitado} style={{ fontSize: 13 }}
          title="Descargar como fichero HTML autocontenido">
          ⬇️ HTML
        </button>
      </div>
    </div>
  )
}
