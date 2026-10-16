import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { liquidityApi } from '@/api/services'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ErrorState } from '@/components/ui/States'
import { AXIS_TICK, GRID, SERIES, compactAmount } from '@/features/reports/charts'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { currencySymbol, formatCurrency, longDate, shortDate } from '@/lib/format'
import type { LiquidityEvent } from '@/types/api'

const LINE = SERIES[0]
const NEGATIVE = '#dc2626'
const DAILY_KEY = 'mis-finanzas:liquidity-daily'

function readDaily(): string {
  try {
    return localStorage.getItem(DAILY_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Liquidez: "¿me alcanza la plata de las cuentas hasta que caiga el sueldo?".
 * Una sola serie (el efectivo proyectado), con el día más bajo marcado y la lista de lo
 * que entra y sale. Distinta de "te quedan": aquí la tarjeta pesa el día que se paga.
 */
export function LiquidityCard() {
  const [daily, setDaily] = useState(readDaily)
  const [editingDaily, setEditingDaily] = useState(false)
  const [detail, setDetail] = useState(false)
  const [table, setTable] = useState(false)

  const { data, error } = useQuery({
    queryKey: queryKeys.liquidity.with(daily),
    queryFn: () => liquidityApi.get(daily || undefined),
  })

  if (error) return <ErrorState message={getErrorMessage(error)} />
  if (!data) return null

  const currency = data.baseCurrency
  const fmt = (v: string | number) => formatCurrency(v, currency)
  const lowest = parseFloat(data.lowest.balance)
  const excluded = data.accounts.filter((a) => a.balanceBase === null)
  const points = data.days.map((d) => ({ date: d.date, balance: parseFloat(d.balance) }))
  const lowestPoint = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0])

  const saveDaily = (v: string) => {
    setDaily(v)
    try {
      if (v) localStorage.setItem(DAILY_KEY, v)
      else localStorage.removeItem(DAILY_KEY)
    } catch {
      // sin storage: solo dura la sesión
    }
  }

  return (
    <div className="card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold">Liquidez hasta el {longDate(data.horizonEnd)}</h3>
          <p className="text-sm text-gray-600 mt-1">
            Hoy tienes <span className="font-medium">{fmt(data.opening)}</span> en tus cuentas.{' '}
            {data.firstNegative ? (
              <span className="text-red-700">
                Te quedas sin efectivo el {longDate(data.firstNegative)}: el punto más bajo es {fmt(data.lowest.balance)} el{' '}
                {shortDate(data.lowest.date)}.
              </span>
            ) : (
              <>
                El punto más bajo es <span className="font-medium">{fmt(data.lowest.balance)}</span> el {shortDate(data.lowest.date)}, y
                terminas con <span className="font-medium">{fmt(data.endBalance)}</span>.
              </>
            )}
          </p>
        </div>
        <div className="text-xs text-gray-500 whitespace-nowrap">
          Gasto variable:{' '}
          {editingDaily ? (
            <span className="inline-flex items-center gap-1">
              <MoneyInput
                value={daily}
                onChange={setDaily}
                className="input w-28 py-1 text-xs"
                placeholder={parseFloat(data.dailyVariableEstimated).toFixed(2)}
                autoFocus
                onBlur={() => {
                  saveDaily(daily)
                  setEditingDaily(false)
                }}
              />
              /día
            </span>
          ) : (
            <button type="button" onClick={() => setEditingDaily(true)} className="text-brand-700 hover:underline">
              {fmt(data.dailyVariable)} por día{daily ? ' (tuyo)' : ' (promedio 28 días)'}
            </button>
          )}
        </div>
      </div>

      {excluded.length > 0 && (
        <p className="text-[11px] text-amber-700 mb-2">
          Sin tipo de cambio conocido, fuera del cálculo: {excluded.map((a) => `${a.name} (${a.currency})`).join(', ')}.
        </p>
      )}

      {!table ? (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={shortDate}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compactAmount} width={56} />
              <Tooltip content={<DayTooltip fmt={fmt} />} cursor={{ stroke: GRID }} />
              <ReferenceLine y={0} stroke={NEGATIVE} strokeDasharray="3 3" />
              <ReferenceLine x={data.periodEnd} stroke={GRID} label={{ value: 'fin de periodo', fontSize: 10, fill: '#6b7280', position: 'top' }} />
              <Line
                type="monotone"
                dataKey="balance"
                name="Efectivo"
                stroke={LINE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={lowestPoint.date}
                y={lowestPoint.balance}
                r={4}
                fill={lowest < 0 ? NEGATIVE : LINE}
                stroke="#fff"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1">Día</th>
                <th className="text-right py-1">Efectivo</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date} className="border-t border-gray-100">
                  <td className="py-0.5">{shortDate(d.date)}</td>
                  <td className={`text-right py-0.5 ${parseFloat(d.balance) < 0 ? 'text-red-600' : ''}`}>{fmt(d.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-4 mt-2">
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs text-brand-700 hover:underline">
          {table ? 'Ver gráfico' : 'Ver tabla'}
        </button>
        <button
          type="button"
          onClick={() => setDetail((d) => !d)}
          className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
        >
          {detail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {detail ? 'Ocultar detalle' : `Qué entra y sale (${data.events.length})`}
        </button>
      </div>

      {detail && (
        <div className="mt-2 text-sm">
          <div className="divide-y divide-gray-100">
            {data.accounts.map((a) => (
              <div key={a.id} className="flex justify-between py-1 text-gray-600">
                <span>
                  {a.name}
                  {a.currency !== currency && <span className="text-gray-400"> · {a.currency}</span>}
                </span>
                <span className="tabular-nums">{a.balanceBase !== null ? fmt(a.balanceBase) : 'sin tipo de cambio'}</span>
              </div>
            ))}
            {data.events.map((e) => (
              <EventRow key={`${e.kind}-${e.id}-${e.date}`} event={e} fmt={fmt} />
            ))}
            {data.events.length === 0 && (
              <p className="py-2 text-gray-400 text-xs">Nada programado. Los recurrentes, compromisos y pagos de tarjeta aparecen aquí.</p>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Efectivo = cuentas líquidas (sin tarjetas ni ahorro). El pago de la tarjeta sale el día de vencimiento; lo que
            compres con tarjeta en este ciclo no se proyecta hasta registrar el estado de cuenta. El gasto variable es el
            promedio diario de los últimos 28 días sin recurrentes ni compromisos ({currencySymbol(currency)}).
          </p>
        </div>
      )}
    </div>
  )
}

/** Tooltip de un día: fecha y efectivo proyectado, en tinta neutra. */
function DayTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
  fmt: (v: number) => string
}) {
  if (!active || !payload || payload.length === 0 || payload[0].value === undefined) return null
  const v = payload[0].value
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-0.5">{label ? longDate(label) : ''}</p>
      <p className={`tabular-nums ${v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(v)}</p>
    </div>
  )
}

function EventRow({ event: e, fmt }: { event: LiquidityEvent; fmt: (v: string) => string }) {
  const negative = parseFloat(e.amount) < 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-14 text-xs text-gray-500">{shortDate(e.date)}</span>
      <span className="flex-1 truncate">{e.name}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {e.kind === 'CARD' ? 'tarjeta' : e.kind === 'COMMITMENT' ? 'compromiso' : 'recurrente'}
      </span>
      <span className={`tabular-nums ${negative ? '' : 'text-brand-700'}`}>{fmt(e.amount)}</span>
    </div>
  )
}
