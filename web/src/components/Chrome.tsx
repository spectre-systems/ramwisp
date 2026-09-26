import { Link } from 'react-router-dom'
import { useSession } from '../session'
import { Logo, ThemeToggle } from './ui'

export function Nav() {
  const { me } = useSession()
  return (
    <nav className="nav">
      <Logo />
      <div className="links">
        <a href="/#como">How it works</a>
        <a href="/#privacidade">Privacy</a>
        <a href="/#precos">Pricing</a>
        <Link to="/transparencia">Transparency</Link>
      </div>
      <span className="spacer" />
      <ThemeToggle />
      {me
        ? <Link className="btn primary sm" to="/painel">Dashboard</Link>
        : <>
          <Link className="btn ghost sm" to="/entrar">Sign in</Link>
          <Link className="btn primary sm" to="/criar-conta">Start free</Link>
        </>}
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <div>
          <Logo />
          <p className="muted" style={{ maxWidth: 360, marginTop: 12 }}>
            On-demand RAM for subagents. Each one is born, works and disappears — and only you see what it did.
          </p>
        </div>
        <div className="footer-cols">
          <div><strong>Product</strong><a href="/#como">How it works</a><a href="/#precos">Pricing</a><Link to="/criar-conta">Create account</Link></div>
          <div><strong>Trust</strong><Link to="/transparencia">Transparency</Link><a href="/#privacidade">What we see</a></div>
        </div>
      </div>
      <div className="wrap faint" style={{ fontSize: 13, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
        © {new Date().getFullYear()} Spectre Systems · ramwisp
      </div>
    </footer>
  )
}
