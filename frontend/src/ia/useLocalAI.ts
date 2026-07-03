import { useState, useCallback } from 'react'

export type AIStatus = 'idle' | 'descargando' | 'cargando' | 'listo' | 'generando' | 'error'

const MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC'

// Estado del motor a nivel de módulo (persiste entre renders y re-montajes)
let _engine: any = null
let _moduloStatus: AIStatus = 'idle'

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

  const generate = useCallback(async (prompt: string): Promise<string> => {
    if (!_engine) throw new Error('Modelo no cargado')
    setStatus('generando')
    try {
      const resp = await _engine.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente experto en educación española LOMLOE. Responde siempre en español con formato markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      })
      setStatus('listo')
      return resp.choices[0].message.content || ''
    } catch (e: any) {
      setStatus('listo')
      throw e
    }
  }, [])

  return {
    status,
    progress,
    error,
    supported: hasWebGPU(),
    isReady: _engine !== null && status === 'listo',
    cargarModelo,
    generate,
  }
}
