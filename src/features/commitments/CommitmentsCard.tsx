import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { commitmentsApi } from '@/api/services'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, shortDate } from '@/lib/format'
import type { Commitment, OverviewResponse, PendingItem } from '@/types/api'
import { CommitmentFormModal } from './CommitmentFormModal'
import { PayCommitmentModal } from './PayCommitmentModal'

/** Refresca todo lo que cambia al pagar o editar un compromiso. */
export function useInvalidateCommitments() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.overview.all })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.categoryBudgets.all })
  }
}

/**
 * Lo que falta pagar en el periodo: compromisos (con Pagar / Omitir) y recurrentes por venir.
 * Los recurrentes se confirman en "Próximos movimientos".
 */
export function CommitmentsCard({ overview: o }: { overview: OverviewResponse }) {
  const invalidate = useInvalidateCommitments()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Commitment | null>(null)
  const [paying, setPaying] = useState<Commitment | null>(null)
  const fmt = (v: string | number) => formatCurrency(v, o.baseCurrency)

  // Los compromisos completos (con cuenta sugerida) para pagar o editar
  const { data: commitments = [] } = useQuery({
    queryKey: queryKeys.commitments.all,
    queryFn: () => commitmentsApi.list(),
  })
  const byId = new Map(commitments.map((c) => [c.id, c]))

  const skipMutation = useMutation({ mutationFn: (id: number) => commitmentsApi.skip(id), onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: (id: number) => commitmentsApi.delete(id), onSuccess: invalidate })
  const mutationError = skipMutation.error ?? deleteMutation.error

  const items = o.pending
  const total = parseFloat(o.pendingTotal)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold">
          Por pagar este periodo
          {total > 0 && <span className="text-gray-400 font-normal"> · {fmt(total)}</span>}
        </h3>
        <button type="button" onClick={() => setCreating(true)} className="btn-secondary py-1 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Compromiso
        </button>
      </div>

      {mutationError && <ErrorState message={getErrorMessage(mutationError)} />}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nada pendiente. Anota aquí el alquiler, el colegio, una deuda o el pago de una tarjeta
          para que "te quedan" los descuente desde ya.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((item) => (
            <PendingRow key={`${item.kind}-${item.id}-${item.date}`} item={item} fmt={fmt}>
              {item.kind === 'COMMITMENT' ? (
                <div className="flex gap-1 mt-1 justify-end items-center">
                  <button
                    type="button"
                    onClick={() => {
                      const c = byId.get(item.id)
                      if (c) setPaying(c)
                    }}
                    className="text-xs px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600"
                  >
                    Pagar
                  </button>
                  <button
                    type="button"
                    onClick={() => skipMutation.mutate(item.id)}
                    disabled={skipMutation.isPending}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                  >
                    Omitir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = byId.get(item.id)
                      if (c) setEditing(c)
                    }}
                    className="p-1 text-gray-400 hover:text-gray-700"
                    aria-label="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar "${item.name}"?`)) deleteMutation.mutate(item.id)
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1">
                  <Link to="/recurrentes" className="hover:underline">
                    Recurrente{item.automatic ? ' · automático' : item.overdue ? ' · por confirmar' : ''}
                  </Link>
                </p>
              )}
            </PendingRow>
          ))}
        </div>
      )}

      <CommitmentFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        initial={editing}
        currency={o.baseCurrency}
      />
      <PayCommitmentModal commitment={paying} onClose={() => setPaying(null)} />
    </div>
  )
}

function PendingRow({
  item,
  fmt,
  children,
}: {
  item: PendingItem
  fmt: (v: string) => string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`w-12 text-xs pt-0.5 ${item.overdue ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
        {shortDate(item.date)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{item.name}</p>
        <p className="text-xs text-gray-500 truncate">
          {item.transfer ? 'Mover dinero' : item.categoryName ?? 'Gasto'}
          {item.overdue ? ' · Vencido' : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium tabular-nums ${item.overdue ? 'text-amber-700' : ''}`}>
          − {fmt(item.amount)}
        </p>
        {children}
      </div>
    </div>
  )
}
