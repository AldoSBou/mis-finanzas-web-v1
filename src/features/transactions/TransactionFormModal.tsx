import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountsApi, categoriesApi, recurringApi, transactionsApi } from '@/api/services'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { useAuth } from '@/features/auth/AuthProvider'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, formatCurrency, todayIso } from '@/lib/format'
import type {
  Frequency,
  Recurring,
  RecurringRequest,
  Transaction,
  TransactionRequest,
  TransactionType,
} from '@/types/api'

interface FormValues {
  type: TransactionType
  amount: string
  accountId: string
  toAccountId: string
  toAmount: string
  exchangeRate: string
  categoryId: string
  transactionDate: string
  description: string
  /** '' = no se repite */
  frequency: '' | Frequency
  autoCreate: boolean
  endDate: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Editar un movimiento existente */
  initial?: Transaction | null
  /** Editar un recurrente existente */
  recurring?: Recurring | null
  /** Crear un recurrente nuevo (la repetición es obligatoria) */
  recurringMode?: boolean
}

const LAST_ACCOUNT_KEY = 'mis-finanzas:last-account'

function readLastAccount(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveLastAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id)
  } catch {
    // Sin storage (modo privado): solo se pierde la preferencia
  }
}

const EMPTY: FormValues = {
  type: 'EXPENSE',
  amount: '',
  accountId: '',
  toAccountId: '',
  toAmount: '',
  exchangeRate: '',
  categoryId: '',
  transactionDate: todayIso(),
  description: '',
  frequency: '',
  autoCreate: true,
  endDate: '',
}

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'TRANSFER', label: 'Transferencia' },
]

