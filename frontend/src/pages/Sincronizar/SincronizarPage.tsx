/**
 * Sincronización entre dispositivos.
 *
 * El servidor guarda sobres cifrados que no puede abrir. La contraseña de
 * sincronización nunca se envía: se usa en el navegador para derivar la
 * clave AES-256-GCM. Si el docente la pierde, nadie —tampoco EDUmind—
 * puede recuperar el contenido del buzón.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  consultarEstado, iniciarSincronizacion, desbloquear, sincronizar,
  claveGuardada, olvidarClave, ultimaSincronizacion, pendientesDeEnvio, reenviarTodo,
  type EstadoSync, type ResultadoSync,
} from '@/db/sync'
import { idDispositivo } from '@/db/ids'

const K_AUTO = 'miclase_sync_auto'

export default function SincronizarPage() {
  const { modo, headers, iniciarLogin, authConfig } = useAuth()

  const [estado, setEstado] = useState<EstadoSync | null>(null)
  const [errorEstado, setErrorEstado] = useState<string>('')
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null)
  const [ultimo, setUltimo] = useState<ResultadoSync | null>(null)
  const [ultimaFecha, setUltimaFecha] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState(0)
  const [auto, setAuto] = useState(() => localStorage.getItem(K_AUTO) === '1')

  const conectado = modo === 'authentik'

  const refrescar = async () => {
    setDesbloqueado(!!(await claveGuardada()))
    setUltimaFecha(await ultimaSincronizacion())
    setPendientes(await pendientesDeEnvio())
    if (!conectado) { setEstado(null); return }
    try {
      setEstado(await consultarEstado(headers))
      setErrorEstado('')
    } catch (e: any) {
      setEstado(null)
      setErrorEstado(e.message || 'No se pudo consultar el estado')
    }
  }

  useEffect(() => { refrescar() }, [modo])

  useEffect(() => { localStorage.setItem(K_AUTO, auto ? '1' : '0') }, [auto])

  // Sincronización automática: al abrir la página y cada 5 minutos
  useEffect(() => {
    if (!auto || !conectado || !desbloqueado) return
    const tic = () => { hacerSync(true) }
    tic()
    const id = window.setInterval(tic, 5 * 60_000)
    return () => window.clearInterval(id)
  }, [auto, conectado, desbloqueado])

  // ── Acciones ───────────────────────────────────────────────────────────

  const configurar = async () => {
    if (password.length < 10) {
      setMsg({ tipo: 'error', texto: 'Usa al menos 10 caracteres: es la única llave de tus datos.' })
      return
    }
    if (password !== password2) {
      setMsg({ tipo: 'error', texto: 'Las dos contraseñas no coinciden.' })
      return
    }
    setTrabajando(true); setMsg(null)
    try {
      await iniciarSincronizacion(password, headers)
      setPassword(''); setPassword2('')
      setMsg({ tipo: 'ok', texto: 'Sincronización activada. Ya puedes enviar tus datos.' })
      await refrescar()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally { setTrabajando(false) }
  }

  const abrir = async () => {
    setTrabajando(true); setMsg(null)
    try {
      await desbloquear(password, headers)
      setPassword('')
      setMsg({ tipo: 'ok', texto: 'Dispositivo desbloqueado.' })
      await refrescar()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally { setTrabajando(false) }
  }

  const hacerSync = async (silencioso = false) => {
    setTrabajando(true)
    if (!silencioso) setMsg(null)
    try {
      const r = await sincronizar(headers)
      setUltimo(r)
      if (!silencioso || r.aplicados > 0 || r.enviados > 0) {
        setMsg({
          tipo: r.errores.length ? 'info' : 'ok',
          texto: `Enviados ${r.enviados} · recibidos ${r.aplicados}` +
                 (r.errores.length ? ` · ${r.errores.length} con problemas` : ''),
        })
      }
      await refrescar()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally { setTrabajando(false) }
  }

  const bloquearDispositivo = async () => {
    if (!confirm('¿Bloquear la sincronización en este dispositivo?\n\nTus datos locales no se tocan. Tendrás que volver a escribir la contraseña para sincronizar.')) return
    await olvidarClave()
    await refrescar()
    setMsg({ tipo: 'info', texto: 'Sincronización bloqueada en este dispositivo.' })
  }

  const reenviar = async () => {
    if (!confirm('¿Volver a enviar TODOS tus datos al buzón?\n\nÚtil si sospechas que algo no llegó. Puede tardar.')) return
    await reenviarTodo()
    await hacerSync()
  }

  const reiniciarTodo = async () => {
    if (!confirm('⚠️ Esto BORRA el buzón del servidor y crea una contraseña nueva.\n\nLos demás dispositivos dejarán de sincronizar hasta que introduzcas la nueva contraseña en ellos.\nTus datos locales NO se borran.\n\n¿Continuar?')) return
    if (password.length < 10 || password !== password2) {
      setMsg({ tipo: 'error', texto: 'Escribe abajo la contraseña nueva dos veces (mínimo 10 caracteres).' })
      return
    }
    setTrabajando(true)
    try {
      await iniciarSincronizacion(password, headers, true)
      setPassword(''); setPassword2('')
      setMsg({ tipo: 'ok', texto: 'Buzón reiniciado. Envía tus datos de nuevo.' })
      await reenviarTodo()
      await refrescar()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally { setTrabajando(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <h1 className="page-title">Sincronizar entre dispositivos</h1>

      <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--azul-700)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-700)', marginBottom: 8 }}>
          🔐 Cómo funciona
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.65, marginBottom: 10 }}>
          Tus datos se cifran <strong>en este navegador</strong> antes de salir. El servidor guarda
          sobres que no puede abrir: no ve nombres, ni notas, ni fotos. Solo sabe cuántos sobres hay
          y de qué fecha son, lo justo para repartirlos entre tus dispositivos.
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.65 }}>
          La contraseña de sincronización <strong>no se envía nunca</strong> y no se puede recuperar.
          Si la pierdes, el contenido del buzón es irrecuperable — también para EDUmind. Sigue
          descargando tu <Link to="/informes" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>copia de seguridad</Link> de vez en cuando.
        </p>
      </div>

      {/* Requisito: sesión SSO */}
      {!conectado ? (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔑</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Necesitas iniciar sesión con EDUmind</h2>
          <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 18, maxWidth: 520, margin: '0 auto 18px' }}>
            La sincronización necesita saber de quién es cada buzón. Es lo único para lo que se usa
            tu cuenta: el contenido sigue siendo ilegible para el servidor.
            {' '}En modo local puedes seguir usando toda la app y las copias de seguridad manuales.
          </p>
          {authConfig?.enabled ? (
            <button className="btn-primary" onClick={iniciarLogin} style={{ padding: '10px 22px' }}>
              Conectar con EDUmind
            </button>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--ambar-500)' }}>
              Este servidor no tiene configurado el acceso con EDUmind.
            </p>
          )}
        </div>
      ) : (
        <>
          {errorEstado && (
            <div className="card" style={{ marginBottom: 16, padding: 16, background: 'var(--rojo-100)', color: 'var(--rojo-500)', fontSize: 13.5 }}>
              {errorEstado}
            </div>
          )}

          {/* Estado del dispositivo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Dato titulo="Este dispositivo" valor={desbloqueado ? 'Desbloqueado' : 'Bloqueado'}
              color={desbloqueado ? 'var(--verde-500)' : 'var(--ambar-500)'}
              pie={idDispositivo().slice(0, 8)} />
            <Dato titulo="Buzón en el servidor" valor={estado?.iniciado ? `${estado.registros} sobres` : 'Sin configurar'}
              color={estado?.iniciado ? 'var(--azul-700)' : 'var(--gris-500)'}
              pie={estado?.actualizado ? `actualizado ${estado.actualizado}` : undefined} />
            <Dato titulo="Pendientes de enviar" valor={String(pendientes)}
              color={pendientes > 0 ? 'var(--ambar-500)' : 'var(--verde-500)'} />
            <Dato titulo="Última sincronización"
              valor={ultimaFecha ? new Date(ultimaFecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca'}
              color="var(--gris-600)" />
          </div>

          {msg && (
            <div style={{
              marginBottom: 16, padding: '11px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 500,
              background: msg.tipo === 'ok' ? 'var(--verde-100)' : msg.tipo === 'error' ? 'var(--rojo-100)' : 'var(--azul-100)',
              color: msg.tipo === 'ok' ? 'var(--verde-500)' : msg.tipo === 'error' ? 'var(--rojo-500)' : 'var(--azul-700)',
            }}>
              {msg.tipo === 'ok' ? '✅ ' : msg.tipo === 'error' ? '❌ ' : 'ℹ️ '}{msg.texto}
            </div>
          )}

          {/* Configurar / desbloquear / sincronizar */}
          {!desbloqueado ? (
            <div className="card" style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                {estado?.iniciado ? 'Desbloquear este dispositivo' : 'Crear tu contraseña de sincronización'}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.6 }}>
                {estado?.iniciado
                  ? 'Escribe la misma contraseña que usaste en tu otro dispositivo. No se envía a ningún sitio: solo sirve para descifrar aquí.'
                  : 'Elige una contraseña larga que puedas recordar. Es la llave de todo tu buzón y no hay forma de recuperarla.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && estado?.iniciado) abrir() }}
                  placeholder="Contraseña de sincronización"
                  aria-label="Contraseña de sincronización"
                  autoComplete={estado?.iniciado ? 'current-password' : 'new-password'}
                  style={{ flex: '1 1 240px', minWidth: 200 }} />
                {!estado?.iniciado && (
                  <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                    placeholder="Repite la contraseña" aria-label="Repite la contraseña de sincronización"
                    autoComplete="new-password"
                    style={{ flex: '1 1 240px', minWidth: 200 }} />
                )}
                <button className="btn-primary" disabled={trabajando || !password}
                  onClick={estado?.iniciado ? abrir : configurar}>
                  {trabajando ? 'Trabajando…' : estado?.iniciado ? 'Desbloquear' : 'Activar sincronización'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <button className="btn-primary" onClick={() => hacerSync()} disabled={trabajando}
                  style={{ padding: '10px 22px', fontSize: 14.5 }}>
                  {trabajando ? 'Sincronizando…' : '🔄 Sincronizar ahora'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, cursor: 'pointer', color: 'var(--gris-600)' }}>
                  <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}
                    style={{ accentColor: 'var(--azul-700)', width: 16, height: 16 }} />
                  Sincronizar sola cada 5 minutos
                </label>
              </div>

              {ultimo && (
                <div style={{ fontSize: 13, color: 'var(--gris-600)', background: 'var(--gris-100)', borderRadius: 8, padding: '10px 14px' }}>
                  <strong>Último ciclo:</strong> {ultimo.enviados} enviados · {ultimo.recibidos} recibidos ·{' '}
                  {ultimo.aplicados} aplicados · {ultimo.descartados} ya estaban al día
                  {ultimo.conflictos > 0 && ` · ${ultimo.conflictos} versiones más antiguas descartadas`}
                  {ultimo.errores.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--rojo-500)', fontWeight: 600 }}>
                        {ultimo.errores.length} registro(s) con problemas
                      </summary>
                      <ul style={{ margin: '6px 0 0 18px', fontSize: 12, lineHeight: 1.6 }}>
                        {ultimo.errores.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cómo poner el segundo dispositivo */}
          {desbloqueado && (
            <div className="card" style={{ marginBottom: 18, background: 'var(--azul-100)', boxShadow: 'none' }}>
              <h2 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--azul-700)', marginBottom: 8 }}>
                📱 Añadir tu tablet o tu móvil
              </h2>
              <ol style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                <li>Abre <strong>miclase.edumind.es</strong> en el otro dispositivo e inicia sesión con EDUmind.</li>
                <li>Entra en <strong>Sincronizar</strong> y escribe la misma contraseña de sincronización.</li>
                <li>Pulsa <strong>Sincronizar ahora</strong>: se descargarán tus clases, alumnado y notas.</li>
              </ol>
              <p style={{ fontSize: 12.5, color: 'var(--gris-500)', marginTop: 10, lineHeight: 1.6 }}>
                Si evalúas a la vez desde dos dispositivos, gana siempre la última nota guardada.
                Cada dispositivo genera identificadores en su propio rango, así que nada se pisa.
              </p>
            </div>
          )}

          {/* Zona delicada */}
          {conectado && (
            <details className="card" style={{ borderLeft: '4px solid var(--rojo-500)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--rojo-500)' }}>
                Opciones avanzadas
              </summary>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {desbloqueado && (
                  <>
                    <Fila
                      titulo="Reenviar todo"
                      texto="Vuelve a subir todos tus datos al buzón, por si algo no llegó."
                      boton="Reenviar" onClick={reenviar} disabled={trabajando} />
                    <Fila
                      titulo="Bloquear este dispositivo"
                      texto="Olvida la clave aquí. Tus datos locales no se tocan."
                      boton="Bloquear" onClick={bloquearDispositivo} disabled={trabajando} />
                  </>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>Cambiar la contraseña de sincronización</div>
                  <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 8, lineHeight: 1.6 }}>
                    Borra el buzón del servidor y lo vuelve a crear con la contraseña nueva.
                    Tendrás que escribirla también en tus demás dispositivos. Tus datos locales no se borran.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Contraseña nueva" aria-label="Contraseña de sincronización nueva"
                      autoComplete="new-password" style={{ flex: '1 1 190px' }} />
                    <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                      placeholder="Repite la contraseña nueva" aria-label="Repite la contraseña de sincronización nueva"
                      autoComplete="new-password" style={{ flex: '1 1 190px' }} />
                    <button className="btn-danger" onClick={reiniciarTodo} disabled={trabajando}>
                      Cambiar y borrar buzón
                    </button>
                  </div>
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </>
  )
}

function Dato({ titulo, valor, color, pie }: { titulo: string; valor: string; color: string; pie?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gris-500)', marginBottom: 5 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color }}>{valor}</div>
      {pie && <div style={{ fontSize: 11, color: 'var(--gris-500)', marginTop: 3, fontFamily: 'monospace' }}>{pie}</div>}
    </div>
  )
}

function Fila({ titulo, texto, boton, onClick, disabled }: {
  titulo: string; texto: string; boton: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 260px' }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>{texto}</div>
      </div>
      <button className="btn-secondary" onClick={onClick} disabled={disabled}>{boton}</button>
    </div>
  )
}
