import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { accountsApi, dashboardApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import {
  bucketColor,
  bucketLabel,
  currentPeriod,
  formatCurrency,
  periodLabel,
} from '@/lib/format'
import { ErrorState, Loading } from '@/components/ui/States'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { getErrorMessage } from '@/lib/api-client'

export function DashboardPage() {
  const [period, setPeriod] = useState(currentPeriod())

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard.period(period),
    queryFn: () => dashboardApi.get(period),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })

  const fmt = (v: string | number) => formatCurrency(v, data?.baseCurrency ?? 'PEN')

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Panel</h1>
          <p className="text-sm text-gray-500">{periodLabel(period)}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && (
        <>
          {/* Banner: budget no configurado */}
          {!data.budgetConfigured && (
            <Link
              to={`/configurar?period=${period}`}
              className="flex items-start gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
            >
              <Settings2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-amber-900">
                  No has configurado tu ingreso esperado para {periodLabel(period)}
                </p>
                <p className="text-amber-700 text-xs mt-0.5">
                  La asignación está usando tu ingreso real del mes ({fmt(data.income)}) como referencia.
                  Configúralo para ver tus metas reales.
                </p>
              </div>
            </Link>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Metric label="Ingresos" value={fmt(data.income)} />
            <Metric label="Gastos" value={fmt(data.expenses)} />
            <Metric
              label="Ahorro del mes"
              value={fmt(data.savings)}
              hint={`En el año: ${fmt(data.savingsYearToDate)}`}
            />
            <Metric
              label="Disponible"
              value={fmt(data.balance)}
              accent={parseFloat(data.balance) >= 0 ? 'positive' : 'negative'}
              hint="Ingresos − gastos − ahorro"
            />
          </div>

          {/* Asignación + Top categorías */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  {data.activeRule ? `Asignación · ${data.activeRule.name}` : 'Asignación'}
                </h3>
                {data.budgetConfigured && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                    Sobre {fmt(data.expectedIncome)}
                  </span>
                )}
              </div>
              {data.bucketSummaries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Configura una regla activa para ver el detalle de asignación.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.bucketSummaries.map((b) => {
                    const pct = Math.min(parseFloat(b.percentageUsed), 100)
                    const isOver = parseFloat(b.percentageUsed) > 100
                    return (
                      <div key={b.bucket}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{bucketLabel(b.bucket)}</span>
                          <span
                            className={`font-medium tabular-nums ${
                              isOver ? 'text-red-600' : ''
                            }`}
                          >
                            {fmt(b.spent)}{' '}
                            <span className="text-gray-400 font-normal">
                              / {fmt(b.allocated)}
                            </span>
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: isOver ? '#DC2626' : bucketColor(b.bucket),
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold mb-3">Top categorías gastadas</h3>
              {data.topCategories.length === 0 ? (
                <p className="text-sm text-gray-500">Sin gastos registrados este mes.</p>
              ) : (
                <div className="space-y-3">
                  {data.topCategories.map((c) => {
                    const max = parseFloat(data.topCategories[0].total) || 1
                    const pct = (parseFloat(c.total) / max) * 100
                    return (
                      <div key={c.categoryId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{c.categoryName}</span>
                          <span className="font-medium tabular-nums">{fmt(c.total)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded overflow-hidden">
                          <div className="h-full bg-brand-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="card mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Cuentas</h3>
                <Link to="/cuentas" className="text-xs text-brand-700 hover:underline">
                  Ver todas
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                {accounts.map((a) => (
                  <Link
                    key={a.id}
                    to={`/movimientos?cuenta=${a.id}`}
                    className="flex items-center justify-between text-sm py-1 hover:text-brand-700"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: a.color ?? '#6B6B6B' }}
                      />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span
                      className={`font-medium tabular-nums ${
                        parseFloat(a.balance) < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {formatCurrency(a.balance, a.currency)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: string
  accent?: 'positive' | 'negative'
  hint?: string
}) {
  const color =
    accent === 'positive' ? 'text-brand-700' : accent === 'negative' ? 'text-red-600' : ''
  return (
    <div className="card">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`text-xl md:text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
