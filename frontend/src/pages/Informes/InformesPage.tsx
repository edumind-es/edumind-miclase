import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { getGrupos, getCalificacionesPorGrupo, exportarDatos, importarDatos } from '@/db/queries'

type Grupo = { id: number; nombre: string; etapa: string; curso: string; curso_escolar: string }

export default function InformesPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoId, setGrupoId] = useState('')
  const [nAlumnos, setNAlumnos] = useState(0)
  const [nAsigs, setNAsigs] = useState(0)
  const [generando, setGenerando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

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
      setNAlumnos(alumnos.length)
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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
