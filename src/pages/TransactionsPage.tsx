import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, Pencil, Trash2 } from 'lucide-react'
import { accountsApi, transactionsApi } from '@/api/services'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const accountParam = searchParams.get('cuenta')
  const accountId = accountParam ? Number(accountParam) : undefined

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.transactions.list(period, page, size, accountId),
    queryFn: () => transactionsApi.list(period, page, size, accountId),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const changeAccount = (value: string) => {
    setPage(0)
    setSearchParams(value ? { cuenta: value } : {})
  }

  const handleDelete = (t: Transaction) => {
    if (confirm(`¿Eliminar este movimiento por ${formatCurrency(t.amount, t.currency)}?`)) {
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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountParam ?? ''}
            onChange={(e) => changeAccount(e.target.value)}
            className="input w-auto py-1.5"
            aria-label="Filtrar por cuenta"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <PeriodSelector
            value={period}
            onChange={(p) => {
              setPeriod(p)
              setPage(0)
            }}
          />
        </div>
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
                filterAccountId={accountId}
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
  filterAccountId,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  /** Si la lista está filtrada por cuenta, una transferencia entrante se muestra como entrada */
  filterAccountId?: number
  onEdit: () => void
  onDelete: () => void
}) {
  const isTransfer = tx.type === 'TRANSFER'
  const incoming = isTransfer && filterAccountId === tx.toAccountId
  const title = isTransfer
    ? (tx.description ?? 'Transferencia')
    : (tx.description ?? tx.categoryName)
  const subtitle = isTransfer
    ? `${tx.accountName} → ${tx.toAccountName}`
    : `${tx.categoryName} · ${tx.accountName}`

  let sign = tx.type === 'INCOME' ? '+ ' : '− '
  let shown = formatCurrency(tx.amount, tx.currency)
  let color = tx.type === 'INCOME' ? 'text-brand-700' : 'text-gray-900'
  if (isTransfer) {
    color = 'text-gray-600'
    if (incoming) {
      sign = '+ '
      shown = formatCurrency(tx.toAmount ?? tx.amount, tx.toCurrency ?? tx.currency)
    } else if (filterAccountId === undefined) {
      sign = ''
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {isTransfer ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 flex-shrink-0">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
      ) : (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: tx.categoryColor ?? '#6B6B6B' }}
        >
          {tx.categoryName?.charAt(0).toUpperCase() ?? '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium tabular-nums ${color}`}>
          {sign}
          {shown}
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
