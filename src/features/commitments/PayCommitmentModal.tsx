import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { accountsApi, commitmentsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, todayIso } from '@/lib/format'
import type { Commitment } from '@/types/api'
import { useInvalidateCommitments } from './CommitmentsCard'

/** Pagar un compromiso: registra el gasto (o el "mover dinero") y lo cierra. */
export function PayCommitmentModal({ commitment: c, onClose }: { commitment: Commitment | null; onClose: () => void }) {
  const invalidate = useInvalidateCommitments()
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
    enabled: !!c,
  })
  const candidates = accounts.filter((a) => a.id !== c?.toAccountId && a.currency === c?.currency)

  useEffect(() => {
    if (!c) return
    setAmount(c.amount)
    setDate(todayIso())
    setAccountId(c.accountId ? String(c.accountId) : '')
    setError(null)
  }, [c])

  // Si no hay cuenta sugerida y solo hay una candidata, se usa esa
  useEffect(() => {
    if (c && !accountId && candidates.length === 1) setAccountId(String(candidates[0].id))
  }, [c, accountId, candidates])

  const mutation = useMutation({
    mutationFn: () => commitmentsApi.pay(c!.id, { accountId: Number(accountId), amount, date }),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  if (!c) return null

  return (
    <Modal open={!!c} onClose={onClose} title={`Pagar: ${c.name}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!accountId) return setError('Elige desde qué cuenta pagaste')
          mutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorState message={error} />}
        <div>
          <label className="label">Monto ({currencySymbol(c.currency)})</label>
          <MoneyInput value={amount} onChange={setAmount} className="input text-2xl font-semibold" autoFocus />
          <p className="text-xs text-gray-500 mt-1">Ajústalo si pagaste otro monto.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Desde</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
              <option value="">Selecciona...</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha</label>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="input" />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {c.toAccountId
            ? `Se registra como "mover dinero" hacia ${c.toAccountName}.`
            : `Se registra como gasto en ${c.categoryName}.`}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando...' : 'Pagado'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
