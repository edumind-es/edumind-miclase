import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { getGrupos, getCalificacionesPorGrupo, getEvidenciasAlumno, exportarDatos, importarDatos } from '@/db/queries'
import type { Alumno } from '@/db/localDb'

type Grupo = { id: number; nombre: string; etapa: string; curso: string; curso_escolar: string }

function blobADataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export default function InformesPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoId, setGrupoId] = useState('')
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [alumnoSelId, setAlumnoSelId] = useState('')
  const [nAsigs, setNAsigs] = useState(0)
  const [generando, setGenerando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const nAlumnos = alumnos.length

  useEffect(() => {
    getGrupos().then(d => {
      setGrupos(d as unknown as Grupo[])
      if (d[0]) setGrupoId(String(d[0].id))
    })
  }, [])

  useEffect(() => {
    if (!grupoId) return
    getCalificacionesPorGrupo(Number(grupoId)).then(({ asignaturas, alumnos }) => {
      setNAsigs(asignaturas.length)
      setAlumnos(alumnos)
      setAlumnoSelId(alumnos[0]?.id ? String(alumnos[0].id) : '')
    })
  }, [grupoId])

  // ── CSV ──────────────────────────────────────────────────────────────

  const exportarCSV = async () => {
    if (!grupoId) return
    setGenerando(true); setMsg(null)
    try {
      const grupo = grupos.find(g => String(g.id) === grupoId)!
      const { asignaturas, alumnos, calificaciones } = await getCalificacionesPorGrupo(Number(grupoId))

      const instrById = new Map<number, { nombre: string; asignatura_id: number }>()
      for (const a of asignaturas) {
        for (const i of a.instrumentos) {
          if (i.id != null) instrById.set(i.id, { nombre: i.nombre, asignatura_id: a.id! })
        }
      }

      const filas: string[][] = [['Alumno', 'Asignatura', 'Instrumento', 'Criterio', 'Trimestre', 'Nota']]
      for (const cal of calificaciones) {
        if (cal.valor == null) continue
        const alumno = alumnos.find(a => a.id === cal.alumno_id)
        const instr = instrById.get(cal.instrumento_id)
        const asig = asignaturas.find(a => a.id === instr?.asignatura_id)
        if (!alumno || !asig) continue
        filas.push([
          `${alumno.apellidos}, ${alumno.nombre}`,
          asig.nombre_display,
          instr?.nombre || '',
          cal.criterio_id,
          String(cal.trimestre),
          String(cal.valor),
        ])
      }

      const csv = filas.map(f => f.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
      descargarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `calificaciones-${grupo.nombre}-${grupo.curso_escolar}.csv`)
      setMsg({ tipo: 'ok', texto: `CSV exportado: ${filas.length - 1} registros.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al exportar.' })
    } finally { setGenerando(false) }
  }

  // ── PDF boletín ───────────────────────────────────────────────────────

  const generarBoletin = async () => {
    if (!grupoId) return
    setGenerando(true); setMsg(null)
    try {
      const grupo = grupos.find(g => String(g.id) === grupoId)!
      const { asignaturas, alumnos, calificaciones } = await getCalificacionesPorGrupo(Number(grupoId))
      if (!alumnos.length) throw new Error('El grupo no tiene alumnos.')

      // Agrupar calificaciones: instrById → mediasPorAlumnoAsignaturaTrimestre
      const instrToAsig = new Map<number, number>()
      for (const a of asignaturas) {
        for (const i of a.instrumentos) {
          if (i.id != null && a.id != null) instrToAsig.set(i.id, a.id)
        }
      }

      // datos[alumno_id][asignatura_id][trimestre] = { suma, n }
      type Stats = { suma: number; n: number }
      const datos: Record<number, Record<number, Record<number, Stats>>> = {}
      for (const al of alumnos) { if (al.id != null) datos[al.id] = {} }
      for (const cal of calificaciones) {
        if (cal.valor == null || cal.alumno_id == null) continue
        const asigId = instrToAsig.get(cal.instrumento_id)
        if (!asigId) continue
        if (!datos[cal.alumno_id]) continue
        if (!datos[cal.alumno_id][asigId]) datos[cal.alumno_id][asigId] = {}
        if (!datos[cal.alumno_id][asigId][cal.trimestre]) datos[cal.alumno_id][asigId][cal.trimestre] = { suma: 0, n: 0 }
        datos[cal.alumno_id][asigId][cal.trimestre].suma += cal.valor
        datos[cal.alumno_id][asigId][cal.trimestre].n++
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, M = 18

      alumnos.forEach((alumno, idx) => {
        if (idx > 0) pdf.addPage()

        pdf.setFillColor(15, 45, 74)
        pdf.rect(0, 0, W, 28, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(16); pdf.setFont('helvetica', 'bold')
        pdf.text('EDUmind MiClase', M, 12)
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal')
        pdf.text(`Boletín de calificaciones — ${grupo.curso_escolar}`, M, 20)
        pdf.text(`${grupo.nombre} · ${grupo.etapa} · ${grupo.curso}º`, W - M, 20, { align: 'right' })

        pdf.setTextColor(15, 45, 74)
        pdf.setFontSize(14); pdf.setFont('helvetica', 'bold')
        pdf.text(`${alumno.apellidos}, ${alumno.nombre}`, M, 42)

        pdf.setDrawColor(200, 210, 220)
        pdf.line(M, 46, W - M, 46)

        let y = 54
        const COL = [M, 90, 115, 140, 165]
        const cabeceras = ['Asignatura', '1er Trim.', '2º Trim.', '3er Trim.', 'Media']

        pdf.setFillColor(230, 238, 248)
        pdf.rect(M - 2, y - 5, W - 2 * M + 4, 8, 'F')
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(15, 45, 74)
        cabeceras.forEach((c, i) => pdf.text(c, COL[i], y, { align: i === 0 ? 'left' : 'right' }))
        y += 6

        let alterno = false
        for (const asig of asignaturas) {
          if (alterno) { pdf.setFillColor(248, 250, 252); pdf.rect(M - 2, y - 4, W - 2 * M + 4, 7, 'F') }
          alterno = !alterno

          const asigStats = (alumno.id != null && asig.id != null) ? datos[alumno.id]?.[asig.id] || {} : {}
          const vals = [1, 2, 3].map(t => {
            const s = asigStats[t]
            return s ? Math.round((s.suma / s.n) * 10) / 10 : null
          })
          const conVal = vals.filter(v => v != null)
          const media = conVal.length ? Math.round(conVal.reduce((a, b) => a! + b!, 0)! / conVal.length * 10) / 10 : null

          pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 50, 60)
          pdf.text(asig.nombre_display.substring(0, 38), COL[0], y)
          ;[...vals, media].forEach((v, i) => {
            const txt = v != null ? String(v) : '—'
            const c = v == null ? [150, 150, 150] : v >= 5 ? [22, 101, 52] : [153, 27, 27]
            pdf.setTextColor(c[0], c[1], c[2])
            if (i === 3) pdf.setFont('helvetica', 'bold')
            pdf.text(txt, COL[i + 1], y, { align: 'right' })
          })
          y += 7
          if (y > 270) { pdf.addPage(); y = 20 }
        }

        pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150)
        pdf.text(`Generado por EDUmind MiClase · ${new Date().toLocaleDateString('es-ES')}`, W / 2, 285, { align: 'center' })
      })

      pdf.save(`boletin-${grupo.nombre}-${grupo.curso_escolar}.pdf`)
      setMsg({ tipo: 'ok', texto: `PDF generado: ${alumnos.length} boletín${alumnos.length !== 1 ? 'es' : ''}.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al generar PDF.' })
    } finally { setGenerando(false) }
  }

  // ── PDF informe individual (detalle por criterio + evidencias) ─────────

  const generarInformeIndividual = async () => {
    if (!grupoId || !alumnoSelId) return
    setGenerando(true); setMsg(null)
    try {
      const grupo = grupos.find(g => String(g.id) === grupoId)!
      const alumno = alumnos.find(a => String(a.id) === alumnoSelId)
      if (!alumno) throw new Error('Selecciona un alumno.')

      const { asignaturas, calificaciones } = await getCalificacionesPorGrupo(Number(grupoId))
      const instrToAsig = new Map<number, number>()
      for (const a of asignaturas) {
        for (const i of a.instrumentos) {
          if (i.id != null && a.id != null) instrToAsig.set(i.id, a.id)
        }
      }
      const propias = calificaciones.filter(c => c.alumno_id === alumno.id && c.valor != null)

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, M = 18
      let y = 0

      const cabecera = () => {
        pdf.setFillColor(15, 45, 74)
        pdf.rect(0, 0, W, 28, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(16); pdf.setFont('helvetica', 'bold')
        pdf.text('EDUmind MiClase', M, 12)
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal')
        pdf.text(`Informe individual — ${grupo.curso_escolar}`, M, 20)
        pdf.text(`${grupo.nombre} · ${grupo.etapa} · ${grupo.curso}º`, W - M, 20, { align: 'right' })
        y = 42
      }
      const saltoSiHaceFalta = (alto: number) => {
        if (y + alto > 278) { pdf.addPage(); y = 20 }
      }

      cabecera()
      pdf.setTextColor(15, 45, 74)
      pdf.setFontSize(14); pdf.setFont('helvetica', 'bold')
      pdf.text(`${alumno.apellidos}, ${alumno.nombre}`, M, y)
      y += 10

      // Detalle por asignatura → criterio → trimestres
      for (const asig of asignaturas) {
        const instrIds = new Set(asig.instrumentos.map(i => i.id))
        const deAsig = propias.filter(c => instrIds.has(c.instrumento_id))
        if (!deAsig.length) continue

        saltoSiHaceFalta(20)
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(42, 90, 140)
        pdf.text(asig.nombre_display, M, y)
        y += 6

        // medias por criterio y trimestre
        const porCriterio = new Map<string, Record<number, { suma: number; n: number }>>()
        for (const c of deAsig) {
          if (!porCriterio.has(c.criterio_id)) porCriterio.set(c.criterio_id, {})
          const t = porCriterio.get(c.criterio_id)!
          if (!t[c.trimestre]) t[c.trimestre] = { suma: 0, n: 0 }
          t[c.trimestre].suma += c.valor!
          t[c.trimestre].n++
        }

        const COL = [M, 120, 140, 160, 182]
        pdf.setFillColor(230, 238, 248)
        pdf.rect(M - 2, y - 4, W - 2 * M + 4, 7, 'F')
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(15, 45, 74)
        ;['Criterio', 'T1', 'T2', 'T3', 'Media'].forEach((h, i) =>
          pdf.text(h, COL[i], y, { align: i === 0 ? 'left' : 'right' }))
        y += 6

        for (const [criterio, trims] of [...porCriterio.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          saltoSiHaceFalta(8)
          const vals = [1, 2, 3].map(t => trims[t] ? Math.round(trims[t].suma / trims[t].n * 10) / 10 : null)
          const con = vals.filter(v => v != null) as number[]
          const media = con.length ? Math.round(con.reduce((a, b) => a + b, 0) / con.length * 10) / 10 : null
          pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 50, 60)
          pdf.text(criterio, COL[0], y)
          ;[...vals, media].forEach((v, i) => {
            const c = v == null ? [150, 150, 150] : v >= 5 ? [22, 101, 52] : [153, 27, 27]
            pdf.setTextColor(c[0], c[1], c[2])
            if (i === 3) pdf.setFont('helvetica', 'bold')
            pdf.text(v != null ? String(v) : '—', COL[i + 1], y, { align: 'right' })
            pdf.setFont('helvetica', 'normal')
          })
          y += 5.5
        }
        y += 4
      }

      // Observaciones registradas
      const conObs = propias.filter(c => c.observacion?.trim())
      if (conObs.length) {
        saltoSiHaceFalta(16)
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(42, 90, 140)
        pdf.text('Observaciones', M, y)
        y += 6
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 50, 60)
        for (const c of conObs) {
          const linea = `[${c.criterio_id} · T${c.trimestre}] ${c.observacion}`
          const partes = pdf.splitTextToSize(linea, W - 2 * M) as string[]
          saltoSiHaceFalta(partes.length * 4.5 + 2)
          pdf.text(partes, M, y)
          y += partes.length * 4.5 + 2
        }
        y += 4
      }

      // Evidencias fotográficas (hasta 6)
      const evidencias = await getEvidenciasAlumno(alumno.id!)
      if (evidencias.length) {
        saltoSiHaceFalta(60)
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(42, 90, 140)
        pdf.text(`Evidencias de aprendizaje (${evidencias.length})`, M, y)
        y += 6
        const ANCHO = 55, ALTO = 42, GAP = 5
        let col = 0
        for (const ev of evidencias.slice(0, 6)) {
          if (col === 3) { col = 0; y += ALTO + GAP }
          saltoSiHaceFalta(ALTO + 8)
          const dataUrl = await blobADataURL(ev.blob)
          const x = M + col * (ANCHO + GAP)
          try {
            pdf.addImage(dataUrl, 'JPEG', x, y, ANCHO, ALTO)
            pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120)
            pdf.text(
              `${new Date(ev.fecha).toLocaleDateString('es-ES')}${ev.criterio_id ? ' · ' + ev.criterio_id : ''}`,
              x, y + ALTO + 3.5,
            )
          } catch { /* imagen ilegible: continuar con las demás */ }
          col++
        }
        y += ALTO + 10
      }

      pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150)
      pdf.text(`Generado por EDUmind MiClase · ${new Date().toLocaleDateString('es-ES')}`, W / 2, 288, { align: 'center' })

      pdf.save(`informe-${alumno.apellidos.replace(/\s+/g, '_')}-${grupo.curso_escolar}.pdf`)
      setMsg({ tipo: 'ok', texto: `Informe de ${alumno.nombre} generado.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al generar el informe.' })
    } finally { setGenerando(false) }
  }

  // ── Backup / Restore ─────────────────────────────────────────────────

  const handleExportarBackup = async () => {
    setGenerando(true); setMsg(null)
    try {
      const json = await exportarDatos()
      descargarBlob(new Blob([json], { type: 'application/json' }), `miclase-backup-${new Date().toISOString().slice(0, 10)}.json`)
      setMsg({ tipo: 'ok', texto: 'Copia de seguridad descargada. Guárdala en un lugar seguro.' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al exportar.' })
    } finally { setGenerando(false) }
  }

  const handleImportarBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('¿Restaurar datos desde este backup? Se borrarán TODOS los datos actuales y se reemplazarán por los del fichero.')) {
      e.target.value = ''
      return
    }
    setGenerando(true); setMsg(null)
    try {
      const json = await file.text()
      await importarDatos(json)
      setMsg({ tipo: 'ok', texto: 'Datos restaurados correctamente. Recarga la página.' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al importar.' })
    } finally {
      setGenerando(false)
      e.target.value = ''
    }
  }

  function descargarBlob(blob: Blob, nombre: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nombre
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  return (
    <>
      <h1 className="page-title">Informes y datos</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Grupo:</label>
          <select value={grupoId} onChange={e => setGrupoId(e.target.value)} style={{ minWidth: 180 }}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} · {g.curso}º · {g.curso_escolar}</option>)}
          </select>
          <span style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            {nAlumnos} alumnos · {nAsigs} asignaturas
          </span>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8, fontSize: 13,
          background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)',
          color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)',
        }}>
          {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--azul-700)' }}>Informe individual</h2>
          <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.6 }}>
            PDF detallado de un alumno: notas por criterio y trimestre, observaciones y evidencias fotográficas.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={alumnoSelId} onChange={e => setAlumnoSelId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
              {alumnos.map(a => <option key={a.id} value={a.id}>{a.apellidos}, {a.nombre}</option>)}
            </select>
            <button className="btn-primary" onClick={generarInformeIndividual} disabled={generando || !alumnoSelId}>
              {generando ? 'Generando…' : '👤 Generar'}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--azul-700)' }}>Exportar calificaciones</h2>
          <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 16, lineHeight: 1.6 }}>
            CSV con todas las notas del grupo: alumno, asignatura, instrumento, criterio, trimestre. Compatible con Excel y Sheets.
          </p>
          <button className="btn-primary" onClick={exportarCSV} disabled={generando || nAsigs === 0 || nAlumnos === 0}>
            {generando ? 'Generando…' : '⬇️ Descargar CSV'}
          </button>
        </div>

        <div className="card">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--azul-700)' }}>Boletín PDF</h2>
          <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 16, lineHeight: 1.6 }}>
            Un boletín por alumno con medias trimestrales por asignatura. Listo para imprimir o enviar.
          </p>
          <button className="btn-primary" onClick={generarBoletin} disabled={generando || nAsigs === 0 || nAlumnos === 0}>
            {generando ? 'Generando PDF…' : '📄 Generar boletines'}
          </button>
        </div>
      </div>

      {/* Backup local — sección LOPD-safe */}
      <div className="card" style={{ border: '1px solid var(--azul-300)', background: 'linear-gradient(135deg, var(--azul-100), #f0fdf4)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--azul-700)' }}>
          🔒 Copia de seguridad local
        </h2>
        <p style={{ fontSize: 13, color: 'var(--gris-700)', marginBottom: 14, lineHeight: 1.6 }}>
          Todos tus datos (grupos, alumnos, notas, asistencia) están guardados <strong>solo en este dispositivo</strong>, sin pasar por ningún servidor.
          Descarga una copia periódicamente para no perder nada si cambias de dispositivo o navegador.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleExportarBackup} disabled={generando}>
            ⬇️ Descargar copia de seguridad
          </button>
          <button className="btn-secondary" onClick={() => importRef.current?.click()} disabled={generando}>
            ⬆️ Restaurar desde fichero
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportarBackup} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--gris-600)', marginTop: 10 }}>
          El fichero de backup no sube a ningún servidor. Es un JSON local que puedes guardar en tu carpeta, nube personal, USB…
        </p>
      </div>
    </>
  )
}
