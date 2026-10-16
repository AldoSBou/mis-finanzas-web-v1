import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { buildWorkbook, monthLabel, workbookFileName } from '@/lib/cashflow-export'
import { cashflowApi, transactionsApi } from '@/api/services'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currentPeriod, formatCurrency, monthYear, shortDate } from '@/lib/format'
import type { CashflowRow, Transaction, TransactionType } from '@/types/api'

const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6] as const

/** Todos los movimientos de un mes (la API pagina de a 100). */
async function allTransactions(period: string, categoryId?: number, type?: TransactionType): Promise<Transaction[]> {
  const items: Transaction[] = []
  for (let page = 0; page < 50; page++) {
    const r = await transactionsApi.list({ period, categoryId, type }, page, 100)
    items.push(...r.items)
    if (items.length >= r.total || r.items.length === 0) break
  }
  return items
}

/**
 * Flujo de caja: la grilla tipo hoja de cálculo con ingresos, gastos y ahorro por categoría,
 * de 1 a 6 meses, exportable a Excel. Con un solo mes, cada categoría se abre y muestra
 * sus movimientos.
 */
export function CashflowPage() {
  const [until, setUntil] = useState(currentPeriod())
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>(1)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.cashflow.range(until, months),
    queryFn: () => cashflowApi.get(until, months),
  })

  const currency = data?.baseCurrency ?? 'PEN'
  const fmt = (v: string | number) => formatCurrency(v, currency)
  const single = months === 1
  const firstPeriod = data?.periods[0] ?? until

  const exportExcel = async () => {
    if (!data) return
    setExporting(true)
    try {
      const movements = single ? await allTransactions(until) : undefined
      XLSX.writeFile(buildWorkbook(data, currency, movements), workbookFileName(data))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Flujo de caja</h1>
          <p className="text-sm text-gray-500">
            {single ? monthYear(until) : `${monthYear(firstPeriod)} a ${monthYear(until)}`} · en {currency}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as (typeof MONTH_OPTIONS)[number])}
            className="input w-auto py-1.5"
            aria-label="Cantidad de meses"
          >
            {MONTH_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 mes' : `${n} meses`}
              </option>
            ))}
          </select>
          <PeriodSelector value={until} onChange={setUntil} />
          <button type="button" onClick={exportExcel} disabled={!data || exporting} className="btn-secondary py-1.5">
            <Download className="w-4 h-4 mr-1" />
            {exporting ? 'Exportando…' : 'Excel'}
          </button>
        </div>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {data && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left font-medium text-gray-500 px-4 py-2 sticky left-0 bg-gray-50 min-w-[180px]">
                  Concepto
                </th>
                {data.periods.map((p) => (
                  <th key={p} className="text-right font-medium text-gray-500 px-3 py-2 whitespace-nowrap">
                    {monthLabel(p)}
                  </th>
                ))}
                {!single && (
                  <>
                    <th className="text-right font-medium text-gray-500 px-3 py-2">Total</th>
                    <th className="text-right font-medium text-gray-500 px-3 py-2">Promedio</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              <Section
                title="Ingresos"
                rows={data.income}
                totals={data.totalIncome}
                totalLabel="Total ingresos"
                months={months}
                period={until}
                type="INCOME"
                fmt={fmt}
                tone="text-brand-700"
              />
              <Section
                title="Gastos"
                rows={data.expenses}
                totals={data.totalExpenses}
                totalLabel="Total gastos"
                months={months}
                period={until}
                type="EXPENSE"
                fmt={fmt}
                tone="text-red-700"
              />
              <Section
                title="Ahorro e inversión"
                rows={data.savings}
                totals={data.totalSavings}
                totalLabel="Total ahorro"
                months={months}
                period={until}
                fmt={fmt}
                tone="text-gray-900"
                emptyHint='Lo que pasas a cuentas de ahorro o inversión con "Mover dinero".'
              />
              <TotalRow label="Saldo del mes" values={data.net} months={months} fmt={fmt} strong signed />
              {!single && <TotalRow label="Acumulado" values={data.cumulative} months={months} fmt={fmt} signed noAverage />}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="text-xs text-gray-400 mt-3">
          Saldo del mes = ingresos − gastos − ahorro. Solo lo registrado; lo por venir está en el panel, en "Te quedan".
          {single ? ' Toca una categoría para ver sus movimientos.' : ''}
        </p>
      )}
    </div>
  )
}

