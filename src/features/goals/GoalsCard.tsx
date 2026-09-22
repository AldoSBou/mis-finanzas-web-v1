import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { goalsApi } from '@/api/services'
import { GoalProgress, goalStatus } from '@/features/goals/GoalCard'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/format'

/** Panel: las metas activas más avanzadas. */
export function GoalsCard() {
  const { data } = useQuery({ queryKey: queryKeys.goals.all, queryFn: goalsApi.overview })
  const goals = (data?.goals ?? [])
    .filter((g) => !g.completed)
    .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
    .slice(0, 3)
  if (!data || data.goals.length === 0) return null

  return (
    <div className="card mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Metas de ahorro</h3>
        <Link to="/metas" className="text-xs text-brand-700 hover:underline">
          Ver todas
        </Link>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-gray-500">¡Cumpliste todas tus metas!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {goals.map((g) => (
            <div key={g.id}>
              <div className="flex justify-between text-sm mb-1 gap-2">
                <span className="truncate">{g.name}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {formatCurrency(g.saved, g.currency ?? 'PEN')}
                  <span className="text-gray-400"> / {formatCurrency(g.targetAmount, g.currency ?? 'PEN')}</span>
                </span>
              </div>
              <GoalProgress goal={g} height="h-2" />
              <p className="text-[11px] text-gray-500 mt-1 truncate">{goalStatus(g).text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
