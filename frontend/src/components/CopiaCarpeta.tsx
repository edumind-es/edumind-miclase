/**
 * Copia automática en una carpeta: activar, ver, hacer ahora y restaurar.
 *
 * En el Mac o el PC (Chrome y Edge) el docente elige una carpeta una vez; si
 * está dentro de iCloud Drive, Dropbox o OneDrive, la copia sale del
 * ordenador sola. En la app instalada se usa la carpeta de documentos de la
 * app, que aparece en Archivos y entra en la copia del aparato. Safari como
 * web no permite ninguna de las dos: se dice, y se señala la app o AirDrop.
 *
 * Regla de la pantalla: nada se queda callado. Cada acción termina diciendo
 * qué ha pasado, también cuando no había nada que copiar.
 */
import { useEffect, useRef, useState } from 'react'
import { claveGuardada, type ResultadoSync } from '@/db/sync'
import {
  destinoApp, destinoCarpeta, destinoGuardado, elegirCarpeta, guardarDestino, olvidarDestino,
  pedirPermisoDeCarpeta, soportaCarpeta, soportaCarpetaDeApp, type DestinoCopia,
} from '@/db/destinoCopia'
import { diagnostico, hacerCopia, inspeccionarCopia, restaurarDesdeCopia, ultimaCopia, ultimoErrorDeCopia } from '@/db/copia'
import type { Diagnostico } from '@/db/copiaFormato'

