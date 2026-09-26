import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Me } from './api'

type S = { me: Me | null; loading: boolean; refresh: () => Promise<Me | null>; logout: () => Promise<void> }
const Ctx = createContext<S>({ me: null, loading: true, refresh: async () => null, logout: async () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { const m = await api<Me>('GET', '/api/me'); setMe(m); return m } catch { setMe(null); return null } finally { setLoading(false) }
  }, [])
  const logout = useCallback(async () => { await api('POST', '/api/auth/logout').catch(() => {}); setMe(null) }, [])
  useEffect(() => { refresh() }, [refresh])
  return <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
