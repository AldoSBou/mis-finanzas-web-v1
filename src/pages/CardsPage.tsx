import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, FileText, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { accountsApi, cardsApi } from '@/api/services'
import { AccountFormModal } from '@/features/accounts/AccountFormModal'
import { StatementFormModal } from '@/features/cards/StatementFormModal'
import { PaidBar, StatementStatusLine, statementStatus } from '@/features/cards/status'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, monthYear, shortDate } from '@/lib/format'
import type { StatementInfo } from '@/lib/bank-profiles'
import type { Account, CardSummary, InstallmentPlan } from '@/types/api'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Día del mes que no se pasa del último día (31 → 30 en abril). */
const dayIn = (year: number, month: number, day: number) =>
  new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))

/** Propuesta del ciclo a registrar: el último cierre ya ocurrido y su siguiente día de pago. */
function suggestedCycle(c: CardSummary): StatementInfo {
  if (!c.statementDay) return {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let closing = dayIn(today.getFullYear(), today.getMonth(), c.statementDay)
  if (closing > today) closing = dayIn(today.getFullYear(), today.getMonth() - 1, c.statementDay)
  let due: Date | undefined
  if (c.dueDay) {
    due = dayIn(closing.getFullYear(), closing.getMonth(), c.dueDay)
    if (due <= closing) due = dayIn(closing.getFullYear(), closing.getMonth() + 1, c.dueDay)
  }
  return { closingDate: iso(closing), dueDate: due ? iso(due) : undefined }
}

function utilizationTone(pct: number) {
  if (pct >= 70) return { bar: 'bg-red-500', text: 'text-red-600' }
  if (pct >= 30) return { bar: 'bg-amber-500', text: 'text-amber-700' }
  return { bar: 'bg-brand-500', text: 'text-gray-600' }
}

export function CardsPage() {
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.cards.all, queryFn: cardsApi.list })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Tarjetas de crédito</h1>
          <p className="text-sm text-gray-500">Cuánto debes, cuánto pagar este mes y tus compras en cuotas</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Nueva tarjeta
        </button>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}
      {data && data.length === 0 && (
        <EmptyState
          title="No tienes tarjetas de crédito"
          description="Agrega tu tarjeta con su línea y fechas de cierre y pago para ver tu disponible y recibir el recordatorio de pago."
        />
      )}

      <div className="space-y-4">
        {data?.map((c) => <CardPanel key={c.accountId} card={c} />)}
      </div>

      <AccountFormModal open={creating} onClose={() => setCreating(false)} defaultType="CREDIT_CARD" />
    </div>
  )
}

function CardPanel({ card: c }: { card: CardSummary }) {
  const [editing, setEditing] = useState<Account | null>(null)
  const [statementOpen, setStatementOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })

  const fmt = (v: string | number) => formatCurrency(v, c.currency)
  const debt = parseFloat(c.debt)
  const utilization = c.utilization !== null ? parseFloat(c.utilization) : null
  const tone = utilization !== null ? utilizationTone(utilization) : null
  const s = c.latestStatement
  const unpaid = s && s.status !== 'PAID' ? parseFloat(s.remaining).toFixed(2) : undefined

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#6B6B6B' }} />
          <h2 className="font-semibold truncate">{c.name}</h2>
          <span className="text-xs text-gray-500">{c.currency}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPaying(true)} className="btn-primary text-sm">
            <Wallet className="w-4 h-4 mr-1" />
            Pagar
          </button>
          <button type="button" onClick={() => setStatementOpen(true)} className="btn-secondary text-sm">
            <FileText className="w-4 h-4 mr-1" />
            Estado de cuenta
          </button>
          <button
            type="button"
            onClick={() => setEditing(accounts.find((a) => a.id === c.accountId) ?? null)}
            className="btn-secondary text-sm"
            aria-label={`Editar ${c.name}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Deuda y línea */}
        <div>
          <p className="text-xs text-gray-500">{debt >= 0 ? 'Deuda actual' : 'Saldo a favor'}</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt(Math.abs(debt))}</p>
          {c.creditLimit && utilization !== null && tone ? (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" role="presentation">
                <div
                  className={`h-full rounded-full ${tone.bar}`}
                  style={{ width: `${Math.min(100, utilization)}%` }}
                />
              </div>
              <p className="text-xs mt-1">
                <span className={tone.text}>{utilization.toFixed(0)}% usado</span>
                <span className="text-gray-500">
                  {' '}
                  · disponible {fmt(c.available!)} de {fmt(c.creditLimit)}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Agrega la línea de crédito para ver tu disponible.</p>
          )}
        </div>

        {/* Pago del mes */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Pago del mes</p>
          {s ? (
            <div className="space-y-1.5">
              <StatementStatusLine statement={s} currency={c.currency} />
              <PaidBar statement={s} />
              <p className="text-[11px] text-gray-500">
                Pagado {fmt(s.paid)} de {fmt(s.totalDue)}
                {s.minimumDue && s.status !== 'OVERDUE' && ` · mínimo ${fmt(s.minimumDue)}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Registra el estado de cuenta (o impórtalo en PDF) para seguir cuánto te falta pagar.
            </p>
          )}
        </div>

        {/* Fechas y cuotas */}
        <div className="text-sm space-y-1">
          {c.nextClosingDate || c.nextDueDate ? (
            <p className="text-gray-700">
              {c.nextDueDate && <>Vence el {shortDate(c.nextDueDate)}</>}
              {c.nextClosingDate && c.nextDueDate && ' · '}
              {c.nextClosingDate && <>{c.nextDueDate ? 'próximo cierre' : 'Próximo cierre'} el {shortDate(c.nextClosingDate)}</>}
            </p>
          ) : (
            <p className="text-xs text-gray-500">Agrega los días de cierre y pago para el recordatorio.</p>
          )}
          {c.activeInstallments > 0 ? (
            <p className="text-gray-700">
              {c.activeInstallments} {c.activeInstallments === 1 ? 'compra' : 'compras'} en cuotas ·{' '}
              {fmt(c.installmentsThisMonth)} este mes
              <span className="block text-xs text-gray-500">
                {fmt(c.installmentsRemaining)} por facturar
              </span>
            </p>
          ) : (
            <p className="text-xs text-gray-500">Sin compras en cuotas.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-3 text-xs text-brand-700 hover:underline flex items-center gap-1"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Ocultar detalle' : 'Cuotas e historial'}
      </button>
      {expanded && <CardDetailSection card={c} />}

      <AccountFormModal open={!!editing} onClose={() => setEditing(null)} initial={editing} />
      <StatementFormModal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        accountId={c.accountId}
        cardName={c.name}
        currency={c.currency}
        initial={suggestedCycle(c)}
      />
      <TransactionFormModal
        open={paying}
        onClose={() => setPaying(false)}
        preset={{ type: 'TRANSFER', toAccountId: c.accountId, amount: unpaid, description: `Pago ${c.name}` }}
      />
    </section>
  )
}

