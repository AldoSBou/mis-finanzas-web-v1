import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router'
import { BudgetBar } from '@/features/budgets/BudgetBar'
import { formatCurrency } from '@/lib/format'
import type { CategoryBudgetItem } from '@/types/api'

/** Aviso en el panel: categorías cerca o por encima de su límite. */
export function BudgetAlertsCard({
  items,
  currency,
}: {
  items: CategoryBudgetItem[]
  currency: string
}) {
  return (
    <div className="card border-amber-200 bg-amber-50/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Presupuestos en alerta
        </h3>
        <Link to="/presupuestos" className="text-xs text-brand-700 hover:underline">
          Ver todos
        </Link>
      </div>
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.categoryId}>
            <div className="flex justify-between text-sm mb-1 gap-2">
              <span className="truncate">{i.categoryName}</span>
              <span className="tabular-nums whitespace-nowrap">
                <span className={i.status === 'OVER' ? 'text-red-600 font-medium' : 'font-medium'}>
                  {formatCurrency(i.spent, currency)}
                </span>
                <span className="text-gray-400"> / {formatCurrency(i.limit!, currency)}</span>
              </span>
            </div>
            <BudgetBar item={i} />
            <p className="text-[11px] text-gray-500 mt-1">
              {i.status === 'OVER'
                ? `Te pasaste por ${formatCurrency(parseFloat(i.spent) - parseFloat(i.limit!), currency)}`
                : i.status === 'WARNING'
                  ? `Llevas ${parseFloat(i.percentage!).toFixed(0)}% del límite`
                  : `Con lo programado (${formatCurrency(i.scheduled, currency)}) te pasarás del límite`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
