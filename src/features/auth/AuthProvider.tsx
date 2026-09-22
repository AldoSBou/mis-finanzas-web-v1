import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { ApiClientError, tokenStorage } from '@/lib/api-client'
import type { User } from '@/types/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Hay sesión guardada pero el backend no respondió (p. ej. sigue despertando) */
  connectionError: boolean
  retry: () => void
  login: (token: string, user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** Solo un 401/404 significa que la sesión ya no sirve; lo demás es de conexión. */
function isSessionInvalid(err: unknown): boolean {
  return err instanceof ApiClientError && (err.httpStatus === 401 || err.httpStatus === 404)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hasToken, setHasToken] = useState(() => !!tokenStorage.get())

  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: (count, err) => !isSessionInvalid(err) && count < 2,
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

  // Cerrar sesión solo si el backend la rechazó; si no respondió, conservarla
  useEffect(() => {
    if (hasToken && isSessionInvalid(error)) {
      tokenStorage.clear()
      setHasToken(false)
    }
  }, [hasToken, error])

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: hasToken && isLoading,
        isAuthenticated: !!user,
        connectionError: hasToken && !user && !!error && !isSessionInvalid(error),
        retry: () => void refetch(),
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
