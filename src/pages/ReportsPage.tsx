import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportsApi } from '@/api/services'
import { ErrorState, Loading } from '@/components/ui/States'
import {
  AXIS_TICK,
  ChartCard,
  ChartTooltip,
  DataTable,
  GRID,
  OTHER,
  SERIES,
  compactAmount,
  legendText,
  monthShort,
} from '@/features/reports/charts'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/format'

const RANGES = [6, 12] as const

export function ReportsPage() {
  const [months, setMonths] = useState<(typeof RANGES)[number]>(6)
  const [tables, setTables] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setTables((t) => ({ ...t, [key]: !t[key] }))

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.reports.range(months),
    queryFn: () => reportsApi.get(months),
  })

  const currency = data?.baseCurrency ?? 'PEN'
  const fmt = (v: number | string) => formatCurrency(v, currency)

  // Datos numéricos para Recharts (la API manda montos como texto/decimal)
  const monthly =
    data?.months.map((m) => ({
      period: m.period,
      income: Number(m.income),
      expenses: Number(m.expenses),
      savings: Number(m.savings),
      netWorth: Number(m.netWorth),
    })) ?? []

  const categories = data?.categories ?? []
  const byCategory = monthly.map((m, i) => {
    const row: Record<string, number | string> = { period: m.period }
    categories.forEach((c, ci) => {
      row[`c${ci}`] = Number(c.monthly[i])
    })
    return row
  })

  // Resumen: promedio mensual y tasa de ahorro del rango
  const totalIncome = monthly.reduce((s, m) => s + m.income, 0)
  const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0)
  const totalSavings = monthly.reduce((s, m) => s + m.savings, 0)
  const savingsRate = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : null
  const first = monthly[0]
  const last = monthly[monthly.length - 1]
  const netWorthChange = first && last ? last.netWorth - first.netWorth : 0

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Reportes</h1>
          <p className="text-sm text-gray-500">Cómo evolucionan tus finanzas mes a mes</p>
        </div>
        <div className="inline-flex bg-gray-100 rounded-md p-1" role="group" aria-label="Rango">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setMonths(r)}
              aria-pressed={months === r}
              className={`px-3 py-1 text-sm rounded ${
                months === r ? 'bg-white shadow-sm font-medium' : 'text-gray-600'
              }`}
            >
              {r} meses
            </button>
          ))}
        </div>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Gasto promedio al mes" value={fmt(totalExpenses / months)} />
            <Stat
              label="Tasa de ahorro"
              value={savingsRate !== null ? `${savingsRate}%` : '—'}
              hint={`Ahorraste ${fmt(totalSavings)} de ${fmt(totalIncome)}`}
            />
            <Stat
              label="Patrimonio"
              value={last ? fmt(last.netWorth) : '—'}
              hint={
                first
                  ? `${netWorthChange >= 0 ? '+' : '−'} ${fmt(Math.abs(netWorthChange))} en ${months} meses`
                  : undefined
              }
            />
          </div>

          <ChartCard
            title="Ingresos, gastos y ahorro"
            subtitle="Gastos = consumo; el ahorro son las transferencias a cuentas de ahorro"
            showTable={!!tables.flow}
            onToggleTable={() => toggle('flow')}
          >
            {tables.flow ? (
              <DataTable
                columns={['Ingresos', 'Gastos', 'Ahorro']}
                rows={monthly.map((m) => ({
                  key: m.period,
                  label: monthShort(m.period),
                  values: [fmt(m.income), fmt(m.expenses), fmt(m.savings)],
                }))}
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={monthShort}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={compactAmount}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    content={<ChartTooltip currency={currency} />}
                  />
                  <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                  <Bar dataKey="income" name="Ingresos" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Gastos" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="savings" name="Ahorro" fill={SERIES[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Gasto por categoría"
            subtitle={
              categories.length > 0
                ? `Tus ${Math.min(categories.length, 5)} categorías con más gasto del período`
                : undefined
            }
            showTable={!!tables.cat}
            onToggleTable={() => toggle('cat')}
          >
            {categories.length === 0 ? (
              <p className="text-sm text-gray-500">Sin gastos en este período.</p>
            ) : tables.cat ? (
              <DataTable
                columns={categories.map((c) => c.name)}
                rows={monthly.map((m, i) => ({
                  key: m.period,
                  label: monthShort(m.period),
                  values: categories.map((c) => fmt(c.monthly[i])),
                }))}
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byCategory} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={monthShort}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={compactAmount}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    content={<ChartTooltip currency={currency} />}
                  />
                  <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                  {categories.map((c, i) => (
                    <Bar
                      key={c.categoryId ?? 'otros'}
                      dataKey={`c${i}`}
                      name={c.name}
                      stackId="cat"
                      fill={c.categoryId === null ? OTHER : SERIES[i % SERIES.length]}
                      stroke="#ffffff"
                      strokeWidth={1}
                      radius={i === categories.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Patrimonio"
            subtitle={
              data.netWorthApproximate
                ? 'Suma de tus cuentas al cierre de cada mes · cuentas en otra moneda al último tipo de cambio'
                : 'Suma de tus cuentas al cierre de cada mes'
            }
            showTable={!!tables.nw}
            onToggleTable={() => toggle('nw')}
          >
            {tables.nw ? (
              <DataTable
                columns={['Patrimonio']}
                rows={monthly.map((m) => ({
                  key: m.period,
                  label: monthShort(m.period),
                  values: [fmt(m.netWorth)],
                }))}
              />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthly}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={monthShort}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={compactAmount}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    cursor={{ stroke: '#9ca3af', strokeWidth: 1 }}
                    content={<ChartTooltip currency={currency} />}
                  />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Patrimonio"
                    stroke={SERIES[0]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: SERIES[0], stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className="text-xl md:text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
