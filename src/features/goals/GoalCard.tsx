import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { goalsApi } from '@/api/services'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, longDate, monthYear, shortDate } from '@/lib/format'
import type { Goal } from '@/types/api'

/** Estado de la meta en una línea: cumplida, a tiempo, atrasada o proyección por ritmo. */
export function goalStatus(g: Goal): { text: string; tone: 'good' | 'warn' | 'neutral' } {
  const fmt = (v: string | number) => formatCurrency(v, g.currency ?? 'PEN')
  if (g.completed) return { text: '✓ Meta cumplida', tone: 'good' }
  if (g.targetDate && g.monthlyNeeded) {
    if (g.monthsLeft === 0) {
      return { text: `La fecha ya pasó: faltan ${fmt(g.remaining)}`, tone: 'warn' }
    }
    const months = g.monthsLeft === 1 ? 'este mes' : `${g.monthsLeft} meses`
    return g.onTrack
      ? { text: `Vas bien: ${fmt(g.monthlyNeeded)} al mes (${months}) para el ${longDate(g.targetDate)}`, tone: 'good' }
      : { text: `Aporta ${fmt(g.monthlyNeeded)} al mes (${months}) para llegar al ${longDate(g.targetDate)}`, tone: 'warn' }
  }
  if (g.projectedPeriod) {
    return { text: `A tu ritmo (${fmt(g.monthlyPace)}/mes) la alcanzas en ${monthYear(g.projectedPeriod)}`, tone: 'neutral' }
  }
  return { text: 'Sin aportes en los últimos 3 meses', tone: 'neutral' }
}

const TONE = { good: 'text-brand-700', warn: 'text-amber-700', neutral: 'text-gray-500' }

export function GoalProgress({ goal: g, height = 'h-2.5' }: { goal: Goal; height?: string }) {
  const pct = Math.min(100, parseFloat(g.percentage))
  return (
    <div className={`${height} bg-gray-100 rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: g.color ?? '#0F6E56' }}
      />
    </div>
  )
}

export function GoalCard({
  goal: g,
  onContribute,
  onWithdraw,
  onEdit,
  onDelete,
}: {
  goal: Goal
  onContribute: () => void
  onWithdraw: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)
  const fmt = (v: string | number) => formatCurrency(v, g.currency ?? 'PEN')
  const status = goalStatus(g)

  const { data: history = [], isLoading } = useQuery({
    queryKey: queryKeys.goals.contributions(g.id),
    queryFn: () => goalsApi.contributions(g.id),
    enabled: showHistory,
  })
  const removeMutation = useMutation({
    mutationFn: (contributionId: number) => goalsApi.removeContribution(g.id, contributionId),
    onSuccess: () => {
      for (const key of [['goals'], ['accounts'], ['transactions'], ['dashboard'], ['reports']]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  return (
    <div className="card flex flex-col gap-3" style={{ borderTop: `4px solid ${g.color ?? '#0F6E56'}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{g.name}</h3>
          <p className="text-xs text-gray-500">
            En {g.accountName}
            {g.targetDate ? ` · para el ${longDate(g.targetDate)}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" aria-label="Editar meta">
            <Pencil className="w-4 h-4" />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded text-red-500" aria-label="Eliminar meta">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-xl font-semibold tabular-nums">
            {fmt(g.saved)}
            <span className="text-sm font-normal text-gray-400"> / {fmt(g.targetAmount)}</span>
          </p>
          <span className="text-sm font-medium tabular-nums">{parseFloat(g.percentage).toFixed(0)}%</span>
        </div>
        <GoalProgress goal={g} />
        <p className={`text-xs mt-1.5 ${TONE[status.tone]}`}>{status.text}</p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onContribute} className="btn-primary py-1.5 flex-1">
          Aportar
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={parseFloat(g.saved) <= 0}
          className="btn-secondary py-1.5 flex-1"
        >
          Retirar
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 self-start"
      >
        {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Historial
      </button>
      {showHistory && (
        <div className="border-t border-gray-100 pt-2">
          {isLoading ? (
            <p className="text-xs text-gray-500">Cargando...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-500">Aún no hay aportes.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-gray-500">{shortDate(c.date)}</span>
                  <span className="flex-1 truncate text-gray-600">
                    {c.transactionId && (
                      <ArrowRightLeft className="inline w-3 h-3 mr-1 text-gray-400" aria-label="Con transferencia" />
                    )}
                    {c.note ?? (parseFloat(c.amount) > 0 ? 'Aporte' : 'Retiro')}
                  </span>
                  <span className={`tabular-nums ${parseFloat(c.amount) > 0 ? 'text-brand-700' : ''}`}>
                    {parseFloat(c.amount) > 0 ? '+ ' : '− '}
                    {fmt(Math.abs(parseFloat(c.amount)))}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const extra = c.transactionId ? ' También se borra su transferencia.' : ''
                      if (confirm(`¿Eliminar este ${parseFloat(c.amount) > 0 ? 'aporte' : 'retiro'}?${extra}`)) {
                        removeMutation.mutate(c.id)
                      }
                    }}
                    className="p-0.5 text-red-500 hover:bg-red-50 rounded"
                    aria-label="Eliminar aporte"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {removeMutation.error && (
            <p className="text-xs text-red-600 mt-1">{getErrorMessage(removeMutation.error)}</p>
          )}
        </div>
      )}
    </div>
  )
}