type Estado = {
  destino: DestinoCopia | null
  permiso: PermissionState
  handle?: FileSystemDirectoryHandle
  ultima: string | null
  error: string | null
  diag: Diagnostico | null
  tieneClave: boolean
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca'

export default function CopiaCarpeta({ onCambio, desbloqueado }: { onCambio?: () => void; desbloqueado?: boolean }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [trabajando, setTrabajando] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null)
  /** Restaurar: carpeta elegida, lo que hay en ella y la contraseña si hace falta. */
  const [restaurar, setRestaurar] = useState<{ destino: DestinoCopia; handle?: FileSystemDirectoryHandle; ficheros: number; necesitaContrasena: boolean; desde: string | null } | null>(null)
  const [password, setPassword] = useState('')
  const montado = useRef(true)
  // En desarrollo React monta, desmonta y vuelve a montar: si solo se pusiera
  // a false al desmontar, el segundo montaje se quedaba sin estado para siempre.
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])

  const refrescar = async () => {
    const d = await destinoGuardado()
    const [ultima, error, diag, tieneClave] = await Promise.all([ultimaCopia(), ultimoErrorDeCopia(), diagnostico(), claveGuardada()])
    if (!montado.current) return
    setEstado({ destino: d?.destino ?? null, permiso: d?.permiso ?? 'granted', handle: d?.handle, ultima, error, diag, tieneClave: !!tieneClave })
  }
  useEffect(() => { void refrescar() }, [desbloqueado])

  const decir = (r: { sobres: number; fichero: string | null }) =>
    setMsg({ tipo: 'ok', texto: r.sobres ? `Copia hecha: ${r.sobres} registro${r.sobres !== 1 ? 's' : ''} nuevo${r.sobres !== 1 ? 's' : ''} en ${r.fichero}.` : 'Copia comprobada: no había nada nuevo desde la última.' })

  const activar = async (tipo: 'carpeta' | 'app') => {
    setMsg(null); setTrabajando('activar')
    try {
      let destino: DestinoCopia
      if (tipo === 'carpeta') {
        const handle = await elegirCarpeta()
        await guardarDestino({ tipo: 'carpeta', handle })
        destino = destinoCarpeta(handle)
      } else {
        await guardarDestino({ tipo: 'app' })
        destino = destinoApp()
      }
      decir(await hacerCopia(destino))
      onCambio?.()
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg({ tipo: 'aviso', texto: 'No se ha elegido ninguna carpeta.' })
      else setMsg({ tipo: 'error', texto: e?.message ?? 'No se pudo activar la copia' })
    } finally { setTrabajando(''); await refrescar() }
  }

  const copiarAhora = async () => {
    if (!estado?.destino) return
    setMsg(null); setTrabajando('copiar')
    try {
      if (estado.handle && estado.permiso !== 'granted') {
        const p = await pedirPermisoDeCarpeta(estado.handle)
        if (p !== 'granted') { setMsg({ tipo: 'error', texto: 'El navegador no ha dado permiso para escribir en la carpeta.' }); return }
      }
      decir(await hacerCopia(estado.destino))
      onCambio?.()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e?.message ?? 'No se pudo hacer la copia' })
    } finally { setTrabajando(''); await refrescar() }
  }

  const desactivar = async () => {
    if (!confirm('Dejar de copiar automáticamente. Lo que ya está en la carpeta no se borra.\n\n¿Seguir?')) return
    await olvidarDestino()
    setMsg({ tipo: 'ok', texto: 'Copia automática desactivada. La carpeta se queda como está.' })
    await refrescar()
  }

  const elegirParaRestaurar = async (tipo: 'carpeta' | 'app') => {
    setMsg(null); setTrabajando('inspeccionar')
    try {
      const handle = tipo === 'carpeta' ? await elegirCarpeta() : undefined
      const destino = handle ? destinoCarpeta(handle) : destinoApp()
      const { manifiesto, ficheros, necesitaContrasena } = await inspeccionarCopia(destino)
      setRestaurar({ destino, handle, ficheros: ficheros.length, necesitaContrasena, desde: manifiesto.ultima })
      setPassword('')
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg({ tipo: 'aviso', texto: 'No se ha elegido ninguna carpeta.' })
      else setMsg({ tipo: 'error', texto: e?.message ?? 'No se pudo leer la carpeta' })
    } finally { setTrabajando('') }
  }

  const confirmarRestaurar = async () => {
    if (!restaurar) return
    setMsg(null); setTrabajando('restaurar')
    try {
      const r = await restaurarDesdeCopia(restaurar.destino, password || undefined)
      // La carpeta de la que se restaura pasa a ser la de copia: es lo que un
      // docente espera al recuperar su cuaderno en un aparato nuevo.
      if (!estado?.destino) await guardarDestino(restaurar.handle ? { tipo: 'carpeta', handle: restaurar.handle } : { tipo: 'app' })
      const res: ResultadoSync = r.resultado
      const partes = [
        `${r.ficheros} fichero${r.ficheros !== 1 ? 's' : ''} leído${r.ficheros !== 1 ? 's' : ''}`,
        `${res.aplicados} registro${res.aplicados !== 1 ? 's' : ''} restaurado${res.aplicados !== 1 ? 's' : ''}`,
        res.descartados ? `${res.descartados} ya estaban igual` : '',
        res.sinDescifrar ? `${res.sinDescifrar} no se pudieron descifrar (otra contraseña)` : '',
        res.errores.length ? `${res.errores.length} error${res.errores.length !== 1 ? 'es' : ''}: ${res.errores.slice(0, 3).join(' · ')}` : '',
      ].filter(Boolean)
      setMsg({ tipo: res.errores.length || res.sinDescifrar ? 'aviso' : 'ok', texto: `Restaurado desde «${restaurar.destino.nombre}»: ${partes.join(' · ')}.` })
      setRestaurar(null); setPassword('')
      onCambio?.()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e?.message ?? 'No se pudo restaurar' })
    } finally { setTrabajando(''); await refrescar() }
  }

  const web = soportaCarpeta()
  const app = soportaCarpetaDeApp()
  const puede = web || app
  const colorMsg = { ok: ['var(--verde-100)', 'var(--verde-500)'], error: ['var(--rojo-100)', 'var(--rojo-500)'], aviso: ['#fffbeb', '#92400e'] } as const

  return (
    <div className="card" data-copia-carpeta style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>💾 Copia automática en una carpeta</h2>
      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 10 }}>
        Una copia <strong>incremental y cifrada</strong> con tu contraseña de sincronización, escrita sola al abrir la app
        y cada pocos minutos. {web
          ? <>Elige una carpeta dentro de iCloud Drive, Dropbox o OneDrive y la copia sale del ordenador sin que hagas nada.</>
          : app
            ? <>Se guarda en la carpeta «MiClase copia» de la app, que ves en Archivos y entra en la copia de iCloud del aparato.</>
            : <>Este navegador no permite escribir en una carpeta (Safari no lo admite): usa Chrome o Edge en el ordenador, la app instalada en el iPad, o el fichero por AirDrop de arriba.</>}
      </p>

      {estado && (
        <div data-copia-estado style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
          {estado.destino ? (
            <>
              <div>Destino: <strong>{estado.destino.nombre}</strong> · última copia: <strong>{fecha(estado.ultima)}</strong></div>
              {estado.permiso !== 'granted' && (
                <div style={{ color: '#92400e' }}>El navegador ha retirado el permiso de la carpeta: pulsa «Copiar ahora» para volver a darlo.</div>
              )}
              {estado.error && <div style={{ color: 'var(--rojo-500)' }}>Última copia fallida: {estado.error}</div>}
            </>
          ) : (
            <div style={{ color: 'var(--gris-600)' }}>{estado.diag?.texto ?? 'Sin copia automática.'}</div>
          )}
        </div>
      )}

      {estado && !estado.tieneClave && puede && (
        <p style={{ fontSize: 12.5, color: '#92400e', marginBottom: 10 }}>
          Antes crea tu contraseña de sincronización (arriba, en «Enlace directo» o «Fichero»): es la que cifra la copia.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {estado?.destino ? (
          <>
            <button className="btn-primary" data-copia-ahora onClick={copiarAhora} disabled={!!trabajando || !estado.tieneClave}>
              {trabajando === 'copiar' ? 'Copiando…' : 'Copiar ahora'}
            </button>
            <button className="btn-secondary" onClick={desactivar} disabled={!!trabajando}>Desactivar</button>
          </>
        ) : (
          <>
            {web && <button className="btn-primary" data-copia-activar onClick={() => activar('carpeta')} disabled={!!trabajando || !estado?.tieneClave}>
              {trabajando === 'activar' ? 'Activando…' : 'Elegir carpeta y activar'}</button>}
            {app && <button className="btn-primary" data-copia-activar onClick={() => activar('app')} disabled={!!trabajando || !estado?.tieneClave}>
              {trabajando === 'activar' ? 'Activando…' : 'Activar en la carpeta de la app'}</button>}
          </>
        )}
        {puede && (
          <button className="btn-secondary" data-copia-restaurar onClick={() => elegirParaRestaurar(web ? 'carpeta' : 'app')} disabled={!!trabajando}>
            {trabajando === 'inspeccionar' ? 'Leyendo…' : 'Restaurar desde una copia…'}
          </button>
        )}
      </div>

      {restaurar && (
        <div data-copia-restaurar-form style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--azul-100)', fontSize: 13, lineHeight: 1.6 }}>
          <div>
            En «<strong>{restaurar.destino.nombre}</strong>» hay una copia con {restaurar.ficheros} fichero{restaurar.ficheros !== 1 ? 's' : ''}
            {restaurar.desde ? <>, la última del {fecha(restaurar.desde)}</> : null}. Restaurar <strong>no borra nada</strong> de lo que ya tienes:
            lo que falte se añade y lo que exista en los dos se fusiona. La carpeta quedará como destino de la copia automática.
          </div>
          {restaurar.necesitaContrasena && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--gris-600)' }}>Contraseña de sincronización con la que se hizo la copia</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
                style={{ width: '100%', marginTop: 4 }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" data-copia-restaurar-confirmar onClick={confirmarRestaurar}
              disabled={!!trabajando || (restaurar.necesitaContrasena && password.length < 1)}>
              {trabajando === 'restaurar' ? 'Restaurando…' : 'Restaurar'}
            </button>
            <button className="btn-secondary" onClick={() => setRestaurar(null)} disabled={!!trabajando}>Cancelar</button>
          </div>
        </div>
      )}

      {msg && (
        <div data-copia-msg style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: colorMsg[msg.tipo][0], color: colorMsg[msg.tipo][1] }}>
          {msg.tipo === 'ok' ? '✅ ' : msg.tipo === 'error' ? '❌ ' : '⚠️ '}{msg.texto}
        </div>
      )}
    </div>
  )
}
