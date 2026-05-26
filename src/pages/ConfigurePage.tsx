import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { allocationRulesApi, budgetsApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import { ErrorState, Loading } from '@/components/ui/States'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import {
  bucketColor,
  bucketLabel,
  currentPeriod,
  formatCurrency,
  periodLabel,
} from '@/lib/format'
import { getErrorMessage } from '@/lib/api-client'

export function ConfigurePage() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState(currentPeriod())
  const [expectedIncome, setExpectedIncome] = useState('')
  const [activeRuleId, setActiveRuleId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Cargar budget existente del período
  const {
    data: existingBudget,
    isLoading: budgetLoading,
  } = useQuery({
    queryKey: queryKeys.budgets.period(period),
    queryFn: () => budgetsApi.get(period),
  })

  // Cargar reglas
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: queryKeys.rules.all,
    queryFn: allocationRulesApi.list,
  })

  // Sincronizar el form cuando cambia el período o llega data del backend
  useEffect(() => {
    if (existingBudget) {
      setExpectedIncome(existingBudget.expectedIncome)
      setActiveRuleId(existingBudget.activeRuleId)
    } else {
      setExpectedIncome('')
      setActiveRuleId(null)
    }
    setFeedback(null)
  }, [existingBudget, period])

  const upsertMutation = useMutation({
    mutationFn: budgetsApi.upsert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.period(period) })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.period(period) })
      setFeedback({ kind: 'ok', msg: 'Configuración guardada' })
    },
    onError: (err) => {
      setFeedback({ kind: 'err', msg: getErrorMessage(err) })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    const amount = parseFloat(expectedIncome)
    if (Number.isNaN(amount) || amount < 0) {
      setFeedback({ kind: 'err', msg: 'Ingresa un monto válido' })
      return
    }
    const [year, month] = period.split('-').map(Number)
    upsertMutation.mutate({
      year,
      month,
      expectedIncome: amount,
      activeRuleId,
    })
  }

  const isLoading = budgetLoading || rulesLoading
  const expectedNum = parseFloat(expectedIncome) || 0
  const selectedRule = rules.find((r) => r.id === activeRuleId)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Configurar mes</h1>
          <p className="text-sm text-gray-500">
            Define tu ingreso esperado y la regla activa para {periodLabel(period)}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {isLoading && <Loading />}

      {!isLoading && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ingreso esperado */}
          <div className="card">
            <label className="label" htmlFor="expectedIncome">
              Ingreso esperado del mes (S/)
            </label>
            <input
              id="expectedIncome"
              type="number"
              step="0.01"
              min="0"
              required
              className="input text-2xl font-semibold"
              placeholder="0.00"
              value={expectedIncome}
              onChange={(e) => setExpectedIncome(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-2">
              Esto se usa como base de cálculo para la asignación. Si tu sueldo aún no cae
              o varía, igual define un valor objetivo.
            </p>
          </div>

          {/* Regla activa */}
          <div className="card">
            <p className="label">Regla de asignación activa</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {rules.map((rule) => {
                const isSelected = rule.id === activeRuleId
                const entries = Object.entries(rule.percentages)
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => setActiveRuleId(rule.id)}
                    className={`text-left p-3 rounded-md border-2 transition-colors ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold">{rule.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-brand-700" />}
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden mb-1.5">
                      {entries.map(([bucket, pct]) => (
                        <div
                          key={bucket}
                          style={{ width: `${pct}%`, backgroundColor: bucketColor(bucket) }}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">
                      {entries.map(([b, p]) => `${p}% ${bucketLabel(b)}`).join(' · ')}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Vista previa de asignación */}
          {selectedRule && expectedNum > 0 && (
            <div className="card">
              <p className="label mb-2">Vista previa de asignación</p>
              <div className="space-y-2">
                {Object.entries(selectedRule.percentages).map(([bucket, pct]) => {
                  const amount = (expectedNum * pct) / 100
                  return (
                    <div key={bucket} className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-sm"
                          style={{ backgroundColor: bucketColor(bucket) }}
                        />
                        {bucketLabel(bucket)} ({pct}%)
                      </span>
                      <span className="font-medium tabular-nums">{formatCurrency(amount)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Feedback */}
          {feedback?.kind === 'err' && <ErrorState message={feedback.msg} />}
          {feedback?.kind === 'ok' && (
            <div className="flex items-center gap-2 p-3 bg-brand-50 border border-brand-200 rounded-md text-brand-700 text-sm">
              <Check className="w-4 h-4" />
              {feedback.msg}
            </div>
          )}

          {/* Botón */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={upsertMutation.isPending}
              className="btn-primary"
            >
              {upsertMutation.isPending
                ? 'Guardando...'
                : existingBudget
                  ? 'Actualizar configuración'
                  : 'Guardar configuración'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
