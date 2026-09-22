import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { useAuth } from '@/features/auth/AuthProvider'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { ACCOUNT_TYPES, CURRENCIES, accountTypeLabel, currencySymbol } from '@/lib/format'
import type { Account, AccountType } from '@/types/api'

interface FormValues {
  name: string
  type: AccountType
  currency: string
  /** Para tarjetas se ingresa la deuda en positivo; se guarda como saldo negativo. */
  initialBalance: string
  color: string
  creditLimit: string
  statementDay: string
  dueDay: string
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: Account | null
  /** Tipo para una cuenta nueva (por defecto, cuenta bancaria) */
  defaultType?: AccountType
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const COLORS = ['#1D9E75', '#0F6E56', '#378ADD', '#7F77DD', '#D85A30', '#E89F3E', '#B23A48', '#6B6B6B']

export function AccountFormModal({ open, onClose, initial, defaultType = 'BANK' }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, setValue } = useForm<FormValues>()
  const type = watch('type')
  const currency = watch('currency')
  const color = watch('color')
  const isCard = type === 'CREDIT_CARD'

  useEffect(() => {
    if (!open) return
    if (initial) {
      const balance = parseFloat(initial.initialBalance)
      reset({
        name: initial.name,
        type: initial.type,
        currency: initial.currency,
        initialBalance: String(initial.type === 'CREDIT_CARD' ? -balance : balance),
        color: initial.color ?? COLORS[0],
        creditLimit: initial.creditLimit ?? '',
        statementDay: initial.statementDay ? String(initial.statementDay) : '',
        dueDay: initial.dueDay ? String(initial.dueDay) : '',
      })
    } else {
      reset({
        name: '',
        type: defaultType,
        currency: user?.currencyDefault ?? 'PEN',
        initialBalance: '0',
        color: COLORS[2],
        creditLimit: '',
        statementDay: '',
        dueDay: '',
      })
    }
    setError(null)
  }, [initial, open, reset, user, defaultType])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amount = parseFloat(values.initialBalance || '0')
      const payload = {
        name: values.name,
        type: values.type,
        currency: values.currency,
        initialBalance: (values.type === 'CREDIT_CARD' ? -amount : amount).toFixed(2),
        color: values.color,
        creditLimit: values.creditLimit || null,
        statementDay: values.statementDay ? Number(values.statementDay) : null,
        dueDay: values.dueDay ? Number(values.dueDay) : null,
      }
      if (initial) return accountsApi.update(initial.id, payload)
      return accountsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar cuenta' : 'Nueva cuenta'}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {error && <ErrorState message={error} />}

        <div>
          <label className="label">Nombre</label>
          <input
            type="text"
            maxLength={60}
            {...register('name', { required: true })}
            className="input"
            placeholder="BCP Sueldo, Yape, Visa Interbank..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select {...register('type')} className="input">
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {accountTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Moneda</label>
            <select {...register('currency')} className="input">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">
            {isCard ? 'Deuda actual' : 'Saldo actual'} ({currencySymbol(currency || 'PEN')})
          </label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            {...register('initialBalance')}
            className="input"
            placeholder="0.00"
          />
          <p className="text-xs text-gray-500 mt-1">
            {isCard
              ? 'Lo que debes hoy en la tarjeta. Las compras suman deuda; los pagos se registran como transferencia hacia la tarjeta.'
              : 'Lo que tienes hoy. Desde aquí se suman los movimientos que registres.'}
          </p>
        </div>

        {isCard && (
          <div className="rounded-md border border-gray-200 p-3 space-y-3">
            <div>
              <label className="label">Línea de crédito ({currencySymbol(currency || 'PEN')})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                {...register('creditLimit')}
                className="input"
                placeholder="Opcional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Día de cierre</label>
                <select {...register('statementDay')} className="input">
                  <option value="">—</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Último día de pago</label>
                <select {...register('dueDay')} className="input">
                  <option value="">—</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Con la línea ves tu disponible; con las fechas, cuándo cierra y vence cada mes. Están en
              tu estado de cuenta.
            </p>
          </div>
        )}

        <div>
          <label className="label">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue('color', c)}
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
