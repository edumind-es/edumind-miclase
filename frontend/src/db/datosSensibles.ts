/**
 * Datos sensibles: el indicador NEAE y las evidencias en foto, audio y vídeo.
 *
 * Los dos vienen APAGADOS en un aparato nuevo. El indicador NEAE puede revelar
 * salud o discapacidad (art. 9 RGPD) y las evidencias son imagen y voz de
 * menores; el anteproyecto de Lei de educación dixital (arts. 17.4 y 31.5)
 * pide autorización y «extremar precauciones». Quien los necesite los
 * enciende a sabiendas desde Alumnado.
 *
 * Un aparato que ya tenga alumnado marcado o evidencias guardadas los
 * conserva encendidos la primera vez que se resuelve, para que actualizar la
 * app no esconda nada a quien ya los usaba. Desde ahí manda la elección.
 *
 * Apagar no borra nada: la app deja de ofrecer marcar y capturar, y deja de
 * enseñarlos (también en los informes). Los datos se conservan y vuelven a
 * verse al encender. Es una preferencia del aparato, no un dato del aula: no
 * se sincroniza.
 */
import { useEffect, useState } from 'react'
import { db } from './localDb'

export type DatosSensibles = { neae: boolean; evidencias: boolean }

const CLAVE = 'miclase.sensibles'
const EVENTO = 'miclase:sensibles'
const APAGADOS: DatosSensibles = { neae: false, evidencias: false }

function leer(): DatosSensibles | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    return v && typeof v === 'object' ? { neae: v.neae === true, evidencias: v.evidencias === true } : null
  } catch { return null }
}

function escribir(d: DatosSensibles) {
  try { localStorage.setItem(CLAVE, JSON.stringify(d)) } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: d }))
}

/** Lo que se sepa ya sin esperar; sin elección guardada, apagados. */
export function datosSensiblesAhora(): DatosSensibles {
  return leer() ?? APAGADOS
}

/**
 * Para pintar el sello NEAE sin montar un hook en cada fila: lee la elección
 * ya resuelta (App la resuelve al arrancar).
 */
export function verNeae(): boolean {
  return datosSensiblesAhora().neae
}

export function verEvidencias(): boolean {
  return datosSensiblesAhora().evidencias
}

/** Lo que hay guardado en este aparato, para decir qué se esconde al apagar. */
export async function contarDatosSensibles(): Promise<{ neae: number; evidencias: number }> {
  const [neae, evidencias] = await Promise.all([
    db.alumnos.filter(a => !a.deleted_at && !!a.neae).count(),
    db.evidencias.filter(e => !e.deleted_at).count(),
  ])
  return { neae, evidencias }
}

/**
 * La elección del aparato. La primera vez la decide lo que ya hay guardado
 * (encendido si hay algo, apagado si no) y se queda escrita.
 */
export async function resolverDatosSensibles(): Promise<DatosSensibles> {
  const guardado = leer()
  if (guardado) return guardado
  let d = APAGADOS
  try {
    const n = await contarDatosSensibles()
    d = { neae: n.neae > 0, evidencias: n.evidencias > 0 }
  } catch { /* sin base todavía: apagados */ }
  escribir(d)
  return d
}

export function fijarDatosSensibles(cambio: Partial<DatosSensibles>) {
  escribir({ ...datosSensiblesAhora(), ...cambio })
}

/** Para las pantallas: se actualiza en todas a la vez al cambiar la elección. */
export function useDatosSensibles(): DatosSensibles {
  const [d, setD] = useState<DatosSensibles>(datosSensiblesAhora)
  useEffect(() => {
    let vivo = true
    resolverDatosSensibles().then(r => { if (vivo) setD(r) })
    const oir = (e: Event) => setD((e as CustomEvent<DatosSensibles>).detail)
    window.addEventListener(EVENTO, oir)
    return () => { vivo = false; window.removeEventListener(EVENTO, oir) }
  }, [])
  return d
}
