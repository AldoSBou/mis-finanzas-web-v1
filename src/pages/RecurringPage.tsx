import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowRightLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { recurringApi } from '@/api/services'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, frequencyLabel, shortDate } from '@/lib/format'
import type { Recurring } from '@/types/api'

export function RecurringPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: items, isLoading, error } = useQuery({
    queryKey: queryKeys.recurring.all,
    queryFn: recurringApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => recurringApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const handleDelete = (r: Recurring) => {
    const name = r.description ?? r.categoryName ?? 'este recurrente'
    if (confirm(`¿Eliminar "${name}"? Los movimientos ya registrados se conservan.`)) {
      deleteMutation.mutate(r.id)
    }
  }

  const active = items?.filter((r) => r.active) ?? []
  const finished = items?.filter((r) => !r.active) ?? []

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Recurrentes</h1>
          <p className="text-sm text-gray-500">Sueldo, alquiler, suscripciones y pagos que se repiten</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Nuevo
        </button>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}
      {deleteMutation.error && <ErrorState message={getErrorMessage(deleteMutation.error)} />}

      {items && items.length === 0 && (
        <EmptyState
          title="Sin recurrentes"
          description='Crea uno aquí o marca "Repetir" al registrar un movimiento.'
        />
      )}

      {active.length > 0 && (
        <div className="card divide-y divide-gray-100 p-0">
          {active.map((r) => (
            <RecurringRow
              key={r.id}
              item={r}
              onEdit={() => setEditing(r)}
              onDelete={() => handleDelete(r)}
            />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-2">Terminados</h2>
          <div className="card divide-y divide-gray-100 p-0 opacity-70">
            {finished.map((r) => (
              <RecurringRow
                key={r.id}
                item={r}
                onEdit={() => setEditing(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        </>
      )}

      <TransactionFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        recurring={editing}
        recurringMode={creating}
      />
    </div>
  )
}

function RecurringRow({
  item: r,
  onEdit,
  onDelete,
}: {
  item: Recurring
  onEdit: () => void
  onDelete: () => void
}) {
  const isTransfer = r.type === 'TRANSFER'
  const title = r.description ?? (isTransfer ? 'Transferencia' : r.categoryName)
  const where = isTransfer ? `${r.accountName} → ${r.toAccountName}` : r.accountName
  const sign = r.type === 'INCOME' ? '+ ' : r.type === 'EXPENSE' ? '− ' : ''

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {isTransfer ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 flex-shrink-0">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
      ) : (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: r.categoryColor ?? '#6B6B6B' }}
        >
          {r.categoryName?.charAt(0).toUpperCase() ?? '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">
          {frequencyLabel(r.frequency)} · {where}
          {r.active ? ` · próximo ${shortDate(r.nextDate)}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-medium tabular-nums ${
            r.type === 'INCOME' ? 'text-brand-700' : ''
          }`}
        >
          {sign}
          {formatCurrency(r.amount, r.currency ?? 'PEN')}
        </p>
        <p className="text-[11px] text-gray-500">
          {r.autoCreate ? 'Automático' : 'Con confirmación'}
        </p>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          aria-label="Editar"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 hover:bg-red-50 rounded text-red-500"
          aria-label="Eliminar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
