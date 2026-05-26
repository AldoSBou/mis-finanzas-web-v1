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
