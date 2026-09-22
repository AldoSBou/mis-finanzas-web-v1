import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountsApi, goalsApi, transactionsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { useAuth } from '@/features/auth/AuthProvider'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, formatCurrency, todayIso } from '@/lib/format'
import type { Goal } from '@/types/api'

/** Aportar a una meta (desde otra cuenta o asignando saldo) o retirar de ella. */
export function ContributionModal({
  goal,
  direction,
  unassigned,
  onClose,
}: {
  goal: Goal | null
  direction: 'IN' | 'OUT'
  /** Saldo libre en la cuenta de la meta */
  unassigned: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const baseCurrency = user?.currencyDefault ?? 'PEN'
  const [amount, setAmount] = useState('')
  const [other, setOther] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [rate, setRate] = useState('')

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
    enabled: !!goal,
  })
  const others = accounts.filter(
    (a) => goal && a.id !== goal.accountId && a.currency === goal.currency && a.type !== 'CREDIT_CARD',
  )
  const currency = goal?.currency ?? baseCurrency
  const moves = other !== ''
  const needsRate = moves && currency !== baseCurrency

  const { data: latestRate } = useQuery({
    queryKey: queryKeys.transactions.exchangeRate(currency),
    queryFn: () => transactionsApi.latestExchangeRate(currency),
    enabled: needsRate,
  })

  useEffect(() => {
    if (!goal) return
    setAmount('')
    setDate(todayIso())
    setNote('')
    setRate('')
  }, [goal, direction])

  // Aportar: por defecto desde otra cuenta (mueve dinero); retirar: solo liberar.
  // Se recalcula cuando llegan las cuentas.
  const firstOther = others[0]?.id
  useEffect(() => {
    if (goal) setOther(direction === 'IN' && firstOther ? String(firstOther) : '')
  }, [goal, direction, firstOther])

  useEffect(() => {
    if (needsRate && latestRate && !rate) setRate(String(parseFloat(latestRate.rate)))
  }, [needsRate, latestRate, rate])

  const mutation = useMutation({
    mutationFn: () =>
      goalsApi.contribute(goal!.id, {
        amount,
        direction,
        otherAccountId: other ? Number(other) : undefined,
        exchangeRate: needsRate ? rate : undefined,
        date,
        note: note || undefined,
      }),
    onSuccess: () => {
      for (const key of [['goals'], ['accounts'], ['transactions'], ['dashboard'], ['reports']]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      onClose()
    },
  })

  if (!goal) return null
  const fmt = (v: number | string) => formatCurrency(v, currency)
  const isIn = direction === 'IN'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <Modal open={!!goal} onClose={onClose} title={`${isIn ? 'Aportar a' : 'Retirar de'} ${goal.name}`}>
      <form onSubmit={submit} className="space-y-4">
        {mutation.error && <ErrorState message={getErrorMessage(mutation.error)} />}
        <div>
          <label className="label">Monto ({currencySymbol(currency)})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input text-2xl font-semibold"
          />
          <p className="text-xs text-gray-500 mt-1">
            {isIn
              ? `Faltan ${fmt(goal.remaining)} para la meta.`
              : `Ahorrado en la meta: ${fmt(goal.saved)}.`}
          </p>
        </div>
        <div>
          <label className="label">{isIn ? 'De dónde sale' : 'A dónde va'}</label>
          <select value={other} onChange={(e) => setOther(e.target.value)} className="input">
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {isIn ? 'Transferir desde' : 'Transferir a'} {a.name}
              </option>
            ))}
            <option value="">
              {isIn
                ? `Ya está en ${goal.accountName} (solo asignar)`
                : `Queda en ${goal.accountName} (solo liberar)`}
            </option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {moves
              ? isIn
                ? `Se registra la transferencia a ${goal.accountName}; cuenta como ahorro del mes.`
                : `Se registra la transferencia desde ${goal.accountName}.`
              : isIn
                ? `Sin asignar en ${goal.accountName}: ${fmt(Math.max(0, unassigned))}.`
                : 'El dinero sigue en la cuenta, pero ya no cuenta para esta meta.'}
          </p>
        </div>
        {needsRate && (
          <div>
            <label className="label">
              Tipo de cambio (1 {currencySymbol(currency)} = ? {currencySymbol(baseCurrency)})
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input w-40"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label className="label">Nota</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Opcional"
              className="input"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando...' : isIn ? 'Aportar' : 'Retirar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
