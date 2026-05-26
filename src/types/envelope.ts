// =====================================================
// Tipos del envelope de respuesta del backend.
// El interceptor de Axios desempaca automáticamente, así que el código
// de la app sigue recibiendo el DTO directo. Estos tipos sirven para:
// - Tipar el interceptor.
// - Manejar errores (cuando el front quiere leer el ApiError).
// =====================================================

export interface ApiError {
  code: string
  message: string
  cause?: string
  details?: Array<{ field: string; message: string }>
}

export interface Pagination {
  page: number
  size: number
  total: number
  totalPages: number
}

export interface Meta {
  timestamp: string
  requestId?: string
  path?: string
  pagination?: Pagination
}

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  message?: string
  error?: ApiError
  meta?: Meta
}

/**
 * Espejo de los códigos de error del backend.
 * Mantener sincronizado con `ErrorCode.java` del backend.
 * Útil para mapear UX específica:
 *   if (err.code === ErrorCode.AUTH_INVALID_CREDENTIALS) { ... }
 */
export const ErrorCode = {
  // Genéricos
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_ALREADY_EXISTS: 'AUTH_EMAIL_ALREADY_EXISTS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',

  // Categorías
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',

  // Movimientos
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  TRANSACTION_TYPE_MISMATCH: 'TRANSACTION_TYPE_MISMATCH',

  // Reglas
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  RULE_TEMPLATE_LOCKED: 'RULE_TEMPLATE_LOCKED',
  RULE_PERCENTAGES_INVALID: 'RULE_PERCENTAGES_INVALID',

  // Presupuesto
  BUDGET_NOT_FOUND: 'BUDGET_NOT_FOUND',

  // Período
  PERIOD_INVALID: 'PERIOD_INVALID',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]
