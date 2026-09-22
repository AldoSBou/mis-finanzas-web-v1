import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Undo2 } from 'lucide-react'
import { categorizationRulesApi, importsApi } from '@/api/services'
import { ErrorState } from '@/components/ui/States'
import { getErrorMessage } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { Category } from '@/types/api'

/** Reglas de categorización e importaciones recientes (con deshacer). */
export function ImportSidebar({
  categories,
  onUndone,
}: {
  categories: Category[]
  onUndone: () => void
}) {
  return (
    <div className="space-y-4">
      <RulesCard categories={categories} />
      <RecentImportsCard onUndone={onUndone} />
    </div>
  )
}

function RulesCard({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient()
  const [pattern, setPattern] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const { data: rules = [] } = useQuery({
    queryKey: queryKeys.categorizationRules.all,
    queryFn: categorizationRulesApi.list,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.categorizationRules.all })
  const create = useMutation({
    mutationFn: () => categorizationRulesApi.create(pattern.trim(), Number(categoryId)),
    onSuccess: () => {
      setPattern('')
      invalidate()
    },
  })
  const remove = useMutation({ mutationFn: categorizationRulesApi.remove, onSuccess: invalidate })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pattern.trim() && categoryId) create.mutate()
  }

  return (
    <section className="card">
      <h3 className="text-sm font-semibold mb-1">Reglas de categorización</h3>
      <p className="text-xs text-gray-500 mb-3">
        Si la descripción contiene el texto, se sugiere la categoría. Además, la app aprende de lo
        que ya categorizaste.
      </p>
      {rules.length > 0 && (
        <ul className="divide-y divide-gray-100 mb-3">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5 truncate">
                {r.pattern}
              </span>
              <span className="text-gray-400">→</span>
              <span className="flex-1 truncate">{r.categoryName}</span>
              <button
                type="button"
                onClick={() => remove.mutate(r.id)}
                className="p-1 hover:bg-red-50 rounded text-red-500"
                aria-label={`Eliminar regla ${r.pattern}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          maxLength={80}
          placeholder="Texto, p. ej. UBER"
          className="input py-1.5"
          aria-label="Texto de la regla"
        />
        <div className="flex gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input py-1.5 flex-1"
            aria-label="Categoría de la regla"
          >
            <option value="">Categoría...</option>
            <optgroup label="Gastos">
              {categories
                .filter((c) => c.type === 'EXPENSE')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Ingresos">
              {categories
                .filter((c) => c.type === 'INCOME')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <button
            type="submit"
            disabled={!pattern.trim() || !categoryId || create.isPending}
            className="btn-primary py-1.5"
          >
            Agregar
          </button>
        </div>
      </form>
      {(create.error || remove.error) && (
        <div className="mt-2">
          <ErrorState message={getErrorMessage(create.error ?? remove.error)} />
        </div>
      )}
    </section>
  )
}

function RecentImportsCard({ onUndone }: { onUndone: () => void }) {
  const queryClient = useQueryClient()
  const { data: batches = [] } = useQuery({
    queryKey: queryKeys.imports.recent,
    queryFn: importsApi.recent,
  })
  const undo = useMutation({
    mutationFn: importsApi.undo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.recent })
      onUndone()
    },
  })

  if (batches.length === 0) return null

  return (
    <section className="card">
      <h3 className="text-sm font-semibold mb-2">Importaciones recientes</h3>
      <ul className="divide-y divide-gray-100">
        {batches.map((b) => (
          <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="truncate">{b.fileName ?? 'Sin nombre'}</p>
              <p className="text-xs text-gray-500">
                {b.accountName} · {b.remaining} de {b.rowCount} movimientos ·{' '}
                {new Date(b.createdAt).toLocaleDateString('es-PE')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm(`¿Deshacer "${b.fileName ?? 'esta importación'}"? Se borran sus ${b.remaining} movimientos.`)) {
                  undo.mutate(b.id)
                }
              }}
              disabled={undo.isPending}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Deshacer
            </button>
          </li>
        ))}
      </ul>
      {undo.error && <ErrorState message={getErrorMessage(undo.error)} />}
    </section>
  )
}
