import axios, { AxiosError } from 'axios'
import type { ApiError, ApiResponse, Meta } from '@/types/envelope'

const TOKEN_KEY = 'mis-finanzas:token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Request: agrega el JWT si existe
api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * Excepción tipada lanzada cuando una respuesta del backend tiene success=false
 * o cuando hay un error de red. Mantiene el error semántico del backend para que
 * los componentes puedan mapear UX específica.
 */
export class ApiClientError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly cause?: string
  readonly details?: ApiError['details']
  readonly requestId?: string

  constructor(opts: {
    code: string
    message: string
    httpStatus: number
    cause?: string
    details?: ApiError['details']
    requestId?: string
  }) {
    super(opts.message)
    this.name = 'ApiClientError'
    this.code = opts.code
    this.httpStatus = opts.httpStatus
    this.cause = opts.cause
    this.details = opts.details
    this.requestId = opts.requestId
  }

  /** Atajos comunes para checks en componentes. */
  is(code: string): boolean {
    return this.code === code
  }

  isValidation(): boolean {
    return this.code === 'VALIDATION_ERROR'
  }

  isUnauthorized(): boolean {
    return this.httpStatus === 401
  }
}

/**
 * Response interceptor:
 * 1. Si la respuesta es 2xx con un envelope { success: true, data }, devuelve { ...response, data: data }.
 *    Eso significa que `response.data` queda siendo el payload real, no el envelope.
 *    Todos los servicios existentes siguen funcionando sin cambios.
 * 2. Si la respuesta es de error y trae envelope, convierte a ApiClientError tipado.
 * 3. Si es 401, limpia token y redirige (excepto en /login y /register).
 */
api.interceptors.response.use(
  (response) => {
    // 204 No Content (ej. budget vacío)
    if (response.status === 204) return response

    const body = response.data
    if (body && typeof body === 'object' && 'success' in body) {
      const env = body as ApiResponse<unknown>
      if (env.success) {
        // Adjuntamos el meta como una propiedad extra del response por si algún
        // caller la necesita (paginación, requestId).
        ;(response as { meta?: Meta }).meta = env.meta
        response.data = env.data
        return response
      }
      // success: false — algunos backends podrían responder con 200 + error.
      // En ese raro caso, lo reescribimos como rechazo.
      throw envToClientError(env, response.status)
    }
    return response
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status ?? 0

    // 401: limpiar y redirigir
    if (status === 401) {
      const path = window.location.pathname
      if (!path.startsWith('/login') && !path.startsWith('/register')) {
        tokenStorage.clear()
        window.location.href = '/login'
      }
    }

    const envelope = error.response?.data
    if (envelope && typeof envelope === 'object' && 'success' in envelope && !envelope.success) {
      return Promise.reject(envToClientError(envelope, status))
    }

    // Error de red / timeout / sin envelope
    return Promise.reject(
      new ApiClientError({
        code: 'NETWORK_ERROR',
        message: error.message || 'Error de red',
        httpStatus: status,
      })
    )
  }
)

function envToClientError(env: ApiResponse<unknown>, httpStatus: number): ApiClientError {
  const e = env.error
  return new ApiClientError({
    code: e?.code ?? 'INTERNAL_ERROR',
    message: e?.message ?? 'Ocurrió un error inesperado',
    httpStatus,
    cause: e?.cause,
    details: e?.details,
    requestId: env.meta?.requestId,
  })
}

/**
 * Extrae un mensaje legible de cualquier error.
 * Si es ApiClientError, prioriza el `message` semántico.
 * Si es VALIDATION_ERROR, concatena los detalles por campo.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.isValidation() && error.details && error.details.length > 0) {
      return error.details.map((d) => `${d.field}: ${d.message}`).join(', ')
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Error desconocido'
}

/**
 * Devuelve el ApiClientError si lo es, o null.
 * Útil cuando un componente quiere acceder al `code` para lógica específica.
 *
 * Ejemplo:
 *   const err = getApiError(error)
 *   if (err?.is(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS)) { ... }
 */
export function getApiError(error: unknown): ApiClientError | null {
  return error instanceof ApiClientError ? error : null
}
