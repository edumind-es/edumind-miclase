import { useState, useCallback } from 'react'

export type AIStatus = 'idle' | 'descargando' | 'cargando' | 'listo' | 'generando' | 'error'

const MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC'

// Estado del motor a nivel de módulo (persiste entre renders y re-montajes)
let _engine: any = null
let _moduloStatus: AIStatus = 'idle'
// Petición de corte de la generación en curso. A nivel de módulo como el
// motor: el bucle de streaming lo consulta en cada trozo.
let _cancelado = false

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function useLocalAI() {
  const [status, setStatus] = useState<AIStatus>(() => _engine ? 'listo' : _moduloStatus)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const cargarModelo = useCallback(async () => {
    if (!hasWebGPU()) {
      setError('Tu navegador no soporta WebGPU. Usa Chrome o Edge en escritorio para IA local.')
      setStatus('error')
      return
    }
    if (_engine) { setStatus('listo'); return }
    if (_moduloStatus === 'descargando' || _moduloStatus === 'cargando') return

    try {
      _moduloStatus = 'descargando'
      setStatus('descargando')
      setProgress(0)

      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      _engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (p: any) => {
          const pct = Math.round((p.progress || 0) * 100)
          setProgress(pct)
          const nuevoStatus: AIStatus = p.text?.includes('Loading') ? 'cargando' : 'descargando'
          _moduloStatus = nuevoStatus
          setStatus(nuevoStatus)
        },
      })

      _moduloStatus = 'listo'
      setStatus('listo')
      setProgress(100)
    } catch (e: any) {
      _moduloStatus = 'error'
      _engine = null
      const msg = e.message || 'Error cargando el modelo IA'
      setError(msg)
      setStatus('error')
    }
  }, [])

  /**
   * Genera en streaming.
   *
   * Antes esperaba a la respuesta entera: entre uno y tres minutos con la
   * pantalla inmóvil, sin más señal que un botón que ponía «Generando…».
   * Parecía que la app se había colgado y el docente la cerraba a medias.
   * Ahora cada trozo se entrega según llega (`onTrozo`) y se puede cancelar.
   */
  const generate = useCallback(async (
    prompt: string,
    onTrozo?: (textoAcumulado: string) => void,
  ): Promise<string> => {
    if (!_engine) throw new Error('Modelo no cargado')
    setStatus('generando')
    _cancelado = false
    try {
      const flujo = await _engine.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente experto en educación española LOMLOE. Responde siempre en español con formato markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1200,
        stream: true,
      })

      let acumulado = ''
      for await (const trozo of flujo) {
        // Parar de verdad: sin esto el modelo sigue ocupando la GPU hasta
        // agotar los 1200 tokens aunque el docente ya haya cancelado.
        if (_cancelado) {
          try { await _engine.interruptGenerate?.() } catch { /* motor ya parado */ }
          break
        }
        const delta = trozo?.choices?.[0]?.delta?.content
        if (delta) {
          acumulado += delta
          onTrozo?.(acumulado)
        }
      }

      setStatus('listo')
      return acumulado
    } catch (e: any) {
      setStatus('listo')
      throw e
    } finally {
      _cancelado = false
    }
  }, [])

  /** Corta la generación en curso; el texto ya recibido se conserva. */
  const cancelar = useCallback(() => { _cancelado = true }, [])

  return {
    status,
    progress,
    error,
    supported: hasWebGPU(),
    isReady: _engine !== null && status === 'listo',
    cargarModelo,
    generate,
    cancelar,
  }
}
