import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { tokenStorage } from '@/lib/api-client'
import type { User } from '@/types/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hasToken, setHasToken] = useState(() => !!tokenStorage.get())

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const login = (token: string, _user: User) => {
    tokenStorage.set(token)
    setHasToken(true)
  }

  /**
   * Logout completo: 1) revoca server-side, 2) limpia localmente, 3) redirige.
   * Si el server-side falla, seguimos con la limpieza local (el JWT viejo
   * eventualmente expira solo).
   */
  const logout = async () => {
    await authApi.logout()
    tokenStorage.clear()
    setHasToken(false)
    window.location.href = '/login'
  }

  useEffect(() => {
    if (hasToken && !isLoading && !user) {
      tokenStorage.clear()
      setHasToken(false)
    }
  }, [hasToken, isLoading, user])

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: hasToken && isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
