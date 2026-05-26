import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { transactionsApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import { currentPeriod, formatCurrency, periodLabel } from '@/lib/format'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'
import type { Transaction } from '@/types/api'
import { getErrorMessage } from '@/lib/api-client'

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(currentPeriod())
  const [page, setPage] = useState(0)
  const size = 20
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.transactions.list(period, page, size),
    queryFn: () => transactionsApi.list(period, page, size),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const handleDelete = (t: Transaction) => {
    if (confirm(`¿Eliminar este movimiento por ${formatCurrency(t.amount)}?`)) {
      deleteMutation.mutate(t.id)
    }
  }

  const totalPages = data ? Math.ceil(data.total / size) : 0

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Movimientos</h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.total} este mes · ` : ''}
            {periodLabel(period)}
          </p>
        </div>
        <PeriodSelector
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setPage(0)
          }}
        />
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="Sin movimientos"
          description="Aún no has registrado movimientos en este período."
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="card divide-y divide-gray-100 p-0">
            {data.items.map((t) => (
              <TransactionRow
                key={t.id}
                tx={t}
                onEdit={() => setEditing(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {page + 1} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      <TransactionFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
      />
    </div>
  )
}

function TransactionRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onEdit: () => void
  onDelete: () => void
}) {
  const isIncome = tx.type === 'INCOME'
  const initial = tx.categoryName?.charAt(0).toUpperCase() ?? '?'
  const bgColor = tx.categoryColor ?? '#6B6B6B'

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
        style={{ backgroundColor: bgColor }}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{tx.description ?? tx.categoryName}</p>
        <p className="text-xs text-gray-500 truncate">
          {tx.categoryName}
          {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-medium tabular-nums ${
            isIncome ? 'text-brand-700' : 'text-gray-900'
          }`}
        >
          {isIncome ? '+ ' : '− '}
          {formatCurrency(tx.amount, tx.currency)}
        </p>
        <p className="text-xs text-gray-500">{tx.transactionDate}</p>
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
