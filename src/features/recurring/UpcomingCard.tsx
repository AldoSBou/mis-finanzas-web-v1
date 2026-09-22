import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { recurringApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, formatCurrency, shortDate, todayIso } from '@/lib/format'
import type { UpcomingItem } from '@/types/api'

/** Recurrentes pendientes de confirmar y los que vienen hasta fin de mes. */
export function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  const queryClient = useQueryClient()
  const [registering, setRegistering] = useState<UpcomingItem | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.recurring.all })
  }

  const skipMutation = useMutation({
    mutationFn: (id: number) => recurringApi.skip(id),
    onSuccess: invalidate,
  })

  const pending = items.filter((i) => i.overdue)
  const upcoming = items.filter((i) => !i.overdue)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Próximos movimientos</h3>
        <Link to="/recurrentes" className="text-xs text-brand-700 hover:underline">
          Recurrentes
        </Link>
      </div>

      {skipMutation.error && <ErrorState message={getErrorMessage(skipMutation.error)} />}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nada pendiente este mes. Marca "Repetir" al registrar sueldo, alquiler o suscripciones.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {pending.map((item) => (
            <Row key={`${item.recurringId}-${item.date}`} item={item}>
              <div className="flex gap-1 mt-1 justify-end">
                <button
                  type="button"
                  onClick={() => setRegistering(item)}
                  className="text-xs px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600"
                >
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={() => skipMutation.mutate(item.recurringId)}
                  disabled={skipMutation.isPending}
                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                >
                  Omitir
                </button>
              </div>
            </Row>
          ))}
          {upcoming.map((item) => (
            <Row key={`${item.recurringId}-${item.date}`} item={item} />
          ))}
        </div>
      )}

      <RegisterModal
        item={registering}
        onClose={() => setRegistering(null)}
        onDone={() => {
          setRegistering(null)
          invalidate()
        }}
      />
    </div>
  )
}

function Row({ item, children }: { item: UpcomingItem; children?: React.ReactNode }) {
  const title =
    item.description ?? (item.type === 'TRANSFER' ? 'Transferencia' : item.categoryName)
  const where =
    item.type === 'TRANSFER' ? `${item.accountName} → ${item.toAccountName}` : item.accountName
  const sign = item.type === 'INCOME' ? '+ ' : item.type === 'EXPENSE' ? '− ' : ''
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-12 text-xs text-gray-500 pt-0.5">{shortDate(item.date)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">
          {where}
          {item.overdue ? ' · Pendiente' : item.autoCreate ? ' · Automático' : ''}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-medium tabular-nums ${
            item.type === 'INCOME' ? 'text-brand-700' : ''
          } ${item.overdue ? 'text-amber-700' : ''}`}
        >
          {sign}
          {formatCurrency(item.amount, item.currency)}
        </p>
        {children}
      </div>
    </div>
  )
}

function RegisterModal({
  item,
  onClose,
  onDone,
}: {
  item: UpcomingItem | null
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [lastItem, setLastItem] = useState<UpcomingItem | null>(null)

  // Reiniciar el formulario al abrir otro pendiente
  if (item && item !== lastItem) {
    setLastItem(item)
    setAmount(item.amount)
    setDate(todayIso())
  }

  const mutation = useMutation({
    mutationFn: () => recurringApi.register(item!.recurringId, { amount, date }),
    onSuccess: onDone,
  })

  if (!item) return null
  const title = item.description ?? item.categoryName ?? 'Movimiento'

  return (
    <Modal open={!!item} onClose={onClose} title={`Registrar: ${title}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        {mutation.error && <ErrorState message={getErrorMessage(mutation.error)} />}
        <div>
          <label className="label">Monto ({currencySymbol(item.currency)})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input text-2xl font-semibold"
          />
          <p className="text-xs text-gray-500 mt-1">Ajústalo si el monto real fue distinto.</p>
        </div>
        <div>
          <label className="label">Fecha</label>
          <input
            type="date"
            required
            max={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
