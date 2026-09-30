/**
 * Pasar los datos a otro dispositivo con un fichero, por AirDrop o similar.
 *
 * El emparejamiento por QR necesita que los dos aparatos compartan red wifi, y
 * muchas redes de centro aíslan a los clientes entre sí. Un fichero no
 * necesita red: sale por la hoja de compartir del sistema —AirDrop en iPad y
 * Mac, Quick Share en Android— y entra en el otro con el selector de siempre.
 *
 * Lo que viaja son los mismos sobres cifrados que se subirían al buzón: quien
 * no tenga la contraseña de sincronización no puede abrirlos. El fichero deja
 * a la vista lo mismo que ve el servidor —tabla, id y fecha— y nada más, así
 * que puede pasar por donde sea.
 *
 * Regla de esta pantalla: **nada se queda callado**. Cada acción termina
 * diciendo qué ha pasado, también cuando no ha pasado nada.
 */
import { useEffect, useRef, useState } from 'react'
import {
  aplicarPaquete, claveGuardada, desbloquearPorPaquete, empaquetarParaOtroDispositivo,
  estrenarSincronizacionLocal, leerPaquete, paqueteConOtraContrasena,
  unificarContrasenaPorPaquete, type ResultadoSync,
} from '@/db/sync'
import { EXTENSION, MIME, type PaqueteSync } from '@/db/transporteFichero'
import { compartirFichero, puedeCompartirFicheros } from '@/utils/compartir'

/** Por qué se pide contraseña antes de aplicar un paquete. */
type Pendiente = { paquete: PaqueteSync; motivo: 'desbloquear' | 'unificar' }

