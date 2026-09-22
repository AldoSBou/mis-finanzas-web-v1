import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { formatCurrency, shortDate } from '@/lib/format'
import type { CardStatement } from '@/types/api'

/** Cuándo vence, en palabras: "hoy", "mañana", "en 5 días", "hace 3 días". */
export function dueIn(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days > 1) return `en ${days} días`
  if (days === -1) return 'ayer'
  return `hace ${-days} días`
}

/** Estado del pago del mes: icono + texto (el color nunca va solo). */
export function statementStatus(s: CardStatement, currency: string) {
  const fmt = (v: string) => formatCurrency(v, currency)
  switch (s.status) {
    case 'PAID':
      return {
        icon: CheckCircle2,
        tone: 'text-brand-700',
        label: 'Pagado',
        detail: `Pagaste ${fmt(s.paid)} del ciclo que cerró el ${shortDate(s.closingDate)}`,
      }
    case 'PENDING':
      return {
        icon: Clock,
        tone: s.daysLeft <= 3 ? 'text-amber-700' : 'text-gray-700',
        label: `Faltan ${fmt(s.remaining)}`,
        detail: `Vence ${dueIn(s.daysLeft)} (${shortDate(s.dueDate)})`,
      }
    case 'MINIMUM_PAID':
      return {
        icon: AlertTriangle,
        tone: 'text-amber-700',
        label: `Quedaron ${fmt(s.remaining)} sin pagar`,
        detail: 'Cubriste el mínimo: el resto genera intereses',
      }
    case 'OVERDUE':
      return {
        icon: AlertCircle,
        tone: 'text-red-600',
        label: `Vencido: faltan ${fmt(s.remaining)}`,
        detail: `Venció ${dueIn(s.daysLeft)}${s.minimumDue ? ` · mínimo ${fmt(s.minimumDue)}` : ''}`,
      }
  }
}

export function StatementStatusLine({ statement, currency }: { statement: CardStatement; currency: string }) {
  const st = statementStatus(statement, currency)
  const Icon = st.icon
  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${st.tone}`} aria-hidden />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${st.tone}`}>{st.label}</p>
        <p className="text-xs text-gray-500">{st.detail}</p>
      </div>
    </div>
  )
}

/** Barra de lo pagado sobre el pago del mes. */
export function PaidBar({ statement }: { statement: CardStatement }) {
  const total = parseFloat(statement.totalDue)
  const pct = total > 0 ? Math.min(100, (parseFloat(statement.paid) / total) * 100) : 100
  const color =
    statement.status === 'PAID'
      ? 'bg-brand-500'
      : statement.status === 'OVERDUE'
        ? 'bg-red-500'
        : statement.status === 'MINIMUM_PAID'
          ? 'bg-amber-500'
          : 'bg-gray-500'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" role="presentation">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
