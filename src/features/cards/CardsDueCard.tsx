import { useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { Link } from 'react-router'
import { cardsApi } from '@/api/services'
import { PaidBar, StatementStatusLine, dueIn } from '@/features/cards/status'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, shortDate } from '@/lib/format'
import type { CardSummary } from '@/types/api'

/** Días de anticipación para recordar un pago pendiente. */
const REMIND_DAYS = 10

const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
}

/** Tarjeta que conviene recordar: pago pendiente cercano, vencido, o que vence sin estado de cuenta. */
function needsAttention(c: CardSummary): boolean {
  const s = c.latestStatement
  if (s && s.status !== 'PAID') return s.status !== 'PENDING' || s.daysLeft <= REMIND_DAYS
  // Sin estado de cuenta de este ciclo: avisar si vence pronto y hay deuda
  const cycleCovered = s && s.dueDate >= (c.nextDueDate ?? '')
  return !cycleCovered && !!c.nextDueDate && daysUntil(c.nextDueDate) <= 7 && parseFloat(c.debt) > 0
}

/** Panel: recordatorio de pago de las tarjetas. */
export function CardsDueCard() {
  const { data = [] } = useQuery({ queryKey: queryKeys.cards.all, queryFn: cardsApi.list })
  const due = data.filter(needsAttention)
  if (due.length === 0) return null

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-500" aria-hidden />
          Pagos de tarjeta
        </h3>
        <Link to="/tarjetas" className="text-xs text-brand-700 hover:underline">
          Ver tarjetas
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {due.map((c) => {
          const s = c.latestStatement
          const showStatement = s && s.status !== 'PAID'
          return (
            <div key={c.accountId} className="space-y-1.5">
              <p className="text-sm font-medium truncate">{c.name}</p>
              {showStatement ? (
                <>
                  <StatementStatusLine statement={s} currency={c.currency} />
                  <PaidBar statement={s} />
                </>
              ) : (
                <p className="text-xs text-gray-600">
                  Vence {dueIn(daysUntil(c.nextDueDate!))} ({shortDate(c.nextDueDate!)}) · deuda{' '}
                  {formatCurrency(c.debt, c.currency)}.{' '}
                  <Link to="/tarjetas" className="text-brand-700 hover:underline">
                    Registra el estado de cuenta
                  </Link>{' '}
                  para saber cuánto pagar.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
