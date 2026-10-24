/**
 * Barrera de errores de toda la app.
 *
 * Sin ella, una excepción al pintar cualquier pantalla —un diálogo que
 * tropieza con un dato inesperado— desmonta el árbol entero: la pantalla se
 * queda en blanco, o el diálogo «no se abre», y no hay forma de saber por
 * qué. Aquí se dice qué ha pasado, se ofrece recargar y se deja copiar el
 * error para contarlo. Los datos no corren peligro: viven en IndexedDB.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface Estado { error: Error | null; copiado: boolean }

export default class BarreraErrores extends Component<Props, Estado> {
  state: Estado = { error: null, copiado: false }

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MiClase] Error al pintar la pantalla:', error, info.componentStack)
  }

  private texto() {
    const e = this.state.error
    return `${e?.name ?? 'Error'}: ${e?.message ?? ''}\n${e?.stack ?? ''}`
  }

  private copiar = async () => {
    try {
      await navigator.clipboard.writeText(this.texto())
      this.setState({ copiado: true })
      setTimeout(() => this.setState({ copiado: false }), 2000)
    } catch { /* sin portapapeles: el texto está a la vista */ }
  }

  render() {
    const { error, copiado } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" data-barrera-errores style={{ maxWidth: 640, margin: '48px auto', padding: '0 20px', fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--azul-900, #1e3a5f)', margin: '0 0 8px' }}>Algo ha fallado al mostrar esta pantalla</h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--gris-700, #374151)', margin: '0 0 14px' }}>
          Tus datos están a salvo: viven en este dispositivo y no se han tocado. Recarga la app para
          seguir. Si vuelve a pasar, copia el error y envíalo con lo que estabas haciendo.
        </p>
        <pre style={{
          fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: 8, maxHeight: 220, overflow: 'auto', margin: '0 0 14px',
        }}>{error.name}: {error.message}</pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => location.reload()} style={{ fontSize: 13 }}>↻ Recargar la app</button>
          <button className="btn-secondary" onClick={this.copiar} style={{ fontSize: 13 }}>{copiado ? '✅ Copiado' : '📋 Copiar el error'}</button>
        </div>
      </div>
    )
  }
}
