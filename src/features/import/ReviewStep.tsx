import { useMemo } from 'react'
import { formatCurrency, shortDate } from '@/lib/format'
import type { Account, Category, SuggestionSource } from '@/types/api'

/** Fila en revisión: qué hacer con ella antes de importar. */
export interface ReviewRow {
  line: number
  date: string
  description: string
  amount: number
  include: boolean
  /** '' sin elegir · 'c:<id>' categoría · 't:<id>' transferencia con esa cuenta */
  choice: string
  source: SuggestionSource
  duplicate: boolean
}

interface Props {
  rows: ReviewRow[]
  onChange: (rows: ReviewRow[]) => void
  account: Account
  accounts: Account[]
  categories: Category[]
}

export function ReviewStep({ rows, onChange, account, accounts, categories }: Props) {
  const expenseCats = categories.filter((c) => c.type === 'EXPENSE')
  const incomeCats = categories.filter((c) => c.type === 'INCOME')
  // Transferencias solo con cuentas propias en la misma moneda
  const transferAccounts = accounts.filter((a) => a.id !== account.id && a.currency === account.currency)

  const update = (i: number, patch: Partial<ReviewRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const summary = useMemo(() => {
    const included = rows.filter((r) => r.include)
    return {
      included: included.length,
      out: included.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0),
      in: included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
      duplicates: rows.filter((r) => r.duplicate).length,
      missing: included.filter((r) => !r.choice).length,
    }
  }, [rows])

  // "Otros" / "Otros ingresos" para completar rápido lo que quedó sin categoría
  const fallback = {
    out: expenseCats.find((c) => c.name.toLowerCase() === 'otros'),
    in: incomeCats.find((c) => c.name.toLowerCase().startsWith('otros')),
  }
  const fillMissing = () =>
    onChange(
      rows.map((r) => {
        if (!r.include || r.choice) return r
        const cat = r.amount < 0 ? fallback.out : fallback.in
        return cat ? { ...r, choice: `c:${cat.id}` } : r
      }),
    )

  // Marcar todas respeta los duplicados (siguen como estén); desmarcar aplica a todas
  const setAll = (include: boolean) =>
    onChange(rows.map((r) => ({ ...r, include: include ? (r.duplicate ? r.include : true) : false })))

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <strong>{summary.included}</strong> de {rows.length} filas a importar
        </span>
        <span className="tabular-nums">Salidas {formatCurrency(summary.out, account.currency)}</span>
        <span className="tabular-nums">Entradas {formatCurrency(summary.in, account.currency)}</span>
        {summary.duplicates > 0 && (
          <span className="text-amber-700">
            {summary.duplicates} posibles duplicados (desmarcados)
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={() => setAll(true)} className="text-brand-700 hover:underline">
          Marcar todas (menos duplicados)
        </button>
        <button type="button" onClick={() => setAll(false)} className="text-brand-700 hover:underline">
          Desmarcar todas
        </button>
        {summary.missing > 0 && (fallback.out || fallback.in) && (
          <button type="button" onClick={fillMissing} className="text-brand-700 hover:underline">
            Asignar "Otros" a las {summary.missing} sin categoría
          </button>
        )}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="px-3 py-2 w-8" aria-label="Importar" />
              <th className="px-2 py-2 text-left font-medium">Fecha</th>
              <th className="px-2 py-2 text-left font-medium">Descripción</th>
              <th className="px-2 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 text-left font-medium">Categoría</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const out = r.amount < 0
              const cats = out ? expenseCats : incomeCats
              return (
                <tr
                  key={r.line}
                  className={`border-b border-gray-100 ${r.include ? '' : 'opacity-50'}`}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      aria-label={`Importar fila ${r.line}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{shortDate(r.date)}</td>
                  <td className="px-2 py-1.5 max-w-[280px]">
                    <p className="truncate" title={r.description}>
                      {r.description || '—'}
                    </p>
                    {r.duplicate && <p className="text-[11px] text-amber-700">Posible duplicado</p>}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${
                      out ? '' : 'text-brand-700'
                    }`}
                  >
                    {out ? '− ' : '+ '}
                    {formatCurrency(Math.abs(r.amount), account.currency)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={r.choice}
                        onChange={(e) => update(i, { choice: e.target.value, source: 'NONE' })}
                        disabled={!r.include}
                        className={`input py-1 text-sm min-w-[160px] ${
                          r.include && !r.choice ? 'border-amber-400' : ''
                        }`}
                        aria-label={`Categoría fila ${r.line}`}
                      >
                        <option value="">Elegir...</option>
                        <optgroup label={out ? 'Gastos' : 'Ingresos'}>
                          {cats.map((c) => (
                            <option key={c.id} value={`c:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                        {transferAccounts.length > 0 && (
                          <optgroup label="Transferencia (no es gasto ni ingreso)">
                            {transferAccounts.map((a) => (
                              <option key={a.id} value={`t:${a.id}`}>
                                {out ? `Hacia ${a.name}` : `Desde ${a.name}`}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {r.source !== 'NONE' && (
                        <span
                          className="text-[10px] uppercase tracking-wide text-gray-500"
                          title={
                            r.source === 'RULE'
                              ? 'Sugerida por una regla'
                              : 'Sugerida porque ya categorizaste algo parecido'
                          }
                        >
                          {r.source === 'RULE' ? 'Regla' : 'Historial'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
