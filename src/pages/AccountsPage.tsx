import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Archive, Pencil, Plus } from 'lucide-react'
import { accountsApi } from '@/api/services'
import { AccountFormModal } from '@/features/accounts/AccountFormModal'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { accountTypeLabel, formatCurrency } from '@/lib/format'
import type { Account } from '@/types/api'

export function AccountsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => accountsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })

  const handleArchive = (a: Account) => {
    const hasBalance = parseFloat(a.balance) !== 0
    const warning = hasBalance
      ? `\n\nOjo: todavía tiene ${formatCurrency(a.balance, a.currency)} de saldo.`
      : ''
    if (confirm(`¿Archivar "${a.name}"? Su historial se conserva.${warning}`)) {
      archiveMutation.mutate(a.id)
    }
  }

  // Totales por moneda (no se convierten: cada moneda se muestra aparte)
  const totals = new Map<string, number>()
  accounts?.forEach((a) => {
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + parseFloat(a.balance))
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas</h1>
          <p className="text-sm text-gray-500">Dónde está tu dinero</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Nueva cuenta
        </button>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}
      {archiveMutation.error && <ErrorState message={getErrorMessage(archiveMutation.error)} />}

      {accounts && accounts.length === 0 && (
        <EmptyState title="Sin cuentas" description="Crea tu primera cuenta para registrar movimientos." />
      )}

      {accounts && accounts.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[...totals.entries()].map(([currency, total]) => (
              <div key={currency} className="card">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Total {currency}
                </p>
                <p
                  className={`text-xl md:text-2xl font-semibold tabular-nums ${
                    total < 0 ? 'text-red-600' : ''
                  }`}
                >
                  {formatCurrency(total, currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="card divide-y divide-gray-100 p-0">
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                onEdit={() => setEditing(a)}
                onArchive={() => handleArchive(a)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Toca una cuenta para ver sus movimientos del mes.
          </p>
        </>
      )}

      <AccountFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        initial={editing}
      />
    </div>
  )
}

function AccountRow({
  account: a,
  onEdit,
  onArchive,
}: {
  account: Account
  onEdit: () => void
  onArchive: () => void
}) {
  const balance = parseFloat(a.balance)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/movimientos?cuenta=${a.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: a.color ?? '#6B6B6B' }}
        >
          {a.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{a.name}</p>
          <p className="text-xs text-gray-500 truncate">
            {accountTypeLabel(a.type)} · {a.currency}
          </p>
        </div>
        <p
          className={`text-sm font-semibold tabular-nums ${balance < 0 ? 'text-red-600' : ''}`}
        >
          {formatCurrency(a.balance, a.currency)}
        </p>
      </Link>
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
          onClick={onArchive}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          aria-label="Archivar"
        >
          <Archive className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
