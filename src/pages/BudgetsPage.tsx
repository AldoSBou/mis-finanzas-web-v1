import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { categoryBudgetsApi } from '@/api/services'
import { BudgetBar } from '@/features/budgets/BudgetBar'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, currentPeriod, formatCurrency, periodLabel } from '@/lib/format'
import type { CategoryBudgetItem } from '@/types/api'

export function BudgetsPage() {
  const [period, setPeriod] = useState(currentPeriod())
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.categoryBudgets.period(period),
    queryFn: () => categoryBudgetsApi.summary(period),
  })

  const withLimit = data?.items.filter((i) => i.limit) ?? []
  const withoutLimit = data?.items.filter((i) => !i.limit) ?? []
  const currency = data?.baseCurrency ?? 'PEN'
  const totalPct =
    data && parseFloat(data.totalLimit) > 0
      ? Math.round((parseFloat(data.totalSpent) / parseFloat(data.totalLimit)) * 100)
      : null

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Presupuestos</h1>
          <p className="text-sm text-gray-500">Límite mensual por categoría · {periodLabel(period)}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && (
        <>
          {withLimit.length > 0 && (
            <div className="card mb-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Gastado en categorías con límite
              </p>
              <p className="text-xl md:text-2xl font-semibold tabular-nums">
                {formatCurrency(data.totalSpent, currency)}
                <span className="text-base text-gray-400 font-normal">
                  {' '}
                  / {formatCurrency(data.totalLimit, currency)}
                </span>
              </p>
              {totalPct !== null && (
                <p className="text-xs text-gray-500 mt-1">{totalPct}% del total presupuestado</p>
              )}
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-700 mb-2">Con límite</h2>
          {withLimit.length === 0 ? (
            <p className="text-sm text-gray-500 mb-6">
              Aún no defines límites. Empieza por las categorías donde más se te va el dinero,
              como Restaurantes o Entretenimiento.
            </p>
          ) : (
            <div className="card divide-y divide-gray-100 p-0 mb-6">
              {withLimit.map((i) => (
                <BudgetRow key={i.categoryId} item={i} period={period} currency={currency} />
              ))}
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sin límite</h2>
          <div className="card divide-y divide-gray-100 p-0">
            {withoutLimit.map((i) => (
              <BudgetRow key={i.categoryId} item={i} period={period} currency={currency} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BudgetRow({
  item,
  period,
  currency,
}: {
  item: CategoryBudgetItem
  period: string
  currency: string
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')

  const onSaved = () => {
    setEditing(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.categoryBudgets.all })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const saveMutation = useMutation({
    mutationFn: () => categoryBudgetsApi.set(item.categoryId, amount),
    onSuccess: onSaved,
  })
  const removeMutation = useMutation({
    mutationFn: () => categoryBudgetsApi.remove(item.categoryId),
    onSuccess: onSaved,
  })

  const startEditing = () => {
    setAmount(item.limit ? String(parseFloat(item.limit)) : '')
    setEditing(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    saveMutation.mutate()
  }

  const mutationError = saveMutation.error ?? removeMutation.error
  const scheduled = parseFloat(item.scheduled)
  const isCurrent = period === currentPeriod()

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: item.categoryColor ?? '#6B6B6B' }}
        />
        <span className="flex-1 text-sm truncate">{item.categoryName}</span>
        {!editing && (
          <>
            <span className="text-sm tabular-nums">
              <span className={item.status === 'OVER' ? 'text-red-600 font-medium' : 'font-medium'}>
                {formatCurrency(item.spent, currency)}
              </span>
              {item.limit && (
                <span className="text-gray-400"> / {formatCurrency(item.limit, currency)}</span>
              )}
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="text-xs text-brand-700 hover:underline whitespace-nowrap"
            >
              {item.limit ? 'Editar' : 'Definir límite'}
            </button>
          </>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">{currencySymbol(currency)}</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input w-32 py-1.5"
            placeholder="Límite al mes"
          />
          <button type="submit" disabled={saveMutation.isPending} className="btn-primary py-1.5">
            Guardar
          </button>
          {item.limit && (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="btn-secondary py-1.5"
            >
              Quitar límite
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-gray-500 hover:underline"
          >
            Cancelar
          </button>
        </form>
      )}
      {mutationError && (
        <div className="mt-2">
          <ErrorState message={getErrorMessage(mutationError)} />
        </div>
      )}

      {item.limit && !editing && (
        <div className="mt-2">
          <BudgetBar item={item} />
          {isCurrent && scheduled > 0 && (
            <p className="text-[11px] text-gray-500 mt-1">
              + {formatCurrency(scheduled, currency)} programado este mes
              {item.willExceed ? ' · te pasarás del límite' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
