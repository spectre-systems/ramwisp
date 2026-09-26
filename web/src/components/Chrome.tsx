import { Link } from 'react-router-dom'
import { useSession } from '../session'
import { Logo, ThemeToggle } from './ui'

export function Nav() {
  const { me } = useSession()
  return (
    <nav className="nav">
      <Logo />
      <div className="links">
        <a href="/#como">Como funciona</a>
        <a href="/#privacidade">Privacidade</a>
        <a href="/#precos">Preços</a>
        <Link to="/seguranca">Transparência</Link>
      </div>
      <span className="spacer" />
      <ThemeToggle />
      {me
        ? <Link className="btn primary sm" to="/painel">Painel</Link>
        : <>
          <Link className="btn ghost sm" to="/entrar">Entrar</Link>
          <Link className="btn primary sm" to="/criar-conta">Começar grátis</Link>
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
            RAM sob demanda para subagentes. Cada um nasce, trabalha e desaparece — e só você vê o que ele fez.
          </p>
        </div>
        <div className="footer-cols">
          <div><strong>Produto</strong><a href="/#como">Como funciona</a><a href="/#precos">Preços</a><Link to="/criar-conta">Criar conta</Link></div>
          <div><strong>Confiança</strong><Link to="/seguranca">Transparência</Link><a href="/#privacidade">O que vemos</a></div>
        </div>
      </div>
      <div className="wrap faint" style={{ fontSize: 13, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
        © {new Date().getFullYear()} Spectre Systems · wisp
      </div>
    </footer>
  )
}