export default function CompartirPaquete({ onCambio, desbloqueado }: {
  onCambio?: () => void
  /** Lo sabe la pantalla: cambia cuando la contraseña se crea por el otro camino (el QR). */
  desbloqueado?: boolean
}) {
  const [trabajando, setTrabajando] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState<ResultadoSync | null>(null)
  /** Hay un «no hay nada nuevo» en pantalla: se ofrece enviarlo todo igualmente. */
  const [ofrecerTodo, setOfrecerTodo] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [password, setPassword] = useState('')
  // Un dispositivo sin contraseña de sincronización no puede ni enviar. Antes
  // solo se podía crear emparejando por QR: si el QR no funcionaba, esta vía
  // —que existe justo para cuando el QR no funciona— tampoco.
  const [tieneClave, setTieneClave] = useState<boolean | null>(null)
  const [creando, setCreando] = useState(false)
  const [nueva, setNueva] = useState('')
  const [nueva2, setNueva2] = useState('')
  const ficheroRef = useRef<HTMLInputElement>(null)

  const mirarClave = async () => setTieneClave(!!(await claveGuardada()))
  useEffect(() => { void mirarClave() }, [desbloqueado])

  const limpiar = () => { setError(''); setAviso(''); setResultado(null); setOfrecerTodo(false) }

  const crearContrasena = async () => {
    setError('')
    if (nueva.length < 10) { setError('Usa al menos 10 caracteres: es la única llave de tus datos.'); return }
    if (nueva !== nueva2) { setError('Las dos contraseñas no coinciden.'); return }
    await estrenarSincronizacionLocal(nueva)
    setNueva(''); setNueva2(''); setCreando(false)
    await mirarClave()
    setAviso('Contraseña creada en este dispositivo. Ya puedes enviar un paquete; en el otro te la pedirá al recibirlo.')
    onCambio?.()
  }

  const enviar = async (todo = false) => {
    limpiar()
    setTrabajando('enviando')
    try {
      const { paquete, deshacer } = await empaquetarParaOtroDispositivo({ todo })
      if (paquete.sobres.length === 0) {
        setAviso('No hay nada nuevo que pasar desde el último paquete.')
        setOfrecerTodo(true)
        return
      }
      const fecha = new Date().toISOString().slice(0, 10)
      let cual
      try {
        cual = await compartirFichero(
          `miclase-${fecha}${EXTENSION}`, JSON.stringify(paquete), MIME,
          'Datos de MiClase para otro dispositivo')
      } catch (e) {
        await deshacer()
        throw e
      }
      if (cual === 'cancelado') {
        // Empaquetar ya había dado estos registros por enviados: sin deshacer,
        // el siguiente intento decía que no había nada nuevo.
        await deshacer()
        setAviso('Envío cancelado: no se ha mandado nada. Puedes volver a intentarlo.')
        return
      }
      setAviso(cual === 'compartido'
        ? `Paquete enviado con ${paquete.sobres.length} registros. Ábrelo en el otro dispositivo con «Recibir un paquete».`
        : `Paquete descargado con ${paquete.sobres.length} registros (mira en Descargas). Pásalo al otro dispositivo y ábrelo allí con «Recibir un paquete».`)
      setOfrecerTodo(true)
    } catch (e: any) {
      setError(e.message || 'No se ha podido preparar el paquete')
    } finally {
      setTrabajando('')
    }
  }

  const aplicar = async (paquete: PaqueteSync) => {
    setTrabajando('recibiendo')
    try {
      const r = await aplicarPaquete(paquete)
      setResultado(r)
      setPendiente(null)
      setPassword('')
      // Siempre se dice qué ha pasado, también si no ha cambiado nada.
      if (r.recibidos === 0) setAviso('El paquete estaba vacío: no traía ningún registro.')
      else if ((r.sinDescifrar ?? 0) === 0 && r.aplicados === 0) setAviso(`El paquete traía ${r.recibidos} registros y este dispositivo ya los tenía todos al día.`)
      else if (r.aplicados > 0) setAviso(`Paquete aplicado: ${r.aplicados} registros nuevos o actualizados de ${r.recibidos}.`)
      await mirarClave()
      onCambio?.()
    } catch (e: any) {
      setError(e.message || 'No se ha podido aplicar el paquete')
    } finally {
      setTrabajando('')
    }
  }

  const recibir = async (fichero: File) => {
    limpiar()
    setTrabajando('recibiendo')
    try {
      const paquete = leerPaquete(await fichero.text())
      // Un dispositivo estrenado no tiene la clave: la contraseña la pide
      // aquí, y la sal para comprobarla viene en el propio paquete.
      if (!(await claveGuardada())) {
        setPendiente({ paquete, motivo: 'desbloquear' })
        setTrabajando('')
        return
      }
      // Con clave, pero no la del paquete: aplicarlo sería fallar en silencio
      // registro a registro. Se dice antes y se ofrece unificar.
      if (await paqueteConOtraContrasena(paquete)) {
        setPendiente({ paquete, motivo: 'unificar' })
        setTrabajando('')
        return
      }
      await aplicar(paquete)
    } catch (e: any) {
      setError(e.message || 'No se ha podido leer el fichero')
      setTrabajando('')
    }
  }

  const desbloquearYAplicar = async () => {
    if (!pendiente) return
    setError('')
    try {
      if (pendiente.motivo === 'unificar') await unificarContrasenaPorPaquete(password, pendiente.paquete)
      else await desbloquearPorPaquete(password, pendiente.paquete)
    } catch (e: any) {
      setError(e.message || 'No se ha podido desbloquear')
      return
    }
    await aplicar(pendiente.paquete)
  }

  const porHoja = puedeCompartirFicheros()

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        Pasar los datos con un fichero {porHoja ? '(AirDrop, Quick Share…)' : ''}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.6 }}>
        No hace falta que los dos aparatos compartan wifi: el paquete sale por la
        hoja de compartir del sistema y entra en el otro como un fichero más.
        Va cifrado con tu contraseña de sincronización, así que puede viajar por
        donde sea. Para igualarlos del todo, manda uno en cada sentido.
      </p>

      {tieneClave === false && !pendiente && (
        <div style={{ marginBottom: 14, padding: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: '#92400e', lineHeight: 1.55, marginBottom: 10 }}>
            <strong>Este dispositivo aún no tiene contraseña de sincronización.</strong>{' '}
            Si ya la creaste en el otro, no crees otra: pulsa «Recibir un paquete» con uno
            generado allí y escribe aquella. Si no la tienes en ninguno, créala aquí.
          </p>
          {!creando ? (
            <button className="btn-secondary" onClick={() => { limpiar(); setCreando(true) }}>
              Crear la contraseña en este dispositivo
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="password" value={nueva} autoComplete="new-password"
                placeholder="Contraseña nueva (mínimo 10)" aria-label="Contraseña de sincronización nueva"
                onChange={(e) => setNueva(e.target.value)} style={{ flex: '1 1 200px' }} />
              <input type="password" value={nueva2} autoComplete="new-password"
                placeholder="Repítela" aria-label="Repetir la contraseña nueva"
                onChange={(e) => setNueva2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void crearContrasena() }}
                style={{ flex: '1 1 200px' }} />
              <button className="btn-primary" onClick={crearContrasena}>Crear</button>
              <p style={{ flexBasis: '100%', fontSize: 12, color: 'var(--gris-600)' }}>
                Es la llave de tus datos y no se puede recuperar: apúntala. La misma servirá en todos tus dispositivos.
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => enviar()} disabled={!!trabajando || tieneClave === false}
          title={tieneClave === false ? 'Primero hace falta la contraseña de sincronización' : undefined}>
          {trabajando === 'enviando' ? 'Preparando…' : porHoja ? '📤 Enviar a otro dispositivo' : '📤 Descargar paquete'}
        </button>
        <button className="btn-secondary" onClick={() => { limpiar(); ficheroRef.current?.click() }} disabled={!!trabajando}>
          {trabajando === 'recibiendo' ? 'Aplicando…' : '📥 Recibir un paquete'}
        </button>
        {/* Sin `accept` a propósito: en iPadOS el selector filtra por el tipo
            declarado del fichero, no por la extensión que se escriba aquí, y
            bastaba con que ese tipo no se resolviera para que el paquete
            recibido por AirDrop saliera en gris y no hubiera forma de elegirlo.
            Quien decide de verdad si un fichero vale es `leerPaquete`, que mira
            el contenido y explica con claridad qué pasa cuando no lo es. */}
        <input
          ref={ficheroRef} type="file" hidden data-uso="paquete"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''          // permite volver a elegir el mismo fichero
            if (f) void recibir(f)
          }}
        />
      </div>

      {pendiente && (
        <div style={{ marginTop: 14, padding: 14, background: 'var(--azul-100)', borderRadius: 8 }}>
          <p style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.55 }}>
            {pendiente.motivo === 'unificar'
              ? 'Este paquete está cifrado con una contraseña distinta de la de este dispositivo ' +
                '(se crearon por separado). Para poder abrirlo, escribe la contraseña del dispositivo ' +
                'que lo generó: este pasará a usarla y volverá a enviarlo todo. Tus datos de aquí no se tocan.'
              : 'Este dispositivo aún no tiene la sincronización desbloqueada. Escribe la ' +
                'contraseña con la que se cifró el paquete.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password" value={password} autoComplete="current-password"
              placeholder="Contraseña de sincronización" aria-label="Contraseña del paquete"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void desbloquearYAplicar() }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn-primary" onClick={desbloquearYAplicar} disabled={!!trabajando}>
              {pendiente.motivo === 'unificar' ? 'Unificar y aplicar' : 'Desbloquear y aplicar'}
            </button>
            <button className="btn-secondary" onClick={() => { setPendiente(null); setPassword(''); setError('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
                    background: 'var(--verde-100)', color: 'var(--verde-500)' }}>✅ {aviso}</p>
      )}
      {ofrecerTodo && !trabajando && (
        <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--gris-600)' }}>
          ¿Un paquete anterior no llegó a abrirse en el otro dispositivo?{' '}
          <button onClick={() => enviar(true)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--azul-500)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5 }}>
            Enviar todo de nuevo
          </button>
        </p>
      )}
      {error && (
        <p role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
                                 background: 'var(--rojo-100)', color: 'var(--rojo-500)' }}>❌ {error}</p>
      )}
      {resultado && (resultado.sinDescifrar ?? 0) > 0 && (
        <p role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
                                 background: 'var(--rojo-100)', color: 'var(--rojo-500)' }}>
          ❌ {resultado.sinDescifrar} de {resultado.recibidos} registros no se han podido abrir: el paquete
          está cifrado con otra contraseña. Genera uno nuevo en el otro dispositivo y vuelve a recibirlo.
        </p>
      )}
      {resultado && resultado.recibidos > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gris-600)' }}>
          Recibidos {resultado.recibidos} · aplicados {resultado.aplicados}
          {resultado.fusionados > 0 && ` · fusionados ${resultado.fusionados}`}
          {resultado.descartados > 0 && ` · ya los tenías al día ${resultado.descartados}`}
          {resultado.errores.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--rojo-500)' }}>
              {resultado.errores.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
              {resultado.errores.length > 6 && <li>…y {resultado.errores.length - 6} más</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
