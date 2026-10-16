import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { accountsApi, categoriesApi, commitmentsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, todayIso } from '@/lib/format'
import type { Commitment } from '@/types/api'
import { useInvalidateCommitments } from './CommitmentsCard'

interface Props {
  open: boolean
  onClose: () => void
  initial?: Commitment | null
  currency: string
}

/** Un compromiso: qué, cuánto, cuándo, y si es un gasto o un pago a una cuenta propia (tarjeta). */
export function CommitmentFormModal({ open, onClose, initial, currency }: Props) {
  const invalidate = useInvalidateCommitments()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayIso())
  const [mode, setMode] = useState<'expense' | 'transfer'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
    enabled: open,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'EXPENSE'), [categories])
  const payFrom = accounts.filter((a) => String(a.id) !== toAccountId && a.type !== 'CREDIT_CARD')

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAmount(initial?.amount ?? '')
    setDueDate(initial?.dueDate ?? todayIso())
    setMode(initial?.toAccountId ? 'transfer' : 'expense')
    setCategoryId(initial?.categoryId ? String(initial.categoryId) : '')
    setToAccountId(initial?.toAccountId ? String(initial.toAccountId) : '')
    setAccountId(initial?.accountId ? String(initial.accountId) : '')
    setNote(initial?.note ?? '')
    setError(null)
  }, [open, initial])

  const mutation = useMutation({
    mutationFn: () => {
      const req = {
        name,
        amount,
        dueDate,
        categoryId: mode === 'expense' && categoryId ? Number(categoryId) : null,
        toAccountId: mode === 'transfer' && toAccountId ? Number(toAccountId) : null,
        accountId: accountId ? Number(accountId) : null,
        note: note || undefined,
      }
      return initial ? commitmentsApi.update(initial.id, req) : commitmentsApi.create(req)
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Ponle un nombre')
    if (!amount) return setError('Indica el monto')
    if (mode === 'expense' && !categoryId) return setError('Elige la categoría del gasto')
    if (mode === 'transfer' && !toAccountId) return setError('Elige a qué cuenta se paga')
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar compromiso' : 'Nuevo compromiso'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorState message={error} />}

        <div>
          <label className="label">Qué</label>
          <input
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Alquiler, colegio, cuota del préstamo..."
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Monto ({currencySymbol(currency)})</label>
            <MoneyInput value={amount} onChange={setAmount} className="input text-xl font-semibold" />
          </div>
          <div>
            <label className="label">Hasta cuándo</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-md p-1">
          {(['expense', 'transfer'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-2 text-sm font-medium rounded ${mode === m ? 'bg-white shadow-sm' : 'text-gray-600'}`}
            >
              {m === 'expense' ? 'Es un gasto' : 'Es pago a una cuenta mía'}
            </button>
          ))}
        </div>

        {mode === 'expense' ? (
          <div>
            <label className="label">Categoría</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">Selecciona...</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Se paga a</label>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="input">
              <option value="">Selecciona...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Para la deuda de una tarjeta o un préstamo que tienes como cuenta. Pagarlo es "mover
              dinero", no un gasto.
            </p>
          </div>
        )}

        {payFrom.length > 1 && (
          <div>
            <label className="label">Se paga desde (opcional)</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
              <option value="">Elegir al pagar</option>
              {payFrom.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Nota (opcional)</label>
          <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