function CardDetailSection({ card: c }: { card: CardSummary }) {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.cards.detail(c.accountId),
    queryFn: () => cardsApi.detail(c.accountId),
  })
  const removeStatement = useMutation({
    mutationFn: (id: number) => cardsApi.removeStatement(c.accountId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cards.all }),
  })
  const fmt = (v: string) => formatCurrency(v, c.currency)

  if (isLoading) return <Loading />
  if (error) return <ErrorState message={getErrorMessage(error)} />
  if (!data) return null
  const active = data.installments.filter((p) => !p.finished)
  const finished = data.installments.filter((p) => p.finished)

  return (
    <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-gray-100 pt-3">
      <div>
        <h3 className="text-sm font-semibold mb-2">Compras en cuotas</h3>
        {data.installments.length === 0 ? (
          <p className="text-xs text-gray-500">
            Al registrar o editar una compra con esta tarjeta, indica en cuántas cuotas la pagas.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {[...active, ...finished].map((p) => (
              <InstallmentRow key={p.transactionId} plan={p} currency={c.currency} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Estados de cuenta</h3>
        {removeStatement.error && <ErrorState message={getErrorMessage(removeStatement.error)} />}
        {data.statements.length === 0 ? (
          <p className="text-xs text-gray-500">Aún no registras estados de cuenta.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.statements.map((s) => {
              const st = statementStatus(s, c.currency)
              const Icon = st.icon
              return (
                <li key={s.id} className="py-2 flex items-center gap-3 text-sm">
                  <Icon className={`w-4 h-4 shrink-0 ${st.tone}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p>
                      Cierre {shortDate(s.closingDate)} · vence {shortDate(s.dueDate)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {st.label} · pagado {fmt(s.paid)} de {fmt(s.totalDue)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Eliminar este estado de cuenta? Tus movimientos no cambian.')) {
                        removeStatement.mutate(s.id)
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    aria-label="Eliminar estado de cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function InstallmentRow({ plan: p, currency }: { plan: InstallmentPlan; currency: string }) {
  const fmt = (v: string) => formatCurrency(v, currency)
  const pct = (p.charged / p.installments) * 100
  return (
    <li className={`py-2 text-sm ${p.finished ? 'text-gray-400' : ''}`}>
      <div className="flex justify-between gap-2">
        <span className="truncate">{p.description || 'Compra'}</span>
        <span className="tabular-nums whitespace-nowrap">
          {fmt(p.installmentAmount)} × {p.installments}
        </span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden my-1" role="presentation">
        <div
          className={`h-full rounded-full ${p.finished ? 'bg-gray-300' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">
        {p.finished
          ? `Terminada en ${monthYear(p.lastPeriod)}`
          : p.charged === 0
            ? `Primera cuota en ${monthYear(p.firstPeriod)} · hasta ${monthYear(p.lastPeriod)}`
            : `Cuota ${p.charged} de ${p.installments} · faltan ${fmt(p.remainingAmount)} · hasta ${monthYear(p.lastPeriod)}`}
      </p>
    </li>
  )
}
