import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi, transactionsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { todayIso } from '@/lib/format'
import type { Transaction, TransactionType } from '@/types/api'
import { useState } from 'react'

interface FormValues {
  type: TransactionType
  amount: string
  categoryId: string
  transactionDate: string
  description: string
  paymentMethod: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initial?: Transaction | null
}

export function TransactionFormModal({ open, onClose, onSuccess, initial }: Props) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      defaultValues: {
        type: 'EXPENSE',
        amount: '',
        categoryId: '',
        transactionDate: todayIso(),
        description: '',
        paymentMethod: '',
      },
    })

  const type = watch('type')

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
    enabled: open,
  })

  const filteredCategories = categories.filter((c) => c.type === type)

  // Cargar valores iniciales si es edición
  useEffect(() => {
    if (initial && open) {
      reset({
        type: initial.type,
        amount: initial.amount,
        categoryId: String(initial.categoryId),
        transactionDate: initial.transactionDate,
        description: initial.description ?? '',
        paymentMethod: initial.paymentMethod ?? '',
      })
    } else if (open) {
      reset({
        type: 'EXPENSE',
        amount: '',
        categoryId: '',
        transactionDate: todayIso(),
        description: '',
        paymentMethod: '',
      })
    }
    setError(null)
  }, [initial, open, reset])

  // Si cambia el type, resetea categoryId si no aplica
  useEffect(() => {
    const currentCatId = watch('categoryId')
    if (currentCatId && !filteredCategories.find((c) => String(c.id) === currentCatId)) {
      setValue('categoryId', '')
    }
  }, [type, filteredCategories, setValue, watch])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        categoryId: Number(values.categoryId),
        amount: values.amount,
        type: values.type,
        transactionDate: values.transactionDate,
        description: values.description || undefined,
        paymentMethod: values.paymentMethod || undefined,
      }
      if (initial) return transactionsApi.update(initial.id, payload)
      return transactionsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSuccess?.()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const onSubmit = (values: FormValues) => {
    setError(null)
    if (!values.categoryId) {
      setError('Selecciona una categoría')
      return
    }
    mutation.mutate(values)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <ErrorState message={error} />}

        {/* Toggle tipo */}
        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-md p-1">
          <button
            type="button"
            onClick={() => setValue('type', 'INCOME')}
            className={`py-2 text-sm font-medium rounded ${
              type === 'INCOME' ? 'bg-white shadow-sm' : 'text-gray-600'
            }`}
          >
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => setValue('type', 'EXPENSE')}
            className={`py-2 text-sm font-medium rounded ${
              type === 'EXPENSE' ? 'bg-white shadow-sm' : 'text-gray-600'
            }`}
          >
            Gasto
          </button>
        </div>

        <div>
          <label className="label">Monto (S/)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            {...register('amount', { required: 'Monto requerido' })}
            className="input text-2xl font-semibold"
            placeholder="0.00"
          />
          {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount.message}</p>}
        </div>

        <div>
          <label className="label">Categoría</label>
          <select {...register('categoryId', { required: true })} className="input">
            <option value="">Selecciona...</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input type="date" {...register('transactionDate', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">Método</label>
            <input
              type="text"
              maxLength={40}
              placeholder="Tarjeta, efectivo..."
              {...register('paymentMethod')}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label">Descripción</label>
          <input
            type="text"
            maxLength={200}
            {...register('description')}
            className="input"
            placeholder="Opcional"
          />
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
