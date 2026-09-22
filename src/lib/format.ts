export function formatCurrency(amount: string | number, currency = 'PEN'): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Para mostrar montos sin símbolo (en barras, badges, etc.) */
export function formatNumber(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Período actual en formato YYYY-MM */
export function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Convierte 'YYYY-MM' a label legible "Abril 2026" */
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

/** YYYY-MM ± offset meses */
export function shiftPeriod(period: string, offset: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Día de hoy en formato YYYY-MM-DD */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BUCKET_LABELS: Record<string, string> = {
  NEEDS: 'Necesidades',
  WANTS: 'Deseos',
  SAVINGS: 'Ahorro',
  INVESTMENT: 'Inversión',
  DEBT: 'Deudas',
  UNCATEGORIZED: 'Sin asignar',
}

export function bucketLabel(bucket: string): string {
  return BUCKET_LABELS[bucket] ?? bucket
}

const BUCKET_COLORS: Record<string, string> = {
  NEEDS: '#378ADD',
  WANTS: '#D85A30',
  SAVINGS: '#1D9E75',
  INVESTMENT: '#7F77DD',
  DEBT: '#B23A48',
  UNCATEGORIZED: '#6B6B6B',
}

export function bucketColor(bucket: string): string {
  return BUCKET_COLORS[bucket] ?? '#6B6B6B'
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK: 'Cuenta bancaria',
  CREDIT_CARD: 'Tarjeta de crédito',
  EWALLET: 'Billetera digital',
  SAVINGS: 'Ahorro',
  INVESTMENT: 'Inversión',
}

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as Array<
  'CASH' | 'BANK' | 'CREDIT_CARD' | 'EWALLET' | 'SAVINGS' | 'INVESTMENT'
>

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
}

export function frequencyLabel(frequency: string): string {
  return FREQUENCY_LABELS[frequency] ?? frequency
}

/** 'YYYY-MM-DD' → '22 set.' (fecha corta en español, sin zona horaria) */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  )
}

/** Color de la barra según el estado del presupuesto */
export function budgetColor(status: string): string {
  if (status === 'OVER') return '#DC2626'
  if (status === 'WARNING') return '#D97706'
  return '#0F6E56'
}

/** 'YYYY-MM' → 'marzo de 2027' */
export function monthYear(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

/** 'YYYY-MM-DD' → '31 dic. 2026' */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  )
}

/** Monedas ofrecidas en los formularios */
export const CURRENCIES = ['PEN', 'USD', 'EUR'] as const

/** Símbolo corto de una moneda: S/, US$, € */
export function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat('es-PE', { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return part?.value ?? currency
}
