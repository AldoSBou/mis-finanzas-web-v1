import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountsApi, goalsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol } from '@/lib/format'
import type { Goal } from '@/types/api'

const COLORS = ['#0F6E56', '#2a78d6', '#eb6834', '#7F77DD', '#e87ba4', '#eda100', '#B23A48', '#6B6B6B']

export function GoalFormModal({
  open,
  onClose,
  initial,
}: {
  open: boolean
  onClose: () => void
  initial?: Goal | null
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [accountId, setAccountId] = useState('')
  const [color, setColor] = useState(COLORS[0])

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })
  // Las cuentas de ahorro e inversión primero; las tarjetas no sirven para guardar dinero
  const options = accounts
    .filter((a) => a.type !== 'CREDIT_CARD')
    .sort((a, b) => Number(b.type === 'SAVINGS' || b.type === 'INVESTMENT') - Number(a.type === 'SAVINGS' || a.type === 'INVESTMENT'))
  const account = accounts.find((a) => String(a.id) === accountId)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setTarget(initial ? String(parseFloat(initial.targetAmount)) : '')
    setDate(initial?.targetDate ?? '')
    setAccountId(initial ? String(initial.accountId) : '')
    setColor(initial?.color ?? COLORS[0])
  }, [open, initial])

  // Cuenta por defecto: la primera de ahorro
  useEffect(() => {
    if (open && !initial && !accountId && options.length > 0) setAccountId(String(options[0].id))
  }, [open, initial, accountId, options])

  const mutation = useMutation({
    mutationFn: () => {
      const req = {
        name,
        targetAmount: target,
        targetDate: date || undefined,
        accountId: Number(accountId),
        color,
      }
      return initial ? goalsApi.update(initial.id, req) : goalsApi.create(req)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all })
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar meta' : 'Nueva meta'}>
      <form onSubmit={submit} className="space-y-4">
        {mutation.error && <ErrorState message={getErrorMessage(mutation.error)} />}
        <div>
          <label className="label">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="input"
            placeholder="Fondo de emergencia, viaje, laptop..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Objetivo ({currencySymbol(account?.currency ?? 'PEN')})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              className="input"
            />
          </div>
          <div>
            <label className="label">Para cuándo (opcional)</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Cuenta donde se guarda</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            className="input"
          >
            <option value="">Selecciona...</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Varias metas pueden compartir una cuenta: cada una lleva la cuenta de lo que le aportas.
          </p>
        </div>
        <div>
          <label className="label">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
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
