import { Component, type ReactNode } from 'react'

/**
 * Rede de segurança: se um pedaço da interface quebrar, só ele vira um aviso
 * (em vez de o React desmontar a página inteira e deixar a tela preta).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; full?: boolean }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error('[ramwisp]', this.props.label ?? 'ui', err) }
  render() {
    if (!this.state.err) return this.props.children
    if (!this.props.full) return <div className="eb-inline mono">this part failed to load</div>
    return (
      <div className="eb-full">
        <p className="mono">Something broke on this page.</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
