import axios, { AxiosError } from 'axios'
import type { ApiResponse, ApiError } from '@/types/envelope'

/**
 * URL base de la API.
 *
 * - En desarrollo: si VITE_API_URL no está definida, usa '/api' y el proxy
 *   de Vite redirige a localhost:8080 (configurado en vite.config.ts).
 * - En producción: VITE_API_URL apunta al backend en Railway, definida en
 *   el archivo .env.production y en las variables de entorno de Vercel.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const TOKEN_KEY = 'mis-finanzas:token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

/**
 * Error tipado de la API. Expone el código semántico del backend
 * para que los componentes puedan reaccionar de forma granular.
 */
export class ApiClientError extends Error {
  code: string
  details?: Array<{ field: string; message: string }>
  requestId?: string
  httpStatus?: number

  constructor(apiError: ApiError, httpStatus?: number, requestId?: string) {
    super(apiError.message)
    this.name = 'ApiClientError'
    this.code = apiError.code
    this.details = apiError.details
    this.requestId = requestId
    this.httpStatus = httpStatus
  }

  /**
   * True si este error es de validación de campos (código VALIDATION_ERROR).
   * Cuando es true, .details contiene los errores por campo.
   */
  isValidation(): boolean {
    return this.code === 'VALIDATION_ERROR'
  }
}

// Interceptor de request: agrega el token si existe
api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de response: desempaca el envelope
api.interceptors.response.use(
  (response) => {
    const envelope = response.data as ApiResponse<unknown>
    // El backend siempre devuelve envelope. Desempacamos data.
    if (envelope && typeof envelope === 'object' && 'success' in envelope) {
      if (envelope.success) {
        response.data = envelope.data
        return response
      }
      // success: false → lanzar error tipado
      throw new ApiClientError(
        envelope.error!,
        response.status,
        envelope.meta?.requestId,
      )
    }
    return response
  },
  (error: AxiosError) => {
    // Errores HTTP (4xx, 5xx) con envelope
    if (error.response?.data) {
      const envelope = error.response.data as ApiResponse<unknown>
      if (envelope && typeof envelope === 'object' && 'error' in envelope && envelope.error) {
        return Promise.reject(
          new ApiClientError(
            envelope.error,
            error.response.status,
            envelope.meta?.requestId,
          ),
        )
      }
    }
    // Error sin envelope (red caída, timeout, CORS, etc.)
    return Promise.reject(
      new ApiClientError(
        {
          code: 'NETWORK_ERROR',
          message: error.message || 'Error de conexión con el servidor',
        },
        error.response?.status,
      ),
    )
  },
)

/**
 * Extrae un mensaje legible de cualquier error capturado.
 * Si es un ApiClientError, usa su mensaje (que viene del catálogo del backend).
 * Si es otra cosa, devuelve un mensaje genérico.
 *
 * Uso típico en componentes:
 *   catch (err) { setError(getErrorMessage(err)) }
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Ocurrió un error inesperado'
}

/**
 * Devuelve el ApiClientError tipado si el error lo es, o null en caso contrario.
 * Útil cuando necesitas acceder a .code o .details (no solo al mensaje).
 *
 * Uso típico:
 *   const apiErr = getApiError(err)
 *   if (apiErr?.code === 'VALIDATION_ERROR') { ... }
 */
export function getApiError(err: unknown): ApiClientError | null {
  return err instanceof ApiClientError ? err : null
}