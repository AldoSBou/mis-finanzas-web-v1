import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, longDate } from '@/lib/format'
import type { OverviewResponse } from '@/types/api'

/**
 * "Te quedan S/ X": un solo número para el periodo en curso. Es la recompensa por registrar:
 * ingreso esperado − gastado − ahorro − compromisos pendientes.
 */
export function RemainingCard({ overview: o }: { overview: OverviewResponse }) {
  const [detail, setDetail] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState(false)
  const fmt = (v: string | number) => formatCurrency(v, o.baseCurrency)
  const remaining = parseFloat(o.remaining)
  const noIncome = parseFloat(o.expectedIncome) === 0

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Te quedan</p>
          <p
            className={`text-3xl md:text-4xl font-semibold tabular-nums mt-1 ${
              remaining < 0 ? 'text-red-600' : 'text-brand-700'
            }`}
          >
            {fmt(o.remaining)}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {o.daysLeft === 1 ? 'Último día' : `${o.daysLeft} días`} hasta el {longDate(o.periodEnd)}
            {o.perDay && (
              <>
                {' · '}
                <span className="font-medium">{fmt(o.perDay)}</span> por día
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditingPeriod(true)}
          className="text-xs text-gray-500 hover:text-brand-700 inline-flex items-center gap-1 whitespace-nowrap"
          title="Cambiar el periodo"
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {o.periodStartDay ? `Del ${o.periodStartDay}` : 'Mes'}
        </button>
      </div>

      {noIncome && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mt-3">
          Todavía no hay ingresos este periodo. Registra tu sueldo (o márcalo como recurrente para
          que se anticipe) y el número cobra sentido.
        </p>
      )}

      <button
        type="button"
        onClick={() => setDetail((d) => !d)}
        className="mt-3 text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
      >
        {detail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {detail ? 'Ocultar el cálculo' : '¿Cómo se calcula?'}
      </button>

      {detail && (
        <dl className="mt-2 text-sm divide-y divide-gray-100">
          <Row label="Ingreso esperado" value={fmt(o.expectedIncome)} hint={`Registrado: ${fmt(o.income)}`} />
          <Row label="Gastado" value={`− ${fmt(o.spent)}`} />
          {(parseFloat(o.savingsDone) !== 0 || parseFloat(o.savingsPending) !== 0) && (
            <Row
              label="Ahorro"
              value={`− ${fmt(parseFloat(o.savingsDone) + parseFloat(o.savingsPending))}`}
              hint={`Hecho: ${fmt(o.savingsDone)} · Falta: ${fmt(o.savingsPending)}`}
            />
          )}
          <Row label="Compromisos y recurrentes por venir" value={`− ${fmt(o.pendingTotal)}`} />
          {parseFloat(o.commitmentsPaid) !== 0 && (
            <Row label="Compromisos pagados moviendo dinero" value={`− ${fmt(o.commitmentsPaid)}`} />
          )}
          <Row label="Te quedan" value={fmt(o.remaining)} strong />
          <p className="text-[11px] text-gray-500 pt-2">
            Lo que compras con tarjeta ya cuenta como gasto al registrarlo; el pago de la tarjeta no
            se resta otra vez.
          </p>
        </dl>
      )}

      <PeriodModal open={editingPeriod} onClose={() => setEditingPeriod(false)} current={o.periodStartDay} />
    </div>
  )
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className={strong ? 'font-semibold' : 'text-gray-600'}>
        {label}
        {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      </dt>
      <dd className={`tabular-nums whitespace-nowrap ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

/** Mes calendario o "del día de pago al día anterior del mes siguiente". */
function PeriodModal({ open, onClose, current }: { open: boolean; onClose: () => void; current: number | null }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'month' | 'payday'>(current ? 'payday' : 'month')
  const [day, setDay] = useState(String(current ?? 25))

  const mutation = useMutation({
    mutationFn: () => authApi.updateMe({ periodStartDay: mode === 'payday' ? Number(day) : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
      queryClient.invalidateQueries({ queryKey: queryKeys.overview.all })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="¿Cuándo empieza tu mes?">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        {mutation.error && <ErrorState message={getErrorMessage(mutation.error)} />}
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" checked={mode === 'month'} onChange={() => setMode('month')} className="mt-1" />
          <span className="text-sm">
            Mes calendario
            <span className="block text-xs text-gray-500">Del 1 al último día del mes.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" checked={mode === 'payday'} onChange={() => setMode('payday')} className="mt-1" />
          <span className="text-sm flex-1">
            Desde mi día de pago
            <span className="block text-xs text-gray-500">
              Si cobras el 25, "te quedan" se calcula del 25 al 24 del mes siguiente.
            </span>
            {mode === 'payday' && (
              <select value={day} onChange={(e) => setDay(e.target.value)} className="input mt-2 w-32">
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    Día {d}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>
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