function Section({
  title,
  rows,
  totals,
  totalLabel,
  months,
  period,
  type,
  fmt,
  tone,
  emptyHint,
}: {
  title: string
  rows: CashflowRow[]
  totals: string[]
  totalLabel: string
  months: number
  period: string
  type?: TransactionType
  fmt: (v: string | number) => string
  tone: string
  emptyHint?: string
}) {
  const single = months === 1
  const span = single ? 2 : months + 3
  return (
    <>
      <tr className="bg-gray-50/60">
        <td colSpan={span} className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
          {title}
        </td>
      </tr>
      {rows.length === 0 && (
        <tr>
          <td colSpan={span} className="px-4 py-2 text-gray-400 text-xs">
            {emptyHint ?? 'Nada registrado en estos meses.'}
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <CategoryRow key={`${title}-${r.id}`} row={r} months={months} period={period} type={type} fmt={fmt} />
      ))}
      <TotalRow label={totalLabel} values={totals} months={months} fmt={fmt} strong tone={tone} />
    </>
  )
}

function CategoryRow({
  row,
  months,
  period,
  type,
  fmt,
}: {
  row: CashflowRow
  months: number
  period: string
  type?: TransactionType
  fmt: (v: string | number) => string
}) {
  const [open, setOpen] = useState(false)
  const single = months === 1
  const canExpand = single && !!type

  const { data: movements, isLoading } = useQuery({
    queryKey: ['cashflow', 'movements', period, type, row.id],
    queryFn: () => allTransactions(period, row.id, type),
    enabled: open && canExpand,
  })

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        <td className="px-4 py-1.5 sticky left-0 bg-white">
          <button
            type="button"
            onClick={() => canExpand && setOpen((o) => !o)}
            className={`flex items-center gap-2 text-left ${canExpand ? 'hover:text-brand-700' : 'cursor-default'}`}
          >
            {canExpand ? (
              open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <span className="w-3.5" />
            )}
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color ?? '#9CA3AF' }} />
            <span className="truncate">{row.name}</span>
          </button>
        </td>
        {row.monthly.map((v, i) => (
          <td key={i} className="text-right px-3 py-1.5">
            {parseFloat(v) === 0 ? <span className="text-gray-300">–</span> : fmt(v)}
          </td>
        ))}
        {!single && (
          <>
            <td className="text-right px-3 py-1.5 font-medium">{fmt(row.total)}</td>
            <td className="text-right px-3 py-1.5 text-gray-500">{fmt(parseFloat(row.total) / months)}</td>
          </>
        )}
      </tr>
      {open && canExpand && (
        <tr>
          <td colSpan={2} className="px-4 pb-2 bg-gray-50/40">
            {isLoading && <p className="text-xs text-gray-400 py-1">Cargando…</p>}
            {movements && (
              <table className="w-full text-xs">
                <tbody>
                  {movements.map((t) => (
                    <tr key={t.id} className="text-gray-600">
                      <td className="pl-9 py-0.5 w-16 whitespace-nowrap">{shortDate(t.transactionDate)}</td>
                      <td className="py-0.5 truncate max-w-[260px]">
                        {t.description || t.categoryName}
                        <span className="text-gray-400"> · {t.accountName}</span>
                      </td>
                      <td className="text-right py-0.5 whitespace-nowrap">{fmt(t.amountBase)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function TotalRow({
  label,
  values,
  months,
  fmt,
  strong,
  signed,
  noAverage,
  tone,
}: {
  label: string
  values: string[]
  months: number
  fmt: (v: string | number) => string
  strong?: boolean
  signed?: boolean
  noAverage?: boolean
  tone?: string
}) {
  const single = months === 1
  const total = values.reduce((s, v) => s + parseFloat(v), 0)
  const color = (v: number) => (signed ? (v < 0 ? 'text-red-600' : v > 0 ? 'text-brand-700' : '') : (tone ?? ''))
  return (
    <tr className={`border-t ${strong ? 'border-gray-300 bg-gray-50' : 'border-gray-200'}`}>
      <td className={`px-4 py-2 sticky left-0 ${strong ? 'bg-gray-50 font-semibold' : 'bg-white'}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`text-right px-3 py-2 ${strong ? 'font-semibold' : ''} ${color(parseFloat(v))}`}>
          {fmt(v)}
        </td>
      ))}
      {!single && (
        <>
          <td className={`text-right px-3 py-2 font-semibold ${color(total)}`}>{noAverage ? '' : fmt(total)}</td>
          <td className="text-right px-3 py-2 text-gray-500">{noAverage ? '' : fmt(total / months)}</td>
        </>
      )}
    </tr>
  )
}
