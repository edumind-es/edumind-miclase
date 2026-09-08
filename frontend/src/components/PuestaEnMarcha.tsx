/**
 * Asistente de puesta en marcha de una clase.
 *
 * Vivía dentro del Inicio y ocupaba la pantalla entera cada mañana. Ahora es
 * un aviso: mientras falte algo se ve desplegado, y cuando la clase está lista
 * se pliega a una línea. La misma lista sirve en la configuración de la clase.
 */
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { PasoEstado } from '@/db/queries'

export type Paso = {
  n: number
  titulo: string
  explicacion: string
  hecho: boolean
  cta: string
  destino: string
  detalle?: string
}

export function construirPasos(e: PasoEstado): Paso[] {
  const g = e.grupoPrincipalId
  // Los tres pasos de configuración llevan a su pestaña, no a un scroll largo
  const areas = g ? `/grupos/${g}?pestana=areas` : '/grupos'
  return [
    {
      n: 1,
      titulo: 'Crea tu clase',
      explicacion: 'Un grupo por cada clase que impartes: nombre, curso, etapa y comunidad autónoma. La comunidad determina qué currículo LOMLOE se carga.',
      hecho: e.grupos > 0,
      cta: e.grupos > 0 ? 'Ver mis clases' : 'Crear la primera clase',
      destino: e.grupos > 0 ? '/grupos' : '/grupos/nuevo',
      detalle: e.grupos > 0 ? `${e.grupos} clase${e.grupos !== 1 ? 's' : ''}` : undefined,
    },
    {
      n: 2,
      titulo: 'Añade tu alumnado',
      explicacion: 'Escribe la lista o pégala de un tirón desde tu documento. Cada alumno recibe un código anónimo para el QR de mesa; los nombres nunca salen de este dispositivo.',
      hecho: e.alumnos > 0,
      cta: 'Gestionar alumnado',
      destino: '/alumnos',
      detalle: e.alumnos > 0 ? `${e.alumnos} alumnos` : undefined,
    },
    {
      n: 3,
      titulo: 'Elige las áreas que impartes',
      explicacion: 'Marca de una vez todas las áreas de esa clase. Aparecerán como pestañas en Evaluación, cada una con sus criterios LOMLOE ya cargados.',
      hecho: e.asignaturas > 0,
      cta: 'Elegir áreas',
      destino: areas,
      detalle: e.asignaturas > 0 ? `${e.asignaturas} áreas` : undefined,
    },
    {
      n: 4,
      titulo: 'Monta la programación',
      explicacion: 'Reparte los criterios de evaluación entre tus unidades o situaciones de aprendizaje. Puedes generar la estructura automáticamente y ajustarla después.',
      hecho: e.unidades > 0 && e.criteriosVinculados > 0,
      cta: 'Ir a programación',
      destino: areas,
      detalle: e.unidades > 0 ? `${e.unidades} unidades · ${e.criteriosVinculados} criterios` : undefined,
    },
    {
      n: 5,
      titulo: 'Di con qué evalúas cada criterio',
      explicacion: 'Asigna a cada criterio su instrumento: prueba, rúbrica, observación, trabajo… Es lo que hará que al pulsar una casilla del calificador sepas exactamente con qué estás evaluando.',
      hecho: e.criteriosConInstrumento > 0,
      cta: 'Asignar instrumentos',
      destino: areas,
      detalle: e.criteriosConInstrumento > 0
        ? `${e.criteriosConInstrumento} criterios con instrumento`
        : (e.instrumentos > 0 ? `${e.instrumentos} instrumentos creados, sin asignar` : undefined),
    },
    {
      n: 6,
      titulo: 'Evalúa',
      explicacion: 'Ya puedes calificar en la matriz, o imprimir el QR de cada mesa y evaluar desde el móvil escaneando: nota, observación y foto de la producción en pocos segundos.',
      hecho: e.calificaciones > 0,
      cta: 'Abrir el calificador',
      destino: '/evaluacion',
      detalle: e.calificaciones > 0 ? `${e.calificaciones} calificaciones registradas` : undefined,
    },
  ]
}

export default function PuestaEnMarcha({ estado, nombreClase }: {
  estado: PasoEstado
  nombreClase?: string
}) {
  const pasos = construirPasos(estado)
  const completados = pasos.filter(p => p.hecho).length
  const siguiente = pasos.find(p => !p.hecho)
  const todoListo = !siguiente

  const [abierto, setAbierto] = useState(!todoListo)
  // Al cambiar de clase la respuesta cambia: una puede estar lista y la otra no.
  useEffect(() => { setAbierto(!todoListo) }, [todoListo, estado.grupoPrincipalId])

  return (
    <div className="card" style={{ marginBottom: 22, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, width: '100%',
          padding: '14px 20px', cursor: 'pointer', border: 'none', borderRadius: 0,
          textAlign: 'left', font: 'inherit',
          background: todoListo ? 'var(--verde-100)' : 'var(--azul-100)',
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden="true">{todoListo ? '✅' : '🧭'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: todoListo ? 'var(--verde-500)' : 'var(--azul-900)' }}>
            {todoListo
              ? `${nombreClase ?? 'La clase'} está lista para evaluar`
              : `Falta configurar ${nombreClase ?? 'esta clase'} — paso ${siguiente!.n} de ${pasos.length}`}
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--gris-600)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {todoListo ? 'Puedes reabrir esta guía cuando quieras.' : siguiente!.titulo}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ width: 100, height: 6, background: 'var(--gris-300)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{
              display: 'block', width: `${(completados / pasos.length) * 100}%`, height: '100%',
              background: todoListo ? 'var(--verde-500)' : 'var(--azul-700)', transition: 'width .3s',
            }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-600)' }}>{completados}/{pasos.length}</span>
          <span style={{ color: 'var(--gris-600)' }} aria-hidden="true">{abierto ? '▲' : '▼'}</span>
        </span>
      </button>

      {abierto && (
        <div style={{ padding: '6px 20px 18px' }}>
          {pasos.map(p => {
            const esSiguiente = siguiente?.n === p.n
            return (
              <div key={p.n} style={{
                display: 'flex', gap: 14, padding: '12px 0',
                borderBottom: p.n < pasos.length ? '1px solid var(--gris-100)' : 'none',
                opacity: p.hecho && !esSiguiente ? .72 : 1,
              }}>
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: p.hecho ? 'var(--verde-500)' : esSiguiente ? 'var(--azul-700)' : 'var(--gris-300)',
                  color: p.hecho || esSiguiente ? 'white' : 'var(--gris-600)',
                }}>
                  {p.hecho ? '✓' : p.n}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {p.titulo}
                    {p.detalle && (
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--gris-500)' }}>
                        · {p.detalle}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.55 }}>
                    {p.explicacion}
                  </div>
                </div>
                <Link to={p.destino}
                  style={{
                    flexShrink: 0, alignSelf: 'center', fontSize: 12.5, padding: '7px 14px',
                    borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
                    ...(esSiguiente
                      ? { background: 'var(--azul-700)', color: 'white' }
                      : { background: 'var(--gris-100)', color: 'var(--gris-600)', border: '1px solid var(--gris-300)' }),
                  }}>
                  {p.cta} →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
