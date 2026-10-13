/**
 * Emparejar dos dispositivos y sincronizarlos sin servidor.
 *
 * Un aparato invita —enseña un QR—, el otro lo escanea y devuelve el suyo.
 * Con eso queda abierto un canal directo entre los dos por el que viajan los
 * sobres cifrados. El servidor de EDUmind no participa en nada, ni siquiera
 * en presentarlos.
 *
 * Los dos aparatos tienen que estar en la misma red wifi. No se usa ningún
 * servidor de relevo, a propósito: pondría otra vez a un tercero por medio.
 */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import EscanerCodigo from './EscanerCodigo'
import {
  aceptarInvitacion, invitar, type Anfitrion, type Enlace, type EstadoEnlace, type Invitado,
} from '@/db/enlaceDirecto'
import {
  atenderEnlace, cerrarEnlace, compararContrasenaConElOtro, desbloquearPorEnlace,
  estrenarSincronizacionLocal, reenviarTodoSinServidor, sincronizarPorEnlace,
  unificarContrasenaPorEnlace, type ResultadoSync,
} from '@/db/sync'

type Paso =
  | 'inicio'
  | 'mostrando-invitacion'   // anfitrión: enseña su QR
  | 'leyendo-respuesta'      // anfitrión: escanea el QR del otro
  | 'leyendo-invitacion'     // invitado: escanea el QR del anfitrión
  | 'mostrando-respuesta'    // invitado: enseña el suyo y espera
  | 'contrasena'             // hace falta desbloquear este dispositivo
  | 'unificar'               // los dos tienen contraseña, y no es la misma
  | 'sincronizando'
  | 'hecho'

