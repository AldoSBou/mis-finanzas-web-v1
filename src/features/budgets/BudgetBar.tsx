import { budgetColor } from '@/lib/format'
import type { CategoryBudgetItem } from '@/types/api'

/**
 * Barra de progreso de un presupuesto: lo gastado en el color del estado y,
 * a continuación y más claro, lo programado (recurrentes que faltan en el mes).
 */
export function BudgetBar({ item }: { item: CategoryBudgetItem }) {
  if (!item.limit) return null
  const limit = parseFloat(item.limit)
  const spentPct = Math.min((parseFloat(item.spent) / limit) * 100, 100)
  const scheduledPct = Math.min((parseFloat(item.scheduled) / limit) * 100, 100 - spentPct)
  const color = budgetColor(item.status)
  return (
    <div className="h-2 bg-gray-100 rounded overflow-hidden flex">
      <div className="h-full" style={{ width: `${spentPct}%`, backgroundColor: color }} />
      {scheduledPct > 0 && (
        <div
          className="h-full"
          style={{ width: `${scheduledPct}%`, backgroundColor: color, opacity: 0.3 }}
          title="Programado"
        />
      )}
    </div>
  )
}
