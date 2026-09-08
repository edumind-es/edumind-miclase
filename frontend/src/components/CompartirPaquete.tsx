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
 */
import { useRef, useState } from 'react'
import {
  aplicarPaquete, claveGuardada, desbloquearPorPaquete,
  empaquetarParaOtroDispositivo, leerPaquete, type ResultadoSync,
} from '@/db/sync'
import { EXTENSION, MIME, type PaqueteSync } from '@/db/transporteFichero'
import { compartirFichero, puedeCompartirFicheros } from '@/utils/compartir'

export default function CompartirPaquete({ onCambio }: { onCambio?: () => void }) {
  const [trabajando, setTrabajando] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState<ResultadoSync | null>(null)
  // Un paquete de un aparato que aún no tiene la contraseña puesta: hay que
  // pedírsela antes de poder descifrar nada de lo que trae.
  const [pendiente, setPendiente] = useState<PaqueteSync | null>(null)
  const [password, setPassword] = useState('')
  const ficheroRef = useRef<HTMLInputElement>(null)

  const limpiar = () => { setError(''); setAviso(''); setResultado(null) }

  const enviar = async () => {
    limpiar()
    setTrabajando('enviando')
    try {
      const { paquete, resultado: res } = await empaquetarParaOtroDispositivo()
      if (paquete.sobres.length === 0) {
        setAviso('No hay nada nuevo que pasar: el otro dispositivo ya tiene todo lo de este.')
        return
      }
      const fecha = new Date().toISOString().slice(0, 10)
      const cual = await compartirFichero(
        `miclase-${fecha}${EXTENSION}`,
        JSON.stringify(paquete),
        MIME,
        'Datos de MiClase para otro dispositivo',
      )
      if (cual === 'cancelado') return
      setResultado(res)
      setAviso(cual === 'compartido'
        ? `Paquete enviado con ${paquete.sobres.length} registros. Ábrelo en el otro dispositivo con «Recibir un paquete».`
        : `Paquete descargado con ${paquete.sobres.length} registros. Pásalo al otro dispositivo y ábrelo allí con «Recibir un paquete».`)
    } catch (e: any) {
      setError(e.message || 'No se ha podido preparar el paquete')
    } finally {
      setTrabajando('')
    }
  }

  const aplicar = async (paquete: PaqueteSync) => {
    setTrabajando('recibiendo')
    try {
      setResultado(await aplicarPaquete(paquete))
      setPendiente(null)
      setPassword('')
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
        setPendiente(paquete)
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
      await desbloquearPorPaquete(password, pendiente)
    } catch (e: any) {
      setError(e.message || 'No se ha podido desbloquear')
      return
    }
    await aplicar(pendiente)
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={enviar} disabled={!!trabajando}>
          {trabajando === 'enviando' ? 'Preparando…' : porHoja ? '📤 Enviar a otro dispositivo' : '📤 Descargar paquete'}
        </button>
        <button className="btn-secondary" onClick={() => { limpiar(); ficheroRef.current?.click() }} disabled={!!trabajando}>
          {trabajando === 'recibiendo' ? 'Aplicando…' : '📥 Recibir un paquete'}
        </button>
        <input
          ref={ficheroRef} type="file" accept={`${EXTENSION},application/json`} hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''          // permite volver a elegir el mismo fichero
            if (f) void recibir(f)
          }}
        />
      </div>

      {pendiente && (
        <div style={{ marginTop: 14, padding: 14, background: 'var(--azul-100)', borderRadius: 8 }}>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            Este dispositivo aún no tiene la sincronización desbloqueada. Escribe la
            contraseña con la que se cifró el paquete.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password" value={password} autoComplete="current-password"
              placeholder="Contraseña de sincronización"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void desbloquearYAplicar() }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn-primary" onClick={desbloquearYAplicar} disabled={!!trabajando}>
              Desbloquear y aplicar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
                    background: 'var(--verde-100)', color: 'var(--verde-500)' }}>✅ {aviso}</p>
      )}
      {error && (
        <p role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
                                 background: 'var(--rojo-100)', color: 'var(--rojo-500)' }}>❌ {error}</p>
      )}
      {resultado && (resultado.recibidos > 0 || resultado.aplicados > 0) && (
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--gris-600)' }}>
          Recibidos {resultado.recibidos} · aplicados {resultado.aplicados}
          {resultado.fusionados > 0 && ` · fusionados ${resultado.fusionados}`}
          {resultado.descartados > 0 && ` · descartados por ser más antiguos ${resultado.descartados}`}
        </p>
      )}
    </div>
  )
}
