/**
 * Asistente «¿Qué haces dentro de esta familia?».
 *
 * Propone lo habitual del área (en idioma, las destrezas; en cualquier área,
 * un examen por unidad, billete de salida, cuaderno…) con los criterios de
 * la familia prerrepartidos por las palabras de su enunciado. El docente
 * marca lo que hace, cambia nombres, y antes de crear nada ve qué criterios
 * quedarían sin ningún hijo. Puro trámite: crea hijos y fija sus criterios.
 */
import { useMemo, useState } from 'react'
import { crearInstrumentoHijo, fijarCriteriosDeHijo, type CriteriosDeFamiliaPorUnidad } from '@/db/queries'
import { plantillasParaArea, sugerirCriteriosParaHijo, criteriosSinCubrir, esLenguaExtranjera } from '@/ia/familiasPlantillas'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Instrumento } from '@/db/localDb'

interface Props {
  familia: Instrumento
  asignaturaNombre: string
  cobertura: CriteriosDeFamiliaPorUnidad[]
  criterios: { id: string; descripcion: string }[]
  yaExisten: string[]
  capa?: string
  onCerrar: (creados: number) => void
}

export default function AsistenteFamilia({ familia, asignaturaNombre, cobertura, criterios, yaExisten, capa, onCerrar }: Props) {
  const plantillas = useMemo(() => plantillasParaArea(asignaturaNombre), [asignaturaNombre])
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(
    // En idioma se marcan las destrezas; en el resto, nada: que elija.
    esLenguaExtranjera(asignaturaNombre)
      ? plantillas.map((p, i) => [p, i] as const).filter(([p]) => !p.porUnidad && p.claves.length > 0 && !yaExisten.includes(p.nombre)).map(([, i]) => i)
      : []))
  const [nombres, setNombres] = useState<Record<number, string>>({})
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsFamilia = useMemo(() => [...new Set(cobertura.flatMap(u => u.criterios))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [cobertura])
  const criteriosFamilia = useMemo(() => idsFamilia.map(id => ({ id, descripcion: criterios.find(c => c.id === id)?.descripcion ?? '' })), [idsFamilia, criterios])
  const nombreDe = (i: number) => (nombres[i] ?? plantillas[i].nombre).trim()
  const elegidas = plantillas.filter((_, i) => marcadas.has(i))
  const sinCubrir = criteriosSinCubrir(elegidas.filter(p => !p.porUnidad), criteriosFamilia)
  const hayPorUnidad = elegidas.some(p => p.porUnidad)
  const sinDescripciones = criterios.length === 0

  const alternar = (i: number) => setMarcadas(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s })

  const crear = async () => {
    setCreando(true); setError(null)
    let creados = 0
    try {
      for (const [i, p] of plantillas.entries()) {
        if (!marcadas.has(i)) continue
        if (p.porUnidad) {
          for (const u of cobertura) {
            const id = await crearInstrumentoHijo(familia.id!, { nombre: `${nombreDe(i)} · ${u.nombre}`, tipo: p.tipo })
            await fijarCriteriosDeHijo(u.unidad_id, id, u.criterios)
            creados++
          }
        } else {
          const id = await crearInstrumentoHijo(familia.id!, { nombre: nombreDe(i), tipo: p.tipo })
          for (const u of cobertura) {
            const deUnidad = u.criterios.map(c => ({ id: c, descripcion: criterios.find(x => x.id === c)?.descripcion ?? '' }))
            const suyos = sugerirCriteriosParaHijo(p, deUnidad)
            if (suyos.length) await fijarCriteriosDeHijo(u.unidad_id, id, suyos)
          }
          creados++
        }
      }
      onCerrar(creados)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear')
      setCreando(false)
    }
  }

  const cfgFam = getInstrConfig(familia.tipo)

  return (
    <div className="modal-overlay" style={capa ? { zIndex: capa } : { zIndex: 'var(--z-modal-anidado)' }}
      onClick={e => { if (e.target === e.currentTarget && !creando) onCerrar(0) }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Qué haces dentro de ${familia.nombre}`}
        style={{ width: 'min(680px, 96vw)', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${cfgFam.color}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)' }}>¿Qué haces dentro de «{familia.nombre}»?</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              La programación le da el {familia.peso} % y {idsFamilia.length} criterio{idsFamilia.length !== 1 ? 's' : ''}. Marca lo que haces de verdad: cada uno se queda con los criterios que le tocan y puedes retocarlos después.
            </div>
          </div>
          <button onClick={() => onCerrar(0)} className="modal-close" aria-label="Cerrar" disabled={creando}>✕</button>
        </div>

        <div style={{ padding: 18 }}>
          {sinDescripciones && (
            <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 10 }}>
              No se han podido leer los enunciados del currículo, así que solo se pueden repartir las plantillas que cubren todos los criterios. Las demás se crean vacías y las rellenas a mano.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plantillas.map((p, i) => {
              const cfg = getInstrConfig(p.tipo)
              const activo = marcadas.has(i)
              const ids = p.porUnidad ? [] : sugerirCriteriosParaHijo(p, criteriosFamilia)
              const existe = yaExisten.includes(nombreDe(i))
              return (
                <label key={p.nombre} data-plantilla={p.nombre} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', alignItems: 'start',
                  border: `1px solid ${activo ? cfg.color : 'var(--gris-300)'}`, borderLeft: `4px solid ${cfg.color}`,
                  background: activo ? cfg.bg : 'white', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={activo} onChange={() => alternar(i)} style={{ marginTop: 4 }} />
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span aria-hidden="true">{cfg.icon}</span>
                      <input value={nombres[i] ?? p.nombre} aria-label={`Nombre de ${p.nombre}`}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setNombres(n => ({ ...n, [i]: e.target.value }))}
                        style={{ fontSize: 13, fontWeight: 700, padding: '3px 7px', width: 200 }} />
                      <span style={{ fontSize: 11, color: 'var(--gris-500)' }}>{cfg.label}</span>
                      {existe && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>ya existe uno con este nombre</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 3 }}>{p.ayuda}</div>
                    <div data-plantilla-criterios style={{ fontSize: 11.5, marginTop: 4, color: 'var(--gris-900)' }}>
                      {p.porUnidad
                        ? <>Se crean <strong>{cobertura.length}</strong>: {cobertura.map(u => `${nombreDe(i)} · ${u.nombre}`).slice(0, 3).join(', ')}{cobertura.length > 3 ? '…' : ''}, cada uno con los criterios de su unidad.</>
                        : ids.length === 0
                          ? <span style={{ color: '#92400e' }}>Ningún criterio de la familia habla de esto: se crearía vacío, para marcarlos a mano.</span>
                          : <>Criterios: <strong>{ids.join(' · ')}</strong></>}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>

          {elegidas.length > 0 && !hayPorUnidad && sinCubrir.length > 0 && (
            <div data-sin-cubrir style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12, background: 'var(--azul-100)', color: 'var(--azul-900)', lineHeight: 1.5 }}>
              <strong>Sin dueño: {sinCubrir.join(', ')}.</strong> Ningún instrumento marcado los recoge; se seguirían calificando directamente con «{familia.nombre}», o se los puedes dar a alguno después.
            </div>
          )}
          {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12.5, marginTop: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <button data-asistente-crear className="btn-primary" onClick={crear} disabled={creando || elegidas.length === 0} style={{ fontSize: 13 }}>
              {creando ? 'Creando…' : `Crear ${elegidas.reduce((s, p) => s + (p.porUnidad ? cobertura.length : 1), 0)} instrumento${elegidas.reduce((s, p) => s + (p.porUnidad ? cobertura.length : 1), 0) !== 1 ? 's' : ''}`}
            </button>
            <button className="btn-secondary" onClick={() => onCerrar(0)} disabled={creando} style={{ fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
