import { Link } from 'react-router'
import { BudgetBar } from '@/features/budgets/BudgetBar'
import { formatCurrency } from '@/lib/format'
import type { OverviewResponse } from '@/types/api'

const MAX_ROWS = 8

/** Gasto del periodo por categoría: con límite primero (barra), luego el resto por monto. */
export function CategoriesCard({ overview: o }: { overview: OverviewResponse }) {
  const fmt = (v: string | number) => formatCurrency(v, o.baseCurrency)
  const withLimit = o.categories.filter((c) => c.limit)
  const rest = o.categories
    .filter((c) => !c.limit && parseFloat(c.spent) > 0)
    .sort((a, b) => parseFloat(b.spent) - parseFloat(a.spent))
  const rows = [...withLimit, ...rest].slice(0, MAX_ROWS)
  const maxSpent = Math.max(...rest.map((c) => parseFloat(c.spent)), 1)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Por categoría</h3>
        <Link to="/presupuestos" className="text-xs text-brand-700 hover:underline">
          Límites
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Sin gastos todavía en este periodo. Ponle un límite a una categoría para verla siempre aquí.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.categoryId}>
              <div className="flex justify-between text-sm mb-1 gap-2">
                <span className="truncate flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.categoryColor ?? '#6B6B6B' }}
                  />
                  {c.categoryName}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  <span className={c.status === 'OVER' ? 'text-red-600 font-medium' : 'font-medium'}>
                    {fmt(c.spent)}
                  </span>
                  {c.limit && <span className="text-gray-400"> / {fmt(c.limit)}</span>}
                </span>
              </div>
              {c.limit ? (
                <BudgetBar item={c} />
              ) : (
                <div className="h-2 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(parseFloat(c.spent) / maxSpent) * 100}%`,
                      backgroundColor: c.categoryColor ?? '#6B6B6B',
                      opacity: 0.7,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
