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
const REFRESH_KEY = 'mis-finanzas:refresh'

/**
 * Reintentos mientras el backend despierta: hasta 3 más, con esperas de 2, 4 y 8 s.
 * Se repite cualquier método cuando no hubo respuesta o llegó 502/503/504: en esos
 * casos el servidor no llegó a ejecutar nada (Railway Free lo duerme).
 */
const WAKE_DELAYS_MS = [2000, 4000, 8000]

/** Cortacircuito: tras 3 peticiones seguidas que agotan sus reintentos, 20 s de fallo inmediato. */
const CIRCUIT_OPEN_AFTER = 3
const CIRCUIT_OPEN_MS = 20_000
let consecutiveFailures = 0
let circuitOpenUntil = 0

/**
 * Sesión en localStorage. El token de acceso dura 8 horas; el refresh token (si se pidió
 * "recordar este dispositivo") permite renovarlo sin volver a pedir la contraseña, que es
 * lo que hace falta para que la app instalada en el teléfono abra lista para registrar.
 */
export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setRefresh: (token: string | null) =>
    token ? localStorage.setItem(REFRESH_KEY, token) : localStorage.removeItem(REFRESH_KEY),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

/** Se llama cuando la sesión venció y no se pudo renovar. */
let onSessionExpired: (() => void) | null = null
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn
}

interface RefreshedSession {
  token: string
  refreshToken: string | null
}

/** 'ok' = sesión renovada; 'invalid' = el refresh token ya no sirve; 'unreachable' = el servidor no respondió. */
type RefreshOutcome = 'ok' | 'invalid' | 'unreachable'

// Si varias peticiones reciben 401 a la vez, se renueva una sola vez
let refreshing: Promise<RefreshOutcome> | null = null

async function refreshSession(): Promise<RefreshOutcome> {
  const refresh = tokenStorage.getRefresh()
  if (!refresh) return 'invalid'
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt <= WAKE_DELAYS_MS.length; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, WAKE_DELAYS_MS[attempt - 1]))
        try {
          // axios "crudo": sin interceptores, para no entrar en bucle
          const res = await axios.post<ApiResponse<RefreshedSession>>(
            `${API_BASE}/auth/refresh`,
            { refreshToken: refresh },
            { timeout: 20000 },
          )
          const data = res.data?.success ? res.data.data : null
          if (!data?.token) return 'invalid'
          tokenStorage.set(data.token)
          tokenStorage.setRefresh(data.refreshToken ?? null)
          return 'ok'
        } catch (e) {
          const status = (e as AxiosError).response?.status
          // Sin respuesta o 502/503/504: el backend está despertando, se vuelve a intentar
          if (status && status !== 502 && status !== 503 && status !== 504) return 'invalid'
        }
      }
      return 'unreachable'
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Rutas donde un 401 es la respuesta real (contraseña incorrecta, token de refresco vencido). */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

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

// Interceptor de request: agrega el token si existe y respeta el cortacircuito
api.interceptors.request.use((config) => {
  const remaining = circuitOpenUntil - Date.now()
  if (remaining > 0) {
    return Promise.reject(
      new ApiClientError({
        code: 'CIRCUIT_OPEN',
        message: `El servidor no responde. Vuelve a intentar en ${Math.ceil(remaining / 1000)} s.`,
      }),
    )
  }
  const token = tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de response: desempaca el envelope
api.interceptors.response.use(
  (response) => {
    consecutiveFailures = 0
    circuitOpenUntil = 0
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
  async (error: AxiosError) => {
    // El backend en Railway se duerme sin uso: la primera petición puede fallar
    // (502/503/504, o sin respuesta porque el proxy no manda CORS) mientras arranca.
    // Reintentamos solo lecturas (GET), que son seguras de repetir.
    const config = error.config as
      | (typeof error.config & { _retries?: number; _refreshed?: boolean })
      | undefined
    const status = error.response?.status

    // Token de acceso vencido: se renueva con el refresh token y se repite la petición
    if (
      status === 401 &&
      config &&
      !config._refreshed &&
      !NO_REFRESH_PATHS.some((p) => (config.url ?? '').includes(p)) &&
      tokenStorage.getRefresh()
    ) {
      config._refreshed = true
      const outcome = await refreshSession()
      if (outcome === 'ok') return api(config)
      if (outcome === 'invalid') {
        tokenStorage.clear()
        onSessionExpired?.()
      }
      // 'unreachable': se deja pasar el 401 original sin borrar la sesión
    }
    const errorCode = (error.response?.data as ApiResponse<unknown> | undefined)?.error?.code
    // Un 503 con código propio (p. ej. VOICE_UNAVAILABLE) es definitivo; sin código o
    // DATABASE_UNAVAILABLE es el servidor despertando.
    const waking =
      !error.response ||
      status === 502 ||
      status === 504 ||
      (status === 503 && (!errorCode || errorCode === 'DATABASE_UNAVAILABLE'))
    if (config && waking && (config._retries ?? 0) < WAKE_DELAYS_MS.length) {
      const n = config._retries ?? 0
      config._retries = n + 1
      await new Promise((r) => setTimeout(r, WAKE_DELAYS_MS[n]))
      return api(config)
    }
    if (waking) {
      consecutiveFailures++
      if (consecutiveFailures >= CIRCUIT_OPEN_AFTER) circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS
    } else {
      // Respondió de verdad (aunque sea un 4xx): el servidor está vivo
      consecutiveFailures = 0
      circuitOpenUntil = 0
    }

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