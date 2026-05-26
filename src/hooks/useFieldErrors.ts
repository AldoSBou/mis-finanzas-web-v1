import { useMemo } from 'react'
import { ApiClientError, getApiError } from '@/lib/api-client'

/**
 * Convierte un error en un mapa { fieldName -> mensaje } para mostrar
 * errores junto a los inputs cuando el backend devuelve VALIDATION_ERROR.
 *
 * Uso:
 *   const fieldErrors = useFieldErrors(error)
 *   <input ... />
 *   {fieldErrors.email && <span className="text-red-600">{fieldErrors.email}</span>}
 */
export function useFieldErrors(error: unknown): Record<string, string> {
  return useMemo(() => {
    const apiErr = getApiError(error)
    if (!apiErr || !apiErr.isValidation() || !apiErr.details) return {}
    return apiErr.details.reduce<Record<string, string>>((acc, d) => {
      acc[d.field] = d.message
      return acc
    }, {})
  }, [error])
}

/**
 * Hook que devuelve true si el error es del código indicado.
 * Útil para condicionales en el UI.
 *
 * Uso:
 *   const isEmailTaken = useIsErrorCode(error, ErrorCode.AUTH_EMAIL_ALREADY_EXISTS)
 */
export function useIsErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiClientError && error.code === code
}