export function TransactionFormModal({
  open,
  onClose,
  onSuccess,
  initial,
  recurring,
  recurringMode,
}: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const baseCurrency = user?.currencyDefault ?? 'PEN'
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, setValue, getValues, formState: { errors } } =
    useForm<FormValues>({ defaultValues: EMPTY })

  const type = watch('type')
  const accountId = watch('accountId')
  const toAccountId = watch('toAccountId')
  const amount = watch('amount')
  const exchangeRate = watch('exchangeRate')
  const frequency = watch('frequency')
  const autoCreate = watch('autoCreate')
  const isTransfer = type === 'TRANSFER'
  const isRecurringForm = !!recurring || !!recurringMode
  const repeats = isRecurringForm || !!frequency

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
    enabled: open,
  })

  // Incluye archivadas para poder editar movimientos antiguos, pero solo se ofrecen
  // las activas y las que ya usa el movimiento en edición.
  const { data: allAccounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(true),
    queryFn: () => accountsApi.list(true),
    enabled: open,
  })
  const accounts = useMemo(
    () =>
      allAccounts.filter(
        (a) =>
          !a.archived ||
          a.id === initial?.accountId ||
          a.id === initial?.toAccountId ||
          a.id === recurring?.accountId ||
          a.id === recurring?.toAccountId,
      ),
    [allAccounts, initial, recurring],
  )

  const from = accounts.find((a) => String(a.id) === accountId)
  const to = accounts.find((a) => String(a.id) === toAccountId)
  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  )
  const differentCurrencies = isTransfer && !!from && !!to && from.currency !== to.currency
  // Si es transferencia hacia la moneda base, el tipo de cambio sale de los montos
  const needsRate =
    !!from && from.currency !== baseCurrency && !(isTransfer && to?.currency === baseCurrency)

  const { data: suggestedRate } = useQuery({
    queryKey: queryKeys.transactions.exchangeRate(from?.currency ?? ''),
    queryFn: () => transactionsApi.latestExchangeRate(from!.currency),
    enabled: open && needsRate,
  })

  // Cargar valores iniciales
  useEffect(() => {
    if (!open) return
    if (recurring) {
      reset({
        type: recurring.type,
        amount: recurring.amount,
        accountId: String(recurring.accountId),
        toAccountId: recurring.toAccountId ? String(recurring.toAccountId) : '',
        toAmount: recurring.toAmount ?? '',
        exchangeRate: recurring.exchangeRate ?? '',
        categoryId: recurring.categoryId ? String(recurring.categoryId) : '',
        transactionDate: recurring.nextDate,
        description: recurring.description ?? '',
        frequency: recurring.frequency,
        autoCreate: recurring.autoCreate,
        endDate: recurring.endDate ?? '',
      })
    } else if (initial) {
      reset({
        type: initial.type,
        amount: initial.amount,
        accountId: String(initial.accountId),
        toAccountId: initial.toAccountId ? String(initial.toAccountId) : '',
        toAmount: initial.toAmount ?? '',
        exchangeRate: initial.currency !== baseCurrency ? initial.exchangeRate : '',
        categoryId: initial.categoryId ? String(initial.categoryId) : '',
        transactionDate: initial.transactionDate,
        description: initial.description ?? '',
        frequency: '',
        autoCreate: true,
        endDate: '',
      })
    } else {
      reset({ ...EMPTY, transactionDate: todayIso(), frequency: recurringMode ? 'MONTHLY' : '' })
    }
    setError(null)
  }, [initial, recurring, recurringMode, open, reset, baseCurrency])

  // Cuenta por defecto: la última usada; si no, la primera cuenta corriente en moneda base
  useEffect(() => {
    if (!open || initial || recurring || getValues('accountId') || accounts.length === 0) return
    const last = readLastAccount()
    const spending = accounts.filter((a) => a.type !== 'SAVINGS' && a.type !== 'INVESTMENT')
    const fallback =
      spending.find((a) => a.currency === baseCurrency) ?? spending[0] ?? accounts[0]
    setValue('accountId', accounts.some((a) => String(a.id) === last) ? last : String(fallback.id))
  }, [open, initial, recurring, accounts, baseCurrency, getValues, setValue])

  // Si cambia el tipo, limpia la categoría si ya no aplica
  useEffect(() => {
    const currentCatId = getValues('categoryId')
    if (currentCatId && !filteredCategories.some((c) => String(c.id) === currentCatId)) {
      setValue('categoryId', '')
    }
  }, [type, filteredCategories, getValues, setValue])

  // El destino no puede ser la misma cuenta de origen
  useEffect(() => {
    if (toAccountId && toAccountId === accountId) setValue('toAccountId', '')
  }, [accountId, toAccountId, setValue])

  // Prellenar el tipo de cambio con el último usado
  useEffect(() => {
    if (needsRate && suggestedRate && !getValues('exchangeRate')) {
      setValue('exchangeRate', String(parseFloat(suggestedRate.rate)))
    }
  }, [needsRate, suggestedRate, getValues, setValue])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: TransactionRequest = {
        type: values.type,
        accountId: Number(values.accountId),
        amount: values.amount,
        transactionDate: values.transactionDate,
        description: values.description || undefined,
        paymentMethod: initial?.paymentMethod ?? undefined,
      }
      if (values.type === 'TRANSFER') {
        payload.toAccountId = Number(values.toAccountId)
        if (differentCurrencies) payload.toAmount = values.toAmount
      } else {
        payload.categoryId = Number(values.categoryId)
      }
      if (needsRate) payload.exchangeRate = values.exchangeRate

      if (repeats && values.frequency) {
        const { transactionDate, paymentMethod: _pm, ...rest } = payload
        const req: RecurringRequest = {
          ...rest,
          frequency: values.frequency,
          startDate: transactionDate,
          endDate: values.endDate || undefined,
          autoCreate: values.autoCreate,
        }
        if (recurring) return recurringApi.update(recurring.id, req)
        const created = await recurringApi.create(req)
        // Desde "nuevo movimiento", este ya ocurrió: si no es automático, se registra ahora
        if (!recurringMode && !req.autoCreate && transactionDate <= todayIso()) {
          await recurringApi.register(created.id, { date: transactionDate })
        }
        return created
      }
      if (initial) return transactionsApi.update(initial.id, payload)
      return transactionsApi.create(payload)
    },
    onSuccess: (_data, values) => {
      saveLastAccount(values.accountId)
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.categoryBudgets.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSuccess?.()
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const onSubmit = (values: FormValues) => {
    setError(null)
    if (!values.accountId) return setError('Selecciona una cuenta')
    if (isTransfer && !values.toAccountId) return setError('Selecciona la cuenta destino')
    if (!isTransfer && !values.categoryId) return setError('Selecciona una categoría')
    if (differentCurrencies && !values.toAmount) {
      return setError(`Indica cuánto se recibió en ${to!.currency}`)
    }
    if (needsRate && !values.exchangeRate) return setError('Indica el tipo de cambio')
    if (values.endDate && values.endDate < values.transactionDate) {
      return setError('La fecha de fin no puede ser anterior a la de inicio')
    }
    mutation.mutate(values)
  }

  const amountInBase =
    needsRate && amount && exchangeRate ? parseFloat(amount) * parseFloat(exchangeRate) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        recurring
          ? 'Editar recurrente'
          : recurringMode
            ? 'Nuevo recurrente'
            : initial
              ? 'Editar movimiento'
              : 'Nuevo movimiento'
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <ErrorState message={error} />}

        {/* Toggle tipo */}
        <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-md p-1">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue('type', opt.value)}
              className={`py-2 text-sm font-medium rounded ${
                type === opt.value ? 'bg-white shadow-sm' : 'text-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Monto ({currencySymbol(from?.currency ?? baseCurrency)})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            {...register('amount', { required: 'Monto requerido' })}
            className="input text-2xl font-semibold"
            placeholder="0.00"
          />
          {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount.message}</p>}
        </div>

        <div className={isTransfer ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label className="label">{isTransfer ? 'Desde' : 'Cuenta'}</label>
            <select {...register('accountId')} className="input">
              <option value="">Selecciona...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </div>
          {isTransfer && (
            <div>
              <label className="label">Hacia</label>
              <select {...register('toAccountId')} className="input">
                <option value="">Selecciona...</option>
                {accounts
                  .filter((a) => String(a.id) !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {differentCurrencies && (
          <div>
            <label className="label">Monto recibido ({currencySymbol(to!.currency)})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              {...register('toAmount')}
              className="input"
              placeholder="0.00"
            />
          </div>
        )}

        {needsRate && (
          <div>
            <label className="label">
              Tipo de cambio (1 {currencySymbol(from!.currency)} = ? {currencySymbol(baseCurrency)})
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputMode="decimal"
              {...register('exchangeRate')}
              className="input"
              placeholder="3.75"
            />
            <p className="text-xs text-gray-500 mt-1">
              {amountInBase !== null && !Number.isNaN(amountInBase)
                ? `≈ ${formatCurrency(amountInBase, baseCurrency)}`
                : suggestedRate?.date
                  ? `Último usado: ${suggestedRate.date}`
                  : 'Así se suma a tus reportes en moneda base'}
            </p>
          </div>
        )}

        {!isTransfer && (
          <div>
            <label className="label">Categoría</label>
            <select {...register('categoryId')} className="input">
              <option value="">Selecciona...</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              {recurring ? 'Próxima fecha' : recurringMode ? 'Primera fecha' : 'Fecha'}
            </label>
            <input type="date" {...register('transactionDate', { required: true })} className="input" />
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
        </div>

        {isTransfer && to && (to.type === 'SAVINGS' || to.type === 'INVESTMENT') && (
          <p className="text-xs text-brand-700 bg-brand-50 rounded px-3 py-2">
            Cuenta como ahorro del mes, no como gasto.
          </p>
        )}

        {!initial && (
          <div className="rounded-md border border-gray-200 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Repetir</label>
                <select {...register('frequency')} className="input">
                  {!isRecurringForm && <option value="">No repetir</option>}
                  <option value="WEEKLY">Cada semana</option>
                  <option value="MONTHLY">Cada mes</option>
                  <option value="YEARLY">Cada año</option>
                </select>
              </div>
              {repeats && (
                <div>
                  <label className="label">Hasta (opcional)</label>
                  <input type="date" {...register('endDate')} className="input" />
                </div>
              )}
            </div>
            {repeats && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('autoCreate')} className="mt-1" />
                <span>
                  Registrar automáticamente
                  <span className="block text-xs text-gray-500">
                    {autoCreate
                      ? 'Se registra solo en cada fecha.'
                      : 'Queda pendiente en el panel para que confirmes el monto (útil para luz o agua).'}
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

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
