import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { goalsApi } from '@/api/services'
import { ContributionModal } from '@/features/goals/ContributionModal'
import { GoalCard } from '@/features/goals/GoalCard'
import { GoalFormModal } from '@/features/goals/GoalFormModal'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/format'
import type { Goal } from '@/types/api'

export function GoalsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [creating, setCreating] = useState(false)
  const [moving, setMoving] = useState<{ goal: Goal; direction: 'IN' | 'OUT' } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.all,
    queryFn: goalsApi.overview,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => goalsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.all }),
  })

  const handleDelete = (g: Goal) => {
    if (
      confirm(
        `¿Eliminar la meta "${g.name}"? Se borra su historial de aportes; las transferencias ya hechas y el dinero en ${g.accountName} se conservan.`,
      )
    ) {
      deleteMutation.mutate(g.id)
    }
  }

  const unassignedFor = (accountId: number) =>
    parseFloat(data?.accounts.find((a) => a.accountId === accountId)?.unassigned ?? '0')

  const goals = data?.goals ?? []
  const active = goals.filter((g) => !g.completed)
  const completed = goals.filter((g) => g.completed)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Metas de ahorro</h1>
          <p className="text-sm text-gray-500">Para qué estás ahorrando y cuánto te falta</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Nueva meta
        </button>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}
      {deleteMutation.error && <ErrorState message={getErrorMessage(deleteMutation.error)} />}

      {data && goals.length === 0 && (
        <EmptyState
          title="Aún no tienes metas"
          description="Crea una para tu fondo de emergencia, un viaje o esa compra grande, y ve cuánto aportar al mes."
        />
      )}

      {data && data.accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {data.accounts.map((a) => {
            const free = parseFloat(a.unassigned)
            return (
              <span
                key={a.accountId}
                className={`text-xs rounded-full px-3 py-1 ${
                  free < 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'
                }`}
                title={`Saldo ${formatCurrency(a.balance, a.currency)} · en metas ${formatCurrency(a.assigned, a.currency)}`}
              >
                {a.accountName}:{' '}
                {free < 0
                  ? `las metas suman ${formatCurrency(-free, a.currency)} más que el saldo`
                  : `${formatCurrency(free, a.currency)} sin asignar a metas`}
              </span>
            )
          })}
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onContribute={() => setMoving({ goal: g, direction: 'IN' })}
              onWithdraw={() => setMoving({ goal: g, direction: 'OUT' })}
              onEdit={() => setEditing(g)}
              onDelete={() => handleDelete(g)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mt-8 mb-3">Cumplidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completed.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onContribute={() => setMoving({ goal: g, direction: 'IN' })}
                onWithdraw={() => setMoving({ goal: g, direction: 'OUT' })}
                onEdit={() => setEditing(g)}
                onDelete={() => handleDelete(g)}
              />
            ))}
          </div>
        </>
      )}

      <GoalFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        initial={editing}
      />
      <ContributionModal
        goal={moving?.goal ?? null}
        direction={moving?.direction ?? 'IN'}
        unassigned={moving ? unassignedFor(moving.goal.accountId) : 0}
        onClose={() => setMoving(null)}
      />
    </div>
  )
}
