import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { SessionProvider } from './session'
import Landing from './pages/Landing'
import './styles.css'
import './pages.css'

const AuthPage = lazy(() => import('./pages/Auth'))
const Activate = lazy(() => import('./pages/Activate'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Security = lazy(() => import('./pages/Security'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <SessionProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/entrar" element={<AuthPage mode="login" />} />
              <Route path="/criar-conta" element={<AuthPage mode="signup" />} />
              <Route path="/ativar" element={<Activate />} />
              <Route path="/transparencia" element={<Security />} />
              <Route path="/seguranca" element={<Security />} />
              <Route path="/painel/*" element={<Dashboard />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SessionProvider>
    </MotionConfig>
  </StrictMode>,
)
