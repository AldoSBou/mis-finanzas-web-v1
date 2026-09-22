import type { ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'

/**
 * Paleta categórica de referencia (validada con el script de dataviz: CVD y visión normal
 * pasan en pares adyacentes). Orden fijo: el color sigue a la serie, nunca a su posición.
 * Aqua, amarillo y magenta tienen contraste < 3:1: cada gráfico ofrece "Ver tabla".
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const
/** Gris neutro para "Otros": no compite con las series con identidad. */
export const OTHER = '#9a9893'

export const AXIS_TICK = { fill: '#6b7280', fontSize: 11 }
export const GRID = '#eeede9'

/** 'YYYY-MM' → 'set. 26' */
export function monthShort(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const month = new Intl.DateTimeFormat('es-PE', { month: 'short' }).format(new Date(y, m - 1, 1))
  return `${month} ${String(y).slice(2)}`
}

/** Texto de la leyenda en tinta neutra (la muestra de color ya identifica la serie). */
export function legendText(value: string) {
  return <span style={{ color: '#374151' }}>{value}</span>
}

/** Montos compactos para ejes: 1.2 mil, 15 mil */
export function compactAmount(value: number): string {
  return new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

interface TooltipEntry {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
}

/**
 * Tooltip de Recharts: todas las series del mes, cada una con una línea corta de su
 * color como clave. Los textos van en tinta neutra, nunca en el color de la serie.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  currency: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-1">{label ? monthShort(label) : ''}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600 flex-1">{p.name}</span>
          <span className="text-gray-900 tabular-nums">{formatCurrency(Number(p.value), currency)}</span>
        </div>
      ))}
    </div>
  )
}

/** Tarjeta de gráfico con título y alternancia gráfico / tabla. */
export function ChartCard({
  title,
  subtitle,
  showTable,
  onToggleTable,
  children,
}: {
  title: string
  subtitle?: string
  showTable: boolean
  onToggleTable: () => void
  children: ReactNode
}) {
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleTable}
          className="text-xs text-brand-700 hover:underline whitespace-nowrap"
        >
          {showTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {children}
    </section>
  )
}

/** Tabla accesible con los mismos datos del gráfico. */
export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<{ key: string; label: string; values: string[] }>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-medium py-1.5 pr-3">Mes</th>
            {columns.map((c) => (
              <th key={c} className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-100">
              <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="py-1.5 px-2 text-right tabular-nums text-gray-900">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
