import { useQuery } from '@tanstack/react-query'
import { allocationRulesApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import { ErrorState, Loading } from '@/components/ui/States'
import { bucketColor, bucketLabel } from '@/lib/format'
import { getErrorMessage } from '@/lib/api-client'

export function RulesPage() {
  const { data: rules, isLoading, error } = useQuery({
    queryKey: queryKeys.rules.all,
    queryFn: allocationRulesApi.list,
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Reglas de asignación</h1>
        <p className="text-sm text-gray-500">Cómo distribuir tu ingreso mensual</p>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {rules && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((rule) => {
            const entries = Object.entries(rule.percentages)
            return (
              <div key={rule.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-semibold">{rule.name}</h3>
                  {rule.template && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      Plantilla
                    </span>
                  )}
                </div>
                {rule.description && (
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">{rule.description}</p>
                )}
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
                  {entries.map(([bucket, pct]) => (
                    <div
                      key={bucket}
                      style={{ width: `${pct}%`, backgroundColor: bucketColor(bucket) }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                  {entries.map(([bucket, pct]) => (
                    <span key={bucket} className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: bucketColor(bucket) }}
                      />
                      {pct}% {bucketLabel(bucket)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Próximamente: activar regla por mes, crear reglas personalizadas, edición.
      </p>
    </div>
  )
}
