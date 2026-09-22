import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, Download, Pencil, Repeat, Search, Trash2 } from 'lucide-react'
import { accountsApi, categoriesApi, transactionsApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import { currentPeriod, formatCurrency, periodLabel } from '@/lib/format'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'
import type { Transaction, TransactionSearch, TransactionType } from '@/types/api'
import { getErrorMessage } from '@/lib/api-client'

/** Rango para "Todo el historial" */
const ALL_TIME = { from: '2000-01-01', to: '2100-12-31' }

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(currentPeriod())
  const [allTime, setAllTime] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState<'' | TransactionType>('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(0)
  const size = 20
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const accountParam = searchParams.get('cuenta')
  const accountId = accountParam ? Number(accountParam) : undefined

  // Buscar mientras se escribe, sin una petición por tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [text])

  const search: TransactionSearch = {
    ...(allTime ? ALL_TIME : { period }),
    accountId,
    categoryId: categoryId ? Number(categoryId) : undefined,
    type: type || undefined,
    q: q || undefined,
  }
  const filtering = !!(q || type || categoryId || accountId)

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
  })

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.transactions.list(search, page, size),
    queryFn: () => transactionsApi.list(search, page, size),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.categoryBudgets.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => transactionsApi.exportCsv(search),
  })

  const changeAccount = (value: string) => {
    setPage(0)
    setSearchParams(value ? { cuenta: value } : {})
  }

  const clearFilters = () => {
    setText('')
    setQ('')
    setType('')
    setCategoryId('')
    setPage(0)
    setSearchParams({})
  }

  const handleDelete = (t: Transaction) => {
    if (confirm(`¿Eliminar este movimiento por ${formatCurrency(t.amount, t.currency)}?`)) {
      deleteMutation.mutate(t.id)
    }
  }

  const totalPages = data ? Math.ceil(data.total / size) : 0
  const visibleCategories = categories.filter((c) => !type || type === 'TRANSFER' || c.type === type)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Movimientos</h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.total} ${data.total === 1 ? 'movimiento' : 'movimientos'} · ` : ''}
            {allTime ? 'Todo el historial' : periodLabel(period)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-md p-1" role="group" aria-label="Alcance">
            <button
              type="button"
              onClick={() => {
                setAllTime(false)
                setPage(0)
              }}
              aria-pressed={!allTime}
              className={`px-3 py-1 text-sm rounded ${!allTime ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}
            >
              Por mes
            </button>
            <button
              type="button"
              onClick={() => {
                setAllTime(true)
                setPage(0)
              }}
              aria-pressed={allTime}
              className={`px-3 py-1 text-sm rounded ${allTime ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}
            >
              Todo
            </button>
          </div>
          {!allTime && (
            <PeriodSelector
              value={period}
              onChange={(p) => {
                setPeriod(p)
                setPage(0)
              }}
            />
          )}
          <button
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="btn-secondary py-1.5"
            title="Descargar en CSV los movimientos con estos filtros"
          >
            <Download className="w-4 h-4 mr-1" />
            {exportMutation.isPending ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar en la descripción..."
            className="input pl-9 py-1.5"
            aria-label="Buscar"
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as '' | TransactionType)
            setCategoryId('')
            setPage(0)
          }}
          className="input w-auto py-1.5"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          <option value="EXPENSE">Gastos</option>
          <option value="INCOME">Ingresos</option>
          <option value="TRANSFER">Transferencias</option>
        </select>
        {type !== 'TRANSFER' && (
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setPage(0)
            }}
            className="input w-auto py-1.5"
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
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
        {filtering && (
          <button type="button" onClick={clearFilters} className="text-sm text-brand-700 hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {exportMutation.error && <ErrorState message={getErrorMessage(exportMutation.error)} />}
      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title={filtering ? 'Sin resultados' : 'Sin movimientos'}
          description={
            filtering
              ? allTime
                ? 'Ningún movimiento coincide con los filtros.'
                : 'Nada en este mes con esos filtros. Prueba con "Todo" para buscar en todo el historial.'
              : 'Aún no has registrado movimientos en este período.'
          }
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
        <p className="text-sm font-medium truncate flex items-center gap-1">
          {title}
          {tx.recurringId && (
            <Repeat className="w-3 h-3 text-gray-400 flex-shrink-0" aria-label="Recurrente" />
          )}
        </p>
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
