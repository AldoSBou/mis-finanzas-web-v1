import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cardsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol } from '@/lib/format'
import type { StatementInfo } from '@/lib/bank-profiles'

interface FormValues {
  closingDate: string
  dueDate: string
  totalDue: string
  minimumDue: string
}

interface Props {
  open: boolean
  onClose: () => void
  accountId: number
  cardName: string
  currency: string
  /** Valores leídos del PDF o del ciclo anterior */
  initial?: StatementInfo
  /** Nota sobre de dónde salieron los valores */
  note?: string
  onSaved?: () => void
}

/** Registra el pago del mes y el mínimo que informa el banco para un ciclo. */
export function StatementFormModal({ open, onClose, accountId, cardName, currency, initial, note, onSaved }: Props) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, reset } = useForm<FormValues>()

  useEffect(() => {
    if (!open) return
    reset({
      closingDate: initial?.closingDate ?? '',
      dueDate: initial?.dueDate ?? '',
      totalDue: initial?.totalDue ?? '',
      minimumDue: initial?.minimumDue ?? '',
    })
    setError(null)
  }, [open, initial, reset])

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      cardsApi.saveStatement(accountId, {
        closingDate: v.closingDate,
        dueDate: v.dueDate,
        totalDue: v.totalDue,
        minimumDue: v.minimumDue || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cards.all })
      onSaved?.()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const onSubmit = (v: FormValues) => {
    if (v.dueDate < v.closingDate) return setError('El vencimiento no puede ser antes del cierre')
    mutation.mutate(v)
  }

  const symbol = currencySymbol(currency)
  return (
    <Modal open={open} onClose={onClose} title={`Estado de cuenta · ${cardName}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <ErrorState message={error} />}
        {note && <p className="text-xs text-brand-700 bg-brand-50 rounded px-3 py-2">{note}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha de cierre</label>
            <input type="date" {...register('closingDate', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">Último día de pago</label>
            <input type="date" {...register('dueDate', { required: true })} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Pago del mes ({symbol})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register('totalDue', { required: true })}
              className="input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label">Pago mínimo ({symbol})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register('minimumDue')}
              className="input"
              placeholder="Opcional"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Copia los montos de tu estado de cuenta: el pago del mes incluye las cuotas del mes y es lo
          que evita intereses. Los pagos que registres después del cierre (transferencias hacia la
          tarjeta) se descuentan solos.
        </p>

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
