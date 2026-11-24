/**
 * La lista de la app: lo que antes era un `<select>`.
 *
 * Un desplegable del sistema lo dibuja cada sistema a su manera, y MiClase va
 * a iOS, macOS, Windows, Linux y Android: nada visible debe depender de eso
 * (decisión de Luis, nov 2026). Esta lista es siempre la misma:
 *
 *  · en táctil o en pantalla estrecha sube como una hoja desde abajo, con
 *    filas altas para el dedo;
 *  · con ratón sale bajo su campo, sin salirse de la ventana.
 *
 * Se maneja como una lista de verdad (`listbox`): flechas, Inicio y Fin,
 * Intro o espacio para elegir, Esc para cerrar, y escribir para saltar a la
 * opción que lo contiene. Al cerrar, el foco vuelve al campo.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icono from './Icono'
import type { NombreIcono } from '@/iconos'

export interface OpcionLista<V> {
  valor: V
  texto: string
  /** Lo que se escribe en el campo cuando está elegida, si el texto entero no cabe. */
  enCampo?: string
  /** Dato pequeño a la derecha («22 alumnos», «en curso»). */
  meta?: string
  icono?: NombreIcono
  /** Algo delante del texto, en el campo y en la lista (la sigla de color de un área). */
  antes?: ReactNode
}

interface Props<V> {
  /** Cómo se llama la lista: se lee al abrirla y la anuncia el lector de pantalla. */
  etiqueta: string
  opciones: OpcionLista<V>[]
  /** La opción elegida. Sin ella (un menú de acciones) no se marca ninguna. */
  valor?: V | null
  alElegir: (valor: V, opcion: OpcionLista<V>) => void
  /** Contenido propio del campo, en vez de la opción elegida (el «Más» del menú). */
  children?: ReactNode
  className?: string
  /** Marca el campo como «estás aquí» (el «Más» de la barra inferior). */
  actual?: boolean
  [dato: `data-${string}`]: string | undefined
}

const esTactil = () => window.innerWidth < 700 || window.matchMedia?.('(pointer: coarse)').matches

export default function Lista<V>({ etiqueta, opciones, valor, alElegir, children, className, actual, ...datos }: Props<V>) {
  const [abierta, setAbierta] = useState(false)
  const [hoja, setHoja] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [sitio, setSitio] = useState<{ left: number; top: number; minWidth: number } | null>(null)
  const campo = useRef<HTMLButtonElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const tecleado = useRef({ texto: '', reloj: 0 })
  const id = useId()

  const elegida = opciones.findIndex(o => o.valor === valor)
  const opcionElegida = elegida >= 0 ? opciones[elegida] : null

  const abrir = () => { setHoja(!!esTactil()); setCursor(Math.max(0, elegida)); setSitio(null); setAbierta(true) }
  const cerrar = useCallback((devolverFoco = true) => {
    setAbierta(false)
    if (devolverFoco) campo.current?.focus()
  }, [])
  const elegir = (i: number) => { const o = opciones[i]; cerrar(); if (o) alElegir(o.valor, o) }

  // Bajo el campo, sin salirse de la ventana por la derecha ni por abajo
  useLayoutEffect(() => {
    if (!abierta) return
    if (!hoja && campo.current && caja.current) {
      const c = campo.current.getBoundingClientRect(), alto = caja.current.offsetHeight, ancho = Math.max(caja.current.offsetWidth, c.width)
      const abajo = c.bottom + 4
      setSitio({
        left: Math.max(8, Math.min(c.left, window.innerWidth - ancho - 8)),
        top: abajo + alto > window.innerHeight - 8 ? Math.max(8, c.top - alto - 4) : abajo,
        minWidth: c.width,
      })
    }
  }, [abierta, hoja])

  // El foco entra en la lista cuando ya se ve: mientras se coloca está oculta,
  // y a algo oculto no se le puede dar el foco
  useEffect(() => { if (abierta && (hoja || sitio)) lista.current?.focus() }, [abierta, hoja, sitio])

  // Pulsar fuera la cierra; cambiar el tamaño de la ventana, también
  useEffect(() => {
    if (!abierta) return
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (!caja.current?.contains(t) && !campo.current?.contains(t)) cerrar(false)
    }
    const cambia = () => cerrar(false)
    document.addEventListener('pointerdown', fuera)
    window.addEventListener('resize', cambia)
    return () => { document.removeEventListener('pointerdown', fuera); window.removeEventListener('resize', cambia) }
  }, [abierta, cerrar])

  useEffect(() => { if (abierta) lista.current?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' }) }, [abierta, cursor])

  const alTeclear = (e: React.KeyboardEvent) => {
    const n = opciones.length
    const mueve = (i: number) => { e.preventDefault(); setCursor(i) }
    if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); cerrar() }
    else if (e.key === 'Tab') cerrar()
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(cursor) }
    else if (e.key === 'ArrowDown') mueve(Math.min(n - 1, cursor + 1))
    else if (e.key === 'ArrowUp') mueve(Math.max(0, cursor - 1))
    else if (e.key === 'Home') mueve(0)
    else if (e.key === 'End') mueve(n - 1)
    else if (e.key.length === 1) {
      const t = tecleado.current
      window.clearTimeout(t.reloj)
      t.texto += e.key.toLowerCase()
      t.reloj = window.setTimeout(() => { t.texto = '' }, 900)
      const i = opciones.findIndex(o => o.texto.toLowerCase().includes(t.texto))
      if (i >= 0) mueve(i)
    }
  }

  return (
    <>
      <button ref={campo} type="button" {...datos}
        className={`lista-campo${children ? ' lista-campo--propio' : ''}${className ? ` ${className}` : ''}`}
        aria-haspopup="listbox" aria-expanded={abierta} aria-label={children ? etiqueta : `${etiqueta}: ${opcionElegida?.texto ?? ''}`}
        aria-current={actual ? 'page' : undefined}
        onClick={() => (abierta ? cerrar() : abrir())}>
        {children ?? <>{opcionElegida?.antes}<span className="lista-campo-texto">{opcionElegida ? (opcionElegida.enCampo ?? opcionElegida.texto) : ''}</span><Icono nombre="abajo" lado={14} /></>}
      </button>
      {abierta && createPortal(
        <div className="lista-capa" data-forma={hoja ? 'hoja' : 'campo'} data-lista-abierta
          style={hoja ? undefined : { left: sitio?.left ?? 0, top: sitio?.top ?? 0, minWidth: sitio?.minWidth, visibility: sitio ? 'visible' : 'hidden' }}
          onPointerDown={e => { if (e.target === e.currentTarget) cerrar(false) }}>
          <div className="lista-caja" ref={caja}>
            <p className="lista-titulo" id={id}>{etiqueta}</p>
            <ul ref={lista} role="listbox" tabIndex={-1} aria-labelledby={id} onKeyDown={alTeclear}>
              {opciones.map((o, i) => (
                <li key={i} role="option" aria-selected={i === elegida} className={i === cursor ? 'cursor' : undefined}
                  onClick={() => elegir(i)} onMouseMove={() => { if (i !== cursor) setCursor(i) }}>
                  {o.icono && <Icono nombre={o.icono} />}
                  {o.antes}
                  <span className="lista-opcion-texto">{o.texto}</span>
                  {o.meta && <span className="lista-opcion-meta">{o.meta}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