export default function EmparejarDirecto({ onCambio }: { onCambio?: () => void }) {
  const [paso, setPaso] = useState<Paso>('inicio')
  const [codigo, setCodigo] = useState('')
  const [imagenQR, setImagenQR] = useState('')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [resultado, setResultado] = useState<ResultadoSync | null>(null)
  // Si ninguno de los dos aparatos tiene contraseña todavia, hay que crearla
  // en vez de pedirla. Se sabe preguntandosela al otro al abrir el canal.
  const [estrenando, setEstrenando] = useState(false)
  // Un portatil con webcam mala puede no leer un QR denso de la pantalla de
  // un iPad. Siempre hay que poder pegar el codigo a mano.
  const [pegado, setPegado] = useState('')

  // Qué está pasando con la conexión, para que esperar no sea mirar una
  // pantalla quieta: «no pasa nada» y «está en ello» se veían igual.
  const [conexion, setConexion] = useState<EstadoEnlace>('esperando')
  const [segundos, setSegundos] = useState(0)
  const [nota, setNota] = useState('')
  /** Quién invitó. Rompe los empates: la contraseña la crea —o la pone— el anfitrión. */
  const papelRef = useRef<'anfitrion' | 'invitado'>('anfitrion')

  const anfitrionRef = useRef<Anfitrion | null>(null)
  const invitadoRef = useRef<Invitado | null>(null)
  const enlaceRef = useRef<Enlace | null>(null)

  // El QR se redibuja cada vez que cambia el código que hay que enseñar
  useEffect(() => {
    if (!codigo) { setImagenQR(''); return }
    QRCode.toDataURL(codigo, {
      width: 420,                 // holgado: el código es denso y hay que poder leerlo de una pantalla
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2d4a', light: '#ffffff' },
    }).then(setImagenQR).catch(() => setError('No se ha podido dibujar el código'))
  }, [codigo])

  // Segundero mientras se conecta y se pasan los datos
  useEffect(() => {
    if (paso !== 'sincronizando') { setSegundos(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setSegundos(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [paso])

  // Al desmontar, cerrar lo que haya quedado a medias
  useEffect(() => () => {
    anfitrionRef.current?.cancelar()
    invitadoRef.current?.cancelar()
    enlaceRef.current?.cerrar()
  }, [])

  const reiniciar = () => {
    anfitrionRef.current?.cancelar(); anfitrionRef.current = null
    invitadoRef.current?.cancelar(); invitadoRef.current = null
    enlaceRef.current?.cerrar(); enlaceRef.current = null
    setCodigo(''); setError(''); setPassword(''); setResultado(null); setNota('')
    setConexion('esperando')
    setPaso('inicio')
  }

  /** Con el canal ya abierto: desbloquear si hace falta y sincronizar. */
  const seguirConEnlace = async (enlace: Enlace) => {
    enlaceRef.current = enlace
    // A la escucha cuanto antes: el otro aparato puede preguntar enseguida.
    atenderEnlace(enlace)
    // Antes de pasar nada: ¿tienen los dos la misma contraseña? Sin esto, dos
    // aparatos con contraseñas creadas por separado «sincronizaban» sin poder
    // abrir nada del otro, y los intentos siguientes no mandaban nada.
    const concordancia = await compararContrasenaConElOtro(enlace)
    if (concordancia === 'ninguno' || concordancia === 'solo-alli') {
      setEstrenando(concordancia === 'ninguno')
      setPaso('contrasena')
      return
    }
    if (concordancia === 'distinta') {
      if (papelRef.current === 'invitado') { setPaso('unificar'); return }
      // Vale la de quien invitó. Lo que este aparato mandó antes el otro no
      // pudo abrirlo: se reenvía todo.
      await reenviarTodoSinServidor()
      setNota('El otro dispositivo tenía una contraseña de sincronización distinta. ' +
        'Te la está pidiendo: escribe allí la contraseña de ESTE dispositivo y quedarán unificadas.')
    }
    await sincronizar(enlace)
  }

  const sincronizar = async (enlace: Enlace) => {
    setPaso('sincronizando')
    try {
      setResultado(await sincronizarPorEnlace(enlace))
      setPaso('hecho')
      onCambio?.()
    } catch (e: any) {
      setError(e.message || 'No se ha podido sincronizar')
      setPaso('hecho')
    } finally {
      // Despedirse antes de colgar: si se cierra a secas, el otro aparato —que
      // está sincronizando a la vez— se queda escribiendo sobre un canal muerto.
      await cerrarEnlace(enlace)
      enlaceRef.current = null
    }
  }

  // ── Anfitrión ─────────────────────────────────────────────────────────

  const empezarInvitacion = async () => {
    setError('')
    try {
      const a = await invitar()
      papelRef.current = 'anfitrion'
      a.alCambiar(setConexion)
      anfitrionRef.current = a
      setCodigo(a.codigo)
      setPaso('mostrando-invitacion')
    } catch (e: any) {
      setError(e.message || 'No se ha podido preparar la invitación')
    }
  }

  const leerRespuesta = async (texto: string) => {
    setError('')
    setPaso('sincronizando')
    try {
      await seguirConEnlace(await anfitrionRef.current!.aceptarRespuesta(texto))
    } catch (e: any) {
      setError(e.message || 'No se ha podido conectar')
      setPaso('hecho')
    }
  }

  // ── Invitado ──────────────────────────────────────────────────────────

  const leerInvitacion = async (texto: string) => {
    setError('')
    try {
      const i = await aceptarInvitacion(texto)
      papelRef.current = 'invitado'
      i.alCambiar(setConexion)
      invitadoRef.current = i
      setCodigo(i.codigo)
      setPaso('mostrando-respuesta')
      // El canal se abre cuando el otro lea este QR; puede tardar lo que tarde
      void i.enlace.then(seguirConEnlace).catch((e: any) => {
        setError(e.message || 'No se ha podido conectar')
        setPaso('hecho')
      })
    } catch (e: any) {
      setError(e.message || 'Ese código no vale')
      setPaso('inicio')
    }
  }

  // ── Contraseña, si este aparato aún no está desbloqueado ──────────────

  const desbloquearYSincronizar = async () => {
    setError('')
    const enlace = enlaceRef.current
    if (!enlace) return
    try {
      if (paso === 'unificar') {
        await unificarContrasenaPorEnlace(password, enlace)
      } else if (estrenando) {
        // Los dos aparatos llegan aquí a la vez. Si cada uno creara la suya
        // saldrían dos contraseñas distintas —aunque tuvieran las mismas
        // letras— y ninguno podría abrir lo del otro. Así que la crea solo
        // quien invitó, y el otro la comprueba contra él.
        const ahora = await compararContrasenaConElOtro(enlace)
        if (ahora === 'solo-alli') {
          await desbloquearPorEnlace(password, enlace)
        } else if (papelRef.current === 'invitado') {
          setError('Crea primero la contraseña en el otro dispositivo (el que mostró el primer código). Después escribe aquí la misma.')
          return
        } else {
          if (password.length < 10) {
            setError('Usa al menos 10 caracteres: es la unica llave de tus datos.')
            return
          }
          await estrenarSincronizacionLocal(password)
        }
      } else {
        await desbloquearPorEnlace(password, enlace)
      }
      setPassword('')
      await sincronizar(enlace)
    } catch (e: any) {
      setError(e.message || 'No se ha podido desbloquear')
    }
  }

  // ── Pantalla ──────────────────────────────────────────────────────────

  const aviso = error && (
    <p role="alert" style={{
      marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
      background: 'var(--rojo-100)', color: 'var(--rojo-500)', whiteSpace: 'pre-line',
    }}>❌ {error}</p>
  )

  const codigoEnTexto = (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--gris-600)' }}>
        ¿La cámara no lee el código?
      </summary>
      <p style={{ fontSize: 13, color: 'var(--gris-600)', margin: '8px 0' }}>
        Copia este texto y pégalo en el otro dispositivo. Es el mismo contenido
        del QR: no lleva ningún dato de tu alumnado.
      </p>
      <textarea readOnly value={codigo} rows={4}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Código de emparejamiento en texto"
        style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 11 }} />
    </details>
  )

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        Sincronizar con otro dispositivo, sin servidor
      </h2>
      <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.6 }}>
        Los dos aparatos se pasan los datos directamente, sin que nada quede
        depositado en ningún sitio. Tienen que estar <strong>en la misma red
        wifi</strong>.
      </p>

      {paso === 'inicio' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={empezarInvitacion}>
            Invitar al otro dispositivo
          </button>
          <button className="btn" onClick={() => { setError(''); setPaso('leyendo-invitacion') }}>
            Escanear una invitación
          </button>
        </div>
      )}

      {(paso === 'mostrando-invitacion' || paso === 'mostrando-respuesta') && (
        <div>
          <p style={{ fontSize: 13.5, marginBottom: 10 }}>
            {paso === 'mostrando-invitacion'
              ? 'Escanea este código con el otro dispositivo, en Sincronizar → Escanear una invitación.'
              : 'Enseña este código al dispositivo que te invitó. En cuanto lo lea, los datos empiezan a viajar.'}
          </p>
          {imagenQR && (
            <img src={imagenQR} alt="Código de emparejamiento"
              style={{ width: 'min(420px, 100%)', imageRendering: 'pixelated', borderRadius: 8 }} />
          )}
          {codigoEnTexto}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            {paso === 'mostrando-invitacion' && (
              <button className="btn-primary" onClick={() => setPaso('leyendo-respuesta')}>
                Ya lo ha escaneado, leer su respuesta
              </button>
            )}
            {paso === 'mostrando-respuesta' && (
              <span role="status" style={{ fontSize: 13, color: 'var(--gris-600)', alignSelf: 'center' }}>
                {conexion === 'conectado' ? 'Conectado. Abriendo el canal…'
                  : conexion === 'caido' ? 'Se ha perdido el contacto con el otro dispositivo. Cancela y vuelve a emparejar.'
                  : 'Esperando a que el otro dispositivo lea este código… No cierres ni cambies de app.'}
              </span>
            )}
            <button className="btn" onClick={reiniciar}>Cancelar</button>
          </div>
        </div>
      )}

      {(paso === 'leyendo-invitacion' || paso === 'leyendo-respuesta') && (
        <div>
          <EscanerCodigo
            titulo={paso === 'leyendo-invitacion'
              ? 'Enfoca el código del otro dispositivo'
              : 'Enfoca el código que muestra el otro dispositivo'}
            onCodigo={paso === 'leyendo-invitacion' ? leerInvitacion : leerRespuesta}
            onCancelar={reiniciar} />

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--gris-600)' }}>
              Pegar el código a mano
            </summary>
            <p style={{ fontSize: 13, color: 'var(--gris-600)', margin: '8px 0' }}>
              Si la cámara no llega a leerlo, copia el texto que ofrece el otro
              dispositivo y pégalo aquí.
            </p>
            <textarea value={pegado} rows={4} onChange={(e) => setPegado(e.target.value)}
              placeholder="MICLASE1…" aria-label="Pegar el código de emparejamiento"
              style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 11 }} />
            <button type="button" className="btn" style={{ marginTop: 8 }}
              disabled={!pegado.trim()}
              onClick={() => {
                const texto = pegado.trim()
                setPegado('')
                void (paso === 'leyendo-invitacion' ? leerInvitacion(texto) : leerRespuesta(texto))
              }}>
              Usar este código
            </button>
          </details>
        </div>
      )}

      {(paso === 'contrasena' || paso === 'unificar') && (
        <div>
          <p style={{ fontSize: 13.5, marginBottom: 10, lineHeight: 1.55 }}>
            {paso === 'unificar'
              ? 'Los dos dispositivos tienen contraseñas de sincronización distintas ' +
                '(se crearon por separado), así que ninguno puede abrir los datos del otro. ' +
                'Para unificarlas, escribe aquí la contraseña del OTRO dispositivo: ' +
                'este pasará a usarla y se volverá a enviar todo. Tus datos de aquí no se tocan.'
              : estrenando && papelRef.current === 'invitado'
              ? 'Ninguno de los dos dispositivos tiene todavía contraseña de ' +
                'sincronización. Créala en el OTRO dispositivo (te la está pidiendo ahora) ' +
                'y después escribe aquí la misma.'
              : estrenando
              ? 'Ninguno de los dos dispositivos tiene todavía contraseña de ' +
                'sincronización. Elige una larga que puedas recordar: es la llave ' +
                'de tus datos y no hay forma de recuperarla. Después la escribirás ' +
                'también en el otro dispositivo.'
              : 'Este dispositivo todavía no está desbloqueado. Escribe la ' +
                'contraseña de sincronización: se comprueba contra el otro aparato, ' +
                'no contra ningún servidor.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="password" value={password}
              autoComplete={estrenando ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && password) void desbloquearYSincronizar() }}
              placeholder="Contraseña de sincronización"
              aria-label="Contraseña de sincronización"
              style={{ flex: '1 1 240px', minWidth: 200 }} />
            <button className="btn-primary" disabled={!password} onClick={desbloquearYSincronizar}>
              {paso === 'unificar' ? 'Unificar y sincronizar'
                : estrenando && papelRef.current === 'anfitrion' ? 'Crear contraseña y sincronizar'
                : 'Desbloquear y sincronizar'}
            </button>
            <button className="btn" onClick={reiniciar}>Cancelar</button>
          </div>
        </div>
      )}

      {paso === 'sincronizando' && (
        <div role="status" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          <p>
            {conexion === 'conectado'
              ? `Conectado. Pasando los datos… ${segundos}s`
              : `Buscando al otro dispositivo en la red… ${segundos}s`}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>
            {conexion === 'conectado'
              ? 'Con muchos datos o fotos puede tardar unos minutos. No cierres ni cambies de app en ninguno de los dos.'
              : 'Si en medio minuto no se encuentran, se explicará por qué.'}
          </p>
          {nota && <p style={{ fontSize: 12.5, color: '#92400e', marginTop: 6 }}>{nota}</p>}
        </div>
      )}

      {paso === 'hecho' && (
        <div>
          {resultado && (resultado.sinDescifrar ?? 0) > 0 && (
            <p role="alert" style={{
              marginBottom: 10, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
              background: 'var(--rojo-100)', color: 'var(--rojo-500)',
            }}>
              ❌ {resultado.sinDescifrar} registros del otro dispositivo no se han podido abrir:
              están cifrados con otra contraseña. Vuelve a emparejar para unificarlas.
            </p>
          )}
          {resultado && (
            <div style={{
              fontSize: 13, color: 'var(--gris-600)', background: 'var(--gris-100)',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <strong>Listo:</strong> {resultado.enviados} enviados ·{' '}
              {resultado.recibidos} recibidos · {resultado.aplicados} aplicados
              {resultado.fusionados > 0 && ` · ${resultado.fusionados} combinados`}
              {resultado.errores.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {resultado.errores.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                  {resultado.errores.length > 6 && <li>…y {resultado.errores.length - 6} más</li>}
                </ul>
              )}
            </div>
          )}
          <button className="btn" onClick={reiniciar} style={{ marginTop: 12 }}>
            Emparejar otra vez
          </button>
        </div>
      )}

      {aviso}
    </div>
  )
}
