/**
 * Ingreso de montos "desde los centavos", como en un POS: cada dígito entra por la
 * derecha y el punto decimal se coloca solo. 1, 2, 5, 0, 0 → 0.01, 0.12, 1.25, 12.50, 125.00.
 * Así nunca hay ambigüedad entre 1 000 000 y 100 000.00.
 */

/** Tope: 9 999 999.99 (9 dígitos) */
export const MAX_DIGITS = 9

/** Dígitos (centavos) de un monto decimal: '12.50' → '1250', '' → '' */
export function toDigits(value: string): string {
  if (!value) return ''
  const n = Math.round(Math.abs(parseFloat(value)) * 100)
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

/** Monto decimal a partir de los dígitos: '1250' → '12.50', '' → '' */
export function fromDigits(digits: string, negative = false): string {
  const clean = digits.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
  if (!clean) return ''
  const value = (parseInt(clean, 10) / 100).toFixed(2)
  return negative ? `-${value}` : value
}

/** Lo que se muestra en el campo: '1234.5' → '1,234.50' (con signo si corresponde) */
export function displayAmount(value: string): string {
  if (!value) return ''
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return ''
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`
}

/**
 * Nuevo monto a partir de lo que quedó escrito en el campo tras una tecla.
 * Como el campo muestra el monto formateado, basta con quedarse con los dígitos:
 * escribir "5" al final de "12.34" deja "12.345" → 123.45; borrar deja "12.3" → 1.23.
 * Un "-" adicional invierte el signo (solo si {@code allowNegative}).
 */
export function typeAmount(previous: string, typed: string, allowNegative = false): string {
  const wasNegative = previous.startsWith('-')
  const minusBefore = wasNegative ? 1 : 0
  const minusNow = (typed.match(/-/g) ?? []).length
  const negative = allowNegative && (minusNow > minusBefore ? !wasNegative : minusNow === minusBefore && wasNegative)
  return fromDigits(typed, negative)
}
