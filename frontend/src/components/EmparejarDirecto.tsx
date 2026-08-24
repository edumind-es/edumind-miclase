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
  aceptarInvitacion, invitar, type Anfitrion, type Enlace, type Invitado,
} from '@/db/enlaceDirecto'
import {
  atenderEnlace, claveGuardada, desbloquearPorEnlace, estrenarSincronizacionLocal,
  sincronizarPorEnlace, type ResultadoSync,
} from '@/db/sync'

type Paso =
  | 'inicio'
  | 'mostrando-invitacion'   // anfitrión: enseña su QR
  | 'leyendo-respuesta'      // anfitrión: escanea el QR del otro
  | 'leyendo-invitacion'     // invitado: escanea el QR del anfitrión
  | 'mostrando-respuesta'    // invitado: enseña el suyo y espera
  | 'contrasena'             // hace falta desbloquear este dispositivo
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
    setCodigo(''); setError(''); setPassword(''); setResultado(null)
    setPaso('inicio')
  }

  /** Con el canal ya abierto: desbloquear si hace falta y sincronizar. */
  const seguirConEnlace = async (enlace: Enlace) => {
    enlaceRef.current = enlace
    // A la escucha cuanto antes: el otro aparato puede preguntar enseguida.
    atenderEnlace(enlace)
    if (!(await claveGuardada())) {
      const canal = atenderEnlace(enlace)
      const estado = await canal.estado().catch(() => null)
      setEstrenando(!estado?.iniciado)
      setPaso('contrasena')
      return
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
      enlace.cerrar()
    }
  }

  // ── Anfitrión ─────────────────────────────────────────────────────────

  const empezarInvitacion = async () => {
    setError('')
    try {
      const a = await invitar()
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
      if (estrenando) {
        if (password.length < 10) {
          setError('Usa al menos 10 caracteres: es la unica llave de tus datos.')
          return
        }
        await estrenarSincronizacionLocal(password)
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
      background: 'var(--rojo-100)', color: 'var(--rojo-500)',
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
              <span style={{ fontSize: 13, color: 'var(--gris-600)', alignSelf: 'center' }}>
                Esperando a que lo lea…
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

      {paso === 'contrasena' && (
        <div>
          <p style={{ fontSize: 13.5, marginBottom: 10 }}>
            {estrenando
              ? 'Ninguno de los dos dispositivos tiene todavía contraseña de ' +
                'sincronización. Elige una larga que puedas recordar: es la llave ' +
                'de tus datos y no hay forma de recuperarla.'
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
              {estrenando ? 'Crear contraseña y sincronizar' : 'Desbloquear y sincronizar'}
            </button>
            <button className="btn" onClick={reiniciar}>Cancelar</button>
          </div>
        </div>
      )}

      {paso === 'sincronizando' && (
        <p style={{ fontSize: 13.5 }}>Conectando y pasando los datos…</p>
      )}

      {paso === 'hecho' && (
        <div>
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
