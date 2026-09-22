import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { ErrorState, Loading } from '@/components/ui/States'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, connectionError, retry } = useAuth()
  if (isLoading) return <Loading label="Conectando..." />
  if (connectionError) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-3">
        <ErrorState message="No se pudo conectar con el servidor. Puede estar despertando; intenta de nuevo en unos segundos." />
        <button type="button" onClick={retry} className="btn-primary w-full">
          Reintentar
        </button>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
